document.addEventListener('DOMContentLoaded', () => {
    const controlForm = document.getElementById('control-form');
    const promptInput = document.getElementById('prompt-input');
    const responseArea = document.getElementById('response-area');
    const checkExtensionBtn = document.getElementById('check-extension-status');
    const extensionStatusSpan = document.getElementById('extension-status');

    async function checkExtensionStatus() {
        try {
            extensionStatusSpan.textContent = 'Checking...';
            const response = await fetch('/api/extension_status');
            const data = await response.json();
            extensionStatusSpan.textContent = data.message;
            if (data.status === 'connected') {
                extensionStatusSpan.className = 'status-connected';
            } else {
                extensionStatusSpan.className = 'status-disconnected';
            }
        } catch (error) {
            extensionStatusSpan.textContent = 'Error checking status.';
            extensionStatusSpan.className = 'status-disconnected';
        }
    }

    async function handleControlSubmit(event) {
        event.preventDefault();
        const prompt = promptInput.value;
        if (!prompt) return;

        responseArea.textContent = 'Sending command to extension...';

        try {
            // 1. Send the prompt to the extension
            const sendResponse = await fetch('/api/direct_send_to_extension', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt }),
            });

            if (!sendResponse.ok) {
                throw new Error('Failed to send command to the backend.');
            }

            promptInput.value = '';
            responseArea.textContent = 'Command sent. Waiting for response from ChatGPT...';

            // 2. Wait for the response from the extension
            const getResponse = await fetch('/api/get_extension_response');
            const responseData = await getResponse.json();

            if (responseData.error) {
                throw new Error(responseData.error);
            }

            // Assuming the response from the extension has a 'payload' field
            responseArea.textContent = responseData.payload || JSON.stringify(responseData, null, 2);

        } catch (error) {
            console.error('Error in send/receive flow:', error);
            responseArea.textContent = `Error: ${error.message}`;
        }
    }

    // Event Listeners
    controlForm.addEventListener('submit', handleControlSubmit);
    checkExtensionBtn.addEventListener('click', checkExtensionStatus);

    // --- New Shorts Script & Image Generation Logic ---
    const scriptTopicInput = document.getElementById('script-topic');
    const generateScriptBtn = document.getElementById('generate-script-btn');
    const scriptOutputTextarea = document.getElementById('script-output');
    const generateImagesBtn = document.getElementById('generate-images-btn');
    const imageGalleryDiv = document.getElementById('image-gallery');

    let currentScriptId = null; // To store the ID of the generated script

    generateScriptBtn.addEventListener('click', async () => {
        const topic = scriptTopicInput.value.trim();
        if (!topic) {
            alert('Please enter a topic for the shorts script.');
            return;
        }

        scriptOutputTextarea.value = 'Generating script... Please wait.';
        generateImagesBtn.style.display = 'none'; // Hide image button until script is ready
        imageGalleryDiv.innerHTML = ''; // Clear previous images

        try {
            const response = await fetch('/api/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: topic }),
            });
            const data = await response.json();

            if (response.ok) {
                currentScriptId = data.script_id;
                scriptOutputTextarea.value = `Script generation initiated. Script ID: ${currentScriptId}\nFetching script content...`;
                
                // Fetch the actual script content after a short delay
                setTimeout(async () => {
                    try {
                        const scriptResponse = await fetch(`/api/script/${currentScriptId}`);
                        const scriptData = await scriptResponse.json();
                        if (scriptResponse.ok) {
                            scriptOutputTextarea.value = scriptData.content;
                            generateImagesBtn.style.display = 'block'; // Show image button
                        } else {
                            scriptOutputTextarea.value = `Error fetching script: ${scriptData.error}`;
                        }
                    } catch (error) {
                        scriptOutputTextarea.value = `Error fetching script: ${error.message}`;
                    }
                }, 3000); // Wait 3 seconds before fetching script content
                
            } else {
                scriptOutputTextarea.value = `Error: ${data.error || 'Unknown error'}`;
            }
        } catch (error) {
            scriptOutputTextarea.value = `Network Error: ${error.message}`;
        }
    });

    generateImagesBtn.addEventListener('click', async () => {
        if (!currentScriptId) {
            alert('Please generate a script first.');
            return;
        }

        imageGalleryDiv.innerHTML = 'Generating images... Please wait.';

        try {
            const response = await fetch('/api/generate-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script_id: currentScriptId }),
            });
            const data = await response.json();

            if (response.ok) {
                imageGalleryDiv.innerHTML = ''; // Clear loading message
                if (data.image_urls && data.image_urls.length > 0) {
                    data.image_urls.forEach(url => {
                        const img = document.createElement('img');
                        img.src = url;
                        img.alt = 'Generated Image';
                        img.style.maxWidth = '100%';
                        img.style.margin = '10px';
                        img.style.border = '1px solid #ddd';
                        imageGalleryDiv.appendChild(img);
                    });
                } else {
                    imageGalleryDiv.innerHTML = 'No images generated.';
                }
            } else {
                imageGalleryDiv.innerHTML = `Error: ${data.error || 'Unknown error'}`;
            }
        } catch (error) {
            imageGalleryDiv.innerHTML = `Network Error: ${error.message}`;
        }
    });

    // Initial Status Check
    checkExtensionStatus();
});