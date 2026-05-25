// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DMPayDirectV2
/// @notice V2 adds receiver-side block / close primitives and lifetime-pass
///         bypass. Lifetime pass holders cannot be blocked or closed, and they
///         join the creator's paid groups for free.
///
///         Migration from V1: state does not carry over. Recipients call
///         setPrice() once on V2 to re-enable paid DMs. V1 contract remains
///         callable; the dapp points at V2.
contract DMPayDirectV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public treasury;

    uint256 public constant FEE_BPS = 250;       // 2.5%
    uint256 public constant BPS_BASE = 10000;

    // --- 1:1 pricing ----------------------------------------------------------

    struct Price {
        uint256 usdc;
        uint256 eth;
        uint256 lifetimeUsdc;
        uint256 lifetimeEth;
    }
    mapping(address => Price) public priceOf;
    mapping(address => mapping(address => bool)) public hasLifetimePass; // recipient => sender => pass

    // --- V2: receiver-side controls -------------------------------------------

    /// @dev recipient => sender => permanent block (lifetime bypasses).
    mapping(address => mapping(address => bool)) public blockedSenders;

    /// @dev recipient => sender => timestamp the receiver last closed.
    ///      Sender's open is considered fresh iff openedAt > closedAt.
    mapping(address => mapping(address => uint64)) public closedAt;

    /// @dev recipient => sender => timestamp of sender's last open.
    mapping(address => mapping(address => uint64)) public openedAt;

    // --- Groups ---------------------------------------------------------------

    struct Group {
        address creator;
        uint256 priceUsdc;
        uint256 priceEth;
        uint64 capacity;       // 0 = unlimited
        uint64 memberCount;
        bool active;
        bytes32 xmtpGroupId;
    }
    mapping(uint256 => Group) public groups;
    mapping(uint256 => mapping(address => bool)) public isGroupMember;
    uint256 public nextGroupId;

    // --- Accounting -----------------------------------------------------------

    uint256 public accumulatedEthFees;

    // --- Events ---------------------------------------------------------------

    event PriceSet(address indexed user, uint256 usdc, uint256 eth, uint256 lifetimeUsdc, uint256 lifetimeEth);
    event ConversationOpened(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee);
    event MessagePaid(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee);
    event LifetimePassPurchased(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee);

    event SenderBlocked(address indexed recipient, address indexed sender);
    event SenderUnblocked(address indexed recipient, address indexed sender);
    event ConversationClosed(address indexed recipient, address indexed sender, uint64 closedAt);

    event GroupCreated(uint256 indexed id, address indexed creator, uint256 priceUsdc, uint256 priceEth, uint64 capacity);
    event GroupXmtpIdSet(uint256 indexed id, bytes32 xmtpGroupId);
    event GroupJoined(uint256 indexed id, address indexed member, address indexed token, uint256 amountPaid, uint256 fee);
    event GroupMemberRemoved(uint256 indexed id, address indexed member);
    event GroupClosed(uint256 indexed id);

    event TreasuryUpdated(address indexed newTreasury);

    constructor(address _usdc, address _treasury) Ownable(msg.sender) {
        require(_usdc != address(0), "usdc=0");
        require(_treasury != address(0), "treasury=0");
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // ============================================================
    // Recipient config
    // ============================================================

    function setPrice(uint256 _usdc, uint256 _eth, uint256 _lifetimeUsdc, uint256 _lifetimeEth) external {
        priceOf[msg.sender] = Price(_usdc, _eth, _lifetimeUsdc, _lifetimeEth);
        emit PriceSet(msg.sender, _usdc, _eth, _lifetimeUsdc, _lifetimeEth);
    }

    // ============================================================
    // Receiver-side block / close
    // ============================================================

    /// @notice Permanently block `sender` from opening / paying / joining your
    ///         groups. Lifetime pass holders are exempt.
    function blockSender(address sender) external {
        blockedSenders[msg.sender][sender] = true;
        emit SenderBlocked(msg.sender, sender);
    }

    function unblockSender(address sender) external {
        blockedSenders[msg.sender][sender] = false;
        emit SenderUnblocked(msg.sender, sender);
    }

    /// @notice Close `sender`'s current open. They'll need to pay again to
    ///         re-open. Lifetime pass holders are exempt (their unlock survives).
    function closeConversation(address sender) external {
        uint64 ts = uint64(block.timestamp);
        closedAt[msg.sender][sender] = ts;
        emit ConversationClosed(msg.sender, sender, ts);
    }

    /// @notice True if `sender` has an active 1:1 unlock with `recipient`.
    function isUnlocked(address recipient, address sender) external view returns (bool) {
        return _isUnlocked(recipient, sender);
    }

    function _isUnlocked(address recipient, address sender) internal view returns (bool) {
        if (hasLifetimePass[recipient][sender]) return true;
        if (blockedSenders[recipient][sender]) return false;
        uint64 opened = openedAt[recipient][sender];
        if (opened == 0) return false;
        return opened > closedAt[recipient][sender];
    }

    // ============================================================
    // 1:1 payments
    // ============================================================

    function openConversationUSDC(address recipient) external nonReentrant {
        _requireNotBlocked(recipient);
        uint256 price = priceOf[recipient].usdc;
        require(price > 0, "USDC not accepted");
        _payUSDC(recipient, price);
        openedAt[recipient][msg.sender] = uint64(block.timestamp);
        emit ConversationOpened(msg.sender, recipient, address(usdc), price, _feeOf(price));
    }

    function openConversationETH(address recipient) external payable nonReentrant {
        _requireNotBlocked(recipient);
        uint256 price = priceOf[recipient].eth;
        require(price > 0, "ETH not accepted");
        require(msg.value == price, "wrong eth amount");
        _payETH(recipient, price);
        openedAt[recipient][msg.sender] = uint64(block.timestamp);
        emit ConversationOpened(msg.sender, recipient, address(0), price, _feeOf(price));
    }

    function payMessageUSDC(address recipient, uint256 amount) external nonReentrant {
        _requireNotBlocked(recipient);
        require(amount > 0, "amount=0");
        _payUSDC(recipient, amount);
        emit MessagePaid(msg.sender, recipient, address(usdc), amount, _feeOf(amount));
    }

    function payMessageETH(address recipient) external payable nonReentrant {
        _requireNotBlocked(recipient);
        require(msg.value > 0, "amount=0");
        _payETH(recipient, msg.value);
        emit MessagePaid(msg.sender, recipient, address(0), msg.value, _feeOf(msg.value));
    }

    // ============================================================
    // Lifetime passes
    // ============================================================
    // NOTE: intentionally NOT gated on blockedSenders. Buying a lifetime pass
    // is the escape hatch from a block — if a recipient never wants to be
    // overrideable, they can disable both lifetime tiers via setPrice(.., 0, 0).

    function buyLifetimePassUSDC(address recipient) external nonReentrant {
        uint256 price = priceOf[recipient].lifetimeUsdc;
        require(price > 0, "Lifetime USDC not offered");
        require(!hasLifetimePass[recipient][msg.sender], "already has pass");
        hasLifetimePass[recipient][msg.sender] = true;
        _payUSDC(recipient, price);
        emit LifetimePassPurchased(msg.sender, recipient, address(usdc), price, _feeOf(price));
    }

    function buyLifetimePassETH(address recipient) external payable nonReentrant {
        uint256 price = priceOf[recipient].lifetimeEth;
        require(price > 0, "Lifetime ETH not offered");
        require(msg.value == price, "wrong eth amount");
        require(!hasLifetimePass[recipient][msg.sender], "already has pass");
        hasLifetimePass[recipient][msg.sender] = true;
        _payETH(recipient, price);
        emit LifetimePassPurchased(msg.sender, recipient, address(0), price, _feeOf(price));
    }

    // ============================================================
    // Groups
    // ============================================================

    function createGroup(uint256 priceUsdc, uint256 priceEth, uint64 capacity) external returns (uint256 id) {
        require(priceUsdc > 0 || priceEth > 0, "no price set");
        id = nextGroupId++;
        groups[id] = Group({
            creator: msg.sender,
            priceUsdc: priceUsdc,
            priceEth: priceEth,
            capacity: capacity,
            memberCount: 1,
            active: true,
            xmtpGroupId: bytes32(0)
        });
        isGroupMember[id][msg.sender] = true;
        emit GroupCreated(id, msg.sender, priceUsdc, priceEth, capacity);
    }

    function setGroupXmtpId(uint256 id, bytes32 xmtpGroupId) external {
        Group storage g = groups[id];
        require(g.creator == msg.sender, "not creator");
        g.xmtpGroupId = xmtpGroupId;
        emit GroupXmtpIdSet(id, xmtpGroupId);
    }

    function closeGroup(uint256 id) external {
        Group storage g = groups[id];
        require(g.creator == msg.sender, "not creator");
        g.active = false;
        emit GroupClosed(id);
    }

    /// @notice Creator can evict a member. Removed member can re-join by paying
    ///         again (lifetime pass holders re-join free).
    function removeGroupMember(uint256 id, address member) external {
        Group storage g = groups[id];
        require(g.creator == msg.sender, "not creator");
        require(member != g.creator, "cannot remove creator");
        require(isGroupMember[id][member], "not member");
        isGroupMember[id][member] = false;
        unchecked { g.memberCount -= 1; }
        emit GroupMemberRemoved(id, member);
    }

    function joinGroupUSDC(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        _preJoin(g, id);
        if (hasLifetimePass[g.creator][msg.sender]) {
            // Lifetime pass holder: free entry, no token transfer.
            isGroupMember[id][msg.sender] = true;
            unchecked { g.memberCount += 1; }
            emit GroupJoined(id, msg.sender, address(0), 0, 0);
            return;
        }
        require(!blockedSenders[g.creator][msg.sender], "blocked");
        uint256 price = g.priceUsdc;
        require(price > 0, "USDC not accepted");
        _payUSDC(g.creator, price);
        isGroupMember[id][msg.sender] = true;
        unchecked { g.memberCount += 1; }
        emit GroupJoined(id, msg.sender, address(usdc), price, _feeOf(price));
    }

    function joinGroupETH(uint256 id) external payable nonReentrant {
        Group storage g = groups[id];
        _preJoin(g, id);
        if (hasLifetimePass[g.creator][msg.sender]) {
            require(msg.value == 0, "lifetime: send no eth");
            isGroupMember[id][msg.sender] = true;
            unchecked { g.memberCount += 1; }
            emit GroupJoined(id, msg.sender, address(0), 0, 0);
            return;
        }
        require(!blockedSenders[g.creator][msg.sender], "blocked");
        uint256 price = g.priceEth;
        require(price > 0, "ETH not accepted");
        require(msg.value == price, "wrong eth amount");
        _payETH(g.creator, price);
        isGroupMember[id][msg.sender] = true;
        unchecked { g.memberCount += 1; }
        emit GroupJoined(id, msg.sender, address(0), price, _feeOf(price));
    }

    function _preJoin(Group storage g, uint256 id) internal view {
        require(g.creator != address(0), "no group");
        require(g.active, "group closed");
        require(!isGroupMember[id][msg.sender], "already member");
        require(g.capacity == 0 || g.memberCount < g.capacity, "group full");
    }

    // ============================================================
    // Internal payment helpers
    // ============================================================

    function _requireNotBlocked(address recipient) internal view {
        if (blockedSenders[recipient][msg.sender] && !hasLifetimePass[recipient][msg.sender]) {
            revert("blocked");
        }
    }

    function _feeOf(uint256 amount) internal pure returns (uint256) {
        return (amount * FEE_BPS) / BPS_BASE;
    }

    function _payUSDC(address recipient, uint256 amount) internal {
        uint256 fee = _feeOf(amount);
        uint256 net = amount - fee;
        usdc.safeTransferFrom(msg.sender, recipient, net);
        if (fee > 0) usdc.safeTransferFrom(msg.sender, treasury, fee);
    }

    function _payETH(address recipient, uint256 amount) internal {
        uint256 fee = _feeOf(amount);
        uint256 net = amount - fee;
        (bool ok, ) = recipient.call{value: net}("");
        require(ok, "eth to recipient failed");
        if (fee > 0) accumulatedEthFees += fee;
    }

    // ============================================================
    // Admin
    // ============================================================

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function withdrawEthFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedEthFees;
        accumulatedEthFees = 0;
        (bool ok, ) = treasury.call{value: amount}("");
        require(ok, "eth withdraw failed");
    }
}
