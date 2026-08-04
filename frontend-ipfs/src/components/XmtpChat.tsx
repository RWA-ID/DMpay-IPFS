import { useEffect, useRef, useState } from 'react';
import { useAccount, useEnsAvatar } from 'wagmi';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { normalize } from 'viem/ens';
import { Loader2, Mic, Plus, Smile, Send, AlertCircle, X, Coins, Image as ImageIcon } from 'lucide-react';
import {
  encryptAttachment,
  decryptAttachment,
  isAttachment,
  isRemoteAttachment,
  type Dm,
  type Group,
  type DecodedMessage,
} from '@xmtp/browser-sdk';

type Attachment = { filename?: string; mimeType: string; content: Uint8Array };
type RemoteAttachment = {
  url: string;
  contentDigest: string;
  salt: Uint8Array;
  nonce: Uint8Array;
  secret: Uint8Array;
  scheme: string;
  filename: string;
  contentLength: number;
};
import EmojiPicker, { type EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { Avatar } from './Avatar';
import { ethIdentifier } from '../lib/xmtp';
import { uploadEncryptedToPinata, fetchAttachment } from '../lib/pinata';
import { asNftSend, asTip } from '../lib/chatContent';
import { NftCard, TipCard } from './ChatCards';
import { TipComposer } from './TipComposer';
import { NftComposer } from './NftComposer';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export function XmtpChat({ recipient, recipientName, conversation: provided, senderDirectory }: {
  /** DM mode: the peer to resolve a 1:1 conversation with. */
  recipient?: `0x${string}`;
  recipientName: string;
  /** Pre-resolved conversation (groups). When set, DM resolution is skipped. */
  conversation?: Dm<unknown> | Group<unknown>;
  /**
   * Group mode: inboxId -> address, so each message can be attributed. A DM
   * needs none — the header already names the only other party.
   */
  senderDirectory?: Map<string, `0x${string}`>;
}) {
  const { client, init, initializing, error, revokeAndRetry, needsRevoke } = useXmtpClient();
  const { address: me } = useAccount();
  const [conversation, setConversation] = useState<Dm<unknown> | Group<unknown> | null>(null);
  const [messages, setMessages] = useState<DecodedMessage<unknown>[]>([]);
  const [myInboxId, setMyInboxId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [composer, setComposer] = useState<'tip' | 'nft' | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [recipientReachable, setRecipientReachable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<{ end: () => Promise<unknown> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!client && !initializing) init(); }, [client, init, initializing]);

  // Who a tip or NFT can be aimed at. A DM has exactly one answer; a group has
  // no address of its own, so the composer offers the roster instead — minus
  // yourself, and minus members who never published an address.
  const tipCandidates = senderDirectory
    ? [...new Set(senderDirectory.values())].filter((a) => a && a.toLowerCase() !== me?.toLowerCase())
    : [];
  const composerTarget = senderDirectory ? null : (recipient ?? null);
  const canSendValue = senderDirectory ? tipCandidates.length > 0 : !!recipient;

  useEffect(() => {
    if (!client) return;
    setMyInboxId(client.inboxId ?? null);
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        let convo: Dm<unknown> | Group<unknown>;

        if (provided) {
          // Group mode: the caller already established membership, so there is
          // no single peer to probe with canMessage.
          setRecipientReachable(true);
          convo = provided;
        } else {
          if (!recipient) return;
          const identifier = ethIdentifier(recipient);
          const reachableMap = await client.canMessage([identifier]);
          const reachable = reachableMap.get(recipient.toLowerCase()) === true;
          if (cancelled) return;
          setRecipientReachable(reachable);
          if (!reachable) return;

          await client.conversations.sync().catch((e) => console.warn('conversations sync failed', e));

          let dm = await client.conversations.fetchDmByIdentifier(identifier);
          if (!dm) dm = await client.conversations.createDmWithIdentifier(identifier);
          convo = dm;
        }

        if (cancelled) return;
        setConversation(convo);

        await convo.sync().catch((e) => console.warn('conversation sync failed', e));
        const initial = await convo.messages();
        if (cancelled) return;
        setMessages(initial);

        const stream = await convo.stream({
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
  }, [client, recipient, provided]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Close emoji picker on outside click / Escape
  useEffect(() => {
    if (!showEmoji) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowEmoji(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showEmoji]);

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

  function onEmojiClick(data: EmojiClickData) {
    const input = inputRef.current;
    if (!input) {
      setDraft((d) => d + data.emoji);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + data.emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + data.emoji.length;
      input.setSelectionRange(pos, pos);
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are supported right now.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setUploadError(null);
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  async function sendPendingImage() {
    if (!conversation || !pendingImage || uploading) return;
    const { file } = pendingImage;
    setUploadError(null);
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const attachment: Attachment = { filename: file.name, mimeType: file.type, content: buf };
      const encrypted = await encryptAttachment(attachment);
      const url = await uploadEncryptedToPinata(encrypted.payload, file.name);
      const remote: RemoteAttachment = {
        url,
        contentDigest: encrypted.contentDigest,
        salt: encrypted.salt,
        nonce: encrypted.nonce,
        secret: encrypted.secret,
        scheme: 'https',
        filename: file.name,
        contentLength: file.size,
      };
      await conversation.sendRemoteAttachment(remote as any);
      clearPendingImage();
    } catch (err: any) {
      console.error('attachment send failed', err);
      setUploadError(err?.message ?? 'Failed to send image');
    } finally {
      setUploading(false);
    }
  }

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
            <button onClick={() => revokeAndRetry()} disabled={initializing} className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3 font-medium">
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
          className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3 font-medium"
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-12">
            {provided
              ? `End-to-end encrypted. Start the conversation in ${recipientName} 👋`
              : `End-to-end encrypted. Say hello to ${recipientName} 👋`}
          </div>
        )}
        {messages.map((m, i) => {
          const fromMe = !!myInboxId && m.senderInboxId === myInboxId;
          // Attribute incoming group messages, and only on the first of a run
          // from the same sender — repeating it on every line is noise.
          const startsRun = messages[i - 1]?.senderInboxId !== m.senderInboxId;
          // Tip/NFT cards verify the sender's claim against the address behind
          // the XMTP identity. A DM has only two parties, so it's known without
          // a directory lookup.
          const senderAddress = senderDirectory
            ? (senderDirectory.get(m.senderInboxId) ?? null)
            : (fromMe ? (me ?? null) : (recipient ?? null));
          return (
            <MessageBubble
              key={m.id}
              message={m}
              fromMe={fromMe}
              inGroup={!!senderDirectory}
              senderAddress={senderAddress}
              showSender={startsRun}
            />
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />

      {uploadError && (
        <div className="px-4 pb-2">
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-red-300 hover:text-red-200"><X size={14} /></button>
          </div>
        </div>
      )}

      {pendingImage && (
        <div className="px-4 pt-3">
          <div className="bg-bg-elevated border border-border-subtle rounded-2xl p-3 flex items-center gap-3">
            <img src={pendingImage.previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-primary truncate">{pendingImage.file.name}</div>
              <div className="text-xs text-text-muted">{(pendingImage.file.size / 1024).toFixed(0)} KB · ready to send</div>
            </div>
            <button
              onClick={clearPendingImage}
              disabled={uploading}
              title="Cancel"
              className="p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover disabled:opacity-50"
            >
              <X size={16} />
            </button>
            <button
              onClick={sendPendingImage}
              disabled={uploading}
              className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {uploading ? 'Sending…' : 'Send image'}
            </button>
          </div>
        </div>
      )}

      <div className="relative p-4 border-t border-border-subtle">
        {showEmoji && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
            <div className="absolute bottom-20 left-4 z-20 shadow-2xl rounded-2xl overflow-hidden">
              <EmojiPicker theme={EmojiTheme.DARK} onEmojiClick={onEmojiClick} lazyLoadEmojis width={320} height={380} />
            </div>
          </>
        )}

        {showActions && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
            <div className="absolute bottom-20 left-4 z-20 w-52 bg-bg-panel border border-border-subtle rounded-2xl shadow-pop overflow-hidden">
              <ActionItem
                icon={<Plus size={15} />}
                label="Image"
                onClick={() => { setShowActions(false); fileInputRef.current?.click(); }}
              />
              <ActionItem
                icon={<Coins size={15} />}
                label="Tip"
                sub={canSendValue ? 'USDC or ETH' : 'No recipient yet'}
                disabled={!canSendValue}
                onClick={() => { setShowActions(false); setComposer('tip'); }}
              />
              <ActionItem
                icon={<ImageIcon size={15} />}
                label="NFT"
                sub={canSendValue ? 'From your wallet' : 'No recipient yet'}
                disabled={!canSendValue}
                onClick={() => { setShowActions(false); setComposer('nft'); }}
              />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 bg-bg-elevated rounded-2xl px-3 py-2 focus-within:ring-1 focus-within:ring-brand">
          <button
            type="button"
            onClick={() => setShowActions((s) => !s)}
            disabled={uploading}
            title="Send image, tip or NFT"
            className={`p-2 hover:text-text-primary disabled:opacity-50 transition-transform ${showActions ? 'text-brand rotate-45' : 'text-text-secondary'}`}
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            title="Emoji"
            className={`p-2 hover:text-text-primary ${showEmoji ? 'text-brand' : 'text-text-secondary'}`}
          >
            <Smile size={18} />
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${recipientName}...`}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none text-sm py-1"
          />
          {draft.trim() ? (
            <button onClick={send} disabled={sending} className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send
            </button>
          ) : (
            <button className="bg-brand hover:bg-brand-hover text-brand-ink rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium">
              <Mic size={16} /> Voice
            </button>
          )}
        </div>
        <div className="text-[10px] text-text-muted mt-2 flex items-center justify-center gap-1.5">
          <img src="/xmtp.jpg" alt="XMTP" className="w-3 h-3 rounded-full" />
          End-to-end encrypted via XMTP
        </div>
      </div>

      {composer === 'tip' && (
        <TipComposer
          conversation={conversation}
          target={composerTarget}
          candidates={tipCandidates}
          onClose={() => setComposer(null)}
          onSent={() => setComposer(null)}
        />
      )}
      {composer === 'nft' && (
        <NftComposer
          conversation={conversation}
          target={composerTarget}
          candidates={tipCandidates}
          onClose={() => setComposer(null)}
          onSent={() => setComposer(null)}
        />
      )}
    </>
  );
}

function ActionItem({ icon, label, sub, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-bg-hover disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <span className="w-7 h-7 rounded-lg bg-chip grid place-items-center text-text-primary shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-text-primary">{label}</span>
        {sub && <span className="block text-[10px] text-text-muted truncate">{sub}</span>}
      </span>
    </button>
  );
}

function MessageBubble({ message, fromMe, inGroup, senderAddress, showSender }: {
  message: DecodedMessage<unknown>;
  fromMe: boolean;
  inGroup?: boolean;
  senderAddress?: `0x${string}` | null;
  showSender?: boolean;
}) {
  const time = new Date(Number(message.sentAtNs / 1_000_000n)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Value transfers are events, not speech — they get their own full-width
  // card rather than a bubble, and skip the avatar gutter entirely.
  const tip = asTip(message as any);
  if (tip) return <TipCard tip={tip} fromMe={fromMe} senderAddress={senderAddress ?? null} />;
  const nft = asNftSend(message as any);
  if (nft) return <NftCard nft={nft} fromMe={fromMe} senderAddress={senderAddress ?? null} />;

  const text = typeof message.content === 'string' ? message.content : null;
  const inline = isAttachment(message as any) ? (message.content as Attachment) : null;
  const remote = isRemoteAttachment(message as any) ? (message.content as RemoteAttachment) : null;

  if (!text && !inline && !remote) return null;

  const bubble = (
    <div className={`max-w-md px-4 py-2.5 rounded-bubble text-sm leading-relaxed break-words ${
      fromMe ? 'bg-bubble-outgoing text-brand-ink' : 'bg-bubble-incoming text-text-primary'
    }`}>
      {text && <div className="whitespace-pre-wrap">{text}</div>}
      {inline && <InlineImage attachment={inline} />}
      {remote && <RemoteImage remote={remote} />}
      <div className={`text-[10px] mt-1 ${fromMe ? 'text-white/60 text-right' : 'text-text-muted'}`}>
        {time}
      </div>
    </div>
  );

  if (fromMe) return <div className="flex justify-end">{bubble}</div>;

  // Group mode: gutter reserved for the avatar so a run of messages from the
  // same person stays aligned under their name.
  if (inGroup) {
    return (
      <div className="flex justify-start gap-2">
        <div className="w-7 shrink-0">
          {showSender && <SenderAvatar address={senderAddress ?? null} />}
        </div>
        <div className="min-w-0">
          {showSender && <SenderName address={senderAddress ?? null} inboxId={message.senderInboxId} />}
          {bubble}
        </div>
      </div>
    );
  }

  return <div className="flex justify-start">{bubble}</div>;
}

function SenderAvatar({ address }: { address: `0x${string}` | null }) {
  const { data: ensName } = useVerifiedEnsName({ address: address ?? undefined, query: { enabled: !!address } });
  const { data: avatar } = useEnsAvatar({
    name: ensName ? safeNormalize(ensName) : undefined,
    query: { enabled: !!ensName },
  });
  const fallback = (ensName ?? address ?? '?').replace(/^0x/, '')[0] ?? '?';
  return <Avatar src={avatar || undefined} fallback={fallback} size={28} />;
}

function SenderName({ address, inboxId }: { address: `0x${string}` | null; inboxId: string }) {
  const { data: ensName } = useVerifiedEnsName({ address: address ?? undefined, query: { enabled: !!address } });
  const label = ensName
    ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : `${inboxId.slice(0, 6)}…`);
  return <div className="font-mono text-[11px] text-text-muted mb-1 ml-1 truncate">{label}</div>;
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}

function InlineImage({ attachment }: { attachment: Attachment }) {
  const [url] = useState(() => {
    const blob = new Blob([new Uint8Array(attachment.content)], { type: attachment.mimeType });
    return URL.createObjectURL(blob);
  });
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={attachment.filename} className="rounded-xl max-h-80 max-w-full cursor-pointer" onClick={() => window.open(url, '_blank')} />;
}

function RemoteImage({ remote }: { remote: RemoteAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const buf = await fetchAttachment(remote.url);
        const decrypted = await decryptAttachment(new Uint8Array(buf), remote as any);
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(decrypted.content)], { type: decrypted.mimeType });
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e: any) {
        console.error('remote attachment load failed', e);
        if (!cancelled) setErr(e?.message ?? 'Failed to load image');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remote]);

  if (err) return <div className="text-xs opacity-80">⚠ Couldn't load image ({remote.filename})</div>;
  if (!url) return (
    <div className="flex items-center gap-2 text-xs opacity-80 py-6 px-2">
      <Loader2 size={14} className="animate-spin" /> Loading image…
    </div>
  );
  return <img src={url} alt={remote.filename} className="rounded-xl max-h-80 max-w-full cursor-pointer" onClick={() => window.open(url, '_blank')} />;
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">{children}</main>;
}
