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

  const PREVIEW_EMOJIS = {
    apple: '🍎',
    google: '🍏',
    twitter: '🐦',
    facebook: '👍'
  };

  /* ============================================================
     Dynamic version from manifest
     ============================================================ */
  document.getElementById('version-display').textContent =
    'v' + chrome.runtime.getManifest().version;

  const defaults = { enabled: true, emojiStyle: 'apple' };
  const settings = await chrome.storage.sync.get(defaults);

  toggleEnabled.checked = settings.enabled;
  updateStyleGrid(settings.emojiStyle);
  updateDisabledState(settings.enabled);

  /* ============================================================
     Update Banner
     ============================================================ */
  const updateBanner = document.getElementById('update-banner');
  const updateVersion = document.getElementById('update-version');
  const updateBtn = document.getElementById('update-btn');
  const dismissUpdate = document.getElementById('dismiss-update');

  async function renderUpdateBanner() {
    const stored = await chrome.storage.sync.get([
      'updateAvailable',
      'latestVersion'
    ]);
    if (stored.updateAvailable) {
      updateBanner.classList.remove('hidden');
      updateVersion.textContent = `v${stored.latestVersion}`;
    }
  }

  updateBtn.addEventListener('click', () => {
    const extId = chrome.runtime.id;
    const current = chrome.runtime.getManifest().version;
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
     Safe storage writes with error handling + debounce
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
});