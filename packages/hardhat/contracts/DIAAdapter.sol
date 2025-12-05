// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DIAAdapter
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Enhanced adapter for DIA Oracle with Chainlink-compatible interface
 * @dev DIA provides 2000+ price feeds from diverse community sources
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                          DIA ORACLE ADAPTER                                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   WHY DIA IS VALUABLE:                                                       ║
 * ║   ┌──────────────────────────────────────────────────────────────────────┐   ║
 * ║   │  1. Community Sourced: Data aggregated from multiple exchanges      │   ║
 * ║   │  2. 2000+ Feeds: Wide asset coverage including DeFi tokens          │   ║
 * ║   │  3. Transparent: Open-source methodology                            │   ║
 * ║   │  4. Multi-chain: Available on 20+ blockchains                       │   ║
 * ║   └──────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ║   SEPOLIA ADDRESS: 0xa93546947f3015c986695750b8bbEa8e26D65856               ║
 * ║                                                                               ║
 * ║   FEED FORMAT: "ASSET/USD" (e.g., "ETH/USD", "BTC/USD")                      ║
 * ║   RETURN: (uint128 price, uint128 timestamp)                                 ║
 * ║   DECIMALS: 8 (same as Chainlink)                                            ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * @dev DIA Oracle V2 Interface
 */
interface IDIAOracleV2 {
    function getValue(string memory key) external view returns (uint128, uint128);
}

contract DIAAdapter {
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;
    uint8 public constant DECIMALS = 8;
    
    // Standard feed keys
    string public constant ETH_USD_KEY = "ETH/USD";
    string public constant BTC_USD_KEY = "BTC/USD";
    string public constant USDC_USD_KEY = "USDC/USD";
    string public constant DAI_USD_KEY = "DAI/USD";
    string public constant LINK_USD_KEY = "LINK/USD";
    
    // ============================================
    // STATE
    // ============================================
    
    address public admin;
    address public aggregator;
    
    // DIA Oracle V2 contract
    IDIAOracleV2 public diaOracle;
    
    // Configuration
    uint256 public maxStaleness = 3600; // 1 hour
    string public primaryFeed = ETH_USD_KEY;
    
    // Cached prices for fallback
    mapping(string => uint128) public cachedPrices;
    mapping(string => uint128) public cachedTimestamps;
    
    // Reliability tracking
    uint256 public consecutiveFailures;
    uint256 public consecutiveSuccesses;
    uint256 public totalQueries;
    uint256 public successfulQueries;
    
    // Price bounds
    uint256 public minValidPrice = 1e6;  // $10 minimum
    uint256 public maxValidPrice = 1e12; // $10,000 maximum
    
    // ============================================
    // EVENTS
    // ============================================
    
    event PriceFetched(string indexed key, uint128 price, uint128 timestamp);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event FallbackUsed(string indexed key, uint128 cachedPrice);
    event PriceOutOfBounds(string indexed key, uint128 price);
    event StalePrice(string indexed key, uint256 age, uint256 maxAge);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error OnlyAdmin();
    error OnlyAggregator();
    error InvalidAddress();
    error PriceTooOld(uint256 age, uint256 maxAge);
    error InvalidPrice(uint128 price);
    error OracleCallFailed();
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }
    
    modifier onlyAggregator() {
        if (msg.sender != aggregator && msg.sender != admin) revert OnlyAggregator();
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @notice Initialize DIA Adapter
     * @param _diaOracle DIA Oracle V2 address (Sepolia: 0xa93546947f3015c986695750b8bbEa8e26D65856)
     * @param _aggregator MultiOracleAggregator address
     */
    constructor(address _diaOracle, address _aggregator) {
        require(_diaOracle != address(0), "Invalid DIA oracle");
        admin = msg.sender;
        diaOracle = IDIAOracleV2(_diaOracle);
        aggregator = _aggregator;
    }
    
    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * @notice Update DIA Oracle address
     * @param _newOracle New DIA Oracle V2 address
     */
    function setDIAOracle(address _newOracle) external onlyAdmin {
        if (_newOracle == address(0)) revert InvalidAddress();
        emit OracleUpdated(address(diaOracle), _newOracle);
        diaOracle = IDIAOracleV2(_newOracle);
        // Reset failure count on new oracle
        consecutiveFailures = 0;
    }
    
    /**
     * @notice Update max staleness threshold
     * @param _maxStaleness New max staleness in seconds
     */
    function setMaxStaleness(uint256 _maxStaleness) external onlyAdmin {
        maxStaleness = _maxStaleness;
    }
    
    /**
     * @notice Update price bounds
     * @param _minPrice Minimum valid price (8 decimals)
     * @param _maxPrice Maximum valid price (8 decimals)
     */
    function setPriceBounds(uint256 _minPrice, uint256 _maxPrice) external onlyAdmin {
        require(_minPrice < _maxPrice, "Invalid bounds");
        minValidPrice = _minPrice;
        maxValidPrice = _maxPrice;
    }
    
    /**
     * @notice Update aggregator address
     * @param _aggregator New aggregator address
     */
    function setAggregator(address _aggregator) external onlyAdmin {
        if (_aggregator == address(0)) revert InvalidAddress();
        aggregator = _aggregator;
    }
    
    // ============================================
    // PRICE FETCHING
    // ============================================
    
    /**
     * @notice Get price for a specific feed
     * @param key Feed key (e.g., "ETH/USD")
     * @return price Normalized price with 8 decimals
     * @return timestamp When the price was updated
     * @return isValid Whether the price passed validation
     */
    function getPrice(string memory key) 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        totalQueries++;
        
        try diaOracle.getValue(key) returns (uint128 diaPrice, uint128 diaTimestamp) {
            // Validate price
            if (diaPrice == 0) {
                revert InvalidPrice(0);
            }
            
            // Check staleness
            uint256 age = block.timestamp - diaTimestamp;
            if (age > maxStaleness) {
                emit StalePrice(key, age, maxStaleness);
                consecutiveFailures++;
                return _useFallback(key);
            }
            
            // Check bounds
            if (diaPrice < minValidPrice || diaPrice > maxValidPrice) {
                emit PriceOutOfBounds(key, diaPrice);
                consecutiveFailures++;
                return _useFallback(key);
            }
            
            // Success!
            consecutiveSuccesses++;
            consecutiveFailures = 0;
            successfulQueries++;
            
            // Cache the price
            cachedPrices[key] = diaPrice;
            cachedTimestamps[key] = diaTimestamp;
            
            emit PriceFetched(key, diaPrice, diaTimestamp);
            
            return (uint256(diaPrice), uint256(diaTimestamp), true);
            
        } catch {
            consecutiveFailures++;
            consecutiveSuccesses = 0;
            return _useFallback(key);
        }
    }
    
    /**
     * @notice Get ETH/USD price (convenience function)
     * @return price ETH/USD price with 8 decimals
     * @return timestamp Last update timestamp
     * @return isValid Whether the price is valid
     */
    function getETHUSDPrice() 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        return this.getPrice(ETH_USD_KEY);
    }
    
    // ============================================
    // CHAINLINK-COMPATIBLE INTERFACE
    // ============================================
    
    /**
     * @notice Chainlink-compatible latestRoundData interface
     * @dev Allows seamless integration with existing Chainlink-expecting contracts
     * @return roundId Always returns 1 for DIA
     * @return answer The ETH/USD price with 8 decimals
     * @return startedAt The timestamp when data was retrieved
     * @return updatedAt The timestamp when data was retrieved
     * @return answeredInRound Always returns 1 for DIA
     */
    function latestRoundData() 
        external 
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) 
    {
        try diaOracle.getValue(primaryFeed) returns (uint128 diaPrice, uint128 diaTimestamp) {
            if (diaPrice > 0 && block.timestamp - diaTimestamp <= maxStaleness) {
                return (
                    1,
                    int256(uint256(diaPrice)),
                    uint256(diaTimestamp),
                    uint256(diaTimestamp),
                    1
                );
            }
        } catch {}
        
        // Return cached as fallback
        uint128 cached = cachedPrices[primaryFeed];
        if (cached > 0) {
            uint128 ts = cachedTimestamps[primaryFeed];
            return (1, int256(uint256(cached)), ts, ts, 1);
        }
        
        return (0, 0, 0, 0, 0);
    }
    
    /**
     * @notice Returns the number of decimals for the price feed
     * @return decimals Always 8
     */
    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }
    
    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================
    
    /**
     * @dev Use cached price as fallback
     */
    function _useFallback(string memory key) 
        internal 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        uint128 cached = cachedPrices[key];
        if (cached > 0) {
            uint128 ts = cachedTimestamps[key];
            // Only use cached if not too old (10x staleness)
            if (block.timestamp - ts <= maxStaleness * 10) {
                emit FallbackUsed(key, cached);
                return (uint256(cached), uint256(ts), true);
            }
        }
        return (0, 0, false);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get adapter statistics
     * @return total Total queries
     * @return successful Successful queries  
     * @return failures Consecutive failures
     * @return successes Consecutive successes
     * @return successRate Success rate percentage
     */
    function getStats() 
        external 
        view 
        returns (
            uint256 total,
            uint256 successful,
            uint256 failures,
            uint256 successes,
            uint256 successRate
        ) 
    {
        total = totalQueries;
        successful = successfulQueries;
        failures = consecutiveFailures;
        successes = consecutiveSuccesses;
        successRate = totalQueries > 0 ? (successfulQueries * 100) / totalQueries : 0;
    }
    
    /**
     * @notice Get cached price for a feed
     * @param key Feed key
     * @return price Cached price
     * @return timestamp Cache timestamp
     */
    function getCachedPrice(string memory key) 
        external 
        view 
        returns (uint128 price, uint128 timestamp) 
    {
        return (cachedPrices[key], cachedTimestamps[key]);
    }
    
    /**
     * @notice Check oracle health
     * @return healthy True if oracle is responding well
     * @return failureCount Current consecutive failure count
     */
    function isHealthy() external view returns (bool healthy, uint256 failureCount) {
        healthy = consecutiveFailures < 3;
        failureCount = consecutiveFailures;
    }
    
    /**
     * @notice Get multiple prices in one call
     * @param keys Array of feed keys
     * @return prices Array of prices
     * @return timestamps Array of timestamps
     * @return validFlags Array of validity flags
     */
    function getMultiplePrices(string[] memory keys) 
        external 
        view 
        returns (
            uint128[] memory prices,
            uint128[] memory timestamps,
            bool[] memory validFlags
        ) 
    {
        prices = new uint128[](keys.length);
        timestamps = new uint128[](keys.length);
        validFlags = new bool[](keys.length);
        
        for (uint256 i = 0; i < keys.length; i++) {
            try diaOracle.getValue(keys[i]) returns (uint128 p, uint128 t) {
                prices[i] = p;
                timestamps[i] = t;
                validFlags[i] = p > 0 && block.timestamp - t <= maxStaleness;
            } catch {
                // Use cached
                prices[i] = cachedPrices[keys[i]];
                timestamps[i] = cachedTimestamps[keys[i]];
                validFlags[i] = false;
            }
        }
    }
}
