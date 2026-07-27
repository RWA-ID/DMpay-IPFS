import { useEffect, useState } from 'react';
import { Search, Plus, MessageSquare, Loader2, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAccount, useEnsName, useEnsAvatar, useEnsAddress } from 'wagmi';
import { normalize } from 'viem/ens';
import { isAddress } from 'viem';
import { ConsentState, type Dm, type DecodedMessage } from '@xmtp/browser-sdk';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { Avatar } from './Avatar';

type Row = {
  conversation: Dm<unknown>;
  peerAddress: string | null;
  lastMessage: DecodedMessage<unknown> | null;
};

export function ChatList({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const { address: activeAddr } = useParams();
  const { isConnected } = useAccount();
  const { client, initializing, error } = useXmtpClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        // syncAll fetches new welcomes + preference updates and is the
        // recommended startup call (covers sync() too). Including Denied so
        // blocked threads stay visible if the user wants to unblock.
        // https://docs.xmtp.org/chat-apps/list-stream-sync/sync-and-syncall
        await client.conversations.syncAll([ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied]);
        const dms = await client.conversations.listDms({
          consentStates: [ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied],
        } as any);
        const enriched: Row[] = await Promise.all(
          dms.map(async (dm) => {
            await dm.sync().catch(() => {});
            const msgs = await dm.messages().catch(() => [] as DecodedMessage<unknown>[]);
            const lastMessage = [...msgs].reverse().find((m) => typeof m.content === 'string') ?? msgs[msgs.length - 1] ?? null;
            let peerAddress: string | null = null;
            try {
              const members = await dm.members();
              const peer = members.find((m: any) => m.inboxId !== client.inboxId);
              const eth = peer?.accountIdentifiers?.find((i: any) => i.identifierKind === 0);
              peerAddress = eth?.identifier ?? null;
            } catch { /* ignore */ }
            return { conversation: dm, peerAddress, lastMessage };
          })
        );
        if (cancelled) return;
        enriched.sort((a, b) => Number((b.lastMessage?.sentAtNs ?? 0n) - (a.lastMessage?.sentAtNs ?? 0n)));
        setRows(enriched);
      } catch (e) {
        console.error('chat list load failed', e);
        setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  // Pre-XMTP states. This column only ever sits beside an open chat or group,
  // and that pane already offers the same action — so these states explain what
  // the list is waiting for rather than repeating a button the user is
  // looking at twice already.
  if (!isConnected) {
    return (
      <div className={`${className} bg-bg-panel border-r border-border-subtle flex flex-col items-center justify-center p-6 text-center`}>
        <MessageSquare className="text-text-muted mb-3" size={24} />
        <div className="text-text-primary font-medium mb-1">Your chats</div>
        <div className="text-text-secondary text-xs">Connect your wallet to see them here.</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className={`${className} bg-bg-panel border-r border-border-subtle flex flex-col items-center justify-center p-6 text-center`}>
        {initializing ? (
          <>
            <Loader2 className="animate-spin text-brand mb-3" size={20} />
            <div className="text-text-primary font-medium mb-1">Connecting to XMTP…</div>
            <div className="text-text-secondary text-xs">Check your wallet for a signature.</div>
          </>
        ) : (
          <>
            <MessageSquare className="text-text-muted mb-3" size={24} />
            <div className="text-text-primary font-medium mb-1">Your chats</div>
            <div className="text-text-secondary text-xs">Enable messaging to load them.</div>
            {error && <div className="text-red-400 text-[11px] mt-3 max-w-[12rem]">{error}</div>}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`${className} bg-bg-panel border-r border-border-subtle flex flex-col`}>
      <div className="p-4 space-y-3">
        {searching ? (
          <NewChatSearch onClose={() => setSearching(false)} onSelect={(addr) => { setSearching(false); navigate(`/c/${addr}`); }} />
        ) : (
          <button
            onClick={() => setSearching(true)}
            className="w-full bg-brand hover:bg-brand-hover text-brand-ink rounded-xl py-2.5 flex items-center justify-center gap-2 font-medium text-sm transition-colors"
          >
            <Plus size={16} /> New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {rows === null && (
          <div className="flex items-center gap-2 text-text-secondary text-sm px-3 py-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {rows && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-soft flex items-center justify-center mb-3">
              <MessageSquare size={20} className="text-brand" />
            </div>
            <div className="text-sm font-medium text-text-primary mb-1">No chats yet</div>
            <div className="text-xs text-text-secondary">Click + New chat to start one.</div>
          </div>
        )}
        {rows && rows.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-wider text-text-muted px-3 py-2">Recent</div>
            {rows.map((r) => (
              <ChatRow
                key={r.conversation.id}
                row={r}
                active={!!r.peerAddress && activeAddr?.toLowerCase() === r.peerAddress.toLowerCase()}
                onOpen={(a) => navigate(`/c/${a}`)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ChatRow({ row, active, onOpen }: { row: Row; active: boolean; onOpen: (addr: string) => void }) {
  const peer = row.peerAddress as `0x${string}` | null;
  const { data: ensName } = useEnsName({ address: peer ?? undefined, query: { enabled: !!peer } });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined, query: { enabled: !!ensName } });
  const display = ensName ?? (peer ? `${peer.slice(0, 6)}…${peer.slice(-4)}` : 'Unknown');
  const preview = typeof row.lastMessage?.content === 'string' ? (row.lastMessage.content as string) : '';
  const time = row.lastMessage
    ? new Date(Number(row.lastMessage.sentAtNs / 1_000_000n)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <button
      onClick={() => peer && onOpen(peer)}
      disabled={!peer}
      className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 transition-colors text-left ${
        active ? 'bg-brand text-brand-ink' : 'hover:bg-bg-hover'
      } disabled:opacity-50`}
    >
      <Avatar src={avatar || undefined} fallback={display[0]} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium truncate ${active ? 'text-brand-ink' : 'text-text-primary'}`}>{display}</span>
          <span className={`text-xs ${active ? 'text-brand-ink/70' : 'text-text-muted'}`}>{time}</span>
        </div>
        <div className={`text-sm truncate ${active ? 'text-brand-ink/70' : 'text-text-secondary'}`}>{preview || 'No messages yet'}</div>
      </div>
    </button>
  );
}

function NewChatSearch({ onClose, onSelect }: { onClose: () => void; onSelect: (addr: `0x${string}`) => void }) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const isEns = trimmed.endsWith('.eth') || (trimmed.includes('.') && !trimmed.startsWith('0x'));
  const isAddr = isAddress(trimmed);
  const { data: resolvedAddr, isLoading } = useEnsAddress({
    name: isEns ? safeNormalize(trimmed) : undefined,
    query: { enabled: isEns },
  });
  const target = isAddr ? (trimmed as `0x${string}`) : (resolvedAddr as `0x${string}` | undefined);

  return (
    <div className="space-y-2">
      <div className="flex items-center bg-bg-elevated rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-brand">
        <Search size={14} className="text-text-muted shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && target) onSelect(target); if (e.key === 'Escape') onClose(); }}
          placeholder="vitalik.eth or 0x…"
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm px-2 py-1 focus:outline-none"
        />
        <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
          <X size={14} />
        </button>
      </div>
      {isLoading && <div className="text-xs text-text-muted px-1">Resolving…</div>}
      {query && !isLoading && !target && (
        <div className="text-xs text-text-muted px-1">Type a full ENS or 0x address.</div>
      )}
      {target && (
        <button
          onClick={() => onSelect(target)}
          className="w-full bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-xl px-3 py-2 text-sm text-left font-medium"
        >
          → Open {isEns ? trimmed : `${target.slice(0, 6)}…${target.slice(-4)}`}
        </button>
      )}
    </div>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
