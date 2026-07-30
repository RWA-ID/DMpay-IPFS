import { useEnsAvatar } from 'wagmi';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { normalize } from 'viem/ens';
import { Loader2, Crown, Clock } from 'lucide-react';
import { Avatar } from './Avatar';
import type { GroupMember } from '../hooks/useGroupMembers';

/**
 * Who can actually read the group. The XMTP roster is the real answer — the
 * on-chain memberCount runs ahead of it whenever someone has paid but the
 * creator's client hasn't admitted them yet, so both numbers are shown.
 */
export function GroupMembers({ members, error, creator, me, onChainCount, pendingCount }: {
  members: GroupMember[] | null;
  error?: string | null;
  creator: `0x${string}`;
  me?: `0x${string}`;
  onChainCount: bigint;
  pendingCount?: number | null;
}) {
  if (error) {
    return <div className="px-4 py-3 text-sm text-danger">{error}</div>;
  }
  if (members === null) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-text-secondary text-sm font-mono">
        <Loader2 className="animate-spin" size={14} /> Loading members…
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between mb-2.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">
          In the group · {members.length}
        </div>
        {onChainCount > BigInt(members.length) && (
          <div className="font-mono text-[10.5px] text-text-muted inline-flex items-center gap-1">
            <Clock size={10} /> {(onChainCount - BigInt(members.length)).toString()} paid, awaiting admission
          </div>
        )}
      </div>
      <div className="divide-y divide-border-subtle">
        {members.map(m => (
          <MemberRow
            key={m.inboxId}
            member={m}
            isCreator={!!m.address && m.address.toLowerCase() === creator.toLowerCase()}
            isMe={!!m.address && !!me && m.address.toLowerCase() === me.toLowerCase()}
          />
        ))}
      </div>
      {pendingCount != null && pendingCount > 0 && (
        <div className="text-[11px] text-text-muted mt-2.5 leading-snug">
          {pendingCount} payer{pendingCount === 1 ? '' : 's'} can't be added yet — they haven't activated XMTP
          from any client. They'll join automatically on the next sync once they do.
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, isCreator, isMe }: {
  member: GroupMember;
  isCreator: boolean;
  isMe: boolean;
}) {
  const { data: ensName } = useVerifiedEnsName({
    address: member.address ?? undefined,
    query: { enabled: !!member.address },
  });
  const { data: avatar } = useEnsAvatar({
    name: ensName ? safeNormalize(ensName) : undefined,
    query: { enabled: !!ensName },
  });
  const label = ensName
    ?? (member.address
      ? `${member.address.slice(0, 6)}…${member.address.slice(-4)}`
      : `${member.inboxId.slice(0, 10)}…`);

  return (
    <div className="flex items-center gap-2.5 py-2">
      <Avatar src={avatar || undefined} fallback={label[0]} size={28} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[13px] text-text-primary truncate">{label}</div>
        {ensName && member.address && (
          <div className="font-mono text-[10.5px] text-text-muted truncate">
            {member.address.slice(0, 6)}…{member.address.slice(-4)}
          </div>
        )}
      </div>
      {isMe && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] bg-chip text-chip-ink rounded-full px-2 py-0.5 shrink-0">
          You
        </span>
      )}
      {isCreator && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] bg-brand-soft text-brand rounded-full px-2 py-0.5 shrink-0 inline-flex items-center gap-1">
          <Crown size={9} /> Creator
        </span>
      )}
    </div>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
