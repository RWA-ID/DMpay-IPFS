import { useNavigate } from 'react-router-dom';
import { useAccount, useEnsAddress, useEnsName, useEnsAvatar, useEnsText, useReadContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { normalize } from 'viem/ens';
import { isAddress, formatUnits, formatEther } from 'viem';
import { Globe, AtSign, Code2, Send, Infinity as InfinityIcon, MessageCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { Avatar } from './Avatar';
import { ShareProfile } from './ShareProfile';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';

export function ProfileCard({ nameOrAddress }: { nameOrAddress: string }) {
  const navigate = useNavigate();
  const isAddr = isAddress(nameOrAddress);
  const isEns = !isAddr && nameOrAddress.includes('.');

  const { data: resolvedAddr, isLoading: resolvingAddr } = useEnsAddress({
    name: isEns ? safeNormalize(nameOrAddress) : undefined,
    query: { enabled: isEns },
  });
  const address = (isAddr ? nameOrAddress : resolvedAddr) as `0x${string}` | undefined;

  const { data: resolvedName } = useEnsName({ address, query: { enabled: isAddr && !!address } });
  const ensName = isEns ? nameOrAddress : resolvedName ?? undefined;
  const normalized = ensName ? safeNormalize(ensName) : undefined;

  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });
  const { data: description } = useEnsText({ name: normalized, key: 'description', query: { enabled: !!normalized } });
  const { data: url } = useEnsText({ name: normalized, key: 'url', query: { enabled: !!normalized } });
  const { data: twitter } = useEnsText({ name: normalized, key: 'com.twitter', query: { enabled: !!normalized } });
  const { data: github } = useEnsText({ name: normalized, key: 'com.github', query: { enabled: !!normalized } });

  const { data: price } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const usdcPrice = price?.[0] ?? 0n;
  const ethPrice = price?.[1] ?? 0n;
  const lifetimeUsdc = price?.[2] ?? 0n;
  const lifetimeEth = price?.[3] ?? 0n;
  const hasAnyPrice = usdcPrice > 0n || ethPrice > 0n || lifetimeUsdc > 0n || lifetimeEth > 0n;
  const hasLifetime = lifetimeUsdc > 0n || lifetimeEth > 0n;
  const hasPerDM = usdcPrice > 0n || ethPrice > 0n;

  const { address: me, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const isSelf = me && address && me.toLowerCase() === address.toLowerCase();

  function handleDM() {
    if (!isConnected) { openConnectModal?.(); return; }
    if (address) navigate(`/c/${address}`);
  }

  if (resolvingAddr) {
    return <div className="bg-bg-panel border border-border-subtle rounded-3xl p-8 text-center text-text-secondary text-sm">Resolving {nameOrAddress}…</div>;
  }
  if (!address) {
    return <div className="bg-bg-panel border border-border-subtle rounded-3xl p-8 text-center text-text-secondary text-sm">No address found for {nameOrAddress}.</div>;
  }

  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <article className="bg-bg-panel border border-border-subtle rounded-3xl overflow-hidden">
      {/* SPLIT HERO — avatar left, identity/eyebrow/display name right */}
      <header className="px-7 sm:px-10 pt-9 pb-7 border-b border-border-subtle">
        <div className="flex items-start gap-5 sm:gap-7">
          <Avatar src={avatar || undefined} fallback={display[0]} size={88} />
          <div className="flex-1 min-w-0 pt-1">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted">
              · Direct messaging
            </div>
            <h1 className="dm-display mt-1.5 text-4xl sm:text-5xl text-text-primary truncate">
              {display}
            </h1>
            <div className="font-mono text-xs text-text-muted mt-2 truncate">{shortAddr}</div>
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

        {description && (
          <p className="text-[15px] leading-relaxed text-text-secondary mt-7 max-w-xl">
            {String(description)}
          </p>
        )}

        <div className="mt-6">
          <ShareProfile idOrEns={ensName ?? address} displayName={ensName ?? undefined} />
        </div>
      </header>

      {/* PRICING — Card layout (lifetime featured) */}
      <section className="bg-bg-elevated px-7 sm:px-10 py-7">
        <div className="flex items-baseline justify-between mb-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">How to reach me</div>
          {hasAnyPrice && (
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">
              97.5% to creator
            </div>
          )}
        </div>

        {hasAnyPrice ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hasPerDM && (
                <PriceCard
                  icon={<MessageCircle size={14} />}
                  title="Pay to DM"
                  sub="One-time. Opens an end-to-end encrypted 1:1."
                  priceUsdc={usdcPrice > 0n ? Number(formatUnits(usdcPrice, 6)) : null}
                  priceEth={ethPrice > 0n ? formatEther(ethPrice) : null}
                />
              )}
              {hasLifetime && (
                <PriceCard
                  featured
                  icon={<InfinityIcon size={14} />}
                  title="Lifetime pass"
                  sub="Unlimited DMs. Pay once, forever."
                  priceUsdc={lifetimeUsdc > 0n ? Number(formatUnits(lifetimeUsdc, 6)) : null}
                  priceEth={lifetimeEth > 0n ? formatEther(lifetimeEth) : null}
                />
              )}
            </div>

            <div className="mt-4 flex gap-2.5 items-start rounded-2xl bg-bg-panel border border-border-subtle p-3.5">
              <ShieldCheck size={14} className="text-text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-text-primary">Atomic on-chain settlement</div>
                <div className="text-[12px] text-text-muted mt-0.5 leading-snug">
                  2.5% protocol fee. No escrow, no custody, no platform cut. Conversation lives on XMTP — portable, end-to-end encrypted.
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-bg-panel border border-border-subtle rounded-2xl p-4 text-sm text-text-secondary">
            {isSelf
              ? "You haven't set a DM price yet. Visit Settings to enable paid messages."
              : `${display} hasn't enabled paid DMs yet.`}
          </div>
        )}
      </section>

      {/* CTA */}
      <footer className="px-7 sm:px-10 py-6">
        {!isSelf ? (
          <button
            onClick={handleDM}
            disabled={!hasAnyPrice}
            className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-4 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <Send size={16} />
            {hasAnyPrice ? (isConnected ? `Pay to DM ${display}` : `Connect wallet to DM`) : `DMs not enabled`}
            {hasAnyPrice && <ArrowRight size={16} />}
          </button>
        ) : (
          <button
            onClick={() => navigate('/settings')}
            className="w-full bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border-strong rounded-2xl py-4 font-medium transition-colors"
          >
            Edit my profile
          </button>
        )}
      </footer>
    </article>
  );
}

function PriceCard({
  icon, title, sub, priceUsdc, priceEth, featured = false,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  priceUsdc: number | null;
  priceEth: string | null;
  featured?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col items-stretch gap-3 p-5 rounded-2xl text-left',
        featured
          ? 'bg-brand text-brand-ink border border-brand shadow-card'
          : 'bg-bg-panel text-text-primary border border-border-subtle',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div
          className={[
            'w-8 h-8 rounded-lg grid place-items-center',
            featured ? 'bg-brand-ink/10 text-brand-ink' : 'bg-chip text-text-primary',
          ].join(' ')}
        >
          {icon}
        </div>
        {featured && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-brand-ink/10">
            Best value
          </span>
        )}
      </div>
      <div>
        <div className="text-[15px] font-medium">{title}</div>
        <div className={[
          'text-[12px] mt-1 leading-snug',
          featured ? 'text-brand-ink/60' : 'text-text-muted',
        ].join(' ')}>
          {sub}
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="dm-display font-mono text-[26px]">
          {priceUsdc != null ? `$${priceUsdc.toLocaleString()}` : `${priceEth} ETH`}
        </span>
        {priceUsdc != null && priceEth != null && (
          <span className={[
            'font-mono text-[12px]',
            featured ? 'text-brand-ink/50' : 'text-text-muted',
          ].join(' ')}>
            or {priceEth} ETH
          </span>
        )}
      </div>
    </div>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
