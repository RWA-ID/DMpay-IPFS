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

export const profileUrl = (idOrEns: string) => siteUrl(`/u/${idOrEns}`);
export const profileLabel = (idOrEns: string) => siteLabel(`/u/${idOrEns}`);

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

export const groupUrl = (id: bigint | string, name?: string | null) => siteUrl(groupPath(id, name));
export const groupLabel = (id: bigint | string, name?: string | null) => siteLabel(groupPath(id, name));
