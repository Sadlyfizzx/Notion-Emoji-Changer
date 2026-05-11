(function () {
  'use strict';

  /* ============================================================
     Injected CSS (moved from manifest to avoid leaking when disabled)
     ============================================================ */

  const INJECTOR_CSS = `
    img.notion-emoji,
    div[data-emoji] {
        opacity: 0 !important;
        transition: opacity 50ms ease-in;
    }
    img.notion-emoji[data-apple-emoji-v3],
    div[data-emoji][data-apple-emoji-v3] {
        opacity: 1 !important;
    }
    .notion-record-icon div[style*="position: relative"] > img.notion-emoji[data-apple-emoji-v3] {
        opacity: 0 !important;
    }
    .notion-emoji {
        display: inline-block !important;
        vertical-align: -0.05em !important;
        width: 1.1em !important;
        height: 1.1em !important;
        background-size: contain !important;
        margin: 0 !important;
    }
    div.notion-record-icon {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
    }
  `;

  let cssInjected = false;

  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement('style');
    style.textContent = INJECTOR_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ============================================================
     Settings & State
     ============================================================ */

  const PROCESSED_MARK = 'data-apple-emoji-v3';
  const RETRY_ATTR = 'data-emoji-retry-count';
  const MAX_RETRIES = 3;
  const DEBOUNCE_MS = 100;

  let settings = { enabled: true, emojiStyle: 'apple' };
  let debounceTimer = null;
  let lastFaviconEmoji = null;
  let idleCallbackId = null;

  /* ============================================================
     Utilities
     ============================================================ */

  function isEmoji(str) {
    return /\p{Emoji}/u.test(str);
  }

  function getEmojiFromElement(el) {
    const dataEmoji = el.getAttribute("data-emoji");
    const ariaLabel = el.getAttribute("aria-label");
    const alt = el.alt;
    let emoji = dataEmoji || ariaLabel;
    if (!emoji && alt) emoji = alt.split(/\s/)[0];
    return emoji;
  }

  function getEmojiFromTextContent(el) {
    const text = el.textContent.trim();
    if (text && isEmoji(text)) return text;
    return null;
  }

  function isAlreadyStyled(el, emojiUrl) {
    if (!el.hasAttribute(PROCESSED_MARK)) return false;
    if (el.tagName === "IMG") {
      return el.src === emojiUrl;
    } else {
      return el.style.backgroundImage.includes(emojiUrl);
    }
  }

  function isPageIcon(el) {
    return !!el.closest('.notion-record-icon');
  }

  function isEmojiPicker(el) {
    return !!el.closest('[role="dialog"]') || !!el.closest('.notion-emoji-picker');
  }

  function isPageIconBaseImage(el) {
    if (el.tagName !== 'IMG' || !el.classList.contains('notion-emoji')) return false;
    const parent = el.parentElement;
    if (!parent) return false;
    const parentStyle = parent.getAttribute('style') || '';
    if (!parentStyle.includes('position: relative')) return false;
    const siblingImgs = Array.from(parent.children).filter(c => c.tagName === 'IMG');
    return siblingImgs.length >= 2 && siblingImgs[0] === el;
  }

  function buildEmojiUrl(emoji) {
    return `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=${settings.emojiStyle}`;
  }

  /* ============================================================
     Settings Application
     ============================================================ */

  function applySettings(newSettings) {
    const prevStyle = settings.emojiStyle;
    settings = { ...settings, ...newSettings };

    if (!settings.enabled) return;

    // If style changed, clear favicon cache so the tab icon updates too
    if (newSettings.emojiStyle !== undefined && newSettings.emojiStyle !== prevStyle) {
      lastFaviconEmoji = null;
      // Also clear processed marks so every emoji re-fetches with the new style
      document.querySelectorAll(`[${PROCESSED_MARK}]`).forEach(el => {
        el.removeAttribute(PROCESSED_MARK);
        el.removeAttribute(RETRY_ATTR);
      });
    }

    replaceAllNotionIcons();
  }

  /* ============================================================
     Emoji Styling
     ============================================================ */

  function applyEmojiStyle(el, emoji) {
    if (!settings.enabled) return;

    const emojiUrl = buildEmojiUrl(emoji);
    if (isAlreadyStyled(el, emojiUrl)) return;

    el.setAttribute(PROCESSED_MARK, 'true');
    const inPageIcon = isPageIcon(el);
    const inPicker = isEmojiPicker(el);

    if (el.tagName === "IMG") {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundRepeat = '';
      el.style.backgroundPosition = '';

      el.onerror = () => {
        const currentRetries = parseInt(el.getAttribute(RETRY_ATTR) || '0', 10);
        if (currentRetries < MAX_RETRIES) {
          el.setAttribute(RETRY_ATTR, String(currentRetries + 1));
          setTimeout(() => (el.src = emojiUrl), 1000 * (currentRetries + 1));
        }
      };
      el.src = emojiUrl;
      el.style.transition = "opacity 100ms ease-in";

      if (!inPageIcon && !inPicker) {
        const computedWidth = parseFloat(getComputedStyle(el).width) || 0;
        if (computedWidth <= 20) {
          el.style.width = "1em";
          el.style.height = "1em";
        }
      }
    } else {
      el.style.backgroundImage = `url('${emojiUrl}')`;
      el.style.backgroundSize = "1em 1em";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
      el.style.color = "transparent";
      el.style.caretColor = "transparent";
    }
  }

  /* ============================================================
     Favicon
     ============================================================ */

  function getCurrentPageEmoji() {
    const icons = document.querySelectorAll('.notion-record-icon[aria-label]');
    let bestEmoji = null;
    let bestSize = 0;

    icons.forEach((icon) => {
      const label = icon.getAttribute('aria-label');
      if (!label || !label.includes('Change page icon')) return;

      const emoji = label.replace(/\s*Change page icon\s*$/i, '');
      if (!isEmoji(emoji)) return;

      const style = icon.getAttribute('style') || '';
      const widthMatch = style.match(/width:\s*(\d+(?:\.\d+)?)px/);
      const heightMatch = style.match(/height:\s*(\d+(?:\.\d+)?)px/);

      let size = 0;
      if (widthMatch && heightMatch) {
        size = parseFloat(widthMatch[1]) * parseFloat(heightMatch[1]);
      } else {
        const rect = icon.getBoundingClientRect();
        size = rect.width * rect.height;
      }

      if (size > bestSize) {
        bestSize = size;
        bestEmoji = emoji;
      }
    });

    return bestEmoji;
  }

  function updateFavicon() {
    if (!settings.enabled) return;

    const emoji = getCurrentPageEmoji();
    if (!emoji) return;
    if (emoji === lastFaviconEmoji) return;

    const emojiUrl = buildEmojiUrl(emoji);
    const faviconLink = document.querySelector('link[rel="shortcut icon"]');

    if (faviconLink && faviconLink.href !== emojiUrl) {
      faviconLink.href = emojiUrl;
      lastFaviconEmoji = emoji;
    }
  }

  /* ============================================================
     Main Replacement Logic
     ============================================================ */

  function replaceAllNotionIcons() {
    if (!settings.enabled) return;

    const emojiElements = [
      ...document.querySelectorAll(
        "img.notion-emoji, div[data-emoji], img[aria-label], .property-check img[aria-label]"
      ),
    ].filter(el => !isPageIconBaseImage(el));

    // Page icon overlays
    document.querySelectorAll('.notion-record-icon div[style*="position: relative"]').forEach((div) => {
      const imgs = div.querySelectorAll("img");
      if (imgs.length >= 2 && imgs[0].classList.contains("notion-emoji")) {
        const overlay = imgs[1];
        if (overlay) {
          const emoji = getEmojiFromElement(imgs[0]);
          if (emoji && isEmoji(emoji)) {
            const emojiUrl = buildEmojiUrl(emoji);
            if (!isAlreadyStyled(overlay, emojiUrl)) {
              overlay.setAttribute(PROCESSED_MARK, 'true');
              overlay.src = emojiUrl;
              overlay.style.display = '';
              overlay.style.opacity = '1';
            }
          }
        }
      }
    });

    // Skin-tone buttons & picker opener
    document.querySelectorAll('div[role="button"]').forEach((div) => {
      const text = div.textContent.trim();
      if (!text || !isEmoji(text)) return;

      const inPicker = isEmojiPicker(div);
      const isPickerOpener = div.getAttribute('aria-haspopup') === 'dialog';

      if (inPicker || isPickerOpener) {
        emojiElements.push(div);
      }
    });

    const uniqueElements = [...new Set(emojiElements)];

    uniqueElements.forEach((el) => {
      let emoji = getEmojiFromElement(el);
      if (!emoji) emoji = getEmojiFromTextContent(el);
      if (emoji && isEmoji(emoji)) {
        applyEmojiStyle(el, emoji);
      }
    });

    updateFavicon();
  }

  /* ============================================================
     Observers & Lifecycle
     ============================================================ */

  function scheduleSafetyNet() {
    if (idleCallbackId) return;
    const cb = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : requestAnimationFrame;
    idleCallbackId = cb(() => {
      idleCallbackId = null;
      replaceAllNotionIcons();
      scheduleSafetyNet();
    }, { timeout: 2000 });
  }

  function init() {
    if (!settings.enabled) {
      // Disabled: do not inject CSS, do not observe, do not process.
      // The popup has already refreshed the page, so native Notion
      // renders normally without any extension interference.
      return;
    }

    // Inject hiding CSS immediately to prevent FOUC
    injectCSS();

    replaceAllNotionIcons();

    if (!document.body) {
      setTimeout(init, 50);
      return;
    }

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(replaceAllNotionIcons, DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
      characterData: true
    });

    scheduleSafetyNet();

    if (document.head) {
      const headObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE &&
                  node.tagName === 'LINK' &&
                  node.rel &&
                  node.rel.includes('icon')) {
                shouldUpdate = true;
              }
            }
          } else if (m.type === 'attributes') {
            const target = m.target;
            if (target.tagName === 'LINK' &&
                target.rel &&
                target.rel.includes('icon')) {
              shouldUpdate = true;
            }
          }
        }
        if (shouldUpdate) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(replaceAllNotionIcons, DEBOUNCE_MS);
        }
      });
      headObserver.observe(document.head, { childList: true, subtree: true, attributes: true });
    }
  }

  /* ============================================================
     Settings Sync
     ============================================================ */

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get({
        enabled: true,
        emojiStyle: 'apple'
      });
      settings = { ...settings, ...stored };
    } catch (e) {
      // storage unavailable — run with defaults
    }
  }

  // Listen for direct messages from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_ENABLED') {
      applySettings({ enabled: message.enabled });
      if (message.enabled && !cssInjected) {
        // If enabled while already loaded but CSS not injected yet
        init();
      }
    } else if (message.type === 'CHANGE_STYLE') {
      applySettings({ emojiStyle: message.emojiStyle });
    }
  });

  // Also listen for storage changes (backup sync mechanism)
  chrome.storage.onChanged.addListener((changes) => {
    const updates = {};
    if (changes.enabled) updates.enabled = changes.enabled.newValue;
    if (changes.emojiStyle) updates.emojiStyle = changes.emojiStyle.newValue;
    if (Object.keys(updates).length > 0) {
      applySettings(updates);
    }
  });

  // Bootstrap
  loadSettings().then(() => init());
})();