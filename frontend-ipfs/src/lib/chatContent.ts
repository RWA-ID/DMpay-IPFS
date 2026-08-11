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

export const ContentTypeLinkPreview: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'link-preview',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeTokenShare: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'token-share',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeSolTip: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'sol-tip',
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

/**
 * A text message that carries its own link preview.
 *
 * This is a *text* message first: `text` is exactly what the sender typed, and
 * the codec's fallback is that text verbatim, so Converse and every other
 * client show the message unchanged. The preview is an enrichment DMpay
 * clients can render and others can ignore.
 *
 * The preview is built by the sender at compose time and travels inside the
 * encrypted payload. That's a privacy decision, not an optimisation: a
 * receiver-side unfurl would tell our server the URL of every link in every
 * private chat and leak each reader's IP to the image host. Rendering one of
 * these cards makes no network request at all — which is why `image` is an
 * inlined data URI rather than a link to someone else's server.
 */
export type LinkPreviewContent = {
  /** The message body as typed. Never altered — the link stays in the text. */
  text: string;
  /** The previewed URL, already scheme-checked (http/https only). */
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  /** Downscaled thumbnail as a `data:` URI. Never a remote URL. */
  image?: string;
};

/**
 * A shared token.
 *
 * Unlike a tip or an NFT send, this reports no transaction — it's a *pointer*
 * to a contract plus the price the sender saw when they sent it. Nothing in it
 * can be verified on-chain the way chatReceipts.ts verifies the other two, and
 * the renderer must not imply otherwise: `priceUsdAtShare` is the sender's
 * claim, and a sender can put any number there.
 *
 * What is trustworthy is the pair: the current price is fetched independently
 * by each reader from DexScreener, and `address` is shown in full so anyone can
 * check they're looking at the token they think they are. Symbols are not
 * unique — deploying a token called USDC costs nothing.
 */
export type TokenShareContent = {
  /** DexScreener chain id, e.g. "ethereum", "base", "solana". */
  chain: string;
  /** The token's contract / mint address. */
  address: string;
  symbol: string;
  name: string;
  /** The pair the price came from — deepest liquidity at share time. */
  pairAddress: string;
  /** DexScreener page for the pair, for the "chart" link. */
  pairUrl?: string;
  /** USD price when shared, as a decimal string. The sender's claim. */
  priceUsdAtShare: string;
  /** Unix seconds at share time. */
  sharedAt: number;
  /** Token logo, inlined as a data URI. */
  image?: string;
  note?: string;
};

/**
 * A SOL tip receipt.
 *
 * Kept as its own type rather than a `chain` field on TipContent because
 * almost nothing about it is shared: the identifier is a base58 signature not
 * a 0x hash, the parties are base58 not addresses, and verification reads
 * balance deltas instead of a contract's event log. Widening the EVM type
 * would make every field optional and push the difference into the renderer.
 *
 * The headline difference is the fee. `TipContent` reports a payment that was
 * split 97.5 / 2.5 by DMPayDirectV2; this reports a bare transfer with no
 * program in the path, so the recipient got the whole amount. See lib/solana.ts.
 */
export type SolTipContent = {
  /** base58 transaction signature. */
  signature: string;
  /** Amount in lamports, as a decimal string. */
  lamports: string;
  /** base58 Solana addresses. */
  from: string;
  to: string;
  /** The Ethereum address behind the sender's XMTP identity, for attribution. */
  fromEth?: `0x${string}`;
  note?: string;
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

/**
 * Lamports to SOL for display. Trailing zeros stripped — "0.5" not
 * "0.500000000", which is what nine decimal places gives you otherwise.
 */
export function formatSol(lamports: string): string {
  try {
    const whole = formatUnits(BigInt(lamports), 9);
    return whole.includes('.') ? whole.replace(/0+$/, '').replace(/\.$/, '') : whole;
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

/**
 * Fallback is the raw text, with nothing appended. A link preview adds no
 * information a non-DMpay client is missing — the URL is already in the text —
 * so decorating it would just make the message read oddly everywhere else.
 */
export const linkPreviewCodec = jsonCodec<LinkPreviewContent>(
  ContentTypeLinkPreview,
  (c) => c.text,
);

/**
 * The fallback carries the contract address, not just the symbol — a reader in
 * Converse seeing "$PEPE" alone has been told nothing they can act on safely,
 * and the address is the only part of this that identifies anything.
 */
export const tokenShareCodec = jsonCodec<TokenShareContent>(
  ContentTypeTokenShare,
  (c) => `📈 Shared $${c.symbol} (${c.name}) — ${c.address} on ${c.chain}, $${c.priceUsdAtShare} when sent`,
);

export const solTipCodec = jsonCodec<SolTipContent>(
  ContentTypeSolTip,
  (c) => `◎ Sent you ${formatSol(c.lamports)} SOL via DMpay — https://solscan.io/tx/${c.signature}`,
);

/** Every codec this app registers. Passed to Client.create. */
export const dmpayCodecs = [tipCodec, nftSendCodec, linkPreviewCodec, tokenShareCodec, solTipCodec];

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

export function asLinkPreview(message: { contentType?: ContentTypeId; content: unknown }): LinkPreviewContent | null {
  return isType(message.contentType, ContentTypeLinkPreview) ? (message.content as LinkPreviewContent) : null;
}

export function asTokenShare(message: { contentType?: ContentTypeId; content: unknown }): TokenShareContent | null {
  return isType(message.contentType, ContentTypeTokenShare) ? (message.content as TokenShareContent) : null;
}

export function asSolTip(message: { contentType?: ContentTypeId; content: unknown }): SolTipContent | null {
  return isType(message.contentType, ContentTypeSolTip) ? (message.content as SolTipContent) : null;
}
