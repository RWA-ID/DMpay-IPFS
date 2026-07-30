import { labelhash, normalize } from 'viem/ens';
import { logsClient } from './logs';

/**
 * Expiry awareness for resolved ENS names.
 *
 * Neither viem nor the UniversalResolver checks whether a `.eth` name is still
 * registered. Expiry is enforced in exactly two places — the .eth registrar's
 * ERC-721 ownership and the controller's `available()` — and *nothing* clears
 * the resolution records when a name lapses: `registry.resolver(node)` and
 * `resolver.addr(node)` keep answering until somebody re-registers and
 * overwrites them. The reverse record is worse still, because
 * `<address>.addr.reverse` is a separate name owned by the address itself, so
 * its lifecycle is entirely independent of the `.eth` registration it names.
 *
 * The upshot is that a fully lapsed name keeps passing the forward/reverse
 * round-trip: both records are stale but consistent. The round-trip proves the
 * two records agree, not that anyone owns the name. Asking the registrar for
 * the expiry is the only way to tell the difference.
 */

/** BaseRegistrarImplementation — the source of truth for `.eth` 2LD expiry. */
export const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as const;

/** After expiry the previous owner keeps an exclusive 90-day window to renew. */
export const GRACE_PERIOD_SECONDS = 90n * 24n * 60n * 60n;

export const baseRegistrarAbi = [
  { type: 'function', name: 'nameExpires', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
] as const;

/**
 * `live`    — registered, not past expiry (or not registrar-governed at all).
 * `grace`   — past expiry but still renewable only by the previous owner. The
 *             name is not yet buyable, so we show it but flag it.
 * `expired` — past the grace period: unowned and open for registration. Records
 *             that still resolve are leftovers and must not be presented as an
 *             identity.
 * `unknown` — the expiry read failed. Treated as `live` so an RPC blip never
 *             blanks out every name in the UI.
 */
export type EnsNameStatus = 'live' | 'grace' | 'expired' | 'unknown';

/**
 * The `.eth` label whose registration governs `name`, or null if no `.eth`
 * registrar does.
 *
 * Expiry lives on the second-level domain, so a subname inherits its parent's:
 * `pay.alice.eth` is governed by `alice`. Names under other TLDs (DNS imports,
 * offchain namespaces) have their own lifecycles that this registrar knows
 * nothing about, so they are left alone.
 */
export function ethRegistrarLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  let normalized: string;
  try { normalized = normalize(name); } catch { return null; }
  const parts = normalized.split('.');
  if (parts.length < 2) return null;
  if (parts[parts.length - 1] !== 'eth') return null;
  const label = parts[parts.length - 2];
  return label ? label : null;
}

/** Token id `nameExpires` wants: the label hash as a uint256. */
export function registrarTokenId(label: string): bigint {
  return BigInt(labelhash(label));
}

export function statusFromExpiry(expiry: bigint | undefined, nowSeconds?: bigint): EnsNameStatus {
  if (expiry === undefined) return 'unknown';
  // A resolvable `.eth` name cannot have records without a registration, so a
  // zero expiry means the label lookup missed rather than that the name lapsed.
  // Staying permissive here keeps a bad guess from hiding a working name.
  if (expiry === 0n) return 'unknown';
  const now = nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (now < expiry) return 'live';
  if (now < expiry + GRACE_PERIOD_SECONDS) return 'grace';
  return 'expired';
}

/** True for a name that is past its grace period — unowned and buyable. */
export function isExpiredStatus(status: EnsNameStatus): boolean {
  return status === 'expired';
}

/** A registrar expiry timestamp as a plain date, for user-facing copy. */
export function expiryDate(expiry: bigint | undefined): string {
  if (!expiry) return 'an unknown date';
  return new Date(Number(expiry) * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Registrar expiry for a name, for non-React callers. Returns null when no
 * `.eth` registrar governs the name or the read fails.
 */
export async function fetchEnsExpiry(name: string | null | undefined): Promise<bigint | null> {
  const label = ethRegistrarLabel(name);
  if (!label) return null;
  try {
    return await logsClient.readContract({
      address: BASE_REGISTRAR,
      abi: baseRegistrarAbi,
      functionName: 'nameExpires',
      args: [registrarTokenId(label)],
    });
  } catch {
    return null;
  }
}

/** False only when the registrar says the name is past its grace period. */
export async function isEnsNameOwned(name: string | null | undefined): Promise<boolean> {
  const label = ethRegistrarLabel(name);
  if (!label) return true; // not registrar-governed — nothing to check against
  const expiry = await fetchEnsExpiry(name);
  return !isExpiredStatus(statusFromExpiry(expiry ?? undefined));
}
