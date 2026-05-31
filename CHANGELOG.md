\# Changelog



All notable changes to this project will be documented in this file.



The format is based on \[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),

and this project adheres to \[Semantic Versioning](https://semver.org/spec/v2.0.0.html).



\## \[5.3.1] - 2026-05-28



\### Fixed

\- MutationObserver no longer watches `attributes` with `subtree`, eliminating CPU thrashing on large Notion pages.

\- Fixed inverted `needsFullScan` logic that caused full DOM rescans on nearly every mutation.

\- Added proper teardown system: disabling the extension now restores original DOM state, removes injected CSS, disconnects all observers, removes event listeners, and unpatches history methods without requiring a page reload.

\- Added preload timeout (5s) with fallback chain to prevent permanent `PENDING\_MARK` deadlocks when CDN is slow or unreachable.

\- Implemented CDN fallback via jsDelivr (`emoji-datasource`) when `emojicdn.elk.sh` fails or is blocked.

\- Limited concurrent image preloads to 6 to reduce network congestion.

\- Fixed history monkey-patch duplication when toggling enabled state repeatedly.

\- Favicon now restores to original Notion favicon when navigating away from emoji-icon pages.

\- Fixed `isEmoji()` incorrectly treating single digits as emojis.

\- Fixed manifest `homepage\_url` to point to correct repository.



\### Security

\- Added Content Security Policy declaration in manifest.

\- Documented third-party CDN privacy implications in README.



\## \[5.1.0] - 2026-05-11



\### Added

\- Multiple emoji styles (Apple, Google, Twitter, Facebook).

\- Popup control panel with live preview.

\- Settings sync across browser sessions.



\## \[4.0.0] - 2025-09-19



\### Added

\- Improved emoji detection and rendering reliability.



\## \[3.1.0] - 2025-04-14



\### Fixed

\- Page icon and sidebar emoji rendering.



\## \[2.0.0] - 2024-11-21



\### Added

\- Dynamic emoji detection without hardcoded codes.



\## \[1.0.0] - 2024-11-21



\### Added

\- Initial release with Apple-style emoji injection.

