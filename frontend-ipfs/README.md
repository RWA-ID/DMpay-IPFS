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
| Messaging | `@xmtp/browser-sdk` v7 (XMTP V3, MLS) + DMpay's own tip / NFT-send codecs |

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

`.env.pages` and `.env.ipfs` are committed and hold the per-target routing config (`VITE_PUBLIC_URL`, `VITE_CLEAN_URLS`, `VITE_SHARE_URL`, `VITE_API_URL`). They're selected by build mode and ignored by `npm run dev`.

`OPENSEA_API_KEY` powers the NFT picker. It is a **Cloudflare Pages environment variable**, set in the project settings and read server-side by `functions/api/nfts.js` — never bundled, and not needed locally.

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
- **Group slugs are decoration.** `/g/0-alpha-leaks-chat` — the router reads the leading id and ignores the rest. Anyone can craft any slug for any id, so nothing should display one as a group's real name.
