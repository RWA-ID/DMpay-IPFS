import { getAbiItem } from 'viem';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from './contracts';
import { logsClient, DMPAY_V2_DEPLOY_BLOCK } from './logs';

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
 * XMTP group ids are 32-byte hex strings with no `0x`. CreateGroup stores them
 * on-chain as bytes32 via padStart(64,'0'); these two are its inverse pair.
 */
export function xmtpIdToBytes32(id: string): `0x${string}` {
  const hex = id.startsWith('0x') ? id.slice(2) : id;
  const trimmed = hex.length > 64 ? hex.slice(0, 64) : hex.padStart(64, '0');
  return `0x${trimmed}` as `0x${string}`;
}

export function bytes32ToXmtpId(b: `0x${string}`): string {
  return b.startsWith('0x') ? b.slice(2) : b;
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
      map.set(bytes32ToXmtpId(args.xmtpGroupId).toLowerCase(), args.id);
    }
  } catch (e) {
    console.warn('GroupXmtpIdSet scan failed', e);
  }
  return map;
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
