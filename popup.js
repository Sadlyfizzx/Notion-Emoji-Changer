document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('dark');

    const donateButton = document.getElementById('donate-button');
    donateButton.addEventListener('click', () => {
        donateButton.textContent = 'Opening...';
        donateButton.disabled = true;
        
        window.open('https://ko-fi.com/sadlyfizzx', '_blank');
        
        setTimeout(() => {
            donateButton.textContent = 'Support Us';
            donateButton.disabled = false;
        }, 1500);
    });
});
