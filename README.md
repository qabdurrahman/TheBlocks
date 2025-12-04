# TheBlocks

## Adversarial-Resilient Settlement Protocol

A secure, MEV-resistant settlement protocol for processing trades and rights transfers on-chain.

Built for the **TriHacker Tournament** hackathon (Dec 4-5, 2025).

---

## 🎯 Problem Statement

Design and implement an adversarial-resilient settlement protocol with:

- **Fair Ordering** — Settlement independent of validator ordering
- **Invariant Enforcement** — 3-5 provable core invariants
- **Partial Finality Logic** — Settlement across multiple blocks
- **Oracle Manipulation Resistance** — Dispute and correction mechanics
- **Attack Model Clarity** — Defined adversary capabilities and defenses

---

## 🛠 Tech Stack

- **Smart Contracts**: Solidity + Hardhat
- **Frontend**: Next.js + RainbowKit + Wagmi
- **Framework**: Scaffold-ETH 2

---

## 🚀 Quick Start

```bash
# Install dependencies
yarn install

# Start local blockchain
yarn chain

# Deploy contracts (new terminal)
yarn deploy

# Start frontend (new terminal)
yarn start
```

Visit `http://localhost:3000`

---

## 📁 Project Structure

```
packages/
├── hardhat/          # Smart contracts
│   ├── contracts/    # Solidity files
│   ├── deploy/       # Deployment scripts
│   └── test/         # Contract tests
└── nextjs/           # Frontend application
```

---

## 👥 Team

**TheBlocks** — TriHacker Tournament 2025

---

## 📄 License

MIT
