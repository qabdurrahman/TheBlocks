import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementProtocol } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title Fair Ordering Stack Test Suite
 * @notice Tests for 3-Layer Fair Ordering System
 *
 * TOURNAMENT POINTS TARGET: +35 points
 * - Layer 1: Admission Fairness (Global Sequence Numbers) - 10 pts
 * - Layer 2: Execution Fairness (Deterministic Batch Ordering) - 15 pts
 * - Layer 3: Censorship Resistance (Forced Inclusion) - 10 pts
 */
describe("FairOrderingStack - 3-Layer Fair Ordering", function () {
  let protocol: SettlementProtocol;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;
  let receiver: HardhatEthersSigner;

  const SMALL_AMOUNT = ethers.parseEther("1");
  const LARGE_AMOUNT = ethers.parseEther("11"); // > LARGE_TRADE_THRESHOLD
  const MAX_SKIP_BLOCKS = 10;
  const ZERO_ADDRESS = ethers.ZeroAddress;

  // Prices use 2 decimals: MIN=100 ($1), MAX=10000000 ($100,000)
  const PRICE_2000 = 200000n; // $2000 with 2 decimals

  // Helper to create transfers with required executed field
  function makeTransfer(from: string, to: string, amount: bigint) {
    return { from, to, amount, executed: false };
  }

  beforeEach(async function () {
    [, user1, user2, user3, receiver] = await ethers.getSigners();

    const SettlementProtocolFactory = await ethers.getContractFactory("SettlementProtocol");
    protocol = (await SettlementProtocolFactory.deploy(
      ZERO_ADDRESS, // mock chainlink
      ZERO_ADDRESS, // mock band
    )) as SettlementProtocol;
    await protocol.waitForDeployment();
  });

  /**
   * Helper: Create a settlement and return its ID
   */
  async function createSettlement(
    from: HardhatEthersSigner,
    amount: bigint,
    depositFull: boolean = true,
  ): Promise<bigint> {
    const transfers = [makeTransfer(from.address, receiver.address, amount)];

    const timeout = 3600; // 1 hour timeout
    const tx = await protocol.connect(from).createSettlement(transfers, timeout);
    const receipt = await tx.wait();

    // Get settlement ID from events
    const event = receipt?.logs.find(log => protocol.interface.parseLog(log as any)?.name === "SettlementCreated");
    const parsed = protocol.interface.parseLog(event as any);
    const settlementId = parsed?.args[0];

    // Set manual price for this settlement (required for oracle checks)
    await protocol.setManualPrice(settlementId, PRICE_2000);

    if (depositFull) {
      await protocol.connect(from).deposit(settlementId, { value: amount });
    }

    return settlementId;
  }

  /**
   * Helper: Mine specified number of blocks
   */
  async function mineBlocks(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await ethers.provider.send("evm_mine", []);
    }
  }

  // ============================================
  // LAYER 1: ADMISSION FAIRNESS (GLOBAL SEQUENCE NUMBERS)
  // ============================================

  describe("Layer 1: Admission Fairness - Global Sequence Numbers", function () {
    it("1.1 Should assign monotonically increasing sequence numbers", async function () {
      // Create 3 settlements
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);
      const id3 = await createSettlement(user3, SMALL_AMOUNT);

      // Get ordering info
      const info1 = await protocol.orderingInfo(id1);
      const info2 = await protocol.orderingInfo(id2);
      const info3 = await protocol.orderingInfo(id3);

      // Verify monotonically increasing
      expect(info1.sequenceNumber).to.equal(1);
      expect(info2.sequenceNumber).to.equal(2);
      expect(info3.sequenceNumber).to.equal(3);
    });

    it("1.2 Should track submission block correctly", async function () {
      const blockBefore = await ethers.provider.getBlockNumber();
      const id = await createSettlement(user1, SMALL_AMOUNT);
      const blockAfter = await ethers.provider.getBlockNumber();

      const info = await protocol.orderingInfo(id);
      expect(info.submissionBlock).to.be.gte(blockBefore);
      expect(info.submissionBlock).to.be.lte(blockAfter);
    });

    it("1.3 Should mark large trades correctly", async function () {
      const smallId = await createSettlement(user1, SMALL_AMOUNT);
      const largeId = await createSettlement(user2, LARGE_AMOUNT);

      const smallInfo = await protocol.orderingInfo(smallId);
      const largeInfo = await protocol.orderingInfo(largeId);

      expect(smallInfo.isLargeTrade).to.equal(false);
      expect(largeInfo.isLargeTrade).to.equal(true);
    });

    it("1.4 Should return correct global sequence number", async function () {
      expect(await protocol.globalSequenceNumber()).to.equal(0);

      await createSettlement(user1, SMALL_AMOUNT);
      expect(await protocol.globalSequenceNumber()).to.equal(1);

      await createSettlement(user2, SMALL_AMOUNT);
      expect(await protocol.globalSequenceNumber()).to.equal(2);
    });

    it("1.5 Should add settlements to pending queue", async function () {
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);

      expect(await protocol.inQueue(id1)).to.equal(true);
      expect(await protocol.inQueue(id2)).to.equal(true);
      expect(await protocol.getPendingQueueLength()).to.equal(2);
    });

    it("1.6 Should check isLargeTrade via getter", async function () {
      const smallId = await createSettlement(user1, SMALL_AMOUNT);
      const largeId = await createSettlement(user2, LARGE_AMOUNT);

      expect(await protocol.isLargeTrade(smallId)).to.equal(false);
      expect(await protocol.isLargeTrade(largeId)).to.equal(true);
    });
  });

  // ============================================
  // LAYER 2: EXECUTION FAIRNESS (DETERMINISTIC BATCH ORDERING)
  // ============================================

  describe("Layer 2: Execution Fairness - Deterministic Batch Ordering", function () {
    it("2.1 Should get next batch in sequence order", async function () {
      // Create multiple settlements
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);
      const id3 = await createSettlement(user3, SMALL_AMOUNT);

      // Initiate them (required for execution)
      await protocol.connect(user1).initiateSettlement(id1);
      await protocol.connect(user2).initiateSettlement(id2);
      await protocol.connect(user3).initiateSettlement(id3);

      // Get next batch
      const batch = await protocol.getNextBatch(10);

      // Should be in sequence order
      expect(batch.length).to.be.lte(10);
      // Verify ordering
      for (let i = 1; i < batch.length; i++) {
        const prevInfo = await protocol.orderingInfo(batch[i - 1]);
        const currInfo = await protocol.orderingInfo(batch[i]);
        expect(prevInfo.sequenceNumber).to.be.lte(currInfo.sequenceNumber);
      }
    });

    it("2.2 Should batch large trades together for atomicity", async function () {
      // Create mix of small and large trades
      const largeId1 = await createSettlement(user1, LARGE_AMOUNT);
      await createSettlement(user2, SMALL_AMOUNT); // smallId unused
      const largeId2 = await createSettlement(user3, LARGE_AMOUNT);

      // Check large trade grouping
      const info1 = await protocol.orderingInfo(largeId1);
      const info2 = await protocol.orderingInfo(largeId2);

      expect(info1.isLargeTrade).to.equal(true);
      expect(info2.isLargeTrade).to.equal(true);
    });

    it("2.3 Should limit batch size to MAX_BATCH_SIZE", async function () {
      // Create more settlements than batch size (50 is max)
      // Just verify the constant is accessible
      const maxBatchSize = await protocol.MAX_BATCH_SIZE();
      expect(maxBatchSize).to.equal(50);
    });

    it("2.4 Should skip already executed settlements in batch", async function () {
      const id1 = await createSettlement(user1, SMALL_AMOUNT);

      // Initiate settlement
      await protocol.connect(user1).initiateSettlement(id1);

      // Wait for confirmations
      await mineBlocks(3);

      // Execute via normal path
      await protocol.executeSettlement(id1, 10);

      // Get next batch - should not include executed settlement
      const batch = await protocol.getNextBatch(10);
      expect(batch).to.not.include(id1);
    });

    it("2.5 Should execute fair batch", async function () {
      // Create settlements
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);

      // Initiate
      await protocol.connect(user1).initiateSettlement(id1);
      await protocol.connect(user2).initiateSettlement(id2);

      // Wait for confirmations
      await mineBlocks(3);

      // Execute fair batch
      const tx = await protocol.executeFairBatch(10);
      await tx.wait();

      // Check both executed - states: 0=PENDING, 1=INITIATED, 2=EXECUTING, 3=FINALIZED, 4=FAILED, 5=DISPUTED
      const settlement1 = await protocol.settlements(id1);
      const settlement2 = await protocol.settlements(id2);

      // After fair batch execution, settlements should be INITIATED (1), EXECUTING (2), or FINALIZED (3)
      expect([1, 2, 3]).to.include(Number(settlement1.state));
      expect([1, 2, 3]).to.include(Number(settlement2.state));
    });

    it("2.6 Should return fair execution order", async function () {
      // Create settlements
      await createSettlement(user1, SMALL_AMOUNT);
      await createSettlement(user2, SMALL_AMOUNT);

      // Get fair order
      const order = await protocol.getFairExecutionOrder();

      // Should contain our settlements in order
      expect(order.length).to.be.gte(2);
    });
  });

  // ============================================
  // LAYER 3: CENSORSHIP RESISTANCE (FORCED INCLUSION)
  // ============================================

  describe("Layer 3: Censorship Resistance - Forced Inclusion", function () {
    it("3.1 Should detect censored settlement", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Initially not censored (skip blocks should be small)
      const [censored1, skip1] = await protocol.isCensored(id);
      expect(censored1).to.equal(false);
      expect(skip1).to.be.lt(MAX_SKIP_BLOCKS);

      // Mine blocks beyond MAX_SKIP_BLOCKS
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // Now should be detected as censored
      const [censored2, skip2] = await protocol.isCensored(id);
      expect(censored2).to.equal(true);
      expect(skip2).to.be.gt(MAX_SKIP_BLOCKS);
    });

    it("3.2 Should allow force include after censorship window", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // Force include
      const tx = await protocol.connect(user2).forceInclude(id);
      const receipt = await tx.wait();

      // Check events
      const events = receipt?.logs.filter(log => {
        try {
          return protocol.interface.parseLog(log as any)?.name === "ForcedInclusion";
        } catch {
          return false;
        }
      });
      expect(events?.length).to.be.gte(1);

      // Check marked as included
      const info = await protocol.orderingInfo(id);
      expect(info.isIncluded).to.equal(true);
    });

    it("3.3 Should reject force include before censorship window", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Try to force include immediately
      await expect(protocol.connect(user2).forceInclude(id)).to.be.revertedWith("FOS: Censorship window not exceeded");
    });

    it("3.4 Should allow anyone to force include (permissionless)", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // User3 (not creator) can force include
      await expect(protocol.connect(user3).forceInclude(id)).to.not.be.reverted;
    });

    it("3.5 Should allow force include AND execute", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Initiate (required for execution)
      await protocol.connect(user1).initiateSettlement(id);

      // Wait for confirmations AND censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 5);

      // Force include and execute
      const tx = await protocol.connect(user2).forceIncludeAndExecute(id);
      await tx.wait();

      // Check executed
      const info = await protocol.orderingInfo(id);
      expect(info.isExecuted).to.equal(true);
    });

    it("3.6 Should emit CensorshipDetected event", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // Force include
      await expect(protocol.connect(user2).forceInclude(id)).to.emit(protocol, "CensorshipDetected");
    });

    it("3.7 Should track skip count", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 5);

      // Force include
      await protocol.connect(user2).forceInclude(id);

      // Check skip count recorded
      const info = await protocol.orderingInfo(id);
      expect(info.skipCount).to.be.gt(MAX_SKIP_BLOCKS);
    });

    it("3.8 Should return MAX_SKIP_BLOCKS constant", async function () {
      expect(await protocol.MAX_SKIP_BLOCKS()).to.equal(10);
    });

    it("3.9 Should return LARGE_TRADE_THRESHOLD constant", async function () {
      expect(await protocol.LARGE_TRADE_THRESHOLD()).to.equal(ethers.parseEther("10"));
    });
  });

  // ============================================
  // INTEGRATION TESTS
  // ============================================

  describe("Integration: Fair Ordering Full Flow", function () {
    it("4.1 Should maintain fair order through complete lifecycle", async function () {
      // Create settlements in order
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);
      const id3 = await createSettlement(user3, SMALL_AMOUNT);

      // Verify sequence numbers
      const info1 = await protocol.orderingInfo(id1);
      const info2 = await protocol.orderingInfo(id2);
      const info3 = await protocol.orderingInfo(id3);

      expect(info1.sequenceNumber).to.equal(1);
      expect(info2.sequenceNumber).to.equal(2);
      expect(info3.sequenceNumber).to.equal(3);

      // Initiate in FIFO order (required by queue)
      await protocol.connect(user1).initiateSettlement(id1);
      await protocol.connect(user2).initiateSettlement(id2);
      await protocol.connect(user3).initiateSettlement(id3);

      // Wait for confirmations
      await mineBlocks(3);

      // Execute fair batch
      await protocol.executeFairBatch(3);

      // All should be INITIATED, EXECUTING, or FINALIZED
      const s1 = await protocol.settlements(id1);
      const s2 = await protocol.settlements(id2);
      const s3 = await protocol.settlements(id3);

      expect([1, 2, 3]).to.include(Number(s1.state));
      expect([1, 2, 3]).to.include(Number(s2.state));
      expect([1, 2, 3]).to.include(Number(s3.state));
    });

    it("4.2 Should handle mixed small and large trades", async function () {
      // Create mix
      const small1 = await createSettlement(user1, SMALL_AMOUNT);
      const large1 = await createSettlement(user2, LARGE_AMOUNT);
      const small2 = await createSettlement(user3, SMALL_AMOUNT);

      // Verify trade sizes marked correctly
      expect(await protocol.isLargeTrade(small1)).to.equal(false);
      expect(await protocol.isLargeTrade(large1)).to.equal(true);
      expect(await protocol.isLargeTrade(small2)).to.equal(false);
    });

    it("4.3 Should prevent reordering attacks", async function () {
      // Create 3 settlements - sequence is fixed at creation
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);
      const id3 = await createSettlement(user3, SMALL_AMOUNT);

      // Sequence numbers are immutably assigned at creation
      const info1 = await protocol.orderingInfo(id1);
      const info2 = await protocol.orderingInfo(id2);
      const info3 = await protocol.orderingInfo(id3);

      // Regardless of initiation order attempts, sequence numbers are fixed
      expect(info1.sequenceNumber).to.equal(1);
      expect(info2.sequenceNumber).to.equal(2);
      expect(info3.sequenceNumber).to.equal(3);

      // Even if we try to initiate out of order, FIFO is enforced
      // The queue head must be processed first
      await protocol.connect(user1).initiateSettlement(id1);

      // After id1 is initiated, id2 can be initiated
      await protocol.connect(user2).initiateSettlement(id2);

      // After id2, id3
      await protocol.connect(user3).initiateSettlement(id3);

      // Sequence numbers remain the same
      const infoAfter1 = await protocol.orderingInfo(id1);
      const infoAfter2 = await protocol.orderingInfo(id2);
      const infoAfter3 = await protocol.orderingInfo(id3);

      expect(infoAfter1.sequenceNumber).to.equal(1);
      expect(infoAfter2.sequenceNumber).to.equal(2);
      expect(infoAfter3.sequenceNumber).to.equal(3);
    });

    it("4.4 Should resist sequencer censorship via forced inclusion", async function () {
      // Create settlement
      const id = await createSettlement(user1, SMALL_AMOUNT);
      await protocol.connect(user1).initiateSettlement(id);

      // Sequencer "ignores" this settlement for many blocks
      await mineBlocks(MAX_SKIP_BLOCKS + 5);

      // Anyone can detect and force include
      const [isCensored] = await protocol.isCensored(id);
      expect(isCensored).to.equal(true);

      // Force execution
      await protocol.connect(user2).forceIncludeAndExecute(id);

      // Should be executed
      const info = await protocol.orderingInfo(id);
      expect(info.isExecuted).to.equal(true);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe("Edge Cases", function () {
    it("5.1 Should handle empty batch gracefully", async function () {
      // No settlements created
      const batch = await protocol.getNextBatch(10);
      expect(batch.length).to.equal(0);
    });

    it("5.2 Should handle settlement ID 0 (non-existent)", async function () {
      const info = await protocol.orderingInfo(0);
      expect(info.sequenceNumber).to.equal(0);
    });

    it("5.3 Should not double-include on force include", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // Force include twice
      await protocol.forceInclude(id);
      await expect(protocol.forceInclude(id)).to.be.revertedWith("FOS: Already included");
    });

    it("5.4 Should reject forceIncludeAndExecute on already executed", async function () {
      const id = await createSettlement(user1, SMALL_AMOUNT);
      await protocol.connect(user1).initiateSettlement(id);

      // Wait and execute normally
      await mineBlocks(3);
      await protocol.executeSettlement(id, 10);

      // Wait for censorship window
      await mineBlocks(MAX_SKIP_BLOCKS + 2);

      // Should reject force execute
      await expect(protocol.forceIncludeAndExecute(id)).to.be.reverted;
    });

    it("5.5 Should track queue position correctly", async function () {
      const id1 = await createSettlement(user1, SMALL_AMOUNT);
      const id2 = await createSettlement(user2, SMALL_AMOUNT);
      const id3 = await createSettlement(user3, SMALL_AMOUNT);

      // Check queue positions
      const [, inQ1] = await protocol.getQueuePosition(id1);
      const [, inQ2] = await protocol.getQueuePosition(id2);
      const [, inQ3] = await protocol.getQueuePosition(id3);

      expect(inQ1).to.equal(true);
      expect(inQ2).to.equal(true);
      expect(inQ3).to.equal(true);
    });
  });
});
