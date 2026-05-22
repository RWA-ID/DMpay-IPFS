// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DMPayDirect
/// @notice Pay-to-DM in USDC or ETH. No registry, no handle — recipients are addresses.
///         Supports per-conversation pricing, lifetime "always message" passes,
///         and one-time-payment group chats. Identity resolved off-chain via ENS.
contract DMPayDirect is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public treasury;

    uint256 public constant FEE_BPS = 250;       // 2.5%
    uint256 public constant BPS_BASE = 10000;

    // --- 1:1 pricing ----------------------------------------------------------

    struct Price {
        uint256 usdc;          // per-conversation USDC (0 = disabled)
        uint256 eth;           // per-conversation ETH  (0 = disabled)
        uint256 lifetimeUsdc;  // pay once for forever access (0 = disabled)
        uint256 lifetimeEth;   // pay once for forever access (0 = disabled)
    }
    mapping(address => Price) public priceOf;
    mapping(address => mapping(address => bool)) public hasLifetimePass; // recipient => sender => pass

    // --- Groups ---------------------------------------------------------------

    struct Group {
        address creator;
        uint256 priceUsdc;
        uint256 priceEth;
        uint64 capacity;       // 0 = unlimited
        uint64 memberCount;
        bool active;
        bytes32 xmtpGroupId;   // optional linkage to XMTP group, set by creator
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

    event GroupCreated(uint256 indexed id, address indexed creator, uint256 priceUsdc, uint256 priceEth, uint64 capacity);
    event GroupXmtpIdSet(uint256 indexed id, bytes32 xmtpGroupId);
    event GroupJoined(uint256 indexed id, address indexed member, address indexed token, uint256 amountPaid, uint256 fee);
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

    /// @notice Set all four price tiers. Pass 0 to disable a tier.
    function setPrice(uint256 _usdc, uint256 _eth, uint256 _lifetimeUsdc, uint256 _lifetimeEth) external {
        priceOf[msg.sender] = Price(_usdc, _eth, _lifetimeUsdc, _lifetimeEth);
        emit PriceSet(msg.sender, _usdc, _eth, _lifetimeUsdc, _lifetimeEth);
    }

    // ============================================================
    // 1:1 payments
    // ============================================================

    function openConversationUSDC(address recipient) external nonReentrant {
        uint256 price = priceOf[recipient].usdc;
        require(price > 0, "USDC not accepted");
        _payUSDC(recipient, price);
        emit ConversationOpened(msg.sender, recipient, address(usdc), price, _feeOf(price));
    }

    function openConversationETH(address recipient) external payable nonReentrant {
        uint256 price = priceOf[recipient].eth;
        require(price > 0, "ETH not accepted");
        require(msg.value == price, "wrong eth amount");
        _payETH(recipient, price);
        emit ConversationOpened(msg.sender, recipient, address(0), price, _feeOf(price));
    }

    function payMessageUSDC(address recipient, uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        _payUSDC(recipient, amount);
        emit MessagePaid(msg.sender, recipient, address(usdc), amount, _feeOf(amount));
    }

    function payMessageETH(address recipient) external payable nonReentrant {
        require(msg.value > 0, "amount=0");
        _payETH(recipient, msg.value);
        emit MessagePaid(msg.sender, recipient, address(0), msg.value, _feeOf(msg.value));
    }

    // ============================================================
    // Lifetime passes
    // ============================================================

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

    function joinGroupUSDC(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        _preJoin(g, id);
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
