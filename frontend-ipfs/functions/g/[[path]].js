import { createPublicClient, fallback, http, formatEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

/**
 * Per-group link previews for app.dmpay.me.
 *
 * The app is client-rendered, so a crawler fetching /g/0 sees only the static
 * meta tags in index.html — every group shares the generic DMpay card. This
 * serves the same index.html with the group's own title, description and image
 * swapped in, so a shared link reads as that group.
 *
 * Pages-only by nature: the IPFS build has no server, so gateway links keep the
 * generic card. Nothing here changes what users see — the SPA still boots
 * normally and fetches its own state.
 */

const DMPAY_DIRECT_ADDRESS = '0xAB2ef1b1A39D2DA7DAC2bCD16238cC1cE5530c52';
const SITE_URL = 'https://app.dmpay.me';

const groupsAbi = [{
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

const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://gateway.tenderly.co/public/mainnet'),
    http('https://eth.api.onfinality.io/public'),
  ]),
});

export async function onRequestGet({ request, params, env }) {
  // Fetch "/" rather than "/index.html": the asset server 308s the explicit
  // filename to the directory form, and that redirect would be what we returned.
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url)));

  // Only rewrite a well-formed group path; anything else passes through
  // untouched, so a bad link still boots the app and shows its own error.
  const segments = [].concat(params.path ?? []);
  const id = parseGroupId(segments[0]);
  if (id === null || segments.length > 1) return page;

  let card;
  try {
    card = await buildCard(id);
  } catch (e) {
    // A crawler getting the generic card beats a 500 that renders nothing.
    console.error('og card build failed', e);
    return page;
  }

  const rewritten = new HTMLRewriter()
    .on('meta', new MetaRewriter(card))
    .on('link[rel="canonical"]', new CanonicalRewriter(card))
    .on('head', new ImageAppender(card))
    .on('title', new TitleRewriter(card))
    .transform(page);

  const out = new Response(rewritten.body, rewritten);
  // Crawlers re-fetch often and group state moves slowly.
  out.headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  return out;
}

async function buildCard(id) {
  const url = `${SITE_URL}/g/${id.toString()}`;
  const tuple = await client.readContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: groupsAbi,
    functionName: 'groups',
    args: [id],
  });
  const [creator, priceUsdc, priceEth, capacity, memberCount, active] = tuple;

  if (creator === '0x0000000000000000000000000000000000000000') {
    return { title: `Group #${id} — DMpay`, description: "This group doesn't exist.", image: null, url };
  }

  const creatorName = await verifiedEnsName(creator).catch(() => null);
  const published = creatorName ? await publishedMeta(creatorName, id).catch(() => null) : null;
  const byline = creatorName ?? `${creator.slice(0, 6)}…${creator.slice(-4)}`;

  const price =
    priceUsdc > 0n ? `$${Number(formatUnits(priceUsdc, 6)).toFixed(2)}`
    : priceEth > 0n ? `${formatEther(priceEth)} ETH`
    : 'Free';
  const seats = capacity > 0n
    ? `${memberCount}/${capacity} seats taken`
    : `${memberCount} member${memberCount === 1n ? '' : 's'}`;

  const title = published?.name
    ? `${published.name} — a paid group by ${byline}`
    : `Group #${id} by ${byline} — DMpay`;

  const description = active
    ? `${price} for a seat · ${seats}. Pay once to join an end-to-end encrypted group chat on XMTP, settled on Ethereum. 97.5% goes to the creator.`
    : `This group is closed. ${seats}.`;

  return { title, description, image: published?.image ?? null, url };
}

/** Mirrors src/lib/groupMeta.ts — the creator's public copy of the group identity. */
async function publishedMeta(verifiedName, id) {
  const raw = await client.getEnsText({ name: verifiedName, key: `me.dmpay.group.${id.toString()}` });
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    name: typeof parsed.name === 'string' && cleanName(parsed.name) ? cleanName(parsed.name) : null,
    image: typeof parsed.image === 'string' && /^https?:\/\//i.test(parsed.image.trim())
      ? parsed.image.trim().slice(0, 500)
      : null,
  };
}

/**
 * Names come from a third party's ENS record and end up inside HTML
 * attributes. Quotes are escaped by the rewriter, so they can't break out, but
 * angle brackets and control characters are stripped anyway — they only ever
 * make a card render badly.
 */
function cleanName(raw) {
  return raw
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Reverse records are self-asserted, so the name is forward-resolved back to
 * the address before it's used — otherwise a card could carry a name the
 * creator doesn't own.
 */
async function verifiedEnsName(address) {
  const name = await client.getEnsName({ address });
  if (!name) return null;
  let normalized;
  try { normalized = normalize(name); } catch { return null; }
  const forward = await client.getEnsAddress({ name: normalized });
  if (!forward || forward.toLowerCase() !== address.toLowerCase()) return null;
  return normalized;
}

/** Accepts "0" or "0-alpha-leaks-chat" — the slug is decorative, see lib/site.ts. */
function parseGroupId(raw) {
  const match = raw?.match(/^(\d+)(?:-.*)?$/);
  if (!match) return null;
  try { return BigInt(match[1]); } catch { return null; }
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
    const { title, description, image, url } = this.card;

    switch (key) {
      case 'og:title':
      case 'twitter:title':
        el.setAttribute('content', title);
        break;
      case 'og:description':
      case 'twitter:description':
        el.setAttribute('content', description);
        break;
      case 'og:url':
        el.setAttribute('content', url);
        break;
      case 'og:type':
        el.setAttribute('content', 'article');
        break;
      case 'description':
        // The plain description tag drives search results, not just cards.
        el.setAttribute('content', description);
        break;
      case 'twitter:card':
        // A group image is a square avatar; the large-image card crops it
        // badly, so only claim that format when there is no group image.
        el.setAttribute('content', image ? 'summary' : 'summary_large_image');
        break;
    }
  }
}

/** index.html carries no image tags, so they're added only when one exists. */
class ImageAppender {
  constructor(card) { this.card = card; }

  element(head) {
    if (!this.card.image) return;
    const safe = escapeAttr(this.card.image);
    head.append(`<meta property="og:image" content="${safe}" />`, { html: true });
    head.append(`<meta name="twitter:image" content="${safe}" />`, { html: true });
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

/**
 * The image URL comes from a third party's ENS record. It's already restricted
 * to http(s), but it still lands inside an HTML attribute here, so quotes and
 * angle brackets are escaped to keep it from breaking out of the tag.
 */
function escapeAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
