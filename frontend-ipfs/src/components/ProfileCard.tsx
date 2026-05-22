import { useNavigate } from 'react-router-dom';
import { useAccount, useEnsAddress, useEnsName, useEnsAvatar, useEnsText, useReadContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { normalize } from 'viem/ens';
import { isAddress, formatUnits, formatEther } from 'viem';
import { Globe, AtSign, Code2, Send, Infinity as InfinityIcon } from 'lucide-react';
import { Avatar } from './Avatar';
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

  const { address: me, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const isSelf = me && address && me.toLowerCase() === address.toLowerCase();

  function handleDM() {
    if (!isConnected) { openConnectModal?.(); return; }
    if (address) navigate(`/c/${address}`);
  }

  if (resolvingAddr) {
    return <div className="bg-bg-panel border border-border-subtle rounded-3xl p-6 text-center text-text-secondary text-sm">Resolving {nameOrAddress}…</div>;
  }
  if (!address) {
    return <div className="bg-bg-panel border border-border-subtle rounded-3xl p-6 text-center text-text-secondary text-sm">No address found for {nameOrAddress}.</div>;
  }

  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 text-left">
      <div className="flex items-start gap-5 mb-5">
        <Avatar src={avatar || undefined} fallback={display[0]} size={72} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-text-primary truncate">{display}</h2>
          <div className="text-xs text-text-muted font-mono mt-1 truncate">{address}</div>
          {description && <p className="text-sm text-text-secondary mt-3">{String(description)}</p>}
          {(url || twitter || github) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {url && (
                <a href={String(url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary text-xs px-3 py-1.5 rounded-full">
                  <Globe size={12} /> {String(url).replace(/^https?:\/\//, '').slice(0, 28)}
                </a>
              )}
              {twitter && (
                <a href={`https://x.com/${String(twitter).replace('@','')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary text-xs px-3 py-1.5 rounded-full">
                  <AtSign size={12} /> {String(twitter).replace('@','')}
                </a>
              )}
              {github && (
                <a href={`https://github.com/${String(github)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary text-xs px-3 py-1.5 rounded-full">
                  <Code2 size={12} /> {String(github)}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {hasAnyPrice ? (
        <div className="space-y-2 mb-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">DM pricing</div>
          <div className="grid grid-cols-2 gap-2">
            {usdcPrice > 0n && <PriceTile label="Per conversation" value={`${formatUnits(usdcPrice, 6)} USDC`} />}
            {ethPrice > 0n && <PriceTile label="Per conversation" value={`${formatEther(ethPrice)} ETH`} />}
            {lifetimeUsdc > 0n && <PriceTile label="Lifetime pass" value={`${formatUnits(lifetimeUsdc, 6)} USDC`} icon={<InfinityIcon size={12} />} />}
            {lifetimeEth > 0n && <PriceTile label="Lifetime pass" value={`${formatEther(lifetimeEth)} ETH`} icon={<InfinityIcon size={12} />} />}
          </div>
        </div>
      ) : (
        <div className="bg-bg-elevated rounded-2xl p-4 text-sm text-text-secondary mb-5">
          {isSelf
            ? "You haven't set a DM price yet. Visit Settings to enable paid messages."
            : `${display} hasn't enabled paid DMs yet.`}
        </div>
      )}

      {!isSelf ? (
        <button
          onClick={handleDM}
          disabled={!hasAnyPrice}
          className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-white rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
        >
          <Send size={16} />
          {hasAnyPrice ? (isConnected ? `DM ${display}` : `Connect wallet to DM`) : `DMs not enabled`}
        </button>
      ) : (
        <button
          onClick={() => navigate('/settings')}
          className="w-full bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-2xl py-3.5 font-medium transition-colors"
        >
          Edit my profile
        </button>
      )}
    </div>
  );
}

function PriceTile({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-bg-elevated rounded-2xl p-4">
      <div className="text-xs text-text-muted flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-lg font-semibold text-text-primary mt-1">{value}</div>
    </div>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
