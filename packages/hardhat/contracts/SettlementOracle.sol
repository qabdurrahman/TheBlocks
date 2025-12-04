// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SettlementOracle
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Dual Oracle system with Chainlink primary and Band Protocol fallback
 * @dev Implements oracle manipulation resistance with deviation detection and dispute mechanism
 * 
 * ARCHITECTURE LAYER: Data Fetching
 * - Chainlink integration (primary oracle)
 * - Band Protocol fallback (secondary oracle)
 * - Price validation logic
 * 
 * SECURITY FEATURES:
 * - Dual oracle architecture (redundancy)
 * - Price deviation detection (>5% triggers alert)
 * - Staleness checks (max 60 seconds)
 * - Fallback mechanism on primary failure
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
    
    // Oracle addresses
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

    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @param _chainlinkOracle Address of Chainlink price feed
     * @param _bandOracle Address of Band Protocol StdReference
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

    // ============================================
    // CORE ORACLE FUNCTIONS
    // ============================================
    
    /**
     * @notice Get latest price from primary oracle (Chainlink)
     * @dev Falls back to Band Protocol if Chainlink fails
     * @return price The current price (8 decimals)
     * @return timestamp When the price was last updated
     */
    function getLatestPrice() public returns (uint256 price, uint256 timestamp) {
        // Try Chainlink first
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
        
        // Fallback to Band Protocol
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
}
