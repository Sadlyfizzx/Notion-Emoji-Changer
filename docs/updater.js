const REPO = 'Sadlyfizzx/Notion-Emoji-Changer';
const EXT_ID = new URLSearchParams(location.search).get('id');
const CURRENT = new URLSearchParams(location.search).get('current');

const FILES = [
  'manifest.json',
  'emojiReplacer.js',
  'popup.js',
  'popup.css',
  'popup.html',
  'background.js',
  'Icon.png'
];

const SESSION_KEY = 'emoji-update-state';
const UPDATE_LOCK_KEY = 'emoji-injector-updating';
const RELEASE_CACHE_KEY = 'emoji-release-cache';
const CACHE_TTL = 60 * 60 * 1000;

let dirHandle = null;
let latestTag = null;
let latestVersion = null;
let fileCache = null;

const $ = (id) => document.getElementById(id);

function extractVersion(str) {
  if (!str) return '0.0.0';
  const match = str.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
  return match ? match[0] : str.replace(/^v/, '');
}

function isNewer(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const li = isNaN(l[i]) ? 0 : (l[i] || 0);
    const ci = isNaN(c[i]) ? 0 : (c[i] || 0);
    if (li > ci) return true;
    if (li < ci) return false;
  }
  return false;
}

function isBrave() {
  return navigator.brave?.isBrave?.() || false;
}

const DB_NAME = 'EmojiInjectorUpdater';
const STORE = 'meta';

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => res(req.result);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  });
}

async function saveHandle(handle) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const r = os.put(handle, 'dir');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

async function getHandle() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const os = tx.objectStore(STORE);
    const r = os.get('dir');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function clearHandle() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const r = os.delete('dir');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function acquireLock() {
  const now = Date.now();
  const start = localStorage.getItem(UPDATE_LOCK_KEY);
  if (start && (now - parseInt(start, 10)) < 60000) return false;
  localStorage.setItem(UPDATE_LOCK_KEY, now.toString());
  return true;
}

function releaseLock() {
  localStorage.removeItem(UPDATE_LOCK_KEY);
}

function saveState(state) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function clearState() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchLatest() {
  const cached = localStorage.getItem(RELEASE_CACHE_KEY);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) return data;
  }
  try {
    const res = await fetchWithTimeout(`https://api.github.com/repos/${REPO}/releases/latest`, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch (e) {
    return null;
  }
}

async function preDownloadFiles() {
  if (fileCache) return;
  fileCache = {};
  try {
    for (const file of FILES) {
      const url = `https://raw.githubusercontent.com/${REPO}/main/${file}`;
      const res = await fetchWithTimeout(url, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fileCache[file] = await res.blob();
    }
    $('preloaded').classList.remove('hidden');
  } catch (e) {
    fileCache = null;
    console.warn('[Updater] Pre-download failed:', e);
  }
}

function cleanChangelog(md) {
  if (!md) return '';
  return md
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`]/g, '')
    .trim();
}

/* ============================================================
   Init
   ============================================================ */
async function init() {
  if (!EXT_ID) {
    showError('Please open this updater from the extension popup.', `
      <div class="step"><span class="step-num">1</span>Open the Notion Emoji Injector extension icon</div>
      <div class="step"><span class="step-num">2</span>Click the Update button in the popup</div>
    `);
    return;
  }

  if (!window.showDirectoryPicker) {
    const onBrave = isBrave();
    showError(onBrave ? 'Brave blocks folder access by default.' : 'Your browser does not support automatic updates.', onBrave ? `
      <div class="step"><span class="step-num">1</span>Open <code>brave://flags</code></div>
      <div class="step"><span class="step-num">2</span>Search <code>file-system-access-api</code></div>
      <div class="step"><span class="step-num">3</span>Set to <strong>Enabled</strong> and relaunch</div>
      <div class="step"><span class="step-num">4</span>Refresh this page</div>
    ` : `
      <div class="step"><span class="step-num">1</span>Use Chrome or Edge on desktop</div>
      <div class="step"><span class="step-num">2</span>Or download the zip and update manually</div>
    `);
    return;
  }

  const release = await fetchLatest();
  if (!release) {
    showError('Could not reach GitHub.', 'Check your internet connection and refresh the page.');
    return;
  }

  latestTag = release.tag_name;
  latestVersion = extractVersion(latestTag);
  const currentVersion = extractVersion(CURRENT || '0.0.0');

  $('version-badge').textContent = latestTag;
  $('version-current').textContent = CURRENT ? `You have v${CURRENT}` : '';

  if (release.body) {
    $('changelog-body').textContent = cleanChangelog(release.body);
    $('changelog').classList.remove('hidden');
  }

  if (CURRENT && !isNewer(latestVersion, currentVersion)) {
    $('header-sub').textContent = 'You are already on the latest version.';
    $('main-card').classList.add('hidden');
    return;
  }

  $('header-sub').textContent = `Update from v${currentVersion} to ${latestTag}`;
  $('main-card').classList.remove('hidden');

  const restored = await restoreDirectory();
  if (restored) {
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    preDownloadFiles();
  }

  const state = loadState();
  if (state && state.phase === 'writing' && state.latestTag === latestTag) {
    $('header-sub').textContent = 'Update was interrupted. Resume to finish.';
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    $('btn-update').textContent = 'Resume Update';
  }

  $('btn-folder').addEventListener('click', onSelectFolder);
  $('btn-update').addEventListener('click', onUpdate);
  $('btn-retry').addEventListener('click', onUpdate);
}

function showError(title, stepsHtml) {
  $('header-sub').textContent = 'Something went wrong';
  $('main-card').classList.add('hidden');
  $('error-card').classList.remove('hidden');
  $('error-status').textContent = title;
  $('error-steps').innerHTML = stepsHtml;
}

async function restoreDirectory() {
  try {
    const handle = await getHandle();
    if (!handle) return false;
    dirHandle = handle;
    const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'denied') {
      await clearHandle();
      return false;
    }
    return perm === 'granted';
  } catch (e) {
    return false;
  }
}

async function validateFolder(handle) {
  try {
    const manifestHandle = await handle.getFileHandle('manifest.json');
    const file = await manifestHandle.getFile();
    const text = await file.text();
    const json = JSON.parse(text);
    return json.name === 'Notion Emoji Injector';
  } catch {
    return false;
  }
}

async function onSelectFolder() {
  try {
    dirHandle = await window.showDirectoryPicker();
    const isValid = await validateFolder(dirHandle);
    if (!isValid) {
      $('status').textContent = 'This folder does not contain the extension. Look for the folder with manifest.json.';
      $('status').className = 'status error';
      dirHandle = null;
      return;
    }
    await saveHandle(dirHandle);
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    $('status').textContent = '';
    preDownloadFiles();
  } catch (e) {
    console.error('[Updater] Folder selection failed:', e.name, e.message);
    let msg = 'Folder selection failed.';
    if (e.name === 'AbortError') {
      msg = 'You cancelled the picker. Click again to select your extension folder.';
    } else if (e.name === 'SecurityError') {
      msg = 'Permission blocked. Reset site permissions for sadlyfizzx.github.io.';
    } else if (e.name === 'NotAllowedError') {
      msg = 'Browser denied access. Use a normal (non-incognito) window.';
    } else {
      msg = `Error (${e.name}): ${e.message}`;
    }
    $('status').textContent = msg;
    $('status').className = 'status error';
  }
}

async function onUpdate() {
  if (!acquireLock()) {
    $('status').textContent = 'An update is already running in another tab. Please wait.';
    $('status').className = 'status error';
    return;
  }

  $('btn-update').classList.add('hidden');
  $('btn-retry').classList.add('hidden');
  $('progress').classList.remove('hidden');
  $('status').textContent = fileCache ? 'Installing...' : 'Downloading...';
  $('status').className = 'status';

  const total = FILES.length;
  let done = 0;

  for (const file of FILES) {
    saveState({ phase: 'writing', currentFile: file, done, total, latestTag });

    try {
      let blob;
      if (fileCache && fileCache[file]) {
        blob = fileCache[file];
      } else {
        const url = `https://raw.githubusercontent.com/${REPO}/main/${file}`;
        const res = await fetchWithTimeout(url, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
        blob = await res.blob();
      }

      const fileHandle = await dirHandle.getFileHandle(file, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      done++;
      $('fill').style.width = `${(done / total) * 100}%`;
      $('progress-file').textContent = `Writing ${file}`;
      $('progress-count').textContent = `${done}/${total}`;
    } catch (e) {
      releaseLock();
      let msg = `Error writing ${file}: ${e.message}.`;
      if (e.name === 'NotAllowedError' || e.message.includes('lock') || e.message.includes('denied')) {
        msg = 'Chrome locked the extension files. Disable the extension in chrome://extensions temporarily, then retry.';
      } else if (e.name === 'AbortError') {
        msg = 'Download timed out. Check your connection and retry.';
      }
      $('status').textContent = msg;
      $('status').className = 'status error';
      $('btn-retry').classList.remove('hidden');
      return;
    }
  }

  clearState();
  releaseLock();

  try {
    const manifestHandle = await dirHandle.getFileHandle('manifest.json');
    const manifestFile = await manifestHandle.getFile();
    const manifestText = await manifestFile.text();
    const manifestJson = JSON.parse(manifestText);
    const installedVersion = extractVersion(manifestJson.version);
    if (installedVersion !== latestVersion) {
      $('status').textContent = `Warning: installed version (${installedVersion}) does not match expected (${latestVersion}).`;
      $('status').className = 'status error';
      return;
    }
  } catch (e) {
    console.warn('[Updater] Post-write validation failed:', e);
  }

  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('current', latestVersion);
  history.replaceState(null, '', newUrl.toString());

  $('progress').classList.add('hidden');
  $('status').textContent = 'Extension updated successfully!';
  $('status').className = 'status success';

  try {
    chrome.runtime.sendMessage(EXT_ID, { action: 'reload-extension' }, (res) => {
      if (chrome.runtime.lastError) {
        $('status').innerHTML = `
          Extension updated! 
          <div style="margin-top:8px;color:var(--text-dim)">
            If it did not reload automatically, go to chrome://extensions and click the refresh icon.
          </div>
        `;
        return;
      }
      $('status').textContent = 'Extension updated and reloaded! Refresh your Notion tabs.';
    });
  } catch (e) {
    $('status').textContent = 'Extension updated! Refresh your Notion tabs to apply.';
  }
}

init();
