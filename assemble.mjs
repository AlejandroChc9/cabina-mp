import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const manifest = JSON.parse(readFileSync(new URL('./publication/manifest.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let html;
if (manifest.format === 2 && manifest.compression === 'gzip') {
  if (manifest.payload?.path !== 'publication/dashboard.html.gz') throw Error('Invalid payload path');
  const packed = readFileSync(new URL(manifest.payload.path, import.meta.url));
  if (packed.length !== manifest.payload.bytes || hash(packed) !== manifest.payload.sha256) throw Error('Packed payload integrity failure');
  html = gunzipSync(packed);
} else {
  const chunks = manifest.parts.map(part => {
    if (!/^publication\/part-\d{3}\.bin$/.test(part.path)) throw Error('Invalid part path');
    const bytes = readFileSync(new URL(part.path, import.meta.url));
    if (bytes.length !== part.bytes || hash(bytes) !== part.sha256) throw Error(`Integrity failure: ${part.path}`);
    return bytes;
  });
  html = Buffer.concat(chunks);
}
if (html.length !== manifest.bytes || hash(html) !== manifest.sha256) throw Error('HTML integrity failure');
mkdirSync(new URL('./_site/', import.meta.url), { recursive: true });
writeFileSync(new URL('./_site/index.html', import.meta.url), html);
writeFileSync(new URL('./_site/.nojekyll', import.meta.url), '');
console.log(`Verified index.html: ${html.length} bytes, SHA256 ${hash(html)}`);

