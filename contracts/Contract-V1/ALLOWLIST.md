# Token Allowlist Feature

## Overview
The token allowlist feature allows the DAO to control which tokens can be used for streaming. This prevents issues with tokens that have unusual logic or behaviors that could break the contract.

## Implementation

### Storage Keys
- `ALLOWLIST_ENABLED`: Boolean flag to enable/disable the allowlist
- `ALLOWED_TOKENS`: Vector of approved token contract addresses

### Functions

#### Admin Functions (Require Admin Role)

**`set_allowlist_enabled(admin: Address, enabled: bool)`**
- Enable or disable the allowlist system
- When disabled, all tokens are allowed
- When enabled, only tokens in the allowlist can be used

**`add_allowed_token(admin: Address, token: Address)`**
- Add a token to the allowlist
- Idempotent - adding the same token twice has no effect

**`remove_allowed_token(admin: Address, token: Address)`**
- Remove a token from the allowlist
- Safe to call even if token is not in the list

#### Public Query Functions

**`is_allowlist_enabled() -> bool`**
- Check if the allowlist is currently enabled

**`is_token_allowed(token: Address) -> bool`**
- Check if a specific token is allowed
- Returns `true` if allowlist is disabled OR token is in the list
- Returns `false` if allowlist is enabled AND token is not in the list

### Validation

The `validate_token()` internal function is called in:
- `create_stream()`
- `create_stream_with_milestones()`
- `create_usd_pegged_stream()`

If validation fails, the transaction reverts with `Error::TokenNotAllowed`.

## Usage Example

```rust
// Enable the allowlist
contract.set_allowlist_enabled(&admin, &true);

// Add approved tokens
contract.add_allowed_token(&admin, &usdc_address);
contract.add_allowed_token(&admin, &xlm_address);
contract.add_allowed_token(&admin, &dao_token_address);

// Now only these tokens can be used for streams
// Attempting to create a stream with any other token will fail
```

## Security Considerations

1. **Admin-Only**: All allowlist management functions require the Admin role
2. **Default State**: Allowlist is disabled by default (backward compatible)
3. **Fail-Safe**: If allowlist is enabled but empty, NO tokens can be streamed
4. **Events**: All allowlist changes emit events for transparency

## Testing

7 comprehensive tests cover:
- Default disabled state
- Enabling/disabling the allowlist
- Adding/removing tokens
- Stream creation with allowed tokens (success)
- Stream creation with disallowed tokens (failure)
- Stream creation when allowlist is disabled (success)

All tests pass. Total test count: 56 tests.

## Binary Size Impact

The allowlist feature added minimal overhead:
- Before: 41KB
- After: 43KB (+2KB)
- Still well under the 64KB Soroban limit
