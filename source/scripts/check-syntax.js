'use strict';
// Simple syntax gate: node --check every JS file in the project.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['src', 'extension', 'scripts'];
let files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r);

let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f]); process.stdout.write('.'); }
  catch (e) { failed++; console.error('\nSYNTAX ERROR in ' + f + '\n' + e.stdout + e.stderr); }
}
console.log(`\n${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);
