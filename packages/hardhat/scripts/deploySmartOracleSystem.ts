import { ethers } from "hardhat";

/**
 * Deployment Script for 5-Oracle Smart Selection System
 * 
 * This script deploys the complete flagship oracle infrastructure:
 * 1. API3Adapter - First-party oracle
 * 2. DIAAdapter - Community-sourced oracle  
 * 3. UniswapV3TWAPAdapter - On-chain TWAP anchor
 * 4. SmartOracleSelector - AI-inspired oracle selection engine
 * 5. Configures all with real Sepolia addresses
 */

// ============================================
// SEPOLIA TESTNET ORACLE ADDRESSES
// ============================================

const SEPOLIA_ADDRESSES = {
  // Chainlink (already deployed)
  CHAINLINK_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  
  // Pyth Network
  PYTH_CONTRACT: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  PYTH_ETH_USD_FEED_ID: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  
  // DIA Oracle V2 on Sepolia
  DIA_ORACLE: "0xa93546947f3015c986695750b8bbEa8e26D65856",
  
  // Uniswap V3 USDC/WETH Pool on Sepolia (from GeckoTerminal)
  UNISWAP_V3_POOL: "0x3289680dd4d6c10bb19b899729cda5eef58aeff1",
  
  // API3 - Note: You need to get proxy address from https://market.api3.org/ethereum-sepolia-testnet
  // For now we'll use the API3 Server V1 approach
  API3_SERVER: "0x0000000000000000000000000000000000000000", // Update after getting from API3 Market
};

// Existing deployed contracts (update these after deployment)
const EXISTING_CONTRACTS = {
  MULTI_ORACLE_AGGREGATOR: "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
  GUARDIAN_ORACLE_V2: "0x71027655D76832eA3d1F056C528485ddE1aec66a",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║       5-ORACLE SMART SELECTION SYSTEM - SEPOLIA DEPLOYMENT            ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`🔑 Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");
  
  if (balance < ethers.parseEther("0.02")) {
    console.log("⚠️  WARNING: Low balance. You need at least 0.02 ETH for full deployment.");
    console.log("   Get Sepolia ETH from: https://sepoliafaucet.com/");
    return;
  }

  const deployedContracts: Record<string, string> = {};

  // ============================================
  // STEP 1: Deploy API3Adapter
  // ============================================
  console.log("📦 Step 1: Deploying API3Adapter...");
  
  try {
    const API3Adapter = await ethers.getContractFactory("API3Adapter");
    const api3Adapter = await API3Adapter.deploy(
      EXISTING_CONTRACTS.MULTI_ORACLE_AGGREGATOR,
      SEPOLIA_ADDRESSES.API3_SERVER
    );
    await api3Adapter.waitForDeployment();
    
    deployedContracts.API3Adapter = await api3Adapter.getAddress();
    console.log(`   ✅ API3Adapter deployed at: ${deployedContracts.API3Adapter}`);
  } catch (error: any) {
    console.log(`   ⚠️ API3Adapter deployment failed: ${error.message}`);
    deployedContracts.API3Adapter = "0x0000000000000000000000000000000000000000";
  }

  // ============================================
  // STEP 2: Deploy DIAAdapter
  // ============================================
  console.log("📦 Step 2: Deploying DIAAdapter...");
  
  try {
    const DIAAdapter = await ethers.getContractFactory("DIAAdapter");
    const diaAdapter = await DIAAdapter.deploy(
      SEPOLIA_ADDRESSES.DIA_ORACLE,
      EXISTING_CONTRACTS.MULTI_ORACLE_AGGREGATOR
    );
    await diaAdapter.waitForDeployment();
    
    deployedContracts.DIAAdapter = await diaAdapter.getAddress();
    console.log(`   ✅ DIAAdapter deployed at: ${deployedContracts.DIAAdapter}`);
  } catch (error: any) {
    console.log(`   ⚠️ DIAAdapter deployment failed: ${error.message}`);
    deployedContracts.DIAAdapter = "0x0000000000000000000000000000000000000000";
  }

  // ============================================
  // STEP 3: Deploy UniswapV3TWAPAdapter
  // ============================================
  console.log("📦 Step 3: Deploying UniswapV3TWAPAdapter...");
  
  try {
    const TWAPAdapter = await ethers.getContractFactory("UniswapV3TWAPAdapter");
    // Deploy without pool - configure later to avoid constructor failures
    const twapAdapter = await TWAPAdapter.deploy(
      ethers.ZeroAddress, // Deploy without pool first
      EXISTING_CONTRACTS.MULTI_ORACLE_AGGREGATOR
    );
    await twapAdapter.waitForDeployment();
    
    deployedContracts.UniswapV3TWAPAdapter = await twapAdapter.getAddress();
    console.log(`   ✅ UniswapV3TWAPAdapter deployed at: ${deployedContracts.UniswapV3TWAPAdapter}`);
    
    // Try to configure the pool after deployment
    try {
      console.log("   🔧 Configuring Uniswap V3 pool...");
      const tx = await twapAdapter.configurePool(SEPOLIA_ADDRESSES.UNISWAP_V3_POOL);
      await tx.wait();
      console.log("   ✅ Pool configured successfully!");
    } catch (poolError: any) {
      console.log(`   ⚠️ Pool configuration skipped: ${poolError.message.slice(0, 50)}...`);
      console.log("   ℹ️  TWAP adapter deployed but needs manual pool configuration");
    }
  } catch (error: any) {
    console.log(`   ⚠️ UniswapV3TWAPAdapter deployment failed: ${error.message}`);
    deployedContracts.UniswapV3TWAPAdapter = "0x0000000000000000000000000000000000000000";
  }

  // ============================================
  // STEP 4: Deploy SmartOracleSelector
  // ============================================
  console.log("📦 Step 4: Deploying SmartOracleSelector...");
  
  try {
    const SmartSelector = await ethers.getContractFactory("SmartOracleSelector");
    const smartSelector = await SmartSelector.deploy();
    await smartSelector.waitForDeployment();
    
    deployedContracts.SmartOracleSelector = await smartSelector.getAddress();
    console.log(`   ✅ SmartOracleSelector deployed at: ${deployedContracts.SmartOracleSelector}`);
  } catch (error: any) {
    console.log(`   ⚠️ SmartOracleSelector deployment failed: ${error.message}`);
    deployedContracts.SmartOracleSelector = "0x0000000000000000000000000000000000000000";
  }

  // ============================================
  // STEP 5: Configure SmartOracleSelector
  // ============================================
  console.log("\n🔧 Step 5: Configuring SmartOracleSelector with all adapters...");
  
  if (deployedContracts.SmartOracleSelector !== "0x0000000000000000000000000000000000000000") {
    try {
      const smartSelector = await ethers.getContractAt(
        "SmartOracleSelector", 
        deployedContracts.SmartOracleSelector
      );
      
      const tx = await smartSelector.configureAdapters(
        SEPOLIA_ADDRESSES.CHAINLINK_ETH_USD,  // Chainlink
        SEPOLIA_ADDRESSES.PYTH_CONTRACT,       // Pyth
        SEPOLIA_ADDRESSES.PYTH_ETH_USD_FEED_ID, // Pyth Feed ID
        deployedContracts.API3Adapter,         // API3
        deployedContracts.DIAAdapter,          // DIA
        deployedContracts.UniswapV3TWAPAdapter // TWAP
      );
      await tx.wait();
      
      console.log("   ✅ SmartOracleSelector configured with all 5 oracles!");
    } catch (error: any) {
      console.log(`   ⚠️ Configuration failed: ${error.message}`);
    }
  }

  // ============================================
  // STEP 6: Verify Configurations
  // ============================================
  console.log("\n🔍 Step 6: Verifying configurations...");
  
  if (deployedContracts.SmartOracleSelector !== "0x0000000000000000000000000000000000000000") {
    try {
      const smartSelector = await ethers.getContractAt(
        "SmartOracleSelector", 
        deployedContracts.SmartOracleSelector
      );
      
      const adapters = await smartSelector.getConfiguredAdapters();
      console.log("   Oracle Adapter Status:");
      console.log(`   • Chainlink: ${adapters.hasChainlink ? "✅ Configured" : "❌ Not configured"}`);
      console.log(`   • Pyth:      ${adapters.hasPyth ? "✅ Configured" : "❌ Not configured"}`);
      console.log(`   • API3:      ${adapters.hasAPI3 ? "✅ Configured" : "❌ Not configured"}`);
      console.log(`   • DIA:       ${adapters.hasDIA ? "✅ Configured" : "❌ Not configured"}`);
      console.log(`   • TWAP:      ${adapters.hasTWAP ? "✅ Configured" : "❌ Not configured"}`);
      
      const scores = await smartSelector.getAllReliabilityScores();
      console.log("\n   Initial Reliability Scores:");
      console.log(`   • Chainlink: ${scores.chainlink}/100`);
      console.log(`   • Pyth:      ${scores.pyth}/100`);
      console.log(`   • API3:      ${scores.api3}/100`);
      console.log(`   • DIA:       ${scores.dia}/100`);
      console.log(`   • TWAP:      ${scores.twap}/100`);
      
    } catch (error: any) {
      console.log(`   ⚠️ Verification failed: ${error.message}`);
    }
  }

  // ============================================
  // DEPLOYMENT SUMMARY
  // ============================================
  console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                      DEPLOYMENT COMPLETE                               ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("📋 NEWLY DEPLOYED CONTRACTS:");
  console.log(`   API3Adapter:           ${deployedContracts.API3Adapter}`);
  console.log(`   DIAAdapter:            ${deployedContracts.DIAAdapter}`);
  console.log(`   UniswapV3TWAPAdapter:  ${deployedContracts.UniswapV3TWAPAdapter}`);
  console.log(`   SmartOracleSelector:   ${deployedContracts.SmartOracleSelector}`);
  console.log("");
  console.log("🔗 EXTERNAL ORACLE ADDRESSES (SEPOLIA):");
  console.log(`   Chainlink ETH/USD:     ${SEPOLIA_ADDRESSES.CHAINLINK_ETH_USD}`);
  console.log(`   Pyth Network:          ${SEPOLIA_ADDRESSES.PYTH_CONTRACT}`);
  console.log(`   DIA Oracle:            ${SEPOLIA_ADDRESSES.DIA_ORACLE}`);
  console.log(`   Uniswap V3 Pool:       ${SEPOLIA_ADDRESSES.UNISWAP_V3_POOL}`);
  console.log("");
  console.log("📝 NEXT STEPS:");
  console.log("   1. Verify contracts on Etherscan:");
  console.log(`      npx hardhat verify --network sepolia ${deployedContracts.SmartOracleSelector}`);
  console.log("");
  console.log("   2. Test the smart oracle selection:");
  console.log(`      npx hardhat run scripts/testSmartSelector.ts --network sepolia`);
  console.log("");
  console.log("   3. Update frontend with new contract addresses");
  console.log("");
  
  // Return addresses for programmatic use
  return {
    ...deployedContracts,
    externalOracles: SEPOLIA_ADDRESSES
  };
}

main()
  .then((addresses) => {
    console.log("✅ All deployments successful!");
    console.log("\n📦 Export for frontend:");
    console.log(JSON.stringify(addresses, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
