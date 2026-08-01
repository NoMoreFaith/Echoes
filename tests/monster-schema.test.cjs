const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
for (const field of ['hit_dice','experience_points','proficiency_bonus','legendary_resistances','skills','damage_resistances','damage_immunities','condition_immunities','languages','bonus_actions','reactions']) {
  assert.match(app, new RegExp(field), `Monster field is not supported: ${field}`);
}
for (const control of ['mHitDice','mXp','mPb','mLegendaryResistances','mSkills','mLanguages','mDamageResistances','mDamageImmunities','mConditionImmunities','mBonusActions','mReactions']) {
  assert.match(app, new RegExp(`id=\\"${control}\\"`), `Monster editor control is missing: ${control}`);
}
assert.match(app, /normalized\[`\$\{key\}_save`\]/);
assert.match(app, /data-ability-score/);
assert.match(app, /Save\" type=\"number/);
assert.match(app, /summary>Bonus actions/);
assert.match(app, /summary>Reactions/);
assert.match(app, /Skills, defences & languages/);
assert.match(app, /legendaryResistanceCount/);
assert.match(app, /LEG\. RES\./);
assert.match(app, /id=\"editLegendaryResistances\"/);
assert.match(app, /legendary_resistance_count/);

const helperSource = app.match(/function legendaryResistanceCount\(monster=\{\}\) \{[\s\S]*?\n  \}/);
assert.ok(helperSource, 'Legendary resistance normalizer could not be isolated');
const legendaryResistanceCount = Function('num', helperSource[0] + '; return legendaryResistanceCount;')((value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback);
assert.equal(legendaryResistanceCount({legendary_resistances:3}), 3);
assert.equal(legendaryResistanceCount({legendary_resistance_count:'4/Day'}), 4);
assert.equal(legendaryResistanceCount({legendary_resistances:-2}), 0);
assert.equal(legendaryResistanceCount({special_abilities:[{name:'Legendary Resistance (5/Day)',desc:'The creature succeeds instead.'}]}), 5);
assert.equal(legendaryResistanceCount({}), 0);

console.log('Echoes rich monster schema tests passed');
