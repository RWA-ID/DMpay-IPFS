# DMpay — app

The DMpay client. A fully static React app that talks directly to Ethereum and XMTP: no backend, no SSR, no API routes, no accounts.

The same source ships to two hosts — [app.dmpay.me](https://app.dmpay.me) on Cloudflare Pages, and `dmpay.eth` over IPFS. See [Two builds](#two-builds) below, because the difference is not cosmetic.

Protocol reference: [`../contracts/README.md`](../contracts/README.md). Project overview: [`../README.md`](../README.md).

---

## Stack

| Layer | Choice |
|---|---|
| Build | Vite + TypeScript |
| UI | React 19 + Tailwind 3 + lucide icons |
| Wallet | wagmi v3 + viem v2 + RainbowKit (dark theme) |
| Routing | react-router-dom v7 — `BrowserRouter` or `HashRouter`, chosen by build mode |
| Identity | ENS forward/reverse resolution, `BaseRegistrar` expiry check, in-app `.eth` registration |
| Messaging | `@xmtp/browser-sdk` v7 (XMTP V3, MLS) + DMpay's own content-type codecs |
| Solana | `@solana/web3.js` + Wallet Standard (`@wallet-standard/app`) — SOL tips only |
| Market data | Chainlink ETH/USD on-chain; DexScreener for token prices |

---

## Local development

```bash
npm install --legacy-peer-deps
npm run dev            # http://localhost:5173
```

Create a `.env` (gitignored) with:

| Var | Where to get it | Needed for |
|---|---|---|
| `VITE_WC_PROJECT_ID` | [Reown / WalletConnect](https://cloud.reown.com) | Wallet connection |
| `VITE_PINATA_JWT` | [Pinata](https://app.pinata.cloud) | Group-image upload, IPFS pinning |
| `VITE_SOLANA_RPC` | Any Solana RPC (optional) | SOL tips. Falls back to the public mainnet endpoint, which is fine at tip volume since it's called from the user's own browser, not a Worker. |

`.env.pages` and `.env.ipfs` are committed and hold the per-target routing config (`VITE_PUBLIC_URL`, `VITE_CLEAN_URLS`, `VITE_SHARE_URL`, `VITE_API_URL`). They're selected by build mode and ignored by `npm run dev`.

`OPENSEA_API_KEY` powers the NFT picker. It is a **Cloudflare Pages environment variable**, set in the project settings and read server-side by `functions/api/nfts.js` — never bundled, and not needed locally.

`functions/api/unfurl.js` needs no key at all.

---

## Message content types

Beyond plain text and attachments, the app registers five codecs of its own in
[`src/lib/chatContent.ts`](./src/lib/chatContent.ts). Every one carries a
`fallback` that stands alone as a sentence, because for Converse / Coinbase
Wallet / xmtp.chat users that fallback *is* the message.

| Type | Carries | Verified against |
|---|---|---|
| `tip` | A `DMPayDirectV2.payMessage*` receipt | The contract's `MessagePaid` log |
| `nft-send` | A `safeTransferFrom` receipt | The transfer log |
| `sol-tip` | A bare SOL transfer receipt | Pre/post balance deltas on Solana |
| `link-preview` | Message text **plus** its OpenGraph card | Nothing — it's presentation |
| `token-share` | A token pointer + the price when shared | Live price is re-fetched per reader; the shared-at price is the sender's claim and is labelled as one |

### Link previews are built by the sender

A browser can't read a third party's OpenGraph tags — CORS forbids it — so
previews need a server. The naive design has each recipient unfurl the links it
receives, which in an end-to-end encrypted app would tell this server the URL of
every link in every private conversation and leak each reader's IP to the image
host.

So the **sender** unfurls at compose time, for a link they chose and already
know, and the preview travels inside the encrypted payload with its thumbnail
inlined as a `data:` URI. Rendering a received preview makes **no network
request at all**. Links that arrive without one — sent from another client, or
where the unfurl failed — get a clickable link and an explicit "load preview"
button, so that fetch stays the reader's choice.

`functions/api/unfurl.js` fetches arbitrary user-supplied URLs and is guarded
accordingly: scheme allowlist, rejection of private/loopback/link-local
addresses (including `169.254.169.254`), a redirect chain walked by hand so
every hop is re-checked, a timeout, and a byte cap.

### Token shares

`src/lib/tokens.ts` reads DexScreener — no API key, permissive CORS, so the
IPFS build calls it directly with no backend in the path. It covers pairs that
started trading an hour ago, which listing-based APIs don't. (OpenSea, the app's
other market data source, is an NFT index and has no prices for ERC-20s.)

Pair selection always takes the **deepest liquidity**, and the UI always shows
the contract address and liquidity next to the symbol — a $300 pool can be made
to print any price, and deploying a token called USDC costs nothing.

### SOL tips take no fee

Every other payment routes through `DMPayDirectV2`, which splits 97.5 / 2.5. A
SOL tip is a bare `SystemProgram.transfer`: there is no program in the path that
*could* take a cut, so the recipient receives exactly what was sent and the only
deduction is the network's ~0.000005 SOL. "No platform fee" is a property of the
instruction, not a policy.

The recipient's address comes from their ENS `addr` record at **SLIP-44 coin
type 501** — so a user opts in by setting one record, with no new registry.
Note 501 is a plain SLIP-44 type, *not* an ENSIP-11 chain-specific one, so none
of the `0x80000000 | chainId` signed-32-bit trouble applies.

---

## Two builds

```bash
npm run build:pages    # clean paths,  app.dmpay.me
npm run build:ipfs     # hash routing, IPFS gateways
npm run build          # alias for build:ipfs
```

The split exists because IPFS gateways serve a hard 404 for any path that isn't a real file — they can't rewrite an unknown path to `index.html`, so deep links need hash routing. Cloudflare Pages can rewrite (via [`public/_redirects`](./public/_redirects)), so it gets clean paths. `src/lib/site.ts` reads `VITE_CLEAN_URLS` and picks the router.

**Links handed to other people always point at the Pages host**, regardless of which build produced them. A hash is never sent to the server, so no crawler can read a hash route — every shared profile or group would otherwise fall back to a generic card. The tradeoff is deliberate and documented in `site.ts`: a shared link now depends on that host, where a `dmpay.eth` link would outlive it. The app itself stays reachable over IPFS either way.

### Deploying

```bash
npm run deploy:pages   # build:pages + wrangler direct upload
```

`deploy:pages` passes `--branch=dmpay`. **Omit it and the build lands as a Preview, not production.** The Pages project is not git-connected — merging or pushing ships nothing, only this command does.

For IPFS: run `build:ipfs`, pin `dist/`, then set the ENS contenthash to `ipfs://<cid>` on `dmpay.eth`. That last step is manual.

---

## Layout

```
src/
├── components/       UI. One file per surface — Landing, Profile, Inbox,
│                     ChatView, GroupView, Settings, Discover, composers…
├── hooks/            useXmtpClient, useGroups, useGroupMembers,
│                     useVerifiedEnsName
└── lib/
    ├── contracts.ts    DMPayDirectV2 address + ABI (V1 kept read-only)
    ├── chatContent.ts  the tip / nft-send XMTP codecs
    ├── chatReceipts.ts on-chain verification of those cards
    ├── ens.ts          registration (commit/reveal) + resolver records
    ├── ensExpiry.ts    BaseRegistrar.nameExpires — an expired name still
    │                   passes the forward/reverse round trip
    ├── groupMeta.ts    public group identity as an ENS text record
    ├── site.ts         per-build routing, share URLs, group slugs
    └── nfts.ts         owned-NFT reads via the Pages proxy

functions/            Cloudflare Pages Functions — Pages build only
├── _og.js            per-route link previews
├── api/nfts.js       OpenSea proxy, keeps the key out of the bundle
└── u/, c/, g/ …      one handler per shareable route
```

---

## Things worth knowing before you edit

- **Chat cards are never trusted on their face.** A tip or NFT card is an XMTP message, so anyone can craft one claiming any amount, or replay someone else's transaction hash. `chatReceipts.ts` pulls the receipt and decodes the log the transaction actually emitted before the UI shows an amount. Failed cards are labelled, not hidden.
- **Cards are sent after the transaction is mined**, never on submission — a dropped or reverted tx would otherwise leave an unbacked receipt in the thread.
- **ENS expiry is checked separately from resolution.** An expired name resolves fine and passes the round trip. Only `BaseRegistrar.nameExpires` proves ownership.
- **`functions/` only exists on the Pages build.** Anything behind it must degrade rather than block — the NFT picker falls back to manual contract + token-id entry when the proxy is unreachable.
- **RainbowKitProvider renders an unclassed `<div data-rk>`** between `#root` and the app, which breaks percentage-height chains and stops panes from scrolling. The fix is the `#root > [data-rk]` rule in `index.css`. If a full-height pane grows the page instead of scrolling, that's the first place to look.
- **Public group identity is a forward text record, not a reverse one.** `groupMeta.ts` writes `me.dmpay.group.<id>` on the *creator's* name; a group has no ENS name and nothing calls `ReverseRegistrar`. The creator's primary name is only the precondition — it names the resolver to write to, and `verifiedEnsName()` round-trips and expiry-checks it first. No primary name means no publish option, in `CreateGroup` and `GroupSettings` alike.
- **Publishing must never block the group.** It's the last step of `CreateGroup` and the only optional one: a rejected signature settles the step and still lands on the success card, because the chat already exists and works. The intent is also frozen at submit rather than read live, so an ENS lookup resolving mid-flow can't add or drop a transaction the creator never agreed to.
- **Group slugs are decoration.** `/g/0-alpha-leaks-chat` — the router reads the leading id and ignores the rest. Anyone can craft any slug for any id, so nothing should display one as a group's real name.
