(() => {
  'use strict';

  const STORAGE_KEY = 'echoes-v1';
  const HANDLE_DB = 'echoes-backup-handles';
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'automatic-backup';
  const RELOAD_SOURCE_KEY = 'echoes-library-reload-source';
  const FILE_OPTIONS = {
    id: 'echoes-library',
    suggestedName: 'Echoes-library.json',
    types: [{ description: 'Echoes library', accept: { 'application/json': ['.json'] } }]
  };
  const core = window.EchoesLibraryCore;
  const $ = selector => document.querySelector(selector);

  let installPrompt = null;
  let libraryHandle = null;
  let libraryState = 'none';
  let libraryMessage = '';
  let lastSaved = null;
  let observedModified = null;
  let saveTimer = null;
  let storagePersistent = null;

  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 3000);
  }

  function currentState() {
    if (window.EchoesApp?.state) return core.validateState(structuredClone(window.EchoesApp.state));
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) throw new Error('No Echoes working data is available');
    return core.validateState(JSON.parse(serialized));
  }

  function payloadFor(state) {
    return core.createPayload(state);
  }

  function stateFingerprint(state) {
    const text = JSON.stringify(core.validateState(state));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${hash >>> 0}`;
  }

  function replaceWorkingCopy(state) {
    const validated=core.validateState(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(validated)); }
    catch(error) { console.warn('The external library is larger than the browser recovery copy.', error); }
    window.EchoesApp?.replaceState(validated);
  }

  function openHandleDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readStoredHandle() {
    const database = await openHandleDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () => { database.close(); resolve(request.result || null); };
      request.onerror = () => { database.close(); reject(request.error); };
    });
  }

  async function storeHandle(handle) {
    const database = await openHandleDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, 'readwrite');
      transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    });
  }

  async function removeStoredHandle() {
    const database = await openHandleDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, 'readwrite');
      transaction.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    });
  }

  async function permissionFor(handle, request = false) {
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && request) permission = await handle.requestPermission({ mode: 'readwrite' });
    return permission;
  }

  function setLibraryFailure(error) {
    if (error && (error.code === 'invalid' || error.name === 'SyntaxError')) {
      libraryState = 'invalid';
      libraryMessage = error.message || 'The selected file is not valid Echoes JSON.';
    } else if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      libraryState = 'permission';
      libraryMessage = 'Read/write permission is required for the selected file.';
    } else {
      libraryState = 'unavailable';
      libraryMessage = error?.message || 'The selected file cannot be reached. It may have been moved or deleted.';
    }
    renderDataStatus();
  }

  async function writeStateToHandle(state) {
    const validated = core.validateState(state);
    const writable = await libraryHandle.createWritable();
    await writable.write(JSON.stringify(payloadFor(validated), null, 2));
    await writable.close();
    const file = await libraryHandle.getFile();
    observedModified = file.lastModified;
    lastSaved = new Date(file.lastModified || Date.now());
  }

  async function readSelectedLibrary() {
    const file = await libraryHandle.getFile();
    const parsed = core.parseLibraryText(await file.text());
    if (parsed.wasEmpty) {
      parsed.state = currentState();
      libraryState = 'saving';
      libraryMessage = 'Saving the current campaign into the empty library file.';
      renderDataStatus();
      await writeStateToHandle(parsed.state);
    } else {
      observedModified = file.lastModified;
      lastSaved = new Date(file.lastModified);
    }
    return parsed;
  }

  async function connectStoredHandle({ requestPermission = false, announce = false } = {}) {
    if (!libraryHandle) return false;
    try {
      const permission = await permissionFor(libraryHandle, requestPermission);
      if (permission !== 'granted') {
        libraryState = 'permission';
        libraryMessage = 'Select Resume permission to grant read/write access to this exact file.';
        renderDataStatus();
        return false;
      }
      const parsed = await readSelectedLibrary();
      const currentSerialized = localStorage.getItem(STORAGE_KEY);
      let current = null;
      let same = false;
      if (currentSerialized) {
        try {
          current = core.validateState(JSON.parse(currentSerialized));
          same = JSON.stringify(current) === JSON.stringify(parsed.state);
        }
        catch { same = false; }
      }
      libraryState = parsed.wasEmpty ? 'saved' : 'connected';
      libraryMessage = parsed.wasEmpty ? 'The empty file was initialised successfully.' : 'Connected and saving automatically.';
      renderDataStatus();
      if (!same) {
        const sourceFingerprint = stateFingerprint(parsed.state);
        if (current && sessionStorage.getItem(RELOAD_SOURCE_KEY) === sourceFingerprint) {
          sessionStorage.removeItem(RELOAD_SOURCE_KEY);
          libraryState = 'saving';
          libraryMessage = 'Updating the external library to the current Echoes format.';
          renderDataStatus();
          await writeStateToHandle(current);
          libraryState = 'saved';
          libraryMessage = 'External library upgraded successfully.';
          renderDataStatus();
          return true;
        }
        sessionStorage.setItem(RELOAD_SOURCE_KEY, sourceFingerprint);
        replaceWorkingCopy(parsed.state);
        sessionStorage.removeItem(RELOAD_SOURCE_KEY);
        return true;
      }
      sessionStorage.removeItem(RELOAD_SOURCE_KEY);
      if (announce) toast(parsed.wasEmpty ? 'Empty Echoes library initialised' : 'External Echoes library connected');
      return true;
    } catch (error) {
      setLibraryFailure(error);
      if (announce && error?.name !== 'AbortError') toast(libraryMessage);
      return false;
    }
  }

  async function validateFileBeforeAutomaticWrite() {
    const file = await libraryHandle.getFile();
    const text = await file.text();
    if (!String(text || '').trim()) {
      throw new core.LibraryFileError('invalid', 'Invalid library file: the connected file became empty. Automatic saving was stopped to protect the browser working copy.');
    }
    core.parseLibraryText(text);
    observedModified = file.lastModified;
  }

  async function writeLibraryFile() {
    if (!libraryHandle || !['connected', 'saved'].includes(libraryState)) return false;
    try {
      const permission = await permissionFor(libraryHandle, false);
      if (permission !== 'granted') {
        libraryState = 'permission';
        libraryMessage = 'Read/write permission must be resumed for the selected file.';
        renderDataStatus();
        return false;
      }
      await validateFileBeforeAutomaticWrite();
      const state = currentState();
      libraryState = 'saving';
      libraryMessage = 'Saving changes to the selected library file.';
      renderDataStatus();
      await writeStateToHandle(state);
      libraryState = 'saved';
      libraryMessage = 'Last saved successfully.';
      renderDataStatus();
      return true;
    } catch (error) {
      setLibraryFailure(error);
      console.error('Echoes library save failed', error);
      return false;
    }
  }

  function scheduleLibrarySave() {
    if (!libraryHandle || !['connected', 'saved'].includes(libraryState)) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeLibraryFile, 1000);
  }

  async function chooseLibraryFile() {
    if (!('showSaveFilePicker' in window)) {
      libraryState = 'unavailable';
      libraryMessage = 'The File System Access API is unavailable. Open the installed Echoes app in Chrome or Edge.';
      renderDataStatus();
      toast(libraryMessage);
      return;
    }
    try {
      const handle = await window.showSaveFilePicker(FILE_OPTIONS);
      libraryHandle = handle;
      await storeHandle(handle);
      await connectStoredHandle({ requestPermission: true, announce: true });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setLibraryFailure(error);
        toast(libraryMessage || 'The library file could not be selected');
      }
    }
  }

  async function resumeLibraryPermission() {
    if (!libraryHandle) return;
    try {
      const permission = await permissionFor(libraryHandle, true);
      if (permission !== 'granted') {
        libraryState = 'permission';
        libraryMessage = 'Read/write permission was not granted for the stored file.';
        renderDataStatus();
        toast('Permission was not granted');
        return;
      }
      await connectStoredHandle({ requestPermission: false, announce: true });
    } catch (error) {
      setLibraryFailure(error);
      toast(libraryMessage);
    }
  }

  async function retryStoredLibrary() {
    if (!libraryHandle) return;
    await connectStoredHandle({ requestPermission: false, announce: true });
  }

  async function disconnectLibrary() {
    if (!confirm('Disconnect the external library? The selected file itself will not be deleted.')) return;
    clearTimeout(saveTimer);
    await removeStoredHandle();
    libraryHandle = null;
    libraryState = 'none';
    libraryMessage = '';
    lastSaved = null;
    observedModified = null;
    renderDataStatus();
    toast('External library disconnected');
  }

  function exportAllData() {
    try {
      const blob = new Blob([JSON.stringify(payloadFor(currentState()), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Echoes-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Complete Echoes backup exported');
    } catch (error) {
      toast(error.message || 'Echoes data could not be exported');
    }
  }

  async function importAllData(file) {
    if (!file || !confirm('Replace all current Echoes data with this backup?')) return;
    try {
      const parsed = core.parseLibraryText(await file.text());
      replaceWorkingCopy(parsed.state);
      if (libraryHandle && ['connected', 'saved'].includes(libraryState)) await writeStateToHandle(parsed.state);
      toast('Complete Echoes backup imported');
    } catch (error) {
      toast(error.message || 'That file is not a complete Echoes backup');
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return toast('Persistent storage is unavailable in this mode');
    storagePersistent = await navigator.storage.persist();
    renderDataStatus();
    toast(storagePersistent ? 'App storage is now protected' : 'Chrome did not grant persistent storage');
  }

  async function installEchoes() {
    if (window.matchMedia('(display-mode: standalone)').matches) return toast('Echoes is already installed');
    if (!installPrompt) return toast(location.protocol === 'file:' ? 'Install becomes available after Echoes is served securely.' : 'Use Chrome’s Install Echoes menu when the install button is unavailable.');
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderDataStatus();
  }

  function setStatus(element, text, tone = '') {
    if (!element) return;
    element.textContent = text;
    element.className = `status-pill ${tone}`.trim();
  }

  function renderDataStatus() {
    const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const secureHosted = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    setStatus($('#appModeStatus'), installed ? 'Installed' : secureHosted ? 'Ready to install' : 'File preview', installed ? 'good' : secureHosted ? 'warn' : 'bad');
    const installButton = $('#installAppBtn');
    if (installButton) { installButton.disabled = installed; installButton.textContent = installed ? 'Echoes is installed' : 'Install Echoes'; }
    if ($('#installHelp')) $('#installHelp').textContent = installed ? 'Launch Echoes from the ChromeOS shelf or app launcher.' : secureHosted ? 'Chrome will offer installation when the app meets install requirements.' : 'The file preview cannot use durable file access; use the hosted or installed PWA.';

    setStatus($('#storageStatus'), storagePersistent === true ? 'Protected' : storagePersistent === false ? 'Not protected' : 'Checking…', storagePersistent === true ? 'good' : storagePersistent === false ? 'warn' : '');
    const storageButton = $('#requestStorageBtn');
    if (storageButton) { storageButton.disabled = storagePersistent === true; storageButton.textContent = storagePersistent === true ? 'Storage protected' : 'Protect app storage'; }

    const labels = {
      none: 'Not connected',
      connected: 'Connected and saving automatically',
      permission: 'Permission required',
      unavailable: 'File unavailable',
      invalid: 'Invalid library file',
      saving: 'Saving',
      saved: 'Last saved successfully'
    };
    const tones = { connected: 'good', saved: 'good', saving: 'warn', permission: 'warn', unavailable: 'bad', invalid: 'bad' };
    setStatus($('#backupStatus'), labels[libraryState] || labels.none, tones[libraryState] || '');
    if ($('#backupFileName')) $('#backupFileName').textContent = libraryHandle ? libraryHandle.name : 'No library file selected';
    if ($('#backupLastSaved')) {
      const savedText = lastSaved ? ` Last saved successfully ${lastSaved.toLocaleString()}.` : '';
      $('#backupLastSaved').textContent = `${libraryMessage || (libraryHandle ? 'Waiting for a successful save.' : 'Choose the exact Echoes-library.json file to begin.')}${savedText}`.trim();
    }

    if ($('#chooseBackupBtn')) $('#chooseBackupBtn').hidden = Boolean(libraryHandle);
    if ($('#chooseDifferentLibraryBtn')) $('#chooseDifferentLibraryBtn').hidden = !libraryHandle;
    if ($('#resumeBackupBtn')) $('#resumeBackupBtn').hidden = !(libraryHandle && libraryState === 'permission');
    if ($('#retryBackupBtn')) $('#retryBackupBtn').hidden = !(libraryHandle && ['invalid', 'unavailable'].includes(libraryState));
    if ($('#disconnectBackupBtn')) $('#disconnectBackupBtn').hidden = !libraryHandle;

    const durable = ['connected', 'saving', 'saved'].includes(libraryState);
    const shortcut = $('#libraryStatusShortcut');
    if (shortcut) {
      shortcut.textContent = labels[libraryState] || labels.none;
      shortcut.classList.toggle('connected', durable);
    }
    const warning = $('#libraryWarning');
    if (warning) {
      warning.hidden = durable;
      const title = warning.querySelector('strong');
      const copy = warning.querySelector('[data-library-warning-copy]');
      if (title) title.textContent = `${labels[libraryState] || labels.none}.`;
      if (copy) copy.textContent = libraryMessage || 'Permanent campaign data currently exists only in the browser working copy.';
    }
  }

  async function initialise() {
    if (!core) {
      libraryState = 'unavailable';
      libraryMessage = 'The Echoes library validator did not load.';
      return renderDataStatus();
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(error => console.error('Echoes offline setup failed', error));
    if (navigator.storage && navigator.storage.persisted) storagePersistent = await navigator.storage.persisted();
    try {
      libraryHandle = await readStoredHandle();
      if (libraryHandle) {
        const permission = await permissionFor(libraryHandle, false);
        if (permission === 'granted') await connectStoredHandle();
        else {
          libraryState = 'permission';
          libraryMessage = 'Chrome requires read/write permission for the previously selected file. Resume permission uses that stored file handle.';
        }
      }
    } catch (error) {
      setLibraryFailure(error);
      console.error('Echoes could not restore the selected library handle', error);
    }
    renderDataStatus();
  }

  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; renderDataStatus(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; renderDataStatus(); toast('Echoes installed successfully'); });
  window.addEventListener('echoes:data-saved', scheduleLibrarySave);

  document.addEventListener('click', event => {
    if (event.target.id === 'openLibrarySetupBtn' || event.target.id === 'libraryStatusShortcut') return window.EchoesApp?.switchView('data');
    if (event.target.id === 'installAppBtn') return installEchoes();
    if (event.target.id === 'requestStorageBtn') return requestPersistentStorage();
    if (event.target.id === 'chooseBackupBtn' || event.target.id === 'chooseDifferentLibraryBtn') return chooseLibraryFile();
    if (event.target.id === 'resumeBackupBtn') return resumeLibraryPermission();
    if (event.target.id === 'retryBackupBtn') return retryStoredLibrary();
    if (event.target.id === 'disconnectBackupBtn') return disconnectLibrary();
    if (event.target.id === 'exportAllDataBtn') return exportAllData();
    if (event.target.id === 'importAllDataBtn') return $('#fullBackupFile').click();
  });
  $('#fullBackupFile')?.addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) importAllData(file);
  });

  initialise();
})();
