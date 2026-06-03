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

let dirHandle = null;
let latestVersion = null;

const $ = (id) => document.getElementById(id);

/* ============================================================
   Version extraction
   ============================================================ */
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

/* ============================================================
   IndexedDB helpers
   ============================================================ */
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

/* ============================================================
   Fetch version — API first, then manifest.json fallback
   ============================================================ */
async function fetchLatestVersion() {
  // Try GitHub API first
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (res.ok) {
      const data = await res.json();
      const ver = extractVersion(data.tag_name);
      return { version: ver, source: 'release', tag: data.tag_name };
    }
    console.warn('[Updater] GitHub API returned', res.status, res.statusText);
  } catch (e) {
    console.warn('[Updater] GitHub API failed:', e.message);
  }

  // Fallback: read manifest.json from main branch
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/manifest.json`);
    if (res.ok) {
      const manifest = await res.json();
      const ver = extractVersion(manifest.version);
      return { version: ver, source: 'manifest', tag: 'main' };
    }
    console.warn('[Updater] Manifest fallback returned', res.status);
  } catch (e) {
    console.warn('[Updater] Manifest fallback failed:', e.message);
  }

  return null;
}

/* ============================================================
   Init
   ============================================================ */
async function init() {
  if (!EXT_ID) {
    $('desc').textContent = 'Please open this updater from the extension popup.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  const result = await fetchLatestVersion();

  if (!result) {
    $('desc').textContent = 'Could not reach GitHub. Check your connection, disable ad blockers for this site, or try again in a few minutes.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  latestVersion = result.version;

  const currentVersion = extractVersion(CURRENT || '0.0.0');

  if (CURRENT && !isNewer(latestVersion, currentVersion)) {
    $('desc').textContent = `You are already on the latest version (v${latestVersion}).`;
    $('btn-folder').classList.add('hidden');
    return;
  }

  $('desc').textContent = `Latest version: v${latestVersion} (from ${result.source}). Select your extension folder to update.`;

  const restored = await restoreDirectory();
  if (restored) {
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    $('desc').textContent = `Folder access granted. Ready to update to v${latestVersion}.`;
  }

  $('btn-folder').addEventListener('click', onSelectFolder);
  $('btn-update').addEventListener('click', onUpdate);
  $('btn-retry').addEventListener('click', onUpdate);
}

async function restoreDirectory() {
  try {
    const handle = await getHandle();
    if (!handle) return false;
    dirHandle = handle;
    const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  } catch (e) {
    return false;
  }
}

async function onSelectFolder() {
  try {
    dirHandle = await window.showDirectoryPicker();
    await saveHandle(dirHandle);
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    $('desc').textContent = `Folder selected. Ready to update to v${latestVersion}.`;
  } catch (e) {
    $('status').textContent = 'Folder selection cancelled.';
  }
}

/* ============================================================
   Update — pulls files from main branch
   ============================================================ */
async function onUpdate() {
  $('btn-update').classList.add('hidden');
  $('btn-retry').classList.add('hidden');
  $('progress').classList.remove('hidden');
  $('status').textContent = 'Downloading files from main branch...';
  $('status').className = 'status';

  const total = FILES.length;
  let done = 0;

  for (const file of FILES) {
    try {
      const url = `https://raw.githubusercontent.com/${REPO}/main/${file}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);

      const blob = await res.blob();
      const fileHandle = await dirHandle.getFileHandle(file, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      done++;
      $('fill').style.width = `${(done / total) * 100}%`;
      $('status').textContent = `Writing ${file}...`;
    } catch (e) {
      let msg = `Error writing ${file}: ${e.message}.`;
      if (e.name === 'NotAllowedError' || e.message.includes('lock')) {
        msg += ' Disable the extension in chrome://extensions temporarily, then retry.';
      }
      $('status').textContent = msg;
      $('status').className = 'status error';
      $('btn-retry').classList.remove('hidden');
      return;
    }
  }

  $('status').textContent = 'Files updated. Reloading extension...';
  $('status').className = 'status success';

  try {
    chrome.runtime.sendMessage(EXT_ID, { action: 'reload-extension' }, (res) => {
      if (chrome.runtime.lastError) {
        $('status').textContent = 'Extension reloaded. Refresh your Notion tabs to apply.';
        return;
      }
      $('status').textContent = 'Extension updated successfully! Refresh your Notion tabs.';
    });
  } catch (e) {
    $('status').textContent = 'Extension reloaded. Refresh your Notion tabs to apply.';
  }
}

init();