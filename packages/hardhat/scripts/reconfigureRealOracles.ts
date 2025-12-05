import { ethers } from "hardhat";

/**
 * RECONFIGURE WITH REAL WORKING ORACLES
 * 
 * Configure only oracles that actually provide REAL data on Sepolia
 */

const MULTI_ORACLE_ADDRESS = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";

// REAL working addresses on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PYTH_ADDRESS = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
const PYTH_ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║   🔧 RECONFIGURING WITH REAL WORKING ORACLES                          ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);

  // ============================================
  // Step 1: Disable non-working oracles
  // ============================================
  console.log("Step 1: Disabling non-working oracles...");
  
  // Disable DIA (OracleType = 3) - not working on Sepolia
  try {
    const tx1 = await aggregator.disableOracle(3);
    await tx1.wait();
    console.log("   ✅ DIA disabled (not available on Sepolia)");
  } catch (e) {
    console.log("   ⚠️  DIA already disabled or error");
  }
  
  // Disable Uniswap TWAP (OracleType = 4) - pool doesn't exist
  try {
    const tx2 = await aggregator.disableOracle(4);
    await tx2.wait();
    console.log("   ✅ Uniswap TWAP disabled (no pool on Sepolia)");
  } catch (e) {
    console.log("   ⚠️  Uniswap already disabled or error");
  }
  
  // Disable Redstone (OracleType = 2) - pull-based, needs special handling
  try {
    const tx3 = await aggregator.disableOracle(2);
    await tx3.wait();
    console.log("   ✅ Redstone disabled (pull-based, needs SDK)");
  } catch (e) {
    console.log("   ⚠️  Redstone already disabled or error");
  }
  
  console.log("");

  // ============================================
  // Step 2: Verify working oracles are configured
  // ============================================
  console.log("Step 2: Verifying working oracles...");
  
  // Check Chainlink (OracleType = 0)
  const chainlinkConfig = await aggregator.oracleConfigs(0);
  if (chainlinkConfig.oracleAddress !== CHAINLINK_ETH_USD) {
    console.log("   Reconfiguring Chainlink...");
    const feedId = ethers.encodeBytes32String("ETH/USD");
    const tx = await aggregator.configureOracle(0, CHAINLINK_ETH_USD, feedId);
    await tx.wait();
  }
  console.log(`   ✅ Chainlink: ${CHAINLINK_ETH_USD}`);
  
  // Check Pyth (OracleType = 1)
  const pythConfig = await aggregator.oracleConfigs(1);
  if (pythConfig.oracleAddress !== PYTH_ADDRESS) {
    console.log("   Reconfiguring Pyth...");
    const tx = await aggregator.configureOracle(1, PYTH_ADDRESS, PYTH_ETH_USD_ID);
    await tx.wait();
  }
  console.log(`   ✅ Pyth: ${PYTH_ADDRESS}`);
  console.log("");

  // ============================================
  // Step 3: Fetch and display REAL prices
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    REAL LIVE PRICES                                    ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  
  // Chainlink price
  const chainlinkABI = [
    "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
    "function decimals() external view returns (uint8)"
  ];
  const chainlink = new ethers.Contract(CHAINLINK_ETH_USD, chainlinkABI, deployer);
  const [, clAnswer, , clUpdatedAt] = await chainlink.latestRoundData();
  const clDecimals = await chainlink.decimals();
  const chainlinkPrice = Number(clAnswer) / (10 ** Number(clDecimals));
  const clAge = Math.floor(Date.now() / 1000) - Number(clUpdatedAt);
  
  console.log(`   🔗 CHAINLINK ETH/USD: $${chainlinkPrice.toFixed(2)}`);
  console.log(`      Updated: ${clAge} seconds ago`);
  console.log("");
  
  // Pyth price
  const pythABI = [
    "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))"
  ];
  const pyth = new ethers.Contract(PYTH_ADDRESS, pythABI, deployer);
  const pythData = await pyth.getPriceUnsafe(PYTH_ETH_USD_ID);
  const pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
  const pythAge = Math.floor(Date.now() / 1000) - Number(pythData.publishTime);
  
  console.log(`   🐍 PYTH ETH/USD: $${pythPrice.toFixed(2)}`);
  console.log(`      Updated: ${pythAge} seconds ago`);
  console.log(`      Confidence: ±$${(Number(pythData.conf) * Math.pow(10, Number(pythData.expo))).toFixed(2)}`);
  console.log("");

  // Calculate difference
  const priceDiff = Math.abs(chainlinkPrice - pythPrice);
  const priceDiffPercent = (priceDiff / chainlinkPrice) * 100;
  
  console.log(`   📊 Price Difference: $${priceDiff.toFixed(2)} (${priceDiffPercent.toFixed(3)}%)`);
  console.log("");

  // ============================================
  // Final Status
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    FINAL ORACLE STATUS                                 ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  
  const oracleNames = ["Chainlink", "Pyth", "Redstone", "DIA", "Uniswap TWAP"];
  let activeCount = 0;
  
  for (let i = 0; i < 5; i++) {
    const config = await aggregator.oracleConfigs(i);
    const isActive = config.isActive && config.oracleAddress !== ethers.ZeroAddress;
    if (isActive) activeCount++;
    
    const status = isActive ? "✅ ACTIVE (REAL DATA)" : "❌ DISABLED";
    console.log(`   ${i + 1}. ${oracleNames[i].padEnd(15)} ${status}`);
  }
  
  console.log("");
  console.log(`   🛡️  Active Oracles: ${activeCount}/5`);
  console.log(`   🛡️  BFT Threshold: 3/5 - ${activeCount >= 3 ? "⚠️ NOT MET" : "❌ NOT MET"}`);
  console.log("");
  console.log("   ℹ️  NOTE: Only Chainlink and Pyth have REAL live data on Sepolia.");
  console.log("   ℹ️  For 3/5 BFT, we need one more oracle source.");
  console.log("");
  
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`   💰 Gas Spent: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`   💰 Remaining: ${ethers.formatEther(finalBalance)} ETH`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
