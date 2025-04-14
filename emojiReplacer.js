function isEmoji(str) {
  return /\p{Emoji}/u.test(str);
}

function replaceAllNotionIcons() {
  // Select known emoji-related elements
  const emojiElements = [
    ...document.querySelectorAll('img.notion-emoji, div[data-emoji], img[aria-label], .property-check img[aria-label]')
  ];

  // Detect and include Notion page icon container
  document.querySelectorAll('div[style*="position: relative"]').forEach(div => {
    const imgs = div.querySelectorAll('img');
    if (imgs.length === 2 && imgs[0].classList.contains('notion-emoji')) {
      emojiElements.push(imgs[0]); // Add first image
      emojiElements.push(imgs[1]); // Add second image (usually the actual visible emoji)
    }
  });

  emojiElements.forEach(el => {
    const dataEmoji = el.getAttribute('data-emoji');
    const ariaLabel = el.getAttribute('aria-label');
    const alt = el.alt;
    
    // Extract emoji: prioritize data-emoji and aria-label, split alt on first space
    let emoji = dataEmoji || ariaLabel;
    if (!emoji && alt) {
      emoji = alt.split(/\s/)[0]; // Split alt on whitespace and take first part
    }

    if (emoji && isEmoji(emoji)) {
      const emojiUrl = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;
      const styleId = `emoji-style-${emoji}`;
      
      // Add style once per emoji to override CSS
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          img.notion-emoji[alt*="${emoji}"],
          img.notion-emoji[aria-label="${emoji}"],
          div[data-emoji="${emoji}"] {
            background-image: url('${emojiUrl}') !important;
            background-size: contain !important;
            width: 1em !important;
            height: 1em !important;
          }
        `;
        document.head.appendChild(style);
      }

      if (el.tagName === 'IMG') {
        el.onerror = function () {
          setTimeout(() => {
            el.src = emojiUrl;
          }, 1000);
        };
        el.src = emojiUrl;
        el.style.transition = 'opacity 100ms ease-in';
        el.style.width = '1em';
        el.style.height = '1em';
      } else {
        el.style.backgroundImage = `url('${emojiUrl}')`;
        el.style.backgroundSize = 'contain';
        el.style.width = '1em';
        el.style.height = '1em';
      }
    }
  });
}

// Initial run
replaceAllNotionIcons();

// Observer to detect changes dynamically
const observer = new MutationObserver(() => {
  replaceAllNotionIcons();
});
observer.observe(document.body, {
  childList: true,
  subtree: true
});
