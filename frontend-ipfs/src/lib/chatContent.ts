import { formatEther, formatUnits } from 'viem';
import type { ContentCodec, ContentTypeId, EncodedContent } from '@xmtp/content-type-primitives';

/**
 * DMpay's own XMTP content types: a tip and an NFT send.
 *
 * Both are *receipts*, not instructions. The transaction is already mined by
 * the time the message is sent — nothing here moves value, and a client that
 * renders one of these cards is reporting on-chain history, not authorising
 * anything. That matters because a message is just bytes from a peer: anyone
 * can craft one claiming any amount. See `verifyTip` / `verifyNftSend` in
 * chatReceipts.ts for the check that turns a claim into a confirmed card.
 *
 * `fallback` is what every other XMTP client shows — Converse, Coinbase Wallet,
 * xmtp.chat all lack these codecs. It has to stand alone as a readable
 * sentence, because for those users it *is* the message.
 */

const AUTHORITY = 'dmpay.eth';

export const ContentTypeTip: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'tip',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeNftSend: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'nft-send',
  versionMajor: 1,
  versionMinor: 0,
};

export type TipAsset = 'USDC' | 'ETH';

export type TipContent = {
  /** The DMPayDirectV2.payMessage* transaction this card reports. */
  txHash: `0x${string}`;
  asset: TipAsset;
  /** Gross amount paid, in base units (USDC 6dp, ETH wei), as a decimal string. */
  amount: string;
  from: `0x${string}`;
  to: `0x${string}`;
  note?: string;
};

export type NftSendContent = {
  /** The safeTransferFrom transaction this card reports. */
  txHash: `0x${string}`;
  contract: `0x${string}`;
  tokenId: string;
  standard: 'erc721' | 'erc1155';
  name?: string;
  collection?: string;
  /** Already-resolved https image URL. Never ipfs:// — the renderer does no gateway work. */
  image?: string;
  from: `0x${string}`;
  to: `0x${string}`;
};

/** Human amount for display: "5" USDC, "0.01" ETH. */
export function formatTipAmount(content: Pick<TipContent, 'amount' | 'asset'>): string {
  try {
    const raw = BigInt(content.amount);
    return content.asset === 'USDC' ? formatUnits(raw, 6) : formatEther(raw);
  } catch {
    return '0';
  }
}

export const txUrl = (hash: string) => `https://etherscan.io/tx/${hash}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonCodec<T>(contentType: ContentTypeId, fallback: (c: T) => string): ContentCodec<T> {
  return {
    contentType,
    encode: (content: T): EncodedContent => ({
      type: contentType,
      parameters: { encoding: 'UTF-8' },
      fallback: fallback(content),
      content: encoder.encode(JSON.stringify(content)),
    }),
    decode: (encoded: EncodedContent): T => JSON.parse(decoder.decode(encoded.content)) as T,
    fallback,
    // Tips and NFTs are exactly the kind of thing worth a push notification.
    shouldPush: () => true,
  };
}

export const tipCodec = jsonCodec<TipContent>(
  ContentTypeTip,
  (c) => `💸 Sent you a tip of ${formatTipAmount(c)} ${c.asset} via DMpay — ${txUrl(c.txHash)}`,
);

export const nftSendCodec = jsonCodec<NftSendContent>(
  ContentTypeNftSend,
  (c) => `🖼 Sent you ${c.name ?? `${c.collection ?? 'an NFT'} #${c.tokenId}`} via DMpay — ${txUrl(c.txHash)}`,
);

/** Every codec this app registers. Passed to Client.create. */
export const dmpayCodecs = [tipCodec, nftSendCodec];

function isType(a: ContentTypeId | undefined, b: ContentTypeId): boolean {
  return !!a && a.authorityId === b.authorityId && a.typeId === b.typeId;
}

/** Narrow a decoded message to a tip card. Version-tolerant on minor bumps. */
export function asTip(message: { contentType?: ContentTypeId; content: unknown }): TipContent | null {
  return isType(message.contentType, ContentTypeTip) ? (message.content as TipContent) : null;
}

export function asNftSend(message: { contentType?: ContentTypeId; content: unknown }): NftSendContent | null {
  return isType(message.contentType, ContentTypeNftSend) ? (message.content as NftSendContent) : null;
}
