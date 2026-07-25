const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

assert.match(app, /function openAddCombatant\(target='combat'\)/);
assert.match(app, /if\(combatPickerTarget==='encounter'\)/);
assert.match(app, /function commitPreparedEncounter\(\)/);
assert.match(app, /state\.encounters\.push\(encounter\);pendingEncounterMembers=\[\];save\(\)/);
assert.match(app, /newEncounterBtn'\)return openAddCombatant\('encounter'\)/);
assert.doesNotMatch(
  app,
  /newEncounterBtn'\)\{switchView\('combat'\);return openAddCombatant\(\);\}/
);

console.log('Echoes isolated encounter builder tests passed');
