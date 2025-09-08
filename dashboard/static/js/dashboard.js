document.addEventListener('DOMContentLoaded', () => {
    const generateScriptForm = document.getElementById('generate-script-btn');
    const scriptTopicInput = document.getElementById('script-topic');
    const scriptResultArea = document.getElementById('script-output');
    const generateImagesButton = document.getElementById('generate-images-btn');
    const imageResultArea = document.getElementById('image-gallery');

    let currentScriptId = null; // To store the script ID for image generation and polling

    // --- Worker Status Check ---
    async function waitForWorkerReady() {
        let ready = false;
        while (!ready) {
            try {
                const res = await fetch("http://localhost:5000/api/worker_status");
                const data = await res.json();
                if (data.status === "ready") {
                    ready = true;
                    console.log("DASHBOARD: Worker is ready.");
                } else {
                    console.log("DASHBOARD: Worker not ready yet, retrying in 2 seconds...");
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (error) {
                console.error("DASHBOARD: Error checking worker status:", error);
                console.log("DASHBOARD: Retrying worker status check in 5 seconds...");
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    // --- WebSocket Status Display ---
    const extensionStatusDiv = document.getElementById('extension-status');
    async function updateExtensionStatus() {
        try {
            const response = await fetch('/api/extension_status');
            const data = await response.json();
            extensionStatusDiv.textContent = `Extension Status: ${data.status} - ${data.message}`;
            extensionStatusDiv.className = data.status === 'connected' ? 'status-connected' : 'status-disconnected';
        } catch (error) {
            extensionStatusDiv.textContent = `Extension Status: Error - ${error.message}`;
            extensionStatusDiv.className = 'status-error';
        }
    }
    setInterval(updateExtensionStatus, 5000); // Update every 5 seconds
    updateExtensionStatus(); // Initial update

    // --- Generate Script ---
    generateScriptForm.addEventListener('click', async (event) => {
        event.preventDefault();

        // Wait for worker to be ready
        await waitForWorkerReady();

        const topic = scriptTopicInput.value;
        if (!topic) {
            scriptResultArea.textContent = 'Please enter a topic.';
            return;
        }

        scriptResultArea.textContent = 'Generating script...';
        imageResultArea.innerHTML = ''; // Clear previous images
        generateImagesButton.style.display = 'none'; // Hide image button
        currentScriptId = null; // Reset script ID

        console.log(`DASHBOARD: Sending generate script request for topic: ${topic}`);
        try {
            const response = await fetch('/api/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: topic }),
            });

            const data = await response.json();
            console.log("DASHBOARD: Generate script response:", data);

            if (response.ok) {
                currentScriptId = data.task_id; // Store the received script ID
                scriptResultArea.textContent = `Script generation queued. Task ID: ${currentScriptId}. Waiting for result...`;
                console.log(`DASHBOARD: Stored currentScriptId: ${currentScriptId}`);
                pollScriptResult(currentScriptId); // Start polling for this specific script ID
            } else {
                scriptResultArea.textContent = `Error: ${data.error || 'Unknown error'}`;
            }
        } catch (error) {
            console.error('DASHBOARD: Error generating script:', error);
            scriptResultArea.textContent = `Error: ${error.message}`;
        }
    });

    // --- Poll Script Result ---
    async function pollScriptResult(scriptId) {
        console.log(`DASHBOARD: Starting to poll for script ID: ${scriptId}`);
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/script/${scriptId}`);
                const data = await response.json();
                console.log(`DASHBOARD: Polling response for ${scriptId}:`, data);

                if (response.ok) {
                    clearInterval(pollInterval);
                    scriptResultArea.textContent = `Generated Script:\n${data.content}`;
                    generateImagesButton.style.display = 'block'; // Show image button
                } else if (response.status === 404) {
                    // Script not ready yet, continue polling
                    scriptResultArea.textContent = `Script generation queued. Task ID: ${scriptId}. Waiting for result... (Still polling)`;
                } else {
                    clearInterval(pollInterval);
                    scriptResultArea.textContent = `Error fetching script: ${data.error || 'Unknown error'}`;
                }
            } catch (error) {
                console.error('DASHBOARD: Error during polling:', error);
                clearInterval(pollInterval);
                scriptResultArea.textContent = `Error during polling: ${error.message}`;
            }
        }, 3000); // Poll every 3 seconds
    }

    // --- Generate Images ---
    generateImagesButton.addEventListener('click', async () => {
        if (!currentScriptId) {
            imageResultArea.textContent = 'No script generated yet. Please generate a script first.';
            return;
        }

        imageResultArea.textContent = 'Generating images...';
        console.log(`DASHBOARD: Sending generate images request for script ID: ${currentScriptId}`);
        try {
            const response = await fetch('/api/generate-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script_id: currentScriptId }),
            });

            const data = await response.json();
            console.log("DASHBOARD: Generate images response:", data);

            if (response.ok) {
                imageResultArea.textContent = `Image generation queued. Task ID: ${currentScriptId}. Waiting for result...`;
                pollImageResult(currentScriptId); // Start polling for images
            } else {
                imageResultArea.textContent = `Error: ${data.error || 'Unknown error'}`;
            }
        } catch (error) {
            console.error('DASHBOARD: Error generating images:', error);
            imageResultArea.textContent = `Error: ${error.message}`;
        }
    });

    // --- Poll Image Result ---
    async function pollImageResult(scriptId) {
        console.log(`DASHBOARD: Starting to poll for images for script ID: ${scriptId}`);
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/images/${scriptId}`);
                const data = await response.json();
                console.log(`DASHBOARD: Polling image response for ${scriptId}:`, data);

                if (response.ok) {
                    clearInterval(pollInterval);
                    imageResultArea.innerHTML = 'Generated Images:<br>';
                    data.image_urls.forEach(url => {
                        const img = document.createElement('img');
                        img.src = url;
                        img.style.maxWidth = '100%';
                        img.style.margin = '5px';
                        imageResultArea.appendChild(img);
                    });
                } else if (response.status === 404) {
                    imageResultArea.textContent = `Image generation queued. Task ID: ${scriptId}. Waiting for result... (Still polling)`;
                } else {
                    clearInterval(pollInterval);
                    imageResultArea.textContent = `Error fetching images: ${data.error || 'Unknown error'}`;
                }
            } catch (error) {
                console.error('DASHBOARD: Error during image polling:', error);
                clearInterval(pollInterval);
                imageResultArea.textContent = `Error during image polling: ${error.message}`;
            }
        }, 3000); // Poll every 3 seconds
    }
});