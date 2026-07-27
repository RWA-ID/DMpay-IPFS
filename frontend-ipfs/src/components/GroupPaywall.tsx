import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { Users, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { DMPAY_DIRECT_ADDRESS, USDC_ADDRESS, dmpayDirectAbi, erc20Abi } from '../lib/contracts';
import type { OnchainGroup } from '../lib/groups';
import { ShareGroup } from './ShareGroup';

type Tier = 'usdc' | 'eth';

export function GroupPaywall({
  id,
  group,
  groupName,
  onJoined,
}: {
  id: bigint;
  group: OnchainGroup;
  groupName: string;
  onJoined: () => void;
}) {
  const { address } = useAccount();

  // Lifetime pass holders of this creator join every one of their groups free.
  const { data: hasLifetime } = useReadContract({
    address: DMPAY_DIRECT_ADDRESS,
    abi: dmpayDirectAbi,
    functionName: 'hasLifetimePass',
    args: address ? [group.creator, address] : undefined,
    query: { enabled: !!address },
  });

  const free = hasLifetime === true;
  const [selected, setSelected] = useState<Tier | null>(
    group.priceUsdc > 0n ? 'usdc' : group.priceEth > 0n ? 'eth' : null
  );

  const full = group.capacity > 0n && group.memberCount >= group.capacity;

  if (full) {
    return (
      <Centered>
        <Users className="text-text-muted mb-3" size={26} />
        <div className="text-text-primary font-medium mb-1">This group is full</div>
        <div className="text-text-secondary text-sm max-w-sm">
          It has reached its capacity of {group.capacity.toString()} members. Ask the creator to raise
          the cap or remove an inactive member.
        </div>
      </Centered>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted mb-2">· Paid group</div>
        <h2 className="dm-display text-3xl text-text-primary mb-2 break-words">{groupName}</h2>
        <p className="text-sm text-text-secondary mb-6">
          {free
            ? 'You hold this creator’s lifetime pass, so entry is free — you still send one transaction to record membership on-chain.'
            : `Pay once to join. 97.5% settles directly to the creator — 2.5% protocol fee, no custody.`}
        </p>

        <div className="bg-bg-panel border border-border-subtle rounded-3xl p-5 mb-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Members</span>
            <span className="font-mono text-text-primary">
              {group.memberCount.toString()}
              {group.capacity > 0n ? ` / ${group.capacity.toString()}` : ''}
            </span>
          </div>
        </div>

        {/* Anyone can pass the group on, member or not. */}
        <div className="mb-6">
          <ShareGroup
            id={id}
            price={group.priceUsdc > 0n
              ? `$${formatUnits(group.priceUsdc, 6)}`
              : group.priceEth > 0n ? `${formatEther(group.priceEth)} ETH` : null}
          />
        </div>

        {free ? (
          <JoinAction id={id} tier={group.priceUsdc > 0n ? 'usdc' : 'eth'} amount={0n} free onJoined={onJoined} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {group.priceUsdc > 0n && (
                <TierOption
                  selected={selected === 'usdc'}
                  onSelect={() => setSelected('usdc')}
                  title="Join with USDC"
                  priceMain={`$${formatUnits(group.priceUsdc, 6)}`}
                  priceAlt="USDC"
                />
              )}
              {group.priceEth > 0n && (
                <TierOption
                  selected={selected === 'eth'}
                  onSelect={() => setSelected('eth')}
                  title="Join with ETH"
                  priceMain={`${formatEther(group.priceEth)} ETH`}
                  priceAlt="ETH"
                />
              )}
            </div>
            {selected && (
              <JoinAction
                id={id}
                tier={selected}
                amount={selected === 'usdc' ? group.priceUsdc : group.priceEth}
                onJoined={onJoined}
              />
            )}
          </>
        )}

        <p className="text-xs text-text-muted mt-5 leading-relaxed">
          After your payment confirms, the creator's client adds you to the encrypted XMTP group.
          That happens the next time they have DMpay open — you may not see messages immediately.
        </p>
      </div>
    </main>
  );
}

function JoinAction({ id, tier, amount, free = false, onJoined }: {
  id: bigint;
  tier: Tier;
  amount: bigint;
  free?: boolean;
  onJoined: () => void;
}) {
  const { address } = useAccount();
  const isUSDC = tier === 'usdc';

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, DMPAY_DIRECT_ADDRESS] : undefined,
    query: { enabled: !!address && isUSDC && !free },
  });

  const needsApproval = isUSDC && !free && (allowance ?? 0n) < amount;

  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const joinTx = useWriteContract();
  const joinReceipt = useWaitForTransactionReceipt({ hash: joinTx.data });

  useEffect(() => { if (approveReceipt.isSuccess) refetchAllowance(); }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => { if (joinReceipt.isSuccess) onJoined(); }, [joinReceipt.isSuccess, onJoined]);

  const err = approveTx.error ?? approveReceipt.error ?? joinTx.error ?? joinReceipt.error;
  const approving = approveTx.isPending || approveReceipt.isLoading;
  const joining = joinTx.isPending || joinReceipt.isLoading;

  function approve() {
    approveTx.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DMPAY_DIRECT_ADDRESS, amount],
    });
  }

  function join() {
    if (isUSDC) {
      joinTx.writeContract({
        address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi,
        functionName: 'joinGroupUSDC', args: [id],
      });
    } else {
      // Lifetime holders must send zero value — the contract rejects any ETH.
      joinTx.writeContract({
        address: DMPAY_DIRECT_ADDRESS, abi: dmpayDirectAbi,
        functionName: 'joinGroupETH', args: [id], value: free ? 0n : amount,
      });
    }
  }

  return (
    <div>
      {needsApproval ? (
        <button
          onClick={approve}
          disabled={approving}
          className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3.5 font-medium inline-flex items-center justify-center gap-2"
        >
          {approving ? <><Loader2 size={16} className="animate-spin" /> Approving USDC…</> : 'Approve USDC'}
        </button>
      ) : (
        <button
          onClick={join}
          disabled={joining}
          className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-6 py-3.5 font-medium inline-flex items-center justify-center gap-2"
        >
          {joining ? (
            <><Loader2 size={16} className="animate-spin" /> Joining…</>
          ) : free ? (
            <><Sparkles size={16} /> Join free with lifetime pass</>
          ) : (
            <><Users size={16} /> Join group</>
          )}
        </button>
      )}

      {err && (
        <div className="mt-4 bg-bg-panel border border-danger/30 text-danger rounded-2xl p-4 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{(err as any)?.shortMessage ?? (err as Error).message}</span>
        </div>
      )}
    </div>
  );
}

function TierOption({ selected, onSelect, title, priceMain, priceAlt }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  priceMain: string;
  priceAlt: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-3xl p-5 border transition-colors ${
        selected
          ? 'bg-brand text-brand-ink border-transparent'
          : 'bg-bg-panel border-border-subtle hover:bg-bg-hover text-text-primary'
      }`}
    >
      <div className="font-medium mb-1">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="dm-display text-3xl">{priceMain}</span>
        <span className={`font-mono text-xs ${selected ? 'text-brand-ink/70' : 'text-text-muted'}`}>{priceAlt}</span>
      </div>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-bg-base text-center p-6">{children}</main>
  );
}
