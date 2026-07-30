import {
  DMPAY_DIRECT_ADDRESS, client, priceAbi, shareUrl, shortAddress, formatPrice,
  resolveIdentity, avatarUrl, cleanText, measure,
} from './_og.js';

/**
 * The card behind an account link — /u/alice.eth (their profile) and
 * /c/0x… (the thread with them). Both describe the same person and the same
 * price, so they share a builder and differ only in framing.
 *
 * This is the most-shared surface in the app: "pay to DM me" links are the
 * whole point, and until now every one of them rendered as the generic site
 * card, which said nothing about whose inbox it was or what it cost.
 */

/**
 * @param raw   the path segment as shared — an ENS name or a 0x address
 * @param kind  'profile' for /u/, 'thread' for /c/
 */
export async function identityCard(raw, kind) {
  const input = cleanText(raw, 260);
  if (!input) return null;

  const identity = await resolveIdentity(input);

  // Nothing resolves: say so plainly instead of letting the landing page's
  // copy imply the link works.
  if (!identity) {
    return {
      title: `${input} — DMpay`,
      description: `Nothing resolves for ${input}. The link may be mistyped, or the name may have no address record set.`,
      image: null,
      url: shareUrl(pathFor(kind, input, null)),
      type: 'website',
    };
  }

  const { address, name, expired } = identity;
  const url = shareUrl(pathFor(kind, address, name));

  // A lapsed name keeps resolving to the previous holder's address, so a card
  // that showed it as an identity would be vouching for someone who no longer
  // owns it. Mirrors the warning the profile itself shows.
  if (expired) {
    return {
      title: `${name} has expired — DMpay`,
      description: `This ENS name is past its grace period and open for registration. It still answers with the previous holder's address, but nobody owns it right now, so this link proves nothing about who you'd be paying.`,
      image: null,
      url,
      type: 'website',
    };
  }

  const display = name ?? shortAddress(address);
  const [price, avatar] = await Promise.all([
    client.readContract({
      address: DMPAY_DIRECT_ADDRESS,
      abi: priceAbi,
      functionName: 'priceOf',
      args: [address],
    }).catch(() => null),
    avatarUrl(name).catch(() => null),
  ]);

  const perDm = price ? formatPrice(price[0], price[1]) : null;
  const lifetime = price ? formatPrice(price[2], price[3]) : null;

  // ENS avatars are square by convention, and DMpay's own uploader center-crops
  // to a square, so an unreadable header falls back to the small `summary`
  // card rather than having a portrait stretched across a 1.91:1 frame.
  const aspect = await measure(avatar, 1);

  return {
    title: kind === 'thread' ? `Message ${display} on DMpay` : `Pay to DM ${display} — DMpay`,
    description: describe(display, perDm, lifetime),
    image: avatar,
    imageAlt: `${display} on DMpay`,
    aspect,
    url,
    type: 'profile',
  };
}

function describe(display, perDm, lifetime) {
  const settles = `Messages run over XMTP, end-to-end encrypted; payment settles on Ethereum and 97.5% goes straight to ${display}.`;

  if (perDm && lifetime) {
    return `${perDm} to send a message, or ${lifetime} for a lifetime pass. ${settles}`;
  }
  if (perDm) {
    return `${perDm} to send ${display} a message. ${settles}`;
  }
  if (lifetime) {
    return `${lifetime} for a lifetime pass to ${display}'s inbox. ${settles}`;
  }
  return `${display} hasn't set a price yet. DMpay lets anyone put a price on their inbox — strangers pay to get through, and 97.5% of it settles straight to their wallet.`;
}

/**
 * Canonical path for the identity, in whichever surface was shared.
 *
 * /u/ resolves either form, so it canonicalises to the name when there is one —
 * it's the more legible and more stable of the two. /c/ does not: ChatView
 * hands its route param straight to XMTP as an address, so a name there would
 * be a link that renders a broken page.
 */
function pathFor(kind, address, name) {
  const id = kind === 'thread' ? address : (name ?? address);
  return `${kind === 'thread' ? '/c' : '/u'}/${encodeURIComponent(id)}`;
}
