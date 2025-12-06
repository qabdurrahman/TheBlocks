# the residency 
# TriHacker Tournament

## Finale Hackathon Intro
- **Duration:** 36 Hours (Dec. 4th noon - Dec. 5th Midnight)
- **Use Scaffold-ETH to build your project**  
  https://github.com/scaffold-eth/scaffold-eth-2
- **Tech Focus:** Secure Settlement & State Machine Architecture

## Hackathon Problem Statement
**Theme:** Design and implement an adversarial-resilient settlement protocol that processes trades or rights transfers on-chain under the following constraints:

### Required System Behaviors:
1) **Fair Ordering** - Settlement cannot depend on validator ordering
2) **Invariant enforcement** - Define, then prove 3-5 core invariants
3) **Partial finality logic** - Settlement occurs across multiple blocks
4) **Oracle manipulation resistance** - Dispute and correction mechanic
5) **Attack model clarity** - Define adversary capabilities and defend them

## Rubric / Point System

| Category | Points | What Judges Are Looking For |
|----------|--------|----------------------------|
| **Protocol Architecture** | 30 | Clear state machine, strong invariants, understanding of partial finality and ordering assumptions, clean systems boundaries |
| **Adversarial Resilience** | 25 | Quality of threat model, MEV-aware ordering mechanism, Oracle manipulation defense |
| **Correctness under stress** | 20 | Handling of partial settlements, idempotence (no-double settlement), reorg safety assumptions, timeouts, liveness guarantees |
| **Implementation quality** | 15 | Clean solidity, correct encoding of state machine logic, no pointless features |
| **Demo Day Presentation** | 10 | Clear communication, ability to justify architecture, response to judge's questions |

---

# 🏆 THE BLOCKS - Championship Implementation

## Executive Summary

**TheBlocks** is a championship-grade adversarial-resilient settlement protocol featuring:

- **5-Oracle BFT Aggregation System** (Chainlink, Pyth, Redstone, DIA, Uniswap TWAP)
- **3-Layer Fair Ordering Stack** (MEV-resistant, censorship-resistant)
- **4-Layer Partial Finality Model** (BFT quorum-based)
- **5 Core Invariants** with comprehensive verification
- **7 Named Threat Actor Defense**

**Test Results:** 427 tests passing ✅

---

## 🌐 5-Oracle BFT Aggregation Architecture

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    5-ORACLE BFT AGGREGATION ARCHITECTURE                       ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           ║
║   │Chainlink│  │  Pyth   │  │Redstone │  │   DIA   │  │Uniswap  │           ║
║   │  PUSH   │  │  PULL   │  │  PULL   │  │  PUSH   │  │  TWAP   │           ║
║   │   95%   │  │   90%   │  │   85%   │  │   80%   │  │   75%   │           ║
║   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           ║
║        │            │            │            │            │                 ║
║        v            v            v            v            v                 ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │              ORACLE ADAPTER LAYER (Normalized to 8 decimals)         │   ║
║   │  • Per-oracle staleness thresholds (60s - 3600s)                     │   ║
║   │  • Confidence scoring (freshness × reliability)                      │   ║
║   │  • Failure tracking and auto-disable after 3 failures                │   ║
║   └───────────────────────────────┬─────────────────────────────────────┘   ║
║                                   │                                         ║
║                                   v                                         ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │              BFT AGGREGATION ENGINE                                  │   ║
║   │  • Byzantine median: tolerates 2 of 5 corrupt oracles               │   ║
║   │  • Outlier detection (>2% from median → excluded)                   │   ║
║   │  • Confidence-weighted final price                                   │   ║
║   └───────────────────────────────┬─────────────────────────────────────┘   ║
║                                   │                                         ║
║                                   v                                         ║
║   ┌─────────────────────────────────────────────────────────────────────┐   ║
║   │              CIRCUIT BREAKER + FALLBACK CASCADE                      │   ║
║   │  Level 1: >5% cross-oracle deviation → ELEVATED                      │   ║
║   │  Level 2: >20% deviation → CRITICAL (pause settlements)              │   ║
║   │  Level 3: >3 oracles fail → weighted remaining oracles               │   ║
║   │  Level 4: All external fail → TWAP-only mode                         │   ║
║   │  Level 5: Total failure → EMERGENCY (settlement pause)               │   ║
║   └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Oracle Configurations (Sepolia Testnet)

| Oracle | Address | Model | Staleness | Reliability |
|--------|---------|-------|-----------|-------------|
| Chainlink ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | Push | 1 hour | 95% |
| Pyth Network | `0xDd24F84d36BF92C65F92307595335bdFab5Bbd21` | Pull | 60 sec | 90% |
| Redstone | Multi-sig calldata | Pull | 60 sec | 85% |
| DIA | `0xa93546947f3015c986695750b8bbEa8e26D65856` | Push | 2 min | 80% |
| Uniswap V3 TWAP | Pool address | On-chain | 30 min | 75% |

---

## 📊 Smart Contract Architecture

| Contract | Purpose | Lines | Gas |
|----------|---------|-------|-----|
| `SettlementProtocol.sol` | Main protocol + state machine | 1,200+ | 11.1M |
| `MultiOracleAggregator.sol` | 5-oracle BFT engine | 900+ | 3.8M |
| `SettlementOracle.sol` | Oracle integration layer | 850+ | 2.1M |
| `MEVResistance.sol` | Commit-reveal + access control | 400+ | - |
| `FairOrderingStack.sol` | 3-layer fair ordering | 300+ | - |
| `FinalityController.sol` | 4-layer BFT finality | 250+ | - |
| `SettlementInvariants.sol` | 5 invariants verification | 400+ | - |
| `RedstoneAdapter.sol` | Redstone calldata adapter | 200+ | - |

---

## 🚨 ADVERSARIAL ORACLE CONDITION (NEW CONSTRAINT)

**The protocol's external data feed (oracle) may behave adversarially:**

| Condition | Attack Vector | Our Defense | Code Location |
|-----------|---------------|-------------|---------------|
| **1) Values incorrect by 30%** | Oracle reports manipulated prices | Byzantine median + 5% deviation threshold + outlier exclusion | `MultiOracleAggregator.sol:750-780` |
| **2) Outdated data** | Oracle provides stale prices | Per-oracle staleness: Pyth 60s, DIA 2min, Chainlink 1hr | `MultiOracleAggregator.sol:420-425` |
| **3) Missed updates** | Oracle fails to update entirely | Fail tracking (3 failures = disabled) + fallback cascade | `MultiOracleAggregator.sol:730-740` |
| **4) Conflicting values** | Multiple oracles disagree | Byzantine median from 5 oracles (tolerates 2 corrupt) | `MultiOracleAggregator.sol:790-800` |

### Defense Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ADVERSARIAL ORACLE DEFENSE LAYERS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: STALENESS VALIDATION                                              │
│  ├── Pyth: 60 second max age                                               │
│  ├── DIA: 120 second max age                                               │
│  └── Chainlink: 3600 second max age                                        │
│                                                                             │
│  Layer 2: DEVIATION DETECTION                                               │
│  ├── 5% max cross-oracle deviation → ELEVATED alert                        │
│  ├── 20% deviation → CRITICAL circuit breaker                              │
│  └── 2% from median → outlier exclusion                                    │
│                                                                             │
│  Layer 3: BYZANTINE FAULT TOLERANCE                                         │
│  ├── 5 independent oracles                                                  │
│  ├── Median calculation ignores outliers                                    │
│  └── Tolerates 2/5 corrupt oracles                                         │
│                                                                             │
│  Layer 4: FALLBACK CASCADE                                                  │
│  ├── 3 consecutive failures → auto-disable oracle                          │
│  ├── Use remaining healthy oracles                                          │
│  └── Emergency: TWAP-only or settlement pause                              │
│                                                                             │
│  Layer 5: DISPUTE MECHANISM                                                  │
│  ├── Bond-based price challenges                                            │
│  ├── Arbitration window                                                     │
│  └── Slashing for malicious disputes                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Attack Simulator

The frontend includes a live Attack Simulator at `/oracle` that demonstrates all 4 adversarial conditions being defended in real-time on Sepolia testnet.

---

## 🛡️ Security Features

### 1. BFT Oracle Resistance
- **2/5 Byzantine Tolerance**: Median ignores up to 2 corrupt oracles
- **Outlier Detection**: >2% deviation from median → excluded
- **Circuit Breakers**: Automatic pause on extreme deviation

### 2. MEV Prevention
- **Commit-Reveal**: Encrypted settlements until reveal block
- **Beacon Ordering**: Deterministic order from finalized block hash
- **Role-Based Access**: SETTLER, ARBITRATOR, ORACLE roles

### 3. Finality Guarantees
- **4-Layer Model**: TENTATIVE → SEMI_FINAL → FINAL → IRREVERSIBLE
- **BFT Quorum**: 2/3 + 1 validators required for finalization
- **Reorg Safety**: 12 block confirmation for full finality

### 4. Fair Ordering
- **Global Sequence Numbers**: Immutable admission order
- **FIFO Queue**: First-in-first-out execution
- **Censorship Resistance**: Force-include after 10 blocks

---

## 🎯 Test Coverage Summary

```
427 tests passing ✅

Breakdown:
├── MultiOracleAggregator Tests: 43 tests
├── MEV Resistance Tests: 35 tests
├── Fair Ordering Tests: 40 tests
├── Finality Controller Tests: 23 tests
├── Settlement Oracle Tests: 30 tests
├── Settlement Protocol Tests: 70 tests
├── Invariant Tests: 50 tests
├── Attack Simulations: 45 tests
├── Architecture State Machine: 32 tests
├── Partial Finality Tests: 24 tests
└── Oracle Manipulation Tests: 35 tests
```

---

## Demo Day Guidelines

### Time Limit
- 5-7 minute presentation
- 2-3 minute technical Q&A

**Maximum of 7 slides & presentation must include:**
1) Project summary
2) Architecture overview
3) Invariants
4) Threat model & adversarial reasoning
5) Failure handling (timeouts, liveness, reorg safety)
6) Demo of settlement flow
7) Limitations & assumptions

## Prize Pool
- **Total Prize Pool:** ₹5 Lakh
- **1st Prize** – ₹2,50,000 for the Overall Best Project
- **2nd Prize** – ₹1,50,000 for Second Place
- **3rd Prize** – ₹1,00,000 for Third Place

---

Thank you for participating!
