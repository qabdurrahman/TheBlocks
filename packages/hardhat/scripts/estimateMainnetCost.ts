import { ethers } from "hardhat";

/**
 * ACCURATE MAINNET GAS ESTIMATION
 * Estimates deployment costs using actual contract bytecode and current gas prices
 */

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║        ACCURATE MAINNET DEPLOYMENT COST ESTIMATION            ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  // Get current mainnet gas price
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("30", "gwei");
  const gasPriceGwei = Number(ethers.formatUnits(gasPrice, "gwei"));
  
  console.log("   📊 Current Mainnet Gas Price:", gasPriceGwei.toFixed(2), "gwei\n");

  // Get contract factories and estimate deployment gas
  const contracts = [
    { name: "MultiOracleAggregator", factory: await ethers.getContractFactory("MultiOracleAggregator") },
    { name: "SyncedPriceFeed", factory: await ethers.getContractFactory("SyncedPriceFeed") },
    { name: "GuardianOracleV2", factory: await ethers.getContractFactory("GuardianOracleV2") },
  ];

  let totalGas = 0n;
  const estimates: { name: string; gas: bigint; eth: string }[] = [];

  console.log("   📦 CONTRACT DEPLOYMENT GAS ESTIMATES:\n");
  console.log("   ┌────────────────────────────────────────────────────────────┐");

  for (const { name, factory } of contracts) {
    // Get bytecode size
    const bytecode = factory.bytecode;
    const bytecodeSize = (bytecode.length - 2) / 2; // Remove 0x and divide by 2

    // Estimate deployment gas based on actual constructor signatures
    let deployGas: bigint;
    
    if (name === "MultiOracleAggregator") {
      // Constructor has NO params (empty constructor)
      const deployTx = await factory.getDeployTransaction();
      deployGas = await ethers.provider.estimateGas({
        data: deployTx.data,
        from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
      });
    } else if (name === "SyncedPriceFeed") {
      // Has constructor with 1 param (chainlink address)
      const deployTx = await factory.getDeployTransaction(
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" // Chainlink mainnet
      );
      deployGas = await ethers.provider.estimateGas({
        data: deployTx.data,
        from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
      });
    } else if (name === "GuardianOracleV2") {
      // Has constructor with 1 param (chainlink address)
      const deployTx = await factory.getDeployTransaction(
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" // Chainlink mainnet
      );
      deployGas = await ethers.provider.estimateGas({
        data: deployTx.data,
        from: "0x74dDa086DefBFE113E387e70f0304631972525E5"
      });
    } else {
      deployGas = BigInt(bytecodeSize * 200 + 500000); // Fallback estimate
    }

    const ethCost = ethers.formatEther(deployGas * gasPrice);
    estimates.push({ name, gas: deployGas, eth: ethCost });
    totalGas += deployGas;

    console.log(`   │ ${name.padEnd(25)} │ ${deployGas.toString().padStart(10)} gas │ ${parseFloat(ethCost).toFixed(6)} ETH │`);
  }

  console.log("   └────────────────────────────────────────────────────────────┘");

  // Additional transactions after deployment
  console.log("\n   📝 POST-DEPLOYMENT TRANSACTIONS:\n");
  console.log("   ┌────────────────────────────────────────────────────────────┐");

  const additionalTxs = [
    { name: "setUniswapPool()", gas: 80000n },
    { name: "syncPrice()", gas: 100000n },
    { name: "addCustomOracle()", gas: 80000n },
    { name: "recordPriceObservation() x5", gas: 250000n },
  ];

  let additionalGas = 0n;
  for (const tx of additionalTxs) {
    const ethCost = ethers.formatEther(tx.gas * gasPrice);
    additionalGas += tx.gas;
    console.log(`   │ ${tx.name.padEnd(30)} │ ${tx.gas.toString().padStart(10)} gas │ ${parseFloat(ethCost).toFixed(6)} ETH │`);
  }

  console.log("   └────────────────────────────────────────────────────────────┘");

  // Total calculation
  const totalGasAll = totalGas + additionalGas;
  const totalEth = ethers.formatEther(totalGasAll * gasPrice);
  const bufferEth = parseFloat(totalEth) * 1.2; // 20% buffer for gas price fluctuation

  console.log("\n   ═══════════════════════════════════════════════════════════════");
  console.log("                        TOTAL COST SUMMARY");
  console.log("   ═══════════════════════════════════════════════════════════════\n");

  console.log(`   📊 Gas Price Used:           ${gasPriceGwei.toFixed(2)} gwei`);
  console.log(`   ⛽ Total Gas (Deployments):  ${totalGas.toLocaleString()}`);
  console.log(`   ⛽ Total Gas (Transactions): ${additionalGas.toLocaleString()}`);
  console.log(`   ⛽ TOTAL GAS:                ${totalGasAll.toLocaleString()}`);
  console.log("");
  console.log(`   💰 Estimated Cost:           ${parseFloat(totalEth).toFixed(6)} ETH`);
  console.log(`   💰 With 20% Buffer:          ${bufferEth.toFixed(6)} ETH`);
  
  // Get current ETH price for USD estimate
  try {
    const chainlink = new ethers.Contract(
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"],
      ethers.provider
    );
    const [, ethPrice] = await chainlink.latestRoundData();
    const ethPriceUSD = Number(ethPrice) / 1e8;
    const costUSD = bufferEth * ethPriceUSD;
    
    console.log(`   💵 ETH Price:                $${ethPriceUSD.toFixed(2)}`);
    console.log(`   💵 Estimated USD Cost:       $${costUSD.toFixed(2)}`);
  } catch (e) {
    console.log("   (Could not fetch ETH/USD price for USD estimate)");
  }

  console.log("\n   ╔════════════════════════════════════════════════════════════════╗");
  console.log("   ║                    RECOMMENDED FUNDING                         ║");
  console.log("   ╠════════════════════════════════════════════════════════════════╣");
  console.log(`   ║  Minimum Required:     ${parseFloat(totalEth).toFixed(4)} ETH                          ║`);
  console.log(`   ║  Recommended (safe):   ${bufferEth.toFixed(4)} ETH                          ║`);
  console.log(`   ║  For Demo Buffer:      ${(bufferEth + 0.01).toFixed(4)} ETH                          ║`);
  console.log("   ╚════════════════════════════════════════════════════════════════╝");

  console.log("\n   📍 Send ETH to: 0x74dDa086DefBFE113E387e70f0304631972525E5\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
