import { useEffect, useMemo, useState } from 'react';
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem';
import { Loader2, Send } from 'lucide-react';
import type { Dm, Group } from '@xmtp/browser-sdk';
import { DMPAY_DIRECT_ADDRESS, USDC_ADDRESS, dmpayDirectAbi, erc20Abi } from '../lib/contracts';
import { tipCodec, type TipAsset, type TipContent } from '../lib/chatContent';
import { ErrorNote, FieldLabel, SendModal, TargetPicker } from './ChatSendShell';

const NOTE_MAX = 120;
const PRESETS: Record<TipAsset, string[]> = {
  USDC: ['1', '5', '25'],
  ETH: ['0.001', '0.01', '0.05'],
};

/**
 * Tipping runs through DMPayDirectV2.payMessage*, which is already deployed and
 * already does exactly this: take a sender-chosen amount, split 97.5 / 2.5, emit
 * MessagePaid. No new contract, and — unlike openConversation* — it doesn't
 * touch openedAt, so tipping someone never silently unlocks a paid thread.
 *
 * The XMTP card is sent only after the transaction is mined. Sending it on
 * submission would put an unbacked receipt in the thread whenever a tx is
 * dropped or reverted.
 */
export function TipComposer({ conversation, target, candidates, onClose, onSent }: {
  conversation: Dm<unknown> | Group<unknown>;
  /** DM mode: the fixed peer. Null in a group, where a member must be chosen. */
  target: `0x${string}` | null;
  /** Group mode: members who have published an address. */
  candidates?: `0x${string}`[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { address: me } = useAccount();
  const [picked, setPicked] = useState<`0x${string}` | null>(target);
  const [asset, setAsset] = useState<TipAsset>('USDC');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const recipient = target ?? picked;
  const isUSDC = asset === 'USDC';

  const parsed = useMemo(() => {
    const raw = amount.trim();
    if (!raw) return null;
    try {
      const v = isUSDC ? parseUnits(raw, 6) : parseEther(raw);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount, isUSDC]);

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: me ? [me] : undefined,
    query: { enabled: isUSDC && !!me },
  });
  const { data: ethBalance } = useBalance({ address: me, query: { enabled: !isUSDC && !!me } });

  const balance = isUSDC ? (usdcBalance ?? 0n) : (ethBalance?.value ?? 0n);
  const balanceLabel = isUSDC ? `${formatUnits(balance, 6)} USDC` : `${formatEther(balance)} ETH`;
  const overBalance = parsed !== null && parsed > balance;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: me ? [me, DMPAY_DIRECT_ADDRESS] : undefined,
    query: { enabled: isUSDC && !!me },
  });
  const needsApproval = isUSDC && parsed !== null && (allowance ?? 0n) < parsed;

  const approveTx = useWriteContract();
  const payTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const payReceipt = useWaitForTransactionReceipt({ hash: payTx.data });

  useEffect(() => { if (approveReceipt.isSuccess) refetchAllowance(); }, [approveReceipt.isSuccess, refetchAllowance]);

  // Post the card once the payment is actually mined.
  useEffect(() => {
    if (!payReceipt.isSuccess || !payTx.data || !me || !recipient || parsed === null || posting) return;
    let cancelled = false;
    (async () => {
      setPosting(true);
      try {
        const content: TipContent = {
          txHash: payTx.data!,
          asset,
          amount: parsed.toString(),
          from: me,
          to: recipient,
          ...(note.trim() ? { note: note.trim() } : {}),
        };
        await conversation.send(tipCodec.encode(content) as any);
        if (!cancelled) onSent();
      } catch (e: any) {
        // The money moved regardless — say so, rather than implying it failed.
        if (!cancelled) {
          setFailure(`Tip sent on-chain, but the message card failed to post: ${e?.message ?? 'unknown error'}`);
          setPosting(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [payReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  function approve() {
    if (!parsed) return;
    setFailure(null);
    approveTx.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DMPAY_DIRECT_ADDRESS, parsed],
    });
  }

  function pay() {
    if (!parsed || !recipient) return;
    setFailure(null);
    if (isUSDC) {
      payTx.writeContract({
        address: DMPAY_DIRECT_ADDRESS,
        abi: dmpayDirectAbi,
        functionName: 'payMessageUSDC',
        args: [recipient, parsed],
      });
    } else {
      payTx.writeContract({
        address: DMPAY_DIRECT_ADDRESS,
        abi: dmpayDirectAbi,
        functionName: 'payMessageETH',
        args: [recipient],
        value: parsed,
      });
    }
  }

  const approving = approveTx.isPending || approveReceipt.isLoading;
  const paying = payTx.isPending || payReceipt.isLoading || posting;
  const chainError = (payTx.error ?? approveTx.error) as { shortMessage?: string; message?: string } | null;
  const blocked = /blocked/i.test(chainError?.message ?? '');

  return (
    <SendModal kicker="· Send a tip" title="Tip" onClose={onClose}>
      {!target && <TargetPicker candidates={candidates ?? []} value={picked} onChange={setPicked} />}

      <FieldLabel>Asset</FieldLabel>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {(['USDC', 'ETH'] as TipAsset[]).map((a) => (
          <button
            key={a}
            onClick={() => { setAsset(a); setAmount(''); }}
            className={`rounded-xl py-2.5 font-mono text-sm border transition-colors ${
              asset === a
                ? 'bg-bg-elevated border-brand text-text-primary'
                : 'bg-bg-elevated border-border-subtle text-text-muted hover:bg-bg-hover'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <FieldLabel>Amount</FieldLabel>
        <button
          onClick={() => setAmount(isUSDC ? formatUnits(balance, 6) : formatEther(balance))}
          className="font-mono text-[10px] text-text-faint hover:text-text-secondary -mt-2"
        >
          Balance {balanceLabel}
        </button>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        placeholder="0.00"
        className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-3 dm-display font-mono text-2xl text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand"
      />
      <div className="flex gap-2 mt-2 mb-5">
        {PRESETS[asset].map((p) => (
          <button
            key={p}
            onClick={() => setAmount(p)}
            className="flex-1 rounded-lg py-1.5 font-mono text-xs bg-bg-elevated border border-border-subtle text-text-secondary hover:bg-bg-hover"
          >
            {isUSDC ? `$${p}` : p}
          </button>
        ))}
      </div>

      <FieldLabel>Note (optional)</FieldLabel>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
        placeholder="What's it for?"
        className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand"
      />

      <p className="text-[11px] text-text-muted leading-relaxed mt-4">
        {parsed !== null ? (
          <>They receive{' '}
            <span className="font-mono text-text-secondary">
              {isUSDC
                ? `${formatUnits(parsed - (parsed * 250n) / 10000n, 6)} USDC`
                : `${formatEther(parsed - (parsed * 250n) / 10000n)} ETH`}
            </span>{' '}
            — 2.5% protocol fee, settled directly, no custody.
          </>
        ) : (
          <>97.5% settles directly to them. 2.5% protocol fee, no custody.</>
        )}
      </p>

      {overBalance && <ErrorNote>That's more than your {asset} balance.</ErrorNote>}
      {blocked && <ErrorNote>They've blocked you, so this payment can't go through.</ErrorNote>}
      {!blocked && chainError && (
        <ErrorNote>{chainError.shortMessage ?? chainError.message}</ErrorNote>
      )}
      {failure && <ErrorNote>{failure}</ErrorNote>}

      <button
        onClick={needsApproval ? approve : pay}
        disabled={!parsed || !recipient || overBalance || approving || paying}
        className="mt-5 w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        {approving && <><Loader2 size={16} className="animate-spin" /> Approving USDC…</>}
        {!approving && paying && (
          <><Loader2 size={16} className="animate-spin" />
            {posting ? 'Posting card…' : payTx.isPending ? 'Confirm in wallet…' : 'Confirming on-chain…'}
          </>
        )}
        {!approving && !paying && (needsApproval
          ? 'Approve USDC'
          : <><Send size={16} /> Send tip</>)}
      </button>
    </SendModal>
  );
}
