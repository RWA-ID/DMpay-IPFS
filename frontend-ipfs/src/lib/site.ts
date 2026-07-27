/**
 * Per-deploy site config.
 *
 * The same source ships to two places with different routing constraints:
 *   - app.dmpay.me (Cloudflare Pages) — clean paths, SPA fallback via public/_redirects
 *   - dmpay.eth / IPFS gateways       — hash routing, since gateways can't rewrite 404s
 *
 * Set by `vite build --mode pages` / `--mode ipfs` (see .env.pages / .env.ipfs).
 */

export const CLEAN_URLS = import.meta.env.VITE_CLEAN_URLS === 'true';

/** Canonical origin for shareable links — never the IPFS gateway host the user happens to be on. */
export const SITE_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://dmpay.eth.link';

/** Host shown in UI next to copyable links, e.g. "app.dmpay.me". */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

/** Absolute URL for an in-app route, in whichever URL shape this build uses. */
export function siteUrl(path: string): string {
  return CLEAN_URLS ? `${SITE_URL}${path}` : `${SITE_URL}/#${path}`;
}

/** Same as siteUrl but without the scheme — for display in the UI. */
export function siteLabel(path: string): string {
  return CLEAN_URLS ? `${SITE_HOST}${path}` : `${SITE_HOST}/#${path}`;
}

/**
 * Where links handed to *other people* point.
 *
 * Deliberately not the origin the user is on. A link copied from the IPFS
 * build would otherwise be a gateway URL with a hash route, and a hash is
 * never sent to the server — so no crawler can read it and every shared group
 * or profile falls back to the generic DMpay card. app.dmpay.me serves the
 * same app with clean paths and a Pages function that renders a real preview.
 *
 * The tradeoff is explicit: a shared link now depends on that host staying up,
 * where a dmpay.eth link would outlive it. The app itself stays reachable over
 * IPFS either way — this only decides which URL gets pasted into a tweet.
 */
export const SHARE_URL = (import.meta.env.VITE_SHARE_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://app.dmpay.me';
export const SHARE_HOST = SHARE_URL.replace(/^https?:\/\//, '');

/** Absolute link for sharing. Always a clean path — SHARE_URL supports them. */
export const shareUrl = (path: string) => `${SHARE_URL}${path}`;
export const shareLabel = (path: string) => `${SHARE_HOST}${path}`;

export const profileUrl = (idOrEns: string) => shareUrl(`/u/${idOrEns}`);
export const profileLabel = (idOrEns: string) => shareLabel(`/u/${idOrEns}`);

/**
 * URL-safe form of a group name, appended to the id purely so a shared link
 * describes itself: /g/0-alpha-leaks-chat. The router reads the leading id and
 * ignores the rest, so the slug can change (or be absent) without breaking an
 * already-shared link.
 *
 * It is decoration, never a source of truth — anyone can craft any slug for
 * any id, so nothing in the app should display it as the group's real name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

export function groupPath(id: bigint | string, name?: string | null): string {
  const slug = name ? slugify(name) : '';
  return `/g/${id.toString()}${slug ? `-${slug}` : ''}`;
}

export const groupUrl = (id: bigint | string, name?: string | null) => shareUrl(groupPath(id, name));
export const groupLabel = (id: bigint | string, name?: string | null) => shareLabel(groupPath(id, name));
