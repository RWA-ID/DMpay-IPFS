import { normalize } from 'viem/ens';
import { logsClient } from './logs';

/**
 * Public, third-party-readable group identity.
 *
 * XMTP group metadata is encrypted to members and the DMpay contract stores no
 * name or image, so a non-member has nothing to render. The creator can publish
 * a public copy as a text record on their own ENS name — the one public
 * keystore they already control.
 */
export type PublicGroupMeta = { name: string | null; image: string | null };

/** Reverse-DNS namespaced, matching the `com.twitter` / `org.telegram` convention. */
export function groupTextKey(id: bigint | string): string {
  return `me.dmpay.group.${id.toString()}`;
}

export function encodeGroupMeta(meta: PublicGroupMeta): string {
  const out: Record<string, string> = {};
  if (meta.name) out.name = meta.name.trim().slice(0, 120);
  if (meta.image) out.image = meta.image.trim();
  return JSON.stringify(out);
}

/**
 * Parse a published record. Everything here is attacker-controlled text from a
 * third party's ENS name, so each field is type-checked, length-capped, and —
 * for the image — restricted to http(s) to keep `javascript:` and `data:` URLs
 * out of an <img src>.
 */
export function decodeGroupMeta(raw: string | null | undefined): PublicGroupMeta | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 120) : null;
  const image = typeof obj.image === 'string' && /^https?:\/\//i.test(obj.image.trim())
    ? obj.image.trim().slice(0, 500)
    : null;
  if (!name && !image) return null;
  return { name, image };
}

/**
 * The creator's ENS name, but only if it actually belongs to them.
 *
 * A reverse record is self-asserted: any address can claim any name. Trusting
 * it unverified would let someone publish group metadata "from" a name they
 * don't own, so the name is forward-resolved back to the address first — the
 * standard ENS forward/reverse round-trip.
 */
export async function verifiedEnsName(address: `0x${string}`): Promise<string | null> {
  try {
    const name = await logsClient.getEnsName({ address });
    if (!name) return null;
    const normalized = safeNormalize(name);
    if (!normalized) return null;
    const forward = await logsClient.getEnsAddress({ name: normalized });
    if (!forward || forward.toLowerCase() !== address.toLowerCase()) return null;
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Published metadata for a set of a single creator's groups. One ENS
 * round-trip per creator, then one text read per group.
 */
export async function fetchPublicGroupMeta(
  creator: `0x${string}`,
  ids: (bigint | string)[],
): Promise<Map<string, PublicGroupMeta>> {
  const out = new Map<string, PublicGroupMeta>();
  if (ids.length === 0) return out;
  const name = await verifiedEnsName(creator);
  if (!name) return out;

  await Promise.all(ids.map(async (id) => {
    try {
      const raw = await logsClient.getEnsText({ name, key: groupTextKey(id) });
      const meta = decodeGroupMeta(raw);
      if (meta) out.set(id.toString(), meta);
    } catch {
      /* a missing or unreadable record just means "not published" */
    }
  }));
  return out;
}

function safeNormalize(name: string): string | undefined {
  try { return normalize(name); } catch { return undefined; }
}
