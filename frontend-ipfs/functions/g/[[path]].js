import {
  DMPAY_DIRECT_ADDRESS, ZERO_ADDRESS, client, groupsAbi, renderCard, shareUrl,
  shortAddress, formatPrice, verifiedEnsName, cleanText, measure,
} from '../_og.js';

/**
 * Per-group link previews: a shared /g/ link reads as that group rather than as
 * the generic DMpay card. See functions/_og.js for how the rewrite works.
 */

export async function onRequestGet({ request, params, env }) {
  // Only describe a well-formed group path; anything else falls through to the
  // static card, so a bad link still boots the app and shows its own error.
  const segments = [].concat(params.path ?? []);
  const id = segments.length === 1 ? parseGroupId(segments[0]) : null;
  return renderCard(request, env, () => (id === null ? null : buildCard(id)));
}

async function buildCard(id) {
  // The slug on a shared link is decorative and attacker-controllable, so the
  // canonical form is the bare id.
  const url = shareUrl(`/g/${id.toString()}`);
  const tuple = await client.readContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: groupsAbi,
    functionName: 'groups',
    args: [id],
  });
  const [creator, priceUsdc, priceEth, capacity, memberCount, active] = tuple;

  if (creator === ZERO_ADDRESS) {
    return { title: `Group #${id} — DMpay`, description: "This group doesn't exist.", image: null, url };
  }

  const creatorName = await verifiedEnsName(creator).catch(() => null);
  const published = creatorName ? await publishedMeta(creatorName, id).catch(() => null) : null;
  const byline = creatorName ?? shortAddress(creator);

  const price = formatPrice(priceUsdc, priceEth) ?? 'Free';
  const seats = capacity > 0n
    ? `${memberCount}/${capacity} seats taken`
    : `${memberCount} member${memberCount === 1n ? '' : 's'}`;

  const title = published?.name
    ? `${published.name} — a paid group by ${byline}`
    : `Group #${id} by ${byline} — DMpay`;

  const description = active
    ? `${price} for a seat · ${seats}. Pay once to join an end-to-end encrypted group chat on XMTP, settled on Ethereum. 97.5% goes to the creator.`
    : `This group is closed. ${seats}.`;

  // Creators upload whatever shape they like, so the card format follows the
  // image rather than assuming it's a square avatar: a wide image center-
  // cropped into `summary` loses its sides, a square one stretched into
  // `summary_large_image` loses its top and bottom.
  const aspect = await measure(published?.image);

  return {
    title,
    description,
    image: published?.image ?? null,
    imageAlt: published?.name ? `${published.name} group image` : `Group #${id} image`,
    aspect,
    url,
  };
}

/** Mirrors src/lib/groupMeta.ts — the creator's public copy of the group identity. */
async function publishedMeta(verifiedName, id) {
  const raw = await client.getEnsText({ name: verifiedName, key: `me.dmpay.group.${id.toString()}` });
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    name: typeof parsed.name === 'string' && cleanText(parsed.name) ? cleanText(parsed.name) : null,
    image: typeof parsed.image === 'string' && /^https?:\/\//i.test(parsed.image.trim())
      ? parsed.image.trim().slice(0, 500)
      : null,
  };
}

/** Accepts "0" or "0-alpha-leaks-chat" — the slug is decorative, see lib/site.ts. */
function parseGroupId(raw) {
  const match = raw?.match(/^(\d+)(?:-.*)?$/);
  if (!match) return null;
  try { return BigInt(match[1]); } catch { return null; }
}
