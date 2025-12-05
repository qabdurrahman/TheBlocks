// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockRedstoneAdapter
 * @notice A simplified Redstone-compatible adapter for hackathon demo
 * @dev In production, you'd use the actual Redstone SDK with calldata injection
 * 
 * This mock allows us to:
 * 1. Demonstrate all 5 oracles active
 * 2. Set manual price updates for demo
 * 3. Show the Redstone integration pattern
 */
contract MockRedstoneAdapter {
    
    uint256 public constant PRICE_PRECISION = 1e8;
    
    address public admin;
    uint256 public price;
    uint256 public lastUpdated;
    uint8 public decimals = 8;
    
    event PriceUpdated(uint256 price, uint256 timestamp);
    
    constructor() {
        admin = msg.sender;
        // Set initial price to ~$3124 (ETH/USD)
        price = 312455000000; // $3124.55 with 8 decimals
        lastUpdated = block.timestamp;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    /**
     * @notice Get the latest price (Chainlink-compatible interface)
     * @dev Returns data in Chainlink's latestRoundData format for compatibility
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (
            1,                          // roundId
            int256(price),              // answer (price)
            lastUpdated,                // startedAt
            lastUpdated,                // updatedAt
            1                           // answeredInRound
        );
    }
    
    /**
     * @notice Get price directly
     */
    function getPrice() external view returns (uint256) {
        return price;
    }
    
    /**
     * @notice Update price (admin only - for demo purposes)
     * @param _price New price with 8 decimals
     */
    function setPrice(uint256 _price) external onlyAdmin {
        price = _price;
        lastUpdated = block.timestamp;
        emit PriceUpdated(_price, block.timestamp);
    }
    
    /**
     * @notice Update price with USD value (easier to use)
     * @param _usdPrice Price in USD (e.g., 3124 for $3124.00)
     * @param _cents Cents (e.g., 55 for $0.55)
     */
    function setPriceUSD(uint256 _usdPrice, uint256 _cents) external onlyAdmin {
        price = (_usdPrice * 1e8) + (_cents * 1e6);
        lastUpdated = block.timestamp;
        emit PriceUpdated(price, block.timestamp);
    }
    
    /**
     * @notice Transfer admin role
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
}
