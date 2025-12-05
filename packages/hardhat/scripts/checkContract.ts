import { ethers } from "hardhat";

async function main() {
  console.log("Checking contract on Sepolia...\n");
  
  const contractAddress = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";
  const walletAddress = "0x74dDa086DefBFE113E387e70f0304631972525E5";
  
  // Check if contract exists
  const code = await ethers.provider.getCode(contractAddress);
  console.log("Contract code exists:", code.length > 2);
  console.log("Bytecode length:", code.length, "characters");
  
  // Check wallet balance
  const balance = await ethers.provider.getBalance(walletAddress);
  console.log("\nWallet balance:", ethers.formatEther(balance), "ETH");
  
  // Get transaction count (nonce)
  const nonce = await ethers.provider.getTransactionCount(walletAddress);
  console.log("Wallet transaction count (nonce):", nonce);
  
  // Try to interact with contract
  if (code.length > 2) {
    console.log("\n✅ Contract is DEPLOYED and has code!");
    console.log("\nNote: Etherscan may take a few minutes to index new contracts.");
    console.log("Your contract is LIVE on the blockchain even if Etherscan hasn't indexed it yet.");
  } else {
    console.log("\n❌ No contract found at this address");
  }
}

main().catch(console.error);
