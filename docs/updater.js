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
let latestVersion = null;

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

/* ============================================================
   Init
   ============================================================ */
async function init() {
  if (!EXT_ID) {
    $('desc').textContent = 'Please open this updater from the extension popup.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  // CRITICAL: Check if File System Access API is available
  if (!window.showDirectoryPicker) {
    const onBrave = isBrave();
    $('desc').textContent = onBrave
      ? 'Brave blocks folder access by default. Enable it below.'
      : 'Your browser does not support automatic folder updates.';
    $('btn-folder').classList.add('hidden');

    if (onBrave) {
      $('status').innerHTML = `
        <div style="margin-bottom:10px">
          1. Open <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px">brave://flags</code><br>
          2. Search <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px">file-system-access-api</code><br>
          3. Set to <strong>Enabled</strong> and relaunch Brave<br>
          4. Refresh this page
        </div>
        <a href="https://github.com/Sadlyfizzx/Notion-Emoji-Changer/archive/refs/heads/main.zip" 
           target="_blank" style="color:#6366f1;font-weight:600">Or download zip manually →</a>
      `;
    } else {
      $('status').innerHTML = `
        <div style="margin-bottom:8px">Use Chrome or Edge on desktop for one-click updates.</div>
        <a href="https://github.com/Sadlyfizzx/Notion-Emoji-Changer/archive/refs/heads/main.zip" 
           target="_blank" style="color:#6366f1;font-weight:600">Download latest zip manually →</a>
      `;
    }
    $('status').className = 'status error';
    return;
  }

  const release = await fetchLatest();
  if (!release) {
    $('desc').textContent = 'Could not reach GitHub. Check your connection and retry.';
    $('btn-folder').classList.add('hidden');
    return;
  }

  latestTag = release.tag_name;
  latestVersion = extractVersion(latestTag);
  const currentVersion = extractVersion(CURRENT || '0.0.0');

  if (CURRENT && !isNewer(latestVersion, currentVersion)) {
    $('desc').textContent = `You are already on the latest version (${latestTag} → ${latestVersion}).`;
    $('btn-folder').classList.add('hidden');
    return;
  }

  $('desc').textContent = `Latest version: ${latestTag} (${latestVersion}). Select your extension folder to update.`;

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
    $('status').textContent = '';
  } catch (e) {
    console.error('[Updater] Folder selection failed:', e.name, e.message);
    let msg = 'Folder selection failed.';
    if (e.name === 'AbortError') {
      msg = 'You cancelled the picker. Click the button again and select your extension folder.';
    } else if (e.name === 'SecurityError') {
      msg = 'Permission blocked. Try resetting site permissions for sadlyfizzx.github.io in chrome://settings/content/all';
    } else if (e.name === 'NotAllowedError') {
      msg = 'Browser denied access. Make sure you are on HTTPS and not in an incognito window.';
    } else {
      msg = `Error (${e.name}): ${e.message}`;
    }
    $('status').textContent = msg;
    $('status').className = 'status error';
  }
}

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
