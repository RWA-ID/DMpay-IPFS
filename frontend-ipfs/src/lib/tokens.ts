/**
 * Token lookup, via DexScreener.
 *
 * OpenSea (the app's other market data source, see functions/api/nfts.js) is an
 * NFT index and has nothing to say about an ERC-20's price. DexScreener reads
 * DEX pairs directly, which is the only thing that works for the case this
 * feature exists for: a token that started trading this morning and is listed
 * nowhere. It also needs no API key and sends `access-control-allow-origin: *`,
 * so the IPFS build calls it from the browser with no backend in the path —
 * unlike the NFT picker, this feature doesn't degrade when app.dmpay.me is down.
 *
 * ## Trust
 *
 * Nothing here is authenticated and none of it should be presented as fact.
 * Anyone can deploy a token called USDC, so the UI must always show the
 * contract address and its liquidity — those are what distinguish the real
 * thing from a lookalike, and they're why `pickBestPair` sorts on liquidity
 * rather than taking whatever the API returns first.
 */

const DEXSCREENER = 'https://api.dexscreener.com/latest/dex';
const LOOKUP_TIMEOUT_MS = 8000;

/** Chains worth offering. DexScreener's ids, not our own naming. */
export const SUPPORTED_CHAINS = ['ethereum', 'base', 'solana', 'arbitrum', 'bsc', 'polygon'] as const;

export type TokenPair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string | null;
  priceChange24h: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv: number | null;
  imageUrl: string | null;
};

type RawPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
  info?: { imageUrl?: string };
};

function normalise(raw: RawPair): TokenPair | null {
  if (!raw.chainId || !raw.pairAddress || !raw.baseToken?.address) return null;
  return {
    chainId: raw.chainId,
    dexId: raw.dexId ?? 'unknown',
    pairAddress: raw.pairAddress,
    url: raw.url ?? '',
    baseToken: {
      address: raw.baseToken.address,
      name: raw.baseToken.name ?? '',
      symbol: raw.baseToken.symbol ?? '?',
    },
    quoteToken: {
      address: raw.quoteToken?.address ?? '',
      name: raw.quoteToken?.name ?? '',
      symbol: raw.quoteToken?.symbol ?? '',
    },
    priceUsd: raw.priceUsd ?? null,
    priceChange24h: raw.priceChange?.h24 ?? null,
    liquidityUsd: raw.liquidity?.usd ?? null,
    volume24h: raw.volume?.h24 ?? null,
    fdv: raw.fdv ?? null,
    imageUrl: raw.info?.imageUrl ?? null,
  };
}

/**
 * The pair that best represents a token's price.
 *
 * Deepest liquidity wins. A token typically trades in several pairs and the
 * thin ones are trivially manipulated — quoting a $300 pool would let anyone
 * make their token show any price they liked in a chat.
 */
export function pickBestPair(pairs: TokenPair[]): TokenPair | null {
  const priced = pairs.filter((p) => p.priceUsd && Number(p.priceUsd) > 0);
  if (priced.length === 0) return null;
  return priced.reduce((best, p) =>
    (p.liquidityUsd ?? 0) > (best.liquidityUsd ?? 0) ? p : best,
  );
}

async function get(path: string): Promise<RawPair[]> {
  const response = await fetch(`${DEXSCREENER}${path}`, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  const data = await response.json();
  return (data?.pairs ?? []) as RawPair[];
}

/** Every pair for a token contract, across chains. */
export async function pairsForToken(address: string): Promise<TokenPair[]> {
  const raw = await get(`/tokens/${encodeURIComponent(address.trim())}`);
  return raw.map(normalise).filter((p): p is TokenPair => p !== null);
}

/**
 * Free-text search — a symbol, a name, or an address.
 *
 * Results are unranked and full of impostors, so callers must show liquidity
 * and the contract address next to each hit rather than just the symbol.
 */
export async function searchTokens(query: string): Promise<TokenPair[]> {
  const raw = await get(`/search?q=${encodeURIComponent(query.trim())}`);
  return raw.map(normalise).filter((p): p is TokenPair => p !== null);
}

/** Current price for one known pair. Null when it can't be read. */
export async function livePrice(chainId: string, pairAddress: string): Promise<TokenPair | null> {
  try {
    const raw = await get(`/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`);
    const pair = raw.map(normalise).find((p): p is TokenPair => p !== null);
    return pair ?? null;
  } catch {
    return null;
  }
}

/**
 * Price formatting for tokens whose price can be $60,000 or $0.0000000034.
 *
 * Neither fixed decimals nor toPrecision alone handles that range: the first
 * renders a memecoin as "$0.00", the second renders a blue chip as
 * "$6.00e+4". Below a cent, count the leading zeros and keep four significant
 * digits after them, which is how every trading UI shows these.
 */
export function formatTokenPrice(price: number | string | null): string {
  const value = typeof price === 'string' ? Number(price) : price;
  if (value === null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value >= 0.01) return `$${stripTrailingZeros(value.toFixed(4))}`;
  const leadingZeros = Math.floor(-Math.log10(value));
  return `$${stripTrailingZeros(value.toFixed(Math.min(leadingZeros + 4, 18)))}`;
}

/**
 * "0.000002790" → "0.00000279".
 *
 * toFixed pads to a fixed width, so a price that needs fewer significant
 * digits than budgeted picks up trailing zeros. On a token price those read as
 * spurious precision and make two different prices look the same length.
 */
function stripTrailingZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/** Compact USD for liquidity, volume and market cap. */
export function formatCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** Signed percentage, e.g. "+63.2%". */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(value >= 100 || value <= -100 ? 0 : 1)}%`;
}

/**
 * Move from the price a token was shared at to its price now.
 *
 * This is the number the whole feature exists for: it turns a shared call into
 * something with a score attached.
 */
export function moveSinceShare(sharedPrice: string, currentPrice: string | null): number | null {
  const from = Number(sharedPrice);
  const to = Number(currentPrice);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

/** True for something that looks like a contract address on any supported chain. */
export function looksLikeAddress(value: string): boolean {
  const trimmed = value.trim();
  // EVM, or a base58 Solana mint.
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
}
