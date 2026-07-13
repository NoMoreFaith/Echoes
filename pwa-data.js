(() => {
  'use strict';

  const STORAGE_KEY = 'echoes-v1';
  const HANDLE_DB = 'echoes-backup-handles';
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'automatic-backup';
  const LIBRARY_LOAD_MARKER = 'echoes-library-load-marker';
  const FILE_OPTIONS = {
    id: 'echoes-library',
    types: [{ description: 'Echoes library', accept: { 'application/json': ['.json'] } }]
  };

  const $ = selector => document.querySelector(selector);
  let installPrompt = null;
  let backupHandle = null;
  let backupState = 'none';
  let backupLastSaved = null;
  let backupTimer = null;
  let storagePersistent = null;

  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 2600);
  }

  function currentState() {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) throw new Error('No Echoes data is available');
    return JSON.parse(serialized);
  }

  function backupPayload() {
    return {
      format: 'echoes-full-backup',
      version: 1,
      app: 'Echoes',
      exportedAt: new Date().toISOString(),
      author: { name: 'Neil Simpson', email: 'nomorefaith@gmail.com' },
      role: 'durable-library',
      state: currentState()
    };
  }

  function validateBackup(raw) {
    const candidate = raw && raw.state ? raw.state : raw;
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.monsters) || !Array.isArray(candidate.parties) || !candidate.combat) {
      throw new Error('This is not a complete Echoes backup');
    }
    return candidate;
  }

  async function loadAuthoritativeLibrary(handle,file) {
    const marker=handle.name+':'+file.lastModified;
    if(sessionStorage.getItem(LIBRARY_LOAD_MARKER)===marker)return false;
    const raw=JSON.parse(await file.text()),libraryState=validateBackup(raw),currentText=localStorage.getItem(STORAGE_KEY)||'';
    sessionStorage.setItem(LIBRARY_LOAD_MARKER,marker);
    if(JSON.stringify(libraryState)===currentText)return false;
    replaceCurrentData(libraryState);
    location.hash='';
    location.reload();
    return true;
  }
  function replaceCurrentData(raw) {
    const state = validateBackup(raw);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function openHandleDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
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

  async function writeBackupFile(requestPermission = false) {
    if (!backupHandle) return false;
    try {
      const permission = await permissionFor(backupHandle, requestPermission);
      if (permission !== 'granted') {
        backupState = 'permission';
        renderDataStatus();
        return false;
      }
      const writable = await backupHandle.createWritable();
      await writable.write(JSON.stringify(backupPayload(), null, 2));
      await writable.close();
      backupState = 'connected';
      backupLastSaved = new Date();
      renderDataStatus();
      return true;
    } catch (error) {
      backupState = 'error';
      renderDataStatus();
      console.error('Echoes library save failed', error);
      return false;
    }
  }

  function scheduleBackup() {
    if (!backupHandle) return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => writeBackupFile(false), 900);
  }

  async function chooseBackupFile() {
    if (!('showSaveFilePicker' in window)) {
      toast('An external library needs installed Chrome or Edge; exporting a snapshot instead.');
      exportAllData();
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({ ...FILE_OPTIONS, suggestedName: 'Echoes-library.json' });
      backupHandle = handle;
      await storeHandle(handle);
      const saved = await writeBackupFile(true);
      if (saved) toast('External Echoes Library connected');
    } catch (error) {
      if (error.name !== 'AbortError') toast('The library file could not be connected');
    }
  }

  async function reconnectBackupFile() {
    if (!('showOpenFilePicker' in window)) {
      $('#fullBackupFile').click();
      return;
    }
    if (!confirm('Replace the working copy with the selected Echoes Library file?')) return;
    try {
      const [handle] = await window.showOpenFilePicker({ ...FILE_OPTIONS, multiple: false });
      const permission = await permissionFor(handle, true);
      const file = await handle.getFile();
      const raw = JSON.parse(await file.text());
      replaceCurrentData(raw);
      backupHandle = handle;
      await storeHandle(handle);
      backupState = permission === 'granted' ? 'connected' : 'permission';
      if (permission === 'granted') await writeBackupFile(false);
      location.hash = '';
      location.reload();
    } catch (error) {
      if (error.name !== 'AbortError') toast(error.message || 'That library file could not be opened');
    }
  }

  async function resumeBackupPermission() {
    if (!backupHandle) return;
    try {
      const permission=await permissionFor(backupHandle,true);
      if(permission!=='granted'){backupState='permission';renderDataStatus();toast('Write permission was not granted');return;}
      const file=await backupHandle.getFile();
      backupLastSaved=new Date(file.lastModified);
      if(await loadAuthoritativeLibrary(backupHandle,file))return;
      const saved=await writeBackupFile(false);
      toast(saved?'External library resumed':'The library file could not be saved');
    } catch(error){backupState='error';renderDataStatus();toast(error.message||'The library file could not be resumed');}
  }
  async function disconnectBackup() {
    if (!confirm('Disconnect the external library? The library file itself will not be deleted.')) return;
    await removeStoredHandle();
    backupHandle = null;
    backupState = 'none';
    backupLastSaved = null;
    renderDataStatus();
    toast('External library disconnected');
  }

  function exportAllData() {
    try {
      const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `Echoes-backup-${date}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Complete Echoes backup exported');
    } catch (error) {
      toast('Echoes data could not be exported');
    }
  }

  async function importAllData(file) {
    if (!file || !confirm('Replace all current Echoes data with this backup?')) return;
    try {
      replaceCurrentData(JSON.parse(await file.text()));
      location.hash = '';
      location.reload();
    } catch (error) {
      toast(error.message || 'That file is not a complete Echoes backup');
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) {
      toast('Persistent storage is unavailable in this mode');
      return;
    }
    storagePersistent = await navigator.storage.persist();
    renderDataStatus();
    toast(storagePersistent ? 'App storage is now protected' : 'Chrome did not grant persistent storage');
  }

  async function installEchoes() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      toast('Echoes is already installed');
      return;
    }
    if (!installPrompt) {
      toast(location.protocol === 'file:' ? 'Install becomes available after Echoes is served securely.' : 'Use Chrome’s Install Echoes menu when the install button is unavailable.');
      return;
    }
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
    if (installButton) {
      installButton.disabled = installed;
      installButton.textContent = installed ? 'Echoes is installed' : 'Install Echoes';
    }
    const installHelp = $('#installHelp');
    if (installHelp) installHelp.textContent = installed ? 'Launch Echoes from the ChromeOS shelf or app launcher.' : secureHosted ? 'Chrome will offer installation when the app meets install requirements.' : 'The current file preview cannot be installed or work offline; use the hosted PWA edition.';

    setStatus($('#storageStatus'), storagePersistent === true ? 'Protected' : storagePersistent === false ? 'Not protected' : 'Checking…', storagePersistent === true ? 'good' : storagePersistent === false ? 'warn' : '');
    const storageButton = $('#requestStorageBtn');
    if (storageButton) {
      storageButton.disabled = storagePersistent === true;
      storageButton.textContent = storagePersistent === true ? 'Storage protected' : 'Protect app storage';
    }

    const statusText = { none: 'Not connected', connected: 'Library connected', permission: 'Permission needed', error: 'Library error' }[backupState] || 'Not connected';
    const statusTone = { connected: 'good', permission: 'warn', error: 'bad' }[backupState] || '';
    setStatus($('#backupStatus'), statusText, statusTone);
    if ($('#backupFileName')) $('#backupFileName').textContent = backupHandle ? backupHandle.name : 'No backup file selected';
    if ($('#backupLastSaved')) $('#backupLastSaved').textContent = backupLastSaved ? `Last saved ${backupLastSaved.toLocaleString()}` : backupHandle ? 'Waiting for the next successful save.' : 'Choose a file to begin.';
    if ($('#resumeBackupBtn')) $('#resumeBackupBtn').hidden = !(backupHandle && backupState !== 'connected');
    if ($('#disconnectBackupBtn')) $('#disconnectBackupBtn').hidden = !backupHandle;
    const durable=backupState==='connected';
    if($('#libraryWarning'))$('#libraryWarning').hidden=durable;
    if($('#libraryStatusShortcut')){const shortcut=$('#libraryStatusShortcut');shortcut.textContent=durable?'Library file connected':'Library file not connected';shortcut.classList.toggle('connected',durable);}
  }

  async function initialise() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./service-worker.js').catch(error => console.error('Echoes offline setup failed', error));
    }
    if (navigator.storage && navigator.storage.persisted) storagePersistent = await navigator.storage.persisted();
    try {
      backupHandle = await readStoredHandle();
      if (backupHandle) {
        const permission = await permissionFor(backupHandle, false);
        backupState = permission === 'granted' ? 'connected' : 'permission';
        if (backupState === 'connected') {
          const file=await backupHandle.getFile();
          backupLastSaved=new Date(file.lastModified);
          if(await loadAuthoritativeLibrary(backupHandle,file))return;
          scheduleBackup();
        }
      }
    } catch (error) {
      backupState='error';
      console.error('Echoes could not load the external library', error);
    }
    renderDataStatus();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    renderDataStatus();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderDataStatus();
    toast('Echoes installed successfully');
  });
  window.addEventListener('echoes:data-saved', scheduleBackup);

  document.addEventListener('click', event => {
    if (event.target.id === 'openLibrarySetupBtn' || event.target.id === 'libraryStatusShortcut') return window.EchoesApp?.switchView('data');
    if (event.target.id === 'installAppBtn') return installEchoes();
    if (event.target.id === 'requestStorageBtn') return requestPersistentStorage();
    if (event.target.id === 'chooseBackupBtn') return chooseBackupFile();
    if (event.target.id === 'reconnectBackupBtn') return reconnectBackupFile();
    if (event.target.id === 'resumeBackupBtn') return resumeBackupPermission();
    if (event.target.id === 'disconnectBackupBtn') return disconnectBackup();
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
