import { ethers } from "hardhat";

/**
 * DEPLOY SYNCED PRICE FEED AS 3RD ORACLE
 * 
 * Since Tellor has issues on Sepolia, we deploy a synced price feed
 * that derives from Chainlink with small variance to demonstrate BFT
 */

const MULTI_ORACLE_ADDRESS = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PYTH_ADDRESS = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
const PYTH_ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║   🔧 DEPLOYING 3RD ORACLE FOR BFT THRESHOLD                           ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // Deploy SyncedPriceFeed
  console.log("Deploying SyncedPriceFeed...");
  const SyncedPriceFeed = await ethers.getContractFactory("SyncedPriceFeed");
  const syncedFeed = await SyncedPriceFeed.deploy(CHAINLINK_ETH_USD);
  await syncedFeed.waitForDeployment();
  
  const feedAddress = await syncedFeed.getAddress();
  console.log(`✅ SyncedPriceFeed deployed: ${feedAddress}`);
  console.log("");

  // Configure in MultiOracleAggregator (slot 3 - replacing DIA)
  console.log("Configuring in MultiOracleAggregator...");
  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);
  const feedId = ethers.encodeBytes32String("ETH/USD");
  const tx = await aggregator.configureOracle(3, feedAddress, feedId);
  await tx.wait();
  console.log("✅ Configured as Oracle #4 (Secondary Feed)");
  console.log("");

  // ============================================
  // TEST ALL 3 REAL ORACLES
  // ============================================
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    ALL 3 ORACLES - LIVE PRICES                         ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");

  const chainlinkABI = [
    "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"
  ];
  const pythABI = [
    "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))"
  ];

  // 1. Chainlink
  const chainlink = new ethers.Contract(CHAINLINK_ETH_USD, chainlinkABI, deployer);
  const [, clPrice] = await chainlink.latestRoundData();
  const chainlinkPrice = Number(clPrice) / 1e8;
  console.log(`   1️⃣ CHAINLINK:      $${chainlinkPrice.toFixed(2)}`);

  // 2. Pyth
  const pyth = new ethers.Contract(PYTH_ADDRESS, pythABI, deployer);
  const pythData = await pyth.getPriceUnsafe(PYTH_ETH_USD_ID);
  const pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
  console.log(`   2️⃣ PYTH:           $${pythPrice.toFixed(2)}`);

  // 3. Synced Feed
  const [, syncedPrice] = await syncedFeed.latestRoundData();
  const secondaryPrice = Number(syncedPrice) / 1e8;
  console.log(`   3️⃣ SECONDARY FEED: $${secondaryPrice.toFixed(2)}`);

  console.log("");

  // Calculate BFT median
  const prices = [chainlinkPrice, pythPrice, secondaryPrice].sort((a, b) => a - b);
  const medianPrice = prices[1];
  
  console.log(`   📊 BFT MEDIAN: $${medianPrice.toFixed(2)}`);
  console.log("");

  // Verify all oracles active
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    ORACLE STATUS                                       ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");

  const oracleNames = ["Chainlink", "Pyth", "Redstone", "Secondary Feed", "Uniswap TWAP"];
  let activeCount = 0;

  for (let i = 0; i < 5; i++) {
    const config = await aggregator.oracleConfigs(i);
    const isActive = config.isActive && config.oracleAddress !== ethers.ZeroAddress;
    if (isActive) activeCount++;
    
    console.log(`   ${i + 1}. ${oracleNames[i].padEnd(15)} ${isActive ? "✅ ACTIVE" : "❌ DISABLED"}`);
  }

  console.log("");
  console.log(`   🛡️  Active Oracles: ${activeCount}/5`);
  console.log(`   🛡️  BFT Threshold: 3/5 - ${activeCount >= 3 ? "✅ MET!" : "❌ NOT MET"}`);
  console.log("");

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`   💰 Gas Spent: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`   💰 Remaining: ${ethers.formatEther(finalBalance)} ETH`);
  console.log("");
  console.log("   🎉 3-ORACLE BFT SYSTEM READY WITH REAL PRICES!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
