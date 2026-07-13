(() => {
  'use strict';

  const app=window.EchoesApp;
  if(!app)return;
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const {esc,uid,num}=app;
  const RELATIONSHIP_TYPES=['Ally','Enemy','Family','Friend','Rival','Employer','Subordinate','Patron','Contact'];
  const COMMON_PRONOUNS=['He/Him','She/Her','They/Them'];
  const ALIGNMENTS=['Chaotic Good','Neutral Good','Lawful Good','Chaotic Neutral','Neutral','Lawful Neutral','Chaotic Evil','Neutral Evil','Lawful Evil'];
  const filterState={race:'',classProfession:'',location:'',faction:'',tag:'',statblock:''};
  let currentNpcId=null;
  let npcDraftPortrait='';
  let pendingNpcDraft=null;
  let pendingNpcEditId='';

  const state=()=>app.state;
  const text=value=>String(value??'').trim();
  const list=value=>Array.isArray(value)?value.map(text).filter(Boolean):text(value).split(',').map(text).filter(Boolean);
  function uniqueCaseInsensitive(values){const seen=new Map();for(const value of values.map(text).filter(Boolean)){const key=value.toLocaleLowerCase();if(!seen.has(key))seen.set(key,value);}return [...seen.values()];}

  function normaliseRelationship(relationship={}){
    return {id:relationship.id||uid(),npcId:text(relationship.npcId||relationship.relatedNpcId),name:text(relationship.name||relationship.relatedName),type:text(relationship.type),note:text(relationship.note)};
  }

  function normaliseNpc(npc={}){
    return {
      ...npc,
      id:npc.id||uid(),name:text(npc.name)||'Unnamed NPC',portrait:text(npc.portrait),race:text(npc.race),classProfession:text(npc.classProfession||npc.className||npc.profession),title:text(npc.title),pronouns:text(npc.pronouns),alignment:text(npc.alignment),faction:text(npc.faction||npc.organisation),primaryLocation:text(npc.primaryLocation||npc.location),additionalLocations:uniqueCaseInsensitive(list(npc.additionalLocations)),tags:uniqueCaseInsensitive(list(npc.tags)),summary:text(npc.summary),appearance:text(npc.appearance),personality:text(npc.personality),mannerisms:text(npc.mannerisms),motivations:text(npc.motivations||npc.goals),background:text(npc.background),relationships:Array.isArray(npc.relationships)?npc.relationships.map(normaliseRelationship):[],secrets:text(npc.secrets),dmNotes:text(npc.dmNotes||npc.notes),voiceNote:text(npc.voiceNote||npc.voiceActingNote),voiceQuote:text(npc.voiceQuote||npc.voiceActingQuote),statblockId:text(npc.statblockId),created:num(npc.created,Date.now()),updated:num(npc.updated,Date.now())
    };
  }

  function valuesFor(field){
    const npcs=state().npcs;
    let values=[];
    if(field==='race')values=npcs.map(n=>n.race);
    if(field==='classProfession')values=npcs.map(n=>n.classProfession);
    if(field==='faction')values=npcs.map(n=>n.faction);
    if(field==='location')values=npcs.flatMap(n=>[n.primaryLocation,...n.additionalLocations]);
    if(field==='tag')values=npcs.flatMap(n=>n.tags);
    if(field==='relationshipType')values=[...RELATIONSHIP_TYPES,...npcs.flatMap(n=>n.relationships.map(r=>r.type))];
    return uniqueCaseInsensitive(values).sort((a,b)=>a.localeCompare(b));
  }

  function canonicalValue(field,value){const clean=text(value);if(!clean)return '';return valuesFor(field).find(existing=>existing.toLocaleLowerCase()===clean.toLocaleLowerCase())||clean;}
  function canonicalList(field,values){return uniqueCaseInsensitive(values.map(value=>canonicalValue(field,value)));}
  function canonicaliseCollection(){const maps={race:new Map(),classProfession:new Map(),faction:new Map(),location:new Map(),tag:new Map(),relationshipType:new Map()},use=(field,value)=>{const clean=text(value);if(!clean)return '';const key=clean.toLocaleLowerCase();if(!maps[field].has(key))maps[field].set(key,clean);return maps[field].get(key);};for(const npc of state().npcs){npc.race=use('race',npc.race);npc.classProfession=use('classProfession',npc.classProfession);npc.faction=use('faction',npc.faction);npc.primaryLocation=use('location',npc.primaryLocation);npc.additionalLocations=uniqueCaseInsensitive(npc.additionalLocations.map(value=>use('location',value)));npc.tags=uniqueCaseInsensitive(npc.tags.map(value=>use('tag',value)));npc.relationships=npc.relationships.map(rel=>({...rel,type:use('relationshipType',rel.type)}));}}
  function linkedMonster(npc){return state().monsters.find(monster=>monster.id===npc.statblockId)||null;}
  function initials(name){return text(name).split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';}
  function portraitMarkup(npc,className='npc-portrait'){return npc.portrait?`<img class="${className}" src="${esc(npc.portrait)}" alt="Portrait of ${esc(npc.name)}">`:`<div class="${className} npc-portrait-placeholder" aria-hidden="true">${esc(initials(npc.name))}</div>`;}

  function optionList(values,current,label){return `<option value="">${esc(label)}</option>`+values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join('');}

  function renderFilters(){
    const active=Object.values(filterState).filter(Boolean).length;
    $('#npcFilters').innerHTML=`<span class="filter-label">FILTER BY</span><select data-npc-filter="race" aria-label="Filter NPC race">${optionList(valuesFor('race'),filterState.race,'All races')}</select><select data-npc-filter="classProfession" aria-label="Filter NPC class or profession">${optionList(valuesFor('classProfession'),filterState.classProfession,'All classes / professions')}</select><select data-npc-filter="location" aria-label="Filter NPC location">${optionList(valuesFor('location'),filterState.location,'All locations')}</select><select data-npc-filter="faction" aria-label="Filter NPC faction">${optionList(valuesFor('faction'),filterState.faction,'All factions')}</select><select data-npc-filter="tag" aria-label="Filter NPC tag">${optionList(valuesFor('tag'),filterState.tag,'All tags')}</select><select data-npc-filter="statblock" aria-label="Filter linked statblock"><option value="" ${!filterState.statblock?'selected':''}>Any statblock status</option><option value="with" ${filterState.statblock==='with'?'selected':''}>Has linked statblock</option><option value="without" ${filterState.statblock==='without'?'selected':''}>No linked statblock</option></select>${active?`<button id="clearNpcFilters" class="button ghost">Clear ${active}</button>`:''}`;
  }

  function npcSearchText(npc){return [npc.name,npc.race,npc.classProfession,npc.title,npc.primaryLocation,...npc.additionalLocations,npc.faction,...npc.tags,npc.summary,npc.voiceNote,npc.voiceQuote].join(' ').toLocaleLowerCase();}

  function filteredNpcs(){
    const query=text($('#npcSearch')?.value).toLocaleLowerCase(),sort=$('#npcSort')?.value||'name';
    const matches=state().npcs.filter(npc=>{
      const locations=[npc.primaryLocation,...npc.additionalLocations];
      const hasStatblock=Boolean(linkedMonster(npc));
      const equal=(left,right)=>text(left).toLocaleLowerCase()===text(right).toLocaleLowerCase();return (!query||npcSearchText(npc).includes(query))&&(!filterState.race||equal(npc.race,filterState.race))&&(!filterState.classProfession||equal(npc.classProfession,filterState.classProfession))&&(!filterState.location||locations.some(value=>equal(value,filterState.location)))&&(!filterState.faction||equal(npc.faction,filterState.faction))&&(!filterState.tag||npc.tags.some(value=>equal(value,filterState.tag)))&&(!filterState.statblock||(filterState.statblock==='with'?hasStatblock:!hasStatblock));
    });
    const compareText=(field)=>(a,b)=>text(a[field]).localeCompare(text(b[field]))||a.name.localeCompare(b.name);
    if(sort==='recent')matches.sort((a,b)=>b.updated-a.updated);
    else if(sort==='race')matches.sort(compareText('race'));
    else if(sort==='location')matches.sort(compareText('primaryLocation'));
    else if(sort==='faction')matches.sort(compareText('faction'));
    else matches.sort((a,b)=>a.name.localeCompare(b.name));
    return matches;
  }

  function renderCollection(){
    currentNpcId=null;
    $('#npcCollectionControls').hidden=false;
    renderFilters();
    const npcs=filteredNpcs();
    $('#npcCount').textContent=state().npcs.length;
    $('#npcCollectionContent').innerHTML=npcs.length?`<div class="npc-card-list">${npcs.map(npc=>{
      const monster=linkedMonster(npc),role=npc.classProfession||npc.title||'Role not recorded',voice=npc.voiceNote||'No voice acting note yet.';
      return `<article class="npc-card" data-npc-open="${npc.id}">${portraitMarkup(npc,'npc-card-portrait')}<div class="npc-card-identity"><p class="eyebrow">${esc(npc.race||'NPC')}</p><h2>${esc(npc.name)}</h2><p>${esc([role,npc.title&&npc.classProfession?npc.title:''].filter(Boolean).join(' · '))}</p></div><div class="npc-card-place"><strong>${esc(npc.primaryLocation||'Location unknown')}</strong><span>${esc(npc.faction||'No faction')}</span></div><div class="npc-card-tags">${npc.tags.slice(0,5).map(tag=>`<span>${esc(tag)}</span>`).join('')}${npc.tags.length>5?`<span>+${npc.tags.length-5}</span>`:''}</div><div class="npc-card-voice"><span>VOICE</span><p>${esc(voice)}</p></div><div class="npc-card-status"><span class="npc-statblock-badge ${monster?'linked':''}">${monster?`Linked · ${esc(monster.name)}`:'No statblock'}</span></div><div class="npc-card-actions"><button class="button ghost" data-npc-edit="${npc.id}">Edit</button><button class="npc-delete-button" data-npc-delete="${npc.id}" aria-label="Delete ${esc(npc.name)}" title="Delete ${esc(npc.name)}">×</button></div></article>`;
    }).join('')}</div>`:state().npcs.length?'<div class="empty-collection"><h2>No matching NPCs</h2><p>Try a different search or clear one of the filters.</p></div>':'<div class="empty-collection"><h2>No NPCs yet</h2><p>Create a named campaign character. A statblock is optional.</p><button class="button primary" data-create-npc>＋ Create NPC</button></div>';
  }

  function profileSection(title,value,className=''){return text(value)?`<section class="npc-profile-section ${className}"><h3>${esc(title)}</h3><div>${esc(value).replace(/\n/g,'<br>')}</div></section>`:'';}
  function relationshipName(relationship){const linked=state().npcs.find(npc=>npc.id===relationship.npcId);return linked?.name||relationship.name||'Unnamed relationship';}

  function renderProfile(id=currentNpcId){
    const npc=state().npcs.find(item=>item.id===id);if(!npc)return renderCollection();
    currentNpcId=npc.id;$('#npcCollectionControls').hidden=true;$('#npcCount').textContent=state().npcs.length;
    const monster=linkedMonster(npc),relationships=npc.relationships||[];
    const statblock=monster?`<div class="npc-linked-statblock"><div><p class="eyebrow">LINKED BESTIARY STATBLOCK</p><h2>${esc(monster.name)}</h2><p>CR ${esc(monster.challenge_rating)} · AC ${monster.armor_class} · HP ${monster.hit_points}</p></div><div class="npc-statblock-actions"><button class="button ghost" data-npc-open-statblock="${npc.id}">Open</button><button class="button ghost" data-npc-edit-statblock="${npc.id}">Edit</button><button class="button ghost" data-npc-edit="${npc.id}">Replace</button><button class="button danger-ghost" data-npc-unlink-statblock="${npc.id}">Unlink</button><button class="button primary" data-npc-add-combat="${npc.id}">＋ Combat</button></div></div>`:npc.statblockId?`<div class="npc-linked-statblock missing"><div><p class="eyebrow">MISSING STATBLOCK</p><h2>Bestiary entry unavailable</h2><p>The NPC link remains recorded, but its Bestiary entry could not be found.</p></div><div class="npc-statblock-actions"><button class="button ghost" data-npc-edit="${npc.id}">Replace</button><button class="button danger-ghost" data-npc-unlink-statblock="${npc.id}">Unlink</button></div></div>`:`<div class="npc-linked-statblock empty"><div><p class="eyebrow">STATBLOCK</p><h2>No statblock linked</h2><p>This NPC can remain roleplay-only or be linked to the Bestiary later.</p></div><button class="button ghost" data-npc-edit="${npc.id}">Link or create statblock</button></div>`;
    $('#npcCollectionContent').innerHTML=`<div class="npc-profile"><div class="npc-profile-toolbar"><button class="button ghost" data-npc-back>← Back to NPCs</button><div><button class="button ghost" data-npc-edit="${npc.id}">Edit NPC</button><button class="button danger-ghost" data-npc-delete="${npc.id}">Delete NPC</button></div></div><header class="npc-profile-hero">${portraitMarkup(npc,'npc-profile-portrait')}<div><p class="eyebrow">${esc(npc.race||'NPC')}</p><h1>${esc(npc.name)}</h1><p class="npc-profile-meta">${esc([npc.pronouns,npc.classProfession,npc.title,npc.alignment].filter(Boolean).join(' · '))}</p><p class="npc-profile-meta">${esc([npc.faction,npc.primaryLocation].filter(Boolean).join(' · '))}</p>${npc.additionalLocations.length?`<p class="npc-profile-other-locations">Also: ${esc(npc.additionalLocations.join(' · '))}</p>`:''}<div class="npc-profile-tags">${npc.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div></div></header><div class="npc-voice-grid"><section><p class="eyebrow">VOICE ACTING NOTE</p><div>${esc(npc.voiceNote||'No performance note recorded.').replace(/\n/g,'<br>')}</div></section><section><p class="eyebrow">VOICE ACTING QUOTE</p><blockquote>${esc(npc.voiceQuote||'No representative quote recorded.').replace(/\n/g,'<br>')}</blockquote></section></div>${profileSection('Short summary',npc.summary,'wide')}${statblock}<div class="npc-profile-grid">${profileSection('Personality',npc.personality)}${profileSection('Mannerisms',npc.mannerisms)}${profileSection('Appearance',npc.appearance)}${profileSection('Motivations & goals',npc.motivations)}${relationships.length?`<section class="npc-profile-section wide"><h3>Relationships</h3><div class="npc-profile-relationships">${relationships.map(relationship=>`<article><div><strong>${relationship.npcId?`<button data-related-npc="${esc(relationship.npcId)}">${esc(relationshipName(relationship))}</button>`:esc(relationshipName(relationship))}</strong><span>${esc(relationship.type||'Relationship')}</span></div><p>${esc(relationship.note||'')}</p></article>`).join('')}</div></section>`:''}${profileSection('Background',npc.background,'wide')}${profileSection('Secrets',npc.secrets,'wide npc-private-section')}${profileSection('DM notes',npc.dmNotes,'wide npc-private-section')}</div></div>`;
  }

  function render(){const active=$('#npcsView')?.classList.contains('active');if(!active)return;if(currentNpcId&&state().npcs.some(npc=>npc.id===currentNpcId))renderProfile(currentNpcId);else renderCollection();}

  function datalist(id,values){return `<datalist id="${id}">${values.map(value=>`<option value="${esc(value)}"></option>`).join('')}</datalist>`;}
  function chip(value,field){return `<button type="button" class="npc-value-chip" data-remove-npc-value="${field}" data-value="${esc(value)}">${esc(value)} <span>×</span></button>`;}
  function multiEditor(field,label,values,listId){return `<label class="field full"><span>${label}</span><div class="npc-multi-editor" data-npc-multi="${field}"><div class="npc-multi-chips">${values.map(value=>chip(value,field)).join('')}</div><div class="npc-multi-input"><input data-npc-multi-input="${field}" list="${listId}" placeholder="Type a value and press Enter"><button type="button" class="button ghost" data-add-npc-value="${field}">Add</button></div></div></label>`;}
  function relationshipOptions(selected,currentId){return `<option value="">Manual / unlinked name</option>`+state().npcs.filter(npc=>npc.id!==currentId).sort((a,b)=>a.name.localeCompare(b.name)).map(npc=>`<option value="${npc.id}" ${npc.id===selected?'selected':''}>${esc(npc.name)}</option>`).join('');}
  function relationshipRow(relationship={},currentId=''){const rel=normaliseRelationship(relationship);return `<div class="npc-relationship-row" data-npc-relationship><select data-relationship-npc aria-label="Related NPC">${relationshipOptions(rel.npcId,currentId)}</select><input data-relationship-name value="${esc(rel.name)}" placeholder="Related name"><input data-relationship-type list="npcRelationshipTypes" value="${esc(rel.type)}" placeholder="Relationship type"><input data-relationship-note value="${esc(rel.note)}" placeholder="Short note"><button type="button" data-remove-relationship aria-label="Remove relationship">×</button></div>`;}

  function npcForm(npc){
    const monsters=state().monsters.slice().sort((a,b)=>a.name.localeCompare(b.name));
    const raceValues=valuesFor('race'),classValues=valuesFor('classProfession'),factionValues=valuesFor('faction'),locationValues=valuesFor('location'),tagValues=valuesFor('tag'),relationshipTypes=valuesFor('relationshipType');
    return `<div class="npc-form"><section class="npc-form-section npc-form-intro"><div class="npc-portrait-editor"><div id="npcPortraitPreview">${portraitMarkup(npc,'npc-form-portrait')}</div><input id="npcPortraitFile" type="file" accept="image/*" hidden><div><button type="button" class="button ghost" id="chooseNpcPortraitBtn">Choose portrait</button><button type="button" class="button danger-ghost" id="removeNpcPortraitBtn" ${npc.portrait?'':'hidden'}>Remove</button></div></div><div class="npc-intro-fields"><label class="field full"><span>NAME · REQUIRED</span><input id="npcName" value="${esc(npc.name||'')}" autofocus></label><label class="field"><span>RACE</span><input id="npcRace" list="npcRaceValues" value="${esc(npc.race)}"></label><label class="field"><span>CLASS OR PROFESSION</span><input id="npcClassProfession" list="npcClassValues" value="${esc(npc.classProfession)}"></label><label class="field"><span>PRONOUNS</span><input id="npcPronouns" list="npcPronounValues" value="${esc(npc.pronouns)}" placeholder="Select or enter custom"></label><label class="field"><span>ALIGNMENT</span><input id="npcAlignment" list="npcAlignmentValues" value="${esc(npc.alignment)}" placeholder="Select an alignment"></label></div></section><section class="npc-form-section npc-voice-form"><div><p class="eyebrow">ROLEPLAY FIRST</p><h3>Voice & performance</h3></div><label class="field"><span>VOICE ACTING NOTE</span><textarea id="npcVoiceNote" rows="4" placeholder="Accent, tone, pace, mannerisms or acting reference…">${esc(npc.voiceNote)}</textarea></label><label class="field"><span>VOICE ACTING QUOTE</span><textarea id="npcVoiceQuote" rows="4" placeholder="A representative line in the NPC's voice…">${esc(npc.voiceQuote)}</textarea></label></section><section class="npc-form-section"><h3>Identity & organisation</h3><div class="form-grid"><label class="field"><span>TITLE OR RANK</span><input id="npcTitle" value="${esc(npc.title)}"></label><label class="field"><span>FACTION OR ORGANISATION</span><input id="npcFaction" list="npcFactionValues" value="${esc(npc.faction)}"></label><label class="field full"><span>PRIMARY LOCATION</span><input id="npcPrimaryLocation" list="npcLocationValues" value="${esc(npc.primaryLocation)}"></label>${multiEditor('additionalLocations','ADDITIONAL LOCATIONS',npc.additionalLocations,'npcLocationValues')}${multiEditor('tags','TAGS',npc.tags,'npcTagValues')}</div></section><section class="npc-form-section"><h3>Statblock</h3><div class="npc-statblock-picker"><select id="npcStatblockSelect"><option value="">No linked statblock</option>${monsters.map(monster=>`<option value="${monster.id}" ${monster.id===npc.statblockId?'selected':''}>${esc(monster.name)} · CR ${esc(monster.challenge_rating)}</option>`).join('')}</select><button type="button" id="createNpcStatblockBtn" class="button ghost">＋ Create new statblock</button></div><p class="subtitle">Creating a statblock adds it to the Bestiary and links it to this NPC. Deleting the NPC never deletes the statblock.</p></section><section class="npc-form-section"><h3>Roleplaying information</h3><div class="form-grid"><label class="field full"><span>SHORT SUMMARY</span><textarea id="npcSummary" rows="3">${esc(npc.summary)}</textarea></label><label class="field full"><span>APPEARANCE</span><textarea id="npcAppearance" rows="4">${esc(npc.appearance)}</textarea></label><label class="field full"><span>PERSONALITY</span><textarea id="npcPersonality" rows="4">${esc(npc.personality)}</textarea></label><label class="field full"><span>MANNERISMS</span><textarea id="npcMannerisms" rows="4">${esc(npc.mannerisms)}</textarea></label><label class="field full"><span>MOTIVATIONS & GOALS</span><textarea id="npcMotivations" rows="4">${esc(npc.motivations)}</textarea></label><label class="field full"><span>BACKGROUND</span><textarea id="npcBackground" rows="5">${esc(npc.background)}</textarea></label><label class="field full"><span>SECRETS</span><textarea id="npcSecrets" rows="4">${esc(npc.secrets)}</textarea></label><label class="field full"><span>DM NOTES</span><textarea id="npcDmNotes" rows="5">${esc(npc.dmNotes)}</textarea></label></div></section><section class="npc-form-section"><div class="npc-form-section-head"><h3>Relationships</h3><button type="button" id="addNpcRelationshipBtn" class="button ghost">＋ Add relationship</button></div><div id="npcRelationshipRows" class="npc-relationship-rows">${npc.relationships.map(relationship=>relationshipRow(relationship,npc.id)).join('')}</div></section>${datalist('npcRaceValues',raceValues)}${datalist('npcClassValues',classValues)}${datalist('npcFactionValues',factionValues)}${datalist('npcLocationValues',locationValues)}${datalist('npcTagValues',tagValues)}${datalist('npcRelationshipTypes',relationshipTypes)}${datalist('npcPronounValues',COMMON_PRONOUNS)}${datalist('npcAlignmentValues',ALIGNMENTS)}</div>`;
  }

  function openNpcEditor(id='',draft=null){
    const original=state().npcs.find(npc=>npc.id===id),npc=normaliseNpc(draft||original||{id:id||uid(),name:'',created:Date.now(),updated:Date.now()});
    if(!draft&&!original)npc.name='';npcDraftPortrait=npc.portrait||'';pendingNpcDraft=null;pendingNpcEditId='';
    app.showDialog('NPC Collection',original?'Edit NPC':'Create NPC',npcForm(npc),`<button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveNpcBtn" class="button primary">Save NPC</button>`);
    $('#appDialog').classList.add('npc-dialog');$('#appDialog').dataset.npcEditId=original?.id||id||'';
  }

  function multiValues(field){const editor=$(`[data-npc-multi="${field}"]`);if(!editor)return[];const values=$$('[data-value]',editor).map(chip=>chip.dataset.value),pending=text($(`[data-npc-multi-input="${field}"]`,editor)?.value);if(pending)values.push(pending);return canonicalList(field==='tags'?'tag':'location',values);}
  function readRelationships(){return $$('[data-npc-relationship]').map(row=>normaliseRelationship({npcId:$('[data-relationship-npc]',row).value,name:$('[data-relationship-name]',row).value,type:canonicalValue('relationshipType',$('[data-relationship-type]',row).value),note:$('[data-relationship-note]',row).value})).filter(rel=>rel.npcId||rel.name||rel.type||rel.note);}

  function captureNpcForm(){
    const editId=$('#appDialog').dataset.npcEditId,original=state().npcs.find(npc=>npc.id===editId);
    return normaliseNpc({...original,id:editId||original?.id||uid(),name:$('#npcName').value,portrait:npcDraftPortrait,race:canonicalValue('race',$('#npcRace').value),classProfession:canonicalValue('classProfession',$('#npcClassProfession').value),title:$('#npcTitle').value,pronouns:$('#npcPronouns').value,alignment:$('#npcAlignment').value,faction:canonicalValue('faction',$('#npcFaction').value),primaryLocation:canonicalValue('location',$('#npcPrimaryLocation').value),additionalLocations:multiValues('additionalLocations'),tags:multiValues('tags'),summary:$('#npcSummary').value,appearance:$('#npcAppearance').value,personality:$('#npcPersonality').value,mannerisms:$('#npcMannerisms').value,motivations:$('#npcMotivations').value,background:$('#npcBackground').value,relationships:readRelationships(),secrets:$('#npcSecrets').value,dmNotes:$('#npcDmNotes').value,voiceNote:$('#npcVoiceNote').value,voiceQuote:$('#npcVoiceQuote').value,statblockId:$('#npcStatblockSelect').value,created:original?.created||Date.now(),updated:Date.now()});
  }

  function saveNpc(){const npc=captureNpcForm();if(!text(npc.name)){app.toast('Give the NPC a name');$('#npcName').focus();return;}const index=state().npcs.findIndex(item=>item.id===npc.id);if(index>=0)state().npcs[index]=npc;else state().npcs.push(npc);canonicaliseCollection();state().npcs.sort((a,b)=>a.name.localeCompare(b.name));app.save();app.closeDialog();currentNpcId=npc.id;renderProfile(npc.id);app.toast(`${npc.name} saved`);}

  function addMultiValue(field){const editor=$(`[data-npc-multi="${field}"]`),input=$(`[data-npc-multi-input="${field}"]`,editor);if(!editor||!input)return;const value=canonicalValue(field==='tags'?'tag':'location',input.value);if(!value)return;const existing=$$('[data-value]',editor).some(item=>item.dataset.value.toLocaleLowerCase()===value.toLocaleLowerCase());if(!existing)$('.npc-multi-chips',editor).insertAdjacentHTML('beforeend',chip(value,field));input.value='';input.focus();}

  function openDeleteNpc(id){const npc=state().npcs.find(item=>item.id===id);if(!npc)return;$('#appDialog').dataset.deleteNpcId=id;app.showDialog('NPC Collection','Delete NPC?',`<p>Delete <strong>${esc(npc.name)}</strong> from the NPC Collection?</p><p class="subtitle">Its linked Bestiary statblock will not be deleted.</p>`,'<button value="cancel" class="button ghost">No</button><button type="button" id="confirmDeleteNpcBtn" class="button danger-ghost">Yes, delete</button>');}
  function deleteNpc(){const id=$('#appDialog').dataset.deleteNpcId,npc=state().npcs.find(item=>item.id===id);if(!npc)return;state().npcs=state().npcs.filter(item=>item.id!==id).map(item=>({...item,relationships:item.relationships.map(rel=>rel.npcId===id?{...rel,npcId:'',name:rel.name||npc.name}:rel)}));delete $('#appDialog').dataset.deleteNpcId;currentNpcId=null;app.save();app.closeDialog();renderCollection();app.toast(`${npc.name} deleted; Bestiary unchanged`);}

  function updatePortraitPreview(){const preview=$('#npcPortraitPreview');if(preview)preview.innerHTML=npcDraftPortrait?`<img class="npc-form-portrait" src="${esc(npcDraftPortrait)}" alt="NPC portrait preview">`:`<div class="npc-form-portrait npc-portrait-placeholder">${esc(initials($('#npcName')?.value||'NPC'))}</div>`;if($('#removeNpcPortraitBtn'))$('#removeNpcPortraitBtn').hidden=!npcDraftPortrait;}
  function loadPortrait(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{const max=320,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);npcDraftPortrait=canvas.toDataURL('image/webp',.72);updatePortraitPreview();};image.src=reader.result;};reader.readAsDataURL(file);}

  function openNpcStatblockCreator(){pendingNpcDraft=captureNpcForm();pendingNpcEditId=$('#appDialog').dataset.npcEditId;$('#appDialog').classList.remove('npc-dialog');delete $('#appDialog').dataset.editMonsterId;delete $('#appDialog').dataset.cloneMonsterId;app.showDialog('Bestiary',`Create statblock for ${pendingNpcDraft.name||'NPC'}`,app.monsterForm({name:pendingNpcDraft.name||''}),'<button type="button" id="backToNpcBtn" class="button ghost">Back to NPC</button><button type="button" id="saveNpcStatblockBtn" class="button primary">Save statblock & link</button>');}
  function monsterFromOpenForm(){const name=text($('#mName').value);if(!name){app.toast('Give the statblock a name');return null;}const draft={id:uid(),name,size:$('#mSize').value,type:$('#mType').value,alignment:$('#mAlignment').value,challenge_rating:$('#mCr').value,armor_class:$('#mAc').value,hit_points:$('#mHp').value,dexterity:$('#mDex').value,initiative_modifier:$('#mInitiativeModifier').value,speed:$('#mSpeed').value,senses:$('#mSenses').value,actions:app.parseAbilities($('#mActions').value),special_abilities:app.parseAbilities($('#mAbilities').value),legendary_actions:app.parseAbilities($('#mLegendary').value)};draft.original=app.monsterBaseline(draft);return app.normaliseMonster(draft);}
  function saveNpcStatblock(){const monster=monsterFromOpenForm();if(!monster)return;state().monsters.push(monster);state().monsters.sort((a,b)=>a.name.localeCompare(b.name));pendingNpcDraft.statblockId=monster.id;app.save();app.renderMonsters();const draft=pendingNpcDraft,id=pendingNpcEditId;pendingNpcDraft=null;pendingNpcEditId='';openNpcEditor(id,draft);app.toast(`${monster.name} added to Bestiary and linked`);}
  function returnToNpcEditor(){const draft=pendingNpcDraft,id=pendingNpcEditId;pendingNpcDraft=null;pendingNpcEditId='';openNpcEditor(id,draft);}

  function editLinkedStatblock(npc){const monster=linkedMonster(npc);if(!monster)return;delete $('#appDialog').dataset.cloneMonsterId;$('#appDialog').dataset.editMonsterId=monster.id;app.showDialog('Bestiary',`Edit ${monster.name}`,app.monsterForm(monster),'<button type="button" id="restoreMonsterBtn" class="button danger-ghost">Restore default</button><button value="cancel" class="button ghost">Cancel</button><button type="button" id="saveMonsterBtn" class="button primary">Save changes</button>');}
  function addNpcToCombat(npc){const monster=linkedMonster(npc);if(!monster)return app.toast('Link a Bestiary statblock first');const copy=structuredClone(monster);delete copy.original;state().combat.combatants.push({...copy,id:uid(),sourceId:`npc:${npc.id}`,statblockSourceId:monster.id,npcId:npc.id,name:npc.name,kind:'monster',ac:monster.armor_class,maxHp:monster.hit_points,hp:monster.hit_points,initiative:app.rollMonsterInitiative(monster),dex:monster.dexterity||10,conditions:[],added:Date.now()});app.sortCombatants();app.save();app.renderCombat();app.toast(`${npc.name} added to combat`);}

  async function exportNpcs(){const payload={format:'echoes-npc-collection',version:1,exportedAt:new Date().toISOString(),npcs:structuredClone(state().npcs)},json=JSON.stringify(payload,null,2),filename='Echoes-NPC-Collection.json';if('showSaveFilePicker'in window){try{const handle=await window.showSaveFilePicker({id:'echoes-npc-export',suggestedName:filename,startIn:'documents',types:[{description:'Echoes NPC Collection',accept:{'application/json':['.json']}}]});const writable=await handle.createWritable();await writable.write(json);await writable.close();app.toast('NPC Collection exported');return;}catch(error){if(error.name==='AbortError')return;}}const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);app.toast('NPC Collection exported');}
  async function importNpcs(file){try{const raw=JSON.parse(await file.text()),incoming=Array.isArray(raw)?raw:Array.isArray(raw.npcs)?raw.npcs:raw&&raw.name?[raw]:[];if(!incoming.length)throw new Error('No NPCs found');const idMap=new Map(),prepared=incoming.map(normaliseNpc);for(const npc of prepared){const existing=state().npcs.find(item=>item.id===npc.id||item.name.toLocaleLowerCase()===npc.name.toLocaleLowerCase());idMap.set(npc.id,existing?.id||npc.id);}let added=0,updated=0;for(let npc of prepared){npc={...npc,id:idMap.get(npc.id),relationships:npc.relationships.map(rel=>({...rel,npcId:idMap.get(rel.npcId)||rel.npcId}))};const index=state().npcs.findIndex(item=>item.id===npc.id||item.name.toLocaleLowerCase()===npc.name.toLocaleLowerCase());if(index>=0){npc.id=state().npcs[index].id;state().npcs[index]=npc;updated++;}else{state().npcs.push(npc);added++;}}canonicaliseCollection();state().npcs.sort((a,b)=>a.name.localeCompare(b.name));app.save();renderCollection();app.toast(`${added} NPCs added · ${updated} updated`);}catch(error){app.toast(error.message||'That file is not valid NPC JSON');}}

  document.addEventListener('click',event=>{
    const target=event.target;
    if(target.closest('[data-view="npcs"]'))setTimeout(render,0);
    if(target.id==='newNpcBtn'||target.closest('[data-create-npc]'))return openNpcEditor();
    if(target.id==='importNpcsBtn')return $('#npcFile').click();
    if(target.id==='exportNpcsBtn')return exportNpcs();
    const edit=target.closest('[data-npc-edit]');if(edit)return openNpcEditor(edit.dataset.npcEdit);
    const remove=target.closest('[data-npc-delete]');if(remove)return openDeleteNpc(remove.dataset.npcDelete);
    if(target.id==='confirmDeleteNpcBtn')return deleteNpc();
    if(target.id==='saveNpcBtn')return saveNpc();
    if(target.id==='chooseNpcPortraitBtn')return $('#npcPortraitFile').click();
    if(target.id==='removeNpcPortraitBtn'){npcDraftPortrait='';updatePortraitPreview();return;}
    const addValue=target.closest('[data-add-npc-value]');if(addValue)return addMultiValue(addValue.dataset.addNpcValue);
    const removeValue=target.closest('[data-remove-npc-value]');if(removeValue){removeValue.remove();return;}
    if(target.id==='addNpcRelationshipBtn'){const currentId=$('#appDialog').dataset.npcEditId||'';$('#npcRelationshipRows').insertAdjacentHTML('beforeend',relationshipRow({},currentId));return;}
    const removeRelationship=target.closest('[data-remove-relationship]');if(removeRelationship){removeRelationship.closest('[data-npc-relationship]').remove();return;}
    if(target.id==='createNpcStatblockBtn')return openNpcStatblockCreator();
    if(target.id==='saveNpcStatblockBtn')return saveNpcStatblock();
    if(target.id==='backToNpcBtn')return returnToNpcEditor();
    if(target.closest('[data-npc-back]')){currentNpcId=null;return renderCollection();}
    const related=target.closest('[data-related-npc]');if(related)return renderProfile(related.dataset.relatedNpc);
    const openStat=target.closest('[data-npc-open-statblock]');if(openStat){const npc=state().npcs.find(item=>item.id===openStat.dataset.npcOpenStatblock);return app.showMonsterPreview(linkedMonster(npc));}
    const editStat=target.closest('[data-npc-edit-statblock]');if(editStat){const npc=state().npcs.find(item=>item.id===editStat.dataset.npcEditStatblock);return editLinkedStatblock(npc);}
    const unlink=target.closest('[data-npc-unlink-statblock]');if(unlink){const npc=state().npcs.find(item=>item.id===unlink.dataset.npcUnlinkStatblock);if(npc){npc.statblockId='';npc.updated=Date.now();app.save();renderProfile(npc.id);app.toast('Statblock unlinked; Bestiary unchanged');}return;}
    const addCombat=target.closest('[data-npc-add-combat]');if(addCombat){const npc=state().npcs.find(item=>item.id===addCombat.dataset.npcAddCombat);return addNpcToCombat(npc);}
    const card=target.closest('[data-npc-open]');if(card&&!target.closest('button,input,select,textarea,a'))return renderProfile(card.dataset.npcOpen);
    if(target.id==='clearNpcFilters'){Object.keys(filterState).forEach(key=>filterState[key]='');return renderCollection();}
  });

  document.addEventListener('input',event=>{if(event.target.id==='npcSearch')renderCollection();});
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-npc-filter]')){filterState[event.target.dataset.npcFilter]=event.target.value;renderCollection();return;}
    if(event.target.id==='npcSort'){renderCollection();return;}
    if(event.target.id==='npcFile'){const file=event.target.files[0];event.target.value='';if(file)importNpcs(file);return;}
    if(event.target.id==='npcPortraitFile'){const file=event.target.files[0];event.target.value='';if(file)loadPortrait(file);return;}
    if(event.target.matches('[data-npc-multi-input]')&&text(event.target.value)){addMultiValue(event.target.dataset.npcMultiInput);return;}
    if(event.target.matches('[data-relationship-npc]')){const npc=state().npcs.find(item=>item.id===event.target.value),row=event.target.closest('[data-npc-relationship]');if(npc&&!$('[data-relationship-name]',row).value)$('[data-relationship-name]',row).value=npc.name;}
  });
  document.addEventListener('keydown',event=>{const input=event.target.closest('[data-npc-multi-input]');if(input&&(event.key==='Enter'||event.key===',')){event.preventDefault();addMultiValue(input.dataset.npcMultiInput);}});
  $('#appDialog').addEventListener('close',()=>{$('#appDialog').classList.remove('npc-dialog');if(currentNpcId&&$('#npcsView').classList.contains('active'))renderProfile(currentNpcId);});

  state().npcs=(state().npcs||[]).map(normaliseNpc);
  canonicaliseCollection();
  app.save();
  window.EchoesNPCs={render,normaliseNpc};
})();
