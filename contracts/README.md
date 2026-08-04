# DMpay.eth — Protocol

> On-chain contracts powering the DMpay.eth paid messaging protocol on Ethereum mainnet.

**Frontend:** [app.dmpay.me](https://app.dmpay.me) · [DMpay-Frontend](https://github.com/RWA-ID/DMpay-Frontend)

---

## Overview

DMpay.eth is a decentralised paid direct messaging protocol. Users register profiles on-chain, set a USDC price for receiving messages, and senders pay that price to open a conversation. The protocol integrates with ENS for identity (subdomains under `dmpay.eth`) and XMTP for end-to-end encrypted messaging.

All funds flow directly between sender and recipient — DMpay takes a 2.5% protocol fee, the remaining 97.5% goes to the recipient. No custody, no intermediaries.

---

## Contracts

### DMPayRegistry

Manages user profiles and ENS subdomain registration.

**Mainnet:** `0x58d02e17bdCf0fdae2e134Da280e6084552F76f5`

Key functions:

```solidity
// Register a new profile with an ENS handle and USDC price
function registerProfile(string calldata handle, uint256 price) external

// Update the IPFS contenthash for your ENS subdomain
function updateIPFSHash(bytes calldata contenthash) external

// Look up a profile by handle
function getProfile(string calldata handle) external view returns (Profile memory)

// Look up a profile by wallet address
function getProfileByWallet(address wallet) external view returns (Profile memory)
```

On registration, the contract:
1. Creates an ENS subdomain `handle.dmpay.eth` via the ENS registry
2. Sets the resolver to the ENS Public Resolver
3. Sets the ETH address record on the resolver

After IPFS pinning, `updateIPFSHash` sets the ENS contenthash, enabling `handle.dmpay.eth` to resolve to a personalised IPFS profile page.

---

### DMPayMessaging

Handles pay-to-message payments in USDC.

**Mainnet:** `0x588C943Bd4f59888B2F6ECA0b2BfB123B57b0a10`

Key functions:

```solidity
// Open a paid conversation (sender pays recipient's price in USDC)
// Requires prior USDC approval for this contract
function openConversation(address recipient) external

// Check if a conversation between sender and recipient is open
function isConversationOpen(address sender, address recipient) external view returns (bool)
```

Payment flow:
- Sender calls `openConversation(recipient)` after approving USDC
- Contract reads recipient's price from `DMPayRegistry`
- 2.5% fee sent to protocol treasury
- 97.5% sent directly to recipient
- Conversation flagged as open on-chain

---

## Deployments

### Mainnet

| Contract | Address |
|---|---|
| DMPayRegistry | `0x58d02e17bdCf0fdae2e134Da280e6084552F76f5` |
| DMPayMessaging | `0x588C943Bd4f59888B2F6ECA0b2BfB123B57b0a10` |
| ENS: dmpay.eth node | `0x2059bd34c28c7a6645dd35be7e5dcc4b3e4999849bbe8b2c8b838f2d4cfc3ec8` |
| ENS Public Resolver | `0xF29100983E058B709F3D539b0c765937B804AC15` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

### Sepolia (Testnet)

| Contract | Address |
|---|---|
| DMPayRegistry | *(deploy via Ignition — see below)* |
| DMPayMessaging | *(deploy via Ignition — see below)* |
| MockUSDC | Deploy `MockUSDC` first for testing |

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

### Compile

```bash
npx hardhat compile
```

### Test

```bash
npx hardhat test
```

### Deploy to Sepolia

```bash
npx hardhat ignition deploy ignition/modules/DMPay.ts --network sepolia
```

### Deploy to Mainnet

```bash
npx hardhat ignition deploy ignition/modules/DMPayMainnet.ts --network mainnet
```

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
│       └── DMPayMainnet.ts      # Mainnet deployment module
├── scripts/
│   ├── deploy-v2-mainnet.ts     # DMPayDirectV2 mainnet deployment
│   └── send-op-tx.ts            # Utility for sending ops transactions
├── hardhat.config.ts            # Hardhat configuration
└── test/
    └── Counter.ts               # Contract tests
```

---

## Architecture

```
Sender                 DMPayMessaging            DMPayRegistry
  │                         │                        │
  │── openConversation ────>│                        │
  │                         │── getProfile ─────────>│
  │                         │<── price ─────────────-│
  │                         │                        │
  │                         │── transferFrom(sender, recipient, 97.5%)
  │                         │── transferFrom(sender, treasury, 2.5%)
  │                         │── mark conversation open
  │<── success ────────────-│                        │
```

---

## ENS Integration

Each registered user gets a subdomain under `dmpay.eth`:

- **Registry node:** `keccak256(dmpay.eth namehash + keccak256(handle))`
- **Resolver:** ENS Public Resolver (`0xF29100983E058B709F3D539b0c765937B804AC15`)
- **Address record:** Set to user's wallet address
- **Contenthash:** Set to IPFS CIDv1 after profile page is pinned

The `dmpay.eth` parent domain is managed by the DMpay deployer wallet. `DMPayRegistry` is approved via `setApprovalForAll` on the ENS registry, allowing it to create subdomains on behalf of the owner.

---

## Security

- No admin keys for individual user profiles — once registered, only the wallet owner can update their IPFS hash
- Protocol fee rate is set at deployment and enforced by the immutable smart contract
- All USDC flows are atomic — payment and conversation-open happen in a single transaction
- No contract upgradeability — what is deployed is what runs

---

## License

MIT
