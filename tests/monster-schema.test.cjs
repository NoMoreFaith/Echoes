const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
for (const field of ['hit_dice','experience_points','proficiency_bonus','skills','damage_resistances','damage_immunities','condition_immunities','languages','bonus_actions','reactions']) {
  assert.match(app, new RegExp(field), `Monster field is not supported: ${field}`);
}
for (const control of ['mHitDice','mXp','mPb','mSkills','mLanguages','mDamageResistances','mDamageImmunities','mConditionImmunities','mBonusActions','mReactions']) {
  assert.match(app, new RegExp(`id=\\"${control}\\"`), `Monster editor control is missing: ${control}`);
}
assert.match(app, /normalized\[`\$\{key\}_save`\]/);
assert.match(app, /data-ability-score/);
assert.match(app, /Save\" type=\"number/);
assert.match(app, /summary>Bonus actions/);
assert.match(app, /summary>Reactions/);
assert.match(app, /Skills, defences & languages/);

console.log('Echoes rich monster schema tests passed');
