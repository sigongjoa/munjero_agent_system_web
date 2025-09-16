const { Cluster } = require('puppeteer-cluster');
const puppeteer = require("puppeteer"); // Re-add puppeteer for initial launch test
const util = require('util');
const { execSync } = require('child_process');

// Custom logger for important messages (prints to console)
function importantLog(...args) {
    console.log("[IMPORTANT]", ...args);
}

async function main() {
    importantLog("[WORKER] Starting Puppeteer debug worker...");

    // Run X11 debug script
    try {
        importantLog("[WORKER] Running X11 debug script...");
        // Changed to use the debug_x11.sh script we modified earlier
        const debugOutput = execSync('sh /app/puppeteer_worker/debug_x11.sh', { encoding: 'utf8' });
        importantLog(debugOutput);
    } catch (error) {
        importantLog("[WORKER] Error running X11 debug script:", error.message);
    }

    importantLog("[WORKER] Initializing Puppeteer Cluster...");

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_BROWSER,
        maxConcurrency: 1, // Start with 1 for debugging
        puppeteerOptions: {
            headless: false, // Keep non-headless for visual debugging
            executablePath: 'xvfb-run', // Use xvfb-run
            dumpio: true, // Dump browser process stdout and stderr to console
            args: [
                '--auto-display',
                '--server-args="-screen 0 1366x768x24"', // Using 1366x768 as per original worker.js
                '/usr/bin/chromium', // Tell xvfb-run what to launch (corrected path)
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
                '--disable-accelerated-2d-canvas',
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
    // Keep the process alive to observe logs
    // In a real scenario, this would be a loop processing tasks from Redis
    await new Promise(() => {}); // Keep process alive indefinitely
}

main();