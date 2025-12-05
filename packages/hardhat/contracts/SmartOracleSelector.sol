// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SmartOracleSelector
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice AI-Inspired Dynamic Oracle Selection Engine
 * @dev Selects optimal oracle combination based on multiple factors
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    SMART ORACLE SELECTOR - FLAGSHIP FEATURE                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   DYNAMIC MULTI-ORACLE SELECTION ALGORITHM:                                  ║
 * ║   ┌──────────────────────────────────────────────────────────────────────┐   ║
 * ║   │                                                                      │   ║
 * ║   │   Step 1: FRESHNESS SCORING (0-25 points)                           │   ║
 * ║   │   └─ More recent = higher score                                      │   ║
 * ║   │   └─ Pyth excels here (sub-second updates)                          │   ║
 * ║   │                                                                      │   ║
 * ║   │   Step 2: RELIABILITY SCORING (0-25 points)                         │   ║
 * ║   │   └─ Based on historical success rate                               │   ║
 * ║   │   └─ Chainlink excels here (battle-tested)                          │   ║
 * ║   │                                                                      │   ║
 * ║   │   Step 3: CONSENSUS SCORING (0-25 points)                           │   ║
 * ║   │   └─ How close to median of all oracles                             │   ║
 * ║   │   └─ Penalizes outliers                                             │   ║
 * ║   │                                                                      │   ║
 * ║   │   Step 4: SPECIALIZATION BONUS (0-25 points)                        │   ║
 * ║   │   └─ Task-specific bonuses:                                         │   ║
 * ║   │       • Settlement: Chainlink (+25)                                 │   ║
 * ║   │       • High-frequency: Pyth (+25)                                  │   ║
 * ║   │       • Manipulation check: TWAP (+25)                              │   ║
 * ║   │       • Diversity: DIA (+20), API3 (+15)                            │   ║
 * ║   │                                                                      │   ║
 * ║   │   FINAL SCORE = Sum of all factors (0-100)                          │   ║
 * ║   │   SELECT TOP 3 ORACLES for BFT consensus                            │   ║
 * ║   │                                                                      │   ║
 * ║   └──────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                               ║
 * ║   USE CASES:                                                                 ║
 * ║   • SETTLEMENT: High reliability needed → Chainlink + TWAP + DIA            ║
 * ║   • TRADING: Low latency needed → Pyth + Chainlink + API3                   ║
 * ║   • SECURITY: Manipulation resistance → TWAP + Chainlink + DIA              ║
 * ║   • BALANCED: All factors equal → Dynamic top 3 selection                   ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import "./API3Adapter.sol";

/**
 * @dev Interface for Chainlink-compatible price feeds
 */
interface IChainlinkLike {
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
 * @dev Interface for Pyth Network
 */
interface IPythLike {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
}

contract SmartOracleSelector {
    
    // ============================================
    // ENUMS & STRUCTS
    // ============================================
    
    enum OracleType {
        CHAINLINK,      // 0 - Industry standard
        PYTH,           // 1 - High-frequency
        API3,           // 2 - First-party
        DIA,            // 3 - Community-sourced
        UNISWAP_TWAP    // 4 - On-chain anchor
    }
    
    enum UseCase {
        SETTLEMENT,     // 0 - Final price for settlements (reliability priority)
        TRADING,        // 1 - Real-time trading (speed priority)
        SECURITY,       // 2 - Manipulation detection (TWAP priority)
        BALANCED        // 3 - Equal weighting
    }
    
    struct OracleData {
        address adapter;
        bytes32 feedId;         // For Pyth
        uint256 price;
        uint256 timestamp;
        uint256 score;
        bool isAvailable;
        string name;
    }
    
    struct SelectionResult {
        OracleType[] selectedOracles;    // Top oracles selected
        uint256[] scores;                // Their scores
        uint256 aggregatedPrice;         // BFT median of selected
        uint256 confidence;              // Overall confidence (0-100)
        UseCase useCase;                 // What use case was optimized for
        uint256 timestamp;
    }
    
    struct OracleScore {
        uint256 freshnessScore;    // 0-25
        uint256 reliabilityScore;  // 0-25
        uint256 consensusScore;    // 0-25
        uint256 specializationScore; // 0-25
        uint256 totalScore;        // 0-100
    }
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant MAX_SCORE = 100;
    uint256 public constant COMPONENT_MAX = 25;
    
    // Staleness thresholds (seconds)
    uint256 public constant FRESH_THRESHOLD = 60;      // <1 min = max freshness
    uint256 public constant STALE_THRESHOLD = 3600;    // >1 hour = min freshness
    
    // Consensus thresholds
    uint256 public constant CONSENSUS_TIGHT_BPS = 50;  // 0.5% = max consensus
    uint256 public constant CONSENSUS_LOOSE_BPS = 500; // 5% = min consensus
    
    // Minimum oracles for BFT
    uint256 public constant MIN_ORACLES_FOR_BFT = 3;
    
    // ============================================
    // STATE
    // ============================================
    
    address public admin;
    
    // Oracle adapters
    address public chainlinkAdapter;
    address public pythAdapter;
    bytes32 public pythFeedId;
    address public api3Adapter;
    address public diaAdapter;
    address public twapAdapter;
    
    // Historical reliability (success rate * 100)
    mapping(OracleType => uint256) public reliabilityScores;
    mapping(OracleType => uint256) public queryCount;
    mapping(OracleType => uint256) public successCount;
    
    // Specialization bonuses per use case
    mapping(UseCase => mapping(OracleType => uint256)) public specializationBonus;
    
    // Last selection result
    SelectionResult public lastSelection;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event OracleSelected(
        OracleType indexed oracle,
        uint256 score,
        uint256 price,
        UseCase useCase
    );
    
    event SelectionComplete(
        uint256 aggregatedPrice,
        uint256 confidence,
        uint8 oraclesUsed,
        UseCase useCase
    );
    
    event OracleScoreUpdated(
        OracleType indexed oracle,
        uint256 oldScore,
        uint256 newScore
    );
    
    event AdapterConfigured(
        OracleType indexed oracle,
        address adapter
    );
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() {
        admin = msg.sender;
        
        // Initialize default reliability scores (out of 100)
        reliabilityScores[OracleType.CHAINLINK] = 95;
        reliabilityScores[OracleType.PYTH] = 90;
        reliabilityScores[OracleType.API3] = 85;
        reliabilityScores[OracleType.DIA] = 80;
        reliabilityScores[OracleType.UNISWAP_TWAP] = 75;
        
        // Initialize specialization bonuses
        _initializeSpecializationBonuses();
    }
    
    function _initializeSpecializationBonuses() internal {
        // SETTLEMENT use case: reliability priority
        specializationBonus[UseCase.SETTLEMENT][OracleType.CHAINLINK] = 25;
        specializationBonus[UseCase.SETTLEMENT][OracleType.UNISWAP_TWAP] = 20;
        specializationBonus[UseCase.SETTLEMENT][OracleType.DIA] = 15;
        specializationBonus[UseCase.SETTLEMENT][OracleType.PYTH] = 10;
        specializationBonus[UseCase.SETTLEMENT][OracleType.API3] = 10;
        
        // TRADING use case: speed priority
        specializationBonus[UseCase.TRADING][OracleType.PYTH] = 25;
        specializationBonus[UseCase.TRADING][OracleType.CHAINLINK] = 20;
        specializationBonus[UseCase.TRADING][OracleType.API3] = 15;
        specializationBonus[UseCase.TRADING][OracleType.DIA] = 10;
        specializationBonus[UseCase.TRADING][OracleType.UNISWAP_TWAP] = 5;
        
        // SECURITY use case: manipulation resistance priority
        specializationBonus[UseCase.SECURITY][OracleType.UNISWAP_TWAP] = 25;
        specializationBonus[UseCase.SECURITY][OracleType.CHAINLINK] = 20;
        specializationBonus[UseCase.SECURITY][OracleType.DIA] = 15;
        specializationBonus[UseCase.SECURITY][OracleType.API3] = 10;
        specializationBonus[UseCase.SECURITY][OracleType.PYTH] = 10;
        
        // BALANCED use case: equal weighting
        specializationBonus[UseCase.BALANCED][OracleType.CHAINLINK] = 15;
        specializationBonus[UseCase.BALANCED][OracleType.PYTH] = 15;
        specializationBonus[UseCase.BALANCED][OracleType.API3] = 15;
        specializationBonus[UseCase.BALANCED][OracleType.DIA] = 15;
        specializationBonus[UseCase.BALANCED][OracleType.UNISWAP_TWAP] = 15;
    }
    
    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * @notice Configure oracle adapters
     */
    function configureAdapters(
        address _chainlink,
        address _pyth,
        bytes32 _pythFeedId,
        address _api3,
        address _dia,
        address _twap
    ) external onlyAdmin {
        if (_chainlink != address(0)) {
            chainlinkAdapter = _chainlink;
            emit AdapterConfigured(OracleType.CHAINLINK, _chainlink);
        }
        if (_pyth != address(0)) {
            pythAdapter = _pyth;
            pythFeedId = _pythFeedId;
            emit AdapterConfigured(OracleType.PYTH, _pyth);
        }
        if (_api3 != address(0)) {
            api3Adapter = _api3;
            emit AdapterConfigured(OracleType.API3, _api3);
        }
        if (_dia != address(0)) {
            diaAdapter = _dia;
            emit AdapterConfigured(OracleType.DIA, _dia);
        }
        if (_twap != address(0)) {
            twapAdapter = _twap;
            emit AdapterConfigured(OracleType.UNISWAP_TWAP, _twap);
        }
    }
    
    /**
     * @notice Update specialization bonus for a use case
     */
    function setSpecializationBonus(
        UseCase useCase,
        OracleType oracle,
        uint256 bonus
    ) external onlyAdmin {
        require(bonus <= COMPONENT_MAX, "Bonus too high");
        specializationBonus[useCase][oracle] = bonus;
    }
    
    // ============================================
    // CORE SELECTION LOGIC
    // ============================================
    
    /**
     * @notice Select optimal oracles for a given use case
     * @param useCase The intended use (SETTLEMENT, TRADING, SECURITY, BALANCED)
     * @return result The selection result with aggregated price
     */
    function selectOptimalOracles(UseCase useCase) 
        external 
        returns (SelectionResult memory result) 
    {
        // Step 1: Fetch all oracle prices
        OracleData[5] memory oracleData = _fetchAllPrices();
        
        // Step 2: Calculate median for consensus scoring
        uint256 median = _calculateMedian(oracleData);
        
        // Step 3: Score each oracle
        OracleScore[5] memory scores;
        for (uint256 i = 0; i < 5; i++) {
            if (oracleData[i].isAvailable) {
                scores[i] = _scoreOracle(
                    OracleType(i),
                    oracleData[i],
                    median,
                    useCase
                );
                oracleData[i].score = scores[i].totalScore;
            }
        }
        
        // Step 4: Sort and select top 3 oracles
        (OracleType[] memory topOracles, uint256[] memory topScores) = _selectTopOracles(oracleData, 3);
        
        // Step 5: Calculate BFT aggregated price from selected oracles
        uint256 aggregatedPrice = _calculateBFTPrice(oracleData, topOracles);
        
        // Step 6: Calculate overall confidence
        uint256 confidence = _calculateConfidence(topScores, topOracles.length);
        
        // Step 7: Build result
        result = SelectionResult({
            selectedOracles: topOracles,
            scores: topScores,
            aggregatedPrice: aggregatedPrice,
            confidence: confidence,
            useCase: useCase,
            timestamp: block.timestamp
        });
        
        // Step 8: Store and emit
        lastSelection = result;
        
        for (uint256 i = 0; i < topOracles.length; i++) {
            emit OracleSelected(
                topOracles[i],
                topScores[i],
                oracleData[uint256(topOracles[i])].price,
                useCase
            );
        }
        
        emit SelectionComplete(
            aggregatedPrice,
            confidence,
            uint8(topOracles.length),
            useCase
        );
        
        return result;
    }
    
    /**
     * @notice Quick selection with BALANCED use case
     */
    function selectBestOracles() external returns (SelectionResult memory) {
        return this.selectOptimalOracles(UseCase.BALANCED);
    }
    
    // ============================================
    // PRICE FETCHING
    // ============================================
    
    function _fetchAllPrices() internal returns (OracleData[5] memory data) {
        // Chainlink
        if (chainlinkAdapter != address(0)) {
            try IChainlinkLike(chainlinkAdapter).latestRoundData() returns (
                uint80, int256 answer, uint256, uint256 updatedAt, uint80
            ) {
                if (answer > 0) {
                    uint8 decimals = IChainlinkLike(chainlinkAdapter).decimals();
                    data[0] = OracleData({
                        adapter: chainlinkAdapter,
                        feedId: bytes32(0),
                        price: _normalizePrice(uint256(answer), decimals),
                        timestamp: updatedAt,
                        score: 0,
                        isAvailable: true,
                        name: "Chainlink"
                    });
                    _recordSuccess(OracleType.CHAINLINK);
                }
            } catch {
                _recordFailure(OracleType.CHAINLINK);
            }
        }
        
        // Pyth
        if (pythAdapter != address(0)) {
            try IPythLike(pythAdapter).getPriceUnsafe(pythFeedId) returns (
                IPythLike.Price memory pythPrice
            ) {
                if (pythPrice.price > 0) {
                    data[1] = OracleData({
                        adapter: pythAdapter,
                        feedId: pythFeedId,
                        price: _convertPythPrice(pythPrice),
                        timestamp: pythPrice.publishTime,
                        score: 0,
                        isAvailable: true,
                        name: "Pyth"
                    });
                    _recordSuccess(OracleType.PYTH);
                }
            } catch {
                _recordFailure(OracleType.PYTH);
            }
        }
        
        // API3
        if (api3Adapter != address(0)) {
            try IChainlinkLike(api3Adapter).latestRoundData() returns (
                uint80, int256 answer, uint256, uint256 updatedAt, uint80
            ) {
                if (answer > 0) {
                    data[2] = OracleData({
                        adapter: api3Adapter,
                        feedId: bytes32(0),
                        price: uint256(answer),
                        timestamp: updatedAt,
                        score: 0,
                        isAvailable: true,
                        name: "API3"
                    });
                    _recordSuccess(OracleType.API3);
                }
            } catch {
                _recordFailure(OracleType.API3);
            }
        }
        
        // DIA
        if (diaAdapter != address(0)) {
            try IChainlinkLike(diaAdapter).latestRoundData() returns (
                uint80, int256 answer, uint256, uint256 updatedAt, uint80
            ) {
                if (answer > 0) {
                    data[3] = OracleData({
                        adapter: diaAdapter,
                        feedId: bytes32(0),
                        price: uint256(answer),
                        timestamp: updatedAt,
                        score: 0,
                        isAvailable: true,
                        name: "DIA"
                    });
                    _recordSuccess(OracleType.DIA);
                }
            } catch {
                _recordFailure(OracleType.DIA);
            }
        }
        
        // TWAP
        if (twapAdapter != address(0)) {
            try IChainlinkLike(twapAdapter).latestRoundData() returns (
                uint80, int256 answer, uint256, uint256 updatedAt, uint80
            ) {
                if (answer > 0) {
                    data[4] = OracleData({
                        adapter: twapAdapter,
                        feedId: bytes32(0),
                        price: uint256(answer),
                        timestamp: updatedAt,
                        score: 0,
                        isAvailable: true,
                        name: "Uniswap TWAP"
                    });
                    _recordSuccess(OracleType.UNISWAP_TWAP);
                }
            } catch {
                _recordFailure(OracleType.UNISWAP_TWAP);
            }
        }
    }
    
    // ============================================
    // SCORING FUNCTIONS
    // ============================================
    
    function _scoreOracle(
        OracleType oracleType,
        OracleData memory data,
        uint256 median,
        UseCase useCase
    ) internal view returns (OracleScore memory score) {
        // 1. Freshness Score (0-25)
        score.freshnessScore = _calculateFreshnessScore(data.timestamp);
        
        // 2. Reliability Score (0-25)
        score.reliabilityScore = _calculateReliabilityScore(oracleType);
        
        // 3. Consensus Score (0-25)
        score.consensusScore = _calculateConsensusScore(data.price, median);
        
        // 4. Specialization Score (0-25)
        score.specializationScore = specializationBonus[useCase][oracleType];
        
        // Total
        score.totalScore = score.freshnessScore + 
                          score.reliabilityScore + 
                          score.consensusScore + 
                          score.specializationScore;
    }
    
    function _calculateFreshnessScore(uint256 timestamp) internal view returns (uint256) {
        if (timestamp == 0) return 0;
        
        uint256 age = block.timestamp - timestamp;
        
        if (age <= FRESH_THRESHOLD) {
            return COMPONENT_MAX; // Max freshness
        } else if (age >= STALE_THRESHOLD) {
            return 0; // Min freshness
        } else {
            // Linear interpolation
            return COMPONENT_MAX * (STALE_THRESHOLD - age) / (STALE_THRESHOLD - FRESH_THRESHOLD);
        }
    }
    
    function _calculateReliabilityScore(OracleType oracleType) internal view returns (uint256) {
        uint256 reliability = reliabilityScores[oracleType];
        // Scale from 0-100 to 0-25
        return (reliability * COMPONENT_MAX) / 100;
    }
    
    function _calculateConsensusScore(uint256 price, uint256 median) internal pure returns (uint256) {
        if (median == 0 || price == 0) return 0;
        
        uint256 diff = price > median ? price - median : median - price;
        uint256 deviationBps = (diff * 10000) / median;
        
        if (deviationBps <= CONSENSUS_TIGHT_BPS) {
            return COMPONENT_MAX; // Perfect consensus
        } else if (deviationBps >= CONSENSUS_LOOSE_BPS) {
            return 0; // No consensus
        } else {
            // Linear interpolation
            return COMPONENT_MAX * (CONSENSUS_LOOSE_BPS - deviationBps) / 
                   (CONSENSUS_LOOSE_BPS - CONSENSUS_TIGHT_BPS);
        }
    }
    
    // ============================================
    // AGGREGATION FUNCTIONS
    // ============================================
    
    function _calculateMedian(OracleData[5] memory data) internal pure returns (uint256) {
        // Collect valid prices
        uint256[] memory prices = new uint256[](5);
        uint256 count = 0;
        
        for (uint256 i = 0; i < 5; i++) {
            if (data[i].isAvailable && data[i].price > 0) {
                prices[count] = data[i].price;
                count++;
            }
        }
        
        if (count == 0) return 0;
        if (count == 1) return prices[0];
        
        // Sort (simple bubble sort for small array)
        for (uint256 i = 0; i < count - 1; i++) {
            for (uint256 j = i + 1; j < count; j++) {
                if (prices[j] < prices[i]) {
                    (prices[i], prices[j]) = (prices[j], prices[i]);
                }
            }
        }
        
        // Return median
        if (count % 2 == 1) {
            return prices[count / 2];
        } else {
            return (prices[count / 2 - 1] + prices[count / 2]) / 2;
        }
    }
    
    function _selectTopOracles(OracleData[5] memory data, uint256 topN) 
        internal 
        pure 
        returns (OracleType[] memory, uint256[] memory) 
    {
        // Create indexed scores array
        uint256[5] memory scores;
        uint256 availableCount = 0;
        
        for (uint256 i = 0; i < 5; i++) {
            if (data[i].isAvailable) {
                scores[i] = data[i].score;
                availableCount++;
            }
        }
        
        uint256 selectCount = topN < availableCount ? topN : availableCount;
        OracleType[] memory selected = new OracleType[](selectCount);
        uint256[] memory selectedScores = new uint256[](selectCount);
        
        // Select top N by score (greedy)
        for (uint256 s = 0; s < selectCount; s++) {
            uint256 maxScore = 0;
            uint256 maxIdx = 0;
            
            for (uint256 i = 0; i < 5; i++) {
                if (scores[i] > maxScore) {
                    maxScore = scores[i];
                    maxIdx = i;
                }
            }
            
            selected[s] = OracleType(maxIdx);
            selectedScores[s] = maxScore;
            scores[maxIdx] = 0; // Mark as used
        }
        
        return (selected, selectedScores);
    }
    
    function _calculateBFTPrice(
        OracleData[5] memory data,
        OracleType[] memory selected
    ) internal pure returns (uint256) {
        if (selected.length == 0) return 0;
        
        uint256[] memory prices = new uint256[](selected.length);
        for (uint256 i = 0; i < selected.length; i++) {
            prices[i] = data[uint256(selected[i])].price;
        }
        
        // Sort for median
        for (uint256 i = 0; i < prices.length - 1; i++) {
            for (uint256 j = i + 1; j < prices.length; j++) {
                if (prices[j] < prices[i]) {
                    (prices[i], prices[j]) = (prices[j], prices[i]);
                }
            }
        }
        
        // Return median
        if (prices.length % 2 == 1) {
            return prices[prices.length / 2];
        } else {
            return (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
        }
    }
    
    function _calculateConfidence(uint256[] memory scores, uint256 count) 
        internal 
        pure 
        returns (uint256) 
    {
        if (count == 0) return 0;
        
        uint256 totalScore = 0;
        for (uint256 i = 0; i < count; i++) {
            totalScore += scores[i];
        }
        
        // Average score as percentage of max possible
        uint256 avgScore = totalScore / count;
        return avgScore; // Already 0-100
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    function _normalizePrice(uint256 price, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 8) return price;
        if (decimals > 8) return price / (10 ** (decimals - 8));
        return price * (10 ** (8 - decimals));
    }
    
    function _convertPythPrice(IPythLike.Price memory pythPrice) internal pure returns (uint256) {
        int32 expo = pythPrice.expo;
        uint256 rawPrice = uint256(uint64(pythPrice.price));
        
        if (expo < 0) {
            uint256 divisor = 10 ** uint32(-expo);
            return (rawPrice * PRICE_PRECISION) / divisor;
        } else {
            return rawPrice * (10 ** uint32(expo)) * PRICE_PRECISION;
        }
    }
    
    function _recordSuccess(OracleType oracle) internal {
        queryCount[oracle]++;
        successCount[oracle]++;
        
        // Update reliability score (exponential moving average)
        uint256 newReliability = (successCount[oracle] * 100) / queryCount[oracle];
        uint256 oldReliability = reliabilityScores[oracle];
        
        // EMA with alpha = 0.1 (90% old, 10% new)
        reliabilityScores[oracle] = (oldReliability * 9 + newReliability) / 10;
    }
    
    function _recordFailure(OracleType oracle) internal {
        queryCount[oracle]++;
        
        // Update reliability score
        uint256 newReliability = (successCount[oracle] * 100) / queryCount[oracle];
        uint256 oldReliability = reliabilityScores[oracle];
        
        uint256 updatedReliability = (oldReliability * 9 + newReliability) / 10;
        
        emit OracleScoreUpdated(oracle, oldReliability, updatedReliability);
        reliabilityScores[oracle] = updatedReliability;
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get current reliability scores for all oracles
     */
    function getAllReliabilityScores() external view returns (
        uint256 chainlink,
        uint256 pyth,
        uint256 api3,
        uint256 dia,
        uint256 twap
    ) {
        chainlink = reliabilityScores[OracleType.CHAINLINK];
        pyth = reliabilityScores[OracleType.PYTH];
        api3 = reliabilityScores[OracleType.API3];
        dia = reliabilityScores[OracleType.DIA];
        twap = reliabilityScores[OracleType.UNISWAP_TWAP];
    }
    
    /**
     * @notice Get oracle statistics
     */
    function getOracleStats(OracleType oracle) external view returns (
        uint256 queries,
        uint256 successes,
        uint256 reliability,
        bool isConfigured
    ) {
        queries = queryCount[oracle];
        successes = successCount[oracle];
        reliability = reliabilityScores[oracle];
        
        if (oracle == OracleType.CHAINLINK) isConfigured = chainlinkAdapter != address(0);
        else if (oracle == OracleType.PYTH) isConfigured = pythAdapter != address(0);
        else if (oracle == OracleType.API3) isConfigured = api3Adapter != address(0);
        else if (oracle == OracleType.DIA) isConfigured = diaAdapter != address(0);
        else if (oracle == OracleType.UNISWAP_TWAP) isConfigured = twapAdapter != address(0);
    }
    
    /**
     * @notice Get last selection result
     */
    function getLastSelection() external view returns (SelectionResult memory) {
        return lastSelection;
    }
    
    /**
     * @notice Get specialization bonuses for a use case
     */
    function getSpecializationBonuses(UseCase useCase) external view returns (
        uint256 chainlink,
        uint256 pyth,
        uint256 api3,
        uint256 dia,
        uint256 twap
    ) {
        chainlink = specializationBonus[useCase][OracleType.CHAINLINK];
        pyth = specializationBonus[useCase][OracleType.PYTH];
        api3 = specializationBonus[useCase][OracleType.API3];
        dia = specializationBonus[useCase][OracleType.DIA];
        twap = specializationBonus[useCase][OracleType.UNISWAP_TWAP];
    }
    
    /**
     * @notice Check which adapters are configured
     */
    function getConfiguredAdapters() external view returns (
        bool hasChainlink,
        bool hasPyth,
        bool hasAPI3,
        bool hasDIA,
        bool hasTWAP
    ) {
        hasChainlink = chainlinkAdapter != address(0);
        hasPyth = pythAdapter != address(0);
        hasAPI3 = api3Adapter != address(0);
        hasDIA = diaAdapter != address(0);
        hasTWAP = twapAdapter != address(0);
    }
}
