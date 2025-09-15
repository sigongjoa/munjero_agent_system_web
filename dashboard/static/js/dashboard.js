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