(() => {
  'use strict';
  const STORAGE_KEY = 'echoes-v1';
  const LEGACY_STORAGE_KEY = 'rollkeeper-v1';
  const CONDITIONS = ['Banished','Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Poisoned','Prone','Restrained','Stunned','Unconscious','Concentration'];
  const ABILITIES = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
  const SKILL_LABELS = {acrobatics:'Acrobatics',animalhandling:'Animal Handling',arcana:'Arcana',athletics:'Athletics',deception:'Deception',history:'History',insight:'Insight',intimidation:'Intimidation',investigation:'Investigation',medicine:'Medicine',nature:'Nature',perception:'Perception',performance:'Performance',persuasion:'Persuasion',religion:'Religion',sleightofhand:'Sleight of Hand',stealth:'Stealth',survival:'Survival'};
  const CR_EXPERIENCE = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000};
  const FIVE_TOOLS = window.EchoesFiveTools;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  const defaults = {
    monsters: [],
    spells: [],
    parties: [{ id: uid(), name: 'The Adventurers', members: [
      {id:uid(), name:'Erdan', player:'', className:'', hp:35, ac:16},
      {id:uid(), name:'Solas', player:'', className:'', hp:42, ac:15},
      {id:uid(), name:'Dofarod', player:'Bob', className:'', hp:48, ac:18},
      {id:uid(), name:'Shadow', player:'', className:'', hp:38, ac:17}
    ]}],
    encounters: [],
    npcs: [],
    dice: { count:1, sides:20, modifier:0 },
    diceLog: [],
    ui: { sidebarCollapsed:false, detailCollapsed:false },
    combat: { name:'Untitled battle', round:1, turn:0, combatants:[], selectedId:null }
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
      if (!saved) return structuredClone(defaults);
      return { ...structuredClone(defaults), ...saved, npcs:Array.isArray(saved.npcs)?saved.npcs:[], dice:{...defaults.dice,...(saved.dice||{})}, diceLog:Array.isArray(saved.diceLog)?saved.diceLog:[], ui:{...defaults.ui,...(saved.ui||{})}, combat:{...defaults.combat, ...(saved.combat||{})} };
    } catch { return structuredClone(defaults); }
  }
  let state = load();
  let monsterPage = 0;
  let combatPickerSelections=new Map();
  let combatPickerTarget='combat';
  let pendingEncounterMembers=[];
  let pendingEncounterId=null;
  let pendingEncounterName='';
  const spellFilters={school:new Set(),casting:new Set(),classes:new Set()};
  let fiveToolsImportPlan=[];
  let toastTimer;

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch(error) { console.warn('Echoes browser working copy is too large; the external library remains authoritative.', error); }
    window.dispatchEvent(new Event('echoes:data-saved'));
  }
  function replaceState(nextState) {
    const incoming=nextState&&typeof nextState==='object'?nextState:{};
    state={...structuredClone(defaults),...structuredClone(incoming),npcs:Array.isArray(incoming.npcs)?structuredClone(incoming.npcs):[],dice:{...defaults.dice,...structuredClone(incoming.dice||{})},diceLog:Array.isArray(incoming.diceLog)?structuredClone(incoming.diceLog):[],ui:{...defaults.ui,...structuredClone(incoming.ui||{})},combat:{...defaults.combat,...structuredClone(incoming.combat||{})}};
    state.combat.combatants=(state.combat.combatants||[]).map(combatant=>({...combatant,conditions:(combatant.conditions||[]).map(condition=>condition==='Concentrating'?'Concentration':condition)}));
    state.monsters=(state.monsters||[]).map(normaliseMonster);state.spells=(state.spells||[]).map(normaliseSpell);
    save();applyUiState();renderCombat();renderParties();renderEncounters();renderMonsters();renderSpells();renderDiceRoller();window.EchoesNPCs?.render();
  }

  function applyUiState() { const shell=$('.app-shell'),workspace=$('#combatWorkspace');shell.classList.toggle('sidebar-collapsed',state.ui.sidebarCollapsed);workspace.classList.toggle('detail-collapsed',state.ui.detailCollapsed);const left=$('#sidebarToggleBtn'),right=$('#detailToggleBtn');left.textContent=state.ui.sidebarCollapsed?'»':'«';left.setAttribute('aria-label',state.ui.sidebarCollapsed?'Expand navigation':'Collapse navigation');left.title=left.getAttribute('aria-label');right.textContent=state.ui.detailCollapsed?'«':'»';right.setAttribute('aria-label',state.ui.detailCollapsed?'Expand details':'Collapse details');right.title=right.getAttribute('aria-label'); }
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2200); }
  function sortCombatants() { state.combat.combatants.sort((a,b)=>b.initiative-a.initiative || b.dex-a.dex || a.added-b.added); }
  function combatantKey(x) { return `${x.kind}|${x.sourceId||String(x.name).toLowerCase()}`; }
  function pcAlreadyInCombat(member) { return state.combat.combatants.some(x=>x.kind==='pc'&&(x.sourceId===member.id||(String(x.name).toLowerCase()===String(member.name).toLowerCase()&&String(x.player||'').toLowerCase()===String(member.player||'').toLowerCase()))); }
  function combatDisplayName(x) {
    if (x.kind!=='monster') return x.name;
    const peers=state.combat.combatants.filter(y=>combatantKey(y)===combatantKey(x));
    if (peers.length<2) return x.name;
    peers.sort((a,b)=>a.added-b.added);
    return `${x.name} ${peers.findIndex(y=>y.id===x.id)+1}`;
  }
  function initiativeModifierFromDex(dexterity) { return Math.floor((num(dexterity,10)-10)/2); }
  function formatModifier(modifier) { const value=num(modifier,0);return value>=0?`+${value}`:String(value); }
  function rollMonsterInitiative(monster) { return rollDie(20)+num(monster?.initiative_modifier,initiativeModifierFromDex(monster?.dexterity)); }
  function monsterKey(m) { return `${m.name}|${m.challenge_rating}|${m.hit_points}`.toLowerCase(); }
  function importedRecordKey(record) { return `${record.name||''}|${record.source||record.import_source_code||''}`.toLowerCase(); }
  function markCustom(record) {
    const custom={...record,origin:'custom'};
    delete custom.import_source;
    delete custom.import_source_code;
    return custom;
  }
  function monsterBaseline(m) { const {id,original,...baseline}=m;return structuredClone(baseline); }
  function optionalNumber(value) {
    return value===undefined||value===null||String(value).trim()===''?null:num(value,0);
  }
  function abilityModifier(score) { return Math.floor((num(score,10)-10)/2); }
  function proficiencyBonusFromCR(challengeRating) {
    const cr=String(challengeRating??'0').includes('/')?String(challengeRating).split('/').reduce((a,b)=>num(a)/num(b)):num(challengeRating,0);
    if(cr>=29)return 9;if(cr>=25)return 8;if(cr>=21)return 7;if(cr>=17)return 6;if(cr>=13)return 5;if(cr>=9)return 4;if(cr>=5)return 3;return 2;
  }
  function experienceFromCR(challengeRating) { return CR_EXPERIENCE[String(challengeRating??'')]??0; }
  function skillKey(value='') { return String(value).toLowerCase().replace(/[^a-z]/g,''); }
  function normaliseSkills(monster={}) {
    const result={},raw=monster.skills;
    const add=(name,value)=>{const key=skillKey(name);if(SKILL_LABELS[key]&&optionalNumber(value)!==null)result[key]=num(value,0);};
    if(Array.isArray(raw))raw.forEach(item=>add(item?.name,item?.bonus??item?.value));
    else if(raw&&typeof raw==='object')Object.entries(raw).forEach(([name,value])=>add(name,value));
    else if(typeof raw==='string')raw.split(/[,;\n]/).forEach(part=>{const match=part.trim().match(/^(.+?)\s*\|?\s*([+-]?\d+)$/);if(match)add(match[1],match[2]);});
    Object.keys(SKILL_LABELS).forEach(key=>{if(optionalNumber(monster[key])!==null)add(key,monster[key]);});
    return result;
  }
  function legendaryResistanceCount(monster={}) {
    const direct=monster.legendary_resistances??monster.legendary_resistance_count??monster.legendaryResistanceCount??monster.legendary_resistance_uses??monster.legendary_resistance??monster.legendaryResistance;
    if(direct!==undefined&&direct!==null&&String(direct).trim()!==''){const match=String(direct).match(/[-+]?\d+/);return match?Math.max(0,Math.floor(num(match[0],0))):0;}
    const traits=Array.isArray(monster.special_abilities)?monster.special_abilities:Array.isArray(monster.traits)?monster.traits:[];
    const text=traits.map(trait=>`${trait?.name||''} ${trait?.desc||''}`).join(' '),match=text.match(/legendary resistance(?:s)?\s*\(\s*(\d+)\s*\/\s*day\b/i);
    return match?Math.max(0,Math.floor(num(match[1],0))):0;
  }
  function normaliseMonster(m) {
    const challengeRating=String(m.challenge_rating??m.cr??'—');
    const dexterity=num(m.dexterity??m.dex,10),initiativeModifier=num(m.initiative_modifier??m.initiative_bonus,initiativeModifierFromDex(dexterity));
    const normalized={
      ...m,
      id:m.id||uid(),
      name:m.name||'Unnamed creature',
      size:m.size||'',
      type:m.type||'creature',
      subtype:m.subtype||'',
      alignment:m.alignment||'',
      source_url:m.source_url??m.sourceUrl??'',
      armor_class:num(m.armor_class??m.ac,10),
      hit_points:num(m.hit_points??m.hp,1),
      hit_dice:String(m.hit_dice??m.hit_points_roll??''),
      challenge_rating:challengeRating,
      experience_points:num(m.experience_points??m.xp,experienceFromCR(challengeRating)),
      proficiency_bonus:num(m.proficiency_bonus??m.pb,proficiencyBonusFromCR(challengeRating)),
      legendary_resistances:legendaryResistanceCount(m),
      initiative_modifier:initiativeModifier,
      initiative_score:num(m.initiative_score,10+initiativeModifier),
      strength:num(m.strength??m.str,10),
      dexterity,
      constitution:num(m.constitution??m.con,10),
      intelligence:num(m.intelligence??m.int,10),
      wisdom:num(m.wisdom??m.wis,10),
      charisma:num(m.charisma??m.cha,10),
      skills:normaliseSkills(m),
      speed:m.speed||'',
      senses:m.senses||'',
      languages:m.languages||'',
      damage_vulnerabilities:m.damage_vulnerabilities??m.vulnerabilities??'',
      damage_resistances:m.damage_resistances??m.resistances??'',
      damage_immunities:m.damage_immunities??m.immunities??'',
      condition_immunities:m.condition_immunities??'',
      special_abilities:Array.isArray(m.special_abilities)?m.special_abilities:Array.isArray(m.traits)?m.traits:[],
      actions:Array.isArray(m.actions)?m.actions:[],
      bonus_actions:Array.isArray(m.bonus_actions)?m.bonus_actions:Array.isArray(m.bonusActions)?m.bonusActions:[],
      reactions:Array.isArray(m.reactions)?m.reactions:[],
      legendary_actions:Array.isArray(m.legendary_actions)?m.legendary_actions:[]
    };
    ABILITIES.forEach(key=>{normalized[`${key}_save`]=optionalNumber(m[`${key}_save`]??m.saves?.[key]);});
    if(!normalized.original)normalized.original=monsterBaseline(normalized);
    return normalized;
  }

  function normaliseSpell(s) {
    return { ...s, id:s.id||uid(), name:s.name||'Unnamed spell', desc:s.desc||'', higher_level:s.higher_level||'', level:String(s.level||'Cantrip'), school:s.school||'', range:s.range||'', components:s.components||'', material:s.material||'', ritual:s.ritual||'no', duration:s.duration||'', concentration:s.concentration||'no', casting_time:s.casting_time||'', class:s.class||'' };
  }
  function stripHtml(raw='') {
    const holder=document.createElement('div');
    holder.innerHTML=String(raw).replace(/<br\s*\/?>(?=.)/gi,'\n').replace(/<\/(p|div|li|h[1-6])>/gi,'\n');
    return (holder.textContent||'').replace(/\n\s*\n+/g,'\n').trim();
  }
  function regexEscape(value) { return [...String(value)].map(ch=>'\\^$.*+?()[]{}|'.includes(ch)?'\\'+ch:ch).join(''); }
  function richDescription(raw='') {
    const text=stripHtml(raw),names=state.spells.map(s=>s.name).filter(Boolean).sort((a,b)=>b.length-a.length);
    const parts=['DC\\s+\\d+','(?:\\d+)?d\\d+(?:\\s*[+-]\\s*\\d+)?',...names.map(regexEscape)];
    const pattern=new RegExp('\\b('+parts.join('|')+')\\b','gi');
    let output='',last=0,match;
    while((match=pattern.exec(text))){output+=esc(text.slice(last,match.index)).replace(/\n/g,'<br>');const value=match[0],spell=state.spells.find(s=>s.name.toLowerCase()===value.toLowerCase()),dice=parseDiceExpression(value);output+=spell?`<button type="button" class="spell-link" data-spell-name="${esc(spell.name)}">${esc(value)}</button>`:dice?`<button type="button" class="dice-link" data-dice-expression="${esc(formatDiceExpression(dice))}" title="Roll ${esc(formatDiceExpression(dice))}">${esc(value)}</button>`:`<strong class="dc">${esc(value)}</strong>`;last=match.index+value.length;}
    return output+esc(text.slice(last)).replace(/\n/g,'<br>');
  }

  function parseDiceExpression(raw) {
    const match=String(raw||'').trim().replace(/[−–—]/g,'-').replace(/\s+/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if(!match)return null;
    const rawSides=num(match[2],0);if(rawSides<2||rawSides>1000)return null;
    const count=Math.max(1,Math.min(100,num(match[1]||1,1))),sides=rawSides,modifier=Math.max(-9999,Math.min(9999,num(match[3]||0,0)));
    return {count,sides,modifier};
  }

  function formatDiceExpression(dice) {
    return `${dice.count}d${dice.sides}${dice.modifier>0?` + ${dice.modifier}`:dice.modifier<0?` − ${Math.abs(dice.modifier)}`:''}`;
  }

  function rollDie(sides) {
    if(crypto?.getRandomValues){const values=new Uint32Array(1),limit=Math.floor(0x100000000/sides)*sides;do{crypto.getRandomValues(values);}while(values[0]>=limit);return values[0]%sides+1;}
    return Math.floor(Math.random()*sides)+1;
  }

  function diceBreakdown(entry) {
    return `[${entry.rolls.join(', ')}]${entry.modifier>0?` + ${entry.modifier}`:entry.modifier<0?` − ${Math.abs(entry.modifier)}`:''}`;
  }

  function diceSourceForElement(element) {
    const ability=element.closest('.ability'),abilityName=ability?.querySelector('summary')?.textContent?.trim(),dialogTitle=element.closest('#appDialog')?$('#dialogTitle')?.textContent?.trim():'',selected=state.combat.combatants.find(x=>x.id===state.combat.selectedId),creature=selected?combatDisplayName(selected):'';
    if(dialogTitle&&abilityName)return `${dialogTitle} — ${abilityName}`;
    if(creature&&abilityName)return `${creature} — ${abilityName}`;
    return abilityName||dialogTitle||creature||'Statblock';
  }

  function rollDiceExpression(raw,source='Dice roller') {
    const dice=parseDiceExpression(raw);
    if(!dice){toast('That dice expression could not be rolled');return null;}
    const rolls=Array.from({length:dice.count},()=>rollDie(dice.sides)),total=rolls.reduce((sum,value)=>sum+value,0)+dice.modifier,entry={id:uid(),at:Date.now(),source,expression:formatDiceExpression(dice),...dice,rolls,total};
    state.dice={...dice};
    state.diceLog=[entry,...(state.diceLog||[])].slice(0,200);
    save();renderDiceRoller();toast(`${entry.expression} → ${entry.total}`);return entry;
  }

  function updateDiceExpressionPreview() {
    const count=Math.max(1,Math.min(100,num($('#diceCountInput')?.value,state.dice?.count||1))),modifier=Math.max(-9999,Math.min(9999,num($('#diceModifierInput')?.value,state.dice?.modifier||0))),sides=state.dice?.sides||20;
    if($('#diceExpressionPreview'))$('#diceExpressionPreview').textContent=formatDiceExpression({count,sides,modifier});
  }

  function openCustomDieDialog() {
    const standardDice=[4,6,8,10,12,20,100],current=!standardDice.includes(state.dice?.sides)?state.dice.sides:64;
    showDialog('Dice roller','Custom die',`<label class="field">NUMBER OF SIDES<input id="customDieSides" type="number" min="2" max="1000" step="1" value="${current}" autofocus></label><p class="subtitle">Choose any die from d2 to d1000.</p>`,'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="confirmCustomDieBtn" class="button primary">Use custom die</button>');
    requestAnimationFrame(()=>{$('#customDieSides')?.select();});
  }

  function saveCustomDie() {
    const input=$('#customDieSides'),sides=Math.floor(num(input?.value,0));
    if(sides<2||sides>1000){toast('Choose a custom die between d2 and d1000');input?.focus();return;}
    state.dice={...defaults.dice,...state.dice,sides};save();closeDialog();renderDiceRoller();toast(`Custom d${sides} selected`);
  }

  function rollDiceFromControls() {
    const count=Math.max(1,Math.min(100,num($('#diceCountInput').value,1))),modifier=Math.max(-9999,Math.min(9999,num($('#diceModifierInput').value,0))),sides=state.dice?.sides||20;
    return rollDiceExpression(`${count}d${sides}${modifier>=0?'+':''}${modifier}`,'Dice roller');
  }

  function diceLogEntriesMarkup(emptyMessage) {
    return state.diceLog.length?state.diceLog.map(entry=>`<article class="dice-log-entry"><div class="dice-log-source"><strong>${esc(entry.source||'Dice roller')}</strong><time>${new Date(entry.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div><div class="dice-log-breakdown"><strong>${esc(entry.expression)}</strong><br>${esc(diceBreakdown(entry))}</div><div class="dice-log-total">${entry.total}</div></article>`).join(''):`<div class="dice-log-empty">${esc(emptyMessage)}</div>`;
  }
  function renderCombatLog() {
    const latest=state.diceLog[0],source=$('#combatLogLatestSource'),roll=$('#combatLogLatestRoll'),count=$('#combatLogCount'),entries=$('#combatLogEntries');
    if(source)source.textContent=latest?latest.source||'Dice roller':'No rolls yet';
    if(roll)roll.textContent=latest?`${latest.expression} → ${latest.total}`:'Click damage dice in a statblock to roll';
    if(count)count.textContent=`${state.diceLog.length} roll${state.diceLog.length===1?'':'s'}`;
    if(entries)entries.innerHTML=diceLogEntriesMarkup('Rolls made from statblocks or the Dice Roller will appear here.');
  }
  function clearDiceHistory() {
    if(!state.diceLog.length)return;
    if(confirm('Clear the complete dice roll log?')){state.diceLog=[];save();renderDiceRoller();toast('Dice log cleared');}
  }
  function renderDiceRoller() {
    state.dice={...defaults.dice,...(state.dice||{})};state.diceLog=Array.isArray(state.diceLog)?state.diceLog:[];
    const countInput=$('#diceCountInput'),modifierInput=$('#diceModifierInput');
    if(countInput&&document.activeElement!==countInput)countInput.value=state.dice.count;
    if(modifierInput&&document.activeElement!==modifierInput)modifierInput.value=state.dice.modifier;
    const standardDice=[4,6,8,10,12,20,100];$$('[data-die-size]').forEach(button=>button.classList.toggle('active',num(button.dataset.dieSize)===state.dice.sides));const custom=$('#customDieButton');if(custom){const isCustom=!standardDice.includes(state.dice.sides);custom.classList.toggle('active',isCustom);custom.textContent=isCustom?`d${state.dice.sides}`:'Custom';}
    updateDiceExpressionPreview();
    const latest=state.diceLog[0],result=$('#diceResult');
    if(result)result.innerHTML=latest?`<span>LAST ROLL · ${esc(latest.expression)}</span><strong>${latest.total}</strong><p>${esc(diceBreakdown(latest))} · ${esc(latest.source||'Dice roller')}</p>`:'<span>LAST ROLL</span><strong>—</strong><p>Select a die and roll when ready.</p>';
    if($('#diceLogCount'))$('#diceLogCount').textContent=`${state.diceLog.length} roll${state.diceLog.length===1?'':'s'}`;
    if($('#diceLog'))$('#diceLog').innerHTML=diceLogEntriesMarkup('Rolls made here or from a statblock will appear in this log.');
    renderCombatLog();
  }

  function switchView(name) {
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`${name}View`));
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
    if (name==='monsters') renderMonsters();
    if (name==='npcs') window.EchoesNPCs?.render?.();
    if (name==='parties') renderParties();
    if (name==='encounters') renderEncounters();
    if (name==='spells') renderSpells();
    if (name==='dice') renderDiceRoller();
  }

  function renderCombat() {
    const c=state.combat, has=c.combatants.length>0;
    $('#combatTitle').textContent=c.name||'Untitled battle';
    $('#roundNumber').textContent=c.round;
    $('#emptyCombat').classList.toggle('hidden',has);
    $('#combatWorkspace').classList.toggle('hidden',!has);
    $('#combatantCount').textContent=`${c.combatants.length} COMBATANT${c.combatants.length===1?'':'S'}`;
    if (!has) { $('#upNow').textContent='—'; return; }
    c.turn=Math.max(0,Math.min(c.turn,c.combatants.length-1));
    $('#upNow').textContent=c.combatants[c.turn]?combatDisplayName(c.combatants[c.turn]):'—';
    $('#initiativeList').innerHTML=c.combatants.map((x,i)=>{
      const pct=Math.max(0,Math.min(100,(x.hp/x.maxHp)*100));
      const bloodied=x.kind==='monster' && x.hp>0 && x.hp<=x.maxHp/2;
      const type=x.kind==='pc' ? `${x.className||'Player character'}${x.player?` · ${x.player}`:''}` : `${x.size||''} ${x.type||'creature'}`;
      const displayName=combatDisplayName(x),defeated=x.hp<=0;
      const hpControls=x.kind==='pc'?`<div class="pc-hp-control"><span class="hp-label">HIT POINTS</span><span><input class="pc-hp-input" data-pc-hp-input="${x.id}" type="number" min="0" max="${x.maxHp}" value="${x.hp}" aria-label="Current hit points for ${esc(displayName)}"><small>/ ${x.maxHp}</small></span></div>`:`<div class="hp-control"><div class="hp-readout"><span class="hp-label">HIT POINTS</span><span class="hp-live"><strong data-hp-value="${x.id}">${x.hp}</strong><small>/ ${x.maxHp}</small></span></div><input class="hp-slider" data-hp-slider="${x.id}" type="range" min="0" max="${x.maxHp}" value="${x.hp}" aria-label="Hit points for ${esc(displayName)}"><div class="hp-buttons"><button data-action="hp" data-delta="-10">−10</button><button data-action="hp" data-delta="-1">−1</button><button data-action="hp" data-delta="1">+1</button><button data-action="hp" data-delta="10">+10</button></div></div>`;
      return `<article class="combatant ${x.kind} ${i===c.turn?'current':''} ${bloodied?'bloodied':''} ${defeated?'defeated':''}" data-id="${x.id}">
        <label class="initiative-control"><span>INITIATIVE</span><input class="initiative-input" data-init-input="${x.id}" type="number" value="${x.initiative}" aria-label="Initiative for ${esc(displayName)}"></label>
        <div class="combatant-name"><strong>${esc(displayName)}</strong><small class="type-line"><span class="bloodied-label">Bloodied</span><span>${esc(type.trim())}</span></small>${x.conditions?.length?`<div class="condition-row">${x.conditions.map(q=>`<span class="condition">${esc(q)}</span>`).join('')}</div>`:''}</div>
        <div class="ac-box"><strong>${x.ac}</strong><span>ARMOR</span></div>
        ${hpControls}
        <div class="row-actions"><button data-action="menu" aria-label="Edit ${esc(displayName)}">✎</button><button class="remove-row" data-action="remove" aria-label="Remove ${esc(displayName)} from combat">×</button></div>
      </article>`;
    }).join('');
    if (!c.selectedId || !c.combatants.some(x=>x.id===c.selectedId)) c.selectedId=c.combatants[c.turn].id;
    renderDetails();
  }

  function renderDetails() {
    const x=state.combat.combatants.find(y=>y.id===state.combat.selectedId),panel=$('#detailContent');
    if(!x){panel.innerHTML='<div class="detail-empty">Select a combatant to see details.</div>';return;}
    const stat=(label,val)=>`<div><span>${label}</span><strong>${val??'—'}</strong></div>`;
    const details=x.kind==='monster'
      ? `${abilityScoreSection(x)}${monsterFactSections(x)}${monsterActionSections(x,true)}`
      : `<details class="detail-section" open><summary>Character</summary><div class="detail-section-body"><div class="ability-static"><strong>${esc(x.className||'Class not set')}</strong><p>Played by ${esc(x.player||'—')}</p></div></div></details>`;
    panel.innerHTML=`<div class="detail-head"><div><p class="eyebrow">${x.kind==='pc'?'PLAYER CHARACTER':'CREATURE'}</p><h2>${esc(combatDisplayName(x))}</h2><div class="type">${esc(monsterTypeLine(x))}</div></div>${x.kind==='monster'?`<span class="cr-badge">CR ${esc(x.challenge_rating)}</span>`:''}</div>
      <div class="stat-strip ${x.kind==='monster'?'monster-combat-core-stats':''}">${stat('AC',x.ac)}${stat('HP',`${x.hp}/${x.maxHp}`)}${stat('INIT',x.initiative)}${x.kind==='monster'?stat('LEG. RES.',legendaryResistanceCount(x)):''}</div>
      <details class="detail-section" open><summary>Conditions</summary><div class="detail-section-body"><div class="condition-row">${(x.conditions||[]).map(c=>`<button class="condition" data-remove-condition="${esc(c)}">${esc(c)} ×</button>`).join('')||'<span class="type">None</span>'}</div><button class="button ghost" id="addConditionBtn" style="margin-top:10px">＋ Add condition</button></div></details>
      ${details}`;
  }
  function abilities(list=[],empty='') { return list.length?list.map(a=>`<details class="ability"><summary>${esc(a.name)}</summary><p>${richDescription(a.desc)}</p></details>`).join(''):`<p class="subtitle">${empty}</p>`; }
  function monsterTypeLine(m) { return [m.size,m.type,m.subtype?`(${m.subtype})`:'',m.alignment].filter(Boolean).join(' · '); }
  function abilityScoreMarkup(m) {
    return ABILITIES.map(key=>{const score=num(m[key],10),modifier=abilityModifier(score),save=optionalNumber(m[`${key}_save`])??modifier;return `<div><span>${key.slice(0,3).toUpperCase()}</span><strong>${score}</strong><small>MOD ${formatModifier(modifier)} · SAVE ${formatModifier(save)}</small></div>`;}).join('');
  }
  function abilityScoreSection(m) { return `<details class="detail-section"><summary>Abilities & saves</summary><div class="detail-section-body"><div class="stat-strip ability-score-strip">${abilityScoreMarkup(m)}</div></div></details>`; }
  function skillSummary(m) {
    return Object.entries(m.skills||{}).map(([key,value])=>`${SKILL_LABELS[key]||key} ${formatModifier(value)}`).join(', ');
  }
  function factRows(rows) {
    return rows.filter(([,value])=>value!==undefined&&value!==null&&String(value).trim()!=='').map(([label,value])=>`<div class="ability-static"><strong>${esc(label)}</strong><p>${esc(value)}</p></div>`).join('');
  }
  function monsterFactSections(m) {
    const movement=factRows([['Speed',m.speed],['Senses',m.senses]]);
    const defences=factRows([['Skills',skillSummary(m)],['Damage vulnerabilities',m.damage_vulnerabilities],['Damage resistances',m.damage_resistances],['Damage immunities',m.damage_immunities],['Condition immunities',m.condition_immunities],['Languages',m.languages]]);
    return `${movement?`<details class="detail-section"><summary>Movement & senses</summary><div class="detail-section-body">${movement}</div></details>`:''}${defences?`<details class="detail-section"><summary>Skills, defences & languages</summary><div class="detail-section-body">${defences}</div></details>`:''}`;
  }
  function monsterActionSections(m,openActions=false) {
    return `<details class="detail-section"><summary>Traits</summary><div class="detail-section-body">${abilities(m.special_abilities,'No special traits.')}</div></details><details class="detail-section" ${openActions?'open':''}><summary>Actions</summary><div class="detail-section-body">${abilities(m.actions,'No actions recorded.')}</div></details>${m.bonus_actions?.length?`<details class="detail-section"><summary>Bonus actions</summary><div class="detail-section-body">${abilities(m.bonus_actions)}</div></details>`:''}${m.reactions?.length?`<details class="detail-section"><summary>Reactions</summary><div class="detail-section-body">${abilities(m.reactions)}</div></details>`:''}${m.legendary_actions?.length?`<details class="detail-section"><summary>Legendary actions</summary><div class="detail-section-body">${abilities(m.legendary_actions)}</div></details>`:''}`;
  }
  function showMonsterPreview(m) {
    if(!m)return;
    const stat=(label,val)=>`<div><span>${label}</span><strong>${val??'—'}</strong></div>`,xp=m.experience_points?`${num(m.experience_points).toLocaleString('en-GB')} XP`:'—';
    showDialog('Bestiary preview',m.name,`<div class="monster-preview"><div class="detail-head"><div><p class="eyebrow">CREATURE</p><h2>${esc(m.name)}</h2><div class="type">${esc(monsterTypeLine(m))}</div></div><span class="cr-badge">CR ${esc(m.challenge_rating)} · ${esc(xp)}</span></div><div class="stat-strip monster-core-stats">${stat('AC',m.armor_class)}${stat('HP',m.hit_dice?`${m.hit_points} (${m.hit_dice})`:m.hit_points)}${stat('INIT',`${formatModifier(m.initiative_modifier)} (${m.initiative_score})`)}${stat('PB',formatModifier(m.proficiency_bonus))}${stat('LEG. RES.',m.legendary_resistances)}</div><div class="stat-strip ability-score-strip">${abilityScoreMarkup(m)}</div>${monsterFactSections(m)}${monsterActionSections(m,true)}</div>`,'<button value="cancel" class="button primary">Close</button>');
  }

  function showDialog(eyebrow,title,body,footer='') {
    const dialog=$('#appDialog');$('#dialogEyebrow').textContent=eyebrow; $('#dialogTitle').textContent=title; $('#dialogBody').innerHTML=body; $('#dialogFooter').innerHTML=footer;if(!dialog.open)dialog.showModal();
  }
  function closeDialog() { $('#appDialog').close(); }

  function pendingPcAlreadyAdded(member) {
    return pendingEncounterMembers.some(x=>x.kind==='pc'&&(x.sourceId===member.id||(String(x.name).toLowerCase()===String(member.name).toLowerCase()&&String(x.player||'').toLowerCase()===String(member.player||'').toLowerCase())));
  }
  function pendingEncounterDisplayName(member,index) {
    if(member.kind!=='monster')return member.name;
    const key=member.sourceId||String(member.name).toLowerCase(),peers=pendingEncounterMembers.filter(item=>item.kind==='monster'&&(item.sourceId||String(item.name).toLowerCase())===key);
    if(peers.length<2)return member.name;
    return `${member.name} ${pendingEncounterMembers.slice(0,index+1).filter(item=>item.kind==='monster'&&(item.sourceId||String(item.name).toLowerCase())===key).length}`;
  }
  function pendingEncounterMeta(member) {
    if(member.kind==='pc')return [member.className||'Player character',member.player,`AC ${member.ac}`,`HP ${member.maxHp??member.hp}`].filter(Boolean).join(' · ');
    return [[member.size,member.type].filter(Boolean).join(' '),member.challenge_rating?`CR ${member.challenge_rating}`:'',`AC ${member.ac??member.armor_class}`,`HP ${member.maxHp??member.hit_points??member.hp}`].filter(Boolean).join(' · ');
  }
  function syncPendingEncounterInitiatives() {
    $$('#appDialog [data-pending-initiative]').forEach(input=>{const index=num(input.dataset.pendingInitiative,-1);if(pendingEncounterMembers[index])pendingEncounterMembers[index].initiative=num(input.value,pendingEncounterMembers[index].initiative);});
  }
  function renderEncounterBuilder() {
    const currentName=$('#encounterBuilderName');if(currentName)pendingEncounterName=currentName.value;
    const roster=pendingEncounterMembers.length?pendingEncounterMembers.map((member,index)=>`<article class="encounter-builder-member ${member.kind==='pc'?'pc':'monster'}"><div><strong>${esc(pendingEncounterDisplayName(member,index))}</strong><small>${esc(pendingEncounterMeta(member))}</small></div><label>INITIATIVE<input data-pending-initiative="${index}" type="number" value="${num(member.initiative,10)}"></label><button type="button" data-remove-pending-member="${index}" aria-label="Remove ${esc(pendingEncounterDisplayName(member,index))}">×</button></article>`).join(''):'<div class="encounter-builder-empty">No combatants added yet.</div>';
    showDialog('Preparation',pendingEncounterId?'Edit encounter':'Create encounter',`<div class="encounter-builder"><label class="field full">ENCOUNTER NAME<input id="encounterBuilderName" value="${esc(pendingEncounterName)}" placeholder="Ambush at the old bridge" autofocus></label><div class="encounter-builder-heading"><div><span>COMBATANTS</span><strong>${pendingEncounterMembers.length}</strong></div><button type="button" id="encounterBuilderAddBtn" class="button ghost">＋ Add combatants</button></div><div class="encounter-builder-roster">${roster}</div></div>`,'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="confirmCreateEncounterBtn" class="button primary">Save encounter</button>');
  }
  function openEncounterBuilder(id=null) {
    const encounter=id?state.encounters.find(item=>item.id===id):null;if(id&&!encounter)return;
    pendingEncounterId=encounter?.id||null;pendingEncounterName=encounter?.name||'';pendingEncounterMembers=encounter?structuredClone(encounter.members):[];
    renderEncounterBuilder();
  }
  function removePendingEncounterMember(index) {
    syncPendingEncounterInitiatives();pendingEncounterMembers.splice(index,1);renderEncounterBuilder();
  }
  function openAddCombatant(target='combat') {
    combatPickerTarget=target;
    combatPickerSelections=new Map();
    const encounterTarget=target==='encounter-builder';
    const body=`<div class="tab-row"><button type="button" class="tab-button active" data-picker-tab="party">Party</button><button type="button" class="tab-button" data-picker-tab="monster">Monsters</button><button type="button" class="tab-button" data-picker-tab="quick">Quick add</button></div><div id="pickerContent"></div>`;
    const back=encounterTarget?'<button type="button" id="returnToEncounterBuilderBtn" class="button ghost">Back</button>':'<button value="cancel" class="button ghost">Cancel</button>';
    showDialog(encounterTarget?'Preparation':'Combat setup',encounterTarget?'Add combatants to encounter':'Add combatants',body,back+'<button type="button" id="confirmAddBtn" class="button primary">Add selected</button>');
    renderPicker('party');
  }
  function pickerSelectionKey(kind,id) { return kind+':'+id; }
  function updateCombatPickerCount() { const button=$('#confirmAddBtn');if(button)button.textContent=combatPickerSelections.size?'Add selected ('+combatPickerSelections.size+')':'Add selected'; }
  function rememberVisibleCombatPickerSelections() {
    $$('#pickerContent input[data-pick-kind]').forEach(input=>{
      const key=pickerSelectionKey(input.dataset.pickKind,input.value);
      if(!input.checked){combatPickerSelections.delete(key);return;}
      const initiativeInput=$('[data-init-for="'+input.value+'"]',$('#pickerContent'));
      combatPickerSelections.set(key,{kind:input.dataset.pickKind,id:input.value,initiative:num(initiativeInput?.value,10)});
    });
    updateCombatPickerCount();
  }
  function renderPicker(tab) {
    $$('.tab-button').forEach(b=>b.classList.toggle('active',b.dataset.pickerTab===tab));
    const out=$('#pickerContent');
    if(tab==='party') {
      out.innerHTML=state.parties.length?state.parties.map(p=>`<div class="detail-section"><h3>${esc(p.name)}</h3><div class="picker-list">${p.members.map(m=>{const already=combatPickerTarget==='combat'?pcAlreadyInCombat(m):combatPickerTarget==='encounter-builder'&&pendingPcAlreadyAdded(m),status=already?(combatPickerTarget==='combat'?' · Already in combat':' · Already in encounter'):'';return pickerItem('pc',m.id,m.name,`${m.className||'PC'} · AC ${m.ac} · HP ${m.hp}${status}`,already);}).join('')}</div></div>`).join(''):'<div class="empty-collection">Create a party first.</div>';
    } else if(tab==='monster') {
      out.innerHTML=`<label class="field full">SEARCH BESTIARY<input id="pickerSearch" placeholder="Monster name…"></label><div id="monsterPickerList" class="picker-list" style="margin-top:12px"></div>`; renderMonsterPicker('');
    } else {
      out.innerHTML=`<div class="form-grid"><label class="field full">NAME<input id="quickName" autofocus placeholder="Goblin scout"></label><label class="field">ARMOR CLASS<input id="quickAc" type="number" value="10"></label><label class="field">MAX HP<input id="quickHp" type="number" value="10"></label><label class="field">INITIATIVE<input id="quickInit" type="number" value="10"></label><label class="field">TYPE<input id="quickType" value="Creature"></label></div>`;
    }
    out.dataset.tab=tab;updateCombatPickerCount();
  }
  function pickerItem(kind,id,name,meta,disabled=false,initiativeModifier=0) {
    const selected=combatPickerSelections.get(pickerSelectionKey(kind,id)),checked=Boolean(selected&&!disabled);
    const initiativeControl=kind==='monster'
      ? '<span class="picker-auto-initiative"><small>AUTO INIT</small><strong>d20 '+formatModifier(initiativeModifier)+'</strong></span>'
      : '<input type="number" value="'+(selected?.initiative??10)+'" aria-label="Initiative for '+esc(name)+'" data-init-for="'+id+'" '+(disabled?'disabled':'')+'>';
    return '<label class="picker-item '+(disabled?'disabled':'')+'"><input type="checkbox" data-pick-kind="'+kind+'" value="'+id+'" '+(checked?'checked':'')+' '+(disabled?'disabled':'')+'><span><strong>'+esc(name)+'</strong><br><small>'+esc(meta)+'</small></span>'+initiativeControl+'</label>';
  }
  function renderMonsterPicker(q) {
    const matches=state.monsters.filter(m=>m.name.toLowerCase().includes(q.toLowerCase()));
    $('#monsterPickerList').innerHTML=matches.map(m=>pickerItem('monster',m.id,m.name,`CR ${m.challenge_rating} · AC ${m.armor_class} · HP ${m.hit_points} · Initiative ${formatModifier(m.initiative_modifier)}`,false,m.initiative_modifier)).join('')||'<div class="empty-collection">No monsters found.</div>';
  }
  function confirmAdd() {
    const tab=$('#pickerContent').dataset.tab;rememberVisibleCombatPickerSelections();const additions=[];
    if(tab==='quick') {
      const name=$('#quickName').value.trim();
      if(name)additions.push({id:uid(),added:Date.now(),kind:'monster',name,type:$('#quickType').value,ac:num($('#quickAc').value,10),hp:num($('#quickHp').value,10),maxHp:num($('#quickHp').value,10),initiative:num($('#quickInit').value,10),dex:10,conditions:[],actions:[],special_abilities:[]});
    }
    [...combatPickerSelections.values()].forEach(selection=>{
      if(selection.kind==='monster') {
        const m=state.monsters.find(x=>x.id===selection.id);if(!m)return;const monsterCopy=structuredClone(m);delete monsterCopy.original;
        additions.push({...monsterCopy,id:uid(),sourceId:m.id,added:Date.now()+Math.random(),kind:'monster',ac:m.armor_class,maxHp:m.hit_points,hp:m.hit_points,initiative:rollMonsterInitiative(m),dex:m.dexterity||10,conditions:[]});
      } else {
        const m=state.parties.flatMap(p=>p.members).find(x=>x.id===selection.id);if(!m||(combatPickerTarget==='combat'&&pcAlreadyInCombat(m)))return;
        additions.push({...structuredClone(m),id:uid(),sourceId:m.id,added:Date.now()+Math.random(),kind:'pc',maxHp:m.hp,hp:m.hp,initiative:num(selection.initiative,10),dex:10,conditions:[]});
      }
    });
    if(!additions.length)return toast('Select at least one combatant');
    combatPickerSelections.clear();
    if(combatPickerTarget==='encounter-builder') {
      pendingEncounterMembers.push(...additions.map(x=>({...structuredClone(x),id:undefined,hp:x.maxHp,conditions:[]})));
      renderEncounterBuilder();
      return;
    }
    state.combat.combatants.push(...additions);sortCombatants();state.combat.turn=0;state.combat.selectedId=state.combat.combatants[0]?.id;save();closeDialog();renderCombat();toast(additions.length+' combatant'+(additions.length===1?'':'s')+' added');
  }
  function renderMonsters() {
    const q=$('#monsterSearch').value.trim().toLowerCase(), cr=$('#monsterCrFilter').value;
    const filtered=state.monsters.filter(m=>(!q||`${m.name} ${m.type} ${m.challenge_rating}`.toLowerCase().includes(q))&&(!cr||String(m.challenge_rating)===cr));
    $('#monsterCount').textContent=state.monsters.length;
    const max=(monsterPage+1)*100, shown=filtered.slice(0,max);
    $('#monsterList').innerHTML=shown.length?shown.map(m=>`<article class="monster-row" data-monster-id="${m.id}" title="Open ${esc(m.name)} details"><div><strong>${esc(m.name)}</strong><br><small>${esc(`${m.size||''} ${m.type||''}`.trim())} · INIT ${formatModifier(m.initiative_modifier)}</small></div><small>${esc(m.alignment||'—')}</small><div class="monster-stat"><span>CR</span><b>${esc(m.challenge_rating)}</b></div><div class="monster-stat"><span>AC</span><b>${m.armor_class}</b></div><div class="monster-stat"><span>HP</span><b>${m.hit_points}</b></div><div class="monster-actions"><div class="monster-edit-actions"><button class="button ghost" data-edit-monster="${m.id}">Edit</button><button class="button ghost" data-copy-monster="${m.id}">Edit as New</button></div><button class="button primary monster-combat-button" data-add-monster="${m.id}">＋ Combat</button><button class="monster-delete-button" data-delete-monster="${m.id}" aria-label="Delete ${esc(m.name)}" title="Delete ${esc(m.name)}">×</button></div></article>`).join('')+(filtered.length>shown.length?'<button id="loadMoreMonsters" class="button ghost">Load more</button>':''):'<div class="empty-collection">No creatures match that search.</div>';
    const crs=[...new Set(state.monsters.map(m=>String(m.challenge_rating)))].sort((a,b)=>parseFloat(a)-parseFloat(b));
    const select=$('#monsterCrFilter'), current=select.value;
    select.innerHTML='<option value="">All challenge ratings</option>'+crs.map(x=>`<option ${x===current?'selected':''}>${esc(x)}</option>`).join('');
  }

  function applyFiveToolsRecords(kind,payloads,requestedSources=[]) {
    if(!FIVE_TOOLS)throw new Error('The 5etools import converter is unavailable.');
    const converter=kind==='monsters'?FIVE_TOOLS.convertMonster:FIVE_TOOLS.convertSpell,normalizer=kind==='monsters'?normaliseMonster:normaliseSpell;
    const converted=payloads.flatMap(payload=>FIVE_TOOLS.extract(kind,payload)).map(converter),unique=new Map();converted.forEach(record=>unique.set(importedRecordKey(record),record));
    const merged=FIVE_TOOLS.reconcileImported(state[kind],[...unique.values()],requestedSources);
    const imported=merged.imported.map(record=>{const normalized=normalizer(record);if(kind==='monsters')normalized.original=monsterBaseline(normalized);return normalized;});
    state[kind]=[...merged.retained,...imported].sort((a,b)=>a.name.localeCompare(b.name)||String(a.source||'').localeCompare(String(b.source||'')));
    save();if(kind==='monsters')renderMonsters();else renderSpells();
    return {added:merged.added,refreshed:merged.refreshed,total:imported.length};
  }

  function importMonsters(file) {
    const reader=new FileReader();
    reader.onload=()=>{try{const raw=JSON.parse(reader.result);if(raw&&Array.isArray(raw.monster)){const sources=[...new Set(raw.monster.map(item=>item.source).filter(Boolean))],result=applyFiveToolsRecords('monsters',[raw],sources);return toast(`${result.total} 5etools monsters imported`);}const arr=Array.isArray(raw)?raw:Array.isArray(raw.results)?raw.results:[raw];let added=0,updated=0;arr.forEach(item=>{const custom=markCustom(item),m=normaliseMonster(custom),key=monsterKey(m),idx=state.monsters.findIndex(x=>x.import_source!=='5etools'&&monsterKey(x)===key);if(idx>=0){m.id=state.monsters[idx].id;m.original=state.monsters[idx].original||m.original;state.monsters[idx]=m;updated++;}else{state.monsters.push(m);added++;}});state.monsters.sort((a,b)=>a.name.localeCompare(b.name));save();renderMonsters();toast(`${added} added · ${updated} updated`);}catch(error){console.error(error);toast('That file is not valid monster JSON');}};
    reader.readAsText(file);
  }

  function openFiveToolsImporter(kind) {
    if(!FIVE_TOOLS)return toast('The 5etools importer did not load');
    fiveToolsImportPlan=[];const noun=kind==='monsters'?'Bestiary':'Spells',url=FIVE_TOOLS.PAGE_URLS[kind];
    $('#appDialog').dataset.fiveToolsKind=kind;
    showDialog('Private library import',`Import ${noun} from 5etools`,`<div class="five-tools-intro"><p>Paste the 5etools ${noun} page or a specific 5etools data-file link. Echoes imports a private offline copy into your selected <strong>Echoes-library.json</strong>. The catalogue is downloaded from the source repository linked by 5etools.</p><p class="subtitle">Choose only the source books you use. Refreshing a source replaces only earlier 5etools records from that source; custom entries are never deleted.</p></div><label class="field full">5ETOOLS LINK<input id="fiveToolsUrl" type="url" value="${esc(url)}"></label><div id="fiveToolsSourceArea" class="five-tools-source-area"><p class="subtitle">Load the source list, then choose one or more books.</p></div><div id="fiveToolsProgress" class="five-tools-progress" role="status" aria-live="polite"></div>`,`<button value="cancel" class="button ghost">Cancel</button><button type="button" id="loadFiveToolsSourcesBtn" class="button primary">Load source list</button>`);
  }

  async function loadFiveToolsSources() {
    const kind=$('#appDialog').dataset.fiveToolsKind,area=$('#fiveToolsSourceArea'),button=$('#loadFiveToolsSourcesBtn');
    try{button.disabled=true;button.textContent='Loading…';const resolved=FIVE_TOOLS.resolveInput(kind,$('#fiveToolsUrl').value.trim());
      if(resolved.mode==='file')fiveToolsImportPlan=[{code:resolved.filename.replace(/\.json$/i,''),filename:resolved.filename,url:resolved.url}];
      else{const response=await fetch(resolved.url);if(!response.ok)throw new Error(`Source list request failed (${response.status}).`);const index=await response.json();fiveToolsImportPlan=Object.entries(index).map(([code,filename])=>({code,filename,url:FIVE_TOOLS.sourceFileUrl(kind,filename)})).sort((a,b)=>a.code.localeCompare(b.code));}
      area.innerHTML=`<div class="five-tools-source-toolbar"><strong>${fiveToolsImportPlan.length} source${fiveToolsImportPlan.length===1?'':'s'} available</strong><button type="button" id="toggleFiveToolsSourcesBtn" class="button ghost">Select all</button></div><div class="five-tools-source-list">${fiveToolsImportPlan.map((item,index)=>`<label class="filter-check"><input type="checkbox" data-five-tools-source value="${index}" ${fiveToolsImportPlan.length===1?'checked':''}><span><strong>${esc(item.code)}</strong><small>${esc(item.filename)}</small></span></label>`).join('')}</div>`;
      $('#dialogFooter').innerHTML='<button value="cancel" class="button ghost">Cancel</button><button type="button" id="confirmFiveToolsImportBtn" class="button primary">Import selected</button>';
    }catch(error){console.error(error);area.innerHTML=`<p class="import-error">${esc(error.message||'The 5etools source list could not be loaded.')}</p>`;button.disabled=false;button.textContent='Try again';}
  }

  function toggleFiveToolsSources() {
    const boxes=$$('[data-five-tools-source]'),selectAll=boxes.some(box=>!box.checked);boxes.forEach(box=>box.checked=selectAll);const button=$('#toggleFiveToolsSourcesBtn');if(button)button.textContent=selectAll?'Clear all':'Select all';
  }

  async function confirmFiveToolsImport() {
    const kind=$('#appDialog').dataset.fiveToolsKind,selected=$$('[data-five-tools-source]:checked').map(box=>fiveToolsImportPlan[num(box.value)]).filter(Boolean),button=$('#confirmFiveToolsImportBtn'),progress=$('#fiveToolsProgress');
    if(!selected.length)return toast('Choose at least one source book');
    button.disabled=true;$$('#appDialog button').forEach(item=>{if(item.value==='cancel')item.disabled=true;});let cursor=0,complete=0;const payloads=new Array(selected.length);
    try{const worker=async()=>{while(cursor<selected.length){const index=cursor++,item=selected[index];if(progress)progress.textContent=`Downloading ${complete+1} of ${selected.length}: ${item.code}…`;const response=await fetch(item.url);if(!response.ok)throw new Error(`${item.code} failed (${response.status}).`);payloads[index]=await response.json();complete++;}};await Promise.all(Array.from({length:Math.min(4,selected.length)},worker));if(progress)progress.textContent='Converting and saving…';const result=applyFiveToolsRecords(kind,payloads,selected.map(item=>item.code));closeDialog();toast(`${result.total} ${kind} imported · ${result.refreshed} refreshed`);
    }catch(error){console.error(error);if(progress)progress.innerHTML=`<span class="import-error">Import stopped without changing your library: ${esc(error.message||'download failed')}</span>`;button.disabled=false;$$('#appDialog button').forEach(item=>item.disabled=false);}
  }

  function monsterForm(m={}) {
    const abilityRows=ABILITIES.map(key=>{const label=key.slice(0,3).toUpperCase(),score=num(m[key],10),save=optionalNumber(m[`${key}_save`]);return `<div class="monster-ability-row"><strong>${label}</strong><label>SCORE<input id="m${key[0].toUpperCase()+key.slice(1)}" data-ability-score="${key}" type="number" value="${score}"></label><span class="ability-modifier" data-ability-modifier="${key}">MOD ${formatModifier(abilityModifier(score))}</span><label>SAVE<input id="m${key[0].toUpperCase()+key.slice(1)}Save" type="number" placeholder="${formatModifier(abilityModifier(score))}" value="${save??''}"></label></div>`;}).join('');
    const skillText=Object.entries(m.skills||{}).map(([key,value])=>`${SKILL_LABELS[key]||key} | ${formatModifier(value)}`).join('\n');
    return `<div class="form-grid monster-form">
      <label class="field full">NAME<input id="mName" value="${esc(m.name||'')}"></label>
      <label class="field">SIZE<input id="mSize" value="${esc(m.size||'Medium')}"></label><label class="field">TYPE<input id="mType" value="${esc(m.type||'creature')}"></label>
      <label class="field">SUBTYPE<input id="mSubtype" value="${esc(m.subtype||'')}"></label><label class="field">ALIGNMENT<input id="mAlignment" value="${esc(m.alignment||'')}"></label>
      <label class="field">CHALLENGE RATING<input id="mCr" value="${esc(m.challenge_rating||'1')}"></label><label class="field">EXPERIENCE POINTS<input id="mXp" type="number" min="0" value="${num(m.experience_points,experienceFromCR(m.challenge_rating||'1'))}"></label>
      <label class="field">PROFICIENCY BONUS<input id="mPb" type="number" value="${num(m.proficiency_bonus,proficiencyBonusFromCR(m.challenge_rating||'1'))}"></label><label class="field">ARMOR CLASS<input id="mAc" type="number" value="${m.armor_class||10}"></label>
      <label class="field">HIT POINTS<input id="mHp" type="number" value="${m.hit_points||10}"></label><label class="field">HIT DICE / HP FORMULA<input id="mHitDice" value="${esc(m.hit_dice||'')}"></label>
      <label class="field">INITIATIVE MODIFIER<input id="mInitiativeModifier" type="number" value="${num(m.initiative_modifier,initiativeModifierFromDex(m.dexterity||10))}"></label><label class="field">INITIATIVE SCORE<input id="mInitiativeScore" type="number" value="${num(m.initiative_score,10+num(m.initiative_modifier,initiativeModifierFromDex(m.dexterity||10)))}"></label>
      <label class="field">LEGENDARY RESISTANCES<input id="mLegendaryResistances" type="number" min="0" step="1" value="${legendaryResistanceCount(m)}"></label>
      <div class="monster-form-section full"><h3>Abilities & saving throws</h3><p>Leave a save blank to use the normal ability modifier.</p><div class="monster-ability-editor">${abilityRows}</div></div>
      <label class="field full">SKILLS <small>One per line: Skill | Bonus</small><textarea id="mSkills" rows="5">${esc(skillText)}</textarea></label>
      <label class="field full">SPEED<input id="mSpeed" value="${esc(m.speed||'30 ft.')}"></label><label class="field full">SENSES<input id="mSenses" value="${esc(m.senses||'')}"></label>
      <label class="field full">LANGUAGES<input id="mLanguages" value="${esc(m.languages||'')}"></label>
      <label class="field full">DAMAGE VULNERABILITIES<input id="mDamageVulnerabilities" value="${esc(m.damage_vulnerabilities||'')}"></label><label class="field full">DAMAGE RESISTANCES<input id="mDamageResistances" value="${esc(m.damage_resistances||'')}"></label>
      <label class="field full">DAMAGE IMMUNITIES<input id="mDamageImmunities" value="${esc(m.damage_immunities||'')}"></label><label class="field full">CONDITION IMMUNITIES<input id="mConditionImmunities" value="${esc(m.condition_immunities||'')}"></label>
      <label class="field full">TRAITS <small>One per line: Name | Description</small><textarea id="mAbilities" rows="6">${esc((m.special_abilities||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>
      <label class="field full">ACTIONS <small>One per line: Name | Description</small><textarea id="mActions" rows="7">${esc((m.actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>
      <label class="field full">BONUS ACTIONS <small>One per line: Name | Description</small><textarea id="mBonusActions" rows="5">${esc((m.bonus_actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>
      <label class="field full">REACTIONS <small>One per line: Name | Description</small><textarea id="mReactions" rows="5">${esc((m.reactions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>
      <label class="field full">LEGENDARY ACTIONS <small>One per line: Name | Description</small><textarea id="mLegendary" rows="6">${esc((m.legendary_actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>
      <label class="field full">SOURCE URL<input id="mSourceUrl" type="url" value="${esc(m.source_url||'')}"></label>
    </div>`;
  }
  function parseAbilities(text) { return text.split('\n').filter(x=>x.trim()).map(line=>{const [name,...desc]=line.split('|');return {name:name.trim(),desc:desc.join('|').trim()};}); }
  function parseSkillBonuses(text) {
    const skills={};
    String(text||'').split('\n').filter(line=>line.trim()).forEach(line=>{const [name,...bonusParts]=line.split('|'),key=skillKey(name),bonus=optionalNumber(bonusParts.join('|').trim());if(SKILL_LABELS[key]&&bonus!==null)skills[key]=bonus;});
    return skills;
  }
  function saveMonster() {
    const name=$('#mName').value.trim();if(!name)return toast('Give the monster a name');
    const editId=$('#appDialog').dataset.editMonsterId,cloneId=$('#appDialog').dataset.cloneMonsterId,idx=state.monsters.findIndex(x=>x.id===editId),cloneIdx=state.monsters.findIndex(x=>x.id===cloneId),base=idx>=0?state.monsters[idx]:cloneIdx>=0?state.monsters[cloneIdx]:{};
    const abilityFields={};ABILITIES.forEach(key=>{const title=key[0].toUpperCase()+key.slice(1);abilityFields[key]=$(`#m${title}`).value;abilityFields[`${key}_save`]=$(`#m${title}Save`).value;});
    const draft={...base,...abilityFields,id:editId||uid(),name,size:$('#mSize').value,type:$('#mType').value,subtype:$('#mSubtype').value,alignment:$('#mAlignment').value,source_url:$('#mSourceUrl').value,challenge_rating:$('#mCr').value,experience_points:$('#mXp').value,proficiency_bonus:$('#mPb').value,legendary_resistances:$('#mLegendaryResistances').value,armor_class:$('#mAc').value,hit_points:$('#mHp').value,hit_dice:$('#mHitDice').value,initiative_modifier:$('#mInitiativeModifier').value,initiative_score:$('#mInitiativeScore').value,skills:parseSkillBonuses($('#mSkills').value),speed:$('#mSpeed').value,senses:$('#mSenses').value,languages:$('#mLanguages').value,damage_vulnerabilities:$('#mDamageVulnerabilities').value,damage_resistances:$('#mDamageResistances').value,damage_immunities:$('#mDamageImmunities').value,condition_immunities:$('#mConditionImmunities').value,actions:parseAbilities($('#mActions').value),special_abilities:parseAbilities($('#mAbilities').value),bonus_actions:parseAbilities($('#mBonusActions').value),reactions:parseAbilities($('#mReactions').value),legendary_actions:parseAbilities($('#mLegendary').value)};
    const customDraft=markCustom(draft);if(!editId){delete customDraft.original;customDraft.original=monsterBaseline(customDraft);}const monster=normaliseMonster(customDraft);if(idx>=0)state.monsters[idx]=monster;else state.monsters.push(monster);state.monsters.sort((a,b)=>a.name.localeCompare(b.name));delete $('#appDialog').dataset.editMonsterId;delete $('#appDialog').dataset.cloneMonsterId;save();closeDialog();renderMonsters();toast(`${name} ${idx>=0?'updated':'added to the bestiary'}`);
  }
  function deleteMonsterFromBestiary() { const id=$('#appDialog').dataset.deleteMonsterId,monster=state.monsters.find(x=>x.id===id);if(!monster)return;state.monsters=state.monsters.filter(x=>x.id!==id);delete $('#appDialog').dataset.deleteMonsterId;save();closeDialog();renderMonsters();toast(`${monster.name} removed from the Bestiary`); }
  function restoreMonsterDefault() { const id=$('#appDialog').dataset.editMonsterId,idx=state.monsters.findIndex(x=>x.id===id);if(idx<0)return;const current=state.monsters[idx],baseline=structuredClone(current.original||monsterBaseline(current));state.monsters[idx]=normaliseMonster({...baseline,id:current.id,original:baseline});state.monsters.sort((a,b)=>a.name.localeCompare(b.name));delete $('#appDialog').dataset.editMonsterId;save();closeDialog();renderMonsters();toast(`${baseline.name||current.name} restored to default`); }


  function spellClasses(spell) { return String(spell.class||'').split(',').map(x=>x.trim()).filter(Boolean); }
  function renderSpellFilters() {
    const schools=[...new Set(state.spells.map(s=>s.school).filter(Boolean))].sort(),casting=[...new Set(state.spells.map(s=>s.casting_time).filter(Boolean))].sort(),classes=[...new Set(state.spells.flatMap(spellClasses))].sort();
    const group=(key,label,values)=>{const selected=spellFilters[key];return `<details class="filter-group"><summary>${label}${selected.size?` (${selected.size})`:''}</summary><div class="filter-options">${values.map(value=>`<label class="filter-check"><input type="checkbox" data-spell-filter="${key}" value="${esc(value)}" ${selected.has(value)?'checked':''}><span>${esc(value)}</span></label>`).join('')}</div></details>`;};
    const active=spellFilters.school.size+spellFilters.casting.size+spellFilters.classes.size;
    $('#spellFilters').innerHTML='<span class="filter-label">FILTER BY</span>'+group('school','School',schools)+group('casting','Casting',casting)+group('classes','Class',classes)+(active?`<button id="clearSpellFilters" class="button ghost">Clear ${active}</button>`:'');
  }
  function renderSpells(updateFilters=true) {
    const q=$('#spellSearch').value.trim().toLowerCase(),level=$('#spellLevelFilter').value;
    const filtered=state.spells.filter(s=>{const classes=spellClasses(s);return (!q||`${s.name} ${s.school} ${s.class} ${stripHtml(s.desc)}`.toLowerCase().includes(q))&&(!level||s.level===level)&&(!spellFilters.school.size||spellFilters.school.has(s.school))&&(!spellFilters.casting.size||spellFilters.casting.has(s.casting_time))&&(!spellFilters.classes.size||[...spellFilters.classes].some(value=>classes.includes(value)));});
    $('#spellCount').textContent=state.spells.length;
    $('#spellList').innerHTML=filtered.length?filtered.map(s=>`<article class="spell-row" data-spell-id="${s.id}"><div><strong>${esc(s.name)}</strong><br><small>${esc(s.class||'—')}</small></div><div><span>LEVEL</span><b>${esc(s.level)}</b></div><div><span>SCHOOL</span><b>${esc(s.school||'—')}</b></div><div><span>CASTING</span><b>${esc(s.casting_time||'—')}</b></div><div><span>RANGE</span><b>${esc(s.range||'—')}</b></div></article>`).join(''):'<div class="empty-collection">No spells match those filters.</div>';
    const levels=[...new Set(state.spells.map(s=>s.level))].sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0)),select=$('#spellLevelFilter'),current=select.value;
    select.innerHTML='<option value="">All spell levels</option>'+levels.map(x=>`<option value="${esc(x)}" ${x===current?'selected':''}>${esc(x)}</option>`).join('');
    if(updateFilters)renderSpellFilters();
  }
  function showSpellDetails(spell) {
    if(!spell)return;
    const concentration=String(spell.concentration).toLowerCase()==='yes'?' · Concentration':'';
    showDialog('Spell reference',spell.name,`<div class="spell-meta"><span>${esc(spell.level)}</span><span>${esc(spell.school||'—')}</span><span>${esc(spell.casting_time||'—')}</span></div><div class="stat-strip"><div><span>RANGE</span><strong>${esc(spell.range||'—')}</strong></div><div><span>DURATION</span><strong>${esc((spell.duration||'—')+concentration)}</strong></div><div><span>COMPONENTS</span><strong>${esc(spell.components||'—')}</strong></div></div><div class="spell-description">${richDescription(spell.desc)}</div>${spell.higher_level?`<div class="detail-section"><h3>At higher levels</h3><div class="spell-description">${richDescription(spell.higher_level)}</div></div>`:''}${spell.material?`<div class="detail-section"><h3>Material</h3><p>${esc(spell.material)}</p></div>`:''}<div class="detail-section"><h3>Classes</h3><p>${esc(spell.class||'—')}</p></div>`,'<button value="cancel" class="button ghost">Close</button>');
  }
  function spellForm(s={}) { return `<div class="form-grid"><label class="field full">NAME<input id="sName" value="${esc(s.name||'')}"></label><label class="field">LEVEL<input id="sLevel" value="${esc(s.level||'Cantrip')}"></label><label class="field">SCHOOL<input id="sSchool" value="${esc(s.school||'')}"></label><label class="field">CASTING TIME<input id="sCasting" value="${esc(s.casting_time||'1 action')}"></label><label class="field">RANGE<input id="sRange" value="${esc(s.range||'')}"></label><label class="field">DURATION<input id="sDuration" value="${esc(s.duration||'')}"></label><label class="field">COMPONENTS<input id="sComponents" value="${esc(s.components||'')}"></label><label class="field full">CLASSES<input id="sClass" value="${esc(s.class||'')}"></label><label class="field full">DESCRIPTION<textarea id="sDesc" rows="7">${esc(stripHtml(s.desc||''))}</textarea></label><label class="field full">AT HIGHER LEVELS<textarea id="sHigher" rows="4">${esc(stripHtml(s.higher_level||''))}</textarea></label></div>`; }
  function saveSpell() { const name=$('#sName').value.trim();if(!name)return toast('Give the spell a name');state.spells.push(normaliseSpell(markCustom({name,level:$('#sLevel').value,school:$('#sSchool').value,casting_time:$('#sCasting').value,range:$('#sRange').value,duration:$('#sDuration').value,components:$('#sComponents').value,class:$('#sClass').value,desc:$('#sDesc').value,higher_level:$('#sHigher').value})));state.spells.sort((a,b)=>a.name.localeCompare(b.name));save();closeDialog();renderSpells();toast(`${name} added to spells`); }
  function importSpells(file) { const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result);if(raw&&Array.isArray(raw.spell)){const sources=[...new Set(raw.spell.map(item=>item.source).filter(Boolean))],result=applyFiveToolsRecords('spells',[raw],sources);return toast(`${result.total} 5etools spells imported`);}const arr=Array.isArray(raw)?raw:Array.isArray(raw.results)?raw.results:[raw];let added=0,updated=0;arr.forEach(item=>{const s=normaliseSpell(markCustom(item)),idx=state.spells.findIndex(x=>x.import_source!=='5etools'&&x.name.toLowerCase()===s.name.toLowerCase());if(idx>=0){s.id=state.spells[idx].id;state.spells[idx]=s;updated++;}else{state.spells.push(s);added++;}});state.spells.sort((a,b)=>a.name.localeCompare(b.name));save();renderSpells();toast(`${added} added · ${updated} updated`);}catch(error){console.error(error);toast('That file is not valid spell JSON');}};reader.readAsText(file); }

  function renderParties() {
    $('#partyGrid').innerHTML=state.parties.length?state.parties.map(p=>`<article class="card party-card"><button class="party-delete-button" data-delete-party="${p.id}" aria-label="Delete ${esc(p.name)}" title="Delete ${esc(p.name)}">×</button><p class="eyebrow">${p.members.length} MEMBERS</p><h2>${esc(p.name)}</h2><p class="meta">Ready player roster</p><div class="roster-preview">${p.members.map(m=>`<span>${esc(m.name)} · AC ${m.ac}</span>`).join('')}</div><div class="card-actions"><button class="button ghost" data-edit-party="${p.id}">Edit</button><button class="button primary" data-add-party="${p.id}">Add to combat</button></div></article>`).join(''):'<div class="empty-collection"><h2>No parties yet</h2><p>Create your regular player roster once, then reuse it in every encounter.</p></div>';
  }
  function openPartyEditor(id) {
    const p=id?state.parties.find(x=>x.id===id):{id:uid(),name:'',members:[]};
    showDialog('Player roster',id?'Edit party':'New party',`<label class="field">PARTY NAME<input id="partyName" value="${esc(p.name)}" placeholder="The Wayward Company"></label><div class="party-members"><div class="list-heading"><span>CHARACTERS</span></div><div id="memberEditors"></div><button type="button" id="addMemberRow" class="button ghost" style="margin-top:12px">＋ Add character</button></div>`,'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="savePartyBtn" class="button primary">Save party</button>');
    $('#appDialog').dataset.editParty=p.id; $('#appDialog').dataset.isNew=id?'0':'1';
    p.members.forEach(addMemberEditor);
    if(!p.members.length)addMemberEditor();
  }
  function addMemberEditor(m={}) { const row=document.createElement('div'); row.className='member-editor';row.dataset.memberId=m.id||''; row.innerHTML=`<input data-f="name" placeholder="Character" value="${esc(m.name||'')}"><input data-f="player" placeholder="Player" value="${esc(m.player||'')}"><input data-f="className" placeholder="Class" value="${esc(m.className||'')}"><input data-f="hp" type="number" placeholder="HP" value="${m.hp||''}"><input data-f="ac" type="number" placeholder="AC" value="${m.ac||''}"><button type="button" class="mini-remove" aria-label="Remove character">×</button>`; $('#memberEditors').append(row); }
  function saveParty() { const name=$('#partyName').value.trim(); if(!name)return toast('Give the party a name'); const members=$$('.member-editor').map(row=>({id:row.dataset.memberId||uid(),name:$('[data-f=name]',row).value.trim(),player:$('[data-f=player]',row).value.trim(),className:$('[data-f=className]',row).value.trim(),hp:num($('[data-f=hp]',row).value,1),ac:num($('[data-f=ac]',row).value,10)})).filter(m=>m.name); const id=$('#appDialog').dataset.editParty, party={id,name,members}; const idx=state.parties.findIndex(x=>x.id===id); if(idx>=0)state.parties[idx]=party;else state.parties.push(party);save();closeDialog();renderParties();toast('Party saved'); }
  function openDeleteParty(id) { const party=state.parties.find(item=>item.id===id);if(!party)return;$('#appDialog').dataset.deletePartyId=id;showDialog('Parties','Delete party?',`<p>Delete <strong>${esc(party.name)}</strong>?</p><p class="subtitle">Characters already copied into encounters or active combat will remain there.</p>`,'<button value="cancel" class="button ghost">No</button><button type="button" id="confirmDeletePartyBtn" class="button danger-ghost">Yes, delete</button>'); }
  function deleteParty() { const id=$('#appDialog').dataset.deletePartyId,party=state.parties.find(item=>item.id===id);if(!party)return;state.parties=state.parties.filter(item=>item.id!==id);delete $('#appDialog').dataset.deletePartyId;save();closeDialog();renderParties();toast(`${party.name} deleted`); }
  function addPartyToCombat(id) { const p=state.parties.find(x=>x.id===id);if(!p)return;const members=p.members.filter(m=>!pcAlreadyInCombat(m));if(!members.length)return toast('Those characters are already in combat');members.forEach((m,i)=>state.combat.combatants.push({...structuredClone(m),id:uid(),sourceId:m.id,kind:'pc',maxHp:m.hp,hp:m.hp,initiative:10,dex:10,conditions:[],added:Date.now()+i}));sortCombatants();save();renderCombat();switchView('combat');toast(`${members.length} character${members.length===1?'':'s'} joined the combat`); }

  function renderEncounters() {
    const q=$('#encounterSearch').value.trim().toLowerCase();
    const encounters=state.encounters.filter(e=>!q||[e.name,...e.members.flatMap(m=>[m.name,m.player,m.className,m.type])].filter(Boolean).join(' ').toLowerCase().includes(q));
    $('#encounterGrid').innerHTML=encounters.length?encounters.map(e=>{const pcs=e.members.filter(m=>m.kind==='pc').length,monsters=e.members.length-pcs;return `<article class="encounter-row"><div class="encounter-identity"><p class="eyebrow">SAVED ENCOUNTER</p><h2>${esc(e.name)}</h2><p class="meta">${pcs} character${pcs===1?'':'s'} · ${monsters} monster${monsters===1?'':'s'} · ${new Date(e.updated).toLocaleDateString()}</p></div><div class="encounter-roster">${e.members.slice(0,14).map(m=>`<span class="roster-member ${m.kind==='pc'?'pc':'monster'}">${esc(m.name)}</span>`).join('')}${e.members.length>14?`<span class="roster-member">+${e.members.length-14} more</span>`:''}</div><div class="encounter-actions"><div class="encounter-primary-actions"><button class="button primary encounter-start-button" data-start-encounter="${e.id}">Start encounter</button><button class="button ghost encounter-edit-button" data-edit-encounter="${e.id}">Edit</button></div><div class="encounter-icon-actions"><button class="encounter-delete-button" data-delete-encounter="${e.id}" aria-label="Delete ${esc(e.name)}" title="Delete ${esc(e.name)}">×</button><button class="encounter-export-icon" data-export-encounter="${e.id}" aria-label="Export ${esc(e.name)} as JSON" title="Export JSON">⇩</button></div></div></article>`;}).join(''):state.encounters.length?'<div class="empty-collection"><h2>No matching encounters</h2><p>Try a different encounter, monster, or character name.</p></div>':'<div class="empty-collection"><h2>No saved encounters</h2><p>Build a combat, then save it here so it is ready for game night.</p></div>';
  }
  function deleteEncounterFromLibrary() { const id=$('#appDialog').dataset.deleteEncounterId,encounter=state.encounters.find(x=>x.id===id);if(!encounter)return;state.encounters=state.encounters.filter(x=>x.id!==id);delete $('#appDialog').dataset.deleteEncounterId;save();closeDialog();renderEncounters();toast(`${encounter.name} deleted`); }
  function encounterFilename(name) { return String(name||'encounter').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'encounter'; }
  async function exportEncounter(encounter) {
    if(!encounter)return;
    const payload={format:'echoes-encounter',version:1,encounter:structuredClone(encounter)},json=JSON.stringify(payload,null,2),filename=encounterFilename(encounter.name)+'.json';
    if('showSaveFilePicker' in window){
      try{const handle=await window.showSaveFilePicker({id:'echoes-encounter-export',suggestedName:filename,startIn:'documents',types:[{description:'Echoes encounter',accept:{'application/json':['.json']}}]});const writable=await handle.createWritable();await writable.write(json);await writable.close();toast(`${encounter.name} exported`);return;}catch(error){if(error.name==='AbortError')return;toast('The save picker failed; using browser download instead.');}
    }
    const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function importEncounter(file) { const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result),source=raw.encounter||raw;if(!source||!source.name||!Array.isArray(source.members))throw new Error('Invalid encounter');const encounter={id:source.id||uid(),name:String(source.name),members:source.members,updated:Date.now()},idx=state.encounters.findIndex(x=>x.id===encounter.id||x.name.toLowerCase()===encounter.name.toLowerCase());if(idx>=0){encounter.id=state.encounters[idx].id;state.encounters[idx]=encounter;}else state.encounters.push(encounter);save();renderEncounters();toast(`${encounter.name} imported`);}catch{toast('That file is not valid encounter JSON');}};reader.readAsText(file); }

  function saveActiveEncounter() { if(!state.combat.combatants.length)return toast('Add combatants before saving');const current=state.combat.name==='Untitled battle'?'':state.combat.name;showDialog('Preparation',state.combat.editingEncounterId?'Update encounter':'Save encounter',`<label class="field">ENCOUNTER NAME<input id="saveEncounterName" value="${esc(current)}" placeholder="Ambush at the old bridge" autofocus></label>`,'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="confirmSaveEncounterBtn" class="button primary">Save encounter</button>'); }
  function commitActiveEncounter() { const name=$('#saveEncounterName').value.trim();if(!name)return toast('Give the encounter a name');state.combat.name=name;const members=state.combat.combatants.map(x=>({...structuredClone(x),id:undefined,hp:x.maxHp,conditions:[]}));let encounter=state.encounters.find(x=>x.id===state.combat.editingEncounterId)||state.encounters.find(x=>x.name.toLowerCase()===name.toLowerCase());if(encounter){encounter.name=name;encounter.members=members;encounter.updated=Date.now();}else{encounter={id:uid(),name,members,updated:Date.now()};state.encounters.push(encounter);}state.combat.editingEncounterId=encounter.id;save();closeDialog();renderCombat();renderEncounters();exportEncounter(encounter);toast('Encounter saved and exported'); }
  function commitPreparedEncounter() {
    const name=$('#encounterBuilderName')?.value.trim();
    if(!name)return toast('Give the encounter a name');
    if(!pendingEncounterMembers.length)return toast('Add at least one combatant');
    syncPendingEncounterInitiatives();
    const duplicate=state.encounters.find(encounter=>encounter.id!==pendingEncounterId&&encounter.name.toLowerCase()===name.toLowerCase());if(duplicate)return toast('An encounter with that name already exists');
    const members=pendingEncounterMembers.map(member=>({...structuredClone(member),id:undefined,hp:member.maxHp??member.hp,conditions:[]}));
    let encounter=state.encounters.find(item=>item.id===pendingEncounterId),updated=Boolean(encounter);
    if(encounter){encounter.name=name;encounter.members=members;encounter.updated=Date.now();}
    else{encounter={id:uid(),name,members,updated:Date.now()};state.encounters.push(encounter);}
    pendingEncounterId=null;pendingEncounterName='';pendingEncounterMembers=[];save();closeDialog();renderEncounters();toast(`${name} ${updated?'updated':'saved'} without changing active combat`);
  }
  function editEncounter(id) { openEncounterBuilder(id); }
  function startEncounter(id) { const e=state.encounters.find(x=>x.id===id); if(!e)return; if(state.combat.combatants.length&&!confirm('Replace the current combat?'))return; state.combat={name:e.name,round:1,turn:0,selectedId:null,combatants:e.members.map((m,i)=>({...structuredClone(m),id:uid(),hp:m.maxHp,initiative:m.kind==='monster'?rollMonsterInitiative(m):m.initiative,conditions:[],added:Date.now()+i}))};sortCombatants();state.combat.selectedId=state.combat.combatants[0]?.id;save();renderCombat();switchView('combat'); }

  function changeHp(id,delta) { const x=state.combat.combatants.find(y=>y.id===id); if(!x)return;x.hp=Math.max(0,Math.min(x.maxHp,x.hp+delta));state.combat.selectedId=id;save();renderCombat(); }
  function removeCombatant(id) { const x=state.combat.combatants.find(y=>y.id===id); if(!x)return;const displayName=combatDisplayName(x);state.combat.combatants=state.combat.combatants.filter(y=>y.id!==id);state.combat.turn=Math.min(state.combat.turn,Math.max(0,state.combat.combatants.length-1));state.combat.selectedId=state.combat.combatants[state.combat.turn]?.id||null;save();renderCombat();toast(`${displayName} removed from combat`); }
  function rowMenu(id) {
    const x=state.combat.combatants.find(y=>y.id===id);
    const monsterFields=x.kind==='monster'?`<label class="field full">INSTANCE NAME<input id="editName" value="${esc(x.name)}"></label><label class="field full">SPEED<input id="editSpeed" value="${esc(x.speed||'')}"></label><label class="field full">SENSES<input id="editSenses" value="${esc(x.senses||'')}"></label><label class="field">LEGENDARY RESISTANCES<input id="editLegendaryResistances" type="number" min="0" step="1" value="${legendaryResistanceCount(x)}"></label><label class="field full">TRAITS <small>One per line: Name | Description</small><textarea id="editAbilities" rows="5">${esc((x.special_abilities||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label><label class="field full">ACTIONS <small>One per line: Name | Description</small><textarea id="editActions" rows="6">${esc((x.actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label><label class="field full">BONUS ACTIONS <small>One per line: Name | Description</small><textarea id="editBonusActions" rows="4">${esc((x.bonus_actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label><label class="field full">REACTIONS <small>One per line: Name | Description</small><textarea id="editReactions" rows="4">${esc((x.reactions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label><label class="field full">LEGENDARY ACTIONS <small>One per line: Name | Description</small><textarea id="editLegendary" rows="5">${esc((x.legendary_actions||[]).map(a=>`${a.name} | ${a.desc}`).join('\n'))}</textarea></label>`:'';
    const saveCustom=x.kind==='monster'?'<button type="button" id="saveCombatMonsterBtn" class="button ghost">Save to Bestiary</button>':'';
    showDialog('Combatant options',combatDisplayName(x),`<div class="form-grid">${monsterFields}<label class="field">CURRENT HP<input id="editHp" type="number" value="${x.hp}"></label><label class="field">MAX HP<input id="editMaxHp" type="number" value="${x.maxHp}"></label><label class="field">ARMOR CLASS<input id="editAc" type="number" value="${x.ac}"></label><label class="field">INITIATIVE<input id="editInit" type="number" value="${x.initiative}"></label></div>`,saveCustom+'<button type="button" id="removeCombatantBtn" class="button danger-ghost">Remove</button><button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveCombatantBtn" class="button primary">Save changes</button>');
    $('#appDialog').dataset.combatantId=id;
  }
  function saveCombatantChanges(closeAfter=true) {
    const x=state.combat.combatants.find(y=>y.id===$('#appDialog').dataset.combatantId);if(!x)return;const currentId=state.combat.combatants[state.combat.turn]?.id;
    x.hp=num($('#editHp').value,x.hp);x.maxHp=Math.max(1,num($('#editMaxHp').value,x.maxHp));x.hp=Math.max(0,Math.min(x.maxHp,x.hp));x.ac=num($('#editAc').value,x.ac);x.initiative=num($('#editInit').value,x.initiative);
    if(x.kind==='monster'&&$('#editName')){x.name=$('#editName').value.trim()||x.name;x.speed=$('#editSpeed').value;x.senses=$('#editSenses').value;x.legendary_resistances=Math.max(0,Math.floor(num($('#editLegendaryResistances').value,0)));x.special_abilities=parseAbilities($('#editAbilities').value);x.actions=parseAbilities($('#editActions').value);x.bonus_actions=parseAbilities($('#editBonusActions').value);x.reactions=parseAbilities($('#editReactions').value);x.legendary_actions=parseAbilities($('#editLegendary').value);}
    sortCombatants();state.combat.turn=Math.max(0,state.combat.combatants.findIndex(y=>y.id===currentId));state.combat.selectedId=x.id;save();if(closeAfter){closeDialog();renderCombat();}return x;
  }
  function saveCombatMonsterToBestiary() { const x=saveCombatantChanges(false);if(!x||x.kind!=='monster')return;const {id,sourceId,kind,hp,maxHp,ac,initiative,conditions,added,original,...base}=x,draft=markCustom({...base,id:uid(),armor_class:ac,hit_points:maxHp});draft.original=monsterBaseline(draft);state.monsters.push(normaliseMonster(draft));state.monsters.sort((a,b)=>a.name.localeCompare(b.name));save();closeDialog();renderCombat();renderMonsters();toast(`${x.name} saved to the Bestiary`); }

  function handleDialogClick(e) {
    const diceLink=e.target.closest('[data-dice-expression]');if(diceLink)return rollDiceExpression(diceLink.dataset.diceExpression,diceSourceForElement(diceLink));
    if(e.target.id==='confirmCustomDieBtn')return saveCustomDie();
    const spellLink=e.target.closest('[data-spell-name]');if(spellLink)return showSpellDetails(state.spells.find(s=>s.name===spellLink.dataset.spellName));
    if(e.target.id==='saveSpellBtn')return saveSpell();
    if(e.target.id==='loadFiveToolsSourcesBtn')return loadFiveToolsSources();
    if(e.target.id==='toggleFiveToolsSourcesBtn')return toggleFiveToolsSources();
    if(e.target.id==='confirmFiveToolsImportBtn')return confirmFiveToolsImport();
    const tab=e.target.closest('[data-picker-tab]'); if(tab){rememberVisibleCombatPickerSelections();return renderPicker(tab.dataset.pickerTab);}
    if(e.target.id==='confirmAddBtn')return confirmAdd();
    if(e.target.id==='confirmSaveEncounterBtn')return commitActiveEncounter();
    if(e.target.id==='confirmCreateEncounterBtn')return commitPreparedEncounter();
    if(e.target.id==='encounterBuilderAddBtn'){pendingEncounterName=$('#encounterBuilderName').value;syncPendingEncounterInitiatives();return openAddCombatant('encounter-builder');}
    if(e.target.id==='returnToEncounterBuilderBtn')return renderEncounterBuilder();
    const removePending=e.target.closest('[data-remove-pending-member]');if(removePending)return removePendingEncounterMember(num(removePending.dataset.removePendingMember));
    if(e.target.id==='saveMonsterBtn')return saveMonster();
    if(e.target.id==='restoreMonsterBtn')return restoreMonsterDefault();
    if(e.target.id==='confirmDeleteMonsterBtn')return deleteMonsterFromBestiary();
    if(e.target.id==='confirmDeleteEncounterBtn')return deleteEncounterFromLibrary();
    if(e.target.id==='confirmDeletePartyBtn')return deleteParty();
    if(e.target.id==='saveCombatMonsterBtn')return saveCombatMonsterToBestiary();
    if(e.target.id==='addMemberRow')return addMemberEditor();
    const rm=e.target.closest('.mini-remove');if(rm)return rm.closest('.member-editor').remove();
    if(e.target.id==='savePartyBtn')return saveParty();
    const cond=e.target.closest('[data-condition]');if(cond){const x=state.combat.combatants.find(y=>y.id===state.combat.selectedId);if(!x.conditions.includes(cond.dataset.condition))x.conditions.push(cond.dataset.condition);save();closeDialog();renderCombat();return;}
    if(e.target.id==='saveCombatantBtn')return saveCombatantChanges();
    if(e.target.id==='removeCombatantBtn'){const id=$('#appDialog').dataset.combatantId;state.combat.combatants=state.combat.combatants.filter(x=>x.id!==id);state.combat.turn=0;save();closeDialog();renderCombat();return;}
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#appDialog'))return handleDialogClick(e);
    if(e.target.id==='sidebarToggleBtn'){state.ui.sidebarCollapsed=!state.ui.sidebarCollapsed;save();applyUiState();return;}
    if(e.target.id==='detailToggleBtn'){state.ui.detailCollapsed=!state.ui.detailCollapsed;save();applyUiState();return;}
    const dieButton=e.target.closest('[data-die-size]');if(dieButton){state.dice={...defaults.dice,...state.dice,sides:num(dieButton.dataset.dieSize,20)};save();renderDiceRoller();return;}
    const diceStep=e.target.closest('[data-dice-step]');if(diceStep){const isCount=diceStep.dataset.diceStep==='count',input=$(isCount?'#diceCountInput':'#diceModifierInput'),minimum=isCount?1:-999,maximum=isCount?100:999,value=Math.max(minimum,Math.min(maximum,num(input.value,isCount?1:0)+num(diceStep.dataset.delta)));input.value=value;state.dice={...defaults.dice,...state.dice,[isCount?'count':'modifier']:value};save();updateDiceExpressionPreview();return;}
    if(e.target.id==='rollDiceBtn')return rollDiceFromControls();
    if(e.target.closest('#clearDiceLogBtn,#clearCombatLogBtn'))return clearDiceHistory();
    const diceLink=e.target.closest('[data-dice-expression]');if(diceLink)return rollDiceExpression(diceLink.dataset.diceExpression,diceSourceForElement(diceLink));
    const nav=e.target.closest('[data-view]'); if(nav)return switchView(nav.dataset.view);
    const go=e.target.closest('[data-go]'); if(go)return switchView(go.dataset.go);
    if(e.target.closest('#addCombatantBtn,#emptyAddBtn'))return openAddCombatant();
    const tab=e.target.closest('[data-picker-tab]'); if(tab){rememberVisibleCombatPickerSelections();return renderPicker(tab.dataset.pickerTab);}
    if(e.target.id==='confirmAddBtn')return confirmAdd();
    if(e.target.id==='importMonstersBtn')return $('#monsterFile').click();
    if(e.target.id==='importFiveToolsMonstersBtn')return openFiveToolsImporter('monsters');
    if(e.target.id==='importEncounterBtn')return $('#encounterFile').click();
    if(e.target.id==='importSpellsBtn')return $('#spellFile').click();
    if(e.target.id==='importFiveToolsSpellsBtn')return openFiveToolsImporter('spells');
    if(e.target.id==='clearSpellFilters'){Object.values(spellFilters).forEach(set=>set.clear());renderSpells();return;}
    if(e.target.id==='newSpellBtn'){showDialog('Spell library','Create spell',spellForm(),'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveSpellBtn" class="button primary">Save spell</button>');return;}
    const spellLink=e.target.closest('[data-spell-name]');if(spellLink)return showSpellDetails(state.spells.find(s=>s.name===spellLink.dataset.spellName));
    const spellRow=e.target.closest('[data-spell-id]');if(spellRow)return showSpellDetails(state.spells.find(s=>s.id===spellRow.dataset.spellId));
    if(e.target.id==='newMonsterBtn'){delete $('#appDialog').dataset.editMonsterId;delete $('#appDialog').dataset.cloneMonsterId;showDialog('Bestiary','Create monster',monsterForm(),'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveMonsterBtn" class="button primary">Save monster</button>');return;}
    if(e.target.id==='saveMonsterBtn')return saveMonster();
    if(e.target.id==='loadMoreMonsters'){monsterPage++;return renderMonsters();}
    const editMonster=e.target.closest('[data-edit-monster]');if(editMonster){const m=state.monsters.find(x=>x.id===editMonster.dataset.editMonster);if(!m)return;delete $('#appDialog').dataset.cloneMonsterId;$('#appDialog').dataset.editMonsterId=m.id;showDialog('Bestiary',`Edit ${m.name}`,monsterForm(m),'<button type="button" id="restoreMonsterBtn" class="button danger-ghost">Restore default</button><button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveMonsterBtn" class="button primary">Save changes</button>');return;}
    const copyMonster=e.target.closest('[data-copy-monster]');if(copyMonster){const m=state.monsters.find(x=>x.id===copyMonster.dataset.copyMonster);if(!m)return;delete $('#appDialog').dataset.editMonsterId;$('#appDialog').dataset.cloneMonsterId=m.id;showDialog('Bestiary',`Edit ${m.name} as new`,monsterForm(m),'<button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveMonsterBtn" class="button primary">Save as new</button>');return;}
    const deleteMonster=e.target.closest('[data-delete-monster]');if(deleteMonster){const m=state.monsters.find(x=>x.id===deleteMonster.dataset.deleteMonster);if(!m)return;$('#appDialog').dataset.deleteMonsterId=m.id;showDialog('Bestiary','Are you sure?',`<p>Delete <strong>${esc(m.name)}</strong> from the Bestiary?</p><p class="subtitle">Existing combat and encounter copies will remain unchanged.</p>`,'<button value="cancel" class="button ghost">No</button><button type="button" id="confirmDeleteMonsterBtn" class="button danger-ghost">Yes, delete</button>');return;}
    const addMonster=e.target.closest('[data-add-monster]'); if(addMonster){const m=state.monsters.find(x=>x.id===addMonster.dataset.addMonster),monsterCopy=structuredClone(m);delete monsterCopy.original;state.combat.combatants.push({...monsterCopy,id:uid(),sourceId:m.id,kind:'monster',ac:m.armor_class,maxHp:m.hit_points,hp:m.hit_points,initiative:rollMonsterInitiative(m),dex:m.dexterity||10,conditions:[],added:Date.now()});sortCombatants();save();renderCombat();toast(`${m.name} added to combat`);return;}
    const monsterPreview=e.target.closest('.monster-row');if(monsterPreview)return showMonsterPreview(state.monsters.find(x=>x.id===monsterPreview.dataset.monsterId));
    const combatant=e.target.closest('.combatant'); if(combatant){const action=e.target.closest('[data-action]')?.dataset.action; const id=combatant.dataset.id; if(action==='hp')return changeHp(id,num(e.target.closest('[data-delta]').dataset.delta));if(action==='menu')return rowMenu(id);if(action==='remove')return removeCombatant(id);if(e.target.closest('input,button,select,textarea'))return;state.combat.selectedId=id;save();renderCombat();return;}
    if(e.target.id==='nextTurnBtn'){if(!state.combat.combatants.length)return;state.combat.turn++;if(state.combat.turn>=state.combat.combatants.length){state.combat.turn=0;state.combat.round++;}state.combat.selectedId=state.combat.combatants[state.combat.turn].id;save();renderCombat();return;}
    if(e.target.id==='prevTurnBtn'){if(!state.combat.combatants.length)return;if(state.combat.turn===0){state.combat.turn=state.combat.combatants.length-1;state.combat.round=Math.max(1,state.combat.round-1);}else state.combat.turn--;state.combat.selectedId=state.combat.combatants[state.combat.turn].id;save();renderCombat();return;}
    if(e.target.id==='clearCombatBtn'){if(confirm('End this combat and clear its current HP and conditions?')){state.combat={name:'Untitled battle',round:1,turn:0,combatants:[],selectedId:null};save();renderCombat();}return;}
    if(e.target.id==='saveActiveBtn')return saveActiveEncounter();
    if(e.target.id==='newEncounterBtn')return openEncounterBuilder();
    if(e.target.id==='newPartyBtn')return openPartyEditor();
    const deleteSavedParty=e.target.closest('[data-delete-party]');if(deleteSavedParty)return openDeleteParty(deleteSavedParty.dataset.deleteParty);
    const ep=e.target.closest('[data-edit-party]');if(ep)return openPartyEditor(ep.dataset.editParty);
    const ap=e.target.closest('[data-add-party]');if(ap)return addPartyToCombat(ap.dataset.addParty);
    if(e.target.id==='addMemberRow')return addMemberEditor();
    const rm=e.target.closest('.mini-remove');if(rm)return rm.closest('.member-editor').remove();
    if(e.target.id==='savePartyBtn')return saveParty();
    const exportButton=e.target.closest('[data-export-encounter]');if(exportButton)return exportEncounter(state.encounters.find(x=>x.id===exportButton.dataset.exportEncounter));
    const editSavedEncounter=e.target.closest('[data-edit-encounter]');if(editSavedEncounter)return editEncounter(editSavedEncounter.dataset.editEncounter);
    const se=e.target.closest('[data-start-encounter]');if(se)return startEncounter(se.dataset.startEncounter);
    const de=e.target.closest('[data-delete-encounter]');if(de){const encounter=state.encounters.find(x=>x.id===de.dataset.deleteEncounter);if(!encounter)return;$('#appDialog').dataset.deleteEncounterId=encounter.id;showDialog('Saved encounters','Are you sure?',`<p>Delete <strong>${esc(encounter.name)}</strong>?</p><p class="subtitle">This removes the saved setup. Any combat already started from it remains unchanged.</p>`,'<button value="cancel" class="button ghost">No</button><button type="button" id="confirmDeleteEncounterBtn" class="button danger-ghost">Yes, delete</button>');return;}
    if(e.target.id==='fullscreenBtn'){if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen();return;}
    if(e.target.id==='addConditionBtn'){const x=state.combat.combatants.find(y=>y.id===state.combat.selectedId);showDialog('Status effect',`Add condition to ${combatDisplayName(x)}`,`<div class="picker-list">${CONDITIONS.map(c=>`<button type="button" class="button ghost" data-condition="${c}">${c}</button>`).join('')}</div>`,'<button value="cancel" class="button ghost">Cancel</button>');return;}
    const cond=e.target.closest('[data-condition]');if(cond){const x=state.combat.combatants.find(y=>y.id===state.combat.selectedId);if(!x.conditions.includes(cond.dataset.condition))x.conditions.push(cond.dataset.condition);save();closeDialog();renderCombat();return;}
    const remCond=e.target.closest('[data-remove-condition]');if(remCond){const x=state.combat.combatants.find(y=>y.id===state.combat.selectedId);x.conditions=x.conditions.filter(c=>c!==remCond.dataset.removeCondition);save();renderCombat();return;}
    if(e.target.id==='saveCombatantBtn')return saveCombatantChanges();
    if(e.target.id==='removeCombatantBtn'){const id=$('#appDialog').dataset.combatantId;state.combat.combatants=state.combat.combatants.filter(x=>x.id!==id);state.combat.turn=0;save();closeDialog();renderCombat();return;}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='customDieSides'){e.preventDefault();saveCustomDie();return;}if(e.key==='Enter'&&e.target.matches('#diceCountInput,#diceModifierInput')){e.preventDefault();rollDiceFromControls();return;}if(e.key==='Enter'&&e.target.id==='saveEncounterName'){e.preventDefault();commitActiveEncounter();return;}if(e.key==='Enter'&&e.target.id==='encounterBuilderName'){e.preventDefault();commitPreparedEncounter();return;}if(e.key==='Enter'&&e.target.matches('[data-init-input],[data-pc-hp-input]'))e.target.blur();});
  document.addEventListener('change',e=>{
    if(e.target.matches('#pickerContent input[data-pick-kind],#pickerContent [data-init-for]')){rememberVisibleCombatPickerSelections();return;}
    if(e.target.matches('[data-spell-filter]')){const set=spellFilters[e.target.dataset.spellFilter];if(e.target.checked)set.add(e.target.value);else set.delete(e.target.value);renderSpells(false);return;}
    if(e.target.matches('[data-init-input]')){const id=e.target.dataset.initInput,x=state.combat.combatants.find(y=>y.id===id);if(!x)return;x.initiative=num(e.target.value,x.initiative);const currentId=state.combat.combatants[state.combat.turn]?.id;sortCombatants();state.combat.turn=Math.max(0,state.combat.combatants.findIndex(y=>y.id===currentId));state.combat.selectedId=id;save();renderCombat();}
    if(e.target.matches('[data-pc-hp-input]')){const id=e.target.dataset.pcHpInput,x=state.combat.combatants.find(y=>y.id===id);if(!x)return;x.hp=Math.max(0,Math.min(x.maxHp,num(e.target.value,x.hp)));state.combat.selectedId=id;save();renderCombat();}
    if(e.target.matches('[data-hp-slider]'))renderCombat();
  });
  document.addEventListener('input',e=>{if(e.target.matches('[data-ability-score]')){const key=e.target.dataset.abilityScore,modifier=abilityModifier(e.target.value),output=$('[data-ability-modifier="'+key+'"]');if(output)output.textContent='MOD '+formatModifier(modifier);if(key==='dexterity'&&$('#mInitiativeModifier')){$('#mInitiativeModifier').value=modifier;$('#mInitiativeScore').value=10+modifier;}}if(e.target.id==='mInitiativeModifier'&&$('#mInitiativeScore'))$('#mInitiativeScore').value=10+num(e.target.value,0);if(e.target.matches('#diceCountInput,#diceModifierInput'))updateDiceExpressionPreview();if(e.target.id==='encounterSearch')renderEncounters();if(e.target.id==='monsterSearch'){monsterPage=0;renderMonsters();}if(e.target.id==='pickerSearch')renderMonsterPicker(e.target.value);if(e.target.id==='spellSearch')renderSpells();if(e.target.matches('[data-hp-slider]')){const id=e.target.dataset.hpSlider,x=state.combat.combatants.find(y=>y.id===id);if(!x)return;x.hp=Math.max(0,Math.min(x.maxHp,num(e.target.value,x.hp)));state.combat.selectedId=id;const row=e.target.closest('.combatant'),pct=Math.max(0,Math.min(100,x.hp/x.maxHp*100)),bloodied=x.kind==='monster'&&x.hp>0&&x.hp<=x.maxHp/2;row.classList.toggle('bloodied',bloodied);row.classList.toggle('defeated',x.hp<=0);row.querySelector('[data-hp-value]').textContent=x.hp;save();}});
  $('#monsterCrFilter').addEventListener('change',renderMonsters);
  $('#spellLevelFilter').addEventListener('change',renderSpells);
  $('#monsterFile').addEventListener('change',e=>{if(e.target.files[0])importMonsters(e.target.files[0]);e.target.value='';});
  $('#encounterFile').addEventListener('change',e=>{if(e.target.files[0])importEncounter(e.target.files[0]);e.target.value='';});
  $('#spellFile').addEventListener('change',e=>{if(e.target.files[0])importSpells(e.target.files[0]);e.target.value='';});

  window.EchoesApp={get state(){return state;},defaults,uid,esc,num,save,replaceState,markCustom,applyFiveToolsRecords,toast,showDialog,closeDialog,openCustomDieDialog,rollMonsterInitiative,monsterForm,normaliseMonster,monsterBaseline,parseAbilities,renderMonsters,renderCombat,sortCombatants,switchView,showMonsterPreview};

  state.combat.combatants.forEach(x=>x.conditions=(x.conditions||[]).map(condition=>condition==='Concentrating'?'Concentration':condition));
  state.monsters=state.monsters.map(normaliseMonster);
  state.spells=state.spells.map(normaliseSpell);
  save(); applyUiState(); renderCombat(); renderParties(); renderEncounters(); renderMonsters(); renderSpells(); renderDiceRoller();
})();
