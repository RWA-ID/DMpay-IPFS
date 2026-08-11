import { useEffect, useState } from 'react';
import { useAccount, useEnsAvatar, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { expiryDate } from '../lib/ensExpiry';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { normalize } from 'viem/ens';
import { parseUnits, parseEther, formatUnits, formatEther } from 'viem';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, CheckCircle2, Coins, Infinity as InfinityIcon, AlertCircle } from 'lucide-react';
import { Avatar } from './Avatar';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';
import { useEthUsdPrice, ethInputToUsd } from '../lib/prices';

export function Settings() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: ensName, status: nameStatus, expiry: nameExpiry, unverifiedName } = useVerifiedEnsName({ address });
  const normalized = ensName ? safeNormalize(ensName) : undefined;
  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });

  const { data: price, refetch } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const [usdc, setUsdc] = useState('');
  const [eth, setEth] = useState('');
  const [lifetimeUsdc, setLifetimeUsdc] = useState('');
  const [lifetimeEth, setLifetimeEth] = useState('');

  useEffect(() => {
    if (price) {
      setUsdc(price[0] > 0n ? formatUnits(price[0], 6) : '');
      setEth(price[1] > 0n ? formatEther(price[1]) : '');
      setLifetimeUsdc(price[2] > 0n ? formatUnits(price[2], 6) : '');
      setLifetimeEth(price[3] > 0n ? formatEther(price[3]) : '');
    }
  }, [price]);

  const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: confirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });
  const error = writeError ?? receiptError;

  useEffect(() => {
    if (isSuccess && address) {
      refetch();
      const t = setTimeout(() => navigate(`/u/${address}`), 900);
      return () => clearTimeout(t);
    }
  }, [isSuccess, address, refetch, navigate]);

  function save() {
    if (!address) return;
    resetWrite();
    const args: [bigint, bigint, bigint, bigint] = [
      usdc ? parseUnits(usdc, 6) : 0n,
      eth ? parseEther(eth) : 0n,
      lifetimeUsdc ? parseUnits(lifetimeUsdc, 6) : 0n,
      lifetimeEth ? parseEther(lifetimeEth) : 0n,
    ];
    writeContract({ address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi, functionName: 'setPrice', args });
  }

  const display = ensName ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '');
  const busy = isPending || confirming;

  if (!isConnected) {
    return (
      <main className="flex-1 flex items-center justify-center bg-bg-base">
        <div className="text-center max-w-sm px-6">
          <Coins className="text-brand mx-auto mb-4" size={32} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Connect to set up your profile</h2>
          <p className="text-text-secondary mb-6 text-sm">Your wallet signs prices on-chain. No backend, no account creation.</p>
          <button onClick={() => openConnectModal?.()} className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-3 font-medium">
            Connect wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-8">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-4 mb-8">
          <Avatar src={avatar || undefined} fallback={display[0]} size={64} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-text-primary truncate">{display}</h1>
            <div className="text-xs text-text-muted font-mono mt-1 break-all">{address}</div>
          </div>
        </div>

        {(nameStatus === 'expired' || nameStatus === 'grace') && unverifiedName && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 mb-8 flex gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-text-secondary">
              <div className="text-text-primary font-medium mb-1">
                {nameStatus === 'expired'
                  ? `${unverifiedName} has expired`
                  : `${unverifiedName} is past its renewal date`}
              </div>
              {nameStatus === 'expired'
                ? `Your primary name lapsed on ${expiryDate(nameExpiry)} and its grace period has ended, so it is open for anyone to register. DMpay now shows your address instead, and your groups have stopped publishing their public identity. Renewing is no longer possible — you would have to register the name again.`
                : `Your primary name expired on ${expiryDate(nameExpiry)}. Only you can renew it, but once the 90-day grace period ends anyone can take it. Renew at app.ens.domains to keep it.`}
            </div>
          </div>
        )}

        <div className="bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Per-conversation pricing</h2>
            <p className="text-sm text-text-secondary">Senders pay this once to open a new conversation.</p>
          </div>

          <PriceField
            label="USDC price"
            unit="USDC"
            value={usdc}
            onChange={setUsdc}
            placeholder="5"
          />
          <PriceField
            label="ETH price"
            unit="ETH"
            value={eth}
            onChange={setEth}
            placeholder="0.001"
            step="0.0001"
          />

          <div className="border-t border-border-subtle pt-6">
            <div className="flex items-center gap-2 mb-1">
              <InfinityIcon size={16} className="text-brand" />
              <h2 className="text-lg font-semibold text-text-primary">Lifetime pass</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4">One payment, message you forever. Optional alternative to per-conversation.</p>

            <PriceField
              label="Lifetime USDC"
              unit="USDC"
              value={lifetimeUsdc}
              onChange={setLifetimeUsdc}
              placeholder="50"
            />
            <div className="h-4" />
            <PriceField
              label="Lifetime ETH"
              unit="ETH"
              value={lifetimeEth}
              onChange={setLifetimeEth}
              placeholder="0.01"
              step="0.0001"
            />
          </div>

          <div className="text-xs text-text-muted">
            Set any field to <code className="text-text-secondary">0</code> or leave blank to disable that token. Protocol fee: 2.5%.
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 break-words">
                {(error as any)?.shortMessage ?? error?.message ?? String(error)}
              </div>
            </div>
          )}

          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> {isPending ? 'Confirm in wallet…' : 'Confirming on-chain…'}</> :
             isSuccess ? <><CheckCircle2 size={16} /> Saved</> :
             <><Save size={16} /> Save prices</>}
          </button>
        </div>
      </div>
    </main>
  );
}

function PriceField({ label, unit, value, onChange, placeholder, step = '0.01' }: { label: string; unit: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string; }) {
  const { usd: ethUsd } = useEthUsdPrice();

  // ETH is the only unit that needs translating — a USDC field is already the
  // number the sender recognises. Rendering "≈ $5.00" next to "5 USDC" would
  // be noise pretending to be information.
  const usdHint = unit === 'ETH' ? ethInputToUsd(value, ethUsd) : null;

  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <span className="text-sm text-text-secondary">{label}</span>
        {/* Reserves no space when absent: the hint appears as you type, and a
            row that reflows on every keystroke is worse than one that grows
            once. */}
        {usdHint && (
          <span className="font-mono text-[11px] text-text-muted tabular-nums">≈ {usdHint}</span>
        )}
      </div>
      <div className="flex items-center bg-bg-elevated rounded-xl px-4 py-3 focus-within:ring-1 focus-within:ring-brand">
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none text-base"
        />
        <span className="text-text-muted text-sm font-medium">{unit}</span>
      </div>
    </label>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
