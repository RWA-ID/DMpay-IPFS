import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { normalize } from 'viem/ens';
import { MoreHorizontal, MessageSquare } from 'lucide-react';
import { Avatar } from './Avatar';
import { Paywall } from './Paywall';
import { XmtpChat } from './XmtpChat';

export function ChatView() {
  const { address } = useParams<{ address: `0x${string}` }>();
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [unlocked, setUnlocked] = useState(false);

  const { data: ensName } = useEnsName({ address });
  const normalized = ensName ? safeNormalize(ensName) : undefined;
  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });

  if (!address) return null;
  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  if (!isConnected) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">
        <MessageSquare className="text-brand mb-4" size={28} />
        <div className="text-text-primary font-medium mb-1">Connect to message {display}</div>
        <div className="text-text-secondary text-sm mb-6 max-w-xs">DMpay needs your wallet to verify payment and route messages over XMTP.</div>
        <button onClick={() => openConnectModal?.()} className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-3 font-medium">
          Connect wallet
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-bg-base">
      <header className="flex items-center gap-3 p-4 border-b border-border-subtle">
        <Avatar src={avatar || undefined} fallback={display[0]} online size={40} />
        <div className="flex-1">
          <div className="font-semibold">{display}</div>
          <div className="text-xs text-text-secondary truncate">{address}</div>
        </div>
        <button onClick={() => navigate(`/u/${address}`)} className="text-text-secondary hover:text-text-primary p-2 rounded-lg hover:bg-bg-hover">
          <MoreHorizontal size={20} />
        </button>
      </header>

      {!unlocked ? (
        <Paywall recipient={address} recipientName={display} onUnlocked={() => setUnlocked(true)} />
      ) : (
        <XmtpChat recipient={address} recipientName={display} />
      )}
    </main>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
