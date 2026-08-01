(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EchoesFiveTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RAW_ROOT = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data';
  const PAGE_URLS = { monsters: 'https://5e.tools/bestiary.html', spells: 'https://5e.tools/spells.html' };
  const FOLDERS = { monsters: 'bestiary', spells: 'spells' };
  const ROOT_KEYS = { monsters: 'monster', spells: 'spell' };
  const SIZE = { T:'Tiny', S:'Small', M:'Medium', L:'Large', H:'Huge', G:'Gargantuan', V:'Varies' };
  const ALIGNMENT = { L:'Lawful', N:'Neutral', C:'Chaotic', G:'Good', E:'Evil', U:'Unaligned', A:'Any Alignment' };
  const SCHOOL = { A:'Abjuration', C:'Conjuration', D:'Divination', E:'Enchantment', V:'Evocation', I:'Illusion', N:'Necromancy', T:'Transmutation', P:'Psionic' };
  const TIME_UNITS = { action:'action', bonus:'bonus action', reaction:'reaction', round:'round', minute:'minute', hour:'hour', day:'day' };

  function cleanTag(tag, body) {
    const parts = body.split('|');
    const first = parts[0] || '';
    if (tag === 'dc') return `DC ${first}`;
    if (tag === 'hit') return `${Number(first) >= 0 ? '+' : ''}${first}`;
    if (tag === 'chance') return `${first}%`;
    if (tag === 'recharge') return `Recharge ${first || '6'}`;
    if (tag === 'atk') {
      const attacks = { mw:'Melee Weapon Attack', rw:'Ranged Weapon Attack', ms:'Melee Spell Attack', rs:'Ranged Spell Attack', m:'Melee Attack', r:'Ranged Attack' };
      return first.split(',').map(value => attacks[value] || value).join(' or ');
    }
    return parts[2] || first;
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/\{@([a-zA-Z]+)\s+([^{}]+)\}/g, (_, tag, body) => cleanTag(tag.toLowerCase(), body))
      .replace(/\{@([a-zA-Z]+)\}/g, '')
      .replace(/\{=([^}]+)\}/g, '$1')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  function renderEntries(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return cleanText(value);
    if (Array.isArray(value)) return value.map(renderEntries).filter(Boolean).join('\n');
    if (typeof value !== 'object') return '';
    if (value.type === 'list') return (value.items || []).map(item => `• ${renderEntries(item)}`).join('\n');
    if (value.type === 'table') {
      const caption = value.caption ? `${cleanText(value.caption)}\n` : '';
      return caption + (value.rows || []).map(row => row.map(renderEntries).join(' | ')).join('\n');
    }
    if (value.type === 'item') return [cleanText(value.name || ''), renderEntries(value.entry || value.entries)].filter(Boolean).join(' ');
    const body = renderEntries(value.entries || value.entry || value.items || value.rows || value.text);
    return [cleanText(value.name || value.title || ''), body].filter(Boolean).join(value.name || value.title ? '. ' : '');
  }

  function namedEntries(values) {
    return (Array.isArray(values) ? values : []).map(item => ({ name: cleanText(item?.name || ''), desc: renderEntries(item?.entries || item?.entry || '') }));
  }

  function joinComplex(values, nestedKey) {
    const out = [];
    const visit = value => {
      if (value == null) return;
      if (typeof value === 'string') return out.push(cleanText(value));
      if (Array.isArray(value)) return value.forEach(visit);
      if (typeof value === 'object') {
        if (value[nestedKey]) visit(value[nestedKey]);
        else if (value.special) out.push(cleanText(value.special));
        if (value.note) out.push(cleanText(value.note));
      }
    };
    visit(values);
    return [...new Set(out.filter(Boolean))].join(', ');
  }

  function formatType(value) {
    if (typeof value === 'string') return { type: cleanText(value), subtype: '' };
    const tags = (value?.tags || []).map(tag => cleanText(typeof tag === 'string' ? tag : tag.tag || tag.prefix || '')).filter(Boolean);
    return { type: cleanText(value?.type || 'creature'), subtype: tags.join(', ') };
  }

  function formatAlignment(value) {
    if (!Array.isArray(value)) return cleanText(value || '');
    return value.map(item => {
      if (typeof item === 'string') return ALIGNMENT[item] || item;
      if (item?.alignment) return formatAlignment(item.alignment) + (item.chance ? ` (${item.chance}%)` : '');
      return cleanText(item?.special || '');
    }).filter(Boolean).join(' ');
  }

  function formatAc(value) {
    const first = Array.isArray(value) ? value[0] : value;
    return Number(typeof first === 'object' ? first.ac : first) || 10;
  }

  function formatSpeed(speed) {
    if (typeof speed === 'number') return `${speed} ft.`;
    if (typeof speed === 'string') return cleanText(speed);
    if (!speed || typeof speed !== 'object') return '';
    return Object.entries(speed).filter(([key]) => key !== 'canHover').map(([key, value]) => {
      const amount = typeof value === 'object' ? value.number : value;
      const condition = typeof value === 'object' && value.condition ? ` ${cleanText(value.condition)}` : '';
      return `${key === 'walk' ? '' : `${key} `}${amount} ft.${condition}`.trim();
    }).join(', ');
  }

  function formatInitiative(value, dexterity) {
    const dexterityModifier = Math.floor(((Number(dexterity) || 10) - 10) / 2);
    if (typeof value === 'number') return value;
    if (value && Number.isFinite(Number(value.bonus))) return Number(value.bonus);
    if (value && Number.isFinite(Number(value.mod))) return Number(value.mod);
    return dexterityModifier;
  }

  function monsterSourceUrl(monster) {
    const hash = `${monster.name || ''}_${monster.source || ''}`.toLowerCase().replace(/\s+/g, '%20');
    return `https://5e.tools/bestiary.html#${hash}`;
  }

  function convertMonster(monster) {
    const type = formatType(monster.type);
    const cr = typeof monster.cr === 'object' ? monster.cr.cr : monster.cr;
    const initiative = formatInitiative(monster.initiative, monster.dex);
    const saves = monster.save || {};
    const result = {
      name: cleanText(monster.name || 'Unnamed creature'),
      size: (Array.isArray(monster.size) ? monster.size : [monster.size]).map(value => SIZE[value] || value).filter(Boolean).join(' or '),
      type: type.type,
      subtype: type.subtype,
      alignment: formatAlignment(monster.alignment),
      armor_class: formatAc(monster.ac),
      hit_points: Number(monster.hp?.average ?? monster.hp) || 1,
      hit_dice: cleanText(monster.hp?.formula || ''),
      challenge_rating: String(cr ?? '—'),
      proficiency_bonus: Number(monster.pb) || undefined,
      initiative_modifier: initiative,
      initiative_score: 10 + initiative,
      strength: Number(monster.str) || 10,
      dexterity: Number(monster.dex) || 10,
      constitution: Number(monster.con) || 10,
      intelligence: Number(monster.int) || 10,
      wisdom: Number(monster.wis) || 10,
      charisma: Number(monster.cha) || 10,
      strength_save: saves.str,
      dexterity_save: saves.dex,
      constitution_save: saves.con,
      intelligence_save: saves.int,
      wisdom_save: saves.wis,
      charisma_save: saves.cha,
      skills: monster.skill || {},
      speed: formatSpeed(monster.speed),
      senses: [...(monster.senses || []), monster.passive != null ? `passive Perception ${monster.passive}` : ''].filter(Boolean).map(cleanText).join(', '),
      languages: joinComplex(monster.languages, 'languages'),
      damage_vulnerabilities: joinComplex(monster.vulnerable, 'vulnerable'),
      damage_resistances: joinComplex(monster.resist, 'resist'),
      damage_immunities: joinComplex(monster.immune, 'immune'),
      condition_immunities: joinComplex(monster.conditionImmune, 'conditionImmune'),
      special_abilities: namedEntries(monster.trait),
      actions: namedEntries(monster.action),
      bonus_actions: namedEntries(monster.bonus),
      reactions: namedEntries(monster.reaction),
      legendary_actions: namedEntries(monster.legendary),
      source: cleanText(monster.source || ''),
      source_url: monsterSourceUrl(monster),
      import_source: '5etools',
      import_source_code: cleanText(monster.source || '')
    };
    return result;
  }

  function plural(value, unit) {
    const amount = Number(value) || 1;
    return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  }

  function formatCastingTime(time) {
    const first = Array.isArray(time) ? time[0] : time;
    if (!first) return '';
    const unit = TIME_UNITS[first.unit] || first.unit || 'action';
    const base = plural(first.number, unit);
    return first.condition ? `${base}, ${renderEntries(first.condition)}` : base;
  }

  function formatDistance(distance) {
    if (!distance) return '';
    const type = distance.type || '';
    if (['self','touch','sight','unlimited','plane','special'].includes(type)) return type[0].toUpperCase() + type.slice(1);
    return `${distance.amount ?? ''} ${type}`.trim();
  }

  function formatRange(range) {
    if (!range) return '';
    if (range.type === 'special') return 'Special';
    const distance = formatDistance(range.distance);
    if (range.type === 'point') return distance;
    return `${distance ? `${distance} ` : ''}${range.type || ''}`.trim();
  }

  function formatDuration(duration) {
    return (Array.isArray(duration) ? duration : [duration]).filter(Boolean).map(item => {
      if (item.type === 'instant') return 'Instantaneous';
      if (item.type === 'permanent') return `Until ${Array.isArray(item.ends) ? item.ends.join(' or ') : 'dispelled'}`;
      if (item.type === 'special') return 'Special';
      if (item.type === 'timed') return `${item.concentration ? 'Concentration, up to ' : ''}${plural(item.duration?.amount, item.duration?.type || 'round')}`;
      return cleanText(item.type || '');
    }).join('; ');
  }

  function formatComponents(components) {
    if (!components) return '';
    return ['v','s','m'].filter(key => components[key]).map(key => key.toUpperCase()).join(', ');
  }

  function spellClasses(spell) {
    const classes = spell.classes || {};
    return [...(classes.fromClassList || []), ...(classes.fromClassListVariant || [])].map(item => cleanText(item.name || '')).filter(Boolean);
  }

  function spellSourceUrl(spell) {
    const hash = `${spell.name || ''}_${spell.source || ''}`.toLowerCase().replace(/\s+/g, '%20');
    return `https://5e.tools/spells.html#${hash}`;
  }

  function convertSpell(spell) {
    const components = spell.components || {};
    const duration = formatDuration(spell.duration);
    const higher = spell.entriesHigherLevel || spell.higherLevel;
    return {
      name: cleanText(spell.name || 'Unnamed spell'),
      level: Number(spell.level) === 0 ? 'Cantrip' : String(spell.level ?? 'Cantrip'),
      school: SCHOOL[spell.school] || cleanText(spell.school || ''),
      casting_time: formatCastingTime(spell.time),
      range: formatRange(spell.range),
      components: formatComponents(components),
      material: typeof components.m === 'object' ? cleanText(components.m.text || '') : components.m ? cleanText(components.m) : '',
      ritual: spell.meta?.ritual ? 'yes' : 'no',
      duration,
      concentration: duration.toLowerCase().startsWith('concentration') ? 'yes' : 'no',
      class: [...new Set(spellClasses(spell))].join(', '),
      desc: renderEntries(spell.entries),
      higher_level: renderEntries(higher),
      source: cleanText(spell.source || ''),
      source_url: spellSourceUrl(spell),
      import_source: '5etools',
      import_source_code: cleanText(spell.source || '')
    };
  }

  function extract(kind, payload) {
    const key = ROOT_KEYS[kind];
    if (!key) throw new Error('Choose either monsters or spells.');
    const records = Array.isArray(payload) ? payload : payload?.[key];
    if (!Array.isArray(records)) throw new Error(`This file does not contain a 5etools ${key} collection.`);
    return records;
  }

  function sourceIndexUrl(kind) {
    if (!FOLDERS[kind]) throw new Error('Unknown 5etools collection.');
    return `${RAW_ROOT}/${FOLDERS[kind]}/index.json`;
  }

  function sourceFileUrl(kind, filename) {
    if (!FOLDERS[kind] || !/^[a-z0-9._-]+\.json$/i.test(String(filename || ''))) throw new Error('Invalid 5etools source filename.');
    return `${RAW_ROOT}/${FOLDERS[kind]}/${filename}`;
  }

  function resolveInput(kind, rawUrl) {
    const folder = FOLDERS[kind];
    if (!folder) throw new Error('Unknown 5etools collection.');
    let url;
    try { url = new URL(String(rawUrl || PAGE_URLS[kind])); }
    catch { throw new Error('Enter a valid 5etools link.'); }
    if (url.hostname === '5e.tools' || url.hostname === 'www.5e.tools') {
      const path = url.pathname.toLowerCase();
      if (path === `/${folder === 'bestiary' ? 'bestiary.html' : 'spells.html'}` || path === '/') return { mode:'index', url:sourceIndexUrl(kind) };
      const match = url.pathname.match(new RegExp(`/data/${folder}/([^/]+\\.json)$`, 'i'));
      if (match) return { mode:'file', url:sourceFileUrl(kind, match[1]), filename:match[1] };
    }
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/5etools-src/') && url.pathname.includes(`/data/${folder}/`)) return { mode:'file', url:url.href, filename:url.pathname.split('/').pop() };
    if (url.hostname === 'github.com' && url.pathname.includes('/5etools-src/blob/') && url.pathname.includes(`/data/${folder}/`)) return { mode:'file', url:`https://raw.githubusercontent.com${url.pathname.replace('/blob/', '/')}`, filename:url.pathname.split('/').pop() };
    throw new Error(`Use a 5e.tools ${kind === 'monsters' ? 'Bestiary' : 'Spells'} page or data-file link.`);
  }

  function reconcileImported(existing, imported, requestedSources = []) {
    const current=Array.isArray(existing)?existing:[],incoming=Array.isArray(imported)?imported:[];
    const nameKey=record=>String(record.name||'').trim().replace(/\s+/g,' ').toLowerCase();
    const key=record=>`${nameKey(record)}|${String(record.source||record.import_source_code||'').trim().toLowerCase()}`;
    const previousByKey=new Map(current.filter(record=>record.import_source==='5etools').map(record=>[key(record),record]));
    const previousByName=new Map(current.filter(record=>record.import_source==='5etools').map(record=>[nameKey(record),record]));
    const sources=new Set([...requestedSources,...incoming.map(record=>record.import_source_code||record.source)].filter(Boolean).map(value=>String(value).toLowerCase()));
    const candidates=current.filter(record=>record.import_source!=='5etools'||!sources.has(String(record.import_source_code||record.source||'').toLowerCase()));
    const incomingByName=new Map();incoming.forEach(record=>incomingByName.set(nameKey(record),record));
    let refreshed=0,added=0;
    const prepared=[...incomingByName.values()].map(record=>{const copy={...record},previous=previousByKey.get(key(copy))||previousByName.get(nameKey(copy));if(previous){copy.id=previous.id;refreshed++;}else added++;return copy;});
    const incomingNames=new Set(prepared.map(nameKey)),seenImportedNames=new Set();let duplicatesRemoved=incoming.length-prepared.length;
    const retained=candidates.filter(record=>{if(record.import_source!=='5etools')return true;const name=nameKey(record);if(incomingNames.has(name)||seenImportedNames.has(name)){duplicatesRemoved++;return false;}seenImportedNames.add(name);return true;});
    return {records:[...retained,...prepared],retained,imported:prepared,refreshed,added,duplicatesRemoved};
  }

  return { RAW_ROOT, PAGE_URLS, cleanText, renderEntries, convertMonster, convertSpell, extract, sourceIndexUrl, sourceFileUrl, resolveInput, reconcileImported };
});
