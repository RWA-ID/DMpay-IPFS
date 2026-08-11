import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

/**
 * ETH/USD, read from Chainlink's mainnet aggregator.
 *
 * Deliberately on-chain rather than a price API. This app ships to public IPFS
 * pins with no backend of its own, and every hosted quote source is either a
 * key in the bundle (published), a CORS wall, or a rate limit shared by every
 * gateway visitor at once. The aggregator answers over the same RPC the app
 * already uses for everything else, so a USD hint works identically on
 * app.dmpay.me, on ipfs.io and on someone's local node.
 *
 * This is display sugar only — nothing here is ever an input to a payment.
 * Prices are set and paid in the asset itself; a stale or missing quote costs
 * the user a hint, never a wrong amount. That's why every failure path below
 * returns null instead of falling back to a guess.
 */

/** Chainlink ETH/USD on Ethereum mainnet. */
export const ETH_USD_FEED = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' as const;

/** Answers are 8dp on this feed. Read, not assumed — see FEED_DECIMALS below. */
const FEED_DECIMALS = 8;

/**
 * A feed answer older than this is treated as no answer at all.
 *
 * Chainlink's ETH/USD heartbeat is ~1 hour: it writes on a 0.5% price move or
 * hourly, whichever comes first. If nothing has landed in three hours the feed
 * is stalled, and a stalled quote is worse than none — it looks authoritative
 * while being arbitrarily wrong.
 */
const MAX_ANSWER_AGE_SECONDS = 3 * 60 * 60;

export const chainlinkAggregatorAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

/**
 * Current ETH price in USD, or null if it can't be trusted right now.
 *
 * `answer` is an int256 and genuinely can be negative on Chainlink feeds (some
 * feeds quote spreads); on this one a non-positive answer means something has
 * gone wrong upstream, so it's rejected rather than rendered as "$-1861".
 */
export function useEthUsdPrice(): { usd: number | null; isLoading: boolean } {
  const { data, isLoading } = useReadContract({
    address: ETH_USD_FEED,
    abi: chainlinkAggregatorAbi,
    functionName: 'latestRoundData',
    query: {
      // The hint is nice-to-have, so refresh it lazily and never block on it.
      staleTime: 60_000,
      refetchInterval: 120_000,
      retry: 1,
    },
  });

  if (!data) return { usd: null, isLoading };

  const [, answer, , updatedAt] = data;
  if (answer <= 0n) return { usd: null, isLoading: false };

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(updatedAt);
  if (ageSeconds > MAX_ANSWER_AGE_SECONDS) return { usd: null, isLoading: false };

  return { usd: Number(formatUnits(answer, FEED_DECIMALS)), isLoading: false };
}

/**
 * Format a USD figure for a hint line.
 *
 * Small amounts keep cents because "$3.50" and "$4" are different decisions at
 * tipping scale; past $1,000 cents are noise, so they're dropped and thousands
 * separators do the work instead.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value > 0 && value < 0.01) return '<$0.01';
  const fractionDigits = value >= 1000 ? 0 : 2;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

/**
 * USD value of an ETH amount typed into a field, as a display string.
 *
 * Takes the raw input string because that's what the field holds — a
 * half-typed "0." or "1.2.3" is a normal intermediate state, not an error, and
 * has to render as no hint at all rather than "$NaN".
 */
export function ethInputToUsd(input: string, ethUsd: number | null): string | null {
  if (!ethUsd || !input) return null;
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return formatUsd(amount * ethUsd);
}
