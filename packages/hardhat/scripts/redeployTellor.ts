import { ethers } from "hardhat";

/**
 * REDEPLOY TELLOR ADAPTER WITH FIX
 */

const MULTI_ORACLE_ADDRESS = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";
const TELLOR_ADDRESS = "0xB19584Be015c04cf6CFBF6370Fe94a58b7A38830";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Redeploying TellorAdapter...");
  
  const TellorAdapter = await ethers.getContractFactory("TellorAdapter");
  const adapter = await TellorAdapter.deploy(TELLOR_ADDRESS);
  await adapter.waitForDeployment();
  
  const adapterAddress = await adapter.getAddress();
  console.log(`✅ TellorAdapter deployed: ${adapterAddress}`);
  
  // Update the price to current market price
  const currentPrice = 3135 * 1e8; // $3135 with 8 decimals
  const tx1 = await adapter.updateFallbackPrice(currentPrice);
  await tx1.wait();
  console.log("✅ Fallback price set to $3135");
  
  // Configure in aggregator
  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);
  const feedId = ethers.encodeBytes32String("ETH/USD");
  const tx2 = await aggregator.configureOracle(3, adapterAddress, feedId);
  await tx2.wait();
  console.log("✅ Configured in MultiOracleAggregator");
  
  // Test it
  const [, answer, , updatedAt] = await adapter.latestRoundData();
  console.log(`\n💰 Tellor Price: $${Number(answer) / 1e8}`);
  console.log(`⏱️  Updated: ${Math.floor(Date.now() / 1000) - Number(updatedAt)}s ago`);
}

main().catch(console.error);
