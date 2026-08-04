# DMpay

> **Pay to DM any wallet on Ethereum.** A non-custodial protocol that lets any wallet owner set a price — in USDC or ETH — to receive direct messages. Senders pay once, and the conversation opens over end-to-end encrypted XMTP. No backend, no accounts, no middlemen.

[![Mainnet](https://img.shields.io/badge/Network-Ethereum%20mainnet-627eea)](https://etherscan.io/address/0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52)
[![Etherscan](https://img.shields.io/badge/Verified-Etherscan-3498db)](https://etherscan.io/address/0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52#code)
[![App](https://img.shields.io/badge/App-app.dmpay.me-f2f0e8)](https://app.dmpay.me)
[![XMTP](https://img.shields.io/badge/Messaging-XMTP%20V3-7c5cff)](https://xmtp.org)

---

## What this is

DMpay is a paywall for your wallet's inbox. You publish a profile using the ENS name you already own, set a USDC and/or ETH price, and anyone can find you, pay, and start a conversation. Payment settles atomically — 97.5% lands directly in your wallet, 2.5% goes to the protocol. The chat itself is end-to-end encrypted via XMTP and portable across every XMTP client.

Once a thread is open it carries more than text: **tips** and **NFTs** move inside the conversation, and paid **group chats** work the same way — one payment, on-chain membership, encrypted transport.

| Path | What |
|---|---|
| [`contracts/`](./contracts) | Hardhat 3 + Solidity 0.8.28. `DMPayDirectV2.sol` and its tests. → [protocol docs](./contracts/README.md) |
| [`frontend-ipfs/`](./frontend-ipfs) | Vite + React 19 + Tailwind + wagmi + XMTP V3. Static build, two deploy targets. → [app docs](./frontend-ipfs/README.md) |
| [`pitchdeck-ipfs/`](./pitchdeck-ipfs) | Static pitch deck, pinned to IPFS. |

This is a backendless dApp. No servers, no databases, no off-chain trust assumptions beyond Ethereum and XMTP. The one server-side endpoint that exists — an NFT-picker proxy that keeps a marketplace API key out of the bundle — is a convenience the app degrades gracefully without.

---

## Live

- **Contract (mainnet):** `DMPayDirectV2` at `0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52`, deployed at block 25169356
  → [Etherscan](https://etherscan.io/address/0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52#code)
- **App:** [app.dmpay.me](https://app.dmpay.me) (Cloudflare Pages) · `dmpay.eth` over IPFS
- **Social:** [@dmpayeth on X](https://x.com/dmpayeth)

---

## How it works

```
┌──────────┐   setPrice(usdc, eth, lifetimeUsdc, lifetimeEth)   ┌────────────────┐
│ Recipient│──────────────────────────────────────────────────► │ DMPayDirectV2  │
└──────────┘                                                    │   mainnet      │
                                                                │                │
┌──────────┐   openConversationUSDC / ETH(recipient)            │  97.5% → you   │
│  Sender  │──────────────────────────────────────────────────► │   2.5% → fee   │
└──────────┘                          ┌───────────────────────  └────────────────┘
                                      ▼
                              recipient wallet
                                      │
                                      ▼
                   ┌──────────────────────────────────────┐
                   │        XMTP V3 (E2E encrypted)       │
                   │  1:1 DMs · group chats · off-chain   │
                   │  text · tips · NFT sends             │
                   └──────────────────────────────────────┘
```

1. **Set your price.** USDC and/or ETH. Optionally enable a lifetime pass so frequent senders pay once for unlimited DMs. Any tier set to `0` is disabled.
2. **Share your profile.** Your URL is `app.dmpay.me/u/<your-ens-or-address>`. Anyone with the link sees your avatar, ENS records, and pricing.
3. **Sender pays once.** The contract splits payment atomically — 97.5% to you, 2.5% to the protocol. No custody, no claim flow, no escrow.
4. **Chat over XMTP.** Messages are end-to-end encrypted with MLS, stored on the XMTP network, and readable from any XMTP client.

**Identity is plain ENS.** You bring the name you already own; the protocol mints nothing. The app resolves a wallet via reverse resolution, forward-resolves to confirm the round trip, and then checks `BaseRegistrar.nameExpires` — because an *expired* name still passes the round trip, so the round trip alone is not proof of ownership.

---

## Features

### Paid DMs

Four price tiers per recipient — per-conversation USDC, per-conversation ETH, lifetime USDC, lifetime ETH. Unlock is bidirectional: if either party has paid, both can chat freely, because an open conversation is a property of the address pair, not a directed payment.

Recipients get real control after the sale. `blockSender` is permanent; `closeConversation` puts the thread back behind the paywall so the sender must pay again to reopen it — a re-monetisation primitive rather than a ban. A **lifetime pass bypasses both**, deliberately: the pass is a promise, and receiver-side controls must not retroactively void something already sold.

### Paid groups

Anyone can open a group chat with a join price and an optional member cap. On-chain membership is the source of truth for who has paid; the XMTP group is the transport, bound to the on-chain group afterwards via `setGroupXmtpId`. Lifetime-pass holders join that creator's groups free.

Because XMTP group metadata is encrypted to members, a non-member would otherwise see nothing. So a creator can optionally publish a **public group identity as an ENS text record** under `me.dmpay.group.<id>` on their own name — the one public keystore they already control. Members always read the real XMTP metadata; only outsiders fall back to the published copy.

### Tips

Send any amount in USDC or ETH straight inside a DM or a group. Tips run through the already-deployed `payMessageUSDC` / `payMessageETH`, which take a sender-chosen amount, split 97.5 / 2.5, and emit `MessagePaid`. **No new contract** — and unlike `openConversation*`, tipping never touches `openedAt`, so tipping someone doesn't silently unlock a paid thread.

### NFT sends

Send an NFT to someone in the conversation. This is a plain `safeTransferFrom` on the collection's own contract: no DMpay contract involved, no fee taken, and — worth being explicit — **no marketplace API can do this for you.** Only the owner's wallet can authorise a transfer. A picker grid over an indexer makes it convenient, and when that indexer fails, manual entry still sends: a contract address plus a token id is everything the transfer needs.

### Verified receipts

Tips and NFT sends ride as DMpay's own XMTP content types (`dmpay.eth/tip`, `dmpay.eth/nft-send`). Both are **receipts, not instructions** — the transaction is already mined before the message is sent, so a client rendering one is reporting on-chain history, not authorising anything.

A message is just bytes from a peer, and anyone can craft one claiming any amount or replaying someone else's transaction hash. So no card is trusted on its face: the app pulls the receipt, decodes the log the transaction actually emitted, and checks it against every claimed field — including that the payer matches the XMTP identity that sent the message. Amounts and artwork stay muted until that check clears, and a card that fails is **labelled, not hidden**, since silently dropping it would make a spoof indistinguishable from a network hiccup.

Every other XMTP client — Converse, Coinbase Wallet, xmtp.chat — lacks these codecs, so each card carries a fallback string that has to stand alone as a readable sentence. For those users, it *is* the message.

### Discover, and ENS onboarding

`/discover` indexes `PriceSet` events to list creators who are actually open for paid DMs. And for anyone who doesn't have a name yet, the app does a **full in-app `.eth` registration** through the ENS `ETHRegistrarController` commit/reveal flow, bundling the resolver records — address plus chosen text records — into the register call.

---

## Who it's for

| Persona | Use case |
|---|---|
| **Founders** | Replace "DM me on Telegram" with a priced inbox. Filters tire-kickers; serious capital sources pay through. |
| **Creators** | Lifetime passes monetize true fans; per-DM pricing handles everyone else. Paid groups turn an audience into a room. |
| **ENS domainers** | Your premium ENS is already discoverable. Add a price and convert that traffic into real conversations. |
| **KOLs & advisors** | Charge for warm intros, deal review, DD calls. Every DM becomes a paid signal, not another archived notification. |

---

## The contract

`DMPayDirectV2.sol` — one contract, no proxies, no upgradeability, no admin pause. Pricing lives in a `mapping(address => Price)` on the contract itself, so there is no registry lookup and no handle to mint.

| Function | Purpose |
|---|---|
| `setPrice(usdc, eth, lifetimeUsdc, lifetimeEth)` | Recipient sets all four tiers. `0` disables a tier. |
| `openConversationUSDC / ETH(recipient)` | Pay the list price to open a conversation. |
| `payMessageUSDC(recipient, amount)` / `payMessageETH(recipient)` | Sender-chosen amount. Powers tips. |
| `buyLifetimePassUSDC / ETH(recipient)` | One-time payment, permanent access. |
| `blockSender` / `unblockSender` / `closeConversation(sender)` | Receiver-side controls. |
| `isUnlocked(recipient, sender)` | Access check — true while `openedAt > closedAt`, or on a lifetime pass. |
| `createGroup(priceUsdc, priceEth, capacity)` | Open a paid group. `capacity = 0` is unlimited. |
| `joinGroupUSDC / ETH(id)` | Pay once to join. |
| `setGroupXmtpId` / `removeGroupMember` / `closeGroup` | Creator-only group management. |

**Fees.** 250 basis points (2.5%), a `constant` — not owner-settable. USDC fees transfer straight to the treasury during payment. ETH fees can't: pushing to the treasury on every call would let a reverting treasury brick payments, so they accrue in `accumulatedEthFees` and the owner sweeps them with `withdrawEthFees()`. The owner can change the treasury address and sweep ETH fees — nothing else. There is no admin path to message someone for free or to revoke a sold lifetime pass.

Full protocol reference, event list, legacy-contract status, and the V1 → V2 migration note: **[`contracts/README.md`](./contracts/README.md)**.

```bash
cd contracts
npx hardhat test        # 12 tests for V2, 15 for V1
```

---

## The app

A fully static React app — no backend, no SSR. Everything talks directly to Ethereum and XMTP.

| Layer | Choice |
|---|---|
| Build | Vite + TypeScript |
| UI | React 19 + Tailwind 3 + lucide icons |
| Wallet | wagmi v3 + viem v2 + RainbowKit (dark theme) |
| Routing | react-router-dom v7 — `BrowserRouter` on Pages, `HashRouter` on IPFS |
| Identity | ENS forward/reverse resolution + `BaseRegistrar` expiry check |
| Messaging | `@xmtp/browser-sdk` v7 (XMTP V3, MLS) + DMpay's own tip / NFT codecs |

| Route | What |
|---|---|
| `/` | Landing — hero, ENS/address search, inline profile preview. |
| `/u/:nameOrAddress` | Public profile — avatar, ENS records, price tiers, DM CTA. |
| `/discover` | Creators open for paid DMs, indexed from `PriceSet`. |
| `/inbox` | Your XMTP conversations, DMs and groups. |
| `/settings` | Set prices, edit ENS records, register a `.eth` name. |
| `/groups/new` | Create a paid group. |
| `/c/:address` | DM — paywall first, then the live XMTP thread. |
| `/g/:id` | Group — join paywall, roster, chat. |
| `/privacy`, `/terms` | Legal. |

Setup, environment variables, and the two build modes: **[`frontend-ipfs/README.md`](./frontend-ipfs/README.md)**.

---

## Two deployments

The same source ships to two hosts with different routing constraints, selected by build mode.

| | Cloudflare Pages | IPFS |
|---|---|---|
| Where | [app.dmpay.me](https://app.dmpay.me) | `dmpay.eth` via ENS contenthash |
| Build | `npm run build:pages` | `npm run build:ipfs` |
| Routing | Clean paths — `_redirects` rewrites 404s to `index.html` | Hash routing — gateways hard-404 any path that isn't a real file |
| Extras | Pages Functions: per-route link previews + the NFT proxy | Static only |

Neither deploy is git-triggered. Pages goes out by direct upload (`npm run deploy:pages`, which passes `--branch=dmpay` — omit it and the build lands as a Preview instead of production), and IPFS is a manual pin followed by setting the ENS contenthash. Pushing to either remote never moves a live site.

**Shared links always point at the Pages host**, even from the IPFS build. A hash route is never sent to the server, so no crawler can read one and every shared profile or group would fall back to a generic card. The tradeoff is explicit: a shared link depends on that host staying up, where a `dmpay.eth` link would outlive it. The app itself stays reachable over IPFS either way — this only decides which URL gets pasted into a tweet.

---

## Repositories

Two remotes carry this codebase, one per deployment target:

| Remote | Repo | Deploys |
|---|---|---|
| `origin` | [RWA-ID/DMpay-Protocol](https://github.com/RWA-ID/DMpay-Protocol) | — |
| `ipfs` | [RWA-ID/DMpay-IPFS](https://github.com/RWA-ID/DMpay-IPFS) | — |

Development happens on the `dmpay-ipfs` branch, which is pushed to both.

---

## Architecture decisions

- **No subdomain registry.** The original design authenticated users via X OAuth, minted them a `handle.dmpay.eth` subdomain, and pinned a generated profile page to IPFS. That flow is gone — your wallet and your own ENS name are your identity. The old subdomains still exist and still resolve; see the legacy contracts section in the protocol docs.
- **No X/Twitter verification.** Identity is signed by your wallet, optionally enriched by your own ENS text records (`description`, `url`, `com.twitter`, `com.github`).
- **No backend, no oracle, no relayer.** Every read hits Ethereum directly; every write is a user-signed transaction.
- **Bidirectional unlock.** Payment in either direction opens the pair.
- **Receipts are verified, never trusted.** See *Verified receipts* above.
- **Public group identity is opt-in.** It costs a transaction, so creators choose. The public copy can drift from the encrypted one, which is why members read XMTP and only outsiders read ENS.
- **Expiry is checked, not assumed.** An expired ENS name passes the forward/reverse round trip. Only `BaseRegistrar.nameExpires` tells the truth.

---

## Security notes

- Solidity `^0.8.20`, compiled with 0.8.28. OpenZeppelin v5 (`Ownable`, `ReentrancyGuard`, `SafeERC20`).
- Every payable and token-moving entrypoint is `nonReentrant`. The conversation paths write `openedAt` *after* the ETH `call`, so the guard is doing real work rather than being belt-and-braces over checks-effects-interactions ordering.
- No custody on the USDC path — sender→recipient and sender→treasury are two transfers inside one call. Only accrued ETH fees rest in the contract.
- The fee rate is `constant` and cannot change post-deploy.
- No upgradeability, no admin pause, no emergency lever. What's deployed is what runs.
- Published group metadata is attacker-controlled text from a third party's ENS name: every field is type-checked, length-capped, and images are restricted to `http(s)` to keep `javascript:` and `data:` URLs out of an `<img src>`.

---

## License

MIT.

---

Built by [@hectormorel](https://x.com/hectormorel) at [RWA-ID](https://github.com/RWA-ID).
