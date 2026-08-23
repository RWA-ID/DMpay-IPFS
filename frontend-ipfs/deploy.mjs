import fs from 'fs';
import path from 'path';
import { PinataSDK } from 'pinata';

const envFile = fs.existsSync('.env.local') ? '.env.local' : '.env';
const env = fs.readFileSync(envFile, 'utf8');
// Anchored to the line start so this cannot match VITE_PINATA_JWT as a
// substring. That prefix compiles a key into the browser bundle, the bundle
// gets pinned to IPFS, and IPFS cannot be unpublished — a deploy key must
// never be one, and picking one up silently is how it would happen.
const jwt = env.match(/^PINATA_JWT=(.*)$/m)?.[1]?.trim();
if (!jwt) {
  console.error('Missing PINATA_JWT in', envFile);
  process.exit(1);
}
const pinata = new PinataSDK({ pinataJwt: jwt });

async function uploadFolder() {
  const distPath = './dist';
  if (!fs.existsSync(distPath)) {
    console.error('No dist/ — run `npm run build` first.');
    process.exit(1);
  }
  const files = [];
  function addFiles(dirPath, basePath) {
    for (const item of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, item);
      const relativePath = basePath ? `${basePath}/${item}` : item;
      if (fs.statSync(fullPath).isDirectory()) {
        addFiles(fullPath, relativePath);
      } else {
        const ext = path.extname(item);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.ico': 'image/x-icon',
          '.wasm': 'application/wasm',
          '.json': 'application/json',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const buffer = fs.readFileSync(fullPath);
        const blob = new Blob([buffer], { type: contentType });
        files.push(new File([blob], relativePath, { type: contentType }));
      }
    }
  }
  addFiles(distPath, '');
  console.log(`Uploading ${files.length} files to IPFS via Pinata…`);
  const result = await pinata.upload.public.fileArray(files);
  console.log('\n✅ Pinned to IPFS');
  console.log('CID :', result.cid);
  console.log('URL :', `https://gateway.pinata.cloud/ipfs/${result.cid}`);
  console.log('\nSet this as the ENS contenthash on dmpay-ipfs.eth (or any name you own):');
  console.log(`  ipfs://${result.cid}`);
}

uploadFolder().catch((e) => { console.error(e); process.exit(1); });
