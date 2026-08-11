import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Coins, TrendingDown, TrendingUp } from 'lucide-react';
import type { TokenShareContent } from '../lib/chatContent';
import {
  formatCompactUsd,
  formatPercent,
  formatTokenPrice,
  livePrice,
  moveSinceShare,
} from '../lib/tokens';

/**
 * A shared token, with what it's done since.
 *
 * The point of this card over a pasted address is the second line: the price
 * when it was sent against the price now. In a trading group that turns every
 * shared call into something with a record attached.
 *
 * ## What this card promises, and what it doesn't
 *
 * The live price is fetched by each reader straight from DexScreener, so it is
 * not something the sender can fake. "Shared at" is the opposite — it's a
 * number the sender's client wrote into the message and nobody can check, so
 * it's labelled as a claim and shown next to the message's own timestamp
 * rather than presented as a verified entry price.
 *
 * The address is always shown in full. Symbols are free to copy, and the most
 * common way to lose money on a link like this is buying a different token
 * with the same name.
 *
 * ## Privacy
 *
 * Rendering this card calls DexScreener from the reader's browser, which tells
 * them someone is looking at this pair. That's unavoidable for a live price —
 * it's the one card in the app that isn't inert, and it's why the logo is
 * still inlined rather than hot-linked: no reason to leak to a second host as
 * well.
 */

/** How often an open chat re-quotes a token. */
const PRICE_REFRESH_MS = 60_000;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint">{label}</div>
      <div className="font-mono text-[11.5px] text-text-secondary truncate tabular-nums">{value}</div>
    </div>
  );
}

export function TokenCard({ token, fromMe }: { token: TokenShareContent; fromMe: boolean }) {
  const { data: pair, isLoading } = useQuery({
    queryKey: ['token-price', token.chain, token.pairAddress],
    queryFn: () => livePrice(token.chain, token.pairAddress),
    refetchInterval: PRICE_REFRESH_MS,
    staleTime: PRICE_REFRESH_MS / 2,
    retry: 1,
  });

  const current = pair?.priceUsd ?? null;
  const move = current ? moveSinceShare(token.priceUsdAtShare, current) : null;
  const up = move !== null && move >= 0;

  const shortAddress = `${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
  const sharedDate = new Date(token.sharedAt * 1000).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex justify-center py-1">
      <div
        className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-panel overflow-hidden shadow-card"
        style={{
          // Tinted by direction, so a green or red card is legible while
          // scrolling past without reading a single number.
          backgroundImage:
            move === null
              ? undefined
              : `linear-gradient(160deg, ${up ? '#3FB95022' : '#E5484D22'} 0%, transparent 70%)`,
        }}
      >
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              {fromMe ? '· Token shared' : '· Token'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
              {token.chain}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {token.image ? (
              <img
                src={token.image}
                alt=""
                className="w-10 h-10 rounded-full object-cover bg-bg-elevated shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-bg-elevated grid place-items-center text-text-faint shrink-0">
                <Coins size={16} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="dm-display text-[19px] text-text-primary truncate">${token.symbol}</span>
              </div>
              <div className="text-[11px] text-text-muted truncate">{token.name}</div>
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint">Now</div>
              <div className="dm-display font-mono text-[22px] leading-none text-text-primary mt-1 truncate tabular-nums">
                {isLoading && !current ? '…' : formatTokenPrice(current)}
              </div>
            </div>
            {move !== null && (
              <div
                className={`flex items-center gap-1 font-mono text-[15px] font-medium shrink-0 tabular-nums ${
                  up ? 'text-success' : 'text-danger'
                }`}
              >
                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {formatPercent(move)}
              </div>
            )}
          </div>

          {/* The claim, stated as one. Paired with the date so the reader can
              weigh it against when the message actually arrived. */}
          <div className="mt-2 font-mono text-[10.5px] text-text-faint">
            shared at {formatTokenPrice(token.priceUsdAtShare)} · {sharedDate}
          </div>

          {token.note && (
            <p className="mt-2.5 text-[13px] leading-snug text-text-secondary break-words">
              “{token.note}”
            </p>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Liquidity" value={formatCompactUsd(pair?.liquidityUsd ?? null)} />
            <Stat label="24h vol" value={formatCompactUsd(pair?.volume24h ?? null)} />
            <Stat label="24h" value={formatPercent(pair?.priceChange24h ?? null)} />
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-border-subtle/70 flex items-center justify-between gap-2 bg-bg-base/30">
          {/* Full address on hover/long-press; the truncation is display only. */}
          <span className="font-mono text-[10px] text-text-faint truncate" title={token.address}>
            {shortAddress}
          </span>
          {token.pairUrl && (
            <a
              href={token.pairUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-0.5 font-mono text-[10px] text-text-faint hover:text-text-secondary transition-colors shrink-0"
            >
              chart <ArrowUpRight size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
