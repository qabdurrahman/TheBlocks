import { ethers } from "hardhat";

async function main() {
  const provider = ethers.provider;
  const [wallet] = await ethers.getSigners();
  
  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    �� TRANSACTION & GAS FEE REPORT                             ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");
  
  console.log("🔑 Wallet Address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("�� Current Balance:", ethers.formatEther(balance), "ETH\n");
  
  // Contract addresses
  const contracts = {
    "MultiOracleAggregator": "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
    "GuardianOracleV2": "0x71027655D76832eA3d1F056C528485ddE1aec66a",
    "SyncedPriceFeed": "0xa372663b57Ea5FA52c911FE81aa4B54b87AB6c96",
    "AttackSimulator": "0x5FFFeAf6B0b4d1685809959cA4B16E374827a8e2"
  };
  
  console.log("📋 Deployed Contracts:");
  console.log("────────────────────────────────────────────────────────────────────────────────");
  
  for (const [name, address] of Object.entries(contracts)) {
    const code = await provider.getCode(address);
    console.log(`   ${name}: ${address}`);
    console.log(`      Status: ${code.length > 2 ? "✅ Verified On-Chain" : "❌ Not Found"}`);
    console.log(`      Bytecode Size: ${Math.floor((code.length - 2) / 2)} bytes`);
  }
  
  // Get recent blocks to find transactions
  console.log("\n📊 Recent Transactions from Wallet:");
  console.log("────────────────────────────────────────────────────────────────────────────────");
  
  const blockNumber = await provider.getBlockNumber();
  let txCount = 0;
  let totalGasUsed = 0n;
  let totalFees = 0n;
  
  // Search last 20 blocks for our transactions
  for (let i = 0; i < 20 && txCount < 10; i++) {
    try {
      const block = await provider.getBlock(blockNumber - i, true);
      if (!block || !block.prefetchedTransactions) continue;
      
      for (const tx of block.prefetchedTransactions) {
        if (tx.from.toLowerCase() === wallet.address.toLowerCase()) {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          if (!receipt) continue;
          
          txCount++;
          const gasUsed = receipt.gasUsed;
          const gasPrice = tx.gasPrice || tx.maxFeePerGas || 0n;
          const fee = gasUsed * gasPrice;
          
          totalGasUsed += gasUsed;
          totalFees += fee;
          
          console.log(`\n   TX #${txCount}:`);
          console.log(`      Hash: ${tx.hash}`);
          console.log(`      Block: ${receipt.blockNumber}`);
          console.log(`      Gas Used: ${gasUsed.toLocaleString()}`);
          console.log(`      Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
          console.log(`      Fee: ${ethers.formatEther(fee)} ETH`);
          
          if (receipt.contractAddress) {
            console.log(`      📦 Contract Created: ${receipt.contractAddress}`);
          }
          console.log(`      Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);
          console.log(`      🔗 https://sepolia.etherscan.io/tx/${tx.hash}`);
        }
      }
    } catch (e) {
      // Skip block errors
    }
  }
  
  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                           📊 SUMMARY                                          ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝");
  console.log(`   Transactions Found: ${txCount}`);
  console.log(`   Total Gas Used: ${totalGasUsed.toLocaleString()}`);
  console.log(`   Total Fees Paid: ${ethers.formatEther(totalFees)} ETH`);
  console.log(`   Remaining Balance: ${ethers.formatEther(balance)} ETH`);
}

main().catch(console.error);
