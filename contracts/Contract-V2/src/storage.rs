use crate::types::StreamV2;
use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

// ----------------------------------------------------------------
// DataKeyV2 — all storage keys for the V2 contract.
//
// Named DataKeyV2 (not DataKey) so it cannot collide with any
// V1 DataKey that may exist in the same workspace.
//
// IMPORTANT: never reorder or remove variants — Soroban
// serialises the enum discriminant as the on-chain key.
// Only ever append new variants at the bottom.
// ----------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKeyV2 {
    // -- instance() keys -----------------------------------------
    Admin, // global admin/governance address

    // -- Stream storage ------------------------------------------
    /// Individual stream record, keyed by stream ID.
    Stream(u64),
}

/// Global stream counter — stored under a short Symbol to match
/// the V1 pattern and stay cheap on storage.
pub const STREAM_COUNT_V2: Symbol = symbol_short!("STR_V2");

// TTL constants (~5-second ledger close time)
const INSTANCE_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const INSTANCE_TTL_BUMP: u32 = 535_680; // ~31 days

// ----------------------------------------------------------------
// instance() helpers — Admin
// ----------------------------------------------------------------

/// Store the admin address. Call once inside your init().
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKeyV2::Admin, admin);
    bump_instance(env);
}

/// Read the admin address. Panics if init() has not been called.
pub fn get_admin(env: &Env) -> Address {
    bump_instance(env);
    env.storage()
        .instance()
        .get(&DataKeyV2::Admin)
        .expect("V2: Admin not set")
}

/// Returns true if an admin has been stored.
pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKeyV2::Admin)
}

// ----------------------------------------------------------------
// instance() helpers — Streams
// ----------------------------------------------------------------

/// Allocate the next stream ID and increment the counter.
pub fn next_stream_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&STREAM_COUNT_V2).unwrap_or(0);
    env.storage().instance().set(&STREAM_COUNT_V2, &(id + 1));
    id
}

/// Persist a V2 stream.
pub fn set_stream(env: &Env, stream_id: u64, stream: &StreamV2) {
    env.storage()
        .instance()
        .set(&DataKeyV2::Stream(stream_id), stream);
    bump_instance(env);
}

/// Read a V2 stream. Returns None if it does not exist.
pub fn get_stream(env: &Env, stream_id: u64) -> Option<StreamV2> {
    bump_instance(env);
    env.storage().instance().get(&DataKeyV2::Stream(stream_id))
}

// ----------------------------------------------------------------
// TTL
// ----------------------------------------------------------------

/// Extend instance storage TTL if it has dropped below the threshold.
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
}
