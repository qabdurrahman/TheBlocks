// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title API3Adapter
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Adapter for API3 dAPI (Decentralized API) first-party oracle
 * @dev API3 provides first-party oracles where data comes directly from the source
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                          API3 dAPI ORACLE ADAPTER                             ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   WHY API3 IS UNIQUE:                                                        ║
 * ║   ┌──────────────────────────────────────────────────────────────────────┐   ║
 * ║   │  1. First-Party Oracles: Data directly from source (not middlemen)  │   ║
 * ║   │  2. OEV (Oracle Extractable Value): Revenue share for dApps         │   ║
 * ║   │  3. QRNG: Quantum Random Number Generation (truly random)           │   ║
 * ║   │  4. Self-Funded: dApps sponsor their own feeds                      │   ║
 * ║   └──────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ║   INTEGRATION PATTERN:                                                       ║
 * ║   • Read from dAPI proxy contract                                            ║
 * ║   • Each feed has unique proxy address                                       ║
 * ║   • Returns (int224 value, uint32 timestamp)                                 ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * @dev API3 dAPI Proxy interface
 * Each data feed is accessed through a dedicated proxy contract
 * Deploy proxy from API3 Market: https://market.api3.org/
 */
interface IApi3ReaderProxy {
    /// @notice Reads the dAPI value and timestamp
    /// @return value The dAPI value as a signed 224-bit integer
    /// @return timestamp The timestamp of the dAPI value
    function read() external view returns (int224 value, uint32 timestamp);
}

/**
 * @dev API3 Server V1 interface for direct access (alternative method)
 */
interface IApi3ServerV1 {
    function readDataFeedWithId(bytes32 dataFeedId) 
        external view 
        returns (int224 value, uint32 timestamp);
    
    function readDataFeedWithDapiNameHash(bytes32 dapiNameHash) 
        external view 
        returns (int224 value, uint32 timestamp);
}

contract API3Adapter {
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;
    
    // API3 returns 18 decimals by default
    uint8 public constant API3_DECIMALS = 18;
    uint8 public constant OUTPUT_DECIMALS = 8;
    
    // dAPI name hashes for common feeds
    // keccak256(abi.encodePacked("ETH/USD"))
    bytes32 public constant ETH_USD_DAPI_NAME_HASH = keccak256(abi.encodePacked("ETH/USD"));
    bytes32 public constant BTC_USD_DAPI_NAME_HASH = keccak256(abi.encodePacked("BTC/USD"));
    
    // ============================================
    // STATE
    // ============================================
    
    address public admin;
    address public aggregator;
    
    // API3 Server V1 (for Sepolia: obtained from API3 Market)
    address public api3Server;
    
    // Direct proxy addresses for faster access
    mapping(bytes32 => address) public feedProxies;
    
    // Configuration
    uint256 public maxStaleness = 3600; // 1 hour default
    
    // Cached prices for fallback
    mapping(bytes32 => int224) public cachedPrices;
    mapping(bytes32 => uint32) public cachedTimestamps;
    
    // Statistics
    uint256 public totalReads;
    uint256 public successfulReads;
    uint256 public failedReads;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event PriceFetched(bytes32 indexed feedId, int224 price, uint32 timestamp);
    event ProxyConfigured(bytes32 indexed feedId, address proxyAddress);
    event FallbackUsed(bytes32 indexed feedId, int224 cachedPrice);
    event API3ServerUpdated(address indexed oldServer, address indexed newServer);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error OnlyAdmin();
    error OnlyAggregator();
    error InvalidAddress();
    error StalePrice(uint256 age, uint256 maxAge);
    error NegativePrice(int224 price);
    error ProxyNotConfigured(bytes32 feedId);
    
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
    
    constructor(address _aggregator, address _api3Server) {
        admin = msg.sender;
        aggregator = _aggregator;
        api3Server = _api3Server;
    }
    
    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * @notice Configure a dAPI proxy address for a specific feed
     * @param feedId The keccak256 hash of the dAPI name (e.g., "ETH/USD")
     * @param proxyAddress The API3 proxy contract address from API3 Market
     */
    function configureProxy(bytes32 feedId, address proxyAddress) external onlyAdmin {
        if (proxyAddress == address(0)) revert InvalidAddress();
        feedProxies[feedId] = proxyAddress;
        emit ProxyConfigured(feedId, proxyAddress);
    }
    
    /**
     * @notice Update API3 Server address
     * @param _newServer New API3 Server V1 address
     */
    function setAPI3Server(address _newServer) external onlyAdmin {
        if (_newServer == address(0)) revert InvalidAddress();
        emit API3ServerUpdated(api3Server, _newServer);
        api3Server = _newServer;
    }
    
    /**
     * @notice Update max staleness threshold
     * @param _maxStaleness New max staleness in seconds
     */
    function setMaxStaleness(uint256 _maxStaleness) external onlyAdmin {
        maxStaleness = _maxStaleness;
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
    // PRICE FETCHING - PRIMARY METHOD (PROXY)
    // ============================================
    
    /**
     * @notice Get latest price from dAPI proxy (preferred method)
     * @param feedId The keccak256 hash of the dAPI name
     * @return price Normalized price with 8 decimals
     * @return timestamp When the price was updated
     * @return isValid Whether the price passed validation
     */
    function getPrice(bytes32 feedId) 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        totalReads++;
        
        address proxyAddress = feedProxies[feedId];
        
        // Try proxy first (faster)
        if (proxyAddress != address(0)) {
            try IApi3ReaderProxy(proxyAddress).read() returns (
                int224 value, 
                uint32 ts
            ) {
                return _processPrice(feedId, value, ts);
            } catch {
                // Fall through to server method
            }
        }
        
        // Try API3 Server V1 with dAPI name hash
        if (api3Server != address(0)) {
            try IApi3ServerV1(api3Server).readDataFeedWithDapiNameHash(feedId) returns (
                int224 value,
                uint32 ts
            ) {
                return _processPrice(feedId, value, ts);
            } catch {
                // Fall through to cached
            }
        }
        
        // Use cached price as fallback
        if (cachedPrices[feedId] != 0) {
            emit FallbackUsed(feedId, cachedPrices[feedId]);
            return _processPrice(feedId, cachedPrices[feedId], cachedTimestamps[feedId]);
        }
        
        failedReads++;
        return (0, 0, false);
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
        return this.getPrice(ETH_USD_DAPI_NAME_HASH);
    }
    
    // ============================================
    // CHAINLINK-COMPATIBLE INTERFACE
    // ============================================
    
    /**
     * @notice Chainlink-compatible latestRoundData interface
     * @dev Allows seamless integration with existing Chainlink-expecting contracts
     * @return roundId Always returns 1 for API3
     * @return answer The ETH/USD price with 8 decimals
     * @return startedAt The timestamp when data was retrieved
     * @return updatedAt The timestamp when data was retrieved
     * @return answeredInRound Always returns 1 for API3
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
        address proxyAddress = feedProxies[ETH_USD_DAPI_NAME_HASH];
        
        if (proxyAddress != address(0)) {
            try IApi3ReaderProxy(proxyAddress).read() returns (
                int224 value, 
                uint32 ts
            ) {
                if (value > 0 && block.timestamp - ts <= maxStaleness) {
                    // Normalize from 18 to 8 decimals
                    int256 normalizedPrice = int256(value) / int256(10 ** (API3_DECIMALS - OUTPUT_DECIMALS));
                    return (1, normalizedPrice, ts, ts, 1);
                }
            } catch {}
        }
        
        // Return cached as fallback
        if (cachedPrices[ETH_USD_DAPI_NAME_HASH] != 0) {
            int256 normalizedPrice = int256(cachedPrices[ETH_USD_DAPI_NAME_HASH]) / 
                                     int256(10 ** (API3_DECIMALS - OUTPUT_DECIMALS));
            uint32 ts = cachedTimestamps[ETH_USD_DAPI_NAME_HASH];
            return (1, normalizedPrice, ts, ts, 1);
        }
        
        return (0, 0, 0, 0, 0);
    }
    
    /**
     * @notice Returns the number of decimals for the price feed
     * @return decimals Always 8 (normalized)
     */
    function decimals() external pure returns (uint8) {
        return OUTPUT_DECIMALS;
    }
    
    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================
    
    /**
     * @dev Process and validate price from API3
     */
    function _processPrice(bytes32 feedId, int224 value, uint32 ts) 
        internal 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        // Check for negative price
        if (value <= 0) {
            failedReads++;
            return (0, 0, false);
        }
        
        // Check staleness
        uint256 age = block.timestamp - ts;
        if (age > maxStaleness) {
            failedReads++;
            return (0, 0, false);
        }
        
        // Normalize from 18 to 8 decimals
        price = uint256(uint224(value)) / (10 ** (API3_DECIMALS - OUTPUT_DECIMALS));
        timestamp = uint256(ts);
        isValid = true;
        
        // Cache the price
        cachedPrices[feedId] = value;
        cachedTimestamps[feedId] = ts;
        
        successfulReads++;
        emit PriceFetched(feedId, value, ts);
        
        return (price, timestamp, isValid);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get adapter statistics
     * @return total Total number of reads
     * @return successful Successful reads
     * @return failed Failed reads
     * @return successRate Success rate as percentage (0-100)
     */
    function getStats() 
        external 
        view 
        returns (
            uint256 total,
            uint256 successful,
            uint256 failed,
            uint256 successRate
        ) 
    {
        total = totalReads;
        successful = successfulReads;
        failed = failedReads;
        successRate = totalReads > 0 ? (successfulReads * 100) / totalReads : 0;
    }
    
    /**
     * @notice Check if a feed proxy is configured
     * @param feedId The feed ID to check
     * @return True if proxy is configured
     */
    function isProxyConfigured(bytes32 feedId) external view returns (bool) {
        return feedProxies[feedId] != address(0);
    }
    
    /**
     * @notice Get cached price for a feed
     * @param feedId The feed ID
     * @return price Cached price (18 decimals)
     * @return timestamp Cache timestamp
     */
    function getCachedPrice(bytes32 feedId) 
        external 
        view 
        returns (int224 price, uint32 timestamp) 
    {
        return (cachedPrices[feedId], cachedTimestamps[feedId]);
    }
}
