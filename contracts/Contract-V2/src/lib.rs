#![no_std]
#![allow(clippy::too_many_arguments)]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env};

mod errors;
mod storage;
mod types;
mod v1_interface;

use errors::ContractError;
use types::{PermitStreamCreatedEvent, StreamMigratedEvent, StreamV2};
use v1_interface::Client as V1Client;

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    // ----------------------------------------------------------------
    // Init
    // ----------------------------------------------------------------

    pub fn init(env: Env, admin: Address) -> Result<(), ContractError> {
        if storage::has_admin(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        storage::set_admin(&env, &admin);
        Ok(())
    }

    pub fn admin(env: Env) -> Address {
        storage::get_admin(&env)
    }

    // ----------------------------------------------------------------
    // Issue #359 — Migration Bridge
    // ----------------------------------------------------------------

    pub fn migrate_stream(
        env: Env,
        v1_contract: Address,
        v1_stream_id: u64,
        caller: Address,
    ) -> Result<u64, ContractError> {
        caller.require_auth();

        let v1_client = V1Client::new(&env, &v1_contract);

        let v1_stream = v1_client
            .try_get_stream(&v1_stream_id)
            .map_err(|_| ContractError::NotStreamOwner)?
            .map_err(|_| ContractError::NotStreamOwner)?;

        if v1_stream.receiver != caller {
            return Err(ContractError::NotStreamOwner);
        }

        if v1_stream.cancelled || v1_stream.is_frozen || v1_stream.is_paused {
            return Err(ContractError::StreamNotMigratable);
        }

        let now = env.ledger().timestamp();
        if now >= v1_stream.end_time {
            return Err(ContractError::StreamNotMigratable);
        }

        let elapsed = {
            let effective_now = now.saturating_sub(v1_stream.total_paused_duration);
            if effective_now <= v1_stream.start_time {
                0i128
            } else {
                (effective_now - v1_stream.start_time) as i128
            }
        };
        let duration = (v1_stream.end_time - v1_stream.start_time) as i128;
        let unlocked = (v1_stream.total_amount * elapsed) / duration;
        let remaining = v1_stream.total_amount - unlocked;

        if remaining <= 0 {
            return Err(ContractError::NothingToMigrate);
        }

        v1_client
            .try_cancel(&v1_stream_id, &caller)
            .map_err(|_| ContractError::StreamNotMigratable)?
            .map_err(|_| ContractError::StreamNotMigratable)?;

        let v2_stream_id = storage::next_stream_id(&env);

        let v2_stream = StreamV2 {
            sender: v1_stream.sender.clone(),
            receiver: caller.clone(),
            token: v1_stream.token.clone(),
            total_amount: remaining,
            start_time: now,
            end_time: v1_stream.end_time,
            withdrawn_amount: 0,
            cancelled: false,
            migrated_from_v1: true,
            v1_stream_id,
        };

        storage::set_stream(&env, v2_stream_id, &v2_stream);

        env.events().publish(
            (symbol_short!("migrated"), caller.clone()),
            StreamMigratedEvent {
                v2_stream_id,
                v1_stream_id,
                caller: caller.clone(),
                migrated_amount: remaining,
                timestamp: now,
            },
        );

        Ok(v2_stream_id)
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Option<StreamV2> {
        storage::get_stream(&env, stream_id)
    }

    // ----------------------------------------------------------------
    // Issue #360 — Permit Streaming
    // ----------------------------------------------------------------

    pub fn create_stream_with_signature(
        env: Env,
        sender_pubkey: soroban_sdk::BytesN<32>,
        receiver: Address,
        token: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
        nonce: u64,
        deadline: u64,
        signature: soroban_sdk::BytesN<64>,
    ) -> Result<u64, ContractError> {
        let now = env.ledger().timestamp();

        // ── Guard: deadline ──────────────────────────────────────────
        if now > deadline {
            return Err(ContractError::ExpiredDeadline);
        }

        // ── Guard: nonce ─────────────────────────────────────────────
        let nonce_key = (symbol_short!("NONCE"), sender_pubkey.clone());
        let stored_nonce: u64 = env.storage().instance().get(&nonce_key).unwrap_or(0u64);

        if nonce != stored_nonce {
            return Err(ContractError::InvalidNonce);
        }

        // ── Build canonical message ───────────────────────────────────
        let mut msg = soroban_sdk::Bytes::new(&env);
        msg.extend_from_slice(b"STELLARSTREAM_PERMIT_V2");
        msg.append(&env.current_contract_address().to_xdr(&env));
        msg.append(&sender_pubkey.clone().into());
        msg.append(&receiver.clone().to_xdr(&env));
        msg.append(&token.clone().to_xdr(&env));

        msg.extend_from_slice(&total_amount.to_be_bytes());
        msg.extend_from_slice(&start_time.to_be_bytes());
        msg.extend_from_slice(&end_time.to_be_bytes());
        msg.extend_from_slice(&nonce.to_be_bytes());
        msg.extend_from_slice(&deadline.to_be_bytes());

        // ── Verify signature ─────────────────────────────────────────
        // ed25519_verify panics on invalid signature
        let msg_hash: soroban_sdk::BytesN<32> = env.crypto().sha256(&msg).into();
        env.crypto()
            .ed25519_verify(&sender_pubkey, &msg_hash.into(), &signature);

        // ── Consume nonce ─────────────────────────────────────────────
        env.storage()
            .instance()
            .set(&nonce_key, &(stored_nonce + 1));

        // ── Pull tokens from sender ───────────────────────────────────
        let token_client = soroban_sdk::token::TokenClient::new(&env, &token);
        let sender_addr = Address::from_string_bytes(&sender_pubkey.clone().into());

        token_client.transfer_from(
            &env.current_contract_address(),
            &sender_addr,
            &env.current_contract_address(),
            &total_amount,
        );

        // ── Create V2 stream ─────────────────────────────────────────
        let stream_id = storage::next_stream_id(&env);

        let stream = StreamV2 {
            sender: sender_addr.clone(),
            receiver: receiver.clone(),
            token: token.clone(),
            total_amount,
            start_time,
            end_time,
            withdrawn_amount: 0,
            cancelled: false,
            migrated_from_v1: false,
            v1_stream_id: 0,
        };

        storage::set_stream(&env, stream_id, &stream);

        // ── Emit event ────────────────────────────────────────────────
        env.events().publish(
            (symbol_short!("permit"), receiver.clone()),
            PermitStreamCreatedEvent {
                stream_id,
                sender_pubkey: sender_pubkey.clone(),
                receiver,
                token,
                total_amount,
                nonce,
                timestamp: now,
            },
        );

        Ok(stream_id)
    }
}

mod test;
