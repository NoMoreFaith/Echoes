const assert = require('node:assert/strict');
const fiveTools = require('../five-tools-import.js');

const monster = fiveTools.convertMonster({
  name: 'Test Demon', source: 'XMM', size: ['M'], type: { type: 'fiend', tags: ['demon'] }, alignment: ['C', 'E'],
  ac: [{ ac: 15 }], hp: { average: 153, formula: '18d8 + 72' }, speed: { walk: 30, climb: 30 },
  str: 15, dex: 19, con: 18, int: 13, wis: 15, cha: 17,
  save: { dex: '+8', int: '+5' }, skill: { deception: '+11', insight: '+6' },
  resist: ['cold', 'fire'], immune: ['poison'], conditionImmune: ['poisoned'], senses: ['darkvision 120 ft.'], passive: 12,
  languages: ['Abyssal', 'Elvish'], cr: '10', pb: 4,
  trait: [{ name: 'Magic Resistance', entries: ['The demon has advantage on saving throws against spells.'] }],
  action: [{ name: 'Caustic Lash', entries: ['Hit: 25 ({@damage 6d6 + 4}) acid damage.'] }]
});

assert.equal(monster.name, 'Test Demon');
assert.equal(monster.size, 'Medium');
assert.equal(monster.type, 'fiend');
assert.equal(monster.subtype, 'demon');
assert.equal(monster.alignment, 'Chaotic Evil');
assert.equal(monster.hit_points, 153);
assert.equal(monster.hit_dice, '18d8 + 72');
assert.equal(monster.initiative_modifier, 4);
assert.equal(monster.actions[0].desc, 'Hit: 25 (6d6 + 4) acid damage.');
assert.equal(monster.import_source, '5etools');
assert.equal(monster.import_source_code, 'XMM');

const spell = fiveTools.convertSpell({
  name: 'Test Ward', source: 'XPHB', level: 2, school: 'A', time: [{ number: 1, unit: 'action' }],
  range: { type: 'point', distance: { type: 'feet', amount: 60 } }, components: { v: true, s: true, m: { text: 'a silver thread' } },
  duration: [{ type: 'timed', concentration: true, duration: { amount: 1, type: 'minute' } }],
  entries: ['A target makes a {@dc 15} saving throw and takes {@damage 2d6} damage.'],
  entriesHigherLevel: [{ name: 'At Higher Levels', entries: ['Damage increases by {@damage 1d6}.'] }],
  classes: { fromClassList: [{ name: 'Wizard' }] }
});

assert.equal(spell.school, 'Abjuration');
assert.equal(spell.casting_time, '1 action');
assert.equal(spell.range, '60 feet');
assert.equal(spell.concentration, 'yes');
assert.equal(spell.class, 'Wizard');
assert.match(spell.desc, /DC 15/);

const customMonster = { id: 'custom-1', name: 'My Dragon', origin: 'custom' };
const localImport = { id: 'local-1', name: 'Local Fiend' };
const otherSource = { id: 'phb-1', name: 'Familiar', source: 'PHB', import_source: '5etools', import_source_code: 'PHB' };
const oldSelected = { id: 'xmm-1', name: 'Test Demon', source: 'XMM', import_source: '5etools', import_source_code: 'XMM' };
const staleSelected = { id: 'xmm-stale', name: 'Old Demon', source: 'XMM', import_source: '5etools', import_source_code: 'XMM' };
const refreshed = fiveTools.reconcileImported(
  [customMonster, localImport, otherSource, oldSelected, staleSelected],
  [monster],
  ['XMM']
);

assert.equal(refreshed.records.find(item => item.name === 'My Dragon').id, 'custom-1', 'custom monster must survive refresh');
assert.equal(refreshed.records.find(item => item.name === 'Local Fiend').id, 'local-1', 'untagged local import must survive refresh');
assert.equal(refreshed.records.find(item => item.name === 'Familiar').id, 'phb-1', 'unselected 5etools source must survive refresh');
assert.equal(refreshed.records.find(item => item.name === 'Test Demon').id, 'xmm-1', 'refreshed record should keep its stable ID');
assert.equal(refreshed.records.some(item => item.id === 'xmm-stale'), false, 'stale record from selected source should be removed');
assert.equal(refreshed.refreshed, 1);

const sameNamedCustom = { id: 'custom-dragon', name: 'Ancient Dragon', origin: 'custom' };
const olderImportedDragon = { id: 'mm-dragon', name: 'Ancient Dragon', source: 'MM', import_source: '5etools', import_source_code: 'MM' };
const duplicateDragons = fiveTools.reconcileImported(
  [sameNamedCustom, olderImportedDragon],
  [
    { name: ' Ancient Dragon ', source: 'XMM', import_source: '5etools', import_source_code: 'XMM', armor_class: 20 },
    { name: 'ancient   dragon', source: 'XMM', import_source: '5etools', import_source_code: 'XMM', armor_class: 22 }
  ],
  ['XMM']
);
const importedDragons = duplicateDragons.records.filter(item => item.import_source === '5etools' && item.name.trim().replace(/\s+/g, ' ').toLowerCase() === 'ancient dragon');
assert.equal(importedDragons.length, 1, 'repeated 5etools display names should collapse to one imported record');
assert.equal(importedDragons[0].armor_class, 22, 'the later incoming record should win a duplicate-name tie');
assert.equal(importedDragons[0].id, 'mm-dragon', 'deduplication should preserve the prior imported record ID');
assert.ok(duplicateDragons.records.some(item => item.id === 'custom-dragon'), 'same-named custom records must be retained');
assert.equal(duplicateDragons.duplicatesRemoved, 2, 'the incoming and previously imported duplicates should be reported');

assert.equal(fiveTools.resolveInput('monsters', 'https://5e.tools/bestiary.html').mode, 'index');
assert.match(fiveTools.resolveInput('spells', 'https://5e.tools/data/spells/spells-xphb.json').url, /raw\.githubusercontent\.com/);
assert.throws(() => fiveTools.resolveInput('monsters', 'https://example.com/monsters.json'), /Use a 5e\.tools/);

console.log('Echoes 5etools import tests passed');
