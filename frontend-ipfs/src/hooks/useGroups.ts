import { useEffect, useMemo, useState } from 'react';
import type { Group } from '@xmtp/browser-sdk';
import { fetchPublicGroups, xmtpIdKey, type PublicGroup } from '../lib/groups';
import { fetchPublicGroupMeta, type PublicGroupMeta } from '../lib/groupMeta';
import { useXmtpClient } from './useXmtpClient';

export type GroupMetaMap = Map<string, { name: string | null; imageUrl: string | null }>;

/**
 * Groups readable from chain alone. Pass a creator to list one profile's
 * groups (indexed topic — cheap); omit it for the global Discover feed.
 */
export function usePublicGroups(creator?: `0x${string}`, enabled = true) {
  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setGroups(null);
    setError(null);
    (async () => {
      try {
        const list = await fetchPublicGroups(creator ? { creator } : undefined);
        if (!cancelled) setGroups(list);
      } catch (e: any) {
        console.error('group scan failed', e);
        if (!cancelled) {
          setError(e?.shortMessage ?? e?.message ?? 'Failed to load groups');
          setGroups([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [creator, enabled]);

  return { groups, error };
}

export type PublicMetaMap = Map<string, PublicGroupMeta>;

/**
 * Metadata the creators published to their ENS names, keyed by group id. This
 * is the only group identity a non-member can see, so every public listing
 * falls back to it. Groups are bucketed by creator so each ENS name is
 * verified once, not once per group.
 */
export function usePublicGroupMeta(
  groups: { id: bigint; creator: `0x${string}` }[] | null,
): PublicMetaMap {
  const [meta, setMeta] = useState<PublicMetaMap>(new Map());

  // Stable identity for the effect: creator -> ids, as a plain string.
  const buckets = useMemo(() => {
    const byCreator = new Map<`0x${string}`, string[]>();
    for (const g of groups ?? []) {
      const list = byCreator.get(g.creator) ?? [];
      list.push(g.id.toString());
      byCreator.set(g.creator, list);
    }
    return byCreator;
  }, [groups]);
  const key = useMemo(
    () => [...buckets.entries()].map(([c, ids]) => `${c}:${ids.join(',')}`).sort().join('|'),
    [buckets],
  );

  useEffect(() => {
    if (buckets.size === 0) { setMeta(new Map()); return; }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        [...buckets.entries()].map(([creator, ids]) => fetchPublicGroupMeta(creator, ids)),
      );
      if (cancelled) return;
      const merged: PublicMetaMap = new Map();
      for (const r of results) for (const [id, m] of r) merged.set(id, m);
      setMeta(merged);
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return meta;
}

/**
 * Name and image for the groups the viewer already belongs to, keyed by
 * `xmtpIdKey` so it matches an on-chain `xmtpGroupId` directly.
 *
 * XMTP group metadata is encrypted to members and has no public copy, so a
 * listing can only show the real name/image to someone already inside the
 * group. Everyone else gets the id and the deterministic gradient.
 */
export function useLocalGroupMeta(): GroupMetaMap {
  const { client } = useXmtpClient();
  const [meta, setMeta] = useState<GroupMetaMap>(new Map());

  useEffect(() => {
    if (!client) { setMeta(new Map()); return; }
    let cancelled = false;
    (async () => {
      try {
        await client.conversations.sync().catch(() => {});
        const groups = (await client.conversations.listGroups()) as Group<unknown>[];
        if (cancelled) return;
        const next: GroupMetaMap = new Map();
        for (const g of groups) {
          next.set(xmtpIdKey(g.id), {
            name: ((g as any).name as string | undefined) || null,
            imageUrl: ((g as any).imageUrl as string | undefined) || null,
          });
        }
        setMeta(next);
      } catch (e) {
        console.warn('local group metadata scan failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  return meta;
}
