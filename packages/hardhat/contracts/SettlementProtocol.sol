// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SettlementOracle.sol";
import "./SettlementInvariants.sol";
import "./FinalityController.sol";

/**
 * @title SettlementProtocol
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Adversarial-Resilient Settlement Protocol for processing trades/transfers on-chain
 * @dev Implements fair ordering, 3-phase finality, oracle manipulation resistance, and attack defenses
 * 
 * ARCHITECTURE:
 * ┌──────────────────────────────────────────────┐
 * │         SETTLEMENT PROTOCOL ARCHITECTURE     │
 * ├──────────────────────────────────────────────┤
 * │  CONTRACT 1: SettlementBase (Foundation)     │
 * │  ├─ Structs (Settlement, State definitions)  │
 * │  ├─ State Variables (mappings, counters)     │
 * │  └─ Events (all activity logged)             │
 * │                                              │
 * │  CONTRACT 2: SettlementOracle (Data Fetch)   │
 * │  ├─ Chainlink integration                    │
 * │  ├─ Band Protocol fallback                   │
 * │  └─ Price validation logic                   │
 * │                                              │
 * │  CONTRACT 3: SettlementInvariants (Safety)   │
 * │  ├─ Check conservation of value              │
 * │  ├─ Prevent double settlement                │
 * │  ├─ Verify timeouts                          │
 * │  └─ Ensure partial finality                  │
 * │                                              │
 * │  CONTRACT 4: FinalityController (NEW!)       │
 * │  ├─ 3-Phase Finality: TENTATIVE→SEMI→FINAL  │
 * │  ├─ BFT Quorum Validation                   │
 * │  ├─ Reorg Rollback Handler                  │
 * │  └─ LTL Temporal Property Enforcement       │
 * │                                              │
 * │  CONTRACT 5: SettlementProtocol (Execution)  │
 * │  ├─ Initiates settlements                    │
 * │  ├─ Executes transfers                       │
 * │  ├─ Handles disputes                         │
 * │  └─ Manages timeouts                         │
 * └──────────────────────────────────────────────┘
 * 
 * KEY FEATURES:
 * 1. Fair Ordering - FIFO queue prevents validator reordering (MEV resistance)
 * 2. Invariant Enforcement - 5 core invariants mathematically proven
 * 3. Three-Phase Finality - TENTATIVE → SEMI_FINAL → FINAL with BFT quorum
 * 4. Oracle Manipulation Resistance - Dual oracle with dispute mechanism
 * 5. Reorg Resilience - Idempotent rollback with state restoration
 * 6. LTL Properties - Formal temporal logic enforcement
 */
contract SettlementProtocol is SettlementOracle, SettlementInvariants, FinalityController {
    
    // ============================================
    // STATE MACHINE DEFINITION
    // ============================================
    
    /**
     * @dev Settlement lifecycle states
     * PENDING -> INITIATED -> EXECUTING -> FINALIZED
     *                    \-> DISPUTED -> FINALIZED/FAILED
     *                    \-> FAILED (timeout/invariant violation)
     */
    enum SettlementState {
        PENDING,      // 0: Request created, awaiting initiation
        INITIATED,    // 1: Oracle data fetched, invariants checked
        EXECUTING,    // 2: Transfers in progress (multi-block)
        FINALIZED,    // 3: All transfers complete, finality reached
        DISPUTED,     // 4: Oracle data challenged, under review
        FAILED        // 5: Invariant violated or timeout, settlement reverted
    }

    // ============================================
    // DATA STRUCTURES
    // ============================================

    /**
     * @dev Individual transfer within a settlement
     */
    struct Transfer {
        address from;
        address to;
        uint256 amount;
        bool executed;
    }

    /**
     * @dev Complete settlement record
     */
    struct Settlement {
        uint256 id;
        address initiator;
        Transfer[] transfers;
        SettlementState state;
        uint256 createdBlock;
        uint256 initiatedBlock;
        uint256 finalizedBlock;
        uint256 oraclePrice;
        uint256 oracleTimestamp;
        uint256 timeout;           // Blocks until auto-refund
        uint256 queuePosition;     // FIFO ordering position
        bytes32 settlementHash;    // Unique hash for replay protection
        uint256 executedTransfers; // Track partial execution progress
        uint256 totalDeposited;    // Total ETH deposited for this settlement
        bool disputed;
        string disputeReason;
    }

    /**
     * @dev User deposit tracking for escrow
     */
    struct UserDeposit {
        uint256 amount;
        uint256 settlementId;
        bool locked;
    }

    // ============================================
    // STATE VARIABLES
    // ============================================

    // Settlement storage
    mapping(uint256 => Settlement) public settlements;
    uint256 public nextSettlementId;
    
    // FIFO Queue for fair ordering
    uint256[] public settlementQueue;
    uint256 public queueHead;  // Next to process
    uint256 public queueTail;  // Last added
    
    // User deposits (escrow)
    mapping(address => mapping(uint256 => UserDeposit)) public userDeposits;
    
    // Nonce for replay protection (prevents double settlement on reorg)
    mapping(bytes32 => bool) public usedSettlementHashes;
    
    // Configuration
    uint256 public constant DEFAULT_TIMEOUT = 1000;     // ~3.5 hours on Ethereum
    uint256 public constant DISPUTE_PERIOD = 50;        // Blocks for dispute window
    uint256 public constant MAX_TRANSFERS_PER_BLOCK = 10; // Partial finality limit
    uint256 public constant MIN_CONFIRMATIONS = 3;      // Reorg safety
    
    // Protocol state
    bool public paused;
    address public admin;
    bool private locked;  // Reentrancy guard

    // ============================================
    // EVENTS
    // ============================================
    
    event SettlementCreated(
        uint256 indexed settlementId, 
        address indexed initiator, 
        uint256 queuePosition,
        bytes32 settlementHash
    );
    
    event SettlementInitiated(
        uint256 indexed settlementId, 
        uint256 oraclePrice,
        uint256 oracleTimestamp
    );
    
    event SettlementExecuting(
        uint256 indexed settlementId,
        uint256 transfersCompleted,
        uint256 totalTransfers
    );
    
    event SettlementFinalized(
        uint256 indexed settlementId, 
        uint256 finalBlock,
        uint256 totalValue
    );
    
    event SettlementDisputed(
        uint256 indexed settlementId,
        address indexed disputer,
        string reason
    );
    
    event SettlementFailed(
        uint256 indexed settlementId,
        string reason
    );
    
    event DepositReceived(
        address indexed user,
        uint256 indexed settlementId,
        uint256 amount
    );
    
    event RefundIssued(
        address indexed user,
        uint256 indexed settlementId,
        uint256 amount
    );
    
    event TransferExecuted(
        uint256 indexed settlementId,
        uint256 transferIndex,
        address from,
        address to,
        uint256 amount
    );

    event MEVPreventionEnforced(
        uint256 indexed settlementId,
        string reason
    );

    event TimeoutRefundTriggered(
        uint256 indexed settlementId,
        uint256 refundAmount,
        uint256 atBlock
    );

    event DisputeResolved(
        uint256 indexed settlementId,
        uint256 correctPrice,
        uint256 atBlock
    );

    event SettlementQueued(
        uint256 indexed settlementId,
        uint256 queuePosition,
        uint256 atBlock
    );

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "!admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "paused");
        _;
    }

    modifier validSettlement(uint256 settlementId) {
        require(settlementId < nextSettlementId, "!exist");
        _;
    }

    modifier inState(uint256 settlementId, SettlementState expectedState) {
        require(settlements[settlementId].state == expectedState, "!state");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentry");
        locked = true;
        _;
        locked = false;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(address _chainlinkOracle, address _bandOracle) 
        SettlementOracle(_chainlinkOracle, _bandOracle) 
    {
        admin = msg.sender;
        nextSettlementId = 1; // Start from 1 for easier null checks
    }

    // ============================================
    // CORE FUNCTIONS: SETTLEMENT LIFECYCLE
    // ============================================

    /**
     * @notice Create a new settlement request
     * @dev Adds to FIFO queue for fair ordering. Deposits must be made before initiation.
     * @param transfers Array of transfers to execute
     * @param timeout Blocks until auto-refund (0 = default)
     * @return settlementId The unique ID of the created settlement
     */
    function createSettlement(
        Transfer[] memory transfers,
        uint256 timeout
    ) external notPaused returns (uint256 settlementId) {
        require(transfers.length > 0, "empty");
        require(transfers.length <= 100, ">100");
        
        settlementId = nextSettlementId++;
        
        // Generate unique settlement hash for replay protection
        bytes32 settlementHash = keccak256(abi.encodePacked(
            settlementId,
            msg.sender,
            block.number,
            block.timestamp,
            blockhash(block.number - 1)
        ));
        
        // INVARIANT CHECK: No duplicate settlement hashes (reorg protection)
        require(!usedSettlementHashes[settlementHash], "dup hash");
        usedSettlementHashes[settlementHash] = true;
        
        // Add to FIFO queue (fair ordering)
        uint256 queuePosition = queueTail++;
        settlementQueue.push(settlementId);
        
        // Create settlement record
        Settlement storage s = settlements[settlementId];
        s.id = settlementId;
        s.initiator = msg.sender;
        s.state = SettlementState.PENDING;
        s.createdBlock = block.number;
        s.timeout = timeout > 0 ? timeout : DEFAULT_TIMEOUT;
        s.queuePosition = queuePosition;
        s.settlementHash = settlementHash;
        
        // Copy transfers
        for (uint256 i = 0; i < transfers.length; i++) {
            require(transfers[i].to != address(0), "0x");
            require(transfers[i].amount > 0, "0val");
            s.transfers.push(Transfer({
                from: transfers[i].from,
                to: transfers[i].to,
                amount: transfers[i].amount,
                executed: false
            }));
        }
        
        emit SettlementCreated(settlementId, msg.sender, queuePosition, settlementHash);
        emit SettlementQueued(settlementId, queuePosition, block.number);
    }

    /**
     * @notice Deposit funds for a settlement (escrow)
     * @dev Must deposit before settlement can be initiated
     * @param settlementId The settlement to deposit for
     */
    function deposit(uint256 settlementId) 
        external 
        payable 
        notPaused 
        validSettlement(settlementId)
        inState(settlementId, SettlementState.PENDING)
    {
        require(msg.value > 0, "0");
        
        Settlement storage s = settlements[settlementId];
        
        // Track user deposit
        userDeposits[msg.sender][settlementId].amount += msg.value;
        userDeposits[msg.sender][settlementId].settlementId = settlementId;
        userDeposits[msg.sender][settlementId].locked = true;
        
        // Track total deposited
        s.totalDeposited += msg.value;
        
        emit DepositReceived(msg.sender, settlementId, msg.value);
    }

    /**
     * @notice Initiate a settlement after deposits are complete
     * @dev Fetches oracle data and validates invariants before proceeding
     * @param settlementId The settlement to initiate
     */
    function initiateSettlement(uint256 settlementId) 
        external 
        notPaused 
        validSettlement(settlementId)
        inState(settlementId, SettlementState.PENDING)
    {
        Settlement storage s = settlements[settlementId];
        
        // FAIR ORDERING: Must be next in queue (MEV prevention)
        if (settlementQueue[queueHead] != settlementId) {
            emit MEVPreventionEnforced(settlementId, "blocked");
            revert("!queue");
        }
        
        // Calculate required amount
        uint256 requiredAmount = _calculateTotalRequired(settlementId);
        
        // INVARIANT CHECK 1: Sufficient deposits (Conservation of Value)
        require(s.totalDeposited >= requiredAmount, "!funds");
        
        // Fetch oracle price
        (uint256 price, uint256 timestamp) = getLatestPrice();
        
        // INVARIANT CHECK 3: Oracle data freshness
        require(block.timestamp - timestamp <= MAX_ORACLE_STALENESS, "stale");
        
        // Store oracle data
        s.oraclePrice = price;
        s.oracleTimestamp = timestamp;
        s.initiatedBlock = block.number;
        s.state = SettlementState.INITIATED;
        
        // Advance queue head
        queueHead++;
        
        emit SettlementInitiated(settlementId, price, timestamp);
        emit SettlementQueued(settlementId, s.queuePosition, block.number);
    }

    /**
     * @notice Execute transfers for a settlement (supports partial execution)
     * @dev Can be called multiple times for large settlements (partial finality)
     * @param settlementId The settlement to execute
     * @param maxTransfers Maximum transfers to execute in this call
     */
    function executeSettlement(uint256 settlementId, uint256 maxTransfers) 
        external 
        notPaused 
        validSettlement(settlementId)
    {
        Settlement storage s = settlements[settlementId];
        
        require(
            s.state == SettlementState.INITIATED || s.state == SettlementState.EXECUTING,
            "Invalid state for execution"
        );
        
        // INVARIANT CHECK: Not timed out
        require(
            block.number <= s.createdBlock + s.timeout,
            "Settlement expired"
        );
        
        // INVARIANT CHECK 2: No double settlement
        require(s.executedTransfers < s.transfers.length, "done");
        
        // Check minimum confirmations (reorg safety)
        require(
            block.number >= s.initiatedBlock + MIN_CONFIRMATIONS,
            "Waiting for confirmations"
        );
        
        // Update state to EXECUTING if first execution
        if (s.state == SettlementState.INITIATED) {
            s.state = SettlementState.EXECUTING;
        }
        
        // Execute transfers (partial finality - limited per block)
        uint256 transfersToExecute = maxTransfers > 0 ? maxTransfers : MAX_TRANSFERS_PER_BLOCK;
        uint256 executed = 0;
        
        for (uint256 i = s.executedTransfers; i < s.transfers.length && executed < transfersToExecute; i++) {
            Transfer storage t = s.transfers[i];
            
            if (!t.executed) {
                // Execute transfer
                (bool success, ) = t.to.call{value: t.amount}("");
                require(success, "!xfer");
                
                t.executed = true;
                s.executedTransfers++;
                executed++;
                
                emit TransferExecuted(settlementId, i, t.from, t.to, t.amount);
            }
        }
        
        emit SettlementExecuting(settlementId, s.executedTransfers, s.transfers.length);
        
        // Check if all transfers complete
        if (s.executedTransfers == s.transfers.length) {
            _finalizeSettlement(settlementId);
        }
    }

    /**
     * @notice Dispute oracle data for a settlement
     * @dev Triggers dispute mechanism, fetches from backup oracle
     * @param settlementId The settlement to dispute
     * @param reason Description of why oracle data is disputed
     */
    function disputeSettlement(uint256 settlementId, string calldata reason) 
        external 
        validSettlement(settlementId)
    {
        Settlement storage s = settlements[settlementId];
        
        require(
            s.state == SettlementState.INITIATED || s.state == SettlementState.EXECUTING,
            "Cannot dispute in this state"
        );
        
        // Only during dispute period after initiation
        require(
            block.number <= s.initiatedBlock + DISPUTE_PERIOD,
            "Dispute period ended"
        );
        
        s.state = SettlementState.DISPUTED;
        s.disputed = true;
        s.disputeReason = reason;
        
        emit SettlementDisputed(settlementId, msg.sender, reason);
    }

    /**
     * @notice Resolve a disputed settlement using fallback oracle
     * @dev Admin or automated resolver can call this
     * @param settlementId The disputed settlement
     */
    function resolveDispute(uint256 settlementId) 
        external 
        validSettlement(settlementId)
        inState(settlementId, SettlementState.DISPUTED)
    {
        Settlement storage s = settlements[settlementId];
        
        // Get fallback oracle price
        (uint256 fallbackPrice, uint256 fallbackTimestamp) = getFallbackPrice();
        
        // Compare with original price
        uint256 deviation = _calculateDeviation(s.oraclePrice, fallbackPrice);
        
        if (deviation > MAX_PRICE_DEVIATION) {
            // Significant deviation - update price and resume
            s.oraclePrice = fallbackPrice;
            s.oracleTimestamp = fallbackTimestamp;
            s.state = SettlementState.INITIATED;
            s.disputed = false;
        } else {
            // Original price valid - resume with original
            s.state = SettlementState.INITIATED;
            s.disputed = false;
        }
    }

    /**
     * @notice Refund deposits for a failed/expired settlement
     * @dev Called after timeout or failed invariant check
     * @param settlementId The settlement to refund
     */
    function refundSettlement(uint256 settlementId) 
        external 
        validSettlement(settlementId)
    {
        Settlement storage s = settlements[settlementId];
        
        bool isExpired = block.number > s.createdBlock + s.timeout;
        bool isFailed = s.state == SettlementState.FAILED;
        bool isPending = s.state == SettlementState.PENDING && isExpired;
        
        require(isExpired || isFailed || isPending, "!refund");
        
        // Mark as failed if not already
        if (s.state != SettlementState.FAILED) {
            s.state = SettlementState.FAILED;
            emit SettlementFailed(settlementId, "timeout");
        }
        
        // Refund caller's deposit
        UserDeposit storage ud = userDeposits[msg.sender][settlementId];
        require(ud.amount > 0, "!deposit");
        require(ud.locked, "refunded");
        
        uint256 refundAmount = ud.amount;
        ud.amount = 0;
        ud.locked = false;
        
        (bool success, ) = msg.sender.call{value: refundAmount}("");
        require(success, "!send");
        
        emit RefundIssued(msg.sender, settlementId, refundAmount);
    }

    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================

    /**
     * @dev Finalize a completed settlement with 3-phase finality
     * Starts TENTATIVE phase, progresses through SEMI_FINAL to FINAL
     */
    function _finalizeSettlement(uint256 settlementId) internal {
        Settlement storage s = settlements[settlementId];
        
        // INVARIANT CHECK 1: Conservation of Value (post-execution)
        uint256 totalTransferred = _calculateTotalRequired(settlementId);
        require(
            checkConservationOfValue(s.totalDeposited, totalTransferred, 0),
            "Conservation of value violated"
        );
        
        s.state = SettlementState.FINALIZED;
        s.finalizedBlock = block.number;
        
        // Initialize 3-Phase Finality tracking
        bytes32 stateRoot = keccak256(abi.encode(
            settlementId,
            s.totalDeposited,
            totalTransferred,
            block.number
        ));
        _initializeFinality(settlementId, stateRoot);
        
        emit SettlementFinalized(settlementId, block.number, totalTransferred);
    }

    /**
     * @dev Calculate total amount required for settlement
     */
    function _calculateTotalRequired(uint256 settlementId) internal view returns (uint256) {
        Settlement storage s = settlements[settlementId];
        uint256 total = 0;
        
        for (uint256 i = 0; i < s.transfers.length; i++) {
            total += s.transfers[i].amount;
        }
        
        return total;
    }

    /**
     * @dev Calculate price deviation percentage
     */
    function _calculateDeviation(uint256 price1, uint256 price2) internal pure returns (uint256) {
        if (price1 == 0 || price2 == 0) return 100;
        
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        return (diff * 100) / price1;
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Get settlement details
     */
    function getSettlement(uint256 settlementId) 
        external 
        view 
        returns (
            uint256 id,
            address initiator,
            SettlementState state,
            uint256 createdBlock,
            uint256 oraclePrice,
            uint256 timeout,
            uint256 queuePosition,
            uint256 executedTransfers,
            uint256 totalTransfers,
            uint256 totalDeposited
        ) 
    {
        Settlement storage s = settlements[settlementId];
        return (
            s.id,
            s.initiator,
            s.state,
            s.createdBlock,
            s.oraclePrice,
            s.timeout,
            s.queuePosition,
            s.executedTransfers,
            s.transfers.length,
            s.totalDeposited
        );
    }

    /**
     * @notice Get transfers for a settlement
     */
    function getTransfers(uint256 settlementId) 
        external 
        view 
        returns (Transfer[] memory) 
    {
        return settlements[settlementId].transfers;
    }

    /**
     * @notice Get current queue length
     */
    function getQueueLength() external view returns (uint256) {
        return queueTail - queueHead;
    }

    /**
     * @notice Check if settlement can be initiated
     */
    function canInitiate(uint256 settlementId) external view returns (bool, string memory) {
        if (settlementId >= nextSettlementId) return (false, "Does not exist");
        
        Settlement storage s = settlements[settlementId];
        
        if (s.state != SettlementState.PENDING) return (false, "Wrong state");
        if (settlementQueue[queueHead] != settlementId) return (false, "Not next in queue");
        
        uint256 required = _calculateTotalRequired(settlementId);
        if (s.totalDeposited < required) return (false, "Insufficient deposits");
        
        return (true, "Ready");
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    function pause() external onlyAdmin {
        paused = true;
    }

    function unpause() external onlyAdmin {
        paused = false;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "0x");
        admin = newAdmin;
    }

    // ============================================
    // BATCH 4: ENHANCED FAIR ORDERING & EXECUTION
    // ============================================

    /**
     * @notice Get the settlement queue with position details
     * @return queueIds Array of settlement IDs in queue order
     * @return currentHead Current queue head position
     * @return currentTail Current queue tail position
     */
    function getSettlementQueue() 
        external 
        view 
        returns (
            uint256[] memory queueIds,
            uint256 currentHead,
            uint256 currentTail
        ) 
    {
        uint256 length = queueTail - queueHead;
        queueIds = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            queueIds[i] = settlementQueue[queueHead + i];
        }
        
        return (queueIds, queueHead, queueTail);
    }

    /**
     * @notice Get queue position for a specific settlement
     * @param settlementId The settlement to check
     * @return position The position in queue (0 if at front)
     * @return isInQueue Whether the settlement is in the queue
     */
    function getQueuePosition(uint256 settlementId) 
        external 
        view 
        returns (uint256 position, bool isInQueue) 
    {
        if (settlementId >= nextSettlementId) {
            return (0, false);
        }
        
        Settlement storage s = settlements[settlementId];
        if (s.state != SettlementState.PENDING && s.state != SettlementState.INITIATED) {
            return (0, false);
        }
        
        // Search queue for this settlement
        for (uint256 i = queueHead; i < queueTail; i++) {
            if (settlementQueue[i] == settlementId) {
                return (i - queueHead, true);
            }
        }
        
        return (0, false);
    }

    /**
     * @notice Check if a settlement is eligible for timeout refund
     * @param settlementId The settlement to check
     * @return eligible Whether the settlement can be refunded
     * @return blocksRemaining Blocks until timeout (0 if already timed out)
     */
    function isEligibleForRefund(uint256 settlementId) 
        external 
        view 
        returns (bool eligible, uint256 blocksRemaining) 
    {
        if (settlementId >= nextSettlementId) {
            return (false, 0);
        }
        
        Settlement storage s = settlements[settlementId];
        
        // Can only refund PENDING, INITIATED, or EXECUTING states
        if (s.state == SettlementState.FINALIZED ||
            s.state == SettlementState.FAILED ||
            s.state == SettlementState.DISPUTED) {
            return (false, 0);
        }
        
        uint256 timeoutBlock = s.createdBlock + s.timeout;
        if (block.number < timeoutBlock) {
            return (false, timeoutBlock - block.number);
        }
        
        return (s.totalDeposited > 0, 0);
    }

    /**
     * @notice Get comprehensive settlement details with status
     * @param settlementId The settlement to query
     */
    function getSettlementDetails(uint256 settlementId) 
        external 
        view 
        returns (
            // Core info
            address initiator,
            SettlementState state,
            uint256 createdBlock,
            uint256 oraclePrice,
            uint256 timeout,
            // Execution info
            uint256 executedTransfers,
            uint256 totalTransfers,
            uint256 totalDeposited,
            // Queue info
            uint256 queuePosition,
            bool isNextInQueue,
            // Timing info
            bool isTimedOut,
            uint256 blocksUntilTimeout
        ) 
    {
        require(settlementId < nextSettlementId, "Settlement does not exist");
        
        Settlement storage s = settlements[settlementId];
        
        initiator = s.initiator;
        state = s.state;
        createdBlock = s.createdBlock;
        oraclePrice = s.oraclePrice;
        timeout = s.timeout;
        executedTransfers = s.executedTransfers;
        totalTransfers = s.transfers.length;
        totalDeposited = s.totalDeposited;
        queuePosition = s.queuePosition;
        isNextInQueue = (settlementQueue[queueHead] == settlementId);
        
        uint256 timeoutBlock = s.createdBlock + s.timeout;
        isTimedOut = (block.number >= timeoutBlock);
        blocksUntilTimeout = isTimedOut ? 0 : (timeoutBlock - block.number);
    }

    /**
     * @notice Get full status including invariant checks
     * @param settlementId The settlement to query
     */
    function getFullStatus(uint256 settlementId) 
        external 
        view 
        returns (
            SettlementState state,
            bool invariantsHold,
            bool canProceed
        ) 
    {
        require(settlementId < nextSettlementId, "Settlement does not exist");
        
        Settlement storage s = settlements[settlementId];
        state = s.state;
        
        // Check invariants
        (invariantsHold, ) = verifyAllInvariants(settlementId);
        
        // Determine if settlement can proceed
        if (state == SettlementState.PENDING) {
            uint256 required = _calculateTotalRequired(settlementId);
            canProceed = (s.totalDeposited >= required) && 
                         (settlementQueue[queueHead] == settlementId);
        } else if (state == SettlementState.INITIATED) {
            canProceed = true;
        } else if (state == SettlementState.EXECUTING) {
            canProceed = (s.executedTransfers < s.transfers.length);
        } else {
            canProceed = false;
        }
    }

    /**
     * @notice Batch refund multiple timed-out settlements
     * @param settlementIds Array of settlement IDs to refund
     * @return refunded Number of settlements successfully refunded
     * @return totalRefundAmount Total amount refunded across all settlements
     */
    function batchRefundTimeouts(uint256[] calldata settlementIds) 
        external 
        nonReentrant 
        whenNotPaused
        returns (uint256 refunded, uint256 totalRefundAmount) 
    {
        for (uint256 i = 0; i < settlementIds.length; i++) {
            uint256 settlementId = settlementIds[i];
            
            if (settlementId >= nextSettlementId) continue;
            
            Settlement storage s = settlements[settlementId];
            
            // Skip if not in refundable state
            if (s.state == SettlementState.FINALIZED || 
                s.state == SettlementState.FAILED ||
                s.state == SettlementState.DISPUTED) {
                continue;
            }
            
            // Skip if not timed out
            if (block.number < s.createdBlock + s.timeout) {
                continue;
            }
            
            // Skip if no deposits
            if (s.totalDeposited == 0) {
                continue;
            }
            
            // Process refunds for all depositors
            for (uint256 j = 0; j < s.transfers.length; j++) {
                address from = s.transfers[j].from;
                UserDeposit storage ud = userDeposits[from][settlementId];
                
                if (ud.amount > 0 && ud.locked) {
                    uint256 refundAmount = ud.amount;
                    ud.amount = 0;
                    ud.locked = false;
                    
                    (bool success, ) = from.call{value: refundAmount}("");
                    if (success) {
                        totalRefundAmount += refundAmount;
                        emit RefundIssued(from, settlementId, refundAmount);
                    }
                }
            }
            
            s.state = SettlementState.FAILED;
            emit TimeoutRefundTriggered(settlementId, s.totalDeposited, block.number);
            refunded++;
        }
        
        return (refunded, totalRefundAmount);
    }

    /**
     * @notice Batch check invariants for multiple settlements
     * @param settlementIds Array of settlement IDs to check
     * @return results Array of booleans indicating invariant status
     * @return allHold Whether all invariants hold for all settlements
     */
    function batchCheckInvariants(uint256[] calldata settlementIds) 
        external 
        view 
        returns (bool[] memory results, bool allHold) 
    {
        results = new bool[](settlementIds.length);
        allHold = true;
        
        for (uint256 i = 0; i < settlementIds.length; i++) {
            if (settlementIds[i] < nextSettlementId) {
                (results[i], ) = verifyAllInvariants(settlementIds[i]);
                if (!results[i]) {
                    allHold = false;
                }
            } else {
                results[i] = false;
                allHold = false;
            }
        }
        
        return (results, allHold);
    }

    /**
     * @notice Get protocol statistics (simplified for efficiency)
     * @return totalSettlements Total number of settlements created
     * @return currentQueueLength Current queue length
     * @return queueHeadPos Current queue head position
     * @return queueTailPos Current queue tail position
     */
    function getProtocolStats() 
        external 
        view 
        returns (
            uint256 totalSettlements,
            uint256 currentQueueLength,
            uint256 queueHeadPos,
            uint256 queueTailPos
        ) 
    {
        totalSettlements = nextSettlementId;
        currentQueueLength = queueTail - queueHead;
        queueHeadPos = queueHead;
        queueTailPos = queueTail;
    }

    // ============================================
    // EMERGENCY FUNCTIONS
    // ============================================

    /**
     * @notice Emergency pause with reason logging
     * @param reason The reason for emergency pause
     */
    function emergencyPause(string calldata reason) external onlyAdmin {
        paused = true;
        emit MEVPreventionEnforced(0, reason);
    }

    /**
     * @notice Emergency pause a specific settlement
     * @param settlementId The settlement to pause
     * @param reason The reason for pausing
     */
    function emergencyPauseSettlement(uint256 settlementId, string calldata reason) 
        external 
        onlyAdmin 
    {
        require(settlementId < nextSettlementId, "Settlement does not exist");
        
        Settlement storage s = settlements[settlementId];
        require(s.state != SettlementState.FINALIZED, "Already finalized");
        require(s.state != SettlementState.FAILED, "Already failed");
        
        // Mark as disputed for admin intervention
        s.state = SettlementState.DISPUTED;
        s.disputeReason = reason;
        
        emit SettlementDisputed(settlementId, msg.sender, reason);
    }

    /**
     * @notice Force resolve a settlement (admin only, for emergencies)
     * @param settlementId The settlement to resolve
     * @param shouldFinalize True to finalize, false to fail
     */
    function emergencyResolve(uint256 settlementId, bool shouldFinalize) 
        external 
        onlyAdmin 
        nonReentrant 
    {
        require(settlementId < nextSettlementId, "Settlement does not exist");
        
        Settlement storage s = settlements[settlementId];
        require(s.state == SettlementState.DISPUTED, "Not disputed");
        
        if (shouldFinalize) {
            // Execute remaining transfers
            while (s.executedTransfers < s.transfers.length) {
                Transfer storage t = s.transfers[s.executedTransfers];
                
                UserDeposit storage ud = userDeposits[t.from][settlementId];
                if (ud.amount >= t.amount && ud.locked) {
                    ud.amount -= t.amount;
                    
                    (bool success, ) = t.to.call{value: t.amount}("");
                    if (success) {
                        t.executed = true;
                        emit TransferExecuted(settlementId, s.executedTransfers, t.from, t.to, t.amount);
                    }
                }
                s.executedTransfers++;
            }
            
            s.state = SettlementState.FINALIZED;
            emit SettlementFinalized(settlementId, block.number, s.totalDeposited);
            emit DisputeResolved(settlementId, s.oraclePrice, block.number);
        } else {
            // Refund all deposits
            for (uint256 i = 0; i < s.transfers.length; i++) {
                address from = s.transfers[i].from;
                UserDeposit storage ud = userDeposits[from][settlementId];
                
                if (ud.amount > 0 && ud.locked) {
                    uint256 refundAmount = ud.amount;
                    ud.amount = 0;
                    ud.locked = false;
                    
                    (bool success, ) = from.call{value: refundAmount}("");
                    if (success) {
                        emit RefundIssued(from, settlementId, refundAmount);
                    }
                }
            }
            
            s.state = SettlementState.FAILED;
            emit DisputeResolved(settlementId, 0, block.number);
        }
    }

    // ============================================
    // FINALITY MANAGEMENT
    // ============================================
    
    /**
     * @notice Register a validator for BFT quorum voting
     * @param validator Address of the validator to register
     */
    function registerValidator(address validator) external onlyAdmin {
        _addValidator(validator);
    }
    
    /**
     * @notice Remove a validator from BFT quorum
     * @param validator Address of the validator to remove
     */
    function removeValidator(address validator) external onlyAdmin {
        _removeValidator(validator);
    }
    
    /**
     * @notice Get complete finality information for a settlement
     * @param settlementId Settlement to check
     * @return phase Current finality phase (0=TENTATIVE, 1=SEMI_FINAL, 2=FINAL)
     * @return confirmations Number of block confirmations
     * @return confidence Confidence score 0-100
     * @return isFinal True if irreversibly final
     */
    function getSettlementFinality(
        uint256 settlementId
    ) external view returns (
        FinalityPhase phase,
        uint256 confirmations,
        uint256 confidence,
        bool isFinal
    ) {
        (phase,,,,confirmations, isFinal,) = getFinalityStatus(settlementId);
        confidence = getFinalityConfidence(settlementId);
    }
    
    /**
     * @notice Check if settlement is safe from reorgs
     * @param settlementId Settlement to check
     * @param requiredDepth Required confirmation depth
     * @return safe True if safe from reorgs at the specified depth
     */
    function isReorgSafeAtDepth(
        uint256 settlementId,
        uint256 requiredDepth
    ) external view returns (bool safe) {
        (,uint256 tentativeBlock,,,,, bool reorgDetected) = getFinalityStatus(settlementId);
        if (reorgDetected) return false;
        return block.number >= tentativeBlock + requiredDepth;
    }
    
    /**
     * @notice Manually trigger reorg detection (for testing/monitoring)
     * @param settlementId Settlement to check
     * @param expectedPrevHash Expected previous block hash
     */
    function checkForReorg(
        uint256 settlementId,
        bytes32 expectedPrevHash
    ) external returns (bool detected, uint256 depth) {
        return detectReorg(settlementId, expectedPrevHash);
    }
    
    /**
     * @notice Admin function to recover from detected reorg
     * @param settlementId Settlement to recover
     */
    function recoverFromReorg(uint256 settlementId) external onlyAdmin {
        Settlement storage s = settlements[settlementId];
        
        bytes32 newStateRoot = keccak256(abi.encode(
            settlementId,
            s.totalDeposited,
            block.number
        ));
        
        _recoverFromReorg(settlementId, FinalityPhase.TENTATIVE, newStateRoot);
    }

    // ============================================
    // RECEIVE FUNCTION
    // ============================================

    receive() external payable {
        revert("deposit");
    }
}
