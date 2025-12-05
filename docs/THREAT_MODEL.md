# Threat Model & Attack Analysis

> **TheBlocks - Adversarial-Resilient Settlement Protocol**  
> TriHacker Tournament 2025

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Trust Assumptions](#trust-assumptions)
3. [Attack Categories](#attack-categories)
4. [Attack Vectors & Mitigations](#attack-vectors--mitigations)
5. [Risk Matrix](#risk-matrix)
6. [Defense Mechanisms](#defense-mechanisms)
7. [Stress Testing Scenarios](#stress-testing-scenarios)

---

## System Overview

TheBlocks is a settlement protocol designed to be resilient against adversarial conditions including:
- MEV (Maximal Extractable Value) attacks
- Oracle manipulation
- Front-running
- Reentrancy
- State manipulation

### Core Components
```
┌─────────────────────────────────────────────────────────────────┐
│                    Settlement Protocol                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   FIFO Queue    │  │  State Machine  │  │  Deposit Escrow │  │
│  │  (Fair Order)   │  │   (6 States)    │  │   (Value Lock)  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Oracle Layer                              ││
│  │  ┌──────────────────┐        ┌──────────────────┐           ││
│  │  │    Chainlink     │◄─────►│  Band Protocol   │           ││
│  │  │    (Primary)     │ Cross │   (Fallback)     │           ││
│  │  └──────────────────┘ Verify└──────────────────┘           ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  Invariant Layer                             ││
│  │  [Conservation] [No Double] [Freshness] [Timeout] [Partial] ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Trust Assumptions

### Trusted Components
| Component | Trust Level | Rationale |
|-----------|-------------|-----------|
| Ethereum VM | Full | Execution correctness guaranteed by consensus |
| Block Timestamps | Partial | Miners can manipulate ±15 seconds |
| Chainlink Oracle | High | Decentralized oracle network with reputation |
| Band Protocol | Medium | Secondary oracle for cross-validation |
| Admin Account | Full | Required for emergency operations |

### Untrusted Parties
| Party | Assumed Behavior |
|-------|------------------|
| Settlement Initiators | May attempt to manipulate execution order |
| Recipients | May attempt double-claim or reentrancy |
| Block Producers | May reorder/censor transactions (MEV) |
| External Contracts | May have malicious fallback functions |
| Oracle Data Providers | May provide stale or manipulated data |

---

## Attack Categories

### 1. **Ordering Attacks**
| Attack | Severity | Mitigated |
|--------|----------|-----------|
| Front-running | High | ✅ FIFO Queue |
| Sandwich Attack | High | ✅ FIFO Queue + Confirmation Blocks |
| Transaction Reordering | Medium | ✅ Queue Position Lock |
| Block Stuffing | Low | ⚠️ Partially (timeout mechanism) |

### 2. **Oracle Attacks**
| Attack | Severity | Mitigated |
|--------|----------|-----------|
| Stale Data Injection | High | ✅ Freshness Check (60s max) |
| Single Oracle Manipulation | High | ✅ Dual Oracle Cross-Validation |
| Flash Loan Price Manipulation | High | ✅ Historical Price Deviation Check |
| Oracle Downtime | Medium | ✅ Fallback Oracle + Health Tracking |

### 3. **Smart Contract Attacks**
| Attack | Severity | Mitigated |
|--------|----------|-----------|
| Reentrancy | Critical | ✅ Checks-Effects-Interactions Pattern |
| Integer Overflow | Critical | ✅ Solidity 0.8+ Built-in Protection |
| Unauthorized Access | High | ✅ Role-Based Access Control |
| Gas Griefing | Medium | ✅ Bounded Loops (max 100 transfers) |

### 4. **Economic Attacks**
| Attack | Severity | Mitigated |
|--------|----------|-----------|
| Double Settlement | Critical | ✅ Unique ID + State Machine |
| Griefing (Deposit Lock) | Medium | ✅ Timeout + Refund Mechanism |
| Denial of Service | Medium | ✅ Pause Mechanism + Gas Limits |

---

## Attack Vectors & Mitigations

### AV-001: Front-Running Attack

**Description**: Attacker observes a pending settlement and submits their own with higher gas to execute first.

**Attack Scenario**:
```
1. Alice creates Settlement #5 for 10 ETH
2. Bob sees Alice's pending TX in mempool
3. Bob submits Settlement #6 with higher gas price
4. Miner includes Bob's TX first
5. Bob's settlement processes before Alice's (BAD)
```

**Mitigation**: FIFO Queue with position locking
```solidity
// Settlement can only be initiated if it's next in queue
require(
    settlement.queuePosition == queueHead,
    "Not next in queue"
);
```

**Effectiveness**: ✅ Complete mitigation - queue position is locked at creation time

---

### AV-002: Oracle Price Manipulation

**Description**: Attacker manipulates oracle price through flash loans or market manipulation.

**Attack Scenario**:
```
1. Attacker takes flash loan of 100M USDC
2. Buys massive amount of ETH on DEX
3. Oracle reports artificially high ETH price
4. Settlement executes at manipulated price
5. Attacker returns flash loan with profit
```

**Mitigation**: Multi-layer defense
```solidity
// 1. Dual Oracle Cross-Validation
if (abs(chainlinkPrice - bandPrice) > MAX_DEVIATION) {
    revert("Oracle manipulation detected");
}

// 2. Historical Price Check
if (priceChange > 10% in last 5 readings) {
    revert("Abnormal price movement");
}

// 3. Staleness Check
require(block.timestamp - lastUpdate < MAX_STALENESS);
```

**Effectiveness**: ✅ High - multi-oracle + historical analysis catches most manipulation

---

### AV-003: Reentrancy Attack

**Description**: Malicious recipient contract calls back into settlement during ETH transfer.

**Attack Scenario**:
```
1. Attacker creates settlement with malicious recipient
2. During executeSettlement(), ETH is sent to malicious contract
3. Malicious fallback() calls executeSettlement() again
4. Before state update, attacker drains funds
```

**Mitigation**: Checks-Effects-Interactions Pattern
```solidity
function executeSettlement(uint256 id, uint256 count) external {
    // CHECKS
    require(state == State.INITIATED || state == State.EXECUTING);
    
    // EFFECTS (update state BEFORE external call)
    transfers[i].executed = true;
    settlement.executedTransfers++;
    
    // INTERACTIONS (external call LAST)
    (bool success,) = transfer.to.call{value: transfer.amount}("");
}
```

**Effectiveness**: ✅ Complete - state updated before external calls

---

### AV-004: Double Settlement

**Description**: Same settlement ID processed multiple times.

**Attack Scenario**:
```
1. Settlement #5 executes successfully
2. Attacker calls executeSettlement(5) again
3. Funds transferred twice (BAD)
```

**Mitigation**: State Machine + Executed Flag
```solidity
// State check prevents re-execution
require(
    settlement.state == State.INITIATED || 
    settlement.state == State.EXECUTING,
    "Invalid state for execution"
);

// Individual transfer flag
require(!transfer.executed, "Already executed");
transfer.executed = true;
```

**Effectiveness**: ✅ Complete - multiple layers of protection

---

### AV-005: Griefing Attack

**Description**: Attacker creates settlements without intent to complete, locking queue.

**Attack Scenario**:
```
1. Attacker creates 100 settlements
2. Never deposits funds
3. Queue is blocked, legitimate users cannot proceed
```

**Mitigation**: Timeout + Refund + Auto-Cleanup
```solidity
// Settlements that timeout can be removed from queue
if (block.number > settlement.createdAt + settlement.timeout) {
    settlement.state = State.FAILED;
    // Refund any deposited funds
    refund(settlement);
}
```

**Effectiveness**: ⚠️ Partial - attacker loses gas but can still cause delays

---

## Risk Matrix

| Risk | Likelihood | Impact | Overall | Status |
|------|------------|--------|---------|--------|
| Front-running | High | High | **Critical** | ✅ Mitigated |
| Oracle Manipulation | Medium | Critical | **Critical** | ✅ Mitigated |
| Reentrancy | Low | Critical | **High** | ✅ Mitigated |
| Double Settlement | Low | Critical | **High** | ✅ Mitigated |
| Admin Key Compromise | Low | Critical | **High** | ⚠️ Accepted Risk |
| Block Timestamp Manipulation | Medium | Low | **Medium** | ✅ Mitigated |
| Griefing / DoS | Medium | Medium | **Medium** | ⚠️ Partially Mitigated |
| Gas Exhaustion | Low | Medium | **Low** | ✅ Mitigated |

---

## Defense Mechanisms

### D1: FIFO Queue System
```
Purpose: Guarantee fair execution order
Mechanism: First-come-first-served queue with position locking
Invariant: queuePosition at creation time is immutable
```

### D2: Dual Oracle Architecture
```
Purpose: Resist single-point oracle manipulation
Mechanism: Cross-validate Chainlink and Band Protocol
Invariant: Price deviation > 5% triggers manipulation flag
```

### D3: State Machine Enforcement
```
Purpose: Ensure valid state transitions only
Mechanism: Strict state enum with transition guards
Invariant: No transition from FINALIZED or FAILED
```

### D4: Confirmation Blocks
```
Purpose: Reduce reorganization risk
Mechanism: Wait 3 blocks before execution
Invariant: block.number > initiatedAt + CONFIRMATION_BLOCKS
```

### D5: Emergency Pause
```
Purpose: Stop protocol during attacks
Mechanism: Admin-controlled pause flag
Invariant: When paused, no state-changing operations allowed
```

---

## Stress Testing Scenarios

### Scenario 1: Mass Settlement Creation
```
Test: Create 1000 settlements simultaneously
Expected: Queue handles load, no memory issues
Result: ✅ PASS (bounded by gas limits)
```

### Scenario 2: Oracle Failure
```
Test: Both Chainlink and Band return stale data
Expected: Settlement execution pauses
Result: ✅ PASS (staleness check blocks execution)
```

### Scenario 3: High Gas Environment
```
Test: Gas prices at 500+ Gwei
Expected: Protocol remains functional
Result: ✅ PASS (operations bounded to max 100 transfers)
```

### Scenario 4: Flash Loan Attack Simulation
```
Test: Simulate 100M USDC flash loan price manipulation
Expected: Dual oracle detects price deviation
Result: ✅ PASS (cross-validation catches manipulation)
```

### Scenario 5: Chain Reorganization
```
Test: 2-block reorg after settlement initiation
Expected: Confirmation blocks prevent execution
Result: ✅ PASS (3-block confirmation requirement)
```

---

## Conclusion

TheBlocks Settlement Protocol implements **defense in depth** with multiple layers of protection against adversarial conditions:

1. **Fair Ordering**: FIFO queue prevents MEV attacks
2. **Oracle Resilience**: Dual oracle with cross-validation
3. **State Integrity**: Strict state machine with invariants
4. **Value Safety**: Escrow model with timeout refunds
5. **Emergency Response**: Admin pause capability

**Residual Risks**:
- Admin key compromise (accept and use multisig)
- Extreme griefing attacks (partially mitigated)
- Novel attack vectors (ongoing monitoring required)

---

*Document Version: 1.0*  
*Last Updated: December 2025*  
*Authors: TheBlocks Team*
