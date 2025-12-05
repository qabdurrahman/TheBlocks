// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Chainlink interface (must be outside contract)
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

/**
 * @title SyncedPriceFeed
 * @notice A secondary price feed that syncs from Chainlink
 * @dev Provides a third "oracle" for BFT consensus by caching Chainlink prices
 * 
 * In production, this would be replaced with actual Tellor/Redstone integration.
 * For hackathon demo, this demonstrates the multi-oracle architecture.
 */
contract SyncedPriceFeed {
    
    AggregatorV3Interface public immutable chainlink;
    
    // Cached price data
    int256 public cachedPrice;
    uint256 public cachedTimestamp;
    uint256 public lastSyncBlock;
    
    // Add small variance to simulate different oracle (±0.05%)
    int256 public varianceBasisPoints = 5; // 0.05%
    
    address public admin;
    uint8 public constant decimals = 8;
    
    event PriceSynced(int256 originalPrice, int256 adjustedPrice, uint256 timestamp);
    
    constructor(address _chainlink) {
        chainlink = AggregatorV3Interface(_chainlink);
        admin = msg.sender;
        
        // Initial sync
        _syncPrice();
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    /**
     * @notice Sync price from Chainlink (anyone can call)
     */
    function syncPrice() external {
        _syncPrice();
    }
    
    function _syncPrice() internal {
        (, int256 price, , uint256 updatedAt, ) = chainlink.latestRoundData();
        
        // Add small variance to simulate different oracle source
        // This is for demo purposes - in production each oracle has natural variance
        int256 variance = (price * varianceBasisPoints) / 10000;
        
        // Alternate between adding/subtracting variance based on block
        if (block.number % 2 == 0) {
            cachedPrice = price + variance;
        } else {
            cachedPrice = price - variance;
        }
        
        cachedTimestamp = updatedAt;
        lastSyncBlock = block.number;
        
        emit PriceSynced(price, cachedPrice, updatedAt);
    }
    
    /**
     * @notice Chainlink-compatible latestRoundData interface
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        // If price is stale (>100 blocks), return current Chainlink price with variance
        if (block.number - lastSyncBlock > 100) {
            (, int256 freshPrice, , uint256 freshUpdatedAt, ) = chainlink.latestRoundData();
            int256 variance = (freshPrice * varianceBasisPoints) / 10000;
            int256 adjustedPrice = block.number % 2 == 0 ? freshPrice + variance : freshPrice - variance;
            
            return (1, adjustedPrice, freshUpdatedAt, freshUpdatedAt, 1);
        }
        
        return (1, cachedPrice, cachedTimestamp, cachedTimestamp, 1);
    }
    
    /**
     * @notice Set variance (admin only)
     * @param _basisPoints Variance in basis points (100 = 1%)
     */
    function setVariance(int256 _basisPoints) external onlyAdmin {
        require(_basisPoints >= 0 && _basisPoints <= 100, "Max 1% variance");
        varianceBasisPoints = _basisPoints;
    }
}
