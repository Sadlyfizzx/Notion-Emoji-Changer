const emojiStyle = 'apple'; // Change this to 'google', 'twitter', etc.

const emojiUrlCache = {};

function isEmoji(str) {
    return /\p{Emoji}/u.test(str);
}

function getFirstEmoji(str = '') {
    const match = [...str.matchAll(/\p{Emoji}/gu)];
    return match.length ? match[0][0] : null;
}

function getEmojiUrl(emoji) {
    if (!emojiUrlCache[emoji]) {
        emojiUrlCache[emoji] = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=${emojiStyle}`;
    }
    return emojiUrlCache[emoji];
}

function replaceAllNotionIcons() {
    const emojiElements = [
        ...document.querySelectorAll('img[aria-label], .notion-emoji, .property-check img[aria-label]')
    ];

    // Add sidebar and edge case emoji containers
    document.querySelectorAll('div[style*="position: relative"]').forEach(div => {
        const imgs = div.querySelectorAll('img');
        if (imgs.length === 2 && imgs[0].classList.contains('notion-emoji')) {
            emojiElements.push(imgs[0], imgs[1]);
        }
    });

    emojiElements.forEach(el => {
        const raw = el.getAttribute('data-emoji') || el.getAttribute('aria-label') || el.alt;
        const emoji = getFirstEmoji(raw);

        if (emoji && isEmoji(emoji)) {
            const emojiUrl = getEmojiUrl(emoji);

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

            const styleId = `emoji-style-${emoji}`;
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .notion-emoji[alt*="${emoji}"],
                    .notion-emoji[aria-label*="${emoji}"],
                    div[data-emoji*="${emoji}"] {
                        background-image: url('${emojiUrl}') !important;
                        background-size: contain !important;
                        width: 1em !important;
                        height: 1em !important;
                    }
                `;
                document.head.appendChild(style);
            }
        }
    });
}

// Initial execution
replaceAllNotionIcons();

// Reapply on DOM changes
const observer = new MutationObserver(() => replaceAllNotionIcons());
observer.observe(document.body, {
    childList: true,
    subtree: true
});
