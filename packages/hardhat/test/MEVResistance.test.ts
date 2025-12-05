import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementProtocol } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * MEV Resistance & Enhanced Security Tests
 * Tests for Commit-Reveal MEV Prevention, Role-Based Access Control, and Dispute Bond
 *
 * Based on attack_flagship_strategy.md defenses:
 * - Defense #1: Threshold Encryption + Commit-Reveal (25 pts)
 * - Defense #5: Timestamp-Independent Ordering (10 pts)
 * - Defense #4: Dispute Bond (12 pts)
 * - Defense #7: Role-Based Access Control (5 pts)
 */
describe("MEV Resistance & Enhanced Security", function () {
  let protocol: SettlementProtocol;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let arbitrator: SignerWithAddress;
  let settler: SignerWithAddress;
  let oracle: SignerWithAddress;

  const MIN_DISPUTE_BOND = ethers.parseEther("0.1");
  const TRANSFER_AMOUNT = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, user1, user2, arbitrator, settler, oracle] = await ethers.getSigners();

    // Deploy MockOracle
    const MockOracleFactory = await ethers.getContractFactory("MockOracle");
    const mockChainlink = await MockOracleFactory.deploy(100, 8, "ETH/USD"); // $1.00 with 8 decimals
    const mockBand = await MockOracleFactory.deploy(100, 8, "ETH/USD");

    // Deploy SettlementProtocol
    const SettlementProtocolFactory = await ethers.getContractFactory("SettlementProtocol");
    protocol = await SettlementProtocolFactory.deploy(await mockChainlink.getAddress(), await mockBand.getAddress());
  });

  describe("1. Commit-Reveal MEV Prevention", function () {
    it("1.1 Should commit encrypted settlement", async function () {
      const deadline = BigInt(await time.latest()) + 3600n; // 1 hour from now (relative to chain time)
      const salt = ethers.randomBytes(32);
      const nonce = await protocol.userNonces(user1.address);

      // Compute commitment hash off-chain
      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce, 31337], // hardhat chainId
      );

      // Submit commitment (sequencer sees only hash, cannot extract MEV)
      const tx = await protocol.connect(user1).commitSettlement(commitHash);
      await expect(tx).to.emit(protocol, "SettlementCommitted");

      // Verify commitment stored
      const commitment = await protocol.getCommitment(commitHash);
      expect(commitment.committer).to.equal(user1.address);
      expect(commitment.revealed).to.equal(false);
    });

    it("1.2 Should reject duplicate commitment", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.randomBytes(32);
      const nonce = await protocol.userNonces(user1.address);

      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce, 31337],
      );

      await protocol.connect(user1).commitSettlement(commitHash);
      await expect(protocol.connect(user1).commitSettlement(commitHash)).to.be.revertedWith("MEV: Already committed");
    });

    it("1.3 Should reveal settlement after delay", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const nonce = await protocol.userNonces(user1.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce, chainId],
      );

      // Commit
      await protocol.connect(user1).commitSettlement(commitHash);

      // Wait for reveal delay (COMMIT_REVEAL_DELAY = 2 blocks)
      await mine(3);

      // Reveal
      const tx = await protocol
        .connect(user1)
        .revealSettlement(user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce);

      await expect(tx).to.emit(protocol, "SettlementRevealed");
    });

    it("1.4 Should reject early reveal (MEV prevention)", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const nonce = await protocol.userNonces(user1.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce, chainId],
      );

      await protocol.connect(user1).commitSettlement(commitHash);

      // Try to reveal immediately (should fail)
      await expect(
        protocol.connect(user1).revealSettlement(user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce),
      ).to.be.revertedWith("MEV: Too early to reveal");
    });

    it("1.5 Should reject reveal with wrong nonce (replay protection)", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const wrongNonce = 999n;
      const chainId = (await ethers.provider.getNetwork()).chainId;

      // Commit with wrong nonce hash
      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, wrongNonce, chainId],
      );

      await protocol.connect(user1).commitSettlement(commitHash);
      await mine(3);

      // Reveal should fail because nonce doesn't match
      await expect(
        protocol
          .connect(user1)
          .revealSettlement(user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, wrongNonce),
      ).to.be.revertedWith("MEV: Invalid nonce");
    });

    it("1.6 Should increment nonce after reveal", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const nonceBefore = await protocol.userNonces(user1.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonceBefore, chainId],
      );

      await protocol.connect(user1).commitSettlement(commitHash);
      await mine(3);

      await protocol
        .connect(user1)
        .revealSettlement(user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonceBefore);

      const nonceAfter = await protocol.userNonces(user1.address);
      expect(nonceAfter).to.equal(nonceBefore + 1n);
    });
  });

  describe("2. Timestamp-Independent Beacon Ordering", function () {
    it("2.1 Should get finalized beacon after delay", async function () {
      const currentBlock = await ethers.provider.getBlockNumber();
      const finalityDelay = 3; // FINALITY_DELAY constant

      // Mine enough blocks to have finalized history
      await mine(finalityDelay + 5);

      // Get beacon from finalized block
      const beacon = await protocol.getFinalizedBeacon(currentBlock);
      expect(beacon).to.not.equal(ethers.ZeroHash);
    });

    it("2.2 Should reject beacon before finality", async function () {
      const currentBlock = await ethers.provider.getBlockNumber();

      // Try to get beacon immediately (should fail)
      await expect(protocol.getFinalizedBeacon(currentBlock)).to.be.revertedWith("MEV: Finality not reached");
    });

    it("2.3 Should compute deterministic order key", async function () {
      const settlementId = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const beacon = ethers.keccak256(ethers.toUtf8Bytes("beacon"));

      const orderKey1 = await protocol.computeOrderKey(settlementId, beacon);
      const orderKey2 = await protocol.computeOrderKey(settlementId, beacon);

      // Same input = same output (deterministic)
      expect(orderKey1).to.equal(orderKey2);
    });

    it("2.4 Should have different order keys for different settlements", async function () {
      const settlement1 = ethers.keccak256(ethers.toUtf8Bytes("settlement1"));
      const settlement2 = ethers.keccak256(ethers.toUtf8Bytes("settlement2"));
      const beacon = ethers.keccak256(ethers.toUtf8Bytes("beacon"));

      const orderKey1 = await protocol.computeOrderKey(settlement1, beacon);
      const orderKey2 = await protocol.computeOrderKey(settlement2, beacon);

      expect(orderKey1).to.not.equal(orderKey2);
    });
  });

  describe("3. Role-Based Access Control", function () {
    it("3.1 Should initialize owner with ADMIN_ROLE", async function () {
      const ADMIN_ROLE = await protocol.ADMIN_ROLE();
      const hasRole = await protocol.hasRole(ADMIN_ROLE, owner.address);
      expect(hasRole).to.equal(true);
    });

    it("3.2 Should grant ARBITRATOR_ROLE", async function () {
      const ARBITRATOR_ROLE = await protocol.ARBITRATOR_ROLE();

      await protocol.connect(owner).grantRole(ARBITRATOR_ROLE, arbitrator.address);

      const hasRole = await protocol.hasRole(ARBITRATOR_ROLE, arbitrator.address);
      expect(hasRole).to.equal(true);
    });

    it("3.3 Should grant SETTLER_ROLE", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();

      await protocol.connect(owner).grantRole(SETTLER_ROLE, settler.address);

      const hasRole = await protocol.hasRole(SETTLER_ROLE, settler.address);
      expect(hasRole).to.equal(true);
    });

    it("3.4 Should grant ORACLE_ROLE", async function () {
      const ORACLE_ROLE = await protocol.ORACLE_ROLE();

      await protocol.connect(owner).grantRole(ORACLE_ROLE, oracle.address);

      const hasRole = await protocol.hasRole(ORACLE_ROLE, oracle.address);
      expect(hasRole).to.equal(true);
    });

    it("3.5 Should revoke role", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();

      await protocol.connect(owner).grantRole(SETTLER_ROLE, settler.address);
      await protocol.connect(owner).revokeRole(SETTLER_ROLE, settler.address);

      const hasRole = await protocol.hasRole(SETTLER_ROLE, settler.address);
      expect(hasRole).to.equal(false);
    });

    it("3.6 Should reject non-admin role grant", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();

      await expect(protocol.connect(user1).grantRole(SETTLER_ROLE, settler.address)).to.be.revertedWith(
        "ACE: Insufficient role",
      );
    });

    it("3.7 Should track role count", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();

      await protocol.connect(owner).grantRole(SETTLER_ROLE, settler.address);
      await protocol.connect(owner).grantRole(SETTLER_ROLE, user1.address);

      const count = await protocol.getRoleCount(SETTLER_ROLE);
      expect(count).to.equal(2);
    });

    it("3.8 Should get all account roles", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();
      const ORACLE_ROLE = await protocol.ORACLE_ROLE();

      await protocol.connect(owner).grantRole(SETTLER_ROLE, user1.address);
      await protocol.connect(owner).grantRole(ORACLE_ROLE, user1.address);

      const roles = await protocol.getAccountRoles(user1.address);
      expect(roles.isSettler).to.equal(true);
      expect(roles.isOracle).to.equal(true);
      expect(roles.isAdmin).to.equal(false);
    });

    it("3.9 Should not allow revoking last admin", async function () {
      const ADMIN_ROLE = await protocol.ADMIN_ROLE();

      await expect(protocol.connect(owner).revokeRole(ADMIN_ROLE, owner.address)).to.be.revertedWith(
        "ACE: Cannot revoke own admin",
      );
    });

    it("3.10 Should allow renouncing non-admin role", async function () {
      const SETTLER_ROLE = await protocol.SETTLER_ROLE();

      await protocol.connect(owner).grantRole(SETTLER_ROLE, user1.address);
      await protocol.connect(user1).renounceRole(SETTLER_ROLE);

      const hasRole = await protocol.hasRole(SETTLER_ROLE, user1.address);
      expect(hasRole).to.equal(false);
    });
  });

  describe("4. Dispute Bond Mechanism", function () {
    let settlementId: bigint;

    beforeEach(async function () {
      // Grant ARBITRATOR_ROLE for resolution
      const ARBITRATOR_ROLE = await protocol.ARBITRATOR_ROLE();
      await protocol.connect(owner).grantRole(ARBITRATOR_ROLE, arbitrator.address);

      // Create and setup a settlement for dispute testing
      const transfers = [
        {
          from: user1.address,
          to: user2.address,
          amount: TRANSFER_AMOUNT,
          executed: false,
        },
      ];

      const tx = await protocol.createSettlement(transfers, 1000);
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => log.fragment?.name === "SettlementCreated");

      settlementId = (event as any).args[0];

      // Deposit and initiate
      await protocol.connect(user1).deposit(settlementId, { value: TRANSFER_AMOUNT });
      await protocol.setManualPrice(settlementId, 200000n); // $2000 with 2 decimals
      await protocol.initiateSettlement(settlementId);
    });

    it("4.1 Should file dispute with bond", async function () {
      const proposedPrice = 150; // Claim price should be 150 instead of 100

      const tx = await protocol
        .connect(user1)
        .disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", { value: MIN_DISPUTE_BOND });

      await expect(tx).to.emit(protocol, "DisputeFiled");
    });

    it("4.2 Should reject dispute with insufficient bond", async function () {
      const proposedPrice = 150;
      const insufficientBond = ethers.parseEther("0.01"); // Less than 0.1 ETH

      await expect(
        protocol.connect(user1).disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", {
          value: insufficientBond,
        }),
      ).to.be.revertedWith("ACE: Insufficient bond");
    });

    it("4.3 Should resolve dispute in favor of disputer (reward)", async function () {
      const proposedPrice = 150;

      const disputeTx = await protocol
        .connect(user1)
        .disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", { value: MIN_DISPUTE_BOND });
      const disputeReceipt = await disputeTx.wait();
      const disputeEvent = disputeReceipt?.logs.find((log: any) => log.fragment?.name === "DisputeFiled");

      const disputeId = (disputeEvent as any).args[0];

      // Resolve in favor of disputer
      const tx = await protocol.connect(arbitrator).resolveDisputeWithFallbackOracle(
        settlementId,
        disputeId,
        true, // disputer was correct
      );

      await expect(tx).to.emit(protocol, "BondRewarded");
    });

    it("4.4 Should resolve dispute against disputer (slash)", async function () {
      const proposedPrice = 150;

      const disputeTx = await protocol
        .connect(user1)
        .disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", { value: MIN_DISPUTE_BOND });
      const disputeReceipt = await disputeTx.wait();
      const disputeEvent = disputeReceipt?.logs.find((log: any) => log.fragment?.name === "DisputeFiled");

      const disputeId = (disputeEvent as any).args[0];

      // Resolve against disputer
      const tx = await protocol.connect(arbitrator).resolveDisputeWithFallbackOracle(
        settlementId,
        disputeId,
        false, // disputer was wrong
      );

      await expect(tx).to.emit(protocol, "BondSlashed");
    });

    it("4.5 Should only allow ARBITRATOR_ROLE to resolve", async function () {
      const proposedPrice = 150;

      await protocol
        .connect(user1)
        .disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", { value: MIN_DISPUTE_BOND });

      await expect(protocol.connect(user1).resolveDisputeWithFallbackOracle(settlementId, 0, true)).to.be.revertedWith(
        "ACE: Insufficient role",
      );
    });

    it("4.6 Should track slashed bonds total", async function () {
      const proposedPrice = 150;

      const disputeTx = await protocol
        .connect(user1)
        .disputeSettlementWithBond(settlementId, proposedPrice, "Oracle price incorrect", { value: MIN_DISPUTE_BOND });
      const disputeReceipt = await disputeTx.wait();
      const disputeEvent = disputeReceipt?.logs.find((log: any) => log.fragment?.name === "DisputeFiled");

      const disputeId = (disputeEvent as any).args[0];

      // Slash the bond
      await protocol.connect(arbitrator).resolveDisputeWithFallbackOracle(settlementId, disputeId, false);

      const slashedTotal = await protocol.getSlashedBondsTotal();
      expect(slashedTotal).to.equal(MIN_DISPUTE_BOND);
    });
  });

  describe("5. Cross-Chain Replay Protection", function () {
    it("5.1 Should include chainId in settlement hash", async function () {
      const transfers = [
        {
          from: user1.address,
          to: user2.address,
          amount: TRANSFER_AMOUNT,
          executed: false,
        },
      ];

      await protocol.createSettlement(transfers, 1000);

      const hash = await protocol.getSettlementHash(1);
      expect(hash).to.not.equal(ethers.ZeroHash);
    });

    it("5.2 Should compute commitment hash with chainId", async function () {
      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.randomBytes(32);
      const nonce = 0n;

      const hash = await protocol.computeCommitmentHash(
        user1.address,
        user2.address,
        TRANSFER_AMOUNT,
        deadline,
        salt,
        nonce,
      );

      expect(hash).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("6. Pending Reveals Management", function () {
    it("6.1 Should track pending reveals count", async function () {
      const countBefore = await protocol.getPendingRevealsCount();

      const deadline = BigInt(await time.latest()) + 3600n;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const nonce = await protocol.userNonces(user1.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const commitHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce, chainId],
      );

      await protocol.connect(user1).commitSettlement(commitHash);
      await mine(3);

      await protocol
        .connect(user1)
        .revealSettlement(user1.address, user2.address, TRANSFER_AMOUNT, deadline, salt, nonce);

      const countAfter = await protocol.getPendingRevealsCount();
      expect(countAfter).to.equal(countBefore + 1n);
    });

    it("6.2 Should get user nonce", async function () {
      const nonce = await protocol.getNonce(user1.address);
      expect(nonce).to.equal(0);
    });

    it("6.3 Should check settlement executed status", async function () {
      const settlementId = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const isExecuted = await protocol.isSettlementExecuted(settlementId);
      expect(isExecuted).to.equal(false);
    });
  });
});
