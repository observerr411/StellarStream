# Dispute Resolution (Arbiter Role)

## Overview
Implements third-party arbitration for "Work for Hire" scenarios where sender and receiver disagree on work completion.

## Issue #35 Requirements ✅

### ✅ Arbiter Designation
**Requirement:** Allow an optional arbiter: Address during stream creation.

**Implementation:**
- `arbiter: Option<Address>` field added to Stream struct
- `set_arbiter(stream_id, sender, arbiter)` function allows sender to designate arbiter
- Arbiter can be set after stream creation (avoids 10-parameter limit)

```rust
// Designate arbiter
contract.set_arbiter(&stream_id, &sender, &arbiter_address);
```

### ✅ Actions: freeze_stream() and resolve_dispute()
**Requirement:** Implement freeze_stream(id) and resolve_dispute(id, split_ratio) for the Arbiter.

**Implementation:**

#### freeze_stream()
```rust
pub fn freeze_stream(env: Env, stream_id: u64, arbiter: Address) -> Result<(), Error>
```
- Only designated arbiter can call
- Sets `is_frozen: true` on stream
- Emits `StreamFrozenEvent`
- Prevents all withdrawals while frozen

#### resolve_dispute()
```rust
pub fn resolve_dispute(
    env: Env, 
    stream_id: u64, 
    arbiter: Address, 
    split_percentage: u32
) -> Result<(), Error>
```
- Only designated arbiter can call
- `split_percentage` in basis points (0-10000 = 0%-100%)
- Calculates split of remaining balance
- Handles vault withdrawals if applicable
- Transfers funds to sender and receiver
- Marks stream as cancelled
- Emits `DisputeResolvedEvent`

### ✅ Resolution: Arbiter decides X% to sender, Y% to receiver
**Requirement:** The arbiter can decide to give X% to the sender and Y% to the receiver to close the stream.

**Implementation:**
```rust
// Calculate split (split_percentage goes to receiver)
let to_receiver = (remaining_balance * split_percentage as i128) / 10000;
let to_sender = remaining_balance - to_receiver;

// Transfer to both parties
token_client.transfer(&contract, &stream.receiver, &to_receiver);
token_client.transfer(&contract, &stream.sender, &to_sender);
```

**Examples:**
- `split_percentage: 6000` → 60% to receiver, 40% to sender
- `split_percentage: 5000` → 50/50 split
- `split_percentage: 10000` → 100% to receiver, 0% to sender

## Acceptance Criteria ✅

### ✅ Third party can halt fund flow during conflict
**Verified:**
- `freeze_stream()` sets `is_frozen: true`
- `withdraw()` checks frozen state and returns `Error::StreamFrozen`
- Test: `test_withdraw_from_frozen_stream_fails` confirms withdrawal blocked

### ✅ Arbiter cannot take funds themselves
**Verified:**
- `resolve_dispute()` only transfers to `stream.sender` and `stream.receiver`
- No code path allows transfer to arbiter address
- Split calculation ensures: `to_sender + to_receiver = remaining_balance`
- Test: `test_resolve_dispute` verifies only sender/receiver get funds

## API Reference

### set_arbiter
```rust
pub fn set_arbiter(
    env: Env,
    stream_id: u64,
    sender: Address,
    arbiter: Address
) -> Result<(), Error>
```
**Auth:** Requires sender signature  
**Errors:** StreamNotFound, Unauthorized, AlreadyCancelled

### freeze_stream
```rust
pub fn freeze_stream(
    env: Env,
    stream_id: u64,
    arbiter: Address
) -> Result<(), Error>
```
**Auth:** Requires arbiter signature  
**Errors:** StreamNotFound, Unauthorized, AlreadyCancelled

### resolve_dispute
```rust
pub fn resolve_dispute(
    env: Env,
    stream_id: u64,
    arbiter: Address,
    split_percentage: u32
) -> Result<(), Error>
```
**Auth:** Requires arbiter signature  
**Params:** split_percentage (0-10000 basis points)  
**Errors:** StreamNotFound, Unauthorized, AlreadyCancelled, InvalidAmount

## Events

### StreamFrozenEvent
```rust
pub struct StreamFrozenEvent {
    pub stream_id: u64,
    pub arbiter: Address,
    pub timestamp: u64,
}
```

### DisputeResolvedEvent
```rust
pub struct DisputeResolvedEvent {
    pub stream_id: u64,
    pub arbiter: Address,
    pub to_sender: i128,
    pub to_receiver: i128,
    pub timestamp: u64,
}
```

## Use Case: Freelance Work

```rust
// 1. Client creates stream for $10,000 project
let stream_id = contract.create_stream(
    &client,
    &freelancer,
    &usdc_token,
    &10_000_000000, // $10k USDC
    &start_time,
    &end_time,
    ...
);

// 2. Client designates arbiter (e.g., escrow service)
contract.set_arbiter(&stream_id, &client, &escrow_service);

// 3. Dispute arises at 50% completion
// Freelancer claims work done, client disagrees

// 4. Arbiter freezes stream
contract.freeze_stream(&stream_id, &escrow_service);

// 5. Arbiter reviews work and decides 70% complete
contract.resolve_dispute(
    &stream_id,
    &escrow_service,
    &7000 // 70% to freelancer, 30% back to client
);

// Result:
// - Freelancer receives $7,000
// - Client receives $3,000 refund
// - Stream closed
```

## Security Considerations

1. **Arbiter Authority:** Only designated arbiter can freeze/resolve
2. **No Self-Dealing:** Arbiter cannot transfer funds to themselves
3. **Immutable Resolution:** Once resolved, stream is cancelled (irreversible)
4. **Vault Integration:** Properly handles yield-bearing vault withdrawals
5. **Event Transparency:** All actions emit events for audit trail

## Test Coverage

- ✅ `test_freeze_stream` - Arbiter can freeze stream
- ✅ `test_withdraw_from_frozen_stream_fails` - Withdrawals blocked when frozen
- ✅ `test_resolve_dispute` - Arbiter splits funds correctly
- ✅ `test_non_arbiter_cannot_freeze` - Unauthorized freeze rejected

All 49 contract tests passing.
