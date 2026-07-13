(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EchoesLibraryCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class LibraryFileError extends Error {
    constructor(code, message, cause) {
      super(message, cause ? { cause } : undefined);
      this.name = 'LibraryFileError';
      this.code = code;
    }
  }

  function emptyState() {
    return {
      monsters: [],
      spells: [],
      parties: [],
      encounters: [],
      npcs: [],
      dice: { count: 1, sides: 20, modifier: 0 },
      diceLog: [],
      ui: { sidebarCollapsed: false, detailCollapsed: false },
      combat: { name: 'Untitled battle', round: 1, turn: 0, combatants: [], selectedId: null }
    };
  }

  function validateState(raw) {
    const candidate = raw && raw.state ? raw.state : raw;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new LibraryFileError('invalid', 'Invalid library file: the JSON root must contain an Echoes state object.');
    }
    if (!Array.isArray(candidate.monsters) || !Array.isArray(candidate.parties) || !candidate.combat || typeof candidate.combat !== 'object') {
      throw new LibraryFileError('invalid', 'Invalid library file: required Echoes monsters, parties, or combat data is missing.');
    }
    const defaults = emptyState();
    return {
      ...defaults,
      ...candidate,
      monsters: candidate.monsters,
      spells: Array.isArray(candidate.spells) ? candidate.spells : [],
      parties: candidate.parties,
      encounters: Array.isArray(candidate.encounters) ? candidate.encounters : [],
      npcs: Array.isArray(candidate.npcs) ? candidate.npcs : [],
      dice: { ...defaults.dice, ...(candidate.dice || {}) },
      diceLog: Array.isArray(candidate.diceLog) ? candidate.diceLog : [],
      ui: { ...defaults.ui, ...(candidate.ui || {}) },
      combat: { ...defaults.combat, ...candidate.combat, combatants: Array.isArray(candidate.combat.combatants) ? candidate.combat.combatants : [] }
    };
  }

  function parseLibraryText(text) {
    if (!String(text || '').trim()) return { state: emptyState(), wasEmpty: true };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new LibraryFileError('invalid', `Invalid library file: ${error.message}`, error);
    }
    return { state: validateState(parsed), wasEmpty: false };
  }

  function createPayload(state, metadata = {}) {
    return {
      format: 'echoes-full-backup',
      version: 1,
      app: 'Echoes',
      exportedAt: metadata.exportedAt || new Date().toISOString(),
      author: { name: 'Neil Simpson', email: 'nomorefaith@gmail.com' },
      role: 'durable-library',
      state: validateState(state)
    };
  }

  return { LibraryFileError, emptyState, validateState, parseLibraryText, createPayload };
});
