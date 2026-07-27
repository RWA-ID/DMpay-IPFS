import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { namehash } from 'viem/ens';
import type { Group } from '@xmtp/browser-sdk';
import { Loader2, X, Image as ImageIcon, Globe, CheckCircle2 } from 'lucide-react';
import { uploadPublicToPinata } from '../lib/pinata';
import { publicResolverAbi } from '../lib/ens';
import { encodeGroupMeta, groupTextKey, verifiedEnsName } from '../lib/groupMeta';
import { GroupAvatar } from './GroupAvatar';
import type { GroupMeta } from './GroupView';

/**
 * Creator-only editor for group identity. Writes to two places, deliberately:
 *
 *   XMTP group metadata — the real thing, encrypted, members only.
 *   An ENS text record on the creator's name — a public copy, so the group has
 *   a name and image on Discover, on profiles, and in a shared link.
 *
 * The public copy is optional and costs a transaction, so it's opt-in. When
 * it's skipped the two can drift, which is why members always read the XMTP
 * value and only outsiders fall back to the published one.
 */
export function GroupSettings({ id, convo, initial, onClose, onSaved }: {
  id: bigint;
  convo: Group<unknown>;
  initial: GroupMeta;
  onClose: () => void;
  onSaved: (meta: GroupMeta) => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [name, setName] = useState(initial.name ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(initial.imageUrl);
  const [preview, setPreview] = useState<string | null>(initial.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedXmtp, setSavedXmtp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Publishing needs a name the creator provably owns and a resolver we can
  // write to. Either being absent turns the option off rather than failing later.
  const [ensName, setEnsName] = useState<string | null>(null);
  const [resolver, setResolver] = useState<`0x${string}` | null>(null);
  const [ensChecked, setEnsChecked] = useState(false);
  const [publish, setPublish] = useState(true);

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: didPublish, error: receiptError } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!address || !publicClient) return;
    let cancelled = false;
    (async () => {
      const verified = await verifiedEnsName(address);
      if (cancelled) return;
      setEnsName(verified);
      if (verified) {
        const r = await publicClient.getEnsResolver({ name: verified }).catch(() => null);
        if (!cancelled) setResolver(r);
      }
      if (!cancelled) setEnsChecked(true);
    })();
    return () => { cancelled = true; };
  }, [address, publicClient]);

  const canPublish = !!ensName && !!resolver;

  // The XMTP write already landed before the tx was signed; close out once the
  // publish confirms so the modal doesn't outlive the work it was opened for.
  useEffect(() => {
    if (!didPublish) return;
    const t = setTimeout(() => {
      onSaved({ name: name.trim() || initial.name, imageUrl: imageUrl ?? initial.imageUrl });
    }, 900);
    return () => clearTimeout(t);
  }, [didPublish]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Pick an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large (max 5 MB).'); return; }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      setImageUrl(await uploadPublicToPinata(file));
    } catch (err: unknown) {
      console.error('group image upload failed', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreview(initial.imageUrl);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    reset();
    const trimmed = name.trim();
    try {
      // XMTP first: it's the source of truth and needs no gas, so a rejected
      // publish tx still leaves members with the right name.
      if (trimmed && trimmed !== initial.name) await convo.updateName(trimmed);
      if (imageUrl && imageUrl !== initial.imageUrl) await convo.updateImageUrl(imageUrl);
      setSavedXmtp(true);
    } catch (err: unknown) {
      console.error('group settings save failed', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
      return;
    }

    if (publish && canPublish) {
      writeContract({
        address: resolver!,
        abi: publicResolverAbi,
        functionName: 'setText',
        args: [
          namehash(ensName!) as `0x${string}`,
          groupTextKey(id),
          encodeGroupMeta({ name: trimmed || initial.name, image: imageUrl ?? initial.imageUrl }),
        ],
      });
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved({ name: trimmed || initial.name, imageUrl: imageUrl ?? initial.imageUrl });
  }

  const txError = (writeError as any)?.shortMessage ?? writeError?.message ?? receiptError?.message ?? null;
  const busy = saving || uploading || isPending || confirming;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-md bg-bg-panel border border-border-subtle rounded-3xl p-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-text-primary font-semibold">Group settings</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-bg-hover">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <GroupAvatar src={preview} seed={id.toString()} name={name} size={56} />
          <label className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-xl px-4 py-2.5 text-sm cursor-pointer">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
            {uploading ? 'Uploading…' : imageUrl ? 'Replace image' : 'Choose image'}
            <input type="file" accept="image/*" onChange={onPick} className="hidden" disabled={uploading} />
          </label>
        </div>

        <label className="block mb-5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Group name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alpha leaks chat"
            maxLength={60}
            className="mt-2 w-full bg-bg-elevated text-text-primary placeholder:text-text-muted rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </label>

        {/* ── The public copy ── */}
        <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-4 mb-5">
          <label className={`flex items-start gap-3 ${canPublish ? 'cursor-pointer' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={publish && canPublish}
              disabled={!canPublish || busy}
              onChange={(e) => setPublish(e.target.checked)}
              className="mt-0.5 accent-current"
            />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-text-primary inline-flex items-center gap-1.5">
                <Globe size={12} /> Publish publicly
              </div>
              <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed">
                {!ensChecked ? (
                  'Checking your ENS name…'
                ) : !ensName ? (
                  `Needs an ENS name set as your primary name. Without one, non-members see “Group #${id.toString()}”.`
                ) : !resolver ? (
                  `${ensName} has no resolver set. Set one in the ENS app, then publish from here.`
                ) : (
                  <>
                    Writes the name and image to{' '}
                    <span className="font-mono text-text-secondary">{groupTextKey(id)}</span> on{' '}
                    <span className="font-mono text-text-secondary">{ensName}</span>, so Discover,
                    profiles and shared links can show them. One transaction.
                  </>
                )}
              </div>
            </div>
          </label>
        </div>

        {savedXmtp && !didPublish && (isPending || confirming) && (
          <div className="mb-4 text-[12px] text-text-secondary inline-flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" />
            {isPending ? 'Confirm the publish transaction…' : 'Publishing to ENS…'}
          </div>
        )}
        {didPublish && (
          <div className="mb-4 text-[12px] text-brand inline-flex items-center gap-2">
            <CheckCircle2 size={13} /> Published — anyone can see this group's name and image now.
          </div>
        )}
        {savedXmtp && txError && (
          <div className="mb-4 text-[12px] text-danger break-words">
            Saved for members, but publishing failed: {txError}
          </div>
        )}
        {error && <div className="mb-4 text-danger text-sm break-words">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy || didPublish}
            className="flex-1 bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-5 py-3 font-medium inline-flex items-center justify-center gap-2"
          >
            {busy
              ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
              : publish && canPublish ? 'Save & publish' : 'Save'}
          </button>
          <button onClick={onClose} className="bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-2xl px-5 py-3 font-medium">
            {didPublish ? 'Done' : 'Cancel'}
          </button>
        </div>

        <p className="text-xs text-text-muted mt-4 leading-relaxed">
          Members always read the name and image from the encrypted XMTP group. The public copy is
          what everyone else sees, so re-publish after a rename to keep the two in step.
        </p>
      </div>
    </div>
  );
}
