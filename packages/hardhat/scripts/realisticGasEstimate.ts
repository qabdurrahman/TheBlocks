import { ethers } from "hardhat";

/**
 * REALISTIC MAINNET GAS ESTIMATION
 * Uses multiple gas price scenarios for accurate planning
 */

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║     REALISTIC MAINNET DEPLOYMENT COST ESTIMATION              ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  // Get contract factories
  const MultiOracleAggregator = await ethers.getContractFactory("MultiOracleAggregator");
  const SyncedPriceFeed = await ethers.getContractFactory("SyncedPriceFeed");
  const GuardianOracleV2 = await ethers.getContractFactory("GuardianOracleV2");

  // Estimate gas for each deployment
  const aggregatorTx = await MultiOracleAggregator.getDeployTransaction();
  const syncedTx = await SyncedPriceFeed.getDeployTransaction("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");
  const guardianTx = await GuardianOracleV2.getDeployTransaction("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");

  const aggregatorGas = await ethers.provider.estimateGas({
    data: aggregatorTx.data,
    from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
  });
  
  const syncedGas = await ethers.provider.estimateGas({
    data: syncedTx.data,
    from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
  });
  
  const guardianGas = await ethers.provider.estimateGas({
    data: guardianTx.data,
    from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
  });

  // Total gas for deployments
  const deploymentGas = aggregatorGas + syncedGas + guardianGas;
  
  // Post-deployment transactions (estimates)
  const postDeployGas = 510000n; // setUniswapPool + syncPrice + addCustomOracle + 5x observations
  
  const totalGas = deploymentGas + postDeployGas;

  console.log("   📦 GAS REQUIREMENTS:\n");
  console.log(`   MultiOracleAggregator:   ${aggregatorGas.toLocaleString()} gas`);
  console.log(`   SyncedPriceFeed:         ${syncedGas.toLocaleString()} gas`);
  console.log(`   GuardianOracleV2:        ${guardianGas.toLocaleString()} gas`);
  console.log(`   Post-Deploy Txs:         ${Number(postDeployGas).toLocaleString()} gas`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   TOTAL GAS:               ${Number(totalGas).toLocaleString()} gas\n`);

  // Get current ETH price
  let ethPriceUSD = 3100; // fallback
  try {
    const chainlink = new ethers.Contract(
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"],
      ethers.provider
    );
    const [, ethPrice] = await chainlink.latestRoundData();
    ethPriceUSD = Number(ethPrice) / 1e8;
  } catch (e) {}

  console.log(`   💹 Current ETH Price: $${ethPriceUSD.toFixed(2)}\n`);

  // Calculate costs at different gas prices
  const gasPrices = [
    { label: "Low (off-peak)", gwei: 8 },
    { label: "Normal", gwei: 15 },
    { label: "Busy", gwei: 25 },
    { label: "High", gwei: 40 },
    { label: "Very High", gwei: 60 },
  ];

  console.log("   ╔══════════════════════════════════════════════════════════════════╗");
  console.log("   ║              COST AT DIFFERENT GAS PRICES                        ║");
  console.log("   ╠══════════════════════════════════════════════════════════════════╣");
  console.log("   ║  Scenario         │ Gas Price │   ETH Cost   │   USD Cost      ║");
  console.log("   ╠══════════════════════════════════════════════════════════════════╣");

  for (const { label, gwei } of gasPrices) {
    const gasPriceWei = ethers.parseUnits(gwei.toString(), "gwei");
    const ethCost = Number(totalGas) * Number(gasPriceWei) / 1e18;
    const usdCost = ethCost * ethPriceUSD;
    
    console.log(`   ║  ${label.padEnd(16)} │ ${gwei.toString().padStart(4)} gwei │ ${ethCost.toFixed(6).padStart(12)} │ $${usdCost.toFixed(2).padStart(10)}     ║`);
  }

  console.log("   ╚══════════════════════════════════════════════════════════════════╝");

  // Recommendation
  const recommendedGwei = 20;
  const recommendedGasPrice = ethers.parseUnits(recommendedGwei.toString(), "gwei");
  const recommendedEth = Number(totalGas) * Number(recommendedGasPrice) / 1e18;
  const recommendedWithBuffer = recommendedEth * 1.3; // 30% buffer
  const recommendedUSD = recommendedWithBuffer * ethPriceUSD;

  console.log("\n   ═══════════════════════════════════════════════════════════════════");
  console.log("                          RECOMMENDATION");
  console.log("   ═══════════════════════════════════════════════════════════════════\n");
  
  console.log(`   Based on typical mainnet conditions (~${recommendedGwei} gwei):\n`);
  console.log(`   ┌───────────────────────────────────────────────────────────────┐`);
  console.log(`   │  💰 Minimum Required:     ${recommendedEth.toFixed(4)} ETH  (~$${(recommendedEth * ethPriceUSD).toFixed(2)})        │`);
  console.log(`   │  💰 With 30% Buffer:      ${recommendedWithBuffer.toFixed(4)} ETH  (~$${recommendedUSD.toFixed(2)})        │`);
  console.log(`   │  💰 RECOMMENDED:          ${(recommendedWithBuffer + 0.005).toFixed(4)} ETH  (~$${((recommendedWithBuffer + 0.005) * ethPriceUSD).toFixed(2)})        │`);
  console.log(`   └───────────────────────────────────────────────────────────────┘`);
  
  console.log("\n   ⚠️  Gas prices fluctuate. Check https://etherscan.io/gastracker");
  console.log("      before deploying for current rates.\n");
  
  console.log("   📍 Send ETH to: 0x74dDa086DefBFE113E387e70f0304631972525E5\n");

  console.log("   ╔══════════════════════════════════════════════════════════════════╗");
  console.log("   ║                    QUICK REFERENCE                               ║");
  console.log("   ╠══════════════════════════════════════════════════════════════════╣");
  console.log(`   ║  🟢 If gas is LOW (<10 gwei):     Send ~0.07 ETH (~$${(0.07 * ethPriceUSD).toFixed(0)})      ║`);
  console.log(`   ║  🟡 If gas is NORMAL (10-25 gwei): Send ~0.15 ETH (~$${(0.15 * ethPriceUSD).toFixed(0)})     ║`);
  console.log(`   ║  🔴 If gas is HIGH (>30 gwei):    Send ~0.25 ETH (~$${(0.25 * ethPriceUSD).toFixed(0)})     ║`);
  console.log("   ╚══════════════════════════════════════════════════════════════════╝\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
