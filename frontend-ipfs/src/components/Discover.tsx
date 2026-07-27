import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnsName, useEnsAvatar, useEnsText } from 'wagmi';
import { parseAbiItem, formatUnits, formatEther } from 'viem';
import { normalize } from 'viem/ens';
import { ArrowRight, Loader2, Search, Users } from 'lucide-react';
import { Footer } from './Footer';
import { Avatar } from './Avatar';
import { GroupGrid } from './GroupCard';
import { usePublicGroups, useLocalGroupMeta, usePublicGroupMeta } from '../hooks/useGroups';
import { hasXmtpId } from '../lib/groups';
import { DMPAY_DIRECT_ADDRESS } from '../lib/contracts';
import { logsClient, DMPAY_V2_DEPLOY_BLOCK } from '../lib/logs';

const priceSetEvent = parseAbiItem(
  'event PriceSet(address indexed user, uint256 usdc, uint256 eth, uint256 lifetimeUsdc, uint256 lifetimeEth)'
);

type Creator = {
  address: `0x${string}`;
  lastSeenBlock: bigint;
  usdc: bigint;
  eth: bigint;
  lifetimeUsdc: bigint;
  lifetimeEth: bigint;
};

export function Discover() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const logs = await logsClient.getLogs({
          address: DMPAY_DIRECT_ADDRESS,
          event: priceSetEvent,
          fromBlock: DMPAY_V2_DEPLOY_BLOCK,
          toBlock: 'latest',
        });
        // Keep each creator's most recent PriceSet (their current pricing).
        const byUser = new Map<string, Creator>();
        for (const log of logs) {
          const user = log.args.user as `0x${string}` | undefined;
          if (!user || log.blockNumber == null) continue;
          const key = user.toLowerCase();
          const prev = byUser.get(key);
          if (!prev || log.blockNumber > prev.lastSeenBlock) {
            byUser.set(key, {
              address: user,
              lastSeenBlock: log.blockNumber,
              usdc: log.args.usdc ?? 0n,
              eth: log.args.eth ?? 0n,
              lifetimeUsdc: log.args.lifetimeUsdc ?? 0n,
              lifetimeEth: log.args.lifetimeEth ?? 0n,
            });
          }
        }
        // Only show creators who currently have a price set (skip anyone
        // who has since cleared it to 0/0 to leave).
        const list = Array.from(byUser.values())
          .filter(c => c.usdc > 0n || c.eth > 0n || c.lifetimeUsdc > 0n || c.lifetimeEth > 0n)
          .sort((a, b) => Number(b.lastSeenBlock - a.lastSeenBlock));
        if (!cancelled) setCreators(list);
      } catch (e: any) {
        console.error('discover scan failed', e);
        if (!cancelled) setError(e?.shortMessage ?? e?.message ?? 'Failed to load creators');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Paid groups, globally. Closed and never-linked groups are dead ends, so
  // they don't belong in a browse feed.
  const { groups: allGroups, error: groupsError } = usePublicGroups();
  const groupMeta = useLocalGroupMeta();
  const groups = allGroups?.filter(g => g.active && hasXmtpId(g.xmtpGroupId)) ?? null;
  const publishedMeta = usePublicGroupMeta(groups);

  const total = creators?.length ?? 0;

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pt-12 pb-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· Discover</div>
            <h1 className="dm-display text-4xl sm:text-[64px] mt-2 text-text-primary">People worth reaching.</h1>
            <p className="text-text-secondary mt-4 max-w-2xl leading-relaxed">
              Creators on DMpay — everyone who's set a price and is open for paid DMs.
              {creators && <> <span className="font-mono text-text-muted">{total} live.</span></>}
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
            <Loader2 className="animate-spin" size={14} /> Loading creators…
          </div>
        )}
        {error && (
          <div className="bg-bg-panel border border-danger/30 text-danger rounded-2xl p-4 text-sm">{error}</div>
        )}
        {creators && creators.length === 0 && (
          <div className="bg-bg-panel border border-border-subtle rounded-3xl p-10 text-center">
            <div className="text-text-primary font-medium mb-1">No creators have set a price yet.</div>
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

      {(groups === null || groups.length > 0 || groupsError) && (
        <section className="max-w-6xl mx-auto px-6 sm:px-10 pb-20 pt-10 border-t border-border-subtle">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· Paid groups</div>
              <h2 className="dm-display text-3xl sm:text-[44px] mt-2 text-text-primary">Rooms worth paying for.</h2>
              <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">
                One-time payment per seat, settled on-chain. The conversation itself is an
                end-to-end encrypted XMTP group.
                {groups && groups.length > 0 && <> <span className="font-mono text-text-muted">{groups.length} open.</span></>}
              </p>
            </div>
            <button
              onClick={() => navigate('/groups/new')}
              className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2"
            >
              <Users size={14} /> Create a group
            </button>
          </div>
          <GroupGrid
            groups={groups}
            meta={groupMeta}
            publicMeta={publishedMeta}
            error={groupsError}
            empty={null}
            loadingLabel="Loading groups…"
          />
        </section>
      )}

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
            {c.usdc > 0n ? `$${formatUnits(c.usdc, 6)}` : c.eth > 0n ? `${formatEther(c.eth)} ETH` : '—'}
          </div>
        </div>
        <div className="flex items-center gap-1 text-text-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Message</span>
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
