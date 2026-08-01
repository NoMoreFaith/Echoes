const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicates, [], `Duplicate HTML IDs: ${duplicates.join(', ')}`);
assert.match(html, /five-tools-import\.js\?v=2/);
assert.match(html, /library-core\.js\?v=21/);
assert.doesNotMatch(html, /monsters\.js|spells\.js/);
assert.match(html, /library-storage\.js\?v=22/);
assert.doesNotMatch(html, /pwa-data\.js/);
assert.match(html, /data-view="combat"[^>]*>[\s\S]*?⚔️/);
assert.match(html, /data-view="encounters"[^>]*>[\s\S]*?📍/);
assert.match(html, /data-view="parties"[^>]*>[\s\S]*?👥/);
assert.match(html, /data-view="monsters"[^>]*>[\s\S]*?🐉/);
assert.match(html, /data-view="npcs"[^>]*>[\s\S]*?👤/);
assert.match(html, /data-view="spells"[^>]*>[\s\S]*?✨/);
assert.match(html, /data-view="dice"[^>]*>[\s\S]*?🎲/);

console.log('Echoes HTML structure tests passed');
