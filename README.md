# Emojis Injector Extension 🎉

**Inject Apple-Style Color Emojis on Notion!**  
Enhance your Notion experience with Apple's vibrant color emojis, making your notes and projects more expressive and visually appealing.

## 📖 Overview
The Emojis Injector Extension is a lightweight browser extension that brings Apple-style color emojis to Notion pages, transforming your workspace into a more engaging and fun environment. **Note:** Works on both Notion web and desktop application.

## ✨ Features
- **Apple-Style Color Emojis**: Converts plain-text emojis into Apple color emojis for aesthetic look.
- **Cross-Platform Compatibility**: Works on both Notion web and desktop application.
- **Browser-Agnostic**: Compatible with most modern browsers.
- **Simple Implementation**: Easy to set up whether you're using browser extension or desktop app injection.

## 🚀 Getting Started
> ⚠️ The Sidebar (desktop app) and Pages Icon Have Issues Due to The New Notion Update (I'm Working on Fixing Them). ⚠️

### For Web Browsers
1. **Download the Release Files**: Get the latest version from the [Releases](https://github.com/Sadlyfizzx/Notion-Emoji-Changer/releases) section.
2. **Install in Your Browser**:
   - Open your browser's extension management page
   - Enable "Developer Mode" or similar option
   - Click "Load unpacked" and select the extension's folder
3. **Use on Notion**: Open any Notion page to see Apple-style emojis in action!

### For Notion Desktop App
1. **Access Developer Tools**:
   - Press `Alt` key
   - Go to `View` in the menu bar
   - Select `Toggle Developer Tools`
2. **Inject the Code**:
   - In the Developer Tools window, navigate to the Console tab
   - Copy the code below and paste it into the console
```
function isEmoji(str) {
  return /\p{Emoji}/u.test(str);
}

function replaceAllNotionIcons() {
  // Updated selectors: include new Notion elements with data-emoji attribute.
  document.querySelectorAll('img.notion-emoji, div[data-emoji], img[aria-label], .property-check img[aria-label]').forEach(el => {
    // Get emoji from data-emoji, aria-label, or alt.
    const emoji = el.getAttribute('data-emoji') || el.getAttribute('aria-label') || el.alt;
    
    if (emoji && isEmoji(emoji)) {
      const emojiUrl = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;
      
      // Create a style rule for this emoji if it doesn't exist already.
      const styleId = `emoji-style-${emoji}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          img.notion-emoji[alt="${emoji}"],
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
      
      // If the element is an image, update its src and add error handling.
      if (el.tagName === 'IMG') {
        el.onerror = function() {
          // Retry loading after a short delay if it fails.
          setTimeout(() => {
            el.src = emojiUrl;
          }, 3000);
        };
        el.src = emojiUrl;
        el.style.transition = 'opacity 100ms ease-in';
        el.style.width = '1em';
        el.style.height = '1em';
      } else {
        // For divs (or other non-image elements), set the background image directly.
        el.style.backgroundImage = `url('${emojiUrl}')`;
        el.style.backgroundSize = 'contain';
        el.style.width = '1em';
        el.style.height = '1em';
      }
    }
  });
}

// Run initially.
replaceAllNotionIcons();

// Watch for new emoji elements being added.
const observer = new MutationObserver(() => {
  replaceAllNotionIcons();
});
observer.observe(document.body, {
  childList: true,
  subtree: true
});
```
3. **Important Notes**:
   - This process needs to be repeated each time you open the Notion app
   - The injection is temporary and will reset when you fully close the app

## 🤝 Contributing
Contributions are welcome! Whether it's reporting bugs, suggesting new features, or improving existing functionality, we'd love your input.

To contribute:
1. Fork the repository
2. Create a new branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -am 'Add YourFeature'`)
4. Push the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

## 🔧 Known Limitations
- Desktop app implementation requires manual code injection each session
- No persistent storage solution for desktop app yet
- Code must be reinjected after app restart

## 📜 License
This project is licensed under the MIT License.

## 💬 Contact
For questions or support, feel free to reach out:
- Twitter: [@ziadverse](https://www.twitter.com/@ziadverse)
- Instagram: [@ziadscreativecorner](https://www.instagram.com/ziadscreativecorner/)

Enjoy using the **Emojis Injector Extension** and bring a colorful touch to your Notion pages! ✨
