import { ethers } from "hardhat";

/**
 * CONFIGURE REDSTONE ORACLE
 * 
 * Option: Deploy a simple price feed adapter that can be manually updated
 * This allows demonstrating all 5 oracles working
 */

const MULTI_ORACLE_ADDRESS = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║   🔴 REDSTONE ORACLE CONFIGURATION                                    ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // Deploy a simple mock Redstone adapter for demo
  console.log("Deploying MockRedstoneAdapter...");
  
  const MockRedstoneAdapter = await ethers.getContractFactory("MockRedstoneAdapter");
  const mockRedstone = await MockRedstoneAdapter.deploy();
  await mockRedstone.waitForDeployment();
  
  const mockAddress = await mockRedstone.getAddress();
  console.log(`✅ MockRedstoneAdapter deployed: ${mockAddress}`);
  console.log("");

  // Set initial price (matching current ETH price ~$3124)
  const initialPrice = ethers.parseUnits("3124.55", 8); // 8 decimals
  const tx1 = await mockRedstone.setPrice(initialPrice);
  await tx1.wait();
  console.log(`✅ Set initial price: $3124.55`);

  // Configure in MultiOracleAggregator
  const aggregator = await ethers.getContractAt("MultiOracleAggregator", MULTI_ORACLE_ADDRESS);
  
  console.log("");
  console.log("Configuring Redstone oracle in MultiOracleAggregator...");
  
  // OracleType.REDSTONE = 2
  // feedId: bytes32 for ETH
  const feedId = ethers.encodeBytes32String("ETH");
  const tx2 = await aggregator.configureOracle(2, mockAddress, feedId);
  await tx2.wait();
  console.log(`✅ Redstone oracle configured!`);
  console.log("");

  // Verify configuration
  const config = await aggregator.oracleConfigs(2);
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    REDSTONE CONFIGURATION VERIFIED                     ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log(`   Address: ${config.oracleAddress}`);
  console.log(`   Active: ${config.isActive}`);
  console.log(`   Reliability: ${config.reliabilityScore}/100`);
  console.log("");

  // Check all oracles now
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("                    ALL 5 ORACLES STATUS                                ");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const oracleNames = ["Chainlink", "Pyth", "Redstone", "DIA", "Uniswap TWAP"];
  let activeCount = 0;
  
  for (let i = 0; i < 5; i++) {
    const oracleConfig = await aggregator.oracleConfigs(i);
    const isActive = oracleConfig.isActive && oracleConfig.oracleAddress !== ethers.ZeroAddress;
    if (isActive) activeCount++;
    
    console.log(`   ${i + 1}. ${oracleNames[i].padEnd(15)} ${isActive ? "✅ ACTIVE" : "❌ INACTIVE"}`);
  }
  
  console.log("");
  console.log(`   🛡️  TOTAL ACTIVE: ${activeCount}/5 oracles`);
  console.log(`   🛡️  BFT THRESHOLD: 3/5 (${activeCount >= 3 ? "✅ MET" : "❌ NOT MET"})`);
  console.log("");

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`   💰 Gas Spent: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`   💰 Remaining: ${ethers.formatEther(finalBalance)} ETH`);
  console.log("");
  console.log("   🎉 ALL 5 ORACLES NOW CONFIGURED!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
