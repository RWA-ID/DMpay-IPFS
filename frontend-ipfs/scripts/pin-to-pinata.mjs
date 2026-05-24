#!/usr/bin/env node
// Pin dist/ directory to Pinata. Reads VITE_PINATA_JWT from .env.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const distDir = join(root, 'dist');

// Load .env (no dotenv dep — tiny parse)
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const JWT = env.VITE_PINATA_JWT;
if (!JWT) { console.error('VITE_PINATA_JWT missing'); process.exit(1); }

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(distDir);
console.log(`Pinning ${files.length} files (${(files.reduce((a, f) => a + statSync(f).size, 0) / 1024 / 1024).toFixed(2)} MB)…`);

const form = new FormData();
const wrapper = 'dmpay-ipfs';
for (const file of files) {
  const buf = readFileSync(file);
  const rel = relative(distDir, file).split('\\').join('/');
  form.append('file', new Blob([buf]), `${wrapper}/${rel}`);
}
form.append('pinataMetadata', JSON.stringify({ name: `dmpay-ipfs-${new Date().toISOString().slice(0, 10)}` }));
form.append('pinataOptions', JSON.stringify({ wrapWithDirectory: false, cidVersion: 1 }));

const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${JWT}` },
  body: form,
});
const body = await res.text();
if (!res.ok) { console.error('Pin failed:', res.status, body); process.exit(1); }
const { IpfsHash, PinSize } = JSON.parse(body);
console.log('\n✅ Pinned to IPFS');
console.log('CID :', IpfsHash);
console.log('Size:', (PinSize / 1024 / 1024).toFixed(2), 'MB');
console.log(`Preview: https://${IpfsHash}.ipfs.dweb.link/`);
console.log(`         https://gateway.pinata.cloud/ipfs/${IpfsHash}/`);
console.log('\nNext: set contenthash on ENS to ipfs://' + IpfsHash);
