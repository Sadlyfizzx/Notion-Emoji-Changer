(function () {
  'use strict';

  /* ============================================================
     Injected CSS (only injected when extension is enabled)
     ============================================================ */

  const INJECTOR_CSS = `
    /* Processed inline emojis: force background-image via custom property */
    img.notion-emoji[data-apple-emoji-v3][data-emoji-inline] {
        background-image: var(--emoji-url) !important;
        background-size: contain !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
    }
    /* Hide base sprite image when overlay is active */
    .notion-record-icon div[style*="position: relative"] > img.notion-emoji[data-apple-emoji-v3] {
        opacity: 0 !important;
        background: none !important;
        transition: none !important;
    }
    /* Size normalization */
    .notion-emoji {
        display: inline-block !important;
        vertical-align: -0.05em !important;
        width: 1.1em !important;
        height: 1.1em !important;
        background-size: contain !important;
        margin: 0 !important;
    }
    /* Page icon centering */
    div.notion-record-icon {
        justify-content: center !important;
        align-items: center !important;
    }
    /* Span-based styled emojis */
    span[data-apple-emoji-v3] {
        display: inline-block !important;
        vertical-align: -0.05em !important;
        height: 1.1em !important;
        background-repeat: no-repeat !important;
        margin: 0 !important;
    }
    /* Inline page icons alignment */
    .notion-record-icon[style*="display: inline-block"] {
        vertical-align: middle !important;
        margin-bottom: 0 !important;
        margin-top: 0 !important;
    }
    .notion-record-icon + span,
    .notion-record-icon + div,
    .notion-record-icon + * {
        display: inline !important;
    }
    [style*="display: inline"] .notion-record-icon,
    [style*="display: inline-block"] .notion-record-icon {
        vertical-align: middle !important;
    }
    /* Contenteditable: never interfere with cursor */
    [contenteditable="true"] img.notion-emoji {
        transition: none !important;
    }
    /* Custom uploaded emojis: untouched */
    img.notion-emoji[src*="notion-static.com"],
    img.notion-emoji[src*="amazonaws.com"] {
        opacity: 1 !important;
    }
    /* Selection highlight for transparent emoji text */
    span[data-apple-emoji-v3]::selection,
    div[data-apple-emoji-v3]::selection {
        color: transparent;
        background: rgba(99, 102, 241, 0.3);
    }
    /* No-flash: hide pending elements */
    [data-emoji-pending] {
        opacity: 0 !important;
        transition: none !important;
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
  const PENDING_MARK = 'data-emoji-pending';

  let settings = { enabled: true, emojiStyle: 'apple' };
  let debounceTimer = null;
  let lastFaviconEmoji = null;
  let initialized = false;
  let observer = null;

  /* ============================================================
     Utilities
     ============================================================ */

  function isEmoji(str) {
    if (/\p{Letter}/u.test(str)) return false;
    return /\p{Emoji}/u.test(str);
  }

  function extractEmojis(str) {
    const emojis = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      for (const seg of segmenter.segment(str)) {
        const s = seg.segment;
        if (/\p{Emoji}/u.test(s) && !(/^\d$/.test(s) && s.length === 1)) {
          emojis.push(s);
        }
      }
    } else {
      const matches = str.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu) || [];
      emojis.push(...matches.filter(c => !(/^\d$/.test(c) && c.length === 1)));
    }
    return emojis;
  }

  function getEmojiFromElement(el) {
    const dataEmoji = el.getAttribute('data-emoji');
    const ariaLabel = el.getAttribute('aria-label');
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
    if (el.tagName === 'IMG') {
      const inPageIcon = isPageIcon(el);
      const inPicker = isEmojiPicker(el);
      if (inPageIcon || inPicker) {
        return el.src === emojiUrl;
      } else {
        return el.style.backgroundImage.includes(emojiUrl);
      }
    } else {
      return el.style.backgroundImage.includes(emojiUrl);
    }
  }

  function isPageIcon(el) {
    return !!el.closest('.notion-record-icon');
  }

  function isEmojiPicker(el) {
    return !!el.closest('[role="dialog"]');
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

  function isCustomEmoji(el) {
    if (el.tagName !== 'IMG') return false;
    const src = el.src || '';
    return src.includes('notion-static.com') ||
           src.includes('amazonaws.com') ||
           src.includes('notion.so/images');
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

    if (!settings.enabled) {
      stopObservers();
      initialized = false;
      return;
    }

    if (!initialized) {
      init();
      return;
    }

    if (newSettings.emojiStyle !== undefined && newSettings.emojiStyle !== prevStyle) {
      lastFaviconEmoji = null;
      document.querySelectorAll(`[${PROCESSED_MARK}]`).forEach(el => {
        el.removeAttribute(PROCESSED_MARK);
        el.removeAttribute(PENDING_MARK);
        el.removeAttribute('data-emoji-inline');
        el.style.removeProperty('--emoji-url');
        el.style.removeProperty('background-image');
        el.style.removeProperty('background-size');
        el.style.removeProperty('background-position');
        el.style.removeProperty('background-repeat');
        if (el.dataset.originalSrc) {
          el.src = el.dataset.originalSrc;
          delete el.dataset.originalSrc;
        }
      });
      replaceAllNotionIcons();
    }
  }

  /* ============================================================
     Emoji Styling — with preload validation and no-flash
     ============================================================ */

  function applyEmojiStyle(el, emoji) {
    if (!settings.enabled) return;
    if (el.hasAttribute(PENDING_MARK)) return;
    if (el.hasAttribute(PROCESSED_MARK)) return;

    const emojiUrl = buildEmojiUrl(emoji);
    const inPageIcon = isPageIcon(el);
    const inPicker = isEmojiPicker(el);
    const tag = el.tagName;

    if (tag === 'IMG') {
      if (inPageIcon || inPicker) {
        // Page icons & picker: preload before setting src to avoid broken icons
        if (!el.dataset.originalSrc && el.src) {
          el.dataset.originalSrc = el.src;
        }
        el.setAttribute(PENDING_MARK, 'true');

        const preload = new Image();
        preload.onload = () => {
          if (!settings.enabled) return;
          el.setAttribute(PROCESSED_MARK, 'true');
          el.removeAttribute(PENDING_MARK);
          el.style.backgroundImage = '';
          el.style.backgroundSize = '';
          el.style.backgroundRepeat = '';
          el.style.backgroundPosition = '';
          el.src = emojiUrl;
          el.style.transition = 'opacity 100ms ease-in';
        };
        preload.onerror = () => {
          el.removeAttribute(PENDING_MARK);
          if (el.dataset.originalSrc) el.src = el.dataset.originalSrc;
        };
        preload.src = emojiUrl;
      } else {
        // Inline text emojis: preload background image
        el.setAttribute(PENDING_MARK, 'true');

        const preload = new Image();
        preload.onload = () => {
          if (!settings.enabled) return;
          el.setAttribute(PROCESSED_MARK, 'true');
          el.setAttribute('data-emoji-inline', 'true');
          el.removeAttribute(PENDING_MARK);
          el.style.setProperty('--emoji-url', `url('${emojiUrl}')`);
          el.style.backgroundImage = `url('${emojiUrl}')`;
          el.style.backgroundSize = 'contain';
          el.style.backgroundPosition = 'center';
          el.style.backgroundRepeat = 'no-repeat';
        };
        preload.onerror = () => {
          el.removeAttribute(PENDING_MARK);
        };
        preload.src = emojiUrl;
      }
    } else if (tag === 'DIV' || tag === 'SPAN') {
      const text = el.textContent.trim();

      const hasTextChildren = Array.from(el.children).some(child => {
        if (child.tagName === 'SPAN' || child.tagName === 'DIV') {
          const childText = child.textContent.trim();
          return childText && /\p{Letter}/u.test(childText);
        }
        if (child.tagName === 'SVG') return false;
        return false;
      });
      const ownText = el.childNodes.length > 0
        ? Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .join('')
        : '';
      const hasOwnLetterText = ownText && /\p{Letter}/u.test(ownText);

      if (hasTextChildren || hasOwnLetterText) {
        return;
      }

      const emojis = extractEmojis(text);
      if (emojis.length === 0) {
        return;
      }

      el.setAttribute(PENDING_MARK, 'true');

      const testImg = new Image();
      testImg.onload = () => {
        if (!settings.enabled) return;
        el.setAttribute(PROCESSED_MARK, 'true');
        el.removeAttribute(PENDING_MARK);

        if (emojis.length === 1) {
          el.style.backgroundImage = `url('${buildEmojiUrl(emojis[0])}')`;
          el.style.backgroundSize = '1.1em 1.1em';
          el.style.backgroundRepeat = 'no-repeat';
          el.style.backgroundPosition = 'center';
          el.style.width = '1.1em';
        } else {
          const urls = emojis.map(e => `url('${buildEmojiUrl(e)}')`).join(', ');
          const sizes = emojis.map(() => '1.1em 1.1em').join(', ');
          const positions = emojis.map((_, i) => `${(i * 1.1).toFixed(2)}em center`).join(', ');
          const repeats = emojis.map(() => 'no-repeat').join(', ');

          el.style.backgroundImage = urls;
          el.style.backgroundSize = sizes;
          el.style.backgroundPosition = positions;
          el.style.backgroundRepeat = repeats;
          el.style.width = `${(emojis.length * 1.1).toFixed(2)}em`;
        }

        el.style.height = '1.1em';
        el.style.display = 'inline-block';
        el.style.verticalAlign = '-0.05em';
        el.style.color = 'transparent';
        el.style.caretColor = 'transparent';
      };
      testImg.onerror = () => {
        el.removeAttribute(PENDING_MARK);
      };
      testImg.src = buildEmojiUrl(emojis[0]);
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
    if (!emoji || emoji === lastFaviconEmoji) return;

    const emojiUrl = buildEmojiUrl(emoji);
    const faviconLink = document.querySelector('link[rel="shortcut icon"], link[rel="icon"]');

    if (faviconLink && faviconLink.href !== emojiUrl) {
      faviconLink.href = emojiUrl;
      lastFaviconEmoji = emoji;
    }
  }

  function resetFaviconTracking() {
    lastFaviconEmoji = null;
  }

  /* ============================================================
     Main Replacement Logic
     ============================================================ */

  function replaceAllNotionIcons() {
    if (!settings.enabled) return;

    const emojiElements = [
      ...document.querySelectorAll('img.notion-emoji, div[data-emoji]'),
    ].filter(el => !isPageIconBaseImage(el) && !isCustomEmoji(el) && !el.hasAttribute(PENDING_MARK));

    // Page icon overlays
    document.querySelectorAll('.notion-record-icon div[style*="position: relative"]').forEach((div) => {
      const imgs = div.querySelectorAll('img');
      if (imgs.length >= 2 && imgs[0].classList.contains('notion-emoji')) {
        const base = imgs[0];
        const overlay = imgs[1];
        if (overlay && !overlay.hasAttribute(PENDING_MARK)) {
          const emoji = getEmojiFromElement(base);
          if (emoji && isEmoji(emoji)) {
            const emojiUrl = buildEmojiUrl(emoji);
            if (!isAlreadyStyled(overlay, emojiUrl)) {
              if (!overlay.dataset.originalSrc && overlay.src) {
                overlay.dataset.originalSrc = overlay.src;
              }
              overlay.setAttribute(PENDING_MARK, 'true');

              const preload = new Image();
              preload.onload = () => {
                if (!settings.enabled) return;
                overlay.setAttribute(PROCESSED_MARK, 'true');
                overlay.removeAttribute(PENDING_MARK);
                overlay.src = emojiUrl;
                overlay.style.display = '';
                overlay.style.opacity = '1';

                base.setAttribute(PROCESSED_MARK, 'true');
                base.style.background = 'none';
                base.style.opacity = '0';
              };
              preload.onerror = () => {
                overlay.removeAttribute(PENDING_MARK);
                if (overlay.dataset.originalSrc) overlay.src = overlay.dataset.originalSrc;
              };
              preload.src = emojiUrl;
            }
          }
        }
      }
    });

    // Skin-tone buttons & picker opener
    document.querySelectorAll('[role="dialog"] div[role="button"], [aria-haspopup="dialog"] div[role="button"]').forEach((div) => {
      const text = div.textContent.trim();
      if (!text || !isEmoji(text)) return;
      if (div.hasAttribute(PENDING_MARK)) return;

      const inPicker = isEmojiPicker(div);
      const isPickerOpener = div.getAttribute('aria-haspopup') === 'dialog';

      if (inPicker || isPickerOpener) {
        emojiElements.push(div);
      }
    });

    // Inline emoji spans — ONLY from newly added nodes in mutation handler
    // This full scan runs only on init and URL changes, not on every mutation

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
     Observers & Lifecycle — simplified, no safety interval
     ============================================================ */

  function startObservers() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let needsFullScan = false;
      let fastReapplyTargets = [];
      let newEmojiElements = [];

      for (const m of mutations) {
        if (m.type === 'attributes' && m.target.tagName === 'IMG' &&
            m.target.classList.contains('notion-emoji')) {
          const img = m.target;
          if (img.hasAttribute(PROCESSED_MARK)) {
            const emoji = getEmojiFromElement(img) || img.alt;
            if (emoji && isEmoji(emoji) && !isPageIcon(img) && !isEmojiPicker(img)) {
              const emojiUrl = buildEmojiUrl(emoji);
              if (!img.style.backgroundImage.includes(emojiUrl)) {
                fastReapplyTargets.push({ el: img, emoji, emojiUrl });
              }
            }
          } else if (m.attributeName === 'style' || m.attributeName === 'class') {
            needsFullScan = true;
          }
        } else if (m.type === 'childList') {
          let foundNew = false;
          for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            if (node.matches?.('img.notion-emoji') && !isPageIconBaseImage(node) && !isCustomEmoji(node)) {
              newEmojiElements.push(node);
              foundNew = true;
            }
            if (node.querySelectorAll) {
              const imgs = Array.from(node.querySelectorAll('img.notion-emoji')).filter(el => !isPageIconBaseImage(el) && !isCustomEmoji(el));
              const divs = Array.from(node.querySelectorAll('div[data-emoji]'));
              if (imgs.length || divs.length) foundNew = true;
              newEmojiElements.push(...imgs, ...divs);
            }
            if (node.matches?.('div[data-emoji]')) {
              newEmojiElements.push(node);
              foundNew = true;
            }
            // Spans only from added nodes, never full document
            if (node.matches?.('span')) {
              const text = node.textContent.trim();
              if (text && isEmoji(text) && !node.hasAttribute(PROCESSED_MARK) && !node.hasAttribute(PENDING_MARK) && !node.querySelector('img')) {
                const parent = node.parentElement;
                if (parent && (
                  parent.closest('[style*="display: inline-flex"]') ||
                  parent.closest('[style*="display: inline-block"]') ||
                  parent.closest('[style*="white-space: nowrap"]') ||
                  parent.closest('.notion-token')
                )) {
                  newEmojiElements.push(node);
                  foundNew = true;
                }
              }
            }
            if (node.querySelectorAll) {
              const spans = Array.from(node.querySelectorAll('span')).filter(span => {
                const text = span.textContent.trim();
                if (!text || !isEmoji(text)) return false;
                if (span.hasAttribute(PROCESSED_MARK) || span.hasAttribute(PENDING_MARK)) return false;
                if (span.querySelector('img')) return false;
                const parent = span.parentElement;
                return parent && (
                  parent.closest('[style*="display: inline-flex"]') ||
                  parent.closest('[style*="display: inline-block"]') ||
                  parent.closest('[style*="white-space: nowrap"]') ||
                  parent.closest('.notion-token')
                );
              });
              if (spans.length) foundNew = true;
              newEmojiElements.push(...spans);
            }
          }
          if (!foundNew) needsFullScan = true;
        } else {
          needsFullScan = true;
        }
      }

      fastReapplyTargets.forEach(({ el, emoji, emojiUrl }) => {
        el.style.setProperty('--emoji-url', `url('${emojiUrl}')`);
        el.style.backgroundImage = `url('${emojiUrl}')`;
        el.style.backgroundSize = 'contain';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
      });

      if (newEmojiElements.length > 0) {
        const targets = [...new Set(newEmojiElements)].filter(el => !isPageIconBaseImage(el) && !isCustomEmoji(el) && !el.hasAttribute(PENDING_MARK));
        targets.forEach((el) => {
          let emoji = getEmojiFromElement(el);
          if (!emoji) emoji = getEmojiFromTextContent(el);
          if (emoji && isEmoji(emoji)) {
            applyEmojiStyle(el, emoji);
          }
        });
        updateFavicon();
      }

      if (needsFullScan) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(replaceAllNotionIcons, 50);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'src']
    });
  }

  function stopObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function init() {
    if (!settings.enabled) return;
    if (!document.body) {
      setTimeout(init, 50);
      return;
    }
    if (initialized) return;
    initialized = true;

    injectCSS();
    replaceAllNotionIcons();
    startObservers();

    // URL change detection via popstate + history monkeypatch
    let lastUrl = location.href;
    const checkUrl = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        resetFaviconTracking();
        replaceAllNotionIcons();
      }
    };
    window.addEventListener('popstate', checkUrl);
    window.addEventListener('hashchange', checkUrl);
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      checkUrl();
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      checkUrl();
    };

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
          debounceTimer = setTimeout(updateFavicon, 50);
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
      console.warn('[Emoji Injector] Storage unavailable, using defaults:', e);
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    const updates = {};
    if (changes.enabled) updates.enabled = changes.enabled.newValue;
    if (changes.emojiStyle) updates.emojiStyle = changes.emojiStyle.newValue;
    if (Object.keys(updates).length > 0) {
      applySettings(updates);
    }
  });

  loadSettings().then(() => init());
})();