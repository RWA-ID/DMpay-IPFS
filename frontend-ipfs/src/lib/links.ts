/**
 * Finding URLs in message text.
 *
 * Everything here operates on bytes from a peer. A message is not a document
 * we authored — anyone can put anything in one — so this module only ever
 * *locates* substrings and hands back plain data. It never produces HTML, and
 * nothing downstream may pass its output to dangerouslySetInnerHTML: the
 * renderer builds React elements, which escape text by construction.
 *
 * The scheme allowlist is the other half of that. `javascript:`, `data:` and
 * `vbscript:` in an href are script execution on click, so a bare "look for
 * something://" pattern would hand every sender an XSS. Only http and https
 * are ever linkified; anything else stays inert text.
 */

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string };

/**
 * Matches http(s) URLs and bare www. hosts.
 *
 * Kept deliberately conservative — this runs over every message body, so a
 * pattern with nested quantifiers would be a denial-of-service waiting for a
 * crafted message. The character classes are flat and non-overlapping.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/**
 * Trailing characters that are almost always sentence punctuation rather than
 * part of the URL. "check dexscreener.com/foo." should not link the full stop.
 */
const TRAILING_JUNK = /[.,;:!?'"]+$/;

/**
 * Strip unbalanced closing brackets from the end.
 *
 * "(see https://x.com/a)" would otherwise swallow the closing paren, while
 * "https://en.wikipedia.org/wiki/Ether_(cryptocurrency)" legitimately ends in
 * one. Counting decides which.
 */
function trimUnbalanced(url: string, open: string, close: string): string {
  let out = url;
  while (out.endsWith(close)) {
    const opens = (out.match(new RegExp(`\\${open}`, 'g')) ?? []).length;
    const closes = (out.match(new RegExp(`\\${close}`, 'g')) ?? []).length;
    if (closes <= opens) break;
    out = out.slice(0, -1);
  }
  return out;
}

function tidy(raw: string): string {
  let url = raw.replace(TRAILING_JUNK, '');
  url = trimUnbalanced(url, '(', ')');
  url = trimUnbalanced(url, '[', ']');
  return url;
}

/**
 * The href to actually navigate to, or null if this must not become a link.
 *
 * Parsing with `new URL` rather than string-matching is the point: it resolves
 * the real scheme after any escaping or case games ("JaVaScRiPt:", tabs and
 * newlines inside the scheme) that a hand-rolled prefix check would miss.
 */
export function safeHref(raw: string): string | null {
  const candidate = raw.startsWith('www.') ? `https://${raw}` : raw;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

/**
 * Split message text into plain runs and linkable URLs.
 *
 * Returns a single text segment when there's nothing to link, which lets the
 * renderer keep its existing cheap path for the overwhelmingly common case.
 */
export function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start === undefined) continue;
    const tidied = tidy(match[0]);
    const href = safeHref(tidied);
    if (!href) continue;

    if (start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, start) });
    segments.push({ kind: 'url', value: tidied, href });
    cursor = start + tidied.length;
  }

  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) });
  return segments;
}

/** The first linkable URL in a message, for preview purposes. */
export function firstUrl(text: string): string | null {
  for (const segment of segmentText(text)) {
    if (segment.kind === 'url') return segment.href;
  }
  return null;
}

/** Host without "www.", for the preview card's source line. */
export function displayHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
