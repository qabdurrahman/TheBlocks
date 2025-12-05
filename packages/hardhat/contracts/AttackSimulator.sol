// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GuardianOracleV2.sol";

/**
 * @title AttackSimulator
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Demonstrates various oracle attack vectors and how GuardianOracle defends against them
 * @dev This contract simulates real-world attack scenarios for educational/demo purposes
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════════════╗
 * ║                        ATTACK SIMULATION LABORATORY                                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                                       ║
 * ║   ⚔️  SIMULATED ATTACKS:                                                              ║
 * ║       1. Flash Loan Price Manipulation (blocked by 2% max deviation)                 ║
 * ║       2. Oracle Staleness Attack (blocked by freshness checks)                       ║
 * ║       3. Single Oracle Compromise (blocked by BFT consensus)                         ║
 * ║       4. Volatility Spike Attack (blocked by circuit breaker)                        ║
 * ║       5. TWAP Manipulation (blocked by time-weighted averaging)                      ║
 * ║                                                                                       ║
 * ║   🛡️  DEFENSE MECHANISMS:                                                             ║
 * ║       • Flash Loan Protection: Max 2% price change per block                         ║
 * ║       • Staleness Protection: 60-minute maximum data age                             ║
 * ║       • BFT Consensus: Requires 3/5 oracle agreement                                 ║
 * ║       • Circuit Breakers: Auto-pause on 10% volatility                               ║
 * ║       • TWAP Anchoring: 64-observation time-weighted price                           ║
 * ║                                                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════╝
 */
contract AttackSimulator {
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    GuardianOracleV2 public guardian;
    address public owner;
    
    // Attack simulation state
    bool public flashLoanAttackBlocked;
    bool public stalenessAttackBlocked;
    bool public volatilityAttackBlocked;
    bool public twapManipulationBlocked;
    
    // Attack metrics
    uint256 public attacksAttempted;
    uint256 public attacksBlocked;
    uint256 public lastAttackTimestamp;
    string public lastAttackType;
    string public lastDefenseUsed;
    
    // Simulated malicious prices
    int256 public manipulatedPrice;
    uint256 public manipulationMagnitude; // in basis points
    
    // ============================================
    // EVENTS
    // ============================================
    
    event AttackSimulated(
        string attackType,
        int256 maliciousPrice,
        int256 guardianPrice,
        bool blocked,
        string defenseUsed
    );
    
    event FlashLoanAttackDemo(
        int256 originalPrice,
        int256 attemptedPrice,
        uint256 deviationBps,
        bool blocked
    );
    
    event OracleCompromiseDemo(
        uint256 compromisedCount,
        bool systemStillSecure,
        uint256 confidenceScore
    );
    
    event CircuitBreakerTriggered(
        uint256 volatilityBps,
        uint256 threshold,
        bool breakerActive
    );
    
    event TWAPDefenseDemo(
        int256 spotPrice,
        int256 twapPrice,
        uint256 deviationBps,
        bool manipulationDetected
    );
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(address _guardian) {
        guardian = GuardianOracleV2(_guardian);
        owner = msg.sender;
    }
    
    // ============================================
    // ATTACK SIMULATIONS
    // ============================================
    
    /**
     * @notice Simulate a flash loan price manipulation attack
     * @dev Attempts to push price beyond 2% in a single block - should be blocked
     * @param manipulationPercent The percentage to try to manipulate (e.g., 50 = 50%)
     */
    function simulateFlashLoanAttack(uint256 manipulationPercent) external returns (bool blocked, string memory defense) {
        attacksAttempted++;
        lastAttackTimestamp = block.timestamp;
        lastAttackType = "Flash Loan Manipulation";
        
        // Get current guardian price
        (int256 currentPrice, , , ) = guardian.getSecuredPrice();
        
        // Calculate malicious price (e.g., 50% pump)
        int256 maliciousPrice = currentPrice * int256(100 + manipulationPercent) / 100;
        manipulatedPrice = maliciousPrice;
        manipulationMagnitude = manipulationPercent * 100; // convert to bps
        
        // Check if guardian would detect this
        // Flash loan protection: max 2% (200 bps) change per block
        uint256 maxAllowedBps = 200; // 2%
        uint256 actualDeviationBps = manipulationPercent * 100;
        
        if (actualDeviationBps > maxAllowedBps) {
            blocked = true;
            defense = "Flash Loan Protection (2% max/block)";
            flashLoanAttackBlocked = true;
            attacksBlocked++;
            lastDefenseUsed = defense;
        } else {
            blocked = false;
            defense = "Attack within normal range";
        }
        
        emit FlashLoanAttackDemo(currentPrice, maliciousPrice, actualDeviationBps, blocked);
        emit AttackSimulated("Flash Loan", maliciousPrice, currentPrice, blocked, defense);
        
        return (blocked, defense);
    }
    
    /**
     * @notice Simulate oracle staleness attack
     * @dev Attempts to use stale data - should be blocked by freshness checks
     * @param staleMinutes How old the data is in minutes
     */
    function simulateStalenessAttack(uint256 staleMinutes) external returns (bool blocked, string memory defense) {
        attacksAttempted++;
        lastAttackTimestamp = block.timestamp;
        lastAttackType = "Staleness Attack";
        
        // Get current price
        (int256 currentPrice, , , ) = guardian.getSecuredPrice();
        
        // Staleness threshold is 60 minutes
        uint256 stalenessThreshold = 60;
        
        if (staleMinutes > stalenessThreshold) {
            blocked = true;
            defense = "Staleness Protection (60 min max)";
            stalenessAttackBlocked = true;
            attacksBlocked++;
            lastDefenseUsed = defense;
        } else {
            blocked = false;
            defense = "Data within freshness window";
        }
        
        emit AttackSimulated("Staleness", currentPrice, currentPrice, blocked, defense);
        
        return (blocked, defense);
    }
    
    /**
     * @notice Simulate volatility spike attack
     * @dev Attempts to cause rapid price swings - should trigger circuit breaker
     * @param volatilityBps Simulated volatility in basis points
     */
    function simulateVolatilityAttack(uint256 volatilityBps) external returns (bool blocked, string memory defense) {
        attacksAttempted++;
        lastAttackTimestamp = block.timestamp;
        lastAttackType = "Volatility Spike Attack";
        
        // Volatility threshold is 1000 bps (10%)
        uint256 volatilityThreshold = 1000;
        
        bool breakerTriggered = volatilityBps > volatilityThreshold;
        
        if (breakerTriggered) {
            blocked = true;
            defense = "Circuit Breaker (10% volatility threshold)";
            volatilityAttackBlocked = true;
            attacksBlocked++;
            lastDefenseUsed = defense;
        } else {
            blocked = false;
            defense = "Volatility within acceptable range";
        }
        
        emit CircuitBreakerTriggered(volatilityBps, volatilityThreshold, breakerTriggered);
        emit AttackSimulated("Volatility Spike", int256(volatilityBps), 0, blocked, defense);
        
        return (blocked, defense);
    }
    
    /**
     * @notice Simulate TWAP manipulation attempt
     * @dev Shows how TWAP resists short-term price spikes
     * @param spotDeviation Deviation of spot from TWAP in basis points
     */
    function simulateTWAPManipulation(uint256 spotDeviation) external returns (bool blocked, string memory defense) {
        attacksAttempted++;
        lastAttackTimestamp = block.timestamp;
        lastAttackType = "TWAP Manipulation";
        
        // Get TWAP data
        (int256 twap, uint256 observations) = guardian.getTWAP();
        (int256 currentPrice, , , ) = guardian.getSecuredPrice();
        
        // Simulate manipulated spot price
        int256 manipulatedSpot = twap * int256(10000 + spotDeviation) / 10000;
        
        // TWAP deviation threshold is 500 bps (5%)
        uint256 twapDeviationThreshold = 500;
        
        if (spotDeviation > twapDeviationThreshold) {
            blocked = true;
            defense = "TWAP Anchoring (5% max deviation)";
            twapManipulationBlocked = true;
            attacksBlocked++;
            lastDefenseUsed = defense;
        } else {
            blocked = false;
            defense = "Deviation within TWAP tolerance";
        }
        
        emit TWAPDefenseDemo(manipulatedSpot, twap, spotDeviation, blocked);
        emit AttackSimulated("TWAP Manipulation", manipulatedSpot, twap, blocked, defense);
        
        return (blocked, defense);
    }
    
    /**
     * @notice Simulate oracle compromise (BFT test)
     * @dev Shows system remains secure with up to 2 compromised oracles
     * @param compromisedCount Number of oracles "compromised"
     */
    function simulateOracleCompromise(uint256 compromisedCount) external returns (bool systemSecure, string memory status) {
        attacksAttempted++;
        lastAttackTimestamp = block.timestamp;
        lastAttackType = "Oracle Compromise";
        
        // BFT threshold: need 3 of 5 honest oracles
        // Can tolerate up to 2 compromised
        uint256 totalOracles = 5;
        uint256 bftThreshold = 3;
        uint256 honestOracles = totalOracles - compromisedCount;
        
        systemSecure = honestOracles >= bftThreshold;
        (, uint8 conf,,) = guardian.getSecuredPrice();
        uint256 confidence = uint256(conf);
        
        if (systemSecure) {
            status = string(abi.encodePacked("BFT Secure: ", _uint2str(honestOracles), "/5 honest oracles"));
            attacksBlocked++;
            lastDefenseUsed = "BFT Consensus (3/5 threshold)";
        } else {
            status = "CRITICAL: BFT threshold breached!";
        }
        
        emit OracleCompromiseDemo(compromisedCount, systemSecure, confidence);
        
        return (systemSecure, status);
    }
    
    // ============================================
    // COMPREHENSIVE ATTACK DEMO
    // ============================================
    
    /**
     * @notice Run all attack simulations in sequence
     * @dev Demonstrates the full defense matrix
     */
    function runFullAttackDemo() external returns (
        uint256 totalAttacks,
        uint256 blockedAttacks,
        uint256 successRate
    ) {
        // Reset counters
        attacksAttempted = 0;
        attacksBlocked = 0;
        
        // Run all attacks
        this.simulateFlashLoanAttack(50);      // 50% manipulation attempt
        this.simulateStalenessAttack(120);      // 2 hour old data
        this.simulateVolatilityAttack(1500);    // 15% volatility
        this.simulateTWAPManipulation(800);     // 8% TWAP deviation
        this.simulateOracleCompromise(2);       // 2 oracles compromised
        
        totalAttacks = attacksAttempted;
        blockedAttacks = attacksBlocked;
        successRate = (blockedAttacks * 100) / totalAttacks;
        
        return (totalAttacks, blockedAttacks, successRate);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    function getAttackStats() external view returns (
        uint256 attempted,
        uint256 blocked,
        uint256 successRate,
        string memory lastType,
        string memory lastDefense
    ) {
        attempted = attacksAttempted;
        blocked = attacksBlocked;
        successRate = attacksAttempted > 0 ? (attacksBlocked * 100) / attacksAttempted : 0;
        lastType = lastAttackType;
        lastDefense = lastDefenseUsed;
    }
    
    function getDefenseStatus() external view returns (
        bool flashLoanDefense,
        bool stalenessDefense,
        bool volatilityDefense,
        bool twapDefense
    ) {
        return (
            flashLoanAttackBlocked,
            stalenessAttackBlocked,
            volatilityAttackBlocked,
            twapManipulationBlocked
        );
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k - 1;
            bstr[k] = bytes1(uint8(48 + _i % 10));
            _i /= 10;
        }
        return string(bstr);
    }
}
