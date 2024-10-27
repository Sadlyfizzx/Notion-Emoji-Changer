document.addEventListener('DOMContentLoaded', () => {
    // Set default dark theme directly without any user preference
    document.body.classList.add('dark');

    // Handle donation button click
    const donateButton = document.getElementById('donate-button');
    donateButton.addEventListener('click', () => {
        window.open('https://ko-fi.com/sadlyfizzx', '_blank');
    });
});
