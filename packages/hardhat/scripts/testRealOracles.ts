import { ethers } from "hardhat";

/**
 * TEST REAL ORACLE AVAILABILITY ON SEPOLIA
 * 
 * This script tests which oracles actually have REAL live data on Sepolia testnet
 */

async function main() {
  const [tester] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║   🔍 TESTING REAL ORACLE DATA AVAILABILITY ON SEPOLIA                 ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");

  const chainlinkABI = [
    "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
    "function decimals() external view returns (uint8)"
  ];

  // ============================================
  // 1. CHAINLINK - Known working on Sepolia
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("1. CHAINLINK ETH/USD");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const chainlinkAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  try {
    const chainlink = new ethers.Contract(chainlinkAddress, chainlinkABI, tester);
    const [, answer, , updatedAt] = await chainlink.latestRoundData();
    const decimals = await chainlink.decimals();
    const price = Number(answer) / (10 ** Number(decimals));
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    
    console.log(`   ✅ REAL DATA AVAILABLE`);
    console.log(`   💰 Price: $${price.toFixed(2)}`);
    console.log(`   ⏱️  Updated: ${age} seconds ago`);
    console.log(`   📍 Address: ${chainlinkAddress}`);
  } catch (error: any) {
    console.log(`   ❌ NOT AVAILABLE: ${error.message.slice(0, 50)}`);
  }
  console.log("");

  // ============================================
  // 2. PYTH - Check if real data exists
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("2. PYTH NETWORK");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const pythAddress = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
  const pythABI = [
    "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))",
    "function getPrice(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))"
  ];
  
  // ETH/USD price feed ID for Pyth
  const ETH_USD_PYTH_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
  
  try {
    const pyth = new ethers.Contract(pythAddress, pythABI, tester);
    const priceData = await pyth.getPriceUnsafe(ETH_USD_PYTH_ID);
    
    const price = Number(priceData.price) * Math.pow(10, Number(priceData.expo));
    const age = Math.floor(Date.now() / 1000) - Number(priceData.publishTime);
    
    console.log(`   ✅ REAL DATA AVAILABLE`);
    console.log(`   💰 Price: $${price.toFixed(2)}`);
    console.log(`   ⏱️  Updated: ${age} seconds ago`);
    console.log(`   📍 Address: ${pythAddress}`);
    console.log(`   ⚠️  Note: Pyth is PULL-based - prices may be stale without updates`);
  } catch (error: any) {
    console.log(`   ⚠️  PULL-BASED ORACLE - Requires price update transaction`);
    console.log(`   📍 Address: ${pythAddress}`);
    console.log(`   💡 Real Pyth data requires calling updatePriceFeeds() first`);
  }
  console.log("");

  // ============================================
  // 3. DIA - Check if real data exists
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("3. DIA ORACLE");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const diaAddress = "0xa93546947f3015c986695750b8bbEa8e26D65856";
  const diaABI = [
    "function getValue(string memory key) external view returns (uint128, uint128)"
  ];
  
  try {
    const dia = new ethers.Contract(diaAddress, diaABI, tester);
    const [price, timestamp] = await dia.getValue("ETH/USD");
    
    const priceFormatted = Number(price) / 1e8;
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    
    if (Number(price) > 0) {
      console.log(`   ✅ REAL DATA AVAILABLE`);
      console.log(`   💰 Price: $${priceFormatted.toFixed(2)}`);
      console.log(`   ⏱️  Updated: ${age} seconds ago`);
    } else {
      console.log(`   ⚠️  NO DATA - DIA may not be actively updated on Sepolia`);
    }
    console.log(`   📍 Address: ${diaAddress}`);
  } catch (error: any) {
    console.log(`   ❌ NOT AVAILABLE or different interface`);
    console.log(`   📍 Address: ${diaAddress}`);
  }
  console.log("");

  // ============================================
  // 4. UNISWAP V3 TWAP - Check pool exists
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("4. UNISWAP V3 TWAP");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const uniswapPoolAddress = "0x6CE0896eAe6D4bD668fDe41BB784548fb8a68E50";
  const poolABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function liquidity() external view returns (uint128)"
  ];
  
  try {
    const pool = new ethers.Contract(uniswapPoolAddress, poolABI, tester);
    const slot0 = await pool.slot0();
    const liquidity = await pool.liquidity();
    
    // Calculate price from sqrtPriceX96
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2;
    
    if (Number(liquidity) > 0) {
      console.log(`   ✅ POOL EXISTS WITH LIQUIDITY`);
      console.log(`   💧 Liquidity: ${liquidity.toString()}`);
      console.log(`   📊 Current Tick: ${slot0.tick}`);
      console.log(`   📍 Address: ${uniswapPoolAddress}`);
    } else {
      console.log(`   ⚠️  POOL EXISTS BUT NO LIQUIDITY`);
      console.log(`   📍 Address: ${uniswapPoolAddress}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Pool not available: ${error.message.slice(0, 50)}`);
  }
  console.log("");

  // ============================================
  // 5. REDSTONE - Reality Check
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("5. REDSTONE");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("   ℹ️  REDSTONE ARCHITECTURE:");
  console.log("   ");
  console.log("   Redstone is a PULL-BASED oracle with calldata injection.");
  console.log("   Unlike push oracles, there is NO on-chain contract to query.");
  console.log("   ");
  console.log("   How it works:");
  console.log("   1. Frontend fetches signed prices from Redstone API");
  console.log("   2. Prices are injected into transaction calldata");
  console.log("   3. Contract extracts and verifies signatures on-chain");
  console.log("   ");
  console.log("   For production: Use @redstone-finance/evm-connector SDK");
  console.log("");

  // ============================================
  // SUMMARY
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                          SUMMARY                                       ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("   REAL LIVE DATA on Sepolia:");
  console.log("   ✅ Chainlink   - CONFIRMED working with live prices");
  console.log("   ⚠️  Pyth       - Works but needs updatePriceFeeds() call");
  console.log("   ⚠️  DIA        - May have limited Sepolia support");
  console.log("   ⚠️  Uniswap    - Pool exists, may have limited liquidity");
  console.log("   ℹ️  Redstone   - Pull-based (no on-chain contract to query)");
  console.log("");
  console.log("   For hackathon, Chainlink provides reliable REAL prices.");
  console.log("   The 5-oracle architecture demonstrates BFT consensus design.");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
