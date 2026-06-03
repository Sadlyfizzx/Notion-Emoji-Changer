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
let latestTag = null;

const $ = (id) => document.getElementById(id);

/* ============================================================
   IndexedDB helpers for directory handle persistence
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
   Init
   ============================================================ */
async function init() {
  if (!EXT_ID) {
    $('desc').textContent = 'Please open this updater from the extension popup.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  const release = await fetchLatest();
  if (!release) {
    $('desc').textContent = 'Could not reach GitHub. Check your connection and retry.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  latestTag = release.tag_name;

  if (CURRENT && !isNewer(latestTag.replace(/^v/, ''), CURRENT)) {
    $('desc').textContent = `You are already on the latest version (${latestTag}).`;
    $('btn-folder').classList.add('hidden');
    return;
  }

  $('desc').textContent = `Latest version: ${latestTag}. Select your extension folder to update.`;

  const restored = await restoreDirectory();
  if (restored) {
    $('btn-folder').classList.add('hidden');
    $('btn-update').classList.remove('hidden');
    $('desc').textContent = `Folder access granted. Ready to update to ${latestTag}.`;
  }

  $('btn-folder').addEventListener('click', onSelectFolder);
  $('btn-update').addEventListener('click', onUpdate);
  $('btn-retry').addEventListener('click', onUpdate);
}

async function fetchLatest() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
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
    $('desc').textContent = `Folder selected. Ready to update to ${latestTag}.`;
  } catch (e) {
    $('status').textContent = 'Folder selection cancelled.';
  }
}

/* ============================================================
   Update
   ============================================================ */
async function onUpdate() {
  $('btn-update').classList.add('hidden');
  $('btn-retry').classList.add('hidden');
  $('progress').classList.remove('hidden');
  $('status').textContent = 'Downloading files...';
  $('status').className = 'status';

  const total = FILES.length;
  let done = 0;

  for (const file of FILES) {
    try {
      const url = `https://raw.githubusercontent.com/${REPO}/${latestTag}/${file}`;
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

function isNewer(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

init();