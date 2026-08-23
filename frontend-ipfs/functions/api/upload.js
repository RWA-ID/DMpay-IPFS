/**
 * IPFS upload proxy: POST /api/upload
 *
 * The Pinata key used to be VITE_PINATA_JWT, which the `VITE_` prefix compiles
 * into the browser bundle. That bundle is pinned to IPFS, and IPFS cannot be
 * unpublished — so the key was readable by anyone, permanently, in every
 * version of the app ever pinned, and it was shared with ArtID besides.
 * Replacing a published credential does not unpublish it; only revoking does.
 * Moving it behind this endpoint is the half of "rotate that key" that lasts.
 *
 * It lives here rather than in a standalone Worker because `/api/nfts` already
 * established the pattern: the IPFS build has no server, so it calls
 * app.dmpay.me cross-origin through VITE_API_URL. Reusing that means no new
 * deploy target, no new endpoint variable, and one origin allowlist.
 *
 * Unlike the NFT picker, this is NOT a degrade-gracefully feature — it is the
 * attachment send path. If this endpoint is down, images fail to send. That is
 * the same availability tradeoff the key exposure was already buying, just
 * moved somewhere it can be fixed.
 *
 * Configuration (Pages project → Settings):
 *   PINATA_JWT  (secret)  upload-only key scoped to DMpay alone. Never name it
 *                         VITE_* anywhere — that prefix is the original bug.
 *   RATE        (KV, optional) per-IP upload counters. Absent, uploads are
 *                         uncapped per caller; see gate() for why that matters
 *                         more here than it did for the NFT proxy.
 */

import { corsHeaders } from '../_cors.js';

/**
 * Two upload kinds, kept apart so the loose one stays as small as possible.
 *
 *   encrypted — XMTP attachment ciphertext. Opaque by construction: it is
 *               AES-GCM output, so there is nothing to validate and no content
 *               type to check. Any bytes are legal here, which makes this the
 *               path someone would abuse as free storage. Size and rate are
 *               the only things holding it.
 *   public    — group avatars, unencrypted, fetched by every member. Real
 *               images, so the type allowlist applies in full.
 *
 * Caps sit just above the client's own (10 MB attachments, 5 MB avatars):
 * encryption expands the payload slightly, and a server cap that rejects a
 * file the client accepted reads to the user as "sending is broken".
 */
const KINDS = {
  encrypted: {
    maxBytes: 12 * 1024 * 1024,
    types: null, // anything — see above
    prefix: 'dmpay',
  },
  public: {
    maxBytes: 6 * 1024 * 1024,
    types: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
    prefix: 'dmpay-group',
  },
};

/** Uploads per IP per hour. One attachment is one upload; this is generous. */
const RATE_LIMIT = 60;

/* Pinata 400s an image whose *metadata* name has no extension — not the
   multipart filename, the pinataMetadata name. Restored from the content type
   we already validated, because callers legitimately pass display labels. */
const EXT_FOR_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

function withExtension(name, type) {
  if (/\.[A-Za-z0-9]{2,5}$/.test(name)) return name;
  return name + (EXT_FOR_TYPE[type] ?? '');
}

const json = (request, body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, 'POST, OPTIONS') },
  });

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, 'POST, OPTIONS'),
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/* Without this, a GET to /api/upload falls through to static asset serving and
   answers 200 with the app's index.html — which reads, to anyone probing, as an
   endpoint that exists and works. Say what it actually is. */
export async function onRequestGet({ request }) {
  return json(request, { error: 'POST a file to this endpoint' }, 405);
}

/**
 * Bounds the damage a stranger with this URL can do to our storage bill.
 *
 * KV is not atomic, so a burst can slip a few requests past the limit. That is
 * fine: this is a cost ceiling, not a correctness boundary. If RATE is not
 * bound at all the endpoint still works — the check is skipped — which keeps a
 * missing binding from taking messaging down, at the price of the ceiling.
 */
async function rateLimited(request, env) {
  if (!env.RATE) return false;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = `up:${new Date().toISOString().slice(0, 13)}:${ip}`;
  const used = Number((await env.RATE.get(key)) ?? 0);
  if (used >= RATE_LIMIT) return true;
  await env.RATE.put(key, String(used + 1), { expirationTtl: 3900 });
  return false;
}

export async function onRequestPost({ request, env }) {
  // No Origin header, or one not on the list, means this is not our app.
  if (!corsHeaders(request, 'POST, OPTIONS')['Access-Control-Allow-Origin']) {
    return json(request, { error: 'origin not allowed' }, 403);
  }
  if (!env.PINATA_JWT) {
    return json(request, { error: 'uploads are not configured on this deployment' }, 503);
  }
  if (await rateLimited(request, env)) {
    return json(request, { error: 'too many uploads, try again later' }, 429);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(request, { error: 'expected multipart/form-data' }, 400);
  }

  const kind = KINDS[String(form.get('kind') ?? '')];
  if (!kind) return json(request, { error: 'kind must be "encrypted" or "public"' }, 400);

  /* Duck-typed rather than `instanceof File`: a FormData entry is typed as
     `string | File` and File is not a value the runtime narrows against.
     Checking the shape we actually use is honest about what we need. */
  const entry = form.get('file');
  if (!entry || typeof entry === 'string' || typeof entry.size !== 'number') {
    return json(request, { error: 'missing file field' }, 400);
  }
  if (entry.size > kind.maxBytes) return json(request, { error: 'file too large' }, 413);

  // Type comes from the bytes we received, never from a caller-supplied field.
  const type = (entry.type || '').split(';')[0].trim().toLowerCase();
  if (kind.types && !kind.types.has(type)) {
    return json(request, { error: `content type not allowed: ${type || 'unknown'}` }, 415);
  }

  const rawName = String(form.get('name') ?? entry.name ?? 'upload');
  const name = rawName.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80) || 'upload';

  const out = new FormData();
  /* Forward the file under its own filename, not the display name: the display
     name is a label and may have had its extension stripped by sanitising. */
  out.append('file', entry, withExtension(entry.name || name, type));
  out.append('pinataMetadata', JSON.stringify({ name: withExtension(`${kind.prefix}-${name}`, type) }));
  out.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  let res;
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
      body: out,
    });
  } catch {
    return json(request, { error: 'could not reach the pinning service' }, 502);
  }

  if (!res.ok) {
    // Never forward Pinata's error text: it can echo the request back, and the
    // request carries the key. The status code is safe and is what you need.
    console.error('pinata upload failed', res.status, (await res.text()).slice(0, 300));
    return json(request, { error: 'upload failed', upstreamStatus: res.status }, 502);
  }

  const data = await res.json();
  if (!data?.IpfsHash) return json(request, { error: 'upload failed' }, 502);
  return json(request, { cid: data.IpfsHash });
}
