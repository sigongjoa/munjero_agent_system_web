document.addEventListener('DOMContentLoaded', () => {
    const sendDataForm = document.getElementById('send-data-form');
    const promptInput = document.getElementById('prompt-input');
    const responseArea = document.getElementById('response-area');

    sendDataForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const prompt = promptInput.value;
        if (!prompt) return;

        responseArea.textContent = 'Sending data...';

        try {
            const sendResponse = await fetch('/api/direct_send_to_extension', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt }),
            });

            if (!sendResponse.ok) {
                throw new Error(`HTTP error! status: ${sendResponse.status}`);
            }

            const responseData = await sendResponse.json();
            responseArea.textContent = `Success: ${JSON.stringify(responseData)}`;
            promptInput.value = ''; // Clear input

        } catch (error) {
            console.error('Error sending data:', error);
            responseArea.textContent = `Error: ${error.message}`;
        }
    });
});