(function () {
  'use strict';

  /* ============================================================
     Injected CSS (only injected when extension is enabled)
     FIX-3: Renamed data-apple-emoji-v3 → data-emoji-injected throughout CSS
     ============================================================ */

  const INJECTOR_CSS = `
    /* Processed inline emojis: force background-image via custom property */
    img.notion-emoji[data-emoji-injected][data-emoji-inline] {
        background-image: var(--emoji-url) !important;
        background-size: contain !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
    }
    /* Hide base sprite image when overlay is active */
    .notion-record-icon div[style*="position: relative"] > img.notion-emoji[data-emoji-injected] {
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
    span[data-emoji-injected] {
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
    span[data-emoji-injected]::selection,
    div[data-emoji-injected]::selection {
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
  let injectedStyleEl = null;

  /* ============================================================
     FIX-1: Synchronous early-hide CSS injected at module load.
     This runs before loadSettings() or init(), guaranteeing that
     every img.notion-emoji starts hidden from its first paint.
     ============================================================ */
  (function injectEarlyHide() {
    const style = document.createElement('style');
    style.id = 'emoji-injector-early-hide';
    style.textContent = `
      img.notion-emoji:not([src*="notion-static.com"]):not([src*="amazonaws.com"]):not([src*="notion.so/images"]) {
        opacity: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    // Safety: if the extension fails silently, restore visibility after 4s
    setTimeout(() => style.remove(), 4000);
  })();

  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    // Remove blanket hide — full CSS with [data-emoji-pending] takes over
    document.getElementById('emoji-injector-early-hide')?.remove();

    injectedStyleEl = document.createElement('style');
    injectedStyleEl.textContent = INJECTOR_CSS;
    (document.head || document.documentElement).appendChild(injectedStyleEl);
  }

  function removeCSS() {
    document.getElementById('emoji-injector-early-hide')?.remove();
    if (injectedStyleEl) {
      injectedStyleEl.remove();
      injectedStyleEl = null;
    }
    cssInjected = false;
  }

  /* ============================================================
     Settings & State
     FIX-3: Renamed PROCESSED_MARK to data-emoji-injected (matches README)
     FIX-7: historyPatched flag added to module scope
     FIX-BONUS: separate debounce timers for body vs head observers
     ============================================================ */

  // FIX-3: renamed from 'data-apple-emoji-v3' — matches README's stated attribute name
  const PROCESSED_MARK = 'data-emoji-injected';
  const PENDING_MARK   = 'data-emoji-pending';

  let settings       = { enabled: true, emojiStyle: 'apple' };
  let debounceTimer  = null;   // body observer debounce
  let faviconTimer   = null;   // FIX-BONUS: separate timer for head observer
  let lastFaviconEmoji = null;
  let initialized    = false;
  let observer       = null;
  let headObserver   = null;   // FIX: stored in module scope for cleanup

  // FIX-1: settingsReady guards storage.onChanged from racing with loadSettings()
  let settingsReady  = false;

  // FIX-7: historyPatched prevents stacking monkeypatches on repeated init() calls
  let historyPatched = false;

  /* ============================================================
     Preload Queue
     FIX (README claim): implements the documented concurrency cap + 5s timeout
     ============================================================ */

  const MAX_CONCURRENT = 6;
  let activePreloads = 0;
  const preloadQueue = [];

  function drainQueue() {
    while (activePreloads < MAX_CONCURRENT && preloadQueue.length > 0) {
      const { url, onLoad, onError } = preloadQueue.shift();
      activePreloads++;

      const img = new Image();
      let fired = false; // FIX: guards against double-fire (timeout then onerror)

      const finish = (cb) => {
        if (fired) return;
        fired = true;
        clearTimeout(timer);
        activePreloads--;
        drainQueue();
        cb();
      };

      // 5-second timeout per preload; setting src='' can trigger onerror
      // synchronously in some browsers — the `fired` flag prevents double-decrement
      const timer = setTimeout(() => {
        img.src = '';
        finish(onError);
      }, 5000);

      img.onload  = () => finish(onLoad);
      img.onerror = () => finish(onError);
      img.src = url;
    }
  }

  function queuePreload(url, onLoad, onError) {
    preloadQueue.push({ url, onLoad, onError });
    drainQueue();
  }

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
      const inPicker   = isEmojiPicker(el);
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

  /* ============================================================
     FIX-8: isPageIconOverlay distinguishes real page icons (base+overlay
     pair with position: relative parent) from database entry icons
     (single img inside .notion-record-icon without position: relative).
     ============================================================ */
  function isPageIconOverlay(el) {
    if (el.tagName !== 'IMG' || !el.classList.contains('notion-emoji')) return false;
    const parent = el.parentElement;
    if (!parent) return false;
    const parentStyle = parent.getAttribute('style') || '';
    if (!parentStyle.includes('position: relative')) return false;
    const siblingImgs = Array.from(parent.children).filter(c => c.tagName === 'IMG');
    return siblingImgs.length >= 2 && siblingImgs[1] === el;
  }

  function isCustomEmoji(el) {
    if (el.tagName !== 'IMG') return false;
    const src = el.src || '';
    return src.includes('notion-static.com') ||
           src.includes('amazonaws.com')     ||
           src.includes('notion.so/images');
  }

  function buildEmojiUrl(emoji) {
    return `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=${settings.emojiStyle}`;
  }

  /* ============================================================
     FIX-6: CDN fallback URL builder (jsDelivr emoji-datasource)
     Codepoints joined by '-', lowercase hex, per emoji-datasource convention
     ============================================================ */
  function buildFallbackUrl(emoji) {
    const codepoint = [...emoji]
      .map(c => c.codePointAt(0).toString(16).toLowerCase())
      .join('-');
    return `https://cdn.jsdelivr.net/npm/emoji-datasource-${settings.emojiStyle}/img/${settings.emojiStyle}/64/${codepoint}.png`;
  }

  /* ============================================================
     Settings Application
     ============================================================ */

  function applySettings(newSettings) {
    const prevEnabled = settings.enabled;
    const prevStyle = settings.emojiStyle;
    settings = { ...settings, ...newSettings };

    if (!settings.enabled) {
      stopObservers();
      initialized = false;
      removeCSS();
      if (prevEnabled) {
        window.location.reload();
      }
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
     Emoji Styling — preload via queue, CDN fallback, no-flash
     FIX-6: onerror now attempts jsDelivr fallback before giving up
     ============================================================ */

  function applyEmojiStyle(el, emoji) {
    if (!settings.enabled) return;
    if (el.hasAttribute(PENDING_MARK)) return;
    if (el.hasAttribute(PROCESSED_MARK)) return;

    const emojiUrl    = buildEmojiUrl(emoji);
    const fallbackUrl = buildFallbackUrl(emoji);
    const inPageIcon  = isPageIcon(el);
    const inPicker    = isEmojiPicker(el);
    const tag         = el.tagName;

    if (tag === 'IMG') {
      if (inPageIcon || inPicker) {
        // Page icons & picker: preload before setting src to avoid broken icons
        if (!el.dataset.originalSrc && el.src) {
          el.dataset.originalSrc = el.src;
        }
        el.setAttribute(PENDING_MARK, 'true');

        const applyUrl = (url) => {
          if (!settings.enabled) return;
          el.setAttribute(PROCESSED_MARK, 'true');
          el.removeAttribute(PENDING_MARK);
          el.style.backgroundImage = '';
          el.style.backgroundSize  = '';
          el.style.backgroundRepeat = '';
          el.style.backgroundPosition = '';
          el.src = url;
          el.style.transition = 'opacity 100ms ease-in';
        };

        queuePreload(
          emojiUrl,
          () => applyUrl(emojiUrl),
          () => {
            // FIX-6: primary CDN failed — try jsDelivr fallback
            queuePreload(
              fallbackUrl,
              () => applyUrl(fallbackUrl),
              () => {
                // Both CDNs failed — restore original
                el.removeAttribute(PENDING_MARK);
                if (el.dataset.originalSrc) el.src = el.dataset.originalSrc;
              }
            );
          }
        );

      } else {
        // Inline text emojis: use background-image
        el.setAttribute(PENDING_MARK, 'true');

        const applyUrl = (url) => {
          if (!settings.enabled) return;
          el.setAttribute(PROCESSED_MARK, 'true');
          el.setAttribute('data-emoji-inline', 'true');
          el.removeAttribute(PENDING_MARK);
          el.style.setProperty('--emoji-url', `url('${url}')`);
          el.style.backgroundImage  = `url('${url}')`;
          el.style.backgroundSize   = 'contain';
          el.style.backgroundPosition = 'center';
          el.style.backgroundRepeat = 'no-repeat';
        };

        queuePreload(
          emojiUrl,
          () => applyUrl(emojiUrl),
          () => {
            queuePreload(
              fallbackUrl,
              () => applyUrl(fallbackUrl),
              () => { el.removeAttribute(PENDING_MARK); }
            );
          }
        );
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

      if (hasTextChildren || hasOwnLetterText) return;

      const emojis = extractEmojis(text);
      if (emojis.length === 0) return;

      el.setAttribute(PENDING_MARK, 'true');

      const applyStyles = () => {
        if (!settings.enabled) return;
        el.setAttribute(PROCESSED_MARK, 'true');
        el.removeAttribute(PENDING_MARK);

        if (emojis.length === 1) {
          el.style.backgroundImage    = `url('${buildEmojiUrl(emojis[0])}')`;
          el.style.backgroundSize     = '1.1em 1.1em';
          el.style.backgroundRepeat   = 'no-repeat';
          el.style.backgroundPosition = 'center';
          el.style.width              = '1.1em';
        } else {
          // Multi-emoji: tile side-by-side with layered backgrounds
          // position[i] = i * 1.1em (left-edge of each 1.1em slot) ✓
          const urls      = emojis.map(e => `url('${buildEmojiUrl(e)}')`).join(', ');
          const sizes     = emojis.map(() => '1.1em 1.1em').join(', ');
          const positions = emojis.map((_, i) => `${(i * 1.1).toFixed(2)}em center`).join(', ');
          const repeats   = emojis.map(() => 'no-repeat').join(', ');

          el.style.backgroundImage    = urls;
          el.style.backgroundSize     = sizes;
          el.style.backgroundPosition = positions;
          el.style.backgroundRepeat   = repeats;
          el.style.width              = `${(emojis.length * 1.1).toFixed(2)}em`;
        }

        el.style.height        = '1.1em';
        el.style.display       = 'inline-block';
        el.style.verticalAlign = '-0.05em';
        el.style.color         = 'transparent';
        el.style.caretColor    = 'transparent';
      };

      // FIX-6: test only the first emoji's availability; fallback for the set
      queuePreload(
        buildEmojiUrl(emojis[0]),
        () => applyStyles(),
        () => {
          queuePreload(
            buildFallbackUrl(emojis[0]),
            () => {
              // Fallback available — rebuild all URLs against fallback CDN
              // (swap buildEmojiUrl → buildFallbackUrl for this element's render)
              if (!settings.enabled) return;
              el.setAttribute(PROCESSED_MARK, 'true');
              el.removeAttribute(PENDING_MARK);

              if (emojis.length === 1) {
                el.style.backgroundImage    = `url('${buildFallbackUrl(emojis[0])}')`;
                el.style.backgroundSize     = '1.1em 1.1em';
                el.style.backgroundRepeat   = 'no-repeat';
                el.style.backgroundPosition = 'center';
                el.style.width              = '1.1em';
              } else {
                const urls      = emojis.map(e => `url('${buildFallbackUrl(e)}')`).join(', ');
                const sizes     = emojis.map(() => '1.1em 1.1em').join(', ');
                const positions = emojis.map((_, i) => `${(i * 1.1).toFixed(2)}em center`).join(', ');
                const repeats   = emojis.map(() => 'no-repeat').join(', ');

                el.style.backgroundImage    = urls;
                el.style.backgroundSize     = sizes;
                el.style.backgroundPosition = positions;
                el.style.backgroundRepeat   = repeats;
                el.style.width              = `${(emojis.length * 1.1).toFixed(2)}em`;
              }
              el.style.height        = '1.1em';
              el.style.display       = 'inline-block';
              el.style.verticalAlign = '-0.05em';
              el.style.color         = 'transparent';
              el.style.caretColor    = 'transparent';
            },
            () => { el.removeAttribute(PENDING_MARK); }
          );
        }
      );
    }
  }

  /* ============================================================
     Favicon
     ============================================================ */

  function getCurrentPageEmoji() {
    const icons = document.querySelectorAll('.notion-record-icon[aria-label]');
    let bestEmoji = null;
    let bestSize  = 0;

    icons.forEach((icon) => {
      const label = icon.getAttribute('aria-label');
      if (!label || !label.includes('Change page icon')) return;

      const emoji = label.replace(/\s*Change page icon\s*$/i, '');
      if (!isEmoji(emoji)) return;

      const style      = icon.getAttribute('style') || '';
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
        bestSize  = size;
        bestEmoji = emoji;
      }
    });

    return bestEmoji;
  }

  function updateFavicon() {
    if (!settings.enabled) return;

    const emoji = getCurrentPageEmoji();
    if (!emoji || emoji === lastFaviconEmoji) return;

    const emojiUrl   = buildEmojiUrl(emoji);
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
        const base    = imgs[0];
        const overlay = imgs[1];
        if (overlay && !overlay.hasAttribute(PENDING_MARK)) {
          const emoji = getEmojiFromElement(base);
          if (emoji && isEmoji(emoji)) {
            const emojiUrl    = buildEmojiUrl(emoji);
            const fallbackUrl = buildFallbackUrl(emoji);
            if (!isAlreadyStyled(overlay, emojiUrl)) {
              if (!overlay.dataset.originalSrc && overlay.src) {
                overlay.dataset.originalSrc = overlay.src;
              }
              overlay.setAttribute(PENDING_MARK, 'true');

              const applyOverlayUrl = (url) => {
                if (!settings.enabled) return;
                overlay.setAttribute(PROCESSED_MARK, 'true');
                overlay.removeAttribute(PENDING_MARK);
                overlay.src          = url;
                overlay.style.display  = '';
                overlay.style.opacity  = '1';
                base.setAttribute(PROCESSED_MARK, 'true');
                base.style.background  = 'none';
                base.style.opacity     = '0';
              };

              queuePreload(
                emojiUrl,
                () => applyOverlayUrl(emojiUrl),
                () => {
                  // FIX-6: primary CDN failed — try jsDelivr fallback
                  queuePreload(
                    fallbackUrl,
                    () => applyOverlayUrl(fallbackUrl),
                    () => {
                      overlay.removeAttribute(PENDING_MARK);
                      if (overlay.dataset.originalSrc) overlay.src = overlay.dataset.originalSrc;
                    }
                  );
                }
              );
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

      const inPicker      = isEmojiPicker(div);
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
     Observers & Lifecycle
     FIX-5: Removed 'style' and 'class' from attributeFilter — they generated
             near-continuous full rescans on all Notion style mutations.
             Only 'src' changes on img.notion-emoji matter for reapply.
     FIX-BONUS: separate faviconTimer for head observer to prevent mutual clobber
     FIX-8: Added 'alt' and 'aria-label' to attributeFilter. Database entry
             icons (single img inside .notion-record-icon) update via alt
             mutation, not src. Page icon overlays are still ignored in the
             attribute branch (original behavior preserved).
     ============================================================ */

  function startObservers() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let needsFullScan      = false;
      const fastReapplyTargets = [];
      const newEmojiElements   = [];

      for (const m of mutations) {
        if (m.type === 'attributes' && m.target.tagName === 'IMG' &&
            m.target.classList.contains('notion-emoji')) {
          const img = m.target;

          if (m.attributeName === 'src') {
            // Original behavior: only handle inline imgs (not page icons, not picker)
            if (img.hasAttribute(PROCESSED_MARK)) {
              const emoji = getEmojiFromElement(img) || img.alt;
              if (emoji && isEmoji(emoji) && !isPageIcon(img) && !isEmojiPicker(img)) {
                const emojiUrl = buildEmojiUrl(emoji);
                if (!img.style.backgroundImage.includes(emojiUrl)) {
                  fastReapplyTargets.push({ el: img, emoji, emojiUrl });
                }
              }
            }
            // FIX-5: removed the `else if (style || class) → needsFullScan` branch.
            // Reason: 'style' and 'class' are no longer in attributeFilter, so this
            // branch could never fire anyway. The fast-reapply path above handles
            // src-reset on already-processed inline imgs correctly.
          } else if (m.attributeName === 'alt' || m.attributeName === 'aria-label') {
            // FIX-8: Database entry icons update via alt/aria-label mutation.
            // They are inside .notion-record-icon but are single imgs (not the
            // base+overlay pair). Detect the change and trigger full scan.
            if (img.hasAttribute(PROCESSED_MARK) && isPageIcon(img) && !isPageIconOverlay(img)) {
              const currentEmoji = getEmojiFromElement(img) || img.alt;
              if (currentEmoji && isEmoji(currentEmoji)) {
                const expectedUrl = buildEmojiUrl(currentEmoji);
                if (img.src !== expectedUrl) {
                  // Emoji changed — strip mark and let replaceAllNotionIcons() re-process
                  img.removeAttribute(PROCESSED_MARK);
                  img.removeAttribute(PENDING_MARK);
                  img.removeAttribute('data-emoji-inline');
                  img.style.removeProperty('--emoji-url');
                  img.style.removeProperty('background-image');
                  img.style.removeProperty('background-size');
                  img.style.removeProperty('background-position');
                  img.style.removeProperty('background-repeat');
                  if (img.dataset.originalSrc) {
                    img.src = img.dataset.originalSrc;
                    delete img.dataset.originalSrc;
                  }
                  needsFullScan = true;
                }
              }
            }
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
                  parent.closest('[style*="display: inline-flex"]')  ||
                  parent.closest('[style*="display: inline-block"]') ||
                  parent.closest('[style*="white-space: nowrap"]')   ||
                  parent.closest('.notion-token')
                )) {
                  newEmojiElements.push(node);
                  foundNew = true;
                }
              }
            }
            if (node.querySelectorAll) {
              // FIX (dedup): collect child spans in same pass; Set deduplication below handles overlap
              const spans = Array.from(node.querySelectorAll('span')).filter(span => {
                const text = span.textContent.trim();
                if (!text || !isEmoji(text)) return false;
                if (span.hasAttribute(PROCESSED_MARK) || span.hasAttribute(PENDING_MARK)) return false;
                if (span.querySelector('img')) return false;
                const parent = span.parentElement;
                return parent && (
                  parent.closest('[style*="display: inline-flex"]')  ||
                  parent.closest('[style*="display: inline-block"]') ||
                  parent.closest('[style*="white-space: nowrap"]')   ||
                  parent.closest('.notion-token')
                );
              });
              if (spans.length) foundNew = true;
              newEmojiElements.push(...spans);
            }
          }
          // FIX-8: Restore the original !foundNew fallback with a longer debounce.
          // This is what makes page icons work when Notion updates them via
          // node replacement or other paths not caught by attribute mutations.
          if (!foundNew) needsFullScan = true;
        } else {
          needsFullScan = true;
        }
      }

      fastReapplyTargets.forEach(({ el, emojiUrl }) => {
        el.style.setProperty('--emoji-url', `url('${emojiUrl}')`);
        el.style.backgroundImage    = `url('${emojiUrl}')`;
        el.style.backgroundSize     = 'contain';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat   = 'no-repeat';
      });

      if (newEmojiElements.length > 0) {
        // Set deduplication handles any duplicate spans collected in the two passes above
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

    // FIX-8: Added 'alt' and 'aria-label' to attributeFilter.
    // Database entry icons update via alt mutation when the user changes the icon.
    // Page icon overlays are still ignored in the attribute branch (original behavior).
    observer.observe(document.body, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ['src', 'alt', 'aria-label']
    });
  }

  function stopObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    // FIX-2: clean up any elements that were mid-preload (PENDING_MARK set)
    // when the extension was disabled. Without this they stay opacity:0 forever.
    document.querySelectorAll(`[${PENDING_MARK}]`).forEach(el => {
      el.removeAttribute(PENDING_MARK);
      if (el.tagName === 'IMG' && el.dataset.originalSrc) {
        el.src = el.dataset.originalSrc;
        delete el.dataset.originalSrc;
      }
    });
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

    if (document.head) {
      headObserver = new MutationObserver((mutations) => {
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
          // FIX-BONUS: use separate faviconTimer so head observer debounce
          // never clobbers the body observer's debounceTimer (replaceAllNotionIcons)
          clearTimeout(faviconTimer);
          faviconTimer = setTimeout(updateFavicon, 50);
        }
      });
      headObserver.observe(document.head, { childList: true, subtree: true, attributes: true });
    }
  }

  /* ============================================================
     URL Change Detection
     FIX-7: moved history monkeypatch outside init() — runs once at module load.
             historyPatched flag prevents stacking on repeated enable cycles.
     ============================================================ */

  (() => {
    if (historyPatched) return;
    historyPatched = true;

    let lastUrl = location.href;
    const checkUrl = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        resetFaviconTracking();
        replaceAllNotionIcons();
      }
    };

    window.addEventListener('popstate',    checkUrl);
    window.addEventListener('hashchange',  checkUrl);

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
  })();

  /* ============================================================
     Settings Sync
     FIX-1: settingsReady flag prevents storage.onChanged from racing with
             loadSettings(). The flag is set after loadSettings() resolves.
             No updates are lost: loadSettings() reads the latest storage state,
             so any change that fired during the load is already captured.
     ============================================================ */

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get({
        enabled:    true,
        emojiStyle: 'apple'
      });
      settings = { ...settings, ...stored };
    } catch (e) {
      console.warn('[Emoji Injector] Storage unavailable, using defaults:', e);
    } finally {
      settingsReady = true;
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    // FIX-1: drop changes that arrive before loadSettings() resolves —
    // the initial get() already captures the latest stored values.
    if (!settingsReady) return;

    const updates = {};
    if (changes.enabled)    updates.enabled    = changes.enabled.newValue;
    if (changes.emojiStyle) updates.emojiStyle = changes.emojiStyle.newValue;
    if (Object.keys(updates).length > 0) {
      applySettings(updates);
    }
  });

  loadSettings().then(() => {
    if (settings.enabled) {
      init();
    } else {
      removeCSS();
      document.getElementById('emoji-injector-early-hide')?.remove();
    }
  });

})();