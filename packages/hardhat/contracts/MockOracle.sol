// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockOracle
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Mock oracle for testing oracle manipulation scenarios
 * @dev Simulates Chainlink/Band Protocol oracles for adversarial testing
 * 
 * USE CASES:
 * 1. Test price deviation detection
 * 2. Simulate stale oracle data
 * 3. Test oracle manipulation attacks
 * 4. Verify fallback mechanism
 */
contract MockOracle {
    // ============================================
    // STATE
    // ============================================
    
    int256 public latestPrice;
    uint256 public latestTimestamp;
    uint8 public decimals;
    string public description;
    bool public isHealthy;
    bool public shouldRevert;
    
    // Price history for deviation testing
    int256[] public priceHistory;
    uint256[] public timestampHistory;
    
    // Manipulation simulation
    bool public manipulationMode;
    int256 public manipulatedPrice;
    
    // Owner for configuration
    address public owner;

    // ============================================
    // EVENTS
    // ============================================
    
    event PriceUpdated(int256 oldPrice, int256 newPrice, uint256 timestamp);
    event ManipulationActivated(int256 fakePrice);
    event OracleHealthChanged(bool healthy);

    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "MockOracle: !owner");
        _;
    }

    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(int256 _initialPrice, uint8 _decimals, string memory _description) {
        owner = msg.sender;
        latestPrice = _initialPrice;
        latestTimestamp = block.timestamp;
        decimals = _decimals;
        description = _description;
        isHealthy = true;
        shouldRevert = false;
        manipulationMode = false;
        
        // Initialize history
        priceHistory.push(_initialPrice);
        timestampHistory.push(block.timestamp);
    }

    // ============================================
    // CHAINLINK-COMPATIBLE INTERFACE
    // ============================================
    
    /**
     * @notice Chainlink-compatible latestRoundData function
     * @return roundId The round ID (mock)
     * @return answer The price
     * @return startedAt Timestamp
     * @return updatedAt Timestamp
     * @return answeredInRound Round ID (mock)
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        require(!shouldRevert, "MockOracle: Simulated failure");
        
        int256 priceToReturn = manipulationMode ? manipulatedPrice : latestPrice;
        
        return (
            1, // roundId
            priceToReturn,
            latestTimestamp,
            latestTimestamp,
            1 // answeredInRound
        );
    }
    
    /**
     * @notice Get latest answer (legacy Chainlink)
     */
    function latestAnswer() external view returns (int256) {
        require(!shouldRevert, "MockOracle: Simulated failure");
        return manipulationMode ? manipulatedPrice : latestPrice;
    }
    
    /**
     * @notice Get latest timestamp
     */
    function latestTimestampData() external view returns (uint256) {
        return latestTimestamp;
    }

    // ============================================
    // BAND PROTOCOL-COMPATIBLE INTERFACE
    // ============================================
    
    /**
     * @notice Band Protocol-compatible getReferenceData function
     * @param _base Base symbol (ignored in mock)
     * @param _quote Quote symbol (ignored in mock)
     * @return rate The exchange rate
     * @return lastUpdatedBase Timestamp
     * @return lastUpdatedQuote Timestamp
     */
    function getReferenceData(
        string calldata _base,
        string calldata _quote
    ) external view returns (
        uint256 rate,
        uint256 lastUpdatedBase,
        uint256 lastUpdatedQuote
    ) {
        require(!shouldRevert, "MockOracle: Simulated failure");
        
        int256 priceToReturn = manipulationMode ? manipulatedPrice : latestPrice;
        
        return (
            uint256(priceToReturn),
            latestTimestamp,
            latestTimestamp
        );
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    /**
     * @notice Update the oracle price
     * @param _newPrice New price to set
     */
    function setPrice(int256 _newPrice) external onlyOwner {
        int256 oldPrice = latestPrice;
        latestPrice = _newPrice;
        latestTimestamp = block.timestamp;
        
        // Track history
        priceHistory.push(_newPrice);
        timestampHistory.push(block.timestamp);
        
        emit PriceUpdated(oldPrice, _newPrice, block.timestamp);
    }
    
    /**
     * @notice Set price with custom timestamp (for staleness testing)
     * @param _newPrice New price
     * @param _timestamp Custom timestamp
     */
    function setPriceWithTimestamp(int256 _newPrice, uint256 _timestamp) external onlyOwner {
        int256 oldPrice = latestPrice;
        latestPrice = _newPrice;
        latestTimestamp = _timestamp;
        
        priceHistory.push(_newPrice);
        timestampHistory.push(_timestamp);
        
        emit PriceUpdated(oldPrice, _newPrice, _timestamp);
    }
    
    /**
     * @notice Simulate a stale oracle (set timestamp in past)
     * @param _staleSeconds How many seconds in the past
     */
    function makeStale(uint256 _staleSeconds) external onlyOwner {
        latestTimestamp = block.timestamp - _staleSeconds;
    }
    
    /**
     * @notice Toggle oracle health (simulate outage)
     * @param _healthy Whether oracle should be healthy
     */
    function setHealthy(bool _healthy) external onlyOwner {
        isHealthy = _healthy;
        emit OracleHealthChanged(_healthy);
    }
    
    /**
     * @notice Toggle revert mode (simulate complete failure)
     * @param _shouldRevert Whether calls should revert
     */
    function setShouldRevert(bool _shouldRevert) external onlyOwner {
        shouldRevert = _shouldRevert;
    }

    // ============================================
    // MANIPULATION SIMULATION
    // ============================================
    
    /**
     * @notice Activate manipulation mode with fake price
     * @param _fakePrice The manipulated price to return
     */
    function activateManipulation(int256 _fakePrice) external onlyOwner {
        manipulationMode = true;
        manipulatedPrice = _fakePrice;
        
        emit ManipulationActivated(_fakePrice);
    }
    
    /**
     * @notice Deactivate manipulation mode
     */
    function deactivateManipulation() external onlyOwner {
        manipulationMode = false;
    }
    
    /**
     * @notice Simulate flash crash (sudden large price drop)
     * @param _dropPercent Percentage to drop (in basis points, 5000 = 50%)
     */
    function simulateFlashCrash(uint256 _dropPercent) external onlyOwner {
        require(_dropPercent <= 10000, "Invalid percentage");
        
        int256 oldPrice = latestPrice;
        latestPrice = latestPrice * int256(10000 - _dropPercent) / 10000;
        latestTimestamp = block.timestamp;
        
        priceHistory.push(latestPrice);
        timestampHistory.push(block.timestamp);
        
        emit PriceUpdated(oldPrice, latestPrice, block.timestamp);
    }
    
    /**
     * @notice Simulate flash pump (sudden large price increase)
     * @param _pumpPercent Percentage to increase (in basis points, 5000 = 50%)
     */
    function simulateFlashPump(uint256 _pumpPercent) external onlyOwner {
        int256 oldPrice = latestPrice;
        latestPrice = latestPrice * int256(10000 + _pumpPercent) / 10000;
        latestTimestamp = block.timestamp;
        
        priceHistory.push(latestPrice);
        timestampHistory.push(block.timestamp);
        
        emit PriceUpdated(oldPrice, latestPrice, block.timestamp);
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get price deviation from previous price
     * @return deviation Deviation in basis points
     */
    function getPriceDeviation() external view returns (uint256 deviation) {
        if (priceHistory.length < 2) return 0;
        
        int256 prevPrice = priceHistory[priceHistory.length - 2];
        int256 currPrice = priceHistory[priceHistory.length - 1];
        
        if (prevPrice == 0) return type(uint256).max;
        
        int256 diff = currPrice > prevPrice ? currPrice - prevPrice : prevPrice - currPrice;
        return uint256(diff * 10000 / prevPrice);
    }
    
    /**
     * @notice Get price history length
     * @return length Number of price updates
     */
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }
    
    /**
     * @notice Get price at specific index
     * @param _index Index in history
     * @return price Price at index
     * @return timestamp Timestamp at index
     */
    function getPriceAt(uint256 _index) external view returns (int256 price, uint256 timestamp) {
        require(_index < priceHistory.length, "Index out of bounds");
        return (priceHistory[_index], timestampHistory[_index]);
    }
    
    /**
     * @notice Check if oracle data is stale
     * @param _maxAge Maximum age in seconds
     * @return isStale True if data is stale
     */
    function isStale(uint256 _maxAge) external view returns (bool) {
        return block.timestamp - latestTimestamp > _maxAge;
    }
    
    /**
     * @notice Get oracle status summary
     */
    function getStatus() external view returns (
        bool healthy,
        bool stale,
        bool manipulated,
        int256 currentPrice,
        uint256 lastUpdate
    ) {
        return (
            isHealthy && !shouldRevert,
            block.timestamp - latestTimestamp > 3600, // 1 hour staleness
            manipulationMode,
            manipulationMode ? manipulatedPrice : latestPrice,
            latestTimestamp
        );
    }
}

/**
 * @title MockOracleFactory
 * @notice Factory for creating mock oracles with different configurations
 */
contract MockOracleFactory {
    event OracleCreated(address indexed oracle, string description);
    
    /**
     * @notice Create a new mock oracle
     * @param _initialPrice Initial price
     * @param _decimals Price decimals
     * @param _description Oracle description
     * @return oracle Address of new mock oracle
     */
    function createMockOracle(
        int256 _initialPrice,
        uint8 _decimals,
        string memory _description
    ) external returns (address oracle) {
        MockOracle newOracle = new MockOracle(_initialPrice, _decimals, _description);
        emit OracleCreated(address(newOracle), _description);
        return address(newOracle);
    }
    
    /**
     * @notice Create a pre-configured ETH/USD oracle
     * @param _initialPrice Initial ETH price in USD (8 decimals)
     */
    function createETHUSDOracle(int256 _initialPrice) external returns (address) {
        MockOracle oracle = new MockOracle(_initialPrice, 8, "ETH/USD Mock Oracle");
        return address(oracle);
    }
    
    /**
     * @notice Create a pre-configured BTC/USD oracle
     * @param _initialPrice Initial BTC price in USD (8 decimals)
     */
    function createBTCUSDOracle(int256 _initialPrice) external returns (address) {
        MockOracle oracle = new MockOracle(_initialPrice, 8, "BTC/USD Mock Oracle");
        return address(oracle);
    }
}
