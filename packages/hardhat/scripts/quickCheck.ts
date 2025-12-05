import { ethers } from "hardhat";

async function main() {
  console.log("Checking SmartOracleSelector...");
  
  const selector = await ethers.getContractAt(
    "SmartOracleSelector", 
    "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7"
  );
  
  // Check configured adapters
  const adapters = await selector.getConfiguredAdapters();
  console.log("\nConfigured Adapters:");
  console.log(`  Chainlink: ${adapters.hasChainlink}`);
  console.log(`  Pyth: ${adapters.hasPyth}`);
  console.log(`  API3: ${adapters.hasAPI3}`);
  console.log(`  DIA: ${adapters.hasDIA}`);
  console.log(`  TWAP: ${adapters.hasTWAP}`);
  
  // Get reliability scores
  const scores = await selector.getAllReliabilityScores();
  console.log("\nReliability Scores:");
  console.log(`  Chainlink: ${scores[0]}`);
  console.log(`  Pyth: ${scores[1]}`);
  console.log(`  API3: ${scores[2]}`);
  console.log(`  DIA: ${scores[3]}`);
  console.log(`  TWAP: ${scores[4]}`);
  
  // Try selection with static call first
  console.log("\nTrying BALANCED selection (staticCall)...");
  try {
    const result = await selector.selectOptimalOracles.staticCall(3); // BALANCED
    console.log(`  Result struct:`, result);
    console.log(`  Selected oracles: ${result.selectedOracles}`);
    console.log(`  Aggregated price: $${Number(result.aggregatedPrice) / 1e8}`);
    console.log(`  Confidence: ${result.confidence}%`);
  } catch (e: any) {
    console.log(`  Selection failed: ${e.message.slice(0, 200)}`);
  }
  
  // Get last selection
  console.log("\nGetting last selection...");
  try {
    const last = await selector.getLastSelection();
    console.log(`  Selected: ${last.selectedOracles}`);
    console.log(`  Price: $${Number(last.aggregatedPrice) / 1e8}`);
    console.log(`  Confidence: ${last.confidence}%`);
  } catch (e: any) {
    console.log(`  Failed: ${e.message.slice(0, 100)}`);
  }
}

main().catch(console.error);
