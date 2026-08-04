import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { isAddress } from 'viem';
import { ImageOff, Loader2, Pencil, Send } from 'lucide-react';
import type { Dm, Group } from '@xmtp/browser-sdk';
import { erc721Abi, erc1155Abi } from '../lib/contracts';
import { fetchOwnedNfts, nftKey, nftTitle, type OwnedNft } from '../lib/nfts';
import { nftSendCodec, type NftSendContent } from '../lib/chatContent';
import { ErrorNote, FieldLabel, SendModal, TargetPicker } from './ChatSendShell';

/**
 * Sending an NFT is a plain `safeTransferFrom` on the collection's own
 * contract. No DMpay contract is involved, no fee is taken, and — worth being
 * clear about — no marketplace API can do this for you: only the owner's
 * wallet can authorise a transfer.
 *
 * The grid is a convenience layer over an indexer, so it's allowed to fail.
 * When it does, manual entry still sends: contract address plus token id is
 * everything the transfer actually needs.
 */
export function NftComposer({ conversation, target, candidates, onClose, onSent }: {
  conversation: Dm<unknown> | Group<unknown>;
  target: `0x${string}` | null;
  candidates?: `0x${string}`[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { address: me } = useAccount();
  const [picked, setPicked] = useState<`0x${string}` | null>(target);
  const [nfts, setNfts] = useState<OwnedNft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OwnedNft | null>(null);
  const [manual, setManual] = useState(false);
  const [manualContract, setManualContract] = useState('');
  const [manualTokenId, setManualTokenId] = useState('');
  const [manualStandard, setManualStandard] = useState<'erc721' | 'erc1155'>('erc721');
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const recipient = target ?? picked;

  useEffect(() => {
    if (!me) return;
    const ac = new AbortController();
    fetchOwnedNfts(me, { signal: ac.signal })
      .then((page) => setNfts(page.nfts))
      .catch((e) => {
        if (ac.signal.aborted) return;
        setLoadError(e?.message ?? 'Could not load your NFTs');
        setManual(true);
      });
    return () => ac.abort();
  }, [me]);

  const chosen: OwnedNft | null = manual
    ? (isAddress(manualContract) && manualTokenId.trim()
        ? {
            contract: manualContract as `0x${string}`,
            tokenId: manualTokenId.trim(),
            standard: manualStandard,
            name: null,
            collection: null,
            image: null,
          }
        : null)
    : selected;

  const sendTx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: sendTx.data });

  useEffect(() => {
    if (!receipt.isSuccess || !sendTx.data || !me || !recipient || !chosen || posting) return;
    let cancelled = false;
    (async () => {
      setPosting(true);
      try {
        const content: NftSendContent = {
          txHash: sendTx.data!,
          contract: chosen.contract,
          tokenId: chosen.tokenId,
          standard: chosen.standard,
          from: me,
          to: recipient,
          ...(chosen.name ? { name: chosen.name } : {}),
          ...(chosen.collection ? { collection: chosen.collection } : {}),
          ...(chosen.image ? { image: chosen.image } : {}),
        };
        await conversation.send(nftSendCodec.encode(content) as any);
        if (!cancelled) onSent();
      } catch (e: any) {
        if (!cancelled) {
          setFailure(`NFT transferred on-chain, but the message card failed to post: ${e?.message ?? 'unknown error'}`);
          setPosting(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(() => {
    if (!chosen || !recipient || !me) return;
    setFailure(null);
    let tokenId: bigint;
    try {
      tokenId = BigInt(chosen.tokenId);
    } catch {
      setFailure('That token id isn\'t a number.');
      return;
    }
    if (chosen.standard === 'erc1155') {
      sendTx.writeContract({
        address: chosen.contract,
        abi: erc1155Abi,
        functionName: 'safeTransferFrom',
        args: [me, recipient, tokenId, 1n, '0x'],
      });
    } else {
      sendTx.writeContract({
        address: chosen.contract,
        abi: erc721Abi,
        functionName: 'safeTransferFrom',
        args: [me, recipient, tokenId],
      });
    }
  }, [chosen, recipient, me, sendTx]);

  const sending = sendTx.isPending || receipt.isLoading || posting;
  const chainError = sendTx.error as { shortMessage?: string; message?: string } | null;

  return (
    <SendModal kicker="· Send an NFT" title="Send NFT" onClose={onClose}>
      {!target && <TargetPicker candidates={candidates ?? []} value={picked} onChange={setPicked} />}

      {!manual && (
        <>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>Your NFTs</FieldLabel>
            <button
              onClick={() => { setManual(true); setSelected(null); }}
              className="font-mono text-[10px] text-text-faint hover:text-text-secondary -mt-2 inline-flex items-center gap-1"
            >
              <Pencil size={10} /> Enter manually
            </button>
          </div>

          {nfts === null && (
            <div className="h-40 grid place-items-center text-text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {nfts !== null && nfts.length === 0 && (
            <div className="h-40 grid place-items-center text-center px-4">
              <div>
                <ImageOff size={20} className="mx-auto text-text-faint mb-2" />
                <div className="text-sm text-text-secondary">No NFTs with artwork found</div>
                <div className="text-[11px] text-text-muted mt-1">
                  Items without an image are hidden. Use manual entry to send one anyway.
                </div>
              </div>
            </div>
          )}

          {nfts !== null && nfts.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-0.5 mb-5">
              {nfts.map((n) => {
                const isSel = selected && nftKey(selected) === nftKey(n);
                return (
                  <button
                    key={nftKey(n)}
                    onClick={() => setSelected(n)}
                    title={nftTitle(n)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      isSel ? 'border-brand scale-[0.97]' : 'border-transparent hover:border-border-strong'
                    }`}
                  >
                    {n.image ? (
                      <img src={n.image} alt={nftTitle(n)} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-bg-elevated grid place-items-center text-text-faint">
                        <ImageOff size={16} />
                      </div>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-4 pb-1 text-[9px] text-white/90 truncate text-left">
                      {nftTitle(n)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {manual && (
        <>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>NFT details</FieldLabel>
            {!loadError && (
              <button
                onClick={() => setManual(false)}
                className="font-mono text-[10px] text-text-faint hover:text-text-secondary -mt-2"
              >
                Back to grid
              </button>
            )}
          </div>
          {loadError && (
            <p className="text-[11px] text-text-muted leading-relaxed mb-3">
              Couldn't browse your collection ({loadError}), but sending still works — the transfer
              goes straight to the NFT's contract.
            </p>
          )}
          <input
            value={manualContract}
            onChange={(e) => setManualContract(e.target.value.trim())}
            placeholder="Contract address (0x…)"
            className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand mb-2"
          />
          <input
            value={manualTokenId}
            onChange={(e) => setManualTokenId(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="Token ID"
            className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand mb-2"
          />
          <div className="grid grid-cols-2 gap-2 mb-5">
            {(['erc721', 'erc1155'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setManualStandard(s)}
                className={`rounded-xl py-2 font-mono text-xs border transition-colors ${
                  manualStandard === s
                    ? 'bg-bg-elevated border-brand text-text-primary'
                    : 'bg-bg-elevated border-border-subtle text-text-muted hover:bg-bg-hover'
                }`}
              >
                {s === 'erc721' ? 'ERC-721' : 'ERC-1155'}
              </button>
            ))}
          </div>
          {manualContract && !isAddress(manualContract) && (
            <ErrorNote>That doesn't look like a contract address.</ErrorNote>
          )}
        </>
      )}

      <p className="text-[11px] text-text-muted leading-relaxed">
        Transfers go directly to the collection's contract. DMpay takes no fee and never holds the token.
        {chosen && ' This can\'t be undone once confirmed.'}
      </p>

      {chainError && <ErrorNote>{chainError.shortMessage ?? chainError.message}</ErrorNote>}
      {failure && <ErrorNote>{failure}</ErrorNote>}

      <button
        onClick={send}
        disabled={!chosen || !recipient || sending}
        className="mt-5 w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        {sending
          ? <><Loader2 size={16} className="animate-spin" />
              {posting ? 'Posting card…' : sendTx.isPending ? 'Confirm in wallet…' : 'Transferring…'}
            </>
          : <><Send size={16} /> Send NFT</>}
      </button>
    </SendModal>
  );
}
