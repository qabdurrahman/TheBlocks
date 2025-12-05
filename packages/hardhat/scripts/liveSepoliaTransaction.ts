import { ethers } from "hardhat";

// Contract addresses on Sepolia
const ADDRESSES = {
  SmartOracleSelector: "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7",
  Chainlink_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  Pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  API3Adapter: "0x21A9B38759414a12Aa6f6503345D6E0194eeD9eD",
};

const PYTH_FEED_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║     🏆 TRI-HACKER TOURNAMENT 2025 - LIVE SEPOLIA TRANSACTION      ║");
  console.log("║        3-Oracle BFT System: Chainlink + Pyth + API3              ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`   Network: Sepolia Testnet (Chain ID: 11155111)`);
  console.log(`   Signer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // Get selector contract
  const selector = await ethers.getContractAt("SmartOracleSelector", ADDRESSES.SmartOracleSelector);

  // ========================================
  // STEP 1: Get Individual Oracle Prices
  // ========================================
  console.log("📊 STEP 1: INDIVIDUAL ORACLE PRICES (Live Data)");
  console.log("───────────────────────────────────────────────────────────────────");
  
  // Chainlink
  const chainlinkAbi = ["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"];
  const chainlink = new ethers.Contract(ADDRESSES.Chainlink_ETH_USD, chainlinkAbi, deployer);
  const [, clAnswer, , clUpdatedAt] = await chainlink.latestRoundData();
  const clAge = Math.floor(Date.now() / 1000) - Number(clUpdatedAt);
  console.log(`   🔗 Chainlink ETH/USD`);
  console.log(`      Price: $${ethers.formatUnits(clAnswer, 8)}`);
  console.log(`      Age: ${clAge} seconds`);
  console.log(`      Contract: ${ADDRESSES.Chainlink_ETH_USD}`);
  
  // Pyth
  console.log("");
  const pythAbi = ["function getPriceUnsafe(bytes32) view returns (tuple(int64, uint64, int32, uint256))"];
  const pyth = new ethers.Contract(ADDRESSES.Pyth, pythAbi, deployer);
  const pythPrice = await pyth.getPriceUnsafe(PYTH_FEED_ID);
  const pythValue = Number(pythPrice[0]) * Math.pow(10, Number(pythPrice[2]));
  const pythAge = Math.floor(Date.now() / 1000) - Number(pythPrice[3]);
  console.log(`   🔮 Pyth Network ETH/USD`);
  console.log(`      Price: $${pythValue.toFixed(2)}`);
  console.log(`      Age: ${pythAge} seconds`);
  console.log(`      Contract: ${ADDRESSES.Pyth}`);
  
  // API3
  console.log("");
  const api3 = new ethers.Contract(ADDRESSES.API3Adapter, chainlinkAbi, deployer);
  const [, api3Answer, , api3UpdatedAt] = await api3.latestRoundData();
  const api3Age = Math.floor(Date.now() / 1000) - Number(api3UpdatedAt);
  console.log(`   📡 API3 dAPI ETH/USD`);
  console.log(`      Price: $${ethers.formatUnits(api3Answer, 8)}`);
  console.log(`      Age: ${api3Age} seconds (${Math.floor(api3Age / 3600)} hours)`);
  console.log(`      Adapter: ${ADDRESSES.API3Adapter}`);
  
  console.log("───────────────────────────────────────────────────────────────────\n");

  // ========================================
  // STEP 2: Execute Real Transaction
  // ========================================
  console.log("🚀 STEP 2: EXECUTING REAL TRANSACTION ON SEPOLIA");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("   Calling selectOptimalOracles(BALANCED) with actual gas...");
  console.log("");
  
  // Execute the transaction (state-changing call)
  const tx = await selector.selectOptimalOracles(3, { // BALANCED = 3
    gasLimit: 500000
  });
  
  console.log(`   📝 Transaction Submitted!`);
  console.log(`   ├── TX Hash: ${tx.hash}`);
  console.log(`   ├── From: ${tx.from}`);
  console.log(`   ├── To: ${tx.to}`);
  console.log(`   ├── Gas Limit: ${tx.gasLimit.toString()}`);
  console.log(`   └── Waiting for confirmation...`);
  console.log("");
  
  // Wait for confirmation
  const receipt = await tx.wait();
  
  console.log(`   ✅ Transaction Confirmed!`);
  console.log(`   ├── Block Number: ${receipt?.blockNumber}`);
  console.log(`   ├── Gas Used: ${receipt?.gasUsed.toString()}`);
  console.log(`   ├── Effective Gas Price: ${ethers.formatUnits(receipt?.gasPrice || 0n, "gwei")} gwei`);
  console.log(`   ├── Transaction Fee: ${ethers.formatEther((receipt?.gasUsed || 0n) * (receipt?.gasPrice || 0n))} ETH`);
  console.log(`   └── Status: ${receipt?.status === 1 ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log("");
  console.log(`   🔗 Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);
  
  console.log("\n═══════════════════════════════════════════════════════════════════\n");

  // ========================================
  // STEP 3: Read Results from Contract State
  // ========================================
  console.log("📋 STEP 3: READING SELECTION RESULTS FROM CONTRACT");
  console.log("───────────────────────────────────────────────────────────────────");
  
  // Read the lastSelection from contract
  const lastSelection = await selector.lastSelection();
  
  console.log(`   💰 Aggregated Price: $${ethers.formatUnits(lastSelection.aggregatedPrice, 8)}`);
  console.log(`   🎯 Confidence: ${lastSelection.confidence}%`);
  console.log(`   📅 Timestamp: ${new Date(Number(lastSelection.timestamp) * 1000).toISOString()}`);
  console.log(`   🎲 Use Case: BALANCED`);
  
  // Also do a staticCall to see detailed selection
  console.log("\n   📊 Oracle Selection Details:");
  const result = await selector.selectOptimalOracles.staticCall(3);
  
  const oracleNames = ["Chainlink", "Pyth", "API3"];
  for (let i = 0; i < result.selectedOracles.length; i++) {
    const oracleType = Number(result.selectedOracles[i]);
    const score = Number(result.scores[i]);
    const name = oracleType < 3 ? oracleNames[oracleType] : `Oracle${oracleType}`;
    console.log(`      ${i + 1}. ${name}: Score ${score}/100`);
  }
  
  console.log("───────────────────────────────────────────────────────────────────\n");

  // ========================================
  // SUMMARY
  // ========================================
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║                    ✅ TRANSACTION SUMMARY                         ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log(`║  TX Hash: ${tx.hash.substring(0, 42)}...  ║`);
  console.log(`║  Aggregated Price: $${ethers.formatUnits(lastSelection.aggregatedPrice, 8).padEnd(20)}           ║`);
  console.log(`║  Confidence: ${lastSelection.confidence}%                                            ║`);
  console.log(`║  Oracles Used: 3 (Chainlink, Pyth, API3)                          ║`);
  console.log(`║  Gas Used: ${receipt?.gasUsed.toString().padEnd(30)}              ║`);
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log("║  🏆 READY FOR TRIHACKER TOURNAMENT 2025 - IIT BOMBAY             ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
