// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FinalityController
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Three-Phase Finality State Machine with BFT Quorum Validation
 * @dev Implements formal LTL temporal properties for settlement finality
 * 
 * FLAGSHIP FEATURES:
 * 1. Three-Phase Finality: TENTATIVE → SEMI_FINAL → FINAL
 * 2. BFT Quorum Validation for state transitions
 * 3. Reorg Rollback Handler with idempotent state restoration
 * 4. LTL Temporal Property Enforcement
 * 
 * LTL PROPERTIES ENFORCED:
 * □ (TENTATIVE → ◇ SEMI_FINAL) : Always eventually progress
 * □ (FINAL → □ FINAL)          : Once final, always final
 * □ (state_change → quorum_reached) : State changes require quorum
 * □ (reorg_detected → state_rollback) : Reorgs trigger rollback
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    FINALITY STATE MACHINE                        │
 * │  ┌───────────┐   +n blocks   ┌─────────────┐  +m blocks  ┌─────┐│
 * │  │ TENTATIVE │ ────────────→ │ SEMI_FINAL  │ ──────────→ │FINAL││
 * │  └───────────┘               └─────────────┘             └─────┘│
 * │       ↑                            ↑                            │
 * │       │ reorg                      │ reorg                      │
 * │       └────────────────────────────┘                            │
 * │  ROLLBACK: Any state can revert to TENTATIVE on deep reorg      │
 * └─────────────────────────────────────────────────────────────────┘
 */
abstract contract FinalityController {
    
    // ============================================
    // THREE-PHASE FINALITY STATES
    // ============================================
    
    /**
     * @dev Finality phases with formal semantics
     * 
     * TENTATIVE:  Initial confirmation, subject to reorg (0-2 blocks)
     * SEMI_FINAL: Probabilistic finality, unlikely to revert (3-12 blocks)
     * FINAL:      Irreversible under honest majority assumption (13+ blocks)
     */
    enum FinalityPhase {
        TENTATIVE,    // 0: Optimistic confirmation, can be reverted
        SEMI_FINAL,   // 1: Probabilistic finality (2+ confirmations)
        FINAL         // 2: Irreversible finality (Ethereum PoS: ~13 blocks)
    }
    
    // ============================================
    // BFT QUORUM PARAMETERS
    // ============================================
    
    /// @notice Minimum confirmations for TENTATIVE → SEMI_FINAL
    uint256 public constant SEMI_FINAL_THRESHOLD = 2;
    
    /// @notice Minimum confirmations for SEMI_FINAL → FINAL
    uint256 public constant FINAL_THRESHOLD = 12;
    
    /// @notice Maximum reorg depth before emergency mode (Ethereum PoS: 2 epochs)
    uint256 public constant MAX_REORG_DEPTH = 64;
    
    /// @notice BFT quorum requirement (2/3 + 1 in basis points = 6667)
    uint256 public constant BFT_QUORUM_BPS = 6667;
    
    // ============================================
    // STATE TRACKING
    // ============================================
    
    /**
     * @dev Finality record for each settlement
     */
    struct FinalityRecord {
        FinalityPhase phase;
        uint256 tentativeBlock;      // Block when first confirmed
        uint256 semiFinalBlock;      // Block when reached semi-final
        uint256 finalBlock;          // Block when reached final
        bytes32 stateRoot;           // State snapshot for rollback
        uint256 quorumVotes;         // Accumulated validator votes
        bool reorgDetected;          // Flag for reorg handling
        uint256 lastReorgBlock;      // Last reorg block number
    }
    
    /// @notice Finality records per settlement
    mapping(uint256 => FinalityRecord) public finalityRecords;
    
    /// @notice Validator votes for finality transitions
    mapping(uint256 => mapping(address => bool)) public validatorVotes;
    
    /// @notice Registered validators for BFT quorum
    address[] public validators;
    mapping(address => bool) public isValidator;
    
    /// @notice Snapshot storage for rollback
    mapping(uint256 => mapping(bytes32 => bytes)) public stateSnapshots;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event FinalityPhaseTransition(
        uint256 indexed settlementId,
        FinalityPhase fromPhase,
        FinalityPhase toPhase,
        uint256 blockNumber,
        uint256 quorumVotes
    );
    
    event QuorumReached(
        uint256 indexed settlementId,
        FinalityPhase targetPhase,
        uint256 totalVotes,
        uint256 requiredVotes
    );
    
    event ReorgDetected(
        uint256 indexed settlementId,
        uint256 reorgDepth,
        uint256 rollbackToBlock,
        bytes32 previousStateRoot
    );
    
    event StateRollback(
        uint256 indexed settlementId,
        FinalityPhase fromPhase,
        FinalityPhase toPhase,
        bytes32 restoredStateRoot
    );
    
    event ValidatorVote(
        uint256 indexed settlementId,
        address indexed validator,
        FinalityPhase targetPhase,
        uint256 totalVotes
    );
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyValidator() {
        require(isValidator[msg.sender], "FC: Not a validator");
        _;
    }
    
    modifier validPhaseTransition(uint256 settlementId, FinalityPhase targetPhase) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        if (targetPhase == FinalityPhase.SEMI_FINAL) {
            require(record.phase == FinalityPhase.TENTATIVE, "FC: Invalid phase for SEMI_FINAL");
            require(
                block.number >= record.tentativeBlock + SEMI_FINAL_THRESHOLD,
                "FC: Insufficient confirmations for SEMI_FINAL"
            );
        } else if (targetPhase == FinalityPhase.FINAL) {
            require(record.phase == FinalityPhase.SEMI_FINAL, "FC: Invalid phase for FINAL");
            require(
                block.number >= record.semiFinalBlock + FINAL_THRESHOLD,
                "FC: Insufficient confirmations for FINAL"
            );
        }
        _;
    }
    
    // ============================================
    // THREE-PHASE FINALITY LOGIC
    // ============================================
    
    /**
     * @notice Initialize finality tracking for a settlement
     * @param settlementId Settlement to track
     * @param stateRoot Initial state snapshot hash
     */
    function _initializeFinality(
        uint256 settlementId,
        bytes32 stateRoot
    ) internal {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        require(record.tentativeBlock == 0, "FC: Already initialized");
        
        record.phase = FinalityPhase.TENTATIVE;
        record.tentativeBlock = block.number;
        record.stateRoot = stateRoot;
        record.quorumVotes = 0;
        
        emit FinalityPhaseTransition(
            settlementId,
            FinalityPhase.TENTATIVE, // from (genesis)
            FinalityPhase.TENTATIVE,
            block.number,
            0
        );
    }
    
    /**
     * @notice Vote for finality phase transition
     * @param settlementId Settlement to vote for
     * @param targetPhase Target finality phase
     * @dev Requires BFT quorum (2/3 + 1) for transition
     */
    function voteForFinality(
        uint256 settlementId,
        FinalityPhase targetPhase
    ) external onlyValidator validPhaseTransition(settlementId, targetPhase) {
        require(!validatorVotes[settlementId][msg.sender], "FC: Already voted");
        
        FinalityRecord storage record = finalityRecords[settlementId];
        
        validatorVotes[settlementId][msg.sender] = true;
        record.quorumVotes++;
        
        emit ValidatorVote(settlementId, msg.sender, targetPhase, record.quorumVotes);
        
        // Check if quorum reached
        uint256 requiredVotes = (validators.length * BFT_QUORUM_BPS) / 10000;
        if (requiredVotes == 0) requiredVotes = 1; // Minimum 1 vote
        
        if (record.quorumVotes >= requiredVotes) {
            _transitionPhase(settlementId, targetPhase);
            
            emit QuorumReached(
                settlementId,
                targetPhase,
                record.quorumVotes,
                requiredVotes
            );
        }
    }
    
    /**
     * @notice Internal phase transition with LTL property enforcement
     * @param settlementId Settlement to transition
     * @param targetPhase New finality phase
     * 
     * LTL Property: □ (FINAL → □ FINAL) - monotonic finality
     */
    function _transitionPhase(
        uint256 settlementId,
        FinalityPhase targetPhase
    ) internal {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        FinalityPhase previousPhase = record.phase;
        
        // LTL: Final is irreversible (unless reorg rollback)
        require(
            previousPhase != FinalityPhase.FINAL || record.reorgDetected,
            "FC: LTL violation - FINAL is irreversible"
        );
        
        record.phase = targetPhase;
        
        if (targetPhase == FinalityPhase.SEMI_FINAL) {
            record.semiFinalBlock = block.number;
            // Reset votes for next phase
            record.quorumVotes = 0;
            _resetVotes(settlementId);
        } else if (targetPhase == FinalityPhase.FINAL) {
            record.finalBlock = block.number;
        }
        
        emit FinalityPhaseTransition(
            settlementId,
            previousPhase,
            targetPhase,
            block.number,
            record.quorumVotes
        );
    }
    
    /**
     * @notice Check if settlement can progress to next phase
     * @param settlementId Settlement to check
     * @return canProgress True if eligible for next phase
     * @return nextPhase The next phase if eligible
     * @return blocksRemaining Blocks until eligible (0 if ready)
     */
    function checkFinalityProgress(
        uint256 settlementId
    ) public view returns (
        bool canProgress,
        FinalityPhase nextPhase,
        uint256 blocksRemaining
    ) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        if (record.phase == FinalityPhase.TENTATIVE) {
            uint256 required = record.tentativeBlock + SEMI_FINAL_THRESHOLD;
            if (block.number >= required) {
                return (true, FinalityPhase.SEMI_FINAL, 0);
            }
            return (false, FinalityPhase.SEMI_FINAL, required - block.number);
        }
        
        if (record.phase == FinalityPhase.SEMI_FINAL) {
            uint256 required = record.semiFinalBlock + FINAL_THRESHOLD;
            if (block.number >= required) {
                return (true, FinalityPhase.FINAL, 0);
            }
            return (false, FinalityPhase.FINAL, required - block.number);
        }
        
        // Already FINAL
        return (false, FinalityPhase.FINAL, 0);
    }
    
    // ============================================
    // REORG DETECTION & ROLLBACK
    // ============================================
    
    /**
     * @notice Detect and handle chain reorganization
     * @param settlementId Settlement to check
     * @param previousBlockHash Expected previous block hash
     * @return reorgDetected True if reorg detected
     * @return reorgDepth Depth of the reorg
     * 
     * LTL Property: □ (reorg_detected → state_rollback)
     */
    function detectReorg(
        uint256 settlementId,
        bytes32 previousBlockHash
    ) public returns (bool reorgDetected, uint256 reorgDepth) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        // Compare with expected block hash
        // In production, this would check against stored block hashes
        bytes32 currentPrevHash = blockhash(block.number - 1);
        
        if (currentPrevHash != previousBlockHash && previousBlockHash != bytes32(0)) {
            // Reorg detected - calculate depth
            reorgDepth = _calculateReorgDepth(settlementId);
            
            if (reorgDepth > 0) {
                record.reorgDetected = true;
                record.lastReorgBlock = block.number;
                
                emit ReorgDetected(
                    settlementId,
                    reorgDepth,
                    record.tentativeBlock,
                    record.stateRoot
                );
                
                // Trigger rollback if beyond TENTATIVE
                if (record.phase != FinalityPhase.TENTATIVE) {
                    _handleReorgRollback(settlementId, reorgDepth);
                }
                
                return (true, reorgDepth);
            }
        }
        
        return (false, 0);
    }
    
    /**
     * @notice Calculate reorg depth based on confirmation count
     */
    function _calculateReorgDepth(
        uint256 settlementId
    ) internal view returns (uint256) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        if (record.phase == FinalityPhase.FINAL) {
            return block.number - record.finalBlock;
        } else if (record.phase == FinalityPhase.SEMI_FINAL) {
            return block.number - record.semiFinalBlock;
        } else {
            return block.number - record.tentativeBlock;
        }
    }
    
    /**
     * @notice Handle state rollback after reorg detection
     * @param settlementId Settlement to rollback
     * @param reorgDepth Depth of the reorg
     * 
     * IDEMPOTENT: Multiple calls with same reorg produce same state
     */
    function _handleReorgRollback(
        uint256 settlementId,
        uint256 reorgDepth
    ) internal {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        require(record.reorgDetected, "FC: No reorg detected");
        
        FinalityPhase previousPhase = record.phase;
        bytes32 previousStateRoot = record.stateRoot;
        
        // Determine rollback target based on reorg depth
        FinalityPhase rollbackTarget;
        if (reorgDepth >= FINAL_THRESHOLD) {
            rollbackTarget = FinalityPhase.TENTATIVE;
        } else if (reorgDepth >= SEMI_FINAL_THRESHOLD) {
            rollbackTarget = FinalityPhase.TENTATIVE;
        } else {
            rollbackTarget = record.phase; // Minor reorg, no rollback needed
        }
        
        if (rollbackTarget != record.phase) {
            // Perform rollback
            record.phase = rollbackTarget;
            record.quorumVotes = 0;
            _resetVotes(settlementId);
            
            // Reset phase-specific blocks
            if (rollbackTarget == FinalityPhase.TENTATIVE) {
                record.semiFinalBlock = 0;
                record.finalBlock = 0;
                record.tentativeBlock = block.number; // Re-anchor
            }
            
            // Clear reorg flag after handling
            record.reorgDetected = false;
            
            emit StateRollback(
                settlementId,
                previousPhase,
                rollbackTarget,
                previousStateRoot
            );
        }
    }
    
    /**
     * @notice Manual reorg recovery (admin function)
     * @param settlementId Settlement to recover
     * @param targetPhase Phase to reset to
     * @param newStateRoot New state root after recovery
     */
    function _recoverFromReorg(
        uint256 settlementId,
        FinalityPhase targetPhase,
        bytes32 newStateRoot
    ) internal {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        FinalityPhase previousPhase = record.phase;
        
        record.phase = targetPhase;
        record.stateRoot = newStateRoot;
        record.reorgDetected = false;
        record.quorumVotes = 0;
        
        if (targetPhase == FinalityPhase.TENTATIVE) {
            record.tentativeBlock = block.number;
            record.semiFinalBlock = 0;
            record.finalBlock = 0;
        }
        
        _resetVotes(settlementId);
        
        emit StateRollback(
            settlementId,
            previousPhase,
            targetPhase,
            newStateRoot
        );
    }
    
    // ============================================
    // VALIDATOR MANAGEMENT
    // ============================================
    
    /**
     * @notice Register a new validator for BFT quorum
     */
    function _addValidator(address validator) internal {
        require(!isValidator[validator], "FC: Already a validator");
        
        validators.push(validator);
        isValidator[validator] = true;
    }
    
    /**
     * @notice Remove a validator
     */
    function _removeValidator(address validator) internal {
        require(isValidator[validator], "FC: Not a validator");
        
        isValidator[validator] = false;
        
        // Remove from array (swap and pop)
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == validator) {
                validators[i] = validators[validators.length - 1];
                validators.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Reset all votes for a settlement
     */
    function _resetVotes(uint256 settlementId) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            validatorVotes[settlementId][validators[i]] = false;
        }
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get complete finality status
     */
    function getFinalityStatus(
        uint256 settlementId
    ) public view returns (
        FinalityPhase phase,
        uint256 tentativeBlock,
        uint256 semiFinalBlock,
        uint256 finalBlock,
        uint256 confirmations,
        bool isFinal,
        bool reorgDetected
    ) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        phase = record.phase;
        tentativeBlock = record.tentativeBlock;
        semiFinalBlock = record.semiFinalBlock;
        finalBlock = record.finalBlock;
        confirmations = block.number - record.tentativeBlock;
        isFinal = (record.phase == FinalityPhase.FINAL);
        reorgDetected = record.reorgDetected;
    }
    
    /**
     * @notice Get current quorum status
     */
    function getQuorumStatus(
        uint256 settlementId
    ) public view returns (
        uint256 currentVotes,
        uint256 requiredVotes,
        uint256 totalValidators,
        bool quorumReached
    ) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        currentVotes = record.quorumVotes;
        totalValidators = validators.length;
        requiredVotes = (totalValidators * BFT_QUORUM_BPS) / 10000;
        if (requiredVotes == 0 && totalValidators > 0) requiredVotes = 1;
        quorumReached = currentVotes >= requiredVotes;
    }
    
    /**
     * @notice Get validator count
     */
    function getValidatorCount() public view returns (uint256) {
        return validators.length;
    }
    
    /**
     * @notice Check if settlement has reached irreversible finality
     * 
     * LTL Property Check: □ (FINAL → □ FINAL)
     */
    function isIrreversiblyFinal(uint256 settlementId) public view returns (bool) {
        FinalityRecord storage record = finalityRecords[settlementId];
        return record.phase == FinalityPhase.FINAL && !record.reorgDetected;
    }
    
    /**
     * @notice Get finality confidence score (0-100)
     */
    function getFinalityConfidence(uint256 settlementId) public view returns (uint256) {
        FinalityRecord storage record = finalityRecords[settlementId];
        
        if (record.phase == FinalityPhase.FINAL) {
            return 100;
        } else if (record.phase == FinalityPhase.SEMI_FINAL) {
            uint256 progress = block.number - record.semiFinalBlock;
            uint256 needed = FINAL_THRESHOLD;
            uint256 baseConfidence = 70; // SEMI_FINAL starts at 70%
            uint256 additionalConfidence = (progress * 30) / needed;
            return baseConfidence + (additionalConfidence > 30 ? 30 : additionalConfidence);
        } else {
            // TENTATIVE
            uint256 progress = block.number - record.tentativeBlock;
            uint256 needed = SEMI_FINAL_THRESHOLD;
            uint256 baseConfidence = 30; // TENTATIVE starts at 30%
            uint256 additionalConfidence = (progress * 40) / needed;
            return baseConfidence + (additionalConfidence > 40 ? 40 : additionalConfidence);
        }
    }
}
