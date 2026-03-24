# Role-Based Access Control (RBAC) Implementation

## Overview

This implementation adds a flexible Role-Based Access Control (RBAC) system to StellarStream, separating administrative duties and reducing security risks associated with a single admin address.

## Roles Defined

### 1. Admin Role
**Capabilities:**
- Grant roles to other addresses
- Revoke roles from addresses
- Upgrade contract WASM
- All permissions of other roles

**Use Case:** Contract owner, DAO governance

### 2. Pauser Role
**Capabilities:**
- Pause contract operations (emergency stop)
- Unpause contract operations

**Use Case:** Security guardian, emergency responder

### 3. TreasuryManager Role
**Capabilities:**
- Update protocol fees
- Update treasury address
- Initialize fee settings

**Use Case:** Finance team, treasury operations

## Key Features

### Granular Permissions
- Each role has specific, limited permissions
- Roles can be combined (one address can have multiple roles)
- Multiple addresses can have the same role

### Separation of Duties
- Pauser cannot change fees
- TreasuryManager cannot pause contract
- Only Admin can grant/revoke roles and upgrade contract

### Flexibility
- Roles can be granted and revoked dynamically
- No need to redeploy contract to change permissions
- Supports multi-signature and DAO governance patterns

## API Reference

### Initialization

```rust
pub fn initialize(env: Env, admin: Address)
```

Initializes the contract and grants all three roles to the admin address.

**Parameters:**
- `admin`: Address that will receive all roles initially

**Effects:**
- Grants Admin, Pauser, and TreasuryManager roles to admin
- Sets legacy admin field for backward compatibility
- Initializes pause state to false

### Role Management

#### Grant Role
```rust
pub fn grant_role(env: Env, admin: Address, account: Address, role: Role)
```

Grants a role to an address (Admin only).

**Parameters:**
- `admin`: Address with Admin role (requires authorization)
- `account`: Address to receive the role
- `role`: Role to grant (Admin, Pauser, or TreasuryManager)

**Authorization:** Requires Admin role

**Events:** Emits `grant` event with (account, role)

#### Revoke Role
```rust
pub fn revoke_role(env: Env, admin: Address, account: Address, role: Role)
```

Revokes a role from an address (Admin only).

**Parameters:**
- `admin`: Address with Admin role (requires authorization)
- `account`: Address to lose the role
- `role`: Role to revoke

**Authorization:** Requires Admin role

**Events:** Emits `revoke` event with (account, role)

#### Check Role
```rust
pub fn check_role(env: Env, account: Address, role: Role) -> bool
```

Query function to check if an address has a specific role.

**Parameters:**
- `account`: Address to check
- `role`: Role to check for

**Returns:** `true` if address has the role, `false` otherwise

### Protected Functions

#### Pause Management (Pauser Role)
```rust
pub fn set_pause(env: Env, pauser: Address, paused: bool)
```

Pause or unpause contract operations.

**Authorization:** Requires Pauser role

**Events:** Emits `pause` event with boolean state

#### Fee Management (TreasuryManager Role)
```rust
pub fn initialize_fee(env: Env, manager: Address, fee_bps: u32, treasury: Address)
pub fn update_fee(env: Env, manager: Address, fee_bps: u32)
pub fn update_treasury(env: Env, manager: Address, treasury: Address)
```

Manage protocol fees and treasury address.

**Authorization:** Requires TreasuryManager role

**Constraints:** Fee cannot exceed 10% (1000 basis points)

#### Contract Upgrade (Admin Role)
```rust
pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>)
```

Upgrade contract WASM.

**Authorization:** Requires Admin role

**Events:** Emits `upgrade` event with new WASM hash

## Usage Examples

### Initial Setup
```rust
// Deploy and initialize
let admin = Address::from_string("GADMIN...");
client.initialize(&admin);

// Admin now has all roles
assert!(client.check_role(&admin, &Role::Admin));
assert!(client.check_role(&admin, &Role::Pauser));
assert!(client.check_role(&admin, &Role::TreasuryManager));
```

### Delegate Pauser Role
```rust
// Grant Pauser role to security guardian
let guardian = Address::from_string("GGUARD...");
client.grant_role(&admin, &guardian, &Role::Pauser);

// Guardian can now pause in emergencies
client.set_pause(&guardian, &true);

// But guardian cannot change fees
// client.update_fee(&guardian, &200); // Would fail!
```

### Delegate Treasury Management
```rust
// Grant TreasuryManager role to finance team
let finance = Address::from_string("GFINANCE...");
client.grant_role(&admin, &finance, &Role::TreasuryManager);

// Finance team can manage fees
client.update_fee(&finance, &150);
client.update_treasury(&finance, &new_treasury);

// But cannot pause
// client.set_pause(&finance, &true); // Would fail!
```

### Multi-Role Assignment
```rust
// One address can have multiple roles
let operator = Address::from_string("GOPER...");
client.grant_role(&admin, &operator, &Role::Pauser);
client.grant_role(&admin, &operator, &Role::TreasuryManager);

// Operator can do both
client.set_pause(&operator, &true);
client.update_fee(&operator, &200);

// But still cannot upgrade or grant roles
// client.upgrade(&operator, &new_wasm); // Would fail!
```

### Role Revocation
```rust
// Revoke role when no longer needed
client.revoke_role(&admin, &guardian, &Role::Pauser);

// Guardian can no longer pause
// client.set_pause(&guardian, &true); // Would fail!
```

## Security Considerations

### Admin Key Security
- Admin role has highest privileges
- Consider using multi-sig wallet for admin
- Or use DAO governance contract as admin
- Regularly audit who has Admin role

### Role Separation Benefits
- Limits blast radius of compromised keys
- Pauser key can be hot wallet for quick response
- Treasury keys can be separate from emergency keys
- Reduces single point of failure

### Best Practices
1. **Principle of Least Privilege**: Grant minimum necessary roles
2. **Regular Audits**: Review role assignments periodically
3. **Multi-Sig for Admin**: Use multi-signature for Admin role
4. **Emergency Procedures**: Document who has Pauser role
5. **Role Rotation**: Rotate keys and roles regularly

## Storage

Roles are stored in Instance storage using the following key structure:

```rust
DataKey::Role(Address, Role) -> bool
```

**Benefits:**
- Efficient lookup: O(1) to check if address has role
- Flexible: Easy to add/remove roles
- Scalable: No limit on number of addresses per role

## Events

### Grant Role Event
```rust
env.events().publish(
    (symbol_short!("grant"), admin),
    (account, role),
);
```

### Revoke Role Event
```rust
env.events().publish(
    (symbol_short!("revoke"), admin),
    (account, role),
);
```

### Pause Event
```rust
env.events().publish(
    (symbol_short!("pause"), pauser),
    paused,
);
```

## Migration from Single Admin

### Backward Compatibility
- Legacy `Admin` DataKey still exists
- `get_admin()` function still works
- Existing admin automatically gets all roles on initialization

### Migration Steps
1. Call `initialize()` with current admin address
2. Admin receives all three roles
3. Grant specific roles to other addresses
4. Optionally revoke unnecessary roles from original admin
5. Update client code to use role-specific functions

## Testing

### Test Coverage
- ✅ Initialize grants all roles to admin
- ✅ Admin can grant roles
- ✅ Admin can revoke roles
- ✅ Non-admin cannot grant/revoke roles
- ✅ Pauser can pause/unpause
- ✅ Non-pauser cannot pause
- ✅ TreasuryManager can update fees
- ✅ Non-manager cannot update fees
- ✅ Role separation enforced
- ✅ Multiple addresses can have same role
- ✅ One address can have multiple roles
- ✅ Revoked roles lose permissions

### Running Tests
```bash
cargo test rbac
```

## Acceptance Criteria

✅ **Granular Permissions**: Roles have specific, limited permissions
✅ **Pauser Limitations**: Pauser can trigger emergency stop but cannot change fees
✅ **TreasuryManager Limitations**: Can manage fees but cannot pause
✅ **Admin Control**: Only Admin can grant/revoke roles
✅ **Flexible Assignment**: Multiple addresses per role, multiple roles per address
✅ **Separation of Duties**: Clear boundaries between roles

## Future Enhancements

### Potential Additions
1. **Time-Locked Roles**: Roles that expire after a certain time
2. **Role Hierarchies**: More granular sub-roles
3. **Proposal System**: Require multiple admins to approve role changes
4. **Role Limits**: Maximum number of addresses per role
5. **Audit Log**: Detailed history of role changes

### DAO Integration
The RBAC system is designed to work with DAO governance:
- DAO contract can be granted Admin role
- Proposals can grant/revoke roles
- Multi-sig can be used for Admin role
- Time-locks can be added for sensitive operations

## Comparison with Single Admin

### Before (Single Admin)
- ❌ Single point of failure
- ❌ All or nothing permissions
- ❌ Cannot delegate specific duties
- ❌ High risk if key compromised

### After (RBAC)
- ✅ Distributed responsibilities
- ✅ Granular permissions
- ✅ Can delegate safely
- ✅ Limited blast radius
- ✅ Supports multi-sig and DAO

## Files Modified/Created

- `contracts/src/types.rs`: Added Role enum and updated DataKey
- `contracts/src/lib.rs`: Implemented RBAC functions and updated protected functions
- `contracts/src/rbac_test.rs`: Comprehensive RBAC test suite
- `contracts/src/test.rs`: Updated existing tests for RBAC
- `contracts/src/upgrade_test.rs`: Updated upgrade tests for RBAC
- `contracts/RBAC.md`: This documentation

## Conclusion

The RBAC implementation provides a flexible, secure, and scalable permission system for StellarStream. It reduces security risks, enables delegation, and supports advanced governance patterns while maintaining backward compatibility.
