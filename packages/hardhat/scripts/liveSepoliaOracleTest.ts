import { ethers } from "hardhat";

/**
 * LIVE SEPOLIA ORACLE TEST
 * Tests the deployed 5-Oracle Smart Selection System on Sepolia
 * 
 * TriHacker Tournament 2025 - Championship Verification
 */

// DEPLOYED CONTRACT ADDRESSES (from our deployment)
const DEPLOYED = {
  SmartOracleSelector: "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7",
  API3Adapter: "0x21A9B38759414a12Aa6f6503345D6E0194eeD9eD",
  DIAAdapter: "0x5a9e0cC4DE88E6c798eF53660B91040B75B39b71",
  UniswapV3TWAPAdapter: "0x10bBce345F567f4318Ca1925009123Bcd2012acd",
};

// SEPOLIA ORACLE ADDRESSES
const ORACLES = {
  Chainlink_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  Pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  Pyth_ETH_USD_ID: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  DIA: "0xa93546947f3015c986695750b8bbEa8e26D65856",
  Uniswap_V3_Pool: "0x3289680dd4d6c10bb19b899729cda5eef58aeff1",
};

enum UseCase {
  SETTLEMENT = 0,
  TRADING = 1,
  SECURITY = 2,
  BALANCED = 3,
}

const USE_CASE_NAMES = ["SETTLEMENT", "TRADING", "SECURITY", "BALANCED"];
const ORACLE_NAMES = ["Chainlink", "Pyth", "API3", "DIA", "TWAP"];

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║       🏆 TRIHACKER 2025 - LIVE SEPOLIA ORACLE VERIFICATION 🏆             ║");
  console.log("║                  5-Oracle Smart Selection System                          ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝");
  console.log("");

  const [signer] = await ethers.getSigners();
  console.log(`📍 Test Wallet: ${signer.address}`);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // ============================================================================
  // PART 1: TEST INDIVIDUAL ORACLES
  // ============================================================================
  console.log("━".repeat(75));
  console.log("📊 PART 1: INDIVIDUAL ORACLE TESTS");
  console.log("━".repeat(75));

  const oracleResults: { name: string; price: number; status: string; age: number }[] = [];

  // 1.1 Test Chainlink
  console.log("\n[1/5] 🔗 Testing Chainlink ETH/USD...");
  try {
    const chainlink = new ethers.Contract(
      ORACLES.Chainlink_ETH_USD,
      [
        "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
        "function decimals() view returns (uint8)"
      ],
      ethers.provider
    );
    
    const [, answer, , updatedAt] = await chainlink.latestRoundData();
    const decimals = await chainlink.decimals();
    const price = Number(answer) / (10 ** Number(decimals));
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    
    console.log(`      ✅ Price: $${price.toFixed(2)}`);
    console.log(`      ⏱️  Age: ${age}s`);
    oracleResults.push({ name: "Chainlink", price, status: "✅", age });
  } catch (error: any) {
    console.log(`      ❌ Failed: ${error.message.slice(0, 50)}`);
    oracleResults.push({ name: "Chainlink", price: 0, status: "❌", age: -1 });
  }

  // 1.2 Test Pyth
  console.log("\n[2/5] 🐍 Testing Pyth Network...");
  try {
    const pyth = new ethers.Contract(
      ORACLES.Pyth,
      ["function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))"],
      ethers.provider
    );
    
    const pythPrice = await pyth.getPriceUnsafe(ORACLES.Pyth_ETH_USD_ID);
    const expo = Number(pythPrice.expo);
    const rawPrice = Number(pythPrice.price);
    const price = rawPrice * Math.pow(10, expo);
    const conf = Number(pythPrice.conf) * Math.pow(10, expo);
    const age = Math.floor(Date.now() / 1000) - Number(pythPrice.publishTime);
    
    console.log(`      ✅ Price: $${price.toFixed(2)} ± $${conf.toFixed(2)}`);
    console.log(`      ⏱️  Age: ${age}s`);
    oracleResults.push({ name: "Pyth", price, status: "✅", age });
  } catch (error: any) {
    console.log(`      ❌ Failed: ${error.message.slice(0, 50)}`);
    oracleResults.push({ name: "Pyth", price: 0, status: "❌", age: -1 });
  }

  // 1.3 Test API3 Adapter
  console.log("\n[3/5] 🔵 Testing API3 Adapter...");
  try {
    const api3 = new ethers.Contract(
      DEPLOYED.API3Adapter,
      [
        "function getLatestPrice() view returns (uint256 price, uint256 confidence, uint256 timestamp)",
        "function isHealthy() view returns (bool)"
      ],
      ethers.provider
    );
    
    const healthy = await api3.isHealthy();
    const [price, confidence, timestamp] = await api3.getLatestPrice();
    const priceNum = Number(price) / 1e8;
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    
    console.log(`      ${healthy ? "✅" : "⚠️"} Price: $${priceNum.toFixed(2)}`);
    console.log(`      ⏱️  Age: ${age}s | Confidence: ${Number(confidence)}%`);
    oracleResults.push({ name: "API3", price: priceNum, status: healthy ? "✅" : "⚠️", age });
  } catch (error: any) {
    console.log(`      ❌ Failed: ${error.message.slice(0, 50)}`);
    oracleResults.push({ name: "API3", price: 0, status: "❌", age: -1 });
  }

  // 1.4 Test DIA Adapter
  console.log("\n[4/5] 💎 Testing DIA Adapter...");
  try {
    const dia = new ethers.Contract(
      DEPLOYED.DIAAdapter,
      [
        "function getLatestPrice() view returns (uint256 price, uint256 confidence, uint256 timestamp)",
        "function isHealthy() view returns (bool)"
      ],
      ethers.provider
    );
    
    const healthy = await dia.isHealthy();
    const [price, confidence, timestamp] = await dia.getLatestPrice();
    const priceNum = Number(price) / 1e8;
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    
    console.log(`      ${healthy ? "✅" : "⚠️"} Price: $${priceNum.toFixed(2)}`);
    console.log(`      ⏱️  Age: ${age}s | Confidence: ${Number(confidence)}%`);
    oracleResults.push({ name: "DIA", price: priceNum, status: healthy ? "✅" : "⚠️", age });
  } catch (error: any) {
    console.log(`      ❌ Failed: ${error.message.slice(0, 50)}`);
    oracleResults.push({ name: "DIA", price: 0, status: "❌", age: -1 });
  }

  // 1.5 Test TWAP Adapter
  console.log("\n[5/5] 📈 Testing Uniswap V3 TWAP Adapter...");
  try {
    const twap = new ethers.Contract(
      DEPLOYED.UniswapV3TWAPAdapter,
      [
        "function getLatestPrice() view returns (uint256 price, uint256 confidence, uint256 timestamp)",
        "function isHealthy() view returns (bool)",
        "function getTWAPPrices() view returns (uint256 fiveMin, uint256 thirtyMin, uint256 oneHour)"
      ],
      ethers.provider
    );
    
    const healthy = await twap.isHealthy();
    const [price, confidence, timestamp] = await twap.getLatestPrice();
    const priceNum = Number(price) / 1e8;
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    
    // Get TWAP breakdowns
    try {
      const [fiveMin, thirtyMin, oneHour] = await twap.getTWAPPrices();
      console.log(`      ${healthy ? "✅" : "⚠️"} Price: $${priceNum.toFixed(2)}`);
      console.log(`      📊 TWAP: 5m=$${(Number(fiveMin)/1e8).toFixed(2)} | 30m=$${(Number(thirtyMin)/1e8).toFixed(2)} | 1h=$${(Number(oneHour)/1e8).toFixed(2)}`);
    } catch {
      console.log(`      ${healthy ? "✅" : "⚠️"} Price: $${priceNum.toFixed(2)}`);
    }
    console.log(`      ⏱️  Age: ${age}s | Confidence: ${Number(confidence)}%`);
    oracleResults.push({ name: "TWAP", price: priceNum, status: healthy ? "✅" : "⚠️", age });
  } catch (error: any) {
    console.log(`      ❌ Failed: ${error.message.slice(0, 50)}`);
    oracleResults.push({ name: "TWAP", price: 0, status: "❌", age: -1 });
  }

  // ============================================================================
  // PART 2: TEST SMART ORACLE SELECTOR
  // ============================================================================
  console.log("\n" + "━".repeat(75));
  console.log("🧠 PART 2: SMART ORACLE SELECTOR");
  console.log("━".repeat(75));

  const selectorABI = [
    "function selectOptimalOracles(uint8 useCase) view returns (uint8[] memory selectedOracles, uint256 aggregatedPrice, uint256 confidence, uint256 timestamp)",
    "function getOracleScore(uint8 oracleType, uint8 useCase) view returns (uint256 score)",
    "function getTotalActiveOracles() view returns (uint256)",
    "function getSystemHealth() view returns (uint256 activeOracles, uint256 avgConfidence, bool isHealthy)"
  ];

  try {
    const selector = new ethers.Contract(
      DEPLOYED.SmartOracleSelector,
      selectorABI,
      ethers.provider
    );

    // 2.1 System Health
    console.log("\n📈 System Health:");
    const [activeOracles, avgConfidence, isHealthy] = await selector.getSystemHealth();
    console.log(`   Active Oracles: ${activeOracles}/5`);
    console.log(`   Avg Confidence: ${avgConfidence}%`);
    console.log(`   System Status: ${isHealthy ? "✅ HEALTHY" : "⚠️ DEGRADED"}`);

    // 2.2 Test each use case
    console.log("\n🎯 Use Case Selection Results:");
    console.log("─".repeat(60));

    for (let useCase = 0; useCase < 4; useCase++) {
      console.log(`\n   ${USE_CASE_NAMES[useCase]}:`);
      try {
        const [selected, price, confidence] = await selector.selectOptimalOracles(useCase);
        
        const selectedNames = selected.map((idx: number) => ORACLE_NAMES[idx] || `Oracle${idx}`);
        const priceUSD = Number(price) / 1e8;
        
        console.log(`      Selected: [${selectedNames.join(", ")}]`);
        console.log(`      BFT Median Price: $${priceUSD.toFixed(2)}`);
        console.log(`      Confidence: ${confidence}%`);

        // Get individual scores
        console.log(`      Scores:`);
        for (let i = 0; i < 5; i++) {
          try {
            const score = await selector.getOracleScore(i, useCase);
            console.log(`         ${ORACLE_NAMES[i]}: ${score}/100`);
          } catch {
            // Skip if oracle not available
          }
        }
      } catch (error: any) {
        console.log(`      ❌ Selection failed: ${error.message.slice(0, 50)}`);
      }
    }

  } catch (error: any) {
    console.log(`\n❌ SmartOracleSelector failed: ${error.message.slice(0, 100)}`);
  }

  // ============================================================================
  // PART 3: SUMMARY
  // ============================================================================
  console.log("\n" + "━".repeat(75));
  console.log("📋 TEST SUMMARY");
  console.log("━".repeat(75));

  console.log("\n┌────────────┬──────────────┬────────┬───────────┐");
  console.log("│   Oracle   │    Price     │ Status │    Age    │");
  console.log("├────────────┼──────────────┼────────┼───────────┤");
  
  for (const result of oracleResults) {
    const priceStr = result.price > 0 ? `$${result.price.toFixed(2)}` : "N/A";
    const ageStr = result.age >= 0 ? `${result.age}s` : "N/A";
    console.log(`│ ${result.name.padEnd(10)} │ ${priceStr.padEnd(12)} │   ${result.status}   │ ${ageStr.padEnd(9)} │`);
  }
  console.log("└────────────┴──────────────┴────────┴───────────┘");

  const working = oracleResults.filter(r => r.status === "✅").length;
  const partial = oracleResults.filter(r => r.status === "⚠️").length;
  
  console.log(`\n✅ Working: ${working}/5`);
  console.log(`⚠️  Partial: ${partial}/5`);
  console.log(`❌ Failed: ${5 - working - partial}/5`);

  // BFT calculation
  if (working >= 3) {
    const prices = oracleResults.filter(r => r.price > 0).map(r => r.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    console.log(`\n🏆 BFT Median Price: $${median.toFixed(2)}`);
    console.log(`   (Can tolerate ${Math.floor((prices.length - 1) / 3)} Byzantine oracles)`);
  }

  console.log("\n" + "═".repeat(75));
  console.log("🎉 LIVE SEPOLIA ORACLE TEST COMPLETE");
  console.log("═".repeat(75));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
