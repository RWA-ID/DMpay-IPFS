import { API_URL } from './site';
import type { LinkPreviewContent } from './chatContent';

/**
 * Building a link preview, sender-side.
 *
 * Two steps, both run by the person sending the message: ask the unfurl
 * function for a page's OpenGraph tags, then pull the preview image down and
 * shrink it into a `data:` URI small enough to live inside the message.
 *
 * Inlining the image is the whole point. If the card referenced the publisher's
 * image URL, every recipient's browser would fetch it on render — telling that
 * host who read the message and when, inside a chat that is otherwise end-to-end
 * encrypted. A few kilobytes of base64 buys the property that opening a message
 * touches nothing but XMTP.
 *
 * Every failure here is non-fatal by design. No preview just means the message
 * sends as ordinary text with a clickable link, which is the outcome anyway
 * when app.dmpay.me is unreachable — as it is for an IPFS visitor whenever the
 * Pages host is down.
 */

/** Longest edge of the stored thumbnail, in px. */
const THUMB_MAX_EDGE = 320;

/** Give up on a slow site rather than making someone wait to send a message. */
const UNFURL_TIMEOUT_MS = 7000;

/**
 * Ceiling for the encoded thumbnail.
 *
 * XMTP messages are not a CDN. Past this the preview is dropped and the card
 * renders text-only, which is a far better trade than a chat that stalls
 * syncing because someone shared a page with a huge hero image.
 */
const MAX_THUMB_BYTES = 120 * 1024;

type UnfurlResponse = {
  url?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
  error?: string;
};

/**
 * Load an image through the proxy and re-encode it small.
 *
 * The proxy is required for two reasons: the publisher's host usually sends no
 * CORS headers, and without them the canvas is tainted and `toDataURL` throws.
 * Routing through our own origin gives readable pixels.
 */
export async function thumbnailFromUrl(imageUrl: string, maxEdge = THUMB_MAX_EDGE): Promise<string | undefined> {
  const proxied = `${API_URL}/api/unfurl?image=1&url=${encodeURIComponent(imageUrl)}`;

  const bitmap = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), UNFURL_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = proxied;
  });

  if (!bitmap || !bitmap.naturalWidth || !bitmap.naturalHeight) return undefined;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
  const width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
  const height = Math.max(1, Math.round(bitmap.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(bitmap, 0, 0, width, height);

  // JPEG at 0.72 is comfortably below the byte cap for a 320px thumbnail while
  // still looking like the site's own card. Transparency is irrelevant here —
  // the card sits on an opaque panel.
  let encoded: string;
  try {
    encoded = canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    // Tainted canvas — the proxy didn't supply CORS headers for this response.
    return undefined;
  }

  // base64 is ~4/3 of the bytes it encodes; compare on the string itself since
  // that is what actually ships.
  if (encoded.length > MAX_THUMB_BYTES) return undefined;
  return encoded;
}

/**
 * Fetch preview metadata for a URL. Returns null when there's nothing worth
 * showing — including when the endpoint is unavailable.
 */
export async function unfurl(url: string): Promise<Omit<LinkPreviewContent, 'text'> | null> {
  let data: UnfurlResponse;
  try {
    const response = await fetch(`${API_URL}/api/unfurl?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(UNFURL_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    data = await response.json();
  } catch {
    return null;
  }

  if (data.error) return null;

  const title = data.title?.trim() || undefined;
  const description = data.description?.trim() || undefined;

  // A card with only a URL on it tells the reader nothing the linkified text
  // doesn't already. Require something real before showing one.
  if (!title && !description && !data.image) return null;

  const image = data.image ? await thumbnailFromUrl(data.image) : undefined;

  return {
    url: data.url || url,
    title,
    description,
    siteName: data.siteName?.trim() || undefined,
    image,
  };
}
