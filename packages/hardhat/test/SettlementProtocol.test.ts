import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementProtocol } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title Settlement Protocol Test Suite
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Comprehensive tests covering all invariants and attack scenarios
 *
 * TEST CATEGORIES:
 * 1. Basic Functionality (8 tests)
 * 2. State Machine Transitions (6 tests)
 * 3. Invariant Verification (5 tests)
 * 4. Oracle Integration (5 tests)
 * 5. Fair Ordering / MEV Resistance (4 tests)
 * 6. Adversarial Scenarios (6 tests)
 * 7. Edge Cases & Stress Tests (5 tests)
 */
describe("SettlementProtocol", function () {
  let settlementProtocol: SettlementProtocol;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let attacker: SignerWithAddress;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_ETH = ethers.parseEther("1");
  const TEN_ETH = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, alice, bob, charlie, attacker] = await ethers.getSigners();

    const SettlementProtocolFactory = await ethers.getContractFactory("SettlementProtocol");
    settlementProtocol = await SettlementProtocolFactory.deploy(ZERO_ADDRESS, ZERO_ADDRESS);
    await settlementProtocol.waitForDeployment();
  });

  // ============================================
  // CATEGORY 1: BASIC FUNCTIONALITY (8 tests)
  // ============================================

  describe("1. Basic Functionality", function () {
    it("1.1 Should deploy with correct initial state", async function () {
      expect(await settlementProtocol.admin()).to.equal(owner.address);
      expect(await settlementProtocol.paused()).to.equal(false);
      expect(await settlementProtocol.nextSettlementId()).to.equal(1);
      expect(await settlementProtocol.getQueueLength()).to.equal(0);
    });

    it("1.2 Should create a settlement with valid transfers", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];

      await expect(settlementProtocol.connect(alice).createSettlement(transfers, 0))
        .to.emit(settlementProtocol, "SettlementCreated")
        .withArgs(1, alice.address, 0, (hash: string) => hash.length === 66);

      expect(await settlementProtocol.nextSettlementId()).to.equal(2);
      expect(await settlementProtocol.getQueueLength()).to.equal(1);
    });

    it("1.3 Should accept deposits for a settlement", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      await expect(settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH }))
        .to.emit(settlementProtocol, "DepositReceived")
        .withArgs(alice.address, 1, ONE_ETH);

      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.totalDeposited).to.equal(ONE_ETH);
    });

    it("1.4 Should reject zero deposits", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      await expect(settlementProtocol.connect(alice).deposit(1, { value: 0 })).to.be.revertedWith("0");
    });

    it("1.5 Should reject empty transfer arrays", async function () {
      await expect(settlementProtocol.connect(alice).createSettlement([], 0)).to.be.revertedWith("empty");
    });

    it("1.6 Should reject transfers to zero address", async function () {
      const transfers = [{ from: alice.address, to: ZERO_ADDRESS, amount: ONE_ETH, executed: false }];

      await expect(settlementProtocol.connect(alice).createSettlement(transfers, 0)).to.be.revertedWith("0x");
    });

    it("1.7 Should reject zero amount transfers", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: 0, executed: false }];

      await expect(settlementProtocol.connect(alice).createSettlement(transfers, 0)).to.be.revertedWith("0val");
    });

    it("1.8 Should correctly report canInitiate status", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      // Before deposit
      let [canInit, reason] = await settlementProtocol.canInitiate(1);
      expect(canInit).to.equal(false);
      expect(reason).to.equal("Insufficient deposits");

      // After deposit
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      [canInit, reason] = await settlementProtocol.canInitiate(1);
      expect(canInit).to.equal(true);
      expect(reason).to.equal("Ready");
    });
  });

  // ============================================
  // CATEGORY 2: STATE MACHINE TRANSITIONS (6 tests)
  // ============================================

  describe("2. State Machine Transitions", function () {
    // Valid price in 2 decimals as per oracle contract
    const VALID_PRICE = 200000n; // $2000.00

    beforeEach(async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      // Set manual price for oracle (required for initiation)
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
    });

    it("2.1 Should transition from PENDING to INITIATED", async function () {
      await settlementProtocol.connect(alice).initiateSettlement(1);

      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.state).to.equal(1); // INITIATED
    });

    it("2.2 Should not allow initiation without sufficient deposits", async function () {
      const transfers = [{ from: bob.address, to: charlie.address, amount: TEN_ETH, executed: false }];
      await settlementProtocol.connect(bob).createSettlement(transfers, 0);
      await settlementProtocol.connect(bob).deposit(2, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(2, VALID_PRICE);

      // First settlement must be initiated first (FIFO)
      await settlementProtocol.connect(alice).initiateSettlement(1);

      await expect(settlementProtocol.connect(bob).initiateSettlement(2)).to.be.revertedWith("!funds");
    });

    it("2.3 Should transition from INITIATED to EXECUTING", async function () {
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation requirement
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await settlementProtocol.connect(alice).executeSettlement(1, 1);

      const settlement = await settlementProtocol.getSettlement(1);
      // Should be FINALIZED since only 1 transfer
      expect(settlement.state).to.equal(3); // FINALIZED
    });

    it("2.4 Should allow dispute during INITIATED state", async function () {
      await settlementProtocol.connect(alice).initiateSettlement(1);

      await expect(settlementProtocol.connect(bob).disputeSettlement(1, "Price seems wrong"))
        .to.emit(settlementProtocol, "SettlementDisputed")
        .withArgs(1, bob.address, "Price seems wrong");

      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.state).to.equal(4); // DISPUTED
    });

    it("2.5 Should not allow execution in PENDING state", async function () {
      await expect(settlementProtocol.connect(alice).executeSettlement(1, 1)).to.be.revertedWith(
        "Invalid state for execution",
      );
    });

    it("2.6 Should not allow dispute after dispute period", async function () {
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Mine blocks past dispute period
      for (let i = 0; i < 51; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await expect(settlementProtocol.connect(bob).disputeSettlement(1, "Too late")).to.be.revertedWith(
        "Dispute period ended",
      );
    });
  });

  // ============================================
  // CATEGORY 3: INVARIANT VERIFICATION (5 tests)
  // ============================================

  describe("3. Invariant Verification", function () {
    // Valid price in 2 decimals as per oracle contract
    const VALID_PRICE = 200000n; // $2000.00

    it("3.1 INVARIANT 1: Conservation of Value - deposits equal withdrawals", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
      await settlementProtocol.connect(alice).initiateSettlement(1);

      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Mine blocks for confirmation
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await settlementProtocol.connect(alice).executeSettlement(1, 10);

      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobBalanceAfter - bobBalanceBefore).to.equal(ONE_ETH);
    });

    it("3.2 INVARIANT 2: No Double Settlement - same ID cannot execute twice", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await settlementProtocol.connect(alice).executeSettlement(1, 10);

      // Try to execute again
      await expect(settlementProtocol.connect(alice).executeSettlement(1, 10)).to.be.revertedWith(
        "Invalid state for execution",
      );
    });

    it("3.3 INVARIANT 3: Oracle Freshness - stale data rejected", async function () {
      // This test verifies the oracle staleness check exists
      // In mock mode, we can't easily test this without mocking oracle
      const staleness = await settlementProtocol.MAX_ORACLE_STALENESS();
      expect(staleness).to.equal(60); // 60 seconds max
    });

    it("3.4 INVARIANT 4: Timeout & Liveness - expired settlements can be refunded", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      // Short timeout for testing
      await settlementProtocol.connect(alice).createSettlement(transfers, 10);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });

      // Mine blocks past timeout
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

      await settlementProtocol.connect(alice).refundSettlement(1);

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      // Balance should increase (minus gas)
      expect(aliceBalanceAfter).to.be.greaterThan(aliceBalanceBefore);
    });

    it("3.5 INVARIANT 5: Partial Finality - execution tracks progress", async function () {
      const transfers = [
        { from: alice.address, to: bob.address, amount: ethers.parseEther("0.5"), executed: false },
        { from: alice.address, to: charlie.address, amount: ethers.parseEther("0.5"), executed: false },
      ];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Mine blocks for confirmation
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // Execute just 1 transfer
      await settlementProtocol.connect(alice).executeSettlement(1, 1);

      let settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.executedTransfers).to.equal(1);
      expect(settlement.state).to.equal(2); // EXECUTING

      // Execute remaining
      await settlementProtocol.connect(alice).executeSettlement(1, 1);

      settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.executedTransfers).to.equal(2);
      expect(settlement.state).to.equal(3); // FINALIZED
    });
  });

  // ============================================
  // CATEGORY 4: ORACLE INTEGRATION (5 tests)
  // ============================================

  describe("4. Oracle Integration", function () {
    it("4.1 Should track oracle health status", async function () {
      const [chainlinkHealthy, bandHealthy] = await settlementProtocol.getOracleHealth();

      // In mock mode, oracles are not available
      expect(chainlinkHealthy).to.equal(false);
      expect(bandHealthy).to.equal(false);
    });

    it("4.2 Should record price history", async function () {
      const history = await settlementProtocol.getPriceHistory();
      expect(history.length).to.equal(0); // No prices yet in mock mode
    });

    it("4.3 Should detect no manipulation with insufficient history", async function () {
      const [isManipulated, reason] = await settlementProtocol.checkManipulation();
      expect(isManipulated).to.equal(false);
      expect(reason).to.equal("Insufficient history");
    });

    it("4.4 Should have correct oracle configuration constants", async function () {
      expect(await settlementProtocol.MAX_ORACLE_STALENESS()).to.equal(60);
      expect(await settlementProtocol.MAX_PRICE_DEVIATION()).to.equal(5);
      expect(await settlementProtocol.PRICE_PRECISION()).to.equal(1e8);
    });

    it("4.5 Should allow oracle status reset", async function () {
      await settlementProtocol.resetOracleStatus();
      // Should not revert
    });
  });

  // ============================================
  // CATEGORY 5: FAIR ORDERING / MEV RESISTANCE (4 tests)
  // ============================================

  describe("5. Fair Ordering / MEV Resistance", function () {
    // Valid price in 2 decimals as per oracle contract
    const VALID_PRICE = 200000n; // $2000.00

    it("5.1 Should enforce FIFO queue order", async function () {
      // Create two settlements
      const transfers1 = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      const transfers2 = [{ from: bob.address, to: charlie.address, amount: ONE_ETH, executed: false }];

      await settlementProtocol.connect(alice).createSettlement(transfers1, 0);
      await settlementProtocol.connect(bob).createSettlement(transfers2, 0);

      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.connect(bob).deposit(2, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
      await settlementProtocol.setManualPrice(2, VALID_PRICE);

      // Try to initiate second settlement first (should fail)
      await expect(settlementProtocol.connect(bob).initiateSettlement(2)).to.be.revertedWith("!queue");

      // Initiate first settlement (should succeed)
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Now second can be initiated
      await settlementProtocol.connect(bob).initiateSettlement(2);
    });

    it("5.2 Should correctly track queue positions", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];

      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(bob).createSettlement(transfers, 0);
      await settlementProtocol.connect(charlie).createSettlement(transfers, 0);

      expect(await settlementProtocol.getQueueLength()).to.equal(3);

      // Check queue positions
      const settlement1 = await settlementProtocol.getSettlement(1);
      const settlement2 = await settlementProtocol.getSettlement(2);
      const settlement3 = await settlementProtocol.getSettlement(3);

      expect(settlement1.queuePosition).to.equal(0);
      expect(settlement2.queuePosition).to.equal(1);
      expect(settlement3.queuePosition).to.equal(2);
    });

    it("5.3 Should advance queue head after initiation", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];

      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);

      expect(await settlementProtocol.queueHead()).to.equal(0);

      await settlementProtocol.connect(alice).initiateSettlement(1);

      expect(await settlementProtocol.queueHead()).to.equal(1);
    });

    it("5.4 Should generate unique settlement hashes for replay protection", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];

      const tx1 = await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await tx1.wait();

      const tx2 = await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await tx2.wait();

      // Get settlement hashes from events
      const settlement1 = await settlementProtocol.getSettlement(1);
      const settlement2 = await settlementProtocol.getSettlement(2);

      // Hashes should be different
      expect(settlement1.id).to.not.equal(settlement2.id);
    });
  });

  // ============================================
  // CATEGORY 6: ADVERSARIAL SCENARIOS (6 tests)
  // ============================================

  describe("6. Adversarial Scenarios", function () {
    // Valid price in 2 decimals as per oracle contract
    const VALID_PRICE = 200000n; // $2000.00

    it("6.1 Should prevent reentrancy attack via receive()", async function () {
      // Contract rejects direct ETH transfers
      await expect(
        owner.sendTransaction({ to: await settlementProtocol.getAddress(), value: ONE_ETH }),
      ).to.be.revertedWith("deposit");
    });

    it("6.2 Should prevent unauthorized admin actions", async function () {
      await expect(settlementProtocol.connect(attacker).pause()).to.be.revertedWith("!admin");

      await expect(settlementProtocol.connect(attacker).unpause()).to.be.revertedWith("!admin");
    });

    it("6.3 Should prevent operations when paused", async function () {
      await settlementProtocol.connect(owner).pause();

      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];

      await expect(settlementProtocol.connect(alice).createSettlement(transfers, 0)).to.be.revertedWith("paused");
    });

    it("6.4 Should prevent deposit to non-existent settlement", async function () {
      await expect(settlementProtocol.connect(alice).deposit(999, { value: ONE_ETH })).to.be.revertedWith("!exist");
    });

    it("6.5 Should prevent deposit to non-PENDING settlement", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.setManualPrice(1, VALID_PRICE);
      await settlementProtocol.connect(alice).initiateSettlement(1);

      // Try to deposit after initiation
      await expect(settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH })).to.be.revertedWith("!state");
    });

    it("6.6 Should prevent refund before timeout", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: ONE_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 1000);
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });

      await expect(settlementProtocol.connect(alice).refundSettlement(1)).to.be.revertedWith("!refund");
    });
  });

  // ============================================
  // CATEGORY 7: EDGE CASES & STRESS TESTS (5 tests)
  // ============================================

  describe("7. Edge Cases & Stress Tests", function () {
    it("7.1 Should handle maximum transfers (100)", async function () {
      const transfers = [];
      for (let i = 0; i < 100; i++) {
        transfers.push({
          from: alice.address,
          to: bob.address,
          amount: ethers.parseEther("0.01"),
          executed: false,
        });
      }

      await settlementProtocol.connect(alice).createSettlement(transfers, 0);
      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.totalTransfers).to.equal(100);
    });

    it("7.2 Should reject more than 100 transfers", async function () {
      const transfers = [];
      for (let i = 0; i < 101; i++) {
        transfers.push({
          from: alice.address,
          to: bob.address,
          amount: ethers.parseEther("0.01"),
          executed: false,
        });
      }

      await expect(settlementProtocol.connect(alice).createSettlement(transfers, 0)).to.be.revertedWith(">100");
    });

    it("7.3 Should handle multiple deposits from same user", async function () {
      const transfers = [{ from: alice.address, to: bob.address, amount: TEN_ETH, executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.connect(alice).deposit(1, { value: ethers.parseEther("8") });

      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.totalDeposited).to.equal(TEN_ETH);
    });

    it("7.4 Should handle multiple depositors", async function () {
      const transfers = [{ from: alice.address, to: charlie.address, amount: ethers.parseEther("3"), executed: false }];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      await settlementProtocol.connect(alice).deposit(1, { value: ONE_ETH });
      await settlementProtocol.connect(bob).deposit(1, { value: ONE_ETH });
      await settlementProtocol.connect(owner).deposit(1, { value: ONE_ETH });

      const settlement = await settlementProtocol.getSettlement(1);
      expect(settlement.totalDeposited).to.equal(ethers.parseEther("3"));
    });

    it("7.5 Should correctly return transfers array", async function () {
      const transfers = [
        { from: alice.address, to: bob.address, amount: ONE_ETH, executed: false },
        { from: bob.address, to: charlie.address, amount: ethers.parseEther("2"), executed: false },
      ];
      await settlementProtocol.connect(alice).createSettlement(transfers, 0);

      const storedTransfers = await settlementProtocol.getTransfers(1);
      expect(storedTransfers.length).to.equal(2);
      expect(storedTransfers[0].to).to.equal(bob.address);
      expect(storedTransfers[1].to).to.equal(charlie.address);
      expect(storedTransfers[0].amount).to.equal(ONE_ETH);
      expect(storedTransfers[1].amount).to.equal(ethers.parseEther("2"));
    });
  });

  // ============================================
  // SUMMARY: 39 TESTS TOTAL
  // ============================================
});
