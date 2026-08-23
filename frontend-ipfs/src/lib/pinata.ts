/**
 * IPFS uploads for XMTP attachments and group avatars.
 *
 * These used to pin straight to api.pinata.cloud with a `VITE_PINATA_JWT`,
 * which meant the key was compiled into this bundle — and this bundle is
 * pinned to IPFS, which cannot be unpublished. The key was therefore readable
 * by anyone, permanently, in every version of the app ever pinned. Uploads now
 * go through `/api/upload` on the Pages host, which holds the key server-side.
 *
 * Nothing about the encryption changed: ciphertext is still produced in the
 * browser by XMTP's encryptAttachment, and the endpoint only ever sees bytes
 * it cannot read. What moved is the credential, not the trust boundary.
 */

import { API_URL } from './site';

// gateway.pinata.cloud gates public reads (403s for unauthenticated fetches), so
// anything a *third party* must load — e.g. a group avatar in someone else's
// client — is handed out on a public gateway instead.
const GATEWAY = 'https://gateway.pinata.cloud/ipfs';
const PUBLIC_GATEWAY = 'https://ipfs.io/ipfs';

/**
 * Post one file to the upload proxy and return its CID.
 *
 * Errors are phrased for the composer, which renders `err.message` directly to
 * the sender. The endpoint's own JSON error is preferred when there is one,
 * since it knows why it refused; the status-code fallbacks cover the cases
 * where the response is not ours at all (a gateway 502, an outage page).
 */
async function pin(file: Blob, kind: 'encrypted' | 'public', name: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, name);
  form.append('kind', kind);
  form.append('name', name);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: form });
  } catch {
    throw new Error('Could not reach the upload service. Check your connection and try again.');
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => undefined);
    if (res.status === 413) throw new Error('That file is too large to send.');
    if (res.status === 415) throw new Error('That file type is not supported.');
    if (res.status === 429) throw new Error('Too many uploads just now — wait a minute and try again.');
    throw new Error(detail ? `Upload failed: ${detail}` : `Upload failed (${res.status}).`);
  }

  const { cid } = (await res.json()) as { cid?: string };
  if (!cid) throw new Error('Upload failed: no CID returned.');
  return cid;
}

export async function uploadEncryptedToPinata(
  ciphertext: Uint8Array,
  filename = 'xmtp-attachment.bin',
): Promise<string> {
  const blob = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });
  return `${GATEWAY}/${await pin(blob, 'encrypted', filename)}`;
}

export async function fetchAttachment(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Upload a public (unencrypted) file — group avatars. Distinct from
 * uploadEncryptedToPinata: nothing here is confidential, and the returned
 * gateway URL is embedded in XMTP group metadata for every member to fetch.
 */
export async function uploadPublicToPinata(file: File): Promise<string> {
  return `${PUBLIC_GATEWAY}/${await pin(file, 'public', file.name)}`;
}
