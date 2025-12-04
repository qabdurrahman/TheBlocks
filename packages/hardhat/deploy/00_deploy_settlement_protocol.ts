import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * @title Deploy Settlement Protocol
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Deploys the adversarial-resilient settlement protocol
 */
const deploySettlementProtocol: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  log("----------------------------------------------------");
  log("Deploying SettlementProtocol...");

  // Oracle addresses (for local testing, use zero address - mock mode)
  // In production, use actual Chainlink/Band addresses
  const chainlinkOracle = "0x0000000000000000000000000000000000000000"; // Mock for local
  const bandOracle = "0x0000000000000000000000000000000000000000"; // Mock for local

  // Network-specific oracle addresses
  const networkName = hre.network.name;
  let chainlinkAddress = chainlinkOracle;
  let bandAddress = bandOracle;

  if (networkName === "sepolia") {
    // Sepolia ETH/USD Chainlink feed
    chainlinkAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    // Band Protocol on Sepolia (if available)
    bandAddress = "0x0000000000000000000000000000000000000000";
  } else if (networkName === "mainnet") {
    // Mainnet ETH/USD Chainlink feed
    chainlinkAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
    // Band Protocol StdReference on mainnet
    bandAddress = "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";
  } else if (networkName === "polygon") {
    // Polygon ETH/USD Chainlink feed
    chainlinkAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";
    // Band Protocol on Polygon
    bandAddress = "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";
  }

  const settlementProtocol = await deploy("SettlementProtocol", {
    from: deployer,
    args: [chainlinkAddress, bandAddress],
    log: true,
    autoMine: true, // Faster on local network
  });

  log(`SettlementProtocol deployed at: ${settlementProtocol.address}`);
  log(`  - Chainlink Oracle: ${chainlinkAddress}`);
  log(`  - Band Oracle: ${bandAddress}`);
  log(`  - Deployer: ${deployer}`);
  log("----------------------------------------------------");

  // Verify on Etherscan if not local
  if (networkName !== "localhost" && networkName !== "hardhat") {
    log("Waiting for block confirmations...");
    // Wait for 6 confirmations
    await new Promise(resolve => setTimeout(resolve, 60000));

    try {
      await hre.run("verify:verify", {
        address: settlementProtocol.address,
        constructorArguments: [chainlinkAddress, bandAddress],
      });
      log("Contract verified on Etherscan!");
    } catch (error) {
      log("Verification failed:", error);
    }
  }
};

export default deploySettlementProtocol;

deploySettlementProtocol.tags = ["SettlementProtocol", "all"];
