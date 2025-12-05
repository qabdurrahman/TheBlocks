// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TellorAdapter
 * @notice Chainlink-compatible adapter for Tellor Oracle
 * @dev Wraps Tellor's interface to match Chainlink's latestRoundData() format
 * 
 * Tellor is a decentralized oracle protocol where data is submitted by
 * a network of staked reporters and can be disputed if incorrect.
 */

interface ITellor {
    function getCurrentValue(bytes32 _queryId) external view returns (
        bool ifRetrieve,
        bytes memory value,
        uint256 timestampRetrieved
    );
    
    function getDataBefore(bytes32 _queryId, uint256 _timestamp) external view returns (
        bool _ifRetrieve,
        bytes memory _value,
        uint256 _timestampRetrieved
    );
    
    function getNewValueCountbyQueryId(bytes32 _queryId) external view returns (uint256);
}

contract TellorAdapter {
    
    ITellor public immutable tellor;
    
    // ETH/USD SpotPrice query ID
    // keccak256(abi.encode("SpotPrice", abi.encode("eth", "usd")))
    bytes32 public constant ETH_USD_QUERY_ID = 0x83a7f3d48786ac2667503a61e8c415438ed2922eb86a2906e4ee66d9a2ce4992;
    
    // Output decimals (Chainlink standard)
    uint8 public constant decimals = 8;
    
    // Fallback price if Tellor has no data (use Chainlink's last known)
    int256 public fallbackPrice;
    uint256 public fallbackTimestamp;
    address public admin;
    
    event FallbackPriceUpdated(int256 price, uint256 timestamp);
    
    constructor(address _tellor) {
        tellor = ITellor(_tellor);
        admin = msg.sender;
        // Set initial fallback to approximate ETH price
        fallbackPrice = 3130 * 1e8; // $3130 with 8 decimals
        fallbackTimestamp = block.timestamp;
    }
    
    /**
     * @notice Chainlink-compatible latestRoundData interface
     * @return roundId Always returns 1 for Tellor
     * @return answer The ETH/USD price with 8 decimals
     * @return startedAt The timestamp when data was retrieved
     * @return updatedAt The timestamp when data was retrieved
     * @return answeredInRound Always returns 1 for Tellor
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        // Try to get current value from Tellor
        try tellor.getCurrentValue(ETH_USD_QUERY_ID) returns (bool ifRetrieve, bytes memory value, uint256 timestamp) {
            if (ifRetrieve && value.length >= 32 && timestamp > 0) {
                // Tellor returns price with 18 decimals, convert to 8
                uint256 priceRaw = abi.decode(value, (uint256));
                int256 price = int256(priceRaw / 1e10); // 18 -> 8 decimals
                
                return (
                    1,
                    price,
                    timestamp,
                    timestamp,
                    1
                );
            }
        } catch {
            // Tellor call failed, use fallback
        }
        
        // If no Tellor data or call failed, return fallback
        return (
            1,
            fallbackPrice,
            fallbackTimestamp,
            fallbackTimestamp,
            1
        );
    }
    
    /**
     * @notice Update fallback price (admin only)
     * @param _price New fallback price with 8 decimals
     */
    function updateFallbackPrice(int256 _price) external {
        require(msg.sender == admin, "Only admin");
        require(_price > 0, "Invalid price");
        
        fallbackPrice = _price;
        fallbackTimestamp = block.timestamp;
        
        emit FallbackPriceUpdated(_price, block.timestamp);
    }
    
    /**
     * @notice Check if Tellor has real data available
     */
    function hasTellorData() external view returns (bool) {
        uint256 count = tellor.getNewValueCountbyQueryId(ETH_USD_QUERY_ID);
        return count > 0;
    }
    
    /**
     * @notice Get raw Tellor data
     */
    function getRawTellorData() external view returns (
        bool hasData,
        uint256 price18Decimals,
        uint256 timestamp
    ) {
        (bool ifRetrieve, bytes memory value, uint256 ts) = tellor.getCurrentValue(ETH_USD_QUERY_ID);
        
        if (ifRetrieve && value.length > 0) {
            uint256 priceRaw = abi.decode(value, (uint256));
            return (true, priceRaw, ts);
        }
        
        return (false, 0, 0);
    }
}
