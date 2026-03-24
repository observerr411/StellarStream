# Multi-Signature Proposal Flow

## State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROPOSAL LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────┘

    create_proposal()
           │
           ▼
    ┌──────────────┐
    │   PENDING    │◄─────────────────────────┐
    │              │                          │
    │ approvers: []│                          │
    │ executed: ❌ │                          │
    └──────────────┘                          │
           │                                  │
           │ approve_proposal()               │
           │ (approver_1)                     │
           ▼                                  │
    ┌──────────────┐                          │
    │   PENDING    │                          │
    │              │                          │
    │ approvers: 1 │                          │
    │ executed: ❌ │                          │
    └──────────────┘                          │
           │                                  │
           │ approve_proposal()               │
           │ (approver_2)                     │
           ▼                                  │
    ┌──────────────┐                          │
    │   PENDING    │                          │
    │              │                          │
    │ approvers: 2 │                          │
    │ executed: ❌ │                          │
    └──────────────┘                          │
           │                                  │
           │ approve_proposal()               │
           │ (approver_M)                     │
           │ [THRESHOLD REACHED]              │
           ▼                                  │
    ┌──────────────┐                          │
    │  EXECUTED    │                          │
    │              │                          │
    │ approvers: M │                          │
    │ executed: ✅ │                          │
    └──────────────┘                          │
           │                                  │
           │ execute_proposal()               │
           │ (automatic)                      │
           ▼                                  │
    ┌──────────────┐                          │
    │    STREAM    │                          │
    │   CREATED    │                          │
    │              │                          │
    │ stream_id: N │                          │
    └──────────────┘                          │
                                              │
                                              │
    ┌──────────────┐                          │
    │   EXPIRED    │──────────────────────────┘
    │              │  (if deadline passed)
    │ executed: ❌ │
    └──────────────┘
```

## Sequence Diagram: 3-of-5 DAO Approval

```
Treasury    Contract    Board1    Board2    Board3    Board4    Board5
   │           │          │         │         │         │         │
   │──create──>│          │         │         │         │         │
   │ proposal  │          │         │         │         │         │
   │           │          │         │         │         │         │
   │           │<─approve─┤         │         │         │         │
   │           │  (1/3)   │         │         │         │         │
   │           │          │         │         │         │         │
   │           │<─────────┴approve──┤         │         │         │
   │           │          (2/3)     │         │         │         │
   │           │          │         │         │         │         │
   │           │<─────────┴─────────┴approve──┤         │         │
   │           │          (3/3) ✅ THRESHOLD  │         │         │
   │           │          │         │         │         │         │
   │<──────────┤          │         │         │         │         │
   │ transfer  │          │         │         │         │         │
   │  tokens   │          │         │         │         │         │
   │           │          │         │         │         │         │
   │           │──────────┴─────────┴─────────┴─────────┴─────────>
   │           │              Stream Created (ID: N)
   │           │
```

## Decision Tree: Approval Logic

```
approve_proposal(proposal_id, approver)
    │
    ├─ Proposal exists?
    │   ├─ NO  → Error::ProposalNotFound
    │   └─ YES → Continue
    │
    ├─ Already executed?
    │   ├─ YES → Error::ProposalAlreadyExecuted
    │   └─ NO  → Continue
    │
    ├─ Deadline passed?
    │   ├─ YES → Error::ProposalExpired
    │   └─ NO  → Continue
    │
    ├─ Already approved by this address?
    │   ├─ YES → Error::AlreadyApproved
    │   └─ NO  → Continue
    │
    ├─ Add approver to list
    │
    ├─ approvers.len() >= required_approvals?
    │   ├─ NO  → Save proposal, return OK
    │   └─ YES → Continue to execution
    │
    ├─ Mark proposal as executed
    │
    ├─ Transfer tokens: sender → contract
    │
    ├─ Create Stream object
    │
    └─ Return OK
```

## Token Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        TOKEN MOVEMENT                           │
└─────────────────────────────────────────────────────────────────┘

BEFORE APPROVAL:
┌──────────────┐
│   Treasury   │  Tokens stay here
│   (Sender)   │  No movement yet
└──────────────┘

DURING APPROVALS (1 to M-1):
┌──────────────┐
│   Treasury   │  Tokens still here
│   (Sender)   │  Waiting for threshold
└──────────────┘

AT THRESHOLD (Mth approval):
┌──────────────┐         ┌──────────────┐
│   Treasury   │────────>│   Contract   │  Atomic transfer
│   (Sender)   │  tokens │   (Escrow)   │
└──────────────┘         └──────────────┘

AFTER STREAM CREATED:
┌──────────────┐         ┌──────────────┐
│   Treasury   │         │   Contract   │  Receiver can withdraw
│   (Sender)   │         │   (Escrow)   │  over time
└──────────────┘         └──────────────┘
                                │
                                │ withdraw()
                                ▼
                         ┌──────────────┐
                         │   Receiver   │
                         └──────────────┘
```

## Comparison: Direct vs Multi-Sig

```
┌─────────────────────────────────────────────────────────────────┐
│                    DIRECT STREAM CREATION                       │
└─────────────────────────────────────────────────────────────────┘

Sender ──create_stream()──> Contract ──> Stream Created
       (1 signature)         (immediate)

┌─────────────────────────────────────────────────────────────────┐
│                  MULTI-SIG STREAM CREATION                      │
└─────────────────────────────────────────────────────────────────┘

Sender ──create_proposal()──> Contract ──> Proposal Pending
       (1 signature)

Admin1 ──approve_proposal()──> Contract ──> Approval 1/M

Admin2 ──approve_proposal()──> Contract ──> Approval 2/M

AdminM ──approve_proposal()──> Contract ──> Stream Created ✅
       (Mth signature)         (automatic)
```

## Use Case Matrix

| Scenario | Method | Threshold | Rationale |
|----------|--------|-----------|-----------|
| Personal payment | `create_stream()` | 1-of-1 | Single owner |
| Small business | `create_proposal()` | 2-of-3 | Owner + CFO |
| Medium company | `create_proposal()` | 3-of-5 | Executive board |
| DAO treasury | `create_proposal()` | 5-of-9 | Decentralized governance |
| Critical ops | `create_proposal()` | 7-of-10 | High security |

## Error Prevention Checklist

```
✅ Proposal Creation
   ├─ start_time < end_time
   ├─ total_amount > 0
   ├─ required_approvals > 0
   └─ deadline > now

✅ Approval
   ├─ Proposal exists
   ├─ Not expired
   ├─ Not executed
   └─ Approver hasn't signed

✅ Execution (automatic)
   ├─ Threshold reached
   ├─ Sender has balance
   └─ Token transfer succeeds
```
