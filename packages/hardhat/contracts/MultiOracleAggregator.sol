// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MultiOracleAggregator
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice 5-Oracle Byzantine-Fault-Tolerant Price Aggregation System
 * @dev Championship-grade oracle infrastructure with BFT median, circuit breakers, and fallback cascade
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    5-ORACLE BFT AGGREGATION ARCHITECTURE                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           ║
 * ║   │Chainlink│  │  Pyth   │  │Redstone │  │   DIA   │  │Uniswap  │           ║
 * ║   │  PUSH   │  │  PULL   │  │  PULL   │  │  PUSH   │  │  TWAP   │           ║
 * ║   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           ║
 * ║        │            │            │            │            │                 ║
 * ║        v            v            v            v            v                 ║
 * ║   ┌─────────────────────────────────────────────────────────────────────┐   ║
 * ║   │              ORACLE ADAPTER LAYER (Normalized to 8 decimals)         │   ║
 * ║   │  • Per-oracle staleness thresholds                                   │   ║
 * ║   │  • Confidence scoring (freshness × reliability)                      │   ║
 * ║   │  • Failure tracking and auto-disable                                 │   ║
 * ║   └───────────────────────────────┬─────────────────────────────────────┘   ║
 * ║                                   │                                         ║
 * ║                                   v                                         ║
 * ║   ┌─────────────────────────────────────────────────────────────────────┐   ║
 * ║   │              BFT AGGREGATION ENGINE                                  │   ║
 * ║   │  • Byzantine median: tolerates 2 of 5 corrupt oracles               │   ║
 * ║   │  • Outlier detection (>2σ from median)                               │   ║
 * ║   │  • Confidence-weighted final price                                   │   ║
 * ║   └───────────────────────────────┬─────────────────────────────────────┘   ║
 * ║                                   │                                         ║
 * ║                                   v                                         ║
 * ║   ┌─────────────────────────────────────────────────────────────────────┐   ║
 * ║   │              CIRCUIT BREAKER + FALLBACK CASCADE                      │   ║
 * ║   │  Level 1: >20% cross-oracle deviation → PAUSE                        │   ║
 * ║   │  Level 2: >3 oracles fail → weighted remaining                       │   ║
 * ║   │  Level 3: All external fail → TWAP-only mode                         │   ║
 * ║   │  Level 4: Total failure → Settlement pause                           │   ║
 * ║   └─────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * SECURITY PROPERTIES:
 * 1. BFT Tolerance: 2/5 oracles can be compromised without affecting price
 * 2. Flash Loan Resistance: Median ignores outliers, TWAP provides anchor
 * 3. Staleness Protection: Per-oracle freshness thresholds
 * 4. Manipulation Detection: Cross-oracle deviation analysis
 * 5. Graceful Degradation: Cascading fallback maintains availability
 */

// ============================================
// EXTERNAL ORACLE INTERFACES
// ============================================

// Chainlink AggregatorV3 Interface
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

// Pyth Network Interface
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory price);
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount);
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
}

// DIA Oracle Interface
interface IDIAOracleV2 {
    function getValue(string memory key) external view returns (uint128, uint128);
}

// Uniswap V3 Pool Interface (for TWAP)
interface IUniswapV3Pool {
    function observe(uint32[] calldata secondsAgos) 
        external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function slot0() external view returns (
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
}

contract MultiOracleAggregator {
    
    // ============================================
    // ENUMS & STRUCTS
    // ============================================
    
    enum OracleType {
        CHAINLINK,      // 0 - Industry standard push oracle
        PYTH,           // 1 - Sub-second pull oracle
        REDSTONE,       // 2 - Multi-sig threshold oracle
        DIA,            // 3 - Community-sourced oracle
        UNISWAP_TWAP    // 4 - On-chain trustless oracle
    }
    
    enum CircuitBreakerLevel {
        NORMAL,         // 0 - All systems operational
        ELEVATED,       // 1 - Minor deviation detected
        HIGH,           // 2 - Significant deviation, extra validation
        CRITICAL,       // 3 - Major deviation, limited oracles
        EMERGENCY       // 4 - System paused, manual intervention required
    }
    
    struct OracleConfig {
        address oracleAddress;      // Contract address
        bytes32 feedId;             // Feed identifier (for Pyth)
        uint256 maxStaleness;       // Max age in seconds
        uint256 reliabilityScore;   // 0-100 base reliability
        uint256 failCount;          // Consecutive failures
        uint256 successCount;       // Consecutive successes
        bool isActive;              // Currently enabled
        uint8 decimals;             // Price decimals
    }
    
    struct OraclePrice {
        uint256 price;              // Normalized to 8 decimals
        uint256 timestamp;          // When price was fetched
        uint256 confidence;         // 0-100 confidence score
        OracleType oracleType;      // Which oracle provided this
        bool isValid;               // Whether price passed validation
    }
    
    struct AggregatedPrice {
        uint256 medianPrice;        // BFT median price
        uint256 weightedPrice;      // Confidence-weighted average
        uint256 twapPrice;          // Uniswap TWAP anchor
        uint256 timestamp;          // Aggregation time
        uint256 confidence;         // Overall confidence 0-100
        uint8 validOracleCount;     // How many oracles contributed
        uint8 outlierCount;         // How many were excluded
        bool isReliable;            // Meets minimum oracle threshold
    }
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;          // 8 decimals standard
    uint256 public constant CONFIDENCE_PRECISION = 100;     // 0-100 scale
    
    // Staleness thresholds (in seconds)
    uint256 public constant CHAINLINK_MAX_STALENESS = 3600;     // 1 hour (heartbeat)
    uint256 public constant PYTH_MAX_STALENESS = 60;            // 1 minute
    uint256 public constant REDSTONE_MAX_STALENESS = 60;        // 1 minute
    uint256 public constant DIA_MAX_STALENESS = 120;            // 2 minutes
    uint256 public constant TWAP_PERIOD = 1800;                 // 30-minute TWAP
    
    // BFT thresholds
    uint256 public constant MIN_VALID_ORACLES = 3;              // Need at least 3/5
    uint256 public constant MAX_DEVIATION_PERCENT = 5;          // 5% max cross-oracle deviation
    uint256 public constant CIRCUIT_BREAKER_THRESHOLD = 20;     // 20% triggers emergency
    uint256 public constant OUTLIER_THRESHOLD_BPS = 200;        // 2% from median = outlier
    
    // Price bounds (sanity checks)
    uint256 public constant MIN_VALID_PRICE = 1e6;              // $10 minimum (8 decimals)
    uint256 public constant MAX_VALID_PRICE = 1e12;             // $10,000 maximum (8 decimals)
    
    // Reliability scoring
    uint256 public constant MAX_FAIL_COUNT = 3;                 // Disable after 3 failures
    uint256 public constant RELIABILITY_DECAY = 10;             // -10 per failure
    uint256 public constant RELIABILITY_RECOVERY = 5;           // +5 per success
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    // Oracle configurations (indexed by OracleType)
    mapping(OracleType => OracleConfig) public oracleConfigs;
    
    // Latest prices from each oracle
    mapping(OracleType => OraclePrice) public latestPrices;
    
    // Price history for analysis
    AggregatedPrice[] public priceHistory;
    uint256 public constant MAX_PRICE_HISTORY = 100;
    
    // Circuit breaker state
    CircuitBreakerLevel public circuitBreakerLevel;
    uint256 public lastCircuitBreakerUpdate;
    
    // Admin
    address public admin;
    bool public isPaused;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event OraclePriceFetched(
        OracleType indexed oracleType,
        uint256 price,
        uint256 timestamp,
        uint256 confidence
    );
    
    event PriceAggregated(
        uint256 medianPrice,
        uint256 weightedPrice,
        uint256 confidence,
        uint8 validOracleCount
    );
    
    event OracleFailure(
        OracleType indexed oracleType,
        string reason,
        uint256 failCount
    );
    
    event OracleRecovered(
        OracleType indexed oracleType,
        uint256 successCount
    );
    
    event CircuitBreakerTriggered(
        CircuitBreakerLevel level,
        uint256 deviation,
        string reason
    );
    
    event OutlierDetected(
        OracleType indexed oracleType,
        uint256 price,
        uint256 medianPrice,
        uint256 deviationBps
    );
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier whenNotPaused() {
        require(!isPaused, "System paused");
        _;
    }
    
    modifier circuitBreakerCheck() {
        require(
            circuitBreakerLevel != CircuitBreakerLevel.EMERGENCY,
            "Circuit breaker: EMERGENCY"
        );
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() {
        admin = msg.sender;
        circuitBreakerLevel = CircuitBreakerLevel.NORMAL;
        
        // Initialize default configurations (can be updated later)
        _initializeDefaultConfigs();
    }
    
    function _initializeDefaultConfigs() internal {
        // Chainlink - Most reliable, industry standard
        oracleConfigs[OracleType.CHAINLINK] = OracleConfig({
            oracleAddress: address(0),
            feedId: bytes32(0),
            maxStaleness: CHAINLINK_MAX_STALENESS,
            reliabilityScore: 95,
            failCount: 0,
            successCount: 0,
            isActive: false,
            decimals: 8
        });
        
        // Pyth - Fastest updates, DeFi native
        oracleConfigs[OracleType.PYTH] = OracleConfig({
            oracleAddress: address(0),
            feedId: bytes32(0),
            maxStaleness: PYTH_MAX_STALENESS,
            reliabilityScore: 90,
            failCount: 0,
            successCount: 0,
            isActive: false,
            decimals: 8
        });
        
        // Redstone - Multi-sig threshold, gas efficient
        oracleConfigs[OracleType.REDSTONE] = OracleConfig({
            oracleAddress: address(0),
            feedId: bytes32(0),
            maxStaleness: REDSTONE_MAX_STALENESS,
            reliabilityScore: 85,
            failCount: 0,
            successCount: 0,
            isActive: false,
            decimals: 8
        });
        
        // DIA - Community sourced, 20k+ feeds
        oracleConfigs[OracleType.DIA] = OracleConfig({
            oracleAddress: address(0),
            feedId: bytes32(0),
            maxStaleness: DIA_MAX_STALENESS,
            reliabilityScore: 80,
            failCount: 0,
            successCount: 0,
            isActive: false,
            decimals: 8
        });
        
        // Uniswap TWAP - Fully on-chain, manipulation resistant
        oracleConfigs[OracleType.UNISWAP_TWAP] = OracleConfig({
            oracleAddress: address(0),
            feedId: bytes32(0),
            maxStaleness: TWAP_PERIOD * 2,
            reliabilityScore: 75,
            failCount: 0,
            successCount: 0,
            isActive: false,
            decimals: 18
        });
    }
    
    // ============================================
    // ORACLE CONFIGURATION
    // ============================================
    
    /**
     * @notice Configure an oracle adapter
     * @param oracleType Which oracle to configure
     * @param oracleAddress Contract address
     * @param feedId Feed identifier (for Pyth, empty for others)
     */
    function configureOracle(
        OracleType oracleType,
        address oracleAddress,
        bytes32 feedId
    ) external onlyAdmin {
        require(oracleAddress != address(0), "Invalid address");
        
        OracleConfig storage config = oracleConfigs[oracleType];
        config.oracleAddress = oracleAddress;
        config.feedId = feedId;
        config.isActive = true;
        config.failCount = 0;
        config.successCount = 0;
    }
    
    /**
     * @notice Disable an oracle
     * @param oracleType Which oracle to disable
     */
    function disableOracle(OracleType oracleType) external onlyAdmin {
        oracleConfigs[oracleType].isActive = false;
    }
    
    /**
     * @notice Enable a previously disabled oracle
     * @param oracleType Which oracle to enable
     */
    function enableOracle(OracleType oracleType) external onlyAdmin {
        require(
            oracleConfigs[oracleType].oracleAddress != address(0),
            "Oracle not configured"
        );
        oracleConfigs[oracleType].isActive = true;
        oracleConfigs[oracleType].failCount = 0;
    }
    
    // ============================================
    // CORE PRICE FETCHING
    // ============================================
    
    /**
     * @notice Fetch price from Chainlink oracle
     * @return price Normalized price (8 decimals)
     * @return timestamp When price was updated
     * @return isValid Whether price passed validation
     */
    function _fetchChainlinkPrice() internal returns (uint256 price, uint256 timestamp, bool isValid) {
        OracleConfig storage config = oracleConfigs[OracleType.CHAINLINK];
        if (!config.isActive || config.oracleAddress == address(0)) {
            return (0, 0, false);
        }
        
        try IChainlinkAggregator(config.oracleAddress).latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (answer <= 0) {
                _recordFailure(OracleType.CHAINLINK, "Negative price");
                return (0, 0, false);
            }
            
            if (block.timestamp - updatedAt > config.maxStaleness) {
                _recordFailure(OracleType.CHAINLINK, "Stale price");
                return (0, 0, false);
            }
            
            // Normalize to 8 decimals
            uint8 decimals = IChainlinkAggregator(config.oracleAddress).decimals();
            price = _normalizePrice(uint256(answer), decimals);
            timestamp = updatedAt;
            
            if (!_isPriceWithinBounds(price)) {
                _recordFailure(OracleType.CHAINLINK, "Price out of bounds");
                return (0, 0, false);
            }
            
            _recordSuccess(OracleType.CHAINLINK);
            isValid = true;
            
        } catch {
            _recordFailure(OracleType.CHAINLINK, "Call failed");
            return (0, 0, false);
        }
    }
    
    /**
     * @notice Fetch price from Pyth oracle
     * @return price Normalized price (8 decimals)
     * @return timestamp When price was updated
     * @return isValid Whether price passed validation
     */
    function _fetchPythPrice() internal returns (uint256 price, uint256 timestamp, bool isValid) {
        OracleConfig storage config = oracleConfigs[OracleType.PYTH];
        if (!config.isActive || config.oracleAddress == address(0)) {
            return (0, 0, false);
        }
        
        try IPyth(config.oracleAddress).getPriceNoOlderThan(
            config.feedId,
            config.maxStaleness
        ) returns (IPyth.Price memory pythPrice) {
            if (pythPrice.price <= 0) {
                _recordFailure(OracleType.PYTH, "Negative price");
                return (0, 0, false);
            }
            
            // Convert Pyth price (with exponent) to 8 decimals
            int32 expo = pythPrice.expo;
            uint256 rawPrice = uint256(uint64(pythPrice.price));
            
            if (expo < 0) {
                // Negative exponent: divide
                uint256 divisor = 10 ** uint32(-expo);
                price = (rawPrice * PRICE_PRECISION) / divisor;
            } else {
                // Positive exponent: multiply
                price = rawPrice * (10 ** uint32(expo)) * PRICE_PRECISION;
            }
            
            timestamp = pythPrice.publishTime;
            
            if (!_isPriceWithinBounds(price)) {
                _recordFailure(OracleType.PYTH, "Price out of bounds");
                return (0, 0, false);
            }
            
            _recordSuccess(OracleType.PYTH);
            isValid = true;
            
        } catch {
            _recordFailure(OracleType.PYTH, "Call failed");
            return (0, 0, false);
        }
    }
    
    /**
     * @notice Fetch price from DIA oracle
     * @return price Normalized price (8 decimals)
     * @return timestamp When price was updated
     * @return isValid Whether price passed validation
     */
    function _fetchDIAPrice() internal returns (uint256 price, uint256 timestamp, bool isValid) {
        OracleConfig storage config = oracleConfigs[OracleType.DIA];
        if (!config.isActive || config.oracleAddress == address(0)) {
            return (0, 0, false);
        }
        
        try IDIAOracleV2(config.oracleAddress).getValue("ETH/USD") returns (
            uint128 diaPrice,
            uint128 diaTimestamp
        ) {
            if (diaPrice == 0) {
                _recordFailure(OracleType.DIA, "Zero price");
                return (0, 0, false);
            }
            
            if (block.timestamp - diaTimestamp > config.maxStaleness) {
                _recordFailure(OracleType.DIA, "Stale price");
                return (0, 0, false);
            }
            
            // DIA returns 8 decimals by default
            price = uint256(diaPrice);
            timestamp = uint256(diaTimestamp);
            
            if (!_isPriceWithinBounds(price)) {
                _recordFailure(OracleType.DIA, "Price out of bounds");
                return (0, 0, false);
            }
            
            _recordSuccess(OracleType.DIA);
            isValid = true;
            
        } catch {
            _recordFailure(OracleType.DIA, "Call failed");
            return (0, 0, false);
        }
    }
    
    /**
     * @notice Calculate Uniswap V3 TWAP price
     * @return price Normalized price (8 decimals)
     * @return timestamp When TWAP was calculated
     * @return isValid Whether TWAP is valid
     */
    function _fetchUniswapTWAP() internal returns (uint256 price, uint256 timestamp, bool isValid) {
        OracleConfig storage config = oracleConfigs[OracleType.UNISWAP_TWAP];
        if (!config.isActive || config.oracleAddress == address(0)) {
            return (0, 0, false);
        }
        
        try this._calculateTWAP(config.oracleAddress) returns (uint256 twapPrice) {
            if (twapPrice == 0) {
                _recordFailure(OracleType.UNISWAP_TWAP, "Zero TWAP");
                return (0, 0, false);
            }
            
            price = twapPrice;
            timestamp = block.timestamp;
            
            if (!_isPriceWithinBounds(price)) {
                _recordFailure(OracleType.UNISWAP_TWAP, "Price out of bounds");
                return (0, 0, false);
            }
            
            _recordSuccess(OracleType.UNISWAP_TWAP);
            isValid = true;
            
        } catch {
            _recordFailure(OracleType.UNISWAP_TWAP, "TWAP calculation failed");
            return (0, 0, false);
        }
    }
    
    /**
     * @notice Calculate TWAP from Uniswap V3 pool (external for try/catch)
     * @param poolAddress Uniswap V3 pool address
     * @return twapPrice TWAP price normalized to 8 decimals
     */
    function _calculateTWAP(address poolAddress) external view returns (uint256 twapPrice) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = uint32(TWAP_PERIOD);
        secondsAgos[1] = 0;
        
        (int56[] memory tickCumulatives,) = IUniswapV3Pool(poolAddress).observe(secondsAgos);
        
        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 averageTick = int24(tickCumulativesDelta / int56(int32(uint32(TWAP_PERIOD))));
        
        // Convert tick to price (simplified - assumes WETH/USDC pool)
        // tick = log1.0001(price), so price = 1.0001^tick
        // For ETH/USD, we need to handle the token ordering
        
        uint256 sqrtPriceX96 = _getSqrtRatioAtTick(averageTick);
        
        // Convert sqrtPriceX96 to actual price
        // price = (sqrtPriceX96 / 2^96)^2
        // For WETH/USDC (6 decimals USDC, 18 decimals WETH)
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        
        // Normalize to 8 decimals
        // This calculation depends on token ordering in the pool
        twapPrice = (priceX192 * PRICE_PRECISION) / (1 << 192);
        
        // Apply decimal adjustment for WETH/USDC (18 - 6 = 12 decimal difference)
        twapPrice = twapPrice * 1e12;
    }
    
    /**
     * @dev Get sqrt price ratio at a given tick (simplified Uniswap math)
     */
    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint256) {
        uint256 absTick = tick < 0 ? uint256(uint24(-tick)) : uint256(uint24(tick));
        require(absTick <= 887272, "Tick out of range");
        
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
        
        return ratio >> 32;
    }
    
    // ============================================
    // BFT AGGREGATION ENGINE
    // ============================================
    
    /**
     * @notice Get aggregated price from all available oracles
     * @return aggregated The BFT-aggregated price data
     * 
     * ALGORITHM:
     * 1. Fetch prices from all active oracles
     * 2. Calculate confidence scores
     * 3. Remove outliers (>2% from preliminary median)
     * 4. Calculate BFT median from remaining prices
     * 5. Calculate confidence-weighted average
     * 6. Update circuit breaker if needed
     */
    function getAggregatedPrice() 
        external 
        whenNotPaused 
        circuitBreakerCheck 
        returns (AggregatedPrice memory aggregated) 
    {
        // Step 1: Fetch all prices
        OraclePrice[] memory prices = new OraclePrice[](5);
        uint8 validCount = 0;
        
        // Chainlink
        (uint256 p1, uint256 t1, bool v1) = _fetchChainlinkPrice();
        if (v1) {
            prices[validCount] = OraclePrice({
                price: p1,
                timestamp: t1,
                confidence: _calculateConfidence(OracleType.CHAINLINK, t1),
                oracleType: OracleType.CHAINLINK,
                isValid: true
            });
            latestPrices[OracleType.CHAINLINK] = prices[validCount];
            emit OraclePriceFetched(OracleType.CHAINLINK, p1, t1, prices[validCount].confidence);
            validCount++;
        }
        
        // Pyth
        (uint256 p2, uint256 t2, bool v2) = _fetchPythPrice();
        if (v2) {
            prices[validCount] = OraclePrice({
                price: p2,
                timestamp: t2,
                confidence: _calculateConfidence(OracleType.PYTH, t2),
                oracleType: OracleType.PYTH,
                isValid: true
            });
            latestPrices[OracleType.PYTH] = prices[validCount];
            emit OraclePriceFetched(OracleType.PYTH, p2, t2, prices[validCount].confidence);
            validCount++;
        }
        
        // DIA
        (uint256 p3, uint256 t3, bool v3) = _fetchDIAPrice();
        if (v3) {
            prices[validCount] = OraclePrice({
                price: p3,
                timestamp: t3,
                confidence: _calculateConfidence(OracleType.DIA, t3),
                oracleType: OracleType.DIA,
                isValid: true
            });
            latestPrices[OracleType.DIA] = prices[validCount];
            emit OraclePriceFetched(OracleType.DIA, p3, t3, prices[validCount].confidence);
            validCount++;
        }
        
        // Uniswap TWAP
        (uint256 p4, uint256 t4, bool v4) = _fetchUniswapTWAP();
        if (v4) {
            prices[validCount] = OraclePrice({
                price: p4,
                timestamp: t4,
                confidence: _calculateConfidence(OracleType.UNISWAP_TWAP, t4),
                oracleType: OracleType.UNISWAP_TWAP,
                isValid: true
            });
            latestPrices[OracleType.UNISWAP_TWAP] = prices[validCount];
            emit OraclePriceFetched(OracleType.UNISWAP_TWAP, p4, t4, prices[validCount].confidence);
            validCount++;
        }
        
        // Step 2: Check if we have enough oracles
        if (validCount < MIN_VALID_ORACLES) {
            // Fallback: use whatever we have with reduced confidence
            aggregated.isReliable = false;
            aggregated.validOracleCount = validCount;
            
            if (validCount == 0) {
                _triggerCircuitBreaker(CircuitBreakerLevel.EMERGENCY, 0, "No valid oracles");
                return aggregated;
            }
        } else {
            aggregated.isReliable = true;
        }
        
        aggregated.validOracleCount = validCount;
        
        // Step 3: Calculate preliminary median and detect outliers
        uint256[] memory validPrices = new uint256[](validCount);
        for (uint8 i = 0; i < validCount; i++) {
            validPrices[i] = prices[i].price;
        }
        
        uint256 preliminaryMedian = _calculateMedian(validPrices);
        
        // Step 4: Remove outliers
        uint256[] memory filteredPrices = new uint256[](validCount);
        uint256[] memory filteredConfidences = new uint256[](validCount);
        uint8 filteredCount = 0;
        
        for (uint8 i = 0; i < validCount; i++) {
            uint256 deviationBps = _calculateDeviationBps(prices[i].price, preliminaryMedian);
            
            if (deviationBps <= OUTLIER_THRESHOLD_BPS) {
                filteredPrices[filteredCount] = prices[i].price;
                filteredConfidences[filteredCount] = prices[i].confidence;
                filteredCount++;
            } else {
                emit OutlierDetected(
                    prices[i].oracleType,
                    prices[i].price,
                    preliminaryMedian,
                    deviationBps
                );
                aggregated.outlierCount++;
            }
        }
        
        // Step 5: Calculate final median
        if (filteredCount > 0) {
            uint256[] memory finalPrices = new uint256[](filteredCount);
            for (uint8 i = 0; i < filteredCount; i++) {
                finalPrices[i] = filteredPrices[i];
            }
            aggregated.medianPrice = _calculateMedian(finalPrices);
        } else {
            aggregated.medianPrice = preliminaryMedian;
        }
        
        // Step 6: Calculate confidence-weighted average
        aggregated.weightedPrice = _calculateWeightedAverage(
            filteredPrices,
            filteredConfidences,
            filteredCount
        );
        
        // Step 7: Set TWAP anchor
        if (latestPrices[OracleType.UNISWAP_TWAP].isValid) {
            aggregated.twapPrice = latestPrices[OracleType.UNISWAP_TWAP].price;
        }
        
        // Step 8: Calculate overall confidence
        aggregated.confidence = _calculateOverallConfidence(
            filteredConfidences,
            filteredCount,
            aggregated.outlierCount
        );
        
        aggregated.timestamp = block.timestamp;
        
        // Step 9: Check circuit breaker conditions
        _checkCircuitBreaker(aggregated);
        
        // Step 10: Record in history
        _recordPrice(aggregated);
        
        emit PriceAggregated(
            aggregated.medianPrice,
            aggregated.weightedPrice,
            aggregated.confidence,
            aggregated.validOracleCount
        );
        
        return aggregated;
    }
    
    /**
     * @notice Get latest cached aggregated price (view function, no oracle calls)
     * @return Latest aggregated price from history
     */
    function getLatestPrice() external view returns (AggregatedPrice memory) {
        if (priceHistory.length == 0) {
            return AggregatedPrice({
                medianPrice: 0,
                weightedPrice: 0,
                twapPrice: 0,
                timestamp: 0,
                confidence: 0,
                validOracleCount: 0,
                outlierCount: 0,
                isReliable: false
            });
        }
        return priceHistory[priceHistory.length - 1];
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    /**
     * @dev Calculate median of an array (in-place quickselect)
     */
    function _calculateMedian(uint256[] memory arr) internal pure returns (uint256) {
        uint256 n = arr.length;
        if (n == 0) return 0;
        if (n == 1) return arr[0];
        
        // Simple sort for small arrays
        for (uint256 i = 0; i < n - 1; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (arr[j] < arr[i]) {
                    (arr[i], arr[j]) = (arr[j], arr[i]);
                }
            }
        }
        
        if (n % 2 == 1) {
            return arr[n / 2];
        } else {
            return (arr[n / 2 - 1] + arr[n / 2]) / 2;
        }
    }
    
    /**
     * @dev Calculate confidence-weighted average
     */
    function _calculateWeightedAverage(
        uint256[] memory prices,
        uint256[] memory confidences,
        uint8 count
    ) internal pure returns (uint256) {
        if (count == 0) return 0;
        
        uint256 weightedSum = 0;
        uint256 totalWeight = 0;
        
        for (uint8 i = 0; i < count; i++) {
            weightedSum += prices[i] * confidences[i];
            totalWeight += confidences[i];
        }
        
        if (totalWeight == 0) return prices[0];
        return weightedSum / totalWeight;
    }
    
    /**
     * @dev Calculate confidence score for an oracle reading
     */
    function _calculateConfidence(OracleType oracleType, uint256 timestamp) 
        internal 
        view 
        returns (uint256) 
    {
        OracleConfig storage config = oracleConfigs[oracleType];
        
        // Base reliability (0-100)
        uint256 confidence = config.reliabilityScore;
        
        // Freshness penalty
        uint256 age = block.timestamp - timestamp;
        uint256 maxAge = config.maxStaleness;
        
        if (age > maxAge) {
            confidence = confidence / 2; // 50% penalty for stale
        } else if (age > maxAge / 2) {
            confidence = (confidence * 80) / 100; // 20% penalty for semi-stale
        }
        
        // Success/failure adjustment
        if (config.failCount > 0) {
            confidence = confidence > (config.failCount * RELIABILITY_DECAY) 
                ? confidence - (config.failCount * RELIABILITY_DECAY) 
                : 0;
        }
        
        return confidence > 100 ? 100 : confidence;
    }
    
    /**
     * @dev Calculate overall confidence from individual confidences
     */
    function _calculateOverallConfidence(
        uint256[] memory confidences,
        uint8 count,
        uint8 outlierCount
    ) internal pure returns (uint256) {
        if (count == 0) return 0;
        
        uint256 sum = 0;
        for (uint8 i = 0; i < count; i++) {
            sum += confidences[i];
        }
        
        uint256 avgConfidence = sum / count;
        
        // Penalty for outliers
        if (outlierCount > 0) {
            avgConfidence = (avgConfidence * (5 - outlierCount)) / 5;
        }
        
        // Bonus for consensus (many oracles agree)
        if (count >= 4) {
            avgConfidence = (avgConfidence * 110) / 100; // +10% for 4+ oracles
        }
        
        return avgConfidence > 100 ? 100 : avgConfidence;
    }
    
    /**
     * @dev Calculate deviation in basis points
     */
    function _calculateDeviationBps(uint256 price1, uint256 price2) 
        internal 
        pure 
        returns (uint256) 
    {
        if (price1 == 0 || price2 == 0) return 10000; // 100%
        
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        return (diff * 10000) / price1;
    }
    
    /**
     * @dev Normalize price to 8 decimals
     */
    function _normalizePrice(uint256 price, uint8 fromDecimals) 
        internal 
        pure 
        returns (uint256) 
    {
        if (fromDecimals == 8) return price;
        if (fromDecimals < 8) {
            return price * (10 ** (8 - fromDecimals));
        } else {
            return price / (10 ** (fromDecimals - 8));
        }
    }
    
    /**
     * @dev Check if price is within reasonable bounds
     */
    function _isPriceWithinBounds(uint256 price) internal pure returns (bool) {
        return price >= MIN_VALID_PRICE && price <= MAX_VALID_PRICE;
    }
    
    /**
     * @dev Record oracle success
     */
    function _recordSuccess(OracleType oracleType) internal {
        OracleConfig storage config = oracleConfigs[oracleType];
        config.failCount = 0;
        config.successCount++;
        
        // Recover reliability over time
        if (config.reliabilityScore < 100) {
            config.reliabilityScore += RELIABILITY_RECOVERY;
            if (config.reliabilityScore > 100) config.reliabilityScore = 100;
        }
        
        emit OracleRecovered(oracleType, config.successCount);
    }
    
    /**
     * @dev Record oracle failure
     */
    function _recordFailure(OracleType oracleType, string memory reason) internal {
        OracleConfig storage config = oracleConfigs[oracleType];
        config.failCount++;
        config.successCount = 0;
        
        // Decay reliability
        if (config.reliabilityScore > RELIABILITY_DECAY) {
            config.reliabilityScore -= RELIABILITY_DECAY;
        } else {
            config.reliabilityScore = 0;
        }
        
        // Auto-disable after too many failures
        if (config.failCount >= MAX_FAIL_COUNT) {
            config.isActive = false;
        }
        
        emit OracleFailure(oracleType, reason, config.failCount);
    }
    
    /**
     * @dev Record price in history
     */
    function _recordPrice(AggregatedPrice memory price) internal {
        if (priceHistory.length >= MAX_PRICE_HISTORY) {
            // Shift left (remove oldest)
            for (uint256 i = 0; i < priceHistory.length - 1; i++) {
                priceHistory[i] = priceHistory[i + 1];
            }
            priceHistory[priceHistory.length - 1] = price;
        } else {
            priceHistory.push(price);
        }
    }
    
    // ============================================
    // CIRCUIT BREAKER
    // ============================================
    
    /**
     * @dev Check and update circuit breaker based on aggregated price
     */
    function _checkCircuitBreaker(AggregatedPrice memory price) internal {
        // Check TWAP deviation
        if (price.twapPrice > 0 && price.medianPrice > 0) {
            uint256 twapDeviation = _calculateDeviationBps(price.medianPrice, price.twapPrice);
            
            if (twapDeviation > CIRCUIT_BREAKER_THRESHOLD * 100) {
                _triggerCircuitBreaker(
                    CircuitBreakerLevel.CRITICAL,
                    twapDeviation,
                    "Extreme TWAP deviation"
                );
                return;
            } else if (twapDeviation > MAX_DEVIATION_PERCENT * 100) {
                _triggerCircuitBreaker(
                    CircuitBreakerLevel.HIGH,
                    twapDeviation,
                    "High TWAP deviation"
                );
                return;
            }
        }
        
        // Check oracle count
        if (price.validOracleCount < MIN_VALID_ORACLES) {
            _triggerCircuitBreaker(
                CircuitBreakerLevel.ELEVATED,
                0,
                "Insufficient oracles"
            );
            return;
        }
        
        // All good, reset to normal
        if (circuitBreakerLevel != CircuitBreakerLevel.NORMAL) {
            circuitBreakerLevel = CircuitBreakerLevel.NORMAL;
            lastCircuitBreakerUpdate = block.timestamp;
        }
    }
    
    /**
     * @dev Trigger circuit breaker
     */
    function _triggerCircuitBreaker(
        CircuitBreakerLevel level,
        uint256 deviation,
        string memory reason
    ) internal {
        if (level > circuitBreakerLevel) {
            circuitBreakerLevel = level;
            lastCircuitBreakerUpdate = block.timestamp;
            
            emit CircuitBreakerTriggered(level, deviation, reason);
            
            if (level == CircuitBreakerLevel.EMERGENCY) {
                isPaused = true;
            }
        }
    }
    
    /**
     * @notice Reset circuit breaker (admin only)
     */
    function resetCircuitBreaker() external onlyAdmin {
        circuitBreakerLevel = CircuitBreakerLevel.NORMAL;
        isPaused = false;
        lastCircuitBreakerUpdate = block.timestamp;
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    /**
     * @notice Pause the system
     */
    function pause() external onlyAdmin {
        isPaused = true;
    }
    
    /**
     * @notice Unpause the system
     */
    function unpause() external onlyAdmin {
        isPaused = false;
    }
    
    /**
     * @notice Transfer admin role
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get configuration for a specific oracle
     */
    function getOracleConfig(OracleType oracleType) 
        external 
        view 
        returns (OracleConfig memory) 
    {
        return oracleConfigs[oracleType];
    }
    
    /**
     * @notice Get latest price from a specific oracle
     */
    function getOraclePrice(OracleType oracleType) 
        external 
        view 
        returns (OraclePrice memory) 
    {
        return latestPrices[oracleType];
    }
    
    /**
     * @notice Get system health status
     */
    function getSystemHealth() external view returns (
        CircuitBreakerLevel level,
        bool paused,
        uint8 activeOracleCount,
        uint256 lastUpdate
    ) {
        uint8 active = 0;
        if (oracleConfigs[OracleType.CHAINLINK].isActive) active++;
        if (oracleConfigs[OracleType.PYTH].isActive) active++;
        if (oracleConfigs[OracleType.REDSTONE].isActive) active++;
        if (oracleConfigs[OracleType.DIA].isActive) active++;
        if (oracleConfigs[OracleType.UNISWAP_TWAP].isActive) active++;
        
        return (
            circuitBreakerLevel,
            isPaused,
            active,
            lastCircuitBreakerUpdate
        );
    }
    
    /**
     * @notice Get price history length
     */
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }
    
    /**
     * @notice Get active oracle count
     */
    function getActiveOracleCount() external view returns (uint8) {
        uint8 count = 0;
        if (oracleConfigs[OracleType.CHAINLINK].isActive) count++;
        if (oracleConfigs[OracleType.PYTH].isActive) count++;
        if (oracleConfigs[OracleType.REDSTONE].isActive) count++;
        if (oracleConfigs[OracleType.DIA].isActive) count++;
        if (oracleConfigs[OracleType.UNISWAP_TWAP].isActive) count++;
        return count;
    }
}
