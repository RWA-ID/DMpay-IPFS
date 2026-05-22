import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { formatUnits, formatEther, parseAbiItem } from 'viem';
import { Loader2, Infinity as InfinityIcon, Send, Check, AlertTriangle } from 'lucide-react';
import { DMPAY_DIRECT_ADDRESS, USDC_ADDRESS, dmpayDirectAbi, erc20Abi } from '../lib/contracts';

type Tier = 'usdc' | 'eth' | 'lifetimeUsdc' | 'lifetimeEth';

export function Paywall({ recipient, recipientName, onUnlocked }: {
  recipient: `0x${string}`;
  recipientName: string;
  onUnlocked: () => void;
}) {
  const { address: me } = useAccount();
  const publicClient = usePublicClient();

  // Read recipient prices
  const { data: price, isLoading: loadingPrice } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'priceOf',
    args: [recipient],
  });
  const usdc = price?.[0] ?? 0n;
  const eth = price?.[1] ?? 0n;
  const lUsdc = price?.[2] ?? 0n;
  const lEth = price?.[3] ?? 0n;
  const hasAnyPrice = usdc > 0n || eth > 0n || lUsdc > 0n || lEth > 0n;

  // Lifetime pass: check both directions (either party having paid unlocks the chat)
  const { data: hasPassOutgoing, refetch: refetchPass } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'hasLifetimePass',
    args: me ? [recipient, me] : undefined,
    query: { enabled: !!me },
  });
  const { data: hasPassIncoming } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'hasLifetimePass',
    args: me ? [me, recipient] : undefined,
    query: { enabled: !!me },
  });
  const hasPass = (hasPassOutgoing ?? false) || (hasPassIncoming ?? false);

  // Persistent unlock: localStorage cache + bounded on-chain backstop.
  // A conversation is unlocked if EITHER party has paid (sender→recipient OR recipient→sender).
  const storageKey = me ? `dmpay:open:${[me.toLowerCase(), recipient.toLowerCase()].sort().join(':')}` : '';
  const [hasPriorOpen, setHasPriorOpen] = useState<boolean | null>(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    return localStorage.getItem(storageKey) === '1' ? true : null;
  });

  useEffect(() => {
    if (!me || !publicClient || hasPriorOpen === true) return;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        // publicnode caps eth_getLogs at 50k blocks per request.
        const fromBlock = latest > 49_999n ? latest - 49_999n : 0n;
        const event = parseAbiItem('event ConversationOpened(address indexed sender, address indexed recipient, address indexed token, uint256 amountPaid, uint256 fee)');
        const [outgoing, incoming] = await Promise.all([
          publicClient.getLogs({ address: DMPAY_DIRECT_ADDRESS, event, args: { sender: me, recipient }, fromBlock, toBlock: latest }),
          publicClient.getLogs({ address: DMPAY_DIRECT_ADDRESS, event, args: { sender: recipient, recipient: me }, fromBlock, toBlock: latest }),
        ]);
        const paid = outgoing.length > 0 || incoming.length > 0;
        setHasPriorOpen(paid);
        if (paid && storageKey) localStorage.setItem(storageKey, '1');
      } catch (e) {
        console.error('event lookup failed', e);
        setHasPriorOpen(false);
      }
    })();
  }, [me, recipient, publicClient, hasPriorOpen, storageKey]);

  // If already unlocked, bubble up immediately
  useEffect(() => {
    if (hasPass === true || hasPriorOpen === true) onUnlocked();
  }, [hasPass, hasPriorOpen, onUnlocked]);

  const [selected, setSelected] = useState<Tier | null>(null);

  if (loadingPrice || hasPassOutgoing === undefined || hasPassIncoming === undefined || hasPriorOpen === null) {
    return <Centered><Loader2 className="animate-spin text-text-muted" /></Centered>;
  }

  if (hasPass || hasPriorOpen) {
    // Will navigate via effect; render nothing visible
    return null;
  }

  if (!hasAnyPrice) {
    return (
      <Centered>
        <AlertTriangle className="text-text-muted mb-3" />
        <div className="text-text-primary font-medium mb-1">{recipientName} hasn't enabled paid DMs</div>
        <div className="text-text-secondary text-sm">Ask them to set a price in DMpay first.</div>
      </Centered>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-text-primary mb-1">Open conversation with {recipientName}</h2>
        <p className="text-sm text-text-secondary mb-6">Choose how you'd like to pay. 97.5% of every payment goes directly to {recipientName}.</p>

        <div className="space-y-2 mb-6">
          {usdc > 0n && (
            <TierOption
              selected={selected === 'usdc'}
              onSelect={() => setSelected('usdc')}
              label="Per conversation"
              price={`${formatUnits(usdc, 6)} USDC`}
              note="One-time payment for this chat session"
            />
          )}
          {eth > 0n && (
            <TierOption
              selected={selected === 'eth'}
              onSelect={() => setSelected('eth')}
              label="Per conversation"
              price={`${formatEther(eth)} ETH`}
              note="One-time payment for this chat session"
            />
          )}
          {lUsdc > 0n && (
            <TierOption
              selected={selected === 'lifetimeUsdc'}
              onSelect={() => setSelected('lifetimeUsdc')}
              label="Lifetime pass"
              price={`${formatUnits(lUsdc, 6)} USDC`}
              note="Message forever — no future payments"
              icon={<InfinityIcon size={14} />}
            />
          )}
          {lEth > 0n && (
            <TierOption
              selected={selected === 'lifetimeEth'}
              onSelect={() => setSelected('lifetimeEth')}
              label="Lifetime pass"
              price={`${formatEther(lEth)} ETH`}
              note="Message forever — no future payments"
              icon={<InfinityIcon size={14} />}
            />
          )}
        </div>

        {selected && (
          <PayAction
            tier={selected}
            recipient={recipient}
            amount={
              selected === 'usdc' ? usdc :
              selected === 'eth' ? eth :
              selected === 'lifetimeUsdc' ? lUsdc :
              lEth
            }
            onPaid={() => {
              if (storageKey) localStorage.setItem(storageKey, '1');
              refetchPass();
              onUnlocked();
            }}
          />
        )}
      </div>
    </main>
  );
}

function TierOption({ selected, onSelect, label, price, note, icon }: {
  selected: boolean; onSelect: () => void; label: string; price: string; note: string; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 transition-colors p-4 flex items-start gap-3 ${
        selected ? 'border-brand bg-brand-soft' : 'border-border-subtle bg-bg-elevated hover:bg-bg-hover'
      }`}
    >
      <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${selected ? 'border-brand bg-brand' : 'border-border-subtle'}`}>
        {selected && <Check size={12} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted">
          {icon} {label}
        </div>
        <div className="text-lg font-semibold text-text-primary mt-0.5">{price}</div>
        <div className="text-xs text-text-secondary mt-0.5">{note}</div>
      </div>
    </button>
  );
}

function PayAction({ tier, recipient, amount, onPaid }: {
  tier: Tier; recipient: `0x${string}`; amount: bigint; onPaid: () => void;
}) {
  const { address: me } = useAccount();
  const isUSDC = tier === 'usdc' || tier === 'lifetimeUsdc';
  const isLifetime = tier === 'lifetimeUsdc' || tier === 'lifetimeEth';

  // USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: me ? [me, DMPAY_DIRECT_ADDRESS] : undefined,
    query: { enabled: isUSDC && !!me },
  });
  const needsApproval = isUSDC && (allowance ?? 0n) < amount;

  const approveTx = useWriteContract();
  const payTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const payReceipt = useWaitForTransactionReceipt({ hash: payTx.data });

  useEffect(() => { if (approveReceipt.isSuccess) refetchAllowance(); }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => { if (payReceipt.isSuccess) onPaid(); }, [payReceipt.isSuccess, onPaid]);

  function approve() {
    approveTx.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DMPAY_DIRECT_ADDRESS, amount],
    });
  }
  function pay() {
    if (tier === 'usdc') {
      payTx.writeContract({ address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi, functionName: 'openConversationUSDC', args: [recipient] });
    } else if (tier === 'lifetimeUsdc') {
      payTx.writeContract({ address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi, functionName: 'buyLifetimePassUSDC', args: [recipient] });
    } else if (tier === 'eth') {
      payTx.writeContract({ address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi, functionName: 'openConversationETH', args: [recipient], value: amount });
    } else {
      payTx.writeContract({ address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi, functionName: 'buyLifetimePassETH', args: [recipient], value: amount });
    }
  }

  const approving = approveTx.isPending || approveReceipt.isLoading;
  const paying = payTx.isPending || payReceipt.isLoading;

  if (needsApproval) {
    return (
      <button
        onClick={approve}
        disabled={approving}
        className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-white rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        {approving ? <><Loader2 size={16} className="animate-spin" /> Approving USDC…</> : 'Approve USDC'}
      </button>
    );
  }

  return (
    <button
      onClick={pay}
      disabled={paying}
      className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-white rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
    >
      {paying ? <><Loader2 size={16} className="animate-spin" /> {payTx.isPending ? 'Confirm in wallet…' : 'Confirming on-chain…'}</> :
       <><Send size={16} /> {isLifetime ? 'Buy lifetime pass' : 'Pay & open conversation'}</>}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">{children}</main>;
}
