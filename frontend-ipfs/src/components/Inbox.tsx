import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnsName, useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import { isAddress } from 'viem';
import { Loader2, MessageSquare, Inbox as InboxIcon, Zap, RefreshCw, Search, Users } from 'lucide-react';
import type { Dm, Group, DecodedMessage } from '@xmtp/browser-sdk';
import { ConsentState } from '@xmtp/browser-sdk';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { Avatar } from './Avatar';
import { fetchXmtpIdToGroupId } from '../lib/groups';

type DmRow = {
  kind: 'dm';
  id: string;
  conversation: Dm<unknown>;
  peerAddress: string | null;
  lastMessage: DecodedMessage<unknown> | null;
};

type GroupRow = {
  kind: 'group';
  id: string;
  conversation: Group<unknown>;
  /** On-chain group id, resolved from GroupXmtpIdSet logs. Null = not a DMpay group. */
  onchainId: bigint | null;
  name: string | null;
  lastMessage: DecodedMessage<unknown> | null;
};

type Row = DmRow | GroupRow;

const lastMessageTs = (r: Row) => r.lastMessage?.sentAtNs ?? 0n;

export function Inbox() {
  const { client, init, initializing } = useXmtpClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await client.conversations.sync();
        await client.conversations.syncAll([
          ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied,
        ]);
        const consentStates = [ConsentState.Allowed, ConsentState.Unknown, ConsentState.Denied];
        const [dms, groups] = await Promise.all([
          client.conversations.listDms({ consentStates } as any),
          client.conversations.listGroups({ consentStates } as any).catch((e: unknown) => {
            console.warn('listGroups failed', e);
            return [] as Group<unknown>[];
          }),
        ]);

        const dmRows: Row[] = await Promise.all(
          dms.map(async (dm): Promise<DmRow> => {
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
            return { kind: 'dm', id: dm.id, conversation: dm, peerAddress, lastMessage };
          })
        );

        // Groups only carry their XMTP id; the on-chain id (for the /g/:id link)
        // lives in GroupXmtpIdSet logs. Skip the scan entirely when there are none.
        const idMap = groups.length > 0 ? await fetchXmtpIdToGroupId() : new Map<string, bigint>();
        const groupRows: Row[] = await Promise.all(
          groups.map(async (g): Promise<GroupRow> => {
            await g.sync().catch(() => {});
            const msgs = await g.messages().catch(() => [] as DecodedMessage<unknown>[]);
            const lastMessage = [...msgs].reverse().find((m) => typeof m.content === 'string') ?? msgs[msgs.length - 1] ?? null;
            return {
              kind: 'group',
              id: g.id,
              conversation: g,
              onchainId: idMap.get(g.id.toLowerCase()) ?? null,
              name: ((g as any).name as string | undefined) || null,
              lastMessage,
            };
          })
        );

        if (cancelled) return;
        const all = [...dmRows, ...groupRows];
        all.sort((a, b) => Number(lastMessageTs(b) - lastMessageTs(a)));
        setRows(all);
      } catch (e: any) {
        console.error('inbox load failed', e);
        setError(e?.message ?? 'Failed to load conversations');
      }
    })();
    return () => { cancelled = true; };
  }, [client, reloadKey]);

  if (!client) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">
        <div className="max-w-md">
          <InboxIcon className="text-text-muted mb-4 mx-auto" size={28} />
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Step required</div>
          <h2 className="dm-display text-3xl mt-2 text-text-primary">Connect to XMTP to read your inbox.</h2>
          <p className="text-sm text-text-secondary mt-3">DMpay messages live on XMTP — end-to-end encrypted and portable. One signature unlocks your inbox in this browser.</p>
          <button
            onClick={() => init()}
            disabled={initializing}
            className="mt-6 bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3.5 font-medium inline-flex items-center gap-2"
          >
            {initializing
              ? <><Loader2 className="animate-spin" size={16} /> Connecting…</>
              : <><Zap size={16} /> Connect XMTP</>}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 pt-12 pb-16">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· Inbox</div>
            <h1 className="dm-display text-4xl sm:text-5xl mt-2 text-text-primary">Your conversations</h1>
            {rows && (
              <p className="font-mono text-xs text-text-muted mt-2">
                {rows.length} {rows.length === 1 ? 'thread' : 'threads'} · synced via XMTP
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/groups/new')}
              className="font-mono text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1.5 border border-border-subtle rounded-full px-3 py-2"
              title="Create a paid group chat"
            >
              <Users size={12} /> New group
            </button>
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="font-mono text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1.5 border border-border-subtle rounded-full px-3 py-2"
              title="Resync from network"
            >
              <RefreshCw size={12} /> Resync
            </button>
          </div>
        </div>

        <InboxSearch onSubmit={(v) => navigate(`/u/${v}`)} className="mt-6" />

        {error && (
          <div className="mt-6 bg-bg-panel border border-danger/30 text-danger rounded-2xl p-4 text-sm">{error}</div>
        )}

        {rows === null && (
          <div className="mt-8 flex items-center gap-2 text-text-secondary text-sm font-mono">
            <Loader2 className="animate-spin" size={14} /> Loading conversations…
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="mt-8 bg-bg-panel border border-border-subtle rounded-3xl p-10 text-center">
            <MessageSquare className="text-text-muted mx-auto mb-3" size={24} />
            <div className="text-text-primary font-medium mb-1">No conversations on this installation.</div>
            <div className="text-text-secondary text-sm max-w-md mx-auto">
              XMTP threads are bound to the installation that created them. If you revoked your previous installation,
              older history won't reappear here — the messages still exist on-network for the other inboxId.
            </div>
            <InboxSearch onSubmit={(v) => navigate(`/u/${v}`)} className="mt-6 max-w-md mx-auto text-left" autoFocus />
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
            {rows.map((r) =>
              r.kind === 'group' ? (
                <GroupInboxRow key={r.id} row={r} onOpen={(gid) => navigate(`/g/${gid}`)} />
              ) : (
                <InboxRow key={r.id} row={r} onOpen={(addr) => navigate(`/c/${addr}`)} />
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function GroupInboxRow({ row, onOpen }: { row: GroupRow; onOpen: (groupId: string) => void }) {
  const display = row.name || (row.onchainId !== null ? `Group #${row.onchainId.toString()}` : 'Group');
  const preview = typeof row.lastMessage?.content === 'string' ? row.lastMessage.content : '';
  const dateLabel = formatWhen(row.lastMessage);
  // Groups created outside DMpay have no on-chain id, so there's no /g/ page for them.
  const openable = row.onchainId !== null;

  return (
    <button
      onClick={() => openable && onOpen(row.onchainId!.toString())}
      disabled={!openable}
      title={openable ? undefined : 'This XMTP group was not created through DMpay'}
      className="w-full py-4 flex items-center gap-4 text-left disabled:opacity-50 hover:bg-bg-elevated/40 transition-colors px-2 -mx-2 rounded-xl"
    >
      <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border-subtle flex items-center justify-center shrink-0">
        <Users size={20} className="text-text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[15px] font-medium text-text-primary truncate">{display}</span>
          <span className="font-mono text-[11px] text-text-muted shrink-0">{dateLabel}</span>
        </div>
        <div className="text-sm text-text-secondary truncate mt-1">
          {preview || (openable ? 'Paid group · no messages yet' : 'Group · not a DMpay group')}
        </div>
      </div>
    </button>
  );
}

function formatWhen(msg: DecodedMessage<unknown> | null): string {
  if (!msg) return '';
  const ts = new Date(Number(msg.sentAtNs / 1_000_000n));
  return Date.now() - ts.getTime() < 24 * 3600_000
    ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function InboxRow({ row, onOpen }: { row: DmRow; onOpen: (addr: string) => void }) {
  const peer = row.peerAddress as `0x${string}` | null;
  const { data: ensName } = useEnsName({ address: peer ?? undefined, query: { enabled: !!peer } });
  const { data: avatar } = useEnsAvatar({ name: ensName ? safeNormalize(ensName) : undefined, query: { enabled: !!ensName } });
  const display = ensName ?? (peer ? `${peer.slice(0, 6)}…${peer.slice(-4)}` : 'Unknown peer');
  const preview = typeof row.lastMessage?.content === 'string' ? row.lastMessage.content : '';
  const dateLabel = formatWhen(row.lastMessage);

  return (
    <button
      onClick={() => peer && onOpen(peer)}
      disabled={!peer}
      className="w-full py-4 flex items-center gap-4 text-left disabled:opacity-50 hover:bg-bg-elevated/40 transition-colors px-2 -mx-2 rounded-xl"
    >
      <Avatar src={avatar || undefined} fallback={display[0]} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[15px] font-medium text-text-primary truncate">{display}</span>
          <span className="font-mono text-[11px] text-text-muted shrink-0">{dateLabel}</span>
        </div>
        <div className="text-sm text-text-secondary truncate mt-1">{preview || 'No messages yet'}</div>
      </div>
    </button>
  );
}

function InboxSearch({ onSubmit, className = '', autoFocus = false }: { onSubmit: (value: string) => void; className?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const isEns = trimmed.endsWith('.eth') || (trimmed.includes('.') && !trimmed.startsWith('0x'));
  const valid = isEns || isAddress(trimmed);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(trimmed); }}
      className={className}
    >
      <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-2xl pl-4 pr-2 py-2 focus-within:ring-1 focus-within:ring-brand">
        <Search size={16} className="text-text-muted shrink-0" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start a new chat — vitalik.eth or 0x…"
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-[15px] px-3 py-1 focus:outline-none font-mono"
        />
        <button
          type="submit"
          disabled={!valid}
          className="bg-brand hover:bg-brand-hover disabled:bg-bg-hover disabled:text-text-muted text-brand-ink rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          Go
        </button>
      </div>
      {query && !valid && (
        <div className="text-text-muted text-xs mt-2 font-mono">Type a full ENS name or 0x address.</div>
      )}
    </form>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
