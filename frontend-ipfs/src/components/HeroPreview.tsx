import { useNavigate } from 'react-router-dom';
import { useEnsAddress, useEnsAvatar, useEnsText, useReadContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { normalize } from 'viem/ens';
import { formatUnits, formatEther } from 'viem';
import { ArrowRight, ShieldCheck, MessageCircle, Infinity as InfinityIcon } from 'lucide-react';
import { Avatar } from './Avatar';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';

export function HeroPreview({ ensName }: { ensName: string }) {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const normalized = safeNormalize(ensName);

  const { data: address } = useEnsAddress({ name: normalized, query: { enabled: !!normalized } });
  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });
  const { data: description } = useEnsText({ name: normalized, key: 'description', query: { enabled: !!normalized } });

  const { data: price } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdc = price?.[0] ?? 0n;
  const eth = price?.[1] ?? 0n;
  const lifeUsdc = price?.[2] ?? 0n;
  const lifeEth = price?.[3] ?? 0n;
  const hasPrice = usdc > 0n || eth > 0n;
  const hasLifetime = lifeUsdc > 0n || lifeEth > 0n;

  const onPay = () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (address) navigate(`/c/${address}`);
  };

  const ctaLabel = hasPrice
    ? `Pay ${usdc > 0n ? `$${formatUnits(usdc, 6)}` : `${formatEther(eth)} ETH`} to DM`
    : `DM ${ensName}`;

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-2xl shadow-card p-5 w-full">
      <div className="flex items-center gap-3">
        <Avatar src={avatar || undefined} fallback={ensName[0]} size={44} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[15px] font-medium text-text-primary tracking-tight truncate">{ensName}</div>
          {address && (
            <div className="font-mono text-[11px] text-text-muted mt-0.5 truncate">
              {address.slice(0, 6)}…{address.slice(-4)}
            </div>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted border border-border-subtle rounded-full px-2 py-1 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" /> Live
        </span>
      </div>

      {description && (
        <p className="text-[13px] text-text-secondary leading-relaxed mt-3.5 line-clamp-2">
          {String(description)}
        </p>
      )}

      <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
        {hasPrice && (
          <Row icon={<MessageCircle size={13} />} label="Pay to DM"
               main={usdc > 0n ? `$${formatUnits(usdc, 6)}` : `${formatEther(eth)} ETH`}
               alt={usdc > 0n && eth > 0n ? `· ${formatEther(eth)} ETH` : ''} />
        )}
        {hasLifetime && (
          <Row icon={<InfinityIcon size={13} />} label="Lifetime pass" featured
               main={lifeUsdc > 0n ? `$${formatUnits(lifeUsdc, 6)}` : `${formatEther(lifeEth)} ETH`}
               alt={lifeUsdc > 0n && lifeEth > 0n ? `· ${formatEther(lifeEth)} ETH` : ''} />
        )}
      </div>

      <button
        onClick={onPay}
        disabled={!address}
        className="mt-4 w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-xl py-3 inline-flex items-center justify-center gap-2 font-medium text-sm"
      >
        {ctaLabel} <ArrowRight size={14} />
      </button>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
        <ShieldCheck size={11} /> 97.5% lands in {ensName.split('.')[0]}'s wallet · settled on-chain
      </div>
    </div>
  );
}

function Row({ icon, label, main, alt, featured = false }: {
  icon: React.ReactNode; label: string; main: string; alt: string; featured?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="text-text-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text-primary inline-flex items-center gap-2">
          {label}
          {featured && (
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">Best value</span>
          )}
        </div>
      </div>
      <div className="font-mono text-[13px] text-text-primary">
        {main}
        {alt && <span className="text-text-muted font-normal"> {alt}</span>}
      </div>
    </div>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
