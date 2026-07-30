import { renderCard, shareUrl } from './_og.js';

/**
 * Fixed routes that have nothing to look up on-chain but still deserve their
 * own title, description and canonical — without this they all inherit the
 * landing page's, so /terms shared into a chat reads as "Your inbox is worth
 * more than zero" and every route claims to be the site root.
 *
 * Each route gets a two-line function file rather than one catch-all, so the
 * static-asset routing stays untouched and an unlisted path still falls
 * through to the SPA and the default card.
 */
const PAGES = {
  '/discover': {
    title: 'Discover — people worth reaching on DMpay',
    description: 'Browse the inboxes and paid group chats taking payment to open a conversation. Pay in USDC or ETH; 97.5% settles straight to the person you are reaching.',
  },
  '/inbox': {
    title: 'Your conversations — DMpay',
    description: 'Paid conversations you have opened and received, carried over XMTP and end-to-end encrypted. Connect a wallet to read your inbox.',
  },
  '/settings': {
    title: 'Set your price — DMpay',
    description: 'Publish what it costs to reach you, in USDC or ETH, plus an optional lifetime pass. 97.5% of every payment settles directly to your wallet.',
  },
  '/groups/new': {
    title: 'Create a paid group — DMpay',
    description: 'Set a seat price and a capacity, and DMpay opens an encrypted XMTP group for everyone who pays in. 97.5% of every seat sold goes to you.',
  },
  '/privacy': {
    title: 'Privacy Policy — DMpay',
    description: 'DMpay has no backend, no accounts and no user database. The interface runs entirely in your browser and talks directly to Ethereum, XMTP, ENS and IPFS through your own wallet.',
  },
  '/terms': {
    title: 'Terms of Service — DMpay',
    description: 'DMpay is a set of immutable smart contracts on Ethereum plus an open-source front end. We are not a broker, custodian or party to any transaction, and never hold or control your funds.',
  },
};

/** Handler for one fixed route. Unknown paths decline and keep the static card. */
export function pageHandler(path) {
  return async function onRequestGet({ request, env }) {
    const page = PAGES[path];
    return renderCard(request, env, () => (page ? { ...page, image: null, url: shareUrl(path), type: 'website' } : null));
  };
}
