import { renderCard } from '../_og.js';
import { identityCard } from '../_identity.js';

/** Profile links: /u/alice.eth, /u/0x… — see functions/_identity.js. */
export async function onRequestGet({ request, params, env }) {
  const segments = [].concat(params.path ?? []);
  const raw = segments.length === 1 ? decodeSegment(segments[0]) : null;
  return renderCard(request, env, () => (raw ? identityCard(raw, 'profile') : null));
}

/** Pages hands back the raw segment; an ENS name with an escape in it is rare but legal. */
function decodeSegment(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}
