/**
 * One origin allowlist for every function that answers a cross-origin call.
 *
 * The IPFS build has no server of its own, so it calls app.dmpay.me from
 * whatever gateway host the visitor happens to be on. That host is not
 * predictable — users pick their own gateway, and subdomain gateways mint a
 * new hostname per CID — so gateways are matched by suffix rather than listed.
 *
 * Deliberately not `*`. `/api/nfts` spends our OpenSea rate limit and
 * `/api/upload` spends our Pinata storage; an open proxy hands both to anyone
 * who finds the URL. Origin is not a strong boundary (curl sends whatever it
 * likes) but a browser will not let a page forge it, which is what stops other
 * sites from scripting these endpoints with someone else's visitors.
 *
 * Shared rather than copied per function on purpose: the allowlist is the only
 * thing standing in front of the upload endpoint, and a gateway host added to
 * one copy but not the other fails as "attachments break on that gateway",
 * which nobody would connect back to a CORS list.
 */

export function corsOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return null;
  }
  const allowed =
    host === 'app.dmpay.me' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    // Hector's dedicated Pinata gateway — the one every pin is verified on.
    host === 'ipfs.onchain-id.id' ||
    host.endsWith('.eth.link') ||
    host.endsWith('.eth.limo') ||
    host.endsWith('.ipfs.dweb.link') ||
    host.endsWith('.ipfs.cf-ipfs.com');
  return allowed ? origin : null;
}

/**
 * @param methods what to advertise in the preflight, e.g. 'GET, OPTIONS'
 */
export function corsHeaders(request, methods = 'GET, OPTIONS') {
  const origin = corsOrigin(request);
  const headers = {};
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = methods;
    headers['Vary'] = 'Origin';
  }
  return headers;
}
