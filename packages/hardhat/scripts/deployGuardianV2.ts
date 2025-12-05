import { ethers } from "hardhat";

const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

async function main() {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
    console.log("║   🛡️  DEPLOYING GUARDIAN ORACLE V2 - STANDALONE SECURITY LAYER       ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
    
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);
    
    console.log("📦 Deploying GuardianOracleV2...");
    const GuardianOracleV2 = await ethers.getContractFactory("GuardianOracleV2");
    const guardian = await GuardianOracleV2.deploy(CHAINLINK_ETH_USD);
    await guardian.waitForDeployment();
    
    const guardianAddress = await guardian.getAddress();
    console.log(`✅ GuardianOracleV2 deployed: ${guardianAddress}\n`);
    
    // Test it
    console.log("🔬 Testing security features...\n");
    
    const status = await guardian.getSecurityStatus();
    console.log("📊 SECURITY STATUS:");
    console.log(`   System Healthy:     ${status.systemHealthy ? "✅ YES" : "❌ NO"}`);
    console.log(`   Circuit Breaker:    ${status.circuitBreakerActive ? "🔴 ACTIVE" : "🟢 INACTIVE"}`);
    console.log(`   Confidence Score:   ${status.confidenceScore}/100`);
    console.log(`   Volatility Index:   ${status.volatilityIndex} bps`);
    console.log(`   Current Price:      $${(Number(status.currentPrice) / 1e8).toFixed(2)}`);
    console.log(`   TWAP Price:         $${(Number(status.twapPrice) / 1e8).toFixed(2)}`);
    
    // Record some observations
    console.log("\n📝 Recording price observations...");
    for (let i = 1; i <= 3; i++) {
        const tx = await guardian.updateAndGetPrice();
        await tx.wait();
        console.log(`   Observation ${i}/3 ✅`);
        await new Promise(r => setTimeout(r, 1000));
    }
    
    // Check TWAP
    const twap = await guardian.getTWAP();
    console.log(`\n⏱️ TWAP: $${(Number(twap.twap) / 1e8).toFixed(2)} (${twap.observationCount} observations)`);
    
    // Get confidence breakdown
    const breakdown = await guardian.getConfidenceBreakdown();
    console.log(`\n📈 CONFIDENCE BREAKDOWN:`);
    console.log(`   Freshness:   ${breakdown.freshnessScore}/40`);
    console.log(`   Oracle:      ${breakdown.oracleScore}/30`);
    console.log(`   Volatility:  ${breakdown.volatilityScore}/30`);
    console.log(`   TOTAL:       ${breakdown.totalScore}/100`);
    
    const newBalance = await ethers.provider.getBalance(deployer.address);
    console.log(`\n💰 Gas Spent: ${ethers.formatEther(balance - newBalance)} ETH`);
    console.log(`💰 Remaining: ${ethers.formatEther(newBalance)} ETH`);
    
    console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
    console.log("║   ✅ GUARDIAN ORACLE V2 DEPLOYED SUCCESSFULLY!                       ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
    
    console.log(`Address: ${guardianAddress}`);
    console.log(`Etherscan: https://sepolia.etherscan.io/address/${guardianAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });
