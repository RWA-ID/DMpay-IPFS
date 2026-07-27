import { useState } from 'react';
import type { Group } from '@xmtp/browser-sdk';
import { Loader2, X, Image as ImageIcon } from 'lucide-react';
import { uploadPublicToPinata } from '../lib/pinata';
import { GroupAvatar } from './GroupAvatar';
import type { GroupMeta } from './GroupView';

/**
 * Creator-only editor for XMTP group metadata. Groups created before the
 * metadata keys were fixed have no name or image at all, so this is also the
 * repair path for them.
 */
export function GroupSettings({ convo, initial, onClose, onSaved }: {
  convo: Group<unknown>;
  initial: GroupMeta;
  onClose: () => void;
  onSaved: (meta: GroupMeta) => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(initial.imageUrl);
  const [preview, setPreview] = useState<string | null>(initial.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== initial.name) await convo.updateName(trimmed);
      if (imageUrl && imageUrl !== initial.imageUrl) await convo.updateImageUrl(imageUrl);
      onSaved({ name: trimmed || initial.name, imageUrl: imageUrl ?? initial.imageUrl });
    } catch (err: unknown) {
      console.error('group settings save failed', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-bg-panel border border-border-subtle rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-text-primary font-semibold">Group settings</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-bg-hover">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <GroupAvatar src={preview} seed={convo.id} name={name} size={56} />
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

        {error && <div className="mb-4 text-danger text-sm break-words">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || uploading}
            className="flex-1 bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl px-5 py-3 font-medium inline-flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save'}
          </button>
          <button onClick={onClose} className="bg-bg-elevated hover:bg-bg-hover text-text-primary rounded-2xl px-5 py-3 font-medium">
            Cancel
          </button>
        </div>

        <p className="text-xs text-text-muted mt-4 leading-relaxed">
          Name and image are stored in XMTP group metadata and sync to every member.
        </p>
      </div>
    </div>
  );
}
