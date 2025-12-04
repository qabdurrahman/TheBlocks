# Protocol Invariants

> **TheBlocks - Adversarial-Resilient Settlement Protocol**  
> TriHacker Tournament 2025

---

## 📋 Overview

This document formally specifies the **5 core invariants** that the Settlement Protocol enforces at runtime. These invariants are critical for maintaining protocol correctness and security under adversarial conditions.

---

## Invariant Summary

| # | Invariant | Purpose | Check Frequency |
|---|-----------|---------|-----------------|
| I1 | Conservation of Value | No value creation or destruction | Every execution |
| I2 | No Double Settlement | Prevent replay attacks | Every execution |
| I3 | Oracle Freshness | Reject stale price data | Every price fetch |
| I4 | Timeout & Liveness | Guarantee eventual termination | State transitions |
| I5 | Partial Finality Continuity | Monotonic execution progress | Every execution |

---

## I1: Conservation of Value

### Formal Definition

```
∀ settlement s:
    Σ(deposits[s]) = Σ(executed_transfers[s]) + remaining_balance[s]
```

### Natural Language

**The total value deposited into a settlement must always equal the sum of executed transfers plus any remaining (unexecuted) balance.**

### Implementation

```solidity
function checkConservationOfValue(
    uint256 settlementId,
    uint256 totalDeposited,
    uint256 executedAmount,
    uint256 remainingBalance
) internal pure returns (bool, string memory) {
    if (totalDeposited != executedAmount + remainingBalance) {
        return (false, "Conservation of value violated");
    }
    return (true, "");
}
```

### When Checked

- After each `executeSettlement()` call
- Before `refundSettlement()` calculation
- At settlement finalization

### Attack Prevented

- Value creation (minting ETH out of thin air)
- Value destruction (burning deposited ETH)
- Accounting errors in partial execution

### Example Scenario

```
Initial:
  - totalDeposited = 10 ETH
  - executedAmount = 0
  - remainingBalance = 10 ETH
  ✅ 10 = 0 + 10 (VALID)

After executing 3 ETH transfer:
  - totalDeposited = 10 ETH
  - executedAmount = 3 ETH
  - remainingBalance = 7 ETH
  ✅ 10 = 3 + 7 (VALID)

Attempted attack (create value):
  - executedAmount = 15 ETH
  - remainingBalance = 0 ETH
  ❌ 10 ≠ 15 + 0 (INVARIANT VIOLATION - BLOCKED)
```

---

## I2: No Double Settlement

### Formal Definition

```
∀ settlement s, ∀ time t1, t2 where t1 < t2:
    if executed(s, t1) then ¬can_execute(s, t2)

∀ transfer tr in settlement s:
    count(executions(tr)) ≤ 1
```

### Natural Language

**A settlement ID can only be executed once. Each individual transfer within a settlement can only be marked executed once.**

### Implementation

```solidity
// Settlement-level protection
mapping(uint256 => bool) internal settledIds;

function checkNoDoubleSettlement(uint256 settlementId) 
    internal view returns (bool, string memory) 
{
    if (settledIds[settlementId]) {
        return (false, "Settlement already processed");
    }
    return (true, "");
}

// Transfer-level protection
struct Transfer {
    address from;
    address to;
    uint256 amount;
    bool executed;  // ← Prevents double execution
}

// During execution:
require(!transfer.executed, "Transfer already executed");
transfer.executed = true;
```

### When Checked

- At the start of `executeSettlement()`
- Before each individual transfer execution
- Before marking settlement as FINALIZED

### Attack Prevented

- Replay attacks
- Double-spending from the same settlement
- Re-execution after failure/dispute

### Example Scenario

```
Settlement #42:
  - State: INITIATED
  - Transfers: [Alice→Bob: 5 ETH, Alice→Charlie: 3 ETH]

First execution call:
  ✅ settledIds[42] = false → allowed
  Execute transfer 0: executed = true
  Execute transfer 1: executed = true
  settledIds[42] = true

Attack attempt (second execution):
  ❌ settledIds[42] = true → BLOCKED
  ❌ transfer[0].executed = true → BLOCKED
```

---

## I3: Oracle Freshness

### Formal Definition

```
∀ oracle_reading r at time t:
    (current_block.timestamp - r.timestamp) ≤ MAX_ORACLE_STALENESS

where MAX_ORACLE_STALENESS = 60 seconds
```

### Natural Language

**Any oracle price data used for settlement execution must have been updated within the last 60 seconds.**

### Implementation

```solidity
uint256 public constant MAX_ORACLE_STALENESS = 60; // seconds

function checkOracleFreshness(
    uint256 oracleTimestamp
) internal view returns (bool, string memory) {
    if (block.timestamp > oracleTimestamp + MAX_ORACLE_STALENESS) {
        return (false, "Oracle data is stale");
    }
    return (true, "");
}

// In getLatestPrice():
(, int256 price, , uint256 updatedAt, ) = chainlinkOracle.latestRoundData();

(bool fresh, string memory reason) = checkOracleFreshness(updatedAt);
require(fresh, reason);
```

### When Checked

- Every call to `getLatestPrice()`
- Before any price-dependent execution
- Oracle health monitoring

### Attack Prevented

- Stale price manipulation
- Oracle downtime exploitation
- Historical price replay

### Example Scenario

```
Current block.timestamp: 1700000000

Oracle reading 1:
  - updatedAt: 1699999950 (50 seconds ago)
  - staleness: 50 seconds
  ✅ 50 ≤ 60 (VALID - data is fresh)

Oracle reading 2:
  - updatedAt: 1699999900 (100 seconds ago)
  - staleness: 100 seconds
  ❌ 100 > 60 (INVARIANT VIOLATION - data too old)
```

---

## I4: Timeout & Liveness

### Formal Definition

```
∀ settlement s:
    if current_block > s.createdAt + s.timeout AND s.state ∈ {PENDING, INITIATED}:
        can_refund(s) = true
        
∀ settlement s in queue:
    eventually(s.state ∈ {FINALIZED, FAILED, DISPUTED})
```

### Natural Language

**Every settlement must eventually reach a terminal state. Settlements that exceed their timeout can be refunded, ensuring funds are never permanently locked.**

### Implementation

```solidity
uint256 public constant DEFAULT_TIMEOUT = 1000; // blocks

function checkTimeout(
    uint256 createdAt,
    uint256 timeout
) internal view returns (bool, string memory) {
    uint256 effectiveTimeout = timeout == 0 ? DEFAULT_TIMEOUT : timeout;
    
    if (block.number > createdAt + effectiveTimeout) {
        return (false, "Settlement has timed out");
    }
    return (true, "");
}

function refundSettlement(uint256 id) external {
    Settlement storage settlement = settlements[id];
    
    // Allow refund if timed out or failed
    if (settlement.state != State.FAILED) {
        (bool timedOut, ) = checkTimeout(
            settlement.createdAt, 
            settlement.timeout
        );
        require(!timedOut, "Cannot refund yet");
    }
    
    // Process refund...
}
```

### When Checked

- In `refundSettlement()` to allow timeout refunds
- In `initiateSettlement()` to reject expired settlements
- During state transition validations

### Attack Prevented

- Griefing attacks (locking queue indefinitely)
- Funds trapped in abandoned settlements
- Denial of service via queue blocking

### Example Scenario

```
Settlement #99:
  - createdAt: block 1000
  - timeout: 500 blocks
  - Deadline: block 1500

At block 1200:
  ✅ 1200 < 1500 → Settlement still valid
  ❌ Cannot refund yet

At block 1600:
  ❌ 1600 > 1500 → Settlement timed out
  ✅ Refund allowed → Funds returned to depositors
  Settlement state → FAILED
```

---

## I5: Partial Finality Continuity

### Formal Definition

```
∀ settlement s, ∀ time t1, t2 where t1 < t2:
    executedTransfers(s, t2) ≥ executedTransfers(s, t1)

∀ settlement s:
    executedTransfers(s) ≤ totalTransfers(s)
    
∀ transfer tr in settlement s:
    once tr.executed = true, always tr.executed = true
```

### Natural Language

**The count of executed transfers can only increase, never decrease. Once a transfer is marked executed, it remains executed. Execution progress is monotonically increasing.**

### Implementation

```solidity
function checkExecutionOrder(
    uint256 currentExecuted,
    uint256 previousExecuted,
    uint256 total
) internal pure returns (bool, string memory) {
    // Monotonic increase
    if (currentExecuted < previousExecuted) {
        return (false, "Execution count cannot decrease");
    }
    
    // Upper bound
    if (currentExecuted > total) {
        return (false, "Executed count exceeds total");
    }
    
    return (true, "");
}

// During execution:
function executeSettlement(uint256 id, uint256 count) external {
    Settlement storage settlement = settlements[id];
    
    uint256 previousExecuted = settlement.executedTransfers;
    
    // Execute transfers...
    
    // Verify monotonic progress
    (bool valid, string memory reason) = checkExecutionOrder(
        settlement.executedTransfers,
        previousExecuted,
        settlement.totalTransfers
    );
    require(valid, reason);
}
```

### When Checked

- After each batch of transfers in `executeSettlement()`
- State transition from EXECUTING to FINALIZED
- Invariant verification calls

### Attack Prevented

- Execution rollback attacks
- Transfer count manipulation
- Partial finality guarantees violated

### Example Scenario

```
Settlement #77 with 10 transfers:

State progression:
  Block 100: executedTransfers = 0  ✅ (initial)
  Block 101: executedTransfers = 3  ✅ (3 > 0, monotonic)
  Block 102: executedTransfers = 7  ✅ (7 > 3, monotonic)
  Block 103: executedTransfers = 10 ✅ (10 > 7, complete)
  
  → State = FINALIZED (executedTransfers = totalTransfers)

Attack attempt (rollback):
  Current: executedTransfers = 7
  Attempted: executedTransfers = 5
  ❌ 5 < 7 (INVARIANT VIOLATION - cannot decrease)
```

---

## Invariant Verification Function

### Complete Verification

```solidity
function verifyAllInvariants(
    uint256 settlementId,
    uint256 totalDeposited,
    uint256 executedAmount,
    uint256 remainingBalance,
    uint256 oracleTimestamp,
    uint256 createdAt,
    uint256 timeout,
    uint256 currentExecuted,
    uint256 previousExecuted,
    uint256 totalTransfers
) public view returns (bool allValid, string memory firstFailure) {
    
    // I1: Conservation of Value
    (bool i1, string memory r1) = checkConservationOfValue(
        settlementId, totalDeposited, executedAmount, remainingBalance
    );
    if (!i1) return (false, r1);
    
    // I2: No Double Settlement
    (bool i2, string memory r2) = checkNoDoubleSettlement(settlementId);
    if (!i2) return (false, r2);
    
    // I3: Oracle Freshness
    (bool i3, string memory r3) = checkOracleFreshness(oracleTimestamp);
    if (!i3) return (false, r3);
    
    // I4: Timeout & Liveness
    (bool i4, string memory r4) = checkTimeout(createdAt, timeout);
    if (!i4) return (false, r4);
    
    // I5: Partial Finality Continuity
    (bool i5, string memory r5) = checkExecutionOrder(
        currentExecuted, previousExecuted, totalTransfers
    );
    if (!i5) return (false, r5);
    
    return (true, "All invariants satisfied");
}
```

---

## Invariant Testing Matrix

| Invariant | Unit Tests | Integration Tests | Fuzzing | Formal Verification |
|-----------|------------|-------------------|---------|---------------------|
| I1: Conservation | ✅ 5 tests | ✅ 3 tests | ✅ Echidna | 🔄 Planned |
| I2: No Double | ✅ 4 tests | ✅ 2 tests | ✅ Echidna | 🔄 Planned |
| I3: Freshness | ✅ 3 tests | ✅ 2 tests | N/A | ✅ Simple |
| I4: Timeout | ✅ 4 tests | ✅ 3 tests | ✅ Echidna | 🔄 Planned |
| I5: Partial | ✅ 5 tests | ✅ 3 tests | ✅ Echidna | 🔄 Planned |

---

## Invariant Failure Responses

| Invariant | On Violation | Recovery Action |
|-----------|--------------|-----------------|
| I1 | Revert transaction | Review deposit/execution logic |
| I2 | Revert transaction | Settlement already complete |
| I3 | Revert transaction | Wait for oracle update |
| I4 | Allow refund | Users reclaim funds |
| I5 | Revert transaction | Review execution logic |

---

*Document Version: 1.0*  
*Last Updated: December 2025*  
*Authors: TheBlocks Team*
