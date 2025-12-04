# System Architecture

> **TheBlocks - Adversarial-Resilient Settlement Protocol**  
> TriHacker Tournament 2025

---

## 📋 Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Smart Contract Design](#smart-contract-design)
3. [State Machine](#state-machine)
4. [Data Flow](#data-flow)
5. [Component Interactions](#component-interactions)
6. [Gas Optimization](#gas-optimization)
7. [Upgrade Path](#upgrade-path)

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                            │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SettlementInit   │  │ SettlementMonit  │  │ DisputeInterface │          │
│  │   Component      │  │   Component      │  │   Component      │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │    RainbowKit/Wagmi     │                              │
│                    │    (Wallet Connection)  │                              │
│                    └───────────┬─────────────┘                              │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           BLOCKCHAIN LAYER                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                      SettlementProtocol.sol                        │   │
│   │   ┌─────────────────────────────────────────────────────────────┐  │   │
│   │   │                    Settlement Logic                          │  │   │
│   │   │   • createSettlement()     • executeSettlement()             │  │   │
│   │   │   • deposit()              • disputeSettlement()             │  │   │
│   │   │   • initiateSettlement()   • refundSettlement()              │  │   │
│   │   └─────────────────────────────────────────────────────────────┘  │   │
│   │                               │                                     │   │
│   │               ┌───────────────┴───────────────┐                     │   │
│   │               ▼                               ▼                     │   │
│   │   ┌─────────────────────┐       ┌─────────────────────────┐        │   │
│   │   │ SettlementOracle.sol│       │ SettlementInvariants.sol│        │   │
│   │   │                     │       │                         │        │   │
│   │   │ • getLatestPrice()  │       │ • checkConservation()   │        │   │
│   │   │ • getFallbackPrice()│       │ • checkNoDouble()       │        │   │
│   │   │ • checkManipulation │       │ • checkFreshness()      │        │   │
│   │   └─────────┬───────────┘       │ • checkTimeout()        │        │   │
│   │             │                   │ • checkExecOrder()      │        │   │
│   │             │                   └─────────────────────────┘        │   │
│   └─────────────┼──────────────────────────────────────────────────────┘   │
│                 │                                                          │
│   ┌─────────────┴────────────────────────────────────────────────────┐     │
│   │                      EXTERNAL ORACLES                             │     │
│   │   ┌────────────────────┐        ┌────────────────────┐           │     │
│   │   │ Chainlink Price    │        │ Band Protocol      │           │     │
│   │   │ Feed (Primary)     │        │ (Fallback)         │           │     │
│   │   └────────────────────┘        └────────────────────┘           │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contract Design

### Contract Hierarchy

```
SettlementProtocol
    ├── inherits SettlementOracle
    │       └── contains oracle logic
    └── inherits SettlementInvariants
            └── contains invariant checks
```

### Storage Layout

```solidity
// SettlementProtocol Storage
contract SettlementProtocol {
    // Admin & Control
    address public admin;
    bool public paused;
    
    // Settlement Registry
    mapping(uint256 => Settlement) public settlements;
    mapping(uint256 => Transfer[]) internal settlementTransfers;
    mapping(uint256 => mapping(address => uint256)) public deposits;
    
    // FIFO Queue
    uint256 public queueHead;
    uint256 public queueTail;
    mapping(uint256 => uint256) public settlementQueue;
    
    // Metrics
    uint256 public nextSettlementId;
    uint256 public totalSettledVolume;
}

// SettlementOracle Storage
contract SettlementOracle {
    // Oracle Interfaces
    AggregatorV3Interface public chainlinkOracle;
    IStdReference public bandOracle;
    
    // Health Tracking
    bool public chainlinkHealthy;
    bool public bandHealthy;
    uint256 public chainlinkConsecutiveFails;
    uint256 public bandConsecutiveFails;
    
    // Price History (for manipulation detection)
    uint256[] public priceHistory;
}

// SettlementInvariants Storage
contract SettlementInvariants {
    // Tracking for invariant verification
    mapping(uint256 => bool) internal settledIds;
}
```

### Data Structures

```solidity
enum State {
    PENDING,    // 0: Created, awaiting deposits
    INITIATED,  // 1: Deposits complete, in dispute window
    EXECUTING,  // 2: Transfers in progress (partial finality)
    FINALIZED,  // 3: All transfers complete
    DISPUTED,   // 4: Under dispute review
    FAILED      // 5: Failed (timeout, dispute, etc.)
}

struct Settlement {
    uint256 id;
    address initiator;
    uint256 totalAmount;
    uint256 totalDeposited;
    State state;
    uint256 createdAt;      // Block number
    uint256 initiatedAt;    // Block number when initiated
    uint256 timeout;        // Blocks until timeout
    uint256 queuePosition;  // Position in FIFO queue
    uint256 totalTransfers;
    uint256 executedTransfers;
}

struct Transfer {
    address from;
    address to;
    uint256 amount;
    bool executed;
}
```

---

## State Machine

### State Transition Diagram

```
                           ┌─────────────────┐
                           │    PENDING      │◄────────────────┐
                           │    (State 0)    │                 │
                           └────────┬────────┘                 │
                                    │                          │
                        deposit() + │                          │
                       enough funds │                          │
                                    ▼                          │
                           ┌─────────────────┐                 │
                           │   INITIATED     │     refund()    │
                           │    (State 1)    │─────────────────┤
                           └────────┬────────┘                 │
                                    │                          │
                    ┌───────────────┼───────────────┐          │
                    │               │               │          │
              dispute()        execute()       timeout         │
                    │               │               │          │
                    ▼               ▼               │          │
           ┌────────────┐  ┌─────────────────┐     │          │
           │  DISPUTED  │  │   EXECUTING     │     │          │
           │  (State 4) │  │    (State 2)    │     │          │
           └─────┬──────┘  └────────┬────────┘     │          │
                 │                  │               │          │
                 │          execute()│              │          │
                 │         (all done)│              │          │
                 │                  ▼               │          │
                 │         ┌─────────────────┐     │          │
                 │         │   FINALIZED     │     │          │
                 │         │    (State 3)    │     │          │
                 │         └─────────────────┘     │          │
                 │                                  │          │
                 └────────────────┬─────────────────┘          │
                                  │                            │
                                  ▼                            │
                           ┌─────────────────┐                 │
                           │     FAILED      │─────────────────┘
                           │    (State 5)    │   refund() available
                           └─────────────────┘
```

### State Transition Rules

| From State | To State | Trigger | Conditions |
|------------|----------|---------|------------|
| PENDING | INITIATED | `initiateSettlement()` | Deposits ≥ Total Amount, Queue Position = Head |
| PENDING | FAILED | Timeout | Block > CreatedAt + Timeout |
| INITIATED | EXECUTING | `executeSettlement()` | Block > InitiatedAt + CONFIRMATION_BLOCKS |
| INITIATED | DISPUTED | `disputeSettlement()` | Block ≤ InitiatedAt + DISPUTE_PERIOD |
| EXECUTING | FINALIZED | `executeSettlement()` | ExecutedTransfers = TotalTransfers |
| DISPUTED | FAILED | Admin Resolution | Dispute found valid |
| FAILED | PENDING | N/A | Never (terminal state for refund) |

---

## Data Flow

### Settlement Lifecycle

```
                    User Action                  Contract State
                         │                             │
    1. Create ──────────►│◄── createSettlement() ──────│──► Settlement stored
                         │                             │    Queue position assigned
                         │                             │
    2. Deposit ─────────►│◄── deposit() ───────────────│──► ETH locked in contract
                         │                             │    Deposit tracked
                         │                             │
    3. Initiate ────────►│◄── initiateSettlement() ────│──► State = INITIATED
                         │                             │    Queue head advances
                         │                             │
    4. Wait ─────────────│    (Confirmation blocks)    │    (No change)
                         │                             │
    5. Execute ─────────►│◄── executeSettlement() ─────│──► Transfers executed
                         │                             │    State = EXECUTING/FINALIZED
                         │                             │
    6. Complete ─────────│    (All transfers done)     │──► State = FINALIZED
                         │                             │    Volume tracked
```

### Oracle Data Flow

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Chainlink   │         │    Band      │         │   Contract   │
│    Node      │         │   Relayer    │         │    Oracle    │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ latestRoundData()      │ getReferenceData()     │
       │◄───────────────────────┼────────────────────────┤
       │                        │                        │
       ├────────────────────────►                        │
       │     (price, timestamp) │                        │
       │                        ├────────────────────────►
       │                        │     (rate, timestamp)  │
       │                        │                        │
       │                        │        ┌───────────────┤
       │                        │        │ Cross-Validate│
       │                        │        │ Check Stale   │
       │                        │        │ Track History │
       │                        │        └───────────────┤
       │                        │                        │
       │                        │        Return final    │
       │                        │        price or revert │
       │                        │◄───────────────────────┤
```

---

## Component Interactions

### Function Call Graph

```
                          ┌────────────────────────────┐
                          │      User/Frontend         │
                          └─────────────┬──────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│createSettlement │          │    deposit()    │          │initiateSettle   │
│                 │          │                 │          │   ment()        │
├─────────────────┤          ├─────────────────┤          ├─────────────────┤
│• Validate input │          │• Check state    │          │• Check queue    │
│• Calculate hash │          │• Accept ETH     │          │• Verify deposits│
│• Assign queue   │          │• Track deposit  │          │• Update state   │
│• Emit event     │          │• Emit event     │          │• Advance queue  │
└─────────────────┘          └─────────────────┘          └────────┬────────┘
                                                                   │
                                        ┌──────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│executeSettlement│          │disputeSettlement│          │ refundSettle    │
│                 │          │                 │          │    ment()       │
├─────────────────┤          ├─────────────────┤          ├─────────────────┤
│• Verify confirm │          │• Check window   │          │• Check timeout  │
│• Check oracle   │◄─────────│• Record dispute │          │• Calculate amt  │
│• Execute n txs  │          │• Update state   │          │• Transfer back  │
│• Update partial │          │• Emit event     │          │• Update state   │
└────────┬────────┘          └─────────────────┘          └─────────────────┘
         │
         │ (calls oracle & invariants)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Internal Calls                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────────┐              ┌──────────────────────┐        │
│   │   SettlementOracle   │              │ SettlementInvariants │        │
│   ├──────────────────────┤              ├──────────────────────┤        │
│   │• getLatestPrice()    │              │• verifyAllInvariants │        │
│   │• checkManipulation() │              │  ()                  │        │
│   │• recordPrice()       │              │                      │        │
│   └──────────────────────┘              └──────────────────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Gas Optimization

### Optimization Strategies

| Strategy | Implementation | Gas Saved |
|----------|----------------|-----------|
| Packed Storage | State enum as uint8 in struct | ~2,100 per SSTORE |
| Short-Circuit Checks | Cheapest checks first | Variable |
| Bounded Loops | Max 100 transfers per execute | Prevents OOG |
| Memory vs Storage | Read structs to memory | ~100 per SLOAD |
| Event-Only Metadata | Non-critical data in events | ~5,000+ per field |

### Gas Estimates

| Function | Estimated Gas | Notes |
|----------|---------------|-------|
| createSettlement (1 transfer) | ~150,000 | New storage + queue |
| createSettlement (100 transfers) | ~2,500,000 | Max capacity |
| deposit | ~50,000 | Update mapping |
| initiateSettlement | ~80,000 | State change + queue |
| executeSettlement (1 transfer) | ~70,000 | ETH transfer + state |
| executeSettlement (10 transfers) | ~350,000 | Batch execution |
| disputeSettlement | ~60,000 | State change + event |

---

## Upgrade Path

### Current: Immutable Contracts

The current implementation uses **immutable contracts** for maximum trust and security during the hackathon. No proxy patterns are used.

### Future Considerations

```
Phase 1 (Hackathon): Immutable
├── Full transparency
├── No upgrade risk
└── Simpler auditing

Phase 2 (Production): UUPS Proxy (Optional)
├── TransparentUpgradeableProxy pattern
├── Timelock for upgrades (48h minimum)
├── Multi-sig required for upgrade
└── Emergency upgrade path for critical fixes
```

### Upgrade-Safe Storage

If upgrading is needed in the future, the storage layout is designed to be compatible:

```solidity
// Gap for future storage
uint256[50] private __gap;
```

---

## Network Deployment

### Supported Networks

| Network | Chain ID | Oracle Addresses | Status |
|---------|----------|------------------|--------|
| Localhost | 31337 | Mock addresses | ✅ Dev |
| Sepolia | 11155111 | Sepolia Chainlink | ✅ Test |
| Mainnet | 1 | Mainnet Chainlink | 🔄 Planned |
| Polygon | 137 | Polygon Chainlink | 🔄 Planned |

### Deployment Checklist

- [ ] Deploy SettlementProtocol with oracle addresses
- [ ] Verify contract on Etherscan
- [ ] Test all functions on testnet
- [ ] Configure frontend with deployed address
- [ ] Update deployedContracts.ts

---

*Document Version: 1.0*  
*Last Updated: December 2025*  
*Authors: TheBlocks Team*
