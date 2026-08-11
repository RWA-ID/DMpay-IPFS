/**
 * Link preview backend: GET /api/unfurl?url=…
 *
 * Reads the OpenGraph tags of a page so the composer can attach a preview to
 * an outgoing message. A browser can't do this itself — fetching a third-party
 * page cross-origin is exactly what CORS forbids — so it has to happen here.
 *
 * ## Why only the sender calls this
 *
 * DMpay chats are end-to-end encrypted. If every client unfurled the links it
 * *received*, this server would learn the URL of every link in every private
 * conversation, and the image host would learn each reader's IP — which is a
 * read receipt for anyone who can see that host's logs. So the sender unfurls
 * once, at compose time, for a link they chose and already know; the preview
 * travels inside the encrypted message, and recipients render it without
 * touching the network. See lib/chatContent.ts (ContentTypeLinkPreview).
 *
 * ## SSRF
 *
 * This endpoint fetches a URL supplied by whoever calls it, which is the
 * classic setup for using someone else's server to reach things they can't.
 * Guards below: scheme allowlist, literal private/loopback/link-local address
 * rejection (169.254.169.254 is cloud metadata), a redirect chain we walk
 * ourselves so every hop is re-checked rather than followed blindly, a hard
 * timeout, and a byte cap on the body we read.
 *
 * A hostname that resolves to a private address (DNS rebinding) can't be
 * caught here — Workers give no pre-resolution hook. The mitigation is the
 * runtime itself: Cloudflare's edge has no route to a private network, so
 * there is nothing behind such an address for this code to reach.
 */

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Same allowlist as the NFT proxy — an open proxy is a resource anyone can spend. */
function corsOrigin(request) {
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
    host.endsWith('.eth.link') ||
    host.endsWith('.eth.limo') ||
    host.endsWith('.ipfs.dweb.link') ||
    host.endsWith('.ipfs.cf-ipfs.com');
  return allowed ? origin : null;
}

function corsHeaders(request, contentType = 'application/json') {
  const origin = corsOrigin(request);
  const headers = { 'Content-Type': contentType };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

const json = (request, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}

/**
 * Reject addresses that only mean something from inside a network.
 *
 * Only literal IPs are checked — a hostname is left to the runtime, per the
 * DNS-rebinding note above.
 */
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }

  // IPv6 loopback, unspecified, unique-local (fc00::/7) and link-local (fe80::/10).
  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — unwrap and re-check.
  //
  // Both spellings have to be handled: the URL parser rewrites the dotted form
  // into hex, so `[::ffff:127.0.0.1]` arrives here as `::ffff:7f00:1`. Matching
  // only the readable form silently lets loopback through.
  const mappedDotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedDotted) return isBlockedHost(mappedDotted[1]);
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isBlockedHost(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (v4.slice(1).some((o) => Number(o) > 255)) return true; // malformed
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function validateTarget(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'That is not a valid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http and https links can be previewed' };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { error: 'That address cannot be previewed' };
  }
  return { url: parsed };
}

/**
 * Follow redirects by hand so each hop is validated.
 *
 * `redirect: 'follow'` would let a public URL bounce us to 169.254.169.254 with
 * no chance to look, which defeats every check above.
 */
async function guardedFetch(target, init) {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateTarget(current.toString());
    if (check.error) return { error: check.error };

    const response = await fetch(check.url.toString(), { ...init, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) return { error: 'That page could not be reached' };
      try {
        current = new URL(location, check.url);
      } catch {
        return { error: 'That page could not be reached' };
      }
      continue;
    }
    return { response, finalUrl: check.url };
  }
  return { error: 'That link redirects too many times' };
}

/** Read at most `limit` bytes, so a huge or endless body can't exhaust us. */
async function readCapped(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= limit) {
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    out.set(chunk.subarray(0, out.length - offset), offset);
    offset += chunk.length;
  }
  return out;
}

const decodeEntities = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * Pull one meta value out of raw HTML.
 *
 * Regex rather than a parser because Workers have no DOM and a preview is not
 * worth shipping one for. Attribute order varies by site, so both orderings
 * are tried; anything unmatched simply yields no preview field, which the card
 * already has to handle.
 */
function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return null;
}

function titleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : null;
}

/** Cap what we echo back: a preview card shows a line or two, not an essay. */
const clamp = (value, max) =>
  value && value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const target = (requestUrl.searchParams.get('url') || '').trim();
  const wantsImage = requestUrl.searchParams.get('image') === '1';

  const check = validateTarget(target);
  if (check.error) return json(request, { error: check.error }, 400);

  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  // Image mode: stream the bytes back with CORS so the sender's canvas can
  // downscale them without tainting. Same guards, different payload.
  if (wantsImage) {
    let result;
    try {
      result = await guardedFetch(check.url, {
        signal,
        headers: { accept: 'image/*' },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
    } catch {
      return json(request, { error: 'Could not load that image' }, 502);
    }
    if (result.error) return json(request, { error: result.error }, 400);
    const { response } = result;
    if (!response.ok) return json(request, { error: 'Could not load that image' }, 502);

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.startsWith('image/')) {
      return json(request, { error: 'That link is not an image' }, 415);
    }
    const bytes = await readCapped(response, MAX_IMAGE_BYTES);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders(request, contentType),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  let result;
  try {
    result = await guardedFetch(check.url, {
      signal,
      headers: {
        // Some sites serve OG tags only to something that looks like a crawler.
        'User-Agent': 'Mozilla/5.0 (compatible; DMpayBot/1.0; +https://dmpay.eth.link)',
        accept: 'text/html,application/xhtml+xml',
      },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
  } catch {
    return json(request, { error: 'Could not reach that page' }, 502);
  }

  if (result.error) return json(request, { error: result.error }, 400);
  const { response, finalUrl } = result;
  if (!response.ok) return json(request, { error: 'That page could not be read' }, 502);

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('html')) {
    return json(request, { error: 'That link has no preview' }, 415);
  }

  const bytes = await readCapped(response, MAX_HTML_BYTES);
  const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  const rawImage =
    metaContent(html, 'og:image:secure_url') ||
    metaContent(html, 'og:image') ||
    metaContent(html, 'twitter:image') ||
    metaContent(html, 'twitter:image:src');

  // Resolve against the *final* URL: a relative og:image on a redirected page
  // resolves against where we ended up, not where we started.
  let image = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, finalUrl);
      if ((resolved.protocol === 'http:' || resolved.protocol === 'https:') && !isBlockedHost(resolved.hostname)) {
        image = resolved.toString();
      }
    } catch {
      image = null;
    }
  }

  return json(request, {
    url: finalUrl.toString(),
    title: clamp(metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || titleTag(html), 120),
    description: clamp(
      metaContent(html, 'og:description') || metaContent(html, 'twitter:description') || metaContent(html, 'description'),
      200,
    ),
    image,
    siteName: clamp(metaContent(html, 'og:site_name'), 60),
  });
}
