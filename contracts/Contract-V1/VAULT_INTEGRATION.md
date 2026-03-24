# Yield-Bearing Vault Integration

## Overview

StellarStream now supports integration with external Soroban lending vaults (money markets) to earn yield on locked stream funds. Instead of sitting idle, the principal amount is deposited into an approved vault to generate interest while the stream is active.

## Architecture

### Vault Interface

The contract defines a standard interface for Soroban lending vaults:

```rust
pub trait VaultInterface {
    /// Deposit tokens into vault, returns shares/receipt tokens
    fn deposit(env: Env, from: Address, amount: i128) -> i128;
    
    /// Withdraw tokens from vault using shares
    fn withdraw(env: Env, to: Address, shares: i128) -> i128;
    
    /// Get current value of shares in underlying tokens
    fn get_value(env: Env, shares: i128) -> i128;
}
```

### Security: Approved Vault List

Only vaults approved by the contract admin can be used. This prevents interaction with malicious contracts.

**Admin Functions:**
- `approve_vault(admin: Address, vault: Address)` - Add vault to approved list
- `revoke_vault(admin: Address, vault: Address)` - Remove vault from approved list
- `is_vault_approved(vault: Address) -> bool` - Check if vault is approved

### Storage

**New DataKey variants:**
- `ApprovedVaults` - Vec<Address> of approved lending vaults
- `VaultShares(u64)` - Vault shares for each stream_id

**Stream struct:**
- `vault_address: Option<Address>` - The vault contract address (if used)

## Usage

### 1. Admin Approves Vault

```rust
// Admin approves a trusted lending vault
contract.approve_vault(&admin, &vault_address);
```

### 2. Create Stream with Vault

```rust
let stream_id = contract.create_stream_with_milestones(
    &sender,
    &receiver,
    &token,
    &1_000_000,      // 1M tokens
    &start_time,
    &end_time,
    &milestones,
    &CurveType::Linear,
    &false,          // not soulbound
    &Some(vault_address), // ✅ Use vault
);
```

**What happens:**
1. Tokens transferred from sender to contract
2. Contract validates vault is approved
3. Contract deposits tokens to vault
4. Vault returns shares (receipt tokens)
5. Shares stored in `VaultShares(stream_id)`

### 3. Withdraw from Stream

```rust
let amount = contract.withdraw(&stream_id, &receiver);
```

**What happens:**
1. Calculate unlocked amount based on time
2. Calculate proportional vault shares to withdraw
3. Withdraw shares from vault → get tokens back
4. Transfer tokens to receiver
5. Update remaining shares

**Formula:**
```
shares_to_withdraw = (total_shares × amount_to_withdraw) / total_stream_amount
```

### 4. Cancel Stream

```rust
contract.cancel(&stream_id, &sender);
```

**What happens:**
1. Withdraw ALL remaining vault shares
2. Split tokens between receiver (unlocked) and sender (locked)
3. Clear vault shares storage

## Interest Accrual

The vault shares may appreciate over time as the vault earns yield. The contract tracks shares, not token amounts, so:

- **Initial deposit:** 1,000 tokens → 1,000 shares
- **After 30 days:** 1,000 shares → 1,050 tokens (5% APY)
- **Receiver benefit:** Gets proportional share of yield on withdrawal

## Safety Features

### 1. Approved Vault List
Only admin-approved vaults can be used. Prevents:
- Malicious contracts
- Rug pulls
- Unauthorized token transfers

### 2. Proportional Withdrawal
Shares are withdrawn proportionally to maintain correct accounting:
```rust
// If stream is 50% complete and user withdraws 50%:
// - Withdraw 50% of vault shares
// - Remaining 50% stays in vault
```

### 3. Full Withdrawal on Cancel
When a stream is cancelled, ALL vault shares are withdrawn to ensure:
- No orphaned funds
- Clean state
- Proper refunds

## Query Functions

```rust
// Get vault shares for a stream
let shares = contract.get_vault_shares(&stream_id);

// Check if vault is approved
let approved = contract.is_vault_approved(&vault_address);

// Get stream details (includes vault_address)
let stream = contract.get_stream(&stream_id);
```

## Events

**Vault Approval:**
```rust
env.events().publish(
    (symbol_short!("vault"), symbol_short!("approve")),
    vault_address
);
```

**Vault Revocation:**
```rust
env.events().publish(
    (symbol_short!("vault"), symbol_short!("revoke")),
    vault_address
);
```

## Example: Money Market Integration

```rust
// 1. Admin approves Stellar Money Market vault
contract.approve_vault(&admin, &stellar_money_market);

// 2. Company creates 6-month salary stream with yield
let stream_id = contract.create_stream_with_milestones(
    &company_treasury,
    &employee,
    &usdc_token,
    &60_000_0000000,  // $60k USDC (7 decimals)
    &start_time,
    &end_time,
    &Vec::new(&env),
    &CurveType::Linear,
    &false,
    &Some(stellar_money_market), // Earn 5% APY
);

// 3. After 3 months, employee withdraws
// - 50% of stream unlocked = $30k
// - Plus proportional yield = ~$750
// - Total withdrawal = ~$30,750
let withdrawn = contract.withdraw(&stream_id, &employee);
```

## Backward Compatibility

Streams without vaults work exactly as before:

```rust
// Standard stream (no vault)
let stream_id = contract.create_stream_with_milestones(
    &sender,
    &receiver,
    &token,
    &amount,
    &start,
    &end,
    &milestones,
    &curve,
    &false,
    &None, // ✅ No vault
);
```

## Testing

Comprehensive test suite in `vault_test.rs`:

- ✅ `test_approve_vault` - Admin approval
- ✅ `test_revoke_vault` - Admin revocation
- ✅ `test_create_stream_with_vault` - Stream creation with vault
- ✅ `test_create_stream_with_unapproved_vault` - Security check
- ✅ `test_withdraw_from_vault_stream` - Proportional withdrawal
- ✅ `test_cancel_stream_with_vault` - Full withdrawal on cancel

Run tests:
```bash
cd contracts
cargo test vault
```

## Security Considerations

1. **Vault Risk:** Funds are only as secure as the approved vault contract
2. **Admin Trust:** Admin controls which vaults are approved
3. **Smart Contract Risk:** Vault contract bugs could affect funds
4. **Liquidity Risk:** Vault must have sufficient liquidity for withdrawals

**Recommendation:** Only approve well-audited, battle-tested vault contracts with proven track records.

## Future Enhancements

- Multi-vault support (diversification)
- Automatic vault rebalancing
- Yield distribution strategies
- Emergency vault withdrawal by admin
- Vault performance metrics
