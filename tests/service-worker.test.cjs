const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('service-worker.js', 'utf8');
const shellBlock = worker.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert.ok(shellBlock, 'APP_SHELL declaration was not found');
const entries = [...shellBlock[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const entry of entries) {
  if (entry === './') continue;
  const localPath = entry.replace(/^\.\//, '').split('?')[0];
  assert.ok(fs.existsSync(localPath), `Missing service-worker asset: ${localPath}`);
}
assert.match(worker, /echoes-app-v27/);

console.log('Echoes service-worker asset tests passed');
