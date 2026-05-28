document.addEventListener('DOMContentLoaded', async () => {
  // DOM refs
  const toggleEnabled = document.getElementById('toggle-enabled');
  const styleGrid = document.getElementById('style-grid');
  const statusBadge = document.getElementById('status-badge');
  const previewEmoji = document.getElementById('preview-emoji');
  const previewStyle = document.getElementById('preview-style');
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

  // Load saved settings
  const defaults = { enabled: true, emojiStyle: 'apple' };
  const settings = await chrome.storage.sync.get(defaults);

  // Apply loaded settings to UI
  toggleEnabled.checked = settings.enabled;
  updateStyleGrid(settings.emojiStyle);
  updatePreview(settings.emojiStyle);
  updateDisabledState(settings.enabled);

  // ── Event: Master Toggle ──
  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked;
    await chrome.storage.sync.set({ enabled });

    if (!enabled) {
      // Disable: refresh the active Notion tab so native emojis restore cleanly.
      // Do NOT try to gracefully revert DOM mutations — they corrupt.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.includes('app.notion.com')) {
          chrome.tabs.reload(tab.id);
        }
      });
    } else {
      // Enable: notify content scripts on all Notion tabs to start injecting
      notifyContentScript({ type: 'TOGGLE_ENABLED', enabled });
    }

    updateDisabledState(enabled);
  });

  // ── Event: Style Selection ──
  styleGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.style-card');
    if (!card) return;

    const style = card.dataset.style;
    await chrome.storage.sync.set({ emojiStyle: style });

    updateStyleGrid(style);
    updatePreview(style);
    notifyContentScript({ type: 'CHANGE_STYLE', emojiStyle: style });
  });

  // ── Event: Donate ──
  donateButton.addEventListener('click', () => {
    donateButton.disabled = true;
    donateButton.innerHTML = '<span>☕</span> Opening...';
    chrome.tabs.create({ url: 'https://ko-fi.com/sadlyfizzx' });
    setTimeout(() => {
      donateButton.disabled = false;
      donateButton.innerHTML = '<span>☕</span> Support the project';
    }, 1500);
  });

  // ── Helpers ──

  function updateStyleGrid(activeStyle) {
    styleGrid.querySelectorAll('.style-card').forEach(card => {
      card.classList.toggle('active', card.dataset.style === activeStyle);
    });
  }

  function updatePreview(style) {
    previewEmoji.textContent = PREVIEW_EMOJIS[style] || '🚀';
    previewStyle.textContent = STYLE_NAMES[style] || style;
  }

  function updateDisabledState(enabled) {
    body.classList.toggle('disabled', !enabled);
    statusBadge.textContent = enabled ? 'Active' : 'Paused';
    statusBadge.classList.toggle('inactive', !enabled);
  }

  function notifyContentScript(message) {
    chrome.tabs.query({ url: '*://app.notion.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab may not have content script loaded yet — ignore
        });
      });
    });
  }
});