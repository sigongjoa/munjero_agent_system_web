const { createClient } = require("redis");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require('fs');
const util = require('util');


const logFile = fs.createWriteStream('/app/puppeteer_worker_logs.txt', { flags: 'a' });

// Override console.log, console.warn, console.error
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
};

console.warn = function(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
};

console.error = function(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
};

// Custom logger for important messages
function importantLog(...args) {    originalConsoleLog.apply(console, args); // Print important logs to stdout    logFile.write("[IMPORTANT] " + util.format.apply(null, args) + '\n');} // Custom logger for file-only messagesfunction fileOnlyLog(...args) {    logFile.write(util.format.apply(null, args) + '\n');}

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_general_tasks_list"; // Specific Redis list for general Puppeteer tasks
const path = require("path"); // Import path module
const { URL } = require('url'); // Import URL module for cache-busting
let browser;
let page;
let lastImageUrl = null; // Store the URL of the last generated image
const PUPPETEER_RESPONSE_PREFIX = 'puppeteer_response:'; // Add this line at the top with other constants




// IMPORTANT: Manual Login Process for ChatGPT
// Scenario: "Launch browser for manual login -> Save cookies"
// 1. Run Puppeteer Worker with headless: false (browser window will appear).
// 2. Manually log in to ChatGPT (solve Cloudflare, enter credentials).
// 3. After successful login, the Worker will automatically save cookies.json and localStorage.json.
// 4. Subsequent runs will load these saved sessions, bypassing manual login.

async function getBrowser() {
    importantLog("[PUPPETEER] Entering getBrowser function.");
    if (!browser || !page) {
        importantLog("[PUPPETEER] Initializing new browser instance...");
        try {
            browser = await puppeteer.launch({
                headless: false,   // ✅ GUI 모드
                executablePath: '/usr/bin/google-chrome-stable', // 설치된 크롬 경로
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--no-first-run',
                    '--user-data-dir=./user_data',
                    '--profile-directory=Default'
                ]
            });
            importantLog("[PUPPETEER] Browser launched successfully.");
            page = await browser.newPage();
            importantLog("[PUPPETEER] New page created.");
            await page.setViewport({ width: 1366, height: 768 }); // Standard desktop resolution
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36'); // Desktop user agent
            // --- Enhanced Logging for Debugging ---
            page.on('console', msg => {
                importantLog('[PUPPETEER_PAGE_LOG]', msg.text());
            });

            page.on('request', request => {
                fileOnlyLog('[PUPPETEER_NETWORK_REQ]', request.method(), request.url());
            });

            page.on('response', async response => {
                fileOnlyLog('[PUPPETEER_NETWORK_RES]', response.status(), response.url());
            });

            page.on('pageerror', err => {
                importantLog('[PUPPETEER_PAGE_ERROR]', err.message);
            });

            browser.on('targetchanged', target => {
                importantLog('[PUPPETEER_BROWSER_TARGET_CHANGED]', target.url());
            });

            browser.on('disconnected', () => {
                importantLog('[PUPPETEER_BROWSER_DISCONNECTED]');
            });
            // --- End Enhanced Logging ---
            importantLog("[PUPPETEER] Browser instance created and configured.");
        } catch (error) {
            importantLog("[PUPPETEER] Error during browser initialization:", error);
            throw error; // Re-throw to propagate the error
        }
    }
    importantLog("[PUPPETEER] Exiting getBrowser function, returning page.");
    return page;
}

async function executeTask(task, redisClient) {
    importantLog(`[PUPPETEER] Entering executeTask for task type: ${task.type}`);
    const page = await getBrowser();

    try {
        if (task.type === "healthcheck") {
            await (async () => {
                importantLog("[PUPPETEER] Running Puppeteer browser launch healthcheck...");
                const healthcheckResults = {
                    overall: "error",
                    message: "Browser launch healthcheck not completed.",
                    details: {
                        browserLaunch: { status: "error", message: "Browser not launched." }
                    },
                    timestamp: new Date().toISOString()
                };

                let browserInstance;
                let pageInstance;

                try {
                    importantLog("[PUPPETEER] Attempting to launch browser for healthcheck...");
                    browserInstance = await puppeteer.launch({
                        headless: true, // Use headless for healthcheck
                        executablePath: '/usr/bin/google-chrome-stable',
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage'
                        ]
                    });
                    pageInstance = await browserInstance.newPage();
                    healthcheckResults.details.browserLaunch = { status: "ok", message: "Browser launched successfully." };
                    healthcheckResults.overall = "ok";
                    healthcheckResults.message = "Puppeteer browser launch check passed.";
                    importantLog("[PUPPETEER] Browser launched successfully for healthcheck.");
                } catch (err) {
                    healthcheckResults.overall = "error";
                    healthcheckResults.message = `Puppeteer browser launch failed: ${err.message}`;
                    importantLog("[PUPPETEER] ❌ Puppeteer browser launch healthcheck failed:", err);
                } finally {
                    if (browserInstance) {
                        await browserInstance.close();
                        importantLog("[PUPPETEER] Browser closed after healthcheck.");
                    }
                    await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify(healthcheckResults), { EX: 15 });
                    importantLog("[PUPPETEER] Healthcheck result set to Redis.");
                }
            })();
            return;
        } else if (task.type === "dom_crawl") {
            const { url, task_id } = task.payload;
            importantLog(`[PUPPETEER] Crawling DOM for URL: ${url} (Task ID: ${task_id})...`);

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                importantLog(`[PUPPETEER] Page loaded. Waiting extra 5s for SPA render...`);
                await new Promise(r => setTimeout(r, 5000));

                const elements = await page.evaluate(() => {
                    const all = [];
                    document.querySelectorAll("*").forEach((el) => {
                        try {
                            all.push({
                                tag: el.tagName.toLowerCase(),
                                id: el.id || null,
                                classes: el.className ? el.className.split(" ") : null,
                                selector: (() => {
                                    let selector = el.tagName.toLowerCase();
                                    if (el.id) selector += "#" + el.id;
                                    if (el.className) selector += "." + el.className.split(" ").join(".");
                                    return selector;
                                })(),
                                text: el.innerText ? el.innerText.slice(0, 100) : null,
                                attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value }))
                            });
                        } catch (e) {}
                    });
                    return all;
                });

                importantLog(`[PUPPETEER] Extracted ${elements.length} elements.`);
                await redisClient.set(`puppeteer_domdump:${task_id}`, JSON.stringify(elements), { EX: 300 });
                importantLog(`[PUPPETEER] Stored DOM dump for task ${task_id} in Redis.`);
            } catch (error) {
                importantLog(`[PUPPETEER] Error during DOM crawl for ${url}:`, error);

                const errorDetails = {
                    name: error.name || "Error",
                    message: error.message || "Unknown error",
                    stack: error.stack || "No stack trace",
                    url: url,
                    timestamp: new Date().toISOString()
                };

                await redisClient.set(
                    `puppeteer_domdump:${task_id}`,
                    JSON.stringify({ elements: [], error: errorDetails }),
                    { EX: 300 }
                );
            }
        } else {
            importantLog(`[PUPPETEER] Unknown task type received: ${task.type}`);
        }
    } catch (error) {
        importantLog(`[PUPPETEER] Unhandled error in executeTask for task type ${task.type}:`, error);
        throw error;
    } finally {
        importantLog(`[PUPPETEER] Exiting executeTask for task type: ${task.type}`);
    }
}

function checkDataDir() {
    const dataDir = path.join('/app', 'data');
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            importantLog(`[INIT] Data directory created: ${dataDir}`);
        } else {
            importantLog(`[INIT] Data directory exists: ${dataDir}`);
        }
        // 테스트 파일 쓰기/읽기
        const testFile = path.join(dataDir, 'init_check.txt');
        fs.writeFileSync(testFile, 'data-dir-ok');
        const check = fs.readFileSync(testFile, 'utf-8');
        importantLog(`[INIT] Data directory write/read OK: ${check}`);
        fs.unlinkSync(testFile); // 테스트 끝나면 삭제
    } catch (err) {
        importantLog(`[INIT] Data directory check failed: ${err.message}`);
        process.exit(1); // 치명적이면 컨테이너 종료 → docker logs에서 바로 확인 가능
    }
}

async function main() {
    importantLog("[WORKER] Starting Puppeteer worker...");
    checkDataDir(); // Call the check here
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => importantLog('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    importantLog("[REDIS] Connected to Redis successfully.");

    importantLog(`[REDIS] Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                importantLog("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await executeTask(task, redisClient);
            }
        } catch (error) {
            importantLog("[WORKER] An error occurred in the main loop:", error);
            if (error.message.includes('detached Frame')) {
                importantLog('[WORKER] Detached frame error detected. Resetting browser instance.');
                browser = null;
                page = null;
            }
            // Wait a bit before retrying to prevent a fast error loop
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
        