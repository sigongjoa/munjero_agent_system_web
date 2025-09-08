document.addEventListener('DOMContentLoaded', () => {
    const sendDataForm = document.getElementById('send-data-form');
    const promptInput = document.getElementById('prompt-input');
    const responseArea = document.getElementById('response-area');

    sendDataForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const prompt = promptInput.value;
        if (!prompt) return;

        console.log(`SEND_DATA_SCRIPT: Sending prompt: '${prompt}'`);
        responseArea.textContent = 'Sending data to backend...';

        try {
            const sendResponse = await fetch('/api/direct_send_to_extension', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt }),
            });

            const responseData = await sendResponse.json();
            console.log("SEND_DATA_SCRIPT: Received response from backend:", responseData);

            if (!sendResponse.ok) {
                throw new Error(responseData.error || `HTTP error! status: ${sendResponse.status}`);
            }

            responseArea.textContent = `Success: ${JSON.stringify(responseData)}`;
            promptInput.value = ''; // Clear input

        } catch (error) {
            console.error('SEND_DATA_SCRIPT: Error sending data:', error);
            responseArea.textContent = `Error: ${error.message}`;
        }
    });
});
