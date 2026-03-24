# Contract Upgradability Implementation

## Overview

This implementation adds native Soroban contract upgradability to StellarStream, allowing the contract logic to be updated while maintaining the same contract ID and all existing storage state.

## Features Implemented

### 1. Upgrade Function

```rust
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>)
```

**Parameters:**
- `new_wasm_hash`: The hash of the new WASM binary that has been uploaded to the network

**Authorization:**
- Requires admin authorization via `admin.require_auth()`
- Only the contract admin can perform upgrades

**Behavior:**
1. Retrieves the admin address from storage
2. Requires admin authorization
3. Updates the contract WASM to the new hash
4. Emits an upgrade event with the new WASM hash

### 2. Get Admin Function

```rust
pub fn get_admin(env: Env) -> Address
```

Query function to retrieve the current admin address.

## Upgrade Process

### Step 1: Upload New WASM
Before calling `upgrade()`, the new contract WASM must be uploaded to the Stellar network:

```bash
soroban contract install \
  --wasm target/wasm32-unknown-unknown/release/stellarstream_contracts.wasm \
  --network testnet
```

This returns a WASM hash (32 bytes).

### Step 2: Call Upgrade Function
With the admin's authorization, call the upgrade function:

```rust
client.upgrade(&new_wasm_hash);
```

### Step 3: Verify Upgrade
The contract emits an `upgrade` event containing:
- Topic: `("upgrade", admin_address)`
- Data: `new_wasm_hash`

## Security Considerations

### Authorization
- **Strict Admin-Only Access**: Only the admin can upgrade the contract
- **require_auth() Enforcement**: Admin must provide valid authorization
- **No Bypass**: There is no way to upgrade without admin authorization

### State Preservation
- **Contract ID Unchanged**: The contract address remains the same
- **Storage Intact**: All existing data (streams, fees, settings) is preserved
- **Seamless Transition**: Users don't need to migrate or update anything

### Transparency
- **Upgrade Events**: Every upgrade emits an event for auditability
- **On-Chain Record**: All upgrades are permanently recorded on the blockchain
- **Admin Visibility**: The admin address is publicly queryable

## Use Cases

### 1. Bug Fixes
Fix critical bugs without requiring users to migrate their streams:
```rust
// Upload patched WASM
let patched_hash = upload_wasm("v1.0.1-patched.wasm");

// Upgrade contract
client.upgrade(&patched_hash);

// All existing streams continue working with the fix
```

### 2. Feature Additions
Add new functionality while preserving existing features:
```rust
// Upload enhanced WASM with new features
let enhanced_hash = upload_wasm("v2.0.0-with-new-features.wasm");

// Upgrade contract
client.upgrade(&enhanced_hash);

// Old streams work as before, new features available
```

### 3. Performance Optimizations
Improve contract efficiency without disrupting users:
```rust
// Upload optimized WASM
let optimized_hash = upload_wasm("v1.1.0-optimized.wasm");

// Upgrade contract
client.upgrade(&optimized_hash);

// Same functionality, better performance
```

## Testing

### Unit Tests
The implementation includes comprehensive tests:

- ✅ `test_upgrade_by_admin`: Admin can upgrade
- ✅ `test_upgrade_without_initialization`: Fails without admin
- ✅ `test_upgrade_maintains_state`: Storage is preserved
- ✅ `test_get_admin`: Admin query works
- ✅ `test_get_admin_not_initialized`: Fails without initialization
- ✅ `test_upgrade_with_paused_contract`: Upgrade works even when paused
- ✅ `test_upgrade_preserves_fee_settings`: Fee settings survive upgrade
- ✅ `test_admin_authorization_required`: Authorization is enforced

### Integration Testing Note
Full upgrade testing requires:
1. Actual WASM upload to network
2. Real contract deployment
3. Upgrade with valid WASM hash

Unit tests verify the authorization and event logic. Integration tests on testnet/mainnet verify the actual WASM update.

## Events

### Upgrade Event
```rust
env.events().publish(
    (symbol_short!("upgrade"), admin),
    new_wasm_hash,
);
```

**Structure:**
- **Topics**: `["upgrade", admin_address]`
- **Data**: `new_wasm_hash` (BytesN<32>)

**Purpose:**
- Provides transparency for all upgrades
- Allows monitoring and auditing
- Records the new WASM hash on-chain

## Best Practices

### 1. Test Thoroughly
- Test new WASM extensively on testnet
- Verify all existing functionality works
- Check that storage migration (if any) is correct

### 2. Communicate Upgrades
- Announce upgrades to users in advance
- Document what's changing
- Provide upgrade timeline

### 3. Emergency Procedures
- Have rollback plan ready
- Keep previous WASM hash available
- Monitor contract after upgrade

### 4. Gradual Rollout
- Consider upgrading on testnet first
- Monitor for issues
- Then upgrade mainnet

### 5. Admin Key Security
- Use multi-sig for admin if possible
- Secure admin private key
- Consider timelock for upgrades

## Comparison with Other Approaches

### Traditional Approach (No Upgradability)
- ❌ Bugs require new deployment
- ❌ Users must migrate manually
- ❌ Loses contract address
- ❌ Complex migration process

### Proxy Pattern
- ⚠️ More complex architecture
- ⚠️ Additional gas costs
- ⚠️ Potential security risks
- ✅ Flexible upgrade logic

### Native Soroban Upgradability (This Implementation)
- ✅ Simple and clean
- ✅ Preserves contract ID
- ✅ No migration needed
- ✅ Built-in security
- ✅ Minimal gas overhead

## Limitations

### 1. Storage Schema Changes
If the new WASM changes data structures, you may need migration logic:
```rust
pub fn migrate_v1_to_v2(env: Env) {
    // Migration logic here
}
```

### 2. Breaking Changes
Avoid breaking changes to public API:
- Don't remove public functions
- Don't change function signatures
- Add new functions instead

### 3. Admin Dependency
- Contract upgradability depends on admin key security
- Lost admin key = no more upgrades
- Consider multi-sig or DAO governance

## Acceptance Criteria

✅ **Contract Logic Updatable**: WASM can be updated via `upgrade()` function
✅ **Same Contract ID**: Contract address remains unchanged after upgrade
✅ **Storage State Maintained**: All data persists through upgrades
✅ **Admin Authorization**: Only admin can upgrade, strictly enforced
✅ **Unauthorized Users Blocked**: Non-admin calls fail
✅ **Event Emission**: Upgrade events provide transparency

## API Reference

### upgrade
```rust
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>)
```
Updates the contract WASM to a new version.

**Requirements:**
- Admin authorization required
- WASM must be pre-uploaded to network

**Emits:** `upgrade` event

### get_admin
```rust
pub fn get_admin(env: Env) -> Address
```
Returns the current admin address.

**Requirements:** None (public query)

## Example Usage

### CLI Example
```bash
# 1. Build new contract version
cargo build --target wasm32-unknown-unknown --release

# 2. Optimize WASM
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/stellarstream_contracts.wasm

# 3. Upload new WASM
NEW_HASH=$(soroban contract install \
  --wasm target/wasm32-unknown-unknown/release/stellarstream_contracts.optimized.wasm \
  --network testnet)

# 4. Upgrade contract
soroban contract invoke \
  --id $CONTRACT_ID \
  --network testnet \
  -- \
  upgrade \
  --new_wasm_hash $NEW_HASH
```

### SDK Example
```rust
use soroban_sdk::{BytesN, Env};

// Get new WASM hash (from upload)
let new_wasm_hash = BytesN::from_array(&env, &[/* 32 bytes */]);

// Upgrade contract (requires admin auth)
client.upgrade(&new_wasm_hash);
```

## Files Modified/Created

- `contracts/src/lib.rs`: Added `upgrade()` and `get_admin()` functions
- `contracts/src/upgrade_test.rs`: Comprehensive test suite
- `contracts/CONTRACT_UPGRADABILITY.md`: This documentation

## Next Steps

1. Deploy to testnet
2. Test upgrade process end-to-end
3. Document upgrade procedures for operators
4. Consider multi-sig admin for production
5. Set up monitoring for upgrade events
