import { useEnsName, useReadContract } from 'wagmi';
import {
  BASE_REGISTRAR,
  baseRegistrarAbi,
  ethRegistrarLabel,
  isExpiredStatus,
  registrarTokenId,
  statusFromExpiry,
  type EnsNameStatus,
} from '../lib/ensExpiry';

/**
 * Registration status of an already-resolved name. See lib/ensExpiry.ts for why
 * resolution alone doesn't tell you whether a name is still owned.
 */
export function useEnsNameStatus(name: string | null | undefined): {
  status: EnsNameStatus;
  expiry: bigint | undefined;
  isLoading: boolean;
} {
  const label = ethRegistrarLabel(name);
  const { data: expiry, isLoading } = useReadContract({
    address: BASE_REGISTRAR,
    abi: baseRegistrarAbi,
    functionName: 'nameExpires',
    args: label ? [registrarTokenId(label)] : undefined,
    query: { enabled: !!label },
  });

  // No `.eth` registrar governs this name, so there is no expiry to honour.
  if (!label) return { status: 'live', expiry: undefined, isLoading: false };
  return { status: statusFromExpiry(expiry), expiry, isLoading };
}

/**
 * `useEnsName`, minus names whose registration has lapsed.
 *
 * Drop-in replacement: same params, and `data` still carries the name to show.
 * A name past its grace period resolves to `null` — the address it points at is
 * a leftover record, not an identity anybody holds. Names inside the grace
 * period still come back (only the previous owner can renew, so it hasn't
 * changed hands) but `status` reports `grace` so callers can flag them.
 *
 * `data` stays `undefined` while the expiry read is in flight, so an expired
 * name never flashes on screen before being withdrawn.
 */
export function useVerifiedEnsName(params: {
  address?: `0x${string}`;
  query?: { enabled?: boolean };
}): {
  data: string | null | undefined;
  isLoading: boolean;
  status: EnsNameStatus;
  expiry: bigint | undefined;
  /**
   * The reverse record as resolved, before the expiry screen. Only for telling
   * someone *which* of their names lapsed — never render it as an identity.
   */
  unverifiedName: string | null | undefined;
  refetch: ReturnType<typeof useEnsName>['refetch'];
} {
  const { data: name, isLoading: loadingName, refetch } = useEnsName(params);
  const { status, expiry, isLoading: loadingStatus } = useEnsNameStatus(name);

  const data = loadingStatus ? undefined : isExpiredStatus(status) ? null : name;
  return { data, isLoading: loadingName || loadingStatus, status, expiry, unverifiedName: name, refetch };
}
