import { decodeEventLog, parseAbiItem, zeroAddress, type PublicClient } from 'viem';
import { DMPAY_DIRECT_ADDRESS, USDC_ADDRESS } from './contracts';
import type { NftSendContent, TipContent } from './chatContent';

/**
 * Turning a claimed receipt into a verified one.
 *
 * A tip card is a message, and a message is bytes a peer chose to send. Nothing
 * stops someone hand-crafting `{ amount: "500000000", asset: "USDC" }` and
 * having it render as "tipped you 500 USDC" — or replaying a txHash from a
 * payment someone else made. So the card is never trusted on its face: we pull
 * the receipt, decode the log the transaction actually emitted, and check it
 * against every field the card claims.
 *
 * Until that check passes the UI says "unverified" rather than showing an
 * amount. A card that fails outright is labelled, not hidden — silently
 * dropping it would make a spoof indistinguishable from a network hiccup.
 */

export type VerifyState =
  | { status: 'pending' }
  | { status: 'verified' }
  | { status: 'failed'; reason: string };

const messagePaidEvent = parseAbiItem(
  'event MessagePaid(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee)',
);
const erc721TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);
const erc1155SingleEvent = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
);

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

async function successfulReceipt(client: PublicClient, txHash: `0x${string}`) {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error('Transaction reverted');
  return receipt;
}

/**
 * A tip is real iff the named transaction emitted MessagePaid from
 * DMPayDirectV2 with exactly the sender, recipient, token and amount claimed.
 *
 * `claimedSender` is the address behind the XMTP identity that sent the
 * message — checked against the card's `from` so a third party can't rebroadcast
 * someone else's genuine payment as their own.
 */
export async function verifyTip(
  client: PublicClient,
  tip: TipContent,
  claimedSender: `0x${string}` | null,
): Promise<VerifyState> {
  try {
    if (claimedSender && !eq(claimedSender, tip.from)) {
      return { status: 'failed', reason: 'Sender does not match the payer' };
    }
    const receipt = await successfulReceipt(client, tip.txHash);

    const expectedToken = tip.asset === 'USDC' ? USDC_ADDRESS : zeroAddress;
    const match = receipt.logs.some((log) => {
      if (!eq(log.address, DMPAY_DIRECT_ADDRESS)) return false;
      try {
        const { eventName, args } = decodeEventLog({
          abi: [messagePaidEvent],
          data: log.data,
          topics: log.topics,
        });
        if (eventName !== 'MessagePaid') return false;
        return (
          eq(args.sender, tip.from) &&
          eq(args.recipient, tip.to) &&
          eq(args.token, expectedToken) &&
          args.amountPaid === BigInt(tip.amount)
        );
      } catch {
        // Any other event from the same contract — not our log.
        return false;
      }
    });

    return match
      ? { status: 'verified' }
      : { status: 'failed', reason: 'No matching payment in that transaction' };
  } catch (e: any) {
    return { status: 'failed', reason: e?.shortMessage ?? e?.message ?? 'Could not read transaction' };
  }
}

/**
 * An NFT send is real iff the transaction emitted a Transfer (ERC-721) or
 * TransferSingle (ERC-1155) from the claimed collection, moving the claimed
 * token between the claimed parties.
 */
export async function verifyNftSend(
  client: PublicClient,
  nft: NftSendContent,
  claimedSender: `0x${string}` | null,
): Promise<VerifyState> {
  try {
    if (claimedSender && !eq(claimedSender, nft.from)) {
      return { status: 'failed', reason: 'Sender does not match the transferor' };
    }
    const receipt = await successfulReceipt(client, nft.txHash);
    const tokenId = BigInt(nft.tokenId);

    const match = receipt.logs.some((log) => {
      if (!eq(log.address, nft.contract)) return false;
      try {
        const { eventName, args } = decodeEventLog({
          abi: [erc721TransferEvent, erc1155SingleEvent],
          data: log.data,
          topics: log.topics,
        });
        if (eventName === 'Transfer') {
          return eq(args.from, nft.from) && eq(args.to, nft.to) && args.tokenId === tokenId;
        }
        if (eventName === 'TransferSingle') {
          return eq(args.from, nft.from) && eq(args.to, nft.to) && args.id === tokenId;
        }
        return false;
      } catch {
        return false;
      }
    });

    return match
      ? { status: 'verified' }
      : { status: 'failed', reason: 'No matching transfer in that transaction' };
  } catch (e: any) {
    return { status: 'failed', reason: e?.shortMessage ?? e?.message ?? 'Could not read transaction' };
  }
}
