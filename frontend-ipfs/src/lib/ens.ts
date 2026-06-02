import { encodeFunctionData, sha256, type Hex } from 'viem';

// ── Mainnet ENS contracts (ensdomains/ens-contracts deployments) ──
export const ETH_REGISTRAR_CONTROLLER = '0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547' as const;
export const PUBLIC_RESOLVER = '0xF29100983E058B709F3D539b0c765937B804AC15' as const;
export const AVATAR_UPLOAD_BASE = 'https://euc.li' as const;
export const SECONDS_PER_YEAR = 31_536_000n; // 365 days

// reverseRecord bitfield: 1 = set the ETH (mainnet) primary name.
export const REVERSE_RECORD_ETH = 1;
export const ZERO_REFERRER = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export type Registration = {
  label: string;
  owner: `0x${string}`;
  duration: bigint;
  secret: Hex;
  resolver: `0x${string}`;
  data: Hex[];
  reverseRecord: number;
  referrer: Hex;
};

const registrationTuple = {
  name: 'registration',
  type: 'tuple',
  components: [
    { name: 'label', type: 'string' },
    { name: 'owner', type: 'address' },
    { name: 'duration', type: 'uint256' },
    { name: 'secret', type: 'bytes32' },
    { name: 'resolver', type: 'address' },
    { name: 'data', type: 'bytes[]' },
    { name: 'reverseRecord', type: 'uint8' },
    { name: 'referrer', type: 'bytes32' },
  ],
} as const;

export const ethRegistrarControllerAbi = [
  { type: 'function', name: 'available', stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'rentPrice', stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }, { name: 'duration', type: 'uint256' }],
    outputs: [{ name: 'price', type: 'tuple', components: [
      { name: 'base', type: 'uint256' }, { name: 'premium', type: 'uint256' },
    ] }] },
  { type: 'function', name: 'minCommitmentAge', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxCommitmentAge', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'makeCommitment', stateMutability: 'pure',
    inputs: [registrationTuple], outputs: [{ name: 'commitment', type: 'bytes32' }] },
  { type: 'function', name: 'commit', stateMutability: 'nonpayable',
    inputs: [{ name: 'commitment', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'register', stateMutability: 'payable',
    inputs: [registrationTuple], outputs: [] },
] as const;

export const publicResolverAbi = [
  { type: 'function', name: 'setAddr', stateMutability: 'nonpayable',
    inputs: [{ name: 'node', type: 'bytes32' }, { name: 'a', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setText', stateMutability: 'nonpayable',
    inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }, { name: 'value', type: 'string' }], outputs: [] },
  { type: 'function', name: 'multicall', stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ type: 'bytes[]' }] },
] as const;

/** Text-record keys we let users edit; mirrors the chips shown on the profile. */
export const EDITABLE_TEXT_KEYS = ['description', 'url', 'com.twitter', 'com.github'] as const;
export type TextKey = (typeof EDITABLE_TEXT_KEYS)[number];

/** 32 cryptographically-random bytes for the commit/reveal secret. */
export function generateSecret(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

/**
 * Build the resolver `data[]` payload bundled into a register() call:
 * a setAddr (so the name resolves to the owner) plus a setText per record.
 */
export function buildResolverData(
  node: Hex,
  opts: { addr?: `0x${string}`; texts?: Partial<Record<string, string>> },
): Hex[] {
  const calls: Hex[] = [];
  if (opts.addr) {
    calls.push(encodeFunctionData({ abi: publicResolverAbi, functionName: 'setAddr', args: [node, opts.addr] }));
  }
  for (const [key, value] of Object.entries(opts.texts ?? {})) {
    if (value && value.trim()) {
      calls.push(encodeFunctionData({ abi: publicResolverAbi, functionName: 'setText', args: [node, key, value.trim()] }));
    }
  }
  return calls;
}

function dataURLToBytes(dataURL: string): Uint8Array {
  const base64 = dataURL.split(',')[1];
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Load an image File, center-crop to a square, and downscale to a JPEG data URL. */
export function resizeImageToDataURL(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const size = Math.min(side, max);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unsupported'));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

type SignTypedDataAsync = (args: {
  domain: { name: string; version: string };
  primaryType: 'Upload';
  types: { Upload: { name: string; type: string }[] };
  message: { upload: string; expiry: string; name: string; hash: string };
}) => Promise<Hex>;

/**
 * Upload an avatar image to the ENS Labs avatar service (euc.li), authenticated
 * by an EIP-712 signature. Mirrors ens-app-v3's AvatarUpload flow. Returns the
 * URL to store in the `avatar` text record. Name must already be owned.
 */
export async function uploadAvatar(params: {
  name: string;
  address: `0x${string}`;
  dataURL: string;
  signTypedDataAsync: SignTypedDataAsync;
}): Promise<string> {
  const { name, address, dataURL, signTypedDataAsync } = params;
  const endpoint = `${AVATAR_UPLOAD_BASE}/${name}`;
  const hash = sha256(dataURLToBytes(dataURL)); // 0x-prefixed hex
  const expiry = `${Date.now() + 1000 * 60 * 60 * 24 * 7}`;

  const sig = await signTypedDataAsync({
    domain: { name: 'Ethereum Name Service', version: '1' },
    primaryType: 'Upload',
    types: {
      Upload: [
        { name: 'upload', type: 'string' },
        { name: 'expiry', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'hash', type: 'string' },
      ],
    },
    message: { upload: 'avatar', expiry, name, hash },
  });

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress: address }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (json.message === 'uploaded') return endpoint;
  throw new Error(json.error || 'Avatar upload failed');
}
