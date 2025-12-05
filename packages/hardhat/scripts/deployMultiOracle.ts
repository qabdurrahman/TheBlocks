import { ethers } from "hardhat";

/**
 * Deployment Script for 5-Oracle BFT System on Sepolia
 * 
 * This script deploys:
 * 1. MultiOracleAggregator - The 5-oracle BFT engine
 * 2. Configures real Sepolia oracle addresses
 * 3. Integrates with SettlementOracle
 */

// ============================================
// SEPOLIA TESTNET ORACLE ADDRESSES
// ============================================

const SEPOLIA_ORACLES = {
  // Chainlink ETH/USD Price Feed on Sepolia
  CHAINLINK_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  
  // Pyth Network on Sepolia
  PYTH_CONTRACT: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  // Pyth ETH/USD Feed ID (same across networks)
  PYTH_ETH_USD_FEED_ID: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  
  // DIA Oracle on Sepolia (if available, otherwise use mock)
  DIA_ORACLE: "0xa93546947f3015c986695750b8bbEa8e26D65856",
  
  // Uniswap V3 WETH/USDC Pool on Sepolia - use getAddress for proper checksum
  UNISWAP_V3_POOL: ethers.getAddress("0x6ce0896eae6d4bd668fde41bb784548fb8a68e50"),
};

// Oracle type enum (must match contract)
enum OracleType {
  CHAINLINK = 0,
  PYTH = 1,
  REDSTONE = 2,
  DIA = 3,
  UNISWAP_TWAP = 4,
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║     5-ORACLE BFT SYSTEM DEPLOYMENT - SEPOLIA TESTNET          ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");
  
  if (balance < ethers.parseEther("0.01")) {
    console.log("⚠️  WARNING: Low balance. You need at least 0.01 ETH for deployment.");
    console.log("   Get Sepolia ETH from: https://sepoliafaucet.com/");
    return;
  }

  // ============================================
  // STEP 1: Deploy MultiOracleAggregator
  // ============================================
  console.log("📦 Step 1: Deploying MultiOracleAggregator...");
  
  const MultiOracleAggregator = await ethers.getContractFactory("MultiOracleAggregator");
  const aggregator = await MultiOracleAggregator.deploy();
  await aggregator.waitForDeployment();
  
  const aggregatorAddress = await aggregator.getAddress();
  console.log(`   ✅ MultiOracleAggregator deployed at: ${aggregatorAddress}`);
  console.log("");

  // ============================================
  // STEP 2: Configure Chainlink Oracle
  // ============================================
  console.log("🔗 Step 2: Configuring Chainlink ETH/USD...");
  
  try {
    const tx1 = await aggregator.configureOracle(
      OracleType.CHAINLINK,
      SEPOLIA_ORACLES.CHAINLINK_ETH_USD,
      ethers.ZeroHash // No feed ID for Chainlink
    );
    await tx1.wait();
    console.log(`   ✅ Chainlink configured: ${SEPOLIA_ORACLES.CHAINLINK_ETH_USD}`);
  } catch (error: any) {
    console.log(`   ⚠️ Chainlink config failed: ${error.message}`);
  }

  // ============================================
  // STEP 3: Configure Pyth Oracle
  // ============================================
  console.log("🐍 Step 3: Configuring Pyth Network...");
  
  try {
    const tx2 = await aggregator.configureOracle(
      OracleType.PYTH,
      SEPOLIA_ORACLES.PYTH_CONTRACT,
      SEPOLIA_ORACLES.PYTH_ETH_USD_FEED_ID
    );
    await tx2.wait();
    console.log(`   ✅ Pyth configured: ${SEPOLIA_ORACLES.PYTH_CONTRACT}`);
    console.log(`      Feed ID: ${SEPOLIA_ORACLES.PYTH_ETH_USD_FEED_ID.slice(0, 20)}...`);
  } catch (error: any) {
    console.log(`   ⚠️ Pyth config failed: ${error.message}`);
  }

  // ============================================
  // STEP 4: Configure DIA Oracle
  // ============================================
  console.log("💎 Step 4: Configuring DIA Oracle...");
  
  try {
    const tx3 = await aggregator.configureOracle(
      OracleType.DIA,
      SEPOLIA_ORACLES.DIA_ORACLE,
      ethers.ZeroHash
    );
    await tx3.wait();
    console.log(`   ✅ DIA configured: ${SEPOLIA_ORACLES.DIA_ORACLE}`);
  } catch (error: any) {
    console.log(`   ⚠️ DIA config failed: ${error.message}`);
  }

  // ============================================
  // STEP 5: Configure Uniswap TWAP
  // ============================================
  console.log("🦄 Step 5: Configuring Uniswap V3 TWAP...");
  
  try {
    const tx4 = await aggregator.configureOracle(
      OracleType.UNISWAP_TWAP,
      SEPOLIA_ORACLES.UNISWAP_V3_POOL,
      ethers.ZeroHash
    );
    await tx4.wait();
    console.log(`   ✅ Uniswap TWAP configured: ${SEPOLIA_ORACLES.UNISWAP_V3_POOL}`);
  } catch (error: any) {
    console.log(`   ⚠️ Uniswap TWAP config failed: ${error.message}`);
  }

  // ============================================
  // STEP 6: Verify Oracle Configs
  // ============================================
  console.log("");
  console.log("🔌 Step 6: Verifying oracle configurations...");
  
  const oraclesToCheck = [
    { type: OracleType.CHAINLINK, name: "Chainlink" },
    { type: OracleType.PYTH, name: "Pyth" },
    { type: OracleType.DIA, name: "DIA" },
    { type: OracleType.UNISWAP_TWAP, name: "Uniswap TWAP" },
  ];
  
  for (const oracle of oraclesToCheck) {
    try {
      const config = await aggregator.oracleConfigs(oracle.type);
      const status = config.isActive ? "✅ Active" : "❌ Inactive";
      console.log(`   ${oracle.name}: ${status} (${config.oracleAddress.slice(0, 20)}...)`);
    } catch (error: any) {
      console.log(`   ⚠️ ${oracle.name} check failed: ${error.message}`);
    }
  }

  // ============================================
  // STEP 7: Verify System Health
  // ============================================
  console.log("");
  console.log("🏥 Step 7: Checking system health...");
  
  try {
    const circuitBreakerLevel = await aggregator.circuitBreakerLevel();
    const isPaused = await aggregator.isPaused();
    
    console.log(`   Circuit Breaker: Level ${circuitBreakerLevel} (0=NORMAL)`);
    console.log(`   System Paused: ${isPaused}`);
    
    // Check each oracle config
    for (const oracle of oraclesToCheck) {
      const config = await aggregator.oracleConfigs(oracle.type);
      console.log(`   ${oracle.name}: ${config.isActive ? "✅ Active" : "❌ Inactive"} (reliability: ${config.reliabilityScore})`);
    }
  } catch (error: any) {
    console.log(`   ⚠️ Health check failed: ${error.message}`);
  }

  // ============================================
  // DEPLOYMENT SUMMARY
  // ============================================
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                    DEPLOYMENT COMPLETE                         ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("📋 Deployed Contracts:");
  console.log(`   MultiOracleAggregator: ${aggregatorAddress}`);
  console.log("");
  console.log("🔗 Configured Oracles:");
  console.log(`   Chainlink ETH/USD: ${SEPOLIA_ORACLES.CHAINLINK_ETH_USD}`);
  console.log(`   Pyth Network:      ${SEPOLIA_ORACLES.PYTH_CONTRACT}`);
  console.log(`   DIA Oracle:        ${SEPOLIA_ORACLES.DIA_ORACLE}`);
  console.log(`   Uniswap V3 Pool:   ${SEPOLIA_ORACLES.UNISWAP_V3_POOL}`);
  console.log("");
  console.log("📝 Next Steps:");
  console.log("   1. Verify contract on Etherscan:");
  console.log(`      npx hardhat verify --network sepolia ${aggregatorAddress}`);
  console.log("");
  console.log("   2. Test price aggregation:");
  console.log(`      npx hardhat run scripts/testMultiOracle.ts --network sepolia`);
  console.log("");
  
  return aggregatorAddress;
}

main()
  .then((address) => {
    console.log(`✅ Deployment successful! Contract: ${address}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
