# DMpay

> **Pay to DM any wallet on Ethereum.** A non-custodial protocol that lets any wallet owner set a price (in USDC or ETH) to receive direct messages. Senders pay once, and the conversation opens over end-to-end encrypted XMTP. No backend, no accounts, no middlemen.

[![Mainnet](https://img.shields.io/badge/Network-Ethereum%20mainnet-627eea)](https://etherscan.io/address/0xa204f8242A535979821d96093238B5ccC268631E)
[![Etherscan](https://img.shields.io/badge/Verified-Etherscan-3498db)](https://etherscan.io/address/0xa204f8242A535979821d96093238B5ccC268631E#code)
[![IPFS](https://img.shields.io/badge/Hosted-IPFS-65c2cb)](https://gateway.pinata.cloud/ipfs/bafybeiaxajt4nf6ckpv24wvtovycwp5mkdh74cl27527tlw3tzzyf7vxpm)
[![XMTP](https://img.shields.io/badge/Messaging-XMTP%20V3-7c5cff)](https://xmtp.org)

---

## What this is

DMpay is a paywall for your wallet's inbox. You publish a profile (your existing ENS, no registry required), set a USDC and/or ETH price, and anyone can find you, pay, and start a conversation. Payment settles atomically — 97.5% lands directly in your wallet, 2.5% goes to the protocol. The chat itself is end-to-end encrypted via XMTP and portable across every XMTP client.

Two products live in this repo:

| Path | What |
|---|---|
| [`contracts/`](./contracts) | Hardhat 3 + Solidity 0.8.28. The single `DMPayDirect.sol` payment contract and its tests. |
| [`frontend-ipfs/`](./frontend-ipfs) | Vite + React + Tailwind + wagmi + XMTP V3. Static export, deployable to any IPFS host. |

This is a backendless dApp. The repo has no servers, no databases, and no off-chain trust assumptions beyond Ethereum and XMTP.

---

## Live

- **Contract (mainnet):** `0xa204f8242A535979821d96093238B5ccC268631E`
  → [Etherscan](https://etherscan.io/address/0xa204f8242A535979821d96093238B5ccC268631E#code) · [Blockscout](https://eth.blockscout.com/address/0xa204f8242A535979821d96093238B5ccC268631E#code) · [Sourcify](https://sourcify.dev/server/repo-ui/1/0xa204f8242A535979821d96093238B5ccC268631E)
- **IPFS:** `bafybeiaxajt4nf6ckpv24wvtovycwp5mkdh74cl27527tlw3tzzyf7vxpm`
  → [Pinata gateway](https://gateway.pinata.cloud/ipfs/bafybeiaxajt4nf6ckpv24wvtovycwp5mkdh74cl27527tlw3tzzyf7vxpm)
- **Social:** [@dmpayeth on X](https://x.com/dmpayeth)

---

## How it works

```
┌──────────┐    setPrice(usdc, eth, lifetimeUsdc, lifetimeEth)      ┌──────────────┐
│ Recipient│───────────────────────────────────────────────────────►│ DMPayDirect  │
└──────────┘                                                         │   contract   │
                                                                     │   on L1      │
┌──────────┐    openConversationUSDC/ETH(recipient)                  │              │
│  Sender  │───────────────────────────────────────────────────────► │  97.5% net   │
└──────────┘                              ┌──────────────────────────│  2.5% fee    │
                                          ▼                          └──────────────┘
                                  recipient wallet
                                          │
                                          ▼
                            ┌─────────────────────────────┐
                            │   XMTP V3 (E2E encrypted)    │
                            │   1:1 DM, off-chain          │
                            └─────────────────────────────┘
```

1. **Set your price.** Choose USDC and/or ETH. Optionally enable a lifetime pass tier so frequent senders pay once for unlimited DMs. Setting a tier to `0` disables it.
2. **Share your profile.** Your URL is `dmpay.eth/#/u/<your-ens-or-address>`. Anyone with the link sees your avatar, ENS records, and pricing.
3. **Sender pays once.** The contract splits payment atomically: 97.5% to you, 2.5% to the protocol. No custody, no claim flow, no escrow.
4. **Chat over XMTP.** Both parties unlock the conversation. Messages are end-to-end encrypted using MLS, stored in the XMTP network, and readable from any XMTP client (Converse, Coinbase Wallet, xmtp.chat, this app).

---

## Who it's for

| Persona | Use case |
|---|---|
| **Founders** | Replace "DM me on Telegram" with a priced inbox. Filters tire-kickers; serious capital sources pay through. |
| **Creators** | Lifetime passes monetize true fans. Per-DM pricing handles everyone else. USDC settles instantly. |
| **ENS domainers** | Your premium ENS is already discoverable. Add a price and convert ENS traffic into real conversations. |
| **KOLs & advisors** | Charge for warm intros, deal review, DD calls. Every DM becomes a paid signal, not another archived notification. |

---

## Smart contract — `DMPayDirect.sol`

A single contract, no proxies, no upgradeability. Recipients are addresses (no registry, no handles). All payments are atomic.

### Storage

```solidity
struct Price {
    uint256 usdc;          // per-conversation USDC (0 = disabled)
    uint256 eth;           // per-conversation ETH  (0 = disabled)
    uint256 lifetimeUsdc;  // pay once for forever access (0 = disabled)
    uint256 lifetimeEth;
}
mapping(address => Price) public priceOf;
mapping(address recipient => mapping(address sender => bool)) public hasLifetimePass;

struct Group {
    address creator;
    uint256 priceUsdc;
    uint256 priceEth;
    uint64 capacity;       // 0 = unlimited
    uint64 memberCount;
    bool active;
    bytes32 xmtpGroupId;   // optional linkage to an XMTP group
}
mapping(uint256 => Group) public groups;
mapping(uint256 => mapping(address => bool)) public isGroupMember;
```

### Functions

| Function | Purpose |
|---|---|
| `setPrice(usdc, eth, lifetimeUsdc, lifetimeEth)` | Recipient sets all four price tiers. |
| `openConversationUSDC(recipient)` | Sender pays `priceOf[recipient].usdc` to open a chat. |
| `openConversationETH(recipient) payable` | Same, but in ETH. `msg.value` must equal the price. |
| `payMessageUSDC(recipient, amount)` | Arbitrary tip / per-message payment in USDC. |
| `payMessageETH(recipient) payable` | Arbitrary tip in ETH. |
| `buyLifetimePassUSDC(recipient)` | One-time payment grants permanent DM access. |
| `buyLifetimePassETH(recipient) payable` | Same in ETH. |
| `createGroup(priceUsdc, priceEth, capacity)` | Creator opens a paid group chat. |
| `joinGroupUSDC(id)` / `joinGroupETH(id) payable` | Sender pays once to join. |
| `setGroupXmtpId(id, xmtpGroupId)` | Creator links the on-chain group to its XMTP group ID. |
| `closeGroup(id)` | Creator stops new joins. |

### Fees & settlement

- **Fee rate:** 250 basis points (2.5%). Constant, set at deployment.
- **USDC fees:** transferred directly to `treasury` in the same tx.
- **ETH fees:** accumulated in `accumulatedEthFees`; `withdrawEthFees()` (owner-only) sweeps them.
- **Owner controls:** `setTreasury(address)`, `withdrawEthFees()`. Owner cannot touch user funds — they flow recipient-direct.

### Tests

15 hardhat tests in [`contracts/test/DMPayDirect.ts`](./contracts/test/DMPayDirect.ts) cover:
- Setting and reading all four price tiers
- USDC + ETH conversation opens with correct split
- Lifetime pass grant + duplicate-purchase rejection
- Arbitrary `payMessage` flows for both tokens
- Group create, join, capacity enforcement, double-join rejection, close
- `setGroupXmtpId` creator-only access control
- Admin: `withdrawEthFees`, `setTreasury` ownership

```bash
cd contracts
npx hardhat test
```

---

## Frontend (`frontend-ipfs/`)

A fully static React app. No backend, no SSR, no API routes. Everything talks directly to Ethereum and XMTP.

### Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + TypeScript |
| UI | React 19 + Tailwind 3 + lucide icons |
| Wallet | wagmi v3 + viem v2 + RainbowKit (dark theme) |
| Routing | react-router-dom v7 with `HashRouter` (IPFS-safe deep links) |
| Identity | ENS via `useEnsName` / `useEnsAvatar` / `useEnsText` |
| Messaging | `@xmtp/browser-sdk` v7 (XMTP V3, MLS, end-to-end encrypted) |
| RPC | `https://ethereum-rpc.publicnode.com` (public; replace with your own for prod) |

### Pages

| Route | What |
|---|---|
| `/` | Landing — hero, ENS/address search, inline profile preview, your own profile when connected, four trust features, How it works, Who it's for, footer. |
| `/u/:nameOrAddress` | Public profile — avatar, ENS records, price tiers, DM CTA. |
| `/settings` | Set your USDC / ETH / lifetime prices. Auto-routes to `/u/<address>` after save. |
| `/inbox` | Your XMTP DM list (last-message preview, ENS-resolved peers). |
| `/c/:address` | Chat view — paywall first (lifetime pass OR past `ConversationOpened` events in either direction), then live XMTP thread. |

### Why XMTP V3

- **End-to-end encrypted** with MLS. Even XMTP can't read messages.
- **Inbox-scoped identity** — one wallet = one inbox, portable across installations and clients.
- **No central server** — messages are routed peer-to-peer through XMTP nodes.
- **Open ecosystem** — your DMpay conversations show up in Converse, Coinbase Wallet, xmtp.chat, etc.

### Local development

```bash
cd frontend-ipfs
npm install --legacy-peer-deps
cp .env.example .env  # fill in VITE_WC_PROJECT_ID + PINATA_JWT
npm run dev           # http://localhost:5173
```

Environment variables:

| Var | Where to get it |
|---|---|
| `VITE_WC_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com) (free) |
| `PINATA_JWT` | [Pinata](https://app.pinata.cloud) (only needed for `deploy.mjs`) |

### Build & deploy to IPFS

```bash
npm run build         # static export to dist/
node deploy.mjs       # pin dist/ to Pinata, returns the CID
```

Then on [app.ens.domains](https://app.ens.domains):
1. Open your ENS name → Records → Content
2. Set: `ipfs://<your-cid>`
3. Save. Resolvable at `yourname.eth.limo` within ~1 minute.

---

## Architecture decisions

- **No subdomain registry.** The original [DMpay-Protocol](https://github.com/RWA-ID/DMpay-Protocol) registered `{handle}.dmpay.eth` subdomains on-chain. This version assumes you already own an ENS — your wallet IS your identity.
- **No X/Twitter verification.** Identity is signed by your wallet, optionally enriched by your own ENS text records (`description`, `url`, `com.twitter`, `com.github`).
- **No backend, no oracle, no relayer.** Every read hits Ethereum directly; every write is a user-signed transaction.
- **HashRouter, not BrowserRouter.** Required for IPFS gateways that won't fallback to `index.html` for SPA deep links.
- **Bidirectional unlock.** If either party has paid (sender→recipient or recipient→sender), both can chat freely. The "open conversation" is a property of the address pair, not a directed payment.
- **localStorage cache + on-chain backstop.** Payment unlock is cached in `localStorage` for snappy UX; if missing, we scan the last ~50k blocks of `ConversationOpened` events as authoritative fallback.

---

## Security notes

- Solidity 0.8.28, OpenZeppelin v5 (`Ownable`, `ReentrancyGuard`, `SafeERC20`).
- All external payment functions are `nonReentrant`.
- Owner has no claim on user balances — only on `accumulatedEthFees` and `treasury` address management.
- USDC payments forwarded directly to recipient + treasury via `safeTransferFrom` in a single tx; no contract holdings.
- ETH payments forwarded via `.call{value:...}("")` with an explicit `require(ok)` check.
- No upgradeability, no admin pause, no emergency lever. What's deployed is what runs forever.
- The protocol fee rate (`FEE_BPS = 250`) is `constant` and cannot be changed post-deploy.

---

## Roadmap

- [ ] XMTP reactions, replies, attachments (codec support shipped, UI affordances next)
- [ ] Group chat UX (create / join flows live in contract; frontend is the missing piece)
- [ ] Consent management (XMTP "requests" inbox for unsolicited DMs)
- [ ] Notification options (XMTP push via Notify, or Telegram/email forwarding)
- [ ] Multi-chain (Base, Optimism, Arbitrum, Linea)
- [ ] Embeddable "DM me" widget (drop-in script tag for any website)

---

## License

MIT.

---

Built by [@hectormorel](https://x.com/hectormorel) at [RWA-ID](https://github.com/RWA-ID) with Claude Opus 4.7. Forked in spirit from [DMpay-Protocol](https://github.com/RWA-ID/DMpay-Protocol).
