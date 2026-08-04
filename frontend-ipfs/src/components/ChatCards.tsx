import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { ArrowUpRight, BadgeCheck, ImageOff, Loader2, ShieldAlert } from 'lucide-react';
import {
  formatTipAmount,
  txUrl,
  type NftSendContent,
  type TipContent,
} from '../lib/chatContent';
import { verifyNftSend, verifyTip, type VerifyState } from '../lib/chatReceipts';
import { nftTitle } from '../lib/nfts';

/**
 * The rendered forms of a tip and an NFT send.
 *
 * Both are deliberately *not* speech bubbles. A payment is an event in the
 * thread, not something someone said, so these sit centred and full-width with
 * their own frame — the eye should catch them while scrolling past chat.
 *
 * Every card carries its verification state, because the message alone proves
 * nothing (see lib/chatReceipts.ts). Amounts and art stay muted until the
 * on-chain check clears.
 */

const ASSET_TINT: Record<string, string> = {
  USDC: '#4D9EE4',
  ETH: '#8C99E0',
};

function useVerification(
  kind: 'tip' | 'nft',
  payload: TipContent | NftSendContent,
  senderAddress: `0x${string}` | null,
) {
  const client = usePublicClient();
  const { data } = useQuery<VerifyState>({
    queryKey: ['receipt', kind, payload.txHash, senderAddress],
    enabled: !!client,
    // A mined transaction never changes its logs. Once checked, never recheck.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async () =>
      kind === 'tip'
        ? verifyTip(client as any, payload as TipContent, senderAddress)
        : verifyNftSend(client as any, payload as NftSendContent, senderAddress),
  });
  return data ?? { status: 'pending' as const };
}

function VerifyBadge({ state }: { state: VerifyState }) {
  if (state.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        <Loader2 size={10} className="animate-spin" /> Verifying
      </span>
    );
  }
  if (state.status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-success">
        <BadgeCheck size={11} /> On-chain
      </span>
    );
  }
  return (
    <span
      title={state.reason}
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-danger"
    >
      <ShieldAlert size={11} /> Unverified
    </span>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-mono text-[10px] text-text-faint hover:text-text-secondary transition-colors"
    >
      {hash.slice(0, 6)}…{hash.slice(-4)}
      <ArrowUpRight size={10} />
    </a>
  );
}

export function TipCard({ tip, fromMe, senderAddress }: {
  tip: TipContent;
  fromMe: boolean;
  senderAddress: `0x${string}` | null;
}) {
  const state = useVerification('tip', tip, senderAddress);
  const tint = ASSET_TINT[tip.asset] ?? ASSET_TINT.ETH;
  const amount = formatTipAmount(tip);
  const trusted = state.status === 'verified';

  return (
    <div className="flex justify-center py-1">
      <div
        className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-panel overflow-hidden shadow-card"
        style={{
          // A wash of the asset's own colour, strong enough to read as "money"
          // at a glance and weak enough not to fight the ink palette.
          backgroundImage: `linear-gradient(160deg, ${tint}1F 0%, ${tint}08 42%, transparent 78%)`,
        }}
      >
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              {fromMe ? '· Tip sent' : '· Tip received'}
            </span>
            <VerifyBadge state={state} />
          </div>

          <div className="flex items-baseline gap-2">
            <span
              className={`dm-display font-mono text-[34px] leading-none transition-opacity ${trusted ? 'opacity-100' : 'opacity-45'}`}
              style={{ color: tint }}
            >
              {amount}
            </span>
            <span className="font-mono text-[13px] text-text-secondary">{tip.asset}</span>
          </div>

          {tip.note && (
            <p className="mt-3 text-[13px] leading-snug text-text-secondary break-words">
              “{tip.note}”
            </p>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-border-subtle/70 flex items-center justify-between bg-bg-base/30">
          <span className="font-mono text-[10px] text-text-faint">97.5% settled directly</span>
          <TxLink hash={tip.txHash} />
        </div>
      </div>
    </div>
  );
}

export function NftCard({ nft, fromMe, senderAddress }: {
  nft: NftSendContent;
  fromMe: boolean;
  senderAddress: `0x${string}` | null;
}) {
  const state = useVerification('nft', nft, senderAddress);
  const trusted = state.status === 'verified';

  return (
    <div className="flex justify-center py-1">
      <div className="w-full max-w-[280px] rounded-2xl border border-border-subtle bg-bg-panel overflow-hidden shadow-card">
        <div className="px-4 pt-3 pb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {fromMe ? '· NFT sent' : '· NFT received'}
          </span>
          <VerifyBadge state={state} />
        </div>

        <div className="relative aspect-square bg-bg-elevated">
          {nft.image ? (
            <img
              src={nft.image}
              alt={nftTitle(nft)}
              loading="lazy"
              className={`w-full h-full object-cover transition-opacity ${trusted ? 'opacity-100' : 'opacity-40'}`}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-text-faint">
              <ImageOff size={22} />
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="text-[13px] font-medium text-text-primary truncate" title={nftTitle(nft)}>
            {nftTitle(nft)}
          </div>
          {nft.collection && (
            <div className="text-[11px] text-text-muted truncate mt-0.5">{nft.collection}</div>
          )}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
              {nft.standard === 'erc1155' ? 'ERC-1155' : 'ERC-721'}
            </span>
            <TxLink hash={nft.txHash} />
          </div>
        </div>
      </div>
    </div>
  );
}
