document.addEventListener('DOMContentLoaded', () => {
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
                componentStatusText += `Redis: ${data.redis?.status === 'ok' ? '✅' : '❌'} ${data.redis?.message || ''}
`;
                componentStatusText += `Agent: ${data.agent?.status === 'ok' ? '✅' : '❌'} ${data.agent?.message || ''}
`;
                componentStatusText += `Puppeteer Worker: ${data.puppeteer_worker?.status === 'ok' ? '✅' : '❌'} ${data.puppeteer_worker?.message || ''}
`;
                
                
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
    const imageGalleryDiv = document.getElementById('image-gallery'); // Assuming this exists for displaying images

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
            });

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

    setTimeout(checkStatus, pollInterval); // Initial call after a short delay
}