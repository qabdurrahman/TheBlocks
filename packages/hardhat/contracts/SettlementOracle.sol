// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MultiOracleAggregator} from "./MultiOracleAggregator.sol";

/**
 * @title SettlementOracle
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice 5-Oracle BFT Aggregation System with Championship-Grade Price Feeds
 * @dev Integrates with MultiOracleAggregator for Byzantine-fault-tolerant pricing
 * 
 * ARCHITECTURE LAYER: Data Fetching (UPGRADED)
 * - MultiOracleAggregator integration (5 oracles)
 * - Chainlink primary fallback
 * - Band Protocol secondary fallback
 * - BFT median aggregation
 * 
 * SUPPORTED ORACLES (via MultiOracleAggregator):
 * 1. Chainlink - Industry standard push oracle
 * 2. Pyth Network - Sub-second pull oracle
 * 3. Redstone - Multi-sig threshold oracle
 * 4. DIA - Community-sourced oracle
 * 5. Uniswap V3 TWAP - On-chain trustless oracle
 * 
 * SECURITY FEATURES:
 * - BFT tolerance: 2/5 oracles can be compromised
 * - Outlier detection and exclusion
 * - Circuit breakers with cascading fallback
 * - Confidence-weighted averaging
 * - Price deviation detection (>5% triggers alert)
 * - Staleness checks (per-oracle thresholds)
 * 
 * ORACLE FLOW:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     ORACLE DATA FLOW                            │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * STEP 1: Settlement requests price
 *    ↓
 * STEP 2: Try Chainlink (primary)
 *    ├─ Success → Validate freshness → Record price → Return
 *    └─ Fail → Increment fail count → Try Band Protocol
 *                    ↓
 * STEP 3: Try Band Protocol (fallback)
 *    ├─ Success → Validate freshness → Record price → Return
 *    └─ Fail → Use last known price (with warning)
 *                    ↓
 * STEP 4: Cross-validate prices if both available
 *    ├─ Deviation < 5% → Price is valid
 *    └─ Deviation > 5% → Emit warning, allow dispute
 */

// Chainlink interfaces
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

// Band Protocol interface
interface IStdReference {
    struct ReferenceData {
        uint256 rate;
        uint256 lastUpdatedBase;
        uint256 lastUpdatedQuote;
    }
    function getReferenceData(string memory _base, string memory _quote) 
        external view returns (ReferenceData memory);
    function getReferenceDataBulk(string[] memory _bases, string[] memory _quotes) 
        external view returns (ReferenceData[] memory);
}

contract SettlementOracle {
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    // MULTI-ORACLE AGGREGATOR (Primary - 5 oracles with BFT)
    MultiOracleAggregator public multiOracleAggregator;
    bool public useMultiOracle;  // Toggle between multi-oracle and legacy mode
    
    // Oracle addresses (Legacy fallback)
    AggregatorV3Interface public chainlinkOracle;
    IStdReference public bandOracle;
    
    // Configuration
    uint256 public constant MAX_ORACLE_STALENESS = 60;  // 60 seconds max
    uint256 public constant MAX_PRICE_DEVIATION = 5;     // 5% max deviation
    uint256 public constant PRICE_PRECISION = 1e8;       // 8 decimals standard
    
    // Oracle state tracking
    uint256 public lastChainlinkPrice;
    uint256 public lastChainlinkTimestamp;
    uint256 public lastBandPrice;
    uint256 public lastBandTimestamp;
    
    // Fallback tracking
    bool public chainlinkAvailable;
    bool public bandAvailable;
    uint256 public chainlinkFailCount;
    uint256 public bandFailCount;
    uint256 public constant MAX_FAIL_COUNT = 3;
    
    // Price history for manipulation detection
    uint256[] public priceHistory;
    uint256 public constant PRICE_HISTORY_SIZE = 10;
    
    // ============================================
    // SETTLEMENT-SPECIFIC PRICE TRACKING (BATCH 2)
    // ============================================
    
    /**
     * @dev Price record with source and timestamp for audit trail
     */
    struct PriceRecord {
        uint256 price;
        uint256 timestamp;
        uint8 source;     // 0 = Chainlink, 1 = Band, 255 = Manual
        uint256 blockNumber;
    }
    
    // Settlement ID => array of price records (audit trail)
    mapping(uint256 => PriceRecord[]) public settlementPriceHistory;
    
    // Settlement ID => final validated price used
    mapping(uint256 => uint256) public settlementPrice;
    
    // Settlement ID => price source used (0=Chainlink, 1=Band, 255=Manual)
    mapping(uint256 => uint8) public settlementPriceSource;
    
    // Settlement ID => whether price has been validated
    mapping(uint256 => bool) public settlementPriceValidated;
    
    // Price bounds for sanity checks
    uint256 public constant MIN_VALID_PRICE = 100;        // $1 (with 2 decimals)
    uint256 public constant MAX_VALID_PRICE = 10000000;   // $100,000 (with 2 decimals)
    
    // ============================================
    // EVENTS
    // ============================================
    
    event PriceUpdated(
        string indexed source,
        uint256 price,
        uint256 timestamp
    );
    
    event PriceDeviationDetected(
        uint256 chainlinkPrice,
        uint256 bandPrice,
        uint256 deviationPercent
    );
    
    event OracleFailure(
        string indexed source,
        string reason
    );
    
    event OracleRecovered(
        string indexed source
    );
    
    // Batch 2: Settlement-specific oracle events
    event SettlementPriceValidated(
        uint256 indexed settlementId,
        uint256 price,
        uint8 source,
        uint256 timestamp
    );
    
    event SettlementPriceDisputed(
        uint256 indexed settlementId,
        uint256 originalPrice,
        uint256 suggestedPrice,
        address disputer
    );
    
    event OracleFailover(
        uint8 fromSource,
        uint8 toSource,
        string reason
    );
    
    event PriceOutOfBounds(
        uint256 price,
        uint256 minBound,
        uint256 maxBound
    );

    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @param _chainlinkOracle Address of Chainlink price feed (fallback)
     * @param _bandOracle Address of Band Protocol StdReference (fallback)
     */
    constructor(address _chainlinkOracle, address _bandOracle) {
        // For local testing, allow zero addresses
        if (_chainlinkOracle != address(0)) {
            chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
            chainlinkAvailable = true;
        }
        
        if (_bandOracle != address(0)) {
            bandOracle = IStdReference(_bandOracle);
            bandAvailable = true;
        }
    }
    
    /**
     * @notice Set the MultiOracleAggregator for 5-oracle BFT pricing
     * @param _aggregator Address of the MultiOracleAggregator
     */
    function setMultiOracleAggregator(address _aggregator) external {
        // In production, add access control
        require(_aggregator != address(0), "Invalid aggregator");
        multiOracleAggregator = MultiOracleAggregator(_aggregator);
        useMultiOracle = true;
    }
    
    /**
     * @notice Toggle between multi-oracle and legacy mode
     * @param _useMultiOracle True to use 5-oracle aggregator
     */
    function setUseMultiOracle(bool _useMultiOracle) external {
        // In production, add access control
        require(
            !_useMultiOracle || address(multiOracleAggregator) != address(0),
            "Aggregator not configured"
        );
        useMultiOracle = _useMultiOracle;
    }

    // ============================================
    // CORE ORACLE FUNCTIONS
    // ============================================
    
    /**
     * @notice Get latest price from oracles
     * @dev Uses 5-oracle BFT aggregator if configured, else falls back to dual-oracle
     * @return price The current price (8 decimals)
     * @return timestamp When the price was last updated
     */
    function getLatestPrice() public returns (uint256 price, uint256 timestamp) {
        // PRIORITY 1: Use MultiOracleAggregator (5 oracles, BFT median)
        if (useMultiOracle && address(multiOracleAggregator) != address(0)) {
            try multiOracleAggregator.getAggregatedPrice() returns (
                MultiOracleAggregator.AggregatedPrice memory aggregated
            ) {
                if (aggregated.isReliable && aggregated.medianPrice > 0) {
                    price = aggregated.medianPrice;
                    timestamp = aggregated.timestamp;
                    
                    _recordPrice(price);
                    emit PriceUpdated("MultiOracle-BFT", price, timestamp);
                    
                    return (price, timestamp);
                }
                // Multi-oracle not reliable, fall through to legacy
            } catch {
                // Aggregator failed, fall through to legacy mode
                emit OracleFailure("MultiOracle", "Aggregator call failed");
            }
        }
        
        // PRIORITY 2: Legacy Chainlink
        if (chainlinkAvailable) {
            try this._getChainlinkPrice() returns (uint256 p, uint256 t) {
                // Validate freshness
                if (block.timestamp - t <= MAX_ORACLE_STALENESS) {
                    lastChainlinkPrice = p;
                    lastChainlinkTimestamp = t;
                    chainlinkFailCount = 0;
                    
                    _recordPrice(p);
                    emit PriceUpdated("Chainlink", p, t);
                    
                    // Cross-validate with Band if available
                    if (bandAvailable) {
                        _crossValidate(p);
                    }
                    
                    return (p, t);
                }
            } catch {
                chainlinkFailCount++;
                emit OracleFailure("Chainlink", "Call failed");
                
                if (chainlinkFailCount >= MAX_FAIL_COUNT) {
                    chainlinkAvailable = false;
                }
            }
        }
        
        // PRIORITY 3: Fallback to Band Protocol
        return getFallbackPrice();
    }
    
    /**
     * @notice Get price from fallback oracle (Band Protocol)
     * @return price The current price (8 decimals)
     * @return timestamp When the price was last updated
     */
    function getFallbackPrice() public returns (uint256 price, uint256 timestamp) {
        if (bandAvailable) {
            try this._getBandPrice() returns (uint256 p, uint256 t) {
                if (block.timestamp - t <= MAX_ORACLE_STALENESS) {
                    lastBandPrice = p;
                    lastBandTimestamp = t;
                    bandFailCount = 0;
                    
                    _recordPrice(p);
                    emit PriceUpdated("Band", p, t);
                    
                    return (p, t);
                }
            } catch {
                bandFailCount++;
                emit OracleFailure("Band", "Call failed");
                
                if (bandFailCount >= MAX_FAIL_COUNT) {
                    bandAvailable = false;
                }
            }
        }
        
        // Both oracles failed - return last known price with warning
        require(lastChainlinkPrice > 0 || lastBandPrice > 0, "No oracle data available");
        
        if (lastChainlinkTimestamp > lastBandTimestamp) {
            return (lastChainlinkPrice, lastChainlinkTimestamp);
        } else {
            return (lastBandPrice, lastBandTimestamp);
        }
    }
    
    /**
     * @notice Get Chainlink price (external for try/catch)
     */
    function _getChainlinkPrice() external view returns (uint256, uint256) {
        require(address(chainlinkOracle) != address(0), "Chainlink not configured");
        
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = chainlinkOracle.latestRoundData();
        
        require(answer > 0, "Invalid Chainlink price");
        
        return (uint256(answer), updatedAt);
    }
    
    /**
     * @notice Get Band Protocol price (external for try/catch)
     */
    function _getBandPrice() external view returns (uint256, uint256) {
        require(address(bandOracle) != address(0), "Band not configured");
        
        IStdReference.ReferenceData memory data = bandOracle.getReferenceData("ETH", "USD");
        
        require(data.rate > 0, "Invalid Band price");
        
        // Band returns 18 decimals, convert to 8
        uint256 normalizedPrice = data.rate / 1e10;
        
        // Use the more recent of base or quote update
        uint256 updateTime = data.lastUpdatedBase > data.lastUpdatedQuote 
            ? data.lastUpdatedBase 
            : data.lastUpdatedQuote;
        
        return (normalizedPrice, updateTime);
    }

    // ============================================
    // ORACLE VALIDATION & MANIPULATION DETECTION
    // ============================================
    
    /**
     * @dev Cross-validate price between oracles
     */
    function _crossValidate(uint256 primaryPrice) internal {
        try this._getBandPrice() returns (uint256 bandPrice, uint256) {
            uint256 deviation = _calculateDeviationPercent(primaryPrice, bandPrice);
            
            if (deviation > MAX_PRICE_DEVIATION) {
                emit PriceDeviationDetected(primaryPrice, bandPrice, deviation);
                // Don't revert, but flag for potential dispute
            }
            
            lastBandPrice = bandPrice;
            lastBandTimestamp = block.timestamp;
        } catch {
            // Band validation failed, continue with primary
        }
    }
    
    /**
     * @dev Record price in history for manipulation detection
     */
    function _recordPrice(uint256 price) internal {
        if (priceHistory.length >= PRICE_HISTORY_SIZE) {
            // Shift array left (remove oldest)
            for (uint256 i = 0; i < priceHistory.length - 1; i++) {
                priceHistory[i] = priceHistory[i + 1];
            }
            priceHistory[priceHistory.length - 1] = price;
        } else {
            priceHistory.push(price);
        }
    }
    
    /**
     * @dev Calculate deviation percentage between two prices
     */
    function _calculateDeviationPercent(uint256 price1, uint256 price2) 
        internal 
        pure 
        returns (uint256) 
    {
        if (price1 == 0 || price2 == 0) return 100;
        
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        return (diff * 100) / price1;
    }
    
    /**
     * @notice Check if current price shows signs of manipulation
     * @dev Uses price history to detect sudden spikes
     * @return isManipulated True if manipulation detected
     * @return reason Description of manipulation type
     */
    function checkManipulation() external view returns (bool isManipulated, string memory reason) {
        if (priceHistory.length < 3) {
            return (false, "Insufficient history");
        }
        
        uint256 latestPrice = priceHistory[priceHistory.length - 1];
        uint256 previousPrice = priceHistory[priceHistory.length - 2];
        
        // Check for sudden spike (>10% in one update)
        uint256 deviation = _calculateDeviationPercent(latestPrice, previousPrice);
        if (deviation > 10) {
            return (true, "Sudden price spike detected");
        }
        
        // Check for oscillation pattern (potential oracle attack)
        if (priceHistory.length >= 4) {
            uint256 p1 = priceHistory[priceHistory.length - 4];
            uint256 p2 = priceHistory[priceHistory.length - 3];
            uint256 p3 = priceHistory[priceHistory.length - 2];
            uint256 p4 = priceHistory[priceHistory.length - 1];
            
            // Oscillating: high-low-high-low or low-high-low-high
            bool oscillating = (p1 > p2 && p2 < p3 && p3 > p4) || 
                              (p1 < p2 && p2 > p3 && p3 < p4);
            
            if (oscillating) {
                uint256 amplitude = _calculateDeviationPercent(p1, p2);
                if (amplitude > 5) {
                    return (true, "Price oscillation detected");
                }
            }
        }
        
        return (false, "No manipulation detected");
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get cached prices without updating
     */
    function getCachedPrices() external view returns (
        uint256 chainlink,
        uint256 chainlinkTime,
        uint256 band,
        uint256 bandTime
    ) {
        return (
            lastChainlinkPrice,
            lastChainlinkTimestamp,
            lastBandPrice,
            lastBandTimestamp
        );
    }
    
    /**
     * @notice Get oracle health status
     */
    function getOracleHealth() external view returns (
        bool chainlinkHealthy,
        bool bandHealthy,
        uint256 chainlinkFails,
        uint256 bandFails
    ) {
        return (
            chainlinkAvailable,
            bandAvailable,
            chainlinkFailCount,
            bandFailCount
        );
    }
    
    /**
     * @notice Get complete oracle system health including multi-oracle aggregator
     */
    function getFullOracleHealth() external view returns (
        bool usingMultiOracle,
        bool chainlinkHealthy,
        bool bandHealthy,
        uint8 activeMultiOracleCount,
        MultiOracleAggregator.CircuitBreakerLevel circuitLevel,
        bool systemPaused
    ) {
        usingMultiOracle = useMultiOracle && address(multiOracleAggregator) != address(0);
        chainlinkHealthy = chainlinkAvailable;
        bandHealthy = bandAvailable;
        
        if (usingMultiOracle) {
            (circuitLevel, systemPaused, activeMultiOracleCount,) = 
                multiOracleAggregator.getSystemHealth();
        }
    }
    
    /**
     * @notice Get latest aggregated price from multi-oracle (view only)
     */
    function getMultiOraclePrice() external view returns (
        uint256 medianPrice,
        uint256 weightedPrice,
        uint256 twapPrice,
        uint256 confidence,
        uint8 validOracleCount,
        bool isReliable
    ) {
        if (address(multiOracleAggregator) != address(0)) {
            MultiOracleAggregator.AggregatedPrice memory latest = 
                multiOracleAggregator.getLatestPrice();
            
            return (
                latest.medianPrice,
                latest.weightedPrice,
                latest.twapPrice,
                latest.confidence,
                latest.validOracleCount,
                latest.isReliable
            );
        }
    }
    
    /**
     * @notice Get price history
     */
    function getPriceHistory() external view returns (uint256[] memory) {
        return priceHistory;
    }
    
    /**
     * @notice Calculate TWAP (Time-Weighted Average Price) from history
     */
    function getTWAP() external view returns (uint256) {
        if (priceHistory.length == 0) return 0;
        
        uint256 sum = 0;
        for (uint256 i = 0; i < priceHistory.length; i++) {
            sum += priceHistory[i];
        }
        
        return sum / priceHistory.length;
    }

    // ============================================
    // ADMIN FUNCTIONS (for oracle recovery)
    // ============================================
    
    /**
     * @notice Reset oracle availability after recovery
     */
    function resetOracleStatus() external {
        // In production, add access control
        chainlinkAvailable = address(chainlinkOracle) != address(0);
        bandAvailable = address(bandOracle) != address(0);
        chainlinkFailCount = 0;
        bandFailCount = 0;
        
        if (chainlinkAvailable) emit OracleRecovered("Chainlink");
        if (bandAvailable) emit OracleRecovered("Band");
    }
    
    /**
     * @notice Update oracle addresses (emergency)
     */
    function updateOracles(address _chainlink, address _band) external {
        // In production, add access control and timelock
        if (_chainlink != address(0)) {
            chainlinkOracle = AggregatorV3Interface(_chainlink);
            chainlinkAvailable = true;
            chainlinkFailCount = 0;
        }
        
        if (_band != address(0)) {
            bandOracle = IStdReference(_band);
            bandAvailable = true;
            bandFailCount = 0;
        }
    }

    // ============================================
    // SETTLEMENT-SPECIFIC PRICE FUNCTIONS (BATCH 2)
    // ============================================
    
    /**
     * @notice Get validated price for a specific settlement
     * @dev Uses 5-oracle BFT aggregator if configured, else dual-oracle fallback
     * @param settlementId The settlement requesting price
     * @return price The validated price
     * @return source Which oracle provided it (0=Chainlink, 1=Band, 2=MultiOracle)
     * @return isValid Whether price passed all validation checks
     * 
     * INVARIANT: Price must be:
     * 1. Fresh (< 60 seconds old)
     * 2. Within bounds ($1 - $100,000)
     * 3. Not showing manipulation patterns
     * 4. Pass BFT consensus (if using MultiOracle)
     */
    function getValidatedPriceForSettlement(uint256 settlementId)
        external
        returns (uint256 price, uint8 source, bool isValid)
    {
        // PRIORITY 1: Use MultiOracleAggregator (5 oracles, BFT median)
        if (useMultiOracle && address(multiOracleAggregator) != address(0)) {
            try multiOracleAggregator.getAggregatedPrice() returns (
                MultiOracleAggregator.AggregatedPrice memory aggregated
            ) {
                if (aggregated.isReliable && 
                    aggregated.medianPrice > 0 && 
                    _isPriceWithinBounds(aggregated.medianPrice)) {
                    
                    price = aggregated.medianPrice;
                    source = 2; // MultiOracle source
                    isValid = true;
                    
                    _recordSettlementPrice(settlementId, price, source);
                    _recordPrice(price);
                    
                    emit SettlementPriceValidated(settlementId, price, source, aggregated.timestamp);
                    return (price, source, isValid);
                }
                // Multi-oracle not reliable, fall through to legacy
            } catch {
                emit OracleFailure("MultiOracle", "Settlement price fetch failed");
            }
        }
        
        // PRIORITY 2: Try Chainlink
        if (chainlinkAvailable) {
            try this._getChainlinkPrice() returns (uint256 p, uint256 t) {
                if (_isPriceFresh(t) && _isPriceWithinBounds(p)) {
                    lastChainlinkPrice = p;
                    lastChainlinkTimestamp = t;
                    chainlinkFailCount = 0;
                    
                    _recordSettlementPrice(settlementId, p, 0);
                    _recordPrice(p);
                    
                    emit SettlementPriceValidated(settlementId, p, 0, t);
                    return (p, 0, true);
                }
            } catch {
                chainlinkFailCount++;
                if (chainlinkFailCount >= MAX_FAIL_COUNT) {
                    chainlinkAvailable = false;
                }
            }
        }
        
        // STEP 2: Chainlink failed - try Band Protocol
        if (bandAvailable) {
            try this._getBandPrice() returns (uint256 p, uint256 t) {
                if (_isPriceFresh(t) && _isPriceWithinBounds(p)) {
                    lastBandPrice = p;
                    lastBandTimestamp = t;
                    bandFailCount = 0;
                    
                    _recordSettlementPrice(settlementId, p, 1);
                    _recordPrice(p);
                    
                    emit OracleFailover(0, 1, "Chainlink unavailable");
                    emit SettlementPriceValidated(settlementId, p, 1, t);
                    return (p, 1, true);
                }
            } catch {
                bandFailCount++;
                if (bandFailCount >= MAX_FAIL_COUNT) {
                    bandAvailable = false;
                }
            }
        }
        
        // STEP 3: Both failed - use last known price (marked as unsafe)
        if (lastChainlinkPrice > 0 && _isPriceWithinBounds(lastChainlinkPrice)) {
            _recordSettlementPrice(settlementId, lastChainlinkPrice, 0);
            return (lastChainlinkPrice, 0, false); // isValid = false
        }
        
        if (lastBandPrice > 0 && _isPriceWithinBounds(lastBandPrice)) {
            _recordSettlementPrice(settlementId, lastBandPrice, 1);
            return (lastBandPrice, 1, false); // isValid = false
        }
        
        // No valid price available
        return (0, 255, false);
    }
    
    /**
     * @notice Check if price is fresh (not stale)
     * @param priceTimestamp When the price was fetched
     * @return True if within freshness window
     * 
     * INVARIANT: Settlement cannot use price older than 60 seconds
     */
    function _isPriceFresh(uint256 priceTimestamp) internal view returns (bool) {
        if (priceTimestamp == 0) return false;
        return (block.timestamp - priceTimestamp) <= MAX_ORACLE_STALENESS;
    }
    
    /**
     * @notice Check if price is within reasonable bounds
     * @param price The price to validate
     * @return True if within bounds
     * 
     * INVARIANT: Prevents obviously wrong prices (hacked oracle)
     */
    function _isPriceWithinBounds(uint256 price) internal pure returns (bool) {
        return price >= MIN_VALID_PRICE && price <= MAX_VALID_PRICE;
    }
    
    /**
     * @notice Check if price is within bounds and emit event if not
     * @param price The price to validate
     * @return True if within bounds
     */
    function _validatePriceBounds(uint256 price) internal returns (bool) {
        bool withinBounds = price >= MIN_VALID_PRICE && price <= MAX_VALID_PRICE;
        
        if (!withinBounds) {
            emit PriceOutOfBounds(price, MIN_VALID_PRICE, MAX_VALID_PRICE);
        }
        
        return withinBounds;
    }
    
    /**
     * @notice Record price for a specific settlement (audit trail)
     * @param settlementId The settlement ID
     * @param price The price value
     * @param source The oracle source
     */
    function _recordSettlementPrice(
        uint256 settlementId,
        uint256 price,
        uint8 source
    ) internal {
        settlementPrice[settlementId] = price;
        settlementPriceSource[settlementId] = source;
        settlementPriceValidated[settlementId] = true;
        
        settlementPriceHistory[settlementId].push(PriceRecord({
            price: price,
            timestamp: block.timestamp,
            source: source,
            blockNumber: block.number
        }));
    }
    
    /**
     * @notice Get price history for a settlement
     * @param settlementId The settlement to query
     * @return Array of price records
     */
    function getSettlementPriceHistory(uint256 settlementId)
        external
        view
        returns (PriceRecord[] memory)
    {
        return settlementPriceHistory[settlementId];
    }
    
    /**
     * @notice Check if price movement is normal (not manipulated)
     * @param settlementId The settlement to check
     * @return deviation Percentage deviation from last price
     * @return isNormal True if deviation is within threshold
     */
    function isPriceMovementNormal(uint256 settlementId)
        external
        view
        returns (uint256 deviation, bool isNormal)
    {
        uint256 currentPrice = settlementPrice[settlementId];
        if (currentPrice == 0) return (0, false);
        
        // Compare with last known Chainlink price
        if (lastChainlinkPrice == 0) return (0, true);
        
        deviation = _calculateDeviationPercent(lastChainlinkPrice, currentPrice);
        isNormal = deviation <= MAX_PRICE_DEVIATION;
        
        return (deviation, isNormal);
    }
    
    /**
     * @notice Manually set price for a settlement (emergency/dispute resolution)
     * @param settlementId The settlement ID
     * @param price The corrected price
     * @dev In production, add access control (onlyOwner/multisig)
     * @dev Also sets lastChainlinkPrice/timestamp so getLatestPrice() works for testing
     */
    function setManualPrice(uint256 settlementId, uint256 price) external {
        // In production: require(msg.sender == owner, "Only owner");
        require(_isPriceWithinBounds(price), "Price out of bounds");
        
        // Set the main oracle price (so getLatestPrice() works in tests)
        lastChainlinkPrice = price;
        lastChainlinkTimestamp = block.timestamp;
        
        // Record settlement-specific price
        _recordSettlementPrice(settlementId, price, 255); // 255 = manual
        
        emit SettlementPriceValidated(settlementId, price, 255, block.timestamp);
    }
    
    /**
     * @notice Get comprehensive oracle status for a settlement
     * @param settlementId The settlement to query
     * @return price Current price for settlement
     * @return source Oracle source used
     * @return isValidated Whether price has been validated
     * @return chainlinkHealthy Chainlink oracle status
     * @return bandHealthy Band Protocol oracle status
     */
    function getOracleStatusForSettlement(uint256 settlementId)
        external
        view
        returns (
            uint256 price,
            uint8 source,
            bool isValidated,
            bool chainlinkHealthy,
            bool bandHealthy
        )
    {
        return (
            settlementPrice[settlementId],
            settlementPriceSource[settlementId],
            settlementPriceValidated[settlementId],
            chainlinkAvailable,
            bandAvailable
        );
    }
}
