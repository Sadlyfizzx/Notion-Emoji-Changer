const SHOW_POPUP_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

function checkAndShowPopup() {
    chrome.storage.local.get(['lastDonationPopupShown'], (result) => {
        const lastShown = result.lastDonationPopupShown;
        const now = Date.now();

        // Check if the popup needs to be shown
        if (!lastShown || (now - lastShown) > SHOW_POPUP_INTERVAL) {
            chrome.storage.local.set({ lastDonationPopupShown: now }, () => {
                chrome.action.openPopup(); // Opens the donation popup
            });
        }
    });
}

// Check and show popup when the extension is installed or updated
chrome.runtime.onInstalled.addListener(checkAndShowPopup);

// Optionally, check periodically (e.g., every hour) to see if the popup should be shown
setInterval(checkAndShowPopup, 60 * 60 * 1000); // Check every hour
