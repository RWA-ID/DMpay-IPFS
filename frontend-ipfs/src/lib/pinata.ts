/**
 * Browser-side Pinata uploader for XMTP encrypted attachments.
 * Receives already-encrypted ciphertext from RemoteAttachmentCodec.encodeEncrypted
 * and pins it to IPFS, returning a gateway URL the recipient can fetch.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string | undefined;
const GATEWAY = 'https://gateway.pinata.cloud/ipfs';
// gateway.pinata.cloud gates public reads (403s for unauthenticated fetches), so
// anything a *third party* must load — e.g. a group avatar in someone else's
// client — is handed out on a public gateway instead.
const PUBLIC_GATEWAY = 'https://ipfs.io/ipfs';

export async function uploadEncryptedToPinata(ciphertext: Uint8Array, filename = 'xmtp-attachment.bin'): Promise<string> {
  if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT is not configured');
  const blob = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('pinataMetadata', JSON.stringify({ name: `dmpay-${filename}` }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return `${GATEWAY}/${IpfsHash}`;
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
  if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT is not configured');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('pinataMetadata', JSON.stringify({ name: `dmpay-group-${file.name}` }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return `${PUBLIC_GATEWAY}/${IpfsHash}`;
}
