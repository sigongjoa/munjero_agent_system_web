const puppeteer = require("puppeteer");

// Custom logger for important messages (prints to console)
function importantLog(...args) {
    console.log("[IMPORTANT]", ...args);
}

async function main() {
    importantLog("[WORKER] Starting Puppeteer debug worker (direct launch)...");

    const browser = await puppeteer.launch({
        headless: false, // Keep non-headless for visual debugging
        executablePath: '/usr/bin/google-chrome-stable', // Use the correct path for manually installed Chrome
        dumpio: true, // Dump browser process stdout and stderr to console
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-features=site-per-process',
            '--window-size=1920,1080',
            '--start-maximized'
        ]
    });

    const page = await browser.newPage();
    importantLog("[WORKER] Opened new page.");

    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
    importantLog("[WORKER] Opened blank page.");

    // Keep the page open for a few seconds for visual inspection
    await new Promise(resolve => setTimeout(resolve, 5000));

    await browser.close();
    importantLog("[WORKER] Browser closed.");
}

main();