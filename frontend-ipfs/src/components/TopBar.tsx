import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { normalize } from 'viem/ens';
import { Inbox as InboxIcon, Loader2, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';
import { Avatar } from './Avatar';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { useState } from 'react';

export function TopBar() {
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({ address });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined });
  const navigate = useNavigate();
  const { client, init, initializing, error, revokeAndRetry, needsRevoke } = useXmtpClient();
  const [showErr, setShowErr] = useState(false);

  return (
    <header className="h-12 bg-bg-base border-b border-border-subtle flex items-center justify-between px-4">
      <button onClick={() => navigate('/')} className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center text-white font-bold text-xs">D</div>
        <span className="font-semibold text-text-primary text-sm">DMpay</span>
      </button>
      <div className="flex items-center gap-2">
        {isConnected && (
          <>
            <button
              onClick={() => navigate('/inbox')}
              className="flex items-center gap-1.5 bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-full px-3 py-1.5 text-sm transition-colors"
            >
              <InboxIcon size={14} /> Inbox
            </button>
            {client ? (
              <span className="flex items-center gap-1.5 bg-green-500/10 text-green-400 rounded-full px-3 py-1.5 text-sm">
                <CheckCircle2 size={14} /> XMTP
              </span>
            ) : error ? (
              <div className="relative">
                <button
                  onClick={() => setShowErr((v) => !v)}
                  className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full px-3 py-1.5 text-sm"
                >
                  <AlertTriangle size={14} /> XMTP error
                </button>
                {showErr && (
                  <div className="absolute right-0 mt-2 w-80 bg-bg-panel border border-border-subtle rounded-2xl p-4 shadow-2xl z-50 text-left">
                    <div className="text-text-primary text-sm font-medium mb-2">XMTP couldn't initialize</div>
                    <div className="text-text-secondary text-xs mb-3 break-words">{error}</div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowErr(false); init(); }} disabled={initializing} className="flex-1 bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-xl py-2 text-xs font-medium">Retry</button>
                      {needsRevoke && (
                        <button onClick={() => { setShowErr(false); revokeAndRetry(); }} disabled={initializing} className="flex-1 bg-brand hover:bg-brand-hover text-white rounded-xl py-2 text-xs font-medium">Revoke old & retry</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => init()}
                disabled={initializing}
                className="flex items-center gap-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-full px-3 py-1.5 text-sm transition-colors"
              >
                {initializing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {initializing ? 'Connecting…' : 'Connect XMTP'}
              </button>
            )}
            <div className="flex items-center gap-2 bg-bg-elevated rounded-full pl-1 pr-3 py-1">
              <Avatar src={avatar || undefined} fallback={ensName?.[0] || address?.[2]} size={24} />
              <span className="text-sm text-text-primary">{ensName ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`}</span>
            </div>
          </>
        )}
        <ConnectButton showBalance={false} accountStatus="address" chainStatus="none" />
      </div>
    </header>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
