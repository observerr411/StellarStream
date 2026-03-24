# Multi-Sig Proposal Quick Reference

## API Functions

### Create Proposal
```rust
create_proposal(
    env: Env,
    sender: Address,           // Treasury account
    receiver: Address,         // Payment recipient
    token: Address,            // Token contract
    total_amount: i128,        // Total stream amount
    start_time: u64,           // Stream start (unix timestamp)
    end_time: u64,             // Stream end (unix timestamp)
    required_approvals: u32,   // M in M-of-N multisig
    deadline: u64              // Proposal expiry (unix timestamp)
) -> Result<u64, Error>        // Returns proposal_id
```

### Approve Proposal
```rust
approve_proposal(
    env: Env,
    proposal_id: u64,
    approver: Address
) -> Result<(), Error>
```
**Note:** Auto-executes stream when threshold reached.

### Query Proposal
```rust
get_proposal(
    env: Env,
    proposal_id: u64
) -> Result<StreamProposal, Error>
```

### Direct Stream (No Multisig)
```rust
create_stream(
    env: Env,
    sender: Address,
    receiver: Address,
    token: Address,
    total_amount: i128,
    start_time: u64,
    end_time: u64
) -> Result<u64, Error>        // Returns stream_id
```

## Common Patterns

### 2-of-3 Multisig (Small Team)
```rust
let proposal_id = contract.create_proposal(
    company_wallet, employee, usdc, 10_000_0000000,
    start, end, 2, deadline  // 2 approvals required
);
contract.approve_proposal(proposal_id, hr_manager);
contract.approve_proposal(proposal_id, cfo);  // ✅ Executes
```

### 3-of-5 Multisig (DAO)
```rust
let proposal_id = contract.create_proposal(
    dao_treasury, contractor, usdc, 50_000_0000000,
    start, end, 3, deadline  // 3 approvals required
);
contract.approve_proposal(proposal_id, board_member_1);
contract.approve_proposal(proposal_id, board_member_2);
contract.approve_proposal(proposal_id, board_member_3);  // ✅ Executes
```

## Error Codes

| Code | Error | Fix |
|------|-------|-----|
| 2 | InvalidTimeRange | Ensure start_time < end_time |
| 3 | InvalidAmount | Use total_amount > 0 |
| 8 | ProposalNotFound | Check proposal_id exists |
| 9 | ProposalExpired | Create new proposal with later deadline |
| 10 | AlreadyApproved | Each address can only approve once |
| 11 | ProposalAlreadyExecuted | Proposal already created stream |
| 12 | InvalidApprovalThreshold | Use required_approvals > 0 |

## Validation Checklist

Before creating proposal:
- [ ] `start_time < end_time`
- [ ] `total_amount > 0`
- [ ] `required_approvals > 0`
- [ ] `deadline > current_time`
- [ ] Sender has sufficient token balance
- [ ] Sender has approved token spending

## Testing

```bash
# Run all tests
cd contracts && cargo test

# Run specific test
cargo test test_three_of_five_multisig

# Run with output
cargo test -- --nocapture
```

## Storage Keys

- Proposals: `(PROPOSAL_COUNT, proposal_id)`
- Streams: `(STREAM_COUNT, stream_id)`
- Counters: `PROPOSAL_COUNT`, `STREAM_COUNT`

## Gas Considerations

- Proposal creation: ~5k operations
- Each approval: ~3k operations
- Final approval (execution): ~10k operations (includes token transfer + stream creation)

For M-of-N multisig:
- Total gas ≈ 5k + (M × 3k) + 10k operations
- Example: 3-of-5 = 5k + 9k + 10k = 24k operations
