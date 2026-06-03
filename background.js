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
   Core Check
   ============================================================ */
async function checkForUpdate() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return;

    const release = await res.json();
    const latest = release.tag_name.replace(/^v/, '');
    const current = chrome.runtime.getManifest().version;

    if (isNewer(latest, current)) {
      await chrome.storage.sync.set({
        updateAvailable: true,
        latestVersion: latest,
        releaseUrl: release.html_url
      });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      await chrome.storage.sync.set({ updateAvailable: false });
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    console.warn('[Emoji Injector] Update check failed:', e);
  }
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
   Listen for reload command from updater page
   ============================================================ */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!sender.origin?.startsWith('https://sadlyfizzx.github.io')) return;
  if (msg.action === 'reload-extension') {
    sendResponse({ success: true });
    setTimeout(() => chrome.runtime.reload(), 300);
  }
});