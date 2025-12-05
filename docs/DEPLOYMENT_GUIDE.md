# Settlement Protocol Deployment Guide

> Complete deployment instructions for the Adversarial-Resilient Settlement Protocol

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Testnet Deployment](#testnet-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Mainnet Deployment Checklist](#mainnet-deployment-checklist)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
```bash
# Node.js v18+ (LTS recommended)
node --version  # Should be >= 18.0.0

# Yarn (preferred) or npm
yarn --version  # Should be >= 1.22.0

# Git
git --version
```

### Required Accounts
- **Ethereum Wallet**: MetaMask or hardware wallet with testnet/mainnet ETH
- **RPC Provider**: Alchemy, Infura, or similar (for testnet/mainnet)
- **Block Explorer API Key**: Etherscan/Basescan for contract verification

### Environment Variables
Create `.env` file in `packages/hardhat/`:
```bash
# Private key for deployment (NEVER commit this!)
DEPLOYER_PRIVATE_KEY=0x...

# RPC URLs
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Block Explorer API Keys
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
BASESCAN_API_KEY=YOUR_BASESCAN_KEY
```

---

## Local Development Setup

### Step 1: Clone and Install
```bash
# Clone the repository
git clone https://github.com/qabdurrahman/TheBlocks.git
cd the-blocks

# Install dependencies
yarn install
```

### Step 2: Start Local Node
```bash
# Terminal 1: Start Hardhat node
cd packages/hardhat
yarn chain

# Expected output:
# Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
# Accounts with 10000 ETH each...
```

### Step 3: Deploy Contracts Locally
```bash
# Terminal 2: Deploy contracts
cd packages/hardhat
yarn deploy

# Expected output:
# Deploying contracts...
# SettlementProtocol deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Step 4: Start Frontend
```bash
# Terminal 3: Start Next.js frontend
cd packages/nextjs
yarn start

# Access at http://localhost:3000
```

### Step 5: Run Tests
```bash
cd packages/hardhat

# Run all tests
yarn test

# Run specific test file
npx hardhat test test/SettlementProtocol.full.test.ts

# Run with gas reporting
REPORT_GAS=true yarn test

# Run with coverage
yarn hardhat coverage
```

---

## Testnet Deployment

### Supported Testnets
| Network | Chain ID | Faucet |
|---------|----------|--------|
| Sepolia | 11155111 | [sepoliafaucet.com](https://sepoliafaucet.com) |
| Base Sepolia | 84532 | [faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia) |
| Arbitrum Sepolia | 421614 | [faucet.quicknode.com/arbitrum/sepolia](https://faucet.quicknode.com/arbitrum/sepolia) |

### Step 1: Get Testnet ETH
1. Visit the appropriate faucet for your target network
2. Request testnet ETH to your deployer address
3. Verify balance: `cast balance YOUR_ADDRESS --rpc-url TESTNET_RPC`

### Step 2: Configure Network
In `packages/hardhat/hardhat.config.ts`, ensure network is configured:
```typescript
const config: HardhatUserConfig = {
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
      chainId: 11155111,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
      chainId: 84532,
    },
  },
  // Note: Required for large contract
  allowUnlimitedContractSize: true,
};
```

### Step 3: Deploy to Testnet
```bash
# Deploy to Sepolia
yarn deploy --network sepolia

# Deploy to Base Sepolia
yarn deploy --network baseSepolia
```

### Step 4: Verify Contract
```bash
# Verify on Etherscan (Sepolia)
npx hardhat verify --network sepolia DEPLOYED_ADDRESS

# Verify on Basescan (Base Sepolia)
npx hardhat verify --network baseSepolia DEPLOYED_ADDRESS
```

### Step 5: Record Deployment
Update `packages/hardhat/deployments/` with:
- Contract address
- Deployment transaction hash
- Block number
- Constructor arguments

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from nextjs directory
cd packages/nextjs
vercel

# For production
vercel --prod
```

**Environment Variables on Vercel:**
```
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_ONLY_LOCAL_BURNER_WALLET=false
```

### Option 2: Netlify

```bash
# Build the app
cd packages/nextjs
yarn build

# Deploy to Netlify
netlify deploy --dir=.next --prod
```

### Option 3: Self-Hosted

```bash
# Build production bundle
cd packages/nextjs
yarn build

# Start production server
yarn start
```

### Configure Contract Addresses
Update `packages/nextjs/scaffold.config.ts`:
```typescript
const scaffoldConfig = {
  targetNetworks: [chains.sepolia], // or your target network
  pollingInterval: 30000,
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
};
```

---

## Mainnet Deployment Checklist

> ⚠️ **CRITICAL**: Mainnet deployment involves real funds. Follow this checklist carefully.

### Pre-Deployment Audit
- [ ] All tests passing (127+ tests)
- [ ] Security analysis reviewed (see `SECURITY_ANALYSIS.md`)
- [ ] External audit completed (recommended)
- [ ] Invariant tests validated
- [ ] Gas optimization reviewed (see `GAS_OPTIMIZATION.md`)

### Contract Preparation
- [ ] Remove all `console.log` statements
- [ ] Set production constants (timeouts, limits)
- [ ] Verify constructor parameters
- [ ] Test deployment script on testnet

### Deployment Security
- [ ] Use hardware wallet for deployment
- [ ] Multi-sig ownership transfer planned
- [ ] Emergency pause mechanism tested
- [ ] Upgradeability plan (if applicable)

### Deployment Steps
```bash
# 1. Final test run
REPORT_GAS=true yarn test

# 2. Compile with optimizer
yarn compile

# 3. Deploy to mainnet
yarn deploy --network mainnet

# 4. Verify immediately
npx hardhat verify --network mainnet DEPLOYED_ADDRESS

# 5. Transfer ownership to multi-sig
# (execute via hardhat console or script)
```

### Post-Deployment
- [ ] Verify on Etherscan
- [ ] Test all functions with small amounts
- [ ] Monitor for first 24 hours
- [ ] Document deployment in README

---

## Post-Deployment Verification

### Verify Contract State
```bash
# Using Hardhat console
npx hardhat console --network sepolia

# Check contract
const Settlement = await ethers.getContractFactory("SettlementProtocol");
const contract = Settlement.attach("DEPLOYED_ADDRESS");

# Verify initial state
console.log("Owner:", await contract.owner());
console.log("Paused:", await contract.paused());
console.log("Settlement Count:", await contract.settlementCount());
```

### Test Core Functions
```javascript
// 1. Create test settlement
const tx1 = await contract.createSettlement(
  counterpartyAddress,
  ethers.parseEther("0.01"),
  3600 // 1 hour timeout
);
await tx1.wait();

// 2. Deposit as creator
const tx2 = await contract.deposit(1, {
  value: ethers.parseEther("0.01")
});
await tx2.wait();

// 3. Check invariants
const status = await contract.batchCheckInvariants([1]);
console.log("Invariants:", status);
```

### Monitor Events
```javascript
// Listen for SettlementCreated events
contract.on("SettlementCreated", (id, creator, counterparty) => {
  console.log(`Settlement ${id} created by ${creator} with ${counterparty}`);
});

// Listen for security events
contract.on("SuspiciousActivity", (settlementId, actor, reason) => {
  console.log(`ALERT: ${reason} in settlement ${settlementId} by ${actor}`);
});
```

---

## Troubleshooting

### Common Errors

#### "Contract size exceeds 24KB"
```typescript
// Solution: Add to hardhat.config.ts
solidity: {
  settings: {
    optimizer: { enabled: true, runs: 100 },
    allowUnlimitedContractSize: true, // For testing only
  }
}
```

#### "Insufficient funds for gas"
```bash
# Check balance
cast balance YOUR_ADDRESS --rpc-url RPC_URL

# Get testnet ETH from faucet
```

#### "Nonce too high"
```bash
# Reset account in MetaMask:
# Settings > Advanced > Reset Account
```

#### "Transaction underpriced"
```typescript
// Add gas price override
const tx = await contract.function({
  gasPrice: ethers.parseUnits("30", "gwei")
});
```

#### "UNPREDICTABLE_GAS_LIMIT"
```typescript
// Manually set gas limit
const tx = await contract.function({
  gasLimit: 500000
});
```

### Verification Failures

#### "Constructor arguments do not match"
```bash
# Provide constructor args
npx hardhat verify --network sepolia ADDRESS --constructor-args arguments.js
```

#### "Contract source code already verified"
Already verified! Check on block explorer.

### Frontend Issues

#### "Contract not found on network"
1. Verify `scaffold.config.ts` has correct network
2. Check contract address in `deployedContracts.ts`
3. Clear browser cache and reconnect wallet

#### "WalletConnect not working"
1. Check `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
2. Verify domain is whitelisted in WalletConnect dashboard

---

## Quick Reference Commands

```bash
# Development
yarn install          # Install dependencies
yarn chain            # Start local node
yarn deploy           # Deploy locally
yarn test            # Run tests

# Testnet
yarn deploy --network sepolia
yarn verify --network sepolia ADDRESS

# Frontend
yarn start           # Development
yarn build           # Production build
vercel --prod        # Deploy to Vercel

# Utilities
npx hardhat console --network sepolia
npx hardhat clean
npx hardhat compile
```

---

## Support

- **Repository**: https://github.com/qabdurrahman/TheBlocks
- **Branch**: sayandeep
- **Documentation**: See `docs/` folder
- **Security Issues**: See `SECURITY_ANALYSIS.md`

---

*Last Updated: TriHacker Tournament 2025*
