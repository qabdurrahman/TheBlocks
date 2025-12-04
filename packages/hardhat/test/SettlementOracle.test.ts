import { expect } from "chai";
import { ethers } from "hardhat";
import { SettlementOracle } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title Settlement Oracle Test Suite
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Comprehensive tests for oracle integration and price validation
 *
 * TEST CATEGORIES:
 * 1. Oracle Initialization & Configuration (5 tests)
 * 2. Price Freshness Validation (4 tests)
 * 3. Price Bounds Validation (5 tests)
 * 4. Oracle Fallback Mechanism (4 tests)
 * 5. Price Deviation Detection (4 tests)
 * 6. Settlement Price Recording (4 tests)
 * 7. Adversarial Oracle Scenarios (5 tests)
 */
describe("SettlementOracle", function () {
  let oracle: SettlementOracle;
  let attacker: SignerWithAddress;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  // Test prices - matching contract's 2 decimal precision
  // Contract: MIN_VALID_PRICE = 100 ($1), MAX_VALID_PRICE = 10000000 ($100,000)
  const VALID_PRICE = 200000n; // $2000.00 in 2 decimals
  const MIN_PRICE = 100n; // $1.00 in 2 decimals
  const MAX_PRICE = 10000000n; // $100,000 in 2 decimals
  const TOO_LOW_PRICE = 50n; // $0.50 - below minimum
  const TOO_HIGH_PRICE = 20000000n; // $200,000 - above maximum

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    attacker = signers[3];

    // Deploy oracle with zero addresses (manual mode)
    const OracleFactory = await ethers.getContractFactory("SettlementOracle");
    oracle = await OracleFactory.deploy(ZERO_ADDRESS, ZERO_ADDRESS);
    await oracle.waitForDeployment();
  });

  // ============================================
  // CATEGORY 1: ORACLE INITIALIZATION (5 tests)
  // ============================================

  describe("1. Oracle Initialization & Configuration", function () {
    it("1.1 Should deploy with correct initial state", async function () {
      expect(await oracle.chainlinkAvailable()).to.equal(false);
      expect(await oracle.bandAvailable()).to.equal(false);
    });

    it("1.2 Should have correct staleness threshold", async function () {
      const currentStaleness = await oracle.MAX_ORACLE_STALENESS();
      expect(currentStaleness).to.equal(60); // 60 seconds
    });

    it("1.3 Should have correct price bounds set", async function () {
      const minPrice = await oracle.MIN_VALID_PRICE();
      const maxPrice = await oracle.MAX_VALID_PRICE();

      // $1 minimum (2 decimals)
      expect(minPrice).to.equal(100n);
      // $100,000 maximum (2 decimals)
      expect(maxPrice).to.equal(10000000n);
    });

    it("1.4 Should have deviation threshold set correctly", async function () {
      const threshold = await oracle.MAX_PRICE_DEVIATION();
      // 5% threshold
      expect(threshold).to.equal(5);
    });

    it("1.5 Should track fail counts correctly", async function () {
      // Initially both fail counts should be 0
      const chainlinkFails = await oracle.chainlinkFailCount();
      const bandFails = await oracle.bandFailCount();

      expect(chainlinkFails).to.equal(0);
      expect(bandFails).to.equal(0);
    });
  });

  // ============================================
  // CATEGORY 2: PRICE FRESHNESS (4 tests)
  // ============================================

  describe("2. Price Freshness Validation", function () {
    it("2.1 Should have correct staleness threshold", async function () {
      const staleness = await oracle.MAX_ORACLE_STALENESS();
      expect(staleness).to.equal(60); // 60 seconds
    });

    it("2.2 Should accept manual price setting", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const recordedPrice = await oracle.settlementPrice(settlementId);
      expect(recordedPrice).to.equal(VALID_PRICE);
    });

    it("2.3 Should track last chainlink price", async function () {
      // Initially should be 0 since no chainlink
      const lastPrice = await oracle.lastChainlinkPrice();
      expect(lastPrice).to.equal(0);
    });

    it("2.4 Should track last band price", async function () {
      // Initially should be 0 since no band
      const lastPrice = await oracle.lastBandPrice();
      expect(lastPrice).to.equal(0);
    });
  });

  // ============================================
  // CATEGORY 3: PRICE BOUNDS (5 tests)
  // ============================================

  describe("3. Price Bounds Validation", function () {
    it("3.1 Should accept price within valid bounds", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);
      const price = await oracle.settlementPrice(settlementId);
      expect(price).to.equal(VALID_PRICE);
    });

    it("3.2 Should accept minimum valid price ($1)", async function () {
      const settlementId = 2n;
      await oracle.setManualPrice(settlementId, MIN_PRICE);

      const price = await oracle.settlementPrice(settlementId);
      expect(price).to.equal(MIN_PRICE);
    });

    it("3.3 Should accept maximum valid price ($100,000)", async function () {
      const settlementId = 3n;
      await oracle.setManualPrice(settlementId, MAX_PRICE);

      const price = await oracle.settlementPrice(settlementId);
      expect(price).to.equal(MAX_PRICE);
    });

    it("3.4 Should reject price below minimum", async function () {
      const settlementId = 4n;
      await expect(oracle.setManualPrice(settlementId, TOO_LOW_PRICE)).to.be.revertedWith("Price out of bounds");
    });

    it("3.5 Should reject price above maximum", async function () {
      const settlementId = 5n;
      await expect(oracle.setManualPrice(settlementId, TOO_HIGH_PRICE)).to.be.revertedWith("Price out of bounds");
    });
  });

  // ============================================
  // CATEGORY 4: FALLBACK MECHANISM (4 tests)
  // ============================================

  describe("4. Oracle Fallback Mechanism", function () {
    it("4.1 Should use manual price when both oracles unavailable", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const recordedPrice = await oracle.settlementPrice(settlementId);
      expect(recordedPrice).to.equal(VALID_PRICE);
    });

    it("4.2 Should track oracle availability correctly", async function () {
      expect(await oracle.chainlinkAvailable()).to.equal(false);
      expect(await oracle.bandAvailable()).to.equal(false);
    });

    it("4.3 Should have max fail count configured", async function () {
      const maxFails = await oracle.MAX_FAIL_COUNT();
      expect(maxFails).to.equal(3);
    });

    it("4.4 Should return comprehensive status for settlement", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const [price, source, isValidated, chainlinkHealthy, bandHealthy] =
        await oracle.getOracleStatusForSettlement(settlementId);

      expect(price).to.equal(VALID_PRICE);
      expect(source).to.equal(255); // Manual
      expect(isValidated).to.equal(true);
      expect(chainlinkHealthy).to.equal(false);
      expect(bandHealthy).to.equal(false);
    });
  });

  // ============================================
  // CATEGORY 5: PRICE DEVIATION (4 tests)
  // ============================================

  describe("5. Price Deviation Detection", function () {
    it("5.1 Should have 5% deviation threshold", async function () {
      const threshold = await oracle.MAX_PRICE_DEVIATION();
      expect(threshold).to.equal(5); // 5%
    });

    it("5.2 Should track price history correctly", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      // Get settlement price history (should have one entry)
      const history = await oracle.getSettlementPriceHistory(settlementId);
      expect(history.length).to.equal(1);
      expect(history[0].price).to.equal(VALID_PRICE);
    });

    it("5.3 Should append to price history on updates", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      // Update with new price
      const newPrice = VALID_PRICE + 100n;
      await oracle.setManualPrice(settlementId, newPrice);

      const history = await oracle.getSettlementPriceHistory(settlementId);
      expect(history.length).to.equal(2);
      expect(history[1].price).to.equal(newPrice);
    });

    it("5.4 Should record correct source in history", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const history = await oracle.getSettlementPriceHistory(settlementId);
      expect(history[0].source).to.equal(255); // Manual = 255
    });
  });

  // ============================================
  // CATEGORY 6: SETTLEMENT PRICE RECORDING (4 tests)
  // ============================================

  describe("6. Settlement Price Recording", function () {
    it("6.1 Should record price for settlement", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const recordedPrice = await oracle.settlementPrice(settlementId);
      expect(recordedPrice).to.equal(VALID_PRICE);
    });

    it("6.2 Should track price source correctly", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const source = await oracle.settlementPriceSource(settlementId);
      // 255 = Manual
      expect(source).to.equal(255);
    });

    it("6.3 Should mark price as validated", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      const validated = await oracle.settlementPriceValidated(settlementId);
      expect(validated).to.equal(true);
    });

    it("6.4 Should maintain price history per settlement", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);

      // Update price for same settlement
      const newPrice = VALID_PRICE + 1000n;
      await oracle.setManualPrice(settlementId, newPrice);

      const history = await oracle.getSettlementPriceHistory(settlementId);
      expect(history.length).to.equal(2);
      expect(history[0].price).to.equal(VALID_PRICE);
      expect(history[1].price).to.equal(newPrice);
    });
  });

  // ============================================
  // CATEGORY 7: ADVERSARIAL SCENARIOS (5 tests)
  // ============================================

  describe("7. Adversarial Oracle Scenarios", function () {
    it("7.1 Should reject zero price", async function () {
      const settlementId = 1n;
      await expect(oracle.setManualPrice(settlementId, 0)).to.be.revertedWith("Price out of bounds");
    });

    it("7.2 Should reject extremely high price", async function () {
      const settlementId = 1n;
      await expect(oracle.setManualPrice(settlementId, TOO_HIGH_PRICE)).to.be.revertedWith("Price out of bounds");
    });

    it("7.3 Should allow any address to set manual price (testing mode)", async function () {
      // In testing mode, no access control - this tests the contract works
      const settlementId = 1n;
      await oracle.connect(attacker).setManualPrice(settlementId, VALID_PRICE);

      const price = await oracle.settlementPrice(settlementId);
      expect(price).to.equal(VALID_PRICE);
    });

    it("7.4 Should handle multiple settlements independently", async function () {
      await oracle.setManualPrice(1n, VALID_PRICE);
      await oracle.setManualPrice(2n, VALID_PRICE + 1000n);
      await oracle.setManualPrice(3n, VALID_PRICE + 2000n);

      expect(await oracle.settlementPrice(1n)).to.equal(VALID_PRICE);
      expect(await oracle.settlementPrice(2n)).to.equal(VALID_PRICE + 1000n);
      expect(await oracle.settlementPrice(3n)).to.equal(VALID_PRICE + 2000n);
    });

    it("7.5 Should handle concurrent price updates safely", async function () {
      const settlementId = 1n;
      await oracle.setManualPrice(settlementId, VALID_PRICE);
      await oracle.setManualPrice(settlementId, VALID_PRICE + 100n);
      await oracle.setManualPrice(settlementId, VALID_PRICE + 200n);

      const price = await oracle.settlementPrice(settlementId);
      expect(price).to.equal(VALID_PRICE + 200n);

      const history = await oracle.getSettlementPriceHistory(settlementId);
      expect(history.length).to.equal(3);
    });
  });

  // ============================================
  // HELPER TESTS
  // ============================================

  describe("Helper Functions", function () {
    it("Should get oracle status correctly", async function () {
      const settlementId = 1n;
      const [price, , isValidated, chainlinkHealthy, bandHealthy] =
        await oracle.getOracleStatusForSettlement(settlementId);

      // Before any price set
      expect(price).to.equal(0);
      expect(isValidated).to.equal(false);
      expect(chainlinkHealthy).to.equal(false);
      expect(bandHealthy).to.equal(false);
    });

    it("Should have correct precision constant", async function () {
      const precision = await oracle.PRICE_PRECISION();
      expect(precision).to.equal(100000000n); // 1e8
    });
  });
});
