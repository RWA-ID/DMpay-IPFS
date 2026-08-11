import { useNavigate } from 'react-router-dom';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { GroupAvatar } from './GroupAvatar';
import { hasXmtpId, xmtpIdKey, seatPrices, type PublicGroup } from '../lib/groups';
import { AssetAmount } from './AssetMark';
import { groupPath } from '../lib/site';
import type { GroupMetaMap, PublicMetaMap } from '../hooks/useGroups';

/**
 * One paid group, as seen from outside. Name and image come from XMTP group
 * metadata, which is member-only — non-members see the id plus the gradient
 * derived from it, which is still a stable visual identity.
 */
export function GroupCard({ group, meta, publicMeta, showCreator = true }: {
  group: PublicGroup;
  meta?: GroupMetaMap;
  publicMeta?: PublicMetaMap;
  showCreator?: boolean;
}) {
  const navigate = useNavigate();
  const { data: ensName } = useVerifiedEnsName({ address: group.creator, query: { enabled: showCreator } });

  // Membership beats publication: the XMTP metadata is what the group actually
  // is, the ENS record is the creator's public copy of it, which can lag.
  const fromXmtp = meta?.get(xmtpIdKey(group.xmtpGroupId));
  const published = publicMeta?.get(group.id.toString());
  const known = {
    name: fromXmtp?.name || published?.name || null,
    imageUrl: fromXmtp?.imageUrl || published?.image || null,
  };
  const name = known.name || `Group #${group.id.toString()}`;
  const creatorLabel = ensName ?? `${group.creator.slice(0, 6)}…${group.creator.slice(-4)}`;
  const full = group.capacity > 0n && group.memberCount >= group.capacity;
  const linked = hasXmtpId(group.xmtpGroupId);
  const prices = seatPrices(group);

  return (
    <button
      onClick={() => navigate(groupPath(group.id, known.name))}
      className="bg-bg-panel border border-border-subtle rounded-2xl p-5 text-left hover:bg-bg-elevated transition-colors flex flex-col gap-4 min-h-[200px]"
    >
      <div className="flex items-start gap-3">
        <GroupAvatar src={known.imageUrl} seed={group.id.toString()} name={known.name} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-text-primary truncate">{name}</div>
          {showCreator ? (
            <div className="font-mono text-[11px] text-text-muted mt-0.5 truncate">by {creatorLabel}</div>
          ) : (
            <div className="font-mono text-[11px] text-text-muted mt-0.5">#{group.id.toString()}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="font-mono text-[10.5px] bg-chip text-chip-ink rounded-full px-2.5 py-1 inline-flex items-center gap-1">
          <Users size={10} />
          {group.memberCount.toString()}{group.capacity > 0n ? ` / ${group.capacity.toString()}` : ''} members
        </span>
        {!group.active && (
          <span className="font-mono text-[10.5px] rounded-full px-2.5 py-1 bg-bg-elevated text-text-muted border border-border-subtle">
            Closed
          </span>
        )}
        {group.active && full && (
          <span className="font-mono text-[10.5px] rounded-full px-2.5 py-1 bg-bg-elevated text-text-muted border border-border-subtle">
            Full
          </span>
        )}
        {!linked && (
          <span className="font-mono text-[10.5px] rounded-full px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Setup incomplete
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Per seat</div>
          {/* Every asset the seat is priced in, each with its mark — matching
              the creator cards on the same page. */}
          <div className="flex items-center gap-3 flex-wrap mt-1 text-[15px] font-medium text-text-primary">
            {prices.length === 0
              ? <span className="font-mono">Free</span>
              : prices.map((p) => <AssetAmount key={p.asset} asset={p.asset} amount={p.amount} />)}
          </div>
        </div>
        <div className="flex items-center gap-1 text-text-muted shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{group.active && !full ? 'Join' : 'View'}</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </button>
  );
}

/** Grid of group cards with the loading / error / empty states shared by both listings. */
export function GroupGrid({ groups, meta, publicMeta, error, empty, showCreator = true, loadingLabel = 'Loading groups…' }: {
  groups: PublicGroup[] | null;
  meta?: GroupMetaMap;
  publicMeta?: PublicMetaMap;
  error?: string | null;
  empty: React.ReactNode;
  showCreator?: boolean;
  loadingLabel?: string;
}) {
  if (error) {
    return <div className="bg-bg-panel border border-danger/30 text-danger rounded-2xl p-4 text-sm">{error}</div>;
  }
  if (groups === null) {
    return (
      <div className="flex items-center gap-2 text-text-secondary text-sm font-mono">
        <Loader2 className="animate-spin" size={14} /> {loadingLabel}
      </div>
    );
  }
  if (groups.length === 0) return <>{empty}</>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {groups.map(g => (
        <GroupCard key={g.id.toString()} group={g} meta={meta} publicMeta={publicMeta} showCreator={showCreator} />
      ))}
    </div>
  );
}
