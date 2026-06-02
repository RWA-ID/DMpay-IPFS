import { useEffect, useRef, useState } from 'react';
import { usePublicClient, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { namehash, normalize } from 'viem/ens';
import { Loader2, Save, CheckCircle2, AlertCircle, ImagePlus, Camera } from 'lucide-react';
import { Avatar } from './Avatar';
import {
  EDITABLE_TEXT_KEYS, publicResolverAbi, resizeImageToDataURL, uploadAvatar, type TextKey,
} from '../lib/ens';

const FIELD_LABELS: Record<TextKey, { label: string; placeholder: string }> = {
  'description': { label: 'Bio', placeholder: 'Founder, investor, degen…' },
  'url': { label: 'Website', placeholder: 'https://yoursite.xyz' },
  'com.twitter': { label: 'X / Twitter', placeholder: 'yourhandle' },
  'com.github': { label: 'GitHub', placeholder: 'yourhandle' },
};

/**
 * Edit ENS records + avatar for a name the connected wallet owns. Avatar is
 * uploaded to the euc.li service (signature only), then its URL plus any
 * changed text records are written in a single resolver multicall.
 */
export function EnsRecordsEditor({
  name,
  address,
  initialAvatarUrl,
  onSaved,
}: {
  name: string;
  address: `0x${string}`;
  initialAvatarUrl?: string;
  onSaved?: () => void;
}) {
  const normalized = safeNormalize(name);
  const node = normalized ? (namehash(normalized) as `0x${string}`) : undefined;
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const fileRef = useRef<HTMLInputElement>(null);

  const [resolver, setResolver] = useState<`0x${string}` | null>(null);
  const [resolverChecked, setResolverChecked] = useState(false);

  const [initial, setInitial] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [avatarUrl, setAvatarUrl] = useState<string>(initialAvatarUrl ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Resolve the name's resolver + load current text records.
  useEffect(() => {
    if (!publicClient || !normalized) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await publicClient.getEnsResolver({ name: normalized }).catch(() => null);
        if (cancelled) return;
        setResolver(r);
        setResolverChecked(true);
        const entries = await Promise.all(
          EDITABLE_TEXT_KEYS.map(async (key) => {
            const v = await publicClient.getEnsText({ name: normalized, key }).catch(() => null);
            return [key, v ?? ''] as const;
          }),
        );
        if (cancelled) return;
        const loaded = Object.fromEntries(entries);
        setInitial(loaded);
        setValues(loaded);
      } catch {
        if (!cancelled) setResolverChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient, normalized]);

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });
  const error = localError ?? (writeError as any)?.shortMessage ?? writeError?.message ?? receiptError?.message ?? null;
  const busy = isPending || confirming || uploadingAvatar;

  useEffect(() => {
    if (isSuccess) {
      setInitial((prev) => ({ ...prev, ...values, avatar: avatarUrl }));
      const t = setTimeout(() => onSaved?.(), 800);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePickAvatar(file: File) {
    setLocalError(null);
    reset();
    try {
      setUploadingAvatar(true);
      const dataURL = await resizeImageToDataURL(file, 512);
      setAvatarPreview(dataURL);
      const url = await uploadAvatar({ name: normalized!, address, dataURL, signTypedDataAsync });
      setAvatarUrl(url);
    } catch (e: any) {
      setLocalError(e?.message ?? 'Avatar upload failed');
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  }

  function save() {
    if (!node || !resolver) return;
    setLocalError(null);
    reset();
    const calls: `0x${string}`[] = [];
    for (const key of EDITABLE_TEXT_KEYS) {
      const next = (values[key] ?? '').trim();
      if (next !== (initial[key] ?? '')) {
        calls.push(encodeText(node, key, next));
      }
    }
    if (avatarUrl && avatarUrl !== (initial.avatar ?? initialAvatarUrl ?? '')) {
      calls.push(encodeText(node, 'avatar', avatarUrl));
    }
    if (calls.length === 0) { setLocalError('No changes to save.'); return; }
    writeContract({ address: resolver, abi: publicResolverAbi, functionName: 'multicall', args: [calls] });
  }

  if (!normalized) {
    return <div className="text-sm text-text-secondary">Invalid ENS name.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={avatarPreview || avatarUrl || undefined} fallback={name[0]} size={72} />
          {uploadingAvatar && (
            <div className="absolute inset-0 rounded-full bg-black/50 grid place-items-center">
              <Loader2 size={18} className="animate-spin text-white" />
            </div>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickAvatar(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-bg-elevated hover:bg-bg-hover border border-border-subtle text-text-primary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {avatarUrl ? <Camera size={14} /> : <ImagePlus size={14} />}
            {avatarUrl ? 'Change avatar' : 'Upload avatar'}
          </button>
          <div className="text-[11px] text-text-muted mt-1.5 max-w-[220px]">
            Hosted by ENS · signature only, no gas. Saved to your ENS profile on Save.
          </div>
        </div>
      </div>

      {/* Text records */}
      <div className="grid gap-4">
        {EDITABLE_TEXT_KEYS.map((key) => (
          <label key={key} className="block">
            <div className="text-sm text-text-secondary mb-1.5">{FIELD_LABELS[key].label}</div>
            <input
              value={values[key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              placeholder={FIELD_LABELS[key].placeholder}
              className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand text-[15px]"
            />
          </label>
        ))}
      </div>

      {resolverChecked && !resolver && (
        <div className="bg-amber-500/5 border border-amber-500/30 text-text-secondary text-xs rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div><span className="text-text-primary font-medium">No resolver set</span> for {name}. Set a resolver in the ENS app first, then records can be edited here.</div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 break-words">{error}</div>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy || (resolverChecked && !resolver)}
        className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        {busy ? <><Loader2 size={16} className="animate-spin" /> {uploadingAvatar ? 'Uploading avatar…' : isPending ? 'Confirm in wallet…' : 'Saving on-chain…'}</> :
         isSuccess ? <><CheckCircle2 size={16} /> Saved</> :
         <><Save size={16} /> Save records</>}
      </button>
    </div>
  );
}

function encodeText(node: `0x${string}`, key: string, value: string): `0x${string}` {
  return encodeFunctionData({ abi: publicResolverAbi, functionName: 'setText', args: [node, key, value] });
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
