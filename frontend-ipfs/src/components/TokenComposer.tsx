import { useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, Search, Send } from 'lucide-react';
import type { Dm, Group } from '@xmtp/browser-sdk';
import { tokenShareCodec, type TokenShareContent } from '../lib/chatContent';
import { ErrorNote, FieldLabel, SendModal } from './ChatSendShell';
import { thumbnailFromUrl } from '../lib/unfurl';
import {
  formatCompactUsd,
  formatPercent,
  formatTokenPrice,
  looksLikeAddress,
  pairsForToken,
  pickBestPair,
  searchTokens,
  type TokenPair,
} from '../lib/tokens';

/**
 * Share a token into the conversation.
 *
 * Unlike the tip and NFT composers this sends no transaction — it's a pointer
 * plus a price snapshot, so there's no wallet step, no approval and no target
 * to choose. A group gets the same card as a DM.
 *
 * ## Why the results list looks the way it does
 *
 * Searching "PEPE" returns dozens of tokens called PEPE, most of them worthless
 * copies of the one the searcher means. So every row shows liquidity and a
 * truncated contract address, and results are ordered by liquidity — the one
 * real market is nearly always the deepest, and a row with $400 of liquidity
 * next to one with $20M is self-evidently not the same thing. Picking the token
 * is the user's decision; this screen's job is to make the difference visible
 * rather than to make it for them.
 */

const NOTE_MAX = 120;
const MAX_RESULTS = 8;
const DEBOUNCE_MS = 350;

export function TokenComposer({ conversation, onClose, onSent }: {
  conversation: Dm<unknown> | Group<unknown>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenPair[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TokenPair | null>(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2 || picked) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        // An address is unambiguous, so look it up directly rather than
        // running it through search, which ranks by relevance to a name.
        const pairs = looksLikeAddress(trimmed)
          ? await pairsForToken(trimmed)
          : await searchTokens(trimmed);
        if (cancelled) return;

        // One row per token, not per pair — the same token trading on four
        // DEXes should not fill the list four times. Deepest pair represents it.
        const byToken = new Map<string, TokenPair>();
        for (const pair of pairs) {
          if (!pair.priceUsd || Number(pair.priceUsd) <= 0) continue;
          const key = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
          const existing = byToken.get(key);
          if (!existing || (pair.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)) {
            byToken.set(key, pair);
          }
        }
        setResults(
          Array.from(byToken.values())
            .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
            .slice(0, MAX_RESULTS),
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmed, picked]);

  const best = useMemo(() => (picked ? pickBestPair([picked]) : null), [picked]);

  async function share() {
    if (!picked || !best?.priceUsd || posting) return;
    setPosting(true);
    setFailure(null);
    try {
      // Inlined for the same reason as a link preview: rendering shouldn't
      // hit a third-party CDN, and the logo should survive that CDN going away.
      const image = picked.imageUrl ? await thumbnailFromUrl(picked.imageUrl, 96) : undefined;

      const content: TokenShareContent = {
        chain: picked.chainId,
        address: picked.baseToken.address,
        symbol: picked.baseToken.symbol,
        name: picked.baseToken.name || picked.baseToken.symbol,
        pairAddress: picked.pairAddress,
        pairUrl: picked.url || undefined,
        priceUsdAtShare: best.priceUsd,
        sharedAt: Math.floor(Date.now() / 1000),
        image,
        note: note.trim() || undefined,
      };
      await conversation.send(tokenShareCodec.encode(content) as any);
      onSent();
      onClose();
    } catch (e: any) {
      console.error('token share failed', e);
      setFailure(e?.message ?? 'Could not share that token');
    } finally {
      setPosting(false);
    }
  }

  return (
    <SendModal title="Share a token" kicker="· Token" onClose={onClose}>
      {!picked ? (
        <>
          <FieldLabel>Contract address or symbol</FieldLabel>
          <div className="flex items-center gap-2 bg-bg-elevated border border-border-subtle rounded-xl px-3.5 py-2.5 focus-within:border-brand">
            <Search size={14} className="text-text-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="0x6982… or PEPE"
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
            />
            {searching && <Loader2 size={13} className="animate-spin text-text-faint shrink-0" />}
          </div>

          {results && results.length === 0 && !searching && (
            <div className="mt-4 text-sm text-text-muted">
              Nothing trading under that name. Try the contract address.
            </div>
          )}

          {results && results.length > 0 && (
            <>
              <div className="mt-4 mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Sorted by liquidity — check the address
              </div>
              <div className="rounded-2xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                {results.map((pair) => (
                  <button
                    key={`${pair.chainId}:${pair.pairAddress}`}
                    onClick={() => setPicked(pair)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-bg-hover transition-colors"
                  >
                    {pair.imageUrl ? (
                      <img src={pair.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-elevated shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-bg-elevated grid place-items-center text-text-faint shrink-0">
                        <Coins size={13} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-medium text-text-primary truncate">${pair.baseToken.symbol}</span>
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-faint shrink-0">
                          {pair.chainId}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-text-faint truncate">
                        {pair.baseToken.address.slice(0, 10)}…{pair.baseToken.address.slice(-6)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[12px] text-text-primary tabular-nums">
                        {formatTokenPrice(pair.priceUsd)}
                      </div>
                      <div className="font-mono text-[10px] text-text-muted tabular-nums">
                        {formatCompactUsd(pair.liquidityUsd)} liq
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 bg-bg-elevated rounded-2xl p-3.5">
            {picked.imageUrl ? (
              <img src={picked.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-bg-panel shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-bg-panel grid place-items-center text-text-faint shrink-0">
                <Coins size={17} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="dm-display text-[17px] text-text-primary truncate">${picked.baseToken.symbol}</div>
              <div className="text-[11px] text-text-muted truncate">{picked.baseToken.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-[14px] text-text-primary tabular-nums">
                {formatTokenPrice(picked.priceUsd)}
              </div>
              <div className={`font-mono text-[10.5px] tabular-nums ${
                (picked.priceChange24h ?? 0) >= 0 ? 'text-success' : 'text-danger'
              }`}>
                {formatPercent(picked.priceChange24h)} 24h
              </div>
            </div>
          </div>

          <div className="mt-2 font-mono text-[10px] text-text-faint break-all leading-relaxed">
            {picked.baseToken.address}
          </div>
          <div className="mt-1 font-mono text-[10px] text-text-faint">
            {formatCompactUsd(picked.liquidityUsd)} liquidity on {picked.dexId} · {picked.chainId}
          </div>

          <button
            onClick={() => { setPicked(null); setResults(null); }}
            className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-text-primary"
          >
            ← Pick a different token
          </button>

          <div className="mt-5">
            <FieldLabel>Note (optional)</FieldLabel>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Why this one?"
              className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand"
            />
          </div>

          <p className="text-[11px] text-text-muted leading-relaxed mt-4">
            The card shows this price as your entry and updates the live price for
            everyone who reads it. Nothing is bought or sold — this is a link, not a trade.
          </p>

          {failure && <ErrorNote>{failure}</ErrorNote>}

          <button
            onClick={share}
            disabled={posting}
            className="mt-5 w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl py-3 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {posting
              ? <><Loader2 size={15} className="animate-spin" /> Sharing…</>
              : <><Send size={15} /> Share ${picked.baseToken.symbol}</>}
          </button>
        </>
      )}
    </SendModal>
  );
}
