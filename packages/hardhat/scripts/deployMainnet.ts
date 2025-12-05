import { ethers } from "hardhat";

/**
 * MAINNET DEPLOYMENT SCRIPT
 * THE BLOCKS - 5-Oracle BFT System + Guardian AI Security Layer
 * 
 * MAINNET ORACLE ADDRESSES:
 * - Chainlink ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 * - Pyth Network: 0x4305FB66699C3B2702D4d05CF36551390A4c69C6
 * - Uniswap V3 WETH/USDC: 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
 */

// ============================================
// MAINNET ORACLE ADDRESSES (VERIFIED)
// ============================================
const MAINNET_ORACLES = {
  // Chainlink ETH/USD Price Feed (8 decimals)
  chainlink: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  
  // Pyth Network (mainnet)
  pyth: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
  pythEthUsdId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  
  // Uniswap V3 WETH/USDC 0.05% Pool (highest liquidity)
  uniswapPool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  
  // WETH and USDC addresses for reference
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                                                                       ║");
  console.log("║   ████████╗██╗  ██╗███████╗    ██████╗ ██╗      ██████╗  ██████╗██╗  ██╗███████╗  ║");
  console.log("║      ██║   ██║  ██║██╔════╝    ██╔══██╗██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝  ║");
  console.log("║      ██║   ███████║█████╗      ██████╔╝██║     ██║   ██║██║     █████╔╝ ███████╗  ║");
  console.log("║      ██║   ██╔══██║██╔══╝      ██╔══██╗██║     ██║   ██║██║     ██╔═██╗ ╚════██║  ║");
  console.log("║      ██║   ██║  ██║███████╗    ██████╔╝███████╗╚██████╔╝╚██████╗██║  ██╗███████║  ║");
  console.log("║      ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝  ║");
  console.log("║                                                                       ║");
  console.log("║        🚀 MAINNET DEPLOYMENT - 5 ORACLE SYSTEM 🚀                     ║");
  console.log("║                                                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
  
  console.log("   Deployer:  ", deployer.address);
  console.log("   Balance:   ", ethers.formatEther(balance), "ETH");
  console.log("   Network:    ETHEREUM MAINNET\n");
  
  // Safety check
  const balanceNum = parseFloat(ethers.formatEther(balance));
  if (balanceNum < 0.08) {
    console.log("   ❌ INSUFFICIENT BALANCE!");
    console.log("   Required: ~0.1 ETH | Current:", balanceNum.toFixed(4), "ETH");
    console.log("\n   Please fund the wallet and try again.");
    console.log("   Send ETH to:", deployer.address);
    return;
  }

  const startBalance = balance;
  
  // ============================================
  // STEP 1: Deploy MultiOracleAggregator
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("   STEP 1: Deploying MultiOracleAggregator (5-Oracle BFT Engine)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  const MultiOracleAggregator = await ethers.getContractFactory("MultiOracleAggregator");
  
  console.log("   Configuring oracles:");
  console.log("   ├── 🔵 Chainlink ETH/USD:", MAINNET_ORACLES.chainlink);
  console.log("   ├── 🟣 Pyth Network:     ", MAINNET_ORACLES.pyth);
  console.log("   └── 🟠 Uniswap V3 TWAP:  ", MAINNET_ORACLES.uniswapPool);
  
  console.log("\n   Deploying...");
  
  const aggregator = await MultiOracleAggregator.deploy(
    MAINNET_ORACLES.chainlink,
    MAINNET_ORACLES.pyth,
    MAINNET_ORACLES.pythEthUsdId
  );
  
  await aggregator.waitForDeployment();
  const aggregatorAddress = await aggregator.getAddress();
  console.log("   ✅ MultiOracleAggregator deployed at:", aggregatorAddress);
  
  // ============================================
  // STEP 2: Configure Uniswap V3 TWAP Oracle
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("   STEP 2: Configuring Uniswap V3 TWAP Oracle");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  console.log("   Setting WETH/USDC 0.05% Pool:", MAINNET_ORACLES.uniswapPool);
  
  const tx1 = await aggregator.setUniswapPool(
    MAINNET_ORACLES.uniswapPool,
    MAINNET_ORACLES.weth,
    MAINNET_ORACLES.usdc
  );
  await tx1.wait();
  console.log("   ✅ Uniswap V3 TWAP configured");
  
  // ============================================
  // STEP 3: Deploy SyncedPriceFeed (4th Oracle)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("   STEP 3: Deploying SyncedPriceFeed (4th Oracle)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  const SyncedPriceFeed = await ethers.getContractFactory("SyncedPriceFeed");
  const syncedFeed = await SyncedPriceFeed.deploy(
    MAINNET_ORACLES.chainlink,
    deployer.address
  );
  await syncedFeed.waitForDeployment();
  const syncedAddress = await syncedFeed.getAddress();
  console.log("   ✅ SyncedPriceFeed deployed at:", syncedAddress);
  
  // Sync the price
  const txSync = await syncedFeed.syncPrice();
  await txSync.wait();
  console.log("   ✅ Price synced from Chainlink");
  
  // Add to aggregator as 4th oracle
  const tx2 = await aggregator.addCustomOracle(syncedAddress, "SyncedPriceFeed");
  await tx2.wait();
  console.log("   ✅ SyncedPriceFeed added to aggregator");
  
  // ============================================
  // STEP 4: Deploy GuardianOracleV2 (AI Security)
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("   STEP 4: Deploying GuardianOracleV2 (AI Security Layer)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  const GuardianOracleV2 = await ethers.getContractFactory("GuardianOracleV2");
  const guardian = await GuardianOracleV2.deploy(MAINNET_ORACLES.chainlink);
  await guardian.waitForDeployment();
  const guardianAddress = await guardian.getAddress();
  console.log("   ✅ GuardianOracleV2 deployed at:", guardianAddress);
  
  // Initialize TWAP with observations
  console.log("\n   Initializing TWAP observations...");
  for (let i = 0; i < 5; i++) {
    const txObs = await guardian.recordPriceObservation();
    await txObs.wait();
    process.stdout.write(`   Observation ${i + 1}/5 ✅\n`);
  }
  
  // ============================================
  // STEP 5: Verify System Status
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("   STEP 5: Verifying System Status");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  // Check aggregator status
  const activeOracles = await aggregator.getActiveOracleCount();
  const isPaused = await aggregator.paused();
  
  // Check guardian status
  const isHealthy = await guardian.isSystemHealthy();
  const confidence = await guardian.getConfidenceScore();
  const guardianPrice = await guardian.getLatestPrice();
  
  console.log("   ╔════════════════════════════════════════════════════════════════╗");
  console.log("   ║                    SYSTEM STATUS                               ║");
  console.log("   ╠════════════════════════════════════════════════════════════════╣");
  console.log(`   ║  Active Oracles:    ${activeOracles}/5                                       ║`);
  console.log(`   ║  System Paused:     ${isPaused ? "YES ⚠️" : "NO ✅"}                                      ║`);
  console.log(`   ║  Guardian Health:   ${isHealthy ? "✅ HEALTHY" : "⚠️ DEGRADED"}                              ║`);
  console.log(`   ║  Confidence Score:  ${confidence}/100                                    ║`);
  console.log(`   ║  Current Price:     $${(Number(guardianPrice) / 1e8).toFixed(2)}                               ║`);
  console.log("   ╚════════════════════════════════════════════════════════════════╝");
  
  // ============================================
  // DEPLOYMENT SUMMARY
  // ============================================
  const endBalance = await ethers.provider.getBalance(deployer.address);
  const gasSpent = startBalance - endBalance;
  
  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("   ✅ MAINNET DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  console.log("   📍 DEPLOYED CONTRACTS:");
  console.log("   ┌─────────────────────────────────────────────────────────────────┐");
  console.log("   │ MultiOracleAggregator:", aggregatorAddress);
  console.log("   │ SyncedPriceFeed:      ", syncedAddress);
  console.log("   │ GuardianOracleV2:     ", guardianAddress);
  console.log("   └─────────────────────────────────────────────────────────────────┘");
  
  console.log("\n   📡 ACTIVE ORACLES:");
  console.log("   ┌─────────────────────────────────────────────────────────────────┐");
  console.log("   │ 🔵 Chainlink ETH/USD:  ", MAINNET_ORACLES.chainlink);
  console.log("   │ 🟣 Pyth Network:       ", MAINNET_ORACLES.pyth);
  console.log("   │ 🟠 Uniswap V3 TWAP:    ", MAINNET_ORACLES.uniswapPool);
  console.log("   │ 🟢 SyncedPriceFeed:    ", syncedAddress);
  console.log("   └─────────────────────────────────────────────────────────────────┘");
  
  console.log("\n   ⛽ GAS USAGE:");
  console.log("      Total Gas Spent:  ", ethers.formatEther(gasSpent), "ETH");
  console.log("      Remaining Balance:", ethers.formatEther(endBalance), "ETH");
  
  console.log("\n   📖 VIEW ON ETHERSCAN:");
  console.log("      https://etherscan.io/address/" + aggregatorAddress);
  console.log("      https://etherscan.io/address/" + guardianAddress);
  
  console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                                                                       ║");
  console.log("║   🎉 THE BLOCKS IS LIVE ON ETHEREUM MAINNET! 🎉                       ║");
  console.log("║                                                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
