import { API_URL } from './site';

export type OwnedNft = {
  contract: `0x${string}`;
  tokenId: string;
  standard: 'erc721' | 'erc1155';
  name: string | null;
  collection: string | null;
  image: string | null;
};

export type NftPage = { nfts: OwnedNft[]; cursor: string | null };

/**
 * What the owner holds, via the Pages proxy (functions/api/nfts.js).
 *
 * Read-only and optional. Sending an NFT goes wallet → NFT contract and never
 * touches this, so a failure here costs the user the grid, not the feature.
 */
export async function fetchOwnedNfts(
  address: `0x${string}`,
  opts: { cursor?: string | null; signal?: AbortSignal } = {},
): Promise<NftPage> {
  const url = new URL(`${API_URL}/api/nfts`);
  url.searchParams.set('address', address);
  if (opts.cursor) url.searchParams.set('cursor', opts.cursor);

  const res = await fetch(url, { signal: opts.signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Could not load NFTs (${res.status})`);
  return { nfts: body.nfts ?? [], cursor: body.cursor ?? null };
}

/** Stable identity for an NFT across pages — contract alone isn't unique. */
export const nftKey = (n: Pick<OwnedNft, 'contract' | 'tokenId'>) =>
  `${n.contract.toLowerCase()}:${n.tokenId}`;

/**
 * Shared by the picker (nulls, straight from the proxy) and the chat card
 * (undefined, since absent fields are omitted from the wire payload).
 */
export function nftTitle(n: { name?: string | null; collection?: string | null; tokenId: string }): string {
  if (n.name) return n.name;
  if (n.collection) return `${n.collection} #${n.tokenId}`;
  return `#${n.tokenId}`;
}
