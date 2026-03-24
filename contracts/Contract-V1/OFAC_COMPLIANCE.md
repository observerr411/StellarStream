# OFAC Compliance Implementation

## Overview

The StellarStream contract implements OFAC (Office of Foreign Assets Control) compliance to prevent interactions with sanctioned or malicious addresses. This feature allows administrators to maintain a list of restricted addresses that cannot be used as receivers in token streams.

## Architecture

### Storage

The restricted addresses are stored in persistent contract storage using the `RESTRICTED_ADDRESSES` symbol key:

```rust
pub const RESTRICTED_ADDRESSES: Symbol = symbol_short!("RESTRICT");
```

The storage contains a `Vec<Address>` of all currently restricted addresses.

### Error Handling

A new error code has been added to handle restriction violations:

```rust
#[contracterror]
pub enum Error {
    // ... other errors ...
    RestrictedAddress = 20,  // Address is on the restricted list
}
```

### Event System

When addresses are restricted or unrestricted, an `AddressRestrictedEvent` is emitted:

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct AddressRestrictedEvent {
    pub address: Address,
    pub restricted: bool,
    pub timestamp: u64,
}
```

## Public Functions

### restrict_address

**Signature:**
```rust
pub fn restrict_address(env: Env, admin: Address, target: Address) -> Result<(), Error>
```

**Description:** Adds an address to the restricted list. Only addresses with the Admin role can call this function.

**Parameters:**
- `env`: The Soroban environment
- `admin`: The admin address performing the restriction (must have Admin role)
- `target`: The address to restrict

**Returns:** `Ok(())` on success, `Err(Error::Unauthorized)` if caller is not admin

**Behavior:**
- Requires authentication from the admin address
- Checks if admin has the Admin role
- If the address is already restricted, returns `Ok(())` (idempotent)
- Adds the address to the restricted list
- Emits `AddressRestrictedEvent` with `restricted: true`

### unrestrict_address

**Signature:**
```rust
pub fn unrestrict_address(env: Env, admin: Address, target: Address) -> Result<(), Error>
```

**Description:** Removes an address from the restricted list. Only addresses with the Admin role can call this function.

**Parameters:**
- `env`: The Soroban environment
- `admin`: The admin address performing the unrestriction (must have Admin role)
- `target`: The address to unrestrict

**Returns:** `Ok(())` on success, `Err(Error::Unauthorized)` if caller is not admin

**Behavior:**
- Requires authentication from the admin address
- Checks if admin has the Admin role
- Searches for the address in the restricted list
- If found, removes it and emits `AddressRestrictedEvent` with `restricted: false`
- If not found, returns `Ok(())` (safe no-op)

### is_address_restricted

**Signature:**
```rust
pub fn is_address_restricted(env: Env, address: Address) -> bool
```

**Description:** Checks if an address is currently restricted.

**Parameters:**
- `env`: The Soroban environment
- `address`: The address to check

**Returns:** `true` if the address is restricted, `false` otherwise

### get_restricted_addresses

**Signature:**
```rust
pub fn get_restricted_addresses(env: Env) -> Vec<Address>
```

**Description:** Returns the complete list of all currently restricted addresses.

**Parameters:**
- `env`: The Soroban environment

**Returns:** A vector containing all restricted addresses

## Integration Points

The OFAC compliance check is integrated into the following functions:

### 1. create_proposal

When creating a proposal, the receiver address is validated:

```rust
pub fn create_proposal(
    env: Env,
    sender: Address,
    receiver: Address,  // ← Validated
    // ... other parameters ...
) -> Result<u64, Error> {
    sender.require_auth();
    
    // OFAC Compliance: Check if receiver is restricted
    Self::validate_receiver(&env, &receiver)?;
    
    // ... rest of function ...
}
```

**Error:** Returns `Error::RestrictedAddress` if receiver is restricted

### 2. create_stream

When creating a direct stream, the receiver address is validated:

```rust
pub fn create_stream(
    env: Env,
    sender: Address,
    receiver: Address,  // ← Validated
    // ... other parameters ...
) -> Result<u64, Error> {
    sender.require_auth();
    
    // OFAC Compliance: Check if receiver is restricted
    Self::validate_receiver(&env, &receiver)?;
    
    // ... rest of function ...
}
```

**Error:** Returns `Error::RestrictedAddress` if receiver is restricted

### 3. create_stream_with_milestones

When creating a stream with milestones, the receiver address is validated:

```rust
pub fn create_stream_with_milestones(
    env: Env,
    sender: Address,
    receiver: Address,  // ← Validated
    // ... other parameters ...
) -> Result<u64, Error> {
    sender.require_auth();
    
    // OFAC Compliance: Check if receiver is restricted
    Self::validate_receiver(&env, &receiver)?;
    
    // ... rest of function ...
}
```

**Error:** Returns `Error::RestrictedAddress` if receiver is restricted

### 4. create_usd_pegged_stream

When creating a USD-pegged stream, the receiver address is validated:

```rust
pub fn create_usd_pegged_stream(
    env: Env,
    sender: Address,
    receiver: Address,  // ← Validated
    // ... other parameters ...
) -> Result<u64, Error> {
    sender.require_auth();
    
    // OFAC Compliance: Check if receiver is restricted
    Self::validate_receiver(&env, &receiver)?;
    
    // ... rest of function ...
}
```

**Error:** Returns `Error::RestrictedAddress` if receiver is restricted

### 5. transfer_receipt

When transferring a stream receipt to a new owner, the new owner address is validated:

```rust
pub fn transfer_receipt(
    env: Env,
    stream_id: u64,
    from: Address,
    to: Address,  // ← Validated
) -> Result<(), Error> {
    from.require_auth();
    
    // OFAC Compliance: Check if recipient is restricted
    Self::validate_receiver(&env, &to)?;
    
    // ... rest of function ...
}
```

**Error:** Returns `Error::RestrictedAddress` if recipient is restricted

## Internal Validation Function

```rust
fn validate_receiver(env: &Env, receiver: &Address) -> Result<(), Error> {
    let restricted: Vec<Address> = env
        .storage()
        .instance()
        .get(&RESTRICTED_ADDRESSES)
        .unwrap_or_else(|| Vec::new(env));

    for addr in restricted.iter() {
        if &addr == receiver {
            return Err(Error::RestrictedAddress);
        }
    }
    Ok(())
}
```

This function:
1. Retrieves the restricted addresses list from storage
2. Iterates through each restricted address
3. Returns `Error::RestrictedAddress` if the receiver matches any restricted address
4. Returns `Ok(())` if the receiver is not restricted

## Test Coverage

Comprehensive tests are included to verify OFAC compliance:

1. **test_restrict_address_by_admin** - Verifies admin can restrict addresses
2. **test_unrestrict_address_by_admin** - Verifies admin can unrestrict addresses
3. **test_non_admin_cannot_restrict_address** - Verifies non-admins cannot restrict
4. **test_cannot_create_stream_to_restricted_address** - Verifies stream creation is blocked
5. **test_cannot_create_proposal_to_restricted_address** - Verifies proposal creation is blocked
6. **test_cannot_transfer_receipt_to_restricted_address** - Verifies receipt transfer is blocked
7. **test_get_restricted_addresses_list** - Verifies list retrieval works
8. **test_restrict_same_address_twice_is_idempotent** - Verifies idempotent behavior
9. **test_stream_creation_allowed_after_unrestriction** - Verifies unrestriction works

## Usage Example

### Restricting an Address

```rust
// Admin restricts a sanctioned address
client.restrict_address(&admin, &sanctioned_address)?;

// Verify it's restricted
assert!(client.is_address_restricted(&sanctioned_address));
```

### Attempting to Create a Stream to a Restricted Address

```rust
// This will fail with Error::RestrictedAddress
let result = client.create_stream(
    &sender,
    &restricted_address,  // This address is restricted
    &token,
    &amount,
    &start_time,
    &end_time,
    &curve_type,
);

assert!(result.is_err());
assert_eq!(result.unwrap_err(), Error::RestrictedAddress);
```

### Unrestricting an Address

```rust
// Admin unrestricts the address
client.unrestrict_address(&admin, &previously_restricted_address)?;

// Now streams can be created to this address
let stream_id = client.create_stream(
    &sender,
    &previously_restricted_address,
    &token,
    &amount,
    &start_time,
    &end_time,
    &curve_type,
)?;
```

## Security Considerations

1. **Admin-Only Access**: Only addresses with the Admin role can modify the restricted list
2. **Idempotent Operations**: Restricting an already-restricted address is safe (no-op)
3. **Persistent Storage**: Restrictions are stored in contract persistent storage and survive contract calls
4. **Event Logging**: All restrictions and unrestrictions are logged via events for audit trails
5. **Early Validation**: Receiver validation happens early in stream creation functions, before any state changes

## Compliance Notes

This implementation provides the technical infrastructure for OFAC compliance but does not automatically determine which addresses should be restricted. The responsibility for maintaining an accurate restricted list lies with the contract administrators, who should:

1. Monitor OFAC SDN (Specially Designated Nationals) lists
2. Update the restricted addresses list as needed
3. Maintain audit logs of all restrictions and unrestrictions
4. Implement appropriate governance processes for address restrictions

## Performance Characteristics

- **Restrict Address**: O(n) where n is the number of restricted addresses (linear search to check for duplicates)
- **Unrestrict Address**: O(n) where n is the number of restricted addresses (linear search and rebuild)
- **Is Address Restricted**: O(n) where n is the number of restricted addresses (linear search)
- **Get Restricted Addresses**: O(1) storage retrieval

For typical use cases with a reasonable number of restricted addresses (< 1000), performance should be acceptable.
