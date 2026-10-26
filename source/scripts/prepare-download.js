'use strict';
// Run after electron-builder (see the build:* scripts in package.json).
// Finishes the ../download folder that end users get:
//   - copies the browser extension to download/extension/
//   - writes download/SHA256SUMS.txt for every installer/portable build, so
//     people can check they got the genuine file.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, '..', 'download');
const exts = ['.exe', '.msi', '.dmg', '.appimage', '.zip'];

if (!fs.existsSync(dir)) {
  console.error('No ../download folder — run a build first.');
  process.exit(1);
}

// 1. Browser extension (users load it unpacked from this folder).
const extDest = path.join(dir, 'extension');
fs.rmSync(extDest, { recursive: true, force: true });
fs.cpSync(path.join(root, 'extension'), extDest, { recursive: true });
console.log(`Copied extension to ${path.relative(root, extDest)}`);

// 2. Checksums. Skip electron-builder's temporary helpers (names starting with "__").
const files = fs.readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isFile() && !e.name.startsWith('__') && exts.includes(path.extname(e.name).toLowerCase()))
  .map((e) => e.name)
  .sort();

const lines = files.map((name) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
  return `${hash}  ${name}`;
});

fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n') || 'No build artifacts found.');
console.log(`\nWrote ${path.relative(root, path.join(dir, 'SHA256SUMS.txt'))}`);
