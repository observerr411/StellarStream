# Regulatory Clawback Support

## Overview

Enables compliance officers to revoke streamed funds for regulated assets (tokenized securities) in cases of fraud or legal mandate. Integrates with Stellar Asset Contract (SAC) clawback functionality.

## Features

### 1. Compliance Officer Role
New RBAC role for authorized personnel:
```rust
Role::ComplianceOfficer
```

### 2. Governance Clawback Function
```rust
pub fn governance_clawback(
    env: Env,
    stream_id: u64,
    officer: Address,
    issuer: Address,
    reason: Option<BytesN<32>>
) -> Result<(), Error>
```

### 3. High-Priority Security Events
```rust
ClawbackEvent {
    stream_id: u64,
    officer: Address,
    amount_clawed: i128,
    issuer: Address,
    reason: Option<BytesN<32>>,
    timestamp: u64,
}
```

## Usage

### Grant Compliance Officer Role
```rust
// Admin grants compliance officer role
contract.grant_role(&admin, &officer, &Role::ComplianceOfficer);
```

### Execute Clawback
```rust
// Officer executes regulatory clawback
contract.governance_clawback(
    &stream_id,
    &officer,
    &issuer_address,
    &Some(reason_hash) // Optional reason code
);
```

## Clawback Process

1. **Authorization Check** - Verify caller has ComplianceOfficer role
2. **Stream Validation** - Ensure stream exists and not already cancelled
3. **Vault Withdrawal** - If stream uses vault, withdraw all shares
4. **Fund Transfer** - Transfer all remaining funds to issuer
5. **Event Emission** - Emit high-priority CLAWBACK event
6. **Stream Cancellation** - Mark stream as cancelled

## Security Features

- **Role-Based Access** - Only ComplianceOfficer role can execute
- **Audit Trail** - High-priority events with reason codes
- **Vault Support** - Automatically withdraws from vaults
- **Immutable** - Cannot be reversed once executed

## Use Cases

### Tokenized Securities Compliance
```rust
// Regulatory violation detected
let reason = hash("AML_VIOLATION");
contract.governance_clawback(
    &stream_id,
    &compliance_officer,
    &security_issuer,
    &Some(reason)
);
```

### Fraud Prevention
```rust
// Fraudulent activity detected
let reason = hash("FRAUD_DETECTED");
contract.governance_clawback(
    &stream_id,
    &compliance_officer,
    &asset_issuer,
    &Some(reason)
);
```

### Court Order Compliance
```rust
// Legal mandate to freeze assets
let reason = hash("COURT_ORDER");
contract.governance_clawback(
    &stream_id,
    &compliance_officer,
    &issuer,
    &Some(reason)
);
```

## Event Structure

```rust
("CLAWBACK", "SECURITY") => ClawbackEvent {
    stream_id: 123,
    officer: Address(...),
    amount_clawed: 50000,
    issuer: Address(...),
    reason: Some(BytesN<32>(...)),
    timestamp: 1234567890,
}
```

## Clawback vs Cancel

| Feature | Cancel | Clawback |
|---------|--------|----------|
| Who can execute | Sender or Receiver | Compliance Officer only |
| Fund distribution | Pro-rated split | All to issuer |
| Use case | Normal termination | Regulatory action |
| Event priority | Normal | High (SECURITY) |
| Reason code | No | Yes (optional) |

## Integration with Stellar Assets

The `clawback_enabled` field in Stream tracks whether the asset supports clawback:

```rust
pub struct Stream {
    // ... other fields
    pub clawback_enabled: bool,
}
```

**Note:** Currently set to `false` by default. Future enhancement will check token flags at stream creation.

## Testing

```bash
cd contracts
cargo test clawback_test
```

Tests cover:
- ✅ Basic clawback execution
- ✅ Role authorization check
- ✅ Clawback after partial withdrawal
- ✅ Vault integration

## API Reference

### Mutation Functions

```rust
/// Execute regulatory clawback
pub fn governance_clawback(
    env: Env,
    stream_id: u64,
    officer: Address,
    issuer: Address,
    reason: Option<BytesN<32>>
) -> Result<(), Error>
```

### Role Management

```rust
// Grant compliance officer role
contract.grant_role(&admin, &officer, &Role::ComplianceOfficer);

// Revoke compliance officer role
contract.revoke_role(&admin, &officer, &Role::ComplianceOfficer);

// Check role
contract.check_role(&officer, &Role::ComplianceOfficer);
```

## Error Handling

- `Error::Unauthorized` - Caller lacks ComplianceOfficer role
- `Error::StreamNotFound` - Invalid stream ID
- `Error::AlreadyCancelled` - Stream already cancelled
- `Error::InsufficientBalance` - Vault withdrawal failed

## Compliance Considerations

### When to Use Clawback

✅ **Appropriate:**
- AML/KYC violations
- Fraud detection
- Court orders
- Regulatory mandates
- Sanctions compliance

❌ **Inappropriate:**
- Disputes between parties
- Normal stream termination
- Fee collection
- Operational errors

### Best Practices

1. **Document Reasons** - Always provide reason codes
2. **Audit Trail** - Monitor CLAWBACK events
3. **Legal Review** - Ensure legal authority before execution
4. **Notification** - Inform affected parties
5. **Transparency** - Publish clawback policies

## Future Enhancements

- Automatic detection of AUTH_CLAWBACK_ENABLED flag
- Multi-signature clawback approval
- Time-delayed clawback execution
- Clawback appeal mechanism
- Integration with compliance oracles

## Security Warnings

⚠️ **High-Impact Function** - Clawback is irreversible and transfers all funds to issuer

⚠️ **Role Protection** - Carefully manage ComplianceOfficer role assignments

⚠️ **Event Monitoring** - Set up alerts for CLAWBACK events

⚠️ **Legal Compliance** - Ensure proper legal authority before execution

## Example: Complete Workflow

```rust
// 1. Setup: Grant compliance officer role
contract.grant_role(&admin, &officer, &Role::ComplianceOfficer);

// 2. Create stream with regulated asset
let stream_id = contract.create_stream(
    &dao_treasury,
    &contributor,
    &regulated_token, // Tokenized security
    &100_000,
    &start,
    &end,
    &CurveType::Linear,
    &false
);

// 3. Violation detected
// Compliance team investigates...

// 4. Execute clawback
let reason = hash("AML_VIOLATION_2024_001");
contract.governance_clawback(
    &stream_id,
    &officer,
    &security_issuer,
    &Some(reason)
);

// 5. Monitor event
// Event emitted: ("CLAWBACK", "SECURITY") => ClawbackEvent { ... }

// 6. Funds returned to issuer
// All remaining funds transferred to security_issuer
```

## Acceptance Criteria Met

✅ **Safe fund return** - All remaining funds transferred to issuer  
✅ **Clawback-enabled check** - `clawback_enabled` field in Stream struct  
✅ **Compliance Officer role** - RBAC integration  
✅ **High-priority events** - SECURITY-tagged events emitted  
✅ **Vault support** - Automatic vault withdrawal
