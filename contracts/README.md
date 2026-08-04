# DMpay.eth — Protocol

> On-chain contracts powering the DMpay.eth paid messaging protocol on Ethereum mainnet.

**Frontend:** [app.dmpay.me](https://app.dmpay.me) · [DMpay-IPFS](https://github.com/RWA-ID/DMpay-IPFS)

---

## Overview

DMpay.eth is a decentralised paid direct messaging protocol. A recipient sets their own price to be messaged; a sender pays it to open a conversation. Messages themselves are end-to-end encrypted over XMTP — the contract settles payment and records access, never content.

Identity is plain ENS. Users bring the name they already own, and the app reads it via forward/reverse resolution. The protocol does not mint handles.

All funds flow directly between sender and recipient. DMpay takes a 2.5% protocol fee (`FEE_BPS = 250`); the remaining 97.5% goes to the recipient in the same transaction. No custody, no escrow, no intermediaries.

---

## Contracts

### DMPayDirectV2

The live contract. Pricing, access control, and paid groups in one place — pricing is a `mapping(address => Price)` on the contract itself, so there is no registry lookup.

**Mainnet:** `0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52` (deployed at block 25169356)

Every paid action has a USDC and an ETH variant. USDC paths need prior approval for this contract.

#### Pricing

```solidity
// Set your four prices at once. Any of them may be 0 to disable that path.
function setPrice(uint256 _usdc, uint256 _eth, uint256 _lifetimeUsdc, uint256 _lifetimeEth) external
```

#### Paying to talk

```solidity
// Pay the recipient's list price to open a conversation
function openConversationUSDC(address recipient) external
function openConversationETH(address recipient) external payable

// Pay per message (sender-chosen amount in USDC, msg.value in ETH)
function payMessageUSDC(address recipient, uint256 amount) external
function payMessageETH(address recipient) external payable

// Buy permanent access to a recipient
function buyLifetimePassUSDC(address recipient) external
function buyLifetimePassETH(address recipient) external payable

function isUnlocked(address recipient, address sender) external view returns (bool)
```

#### Receiver-side controls

These are the V2 additions. A recipient can block a sender permanently, or close a conversation so the sender must pay again to reopen it:

```solidity
function blockSender(address sender) external
function unblockSender(address sender) external
function closeConversation(address sender) external
```

Access is tracked as two timestamps per (recipient, sender) pair — `openedAt` and `closedAt`. A sender is unlocked while `openedAt > closedAt`, which makes `closeConversation` a re-monetisation primitive rather than a ban.

**A lifetime pass bypasses both.** Pass holders cannot be blocked or closed out, and they join that creator's paid groups for free. That is deliberate: the pass is a promise, so the receiver-side controls cannot retroactively void something already sold.

It cuts the other way too — `buyLifetimePass*` is intentionally *not* gated on `blockedSenders`, so a blocked sender can buy their way back in. A recipient who wants blocks to be absolute disables both lifetime tiers with `setPrice(usdc, eth, 0, 0)`. Blocking someone while still offering a lifetime price is an offer, not a wall.

#### Paid groups

```solidity
function createGroup(uint256 priceUsdc, uint256 priceEth, uint64 capacity) external returns (uint256 id)
function joinGroupUSDC(uint256 id) external
function joinGroupETH(uint256 id) external payable

function setGroupXmtpId(uint256 id, bytes32 xmtpGroupId) external  // creator only
function removeGroupMember(uint256 id, address member) external     // creator only
function closeGroup(uint256 id) external                            // creator only
```

Groups are identified by an incrementing `id`. `capacity = 0` means unlimited. The XMTP conversation is created off-chain and bound to the group afterwards via `setGroupXmtpId`, so on-chain membership is the source of truth for who has paid, and XMTP is the transport.

#### Fee handling

USDC fees transfer straight to the treasury during payment. ETH fees cannot — pushing to the treasury on every call would let a reverting treasury brick payments — so they accrue in `accumulatedEthFees` and the owner sweeps them:

```solidity
function setTreasury(address _treasury) external onlyOwner
function withdrawEthFees() external onlyOwner
```

---

### Legacy contracts

Still deployed, no longer called by the app. Kept here for reference and because they hold live state.

| Contract | Address | Status |
|---|---|---|
| DMPayDirect (V1) | `0xa204f8242A535979821d96093238B5ccC268631E` | Superseded by V2 |
| DMPayRegistry | `0x58d02e17bdCf0fdae2e134Da280e6084552F76f5` | Retired handle-minting era |
| DMPayMessaging | `0x588C943Bd4f59888B2F6ECA0b2BfB123B57b0a10` | Retired handle-minting era |

`DMPayRegistry` and `DMPayMessaging` are from the original design, where DMpay authenticated users via X OAuth, minted them a `handle.dmpay.eth` subdomain, and pinned a generated profile page to IPFS. That flow is gone — users bring their own ENS name now — but the subdomains minted under it still exist and still resolve.

**V1 → V2 state does not carry over.** A recipient who priced on V1 must call `setPrice` once on V2 to re-enable paid DMs. V1 remains callable; only the dapp moved.

---

## Deployments

### Mainnet

| Contract | Address |
|---|---|
| DMPayDirectV2 | `0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| ENS Public Resolver | `0xF29100983E058B709F3D539b0c765937B804AC15` |
| ENS Base Registrar | `0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85` |

### Sepolia (Testnet)

Deploy `MockUSDC` first, then pass its address as the constructor's `usdc` argument.

---

## Getting Started

### Prerequisites

- Node.js 20+
- An Ethereum RPC URL (Alchemy or Infura recommended)
- A funded deployer wallet private key

### Install

```bash
git clone https://github.com/RWA-ID/DMpay-Protocol.git
cd DMpay-Protocol/contracts
npm install
```

### Environment Variables

Create a `.env` file inside `contracts/`:

```env
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
PRIVATE_KEY=your_deployer_private_key
ETHERSCAN_API_KEY=your_etherscan_key
```

### Compile & test

```bash
npx hardhat compile
npx hardhat test
```

### Deploy V2 to mainnet

```bash
npx hardhat run scripts/deploy-v2-mainnet.ts
```

The script prints deployer, USDC, treasury, balance, and gas price before deploying — read them before confirming. The constructor takes `(usdc, treasury)`; the treasury is set at deploy time and changeable afterwards via `setTreasury`.

The `ignition/modules/` directory holds the older deployment modules for the legacy contracts.

---

## Project Structure

```
contracts/
├── contracts/
│   ├── DMPayDirectV2.sol        # Current: paid DMs, groups, block/close, bypass
│   ├── DMPayDirect.sol          # Superseded by V2
│   ├── DMPayRegistry.sol        # Legacy: profile registry + ENS subdomain manager
│   └── DMPayMessaging.sol       # Legacy: pay-to-message USDC payment handler
├── ignition/
│   └── modules/
│       ├── DMPay.ts             # Sepolia deployment module
│       ├── DMPayMainnet.ts      # Mainnet deployment module
│       └── DMPayDirectMainnet.ts
├── scripts/
│   ├── deploy-v2-mainnet.ts     # DMPayDirectV2 mainnet deployment
│   └── send-op-tx.ts            # Utility for sending ops transactions
├── hardhat.config.ts            # Hardhat configuration
└── test/
    ├── DMPayDirectV2.ts
    ├── DMPayDirect.ts
    └── Counter.ts
```

---

## Architecture

```
Sender                    DMPayDirectV2                    Recipient
  │                             │                              │
  │── openConversationUSDC ────>│                              │
  │                             │  read priceOf[recipient]     │
  │                             │  require !blocked            │
  │                             │                              │
  │                             │── transferFrom(sender, recipient, 97.5%) ──>│
  │                             │── transferFrom(sender, treasury,  2.5%)
  │                             │  openedAt[recipient][sender] = now
  │<── success ────────────────-│                              │
  │                             │
  │        ... later, recipient calls closeConversation(sender):
  │                             │  closedAt[recipient][sender] = now
  │                             │  → isUnlocked() false again, sender must repay
  │                             │  → unless hasLifetimePass[recipient][sender]
```

The ETH paths are identical except the 2.5% accrues to `accumulatedEthFees` instead of transferring, and the 97.5% is a `call{value:}` to the recipient.

---

## ENS Integration

The protocol contract has no ENS dependency. Resolution happens entirely client-side:

- The app resolves a wallet to a name via ENS reverse resolution, then forward-resolves to confirm the round trip
- **Expiry is checked against `BaseRegistrar.nameExpires`** — an expired name still passes the forward/reverse round trip, so the round trip alone is not proof of ownership
- Group identity is published as ENS text records under `me.dmpay.group.<id>`, letting non-members see what a paid group is before joining

The legacy `dmpay.eth` parent domain is still owned by the deployer wallet, and `DMPayRegistry` still holds `setApprovalForAll` on the ENS registry from the handle-minting era.

---

## Security

- **No upgradeability.** What is deployed is what runs.
- **No custody.** Funds never rest in the contract on the USDC path; sender→recipient and sender→treasury are two transfers inside one call. Only accrued ETH fees sit in the contract.
- **Reentrancy.** Every payable and token-moving entrypoint is `nonReentrant`. Note that the conversation paths write `openedAt` *after* the ETH `call`, so the guard is doing real work here rather than being belt-and-braces over checks-effects-interactions ordering.
- **Fee rate is a constant**, not owner-settable. The owner can change the treasury address and sweep ETH fees, nothing else.
- **Pricing is self-sovereign.** Only a recipient can set their own price, block, or close. There is no admin path to message someone for free or to revoke a sold lifetime pass.

---

## License

MIT
