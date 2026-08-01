const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicates, [], `Duplicate HTML IDs: ${duplicates.join(', ')}`);
assert.match(html, /five-tools-import\.js\?v=1/);
assert.match(html, /library-core\.js\?v=21/);
assert.doesNotMatch(html, /monsters\.js|spells\.js/);
assert.match(html, /library-storage\.js\?v=22/);
assert.doesNotMatch(html, /pwa-data\.js/);

console.log('Echoes HTML structure tests passed');
