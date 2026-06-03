document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const styleGrid = document.getElementById('style-grid');
  const statusBadge = document.getElementById('status-badge');
  const donateButton = document.getElementById('donate-button');
  const body = document.body;

  const STYLE_NAMES = {
    apple: 'Apple',
    google: 'Google',
    twitter: 'Twitter',
    facebook: 'Facebook'
  };

  /* ============================================================
     Dynamic version from manifest
     ============================================================ */
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version-display').textContent = 'v' + manifest.version;

  const defaults = { enabled: true, emojiStyle: 'apple' };
  const settings = await chrome.storage.sync.get(defaults);

  toggleEnabled.checked = settings.enabled;
  updateStyleGrid(settings.emojiStyle);
  updateDisabledState(settings.enabled);

  /* ============================================================
     "What's New" Toast
     ============================================================ */
  const { lastSeenVersion } = await chrome.storage.sync.get('lastSeenVersion');
  if (lastSeenVersion && lastSeenVersion !== manifest.version) {
    showToast(`Updated to v${manifest.version}`);
  }
  await chrome.storage.sync.set({ lastSeenVersion: manifest.version });

  /* ============================================================
     Update Banner
     ============================================================ */
  const updateBanner = document.getElementById('update-banner');
  const updateVersion = document.getElementById('update-version');
  const updateBtn = document.getElementById('update-btn');
  const dismissUpdate = document.getElementById('dismiss-update');
  const updateNotes = document.getElementById('update-notes');

  async function renderUpdateBanner() {
    const stored = await chrome.storage.sync.get([
      'updateAvailable',
      'latestVersion',
      'releaseNotes'
    ]);
    if (stored.updateAvailable) {
      updateBanner.classList.remove('hidden');
      updateVersion.textContent = `v${stored.latestVersion}`;

      if (stored.releaseNotes) {
        updateNotes.textContent = cleanNotes(stored.releaseNotes);
        updateNotes.classList.remove('hidden');
      }
    }
  }

  function cleanNotes(md) {
    if (!md) return '';
    return md
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*`]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  updateBtn.addEventListener('click', () => {
    const extId = chrome.runtime.id;
    const current = manifest.version;
    const url = `https://sadlyfizzx.github.io/Notion-Emoji-Changer/updater.html?id=${extId}&current=${current}`;
    chrome.tabs.create({ url });
  });

  dismissUpdate.addEventListener('click', async () => {
    updateBanner.classList.add('hidden');
    await chrome.storage.sync.set({ updateAvailable: false });
    chrome.action.setBadgeText({ text: '' });
  });

  renderUpdateBanner();

  /* ============================================================
     Brave hint for auto-updates
     ============================================================ */
  if (navigator.brave?.isBrave?.() && !settings.braveFlagHintDismissed) {
    const braveHint = document.createElement('div');
    braveHint.className = 'brave-hint';
    braveHint.innerHTML = `
      <span>⚡ For one-click updates, enable <code>file-system-access-api</code> in <code>brave://flags</code></span>
      <button id="dismiss-brave">✕</button>
    `;
    document.querySelector('.popup-container').insertBefore(braveHint, document.querySelector('.header'));
    document.getElementById('dismiss-brave').addEventListener('click', async () => {
      braveHint.remove();
      await chrome.storage.sync.set({ braveFlagHintDismissed: true });
    });
  }

  /* ============================================================
     Safe storage writes
     ============================================================ */
  async function safeStorageSet(data) {
    try {
      await chrome.storage.sync.set(data);
    } catch (e) {
      console.warn('[Emoji Injector] Storage write failed:', e);
      const originalText = statusBadge.textContent;
      const originalClass = statusBadge.className;
      statusBadge.textContent = 'Error';
      statusBadge.className = 'badge inactive';
      setTimeout(() => {
        statusBadge.textContent = originalText;
        statusBadge.className = originalClass;
      }, 1500);
    }
  }

  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked;
    await safeStorageSet({ enabled });
    updateDisabledState(enabled);
  });

  let styleDebounceTimer = null;
  styleGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.style-card');
    if (!card) return;
    const style = card.dataset.style;

    updateStyleGrid(style);

    clearTimeout(styleDebounceTimer);
    styleDebounceTimer = setTimeout(() => {
      safeStorageSet({ emojiStyle: style });
    }, 250);
  });

  donateButton.addEventListener('click', () => {
    donateButton.disabled = true;
    donateButton.innerHTML = '<span>☕</span> Opening...';
    chrome.tabs.create({ url: 'https://ko-fi.com/sadlyfizzx' });
    setTimeout(() => {
      donateButton.disabled = false;
      donateButton.innerHTML = '<span>☕</span> Support the project';
    }, 1500);
  });

  function updateStyleGrid(activeStyle) {
    styleGrid.querySelectorAll('.style-card').forEach(card => {
      card.classList.toggle('active', card.dataset.style === activeStyle);
    });
  }

  function updateDisabledState(enabled) {
    body.classList.toggle('disabled', !enabled);
    statusBadge.textContent = enabled ? 'Active' : 'Paused';
    statusBadge.classList.toggle('inactive', !enabled);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});