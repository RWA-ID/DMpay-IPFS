import { getAbiItem } from 'viem';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from './contracts';
import { logsClient, DMPAY_V2_DEPLOY_BLOCK } from './logs';

const groupCreatedEvent = getAbiItem({ abi: dmpayDirectAbi, name: 'GroupCreated' });
const groupXmtpIdSetEvent = getAbiItem({ abi: dmpayDirectAbi, name: 'GroupXmtpIdSet' });
const groupJoinedEvent = getAbiItem({ abi: dmpayDirectAbi, name: 'GroupJoined' });

/** Shape of the contract's `groups(id)` getter. */
export type OnchainGroup = {
  creator: `0x${string}`;
  priceUsdc: bigint;
  priceEth: bigint;
  capacity: bigint;
  memberCount: bigint;
  active: boolean;
  xmtpGroupId: `0x${string}`;
};

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** wagmi returns the getter as a positional tuple; name the fields. */
export function parseGroupTuple(t: readonly unknown[] | undefined): OnchainGroup | null {
  if (!t || t.length < 7) return null;
  return {
    creator: t[0] as `0x${string}`,
    priceUsdc: t[1] as bigint,
    priceEth: t[2] as bigint,
    capacity: t[3] as bigint,
    memberCount: t[4] as bigint,
    active: t[5] as boolean,
    xmtpGroupId: t[6] as `0x${string}`,
  };
}

/**
 * XMTP group ids are **16-byte** hex strings (32 chars, no `0x`) — not 32-byte.
 * CreateGroup stores them on-chain as bytes32 via padStart(64,'0'), so the
 * chain value carries 32 leading zeros that are not part of the id.
 */
const XMTP_ID_HEX_LEN = 32;

export function xmtpIdToBytes32(id: string): `0x${string}` {
  const hex = id.startsWith('0x') ? id.slice(2) : id;
  const trimmed = hex.length > 64 ? hex.slice(0, 64) : hex.padStart(64, '0');
  return `0x${trimmed}` as `0x${string}`;
}

/** Inverse of xmtpIdToBytes32: drop the zero padding the encoder added. */
export function bytes32ToXmtpId(b: `0x${string}`): string {
  const hex = (b.startsWith('0x') ? b.slice(2) : b).toLowerCase();
  const stripped = hex.replace(/^0+/, '');
  // Re-pad to the natural width so ids that genuinely start with a zero nibble
  // aren't truncated by the strip above.
  return stripped.length <= XMTP_ID_HEX_LEN
    ? stripped.padStart(XMTP_ID_HEX_LEN, '0')
    : stripped.padStart(64, '0');
}

/**
 * Canonical key for comparing an XMTP id with an on-chain bytes32. Normalising
 * *up* into padded space is lossless, so equality never depends on guessing how
 * wide the original id was.
 */
export function xmtpIdKey(idOrBytes32: string): string {
  return xmtpIdToBytes32(idOrBytes32).slice(2).toLowerCase();
}

export function hasXmtpId(b: `0x${string}` | undefined): boolean {
  return !!b && b !== ZERO_BYTES32;
}

/**
 * Map XMTP group id -> on-chain group id, so the inbox can turn an XMTP group
 * conversation into a /g/:id link. Built from GroupXmtpIdSet logs (the only
 * place the linkage is published).
 */
export async function fetchXmtpIdToGroupId(): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();
  try {
    const logs = await logsClient.getLogs({
      address: DMPAY_DIRECT_ADDRESS,
      event: groupXmtpIdSetEvent,
      fromBlock: DMPAY_V2_DEPLOY_BLOCK,
      toBlock: 'latest',
    });
    for (const log of logs) {
      const args = log.args;
      if (args?.id === undefined || !args.xmtpGroupId) continue;
      // Later events win — a creator can re-link a group.
      map.set(xmtpIdKey(args.xmtpGroupId), args.id);
    }
  } catch (e) {
    console.warn('GroupXmtpIdSet scan failed', e);
  }
  return map;
}

/** A group as a third party can see it: on-chain state plus its id. */
export type PublicGroup = OnchainGroup & { id: bigint; createdBlock: bigint };

/**
 * Every group ever created, newest first — optionally narrowed to one creator
 * (`creator` is an indexed topic, so that filter costs the node nothing).
 *
 * The GroupCreated log only carries the terms at creation time; price,
 * memberCount and `active` all change afterwards, so each id is re-read from
 * the `groups` getter in one multicall.
 */
export async function fetchPublicGroups(opts?: { creator?: `0x${string}` }): Promise<PublicGroup[]> {
  const logs = await logsClient.getLogs({
    address: DMPAY_DIRECT_ADDRESS,
    event: groupCreatedEvent,
    args: opts?.creator ? { creator: opts.creator } : undefined,
    fromBlock: DMPAY_V2_DEPLOY_BLOCK,
    toBlock: 'latest',
  });

  const ids: bigint[] = [];
  const createdBlock = new Map<string, bigint>();
  for (const log of logs) {
    const id = log.args?.id;
    if (id === undefined) continue;
    const key = id.toString();
    if (createdBlock.has(key)) continue;
    createdBlock.set(key, log.blockNumber ?? 0n);
    ids.push(id);
  }
  if (ids.length === 0) return [];

  const results = await logsClient.multicall({
    contracts: ids.map((id) => ({
      address: DMPAY_DIRECT_ADDRESS,
      abi: dmpayDirectAbi,
      functionName: 'groups',
      args: [id],
    } as const)),
  });

  const out: PublicGroup[] = [];
  ids.forEach((id, i) => {
    const r = results[i];
    if (r.status !== 'success') return;
    const parsed = parseGroupTuple(r.result as unknown as readonly unknown[]);
    if (!parsed) return;
    out.push({ ...parsed, id, createdBlock: createdBlock.get(id.toString()) ?? 0n });
  });
  return out.sort((a, b) => Number(b.createdBlock - a.createdBlock));
}

/** Addresses that have paid to join `id` on-chain (for creator-side admission). */
export async function fetchGroupJoiners(id: bigint): Promise<`0x${string}`[]> {
  try {
    const logs = await logsClient.getLogs({
      address: DMPAY_DIRECT_ADDRESS,
      event: groupJoinedEvent,
      args: { id },
      fromBlock: DMPAY_V2_DEPLOY_BLOCK,
      toBlock: 'latest',
    });
    const seen = new Set<string>();
    const out: `0x${string}`[] = [];
    for (const log of logs) {
      const member = log.args?.member;
      if (!member) continue;
      const key = member.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(member);
    }
    return out;
  } catch (e) {
    console.warn('GroupJoined scan failed', e);
    return [];
  }
}
