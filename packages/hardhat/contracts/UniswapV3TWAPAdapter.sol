// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UniswapV3TWAPAdapter
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Time-Weighted Average Price (TWAP) oracle using Uniswap V3 pools
 * @dev Provides manipulation-resistant on-chain price anchor
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                      UNISWAP V3 TWAP ORACLE ADAPTER                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   WHY TWAP IS CRITICAL:                                                      ║
 * ║   ┌──────────────────────────────────────────────────────────────────────┐   ║
 * ║   │  1. Flash Loan Resistant: Time-averaged price can't be manipulated   │   ║
 * ║   │  2. Fully On-Chain: No external dependencies, trustless              │   ║
 * ║   │  3. DEX Anchor: Reflects actual trading activity                     │   ║
 * ║   │  4. Manipulation Detection: Compare TWAP vs spot to detect attacks  │   ║
 * ║   └──────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ║   SEPOLIA ETH/USDC POOL: 0x6ce0896eae6d4bd668fde41bb784548fb8a68e50         ║
 * ║                                                                               ║
 * ║   TWAP CALCULATION:                                                          ║
 * ║   • Uses accumulated tick observations over time                            ║
 * ║   • averageTick = (tickCumulative[now] - tickCumulative[past]) / period     ║
 * ║   • price = 1.0001^tick                                                      ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * @dev Uniswap V3 Pool Interface
 */
interface IUniswapV3Pool {
    function observe(uint32[] calldata secondsAgos) 
        external view 
        returns (
            int56[] memory tickCumulatives, 
            uint160[] memory secondsPerLiquidityCumulativeX128s
        );
    
    function slot0() 
        external view 
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
}

/**
 * @dev ERC20 minimal interface for decimals
 */
interface IERC20Minimal {
    function decimals() external view returns (uint8);
}

contract UniswapV3TWAPAdapter {
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;
    uint8 public constant OUTPUT_DECIMALS = 8;
    
    // TWAP periods
    uint32 public constant TWAP_SHORT = 300;      // 5 minutes
    uint32 public constant TWAP_MEDIUM = 1800;    // 30 minutes
    uint32 public constant TWAP_LONG = 3600;      // 1 hour
    
    // Q96 for Uniswap math
    uint256 private constant Q96 = 0x1000000000000000000000000;
    uint256 private constant Q192 = Q96 * Q96;
    
    // Tick bounds
    int24 private constant MIN_TICK = -887272;
    int24 private constant MAX_TICK = 887272;
    
    // ============================================
    // STATE
    // ============================================
    
    address public admin;
    address public aggregator;
    
    // Pool configuration
    address public pool;
    address public token0;
    address public token1;
    uint8 public token0Decimals;
    uint8 public token1Decimals;
    bool public token0IsBase; // If true, price = token1/token0 (e.g., ETH is token0)
    
    // TWAP settings
    uint32 public twapPeriod = TWAP_MEDIUM;
    
    // Cached TWAP
    uint256 public cachedTWAP;
    uint256 public cachedTimestamp;
    
    // Statistics
    uint256 public totalQueries;
    uint256 public successfulQueries;
    
    // Price bounds
    uint256 public minValidPrice = 1e6;  // $10
    uint256 public maxValidPrice = 1e12; // $10,000
    
    // ============================================
    // EVENTS
    // ============================================
    
    event TWAPCalculated(uint256 twapPrice, uint32 period, uint256 timestamp);
    event PoolConfigured(address indexed pool, address token0, address token1);
    event ManipulationDetected(uint256 spotPrice, uint256 twapPrice, uint256 deviationBps);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error OnlyAdmin();
    error InvalidPool();
    error PoolNotConfigured();
    error TWAPCalculationFailed();
    error InsufficientObservations();
    error PriceOutOfBounds(uint256 price);
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(address _pool, address _aggregator) {
        admin = msg.sender;
        aggregator = _aggregator;
        
        if (_pool != address(0)) {
            _configurePool(_pool);
        }
    }
    
    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * @notice Configure the Uniswap V3 pool
     * @param _pool Uniswap V3 pool address
     */
    function configurePool(address _pool) external onlyAdmin {
        _configurePool(_pool);
    }
    
    function _configurePool(address _pool) internal {
        if (_pool == address(0)) revert InvalidPool();
        
        pool = _pool;
        token0 = IUniswapV3Pool(_pool).token0();
        token1 = IUniswapV3Pool(_pool).token1();
        
        // Get decimals
        token0Decimals = IERC20Minimal(token0).decimals();
        token1Decimals = IERC20Minimal(token1).decimals();
        
        // Determine base token (usually WETH is base)
        // For ETH/USDC pool: if token0 is WETH, price should be USDC per ETH
        // We assume higher decimal token is the base (WETH = 18 decimals)
        token0IsBase = token0Decimals >= token1Decimals;
        
        emit PoolConfigured(_pool, token0, token1);
    }
    
    /**
     * @notice Set TWAP period
     * @param _period TWAP period in seconds
     */
    function setTWAPPeriod(uint32 _period) external onlyAdmin {
        require(_period >= 60 && _period <= 86400, "Invalid period");
        twapPeriod = _period;
    }
    
    /**
     * @notice Set price bounds
     */
    function setPriceBounds(uint256 _min, uint256 _max) external onlyAdmin {
        require(_min < _max, "Invalid bounds");
        minValidPrice = _min;
        maxValidPrice = _max;
    }
    
    // ============================================
    // TWAP CALCULATION
    // ============================================
    
    /**
     * @notice Calculate TWAP for the configured pool
     * @return price TWAP price normalized to 8 decimals
     * @return timestamp When TWAP was calculated
     * @return isValid Whether TWAP is valid
     */
    function getTWAP() 
        external 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        if (pool == address(0)) revert PoolNotConfigured();
        
        totalQueries++;
        
        try this._calculateTWAPExternal() returns (uint256 twapPrice) {
            if (twapPrice == 0) {
                return _useCached();
            }
            
            // Validate bounds
            if (twapPrice < minValidPrice || twapPrice > maxValidPrice) {
                revert PriceOutOfBounds(twapPrice);
            }
            
            // Cache the TWAP
            cachedTWAP = twapPrice;
            cachedTimestamp = block.timestamp;
            successfulQueries++;
            
            emit TWAPCalculated(twapPrice, twapPeriod, block.timestamp);
            
            return (twapPrice, block.timestamp, true);
            
        } catch {
            return _useCached();
        }
    }
    
    /**
     * @notice External wrapper for try/catch (required for internal try/catch)
     */
    function _calculateTWAPExternal() external view returns (uint256) {
        return _calculateTWAP(twapPeriod);
    }
    
    /**
     * @notice Internal TWAP calculation
     * @param period TWAP period in seconds
     * @return twapPrice Price normalized to 8 decimals
     */
    function _calculateTWAP(uint32 period) internal view returns (uint256 twapPrice) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = period;
        secondsAgos[1] = 0;
        
        (int56[] memory tickCumulatives,) = IUniswapV3Pool(pool).observe(secondsAgos);
        
        // Calculate average tick
        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 averageTick = int24(tickCumulativesDelta / int56(int32(period)));
        
        // Bound the tick
        if (averageTick < MIN_TICK) averageTick = MIN_TICK;
        if (averageTick > MAX_TICK) averageTick = MAX_TICK;
        
        // Convert tick to sqrtPriceX96
        uint160 sqrtPriceX96 = _getSqrtRatioAtTick(averageTick);
        
        // Calculate price from sqrtPriceX96
        // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        
        // Adjust for token decimals
        // If token0 is base (e.g., WETH), price = token1 per token0
        // We need to adjust for decimal differences
        
        if (token0IsBase) {
            // Price = token1/token0
            // Adjust: multiply by 10^(token0Decimals) and divide by 10^(token1Decimals)
            // Then normalize to 8 decimals
            uint256 decimalAdjustment = 10 ** (token0Decimals + OUTPUT_DECIMALS);
            twapPrice = (priceX192 * decimalAdjustment) / (Q192 * (10 ** token1Decimals));
        } else {
            // Price = token0/token1 (inverted)
            // We need 1/price
            uint256 decimalAdjustment = 10 ** (token1Decimals + OUTPUT_DECIMALS);
            uint256 rawPrice = (priceX192 * decimalAdjustment) / (Q192 * (10 ** token0Decimals));
            if (rawPrice > 0) {
                twapPrice = (PRICE_PRECISION * PRICE_PRECISION) / rawPrice;
            }
        }
    }
    
    /**
     * @notice Get spot price from current tick
     * @return spotPrice Current spot price (8 decimals)
     */
    function getSpotPrice() external view returns (uint256 spotPrice) {
        if (pool == address(0)) return 0;
        
        (, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();
        
        uint160 sqrtPriceX96 = _getSqrtRatioAtTick(tick);
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        
        if (token0IsBase) {
            uint256 decimalAdjustment = 10 ** (token0Decimals + OUTPUT_DECIMALS);
            spotPrice = (priceX192 * decimalAdjustment) / (Q192 * (10 ** token1Decimals));
        } else {
            uint256 decimalAdjustment = 10 ** (token1Decimals + OUTPUT_DECIMALS);
            uint256 rawPrice = (priceX192 * decimalAdjustment) / (Q192 * (10 ** token0Decimals));
            if (rawPrice > 0) {
                spotPrice = (PRICE_PRECISION * PRICE_PRECISION) / rawPrice;
            }
        }
    }
    
    /**
     * @notice Detect potential manipulation by comparing spot to TWAP
     * @return isManipulated True if spot deviates significantly from TWAP
     * @return deviationBps Deviation in basis points
     */
    function detectManipulation() external view returns (bool isManipulated, uint256 deviationBps) {
        if (pool == address(0) || cachedTWAP == 0) return (false, 0);
        
        uint256 spotPrice = this.getSpotPrice();
        if (spotPrice == 0) return (false, 0);
        
        // Calculate deviation
        uint256 diff = spotPrice > cachedTWAP 
            ? spotPrice - cachedTWAP 
            : cachedTWAP - spotPrice;
        
        deviationBps = (diff * 10000) / cachedTWAP;
        
        // More than 2% deviation = potential manipulation
        isManipulated = deviationBps > 200;
        
        if (isManipulated) {
            // Note: Can't emit event in view function, but logic is here
        }
    }
    
    // ============================================
    // CHAINLINK-COMPATIBLE INTERFACE
    // ============================================
    
    /**
     * @notice Chainlink-compatible latestRoundData interface
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
        if (pool == address(0)) return (0, 0, 0, 0, 0);
        
        try this._calculateTWAPExternal() returns (uint256 twapPrice) {
            if (twapPrice > 0 && twapPrice >= minValidPrice && twapPrice <= maxValidPrice) {
                return (
                    1,
                    int256(twapPrice),
                    block.timestamp,
                    block.timestamp,
                    1
                );
            }
        } catch {}
        
        // Return cached
        if (cachedTWAP > 0) {
            return (1, int256(cachedTWAP), cachedTimestamp, cachedTimestamp, 1);
        }
        
        return (0, 0, 0, 0, 0);
    }
    
    function decimals() external pure returns (uint8) {
        return OUTPUT_DECIMALS;
    }
    
    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================
    
    function _useCached() internal view returns (uint256, uint256, bool) {
        if (cachedTWAP > 0 && block.timestamp - cachedTimestamp < 3600) {
            return (cachedTWAP, cachedTimestamp, true);
        }
        return (0, 0, false);
    }
    
    /**
     * @dev Get sqrt price ratio at a given tick (Uniswap math)
     */
    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint160) {
        uint256 absTick = tick < 0 ? uint256(uint24(-tick)) : uint256(uint24(tick));
        require(absTick <= uint256(uint24(MAX_TICK)), "T");
        
        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
        
        if (tick > 0) ratio = type(uint256).max / ratio;
        
        return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get adapter statistics
     */
    function getStats() 
        external 
        view 
        returns (
            uint256 total,
            uint256 successful,
            uint256 successRate,
            uint256 lastTWAP,
            uint256 lastUpdate
        ) 
    {
        total = totalQueries;
        successful = successfulQueries;
        successRate = totalQueries > 0 ? (successfulQueries * 100) / totalQueries : 0;
        lastTWAP = cachedTWAP;
        lastUpdate = cachedTimestamp;
    }
    
    /**
     * @notice Get pool info
     */
    function getPoolInfo() 
        external 
        view 
        returns (
            address poolAddress,
            address t0,
            address t1,
            uint8 t0Decimals,
            uint8 t1Decimals,
            bool t0IsBase,
            uint128 liquidityValue
        ) 
    {
        poolAddress = pool;
        t0 = token0;
        t1 = token1;
        t0Decimals = token0Decimals;
        t1Decimals = token1Decimals;
        t0IsBase = token0IsBase;
        
        if (pool != address(0)) {
            liquidityValue = IUniswapV3Pool(pool).liquidity();
        }
    }
    
    /**
     * @notice Get multiple TWAP periods at once
     */
    function getMultipleTWAPs() 
        external 
        view 
        returns (
            uint256 twap5min,
            uint256 twap30min,
            uint256 twap1hour
        ) 
    {
        if (pool == address(0)) return (0, 0, 0);
        
        try this._calculateTWAPForPeriod(TWAP_SHORT) returns (uint256 t1) {
            twap5min = t1;
        } catch {}
        
        try this._calculateTWAPForPeriod(TWAP_MEDIUM) returns (uint256 t2) {
            twap30min = t2;
        } catch {}
        
        try this._calculateTWAPForPeriod(TWAP_LONG) returns (uint256 t3) {
            twap1hour = t3;
        } catch {}
    }
    
    function _calculateTWAPForPeriod(uint32 period) external view returns (uint256) {
        return _calculateTWAP(period);
    }
}
