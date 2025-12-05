import { ethers } from "hardhat";

async function main() {
  const addr = "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7";
  const abi = [
    "function getConfiguredAdapters() view returns (bool,bool,bool,bool,bool)", 
    "function twapAdapter() view returns (address)",
    "function chainlinkAdapter() view returns (address)",
    "function pythAdapter() view returns (address)",
    "function api3Adapter() view returns (address)",
    "function diaAdapter() view returns (address)"
  ];
  const contract = new ethers.Contract(addr, abi, ethers.provider);
  
  console.log("📋 SmartOracleSelector Status:");
  console.log("═".repeat(50));
  
  const configured = await contract.getConfiguredAdapters();
  console.log("\nAdapter Configuration:");
  console.log("  Chainlink:", configured[0] ? "✅ Configured" : "❌ Not configured");
  console.log("  Pyth:     ", configured[1] ? "✅ Configured" : "❌ Not configured");
  console.log("  API3:     ", configured[2] ? "✅ Configured" : "❌ Not configured");
  console.log("  DIA:      ", configured[3] ? "✅ Configured" : "❌ Not configured");
  console.log("  TWAP:     ", configured[4] ? "✅ Configured" : "❌ Not configured");
  
  console.log("\nAdapter Addresses:");
  console.log("  Chainlink:", await contract.chainlinkAdapter());
  console.log("  Pyth:     ", await contract.pythAdapter());
  console.log("  API3:     ", await contract.api3Adapter());
  console.log("  DIA:      ", await contract.diaAdapter());
  console.log("  TWAP:     ", await contract.twapAdapter());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
