import { useState } from 'react';
import { ExternalLink, Globe, Loader2 } from 'lucide-react';
import { segmentText, displayHost, firstUrl } from '../lib/links';
import { unfurl } from '../lib/unfurl';
import type { LinkPreviewContent } from '../lib/chatContent';

/**
 * Message text with its URLs made clickable, and the link preview card.
 *
 * Nothing here ever builds HTML from message content. `segmentText` returns
 * plain data and the anchors below are React elements, so a message containing
 * `<img onerror=…>` renders as those characters. Using dangerouslySetInnerHTML
 * on any of this would hand every sender script execution in the reader's
 * session — see the note at the top of lib/links.ts.
 */

function LinkedText({ text }: { text: string }) {
  const segments = segmentText(text);

  // Overwhelmingly the common case: keep it allocation-free.
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  return (
    <div className="whitespace-pre-wrap">
      {segments.map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            // noreferrer matters beyond the usual tab-hijacking reason: without
            // it the destination learns which page the click came from, and on
            // the Pages build that URL identifies the conversation.
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 decoration-current/40 hover:decoration-current break-all"
          >
            {segment.value}
          </a>
        ),
      )}
    </div>
  );
}

/**
 * The preview card itself.
 *
 * `image` is always a data URI baked in by the sender, so this renders with no
 * network request — the property the whole sender-side design exists to buy.
 */
function PreviewCard({ preview, fromMe }: { preview: Omit<LinkPreviewContent, 'text'>; fromMe: boolean }) {
  const host = preview.siteName || displayHost(preview.url);

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`mt-2 block rounded-xl overflow-hidden border transition-colors ${
        fromMe
          ? 'border-brand-ink/15 bg-brand-ink/5 hover:bg-brand-ink/10'
          : 'border-border-subtle bg-bg-base/50 hover:bg-bg-base'
      }`}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-full aspect-[1.91/1] object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="px-3 py-2.5 min-w-0">
        <div className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] truncate ${
          fromMe ? 'text-brand-ink/50' : 'text-text-faint'
        }`}>
          <Globe size={9} className="shrink-0" />
          <span className="truncate">{host}</span>
        </div>
        {preview.title && (
          <div className={`text-[12.5px] font-medium leading-snug mt-1 line-clamp-2 ${
            fromMe ? 'text-brand-ink' : 'text-text-primary'
          }`}>
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div className={`text-[11.5px] leading-snug mt-0.5 line-clamp-2 ${
            fromMe ? 'text-brand-ink/70' : 'text-text-secondary'
          }`}>
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}

/**
 * A plain text message: linkified, with an optional preview.
 *
 * When the message arrived without a preview — sent from Converse, or from a
 * DMpay client whose unfurl failed — the reader gets an explicit button rather
 * than an automatic fetch. Loading a preview reveals to this server that the
 * reader received that URL, so it stays their choice to make. That's the same
 * reasoning as sender-side unfurling, applied to the one case it can't cover.
 */
export function MessageText({ text, preview, fromMe }: {
  text: string;
  preview?: Omit<LinkPreviewContent, 'text'>;
  fromMe: boolean;
}) {
  const [loaded, setLoaded] = useState<Omit<LinkPreviewContent, 'text'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const shown = preview ?? loaded;
  const candidate = shown ? null : firstUrl(text);

  async function loadPreview(e: React.MouseEvent) {
    // The button sits inside a bubble; without this a click also hits anything
    // the bubble itself does.
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const result = await unfurl(candidate!);
    setLoading(false);
    if (result) setLoaded(result);
    else setFailed(true);
  }

  return (
    <>
      <LinkedText text={text} />
      {shown && <PreviewCard preview={shown} fromMe={fromMe} />}
      {candidate && !failed && (
        <button
          onClick={loadPreview}
          disabled={loading}
          className={`mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-60 ${
            fromMe ? 'text-brand-ink/50 hover:text-brand-ink/80' : 'text-text-faint hover:text-text-secondary'
          }`}
        >
          {loading
            ? <><Loader2 size={9} className="animate-spin" /> Loading preview</>
            : <><ExternalLink size={9} /> Load preview</>}
        </button>
      )}
    </>
  );
}
