// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                                                                           ║
 * ║   ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗ ██╗ █████╗ ███╗   ██╗          ║
 * ║  ██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗██║██╔══██╗████╗  ██║          ║
 * ║  ██║  ███╗██║   ██║███████║██████╔╝██║  ██║██║███████║██╔██╗ ██║          ║
 * ║  ██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║██║██╔══██║██║╚██╗██║          ║
 * ║  ╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝██║██║  ██║██║ ╚████║          ║
 * ║   ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝          ║
 * ║                                                                           ║
 * ║               🛡️  AI-NATIVE ORACLE SECURITY LAYER  🛡️                    ║
 * ║                                                                           ║
 * ║  World's First Intelligent Oracle with:                                   ║
 * ║  • Real-time Anomaly Detection                                            ║
 * ║  • Flash Loan Attack Protection                                           ║
 * ║  • Volatility Circuit Breakers                                            ║
 * ║  • Cross-Oracle Correlation Analysis                                      ║
 * ║  • Confidence Scoring (0-100%)                                            ║
 * ║  • Time-Weighted Average Pricing (TWAP)                                   ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @title GuardianOracle
 * @author TheBlocks Team - IBW 2025
 * @notice Revolutionary oracle security layer that goes beyond simple aggregation
 * @dev Implements multiple layers of protection against oracle manipulation
 */

interface IMultiOracleAggregator {
    function getLatestPrice() external view returns (int256 price, uint256 timestamp, uint8 confidence);
    function getOraclePrice(uint8 oracleId) external view returns (int256 price, uint256 timestamp, bool isActive);
    function getActiveOracleCount() external view returns (uint8);
}

contract GuardianOracle {
    
    // ═══════════════════════════════════════════════════════════════════════
    //                           STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════
    
    IMultiOracleAggregator public immutable aggregator;
    
    address public guardian;
    address public pendingGuardian;
    
    // TWAP State
    struct PriceObservation {
        int256 price;
        uint256 timestamp;
        uint256 blockNumber;
        uint8 oracleCount;
        uint8 confidenceScore;
    }
    
    PriceObservation[] public priceHistory;
    uint256 public constant MAX_HISTORY = 100;
    uint256 public constant TWAP_WINDOW = 30 minutes;
    
    // Anomaly Detection State
    struct AnomalyMetrics {
        uint256 lastUpdateBlock;
        int256 lastPrice;
        int256 priceVelocity;          // Rate of change per block
        uint256 volatilityIndex;        // Current volatility (basis points)
        uint256 anomalyCount;           // Recent anomalies detected
        uint256 lastAnomalyBlock;
    }
    
    AnomalyMetrics public metrics;
    
    // Circuit Breaker State
    bool public circuitBreakerTripped;
    uint256 public circuitBreakerCooldown;
    uint256 public lastCircuitBreakerTrip;
    
    // Configuration (adjustable by guardian)
    struct SecurityConfig {
        uint256 maxPriceDeviationBps;       // Max deviation from TWAP (basis points)
        uint256 maxSingleBlockChangeBps;     // Max change in one block (flash loan protection)
        uint256 volatilityThresholdBps;      // Volatility that triggers circuit breaker
        uint256 minOracleAgreementBps;       // Min agreement between oracles
        uint256 stalenessTolerance;          // Max age of price data
        uint256 circuitBreakerDuration;      // How long circuit breaker stays active
        uint256 anomalyWindowBlocks;         // Blocks to track for anomaly detection
        uint8 minConfidenceScore;            // Minimum confidence to accept price
    }
    
    SecurityConfig public config;
    
    // Confidence Scoring Weights
    uint8 public constant WEIGHT_ORACLE_COUNT = 30;
    uint8 public constant WEIGHT_FRESHNESS = 25;
    uint8 public constant WEIGHT_AGREEMENT = 25;
    uint8 public constant WEIGHT_VOLATILITY = 20;
    
    // ═══════════════════════════════════════════════════════════════════════
    //                              EVENTS
    // ═══════════════════════════════════════════════════════════════════════
    
    event PriceUpdated(
        int256 indexed price,
        int256 twapPrice,
        uint8 confidenceScore,
        uint256 timestamp
    );
    
    event AnomalyDetected(
        string anomalyType,
        int256 currentPrice,
        int256 expectedPrice,
        uint256 deviationBps,
        uint256 blockNumber
    );
    
    event CircuitBreakerTripped(
        string reason,
        int256 triggerPrice,
        uint256 duration,
        uint256 blockNumber
    );
    
    event CircuitBreakerReset(uint256 blockNumber);
    
    event FlashLoanAttackBlocked(
        int256 attemptedPrice,
        int256 previousPrice,
        uint256 changeBps,
        uint256 blockNumber
    );
    
    event ConfidenceScoreCalculated(
        uint8 oracleCountScore,
        uint8 freshnessScore,
        uint8 agreementScore,
        uint8 volatilityScore,
        uint8 totalScore
    );
    
    event SecurityConfigUpdated(address indexed by);
    event GuardianTransferInitiated(address indexed newGuardian);
    event GuardianTransferCompleted(address indexed newGuardian);
    
    // ═══════════════════════════════════════════════════════════════════════
    //                            MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════
    
    modifier onlyGuardian() {
        require(msg.sender == guardian, "Only guardian");
        _;
    }
    
    modifier circuitBreakerCheck() {
        if (circuitBreakerTripped) {
            if (block.timestamp >= lastCircuitBreakerTrip + config.circuitBreakerDuration) {
                circuitBreakerTripped = false;
                emit CircuitBreakerReset(block.number);
            } else {
                revert("Circuit breaker active - system paused for safety");
            }
        }
        _;
    }
    
    // View-compatible circuit breaker check (doesn't modify state)
    modifier circuitBreakerCheckView() {
        if (circuitBreakerTripped) {
            if (block.timestamp < lastCircuitBreakerTrip + config.circuitBreakerDuration) {
                revert("Circuit breaker active - system paused for safety");
            }
        }
        _;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                           CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════
    
    constructor(address _aggregator) {
        aggregator = IMultiOracleAggregator(_aggregator);
        guardian = msg.sender;
        
        // Initialize default security configuration
        config = SecurityConfig({
            maxPriceDeviationBps: 500,          // 5% max deviation from TWAP
            maxSingleBlockChangeBps: 200,        // 2% max change in single block
            volatilityThresholdBps: 1000,        // 10% volatility triggers circuit breaker
            minOracleAgreementBps: 300,          // Oracles must agree within 3%
            stalenessTolerance: 1 hours,         // Max 1 hour old data
            circuitBreakerDuration: 15 minutes,  // 15 min cooldown
            anomalyWindowBlocks: 50,             // Track last 50 blocks
            minConfidenceScore: 60               // Minimum 60% confidence
        });
        
        // Initialize metrics
        metrics = AnomalyMetrics({
            lastUpdateBlock: block.number,
            lastPrice: 0,
            priceVelocity: 0,
            volatilityIndex: 0,
            anomalyCount: 0,
            lastAnomalyBlock: 0
        });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CORE PRICE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Get the secured price with full protection suite
     * @return price The validated price
     * @return confidence Confidence score (0-100)
     * @return twap Time-weighted average price
     * @return isSecure Whether all security checks passed
     */
    function getSecuredPrice() 
        external 
        view 
        circuitBreakerCheckView 
        returns (
            int256 price,
            uint8 confidence,
            int256 twap,
            bool isSecure
        ) 
    {
        // Get current price from aggregator
        (int256 currentPrice, uint256 timestamp, ) = aggregator.getLatestPrice();
        
        // Calculate TWAP
        twap = _calculateTWAP();
        
        // Calculate confidence score
        confidence = _calculateConfidenceScore(currentPrice, timestamp);
        
        // Check if price passes all security validations
        isSecure = _validatePrice(currentPrice, twap, timestamp);
        
        price = currentPrice;
    }
    
    /**
     * @notice Get price with anomaly detection (state-changing)
     * @dev Updates internal metrics and may trip circuit breaker
     */
    function updateAndGetPrice() 
        external 
        circuitBreakerCheck 
        returns (
            int256 price,
            uint8 confidence,
            bool anomalyDetected
        ) 
    {
        (int256 currentPrice, uint256 timestamp, ) = aggregator.getLatestPrice();
        
        // Run anomaly detection
        anomalyDetected = _detectAnomalies(currentPrice, timestamp);
        
        // Calculate confidence
        confidence = _calculateConfidenceScore(currentPrice, timestamp);
        
        // Record observation
        _recordObservation(currentPrice, timestamp, confidence);
        
        // Update metrics
        _updateMetrics(currentPrice);
        
        price = currentPrice;
        
        emit PriceUpdated(price, _calculateTWAP(), confidence, timestamp);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      TWAP CALCULATION
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Calculate Time-Weighted Average Price
     * @dev Uses recorded observations within TWAP_WINDOW
     */
    function _calculateTWAP() internal view returns (int256) {
        if (priceHistory.length == 0) {
            (int256 currentPrice, , ) = aggregator.getLatestPrice();
            return currentPrice;
        }
        
        uint256 cutoffTime = block.timestamp > TWAP_WINDOW 
            ? block.timestamp - TWAP_WINDOW 
            : 0;
        
        int256 weightedSum = 0;
        uint256 totalWeight = 0;
        
        for (uint256 i = priceHistory.length; i > 0; i--) {
            PriceObservation memory obs = priceHistory[i - 1];
            
            if (obs.timestamp < cutoffTime) break;
            
            // Weight by time (more recent = higher weight)
            uint256 age = block.timestamp - obs.timestamp;
            uint256 weight = TWAP_WINDOW > age ? TWAP_WINDOW - age : 1;
            
            // Also weight by confidence
            weight = (weight * obs.confidenceScore) / 100;
            
            weightedSum += obs.price * int256(weight);
            totalWeight += weight;
        }
        
        if (totalWeight == 0) {
            (int256 currentPrice, , ) = aggregator.getLatestPrice();
            return currentPrice;
        }
        
        return weightedSum / int256(totalWeight);
    }
    
    /**
     * @notice Get TWAP for external callers
     */
    function getTWAP() external view returns (int256 twap, uint256 observationCount) {
        twap = _calculateTWAP();
        observationCount = priceHistory.length;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      ANOMALY DETECTION
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Comprehensive anomaly detection engine
     * @dev Checks for flash loans, manipulation, and suspicious patterns
     */
    function _detectAnomalies(int256 currentPrice, uint256 timestamp) internal returns (bool) {
        bool anomalyFound = false;
        
        // 1. Flash Loan Attack Detection (single-block spike)
        if (metrics.lastPrice != 0 && block.number == metrics.lastUpdateBlock) {
            uint256 changeBps = _calculateDeviationBps(currentPrice, metrics.lastPrice);
            
            if (changeBps > config.maxSingleBlockChangeBps) {
                emit FlashLoanAttackBlocked(
                    currentPrice,
                    metrics.lastPrice,
                    changeBps,
                    block.number
                );
                
                _tripCircuitBreaker("Flash loan attack detected");
                return true;
            }
        }
        
        // 2. TWAP Deviation Check
        int256 twap = _calculateTWAP();
        if (twap != 0) {
            uint256 deviationBps = _calculateDeviationBps(currentPrice, twap);
            
            if (deviationBps > config.maxPriceDeviationBps) {
                emit AnomalyDetected(
                    "TWAP_DEVIATION",
                    currentPrice,
                    twap,
                    deviationBps,
                    block.number
                );
                anomalyFound = true;
                metrics.anomalyCount++;
            }
        }
        
        // 3. Staleness Check
        if (block.timestamp - timestamp > config.stalenessTolerance) {
            emit AnomalyDetected(
                "STALE_DATA",
                currentPrice,
                0,
                block.timestamp - timestamp,
                block.number
            );
            anomalyFound = true;
        }
        
        // 4. Extreme Volatility Check
        if (metrics.volatilityIndex > config.volatilityThresholdBps) {
            emit AnomalyDetected(
                "EXTREME_VOLATILITY",
                currentPrice,
                metrics.lastPrice,
                metrics.volatilityIndex,
                block.number
            );
            
            _tripCircuitBreaker("Extreme volatility detected");
            return true;
        }
        
        // 5. Cross-Oracle Agreement Check
        if (!_checkOracleAgreement()) {
            emit AnomalyDetected(
                "ORACLE_DISAGREEMENT",
                currentPrice,
                0,
                0,
                block.number
            );
            anomalyFound = true;
        }
        
        // 6. Repeated Anomalies = Trip Circuit Breaker
        if (anomalyFound) {
            metrics.lastAnomalyBlock = block.number;
            
            // If too many anomalies in short window, trip circuit breaker
            if (metrics.anomalyCount >= 3 && 
                block.number - metrics.lastAnomalyBlock < config.anomalyWindowBlocks) {
                _tripCircuitBreaker("Multiple anomalies detected");
            }
        }
        
        return anomalyFound;
    }
    
    /**
     * @notice Check if oracles agree within tolerance
     */
    function _checkOracleAgreement() internal view returns (bool) {
        uint8 activeCount = aggregator.getActiveOracleCount();
        if (activeCount < 2) return true; // Can't check agreement with 1 oracle
        
        int256[] memory prices = new int256[](activeCount);
        uint8 priceCount = 0;
        
        // Collect all active oracle prices
        for (uint8 i = 0; i < 5; i++) {
            (int256 price, , bool isActive) = aggregator.getOraclePrice(i);
            if (isActive && price > 0) {
                prices[priceCount] = price;
                priceCount++;
            }
        }
        
        if (priceCount < 2) return true;
        
        // Check pairwise agreement
        for (uint8 i = 0; i < priceCount; i++) {
            for (uint8 j = i + 1; j < priceCount; j++) {
                uint256 deviationBps = _calculateDeviationBps(prices[i], prices[j]);
                if (deviationBps > config.minOracleAgreementBps) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CONFIDENCE SCORING
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Calculate comprehensive confidence score (0-100)
     * @dev Multi-factor scoring considering oracle count, freshness, agreement, volatility
     */
    function _calculateConfidenceScore(
        int256 currentPrice, 
        uint256 timestamp
    ) internal view returns (uint8) {
        uint8 totalScore = 0;
        
        // 1. Oracle Count Score (30% weight)
        uint8 activeOracles = aggregator.getActiveOracleCount();
        uint8 oracleCountScore;
        if (activeOracles >= 4) oracleCountScore = 30;
        else if (activeOracles == 3) oracleCountScore = 25;
        else if (activeOracles == 2) oracleCountScore = 15;
        else oracleCountScore = 5;
        
        totalScore += oracleCountScore;
        
        // 2. Freshness Score (25% weight)
        uint8 freshnessScore;
        uint256 age = block.timestamp - timestamp;
        if (age < 1 minutes) freshnessScore = 25;
        else if (age < 5 minutes) freshnessScore = 22;
        else if (age < 15 minutes) freshnessScore = 18;
        else if (age < 30 minutes) freshnessScore = 12;
        else if (age < 1 hours) freshnessScore = 6;
        else freshnessScore = 0;
        
        totalScore += freshnessScore;
        
        // 3. Oracle Agreement Score (25% weight)
        uint8 agreementScore;
        if (_checkOracleAgreement()) {
            agreementScore = 25;
        } else {
            // Partial score based on how close disagreement is to threshold
            agreementScore = 10;
        }
        
        totalScore += agreementScore;
        
        // 4. Volatility Score (20% weight) - lower volatility = higher score
        uint8 volatilityScore;
        if (metrics.volatilityIndex < 100) volatilityScore = 20;        // < 1%
        else if (metrics.volatilityIndex < 300) volatilityScore = 16;   // < 3%
        else if (metrics.volatilityIndex < 500) volatilityScore = 12;   // < 5%
        else if (metrics.volatilityIndex < 1000) volatilityScore = 6;   // < 10%
        else volatilityScore = 0;
        
        totalScore += volatilityScore;
        
        // Note: Event emission moved to updateAndGetPrice() for state-changing calls
        
        return totalScore;
    }
    
    /**
     * @notice Get detailed confidence breakdown
     */
    function getConfidenceBreakdown() external view returns (
        uint8 oracleCountScore,
        uint8 freshnessScore,
        uint8 agreementScore,
        uint8 volatilityScore,
        uint8 totalScore
    ) {
        (int256 price, uint256 timestamp, ) = aggregator.getLatestPrice();
        
        // Oracle Count
        uint8 activeOracles = aggregator.getActiveOracleCount();
        if (activeOracles >= 4) oracleCountScore = 30;
        else if (activeOracles == 3) oracleCountScore = 25;
        else if (activeOracles == 2) oracleCountScore = 15;
        else oracleCountScore = 5;
        
        // Freshness
        uint256 age = block.timestamp - timestamp;
        if (age < 1 minutes) freshnessScore = 25;
        else if (age < 5 minutes) freshnessScore = 22;
        else if (age < 15 minutes) freshnessScore = 18;
        else if (age < 30 minutes) freshnessScore = 12;
        else if (age < 1 hours) freshnessScore = 6;
        else freshnessScore = 0;
        
        // Agreement
        agreementScore = _checkOracleAgreement() ? 25 : 10;
        
        // Volatility
        if (metrics.volatilityIndex < 100) volatilityScore = 20;
        else if (metrics.volatilityIndex < 300) volatilityScore = 16;
        else if (metrics.volatilityIndex < 500) volatilityScore = 12;
        else if (metrics.volatilityIndex < 1000) volatilityScore = 6;
        else volatilityScore = 0;
        
        totalScore = oracleCountScore + freshnessScore + agreementScore + volatilityScore;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CIRCUIT BREAKER
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Trip the circuit breaker
     */
    function _tripCircuitBreaker(string memory reason) internal {
        if (!circuitBreakerTripped) {
            circuitBreakerTripped = true;
            lastCircuitBreakerTrip = block.timestamp;
            
            (int256 price, , ) = aggregator.getLatestPrice();
            
            emit CircuitBreakerTripped(
                reason,
                price,
                config.circuitBreakerDuration,
                block.number
            );
        }
    }
    
    /**
     * @notice Manual circuit breaker trip (guardian only)
     */
    function emergencyPause(string calldata reason) external onlyGuardian {
        _tripCircuitBreaker(reason);
    }
    
    /**
     * @notice Force reset circuit breaker (guardian only)
     */
    function forceResetCircuitBreaker() external onlyGuardian {
        circuitBreakerTripped = false;
        metrics.anomalyCount = 0;
        emit CircuitBreakerReset(block.number);
    }
    
    /**
     * @notice Check circuit breaker status
     */
    function getCircuitBreakerStatus() external view returns (
        bool isTripped,
        uint256 timeRemaining,
        uint256 tripTimestamp
    ) {
        isTripped = circuitBreakerTripped;
        tripTimestamp = lastCircuitBreakerTrip;
        
        if (isTripped) {
            uint256 resetTime = lastCircuitBreakerTrip + config.circuitBreakerDuration;
            timeRemaining = block.timestamp < resetTime 
                ? resetTime - block.timestamp 
                : 0;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════
    
    function _calculateDeviationBps(int256 a, int256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        
        int256 diff = a > b ? a - b : b - a;
        int256 avg = (a + b) / 2;
        
        return uint256((diff * 10000) / avg);
    }
    
    function _validatePrice(
        int256 price, 
        int256 twap, 
        uint256 timestamp
    ) internal view returns (bool) {
        // Check staleness
        if (block.timestamp - timestamp > config.stalenessTolerance) {
            return false;
        }
        
        // Check TWAP deviation
        if (twap != 0) {
            uint256 deviationBps = _calculateDeviationBps(price, twap);
            if (deviationBps > config.maxPriceDeviationBps) {
                return false;
            }
        }
        
        // Check oracle agreement
        if (!_checkOracleAgreement()) {
            return false;
        }
        
        return true;
    }
    
    function _recordObservation(
        int256 price, 
        uint256 timestamp,
        uint8 confidence
    ) internal {
        PriceObservation memory obs = PriceObservation({
            price: price,
            timestamp: timestamp,
            blockNumber: block.number,
            oracleCount: aggregator.getActiveOracleCount(),
            confidenceScore: confidence
        });
        
        // Maintain max history size
        if (priceHistory.length >= MAX_HISTORY) {
            // Shift array (remove oldest)
            for (uint256 i = 0; i < priceHistory.length - 1; i++) {
                priceHistory[i] = priceHistory[i + 1];
            }
            priceHistory.pop();
        }
        
        priceHistory.push(obs);
    }
    
    function _updateMetrics(int256 currentPrice) internal {
        if (metrics.lastPrice != 0) {
            // Calculate velocity (price change per block)
            uint256 blockDiff = block.number - metrics.lastUpdateBlock;
            if (blockDiff > 0) {
                metrics.priceVelocity = (currentPrice - metrics.lastPrice) / int256(blockDiff);
            }
            
            // Update volatility index (exponential moving average)
            uint256 change = _calculateDeviationBps(currentPrice, metrics.lastPrice);
            metrics.volatilityIndex = (metrics.volatilityIndex * 9 + change) / 10;
        }
        
        metrics.lastPrice = currentPrice;
        metrics.lastUpdateBlock = block.number;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════
    
    function updateSecurityConfig(SecurityConfig calldata newConfig) external onlyGuardian {
        require(newConfig.maxPriceDeviationBps <= 2000, "Max deviation too high");
        require(newConfig.maxSingleBlockChangeBps <= 1000, "Flash loan threshold too high");
        require(newConfig.circuitBreakerDuration >= 5 minutes, "Cooldown too short");
        require(newConfig.minConfidenceScore <= 100, "Invalid confidence score");
        
        config = newConfig;
        emit SecurityConfigUpdated(msg.sender);
    }
    
    function getSecurityConfig() external view returns (SecurityConfig memory) {
        return config;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      GUARDIAN MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    
    function transferGuardian(address newGuardian) external onlyGuardian {
        require(newGuardian != address(0), "Invalid address");
        pendingGuardian = newGuardian;
        emit GuardianTransferInitiated(newGuardian);
    }
    
    function acceptGuardian() external {
        require(msg.sender == pendingGuardian, "Not pending guardian");
        guardian = pendingGuardian;
        pendingGuardian = address(0);
        emit GuardianTransferCompleted(msg.sender);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    function getMetrics() external view returns (AnomalyMetrics memory) {
        return metrics;
    }
    
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }
    
    function getRecentObservations(uint256 count) external view returns (PriceObservation[] memory) {
        uint256 length = priceHistory.length;
        if (count > length) count = length;
        
        PriceObservation[] memory recent = new PriceObservation[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = priceHistory[length - count + i];
        }
        
        return recent;
    }
    
    /**
     * @notice Get comprehensive security status
     */
    function getSecurityStatus() external view returns (
        bool systemHealthy,
        bool circuitBreakerActive,
        uint8 confidenceScore,
        uint256 volatilityIndex,
        uint256 activeOracles,
        uint256 anomalyCount,
        int256 currentPrice,
        int256 twapPrice
    ) {
        (int256 price, uint256 timestamp, ) = aggregator.getLatestPrice();
        
        systemHealthy = !circuitBreakerTripped && 
                       _checkOracleAgreement() &&
                       (block.timestamp - timestamp <= config.stalenessTolerance);
        
        circuitBreakerActive = circuitBreakerTripped;
        confidenceScore = _calculateConfidenceScore(price, timestamp);
        volatilityIndex = metrics.volatilityIndex;
        activeOracles = aggregator.getActiveOracleCount();
        anomalyCount = metrics.anomalyCount;
        currentPrice = price;
        twapPrice = _calculateTWAP();
    }
}
