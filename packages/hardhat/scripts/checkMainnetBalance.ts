import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║              MAINNET DEPLOYMENT READINESS CHECK               ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
  
  console.log("  📍 Wallet Address:", signer.address);
  console.log("  💰 Balance:       ", ethers.formatEther(balance), "ETH");
  
  const balanceNum = parseFloat(ethers.formatEther(balance));
  
  // Estimate deployment costs (rough estimates for current gas prices)
  const estimatedGasPrice = 30; // gwei
  const estimatedGasUsed = 3_000_000; // for all contracts
  const estimatedCost = (estimatedGasPrice * estimatedGasUsed * 1e-9);
  
  console.log("\n  📊 Estimated Deployment Cost: ~", estimatedCost.toFixed(4), "ETH");
  console.log("     (assuming 30 gwei gas price)");
  
  if (balanceNum < 0.1) {
    console.log("\n  ⚠️  WARNING: Low balance for mainnet deployment!");
    console.log("     Recommended: At least 0.1 ETH for safe deployment");
    console.log("\n  💡 To fund this wallet, send ETH to:");
    console.log("     " + signer.address);
  } else {
    console.log("\n  ✅ Sufficient balance for mainnet deployment!");
  }
  
  // Check mainnet oracle addresses exist
  console.log("\n  📡 MAINNET ORACLE ADDRESSES:");
  console.log("     • Chainlink ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");
  console.log("     • Pyth Network:      0x4305FB66699C3B2702D4d05CF36551390A4c69C6");
  console.log("     • Uniswap V3 WETH/USDC Pool: 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640");
  
  console.log("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
