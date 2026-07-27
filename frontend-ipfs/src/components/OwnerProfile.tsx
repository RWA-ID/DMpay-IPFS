import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnsName, useEnsAvatar, useEnsText, useReadContract } from 'wagmi';
import { normalize } from 'viem/ens';
import { parseAbiItem, formatUnits, formatEther } from 'viem';
import { Globe, AtSign, Code2, Settings as SettingsIcon, MessageCircle, Infinity as InfinityIcon, ShieldCheck, ExternalLink, Loader2, BadgePlus, Pencil, X, Users, Plus } from 'lucide-react';
import { Avatar } from './Avatar';
import { EfpChip } from './EfpStats';
import { ShareProfile } from './ShareProfile';
import { EnsRegister } from './EnsRegister';
import { EnsRecordsEditor } from './EnsRecordsEditor';
import { GroupGrid } from './GroupCard';
import { usePublicGroups, useLocalGroupMeta, usePublicGroupMeta } from '../hooks/useGroups';
import { DMPAY_DIRECT_ADDRESS, USDC_ADDRESS, dmpayDirectAbi } from '../lib/contracts';
import { logsClient, DMPAY_V2_DEPLOY_BLOCK } from '../lib/logs';

type SupporterRow = {
  sender: `0x${string}`;
  token: `0x${string}`;
  amountPaid: bigint;
  blockNumber: bigint;
  ts?: number;
};

export function OwnerProfile({ address }: { address: `0x${string}` }) {
  const navigate = useNavigate();

  const { data: ensName, refetch: refetchEnsName } = useEnsName({ address });
  const normalized = ensName ? safeNormalize(ensName) : undefined;
  const { data: avatar, refetch: refetchAvatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });
  const [panel, setPanel] = useState<'none' | 'register' | 'records'>('none');
  const { data: description } = useEnsText({ name: normalized, key: 'description', query: { enabled: !!normalized } });
  const { data: url } = useEnsText({ name: normalized, key: 'url', query: { enabled: !!normalized } });
  const { data: twitter } = useEnsText({ name: normalized, key: 'com.twitter', query: { enabled: !!normalized } });
  const { data: github } = useEnsText({ name: normalized, key: 'com.github', query: { enabled: !!normalized } });

  const { data: price } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: [address],
  });
  const usdc = price?.[0] ?? 0n;
  const eth = price?.[1] ?? 0n;
  const lifeUsdc = price?.[2] ?? 0n;
  const lifeEth = price?.[3] ?? 0n;
  const hasAnyPrice = usdc > 0n || eth > 0n || lifeUsdc > 0n || lifeEth > 0n;
  const hasLifetime = lifeUsdc > 0n || lifeEth > 0n;
  const hasPerDM = usdc > 0n || eth > 0n;

  const [supporters, setSupporters] = useState<SupporterRow[] | null>(null);

  // Own profile shows closed and unlinked groups too — the owner is the only
  // person who can act on a broken one.
  const { groups, error: groupsError } = usePublicGroups(address, !!address);
  const groupMeta = useLocalGroupMeta();
  const publishedMeta = usePublicGroupMeta(groups);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const event = parseAbiItem(
          'event ConversationOpened(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee)'
        );
        // All-time scan from the V2 deploy block via the keyless full-range
        // client (the app's default RPC rejects wide getLogs as "archive").
        const logs = await logsClient.getLogs({
          address: DMPAY_DIRECT_ADDRESS,
          event,
          args: { recipient: address },
          fromBlock: DMPAY_V2_DEPLOY_BLOCK,
          toBlock: 'latest',
        });
        const rows: SupporterRow[] = logs.map(l => ({
          sender: l.args.sender as `0x${string}`,
          token: l.args.token as `0x${string}`,
          amountPaid: (l.args.amountPaid ?? 0n) as bigint,
          blockNumber: l.blockNumber,
        })).sort((a, b) => Number(b.blockNumber - a.blockNumber));

        if (!cancelled) setSupporters(rows);
      } catch (e) {
        console.error('owner supporters scan failed', e);
        if (!cancelled) setSupporters([]);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const stats = useMemo(() => {
    if (!supporters) return null;
    const uniqueSenders = new Set(supporters.map(s => s.sender.toLowerCase())).size;
    let usdcTotal = 0n;
    let ethTotal = 0n;
    for (const s of supporters) {
      if (s.token.toLowerCase() === USDC_ADDRESS.toLowerCase()) usdcTotal += s.amountPaid;
      else ethTotal += s.amountPaid;
    }
    return {
      uniqueSenders,
      payments: supporters.length,
      usdcTotal,
      ethTotal,
    };
  }, [supporters]);

  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <article className="max-w-6xl mx-auto">
        {/* ─────────── HERO ─────────── */}
        <header className="px-6 sm:px-10 pt-12 pb-10 border-b border-border-subtle">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted">· Direct messaging · this is you</div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mt-4 gap-6">
            <div className="flex items-start gap-6 min-w-0">
              <Avatar src={avatar || undefined} fallback={display[0]} size={108} />
              <div className="min-w-0 pt-1">
                {/* Fluid, wrapping — `truncate` at a fixed 72px clipped any long ENS name
                    (e.g. vault.ensgiant.eth) once the action buttons claimed the right column. */}
                <h1 className="dm-display text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05] text-text-primary break-words">{display}</h1>
                <div className="font-mono text-xs text-text-muted mt-2">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-4 empty:mt-0">
                  <EfpChip idOrAddress={ensName ?? address} />
                </div>
                {(url || twitter || github) && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {url && (
                      <a href={String(url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-chip text-chip-ink text-[11px] font-medium px-2.5 py-1 rounded-full">
                        <Globe size={11} /> {String(url).replace(/^https?:\/\//, '').slice(0, 28)}
                      </a>
                    )}
                    {twitter && (
                      <a href={`https://x.com/${String(twitter).replace('@','')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-chip text-chip-ink text-[11px] font-medium px-2.5 py-1 rounded-full">
                        <AtSign size={11} /> {String(twitter).replace('@','')}
                      </a>
                    )}
                    {github && (
                      <a href={`https://github.com/${String(github)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-chip text-chip-ink text-[11px] font-medium px-2.5 py-1 rounded-full">
                        <Code2 size={11} /> {String(github)}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap md:flex-nowrap shrink-0 gap-2 self-start md:self-end">
              {!ensName ? (
                <button
                  onClick={() => setPanel('register')}
                  className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2"
                >
                  <BadgePlus size={14} /> Register ENS name
                </button>
              ) : (
                <button
                  onClick={() => setPanel('records')}
                  className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2"
                >
                  <Pencil size={14} /> Edit records & avatar
                </button>
              )}
              <button
                onClick={() => navigate('/settings')}
                className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2"
              >
                <SettingsIcon size={14} /> Edit pricing
              </button>
            </div>
          </div>

          {!ensName && (
            <div className="mt-6 bg-bg-panel border border-border-subtle rounded-2xl p-4 flex items-start gap-3">
              <BadgePlus size={16} className="text-text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-text-secondary">
                <span className="text-text-primary font-medium">Get an ENS name for discovery.</span> A name like <span className="font-mono">yourname.eth</span> becomes your shareable DMpay link and lets people find you. Register one in a couple of taps.
              </div>
            </div>
          )}

          {description && (
            <p className="text-lg text-text-secondary mt-7 max-w-2xl leading-relaxed">{String(description)}</p>
          )}

          <div className="mt-6">
            <ShareProfile idOrEns={ensName ?? address} displayName={ensName ?? undefined} />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
          {/* ─────────── LEFT — STATS + SUPPORTERS ─────────── */}
          <section className="px-6 sm:px-10 pt-10 pb-10 lg:border-r border-border-subtle">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mb-5">All-time activity</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4 pb-8 border-b border-border-subtle">
              <Stat label="Supporters" value={stats ? String(stats.uniqueSenders) : '—'} loading={!stats} />
              <Stat label="Payments" value={stats ? String(stats.payments) : '—'} loading={!stats} />
              <Stat
                label="USDC, all-time"
                value={stats && stats.usdcTotal > 0n ? `$${Number(formatUnits(stats.usdcTotal, 6)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'}
                loading={!stats}
              />
              <Stat
                label="ETH, all-time"
                value={stats && stats.ethTotal > 0n ? `${trim(formatEther(stats.ethTotal), 4)}` : '0'}
                loading={!stats}
              />
            </div>
            <div className="font-mono text-[10.5px] text-text-muted mt-3">
              · All-time totals from <span className="text-text-secondary">ConversationOpened</span> events since launch.{' '}
              <a
                href={`https://etherscan.io/address/${DMPAY_DIRECT_ADDRESS}#events`}
                target="_blank" rel="noreferrer"
                className="text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                Etherscan <ExternalLink size={9} className="inline" />
              </a>
            </div>

            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Supporters</div>
                <a
                  href={`https://etherscan.io/address/${address}#tokentxns`}
                  target="_blank" rel="noreferrer"
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted hover:text-text-primary"
                >
                  View on Etherscan ↗
                </a>
              </div>
              {supporters === null && (
                <div className="flex items-center gap-2 text-text-secondary text-sm font-mono">
                  <Loader2 className="animate-spin" size={14} /> Scanning payment history…
                </div>
              )}
              {supporters && supporters.length === 0 && (
                <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 text-sm text-text-secondary">
                  No paid DMs yet. Share your link and watch this fill in.
                </div>
              )}
              {supporters && supporters.length > 0 && (
                <div className="divide-y divide-border-subtle border-y border-border-subtle">
                  {supporters.slice(0, 8).map((s, i) => (
                    <SupporterRow key={`${s.sender}-${s.blockNumber}-${i}`} row={s} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─────────── RIGHT — PRICING ─────────── */}
          <aside className="bg-bg-elevated px-6 sm:px-10 pt-10 pb-10">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mb-5">How people reach you</div>
            {hasAnyPrice ? (
              <>
                <div className="grid gap-3">
                  {hasPerDM && (
                    <PriceLine icon={<MessageCircle size={14} />} title="Pay to DM"
                              sub="One-time payment opens an end-to-end encrypted 1:1."
                              priceUsdc={usdc > 0n ? Number(formatUnits(usdc, 6)) : null}
                              priceEth={eth > 0n ? formatEther(eth) : null} />
                  )}
                  {hasLifetime && (
                    <PriceLine featured icon={<InfinityIcon size={14} />} title="Lifetime pass"
                              sub="Unlimited DMs. Pay once, forever."
                              priceUsdc={lifeUsdc > 0n ? Number(formatUnits(lifeUsdc, 6)) : null}
                              priceEth={lifeEth > 0n ? formatEther(lifeEth) : null} />
                  )}
                </div>
                <div className="mt-4 flex gap-2.5 items-start rounded-2xl bg-bg-panel border border-border-subtle p-3.5">
                  <ShieldCheck size={14} className="text-text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[13px] font-medium text-text-primary">Atomic on-chain settlement</div>
                    <div className="text-[12px] text-text-muted mt-0.5 leading-snug">
                      2.5% protocol fee. No escrow, no custody. Conversation lives on XMTP — portable, end-to-end encrypted.
                    </div>
                  </div>
                </div>
                <div className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Conversation lives on</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['XMTP V3', 'End-to-end encrypted', 'Portable inbox'].map(t => (
                    <span key={t} className="font-mono text-[11px] bg-chip text-chip-ink rounded-full px-2.5 py-1">{t}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5">
                <div className="text-text-primary font-medium mb-1">No price set yet</div>
                <div className="text-sm text-text-secondary mb-4">Pick USDC / ETH amounts in Settings — your profile goes live the moment the transaction confirms.</div>
                <button
                  onClick={() => navigate('/settings')}
                  className="bg-brand hover:bg-brand-hover text-brand-ink rounded-xl px-5 py-2.5 font-medium text-sm inline-flex items-center gap-2"
                >
                  <SettingsIcon size={14} /> Set my price
                </button>
              </div>
            )}
          </aside>
        </div>

        {/* ─────────── PAID GROUPS ─────────── */}
        <section className="px-6 sm:px-10 py-10 border-t border-border-subtle">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">
                Your paid groups{groups && groups.length > 0 ? ` · ${groups.length}` : ''}
              </div>
              <p className="text-text-secondary text-sm mt-2 max-w-lg leading-relaxed">
                These show on your public profile and on Discover, so anyone can find and pay to join.
              </p>
            </div>
            <button
              onClick={() => navigate('/groups/new')}
              className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-5 py-3 font-medium inline-flex items-center gap-2 shrink-0"
            >
              <Plus size={14} /> New group
            </button>
          </div>
          <GroupGrid
            groups={groups}
            meta={groupMeta}
            publicMeta={publishedMeta}
            error={groupsError}
            showCreator={false}
            loadingLabel="Scanning your groups…"
            empty={
              <div className="bg-bg-panel border border-border-subtle rounded-3xl p-10 text-center">
                <Users size={20} className="text-text-muted mx-auto mb-3" />
                <div className="text-text-primary font-medium mb-1">No paid groups yet.</div>
                <div className="text-text-secondary text-sm">
                  Create one and it appears here, on your profile, and on Discover.
                </div>
              </div>
            }
          />
        </section>
      </article>

      {panel !== 'none' && (
        <EnsModal
          title={panel === 'register' ? 'Register an ENS name' : 'Edit records & avatar'}
          onClose={() => setPanel('none')}
        >
          {panel === 'register' ? (
            <EnsRegister
              address={address}
              onRegistered={() => { refetchEnsName(); setPanel('none'); }}
            />
          ) : ensName ? (
            <EnsRecordsEditor
              name={ensName}
              address={address}
              initialAvatarUrl={avatar || undefined}
              onSaved={() => { refetchAvatar(); refetchEnsName(); setPanel('none'); }}
            />
          ) : null}
        </EnsModal>
      )}
    </main>
  );
}

function EnsModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-bg-panel border border-border-subtle rounded-3xl shadow-pop w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="dm-display text-2xl text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary rounded-full p-1.5 hover:bg-bg-elevated"><X size={18} /></button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">{label}</div>
      <div className={`dm-display font-mono text-3xl mt-2 text-text-primary ${loading ? 'opacity-40' : ''}`}>{value}</div>
    </div>
  );
}

function SupporterRow({ row }: { row: SupporterRow }) {
  const { data: ensName } = useEnsName({ address: row.sender });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined, query: { enabled: !!ensName } });
  const display = ensName ?? `${row.sender.slice(0, 6)}…${row.sender.slice(-4)}`;
  const isUSDC = row.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const amountLabel = isUSDC
    ? `$${Number(formatUnits(row.amountPaid, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${trim(formatEther(row.amountPaid), 4)} ETH`;
  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar src={avatar || undefined} fallback={display[0]} size={32} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[13px] text-text-primary truncate">{display}</div>
      </div>
      <div className="font-mono text-[13px] text-text-primary">{amountLabel}</div>
      <div className="font-mono text-[11px] text-text-muted">#{row.blockNumber.toString().slice(-5)}</div>
    </div>
  );
}

function PriceLine({ icon, title, sub, priceUsdc, priceEth, featured = false }: {
  icon: React.ReactNode; title: string; sub: string;
  priceUsdc: number | null; priceEth: string | null; featured?: boolean;
}) {
  return (
    <div className={[
      'rounded-2xl p-5 flex flex-col gap-3',
      featured ? 'bg-brand text-brand-ink border border-brand shadow-card' : 'bg-bg-panel border border-border-subtle',
    ].join(' ')}>
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg grid place-items-center ${featured ? 'bg-brand-ink/10' : 'bg-chip text-text-primary'}`}>
          {icon}
        </div>
        {featured && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-brand-ink/10">Best value</span>
        )}
      </div>
      <div>
        <div className="text-[15px] font-medium">{title}</div>
        <div className={`text-[12px] mt-1 leading-snug ${featured ? 'text-brand-ink/60' : 'text-text-muted'}`}>{sub}</div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="dm-display font-mono text-[26px]">
          {priceUsdc != null ? `$${priceUsdc.toLocaleString()}` : `${priceEth} ETH`}
        </span>
        {priceUsdc != null && priceEth != null && (
          <span className={`font-mono text-[12px] ${featured ? 'text-brand-ink/50' : 'text-text-muted'}`}>or {priceEth} ETH</span>
        )}
      </div>
    </div>
  );
}

function trim(n: string, decimals: number) {
  const [a, b] = n.split('.');
  if (!b) return a;
  return `${a}.${b.slice(0, decimals).replace(/0+$/, '') || '0'}`;
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
