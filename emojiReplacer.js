function replaceAllNotionIcons() {
  const emojiElements = [
    ...document.querySelectorAll('img.notion-emoji, div[data-emoji], img[aria-label], .property-check img[aria-label]')
  ];

  document.querySelectorAll('div[style*="position: relative"]').forEach(div => {
    const imgs = div.querySelectorAll('img');
    if (imgs.length === 2 && imgs[0].classList.contains('notion-emoji')) {
      emojiElements.push(imgs[0], imgs[1]);
    }
  });

  emojiElements.forEach(el => {
    const rawEmoji = el.getAttribute('data-emoji') || el.getAttribute('aria-label') || el.alt;
    const emojiMatch = rawEmoji ? rawEmoji.match(/[\p{Emoji}\u200d]+/gu) : [];
    const extractedEmoji = emojiMatch ? emojiMatch[0] : null;

    if (extractedEmoji) {
      const emojiUrl = `https://emojicdn.elk.sh/${encodeURIComponent(extractedEmoji)}?style=apple`;
      const sanitizedRawEmoji = rawEmoji.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const styleId = `emoji-style-${sanitizedRawEmoji}`;

      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        const escapedRawEmoji = rawEmoji.replace(/"/g, '\\"');
        style.textContent = `
          img.notion-emoji[alt="${escapedRawEmoji}"],
          img.notion-emoji[aria-label="${escapedRawEmoji}"],
          div[data-emoji="${escapedRawEmoji}"] {
            background: url('${emojiUrl}') no-repeat center/contain !important;
            background-image: url('${emojiUrl}') !important;
            background-size: contain !important;
            width: 1em !important;
            height: 1em !important;
          }
        `;
        document.head.appendChild(style);
      }

      if (el.tagName === 'IMG') {
        el.onerror = function() {
          setTimeout(() => el.src = emojiUrl, 1000);
        };
        el.src = emojiUrl;
        Object.assign(el.style, {
          background: 'none',
          transition: 'opacity 100ms ease-in',
          width: '1em',
          height: '1em'
        });
      } else {
        Object.assign(el.style, {
          background: `url('${emojiUrl}') no-repeat center/contain`,
          width: '1em',
          height: '1em'
        });
      }
    }
  });
}

// Initial run and observer setup
replaceAllNotionIcons();
const observer = new MutationObserver(replaceAllNotionIcons);
observer.observe(document.body, { childList: true, subtree: true });
