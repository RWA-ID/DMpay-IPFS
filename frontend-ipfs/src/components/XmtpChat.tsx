import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { Loader2, Mic, Plus, Smile, Send, AlertCircle } from 'lucide-react';
import type { Dm, DecodedMessage } from '@xmtp/browser-sdk';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { ethIdentifier } from '../lib/xmtp';

export function XmtpChat({ recipient, recipientName }: {
  recipient: `0x${string}`;
  recipientName: string;
}) {
  const { client, init, initializing, error, revokeAndRetry, needsRevoke } = useXmtpClient();
  useAccount();
  const [conversation, setConversation] = useState<Dm<unknown> | null>(null);
  const [messages, setMessages] = useState<DecodedMessage<unknown>[]>([]);
  const [myInboxId, setMyInboxId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientReachable, setRecipientReachable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<{ end: () => Promise<unknown> } | null>(null);

  // Initialize XMTP client on mount
  useEffect(() => { if (!client && !initializing) init(); }, [client, init, initializing]);

  // Capture our inboxId
  useEffect(() => {
    if (!client) return;
    setMyInboxId(client.inboxId ?? null);
  }, [client]);

  // Set up conversation
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const identifier = ethIdentifier(recipient);
        const reachableMap = await client.canMessage([identifier]);
        const reachable = reachableMap.get(recipient.toLowerCase()) === true;
        if (cancelled) return;
        setRecipientReachable(reachable);
        if (!reachable) return;

        // Pull any pending welcome messages + new DMs from the network
        await client.conversations.sync().catch((e) => console.warn('conversations sync failed', e));

        // try to fetch existing, else create
        let dm = await client.conversations.fetchDmByIdentifier(identifier);
        if (!dm) dm = await client.conversations.createDmWithIdentifier(identifier);
        if (cancelled) return;
        setConversation(dm);

        await dm.sync().catch((e) => console.warn('dm sync failed', e));
        const initial = await dm.messages();
        console.log('[XMTP] loaded', initial.length, 'messages for', recipient);
        if (cancelled) return;
        setMessages(initial);

        const stream = await dm.stream({
          onValue: (msg) => {
            if (cancelled || !msg) return;
            setMessages((prev) => [...prev, msg]);
          },
        });
        streamRef.current = stream as unknown as { end: () => Promise<unknown> };
      } catch (e: any) {
        console.error('XMTP convo failed', e);
        setSetupError(e?.message ?? 'Failed to load conversation');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.end().catch(() => {});
      streamRef.current = null;
    };
  }, [client, recipient]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    if (!conversation || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      await conversation.sendText(text);
    } catch (e: any) {
      console.error(e);
      setSetupError(e?.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  // Render states

  if (error || setupError) {
    return (
      <CenteredState>
        <AlertCircle className="text-red-400 mb-3" />
        <div className="text-text-primary font-medium mb-1">XMTP error</div>
        <div className="text-text-secondary text-sm max-w-sm mb-5">{error ?? setupError}</div>
        {needsRevoke && (
          <>
            <div className="text-text-secondary text-xs max-w-sm mb-3">
              You've hit XMTP's 10 installations / wallet limit. Revoke old ones (other browsers/devices will need to reconnect).
            </div>
            <button onClick={() => revokeAndRetry()} disabled={initializing} className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-2xl px-6 py-3 font-medium">
              {initializing ? 'Revoking…' : 'Revoke old installations & retry'}
            </button>
          </>
        )}
      </CenteredState>
    );
  }

  if (!client) {
    return (
      <CenteredState>
        {initializing ? (
          <>
            <Loader2 className="animate-spin text-brand mb-3" />
            <div className="text-text-primary font-medium mb-1">Connecting to XMTP…</div>
            <div className="text-text-secondary text-sm max-w-sm mb-4">Check your wallet for a signature request. If nothing pops up, open MetaMask manually.</div>
          </>
        ) : (
          <>
            <div className="text-text-primary font-medium mb-1">Connect to XMTP</div>
            <div className="text-text-secondary text-sm max-w-sm mb-4">Sign once to enable end-to-end encrypted messaging.</div>
          </>
        )}
        <button
          onClick={() => init()}
          disabled={initializing}
          className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-2xl px-6 py-3 font-medium"
        >
          {initializing ? 'Retry signature' : 'Connect XMTP'}
        </button>
      </CenteredState>
    );
  }

  if (recipientReachable === false) {
    return (
      <CenteredState>
        <AlertCircle className="text-text-muted mb-3" />
        <div className="text-text-primary font-medium mb-1">{recipientName} isn't on XMTP yet</div>
        <div className="text-text-secondary text-sm max-w-sm">
          Your payment is confirmed on-chain. They can read this conversation once they activate XMTP from any client (Converse, Coinbase Wallet, xmtp.chat).
        </div>
      </CenteredState>
    );
  }

  if (!conversation) {
    return <CenteredState><Loader2 className="animate-spin text-text-muted" /></CenteredState>;
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-12">
            End-to-end encrypted. Say hello to {recipientName} 👋
          </div>
        )}
        {messages.map((m) => {
          const fromMe = myInboxId && m.senderInboxId === myInboxId;
          const text = typeof m.content === 'string' ? m.content : '';
          if (!text) return null;
          return (
            <div key={m.id} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-md px-4 py-2.5 rounded-bubble text-sm leading-relaxed whitespace-pre-wrap break-words ${
                fromMe ? 'bg-bubble-outgoing text-white' : 'bg-bubble-incoming text-text-primary'
              }`}>
                {text}
                <div className={`text-[10px] mt-1 ${fromMe ? 'text-white/60 text-right' : 'text-text-muted'}`}>
                  {new Date(Number(m.sentAtNs / 1_000_000n)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-border-subtle">
        <div className="flex items-center gap-2 bg-bg-elevated rounded-2xl px-3 py-2 focus-within:ring-1 focus-within:ring-brand">
          <button className="p-2 text-text-secondary hover:text-text-primary"><Plus size={18} /></button>
          <button className="p-2 text-text-secondary hover:text-text-primary"><Smile size={18} /></button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${recipientName}...`}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none text-sm py-1"
          />
          {draft.trim() ? (
            <button onClick={send} disabled={sending} className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send
            </button>
          ) : (
            <button className="bg-brand hover:bg-brand-hover text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium">
              <Mic size={16} /> Voice
            </button>
          )}
        </div>
        <div className="text-[10px] text-text-muted mt-2 flex items-center justify-center gap-1.5">
          <img src="/xmtp.jpg" alt="XMTP" className="w-3 h-3 rounded-full" />
          End-to-end encrypted via XMTP
        </div>
      </div>
    </>
  );
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">{children}</main>;
}
