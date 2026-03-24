# Multi-Signature Stream Proposals

## Overview
The multi-signature proposal system allows organizations (DAOs, corporations) to require multiple approvals before initiating large payment streams. This prevents unilateral control and adds governance to stream creation.

## Architecture

### Data Structures

**StreamProposal**
```rust
pub struct StreamProposal {
    pub sender: Address,           // Treasury/source account
    pub receiver: Address,          // Stream recipient
    pub token: Address,             // Token contract address
    pub total_amount: i128,         // Total stream amount
    pub start_time: u64,            // Stream start timestamp
    pub end_time: u64,              // Stream end timestamp
    pub approvers: Vec<Address>,    // List of addresses that approved
    pub required_approvals: u32,    // M-of-N threshold
    pub deadline: u64,              // Proposal expiry timestamp
    pub executed: bool,             // Whether stream was created
}
```

## Workflow

### 1. Create Proposal
```rust
create_proposal(
    sender: Address,
    receiver: Address,
    token: Address,
    total_amount: i128,
    start_time: u64,
    end_time: u64,
    required_approvals: u32,  // e.g., 3 for 3-of-5 multisig
    deadline: u64              // Unix timestamp
) -> Result<u64, Error>
```

**Validations:**
- `start_time < end_time`
- `total_amount > 0`
- `required_approvals > 0`
- `deadline > current_time`
- Sender must authenticate

**Returns:** Proposal ID

### 2. Approve Proposal
```rust
approve_proposal(
    proposal_id: u64,
    approver: Address
) -> Result<(), Error>
```

**Validations:**
- Proposal exists
- Not already executed
- Not expired (current_time <= deadline)
- Approver hasn't already approved
- Approver must authenticate

**Behavior:**
- Adds approver to the list
- If `approvers.len() >= required_approvals`:
  - Marks proposal as executed
  - Transfers tokens from sender to contract
  - Creates the stream
  - Returns stream ID

### 3. Query Proposal
```rust
get_proposal(proposal_id: u64) -> Result<StreamProposal, Error>
```

## Security Features

### 1. No Double Approval
Each address can only approve once. Duplicate approvals are rejected with `Error::AlreadyApproved`.

### 2. Expiry Mechanism
Proposals have a `deadline` timestamp. After expiry:
- No new approvals accepted
- Prevents stale proposals from consuming storage
- Allows re-creation with updated parameters

### 3. Atomic Execution
Token transfer and stream creation happen atomically when threshold is met. No partial states.

### 4. Token Safety
Tokens are only pulled from the treasury upon final activation, not during proposal creation.

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 8 | ProposalNotFound | Invalid proposal ID |
| 9 | ProposalExpired | Current time > deadline |
| 10 | AlreadyApproved | Approver already signed |
| 11 | ProposalAlreadyExecuted | Stream already created |
| 12 | InvalidApprovalThreshold | required_approvals = 0 |

## Usage Examples

### DAO Treasury Payment (3-of-5 Multisig)
```rust
// Step 1: Finance team creates proposal
let proposal_id = contract.create_proposal(
    dao_treasury,
    contractor,
    usdc_token,
    50_000_0000000,  // 50,000 USDC
    start_time,
    end_time,
    3,               // Requires 3 approvals
    deadline
);

// Step 2: Board members approve
contract.approve_proposal(proposal_id, board_member_1);
contract.approve_proposal(proposal_id, board_member_2);
contract.approve_proposal(proposal_id, board_member_3);  // Stream auto-created
```

### Corporate Payroll (2-of-3 Multisig)
```rust
let proposal_id = contract.create_proposal(
    company_wallet,
    employee,
    usdc_token,
    10_000_0000000,  // 10,000 USDC monthly
    start_time,
    end_time,
    2,               // Requires 2 approvals (HR + Finance)
    deadline
);

contract.approve_proposal(proposal_id, hr_manager);
contract.approve_proposal(proposal_id, cfo);  // Stream activated
```

## Integration with Existing Streams

The proposal system is **optional**. Organizations can choose:

1. **Direct Stream Creation** (existing): `create_stream()` - immediate, single-signature
2. **Proposal-Based Creation** (new): `create_proposal()` + `approve_proposal()` - multi-signature

Both paths result in identical `Stream` objects with the same withdrawal and cancellation logic.

## Gas Optimization

- Approver list stored as `Vec<Address>` (efficient for M < 10)
- Proposal data removed after execution (optional cleanup function can be added)
- No loops in approval logic (O(n) check for duplicates where n = current approvers)

## Future Enhancements

1. **Role-Based Approvals**: Require specific roles (e.g., CFO + 2 board members)
2. **Weighted Voting**: Different approval weights per address
3. **Proposal Cancellation**: Allow creator to cancel before execution
4. **Batch Proposals**: Create multiple streams in one proposal
