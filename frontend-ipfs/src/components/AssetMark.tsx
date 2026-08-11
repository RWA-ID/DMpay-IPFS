/**
 * ETH and USDC marks, drawn inline.
 *
 * Deliberately not <img> tags pointing at a token-list CDN. This app is served
 * from IPFS gateways with no guarantee of a working network path to anyone
 * else's host, and a price row whose logos silently fail to load is worse than
 * one that never had them. Inline SVG also means no extra request, no layout
 * shift, and correct rendering offline.
 *
 * The tints match the asset colours the tip cards already use, so an amount
 * reads the same whether it appears on a discover card or in a chat receipt.
 */

export const ASSET_TINT = {
  USDC: '#4D9EE4',
  ETH: '#8C99E0',
} as const;

export type AssetSymbol = keyof typeof ASSET_TINT;

/** The Ethereum octahedron. */
function EthMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 320 512"
      role="img"
      aria-label="ETH"
      className="shrink-0"
    >
      {/* Upper halves lighter than the lower, which is what gives the mark its
          folded look at small sizes — a flat silhouette reads as a blob. */}
      <path fill={ASSET_TINT.ETH} fillOpacity="0.85" d="M311.9 260.8 160 353.6 8 260.8 160 0z" />
      <path fill={ASSET_TINT.ETH} d="M160 383.4 8 290.6 160 512l152-221.4z" />
    </svg>
  );
}

/** USDC: filled disc with a dollar glyph knocked through it. */
function UsdcMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="USDC"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="11" fill={ASSET_TINT.USDC} />
      <g
        fill="none"
        stroke="#0B0B0A"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.9"
      >
        {/* The stem runs past the bowl top and bottom, as on the real mark. */}
        <path d="M12 5.6v12.8" />
        <path d="M15 9.1c0-1.4-1.35-2.2-3-2.2s-3 .8-3 2.2c0 1.3 1.05 1.85 3 2.3s3 1 3 2.4c0 1.4-1.35 2.3-3 2.3s-3-.9-3-2.3" />
      </g>
    </svg>
  );
}

export function AssetMark({ asset, size = 14 }: { asset: AssetSymbol; size?: number }) {
  return asset === 'ETH' ? <EthMark size={size} /> : <UsdcMark size={size} />;
}

/**
 * An amount with its coin mark. Used wherever a price is quoted in a
 * particular asset rather than as an abstract number.
 */
export function AssetAmount({ asset, amount, size = 14, className = '' }: {
  asset: AssetSymbol;
  amount: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <AssetMark asset={asset} size={size} />
      <span className="font-mono tabular-nums">{amount}</span>
    </span>
  );
}
