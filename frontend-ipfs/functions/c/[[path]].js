import { renderCard } from '../_og.js';
import { identityCard } from '../_identity.js';

/**
 * Thread links: /c/0x… — where the "pay to open a conversation" flow lives, and
 * what a paywall or a DM invite links to. Same person as /u/, framed as the
 * conversation rather than the profile.
 */
export async function onRequestGet({ request, params, env }) {
  const segments = [].concat(params.path ?? []);
  const raw = segments.length === 1 ? decodeSegment(segments[0]) : null;
  return renderCard(request, env, () => (raw ? identityCard(raw, 'thread') : null));
}

function decodeSegment(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}
