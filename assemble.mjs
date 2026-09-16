import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync(new URL('./publication/manifest.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const chunks = manifest.parts.map(part => {
  if (!/^publication\/part-\d{3}\.bin$/.test(part.path)) throw Error('Invalid part path');
  const bytes = readFileSync(new URL(part.path, import.meta.url));
  if (bytes.length !== part.bytes || hash(bytes) !== part.sha256) throw Error(`Integrity failure: ${part.path}`);
  return bytes;
});
const html = Buffer.concat(chunks);
if (html.length !== manifest.bytes || hash(html) !== manifest.sha256) throw Error('HTML integrity failure');
mkdirSync(new URL('./_site/', import.meta.url), { recursive: true });
writeFileSync(new URL('./_site/index.html', import.meta.url), html);
writeFileSync(new URL('./_site/.nojekyll', import.meta.url), '');
console.log(`Verified index.html: ${html.length} bytes, SHA256 ${hash(html)}`);

