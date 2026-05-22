import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';

const BASE = 'https://dmpay.eth.link';

export function shareUrlFor(idOrEns: string) {
  return `${BASE}/#/u/${idOrEns}`;
}

export function ShareProfile({
  idOrEns,
  displayName,
  variant = 'inline',
}: {
  idOrEns: string;
  displayName?: string;
  variant?: 'inline' | 'pill';
}) {
  const [copied, setCopied] = useState(false);
  const url = shareUrlFor(idOrEns);
  const tweet = encodeURIComponent(
    `My inbox is worth more than zero. Pay to DM me on @dmpayeth →\n\n${url}`
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: prompt
      window.prompt('Copy link', url);
    }
  }

  if (variant === 'pill') {
    return (
      <div className="inline-flex items-center gap-1 bg-bg-elevated border border-border-subtle rounded-full p-1">
        <button
          onClick={copy}
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary px-2.5 py-1 inline-flex items-center gap-1.5 rounded-full"
          title="Copy share link"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : `dmpay.eth.link/#/u/${idOrEns}`}</span>
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${tweet}`}
          target="_blank" rel="noreferrer"
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary px-2.5 py-1 inline-flex items-center gap-1.5 rounded-full"
          title="Share on X"
        >
          <Share2 size={12} /> Share on X
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={copy}
        className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover border border-border-subtle rounded-full px-3 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?text=${tweet}`}
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover border border-border-subtle rounded-full px-3 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary"
      >
        <Share2 size={12} /> Share on X on X
      </a>
      {displayName && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted self-center ml-1">
          dmpay.eth.link/#/u/{displayName}
        </span>
      )}
    </div>
  );
}
