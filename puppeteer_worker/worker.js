const { createClient } = require("redis");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require('fs');
const util = require('util');
const { generateTypecastTTS, saveSession: saveTypecastSession, loadSession: loadTypecastSession, COOKIES_FILE: TYPECAST_COOKIES_FILE, LOCAL_STORAGE_FILE: TYPECAST_LOCAL_STORAGE_FILE } = require("./typecast_tts");

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
function importantLog(...args) {
    originalConsoleLog.apply(console, args); // Print important logs to stdout
    logFile.write("[IMPORTANT] " + util.format.apply(null, args) + '\n');
}

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_tasks_list";
const path = require("path"); // Import path module
const { URL } = require('url'); // Import URL module for cache-busting
let browser;
let page;
let lastImageUrl = null; // Store the URL of the last generated image
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
        importantLog("[PUPPETEER] Initializing new browser instance...");
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
        // --- Enhanced Logging for Debugging ---
        page.on('console', msg => {
            importantLog('[PUPPETEER_PAGE_LOG]', msg.text());
        });

        page.on('request', request => {
            importantLog('[PUPPETEER_NETWORK_REQ]', request.method(), request.url());
        });

        page.on('response', async response => {
            console.log('[PUPPETEER_NETWORK_RES]', response.status(), response.url());
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
        importantLog("[PUPPETEER] Browser instance created.");

        // Load ChatGPT session if files exist
        if (fs.existsSync(COOKIES_FILE)) {
            const cookiesString = fs.readFileSync(COOKIES_FILE);
            const cookies = JSON.parse(cookiesString);
            await page.setCookie(...cookies);
            importantLog("[PUPPETEER] Loaded ChatGPT cookies.");
        }
        if (fs.existsSync(LOCAL_STORAGE_FILE)) {
            const localStorageData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE));
            await page.evaluate(data => {
                for (const key in data) {
                    localStorage.setItem(key, data[key]);
                }
            }, localStorageData);
            importantLog("[PUPPETEER] Loaded ChatGPT localStorage.");
        }
    }
    return page;
}

async function executeTask(task, redisClient) {
    importantLog(`[PUPPETEER] Executing task: ${task.type}`, task);

    const page = await getBrowser();

    if (task.type === "healthcheck") {
        importantLog("[PUPPETEER] Running full Puppeteer healthcheck...");
        const healthcheckResults = {
            overall: "error",
            message: "Healthcheck not completed.",
            details: {
                browserLaunch: { status: "error", message: "Browser not launched." },
                chatgpt: { login: "not_checked", text_input: "not_checked", message: "ChatGPT not checked." },
                typecast: { login: "not_checked", text_input: "not_checked", message: "Typecast not checked." }
            },
            timestamp: new Date().toISOString()
        };

        let browserInstance;
        let pageInstance;

        try {
            importantLog("[PUPPETEER] Attempting to launch browser for healthcheck...");
            browserInstance = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
            pageInstance = await browserInstance.newPage();
            healthcheckResults.details.browserLaunch = { status: "ok", message: "Browser launched successfully." };
            importantLog("[PUPPETEER] Browser launched successfully for healthcheck.");

            // --- ChatGPT Health Check ---
            importantLog("[PUPPETEER] Checking ChatGPT login and text input...");
            try {
                await pageInstance.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
                await pageInstance.waitForTimeout(2000); // Give it some time to render

                // Check login status
                const chatgptLoggedIn = await pageInstance.evaluate(() => {
                    return document.querySelector('div.flex.min-w-0.grow.items-center') !== null;
                });

                if (chatgptLoggedIn) {
                    healthcheckResults.details.chatgpt.login = "ok";
                    healthcheckResults.details.chatgpt.message = "Logged in.";

                    // Check text input
                    const promptInputSelector = '#prompt-textarea';
                    const canType = await pageInstance.evaluate((selector) => {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.value = 'test message';
                            return el.value === 'test message';
                        }
                        return false;
                    }, promptInputSelector);

                    if (canType) {
                        healthcheckResults.details.chatgpt.text_input = "ok";
                        healthcheckResults.details.chatgpt.message += " Text input successful.";
                    } else {
                        healthcheckResults.details.chatgpt.text_input = "error";
                        healthcheckResults.details.chatgpt.message += " Text input failed.";
                    }
                } else {
                    healthcheckResults.details.chatgpt.login = "error";
                    healthcheckResults.details.chatgpt.message = "Not logged in.";
                }
            } catch (chatgptErr) {
                healthcheckResults.details.chatgpt.login = "error";
                healthcheckResults.details.chatgpt.text_input = "error";
                healthcheckResults.details.chatgpt.message = `Error during ChatGPT check: ${chatgptErr.message}`;
                importantLog(`[PUPPETEER] Error during ChatGPT healthcheck: ${chatgptErr.message}`);
            }

            // --- Typecast Health Check ---
            importantLog("[PUPPETEER] Checking Typecast login and text input...");
            try {
                await pageInstance.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded', timeout: 30000 });
                await pageInstance.waitForTimeout(2000); // Give it some time to render

                // Check login status
                const typecastLoggedIn = await pageInstance.evaluate(() => {
                    return document.querySelector('p[data-actor-id]') !== null;
                });

                if (typecastLoggedIn) {
                    healthcheckResults.details.typecast.login = "ok";
                    healthcheckResults.details.typecast.message = "Logged in.";

                    // Check text input
                    const scriptAreaSelector = 'p[data-actor-id="603fa172a669dfd23f450abd"]';
                    const canType = await pageInstance.evaluate((selector) => {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.textContent = 'test message';
                            return el.textContent === 'test message';
                        }
                        return false;
                    }, scriptAreaSelector);

                    if (canType) {
                        healthcheckResults.details.typecast.text_input = "ok";
                        healthcheckResults.details.typecast.message += " Text input successful.";
                    } else {
                        healthcheckResults.details.typecast.text_input = "error";
                        healthcheckResults.details.typecast.message += " Text input failed.";
                    }
                } else {
                    healthcheckResults.details.typecast.login = "error";
                    healthcheckResults.details.typecast.message = "Not logged in.";
                }
            } catch (typecastErr) {
                healthcheckResults.details.typecast.login = "error";
                healthcheckResults.details.typecast.text_input = "error";
                healthcheckResults.details.typecast.message = `Error during Typecast check: ${typecastErr.message}`;
                importantLog(`[PUPPETEER] Error during Typecast healthcheck: ${typecastErr.message}`);
            }

            // Determine overall status
            if (healthcheckResults.details.browserLaunch.status === "ok" &&
                healthcheckResults.details.chatgpt.login === "ok" &&
                healthcheckResults.details.chatgpt.text_input === "ok" &&
                healthcheckResults.details.typecast.login === "ok" &&
                healthcheckResults.details.typecast.text_input === "ok") {
                healthcheckResults.overall = "ok";
                healthcheckResults.message = "All Puppeteer checks passed.";
            } else {
                healthcheckResults.overall = "error";
                healthcheckResults.message = "Some Puppeteer checks failed. See details.";
            }

        } catch (err) {
            healthcheckResults.overall = "error";
            healthcheckResults.message = `Puppeteer healthcheck failed: ${err.message}`;
            importantLog("[PUPPETEER] ❌ Overall Puppeteer Healthcheck failed:", err);
        } finally {
            if (browserInstance) {
                await browserInstance.close();
                importantLog("[PUPPETEER] Browser closed after healthcheck.");
            }
            await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify(healthcheckResults), { EX: 15 });
            importantLog("[PUPPETEER] Healthcheck result set to Redis.");
        }
        return;
    }

    if (task.type === "manual_login_setup") {
        importantLog("[PUPPETEER] Starting manual login setup...");
        importantLog("[PUPPETEER] Navigating to ChatGPT for manual login...");
        await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded' });

        importantLog("[PUPPETEER] Please login manually in the opened browser...");
        try {
            await page.waitForSelector('div.flex.min-w-0.grow.items-center', { timeout: 0 });
            importantLog("✅ Login successful - Account name detected.");

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

            importantLog("✅ Session saved automatically.");
            return; // Exit after setup
        } catch (error) {
            importantLog("[PUPPETEER] Error during manual login setup:", error);
            // Close browser if an error occurs during manual login setup
            if (browser) {
                await browser.close();
                browser = null;
                page = null;
                importantLog("[PUPPETEER] Browser closed due to manual login setup error.");
            }
            throw error; // Re-throw to propagate the error to the main loop
        }
    } else if (task.type === "manual_login_setup_typecast") {
        importantLog("[PUPPETEER] Starting manual login setup for Typecast...");
        importantLog("[PUPPETEER] Navigating to Typecast for manual login...");
        await page.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded' });

        importantLog("[PUPPETEER] Please login manually in the opened browser for Typecast...");
        try {
            // Wait for an element that indicates successful login to Typecast
            await page.waitForSelector('p[data-actor-id="603fa172a669dfd23f450abd"]', { timeout: 0 });
            importantLog("✅ Typecast Login successful - Editor element detected.");

            await saveTypecastSession(page);

            importantLog("✅ Typecast session saved automatically.");
            return; // Exit after setup
        } catch (error) {
            importantLog("[PUPPETEER] Error during Typecast manual login setup:", error);
            if (browser) {
                await browser.close();
                browser = null;
                page = null;
                importantLog("[PUPPETEER] Browser closed due to Typecast manual login setup error.");
            }
            throw error; // Re-throw to propagate the error to the main loop
        }
    } else if (task.type === "generate_tts_typecast") {
        const { text_to_convert, filename, task_id } = task.payload;
        importantLog(`[PUPPETEER] Generating Typecast TTS for task: ${task_id}`);

        const result = await generateTypecastTTS(page, text_to_convert, filename, task_id, redisClient);

        await redisClient.set(PUPPETEER_RESPONSE_PREFIX + task_id, JSON.stringify(result), { EX: 600 });
        importantLog(`[PUPPETEER] Typecast TTS result for task ${task_id} reported to Redis.`);

    } else if (task.type === "dom_crawl") {
        const { url, task_id } = task.payload;
        importantLog(`[PUPPETEER] Crawling DOM for URL: ${url} (Task ID: ${task_id})...`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            importantLog(`[PUPPETEER] Page loaded. Waiting extra 5s for SPA render...`);
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

            importantLog(`[PUPPETEER] Extracted ${elements.length} elements.`);
            await redisClient.set(`puppeteer_domdump:${task_id}`, JSON.stringify(elements), { EX: 300 });
            importantLog(`[PUPPETEER] Stored DOM dump for task ${task_id} in Redis.`);
        } catch (error) {
            importantLog(`[PUPPETEER] Error during DOM crawl for ${url}:`, error);

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
    } else if (task.type === "generate_image_from_prompt") {
        const { prompt, task_id } = task.payload;
        importantLog(`[PUPPETEER] Generating image for prompt: "${prompt}" (Task ID: ${task_id})...`);

        try {
            // 1. Retrieve prompt from task.payload and input it
            const promptInputSelector = '#prompt-textarea'; // Assuming this is the correct selector for the input field
            await page.waitForSelector(promptInputSelector, { visible: true, timeout: 30000 });
            await page.type(promptInputSelector, prompt);
            importantLog(`[PUPPETEER] Prompt entered: "${prompt}"`);

            // 2. Implement Pre-Generation Image Capture
            const beforeImgs = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll("img[alt='Generated image'], img[src^='blob:']"));
                return imgs.map(img => img.src);
            });
            importantLog(`[PUPPETEER] Found ${beforeImgs.length} existing images before generation.`);

            // 3. Click the submit button with stability
            const submitButtonSelector = 'button[data-testid="send-button"]'; // Assuming this is the correct selector for the send button
            try {
                await page.waitForSelector(submitButtonSelector, { visible: true, timeout: 10000 });
                await page.click(submitButtonSelector);
                importantLog("[PUPPETEER] Clicked submit button.");
            } catch (clickError) {
                importantLog("[PUPPETEER] Submit button click failed, trying Enter key:", clickError.message);
                await page.keyboard.press("Enter");
                importantLog("[PUPPETEER] Pressed Enter key as fallback.");
            // Wait for the image element to disappear or its src to change to a loading state
            importantLog("[PUPPETEER] Waiting for image element to clear or change...");
            await page.waitForFunction(() => {
                const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                // Return true if image is not found, or if its src is not a valid image URL (e.g., empty, or a loading placeholder)
                return !img || !img.src || img.src.startsWith('data:image/svg') || img.src.startsWith('blob:');
            }, { timeout: 10000 }); // Wait up to 10 seconds for the image to clear/change
            importantLog("[PUPPETEER] Image element cleared or changed.");
            }

            // 생성 시작 기다리기 (스트리밍 중지 버튼으로 바뀔 때까지)
            importantLog("[PUPPETEER] Waiting for 'Stop streaming' aria-label via waitForFunction...");
            await page.waitForFunction(() => {
              const btn = document.querySelector("#composer-submit-button");
              if (btn) {
                const currentAriaLabel = btn.getAttribute("aria-label");
                console.log(`[PAGE_LOG] waitForFunction check: Button found, aria-label: ${currentAriaLabel}`);
                return currentAriaLabel === "Stop streaming";
              } else {
                console.log("[PAGE_LOG] waitForFunction check: Button not found.");
                return false;
              }
            }, { timeout: 300000 }); // 5분
            importantLog("[PUPPETEER] Image generation started...");

            // If there was a previous image, wait for the new image URL to be different
            if (lastImageUrl) {
                importantLog("[PUPPETEER] Waiting for new image URL to be different from previous one...");
                const MAX_WAIT_TIME = 60000; // Max 60 seconds
                const CHECK_INTERVAL = 1000; // Check every 1 second
                const startTime = Date.now();
                let currentExtractedImageUrl = null;

                while (Date.now() - startTime < MAX_WAIT_TIME) {
                    currentExtractedImageUrl = await page.evaluate(() => {
                        const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                        return (img && img.complete && img.naturalHeight > 0) ? img.src : null;
                    });

                    if (currentExtractedImageUrl && currentExtractedImageUrl !== lastImageUrl) {
                        importantLog("[PUPPETEER] New image URL detected.");
                        break;
                    }
                    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                }

                if (!currentExtractedImageUrl || currentExtractedImageUrl === lastImageUrl) {
                    importantLog("[PUPPETEER] New image URL was not detected within timeout or is same as previous.");
                    // Decide how to handle this: proceed with current, or throw error
                    // For now, we'll proceed, but this might indicate a problem.
                }
            }

            let dataUrl = null;
            let interval = null; // Declare interval outside try block for wider scope
            try {
  

  // 20초마다 aria-label 상태를 출력 (이미지 생성 시작 후)
  importantLog("[PUPPETEER] Starting aria-label monitoring interval.");
  interval = setInterval(async () => {
    try {
      const button = await page.$('#composer-submit-button'); // 버튼 찾기
      if (button) {
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        importantLog(`[PUPPETEER] Button found. Current aria-label: ${ariaLabel}`); // aria-label 출력
      } else {
        importantLog("[PUPPETEER] Button not found during interval check."); // 버튼을 찾지 못한 경우
      }
    } catch (e) {
      importantLog(`[PUPPETEER] Error during aria-label check: ${e.message}`);
    }
  }, 5000); // 5초 간격으로 확인

  // 3. 이미지 생성 완료 후 'Start voice mode' 버튼이 나타날 때까지 대기
  importantLog("[PUPPETEER] Waiting for 'Start voice mode' button...");
  try {
    await page.waitForSelector('button[data-testid="composer-speech-button"][aria-label="Start voice mode"]', {
    timeout: 300000, // 5분
  });
    importantLog("[PUPPETEER] 'Start voice mode' button found.");
  } catch (e) {
    importantLog(`[PUPPETEER] Error waiting for 'Start voice mode' button: ${e.message}`);
    throw e;
  }
  importantLog("[PUPPETEER] Generation finished, back to voice mode.");
  


// 네트워크 요청 확인
page.on('response', (response) => {
  console.log(`[PUPPETEER] Network response: ${response.status()} ${response.url()}`);
});

// 이미지 생성 후 상태 확인
const img = await page.$('img');  // 예시로 첫 번째 이미지를 찾음
if (img) {
  console.log("[PUPPETEER] Image found after generation.");
} else {
  console.log("[PUPPETEER] No image found after generation.");
}

                // Update Redis with post-processing status
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({
                        status: "processing",
                        stage: "post-processing",
                        message: "Image generation complete, post-processing started.",
                        timestamp: new Date().toISOString()
                    }),
                    { EX: 600 }
                );

                const MAX_TIMEOUT = 120000; // 최대 2분
                const CHECK_INTERVAL = 1000; // 1초마다 체크

                let isReady = false;
                const startTime = Date.now();

                console.log("[PUPPETEER] Starting DOM-based image readiness check...");

                while (Date.now() - startTime < MAX_TIMEOUT) {
                    const ready = await page.evaluate(() => {
                        const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                        if (!img) return false;
                        return img.complete && img.naturalHeight > 0;
                    });

                    if (ready) {
                        isReady = true;
                        console.log("[PUPPETEER] Image fully loaded (DOM check passed).");
                        break;
                    }

                    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                }

                if (!isReady) {
                    throw new Error("Image did not finish loading within timeout.");
                }
                console.log("[PUPPETEER] Image readiness check completed.");

                // Update Redis with image ready status
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({
                        status: "processing",
                        stage: "image_ready",
                        message: "Image is ready based on DOM properties.",
                        timestamp: new Date().toISOString()
                    }),
                    { EX: 600 }
                );

                try {
                    const MAX_TIMEOUT = 120000;
                    const CHECK_INTERVAL = 1000;
                    const startTime = Date.now();
                    let imageUrl = null;

                    while (Date.now() - startTime < MAX_TIMEOUT) {
                        imageUrl = await page.evaluate(() => {
                            const imgs = document.querySelectorAll("img[alt='Generated image'], img[src^='blob:']");
                            if (imgs.length > 0) {
                                const img = imgs[imgs.length - 1]; // Get the last image element
                                return (img && img.complete && img.naturalHeight > 0) ? img.src : null;
                            }
                            return null;
                        });
                        if (imageUrl) break;
                        await page.waitForTimeout(CHECK_INTERVAL);
                    }

                    if (!imageUrl) throw new Error("Image did not finish loading within timeout.");

                    console.log("[PUPPETEER] Image fully loaded and URL extracted:", imageUrl);
                    lastImageUrl = imageUrl; // Store the newly generated image URL
                    dataUrl = imageUrl; // Assign imageUrl to dataUrl
                    // 여기서 URL을 직접 다운로드하거나 Redis에 저장
                } catch (waitError) {
                    console.error("[PUPPETEER] Error waiting for image:", waitError.message);
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                    return;
                }

            } catch (waitError) {
                console.error("[PUPPETEER] Error waiting for or extracting image:", waitError.message);
                // Report error to Redis
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                    { EX: 600 }
                );
                console.log(`[PUPPETEER] Image generation error for task ${task_id} reported to Redis.`);
                return; // Exit if image extraction failed
            }

            const downloadedImagePaths = [];
            if (dataUrl) { // dataUrl now holds the image URL
                try {
                    const filename = `${task_id}_0.png`; // Assuming one image per prompt for now
                    const dataDir = path.join('/app', 'data');
                    const imageSavePath = path.join(dataDir, filename);

                    if (!fs.existsSync(dataDir)) {
                        fs.mkdirSync(dataDir, { recursive: true });
                        importantLog(`[PUPPETEER] Created data directory: ${dataDir}`);
                    }

                    // Download image from URL
                    await new Promise((resolve, reject) => {
                        const downloadUrl = new URL(dataUrl);
                        downloadUrl.searchParams.append('_cache_buster', Date.now()); // Add cache-busting parameter
                        https.get(downloadUrl.toString(), (response) => {
                            importantLog(`[PUPPETEER] Downloading image from: ${downloadUrl.toString()}`); // Log the URL with cache-buster
                            importantLog(`[PUPPETEER] Response status: ${response.statusCode}`);
                            importantLog(`[PUPPETEER] Content-Type: ${response.headers['content-type']}`);
                            importantLog(`[PUPPETEER] Content-Length: ${response.headers['content-length'] || 'N/A'}`);

                            if (response.statusCode !== 200) {
                                reject(new Error(`Failed to get '${downloadUrl.toString()}' (${response.statusCode})`));
                                return;
                            }
                            const fileStream = fs.createWriteStream(imageSavePath);
                            response.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close();
                                importantLog(`[PUPPETEER] File stream finished for ${filename}.`);
                                resolve();
                            });
                            fileStream.on('error', (err) => {
                                importantLog(`[PUPPETEER] File stream error for ${filename}:`, err);
                                reject(err);
                            });
                        }).on('error', (err) => {
                                importantLog(`[PUPPETEER] HTTPS GET error for ${downloadUrl.toString()}:`, err);
                            reject(err);
                        });
                    });

                    downloadedImagePaths.push(`/data/${filename}`);
                    importantLog(`[PUPPETEER] Saved image: ${imageSavePath}`);

                    // Update Redis with completed status after saving the image
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({
                            status: "saved",
                            images: downloadedImagePaths,
                            timestamp: new Date().toISOString()
                        }),
                        { EX: 600 }
                    );

                } catch (saveError) {
                    importantLog(`[PUPPETEER] Error saving image from URL:`, saveError);
                    // Report error to Redis
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: saveError.message, timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                }
            } else {
                importantLog("[PUPPETEER] No image URL obtained for saving.");
                // This case should ideally be caught by the earlier try/catch, but as a fallback:
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: "No image URL obtained.", timestamp: new Date().toISOString() }),
                    { EX: 600 }
                );
            }
            console.log(`[PUPPETEER] Image generation results for task ${task_id} reported to Redis.`);

        } catch (error) {
            console.error(`[PUPPETEER] Error during image generation for task ${task_id}:`, error);
            const errorDetails = {
                name: error.name || "Error",
                message: error.message || "Unknown error",
                stack: error.stack || "No stack trace",
                timestamp: new Date().toISOString()
            };
            await redisClient.set(
                `puppeteer_image_generation_result:${task_id}`,
                JSON.stringify({ status: "error", error: errorDetails, timestamp: new Date().toISOString() }),
                { EX: 600 }
            );
            console.log(`[PUPPETEER] Image generation error for task ${task_id} reported to Redis.`);
        }
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