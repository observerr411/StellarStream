# Vault Integration Quick Reference

## Admin Setup

```rust
// Approve a vault
contract.approve_vault(&admin, &vault_address);

// Check if vault is approved
let approved = contract.is_vault_approved(&vault_address);

// Revoke a vault
contract.revoke_vault(&admin, &vault_address);
```

## Creating Streams with Vaults

```rust
// With vault (earns yield)
let stream_id = contract.create_stream_with_milestones(
    &sender,
    &receiver,
    &token,
    &amount,
    &start_time,
    &end_time,
    &milestones,
    &CurveType::Linear,
    &false,
    &Some(vault_address), // ✅ Use vault
);

// Without vault (standard)
let stream_id = contract.create_stream_with_milestones(
    &sender,
    &receiver,
    &token,
    &amount,
    &start_time,
    &end_time,
    &milestones,
    &CurveType::Linear,
    &false,
    &None, // ❌ No vault
);
```

## Querying Vault Information

```rust
// Get vault shares for a stream
let shares = contract.get_vault_shares(&stream_id);

// Get stream details (includes vault_address)
let stream = contract.get_stream(&stream_id);
if let Some(vault) = stream.vault_address {
    // Stream uses vault
}
```

## Vault Interface (for vault developers)

```rust
#[contractimpl]
impl YourVault {
    /// Deposit tokens, return shares
    pub fn deposit(env: Env, from: Address, amount: i128) -> i128 {
        // Your implementation
    }
    
    /// Withdraw tokens using shares
    pub fn withdraw(env: Env, to: Address, shares: i128) -> i128 {
        // Your implementation
    }
    
    /// Get current value of shares
    pub fn get_value(env: Env, shares: i128) -> i128 {
        // Your implementation
    }
}
```

## Events

```rust
// Vault approved
("vault", "approve") => vault_address

// Vault revoked
("vault", "revoke") => vault_address
```

## Error Handling

```rust
// Unapproved vault
Error::Unauthorized  // Vault not on approved list

// Invalid amount
Error::InvalidAmount  // Vault deposit/withdrawal failed
```

## Security Checklist

- [ ] Only approve audited, trusted vault contracts
- [ ] Test vault integration on testnet first
- [ ] Monitor vault liquidity for withdrawals
- [ ] Set up alerts for vault approval/revocation events
- [ ] Verify vault contract implements full interface
- [ ] Check vault has sufficient liquidity for stream size

## Common Patterns

### DAO Treasury with Yield
```rust
// Approve money market
contract.approve_vault(&dao_admin, &stellar_money_market);

// Create 12-month grant with yield
contract.create_stream_with_milestones(
    &dao_treasury,
    &grant_recipient,
    &usdc,
    &100_000_0000000,
    &now,
    &now + (86400 * 365),
    &Vec::new(&env),
    &CurveType::Linear,
    &false,
    &Some(stellar_money_market),
);
```

### Payroll with Interest
```rust
// Company approves vault
contract.approve_vault(&company_admin, &lending_vault);

// Monthly salary stream earning 5% APY
contract.create_stream_with_milestones(
    &company_wallet,
    &employee,
    &usdc,
    &5_000_0000000,
    &month_start,
    &month_end,
    &Vec::new(&env),
    &CurveType::Linear,
    &false,
    &Some(lending_vault),
);
```

## Testing

```bash
# Run vault tests
cd contracts
cargo test vault_test

# Build library
cargo build --lib
```
