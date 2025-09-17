# Next Steps for Dockerized Interactive Browser Debugging

This document outlines the steps to get your Dockerized interactive browser environment running, incorporating the changes we've made to address the `EACCES` permission errors during `npm install` and to enable X11 forwarding for an interactive display.

## 1. Problem Summary

The goal is to run a Puppeteer-controlled browser inside a Docker container, with the ability to view and interact with the browser window directly on your Linux host machine. We encountered `EACCES` permission errors during the `npm install` step in the Docker build process.

## 2. Modifications Made

### `puppeteer_debug_env/docker-compose.yml`

The `docker-compose.yml` file was modified to enable X11 forwarding, allowing the Docker container to display its GUI on your host machine's X server.

```yaml
version: '3.8'

services:
  puppeteer-debug:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "9222:9222" # For Chrome DevTools Protocol
    environment:
      - DISPLAY=${DISPLAY} # For X11 forwarding to host
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix # Mount X11 socket
      - ./user_data:/app/user_data
    network_mode: "host" # Use host network for X11 forwarding
    entrypoint: ["/bin/bash", "-c", "npm run debug"]
    shm_size: '2gb' # Increase shared memory for Chrome
```

### `puppeteer_debug_env/Dockerfile`

The `Dockerfile` was modified to address the `EACCES` permission error during `npm install`. It now installs dependencies in a temporary directory as `root`, then copies them to `/app/node_modules`, and finally ensures `pptruser` owns the `node_modules` directory. The `CMD` was also set to `npm run debug`.

```dockerfile
# Use a base image with Node.js and Chrome pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies in a temporary directory as root, then copy to /app
USER root
RUN mkdir -p /tmp/node_modules && npm install --prefix /tmp
RUN cp -a /tmp/node_modules /app/
RUN chown -R pptruser:pptruser /app/node_modules
USER pptruser

# Copy application code
COPY . .

# Expose port for debugging (if needed)
EXPOSE 9222

# Command to run the application
CMD ["npm", "run", "debug"]
```

### `puppeteer_debug_env/worker.js`

The `worker.js` file was modified to correctly launch Puppeteer without `xvfb-run` and to point to the correct executable path for Chrome/Chromium, as X11 forwarding is now handled by the host.

```javascript
// ... (previous code) ...

async function main() {
    importantLog("[WORKER] Starting Puppeteer debug worker...");

    // Removed X11 debug script execution as X11 forwarding is handled by host

    importantLog("[WORKER] Initializing Puppeteer Cluster...");

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_BROWSER,
        maxConcurrency: 1, // Start with 1 for debugging
        puppeteerOptions: {
            headless: false, // Keep non-headless for visual debugging
            executablePath: '/usr/bin/google-chrome', // Use google-chrome directly
            dumpio: true, // Dump browser process stdout and stderr to console
            args: [
                // Removed Xvfb-specific arguments
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--use-gl=swiftshader',
                '--disable-features=Dbus',
                '--disable-features=SystemDbus',
                '--disable-web-security',
                '--disable-xss-auditor',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-first-run',
                '--profile-directory=Default',
                '--no-accelerated-2d-canvas',
                '--no-zygote',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-fake-ui-for-media-stream',
                '--use-mock-keychain'
            ]
        },
        userDataDir: './user_data/cluster_profile_%p', // Unique user data dir for each browser instance, %p is replaced by workerId
        retryLimit: 1,
        skipDuplicateUrls: false,
        timeout: 300000, // 5 minutes
        monitor: true,
        workerCreationDelay: 1000,
    });

    // Define a simple task to launch a page
    await cluster.task(async ({ page, data }) => {
        importantLog(`[WORKER] Task received: ${data.type}`);
        try {
            // Changed to open about:blank as per user's request
            await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
            importantLog(`[WORKER] Opened blank page.`);
            // Keep the page open for a few seconds for visual inspection
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            importantLog(`[WORKER] Error during task execution: ${error.message}`);
        }
    });

    // Queue a task to trigger browser launch
    importantLog("[WORKER] Queuing initial browser launch task...");
    await cluster.queue({ type: "initial_launch_test" });

    importantLog("[WORKER] Debug worker finished queuing tasks. Keeping process alive...");
    // In a real scenario, this would be a loop processing tasks from Redis
    await new Promise(() => {}); // Keep process alive indefinitely
}

main();
```

## 3. Host Setup (Linux)

To see and interact with the browser window on your Linux host, you need to ensure X11 forwarding is correctly configured:

1.  **Ensure X11 Server is Running**: Most Linux desktop environments have an X11 server running by default.
2.  **Allow X11 Connections**: Open a terminal on your host machine and run:
    ```bash
    xhost +local:docker
    ```
    This command allows Docker containers to connect to your X server. If `xhost +local:docker` doesn't work, you can try the less secure `xhost +` (which allows connections from any host), but it's generally not recommended for long-term use.
3.  **Set DISPLAY Environment Variable**: Ensure your `DISPLAY` environment variable is correctly set. It usually is by default in a graphical session. You can check it with `echo $DISPLAY`.

## 4. Running the Docker Container

1.  **Navigate to the Project Root**: Open your terminal and navigate to the project's root directory:
    ```bash
    cd /mnt/d/progress/munjero_agent_system_web
    ```
2.  **Build and Run**: Execute the following command to build the Docker image (forcing a rebuild without cache to ensure all `Dockerfile` changes are applied) and run the container in detached mode:
    ```bash
    docker-compose -f puppeteer_debug_env/docker-compose.yml up --build --no-cache -d
    ```

## 5. Checking Logs

After running the `docker-compose up` command, you can check the logs of the `puppeteer-debug` service to monitor its startup and execution:

```bash
docker-compose -f puppeteer_debug_env/docker-compose.yml logs -f puppeteer-debug
```

You should see output from the `worker.js` script, indicating that Puppeteer is launching and navigating to `about:blank`. If successful, a Chrome browser window should appear on your desktop.

## 6. Next Steps

Please execute the `docker-compose up` command as described in section 4 and report the full output. If a browser window appears, confirm that you can interact with it. If you encounter any errors or unexpected behavior, provide the logs from section 5.
