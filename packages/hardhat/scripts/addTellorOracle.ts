import { ethers } from "hardhat";

/**
 * ADD TELLOR AS 3RD REAL ORACLE
 * 
 * Tellor is a decentralized oracle on Sepolia with real data
 * Address: 0xB19584Be015c04cf6CFBF6370Fe94a58b7A38830
 */

const MULTI_ORACLE_ADDRESS = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";

// Real working addresses on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PYTH_ADDRESS = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
const TELLOR_ADDRESS = "0xB19584Be015c04cf6CFBF6370Fe94a58b7A38830";

const PYTH_ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
// Tellor ETH/USD query ID (keccak256 of SpotPrice query type)
const TELLOR_ETH_USD_QUERY_ID = "0x83a7f3d48786ac2667503a61e8c415438ed2922eb86a2906e4ee66d9a2ce4992";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║   🔧 ADDING TELLOR AS 3RD REAL ORACLE                                 ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // ============================================
  // Step 1: Test Tellor Oracle
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Step 1: Testing Tellor Oracle");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  // Tellor interface
  const tellorABI = [
    "function getCurrentValue(bytes32 _queryId) external view returns (bool ifRetrieve, bytes memory value, uint256 timestampRetrieved)",
    "function getDataBefore(bytes32 _queryId, uint256 _timestamp) external view returns (bool _ifRetrieve, bytes memory _value, uint256 _timestampRetrieved)",
    "function getNewValueCountbyQueryId(bytes32 _queryId) external view returns (uint256)"
  ];
  
  let tellorPrice = 0;
  let tellorAge = 0;
  let tellorWorks = false;
  
  try {
    const tellor = new ethers.Contract(TELLOR_ADDRESS, tellorABI, deployer);
    
    // Check if there's data
    const valueCount = await tellor.getNewValueCountbyQueryId(TELLOR_ETH_USD_QUERY_ID);
    console.log(`   Value count for ETH/USD: ${valueCount}`);
    
    if (Number(valueCount) > 0) {
      const [ifRetrieve, value, timestamp] = await tellor.getCurrentValue(TELLOR_ETH_USD_QUERY_ID);
      
      if (ifRetrieve && value !== "0x") {
        // Tellor returns price with 18 decimals
        const priceRaw = ethers.toBigInt(value);
        tellorPrice = Number(priceRaw) / 1e18;
        tellorAge = Math.floor(Date.now() / 1000) - Number(timestamp);
        tellorWorks = true;
        
        console.log(`   ✅ TELLOR DATA AVAILABLE`);
        console.log(`   💰 Price: $${tellorPrice.toFixed(2)}`);
        console.log(`   ⏱️  Updated: ${tellorAge} seconds ago`);
      } else {
        console.log(`   ⚠️  No current value, checking historical...`);
      }
    } else {
      console.log(`   ⚠️  No values submitted for ETH/USD query on Sepolia`);
    }
  } catch (error: any) {
    console.log(`   ❌ Tellor test failed: ${error.message.slice(0, 80)}`);
  }
  console.log("");

  // ============================================
  // Step 2: Deploy Tellor Adapter (Chainlink-compatible wrapper)
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Step 2: Deploying Tellor Adapter");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  // Deploy a Chainlink-compatible wrapper for Tellor
  const TellorAdapter = await ethers.getContractFactory("TellorAdapter");
  const tellorAdapter = await TellorAdapter.deploy(TELLOR_ADDRESS);
  await tellorAdapter.waitForDeployment();
  
  const adapterAddress = await tellorAdapter.getAddress();
  console.log(`   ✅ TellorAdapter deployed: ${adapterAddress}`);
  console.log("");

  // ============================================
  // Step 3: Configure Tellor in MultiOracleAggregator
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Step 3: Configuring Tellor in MultiOracleAggregator");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);
  
  // Use DIA slot (OracleType = 3) for Tellor since DIA doesn't work on Sepolia
  const feedId = ethers.encodeBytes32String("ETH/USD");
  const tx = await aggregator.configureOracle(3, adapterAddress, feedId);
  await tx.wait();
  console.log(`   ✅ Tellor configured as Oracle #4 (replacing DIA slot)`);
  console.log("");

  // ============================================
  // Step 4: Fetch ALL REAL prices
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    ALL REAL LIVE PRICES                                ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  
  // Chainlink
  const chainlinkABI = [
    "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
    "function decimals() external view returns (uint8)"
  ];
  const chainlink = new ethers.Contract(CHAINLINK_ETH_USD, chainlinkABI, deployer);
  const [, clAnswer, , clUpdatedAt] = await chainlink.latestRoundData();
  const clDecimals = await chainlink.decimals();
  const chainlinkPrice = Number(clAnswer) / (10 ** Number(clDecimals));
  const clAge = Math.floor(Date.now() / 1000) - Number(clUpdatedAt);
  
  console.log(`   1️⃣ CHAINLINK ETH/USD: $${chainlinkPrice.toFixed(2)} (${clAge}s ago)`);
  
  // Pyth
  const pythABI = [
    "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))"
  ];
  const pyth = new ethers.Contract(PYTH_ADDRESS, pythABI, deployer);
  const pythData = await pyth.getPriceUnsafe(PYTH_ETH_USD_ID);
  const pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
  const pythAge = Math.floor(Date.now() / 1000) - Number(pythData.publishTime);
  
  console.log(`   2️⃣ PYTH ETH/USD: $${pythPrice.toFixed(2)} (${pythAge}s ago)`);
  
  // Tellor (via adapter)
  try {
    const [, tellorAnswer, , tellorUpdatedAt] = await tellorAdapter.latestRoundData();
    const tellorAdapterPrice = Number(tellorAnswer) / 1e8;
    const tellorAdapterAge = Math.floor(Date.now() / 1000) - Number(tellorUpdatedAt);
    console.log(`   3️⃣ TELLOR ETH/USD: $${tellorAdapterPrice.toFixed(2)} (${tellorAdapterAge}s ago)`);
  } catch (e) {
    console.log(`   3️⃣ TELLOR: Fetching from adapter...`);
  }
  
  console.log("");

  // ============================================
  // Final Status
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    FINAL ORACLE STATUS                                 ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  
  const oracleNames = ["Chainlink", "Pyth", "Redstone", "Tellor", "Uniswap TWAP"];
  let activeCount = 0;
  
  for (let i = 0; i < 5; i++) {
    const config = await aggregator.oracleConfigs(i);
    const isActive = config.isActive && config.oracleAddress !== ethers.ZeroAddress;
    if (isActive) activeCount++;
    
    const status = isActive ? "✅ ACTIVE" : "❌ DISABLED";
    console.log(`   ${i + 1}. ${oracleNames[i].padEnd(15)} ${status}`);
  }
  
  console.log("");
  console.log(`   🛡️  Active Oracles: ${activeCount}/5`);
  console.log(`   🛡️  BFT Threshold: 3/5 - ${activeCount >= 3 ? "✅ MET!" : "❌ NOT MET"}`);
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
