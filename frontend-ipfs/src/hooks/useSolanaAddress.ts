import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { normalize } from 'viem/ens';
import { useVerifiedEnsName } from './useVerifiedEnsName';
import { SOLANA_COIN_TYPE, solanaAddressFromEnsRecord } from '../lib/solana';

/**
 * The Solana address an Ethereum address publishes through ENS.
 *
 * Resolution order matters: it goes address → primary ENS name → `addr(node,
 * 501)`. That means a Solana tip is only possible for someone who has both set
 * a primary name *and* added the record — which is the correct bar. Without a
 * name there's no place to publish, and without the record they haven't said
 * they want SOL.
 *
 * Uses the verified-name hook rather than a raw reverse lookup so a name that
 * doesn't forward-resolve back to the same address is never trusted. Reverse
 * records are self-assigned; anyone can point one at any name they like, and
 * without the forward check a tip could be aimed by a stranger's claim.
 */
export function useSolanaAddress(address?: `0x${string}` | null) {
  const client = usePublicClient();
  const { data: ensName } = useVerifiedEnsName({
    address: address ?? undefined,
    query: { enabled: !!address },
  });

  const normalized = ensName ? safeNormalize(ensName) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['solana-address', normalized],
    enabled: !!client && !!normalized,
    // A payout address changes about as often as a bank account. Don't refetch
    // it on every window focus.
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const raw = await client!.getEnsAddress({
        name: normalized!,
        // viem takes coinType as a bigint. 501 is a plain SLIP-44 value, so
        // this is a straight widening — none of the ENSIP-11 sign trouble.
        coinType: BigInt(SOLANA_COIN_TYPE),
      });
      return solanaAddressFromEnsRecord(raw as string | null);
    },
  });

  return {
    solanaAddress: data ?? null,
    ensName: ensName ?? null,
    isLoading,
  };
}

function safeNormalize(name: string) {
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
}
