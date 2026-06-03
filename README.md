# Notion Emoji Injector 🎨

Replace Notion's native emojis with Apple, Google, Twitter, or Facebook styled emojis. Popup controls, zero flicker, instant style switching.

![Version](https://img.shields.io/badge/version-5.3.2-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

> **[⬇ Download Latest Version](https://github.com/Sadlyfizzx/Notion-Emoji-Changer/releases/latest)**

---

## What It Does

Notion Emoji Injector hooks into Notion's emoji rendering and swaps the native system emojis for styled ones pulled from a CDN. Pick Apple, Google, Twitter, or Facebook — the change applies across every open Notion tab immediately.

Works on Notion Web (Chrome, Edge, Brave, Opera) and Notion Desktop via DevTools console injection.

---

## Features

| Feature | Description |
| --- | --- |
| **4 Emoji Styles** | Apple, Google, Twitter, and Facebook — switch anytime from the popup. |
| **Control Panel** | Toggle the extension on/off, pick your style, and preview it live. Turning it off refreshes the page to restore native Notion emojis. |
| **Synced Settings** | Your preferences carry over across tabs and browser sessions automatically. |
| **CDN Fallback** | If the primary CDN is unreachable, the extension falls back to jsDelivr automatically. |

---

## Preview

### Apple Emoji Style Preview
<img width="1900" height="814" alt="Apple Emoji" src="https://github.com/user-attachments/assets/dee349c6-3105-40a1-9b5e-feb787ab0e6b" />

### Google Emoji Style Preview
<img width="1899" height="822" alt="Google Emoji" src="https://github.com/user-attachments/assets/0358b9a7-be5d-4009-a075-0aa53c0132d8" />

### Twitter Emoji Style Preview
<img width="1899" height="821" alt="Twitter Emoji" src="https://github.com/user-attachments/assets/8e37e545-1de4-4900-ac54-5f7dc347c592" />

### Facebook Emoji Style Preview
<img width="1898" height="822" alt="Facebook Emoji" src="https://github.com/user-attachments/assets/42bc0b2f-cc22-466f-8a77-74f04c9fada8" />

---

## Installation

### Browser Extension (Recommended)

1. Download the latest release from the [Releases](https://github.com/Sadlyfizzx/Notion-Emoji-Changer/releases) page.
2. Unzip the folder.
3. Open your browser's extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
4. Enable **Developer mode** (toggle in the top-right).
5. Click **Load unpacked** and select the unzipped folder.
6. Open [app.notion.com](https://app.notion.com) and click the extension icon.

### Notion Desktop App

> ⚠️ Desktop injection is temporary — it resets when you close the app.

1. Open the Notion Desktop app.
2. Press `Alt` → `View` → `Toggle Developer Tools`.
3. Go to the **Console** tab.
4. Paste the contents of `emojiReplacer.js` and press Enter.

---

## Usage

Click the extension icon to open the control panel:

| Control | What It Does |
| --- | --- |
| **Enable Injection** | Turn the extension on or off. Disabling refreshes the page to restore native emojis. |
| **Emoji Style** | Pick Apple, Google, Twitter, or Facebook. Updates all open Notion tabs instantly. |
| **Live Preview** | See your selected style in the popup before closing it. |

Settings save automatically and sync across your browser profile.

---

## Architecture

- **Dynamic CSS Injection** — Styles are injected when enabled. Disabling triggers a page refresh so native emojis come back cleanly.
- **Scoped MutationObserver** — Watches for newly added DOM nodes only, avoiding CPU thrashing from React attribute mutations.
- **CDN Abstraction** — Emoji URLs build dynamically from the selected style with automatic fallback to jsDelivr.
- **Processed Marking** — Elements get tagged with `data-emoji-injected` to prevent redundant processing and loops.
- **Overlay Detection** — Page icons use a two-image structure (base + overlay). The extension targets only the overlay to avoid double-render bugs.
- **Preload Queue** — Limits concurrent image requests and enforces a 5-second timeout to prevent network deadlocks.

---

## Privacy

This extension loads emoji images from third-party CDNs:

- **Primary**: `emojicdn.elk.sh`
- **Fallback**: `cdn.jsdelivr.net` (emoji-datasource packages)

Only the **emoji character itself** is sent to these services (e.g. `🚀`). Your Notion page content, workspace data, and personal information are never transmitted. No analytics or tracking are implemented.

---

## Known Limitations

- Some complex ZWJ sequences (e.g., 🧑‍💻, 👨‍👩‍👧‍👦) may render slightly split due to CDN sprite limitations.
- Desktop app requires manual re-injection after every app restart.
- If emojis stop loading entirely, the primary CDN may be down — the fallback should activate automatically within 5 seconds.

---

## Support

- **Twitter/X**: [@ziadverse](https://twitter.com/ziadverse)
- **Ko-fi**: [ko-fi.com/sadlyfizzx](https://ko-fi.com/sadlyfizzx)

Built by **Ziad**.
