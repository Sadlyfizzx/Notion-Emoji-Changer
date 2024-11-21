const SHOW_POPUP_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

// Initialize extension state
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({ 
        enabled: true,  // Default enabled state
        lastDonationPopupShown: null
    });
});

function checkAndShowPopup() {
    chrome.storage.local.get(['lastDonationPopupShown'], (result) => {
        const lastShown = result.lastDonationPopupShown;
        const now = Date.now();

        if (!lastShown || (now - lastShown) > SHOW_POPUP_INTERVAL) {
            chrome.storage.local.set({ lastDonationPopupShown: now }, () => {
                chrome.action.openPopup();
            });
        }
    });
}

// Check periodically
setInterval(checkAndShowPopup, 60 * 60 * 1000); // Check every hour
