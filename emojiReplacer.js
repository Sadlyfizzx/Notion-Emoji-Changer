function isEmoji(str) {
    return /\p{Emoji}/u.test(str);
}

function replaceAllNotionIcons() {
    document.querySelectorAll('img[aria-label], .notion-emoji, .property-check img[aria-label]').forEach(img => {
        const label = img.getAttribute('aria-label');
        
        if (label && isEmoji(label)) {
            // Add error handling for image loading
            img.onerror = function() {
                // If loading fails, try one more time after a short delay
                setTimeout(() => {
                    img.src = `https://emojicdn.elk.sh/${encodeURIComponent(label)}?style=apple`;
                }, 1000);
            };

            // Create style rule for this emoji if it doesn't exist
            const styleId = `emoji-style-${label}`;
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .notion-emoji[alt="${label}"], .notion-emoji[aria-label="${label}"] {
                        background-image: url('https://emojicdn.elk.sh/${encodeURIComponent(label)}?style=apple') !important;
                        background-size: contain !important;
                        width: 1em !important;
                        height: 1em !important;
                    }
                `;
                document.head.appendChild(style);
            }

            // Set image source
            img.src = `https://emojicdn.elk.sh/${encodeURIComponent(label)}?style=apple`;
            
            // Apply styles
            img.style.transition = 'opacity 100ms ease-in';
            img.style.width = '1em';
            img.style.height = '1em';
        }
    });
}

// Initial replacement
replaceAllNotionIcons();

// Watch for new emojis being added
const observer = new MutationObserver(() => replaceAllNotionIcons());

// Start watching for changes
observer.observe(document.body, {
    childList: true,
    subtree: true
});
