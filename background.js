const REPO = 'Sadlyfizzx/Notion-Emoji-Changer';

/* ============================================================
   Lifecycle
   ============================================================ */
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('check-release', { periodInMinutes: 60 * 6 });
  checkForUpdate();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-release') checkForUpdate();
});

/* ============================================================
   Release Check
   ============================================================ */
async function checkForUpdate() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return;

    const release = await res.json();
    const latest = extractVersion(release.tag_name);
    const current = chrome.runtime.getManifest().version;

    if (isNewer(latest, current)) {
      await chrome.storage.sync.set({
        updateAvailable: true,
        latestVersion: latest,
        releaseUrl: release.html_url,
        releaseNotes: release.body?.slice(0, 500) || ''
      });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

      // Desktop notification
      chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'Icon.png',
        title: 'Notion Emoji Injector — Update Available',
        message: `v${latest} is ready. Click the extension icon to update.`,
        priority: 1
      });
    } else {
      await chrome.storage.sync.set({ updateAvailable: false });
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    console.warn('[Emoji Injector] Update check failed:', e);
  }
}

function extractVersion(str) {
  const match = str.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
  return match ? match[0] : str.replace(/^v/, '');
}

function isNewer(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const li = l[i] || 0, ci = c[i] || 0;
    if (li > ci) return true;
    if (li < ci) return false;
  }
  return false;
}

/* ============================================================
   Auto-refresh Notion tabs after update
   ============================================================ */
chrome.storage.local.get('justUpdated').then(({ justUpdated }) => {
  if (justUpdated) {
    chrome.storage.local.remove('justUpdated');
    chrome.tabs.query({ url: '*://app.notion.com/*' }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.reload(tab.id, { bypassCache: true }));
    });
  }
});

/* ============================================================
   Listen for reload command from updater page
   ============================================================ */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!sender.origin?.startsWith('https://sadlyfizzx.github.io')) return;
  if (msg.action === 'reload-extension') {
    chrome.storage.local.set({ justUpdated: true }).then(() => {
      sendResponse({ success: true });
      setTimeout(() => chrome.runtime.reload(), 300);
    });
    return true;
  }
});