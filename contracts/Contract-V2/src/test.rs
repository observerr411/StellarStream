#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Register a Stellar asset contract and return (token_address, token_client).
fn create_token<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>) {
    let addr = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    (addr.clone(), TokenClient::new(env, &addr))
}

/// Register the V2 contract, call init(), and return its address + client.
fn setup_v2<'a>(env: &'a Env, admin: &'a Address) -> (Address, ContractClient<'a>) {
    let id = env.register(Contract, ());
    let client = ContractClient::new(env, &id);
    client.init(admin);
    (id, client)
}

// ── Init tests ───────────────────────────────────────────────────────────────

#[test]
fn test_init_sets_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (_, client) = setup_v2(&env, &admin);

    assert_eq!(client.admin(), admin);
}

#[test]
fn test_init_cannot_be_called_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (_, client) = setup_v2(&env, &admin);

    let result = client.try_init(&admin);
    assert!(result.is_err());
}

// ── Migration bridge tests ────────────────────────────────────────────────────
//
// These tests use a *mock* V1 contract registered in the same test environment
// so we can control its state without a real V1 WASM.  The mock implements
// only get_stream() and cancel() — the two functions migrate_stream() calls.

/// Registers a minimal mock of the V1 contract that returns a controllable
/// stream and records whether cancel() was called.
mod mock_v1 {
    use soroban_sdk::{
        contract, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env, Vec,
    };

    // Re-declare just enough of V1's types for the mock.
    #[contracttype]
    #[derive(Clone)]
    pub enum CurveTypeV1 {
        Linear = 0,
        Exponential = 1,
    }

    #[contracttype]
    #[derive(Clone)]
    pub struct MilestoneV1 {
        pub timestamp: u64,
        pub percentage: u32,
    }

    #[contracttype]
    #[derive(Clone)]
    pub struct V1Stream {
        pub sender: Address,
        pub receiver: Address,
        pub token: Address,
        pub total_amount: i128,
        pub start_time: u64,
        pub end_time: u64,
        pub withdrawn: i128,
        pub withdrawn_amount: i128,
        pub cancelled: bool,
        pub receipt_owner: Address,
        pub is_paused: bool,
        pub paused_time: u64,
        pub total_paused_duration: u64,
        pub milestones: Vec<MilestoneV1>,
        pub curve_type: CurveTypeV1,
        pub interest_strategy: u32,
        pub vault_address: Option<Address>,
        pub deposited_principal: i128,
        pub metadata: Option<BytesN<32>>,
        pub is_usd_pegged: bool,
        pub usd_amount: i128,
        pub oracle_address: Address,
        pub oracle_max_staleness: u64,
        pub price_min: i128,
        pub price_max: i128,
        pub is_soulbound: bool,
        pub clawback_enabled: bool,
        pub arbiter: Option<Address>,
        pub is_frozen: bool,
    }

    const STREAM_KEY: soroban_sdk::Symbol = symbol_short!("MOCK_S");
    const CANCELLED_KEY: soroban_sdk::Symbol = symbol_short!("MOCK_C");

    #[contract]
    pub struct MockV1;

    #[contractimpl]
    impl MockV1 {
        /// Seed the mock with a stream.
        pub fn seed_stream(env: Env, stream: V1Stream) {
            env.storage().instance().set(&STREAM_KEY, &stream);
        }

        /// V1's public get_stream interface.
        pub fn get_stream(env: Env, _stream_id: u64) -> V1Stream {
            env.storage()
                .instance()
                .get(&STREAM_KEY)
                .expect("mock: stream not seeded")
        }

        /// V1's public cancel interface.
        /// In the real V1 this transfers tokens; in the mock we just record
        /// that it was called so the test can assert on it.
        pub fn cancel(env: Env, _stream_id: u64, _caller: Address) {
            env.storage().instance().set(&CANCELLED_KEY, &true);
        }

        /// Helper so tests can assert cancel() was called.
        pub fn was_cancelled(env: Env) -> bool {
            env.storage()
                .instance()
                .get(&CANCELLED_KEY)
                .unwrap_or(false)
        }
    }
}

use mock_v1::{CurveTypeV1, MilestoneV1, MockV1, MockV1Client, V1Stream};

/// Build a basic V1Stream value for use in tests.
fn make_v1_stream(env: &Env, sender: &Address, receiver: &Address, token: &Address) -> V1Stream {
    V1Stream {
        sender: sender.clone(),
        receiver: receiver.clone(),
        token: token.clone(),
        total_amount: 1000,
        start_time: 0,
        end_time: 200,
        withdrawn: 0,
        withdrawn_amount: 0,
        cancelled: false,
        receipt_owner: receiver.clone(),
        is_paused: false,
        paused_time: 0,
        total_paused_duration: 0,
        milestones: soroban_sdk::vec![env],
        curve_type: CurveTypeV1::Linear,
        interest_strategy: 0,
        vault_address: None,
        deposited_principal: 1000,
        metadata: None,
        is_usd_pegged: false,
        usd_amount: 0,
        oracle_address: sender.clone(),
        oracle_max_staleness: 0,
        price_min: 0,
        price_max: 0,
        is_soulbound: false,
        clawback_enabled: false,
        arbiter: None,
        is_frozen: false,
    }
}

#[test]
fn test_migrate_stream_creates_v2_stream() {
    let env = Env::default();
    env.mock_all_auths();
    // Stream runs from t=0 to t=200; migrate at t=100 (halfway)
    env.ledger().with_mut(|li| li.timestamp = 100);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    // Register mock V1 and seed it with a stream.
    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&make_v1_stream(&env, &sender, &receiver, &token_id));

    // Set up V2.
    let (_, v2_client) = setup_v2(&env, &admin);

    let v2_stream_id = v2_client.migrate_stream(&v1_id, &0u64, &receiver);

    // V2 stream should have been created with ID 0.
    assert_eq!(v2_stream_id, 0);

    let v2_stream = v2_client.get_stream(&v2_stream_id).expect("stream missing");

    // At t=100 out of 200: unlocked = 1000 * 100/200 = 500, remaining = 500
    assert_eq!(v2_stream.total_amount, 500);
    assert_eq!(v2_stream.sender, sender);
    assert_eq!(v2_stream.receiver, receiver);
    assert_eq!(v2_stream.token, token_id);
    assert_eq!(v2_stream.start_time, 100); // migration point = now
    assert_eq!(v2_stream.end_time, 200); // preserved from V1
    assert!(v2_stream.migrated_from_v1);
    assert_eq!(v2_stream.v1_stream_id, 0);
}

#[test]
fn test_migrate_stream_calls_v1_cancel() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 50);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&make_v1_stream(&env, &sender, &receiver, &token_id));

    let (_, v2_client) = setup_v2(&env, &admin);
    v2_client.migrate_stream(&v1_id, &0u64, &receiver);

    // V1::cancel() must have been called.
    assert!(v1_client.was_cancelled());
}

#[test]
fn test_migrate_stream_fails_if_not_receiver() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 50);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let stranger = Address::generate(&env); // not the receiver
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&make_v1_stream(&env, &sender, &receiver, &token_id));

    let (_, v2_client) = setup_v2(&env, &admin);

    let result = v2_client.try_migrate_stream(&v1_id, &0u64, &stranger);
    assert!(result.is_err());
}

#[test]
fn test_migrate_stream_fails_if_already_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 50);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    let mut stream = make_v1_stream(&env, &sender, &receiver, &token_id);
    stream.cancelled = true; // already cancelled

    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&stream);

    let (_, v2_client) = setup_v2(&env, &admin);

    let result = v2_client.try_migrate_stream(&v1_id, &0u64, &receiver);
    assert!(result.is_err());
}

#[test]
fn test_migrate_stream_fails_if_stream_ended() {
    let env = Env::default();
    env.mock_all_auths();
    // Set time past the stream end_time (200)
    env.ledger().with_mut(|li| li.timestamp = 250);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&make_v1_stream(&env, &sender, &receiver, &token_id));

    let (_, v2_client) = setup_v2(&env, &admin);

    let result = v2_client.try_migrate_stream(&v1_id, &0u64, &receiver);
    assert!(result.is_err());
}

#[test]
fn test_migrate_stream_remaining_balance_correct_at_25_percent() {
    let env = Env::default();
    env.mock_all_auths();
    // Migrate at t=50: 50/200 = 25% elapsed → unlocked=250, remaining=750
    env.ledger().with_mut(|li| li.timestamp = 50);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);

    let v1_id = env.register(MockV1, ());
    let v1_client = MockV1Client::new(&env, &v1_id);
    v1_client.seed_stream(&make_v1_stream(&env, &sender, &receiver, &token_id));

    let (_, v2_client) = setup_v2(&env, &admin);
    let v2_stream_id = v2_client.migrate_stream(&v1_id, &0u64, &receiver);

    let v2_stream = v2_client.get_stream(&v2_stream_id).unwrap();
    assert_eq!(v2_stream.total_amount, 750); // 1000 - 250
}

#[test]
fn test_permit_stream_fails_with_wrong_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 100);

    let admin = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);
    let (_, v2_client) = setup_v2(&env, &admin);

    // Generate a dummy keypair (32-byte pubkey, 64-byte sig)
    let pubkey = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    let bad_sig = soroban_sdk::BytesN::from_array(&env, &[0u8; 64]);

    // Nonce 99 != stored nonce 0 — should fail with InvalidNonce
    let result = v2_client.try_create_stream_with_signature(
        &pubkey, &receiver, &token_id, &1000i128, &0u64, &200u64, &99u64,   // wrong nonce
        &9999u64, // deadline far in future
        &bad_sig,
    );
    assert!(result.is_err());
}

#[test]
fn test_permit_stream_fails_if_deadline_passed() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 500); // now = 500

    let admin = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token_id, _) = create_token(&env, &token_admin);
    let (_, v2_client) = setup_v2(&env, &admin);

    let pubkey = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    let bad_sig = soroban_sdk::BytesN::from_array(&env, &[0u8; 64]);

    // deadline = 100, now = 500 — expired
    let result = v2_client.try_create_stream_with_signature(
        &pubkey, &receiver, &token_id, &1000i128, &0u64, &200u64, &0u64,   // correct nonce
        &100u64, // expired deadline
        &bad_sig,
    );
    assert!(result.is_err());
}
