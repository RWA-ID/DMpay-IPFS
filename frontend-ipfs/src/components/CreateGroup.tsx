import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits, parseEther, decodeEventLog } from 'viem';
import { ArrowLeft, Users, Loader2, CheckCircle2, AlertCircle, Sparkles, Copy, Image as ImageIcon } from 'lucide-react';
import { DMPAY_DIRECT_ADDRESS, dmpayDirectAbi } from '../lib/contracts';
import { useXmtpClient } from '../hooks/useXmtpClient';
import { siteUrl } from '../lib/site';
import { uploadPublicToPinata } from '../lib/pinata';
import { GroupAvatar } from './GroupAvatar';

export function CreateGroup() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { client: xmtp, init: initXmtp, initializing } = useXmtpClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usdc, setUsdc] = useState('');
  const [eth, setEth] = useState('');
  const [capacity, setCapacity] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const createTx = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: createTx.data });
  const linkTx = useWriteContract();
  const linkReceipt = useWaitForTransactionReceipt({ hash: linkTx.data });

  const [groupId, setGroupId] = useState<bigint | null>(null);
  const [xmtpGroupId, setXmtpGroupId] = useState<string | null>(null);
  const [creatingXmtp, setCreatingXmtp] = useState(false);
  const [xmtpError, setXmtpError] = useState<string | null>(null);

  const txError = createTx.error ?? createReceipt.error ?? linkTx.error ?? linkReceipt.error;
  const priceMissing = !usdc && !eth;
  const nameMissing = !name.trim();
  const canSubmit = isConnected && !priceMissing && !nameMissing && !createTx.isPending && !createReceipt.isLoading;

  // 1) When the contract create tx confirms, parse the GroupCreated event for the new id.
  useEffect(() => {
    if (!createReceipt.isSuccess || !createReceipt.data) return;
    for (const log of createReceipt.data.logs) {
      if (log.address.toLowerCase() !== DMPAY_DIRECT_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: dmpayDirectAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === 'GroupCreated') {
          setGroupId((decoded.args as any).id as bigint);
          return;
        }
      } catch { /* not our event */ }
    }
  }, [createReceipt.isSuccess, createReceipt.data]);

  // 2) Once we have the on-chain id AND an XMTP client, create the XMTP group and link it on-chain.
  useEffect(() => {
    if (groupId === null || !xmtp || xmtpGroupId || creatingXmtp) return;
    (async () => {
      setCreatingXmtp(true);
      setXmtpError(null);
      try {
        // Create XMTP group with creator as sole initial admin. Members are added
        // as they pay to join (see [[project_dmpay_ipfs]] creator-reconciliation pattern).
        // Using createGroup with empty inboxIds — joiners will be added by the
        // creator's tab as they pay on-chain.
        // NOTE: the wasm bindings expect groupName / groupDescription /
        // groupImageUrlSquare — plain `name`/`description` are silently
        // dropped, which is why early groups showed up unnamed.
        const grp = await xmtp.conversations.createGroup([], {
          groupName: name.trim(),
          groupDescription: description.trim() || undefined,
          groupImageUrlSquare: imageUrl ?? undefined,
        } as any);
        const xId = grp.id;
        setXmtpGroupId(xId);
        // Persist linkage on-chain so other clients (joiners) can find the XMTP group.
        const xmtpIdBytes = xmtpStringIdToBytes32(xId);
        linkTx.writeContract({
          address: DMPAY_DIRECT_ADDRESS,
          abi: dmpayDirectAbi,
          functionName: 'setGroupXmtpId',
          args: [groupId, xmtpIdBytes],
        });
      } catch (e: any) {
        console.error('XMTP group create failed', e);
        setXmtpError(e?.message ?? 'Failed to create XMTP group');
      } finally {
        setCreatingXmtp(false);
      }
    })();
  }, [groupId, xmtp, xmtpGroupId, creatingXmtp, linkTx, name, description]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError('Pick an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('Image too large (max 5 MB).'); return; }
    setImageError(null);
    setImagePreview(URL.createObjectURL(file));
    setUploadingImage(true);
    try {
      setImageUrl(await uploadPublicToPinata(file));
    } catch (err: any) {
      console.error('group image upload failed', err);
      setImageError(err?.message ?? 'Upload failed');
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  }

  function submit() {
    if (!address || !canSubmit) return;
    createTx.writeContract({
      address: DMPAY_DIRECT_ADDRESS,
      abi: dmpayDirectAbi,
      functionName: 'createGroup',
      args: [
        usdc ? parseUnits(usdc, 6) : 0n,
        eth ? parseEther(eth) : 0n,
        capacity ? BigInt(capacity) : 0n,
      ],
    });
  }

  const onChainDone = createReceipt.isSuccess && groupId !== null;
  const xmtpDone = !!xmtpGroupId;
  const linkDone = linkReceipt.isSuccess;
  const allDone = onChainDone && xmtpDone && linkDone;
  const shareUrl = groupId !== null ? siteUrl(`/g/${groupId.toString()}`) : '';

  if (!isConnected) {
    return (
      <main className="flex-1 flex items-center justify-center bg-bg-base p-6">
        <div className="text-center max-w-sm">
          <Users className="text-brand mx-auto mb-4" size={32} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Connect to create a paid group</h2>
          <p className="text-text-secondary mb-6 text-sm">You'll sign two transactions: one to create the on-chain group, one to link the XMTP chat.</p>
          <button onClick={() => openConnectModal?.()} className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-3 font-medium">
            Connect wallet
          </button>
        </div>
      </main>
    );
  }

  // Success card once everything is done
  if (allDone && shareUrl) {
    return (
      <main className="flex-1 overflow-y-auto bg-bg-base">
        <div className="max-w-xl mx-auto px-6 py-16">
          <div className="bg-bg-panel border border-border-subtle rounded-3xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand mx-auto flex items-center justify-center mb-4">
              <Sparkles size={24} />
            </div>
            <h1 className="dm-display text-4xl text-text-primary">{name}</h1>
            <p className="text-text-secondary text-sm mt-2">Your paid group is live on Ethereum + XMTP.</p>

            <div className="mt-6 bg-bg-elevated border border-border-subtle rounded-xl p-3 flex items-center gap-2">
              <code className="flex-1 text-xs text-text-secondary truncate text-left">{shareUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(shareUrl).catch(() => {})}
                className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-bg-hover"
                title="Copy"
              >
                <Copy size={14} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-left">
              <Stat label="On-chain id" value={`#${groupId!.toString()}`} />
              <Stat label="Lifetime holders" value="Free entry" />
              {usdc && <Stat label="Per-seat USDC" value={`$${usdc}`} />}
              {eth && <Stat label="Per-seat ETH" value={`${eth} ETH`} />}
            </div>

            <div className="flex gap-2 justify-center mt-8">
              <button onClick={() => navigate('/inbox')} className="bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-2xl px-5 py-2.5 font-medium text-sm">
                Open inbox
              </button>
              <button onClick={() => navigate('/groups/new')} className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-5 py-2.5 font-medium text-sm">
                Create another
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-8">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center">
            <Users size={18} />
          </div>
          <h1 className="dm-display text-4xl text-text-primary">Create paid group</h1>
        </div>
        <p className="text-text-secondary mb-8">
          One-time payment per seat. Lifetime pass holders join free. You can evict members on-chain at any time.
        </p>

        <div className="bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 space-y-5">
          <Field label="Group name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alpha leaks chat"
              maxLength={64}
              className="w-full bg-bg-elevated text-text-primary placeholder:text-text-muted rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </Field>

          <Field label="Description" hint="Optional. Shown to people considering joining.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's in this group? Who is it for?"
              rows={3}
              maxLength={280}
              className="w-full bg-bg-elevated text-text-primary placeholder:text-text-muted rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </Field>

          <Field label="Group image" hint="Optional. Pinned to IPFS and shown to every member.">
            <div className="flex items-center gap-4">
              <GroupAvatar src={imagePreview ?? imageUrl} seed={name || 'new-group'} name={name} size={56} />
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-xl px-4 py-2.5 text-sm cursor-pointer">
                  {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  {uploadingImage ? 'Uploading…' : imageUrl ? 'Replace image' : 'Choose image'}
                  <input type="file" accept="image/*" onChange={onPickImage} className="hidden" disabled={uploadingImage} />
                </label>
                {imageError && <div className="text-danger text-xs mt-2">{imageError}</div>}
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Price (USDC)" hint="Per seat. 0 to disable.">
              <PriceInput value={usdc} onChange={setUsdc} unit="USDC" step="0.01" placeholder="10" />
            </Field>
            <Field label="Price (ETH)" hint="Per seat. 0 to disable.">
              <PriceInput value={eth} onChange={setEth} unit="ETH" step="0.001" placeholder="0.005" />
            </Field>
          </div>

          <Field label="Capacity" hint="0 = unlimited seats.">
            <input
              type="number"
              min="0"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="w-full bg-bg-elevated text-text-primary placeholder:text-text-muted rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </Field>

          <ProgressList
            steps={[
              { label: 'Create group on-chain', state: stateFor('create', createTx, createReceipt) },
              { label: xmtp ? 'Create XMTP group' : 'Connect XMTP', state: !onChainDone ? 'pending' : !xmtp ? (initializing ? 'loading' : 'pending') : creatingXmtp ? 'loading' : xmtpError ? 'error' : xmtpDone ? 'done' : 'pending' },
              { label: 'Link XMTP id on-chain', state: !xmtpDone ? 'pending' : linkTx.isPending || linkReceipt.isLoading ? 'loading' : linkDone ? 'done' : 'pending' },
            ]}
          />

          {(txError || xmtpError) && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 break-words">
                {xmtpError ?? (txError as any)?.shortMessage ?? (txError as any)?.message ?? String(txError)}
              </div>
            </div>
          )}

          {/* Primary action */}
          {!createTx.data ? (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium"
            >
              <Sparkles size={16} /> {nameMissing ? 'Add a group name' : priceMissing ? 'Set a price first' : 'Create paid group'}
            </button>
          ) : onChainDone && !xmtp ? (
            <button
              onClick={() => initXmtp()}
              disabled={initializing}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium"
            >
              {initializing ? <><Loader2 size={16} className="animate-spin" /> Connecting…</> : <>Connect XMTP to finish setup</>}
            </button>
          ) : (
            <button
              disabled
              className="w-full bg-bg-elevated text-text-muted rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium"
            >
              <Loader2 size={16} className="animate-spin" /> Setting up your group…
            </button>
          )}

          <div className="text-[11px] text-text-muted text-center">
            Two on-chain transactions total. Group is non-custodial: payments settle directly to your wallet.
          </div>
        </div>
      </div>
    </main>
  );
}

type Step = 'pending' | 'loading' | 'done' | 'error';

function stateFor(_kind: string, write: { isPending: boolean; data: unknown }, receipt: { isLoading: boolean; isSuccess: boolean; isError: boolean }): Step {
  if (receipt.isSuccess) return 'done';
  if (receipt.isError) return 'error';
  if (write.isPending || receipt.isLoading) return 'loading';
  if (write.data) return 'loading';
  return 'pending';
}

function ProgressList({ steps }: { steps: { label: string; state: Step }[] }) {
  return (
    <ol className="space-y-2 bg-bg-elevated rounded-2xl p-4">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <StepIcon state={s.state} />
          <span className={s.state === 'done' ? 'text-text-primary' : s.state === 'loading' ? 'text-text-primary' : s.state === 'error' ? 'text-red-300' : 'text-text-muted'}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: Step }) {
  if (state === 'done') return <CheckCircle2 size={16} className="text-brand shrink-0" />;
  if (state === 'loading') return <Loader2 size={16} className="text-brand animate-spin shrink-0" />;
  if (state === 'error') return <AlertCircle size={16} className="text-red-400 shrink-0" />;
  return <div className="w-4 h-4 rounded-full border border-border-strong shrink-0" />;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm text-text-primary font-medium mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </div>
      {children}
      {hint && <div className="text-[11px] text-text-muted mt-1.5">{hint}</div>}
    </label>
  );
}

function PriceInput({ value, onChange, unit, step, placeholder }: { value: string; onChange: (v: string) => void; unit: string; step: string; placeholder: string }) {
  return (
    <div className="flex items-center bg-bg-elevated rounded-xl px-4 py-3 focus-within:ring-1 focus-within:ring-brand">
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none text-base"
      />
      <span className="text-text-muted text-sm font-medium">{unit}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-elevated rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-mono">{label}</div>
      <div className="text-sm text-text-primary mt-1 font-medium">{value}</div>
    </div>
  );
}

// XMTP V3 group IDs are hex strings; the contract stores a bytes32. Truncate / pad
// to 32 bytes so they fit. Recipients on the dapp read the bytes32 and look up the
// XMTP group via client.conversations.getConversationById(hexId).
function xmtpStringIdToBytes32(id: string): `0x${string}` {
  const hex = id.startsWith('0x') ? id.slice(2) : id;
  const trimmed = hex.length > 64 ? hex.slice(0, 64) : hex.padStart(64, '0');
  return `0x${trimmed}` as `0x${string}`;
}
