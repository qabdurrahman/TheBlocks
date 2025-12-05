// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AccessControlEnhanced
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Role-Based Access Control with Dispute Bond mechanism
 * @dev Implements Defense #4 (Dispute Bond) and #7 (Role-Based Auth) from attack_flagship_strategy.md
 * 
 * FLAGSHIP FEATURES:
 * 1. Role-Based Authorization (SETTLER, ORACLE, ARBITRATOR, ADMIN)
 * 2. Dispute Bond Mechanism (Economic Security)
 * 3. Slashing for Byzantine Behavior
 * 
 * ROLES:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    ROLE HIERARCHY                               │
 * │  ┌───────────┐                                                  │
 * │  │   ADMIN   │ ← Can grant/revoke all roles                     │
 * │  └─────┬─────┘                                                  │
 * │        │                                                        │
 * │  ┌─────┴─────┬───────────────┬───────────────┐                 │
 * │  │           │               │               │                 │
 * │  ▼           ▼               ▼               ▼                 │
 * │ SETTLER   ORACLE       ARBITRATOR      GUARDIAN                │
 * │ (execute) (price)     (disputes)      (emergency)              │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * DISPUTE BOND:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Disputer posts bond → Dispute reviewed → Win: 2x bond         │
 * │                                        → Lose: bond slashed    │
 * └─────────────────────────────────────────────────────────────────┘
 */
abstract contract AccessControlEnhanced {
    
    // ============================================
    // ROLE DEFINITIONS
    // ============================================
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    
    /// @notice Role assignments
    mapping(address => mapping(bytes32 => bool)) public roles;
    
    /// @notice Role grant timestamps (for time-locked revocations)
    mapping(address => mapping(bytes32 => uint256)) public roleGrantTime;
    
    /// @notice Role count for each role type
    mapping(bytes32 => uint256) public roleCount;
    
    // ============================================
    // DISPUTE BOND MECHANISM
    // ============================================
    
    /// @notice Minimum bond required to dispute (0.1 ETH default)
    uint256 public constant MIN_DISPUTE_BOND = 0.1 ether;
    
    /// @notice Bond multiplier for successful dispute (2x = 200%)
    uint256 public constant DISPUTE_REWARD_MULTIPLIER = 200;
    
    /// @notice Slash percentage for failed dispute (100% = full bond)
    uint256 public constant DISPUTE_SLASH_PERCENT = 100;
    
    /**
     * @dev Dispute record with bond tracking
     */
    struct DisputeBond {
        address disputer;            // Who filed the dispute
        uint256 bondAmount;          // Amount bonded
        uint256 disputedPrice;       // Price being challenged
        uint256 proposedPrice;       // Disputer's claimed correct price
        uint256 settlementId;        // Which settlement
        uint256 createdBlock;        // When dispute was filed
        uint256 resolutionDeadline;  // When dispute must be resolved
        DisputeState state;          // Current state
    }
    
    enum DisputeState {
        PENDING,      // Awaiting arbitrator review
        APPROVED,     // Disputer was correct
        REJECTED,     // Disputer was wrong
        EXPIRED       // Resolution deadline passed
    }
    
    /// @notice Dispute records by ID
    mapping(uint256 => DisputeBond) public disputeBonds;
    uint256 public nextDisputeId;
    
    /// @notice Slashed bonds accumulator (for protocol treasury or stakers)
    uint256 public slashedBondsTotal;
    
    /// @notice Dispute resolution window (blocks)
    uint256 public constant DISPUTE_RESOLUTION_WINDOW = 100;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event RoleGranted(
        bytes32 indexed role,
        address indexed account,
        address indexed granter
    );
    
    event RoleRevoked(
        bytes32 indexed role,
        address indexed account,
        address indexed revoker
    );
    
    event DisputeFiled(
        uint256 indexed disputeId,
        uint256 indexed settlementId,
        address indexed disputer,
        uint256 bondAmount,
        uint256 disputedPrice,
        uint256 proposedPrice
    );
    
    event DisputeResolved(
        uint256 indexed disputeId,
        DisputeState result,
        address indexed disputer,
        uint256 payout,
        address indexed arbitrator
    );
    
    event BondSlashed(
        uint256 indexed disputeId,
        address indexed disputer,
        uint256 slashedAmount
    );
    
    event BondRewarded(
        uint256 indexed disputeId,
        address indexed disputer,
        uint256 rewardAmount
    );
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyRole(bytes32 role) {
        require(hasRole(role, msg.sender), "ACE: Insufficient role");
        _;
    }
    
    modifier onlyAdminOrSelf(address account) {
        require(
            hasRole(ADMIN_ROLE, msg.sender) || msg.sender == account,
            "ACE: Not admin or self"
        );
        _;
    }
    
    // ============================================
    // ROLE MANAGEMENT
    // ============================================
    
    /**
     * @notice Check if account has a specific role
     * @param role The role to check
     * @param account The account to check
     * @return hasTheRole Whether account has the role
     */
    function hasRole(bytes32 role, address account) 
        public 
        view 
        returns (bool hasTheRole) 
    {
        return roles[account][role];
    }
    
    /**
     * @notice Grant a role to an account
     * @param role The role to grant
     * @param account The account to grant role to
     */
    function grantRole(bytes32 role, address account) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(!roles[account][role], "ACE: Already has role");
        require(account != address(0), "ACE: Zero address");
        
        roles[account][role] = true;
        roleGrantTime[account][role] = block.timestamp;
        roleCount[role]++;
        
        emit RoleGranted(role, account, msg.sender);
    }
    
    /**
     * @notice Revoke a role from an account
     * @param role The role to revoke
     * @param account The account to revoke role from
     */
    function revokeRole(bytes32 role, address account) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(roles[account][role], "ACE: Does not have role");
        
        // Cannot revoke own admin role (prevent lockout)
        require(
            !(role == ADMIN_ROLE && account == msg.sender),
            "ACE: Cannot revoke own admin"
        );
        
        // Ensure at least one admin remains
        if (role == ADMIN_ROLE) {
            require(roleCount[ADMIN_ROLE] > 1, "ACE: Last admin");
        }
        
        roles[account][role] = false;
        roleCount[role]--;
        
        emit RoleRevoked(role, account, msg.sender);
    }
    
    /**
     * @notice Renounce a role (self-revoke)
     * @param role The role to renounce
     */
    function renounceRole(bytes32 role) external {
        require(roles[msg.sender][role], "ACE: Does not have role");
        
        // Cannot renounce if last admin
        if (role == ADMIN_ROLE) {
            require(roleCount[ADMIN_ROLE] > 1, "ACE: Last admin");
        }
        
        roles[msg.sender][role] = false;
        roleCount[role]--;
        
        emit RoleRevoked(role, msg.sender, msg.sender);
    }
    
    /**
     * @notice Initialize admin during construction
     * @param admin The initial admin address
     */
    function _initializeAdmin(address admin) internal {
        require(admin != address(0), "ACE: Zero admin");
        roles[admin][ADMIN_ROLE] = true;
        roleGrantTime[admin][ADMIN_ROLE] = block.timestamp;
        roleCount[ADMIN_ROLE] = 1;
        emit RoleGranted(ADMIN_ROLE, admin, address(0));
    }
    
    // ============================================
    // DISPUTE BOND FUNCTIONS
    // ============================================
    
    /**
     * @notice File a dispute with bond
     * @dev Disputer must send ETH >= MIN_DISPUTE_BOND
     * @param settlementId The settlement to dispute
     * @param disputedPrice The price being challenged
     * @param proposedPrice The correct price according to disputer
     * @return disputeId The ID of the created dispute
     */
    function fileDisputeWithBond(
        uint256 settlementId,
        uint256 disputedPrice,
        uint256 proposedPrice
    ) internal returns (uint256 disputeId) {
        require(msg.value >= MIN_DISPUTE_BOND, "ACE: Insufficient bond");
        require(proposedPrice != disputedPrice, "ACE: Same price");
        
        disputeId = nextDisputeId++;
        
        disputeBonds[disputeId] = DisputeBond({
            disputer: msg.sender,
            bondAmount: msg.value,
            disputedPrice: disputedPrice,
            proposedPrice: proposedPrice,
            settlementId: settlementId,
            createdBlock: block.number,
            resolutionDeadline: block.number + DISPUTE_RESOLUTION_WINDOW,
            state: DisputeState.PENDING
        });
        
        emit DisputeFiled(
            disputeId,
            settlementId,
            msg.sender,
            msg.value,
            disputedPrice,
            proposedPrice
        );
        
        return disputeId;
    }
    
    /**
     * @notice Resolve a dispute (arbitrator only)
     * @param disputeId The dispute to resolve
     * @param disputerCorrect Whether the disputer was correct
     */
    function resolveDisputeWithBond(
        uint256 disputeId,
        bool disputerCorrect
    ) internal {
        DisputeBond storage d = disputeBonds[disputeId];
        
        require(d.disputer != address(0), "ACE: Dispute not found");
        require(d.state == DisputeState.PENDING, "ACE: Already resolved");
        require(block.number <= d.resolutionDeadline, "ACE: Resolution expired");
        
        if (disputerCorrect) {
            // Disputer was right: reward 2x bond
            d.state = DisputeState.APPROVED;
            
            uint256 reward = (d.bondAmount * DISPUTE_REWARD_MULTIPLIER) / 100;
            
            // Pay from slashed bonds pool or contract balance
            uint256 payout = d.bondAmount; // Return original bond
            uint256 bonus = reward - d.bondAmount; // Calculate bonus
            
            if (address(this).balance >= reward && slashedBondsTotal >= bonus) {
                payout = reward;
                slashedBondsTotal -= bonus;
            }
            
            (bool success, ) = d.disputer.call{value: payout}("");
            require(success, "ACE: Reward transfer failed");
            
            emit BondRewarded(disputeId, d.disputer, payout);
            emit DisputeResolved(disputeId, DisputeState.APPROVED, d.disputer, payout, msg.sender);
        } else {
            // Disputer was wrong: slash bond
            d.state = DisputeState.REJECTED;
            
            slashedBondsTotal += d.bondAmount;
            
            emit BondSlashed(disputeId, d.disputer, d.bondAmount);
            emit DisputeResolved(disputeId, DisputeState.REJECTED, d.disputer, 0, msg.sender);
        }
    }
    
    /**
     * @notice Expire a dispute that wasn't resolved in time
     * @dev Anyone can call this for expired disputes, bond is returned
     * @param disputeId The dispute to expire
     */
    function expireDispute(uint256 disputeId) external {
        DisputeBond storage d = disputeBonds[disputeId];
        
        require(d.disputer != address(0), "ACE: Dispute not found");
        require(d.state == DisputeState.PENDING, "ACE: Already resolved");
        require(block.number > d.resolutionDeadline, "ACE: Not expired yet");
        
        d.state = DisputeState.EXPIRED;
        
        // Return bond on expiration (arbitrator failed to act)
        (bool success, ) = d.disputer.call{value: d.bondAmount}("");
        require(success, "ACE: Refund failed");
        
        emit DisputeResolved(disputeId, DisputeState.EXPIRED, d.disputer, d.bondAmount, address(0));
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get dispute details
     */
    function getDispute(uint256 disputeId) 
        external 
        view 
        returns (
            address disputer,
            uint256 bondAmount,
            uint256 disputedPrice,
            uint256 proposedPrice,
            uint256 settlementId,
            uint256 createdBlock,
            uint256 resolutionDeadline,
            DisputeState state
        ) 
    {
        DisputeBond storage d = disputeBonds[disputeId];
        return (
            d.disputer,
            d.bondAmount,
            d.disputedPrice,
            d.proposedPrice,
            d.settlementId,
            d.createdBlock,
            d.resolutionDeadline,
            d.state
        );
    }
    
    /**
     * @notice Get total slashed bonds available
     */
    function getSlashedBondsTotal() external view returns (uint256) {
        return slashedBondsTotal;
    }
    
    /**
     * @notice Get role count for a specific role
     */
    function getRoleCount(bytes32 role) external view returns (uint256) {
        return roleCount[role];
    }
    
    /**
     * @notice Check if account has any privileged role
     */
    function hasAnyRole(address account) external view returns (bool) {
        return roles[account][ADMIN_ROLE] ||
               roles[account][SETTLER_ROLE] ||
               roles[account][ORACLE_ROLE] ||
               roles[account][ARBITRATOR_ROLE] ||
               roles[account][GUARDIAN_ROLE];
    }
    
    /**
     * @notice Get all roles for an account
     */
    function getAccountRoles(address account) 
        external 
        view 
        returns (
            bool isAdmin,
            bool isSettler,
            bool isOracle,
            bool isArbitrator,
            bool isGuardian
        ) 
    {
        return (
            roles[account][ADMIN_ROLE],
            roles[account][SETTLER_ROLE],
            roles[account][ORACLE_ROLE],
            roles[account][ARBITRATOR_ROLE],
            roles[account][GUARDIAN_ROLE]
        );
    }
}
