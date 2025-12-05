import { ethers } from "hardhat";

/**
 * MAINNET LIVE DEMO SCRIPT
 * Run this after deployment to demonstrate the live system
 * 
 * Usage: npx hardhat run scripts/mainnetLiveDemo.ts --network mainnet
 */

// ============================================
// PASTE YOUR DEPLOYED ADDRESSES HERE AFTER DEPLOYMENT
// ============================================
const DEPLOYED = {
  multiOracleAggregator: "YOUR_AGGREGATOR_ADDRESS",  // Update after deployment
  guardianOracleV2: "YOUR_GUARDIAN_ADDRESS",         // Update after deployment
  syncedPriceFeed: "YOUR_SYNCED_ADDRESS"             // Update after deployment
};

// Mainnet oracle addresses (fixed)
const MAINNET_ORACLES = {
  chainlink: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  pyth: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
  pythEthUsdId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  uniswapPool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
};

// Minimal ABIs for reading prices
const CHAINLINK_ABI = [
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() external view returns (uint8)"
];

const PYTH_ABI = [
  "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))"
];

const GUARDIAN_ABI = [
  "function getLatestPrice() external view returns (int256)",
  "function isSystemHealthy() external view returns (bool)",
  "function getConfidenceScore() external view returns (uint256)",
  "function getTWAP() external view returns (int256, uint256)",
  "function getAnomalyMetrics() external view returns (int256, int256, uint256, uint256)"
];

async function main() {
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
  console.log("║        🌐 MAINNET LIVE DEMO - REAL ETH PRICES 🌐                      ║");
  console.log("║                                                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

  // ============================================
  // READ LIVE ORACLE PRICES
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("   LIVE ORACLE PRICES (ETHEREUM MAINNET)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Chainlink
  const chainlink = new ethers.Contract(MAINNET_ORACLES.chainlink, CHAINLINK_ABI, ethers.provider);
  const [, chainlinkPrice, , chainlinkUpdatedAt] = await chainlink.latestRoundData();
  const chainlinkAge = Math.floor(Date.now() / 1000) - Number(chainlinkUpdatedAt);
  const chainlinkPriceUSD = Number(chainlinkPrice) / 1e8;

  // Pyth
  const pyth = new ethers.Contract(MAINNET_ORACLES.pyth, PYTH_ABI, ethers.provider);
  let pythPrice = 0;
  let pythConf = 0;
  try {
    const pythData = await pyth.getPriceUnsafe(MAINNET_ORACLES.pythEthUsdId);
    pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
    pythConf = Number(pythData.conf) * Math.pow(10, Number(pythData.expo));
  } catch (e) {
    console.log("   ⚠️  Pyth price fetch failed (may need update)");
  }

  console.log("   ╔════════════════════════════════════════════════════════════════╗");
  console.log("   ║                    LIVE ORACLE PRICES                          ║");
  console.log("   ╠════════════════════════════════════════════════════════════════╣");
  console.log(`   ║  🔵 CHAINLINK:     $${chainlinkPriceUSD.toFixed(2).padEnd(12)} (${chainlinkAge}s ago)       ║`);
  if (pythPrice > 0) {
    console.log(`   ║  🟣 PYTH:          $${pythPrice.toFixed(2).padEnd(12)} (±$${pythConf.toFixed(2)})        ║`);
  }
  console.log("   ║  🟠 UNISWAP TWAP:  (Integrated in aggregator)                  ║");
  console.log("   ╚════════════════════════════════════════════════════════════════╝");

  // ============================================
  // CHECK DEPLOYED CONTRACTS (if addresses set)
  // ============================================
  if (DEPLOYED.guardianOracleV2 !== "YOUR_GUARDIAN_ADDRESS") {
    console.log("\n═══════════════════════════════════════════════════════════════════════");
    console.log("   GUARDIAN ORACLE V2 - AI SECURITY LAYER");
    console.log("═══════════════════════════════════════════════════════════════════════\n");

    const guardian = new ethers.Contract(DEPLOYED.guardianOracleV2, GUARDIAN_ABI, ethers.provider);
    
    const isHealthy = await guardian.isSystemHealthy();
    const confidence = await guardian.getConfidenceScore();
    const guardianPrice = await guardian.getLatestPrice();
    const [twap, observations] = await guardian.getTWAP();
    const [lastPrice, velocity, volatility, anomalies] = await guardian.getAnomalyMetrics();

    console.log("   ╔════════════════════════════════════════════════════════════════╗");
    console.log("   ║                    SECURITY STATUS                             ║");
    console.log("   ╠════════════════════════════════════════════════════════════════╣");
    console.log(`   ║  System Health:     ${isHealthy ? "✅ HEALTHY" : "⚠️ DEGRADED"}                            ║`);
    console.log(`   ║  Confidence Score:  ${confidence}/100                                  ║`);
    console.log(`   ║  Current Price:     $${(Number(guardianPrice) / 1e8).toFixed(2)}                              ║`);
    console.log(`   ║  TWAP Price:        $${(Number(twap) / 1e8).toFixed(2)}                              ║`);
    console.log(`   ║  Observations:      ${observations}                                     ║`);
    console.log(`   ║  Anomalies:         ${anomalies}                                        ║`);
    console.log("   ╚════════════════════════════════════════════════════════════════╝");
  } else {
    console.log("\n   ⚠️  Update DEPLOYED addresses in this script after deployment!");
    console.log("   Then run again to see full system status.");
  }

  console.log("\n   📖 ETHERSCAN LINKS:");
  console.log("      Chainlink: https://etherscan.io/address/" + MAINNET_ORACLES.chainlink);
  console.log("      Pyth:      https://etherscan.io/address/" + MAINNET_ORACLES.pyth);
  if (DEPLOYED.guardianOracleV2 !== "YOUR_GUARDIAN_ADDRESS") {
    console.log("      Guardian:  https://etherscan.io/address/" + DEPLOYED.guardianOracleV2);
  }

  console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                                                                       ║");
  console.log("║   🌐 THE BLOCKS - LIVE ON ETHEREUM MAINNET 🌐                         ║");
  console.log("║                                                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
