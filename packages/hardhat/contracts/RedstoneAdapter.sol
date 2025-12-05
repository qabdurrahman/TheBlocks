// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RedstoneAdapter
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Adapter for Redstone Oracle using pull-based calldata injection
 * @dev Redstone uses a unique approach where price data is appended to calldata
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                          REDSTONE ORACLE ADAPTER                              ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   HOW REDSTONE WORKS:                                                        ║
 * ║   ┌──────────────────────────────────────────────────────────────────────┐   ║
 * ║   │  1. Off-chain: Redstone nodes sign price data                        │   ║
 * ║   │  2. Frontend: Wraps transaction with signed data in calldata         │   ║
 * ║   │  3. On-chain: Contract extracts and validates prices                 │   ║
 * ║   │  4. Multi-sig: Requires threshold signatures for validity            │   ║
 * ║   └──────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ║   BENEFITS:                                                                  ║
 * ║   • No on-chain storage costs (pull model)                                   ║
 * ║   • Multi-signer threshold security                                          ║
 * ║   • Sub-second price updates possible                                        ║
 * ║   • 1000+ price feeds available                                              ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import {MultiOracleAggregator} from "./MultiOracleAggregator.sol";

/**
 * @dev Minimal interface for Redstone price extraction
 * In production, you'd inherit from RedstoneConsumerBase
 */
interface IRedstoneConsumer {
    function getOracleNumericValueFromTxMsg(bytes32 feedId) external view returns (uint256);
}

contract RedstoneAdapter {
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;
    
    // Redstone data feed IDs
    bytes32 public constant ETH_FEED_ID = bytes32("ETH");
    bytes32 public constant BTC_FEED_ID = bytes32("BTC");
    bytes32 public constant USDC_FEED_ID = bytes32("USDC");
    
    // Redstone returns 8 decimals by default
    uint8 public constant REDSTONE_DECIMALS = 8;
    
    // ============================================
    // STATE
    // ============================================
    
    address public admin;
    address public aggregator;
    
    // Cached prices (for fallback when calldata extraction fails)
    mapping(bytes32 => uint256) public cachedPrices;
    mapping(bytes32 => uint256) public cachedTimestamps;
    
    // Configuration
    uint256 public maxStaleness = 60; // 1 minute
    uint256 public requiredSigners = 3; // Minimum signers required
    
    // ============================================
    // EVENTS
    // ============================================
    
    event PriceFetched(bytes32 indexed feedId, uint256 price, uint256 timestamp);
    event PriceCached(bytes32 indexed feedId, uint256 price);
    event ConfigUpdated(uint256 maxStaleness, uint256 requiredSigners);
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier onlyAggregator() {
        require(msg.sender == aggregator, "Only aggregator");
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(address _aggregator) {
        admin = msg.sender;
        aggregator = _aggregator;
    }
    
    // ============================================
    // CORE FUNCTIONS
    // ============================================
    
    /**
     * @notice Get ETH/USD price from Redstone
     * @dev This function expects Redstone calldata to be appended
     * @return price Normalized price (8 decimals)
     * @return timestamp When price was signed
     * @return isValid Whether price is valid
     */
    function getETHPrice() 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        return _getPriceFromCalldata(ETH_FEED_ID);
    }
    
    /**
     * @notice Get BTC/USD price from Redstone
     */
    function getBTCPrice() 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        return _getPriceFromCalldata(BTC_FEED_ID);
    }
    
    /**
     * @notice Get price for any supported feed
     * @param feedId The Redstone feed identifier
     */
    function getPrice(bytes32 feedId) 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        return _getPriceFromCalldata(feedId);
    }
    
    /**
     * @dev Internal function to extract price from calldata
     * 
     * REDSTONE CALLDATA STRUCTURE:
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │  Original calldata (function selector + params)                      │
     * ├──────────────────────────────────────────────────────────────────────┤
     * │  Redstone marker (special bytes to identify Redstone data)           │
     * ├──────────────────────────────────────────────────────────────────────┤
     * │  Signed data packages (price, timestamp, feedId, signatures)         │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    function _getPriceFromCalldata(bytes32 feedId) 
        internal 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        // Try to extract Redstone data from calldata
        // In a real implementation, this would use the RedstoneConsumerBase
        
        // Check for Redstone marker in calldata
        if (_hasRedstoneData()) {
            (price, timestamp) = _extractRedstonePrice(feedId);
            
            if (price > 0 && block.timestamp - timestamp <= maxStaleness) {
                // Cache the price for fallback
                cachedPrices[feedId] = price;
                cachedTimestamps[feedId] = timestamp;
                
                emit PriceFetched(feedId, price, timestamp);
                return (price, timestamp, true);
            }
        }
        
        // Fallback to cached price if within staleness
        uint256 cachedPrice = cachedPrices[feedId];
        uint256 cachedTs = cachedTimestamps[feedId];
        
        if (cachedPrice > 0 && block.timestamp - cachedTs <= maxStaleness * 2) {
            return (cachedPrice, cachedTs, true);
        }
        
        return (0, 0, false);
    }
    
    /**
     * @dev Check if calldata contains Redstone marker
     */
    function _hasRedstoneData() internal pure returns (bool) {
        // Redstone marker is at the end of calldata
        // Format: last 9 bytes are "redstone."
        if (msg.data.length < 9) return false;
        
        bytes9 marker;
        assembly {
            marker := calldataload(sub(calldatasize(), 9))
        }
        
        // Check for Redstone marker (0x000002ed57011e0000 or similar)
        // This is simplified - real implementation uses specific marker bytes
        return marker != bytes9(0);
    }
    
    /**
     * @dev Extract Redstone price from calldata
     * @notice This is a simplified version - real implementation uses RedstoneConsumerBase
     */
    function _extractRedstonePrice(bytes32 feedId) 
        internal 
        view 
        returns (uint256 price, uint256 timestamp) 
    {
        // In production, this would:
        // 1. Parse the Redstone data structure from calldata
        // 2. Validate signatures from authorized signers
        // 3. Check that enough signers (threshold) signed the data
        // 4. Extract price and timestamp
        
        // Simplified extraction for demonstration
        // Real implementation would use:
        // uint256 price = getOracleNumericValueFromTxMsg(feedId);
        
        // For now, return cached or zero
        price = cachedPrices[feedId];
        timestamp = cachedTimestamps[feedId];
        
        return (price, timestamp);
    }
    
    // ============================================
    // CACHE MANAGEMENT
    // ============================================
    
    /**
     * @notice Manually set cached price (for testing/emergency)
     * @param feedId Feed identifier
     * @param price Price value (8 decimals)
     */
    function setCachedPrice(bytes32 feedId, uint256 price) external onlyAdmin {
        cachedPrices[feedId] = price;
        cachedTimestamps[feedId] = block.timestamp;
        
        emit PriceCached(feedId, price);
    }
    
    /**
     * @notice Batch update cached prices
     */
    function batchSetCachedPrices(
        bytes32[] calldata feedIds,
        uint256[] calldata prices
    ) external onlyAdmin {
        require(feedIds.length == prices.length, "Length mismatch");
        
        for (uint256 i = 0; i < feedIds.length; i++) {
            cachedPrices[feedIds[i]] = prices[i];
            cachedTimestamps[feedIds[i]] = block.timestamp;
            emit PriceCached(feedIds[i], prices[i]);
        }
    }
    
    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * @notice Update configuration
     */
    function updateConfig(uint256 _maxStaleness, uint256 _requiredSigners) 
        external 
        onlyAdmin 
    {
        maxStaleness = _maxStaleness;
        requiredSigners = _requiredSigners;
        
        emit ConfigUpdated(_maxStaleness, _requiredSigners);
    }
    
    /**
     * @notice Update aggregator address
     */
    function setAggregator(address _aggregator) external onlyAdmin {
        aggregator = _aggregator;
    }
    
    /**
     * @notice Transfer admin
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get cached price (view only)
     */
    function getCachedPrice(bytes32 feedId) 
        external 
        view 
        returns (uint256 price, uint256 timestamp, bool isStale) 
    {
        price = cachedPrices[feedId];
        timestamp = cachedTimestamps[feedId];
        isStale = block.timestamp - timestamp > maxStaleness;
    }
    
    /**
     * @notice Check if a feed is supported
     */
    function isFeedSupported(bytes32 feedId) external pure returns (bool) {
        return feedId == ETH_FEED_ID || 
               feedId == BTC_FEED_ID || 
               feedId == USDC_FEED_ID;
    }
}
