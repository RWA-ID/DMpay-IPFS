import { createPublicClient, fallback, http, isAddress, formatEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize, labelhash } from 'viem/ens';

/**
 * Shared machinery for per-route link previews on app.dmpay.me.
 *
 * The app is client-rendered, so a crawler fetching /u/alice.eth runs no JS and
 * sees only the static meta tags in index.html — every link would otherwise
 * share the generic DMpay card. Each route function here serves that same
 * index.html with its own title, description, canonical and image swapped in.
 *
 * Pages-only by nature: the IPFS build has no server, so gateway links keep the
 * static card. That's why every share link the app hands out points at
 * app.dmpay.me (see src/lib/site.ts) — those are the URLs that get pasted into
 * a tweet, and only they can be rendered per-route.
 *
 * Nothing here changes what a human sees: the SPA still boots and fetches its
 * own state.
 */

export const SITE_URL = 'https://app.dmpay.me';
export const DMPAY_DIRECT_ADDRESS = '0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** BaseRegistrarImplementation — the only source of truth for `.eth` expiry. */
const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85';
const GRACE_PERIOD_SECONDS = 90n * 24n * 60n * 60n;

/**
 * A crawler waits a couple of seconds at most. Every card here costs several
 * mainnet round trips, so cap the whole build and fall back to the static card
 * rather than time out with nothing.
 */
const BUILD_TIMEOUT_MS = 4500;

export const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://gateway.tenderly.co/public/mainnet'),
    http('https://eth.api.onfinality.io/public'),
  ]),
});

export const priceAbi = [{
  type: 'function', name: 'priceOf', stateMutability: 'view',
  inputs: [{ name: '', type: 'address' }],
  outputs: [
    { name: 'usdc', type: 'uint256' },
    { name: 'eth', type: 'uint256' },
    { name: 'lifetimeUsdc', type: 'uint256' },
    { name: 'lifetimeEth', type: 'uint256' },
  ],
}];

export const groupsAbi = [{
  type: 'function', name: 'groups', stateMutability: 'view',
  inputs: [{ name: '', type: 'uint256' }],
  outputs: [
    { name: 'creator', type: 'address' },
    { name: 'priceUsdc', type: 'uint256' },
    { name: 'priceEth', type: 'uint256' },
    { name: 'capacity', type: 'uint64' },
    { name: 'memberCount', type: 'uint64' },
    { name: 'active', type: 'bool' },
    { name: 'xmtpGroupId', type: 'bytes32' },
  ],
}];

const baseRegistrarAbi = [{
  type: 'function', name: 'nameExpires', stateMutability: 'view',
  inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }],
}];

/**
 * Serve index.html with `build(...)`'s card swapped into its meta tags.
 *
 * `build` returns null to decline — a malformed path or a route the caller
 * decided not to describe — and the untouched page is served, so a bad link
 * still boots the app and shows its own error.
 */
export async function renderCard(request, env, build) {
  // Fetch "/" rather than "/index.html": the asset server 308s the explicit
  // filename to the directory form, and that redirect would be what we returned.
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url)));

  let card = null;
  try {
    card = await withTimeout(build(), BUILD_TIMEOUT_MS);
  } catch (e) {
    // A crawler getting the generic card beats a 500 that renders nothing.
    console.error('og card build failed', e);
  }
  if (!card) return page;

  const rewritten = new HTMLRewriter()
    .on('meta', new MetaRewriter(card))
    .on('link[rel="canonical"]', new CanonicalRewriter(card))
    .on('title', new TitleRewriter(card))
    .transform(page);

  const out = new Response(rewritten.body, rewritten);
  // Crawlers re-fetch often and on-chain state moves slowly.
  out.headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('card build timed out')), ms)),
  ]);
}

/** Canonical URL for an in-app path on the share host. */
export const shareUrl = (path) => `${SITE_URL}${path}`;

export const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** "$25.00" / "0.01 ETH" / null when nothing is set. */
export function formatPrice(usdc, eth) {
  if (usdc > 0n) return `$${Number(formatUnits(usdc, 6)).toFixed(2)}`;
  if (eth > 0n) return `${formatEther(eth)} ETH`;
  return null;
}

/**
 * Resolve whatever a share link put in the path — an ENS name or a raw
 * address — into the identity a card should describe.
 *
 * Returns `{ address, name, expired }`, where `name` is only set when it
 * survives verification, or null when nothing resolves.
 */
export async function resolveIdentity(raw) {
  const input = (raw ?? '').trim();
  if (!input) return null;

  if (isAddress(input)) {
    const name = await verifiedEnsName(input);
    return { address: input, name, expired: false };
  }

  if (!input.includes('.')) return null;
  let normalized;
  try { normalized = normalize(input); } catch { return null; }

  const address = await client.getEnsAddress({ name: normalized });
  if (!address || address === ZERO_ADDRESS) return null;

  // A name typed straight into a URL is only forward-resolved, and a lapsed
  // name's stale addr record answers exactly like a live one. Paying it sends
  // real money to an address whose claim on the name has run out, so the card
  // has to say so rather than present it as an identity.
  const expired = !(await isNameOwned(normalized));
  return { address, name: normalized, expired };
}

/**
 * Reverse records are self-asserted, so the name is forward-resolved back to
 * the address before it's used — otherwise a card could carry a name the
 * address doesn't own. Expired names are dropped entirely: their records
 * still round-trip cleanly, but nobody owns them.
 */
export async function verifiedEnsName(address) {
  const name = await client.getEnsName({ address });
  if (!name) return null;
  let normalized;
  try { normalized = normalize(name); } catch { return null; }
  const forward = await client.getEnsAddress({ name: normalized });
  if (!forward || forward.toLowerCase() !== address.toLowerCase()) return null;
  if (!(await isNameOwned(normalized))) return null;
  return normalized;
}

/**
 * False only when the registrar says the name is past its 90-day grace period —
 * unowned, buyable, and no longer evidence of anything.
 *
 * Nothing clears ENS resolution records when a name lapses, so `addr()` keeps
 * answering with the old holder's address indefinitely. Asking the registrar
 * for the expiry is the only way to tell a live name from a leftover.
 * Mirrors src/lib/ensExpiry.ts; a failed read counts as owned, so an RPC blip
 * never accuses a live name of being expired.
 */
export async function isNameOwned(name) {
  const label = ethRegistrarLabel(name);
  if (!label) return true; // not governed by the .eth registrar
  let expiry;
  try {
    expiry = await client.readContract({
      address: BASE_REGISTRAR,
      abi: baseRegistrarAbi,
      functionName: 'nameExpires',
      args: [BigInt(labelhash(label))],
    });
  } catch {
    return true;
  }
  // A resolvable `.eth` name cannot have records without a registration, so a
  // zero expiry means the label lookup missed rather than that the name lapsed.
  if (!expiry) return true;
  return BigInt(Math.floor(Date.now() / 1000)) < expiry + GRACE_PERIOD_SECONDS;
}

/**
 * The `.eth` label whose registration governs `name`, or null if none does.
 * Expiry lives on the second-level domain, so `pay.alice.eth` is governed by
 * `alice`; names under other TLDs have lifecycles this registrar knows nothing
 * about and are left alone.
 */
function ethRegistrarLabel(name) {
  const parts = name.split('.');
  if (parts.length < 2 || parts[parts.length - 1] !== 'eth') return null;
  return parts[parts.length - 2] || null;
}

/**
 * The avatar behind an ENS name, as something a crawler can actually fetch.
 *
 * viem resolves the record's own shape for us — ipfs://, NFT URIs — but the
 * result can still be a data: URI or an unresolvable scheme, and an og:image
 * has to be an absolute http(s) URL, so anything else is dropped.
 */
export async function avatarUrl(name) {
  if (!name) return null;
  let avatar;
  try {
    avatar = await client.getEnsAvatar({ name });
  } catch {
    return null;
  }
  if (!avatar || !/^https?:\/\//i.test(avatar)) return null;
  return avatar.slice(0, 500);
}

/** Within 15% of 1:1 — tolerant enough for a 1000x1024 avatar. */
export function isSquarish(aspect) {
  return aspect !== null && aspect !== undefined && aspect > 0.87 && aspect < 1.15;
}

/**
 * Width/height of a remote image, read from the file header via a ranged
 * request so a multi-megabyte avatar isn't downloaded just to measure it.
 * Returns null for anything unrecognised.
 */
export async function imageAspect(url) {
  // 16KB: PNG/GIF need only the first few dozen bytes, but a JPEG from a
  // phone can carry a large EXIF thumbnail ahead of its frame header.
  const res = await fetch(url, { headers: { range: 'bytes=0-16383' } });
  if (!res.ok && res.status !== 206) return null;
  const b = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return dv.getUint32(16) / dv.getUint32(20);
  }
  // GIF: dimensions are little-endian uint16 right after the header.
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return dv.getUint16(6, true) / dv.getUint16(8, true);
  }
  // JPEG: walk the marker chain to the start-of-frame, which carries the size.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0-3, SOF5-7, SOF9-11, SOF13-15 — every non-differential frame type.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return dv.getUint16(i + 7, false) / dv.getUint16(i + 5, false);
      }
      i += 2 + dv.getUint16(i + 2, false);
    }
    return null;
  }
  return null;
}

/**
 * Measure a card's image so the right Twitter card type is chosen, defaulting
 * to `fallback` when the header can't be read. Avatars default to `summary`
 * (they're square by convention, and the app's own uploader center-crops them),
 * where an arbitrary uploaded image reads better as the large card.
 */
export async function measure(image, fallback = null) {
  if (!image) return null;
  try {
    const aspect = await imageAspect(image);
    return aspect ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Values that end up inside HTML attributes come from third-party ENS records.
 * Quotes are escaped by the rewriter so they can't break out, but angle
 * brackets and control characters are stripped anyway — they only ever make a
 * card render badly.
 */
export function cleanText(raw, max = 120) {
  return raw
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Rewrites the values of tags already present in index.html. Editing in place
 * rather than appending keeps exactly one of each, which is what crawlers
 * expect when they take the first match.
 */
class MetaRewriter {
  constructor(card) { this.card = card; }

  element(el) {
    const key = el.getAttribute('property') ?? el.getAttribute('name');
    if (!key) return;
    const { title, description, image, aspect, url, type } = this.card;

    switch (key) {
      case 'og:title':
      case 'twitter:title':
        el.setAttribute('content', title);
        break;
      case 'og:description':
      case 'twitter:description':
      case 'description':
        // The plain description tag drives search results, not just cards.
        el.setAttribute('content', description);
        break;
      case 'og:url':
        el.setAttribute('content', url);
        break;
      case 'og:type':
        el.setAttribute('content', type ?? 'article');
        break;
      case 'og:image':
      case 'twitter:image':
        // Left alone when the route has no image of its own, so it keeps
        // index.html's default card rather than losing its image entirely.
        if (image) el.setAttribute('content', image);
        break;
      case 'og:image:width':
      case 'og:image:height':
      case 'og:image:type':
        // These describe the default og.png. A route image is a third party's
        // file of unknown size and format, and a wrong declared size makes some
        // clients letterbox or skip it, so drop them rather than lie.
        if (image) el.remove();
        break;
      case 'og:image:alt':
      case 'twitter:image:alt':
        if (image) el.setAttribute('content', this.card.imageAlt ?? title);
        break;
      case 'twitter:card':
        // `summary` is only right for a roughly square image; anything wider
        // (and the 1200x630 default) reads better as the large card.
        el.setAttribute('content', isSquarish(aspect) ? 'summary' : 'summary_large_image');
        break;
    }
  }
}

class CanonicalRewriter {
  constructor(card) { this.card = card; }
  element(el) { el.setAttribute('href', this.card.url); }
}

class TitleRewriter {
  constructor(card) { this.card = card; }
  element(el) { el.setInnerContent(this.card.title); }
}
