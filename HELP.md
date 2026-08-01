# Echoes User Guide

Echoes is a local-first D&D game-master assistant created by Neil Simpson (nomorefaith@gmail.com). It keeps parties, encounters, monsters, NPCs, spells, active combat, and dice-roll history ready for play.

## Install on ChromeOS

Echoes is packaged as a Progressive Web App (PWA), the cross-platform app format supported by ChromeOS.

1. Open [Echoes on GitHub Pages](https://nomorefaith.github.io/Echoes/) in Chrome. A raw local `file://` preview cannot be installed because installation and offline service workers require a secure host.
2. Open **Backup** (the **Data & library** screen) and choose **Install Echoes**, or use Chrome's Install option.
3. Launch Echoes from the ChromeOS shelf or app launcher. It opens in its own standalone window.
4. After the first successful load, the installed app and its browser working copy operate offline. Reconnect the external library if Chrome later asks for file permission.

The same installed PWA works in Chrome or Edge on Windows, macOS, and Linux.

## Protect your data

Use all three layers shown under **Backup**:

1. **Install Echoes** for the standalone offline app.
2. **Protect app storage** to ask Chrome not to evict the temporary working copy during automatic storage cleanup.
3. **Choose Echoes-library.json** and select or create that exact file in any folder exposed by the system picker. Echoes remembers the file and updates it after changes.

Explicitly clearing all site data removes the temporary working copy and the IndexedDB file handle, but not the external JSON file. Normally, use **Resume permission** to grant access to the remembered file. After site data is cleared, choose the same Echoes-library.json again because the saved handle no longer exists.

Use **Export all data** for additional dated snapshots. **Import full backup** restores one of those snapshots after confirmation.

## Quick start

1. Open **Parties** and create or edit your adventuring party.
2. Open **Bestiary** to import, create, or review monsters.
3. Return to **Combat** and select **Add combatant**.
4. Add a saved party, monsters, or a quick temporary combatant.
5. Monster initiative is rolled automatically as d20 plus its Dexterity-based modifier. Enter player initiative values; Echoes sorts the order.
6. Use **Next turn** and the previous-turn arrow to run the round.
7. Save useful setups as encounters for future sessions.

## Combat

- **Initiative:** Select the initiative number on any row and type a new value. The list reorders automatically while preserving the active turn where possible.
- **Turns and rounds:** Use **Next turn** to advance. Passing the final combatant starts a new round. The arrow button moves back one turn.
- **Player characters:** PC rows show editable initiative, name, player/class information, AC, and directly editable current HP.
- **Monsters:** Use the HP slider for large changes and the '-10', '-1', '+1', and '+10' buttons for precise changes.
- **Bloodied and defeated:** A monster name turns red at half HP or below. A combatant name is struck through at 0 HP.
- **Conditions:** Select a combatant, then add or remove conditions—including **Banished** and **Concentration**—in the right details panel.
- **Monster editing:** The pencil edits only that monster instance in the current combat. Changes do not affect the Bestiary unless **Save to Bestiary** is selected.
- **Removing mistakes:** Select the × at the far right of a combatant row to remove that exact PC or monster.
- **Duplicate monsters:** Multiple copies of the same monster are numbered automatically.
- **Details panel:** Select a combatant to review its information. Monster traits, actions, and legendary actions expand and collapse independently.
- **Combat log:** The collapsible log in the combat toolbar shows the latest roll. Expand it to review or clear the shared dice history.

## Parties

- Create a party with **New party**.
- Search parties by party name, character, player, or class.
- Store each character's name, player name, class, HP, and AC.
- Edit a party to add, change, or remove characters. Use the far-right × to delete the party after confirmation.
- Add a complete party to combat from the Parties screen or choose individual members through **Add combatant**.
- A saved player character can only appear once in the current combat.

## Encounters

- Build the combat roster, then select **Save encounter**.
- Select **Edit** on a saved encounter to reopen the encounter builder. Rename it, add or remove combatants, adjust initiative values, and save without changing active combat.
- Give the encounter a name. Saving another encounter with the same name also updates it.
- Saved encounters reset combatants to maximum HP and clear conditions when started.
- Search encounters by encounter, monster, character, player, or class name.
- **Export JSON** creates an editable encounter file. **Import JSON** restores or updates it.
- Starting an encounter replaces the current combat after confirmation.

## Bestiary

- Search by monster name or type and combine dropdown filters for challenge rating, size, creature type, and alignment.
- Select a monster row to preview its stats, senses, traits, actions, and legendary actions.
- **+ Combat** adds a private copy to the active combat.
- **Edit** changes that Bestiary entry. Editing a 5etools record promotes the edited copy to custom, protecting it from later source refreshes. **Restore default** returns it to the imported baseline.
- **Edit as New** duplicates a monster and leaves the original unchanged.
- The far-right × deletes a Bestiary entry after a Yes/No confirmation. Existing encounter and combat copies remain intact.
- **Import file** accepts Echoes/legacy monster JSON. **Import 5etools** accepts the 5etools Bestiary page or a specific 5etools data-file link, then lets you choose source books.
- A refreshed source replaces only entries previously tagged as imported from that same 5etools source. Repeated 5etools display names are reduced to one imported record; custom monsters, local file imports, and custom spell entries are always retained.
- Echoes ships without a bundled monster or spell catalogue; imported records and custom additions live in your external `Echoes-library.json` and remain available offline.
- Rich monster entries can include all six abilities and saves, initiative score/modifier, HP formula, skills, vulnerabilities, resistances, damage and condition immunities, languages, XP, proficiency bonus, legendary resistance count, traits, actions, bonus actions, reactions, and legendary actions.


## NPC Collection

- NPCs are named campaign characters and are stored separately from reusable Bestiary statblocks. Only Name is required.
- An NPC may have no statblock, link an existing Bestiary entry, or create a new statblock that is saved to the Bestiary and linked automatically.
- Deleting or unlinking an NPC never deletes the linked Bestiary statblock.
- Voice Acting Note and Voice Acting Quote are prioritised in the editor and profile.
- Race, class/profession, faction, locations and tags autocomplete from values already used by other NPCs. Tags and additional locations support multiple removable values.
- Search includes names, identity, location, faction, tags, summary and voice fields. Collection-derived filters can be combined.
- Relationships may link to another saved NPC and include a type and note.
- A linked statblock can be opened, edited, replaced, unlinked, or used to add the named NPC to Combat.
- NPC collection JSON import/export and complete Echoes backups include NPCs and their compressed portraits.

## Spells

- Search by spell name, school, class, or description.
- Filter by spell level, school, casting time, and class.
- Select any spell row to open its full description.
- Create individual spells, import a spell JSON file, or use **Import 5etools** and select the source books you use.
- Refreshing a 5etools spell source never removes custom spells. Repeated imported spell names are reduced to one 5etools record.
- Spell names mentioned in monster descriptions become links when the spell exists in the library.
- Difficulty classes written as 'DC' followed by a number are emphasized automatically.


## Dice roller

- Open **Dice roller** directly below Spells in the navigation.
- Choose d4, d6, d8, d10, d12, d20, d100, or a Custom die from d2 to d1000, then set the number of dice and an optional positive or negative modifier.
- Select **Roll dice**, or press Enter while editing the dice count or modifier.
- Dice expressions such as **1d4 + 2** and **2d6 - 3** become clickable in monster and spell descriptions and roll immediately.
- The log records each die, modifier, total, time, and source ability or spell.
- The latest 200 rolls persist with the rest of Echoes and are included in complete backups. Use **Clear log** to erase the history.

## Screen controls

- Collapse the left navigation with the double-chevron button immediately above the lower divider.
- Collapse the right combat details panel when more initiative space is needed.
- Echoes remembers both panel settings.
- Search and filter controls remain pinned above long Bestiary, Spells, NPC, Party, and Encounter lists.
- Use **Full screen** for maximum visibility at the table.


## Data durability

- Browser storage is only an Echoes working copy.
- Choose the exact external **Echoes-library.json** in any locally available or synchronised folder so permanent Bestiary entries, NPCs, parties, encounters, spells, and combat data live outside the browser.
- Echoes validates a selected file before replacing the working copy. An empty file is initialised safely; invalid JSON is reported and is not overwritten automatically.
- Echoes loads a connected library as the authoritative copy and automatically saves relevant changes after a short debounce.
- Use **Resume permission** when Chrome asks for access again. Use **Choose a different library** only when intentionally changing files, when the stored file is unavailable, or after site data erased the saved handle.
