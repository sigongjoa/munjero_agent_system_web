document.addEventListener('DOMContentLoaded', () => {
    console.log("dashboard.js loaded and DOMContentLoaded fired.");

    // --- WebSocket Setup ---
    let ws;
    const connectWebSocket = () => {
        ws = new WebSocket('ws://localhost:8765'); // Adjust WebSocket server address if needed

        ws.onopen = () => {
            console.log('WebSocket connected.');
            // You might want to send an INIT_PING here if the server expects it
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);

            const ttsStatus = document.getElementById('tts-status');

            switch (message.type) {
                case 'TTS_GENERATION_RESULT':
                    if (message.payload.status === 'success') {
                        ttsStatus.innerHTML = `TTS Generation Successful! Download: <a href="${message.payload.filePath}" target="_blank">${message.payload.filePath.split('/').pop()}</a>`;
                    } else {
                        ttsStatus.textContent = `TTS Generation Failed: ${message.payload.message}`;
                    }
                    break;
                case 'MANUAL_LOGIN_TYPECAST_RESULT':
                    if (message.payload.status === 'success') {
                        ttsStatus.textContent = `Typecast Manual Login: ${message.payload.message}`;
                    } else {
                        ttsStatus.textContent = `Typecast Manual Login Failed: ${message.payload.message}`;
                    }
                    break;
                // Add other message types if needed
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Handle error, e.g., try to reconnect
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect in 5 seconds...');
            setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
        };
    };

    connectWebSocket(); // Initial WebSocket connection

    // --- Typecast TTS Elements and Event Listeners ---
    const ttsTextInput = document.getElementById('tts-text-input');
    const ttsFilenameInput = document.getElementById('tts-filename-input');
    const generateTtsBtn = document.getElementById('generate-tts-btn');
    const manualLoginTypecastBtn = document.getElementById('manual-login-typecast-btn');
    const ttsStatus = document.getElementById('tts-status');

    if (generateTtsBtn) {
        generateTtsBtn.addEventListener('click', () => {
            const textToConvert = ttsTextInput.value;
            const filename = ttsFilenameInput.value;

            if (!textToConvert || !filename) {
                alert('Please enter both text and a filename for TTS generation.');
                return;
            }

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'generate_tts_typecast',
                    payload: {
                        text_to_convert: textToConvert,
                        filename: filename
                    }
                }));
                ttsStatus.textContent = 'Generating TTS... Please wait.';
            } else {
                ttsStatus.textContent = 'WebSocket not connected. Please refresh the page.';
                console.error('WebSocket is not open.');
            }
        });
    }

    if (manualLoginTypecastBtn) {
        manualLoginTypecastBtn.addEventListener('click', () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'manual_login_setup_typecast'
                }));
                ttsStatus.textContent = 'Launching browser for manual Typecast login. Please log in there.';
            } else {
                ttsStatus.textContent = 'WebSocket not connected. Please refresh the page.';
                console.error('WebSocket is not open.');
            }
        });
    }

    const checkHealthStatusBtn = document.getElementById('check-health-status');
    const healthStatusSpan = document.getElementById('health-status');
    const healthcheckLogsPre = document.getElementById('healthcheck-logs');

    if (checkHealthStatusBtn) {
        checkHealthStatusBtn.addEventListener('click', async () => {
            healthStatusSpan.textContent = 'Checking...';
            healthcheckLogsPre.textContent = ''; // Clear previous logs

            try {
                const response = await fetch('/api/healthcheck');
                const data = await response.json();
                console.log('Received health check data:', data);

                // Update overall status
                const overallStatus = data.overall === 'healthy' ? '✅ Healthy' : '❌ Unhealthy';
                healthStatusSpan.textContent = overallStatus;

                // Display component statuses
                let componentStatusText = 'Component Statuses:\n';
                componentStatusText += `Redis: ${data.redis?.status === 'ok' ? '✅' : '❌'} ${data.redis?.message || ''}\n`;
                componentStatusText += `Agent: ${data.agent?.status === 'ok' ? '✅' : '❌'} ${data.agent?.message || ''}\n`;

                // Detailed Puppeteer Worker status
                const puppeteerWorker = data.puppeteer_worker;
                if (puppeteerWorker) {
                    componentStatusText += `Puppeteer Worker: ${puppeteerWorker.overall === 'ok' ? '✅' : '❌'} ${puppeteerWorker.message || ''}\n`;
                    if (puppeteerWorker.details) {
                        componentStatusText += `  - Browser Launch: ${puppeteerWorker.details.browserLaunch?.status === 'ok' ? '✅' : '❌'} ${puppeteerWorker.details.browserLaunch?.message || ''}\n`;
                        componentStatusText += `  - ChatGPT Login: ${puppeteerWorker.details.chatgpt?.login === 'ok' ? '✅' : '❌'} ${puppeteerWorker.details.chatgpt?.message || ''}\n`;
                        componentStatusText += `  - ChatGPT Text Input: ${puppeteerWorker.details.chatgpt?.text_input === 'ok' ? '✅' : '❌'} ${puppeteerWorker.details.chatgpt?.message || ''}\n`;
                        componentStatusText += `  - Typecast Login: ${puppeteerWorker.details.typecast?.login === 'ok' ? '✅' : '❌'} ${puppeteerWorker.details.typecast?.message || ''}\n`;
                        componentStatusText += `  - Typecast Text Input: ${puppeteerWorker.details.typecast?.text_input === 'ok' ? '✅' : '❌'} ${puppeteerWorker.details.typecast?.message || ''}\n`;
                    }
                } else {
                    componentStatusText += `Puppeteer Worker: ❌ Not available\n`;
                }

                // Display logs
                if (data.logs && data.logs.length > 0) {
                    healthcheckLogsPre.textContent = componentStatusText + '\n--- Logs ---\n' + data.logs.join('\n');
                } else {
                    healthcheckLogsPre.textContent = componentStatusText + '\n--- Logs ---\nNo logs available.';
                }

            } catch (error) {
                console.error('Error fetching health status:', error);
                healthStatusSpan.textContent = '❌ Error';
                healthcheckLogsPre.textContent = 'Failed to fetch health status. See console for details.';
            }
        });
    }

    const generateImagesBtn = document.getElementById('generate-images-btn');
    const scriptContentTextarea = document.getElementById('script-content');
    const imageGalleryDiv = document.getElementById('image-display-area'); // Consolidated image display area

    if (generateImagesBtn) {
        generateImagesBtn.addEventListener('click', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const scriptContent = scriptContentTextarea.value;
            if (!scriptContent) {
                alert('Please enter script content to generate images.');
                return;
            }

            // Clear previous images/messages
            imageGalleryDiv.innerHTML = 'Generating images...';

            try {
                const response = await fetch('/api/generate-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ script_content: scriptContent }),
                });

                const data = await response.json();

                if (response.ok) {
                    console.log('Image generation task queued:', data);
                    const taskId = data.task_id;
                    imageGalleryDiv.innerHTML = `<p>Task queued successfully! Task ID: ${taskId}</p><p>Starting image generation...</p>`;
                    
                    // Start polling for task status
                    pollTaskStatus(taskId, imageGalleryDiv);

                } else {
                    console.error('Error queuing image generation task:', data);
                    imageGalleryDiv.innerHTML = `<p>Error: ${data.error || 'Unknown error'}</p>`;
                }
            } catch (error) {
                console.error('Network error or failed to send script:', error);
                imageGalleryDiv.innerHTML = `<p>Network error or failed to send script: ${error.message}</p>`;
            }
        });
    }

    async function pollTaskStatus(taskId, displayElement) {
        const pollInterval = 3000; // Poll every 3 seconds

        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/task-status/${taskId}`);
                const data = await response.json();

                console.log(`Polling task ${taskId} status:`, data);

                if (response.ok) {
                    switch (data.status) {
                        case 'not_found':
                            displayElement.innerHTML = `<p>Task ${taskId}: Not found or not started yet.</p>`;
                            setTimeout(checkStatus, pollInterval); // Keep polling if not found yet
                            break;
                        case 'processing':
                            displayElement.innerHTML = `<p>Task ${taskId}: Processing...</p>`;
                            setTimeout(checkStatus, pollInterval);
                            break;
                        case 'generating_images':
                            displayElement.innerHTML = `<p>Task ${taskId}: Generating images...</p>`;
                            setTimeout(checkStatus, pollInterval);
                            break;
                        case 'completed':
                            displayElement.innerHTML = `<p>Task ${taskId}: Completed!</p>`;
                            if (data.result && data.result.length > 0) {
                                let imagesHtml = '<h3>Generated Images:</h3>';
                                data.result.forEach(imageUrl => {
                                    imagesHtml += `<img src="${imageUrl}" alt="Generated Image" style="max-width: 100%; height: auto; margin-bottom: 10px;">`;
                                });
                                displayElement.innerHTML += imagesHtml;
                            } else {
                                displayElement.innerHTML += `<p>No images returned.</p>`;
                            }
                            break;
                        case 'failed':
                            displayElement.innerHTML = `<p>Task ${taskId}: Failed!</p>`;
                            if (data.result && data.result.error) {
                                displayElement.innerHTML += `<p>Error: ${data.result.error}</p>`;
                            } else {
                                displayElement.innerHTML += `<p>An unknown error occurred during image generation.</p>`;
                            }
                            break;
                        default:
                            displayElement.innerHTML = `<p>Task ${taskId}: Unknown status (${data.status}).</p>`;
                            setTimeout(checkStatus, pollInterval);
                            break;
                    }
                } else {
                    displayElement.innerHTML = `<p>Error fetching task status for ${taskId}: ${data.message || 'Unknown error'}</p>`;
                    // Decide whether to stop polling on error or retry
                    // For now, let's stop on error to prevent infinite loops for persistent errors
                }
            } catch (error) {
                console.error(`Network error while polling task ${taskId}:`, error);
                displayElement.innerHTML = `<p>Network error while polling task ${taskId}: ${error.message}</p>`;
                // Stop polling on network errors
            }
        };

        setTimeout(checkResult, pollInterval); // Initial call after a short delay
    }

    // --- Image Generation from Prompt Logic ---
    const imagePromptInput = document.getElementById('image-prompt-input');
    const generateImageFromPromptBtn = document.getElementById('generate-image-from-prompt-btn');
    const generatedImageGallery = document.getElementById('image-display-area'); // Consolidated image display area
    const imageGenerationStatus = document.getElementById('image-generation-status');

    if (generateImageFromPromptBtn) {
        generateImageFromPromptBtn.addEventListener('click', async () => {
            const prompt = imagePromptInput.value;
            if (!prompt) {
                alert('Please enter a prompt for image generation.');
                return;
            }

            generatedImageGallery.innerHTML = ''; // Clear previous images
            imageGenerationStatus.textContent = 'Queuing image generation task...';
            generateImageFromPromptBtn.disabled = true; // Disable button to prevent double-click

            try {
                const response = await fetch('/api/generate_image_task', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ prompt: prompt }),
                });

                const data = await response.json();

                if (response.ok) {
                    console.log('Image generation task queued:', data);
                    const taskId = data.task_id;
                    imageGenerationStatus.textContent = `Task queued (ID: ${taskId}). Waiting for result...`;
                    pollImageGenerationResult(taskId);
                } else {
                    console.error('Error queuing image generation task:', data);
                    imageGenerationStatus.textContent = `Error: ${data.error || 'Unknown error'}`;
                }
            } catch (error) {
                console.error('Network error or failed to send image generation prompt:', error);
                imageGenerationStatus.textContent = `Network error: ${error.message}`;
            } finally {
                generateImageFromPromptBtn.disabled = false; // Re-enable button
            }
        });
    }

    async function pollImageGenerationResult(taskId) {
        const pollInterval = 3000; // Poll every 3 seconds
        let pollAttempts = 0;
        const maxPollAttempts = 300; // 300 attempts * 3 seconds = 900 seconds = 15 minutes

        const checkResult = async () => {
            pollAttempts++;
            if (pollAttempts > maxPollAttempts) {
                imageGenerationStatus.textContent = `Image generation timed out after ${maxPollAttempts * pollInterval / 1000} seconds.`;
                console.warn(`Polling for image generation result for task ${taskId} timed out.`);
                return;
            }

            try {
                const response = await fetch(`/api/image_generation_result/${taskId}`);
                const data = await response.json();

                console.log(`Polling image generation result for task ${taskId}:`, data);

                if (response.ok) {
                    if (data.status === 'completed') {
                        imageGenerationStatus.textContent = 'Image generation completed!';
                        if (data.result && data.result.images && data.result.images.length > 0) {
                            generatedImageGallery.innerHTML = ''; // Clear "Waiting for result..."
                            data.result.images.forEach(imagePath => {
                                // imagePath will now be something like /data/task_id_0.png
                                // We no longer need to extract the filename or prepend /data/
                                const imageUrl = imagePath; // Use the path directly
                                generatedImageGallery.innerHTML += `<img src="${imageUrl}" alt="Generated Image" style="max-width: 100%; height: auto; margin: 10px; border: 1px solid #ddd;">`;
                            });
                        } else {
                            generatedImageGallery.innerHTML = '<p>No images were generated.</p>';
                        }
                    } else if (data.status === 'processing') {
                        imageGenerationStatus.textContent = `Image generation processing... (Attempt ${pollAttempts}/${maxPollAttempts})`;
                        setTimeout(checkResult, pollInterval);
                    } else if (data.status === 'error') {
                        imageGenerationStatus.textContent = `Image generation failed: ${data.result.error.message || 'Unknown error'}`;
                        console.error('Image generation error details:', data.result.error);
                    } else {
                        imageGenerationStatus.textContent = `Unknown status: ${data.status}`;
                        setTimeout(checkResult, pollInterval);
                    }
                } else {
                    imageGenerationStatus.textContent = `Error fetching image generation result: ${data.message || 'Unknown error'}`;
                    console.error('Error response from image generation result API:', data);
                }
            }
            catch (error) {
                console.error(`Network error while polling image generation result for task ${taskId}:`, error);
                imageGenerationStatus.textContent = `Network error while polling: ${error.message}`;
                setTimeout(checkResult, pollInterval); // Keep retrying on network errors
            }
        };

        setTimeout(checkResult, pollInterval); // Initial call
    }

    // --- Browser Login Setup ---
    const startBrowserLoginBtn = document.getElementById('start-browser-login-btn');
    const browserProfileNameInput = document.getElementById('browser-profile-name');
    const browserLoginStatus = document.getElementById('browser-login-status');

    if (startBrowserLoginBtn) {
        startBrowserLoginBtn.addEventListener('click', async () => {
            const profileName = browserProfileNameInput.value;
            if (!profileName) {
                browserLoginStatus.textContent = 'Please enter a profile name.';
                return;
            }

            browserLoginStatus.textContent = 'Launching browser for manual login... Please wait.';
            startBrowserLoginBtn.disabled = true;

            try {
                const response = await fetch('/api/start_browser_login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ profile_name: profileName }),
                });

                const data = await response.json();

                if (response.ok) {
                    browserLoginStatus.textContent = `Browser launched for profile '${profileName}'. Please complete login in the new browser window. Task ID: ${data.task_id}`;
                } else {
                    browserLoginStatus.textContent = `Error starting browser login: ${data.error || 'Unknown error'}`;
                }
            } catch (error) {
                console.error('Network error during browser login setup:', error);
                browserLoginStatus.textContent = `Network error: ${error.message}`;
            } finally {
                startBrowserLoginBtn.disabled = false;
            }
        });
    }
});