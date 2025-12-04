// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SettlementBase
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @dev Core data structures and state management for settlement protocol
 * @notice This contract defines the settlement struct, states, and storage
 * 
 * ARCHITECTURE LAYER: Foundation
 * - Defines all data structures (Settlement, OracleData structs)
 * - Manages state enum (PENDING, INITIATED, EXECUTING, FINALIZED, DISPUTED, FAILED)
 * - Stores all settlements in mappings
 * - Emits events for every action
 * - Provides view functions for queries
 */
contract SettlementBase {
    // ════════════════════════════════════════════════════════════════
    // ENUMS
    // ════════════════════════════════════════════════════════════════

    /// @notice All possible settlement states
    enum SettlementState {
        PENDING,      // 0 - Awaiting oracle data
        INITIATED,    // 1 - Oracle data received, ready to execute
        EXECUTING,    // 2 - Transfers in progress
        FINALIZED,    // 3 - Settlement complete, immutable
        DISPUTED,     // 4 - Oracle data challenged, under review
        FAILED        // 5 - Settlement failed, funds refunded
    }

    // ════════════════════════════════════════════════════════════════
    // STRUCTS
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Represents a single settlement operation
     * @param id Unique settlement identifier
     * @param initiator Address who started the settlement
     * @param participants Array of receiving addresses
     * @param amounts Corresponding amounts for each participant
     * @param state Current state of settlement
     * @param createdBlock Block number when settlement was created
     * @param finalizedBlock Block number when settlement completed
     * @param oracleDataHash Hash of oracle data used
     * @param timeout Block number after which settlement auto-refunds
     * @param executed Flag to prevent double execution
     * @param totalValue Total value locked in settlement
     */
    struct Settlement {
        uint256 id;
        address initiator;
        address[] participants;
        uint256[] amounts;
        SettlementState state;
        uint256 createdBlock;
        uint256 finalizedBlock;
        bytes32 oracleDataHash;
        uint256 timeout;
        bool executed;
        uint256 totalValue;
    }

    /**
     * @notice Represents oracle price data
     * @param price Latest price from oracle
     * @param timestamp When price was fetched
     * @param source Which oracle provided it (0=Chainlink, 1=Band)
     * @param blockNumber Block where price was recorded
     */
    struct OracleData {
        int256 price;
        uint256 timestamp;
        uint8 source; // 0 = Chainlink, 1 = Band Protocol
        uint256 blockNumber;
    }

    // ════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ════════════════════════════════════════════════════════════════

    // Counter for settlement IDs
    uint256 public settlementCounter = 0;

    // Main storage: settlementId => Settlement data
    mapping(uint256 => Settlement) public settlements;

    // Oracle data storage: settlementId => OracleData
    mapping(uint256 => OracleData) public oraclePrices;

    // Track which settlement IDs have been processed (for idempotence)
    mapping(uint256 => bool) public settlementExecuted;

    // Dispute tracking: settlementId => disputed (true/false)
    mapping(uint256 => bool) public isDisputed;

    // Dispute reasons: settlementId => reason string
    mapping(uint256 => string) public disputeReasons;

    // Owner/admin address
    address public owner;

    // Protocol parameters (can be updated by owner)
    uint256 public constant MAX_SETTLEMENT_TIMEOUT = 10000; // Max 10k blocks
    uint256 public constant MIN_SETTLEMENT_TIMEOUT = 100;   // Min 100 blocks
    uint256 public constant ORACLE_FRESHNESS_LIMIT = 300 seconds; // 5 minutes
    uint256 public constant PRICE_DEVIATION_THRESHOLD = 5; // 5% max change

    // ════════════════════════════════════════════════════════════════
    // EVENTS
    // ════════════════════════════════════════════════════════════════

    /// @notice Emitted when new settlement is created
    event SettlementCreated(
        uint256 indexed settlementId,
        address indexed initiator,
        uint256 totalValue,
        uint256 timeout,
        address[] participants,
        uint256[] amounts
    );

    /// @notice Emitted when settlement state changes
    event StateTransition(
        uint256 indexed settlementId,
        SettlementState fromState,
        SettlementState toState,
        uint256 atBlock
    );

    /// @notice Emitted when oracle data is recorded
    event OracleDataRecorded(
        uint256 indexed settlementId,
        int256 price,
        uint256 timestamp,
        uint8 source
    );

    /// @notice Emitted when settlement completes
    event SettlementFinalized(
        uint256 indexed settlementId,
        uint256 finalizeBlock,
        uint256 totalProcessed
    );

    /// @notice Emitted when settlement is disputed
    event SettlementDisputed(
        uint256 indexed settlementId,
        string reason,
        address disputer,
        int256 suggestedPrice
    );

    /// @notice Emitted when settlement is refunded (timeout or failure)
    event SettlementRefunded(
        uint256 indexed settlementId,
        string reason,
        uint256 refundedAmount
    );

    /// @notice Emitted when invariant violation occurs
    event InvariantViolation(
        uint256 indexed settlementId,
        string invariantName,
        string details
    );

    // ════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier validSettlement(uint256 settlementId) {
        require(settlementId < settlementCounter, "Invalid settlement ID");
        require(settlements[settlementId].id == settlementId, "Settlement not found");
        _;
    }

    modifier notExecuted(uint256 settlementId) {
        require(!settlements[settlementId].executed, "Already executed");
        _;
    }

    modifier inState(uint256 settlementId, SettlementState expectedState) {
        require(
            settlements[settlementId].state == expectedState,
            "Invalid state for this operation"
        );
        _;
    }

    // ════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ════════════════════════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
        settlementCounter = 0;
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNAL HELPER FUNCTIONS
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Transition settlement to new state
     * @param settlementId The settlement to update
     * @param newState The target state
     */
    function _transitionState(uint256 settlementId, SettlementState newState) internal {
        Settlement storage s = settlements[settlementId];
        SettlementState oldState = s.state;
        s.state = newState;
        
        emit StateTransition(settlementId, oldState, newState, block.number);
    }

    /**
     * @notice Generate unique settlement ID
     * @return New settlement ID
     */
    function _generateSettlementId() internal returns (uint256) {
        uint256 id = settlementCounter;
        settlementCounter++;
        return id;
    }

    /**
     * @notice Validate settlement parameters
     * @param participants Array of addresses
     * @param amounts Corresponding amounts
     * @param timeout Timeout in blocks
     */
    function _validateSettlementParams(
        address[] calldata participants,
        uint256[] calldata amounts,
        uint256 timeout
    ) internal pure {
        require(participants.length > 0, "No participants");
        require(participants.length == amounts.length, "Mismatched lengths");
        require(participants.length <= 100, "Too many participants");
        require(timeout >= MIN_SETTLEMENT_TIMEOUT, "Timeout too short");
        require(timeout <= MAX_SETTLEMENT_TIMEOUT, "Timeout too long");
        
        for (uint256 i = 0; i < participants.length; i++) {
            require(participants[i] != address(0), "Invalid participant");
            require(amounts[i] > 0, "Invalid amount");
        }
    }

    /**
     * @notice Calculate total value being settled
     * @param amounts Array of amounts
     * @return Total sum
     */
    function _sumAmounts(uint256[] calldata amounts) internal pure returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        return total;
    }

    // ════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS (Query data without changing state)
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Get settlement details
     * @param settlementId The settlement to query
     * @return The settlement struct
     */
    function getSettlementBase(uint256 settlementId) 
        external 
        view 
        validSettlement(settlementId) 
        returns (Settlement memory) 
    {
        return settlements[settlementId];
    }

    /**
     * @notice Get oracle data for a settlement
     * @param settlementId The settlement to query
     * @return The oracle data struct
     */
    function getOracleDataBase(uint256 settlementId)
        external
        view
        validSettlement(settlementId)
        returns (OracleData memory)
    {
        return oraclePrices[settlementId];
    }

    /**
     * @notice Check if settlement is active (not finalized or failed)
     * @param settlementId The settlement to check
     * @return True if still active
     */
    function isSettlementActive(uint256 settlementId)
        external
        view
        validSettlement(settlementId)
        returns (bool)
    {
        Settlement storage s = settlements[settlementId];
        return s.state != SettlementState.FINALIZED && 
               s.state != SettlementState.FAILED;
    }

    /**
     * @notice Get current state of settlement
     * @param settlementId The settlement to check
     * @return Current state
     */
    function getSettlementState(uint256 settlementId)
        external
        view
        validSettlement(settlementId)
        returns (SettlementState)
    {
        return settlements[settlementId].state;
    }

    /**
     * @notice Get total number of settlements created
     * @return Number of settlements
     */
    function getTotalSettlements() external view returns (uint256) {
        return settlementCounter;
    }
}
