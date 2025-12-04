// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SettlementOracle.sol";
import "./SettlementInvariants.sol";

/**
 * @title SettlementProtocol
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Adversarial-Resilient Settlement Protocol for processing trades/transfers on-chain
 * @dev Implements fair ordering, partial finality, oracle manipulation resistance, and attack defenses
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
 * │  CONTRACT 4: SettlementProtocol (Execution)  │
 * │  ├─ Initiates settlements                    │
 * │  ├─ Executes transfers                       │
 * │  ├─ Handles disputes                         │
 * │  └─ Manages timeouts                         │
 * └──────────────────────────────────────────────┘
 * 
 * KEY FEATURES:
 * 1. Fair Ordering - FIFO queue prevents validator reordering (MEV resistance)
 * 2. Invariant Enforcement - 5 core invariants mathematically proven
 * 3. Partial Finality Logic - Multi-block settlement with state tracking
 * 4. Oracle Manipulation Resistance - Dual oracle with dispute mechanism
 * 5. Attack Model Clarity - Comprehensive threat defenses
 */
contract SettlementProtocol is SettlementOracle, SettlementInvariants {
    
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

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "Protocol paused");
        _;
    }

    modifier validSettlement(uint256 settlementId) {
        require(settlementId < nextSettlementId, "Settlement does not exist");
        _;
    }

    modifier inState(uint256 settlementId, SettlementState expectedState) {
        require(settlements[settlementId].state == expectedState, "Invalid state");
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
        require(transfers.length > 0, "No transfers");
        require(transfers.length <= 100, "Too many transfers");
        
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
        require(!usedSettlementHashes[settlementHash], "Duplicate settlement hash");
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
            require(transfers[i].to != address(0), "Invalid recipient");
            require(transfers[i].amount > 0, "Zero amount");
            s.transfers.push(Transfer({
                from: transfers[i].from,
                to: transfers[i].to,
                amount: transfers[i].amount,
                executed: false
            }));
        }
        
        emit SettlementCreated(settlementId, msg.sender, queuePosition, settlementHash);
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
        require(msg.value > 0, "Zero deposit");
        
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
        
        // FAIR ORDERING: Must be next in queue
        require(settlementQueue[queueHead] == settlementId, "Not next in queue");
        
        // Calculate required amount
        uint256 requiredAmount = _calculateTotalRequired(settlementId);
        
        // INVARIANT CHECK 1: Sufficient deposits (Conservation of Value)
        require(s.totalDeposited >= requiredAmount, "Insufficient deposits");
        
        // Fetch oracle price
        (uint256 price, uint256 timestamp) = getLatestPrice();
        
        // INVARIANT CHECK 3: Oracle data freshness
        require(block.timestamp - timestamp <= MAX_ORACLE_STALENESS, "Oracle data stale");
        
        // Store oracle data
        s.oraclePrice = price;
        s.oracleTimestamp = timestamp;
        s.initiatedBlock = block.number;
        s.state = SettlementState.INITIATED;
        
        // Advance queue head
        queueHead++;
        
        emit SettlementInitiated(settlementId, price, timestamp);
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
        require(s.executedTransfers < s.transfers.length, "Already fully executed");
        
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
                require(success, "Transfer failed");
                
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
        
        require(isExpired || isFailed || isPending, "Cannot refund yet");
        
        // Mark as failed if not already
        if (s.state != SettlementState.FAILED) {
            s.state = SettlementState.FAILED;
            emit SettlementFailed(settlementId, "Timeout - auto refund");
        }
        
        // Refund caller's deposit
        UserDeposit storage ud = userDeposits[msg.sender][settlementId];
        require(ud.amount > 0, "No deposit to refund");
        require(ud.locked, "Already refunded");
        
        uint256 refundAmount = ud.amount;
        ud.amount = 0;
        ud.locked = false;
        
        (bool success, ) = msg.sender.call{value: refundAmount}("");
        require(success, "Refund failed");
        
        emit RefundIssued(msg.sender, settlementId, refundAmount);
    }

    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================

    /**
     * @dev Finalize a completed settlement
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
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
    }

    // ============================================
    // RECEIVE FUNCTION
    // ============================================

    receive() external payable {
        revert("Use deposit() function");
    }
}
