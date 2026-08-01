const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../library-core.js');

const empty = core.parseLibraryText('   ');
assert.equal(empty.wasEmpty, true);
assert.deepEqual(empty.state.monsters, []);
assert.deepEqual(empty.state.parties, []);
assert.deepEqual(empty.state.combat.combatants, []);

assert.throws(
  () => core.parseLibraryText('{not json'),
  error => error.code === 'invalid' && /Invalid library file/.test(error.message)
);
assert.throws(
  () => core.parseLibraryText(JSON.stringify({ monsters: [] })),
  error => error.code === 'invalid' && /required Echoes/.test(error.message)
);

const legacyState = { monsters: [], parties: [], combat: { combatants: [] } };
const wrapped = core.createPayload(legacyState, { exportedAt: '2026-07-13T00:00:00.000Z' });
const parsedWrapped = core.parseLibraryText(JSON.stringify(wrapped));
assert.equal(parsedWrapped.wasEmpty, false);
assert.deepEqual(parsedWrapped.state.spells, []);
assert.deepEqual(parsedWrapped.state.npcs, []);
assert.equal(wrapped.format, 'echoes-full-backup');
assert.equal(wrapped.role, 'durable-library');

const storage = fs.readFileSync(require.resolve('../library-storage.js'), 'utf8');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const resumeBody = storage.slice(storage.indexOf('async function resumeLibraryPermission'), storage.indexOf('async function retryStoredLibrary'));

assert.match(storage, /id: 'echoes-library'/);
assert.match(storage, /window\.EchoesApp\?\.state/);
assert.match(storage, /window\.EchoesApp\?\.replaceState\(validated\)/);
assert.match(storage, /indexedDB\.open\(HANDLE_DB/);
assert.match(storage, /setTimeout\(writeLibraryFile, 1000\)/);
assert.match(storage, /await validateFileBeforeAutomaticWrite\(\);[\s\S]*await writeStateToHandle\(state\)/);
assert.match(storage, /parsed\.state = currentState\(\)/);
assert.match(storage, /sessionStorage\.getItem\(RELOAD_SOURCE_KEY\) === sourceFingerprint/);
assert.match(storage, /await writeStateToHandle\(current\)/);
assert.doesNotMatch(resumeBody, /showSaveFilePicker|showOpenFilePicker/);
assert.match(resumeBody, /permissionFor\(libraryHandle, true\)/);
assert.match(storage, /connected: 'Connected and saving automatically'/);
assert.match(storage, /permission: 'Permission required'/);
assert.match(storage, /unavailable: 'File unavailable'/);
assert.match(storage, /invalid: 'Invalid library file'/);
assert.match(storage, /saving: 'Saving'/);
assert.match(storage, /saved: 'Last saved successfully'/);
assert.match(app, /const CONDITIONS = \['Banished',/);
assert.match(html, /id="chooseDifferentLibraryBtn"/);
assert.match(html, /id="resumeBackupBtn"/);
assert.match(html, /id="retryBackupBtn"/);
assert.match(html, /id="libraryWarning" class="library-warning" hidden/);

console.log('Echoes library storage tests passed');
