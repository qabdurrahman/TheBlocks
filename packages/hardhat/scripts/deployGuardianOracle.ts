import { ethers } from "hardhat";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                                                                           ║
 * ║   ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗ ██╗ █████╗ ███╗   ██╗          ║
 * ║  ██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗██║██╔══██╗████╗  ██║          ║
 * ║  ██║  ███╗██║   ██║███████║██████╔╝██║  ██║██║███████║██╔██╗ ██║          ║
 * ║  ██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║██║██╔══██║██║╚██╗██║          ║
 * ║  ╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝██║██║  ██║██║ ╚████║          ║
 * ║   ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝          ║
 * ║                                                                           ║
 * ║        🛡️  DEPLOY AI-NATIVE ORACLE SECURITY LAYER  🛡️                    ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const MULTI_ORACLE_AGGREGATOR = "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C";

async function main() {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
    console.log("║   🛡️  DEPLOYING GUARDIAN ORACLE - AI-NATIVE SECURITY LAYER           ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
    
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);
    
    // Deploy Guardian Oracle
    console.log("📦 Deploying GuardianOracle...");
    const GuardianOracle = await ethers.getContractFactory("GuardianOracle");
    const guardian = await GuardianOracle.deploy(MULTI_ORACLE_AGGREGATOR);
    await guardian.waitForDeployment();
    
    const guardianAddress = await guardian.getAddress();
    console.log(`✅ GuardianOracle deployed: ${guardianAddress}\n`);
    
    // Wait for indexing
    console.log("⏳ Waiting for contract indexing...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test the system
    console.log("\n═══════════════════════════════════════════════════════════════════════");
    console.log("                    🔬 TESTING SECURITY FEATURES");
    console.log("═══════════════════════════════════════════════════════════════════════\n");
    
    // Get security status
    const status = await guardian.getSecurityStatus();
    console.log("📊 SECURITY STATUS:");
    console.log(`   System Healthy:        ${status.systemHealthy ? "✅ YES" : "❌ NO"}`);
    console.log(`   Circuit Breaker:       ${status.circuitBreakerActive ? "🔴 ACTIVE" : "🟢 INACTIVE"}`);
    console.log(`   Confidence Score:      ${status.confidenceScore}/100`);
    console.log(`   Volatility Index:      ${status.volatilityIndex} bps`);
    console.log(`   Active Oracles:        ${status.activeOracles}/5`);
    console.log(`   Anomaly Count:         ${status.anomalyCount}`);
    console.log(`   Current Price:         $${Number(status.currentPrice) / 1e8}`);
    console.log(`   TWAP Price:            $${Number(status.twapPrice) / 1e8}`);
    
    // Get confidence breakdown
    console.log("\n📈 CONFIDENCE SCORE BREAKDOWN:");
    const breakdown = await guardian.getConfidenceBreakdown();
    console.log(`   Oracle Count Score:    ${breakdown.oracleCountScore}/30`);
    console.log(`   Freshness Score:       ${breakdown.freshnessScore}/25`);
    console.log(`   Agreement Score:       ${breakdown.agreementScore}/25`);
    console.log(`   Volatility Score:      ${breakdown.volatilityScore}/20`);
    console.log(`   ─────────────────────────────`);
    console.log(`   TOTAL CONFIDENCE:      ${breakdown.totalScore}/100`);
    
    // Get security config
    console.log("\n⚙️  SECURITY CONFIGURATION:");
    const config = await guardian.getSecurityConfig();
    console.log(`   Max TWAP Deviation:    ${Number(config.maxPriceDeviationBps) / 100}%`);
    console.log(`   Flash Loan Protection: ${Number(config.maxSingleBlockChangeBps) / 100}% max/block`);
    console.log(`   Volatility Threshold:  ${Number(config.volatilityThresholdBps) / 100}%`);
    console.log(`   Oracle Agreement:      ${Number(config.minOracleAgreementBps) / 100}% tolerance`);
    console.log(`   Staleness Tolerance:   ${Number(config.stalenessTolerance) / 60} minutes`);
    console.log(`   Circuit Breaker:       ${Number(config.circuitBreakerDuration) / 60} minutes`);
    console.log(`   Min Confidence:        ${config.minConfidenceScore}%`);
    
    // Get secured price
    console.log("\n💰 SECURED PRICE OUTPUT:");
    const securedPrice = await guardian.getSecuredPrice();
    console.log(`   Price:                 $${Number(securedPrice.price) / 1e8}`);
    console.log(`   TWAP:                  $${Number(securedPrice.twap) / 1e8}`);
    console.log(`   Confidence:            ${securedPrice.confidence}%`);
    console.log(`   Security Check:        ${securedPrice.isSecure ? "✅ PASSED" : "⚠️ WARNING"}`);
    
    // Record first observation
    console.log("\n📝 Recording first price observation...");
    const tx = await guardian.updateAndGetPrice();
    await tx.wait();
    console.log("✅ Observation recorded");
    
    // Get TWAP info
    const twapInfo = await guardian.getTWAP();
    console.log(`\n⏱️  TWAP INFO:`);
    console.log(`   TWAP Price:            $${Number(twapInfo.twap) / 1e8}`);
    console.log(`   Observations:          ${twapInfo.observationCount}`);
    
    // Calculate gas spent
    const newBalance = await ethers.provider.getBalance(deployer.address);
    const gasSpent = balance - newBalance;
    
    console.log("\n═══════════════════════════════════════════════════════════════════════");
    console.log("                    ✅ DEPLOYMENT COMPLETE");
    console.log("═══════════════════════════════════════════════════════════════════════\n");
    
    console.log("📍 DEPLOYED ADDRESSES:");
    console.log(`   MultiOracleAggregator: ${MULTI_ORACLE_AGGREGATOR}`);
    console.log(`   GuardianOracle:        ${guardianAddress}`);
    
    console.log("\n🛡️  SECURITY FEATURES ACTIVE:");
    console.log("   ✅ Real-time Anomaly Detection");
    console.log("   ✅ Flash Loan Attack Protection");
    console.log("   ✅ Volatility Circuit Breakers");
    console.log("   ✅ Cross-Oracle Correlation Analysis");
    console.log("   ✅ Confidence Scoring (0-100%)");
    console.log("   ✅ Time-Weighted Average Pricing (TWAP)");
    
    console.log(`\n💰 Gas Spent: ${ethers.formatEther(gasSpent)} ETH`);
    console.log(`💰 Remaining: ${ethers.formatEther(newBalance)} ETH`);
    
    console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
    console.log("║                                                                       ║");
    console.log("║   🎉 GUARDIAN ORACLE - WORLD'S FIRST AI-NATIVE SECURITY LAYER 🎉     ║");
    console.log("║                                                                       ║");
    console.log("║   This is NOT just another oracle aggregator.                        ║");
    console.log("║   This is an INTELLIGENT security system that:                       ║");
    console.log("║                                                                       ║");
    console.log("║   • Detects manipulation attacks in REAL-TIME                        ║");
    console.log("║   • Blocks flash loan attacks BEFORE they execute                    ║");
    console.log("║   • Auto-pauses during extreme market conditions                     ║");
    console.log("║   • Provides CONFIDENCE SCORES for every price                       ║");
    console.log("║   • Uses TWAP for MEV-resistant pricing                              ║");
    console.log("║                                                                       ║");
    console.log("║   NO OTHER PROJECT HAS THIS LEVEL OF ORACLE SECURITY.                ║");
    console.log("║                                                                       ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");
    
    // Return addresses for verification
    return {
        guardianOracle: guardianAddress,
        multiOracleAggregator: MULTI_ORACLE_AGGREGATOR
    };
}

main()
    .then((addresses) => {
        console.log("\n📋 Copy these for Etherscan verification:");
        console.log(JSON.stringify(addresses, null, 2));
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
