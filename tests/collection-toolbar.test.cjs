const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

function viewMarkup(id, nextId) {
  const start = html.indexOf(`<section id="${id}"`);
  const end = nextId ? html.indexOf(`<section id="${nextId}"`, start) : html.length;
  assert.ok(start >= 0 && end > start, `Could not isolate ${id}`);
  return html.slice(start, end);
}

for (const [id, nextId] of [
  ['encountersView', 'partiesView'],
  ['partiesView', 'monstersView'],
  ['monstersView', 'npcsView'],
  ['npcsView', 'spellsView'],
  ['spellsView', 'diceView'],
]) {
  assert.match(viewMarkup(id, nextId), /class="[^"]*collection-toolbar[^"]*"/, `${id} needs pinned collection controls`);
}

assert.match(html, /id="partySearch"[^>]*placeholder="Search parties, characters, players, or classes/);
for (const filterId of ['monsterCrFilter','monsterSizeFilter','monsterTypeFilter','monsterAlignmentFilter']) {
  assert.match(html, new RegExp(`id="${filterId}"`), `Missing Bestiary filter: ${filterId}`);
}
assert.match(app, /monsterSizeFilter.*monsterTypeFilter.*monsterAlignmentFilter/);
assert.match(css, /\.collection-toolbar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
assert.match(app, /e\.target\.id==='partySearch'\)renderParties\(\)/);
assert.match(app, /p\.members\.flatMap\(member=>\[member\.name,member\.player,member\.className\]\)/);

console.log('Echoes pinned collection toolbar tests passed');
