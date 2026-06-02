import { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useDisconnect, useEnsName, useEnsAvatar } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { normalize } from 'viem/ens';
import { ChevronDown, Copy, Check, LogOut, User, Wallet } from 'lucide-react';
import { Avatar } from './Avatar';
import { resetXmtpClient } from '../hooks/useXmtpClient';

/**
 * Brand-styled connect / account control. Uses RainbowKit's wallet-picker
 * modal for connecting, but renders our own paper/ink UI and a dropdown whose
 * Disconnect reliably tears down both the wagmi connection and the cached
 * XMTP client (the default account-modal disconnect was leaving stale state).
 */
export function ConnectControl() {
  const navigate = useNavigate();
  const { disconnect } = useDisconnect();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return <div className="w-[120px] h-9" aria-hidden />;
        }

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-brand-ink rounded-full px-4 py-2 text-sm font-medium transition-colors"
            >
              <Wallet size={14} /> Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="inline-flex items-center gap-1.5 bg-danger/10 hover:bg-danger/20 text-danger rounded-full px-4 py-2 text-sm font-medium"
            >
              Wrong network
            </button>
          );
        }

        return (
          <AccountChip
            address={account.address as `0x${string}`}
            onViewProfile={(ensName) => navigate(`/u/${ensName ?? account.address}`)}
            onDisconnect={() => {
              resetXmtpClient();
              disconnect();
            }}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}

function AccountChip({
  address,
  onViewProfile,
  onDisconnect,
}: {
  address: `0x${string}`;
  onViewProfile: (ensName: string | null) => void;
  onDisconnect: () => void;
}) {
  const { data: ensName } = useEnsName({ address });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined, query: { enabled: !!ensName } });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover rounded-full pl-1 pr-2.5 py-1 transition-colors"
      >
        <Avatar src={avatar || undefined} fallback={ensName?.[0] || address[2]} size={24} />
        <span className="text-sm text-text-primary max-w-[140px] truncate">{display}</span>
        <ChevronDown size={14} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-bg-panel border border-border-subtle rounded-2xl p-1.5 shadow-pop z-50">
          <div className="px-3 py-2.5 border-b border-border-subtle mb-1">
            <div className="text-sm text-text-primary truncate">{display}</div>
            <div className="font-mono text-[11px] text-text-muted mt-0.5">{address.slice(0, 10)}…{address.slice(-8)}</div>
          </div>
          <MenuItem icon={<User size={14} />} label="View profile" onClick={() => { setOpen(false); onViewProfile(ensName ?? null); }} />
          <MenuItem icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? 'Copied' : 'Copy address'} onClick={copy} />
          <MenuItem icon={<LogOut size={14} />} label="Disconnect" danger onClick={() => { setOpen(false); onDisconnect(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${danger ? 'text-danger hover:bg-danger/10' : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'}`}
    >
      {icon} {label}
    </button>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
