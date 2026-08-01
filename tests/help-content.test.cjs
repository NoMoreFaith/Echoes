const assert = require('assert');
const fs = require('fs');

const guide = fs.readFileSync('HELP.md', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const inAppHelp = html.slice(html.indexOf('<section id="helpView"'));

for (const stale of ['included creatures', 'Data & backup', 'load its roster into Combat']) {
  assert.ok(!guide.includes(stale), `HELP.md contains stale guidance: ${stale}`);
  assert.ok(!inAppHelp.includes(stale), `In-app Help contains stale guidance: ${stale}`);
}

for (const current of ['Banished', 'Combat log', 'legendary resistance', 'GitHub Pages', 'invalid JSON']) {
  assert.ok(guide.toLowerCase().includes(current.toLowerCase()), `HELP.md is missing current guidance: ${current}`);
  assert.ok(inAppHelp.toLowerCase().includes(current.toLowerCase()), `In-app Help is missing current guidance: ${current}`);
}

assert.match(guide, /reopen the encounter builder/i);
assert.match(inAppHelp, /reopen the encounter builder/i);
assert.match(guide, /Search and filter controls remain pinned/i);
assert.match(inAppHelp, /Search and filter controls stay pinned/i);

console.log('Echoes Help content consistency tests passed');
