use soroban_sdk::{contracttype, Address};

// ----------------------------------------------------------------
// V2 Stream
//
// Mirrors the core fields of the V1 Stream but is its own type
// so V2 can evolve independently. New V2-only fields (e.g.
// fee_bps, v2_features) can be appended here without touching V1.
// ----------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct StreamV2 {
    pub sender: Address,
    pub receiver: Address,
    pub token: Address,
    /// The remaining/locked balance carried over from V1.
    pub total_amount: i128,
    /// Preserved from V1 so vesting math stays consistent.
    pub start_time: u64,
    pub end_time: u64,
    /// Tracks how much the receiver has withdrawn from the V2 stream.
    pub withdrawn_amount: i128,
    pub cancelled: bool,
    /// True if this stream was created via migration from V1.
    pub migrated_from_v1: bool,
    /// The V1 stream ID this was migrated from (for audit trail).
    pub v1_stream_id: u64,
}

// ----------------------------------------------------------------
// Events
// ----------------------------------------------------------------

/// Emitted when a V1 stream is successfully migrated to V2.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamMigratedEvent {
    /// The new V2 stream ID.
    pub v2_stream_id: u64,
    /// The original V1 stream ID.
    pub v1_stream_id: u64,
    /// The caller / receiver who triggered the migration.
    pub caller: Address,
    /// The locked balance carried into V2.
    pub migrated_amount: i128,
    pub timestamp: u64,
}

/// Emitted when a V2 stream is created directly (non-migration).
#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamCreatedV2Event {
    pub stream_id: u64,
    pub sender: Address,
    pub receiver: Address,
    pub token: Address,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub timestamp: u64,
}

/// The payload that the sender signs off-chain.
/// Every field that defines the stream's intent is included
/// so nothing can be swapped by a relayer after signing.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PermitPayload {
    /// The V2 contract's own address — binds the sig to this contract only
    pub contract: Address,
    /// The sender's ed25519 public key (32 bytes)
    pub sender_pubkey: soroban_sdk::BytesN<32>,
    pub receiver: Address,
    pub token: Address,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    /// Replay protection — must match the sender's current on-chain nonce
    pub nonce: u64,
    /// Unix timestamp after which the signature is invalid
    pub deadline: u64,
}

/// Emitted on every successful permit stream creation
#[contracttype]
#[derive(Clone, Debug)]
pub struct PermitStreamCreatedEvent {
    pub stream_id: u64,
    pub sender_pubkey: soroban_sdk::BytesN<32>,
    pub receiver: Address,
    pub token: Address,
    pub total_amount: i128,
    pub nonce: u64,
    pub timestamp: u64,
}
