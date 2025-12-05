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
 * ║               🛡️  AI-NATIVE ORACLE SECURITY LAYER V2  🛡️                 ║
 * ║                                                                           ║
 * ║  Standalone version that reads directly from Chainlink                    ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

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

contract GuardianOracleV2 {
    
    // ═══════════════════════════════════════════════════════════════════════
    //                           STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════
    
    AggregatorV3Interface public immutable chainlink;
    
    address public guardian;
    address public pendingGuardian;
    
    // TWAP State
    struct PriceObservation {
        int256 price;
        uint256 timestamp;
        uint256 blockNumber;
        uint8 confidenceScore;
    }
    
    PriceObservation[] public priceHistory;
    uint256 public constant MAX_HISTORY = 100;
    uint256 public constant TWAP_WINDOW = 30 minutes;
    
    // Anomaly Detection State
    struct AnomalyMetrics {
        uint256 lastUpdateBlock;
        int256 lastPrice;
        int256 priceVelocity;
        uint256 volatilityIndex;
        uint256 anomalyCount;
        uint256 lastAnomalyBlock;
    }
    
    AnomalyMetrics public metrics;
    
    // Circuit Breaker State
    bool public circuitBreakerTripped;
    uint256 public lastCircuitBreakerTrip;
    
    // Configuration
    struct SecurityConfig {
        uint256 maxPriceDeviationBps;
        uint256 maxSingleBlockChangeBps;
        uint256 volatilityThresholdBps;
        uint256 stalenessTolerance;
        uint256 circuitBreakerDuration;
        uint256 anomalyWindowBlocks;
        uint8 minConfidenceScore;
    }
    
    SecurityConfig public config;
    
    // ═══════════════════════════════════════════════════════════════════════
    //                              EVENTS
    // ═══════════════════════════════════════════════════════════════════════
    
    event PriceUpdated(int256 price, int256 twapPrice, uint8 confidence, uint256 timestamp);
    event AnomalyDetected(string anomalyType, int256 currentPrice, int256 expectedPrice, uint256 deviationBps);
    event CircuitBreakerTripped(string reason, int256 triggerPrice, uint256 duration);
    event CircuitBreakerReset(uint256 blockNumber);
    event FlashLoanAttackBlocked(int256 attemptedPrice, int256 previousPrice, uint256 changeBps);
    
    // ═══════════════════════════════════════════════════════════════════════
    //                            MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════
    
    modifier onlyGuardian() {
        require(msg.sender == guardian, "Only guardian");
        _;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                           CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════
    
    constructor(address _chainlink) {
        chainlink = AggregatorV3Interface(_chainlink);
        guardian = msg.sender;
        
        config = SecurityConfig({
            maxPriceDeviationBps: 500,
            maxSingleBlockChangeBps: 200,
            volatilityThresholdBps: 1000,
            stalenessTolerance: 1 hours,
            circuitBreakerDuration: 15 minutes,
            anomalyWindowBlocks: 50,
            minConfidenceScore: 60
        });
        
        // Initialize with current price
        (, int256 price, , uint256 updatedAt, ) = chainlink.latestRoundData();
        metrics.lastPrice = price;
        metrics.lastUpdateBlock = block.number;
        
        _recordObservation(price, updatedAt, 80);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CORE PRICE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    function getSecuredPrice() external view returns (
        int256 price,
        uint8 confidence,
        int256 twap,
        bool isSecure
    ) {
        if (circuitBreakerTripped && block.timestamp < lastCircuitBreakerTrip + config.circuitBreakerDuration) {
            revert("Circuit breaker active");
        }
        
        (, int256 currentPrice, , uint256 updatedAt, ) = chainlink.latestRoundData();
        
        twap = _calculateTWAP();
        confidence = _calculateConfidenceScore(currentPrice, updatedAt);
        isSecure = _validatePrice(currentPrice, twap, updatedAt);
        price = currentPrice;
    }
    
    function updateAndGetPrice() external returns (int256 price, uint8 confidence, bool anomalyDetected) {
        // Auto-reset circuit breaker if cooldown passed
        if (circuitBreakerTripped && block.timestamp >= lastCircuitBreakerTrip + config.circuitBreakerDuration) {
            circuitBreakerTripped = false;
            emit CircuitBreakerReset(block.number);
        }
        
        require(!circuitBreakerTripped, "Circuit breaker active");
        
        (, int256 currentPrice, , uint256 updatedAt, ) = chainlink.latestRoundData();
        
        anomalyDetected = _detectAnomalies(currentPrice, updatedAt);
        confidence = _calculateConfidenceScore(currentPrice, updatedAt);
        
        _recordObservation(currentPrice, updatedAt, confidence);
        _updateMetrics(currentPrice);
        
        price = currentPrice;
        
        emit PriceUpdated(price, _calculateTWAP(), confidence, updatedAt);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      TWAP CALCULATION
    // ═══════════════════════════════════════════════════════════════════════
    
    function _calculateTWAP() internal view returns (int256) {
        if (priceHistory.length == 0) {
            (, int256 currentPrice, , , ) = chainlink.latestRoundData();
            return currentPrice;
        }
        
        uint256 cutoffTime = block.timestamp > TWAP_WINDOW ? block.timestamp - TWAP_WINDOW : 0;
        
        int256 weightedSum = 0;
        uint256 totalWeight = 0;
        
        for (uint256 i = priceHistory.length; i > 0; i--) {
            PriceObservation memory obs = priceHistory[i - 1];
            if (obs.timestamp < cutoffTime) break;
            
            uint256 age = block.timestamp - obs.timestamp;
            uint256 weight = TWAP_WINDOW > age ? TWAP_WINDOW - age : 1;
            weight = (weight * obs.confidenceScore) / 100;
            
            weightedSum += obs.price * int256(weight);
            totalWeight += weight;
        }
        
        if (totalWeight == 0) {
            (, int256 currentPrice, , , ) = chainlink.latestRoundData();
            return currentPrice;
        }
        
        return weightedSum / int256(totalWeight);
    }
    
    function getTWAP() external view returns (int256 twap, uint256 observationCount) {
        twap = _calculateTWAP();
        observationCount = priceHistory.length;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      ANOMALY DETECTION
    // ═══════════════════════════════════════════════════════════════════════
    
    function _detectAnomalies(int256 currentPrice, uint256 timestamp) internal returns (bool) {
        bool anomalyFound = false;
        
        // Flash loan detection
        if (metrics.lastPrice != 0 && block.number == metrics.lastUpdateBlock) {
            uint256 changeBps = _calculateDeviationBps(currentPrice, metrics.lastPrice);
            if (changeBps > config.maxSingleBlockChangeBps) {
                emit FlashLoanAttackBlocked(currentPrice, metrics.lastPrice, changeBps);
                _tripCircuitBreaker("Flash loan attack detected");
                return true;
            }
        }
        
        // TWAP deviation check
        int256 twap = _calculateTWAP();
        if (twap != 0) {
            uint256 deviationBps = _calculateDeviationBps(currentPrice, twap);
            if (deviationBps > config.maxPriceDeviationBps) {
                emit AnomalyDetected("TWAP_DEVIATION", currentPrice, twap, deviationBps);
                anomalyFound = true;
                metrics.anomalyCount++;
            }
        }
        
        // Staleness check
        if (block.timestamp - timestamp > config.stalenessTolerance) {
            emit AnomalyDetected("STALE_DATA", currentPrice, 0, block.timestamp - timestamp);
            anomalyFound = true;
        }
        
        // Extreme volatility
        if (metrics.volatilityIndex > config.volatilityThresholdBps) {
            emit AnomalyDetected("EXTREME_VOLATILITY", currentPrice, metrics.lastPrice, metrics.volatilityIndex);
            _tripCircuitBreaker("Extreme volatility detected");
            return true;
        }
        
        if (anomalyFound) {
            metrics.lastAnomalyBlock = block.number;
            if (metrics.anomalyCount >= 3 && block.number - metrics.lastAnomalyBlock < config.anomalyWindowBlocks) {
                _tripCircuitBreaker("Multiple anomalies detected");
            }
        }
        
        return anomalyFound;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CONFIDENCE SCORING
    // ═══════════════════════════════════════════════════════════════════════
    
    function _calculateConfidenceScore(int256, uint256 timestamp) internal view returns (uint8) {
        uint8 totalScore = 0;
        
        // Freshness (40%)
        uint256 age = block.timestamp - timestamp;
        if (age < 1 minutes) totalScore += 40;
        else if (age < 5 minutes) totalScore += 35;
        else if (age < 15 minutes) totalScore += 28;
        else if (age < 30 minutes) totalScore += 20;
        else if (age < 1 hours) totalScore += 10;
        
        // Oracle availability (30%) - Chainlink always available
        totalScore += 30;
        
        // Volatility (30%)
        if (metrics.volatilityIndex < 100) totalScore += 30;
        else if (metrics.volatilityIndex < 300) totalScore += 24;
        else if (metrics.volatilityIndex < 500) totalScore += 18;
        else if (metrics.volatilityIndex < 1000) totalScore += 10;
        
        return totalScore;
    }
    
    function getConfidenceBreakdown() external view returns (
        uint8 freshnessScore,
        uint8 oracleScore,
        uint8 volatilityScore,
        uint8 totalScore
    ) {
        (, , , uint256 timestamp, ) = chainlink.latestRoundData();
        
        uint256 age = block.timestamp - timestamp;
        if (age < 1 minutes) freshnessScore = 40;
        else if (age < 5 minutes) freshnessScore = 35;
        else if (age < 15 minutes) freshnessScore = 28;
        else if (age < 30 minutes) freshnessScore = 20;
        else if (age < 1 hours) freshnessScore = 10;
        
        oracleScore = 30;
        
        if (metrics.volatilityIndex < 100) volatilityScore = 30;
        else if (metrics.volatilityIndex < 300) volatilityScore = 24;
        else if (metrics.volatilityIndex < 500) volatilityScore = 18;
        else if (metrics.volatilityIndex < 1000) volatilityScore = 10;
        
        totalScore = freshnessScore + oracleScore + volatilityScore;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      CIRCUIT BREAKER
    // ═══════════════════════════════════════════════════════════════════════
    
    function _tripCircuitBreaker(string memory reason) internal {
        if (!circuitBreakerTripped) {
            circuitBreakerTripped = true;
            lastCircuitBreakerTrip = block.timestamp;
            (, int256 price, , , ) = chainlink.latestRoundData();
            emit CircuitBreakerTripped(reason, price, config.circuitBreakerDuration);
        }
    }
    
    function emergencyPause(string calldata reason) external onlyGuardian {
        _tripCircuitBreaker(reason);
    }
    
    function forceResetCircuitBreaker() external onlyGuardian {
        circuitBreakerTripped = false;
        metrics.anomalyCount = 0;
        emit CircuitBreakerReset(block.number);
    }
    
    function getCircuitBreakerStatus() external view returns (bool isTripped, uint256 timeRemaining, uint256 tripTimestamp) {
        isTripped = circuitBreakerTripped;
        tripTimestamp = lastCircuitBreakerTrip;
        if (isTripped) {
            uint256 resetTime = lastCircuitBreakerTrip + config.circuitBreakerDuration;
            timeRemaining = block.timestamp < resetTime ? resetTime - block.timestamp : 0;
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
    
    function _validatePrice(int256 price, int256 twap, uint256 timestamp) internal view returns (bool) {
        if (block.timestamp - timestamp > config.stalenessTolerance) return false;
        if (twap != 0 && _calculateDeviationBps(price, twap) > config.maxPriceDeviationBps) return false;
        return true;
    }
    
    function _recordObservation(int256 price, uint256 timestamp, uint8 confidence) internal {
        PriceObservation memory obs = PriceObservation({
            price: price,
            timestamp: timestamp,
            blockNumber: block.number,
            confidenceScore: confidence
        });
        
        if (priceHistory.length >= MAX_HISTORY) {
            for (uint256 i = 0; i < priceHistory.length - 1; i++) {
                priceHistory[i] = priceHistory[i + 1];
            }
            priceHistory.pop();
        }
        priceHistory.push(obs);
    }
    
    function _updateMetrics(int256 currentPrice) internal {
        if (metrics.lastPrice != 0) {
            uint256 blockDiff = block.number - metrics.lastUpdateBlock;
            if (blockDiff > 0) {
                metrics.priceVelocity = (currentPrice - metrics.lastPrice) / int256(blockDiff);
            }
            uint256 change = _calculateDeviationBps(currentPrice, metrics.lastPrice);
            metrics.volatilityIndex = (metrics.volatilityIndex * 9 + change) / 10;
        }
        metrics.lastPrice = currentPrice;
        metrics.lastUpdateBlock = block.number;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    //                      VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    function getMetrics() external view returns (AnomalyMetrics memory) {
        return metrics;
    }
    
    function getSecurityConfig() external view returns (SecurityConfig memory) {
        return config;
    }
    
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }
    
    function getSecurityStatus() external view returns (
        bool systemHealthy,
        bool circuitBreakerActive,
        uint8 confidenceScore,
        uint256 volatilityIndex,
        int256 currentPrice,
        int256 twapPrice
    ) {
        (, int256 price, , uint256 timestamp, ) = chainlink.latestRoundData();
        
        systemHealthy = !circuitBreakerTripped && (block.timestamp - timestamp <= config.stalenessTolerance);
        circuitBreakerActive = circuitBreakerTripped;
        confidenceScore = _calculateConfidenceScore(price, timestamp);
        volatilityIndex = metrics.volatilityIndex;
        currentPrice = price;
        twapPrice = _calculateTWAP();
    }
    
    function updateSecurityConfig(SecurityConfig calldata newConfig) external onlyGuardian {
        config = newConfig;
    }
}
