const { createClient } = require("redis");
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require("puppeteer-core"); // Re-add puppeteer for initial launch test
const https = require("https");
const fs = require('fs');
const util = require('util');


const logFile = fs.createWriteStream('./puppeteer_worker_logs.txt', { flags: 'a' });

// Override console.log, console.warn, console.error
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
};

console.warn = function(...args) {
    originalConsoleWarn.apply(console, args); // Log to stderr
    logFile.write(util.format.apply(null, args) + '\n');
};

console.error = function(...args) {
    originalConsoleError.apply(console, args);
    logFile.write(util.format.apply(null, args) + '\n');
};

// Custom logger for important messages
function importantLog(...args) {
    originalConsoleLog.apply(console, args); // Print important logs to stdout
    logFile.write("[IMPORTANT] " + util.format.apply(null, args) + '\n');
}

// Custom logger for file-only messages
function fileOnlyLog(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
}

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_general_tasks_list"; // Specific Redis list for general Puppeteer tasks // Specific Redis list for general Puppeteer tasks
const path = require("path"); // Import path module
const { URL } = require('url'); // Import URL module for cache-busting

let lastImageUrl = null; // Store the URL of the last generated image
const PUPPETEER_RESPONSE_PREFIX = 'puppeteer_response:'; // Add this line at the top with other constants

const { executeTask: executeTypecastTask } = require('./typecast_worker.js');
const { executeTask: executeChatgptTask } = require('./chatgpt_worker.js');
const { executeTask: executeQuizAutomationTask } = require('./quiz_automation_worker.js');



async function executeTask({ page, data: task }, redisClient) { // Modified to accept page and task from cluster
    importantLog(`[PUPPETEER] Entering executeTask for task type: ${task.type}`);
    const { profile_name } = task.payload; // Extract profile_name

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

    page.browser().on('targetchanged', target => {
        importantLog('[PUPPETEER_BROWSER_TARGET_CHANGED]', target.url());
    });

    page.browser().on('disconnected', () => {
        importantLog('[PUPPETEER_BROWSER_DISCONNECTED]');
    });
    // --- End Enhanced Logging ---

    try {
        if (task.type === "dom_crawl") {
            const { url, task_id, profile_name } = task.payload; // Extract profile_name
            importantLog(`[PUPPETEER] Crawling DOM for URL: ${url} (Task ID: ${task_id})...`);

            try {
                
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                importantLog(`[PUPPETEER] Page loaded. Waiting extra 5s for SPA render...`);
                await new Promise(r => setTimeout(r, 5000));

                const elements = await page.evaluate(() => {
                    const all = [];
                    document.querySelectorAll("*" ).forEach((el) => {
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
        } else if (task.type === "browser_login") {
            const { profile_name, task_id } = task.payload;
            importantLog(`[PUPPETEER] Starting browser login for profile: ${profile_name} (Task ID: ${task_id})...`);
            try {

                await page.goto('about:blank', { waitUntil: 'domcontentloaded' }); // Open a blank page
                importantLog(`[PUPPETEER] Browser launched for profile '${profile_name}'. User can now manually log in.`);
                // Optionally, you can set a Redis key to indicate the browser is ready for manual login
                await redisClient.set(`puppeteer_response:${task_id}`, JSON.stringify({ status: "success", message: "Browser ready for manual login." }), { EX: 300 });
            } catch (error) {
                importantLog(`[PUPPETEER] Error during browser login setup for profile ${profile_name}:`, error);
                await redisClient.set(`puppeteer_response:${task_id}`, JSON.stringify({ status: "error", message: error.message }), { EX: 300 });
            }
        } else if (task.type === "open_blank_page") {
            importantLog(`[PUPPETEER] Opening blank page...`);
            await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
            importantLog(`[PUPPETEER] Blank page opened. Closing browser...`);
        } else if (task.type === "manual_login_setup_typecast" || task.type === "generate_tts_typecast") {
            // Dispatch to Typecast worker
            await executeTypecastTask(task, redisClient);
        } else if (task.type === "manual_login_setup_chatgpt" || task.type === "generate_chatgpt_response") { // Assuming these task types
            // Dispatch to ChatGPT worker
            await executeChatgptTask(task, redisClient);
        } else if (task.type === "quiz_automation" || task.type === "generate_quiz") { // Assuming these task types
            // Dispatch to Quiz Automation worker
            await executeQuizAutomationTask(task, redisClient);
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

    // Perform a quick browser launch test
    try {
        importantLog("[WORKER] Performing initial browser launch test...");
        const testBrowser = await puppeteer.launch({
            headless: false,
            executablePath: '/usr/bin/chromium',
            protocolTimeout: 60000, // Increase timeout to 60 seconds
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        });
        const testPage = await testBrowser.newPage();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Add a 1-second delay
        await testPage.goto('about:blank');
        await testBrowser.close();
        importantLog("[WORKER] Initial browser launch test successful.");
    } catch (error) {
        importantLog("[WORKER] Initial browser launch test FAILED:", error.message);
        // Exit the process if the initial test fails, as the cluster will likely fail too.
        process.exit(1);
    }

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_BROWSER,
        maxConcurrency: 2,
        puppeteerOptions: {
            headless: false,
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        },
        userDataDir: './user_data/cluster_profile_%p',
        retryLimit: 1,
        skipDuplicateUrls: false,
        timeout: 300000, // 5 minutes
        monitor: true,
        workerCreationDelay: 1000,
    });

    // Register the task handler
    await cluster.task(async ({ page, data: task }) => {
        await executeTask({ page, data: task }, redisClient);
    });

    importantLog(`[REDIS] Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                importantLog("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await cluster.queue(task);
            }
        } catch (error) {
            importantLog("[WORKER] An error occurred in the main loop:", error);
            if (error.message.includes('detached Frame')) {
                importantLog('[WORKER] Detached frame error detected. Resetting browser instance.');
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
