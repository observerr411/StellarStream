# Voting Rights for Streamed Tokens

## Overview

Enables receivers of streamed governance tokens to maintain voting power while tokens are locked in the contract. Supports delegation to external DAO governance systems.

## Features

### 1. Voting Power Query
Get the current voting power (unlocked balance) for a stream:
```rust
let power = contract.get_voting_power(&stream_id);
```

### 2. Total Balance Query
Get total stream balance (locked + unlocked):
```rust
let total = contract.get_total_stream_balance(&stream_id);
```

### 3. Voting Delegation
Delegate voting power to another address:
```rust
contract.delegate_voting_power(&stream_id, &receiver, &delegate_address);
```

### 4. Query Delegation
Check who has been delegated voting power:
```rust
let delegate = contract.get_voting_delegate(&stream_id);
```

### 5. Aggregated Voting Power
Get total delegated voting power across all streams:
```rust
let total_power = contract.get_delegated_voting_power(&delegate_address);
```

## Use Cases

### DAO Contributor Vesting
```rust
// DAO streams governance tokens to contributor
let stream_id = contract.create_stream(
    &dao_treasury,
    &contributor,
    &governance_token,
    &100_000,
    &start,
    &end,
    &CurveType::Linear,
    &false,
);

// Contributor delegates voting power to themselves or another address
contract.delegate_voting_power(&stream_id, &contributor, &voting_address);

// External governor contract queries voting power
let power = contract.get_voting_power(&stream_id);
```

### Multi-Stream Delegation
```rust
// Multiple contributors delegate to same representative
contract.delegate_voting_power(&stream_id_1, &contributor_1, &representative);
contract.delegate_voting_power(&stream_id_2, &contributor_2, &representative);

// Representative has combined voting power
let total = contract.get_delegated_voting_power(&representative);
```

## Integration with Governor Contracts

External governance contracts can query voting power:

```rust
// In your Governor contract
pub fn get_voter_power(env: Env, voter: Address) -> i128 {
    let stream_contract = StellarStreamContractClient::new(&env, &stream_contract_address);
    
    // Get delegated power from all streams
    stream_contract.get_delegated_voting_power(&voter)
}
```

## Voting Power Calculation

**Voting Power = Unlocked Balance - Withdrawn Amount**

- **Before stream starts**: 0 voting power
- **During stream**: Linear unlock based on time elapsed
- **After withdrawal**: Voting power reduced by withdrawn amount
- **After stream ends**: Full remaining balance

### Example Timeline

Stream: 1000 tokens over 100 seconds

| Time | Unlocked | Withdrawn | Voting Power |
|------|----------|-----------|--------------|
| 0    | 0        | 0         | 0            |
| 50   | 500      | 0         | 500          |
| 50   | 500      | 300       | 200          |
| 100  | 1000     | 300       | 700          |

## Security

- Only receipt owner can delegate voting power
- Delegation can be changed at any time
- Voting power automatically updates as stream progresses
- Cancelled streams have 0 voting power

## Events

```rust
// Delegation event
("delegate", stream_id) => (caller, delegate)
```

## API Reference

### Query Functions

```rust
/// Get voting power (unlocked - withdrawn)
pub fn get_voting_power(env: Env, stream_id: u64) -> i128

/// Get total balance (locked + unlocked - withdrawn)
pub fn get_total_stream_balance(env: Env, stream_id: u64) -> i128

/// Get voting delegate for stream
pub fn get_voting_delegate(env: Env, stream_id: u64) -> Option<Address>

/// Get total delegated power across all streams
pub fn get_delegated_voting_power(env: Env, delegate: Address) -> i128
```

### Mutation Functions

```rust
/// Delegate voting power (receipt owner only)
pub fn delegate_voting_power(
    env: Env,
    stream_id: u64,
    caller: Address,
    delegate: Address
)
```

## Testing

```bash
cd contracts
cargo test voting_test
```

Tests cover:
- ✅ Voting power calculation at different time points
- ✅ Delegation functionality
- ✅ Aggregated voting power across streams
- ✅ Voting power reduction after withdrawal

## Limitations

- Voting power is based on unlocked balance only
- Does not support snapshot-based voting (uses current state)
- Delegation is per-stream, not per-token
- No vote escrow or time-weighted voting

## Future Enhancements

- Snapshot support for historical voting power
- Time-weighted voting power
- Batch delegation across multiple streams
- Voting power multipliers based on lock duration
