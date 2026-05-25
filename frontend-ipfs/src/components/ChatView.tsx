import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, useEnsName, useEnsAvatar, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { normalize } from 'viem/ens';
import { MoreHorizontal, MessageSquare, User, Ban, Copy, ExternalLink, ArrowLeft, XCircle, Loader2 } from 'lucide-react';
import { ConsentState } from '@xmtp/browser-sdk';
import { Avatar } from './Avatar';
import { Paywall } from './Paywall';
import { XmtpChat } from './XmtpChat';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { ethIdentifier } from '../lib/xmtp';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';

export function ChatView() {
  const { address } = useParams<{ address: `0x${string}` }>();
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { client } = useXmtpClient();
  const [unlocked, setUnlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset per-recipient state when navigating between chats — React reuses the
  // ChatView instance on route param change, so without this `unlocked` would
  // leak across recipients and bypass the paywall.
  useEffect(() => {
    setUnlocked(false);
    setReachable(null);
  }, [address]);

  // Pre-check XMTP reachability so we never show the paywall (and never
  // charge) for a recipient who can't actually receive messages.
  useEffect(() => {
    if (!client || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await client.canMessage([ethIdentifier(address)]);
        if (cancelled) return;
        setReachable(map.get(address.toLowerCase()) === true);
      } catch (e) {
        console.warn('canMessage check failed', e);
        if (!cancelled) setReachable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, address]);

  const { data: ensName } = useEnsName({ address });
  const normalized = ensName ? safeNormalize(ensName) : undefined;
  const { data: avatar } = useEnsAvatar({ name: normalized, query: { enabled: !!normalized } });

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!address) return null;
  const display = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  const profilePath = ensName ? `/u/${ensName}` : `/u/${address}`;

  // On-chain block / close write — V2 contract enforces them at the source.
  // The XMTP consent flip is a belt-and-suspenders so blocked senders' future
  // messages don't render even if their wallet bypasses the dapp.
  const blockTx = useWriteContract();
  const closeTx = useWriteContract();
  const blockReceipt = useWaitForTransactionReceipt({ hash: blockTx.data });
  const closeReceipt = useWaitForTransactionReceipt({ hash: closeTx.data });

  useEffect(() => {
    if (!blockReceipt.isSuccess || !client || !address) return;
    (async () => {
      try {
        const dm = await client.conversations.fetchDmByIdentifier(ethIdentifier(address));
        if (dm) await dm.updateConsentState(ConsentState.Denied);
      } catch (e) {
        console.warn('XMTP consent update failed (block already on-chain)', e);
      } finally {
        navigate('/');
      }
    })();
  }, [blockReceipt.isSuccess, client, address, navigate]);

  useEffect(() => {
    if (!closeReceipt.isSuccess) return;
    navigate('/inbox');
  }, [closeReceipt.isSuccess, navigate]);

  function blockAndClose() {
    setMenuOpen(false);
    if (!address) return;
    blockTx.writeContract({
      address: DMPAY_DIRECT_ADDRESS,
      abi: dmpayDirectAbi,
      functionName: 'blockSender',
      args: [address],
    });
  }

  function closeConversation() {
    setMenuOpen(false);
    if (!address) return;
    closeTx.writeContract({
      address: DMPAY_DIRECT_ADDRESS,
      abi: dmpayDirectAbi,
      functionName: 'closeConversation',
      args: [address],
    });
  }

  const blocking = blockTx.isPending || blockReceipt.isLoading;
  const closing = closeTx.isPending || closeReceipt.isLoading;

  async function copyAddress() {
    setMenuOpen(false);
    if (!address) return;
    try { await navigator.clipboard.writeText(address); } catch { /* ignore */ }
  }

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
    <main className="flex-1 flex flex-col bg-bg-base min-h-0">
      <header className="flex items-center gap-3 p-4 border-b border-border-subtle">
        <button
          onClick={() => navigate('/inbox')}
          className="md:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover"
          aria-label="Back to inbox"
        >
          <ArrowLeft size={20} />
        </button>
        <Avatar src={avatar || undefined} fallback={display[0]} online size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{display}</div>
          <div className="text-xs text-text-secondary truncate">{address}</div>
        </div>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`p-2 rounded-lg hover:bg-bg-hover ${menuOpen ? 'text-text-primary bg-bg-hover' : 'text-text-secondary hover:text-text-primary'}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-2 w-56 bg-bg-panel border border-border-subtle rounded-2xl shadow-2xl py-1.5 z-30">
              <MenuItem icon={<User size={16} />} onClick={() => { setMenuOpen(false); navigate(profilePath); }}>
                View profile
              </MenuItem>
              <MenuItem icon={<Copy size={16} />} onClick={copyAddress}>
                Copy address
              </MenuItem>
              <MenuItem
                icon={<ExternalLink size={16} />}
                onClick={() => { setMenuOpen(false); window.open(`https://etherscan.io/address/${address}`, '_blank'); }}
              >
                View on Etherscan
              </MenuItem>
              <div className="border-t border-border-subtle my-1.5" />
              <MenuItem
                icon={closing ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                onClick={closeConversation}
                disabled={closing || blocking}
              >
                {closing ? 'Closing on-chain…' : 'Close conversation'}
              </MenuItem>
              <MenuItem
                icon={blocking ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                onClick={blockAndClose}
                disabled={blocking || closing}
                danger
              >
                {blocking ? 'Blocking on-chain…' : 'Block & close conversation'}
              </MenuItem>
            </div>
          )}
        </div>
      </header>

      {reachable === false ? (
        <UnreachableNotice recipientName={display} />
      ) : !unlocked ? (
        <Paywall key={address} recipient={address} recipientName={display} onUnlocked={() => setUnlocked(true)} />
      ) : (
        <XmtpChat key={address} recipient={address} recipientName={display} />
      )}
    </main>
  );
}

function UnreachableNotice({ recipientName }: { recipientName: string }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">
      <MessageSquare className="text-text-muted mb-3" size={28} />
      <div className="text-text-primary font-medium mb-2">{recipientName} isn't on XMTP yet</div>
      <div className="text-text-secondary text-sm max-w-sm">
        They haven't activated end-to-end encrypted messaging on this address.
        You can't pay or message them through DMpay until they sign in once
        on any XMTP client (Converse, Coinbase Wallet, xmtp.chat).
      </div>
    </main>
  );
}

function MenuItem({ icon, onClick, children, danger, disabled }: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3.5 py-2 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-text-primary hover:bg-bg-hover'
      }`}
    >
      <span className={danger ? 'text-red-400' : 'text-text-secondary'}>{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
