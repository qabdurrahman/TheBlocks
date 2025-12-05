import { ethers } from "hardhat";

/**
 * Deploy only the UniswapV3TWAPAdapter
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  
  // Deploy UniswapV3TWAPAdapter with zero address pool (configure later)
  console.log("\n📦 Deploying UniswapV3TWAPAdapter...");
  
  const TWAPAdapter = await ethers.getContractFactory("UniswapV3TWAPAdapter");
  const twap = await TWAPAdapter.deploy(
    ethers.ZeroAddress,  // No pool initially
    "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C"  // Aggregator
  );
  await twap.waitForDeployment();
  
  const twapAddress = await twap.getAddress();
  console.log("✅ UniswapV3TWAPAdapter deployed at:", twapAddress);
  
  // Try to configure pool
  console.log("\n🔧 Configuring Uniswap V3 pool...");
  const POOL = "0x3289680dd4d6c10bb19b899729cda5eef58aeff1"; // USDC/WETH on Sepolia
  
  try {
    const tx = await twap.configurePool(POOL);
    await tx.wait();
    console.log("✅ Pool configured successfully!");
    
    // Read pool info
    const token0 = await twap.token0();
    const token1 = await twap.token1();
    console.log("   Token0:", token0);
    console.log("   Token1:", token1);
    
    // Update SmartOracleSelector with new TWAP adapter
    console.log("\n🔧 Updating SmartOracleSelector...");
    const smartSelectorAddress = "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7";
    
    const SmartSelector = await ethers.getContractFactory("SmartOracleSelector");
    const smartSelector = SmartSelector.attach(smartSelectorAddress);
    
    // Try to set the TWAP adapter
    try {
      const tx2 = await smartSelector.setOracleAdapter(4, twapAddress); // 4 = UNISWAP_TWAP
      await tx2.wait();
      console.log("✅ SmartOracleSelector updated with TWAP adapter!");
    } catch (e: any) {
      console.log("⚠️ Could not update SmartOracleSelector:", e.message?.slice(0, 50));
    }
    
  } catch (e: any) {
    console.log("❌ Pool config failed:", e.message);
  }
  
  console.log("\n📋 SUMMARY:");
  console.log("   UniswapV3TWAPAdapter:", twapAddress);
  console.log("   Pool:", POOL);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
