// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockOracle
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Mock Chainlink-compatible oracle for testing
 * @dev Implements AggregatorV3Interface for test deployments
 */
contract MockOracle {
    int256 private _price;
    uint8 private _decimals;
    string private _description;
    uint256 private _version;
    uint80 private _roundId;
    uint256 private _updatedAt;

    // Events for testing
    event PriceUpdated(int256 oldPrice, int256 newPrice, uint256 timestamp);
    event RoundUpdated(uint80 oldRound, uint80 newRound);

    /**
     * @notice Constructor
     * @param price Initial price (without decimals scaling - e.g., 100 for $1.00 with 8 decimals)
     * @param decimals_ Number of decimals for the price
     * @param description_ Description of the price feed (e.g., "ETH/USD")
     */
    constructor(int256 price, uint8 decimals_, string memory description_) {
        _price = price;
        _decimals = decimals_;
        _description = description_;
        _version = 4; // Chainlink V3 compatibility
        _roundId = 1;
        _updatedAt = block.timestamp;
    }

    // ==================== AggregatorV3Interface Implementation ====================

    /**
     * @notice Get the number of decimals
     */
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Get the description
     */
    function description() external view returns (string memory) {
        return _description;
    }

    /**
     * @notice Get the version
     */
    function version() external view returns (uint256) {
        return _version;
    }

    /**
     * @notice Get round data by round ID
     * @dev For mocking, all rounds return the same data
     */
    function getRoundData(uint80 roundId_) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (
            roundId_,
            _price,
            _updatedAt,
            _updatedAt,
            roundId_
        );
    }

    /**
     * @notice Get the latest round data
     * @dev This is the main function used by SettlementOracle
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (
            _roundId,
            _price,
            _updatedAt,
            _updatedAt,
            _roundId
        );
    }

    // ==================== Mock Control Functions ====================

    /**
     * @notice Update the mock price
     * @param newPrice New price to set
     */
    function setPrice(int256 newPrice) external {
        int256 oldPrice = _price;
        _price = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
        emit PriceUpdated(oldPrice, newPrice, block.timestamp);
    }

    /**
     * @notice Update multiple parameters at once
     * @param newPrice New price
     * @param newTimestamp New timestamp (for staleness testing)
     */
    function updateRound(int256 newPrice, uint256 newTimestamp) external {
        int256 oldPrice = _price;
        uint80 oldRound = _roundId;
        
        _price = newPrice;
        _updatedAt = newTimestamp;
        _roundId++;
        
        emit PriceUpdated(oldPrice, newPrice, newTimestamp);
        emit RoundUpdated(oldRound, _roundId);
    }

    /**
     * @notice Set a stale timestamp (for testing staleness checks)
     * @param staleTimestamp The stale timestamp to set
     */
    function setStaleTimestamp(uint256 staleTimestamp) external {
        _updatedAt = staleTimestamp;
    }

    /**
     * @notice Get current price (helper for tests)
     */
    function getPrice() external view returns (int256) {
        return _price;
    }

    /**
     * @notice Get current round ID (helper for tests)
     */
    function getRoundId() external view returns (uint80) {
        return _roundId;
    }

    /**
     * @notice Get last update timestamp (helper for tests)
     */
    function getUpdatedAt() external view returns (uint256) {
        return _updatedAt;
    }

    /**
     * @notice Simulate a price crash (for circuit breaker testing)
     * @param crashPercentage Percentage to crash (e.g., 50 = 50% crash)
     */
    function simulateCrash(uint256 crashPercentage) external {
        require(crashPercentage <= 100, "Invalid percentage");
        int256 oldPrice = _price;
        _price = _price * int256(100 - crashPercentage) / 100;
        _updatedAt = block.timestamp;
        _roundId++;
        emit PriceUpdated(oldPrice, _price, block.timestamp);
    }

    /**
     * @notice Simulate a price spike (for manipulation testing)
     * @param spikePercentage Percentage to spike (e.g., 50 = 50% spike)
     */
    function simulateSpike(uint256 spikePercentage) external {
        int256 oldPrice = _price;
        _price = _price * int256(100 + spikePercentage) / 100;
        _updatedAt = block.timestamp;
        _roundId++;
        emit PriceUpdated(oldPrice, _price, block.timestamp);
    }
}
