document.addEventListener('DOMContentLoaded', () => {
    const captureDomButton = document.getElementById('captureDomButton');
    const statusDiv = document.getElementById('status');

    captureDomButton.addEventListener('click', () => {
        statusDiv.textContent = 'Requesting DOM capture...';
        chrome.runtime.sendMessage({ type: 'TRIGGER_DOM_CAPTURE' }, (response) => {
            if (chrome.runtime.lastError) {
                statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
                console.error('Popup: Error sending message:', chrome.runtime.lastError.message);
            } else {
                statusDiv.textContent = response.status;
                console.log('Popup: Response from background:', response);
            }
        });
    });
});