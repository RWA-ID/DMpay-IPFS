import { useState } from 'react';
import { Copy, Check, Share2, Link2 } from 'lucide-react';
import { groupUrl, groupLabel } from '../lib/site';

/**
 * Copy / share controls for a paid group. The name is only used to decorate
 * the URL and the post text — a viewer who isn't a member can't read it from
 * the encrypted group, so the sharer supplies it.
 */
export function ShareGroup({ id, name, price, variant = 'inline' }: {
  id: bigint;
  /** Group name, when the sharer's client knows it. */
  name?: string | null;
  /** Human-readable price, e.g. "$0.50" — included in the post when present. */
  price?: string | null;
  variant?: 'inline' | 'pill';
}) {
  const [copied, setCopied] = useState(false);
  const url = groupUrl(id, name);
  const label = groupLabel(id, name);

  const post = encodeURIComponent(
    [
      name ? `I'm running "${name}" as a paid group chat on @dmpayeth.` : `I'm running a paid group chat on @dmpayeth.`,
      price ? `${price} for a seat — pay once, you're in.` : 'Pay once for a seat.',
      'End-to-end encrypted on XMTP, settled on Ethereum.',
      '',
      url,
    ].join('\n')
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy group link', url);
    }
  }

  if (variant === 'pill') {
    return (
      <div className="inline-flex items-center gap-1 bg-bg-elevated border border-border-subtle rounded-full p-1 shrink-0">
        <button
          onClick={copy}
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary px-2.5 py-1 inline-flex items-center gap-1.5 rounded-full"
          title={`Copy ${label}`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Invite'}</span>
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${post}`}
          target="_blank" rel="noreferrer"
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary px-2.5 py-1 inline-flex items-center gap-1.5 rounded-full"
          title="Share on X"
        >
          <Share2 size={12} /> Share
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={copy}
        className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover border border-border-subtle rounded-full px-3 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Link copied' : 'Copy group link'}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?text=${post}`}
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover border border-border-subtle rounded-full px-3 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary"
      >
        <Share2 size={12} /> Share on X
      </a>
      <span className="font-mono text-[10.5px] text-text-muted inline-flex items-center gap-1.5 min-w-0">
        <Link2 size={11} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}
