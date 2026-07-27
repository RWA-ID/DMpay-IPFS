import { useCallback, useEffect, useState } from 'react';
import type { Group } from '@xmtp/browser-sdk';

export type GroupMember = {
  inboxId: string;
  /** Ethereum address behind the inbox, when the member published one. */
  address: `0x${string}` | null;
};

/**
 * Roster of an XMTP group: who can actually decrypt the conversation. This is
 * the encrypted-group truth, which can lag the on-chain member count until the
 * creator's client admits everyone who paid.
 */
export function useGroupMembers(convo: Group<unknown> | null) {
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!convo) { setMembers(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const raw = await convo.members();
        if (cancelled) return;
        setMembers((raw as any[]).map((m) => ({
          inboxId: String(m.inboxId),
          address: pickEthAddress(m),
        })));
        setError(null);
      } catch (e: any) {
        console.error('group members fetch failed', e);
        if (!cancelled) setError(e?.message ?? 'Failed to load members');
      }
    })();
    return () => { cancelled = true; };
  }, [convo, reloadKey]);

  /** inboxId -> address, for labelling message senders. */
  const byInboxId = new Map<string, `0x${string}`>();
  for (const m of members ?? []) {
    if (m.address) byInboxId.set(m.inboxId, m.address);
  }

  return { members, byInboxId, error, reload };
}

function pickEthAddress(member: any): `0x${string}` | null {
  for (const ident of member?.accountIdentifiers ?? []) {
    const value = ident?.identifier;
    if (typeof value === 'string' && value.startsWith('0x')) return value as `0x${string}`;
  }
  return null;
}
