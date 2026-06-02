import { useQuery } from '@tanstack/react-query';

type EfpStats = { followers: number; following: number };

/** EFP (Ethereum Follow Protocol) follower/following counts. Public API, CORS-open — no proxy needed. */
export function useEfpStats(idOrAddress?: string) {
  return useQuery<EfpStats | null>({
    queryKey: ['efp-stats', idOrAddress?.toLowerCase()],
    enabled: !!idOrAddress,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`https://api.ethfollow.xyz/api/v1/users/${idOrAddress}/stats`);
      if (!res.ok) return null;
      const json = (await res.json()) as { followers_count?: string | number; following_count?: string | number };
      return {
        followers: Number(json.followers_count ?? 0),
        following: Number(json.following_count ?? 0),
      };
    },
  });
}

/** Official EFP icon mark (ethereumfollowprotocol/docs public/logo.svg). */
export function EfpIcon({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <rect width="512" height="512" rx="40" fill="url(#efp_grad)" />
      <path d="M167.68 258.56L255.36 112.64L342.4 258.56L255.36 311.68L167.68 258.56Z" fill="#333333" />
      <path d="M255.36 327.68L167.68 274.56L255.36 398.08L342.4 274.56L255.36 327.68Z" fill="#333333" />
      <path d="M367.36 341.76H342.4V378.88H307.84V401.92H342.4V440.32H367.36V401.92H401.28V378.88H367.36V341.76Z" fill="#333333" />
      <defs>
        <linearGradient id="efp_grad" x1="256" y1="256" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE067" />
          <stop offset="1" stopColor="#FFF7D9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * EFP social-graph chip for a profile. Links to the user's EFP profile.
 * Renders nothing while loading or when the account has no EFP graph (0/0).
 */
export function EfpChip({ idOrAddress }: { idOrAddress: string }) {
  const { data } = useEfpStats(idOrAddress);
  if (!data || (data.followers === 0 && data.following === 0)) return null;
  return (
    <a
      href={`https://efp.app/${idOrAddress}`}
      target="_blank"
      rel="noreferrer"
      title="View social graph on EFP"
      className="inline-flex items-center gap-1.5 bg-chip text-chip-ink text-[11px] font-medium px-2.5 py-1 rounded-full"
    >
      <EfpIcon size={12} />
      <span className="tabular-nums">{data.followers.toLocaleString()}</span>
      <span className="text-text-muted">followers</span>
      <span className="text-text-faint">·</span>
      <span className="tabular-nums">{data.following.toLocaleString()}</span>
      <span className="text-text-muted">following</span>
    </a>
  );
}
