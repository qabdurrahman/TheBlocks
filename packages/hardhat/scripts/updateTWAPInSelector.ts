import { ethers } from "hardhat";

/**
 * Update SmartOracleSelector with the new TWAP adapter
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const smartSelectorAddress = "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7";
  const twapAdapterAddress = "0x10bBce345F567f4318Ca1925009123Bcd2012acd";
  
  // Get the SmartOracleSelector contract
  const SmartSelector = await ethers.getContractFactory("SmartOracleSelector");
  const smartSelector = SmartSelector.attach(smartSelectorAddress);
  
  console.log("\n🔧 Updating SmartOracleSelector with TWAP adapter...");
  
  // Call configureAdapters with only the TWAP address (others as zero)
  const tx = await smartSelector.configureAdapters(
    ethers.ZeroAddress,  // Keep chainlink as-is
    ethers.ZeroAddress,  // Keep pyth as-is
    ethers.ZeroHash,     // Keep pyth feed id as-is
    ethers.ZeroAddress,  // Keep api3 as-is
    ethers.ZeroAddress,  // Keep dia as-is
    twapAdapterAddress   // NEW: TWAP adapter
  );
  
  await tx.wait();
  console.log("✅ SmartOracleSelector updated with TWAP adapter!");
  
  // Verify
  const configured = await smartSelector.getConfiguredAdapters();
  console.log("\n📋 Configured Adapters:");
  console.log("   Chainlink:", configured.chainlink);
  console.log("   Pyth:", configured.pyth);
  console.log("   API3:", configured.api3);
  console.log("   DIA:", configured.dia);
  console.log("   TWAP:", configured.twap);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
