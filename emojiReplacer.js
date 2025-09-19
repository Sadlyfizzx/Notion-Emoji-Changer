function isEmoji(str) {
  return /\p{Emoji}/u.test(str);
}

function getEmojiFromElement(el) {
  const dataEmoji = el.getAttribute('data-emoji');
  const ariaLabel = el.getAttribute('aria-label');
  const alt = el.alt;
  let emoji = dataEmoji || ariaLabel;
  if (!emoji && alt) emoji = alt.split(/\s/)[0];
  return emoji;
}

function applyEmojiStyle(el, emoji, emojiUrl) {
  const styleId = `emoji-style-${emoji}`;
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
    el.onerror = () => setTimeout(() => el.src = emojiUrl, 1000);
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
    const emoji = getEmojiFromElement(el);
    if (emoji && isEmoji(emoji)) {
      const emojiUrl = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;
      applyEmojiStyle(el, emoji, emojiUrl);
    }
  });
}

replaceAllNotionIcons();

const observer = new MutationObserver(replaceAllNotionIcons);
observer.observe(document.body, { childList: true, subtree: true });
