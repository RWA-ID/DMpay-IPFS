import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, useReadContract } from 'wagmi';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Users, Loader2, AlertCircle, Clock, Pencil, ChevronDown } from 'lucide-react';
import type { Group } from '@xmtp/browser-sdk';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';
import {
  parseGroupTuple, bytes32ToXmtpId, xmtpIdKey, hasXmtpId, fetchGroupJoiners, seatPriceLabel, type OnchainGroup,
} from '../lib/groups';
import { ethIdentifier } from '../lib/xmtp';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { XmtpChat } from './XmtpChat';
import { GroupPaywall } from './GroupPaywall';
import { ShareGroup } from './ShareGroup';
import type { PublicGroupMeta } from '../lib/groupMeta';
import { GroupAvatar } from './GroupAvatar';
import { GroupSettings } from './GroupSettings';
import { GroupMembers } from './GroupMembers';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { usePublicGroupMeta } from '../hooks/useGroups';

export type GroupMeta = { name: string | null; imageUrl: string | null };

export function GroupView() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { client } = useXmtpClient();

  const id = parseGroupId(idParam);

  const { data: groupTuple, isLoading: groupLoading, refetch: refetchGroup } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'groups',
    args: id !== null ? [id] : undefined,
    query: { enabled: id !== null },
  });

  const { data: isMember, refetch: refetchMember } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'isGroupMember',
    args: id !== null && address ? [id, address] : undefined,
    query: { enabled: id !== null && !!address },
  });

  const group: OnchainGroup | null = parseGroupTuple(groupTuple as readonly unknown[] | undefined);
  const isCreator = !!address && !!group && group.creator.toLowerCase() === address.toLowerCase();

  const [meta, setMeta] = useState<GroupMeta>({ name: null, imageUrl: null });
  const [convo, setConvo] = useState<Group<unknown> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [unreachable, setUnreachable] = useState<number | null>(null);

  const { members, byInboxId, error: membersError, reload: reloadMembers } = useGroupMembers(convo);

  // The creator's public copy of the group's identity. It's all a non-member
  // has, and it's what a shared link renders before anyone connects.
  const creator = group?.creator;
  const forMeta = useMemo(
    () => (creator && id !== null ? [{ id, creator }] : null),
    [creator, id],
  );
  const publishedAll = usePublicGroupMeta(forMeta);
  const published = id !== null ? publishedAll.get(id.toString()) ?? null : null;

  const onReconciled = useCallback((result: { unreachable: number }) => {
    setUnreachable(result.unreachable);
    reloadMembers();
  }, [reloadMembers]);

  const onJoined = useCallback(() => {
    refetchMember();
    refetchGroup();
  }, [refetchMember, refetchGroup]);

  if (id === null) {
    return <Notice title="Invalid group link" body="That group id isn't a number." onBack={() => navigate('/inbox')} />;
  }

  if (groupLoading) {
    return <Centered><Loader2 className="animate-spin text-text-muted" /></Centered>;
  }

  if (!group || group.creator === '0x0000000000000000000000000000000000000000') {
    return <Notice title="Group not found" body={`No group with id ${id.toString()} exists on the DMpay contract.`} onBack={() => navigate('/inbox')} />;
  }

  // A shared link usually lands on a disconnected visitor. Show them what
  // they've been invited to rather than a bare connect button that duplicates
  // the one already in the top bar.
  if (!isConnected) {
    return <GroupPreview id={id} group={group} published={published} onConnect={() => openConnectModal?.()} />;
  }

  if (!group.active) {
    return <Notice title="Group closed" body="The creator has closed this group. Existing messages stay in your XMTP inbox." onBack={() => navigate('/inbox')} />;
  }

  const groupName = meta.name || published?.name || `Group #${id.toString()}`;

  return (
    <main className="flex-1 flex flex-col bg-bg-base min-h-0">
      <GroupHeader
        id={id}
        group={group}
        name={groupName}
        imageUrl={meta.imageUrl || published?.image || null}
        meta={meta}
        isCreator={isCreator}
        canEdit={isCreator && !!convo}
        onEdit={() => setSettingsOpen(true)}
        onBack={() => navigate('/inbox')}
        canShowMembers={!!convo}
        membersOpen={membersOpen}
        onToggleMembers={() => setMembersOpen(o => !o)}
      />
      {membersOpen && convo && (
        <GroupMembers
          members={members}
          error={membersError}
          creator={group.creator}
          me={address}
          onChainCount={group.memberCount}
          pendingCount={unreachable}
        />
      )}
      {settingsOpen && convo && (
        <GroupSettings
          id={id}
          convo={convo}
          initial={meta}
          onClose={() => setSettingsOpen(false)}
          onSaved={(m) => { setMeta(m); setSettingsOpen(false); }}
        />
      )}
      {isMember || isCreator ? (
        <GroupChat
          id={id}
          group={group}
          groupName={groupName}
          isCreator={isCreator}
          client={client}
          onMeta={setMeta}
          onConvo={setConvo}
          senderDirectory={byInboxId}
          onReconciled={onReconciled}
        />
      ) : (
        <GroupPaywall id={id} group={group} groupName={groupName} onJoined={onJoined} />
      )}
    </main>
  );
}

/**
 * Resolves the XMTP group behind an on-chain group, and — when the viewer is
 * the creator — admits anyone who has paid on-chain but isn't in the encrypted
 * group yet. XMTP has no way for a payer to add themselves, so the creator's
 * client is the reconciler; members appear once the creator opens the app.
 */
function GroupChat({ id, group, groupName, isCreator, client, onMeta, onConvo, senderDirectory, onReconciled }: {
  id: bigint;
  group: OnchainGroup;
  groupName: string;
  isCreator: boolean;
  client: ReturnType<typeof useXmtpClient>['client'];
  onMeta?: (meta: GroupMeta) => void;
  onConvo?: (convo: Group<unknown> | null) => void;
  senderDirectory?: Map<string, `0x${string}`>;
  onReconciled?: (result: { unreachable: number }) => void;
}) {
  const { init, initializing } = useXmtpClient();
  const [convo, setConvo] = useState<Group<unknown> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-linked' | 'not-admitted' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [admitting, setAdmitting] = useState(false);
  const [admitted, setAdmitted] = useState<number | null>(null);
  const reconciledRef = useRef(false);

  const linked = hasXmtpId(group.xmtpGroupId);

  useEffect(() => {
    if (!client) return;
    if (!linked) { setState('not-linked'); return; }
    let cancelled = false;
    (async () => {
      try {
        setState('loading');
        await client.conversations.sync().catch((e) => console.warn('conversations sync failed', e));
        const xmtpId = bytes32ToXmtpId(group.xmtpGroupId);
        let found = (await client.conversations.getConversationById(xmtpId)) as Group<unknown> | undefined;
        // Fallback: match against the joined group list in padded space, so a
        // change in how ids are encoded can't strand an existing group.
        if (!found) {
          const wanted = xmtpIdKey(group.xmtpGroupId);
          const all = await client.conversations.listGroups().catch(() => [] as Group<unknown>[]);
          found = all.find((g) => xmtpIdKey(g.id) === wanted);
        }
        if (cancelled) return;
        if (!found) {
          // Paid on-chain but the creator hasn't added this inbox to the
          // encrypted group yet.
          setState('not-admitted');
          return;
        }
        setConvo(found);
        onConvo?.(found);
        onMeta?.({
          name: ((found as any).name as string | undefined) || null,
          imageUrl: ((found as any).imageUrl as string | undefined) || null,
        });
        setState('ready');
      } catch (e: any) {
        console.error('group load failed', e);
        if (cancelled) return;
        setErrorMsg(e?.message ?? 'Failed to load group');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [client, group.xmtpGroupId, linked, onMeta, onConvo]);

  // Creator-side admission: add every on-chain joiner missing from the XMTP group.
  const reconcile = useCallback(async () => {
    if (!client || !convo || !isCreator || admitting) return;
    setAdmitting(true);
    let unreachableCount = 0;
    try {
      const joiners = await fetchGroupJoiners(id);
      if (joiners.length === 0) { setAdmitted(0); return; }

      const members = await convo.members();
      const known = new Set<string>();
      for (const m of members as any[]) {
        for (const ident of m.accountIdentifiers ?? []) {
          if (ident?.identifier) known.add(String(ident.identifier).toLowerCase());
        }
      }
      const missing = joiners.filter((a) => !known.has(a.toLowerCase()));
      if (missing.length === 0) { setAdmitted(0); return; }

      // Only add addresses that actually have an XMTP inbox — addMembers
      // rejects the whole batch if any identity is unreachable.
      const reachable = await client.canMessage(missing.map((a) => ethIdentifier(a)));
      const addable = missing.filter((a) => reachable.get(a.toLowerCase()) === true);
      unreachableCount = missing.length - addable.length;
      if (addable.length === 0) { setAdmitted(0); return; }

      await (convo as any).addMembersByIdentifiers(addable.map((a) => ethIdentifier(a)));
      setAdmitted(addable.length);
    } catch (e: any) {
      console.error('group reconcile failed', e);
      setErrorMsg(e?.message ?? 'Failed to add paid members');
    } finally {
      setAdmitting(false);
      // Always refresh the roster: even a no-op run confirms who is in.
      onReconciled?.({ unreachable: unreachableCount });
    }
  }, [client, convo, isCreator, id, admitting, onReconciled]);

  // Run once automatically when the creator opens the group.
  useEffect(() => {
    if (state !== 'ready' || !isCreator || reconciledRef.current) return;
    reconciledRef.current = true;
    reconcile();
  }, [state, isCreator, reconcile]);

  if (!client) {
    return (
      <Centered>
        <div className="text-text-primary font-medium mb-1">Connect to XMTP</div>
        <div className="text-text-secondary text-sm max-w-sm mb-4">
          Sign once to enable end-to-end encrypted messaging, then this group will open.
        </div>
        <button
          onClick={() => init()}
          disabled={initializing}
          className="bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3 font-medium"
        >
          {initializing ? 'Connecting…' : 'Connect XMTP'}
        </button>
      </Centered>
    );
  }

  if (state === 'loading') return <Centered><Loader2 className="animate-spin text-text-muted" /></Centered>;

  if (state === 'not-linked') {
    return (
      <Centered>
        <Clock className="text-text-muted mb-3" size={26} />
        <div className="text-text-primary font-medium mb-1">Group not linked yet</div>
        <div className="text-text-secondary text-sm max-w-sm">
          {isCreator
            ? 'The encrypted group was never linked on-chain. Re-run creation from “New group” — the link step (setGroupXmtpId) has to complete for members to find it.'
            : 'The creator hasn’t finished setting up the encrypted group. Check back shortly.'}
        </div>
      </Centered>
    );
  }

  if (state === 'not-admitted') {
    return (
      <Centered>
        <Clock className="text-text-muted mb-3" size={26} />
        <div className="text-text-primary font-medium mb-1">You're in — waiting on the creator</div>
        <div className="text-text-secondary text-sm max-w-sm">
          Your payment is confirmed on-chain. XMTP groups are invite-only, so the creator's client
          adds you the next time they open DMpay. This page will show the conversation once you're added.
        </div>
      </Centered>
    );
  }

  if (state === 'error') {
    return (
      <Centered>
        <AlertCircle className="text-red-400 mb-3" />
        <div className="text-text-primary font-medium mb-1">Couldn't open the group</div>
        <div className="text-text-secondary text-sm max-w-sm">{errorMsg}</div>
      </Centered>
    );
  }

  return (
    <>
      {isCreator && (
        <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between gap-3 text-xs">
          <span className="text-text-muted font-mono">
            {admitting
              ? 'Adding paid members…'
              : admitted === null
                ? 'You’re the creator — paid members are added automatically.'
                : admitted > 0
                  ? `Added ${admitted} paid member${admitted === 1 ? '' : 's'} — tap the member count to see the roster.`
                  : 'All paid members are in the group — tap the member count to see who.'}
          </span>
          <button
            onClick={reconcile}
            disabled={admitting}
            className="text-text-secondary hover:text-text-primary border border-border-subtle rounded-full px-3 py-1 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {admitting ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />} Sync members
          </button>
        </div>
      )}
      {convo && <XmtpChat conversation={convo} recipientName={groupName} senderDirectory={senderDirectory} />}
    </>
  );
}

function GroupHeader({ id, group, name, meta, imageUrl, isCreator, canEdit, onEdit, onBack, canShowMembers, membersOpen, onToggleMembers }: {
  id: bigint;
  group: OnchainGroup;
  name: string;
  /** Real name when the viewer is a member — drives the link slug. */
  meta: GroupMeta;
  imageUrl: string | null;
  isCreator: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onBack: () => void;
  canShowMembers: boolean;
  membersOpen: boolean;
  onToggleMembers: () => void;
}) {
  return (
    <header className="flex items-center gap-3 p-4 border-b border-border-subtle">
      <button
        onClick={onBack}
        className="md:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover"
        aria-label="Back to inbox"
      >
        <ArrowLeft size={20} />
      </button>
      <GroupAvatar src={imageUrl} seed={id.toString()} name={name} size={40} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{name}</div>
        {canShowMembers ? (
          <button
            onClick={onToggleMembers}
            className="text-xs text-text-secondary hover:text-text-primary truncate inline-flex items-center gap-1"
            title={membersOpen ? 'Hide members' : 'Show members'}
          >
            {group.memberCount.toString()}
            {group.capacity > 0n ? ` / ${group.capacity.toString()}` : ''} members
            {isCreator ? ' · you created this' : ''}
            <ChevronDown size={12} className={membersOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        ) : (
          <div className="text-xs text-text-secondary truncate">
            {group.memberCount.toString()}
            {group.capacity > 0n ? ` / ${group.capacity.toString()}` : ''} members
            {isCreator ? ' · you created this' : ''}
          </div>
        )}
      </div>
      {canEdit && (
        <button
          onClick={onEdit}
          className="font-mono text-[11px] text-text-secondary hover:text-text-primary border border-border-subtle rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 shrink-0"
          title="Edit group name and image"
        >
          <Pencil size={11} /> Edit
        </button>
      )}
      <ShareGroup id={id} name={meta.name} price={seatPriceLabel(group)} variant="pill" />
    </header>
  );
}

function Notice({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <Centered>
      <AlertCircle className="text-text-muted mb-3" size={26} />
      <div className="text-text-primary font-medium mb-1">{title}</div>
      <div className="text-text-secondary text-sm max-w-sm mb-6">{body}</div>
      <button onClick={onBack} className="bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-2xl px-5 py-2.5 font-medium text-sm">
        Back to inbox
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">{children}</main>;
}

/**
 * What a shared group link shows before the visitor connects: the terms they're
 * being offered, from chain state alone. The name and image can't appear here —
 * they live in the encrypted XMTP group and only members can read them.
 */
function GroupPreview({ id, group, published, onConnect }: {
  id: bigint;
  group: OnchainGroup;
  published: PublicGroupMeta | null;
  onConnect: () => void;
}) {
  const { data: creatorEns } = useVerifiedEnsName({ address: group.creator });
  const creatorLabel = creatorEns ?? `${group.creator.slice(0, 6)}…${group.creator.slice(-4)}`;
  const full = group.capacity > 0n && group.memberCount >= group.capacity;
  const price = seatPriceLabel(group);

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-lg mx-auto px-6 py-12">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted mb-4">
          · You've been invited to a paid group
        </div>

        <div className="bg-bg-panel border border-border-subtle rounded-3xl p-7">
          <div className="flex items-start gap-4">
            <GroupAvatar src={published?.image} seed={id.toString()} name={published?.name} size={56} />
            <div className="min-w-0 flex-1">
              <h1 className="dm-display text-3xl text-text-primary leading-tight break-words">
                {published?.name || `Group #${id.toString()}`}
              </h1>
              <div className="font-mono text-[12px] text-text-muted mt-1.5 truncate">by {creatorLabel}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-7">
            <div className="bg-bg-elevated rounded-2xl p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Per seat</div>
              <div className="dm-display font-mono text-2xl text-text-primary mt-1.5">{price ?? 'Free'}</div>
            </div>
            <div className="bg-bg-elevated rounded-2xl p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Members</div>
              <div className="dm-display font-mono text-2xl text-text-primary mt-1.5">
                {group.memberCount.toString()}
                {group.capacity > 0n && (
                  <span className="text-text-muted text-base"> / {group.capacity.toString()}</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onConnect}
            disabled={full}
            className="w-full mt-5 bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-4 font-medium"
          >
            {full ? 'This group is full' : 'Connect wallet to join'}
          </button>

          <div className="text-[11px] text-text-muted mt-4 leading-relaxed">
            Pay once for a seat — 97.5% settles directly to the creator, 2.5% protocol fee, no custody.
            The conversation is an end-to-end encrypted XMTP group.{' '}
            {published
              ? 'Its name and image here are the creator\u2019s public copy, published on their ENS name.'
              : 'Its name and image are readable only once you\u2019re a member.'}
          </div>
        </div>

        <div className="mt-6">
          <ShareGroup id={id} name={published?.name} price={price} />
        </div>
      </div>
    </main>
  );
}

/**
 * Accepts a bare id ("0") or an id with a descriptive slug ("0-alpha-leaks-chat").
 * The slug exists only to make a shared link self-describing; it is ignored
 * here, so renaming a group never invalidates a link already in the wild.
 */
function parseGroupId(raw: string | undefined): bigint | null {
  const match = raw?.match(/^(\d+)(?:-.*)?$/);
  if (!match) return null;
  try { return BigInt(match[1]); } catch { return null; }
}
