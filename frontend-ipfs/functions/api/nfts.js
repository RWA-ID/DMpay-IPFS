/**
 * NFT picker backend: GET /api/nfts?address=0x…
 *
 * Enumerating what an address owns needs an indexer — plain RPC can't do it —
 * so this proxies OpenSea. It exists as a function purely to keep the API key
 * server-side: the app ships to public IPFS pins and a public repo, so a key in
 * the bundle is a published key.
 *
 * The IPFS build calls this host cross-origin, which is the same tradeoff
 * src/lib/site.ts already documents for share links: the app stays reachable
 * over IPFS regardless, but this one feature depends on app.dmpay.me being up.
 * When it isn't, the picker degrades to entering a contract and token id by
 * hand — sending an NFT never depends on this endpoint, only browsing does.
 *
 * Set OPENSEA_API_KEY in the Pages project (Settings → Environment variables).
 */

import { corsHeaders } from '../_cors.js';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const MAX_LIMIT = 50;

const json = (request, body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** ipfs:// and ipns:// URLs can't be loaded by an <img> — rewrite to a gateway. */
function httpImage(url) {
  if (!url || typeof url !== 'string') return undefined;
  if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.slice('ipfs://'.length)}`;
  if (url.startsWith('ipns://')) return `https://ipfs.io/ipns/${url.slice('ipns://'.length)}`;
  return url.startsWith('http') ? url : undefined;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const address = (url.searchParams.get('address') || '').trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json(request, { error: 'A valid address is required' }, 400);
  }
  if (!env.OPENSEA_API_KEY) {
    return json(request, { error: 'NFT browsing is not configured on this deployment' }, 503);
  }

  const limit = Math.min(Number(url.searchParams.get('limit')) || MAX_LIMIT, MAX_LIMIT);
  const cursor = url.searchParams.get('cursor');

  const upstream = new URL(`${OPENSEA_BASE}/chain/ethereum/account/${address}/nfts`);
  upstream.searchParams.set('limit', String(limit));
  if (cursor) upstream.searchParams.set('next', cursor);

  let res;
  try {
    res = await fetch(upstream, {
      headers: { 'x-api-key': env.OPENSEA_API_KEY, accept: 'application/json' },
      // Same wallet asked twice in a minute is the common case (open picker,
      // close, reopen) and the answer barely changes.
      cf: { cacheTtl: 60, cacheEverything: true },
    });
  } catch {
    return json(request, { error: 'Could not reach OpenSea' }, 502);
  }

  if (!res.ok) {
    // Don't leak upstream error bodies — they can echo the key back on auth failures.
    const reason = res.status === 401 || res.status === 403
      ? 'NFT browsing is misconfigured on this deployment'
      : `OpenSea returned ${res.status}`;
    return json(request, { error: reason }, res.status === 429 ? 429 : 502);
  }

  const data = await res.json();

  const nfts = (data.nfts || [])
    // Spam collections are most of what a real wallet holds. An NFT with no
    // image is nothing to show in a visual picker anyway.
    .filter((n) => n.contract && n.identifier && (n.display_image_url || n.image_url))
    .map((n) => ({
      contract: n.contract,
      tokenId: n.identifier,
      standard: (n.token_standard || 'erc721').toLowerCase(),
      name: n.name || null,
      collection: n.collection || null,
      image: httpImage(n.display_image_url || n.image_url) || null,
    }));

  return json(request, { nfts, cursor: data.next || null });
}
