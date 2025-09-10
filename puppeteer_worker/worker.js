const { createClient } = require("redis");
const puppeteer = require("puppeteer");

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_tasks_list";
const path = require("path"); // Import path module
const fs = require("fs"); // Import fs module
let browser;
let page;
const PUPPETEER_RESPONSE_PREFIX = 'puppeteer_response:'; // Add this line at the top with other constants

const COOKIES_FILE = path.join(__dirname, "cookies.json");
const LOCAL_STORAGE_FILE = path.join(__dirname, "localStorage.json");

// IMPORTANT: Manual Login Process for ChatGPT
// Scenario: "Launch browser for manual login -> Save cookies"
// 1. Run Puppeteer Worker with headless: false (browser window will appear).
// 2. Manually log in to ChatGPT (solve Cloudflare, enter credentials).
// 3. After successful login, the Worker will automatically save cookies.json and localStorage.json.
// 4. Subsequent runs will load these saved sessions, bypassing manual login.

async function getBrowser() {
    if (!browser || !page) {
        console.log("[PUPPETEER] Initializing new browser instance...");
        browser = await puppeteer.launch({
            headless: false,   // ✅ GUI 모드
            executablePath: '/usr/bin/google-chrome-stable', // 설치된 크롬 경로
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-first-run'
            ]
        });
        page = await browser.newPage();
        console.log("[PUPPETEER] Browser instance created.");
    }
    return page;
}

async function executeTask(task, redisClient) {
    console.log(`[PUPPETEER] Executing task: ${task.type}`, task);

    const page = await getBrowser();

    if (task.type === "healthcheck") {
        console.log("[PUPPETEER]  Running full Puppeteer healthcheck...");
        try {
            console.log("[PUPPETEER] Attempting to launch browser...");
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
            console.log("[PUPPETEER] Browser launched successfully.");

            console.log("[PUPPETEER] Creating new page...");
            const page = await browser.newPage();
            console.log("[PUPPETEER] Page created.");

            console.log("[PUPPETEER] Navigating to about:blank...");
            await page.goto("about:blank");
            console.log("[PUPPETEER] Navigated to about:blank.");

            console.log("[PUPPETEER] Setting healthcheck result to Redis (OK)...");
            await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify({
                status: "ok",
                message: `Puppeteer launched successfully and navigated to about:blank.`,
                timestamp: new Date().toISOString()
            }), { EX: 15 });
            console.log("[PUPPETEER] Healthcheck result set to Redis (OK).");

            console.log("[PUPPETEER] Closing browser...");
            await browser.close();
            console.log("[PUPPETEER] Browser closed.");
        } catch (err) {
            console.error("[PUPPETEER] ❌ Healthcheck failed:", err);
            console.log("[PUPPETEER] Setting healthcheck result to Redis (ERROR)...");
            await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify({
                status: "error",
                message: err.message,
                timestamp: new Date().toISOString()
            }), { EX: 15 });
            console.log("[PUPPETEER] Healthcheck result set to Redis (ERROR).");
        }
        return;
    }

    if (task.type === "manual_login_setup") {
        console.log("[PUPPETEER] Starting manual login setup...");
        console.log("[PUPPETEER] Navigating to ChatGPT for manual login...");
        await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded' });

        console.log("[PUPPETEER] Please login manually in the opened browser...");
        await page.waitForSelector('div.flex.min-w-0.grow.items-center', { timeout: 0 });
        console.log("✅ Login successful - Account name detected.");

        // Save cookies (필요 없는 필드 제거)
        const cookies = await page.cookies();
        const filteredCookies = cookies.map(({ 
            name, value, domain, path, expires, httpOnly, secure, sameSite 
        }) => ({
            name, value, domain, path, expires, httpOnly, secure, sameSite
        }));
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(filteredCookies, null, 2));

        // Save localStorage
        const localStorageData = await page.evaluate(() => {
            let data = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return data;
        });
        fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(localStorageData, null, 2));

        console.log("✅ Session saved automatically.");
        return; // Exit after setup
    } else if (task.type === "dom_crawl") {
        const { url, task_id } = task.payload;
        console.log(`[PUPPETEER] Crawling DOM for URL: ${url} (Task ID: ${task_id})...`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log(`[PUPPETEER] Page loaded. Waiting extra 5s for SPA render...`);
            await new Promise(r => setTimeout(r, 5000));  // ChatGPT는 SPA라서 추가 대기 필요

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

            console.log(`[PUPPETEER] Extracted ${elements.length} elements.`);
            await redisClient.set(`puppeteer_domdump:${task_id}`, JSON.stringify(elements), { EX: 300 });
            console.log(`[PUPPETEER] Stored DOM dump for task ${task_id} in Redis.`);
        } catch (error) {
            console.error(`[PUPPETEER] Error during DOM crawl for ${url}:`, error);

            // 전체 에러를 문자열로 직렬화
            const errorDetails = {
                name: error.name || "Error",
                message: error.message || "Unknown error",
                stack: error.stack || "No stack trace",
                url: url,
                timestamp: new Date().toISOString()
            };

            // Redis에 저장
            await redisClient.set(
                `puppeteer_domdump:${task_id}`,
                JSON.stringify({ elements: [], error: errorDetails }),
                { EX: 300 }
            );
        }
    }


    try {

        const page = await getBrowser(); // Use the globally managed page instance

        // --- Enhanced Logging for Debugging ---
        page.on('console', msg => {
            console.log('[PUPPETEER_PAGE_LOG]', msg.text());
        });

        page.on('request', request => {
            console.log('[PUPPETEER_NETWORK_REQ]', request.method(), request.url());
        });

        page.on('response', async response => {
            console.log('[PUPPETEER_NETWORK_RES]', response.status(), response.url());
        });

        page.on('pageerror', err => {
            console.error('[PUPPETEER_PAGE_ERROR]', err.message);
        });

        browser.on('targetchanged', target => {
            console.log('[PUPPETEER_BROWSER_TARGET_CHANGED]', target.url());
        });

        browser.on('disconnected', () => {
            console.log('[PUPPETEER_BROWSER_DISCONNECTED]');
        });
        // --- End Enhanced Logging ---

        // --- Load Session (Cookies and Local Storage) ---
        console.log("[PUPPETEER] Attempting to load session from files...");
        try {
            if (fs.existsSync(COOKIES_FILE)) {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
                for (let cookie of cookies) {
                    // Puppeteer expects 'url' for setCookie, but it's not always present in saved cookies.
                    // Add a default URL if missing, or filter out cookies without a valid URL context.
                    if (!cookie.url && cookie.domain) {
                        cookie.url = `https://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;
                    }
                    await page.setCookie(cookie);
                }
                console.log(`[PUPPETEER] Loaded ${cookies.length} cookies from ${COOKIES_FILE}.`);
            } else {
                console.log(`[PUPPETEER] No cookies file found at ${COOKIES_FILE}.`);
            }

            if (fs.existsSync(LOCAL_STORAGE_FILE)) {
                const localStorageData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE, "utf8"));
                await page.evaluate(data => {
                    for (let key in data) {
                        localStorage.setItem(key, data[key]);
                    }
                }, localStorageData);
                console.log(`[PUPPETEER] Loaded local storage from ${LOCAL_STORAGE_FILE}.`);
            } else {
                console.log(`[PUPPETEER] No local storage file found at ${LOCAL_STORAGE_FILE}.`);
            }
            console.log("[PUPPETEER] Session loading complete.");
        } catch (e) {
        console.error("[PUPPETEER] Error loading session files:", e);
        console.log("[PUPPETEER] Proceeding without loaded session. Manual login might be required.");
    }

    } catch (error) {
        console.error("[PUPPETEER] An error occurred during Puppeteer execution:", error);
    } finally {
        if (browser) {
            // Browser is now managed globally and kept open for subsequent tasks.
            // It will be closed when the worker process process exits or explicitly by a shutdown hook.
        }
    }
}

async function main() {
    console.log("[WORKER] Starting Puppeteer worker...");
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => console.log('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    console.log("[REDIS] Connected to Redis successfully.");

    console.log(`[REDIS] Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                console.log("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await executeTask(task, redisClient);
            }
        } catch (error) {
            console.error("[WORKER] An error occurred in the main loop:", error);
            // Wait a bit before retrying to prevent a fast error loop
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
