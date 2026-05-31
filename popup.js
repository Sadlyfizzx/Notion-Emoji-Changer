document.addEventListener('DOMContentLoaded', async () => {
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

  const defaults = { enabled: true, emojiStyle: 'apple' };
  const settings = await chrome.storage.sync.get(defaults);

  toggleEnabled.checked = settings.enabled;
  updateStyleGrid(settings.emojiStyle);
  updatePreview(settings.emojiStyle);
  updateDisabledState(settings.enabled);

  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked;
    await chrome.storage.sync.set({ enabled });
    updateDisabledState(enabled);
    // Content script tears down or re-initializes automatically via storage.onChanged
  });

  styleGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.style-card');
    if (!card) return;
    const style = card.dataset.style;
    await chrome.storage.sync.set({ emojiStyle: style });
    updateStyleGrid(style);
    updatePreview(style);
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

  function updatePreview(style) {
    previewEmoji.textContent = PREVIEW_EMOJIS[style] || '🚀';
    previewStyle.textContent = STYLE_NAMES[style] || style;
  }

  function updateDisabledState(enabled) {
    body.classList.toggle('disabled', !enabled);
    statusBadge.textContent = enabled ? 'Active' : 'Paused';
    statusBadge.classList.toggle('inactive', !enabled);
  }
});