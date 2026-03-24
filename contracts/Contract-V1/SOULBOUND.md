# Soulbound Streams

## What is a Soulbound Stream?

A stream flagged as `is_soulbound: true` at creation is permanently locked to the original receiver address. The receiver cannot be transferred, delegated, or reassigned under any circumstances, including by the stream sender or any admin.

## Use Cases

- **Identity-verified grant distributions**: Ensure grants remain with KYC-verified recipients
- **KYC/KYB-gated reward streams**: Compliance-locked distributions for regulated entities
- **Compliance-locked vesting**: Regulatory requirements that prevent transfer of vesting schedules
- **Non-transferable employee compensation**: Salary or bonus streams that must remain with the original employee
- **Academic or research grants**: Funding that must stay with the original grant recipient

## Behavior Reference

| Operation          | Normal Stream | Soulbound Stream |
|--------------------|---------------|------------------|
| transfer_receiver  | ✅ Allowed     | ❌ Reverts        |
| withdraw/claim     | ✅ Allowed     | ✅ Allowed        |
| cancel (by sender) | ✅ Allowed     | ✅ Allowed        |
| pause/unpause      | ✅ Allowed     | ✅ Allowed        |
| is_soulbound flip  | N/A           | ❌ Impossible     |
| receipt transfer   | ✅ Allowed     | ✅ Allowed*       |

*Note: Receipt transfer is allowed but does not change the stream receiver. The soulbound lock applies to the `receiver` field, not the `receipt_owner`. This maintains NFT receipt functionality while preserving the soulbound invariant.

## Creating a Soulbound Stream

```rust
use soroban_sdk::{Address, Env};
use crate::types::CurveType;

pub fn create_soulbound_grant(
    env: Env,
    sender: Address,
    verified_recipient: Address,
    token: Address,
    amount: i128,
    start_time: u64,
    end_time: u64,
) -> Result<u64, Error> {
    let stream_id = StellarStreamContractClient::new(&env, &contract_id)
        .create_stream(
            &sender,
            &verified_recipient,
            &token,
            &amount,
            &start_time,
            &end_time,
            &CurveType::Linear,
            &true, // is_soulbound - SET ONCE, IMMUTABLE
        );
    
    Ok(stream_id)
}
```

## Key Design Decisions

### 1. Immutability by Design

The `is_soulbound` flag is set **once** at stream creation and has **no setter function**. This is intentional:

- No admin override exists
- No emergency unlock mechanism
- No governance vote can change it
- If a mistake is made, the correct approach is to cancel the stream and create a new one

**Rationale**: Soulbound streams are used for compliance and identity-based distributions. Any bypass mechanism would undermine their purpose and create regulatory risk.

### 2. bool vs Option<bool>

We use `bool` with an explicit default of `false` rather than `Option<bool>`:

```rust
pub is_soulbound: bool,  // NOT Option<bool>
```

**Rationale**:
- Avoids storage overhead of Option wrapper
- Ensures explicit default behavior (false = not soulbound)
- All existing streams automatically default to false (backward compatible)
- Clearer semantics: a stream is either soulbound or not, no "unknown" state

### 3. Guard Ordering

In `transfer_receiver`, the soulbound check is the **first** check, before authentication:

```rust
pub fn transfer_receiver(...) -> Result<(), Error> {
    caller.require_auth();
    
    let stream = load_stream(...)?;
    
    // SOULBOUND CHECK FIRST - hard protocol invariant
    if stream.is_soulbound {
        return Err(Error::StreamIsSoulbound);
    }
    
    // Then auth checks
    if stream.sender != caller {
        return Err(Error::Unauthorized);
    }
    
    // ...
}
```

**Rationale**: Soulbound is a protocol invariant, not a permission check. Even the sender cannot override it. This ordering makes the invariant explicit in code.

### 4. Soulbound vs Receipt Transfer

Soulbound locks the `receiver` field (who can withdraw), not the `receipt_owner` (NFT ownership):

- `transfer_receiver`: Changes `receiver` → **BLOCKED** for soulbound
- `transfer_receipt`: Changes `receipt_owner` → **ALLOWED** for soulbound

**Rationale**: This separation allows:
- NFT receipt trading/collateralization while preserving withdrawal rights
- Receipt-based DeFi integrations without breaking soulbound guarantees
- Clear distinction between "who owns the NFT" vs "who receives the funds"

If you need to lock both, use a separate mechanism to restrict receipt transfers.

## Querying Soulbound Streams

### Get All Soulbound Stream IDs

```rust
let soulbound_streams: Vec<u64> = client.get_soulbound_streams();
```

This returns a persistent storage index of all soulbound stream IDs, useful for:
- Compliance audits
- Off-chain indexers
- Analytics dashboards
- Regulatory reporting

### Check if a Specific Stream is Soulbound

```rust
let stream = client.get_stream(&stream_id);
if stream.is_soulbound {
    // Handle soulbound stream
}
```

## Events

### Soulbound Lock Event

When a soulbound stream is created, the contract emits:

```rust
env.events().publish(
    (symbol_short!("soulbound"), symbol_short!("locked")),
    (stream_id, receiver),
);
```

**Event Structure**:
- Topic 1: `"soulbound"`
- Topic 2: `"locked"`
- Data: `(stream_id: u64, receiver: Address)`

This event is critical for:
- Off-chain indexers tracking identity-locked streams
- Compliance monitoring systems
- Real-time alerts for soulbound stream creation

## Error Handling

### StreamIsSoulbound (Error Code 21)

Returned when attempting to transfer the receiver of a soulbound stream:

```rust
pub enum Error {
    // ...
    StreamIsSoulbound = 21,
}
```

**When This Error Occurs**:
- Calling `transfer_receiver` on a soulbound stream
- Any future function that attempts to change the receiver

**How to Handle**:
```rust
match client.try_transfer_receiver(&stream_id, &sender, &new_receiver) {
    Err(Ok(Error::StreamIsSoulbound)) => {
        // Stream is permanently locked to original receiver
        // Option 1: Cancel and create new stream
        // Option 2: Inform user transfer is not possible
    }
    Ok(_) => {
        // Transfer succeeded
    }
    Err(e) => {
        // Other error
    }
}
```

## Migration and Backward Compatibility

### Existing Streams

All streams created before the soulbound feature was added automatically have `is_soulbound: false`:

- No migration required
- No breaking changes to existing streams
- All existing behavior preserved

### Storage Compatibility

The `is_soulbound` field is appended to the `Stream` struct:

```rust
pub struct Stream {
    // ... existing fields ...
    pub price_max: i128,
    pub is_soulbound: bool,  // NEW - defaults to false
}
```

Soroban's storage system handles this gracefully:
- Existing streams read `is_soulbound` as `false` (default bool value)
- New streams explicitly set the value
- No storage migration needed

## Audit Notes

### Security Considerations

1. **No Bypass Mechanism**: By design, there is no admin override, emergency unlock, or governance vote that can change `is_soulbound` or bypass the transfer restriction. This is intentional for compliance use cases.

2. **Immutability**: The `is_soulbound` flag has no setter function. Once set at creation, it cannot be changed. This is a security feature, not a limitation.

3. **Guard Ordering**: The soulbound check in `transfer_receiver` precedes authentication checks. This ensures the invariant is enforced at the protocol level, not the permission level.

4. **Event Emission**: Soulbound stream creation emits a dedicated event for off-chain monitoring and compliance tracking.

5. **Index Integrity**: The `SoulboundStreams` index is append-only. Stream IDs are never removed, even if the stream is cancelled. This preserves audit trails.

### Testing Coverage

The soulbound feature includes comprehensive tests:

- ✅ Create soulbound stream
- ✅ Create normal stream (not soulbound)
- ✅ Transfer blocked on soulbound
- ✅ Transfer allowed on normal
- ✅ Flag immutability
- ✅ Withdrawal still works
- ✅ Cancellation still works
- ✅ Index query correctness

See `contracts/src/soulbound_test.rs` for full test suite.

## FAQ

### Can a soulbound stream be "unlocked" later?

No. By design, there is no unlock mechanism. If you need to change the receiver, cancel the soulbound stream and create a new one.

### What if I accidentally create a soulbound stream?

Cancel it (sender can always cancel) and create a new stream with `is_soulbound: false`.

### Can the receiver transfer the receipt NFT?

Yes. Soulbound locks the `receiver` (who can withdraw), not the `receipt_owner` (NFT ownership). The receipt can be transferred, but withdrawal rights remain with the original receiver.

### Can an admin override the soulbound lock?

No. There is no admin override. This is intentional for compliance use cases.

### What happens if the receiver loses their private key?

The stream is permanently locked. This is the same risk as any blockchain address. For high-value soulbound streams, consider using a multisig or smart contract wallet as the receiver.

### Can I make an existing stream soulbound?

No. The `is_soulbound` flag can only be set at creation. To make an existing stream soulbound, you must cancel it and create a new soulbound stream.

### Does soulbound affect interest distribution or vault integration?

No. Soulbound only affects receiver transfer. All other stream functionality (interest, vaults, milestones, curves) works identically.

## Related Documentation

- [Contract Upgradability](CONTRACT_UPGRADABILITY.md)
- [RBAC System](RBAC.md)
- [Migration Framework](MIGRATION_FRAMEWORK.md)
- [Error Codes](../docs/ERROR_CODES.md)

## Issue Reference

This feature addresses **Issue #12** (transfer_receiver override) for identity-based rewards and grants.

**Implementation Date**: 2024  
**Contract Version**: 1.1.0+  
**Audit Status**: Pending
