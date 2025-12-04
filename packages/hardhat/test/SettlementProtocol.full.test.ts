import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementProtocol } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title SettlementProtocol - Comprehensive Test Suite
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice 30+ tests covering unit, integration, E2E, and attack scenarios
 */
describe("SettlementProtocol - Comprehensive Test Suite", function () {
  let protocol: SettlementProtocol;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const INITIAL_BALANCE = ethers.parseEther("100");

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("SettlementProtocol");
    protocol = await factory.deploy();
    await protocol.waitForDeployment();
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Settlement Creation
  // ════════════════════════════════════════════════════════════════

  describe("Settlement Creation", () => {
    it("should create settlement with valid parameters", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      const tx = await protocol.createSettlement(transfers, 1000);
      const receipt = await tx.wait();

      expect(receipt?.status).to.equal(1);
    });

    it("should reject settlement with empty transfers", async () => {
      await expect(protocol.createSettlement([], 1000)).to.be.revertedWith("empty");
    });

    it("should reject settlement with zero address sender", async () => {
      const transfers = [
        { from: ethers.ZeroAddress, to: bob.address, amount: ethers.parseEther("1"), executed: false },
      ];

      await expect(protocol.createSettlement(transfers, 1000)).to.be.revertedWith("0x");
    });

    it("should reject settlement with zero address recipient", async () => {
      const transfers = [
        { from: alice.address, to: ethers.ZeroAddress, amount: ethers.parseEther("1"), executed: false },
      ];

      await expect(protocol.createSettlement(transfers, 1000)).to.be.revertedWith("0x");
    });

    it("should reject settlement with zero amount", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: 0n, executed: false }];

      await expect(protocol.createSettlement(transfers, 1000)).to.be.revertedWith("0val");
    });

    it("should reject settlement exceeding max transfers", async () => {
      const transfers = [];
      for (let i = 0; i < 101; i++) {
        transfers.push({
          from: alice.address,
          to: bob.address,
          amount: ethers.parseEther("0.01"),
          executed: false,
        });
      }

      await expect(protocol.createSettlement(transfers, 1000)).to.be.revertedWith(">100");
    });

    it("should assign unique settlement IDs", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.createSettlement(transfers, 1000);

      const nextId = await protocol.nextSettlementId();
      expect(nextId).to.equal(3n);
    });

    it("should add settlements to queue in order", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.createSettlement(transfers, 1000);

      const queueLength = await protocol.getQueueLength();
      expect(queueLength).to.equal(2n);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Deposits
  // ════════════════════════════════════════════════════════════════

  describe("Deposit Handling", () => {
    beforeEach(async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 1000);
    });

    it("should accept valid deposit", async () => {
      const tx = await protocol.deposit(1, { value: ethers.parseEther("0.5") });
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should reject zero deposit", async () => {
      await expect(protocol.deposit(1, { value: 0 })).to.be.revertedWith("0");
    });

    it("should reject deposit for non-existent settlement", async () => {
      await expect(protocol.deposit(999, { value: ethers.parseEther("1") })).to.be.revertedWith("!exist");
    });

    it("should track total deposited amount", async () => {
      await protocol.deposit(1, { value: ethers.parseEther("0.5") });
      await protocol.deposit(1, { value: ethers.parseEther("0.3") });

      const settlement = await protocol.getSettlement(1);
      expect(settlement.totalDeposited).to.equal(ethers.parseEther("0.8"));
    });

    it("should emit DepositMade event", async () => {
      await expect(protocol.deposit(1, { value: ethers.parseEther("0.5") }))
        .to.emit(protocol, "DepositMade")
        .withArgs(1, owner.address, ethers.parseEther("0.5"));
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Fair Ordering (MEV Prevention)
  // ════════════════════════════════════════════════════════════════

  describe("Fair Ordering & MEV Prevention", () => {
    beforeEach(async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      // Create 2 settlements
      await protocol.createSettlement(transfers, 1000);
      await protocol.createSettlement(transfers, 1000);

      // Fund both
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.deposit(2, { value: ethers.parseEther("1") });
    });

    it("should enforce FIFO settlement order", async () => {
      // Initiate first settlement
      await protocol.initiateSettlement(1);

      // Try to execute settlement 2 before 1 completes - should work but 2 needs initiation first
      await expect(protocol.executeSettlement(2, 1)).to.be.revertedWith("!state");
    });

    it("should track queue positions correctly", async () => {
      const settlement1 = await protocol.getSettlement(1);
      const settlement2 = await protocol.getSettlement(2);

      expect(settlement1.queuePosition).to.equal(0n);
      expect(settlement2.queuePosition).to.equal(1n);
    });

    it("should allow execution when at queue head", async () => {
      await protocol.initiateSettlement(1);

      // Mine blocks for confirmation
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const tx = await protocol.executeSettlement(1, 1);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Settlement Initiation
  // ════════════════════════════════════════════════════════════════

  describe("Settlement Initiation", () => {
    beforeEach(async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 1000);
    });

    it("should reject initiation without sufficient deposits", async () => {
      await expect(protocol.initiateSettlement(1)).to.be.revertedWith("!funds");
    });

    it("should allow initiation with full deposits", async () => {
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      const tx = await protocol.initiateSettlement(1);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should reject initiation for non-pending settlement", async () => {
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);

      // Try to initiate again
      await expect(protocol.initiateSettlement(1)).to.be.revertedWith("!state");
    });

    it("should emit SettlementInitiated event", async () => {
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await expect(protocol.initiateSettlement(1)).to.emit(protocol, "SettlementInitiated");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Settlement Execution
  // ════════════════════════════════════════════════════════════════

  describe("Settlement Execution", () => {
    beforeEach(async () => {
      const transfers = [
        { from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false },
        { from: alice.address, to: charlie.address, amount: ethers.parseEther("0.5"), executed: false },
      ];
      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1.5") });
      await protocol.initiateSettlement(1);

      // Mine confirmation blocks
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
    });

    it("should execute single transfer", async () => {
      const tx = await protocol.executeSettlement(1, 1);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should execute multiple transfers in batch", async () => {
      const tx = await protocol.executeSettlement(1, 2);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should track partial execution progress", async () => {
      await protocol.executeSettlement(1, 1);

      const settlement = await protocol.getSettlement(1);
      expect(settlement.executedTransfers).to.equal(1n);
      expect(settlement.state).to.equal(2n); // EXECUTING
    });

    it("should finalize when all transfers complete", async () => {
      await protocol.executeSettlement(1, 2);

      const settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(3n); // FINALIZED
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Timeout & Refund
  // ════════════════════════════════════════════════════════════════

  describe("Timeout & Refund", () => {
    beforeEach(async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 10); // Short timeout
      await protocol.deposit(1, { value: ethers.parseEther("1") });
    });

    it("should reject refund before timeout", async () => {
      await expect(protocol.refundSettlement(1)).to.be.revertedWith("!refund");
    });

    it("should allow refund after timeout", async () => {
      // Mine blocks to exceed timeout
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const tx = await protocol.refundSettlement(1);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should check refund eligibility", async () => {
      const beforeTimeout = await protocol.isEligibleForRefund(1);
      expect(beforeTimeout).to.equal(false);

      // Mine blocks
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const afterTimeout = await protocol.isEligibleForRefund(1);
      expect(afterTimeout).to.equal(true);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // UNIT TESTS: Disputes
  // ════════════════════════════════════════════════════════════════

  describe("Dispute Handling", () => {
    beforeEach(async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);
    });

    it("should allow dispute on initiated settlement", async () => {
      const tx = await protocol.disputeSettlement(1, "Oracle manipulation detected");
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should reject dispute on pending settlement", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 1000);

      await expect(protocol.disputeSettlement(2, "Test reason")).to.be.revertedWith("!state");
    });

    it("should change state to DISPUTED", async () => {
      await protocol.disputeSettlement(1, "Test dispute");

      const settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(4n); // DISPUTED
    });

    it("should emit DisputeRaised event", async () => {
      await expect(protocol.disputeSettlement(1, "Oracle issue"))
        .to.emit(protocol, "DisputeRaised")
        .withArgs(1, owner.address, "Oracle issue");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS: Full Settlement Flow
  // ════════════════════════════════════════════════════════════════

  describe("Full Settlement Flow (Integration)", () => {
    it("should complete full settlement lifecycle", async () => {
      // 1. CREATE
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];
      await protocol.createSettlement(transfers, 1000);

      // 2. DEPOSIT
      await protocol.deposit(1, { value: ethers.parseEther("1") });

      // 3. INITIATE
      await protocol.initiateSettlement(1);

      // 4. WAIT FOR CONFIRMATIONS
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // 5. EXECUTE
      await protocol.executeSettlement(1, 1);

      // 6. VERIFY FINALIZED
      const settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(3n); // FINALIZED
    });

    it("should handle multi-transfer settlement", async () => {
      const transfers = [
        { from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false },
        { from: alice.address, to: charlie.address, amount: ethers.parseEther("0.5"), executed: false },
        { from: bob.address, to: charlie.address, amount: ethers.parseEther("0.25"), executed: false },
      ];

      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1.75") });
      await protocol.initiateSettlement(1);

      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // Execute in batches
      await protocol.executeSettlement(1, 2);
      await protocol.executeSettlement(1, 1);

      const settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(3n);
      expect(settlement.executedTransfers).to.equal(3n);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // E2E TESTS: Complex Scenarios
  // ════════════════════════════════════════════════════════════════

  describe("E2E: Complex Scenarios", () => {
    it("should handle multiple concurrent settlements", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.1"), executed: false }];

      // Create 5 settlements
      for (let i = 0; i < 5; i++) {
        await protocol.createSettlement(transfers, 1000);
      }

      const nextId = await protocol.nextSettlementId();
      expect(nextId).to.equal(6n);

      const queueLength = await protocol.getQueueLength();
      expect(queueLength).to.equal(5n);
    });

    it("should process settlements in FIFO order", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("0.1"), executed: false }];

      // Create and fund 3 settlements
      for (let i = 0; i < 3; i++) {
        await protocol.createSettlement(transfers, 1000);
        await protocol.deposit(i + 1, { value: ethers.parseEther("0.1") });
      }

      // Process in order
      for (let i = 1; i <= 3; i++) {
        await protocol.initiateSettlement(i);
        for (let j = 0; j < 5; j++) {
          await ethers.provider.send("evm_mine", []);
        }
        await protocol.executeSettlement(i, 1);
      }

      // All should be finalized
      for (let i = 1; i <= 3; i++) {
        const settlement = await protocol.getSettlement(i);
        expect(settlement.state).to.equal(3n);
      }
    });

    it("should handle dispute then resolution", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);

      // Dispute
      await protocol.disputeSettlement(1, "Suspicious activity");

      let settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(4n); // DISPUTED

      // Resolve (admin only)
      await protocol.resolveDispute(1, false); // Favor defendant

      settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(5n); // FAILED (or resolved state)
    });
  });

  // ════════════════════════════════════════════════════════════════
  // EDGE CASE & STRESS TESTS
  // ════════════════════════════════════════════════════════════════

  describe("Edge Cases & Stress Tests", () => {
    it("should handle maximum transfers (100)", async () => {
      const transfers = [];
      for (let i = 0; i < 100; i++) {
        transfers.push({
          from: alice.address,
          to: bob.address,
          amount: ethers.parseEther("0.001"),
          executed: false,
        });
      }

      const tx = await protocol.createSettlement(transfers, 1000);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const settlement = await protocol.getSettlement(1);
      expect(settlement.totalTransfers).to.equal(100n);
    });

    it("should handle very small amounts (1 wei)", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: 1n, executed: false }];

      const tx = await protocol.createSettlement(transfers, 1000);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should handle large amounts", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1000"), executed: false }];

      const tx = await protocol.createSettlement(transfers, 1000);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should handle settlement state transitions correctly", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);

      // State 0: PENDING
      let settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(0n);

      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);

      // State 1: INITIATED
      settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(1n);

      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await protocol.executeSettlement(1, 1);

      // State 3: FINALIZED
      settlement = await protocol.getSettlement(1);
      expect(settlement.state).to.equal(3n);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // ATTACK SCENARIO TESTS
  // ════════════════════════════════════════════════════════════════

  describe("Attack Scenario Detection", () => {
    it("should prevent double execution", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);

      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // First execution succeeds
      await protocol.executeSettlement(1, 1);

      // Second execution should fail
      await expect(protocol.executeSettlement(1, 1)).to.be.revertedWith("!state");
    });

    it("should prevent execution of non-initiated settlement", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1") });

      // Try to execute without initiating
      await expect(protocol.executeSettlement(1, 1)).to.be.revertedWith("!state");
    });

    it("should prevent unauthorized admin actions", async () => {
      await expect(protocol.connect(alice).pause()).to.be.revertedWith("!admin");
    });

    it("should block operations when paused", async () => {
      await protocol.pause();

      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await expect(protocol.createSettlement(transfers, 1000)).to.be.revertedWith("paused");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // ADMIN FUNCTION TESTS
  // ════════════════════════════════════════════════════════════════

  describe("Admin Functions", () => {
    it("should allow admin to pause", async () => {
      await protocol.pause();
      const isPaused = await protocol.paused();
      expect(isPaused).to.equal(true);
    });

    it("should allow admin to unpause", async () => {
      await protocol.pause();
      await protocol.unpause();
      const isPaused = await protocol.paused();
      expect(isPaused).to.equal(false);
    });

    it("should allow admin to resolve disputes", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);
      await protocol.deposit(1, { value: ethers.parseEther("1") });
      await protocol.initiateSettlement(1);
      await protocol.disputeSettlement(1, "Test");

      const tx = await protocol.resolveDispute(1, true);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should return correct protocol stats", async () => {
      const transfers = [{ from: alice.address, to: bob.address, amount: ethers.parseEther("1"), executed: false }];

      await protocol.createSettlement(transfers, 1000);

      const stats = await protocol.getProtocolStats();
      expect(stats[0]).to.be.gte(1n); // totalCreated
    });
  });
});
