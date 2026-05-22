import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnsName, useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import { Loader2, MessageSquare, Inbox as InboxIcon } from 'lucide-react';
import type { Dm, DecodedMessage } from '@xmtp/browser-sdk';
import { ConsentState } from '@xmtp/browser-sdk';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { Avatar } from './Avatar';

type Row = {
  conversation: Dm<unknown>;
  peerAddress: string | null;
  lastMessage: DecodedMessage<unknown> | null;
};

export function Inbox() {
  const { client, init, initializing } = useXmtpClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        await client.conversations.sync();
        await client.conversations.syncAll([
          ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied,
        ]);
        const dms = await client.conversations.listDms({
          consentStates: [ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied],
        } as any);
        const enriched: Row[] = await Promise.all(
          dms.map(async (dm) => {
            await dm.sync().catch(() => {});
            const msgs = await dm.messages().catch(() => [] as DecodedMessage<unknown>[]);
            // Find the most recent text message for the preview
            const lastMessage = [...msgs].reverse().find((m) => typeof m.content === 'string') ?? msgs[msgs.length - 1] ?? null;
            // Resolve peer Ethereum address from members
            let peerAddress: string | null = null;
            try {
              const members = await dm.members();
              const peer = members.find((m: any) => m.inboxId !== client.inboxId);
              const eth = peer?.accountIdentifiers?.find((i: any) => i.identifierKind === 0 /* Ethereum */);
              peerAddress = eth?.identifier ?? null;
            } catch { /* ignore */ }
            return { conversation: dm, peerAddress, lastMessage };
          })
        );
        if (cancelled) return;
        // Sort by last message time desc
        enriched.sort((a, b) => Number((b.lastMessage?.sentAtNs ?? 0n) - (a.lastMessage?.sentAtNs ?? 0n)));
        setRows(enriched);
      } catch (e: any) {
        console.error('inbox load failed', e);
        setError(e?.message ?? 'Failed to load conversations');
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  if (!client) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">
        <InboxIcon className="text-brand mb-3" size={28} />
        <div className="text-text-primary font-medium mb-2">Connect to XMTP to see your inbox</div>
        <button
          onClick={() => init()}
          disabled={initializing}
          className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-2xl px-6 py-3 font-medium"
        >
          {initializing ? <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Connecting…</span> : 'Connect XMTP'}
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-text-primary">Inbox</h1>
          <button onClick={() => navigate('/')} className="text-text-secondary hover:text-text-primary text-sm">+ New chat</button>
        </div>
        {error && <div className="bg-bg-panel border border-red-500/30 text-red-300 rounded-2xl p-4 text-sm mb-4">{error}</div>}
        {rows === null && (
          <div className="flex items-center gap-2 text-text-secondary text-sm"><Loader2 className="animate-spin" size={14} /> Loading conversations…</div>
        )}
        {rows && rows.length === 0 && (
          <div className="bg-bg-panel border border-border-subtle rounded-3xl p-10 text-center">
            <MessageSquare className="text-brand mx-auto mb-3" size={24} />
            <div className="text-text-primary font-medium mb-1">No conversations yet</div>
            <div className="text-text-secondary text-sm mb-5">Search any ENS or wallet to start your first chat.</div>
            <button onClick={() => navigate('/')} className="bg-brand hover:bg-brand-hover text-white rounded-2xl px-5 py-2.5 font-medium text-sm">Find someone</button>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => (
              <InboxRow key={r.conversation.id} row={r} onOpen={(addr) => navigate(`/c/${addr}`)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function InboxRow({ row, onOpen }: { row: Row; onOpen: (addr: string) => void }) {
  const peer = row.peerAddress as `0x${string}` | null;
  const { data: ensName } = useEnsName({ address: peer ?? undefined, query: { enabled: !!peer } });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined, query: { enabled: !!ensName } });
  const display = ensName ?? (peer ? `${peer.slice(0, 6)}…${peer.slice(-4)}` : 'Unknown peer');
  const preview = typeof row.lastMessage?.content === 'string' ? row.lastMessage.content : '';
  return (
    <button
      onClick={() => peer && onOpen(peer)}
      disabled={!peer}
      className="w-full bg-bg-panel hover:bg-bg-hover border border-border-subtle rounded-2xl p-4 flex items-center gap-3 text-left transition-colors disabled:opacity-50"
    >
      <Avatar src={avatar || undefined} fallback={display[0]} size={44} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-text-primary truncate">{display}</div>
        <div className="text-sm text-text-secondary truncate">{preview || 'No messages yet'}</div>
      </div>
      {row.lastMessage && (
        <div className="text-xs text-text-muted shrink-0">
          {new Date(Number(row.lastMessage.sentAtNs / 1_000_000n)).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </div>
      )}
    </button>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
