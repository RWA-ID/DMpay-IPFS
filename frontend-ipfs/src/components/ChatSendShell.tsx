import { X } from 'lucide-react';
import { useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { Avatar } from './Avatar';

/**
 * Shared frame for the tip and NFT composers, plus the "who is this for?" step.
 *
 * A DM has one possible target, so that step is skipped entirely. A group has
 * no address of its own — you can't tip a group or transfer an NFT to one —
 * so a member has to be chosen before anything else makes sense.
 */

export function SendModal({ title, kicker, onClose, children }: {
  title: string;
  kicker: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-panel border border-border-subtle rounded-3xl shadow-pop my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border-subtle">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted mb-1">{kicker}</div>
            <h3 className="dm-display text-xl text-text-primary">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 -mt-0.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function TargetRow({ address }: { address: `0x${string}` }) {
  const { data: ensName } = useVerifiedEnsName({ address });
  const { data: avatar } = useEnsAvatar({
    name: ensName ? safeNormalize(ensName) : undefined,
    query: { enabled: !!ensName },
  });
  const label = ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar src={avatar || undefined} fallback={label[0] ?? '?'} size={28} />
      <span className="text-sm text-text-primary truncate">{label}</span>
    </div>
  );
}

/** Member chooser for group mode. Renders nothing when there's only one option. */
export function TargetPicker({ candidates, value, onChange }: {
  candidates: `0x${string}`[];
  value: `0x${string}` | null;
  onChange: (a: `0x${string}`) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="text-sm text-text-muted mb-5">
        No other members have published an address yet, so there's nobody to send to.
      </div>
    );
  }

  return (
    <div className="mb-5">
      <FieldLabel>To</FieldLabel>
      <div className="max-h-44 overflow-y-auto rounded-2xl border border-border-subtle divide-y divide-border-subtle">
        {candidates.map((addr) => (
          <button
            key={addr}
            onClick={() => onChange(addr)}
            className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
              value?.toLowerCase() === addr.toLowerCase() ? 'bg-bg-hover' : 'hover:bg-bg-elevated'
            }`}
          >
            <TargetRow address={addr} />
            <span
              className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                value?.toLowerCase() === addr.toLowerCase()
                  ? 'bg-brand border-brand'
                  : 'border-border-strong'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-2">{children}</div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl px-3 py-2.5 leading-relaxed break-words">
      {children}
    </div>
  );
}

function safeNormalize(name: string) {
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
}
