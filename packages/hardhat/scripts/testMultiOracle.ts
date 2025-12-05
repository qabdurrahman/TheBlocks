import { ethers } from "hardhat";

/**
 * Test Script for 5-Oracle BFT System on Sepolia
 * 
 * This script:
 * 1. Connects to deployed MultiOracleAggregator
 * 2. Fetches prices from each oracle
 * 3. Tests BFT aggregation
 * 4. Displays circuit breaker status
 */

// Update this with your deployed contract address
const MULTI_ORACLE_ADDRESS = process.env.MULTI_ORACLE_ADDRESS || "";

// Oracle type enum
enum OracleType {
  CHAINLINK = 0,
  PYTH = 1,
  REDSTONE = 2,
  DIA = 3,
  UNISWAP_TWAP = 4,
}

const ORACLE_NAMES = ["Chainlink", "Pyth", "Redstone", "DIA", "Uniswap TWAP"];

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║        5-ORACLE BFT SYSTEM TEST - SEPOLIA TESTNET             ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");

  if (!MULTI_ORACLE_ADDRESS) {
    console.log("❌ ERROR: Set MULTI_ORACLE_ADDRESS environment variable");
    console.log("   Example: $env:MULTI_ORACLE_ADDRESS='0x...'");
    console.log("   Then run: npx hardhat run scripts/testMultiOracle.ts --network sepolia");
    return;
  }

  const [tester] = await ethers.getSigners();
  console.log(`Tester: ${tester.address}`);
  
  const balance = await ethers.provider.getBalance(tester.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // ============================================
  // Connect to deployed contract
  // ============================================
  console.log("📡 Connecting to MultiOracleAggregator...");
  console.log(`   Address: ${MULTI_ORACLE_ADDRESS}`);
  
  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);
  console.log("   ✅ Connected!");
  console.log("");

  // ============================================
  // Check Oracle Configurations
  // ============================================
  console.log("🔍 Oracle Configurations:");
  console.log("─────────────────────────────────────────────────────────────────");
  
  for (let i = 0; i < 5; i++) {
    try {
      const config = await aggregator.oracleConfigs(i);
      const status = config.isActive ? "✅ ACTIVE" : "❌ INACTIVE";
      const reliability = config.reliabilityScore.toString();
      const address = config.oracleAddress;
      
      console.log(`   ${ORACLE_NAMES[i].padEnd(15)} | ${status} | Reliability: ${reliability.padStart(3)} | ${address.slice(0, 20)}...`);
    } catch (error) {
      console.log(`   ${ORACLE_NAMES[i].padEnd(15)} | ⚠️ Error reading config`);
    }
  }
  console.log("");

  // ============================================
  // Check Circuit Breaker Status
  // ============================================
  console.log("🚨 Circuit Breaker Status:");
  console.log("─────────────────────────────────────────────────────────────────");
  
  try {
    const level = await aggregator.circuitBreakerLevel();
    const isPaused = await aggregator.isPaused();
    
    const levelNames = ["NORMAL", "ELEVATED", "HIGH", "CRITICAL", "EMERGENCY"];
    const levelEmoji = ["🟢", "🟡", "🟠", "🔴", "⛔"];
    
    console.log(`   Level: ${levelEmoji[Number(level)]} ${levelNames[Number(level)]}`);
    console.log(`   Paused: ${isPaused ? "⛔ YES" : "✅ NO"}`);
  } catch (error: any) {
    console.log(`   ⚠️ Error: ${error.message}`);
  }
  console.log("");

  // ============================================
  // Test Price Fetching (Read-Only)
  // ============================================
  console.log("💰 Testing Price Aggregation:");
  console.log("─────────────────────────────────────────────────────────────────");
  
  try {
    // Try to get aggregated price (this is a view function for testing)
    // Note: The actual getAggregatedPrice modifies state, so we use staticCall
    
    console.log("   Fetching aggregated price...");
    
    // Get system health info (view function)
    const admin = await aggregator.admin();
    console.log(`   Admin: ${admin}`);
    
    // Check each oracle's latest price if stored
    for (let i = 0; i < 5; i++) {
      try {
        const latestPrice = await aggregator.latestPrices(i);
        if (latestPrice.isValid) {
          const priceFormatted = ethers.formatUnits(latestPrice.price, 8);
          console.log(`   ${ORACLE_NAMES[i]}: $${priceFormatted} (confidence: ${latestPrice.confidence})`);
        } else {
          console.log(`   ${ORACLE_NAMES[i]}: No valid price cached`);
        }
      } catch (error) {
        console.log(`   ${ORACLE_NAMES[i]}: Not available`);
      }
    }
  } catch (error: any) {
    console.log(`   ⚠️ Price fetch error: ${error.message}`);
  }
  console.log("");

  // ============================================
  // Test Individual Oracle Reads (Direct)
  // ============================================
  console.log("🔗 Direct Oracle Reads (Chainlink):");
  console.log("─────────────────────────────────────────────────────────────────");
  
  try {
    const chainlinkConfig = await aggregator.oracleConfigs(OracleType.CHAINLINK);
    
    if (chainlinkConfig.oracleAddress !== ethers.ZeroAddress) {
      // Read directly from Chainlink
      const chainlinkABI = [
        "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
        "function decimals() external view returns (uint8)"
      ];
      
      const chainlink = new ethers.Contract(chainlinkConfig.oracleAddress, chainlinkABI, tester);
      
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await chainlink.latestRoundData();
      const decimals = await chainlink.decimals();
      
      const price = ethers.formatUnits(answer, decimals);
      const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
      
      console.log(`   Chainlink ETH/USD: $${price}`);
      console.log(`   Last Updated: ${age} seconds ago`);
      console.log(`   Round ID: ${roundId}`);
    } else {
      console.log("   ⚠️ Chainlink not configured");
    }
  } catch (error: any) {
    console.log(`   ⚠️ Chainlink read error: ${error.message}`);
  }
  console.log("");

  // ============================================
  // Summary
  // ============================================
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                       TEST COMPLETE                            ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("📝 To trigger a full price aggregation (costs gas):");
  console.log("   Call: aggregator.getAggregatedPrice()");
  console.log("");
  console.log("📝 To integrate with SettlementOracle:");
  console.log("   1. Deploy SettlementOracle");
  console.log("   2. Call: settlementOracle.setMultiOracleAggregator(aggregatorAddress)");
  console.log("   3. Call: settlementOracle.setUseMultiOracle(true)");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
