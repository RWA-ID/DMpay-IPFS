import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePublicClient, useEnsName, useEnsAvatar, useEnsText, useReadContract } from 'wagmi';
import { parseAbiItem, formatUnits, formatEther } from 'viem';
import { normalize } from 'viem/ens';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { Footer } from './Footer';
import { Avatar } from './Avatar';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';

type Creator = { address: `0x${string}`; lastSeenBlock: bigint; openCount: number };

export function Discover() {
  const publicClient = usePublicClient();
  const navigate = useNavigate();
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        // publicnode caps eth_getLogs at ~50k blocks — scan most-recent window
        const fromBlock = latest > 49_999n ? latest - 49_999n : 0n;
        const event = parseAbiItem(
          'event ConversationOpened(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee)'
        );
        const logs = await publicClient.getLogs({
          address: DMPAY_DIRECT_ADDRESS,
          event,
          fromBlock,
          toBlock: latest,
        });
        const byRecipient = new Map<string, Creator>();
        for (const log of logs) {
          const recipient = log.args.recipient as `0x${string}` | undefined;
          if (!recipient) continue;
          const key = recipient.toLowerCase();
          const prev = byRecipient.get(key);
          if (!prev || log.blockNumber > prev.lastSeenBlock) {
            byRecipient.set(key, {
              address: recipient,
              lastSeenBlock: log.blockNumber,
              openCount: (prev?.openCount ?? 0) + 1,
            });
          } else {
            prev.openCount += 1;
          }
        }
        const list = Array.from(byRecipient.values())
          .sort((a, b) => Number(b.lastSeenBlock - a.lastSeenBlock));
        if (!cancelled) setCreators(list);
      } catch (e: any) {
        console.error('discover scan failed', e);
        if (!cancelled) setError(e?.message ?? 'Failed to load creators');
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient]);

  const total = creators?.length ?? 0;

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pt-12 pb-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· Discover</div>
            <h1 className="dm-display text-4xl sm:text-[64px] mt-2 text-text-primary">People worth reaching.</h1>
            <p className="text-text-secondary mt-4 max-w-2xl leading-relaxed">
              Live from the contract — every creator who's received a paid DM recently.
              {creators && <> <span className="font-mono text-text-muted">{total} active in the last ~7 days.</span></>}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2"
          >
            <Search size={14} /> Search by ENS
          </button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        {creators === null && !error && (
          <div className="flex items-center gap-2 text-text-secondary text-sm font-mono">
            <Loader2 className="animate-spin" size={14} /> Scanning recent on-chain activity…
          </div>
        )}
        {error && (
          <div className="bg-bg-panel border border-danger/30 text-danger rounded-2xl p-4 text-sm">{error}</div>
        )}
        {creators && creators.length === 0 && (
          <div className="bg-bg-panel border border-border-subtle rounded-3xl p-10 text-center">
            <div className="text-text-primary font-medium mb-1">No paid conversations in the last ~7 days.</div>
            <div className="text-text-secondary text-sm">Be the first — set your price and share your link.</div>
          </div>
        )}
        {creators && creators.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {creators.map(c => <CreatorCard key={c.address} c={c} />)}
            <SetYourPriceSlot />
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

function CreatorCard({ c }: { c: Creator }) {
  const navigate = useNavigate();
  const { data: ensName } = useEnsName({ address: c.address });
  const normalized = ensName ? safeNormalize(ensName) : undefined;
  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });
  const { data: description } = useEnsText({ name: normalized, key: 'description', query: { enabled: !!normalized } });
  const { data: price } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: [c.address],
  });
  const usdc = price?.[0] ?? 0n;
  const eth = price?.[1] ?? 0n;
  const display = ensName ?? `${c.address.slice(0, 6)}…${c.address.slice(-4)}`;
  const target = ensName ?? c.address;

  return (
    <button
      onClick={() => navigate(`/u/${target}`)}
      className="bg-bg-panel border border-border-subtle rounded-2xl p-5 text-left hover:bg-bg-elevated transition-colors flex flex-col gap-4 min-h-[200px]"
    >
      <div className="flex items-start gap-3">
        <Avatar src={avatar || undefined} fallback={display[0]} size={44} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[14px] font-medium text-text-primary truncate">{display}</div>
          <div className="font-mono text-[11px] text-text-muted mt-0.5 truncate">
            {c.address.slice(0, 6)}…{c.address.slice(-4)}
          </div>
        </div>
      </div>
      {description && (
        <p className="text-[13px] text-text-secondary leading-snug line-clamp-2">{String(description)}</p>
      )}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Per DM</div>
          <div className="font-mono text-[15px] font-medium text-text-primary mt-1">
            {usdc > 0n ? `$${formatUnits(usdc, 6)}` : eth > 0n ? `${formatEther(eth)} ETH` : '—'}
          </div>
        </div>
        <div className="flex items-center gap-1 text-text-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{c.openCount}× paid</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </button>
  );
}

function SetYourPriceSlot() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/settings')}
      className="rounded-2xl border border-dashed border-border-strong p-5 text-left flex flex-col items-start justify-between min-h-[200px] hover:bg-bg-elevated/40 transition-colors"
    >
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· Empty slot</div>
        <div className="text-base font-medium text-text-primary mt-2">You could be here.</div>
        <div className="text-[13px] text-text-muted mt-1.5 leading-snug">
          Set a price on your wallet and your profile goes live in seconds.
        </div>
      </div>
      <span className="inline-flex items-center gap-2 font-mono text-xs text-text-primary mt-3">
        Set your price <ArrowRight size={12} />
      </span>
    </button>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
