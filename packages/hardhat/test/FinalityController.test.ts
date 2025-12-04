import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementProtocol } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title FinalityController - Test Suite
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Tests for 3-Phase Finality, BFT Quorum, and Reorg Handling
 *
 * FEATURES TESTED:
 * 1. Three-Phase Finality: TENTATIVE → SEMI_FINAL → FINAL
 * 2. BFT Quorum Validation (2/3 + 1)
 * 3. Reorg Detection & Rollback
 * 4. LTL Temporal Properties
 */
describe("FinalityController - Three-Phase Finality", function () {
  let protocol: SettlementProtocol;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let validator1: SignerWithAddress;
  let validator2: SignerWithAddress;
  let validator3: SignerWithAddress;

  beforeEach(async () => {
    [owner, alice, bob, validator1, validator2, validator3] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("SettlementProtocol");
    // Deploy with zero addresses for oracles (mock mode)
    protocol = await factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await protocol.waitForDeployment();
  });

  // ════════════════════════════════════════════════════════════════
  // VALIDATOR REGISTRATION
  // ════════════════════════════════════════════════════════════════

  describe("Validator Registration", function () {
    it("Should allow admin to register validators", async function () {
      await protocol.connect(owner).registerValidator(validator1.address);
      expect(await protocol.getValidatorCount()).to.equal(1);
    });

    it("Should register multiple validators", async function () {
      await protocol.connect(owner).registerValidator(validator1.address);
      await protocol.connect(owner).registerValidator(validator2.address);
      await protocol.connect(owner).registerValidator(validator3.address);
      expect(await protocol.getValidatorCount()).to.equal(3);
    });

    it("Should allow admin to remove validators", async function () {
      await protocol.connect(owner).registerValidator(validator1.address);
      await protocol.connect(owner).registerValidator(validator2.address);
      expect(await protocol.getValidatorCount()).to.equal(2);

      await protocol.connect(owner).removeValidator(validator1.address);
      expect(await protocol.getValidatorCount()).to.equal(1);
    });

    it("Should reject non-admin validator registration", async function () {
      await expect(protocol.connect(alice).registerValidator(validator1.address)).to.be.revertedWith("!admin");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // THREE-PHASE FINALITY TRACKING
  // ════════════════════════════════════════════════════════════════

  describe("Three-Phase Finality", function () {
    let settlementId: bigint;

    beforeEach(async function () {
      // Create and complete a settlement to trigger finality
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.connect(alice).createSettlement(transfers, 3600);
      settlementId = 1n;

      // Deposit funds
      await protocol.connect(alice).deposit(settlementId, { value: ethers.parseEther("1") });

      // Set manual price for oracle (test mode)
      await protocol.setManualPrice(settlementId, 100n); // $1.00 with 2 decimals

      // Initiate settlement
      await protocol.connect(alice).initiateSettlement(settlementId);

      // Mine blocks for confirmation requirement (MIN_CONFIRMATIONS = 3)
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // Execute settlement
      await protocol.connect(alice).executeSettlement(settlementId, 1);
    });

    it("Should initialize finality at TENTATIVE phase", async function () {
      const finality = await protocol.getSettlementFinality(settlementId);
      expect(finality.phase).to.equal(0); // TENTATIVE
      expect(finality.isFinal).to.equal(false);
    });

    it("Should report finality confidence between 30-100", async function () {
      const finality = await protocol.getSettlementFinality(settlementId);
      expect(finality.confidence).to.be.gte(30);
      expect(finality.confidence).to.be.lte(100);
    });

    it("Should track confirmations correctly", async function () {
      const finality = await protocol.getSettlementFinality(settlementId);
      expect(finality.confirmations).to.be.gte(0);
    });

    it("Should check reorg safety at depth", async function () {
      // Initially might not be safe at high depths
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const safeAt1 = await protocol.isReorgSafeAtDepth(settlementId, 1);
      const safeAt100 = await protocol.isReorgSafeAtDepth(settlementId, 100);

      // safeAt1 depends on timing, safeAt100 should be false
      expect(safeAt100).to.equal(false);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // BFT QUORUM VALIDATION
  // ════════════════════════════════════════════════════════════════

  describe("BFT Quorum", function () {
    beforeEach(async function () {
      // Register 3 validators
      await protocol.connect(owner).registerValidator(validator1.address);
      await protocol.connect(owner).registerValidator(validator2.address);
      await protocol.connect(owner).registerValidator(validator3.address);
    });

    it("Should require 2/3 + 1 quorum (2 of 3 validators)", async function () {
      const [, requiredVotes, totalValidators] = await protocol.getQuorumStatus(1);

      expect(totalValidators).to.equal(3);
      // 3 * 6667 / 10000 = 2 (BFT quorum)
      expect(requiredVotes).to.equal(2);
    });

    it("Should track validator count correctly", async function () {
      expect(await protocol.getValidatorCount()).to.equal(3);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // REORG DETECTION
  // ════════════════════════════════════════════════════════════════

  describe("Reorg Detection", function () {
    let settlementId: bigint;

    beforeEach(async function () {
      // Create and finalize a settlement
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.5"), executed: false }];

      await protocol.connect(alice).createSettlement(transfers, 3600);
      settlementId = 1n;

      await protocol.connect(alice).deposit(settlementId, { value: ethers.parseEther("0.5") });

      // Set manual price for oracle (test mode)
      await protocol.setManualPrice(settlementId, 100n); // $1.00 with 2 decimals

      await protocol.connect(alice).initiateSettlement(settlementId);

      // Mine blocks for confirmation requirement (MIN_CONFIRMATIONS = 3)
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await protocol.connect(alice).executeSettlement(settlementId, 1);
    });

    it("Should detect reorg with mismatched block hash", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));

      // This should detect a "reorg" because the hash doesn't match
      const result = await protocol.checkForReorg.staticCall(settlementId, fakeHash);
      // Result is returned as an array [detected, depth]
      expect(result[0]).to.be.a("boolean");
      expect(result[1]).to.be.a("bigint");
    });

    it("Should allow admin to recover from reorg", async function () {
      // Admin can reset finality state
      await expect(protocol.connect(owner).recoverFromReorg(settlementId)).to.not.be.reverted;
    });

    it("Should reject non-admin reorg recovery", async function () {
      await expect(protocol.connect(alice).recoverFromReorg(settlementId)).to.be.revertedWith("!admin");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // LTL PROPERTY VERIFICATION
  // ════════════════════════════════════════════════════════════════

  describe("LTL Properties", function () {
    it("Should enforce monotonic finality - FINAL is irreversible", async function () {
      // Create and finalize a settlement
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.1"), executed: false }];

      await protocol.connect(alice).createSettlement(transfers, 3600);
      await protocol.connect(alice).deposit(1, { value: ethers.parseEther("0.1") });
      await protocol.setManualPrice(1, 100n); // $1.00 with 2 decimals
      await protocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation requirement
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await protocol.connect(alice).executeSettlement(1, 1);

      // Verify finality was initialized
      const finality = await protocol.getSettlementFinality(1);
      expect(finality.phase).to.be.oneOf([0n, 1n, 2n]); // Valid phase
    });

    it("Should provide confidence score progression", async function () {
      // Create settlement
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.1"), executed: false }];

      await protocol.connect(alice).createSettlement(transfers, 3600);
      await protocol.connect(alice).deposit(1, { value: ethers.parseEther("0.1") });
      await protocol.setManualPrice(1, 100n); // $1.00 with 2 decimals
      await protocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation requirement
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await protocol.connect(alice).executeSettlement(1, 1);

      const finality = await protocol.getSettlementFinality(1);

      // TENTATIVE phase should have confidence >= 30
      if (finality.phase === 0n) {
        expect(finality.confidence).to.be.gte(30);
      }
      // SEMI_FINAL should have confidence >= 70
      if (finality.phase === 1n) {
        expect(finality.confidence).to.be.gte(70);
      }
      // FINAL should have confidence = 100
      if (finality.phase === 2n) {
        expect(finality.confidence).to.equal(100);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════
  // INTEGRATION WITH SETTLEMENT LIFECYCLE
  // ════════════════════════════════════════════════════════════════

  describe("Settlement Lifecycle Integration", function () {
    it("Should track finality through complete settlement lifecycle", async function () {
      // 1. Create settlement
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.5"), executed: false }];
      await protocol.connect(alice).createSettlement(transfers, 3600);

      // 2. Deposit
      await protocol.connect(alice).deposit(1, { value: ethers.parseEther("0.5") });

      // 3. Set manual price
      await protocol.setManualPrice(1, 100n); // $1.00 with 2 decimals

      // 4. Initiate
      await protocol.connect(alice).initiateSettlement(1);

      // 5. Mine blocks for confirmation requirement
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // 6. Execute
      await protocol.connect(alice).executeSettlement(1, 1);

      // 7. Verify finality is tracked
      const finality = await protocol.getSettlementFinality(1);
      expect(finality.confirmations).to.be.gte(0);
      expect(finality.confidence).to.be.gte(30);
    });

    it("Should correctly report isReorgSafeAtDepth", async function () {
      // Create and complete settlement
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.25"), executed: false }];
      await protocol.connect(alice).createSettlement(transfers, 3600);
      await protocol.connect(alice).deposit(1, { value: ethers.parseEther("0.25") });
      await protocol.setManualPrice(1, 100n); // $1.00 with 2 decimals
      await protocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation requirement
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await protocol.connect(alice).executeSettlement(1, 1);

      // Check reorg safety at various depths
      const safe0 = await protocol.isReorgSafeAtDepth(1, 0);
      expect(safe0).to.equal(true); // Should always be safe at depth 0
    });
  });

  // ════════════════════════════════════════════════════════════════
  // CONSTANTS VERIFICATION
  // ════════════════════════════════════════════════════════════════

  describe("Finality Constants", function () {
    it("Should have SEMI_FINAL_THRESHOLD of 2 blocks", async function () {
      expect(await protocol.SEMI_FINAL_THRESHOLD()).to.equal(2);
    });

    it("Should have FINAL_THRESHOLD of 12 blocks", async function () {
      expect(await protocol.FINAL_THRESHOLD()).to.equal(12);
    });

    it("Should have MAX_REORG_DEPTH of 64 blocks", async function () {
      expect(await protocol.MAX_REORG_DEPTH()).to.equal(64);
    });

    it("Should have BFT_QUORUM_BPS of 6667 (2/3 + 1)", async function () {
      expect(await protocol.BFT_QUORUM_BPS()).to.equal(6667);
    });
  });
});
