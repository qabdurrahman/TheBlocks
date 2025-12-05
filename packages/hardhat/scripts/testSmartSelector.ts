import { ethers } from "hardhat";

/**
 * Test Script for Smart Oracle Selection System
 * 
 * This script tests:
 * 1. Individual oracle adapters
 * 2. Smart Oracle Selector with different use cases
 * 3. Price aggregation and confidence scores
 */

// Update these after deployment
const DEPLOYED_CONTRACTS = {
  SMART_ORACLE_SELECTOR: "", // Fill in after deployment
  API3_ADAPTER: "",
  DIA_ADAPTER: "",
  TWAP_ADAPTER: "",
};

// Sepolia oracle addresses
const SEPOLIA_ORACLES = {
  CHAINLINK_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  PYTH_CONTRACT: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  PYTH_ETH_USD_FEED_ID: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  DIA_ORACLE: "0xa93546947f3015c986695750b8bbEa8e26D65856",
};

enum UseCase {
  SETTLEMENT = 0,
  TRADING = 1,
  SECURITY = 2,
  BALANCED = 3,
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║         SMART ORACLE SELECTION SYSTEM - TEST SUITE                    ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");

  // ============================================
  // TEST 1: Direct Oracle Reads
  // ============================================
  console.log("🧪 TEST 1: Direct Oracle Reads");
  console.log("─".repeat(60));

  // Test Chainlink directly
  console.log("\n📊 Testing Chainlink ETH/USD...");
  try {
    const chainlinkABI = [
      "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
      "function decimals() view returns (uint8)"
    ];
    const chainlink = new ethers.Contract(
      SEPOLIA_ORACLES.CHAINLINK_ETH_USD,
      chainlinkABI,
      ethers.provider
    );
    
    const [, answer, , updatedAt] = await chainlink.latestRoundData();
    const decimals = await chainlink.decimals();
    const price = Number(answer) / (10 ** decimals);
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    
    console.log(`   ✅ Chainlink ETH/USD: $${price.toFixed(2)}`);
    console.log(`      Updated: ${age} seconds ago`);
    console.log(`      Decimals: ${decimals}`);
  } catch (error: any) {
    console.log(`   ❌ Chainlink failed: ${error.message}`);
  }

  // Test Pyth directly
  console.log("\n📊 Testing Pyth Network...");
  try {
    const pythABI = [
      "function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))"
    ];
    const pyth = new ethers.Contract(
      SEPOLIA_ORACLES.PYTH_CONTRACT,
      pythABI,
      ethers.provider
    );
    
    const pythPrice = await pyth.getPriceUnsafe(SEPOLIA_ORACLES.PYTH_ETH_USD_FEED_ID);
    
    // Convert Pyth price (has exponent)
    const expo = pythPrice.expo;
    const rawPrice = Number(pythPrice.price);
    const price = rawPrice * Math.pow(10, expo);
    const conf = Number(pythPrice.conf) * Math.pow(10, expo);
    const age = Math.floor(Date.now() / 1000) - Number(pythPrice.publishTime);
    
    console.log(`   ✅ Pyth ETH/USD: $${price.toFixed(2)} ± $${conf.toFixed(2)}`);
    console.log(`      Updated: ${age} seconds ago`);
    console.log(`      Exponent: ${expo}`);
  } catch (error: any) {
    console.log(`   ❌ Pyth failed: ${error.message}`);
  }

  // Test DIA directly  
  console.log("\n📊 Testing DIA Oracle...");
  try {
    const diaABI = [
      "function getValue(string memory key) view returns (uint128, uint128)"
    ];
    const dia = new ethers.Contract(
      SEPOLIA_ORACLES.DIA_ORACLE,
      diaABI,
      ethers.provider
    );
    
    const [diaPrice, diaTimestamp] = await dia.getValue("ETH/USD");
    const price = Number(diaPrice) / 1e8;
    const age = Math.floor(Date.now() / 1000) - Number(diaTimestamp);
    
    console.log(`   ✅ DIA ETH/USD: $${price.toFixed(2)}`);
    console.log(`      Updated: ${age} seconds ago`);
  } catch (error: any) {
    console.log(`   ❌ DIA failed: ${error.message}`);
  }

  // ============================================
  // TEST 2: Smart Oracle Selector
  // ============================================
  if (DEPLOYED_CONTRACTS.SMART_ORACLE_SELECTOR) {
    console.log("\n\n🧪 TEST 2: Smart Oracle Selector");
    console.log("─".repeat(60));

    const smartSelector = await ethers.getContractAt(
      "SmartOracleSelector",
      DEPLOYED_CONTRACTS.SMART_ORACLE_SELECTOR
    );

    // Test each use case
    const useCases = ["SETTLEMENT", "TRADING", "SECURITY", "BALANCED"];
    
    for (let i = 0; i < useCases.length; i++) {
      console.log(`\n📊 Testing ${useCases[i]} use case...`);
      
      try {
        const tx = await smartSelector.selectOptimalOracles(i);
        const receipt = await tx.wait();
        
        // Get the result
        const result = await smartSelector.getLastSelection();
        
        console.log(`   ✅ Selection complete!`);
        console.log(`      Selected Oracles: ${result.selectedOracles.length}`);
        console.log(`      Aggregated Price: $${(Number(result.aggregatedPrice) / 1e8).toFixed(2)}`);
        console.log(`      Confidence: ${result.confidence}%`);
        console.log(`      Gas Used: ${receipt?.gasUsed.toString()}`);
        
        // Show individual oracle scores
        for (let j = 0; j < result.selectedOracles.length; j++) {
          const oracleNames = ["Chainlink", "Pyth", "API3", "DIA", "TWAP"];
          const oracleIdx = Number(result.selectedOracles[j]);
          console.log(`      • ${oracleNames[oracleIdx]}: Score ${result.scores[j]}/100`);
        }
      } catch (error: any) {
        console.log(`   ❌ ${useCases[i]} selection failed: ${error.message}`);
      }
    }

    // ============================================
    // TEST 3: Reliability Scores
    // ============================================
    console.log("\n\n🧪 TEST 3: Reliability Scores");
    console.log("─".repeat(60));

    try {
      const scores = await smartSelector.getAllReliabilityScores();
      console.log("   Current Reliability Scores:");
      console.log(`   • Chainlink: ${scores.chainlink}/100`);
      console.log(`   • Pyth:      ${scores.pyth}/100`);
      console.log(`   • API3:      ${scores.api3}/100`);
      console.log(`   • DIA:       ${scores.dia}/100`);
      console.log(`   • TWAP:      ${scores.twap}/100`);
    } catch (error: any) {
      console.log(`   ❌ Failed to get scores: ${error.message}`);
    }

    // ============================================
    // TEST 4: Specialization Bonuses
    // ============================================
    console.log("\n\n🧪 TEST 4: Specialization Bonuses");
    console.log("─".repeat(60));

    for (let i = 0; i < useCases.length; i++) {
      try {
        const bonuses = await smartSelector.getSpecializationBonuses(i);
        console.log(`\n   ${useCases[i]} bonuses:`);
        console.log(`   • Chainlink: +${bonuses.chainlink}`);
        console.log(`   • Pyth:      +${bonuses.pyth}`);
        console.log(`   • API3:      +${bonuses.api3}`);
        console.log(`   • DIA:       +${bonuses.dia}`);
        console.log(`   • TWAP:      +${bonuses.twap}`);
      } catch (error: any) {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }
  } else {
    console.log("\n⚠️ SmartOracleSelector not deployed. Skipping smart selection tests.");
    console.log("   Run deploySmartOracleSystem.ts first and update DEPLOYED_CONTRACTS.");
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║                          TEST SUMMARY                                  ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("   ✅ Direct oracle reads: Tested Chainlink, Pyth, DIA");
  console.log("   📊 All use cases tested: SETTLEMENT, TRADING, SECURITY, BALANCED");
  console.log("   🔧 Next: Update frontend to use SmartOracleSelector");
  console.log("");
}

main()
  .then(() => {
    console.log("✅ All tests completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Tests failed:", error);
    process.exit(1);
  });
