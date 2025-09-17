const { createClient } = require("redis");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require('fs');
const util = require('util');
const path = require("path");
const { URL } = require('url');

const logFile = fs.createWriteStream('/app/chatgpt_worker_logs.txt', { flags: 'a' });

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

function importantLog(...args) {
    originalConsoleLog.apply(console, args);
    logFile.write("[IMPORTANT] [CHATGPT_WORKER] " + util.format.apply(null, args) + '\n');
}

function fileOnlyLog(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
}

let browserInstance;
let pageInstance;
let lastImageUrl = null; // Store the URL of the last generated image

async function getBrowser(profileName = 'default') {
    importantLog("[CHATGPT_WORKER] Entering getBrowser function.");
    if (!browserInstance || !pageInstance) {
        importantLog("[CHATGPT_WORKER] Initializing new browser instance...");
        try {
            browserInstance = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/chromium-browser',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--no-first-run',
                    `--user-data-dir=./user_data/${profileName}`, // Use profileName here
                    '--profile-directory=Default',
                    '--disable-accelerated-2d-canvas',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });
            importantLog("[CHATGPT_WORKER] Browser launched successfully.");
            pageInstance = await browserInstance.newPage();
            importantLog("[CHATGPT_WORKER] New page created.");
            await pageInstance.setViewport({ width: 1366, height: 768 });
            await pageInstance.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36');

            pageInstance.on('console', msg => {
                importantLog('[CHATGPT_WORKER_PAGE_LOG]', msg.text());
            });
            pageInstance.on('request', request => {
                fileOnlyLog('[CHATGPT_WORKER_NETWORK_REQ]', request.method(), request.url());
            });
            pageInstance.on('response', async response => {
                fileOnlyLog('[CHATGPT_WORKER_NETWORK_RES]', response.status(), response.url());
            });
            pageInstance.on('pageerror', err => {
                importantLog('[CHATGPT_WORKER_PAGE_ERROR]', err.message);
            });
            browserInstance.on('targetchanged', target => {
                importantLog('[CHATGPT_WORKER_BROWSER_TARGET_CHANGED]', target.url());
            });
            browserInstance.on('disconnected', () => {
                importantLog('[CHATGPT_WORKER_BROWSER_DISCONNECTED]');
            });

            importantLog("[CHATGPT_WORKER] Browser instance created and configured.");
        } catch (error) {
            importantLog("[CHATGPT_WORKER] Error during browser initialization:", error);
            throw error;
        }
    }
    importantLog("[CHATGPT_WORKER] Exiting getBrowser function, returning page.");
    return pageInstance;
}

async function executeTask(task, redisClient) {
    importantLog(`[CHATGPT_WORKER] Entering executeTask for task type: ${task.type}`);
    const { profile_name } = task.payload; // Extract profile_name
    const page = await getBrowser(profile_name);

    try {
        if (task.type === "manual_login_setup") {
            const { profile_name } = task.payload; // Extract profile_name
            importantLog("[CHATGPT_WORKER] Starting manual login setup...");
            importantLog("[CHATGPT_WORKER] Navigating to ChatGPT for manual login...");
            try {
                const page = await getBrowser(profile_name); // Pass profile_name
                await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded' });
                importantLog("[CHATGPT_WORKER] ChatGPT page loaded for manual login. Waiting for selector...");

                importantLog("[CHATGPT_WORKER] Please login manually in the opened browser...");
                await page.waitForSelector('div.flex.min-w0.grow.items-center', { timeout: 0 });
                importantLog("✅ Login successful - Account name detected.");
                return;
            } catch (error) {
                importantLog("[CHATGPT_WORKER] Error during manual login setup:", error);
                if (browserInstance) {
                    await browserInstance.close();
                    browserInstance = null;
                    pageInstance = null;
                    importantLog("[CHATGPT_WORKER] Browser closed due to manual login setup error.");
                }
                throw error;
            }
        } else if (task.type === "healthcheck") {
            importantLog("[CHATGPT_WORKER] Running ChatGPT healthcheck...");
            const healthcheckResults = {
                overall: "error",
                message: "ChatGPT healthcheck not completed.",
                details: {
                    login: "not_checked",
                    text_input: "not_checked"
                },
                timestamp: new Date().toISOString()
            };

            try {
                await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);

                const chatgptLoggedIn = await page.evaluate(() => {
                    return document.querySelector('div.flex.min-w-0.grow.items-center') !== null;
                });

                if (chatgptLoggedIn) {
                    healthcheckResults.details.login = "ok";
                    healthcheckResults.details.message = "Logged in.";

                    const promptInputSelector = '#prompt-textarea';
                    const canType = await page.evaluate((selector) => {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.value = 'test message';
                            return el.value === 'test message';
                        }
                        return false;
                    }, promptInputSelector);

                    if (canType) {
                        healthcheckResults.details.text_input = "ok";
                        healthcheckResults.details.message += " Text input successful.";
                    } else {
                        healthcheckResults.details.text_input = "error";
                        healthcheckResults.details.message += " Text input failed.";
                    }
                } else {
                    healthcheckResults.details.login = "error";
                    healthcheckResults.details.message = "Not logged in.";
                }

                if (healthcheckResults.details.login === "ok" && healthcheckResults.details.text_input === "ok") {
                    healthcheckResults.overall = "ok";
                    healthcheckResults.message = "ChatGPT checks passed.";
                } else {
                    healthcheckResults.overall = "error";
                    healthcheckResults.message = "Some ChatGPT checks failed. See details.";
                }

            } catch (chatgptErr) {
                healthcheckResults.overall = "error";
                healthcheckResults.message = `Error during ChatGPT healthcheck: ${chatgptErr.message}`;
                importantLog(`[CHATGPT_WORKER] Error during ChatGPT healthcheck: ${chatgptErr.message}`);
            } finally {
                await redisClient.set(`chatgpt_healthcheck_result:${task.id}`, JSON.stringify(healthcheckResults), { EX: 15 });
                importantLog("[CHATGPT_WORKER] Healthcheck result set to Redis.");
            }
            return;
        } else if (task.type === "generate_image_from_prompt") {
            const { prompt, task_id } = task.payload;
            importantLog(`[CHATGPT_WORKER] Generating image for prompt: "${prompt}" (Task ID: ${task_id})...");

            try {
                importantLog("[CHATGPT_WORKER] Navigating to ChatGPT for image generation...");
                await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded' });
                importantLog("[CHATGPT_WORKER] ChatGPT page loaded for image generation.");

                const promptInputSelector = '#prompt-textarea';
                importantLog(`[CHATGPT_WORKER] Waiting for prompt input selector: ${promptInputSelector}`);
                await page.waitForSelector(promptInputSelector, { visible: true, timeout: 30000 });
                importantLog("[CHATGPT_WORKER] Prompt input selector found. Typing prompt...");
                await page.type(promptInputSelector, prompt);
                importantLog(`[CHATGPT_WORKER] Prompt entered: "${prompt}"`);

                importantLog("[CHATGPT_WORKER] Capturing existing images before generation...");
                const beforeImgs = await page.evaluate(() => {
                    const imgs = Array.from(document.querySelectorAll("img[alt='Generated image'], img[src^='blob:']"));
                    return imgs.map(img => img.src);
                });
                importantLog(`[CHATGPT_WORKER] Found ${beforeImgs.length} existing images before generation.`);

                const submitButtonSelector = 'button[data-testid="send-button"]';
                importantLog(`[CHATGPT_WORKER] Waiting for submit button selector: ${submitButtonSelector}`);
                try {
                    await page.waitForSelector(submitButtonSelector, { visible: true, timeout: 10000 });
                    importantLog("[CHATGPT_WORKER] Submit button found. Clicking...");
                    await page.click(submitButtonSelector);
                    importantLog("[CHATGPT_WORKER] Clicked submit button.");
                } catch (clickError) {
                    importantLog("[CHATGPT_WORKER] Submit button click failed, trying Enter key:", clickError.message);
                    await page.keyboard.press("Enter");
                    importantLog("[CHATGPT_WORKER] Pressed Enter key as fallback.");
                }

                importantLog("[CHATGPT_WORKER] Waiting for image element to clear or change...");
                await page.waitForFunction(() => {
                    const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                    return !img || !img.src || img.src.startsWith('data:image/svg') || img.src.startsWith('blob:');
                }, { timeout: 10000 });
                importantLog("[CHATGPT_WORKER] Image element cleared or changed.");

                importantLog("[CHATGPT_WORKER] Waiting for 'Stop streaming' aria-label via waitForFunction...");
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
                }, { timeout: 300000 });
                importantLog("[CHATGPT_WORKER] Image generation started...");

                if (lastImageUrl) {
                    importantLog("[CHATGPT_WORKER] Waiting for new image URL to be different from previous one...");
                    const MAX_WAIT_TIME = 60000;
                    const CHECK_INTERVAL = 1000;
                    const startTime = Date.now();
                    let currentExtractedImageUrl = null;

                    while (Date.now() - startTime < MAX_WAIT_TIME) {
                        currentExtractedImageUrl = await page.evaluate(() => {
                            const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                            return (img && img.complete && img.naturalHeight > 0) ? img.src : null;
                        });

                        if (currentExtractedImageUrl && currentExtractedImageUrl !== lastImageUrl) {
                            importantLog("[CHATGPT_WORKER] New image URL detected.");
                            break;
                        }
                        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                    }

                    if (!currentExtractedImageUrl || currentExtractedImageUrl === lastImageUrl) {
                        importantLog("[CHATGPT_WORKER] New image URL was not detected within timeout or is same as previous.");
                    }
                }

                let dataUrl = null;
                let interval = null;
                try {
                    importantLog("[CHATGPT_WORKER] Starting aria-label monitoring interval.");
                    interval = setInterval(async () => {
                        try {
                            const button = await page.$('#composer-submit-button');
                            if (button) {
                                const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
                                importantLog(`[CHATGPT_WORKER] Button found. Current aria-label: ${ariaLabel}`);
                            } else {
                                importantLog("[CHATGPT_WORKER] Button not found during interval check.");
                            }
                        } catch (e) {
                            importantLog(`[CHATGPT_WORKER] Error during aria-label check: ${e.message}`);
                        }
                    }, 5000);

                    importantLog("[CHATGPT_WORKER] Waiting for 'Start voice mode' button...");
                    try {
                        await page.waitForSelector('button[data-testid="composer-speech-button"][aria-label="Start voice mode"]', {
                            timeout: 300000,
                        });
                        importantLog("[CHATGPT_WORKER] 'Start voice mode' button found.");
                    } catch (e) {
                        importantLog(`[CHATGPT_WORKER] Error waiting for 'Start voice mode' button: ${e.message}`);
                        throw e;
                    }
                    importantLog("[CHATGPT_WORKER] Generation finished, back to voice mode.");

                    page.on('response', (response) => {
                        importantLog(`[CHATGPT_WORKER] Network response: ${response.status()} ${response.url()}`);
                    });

                    const img = await page.$('img');
                    if (img) {
                        importantLog("[CHATGPT_WORKER] Image found after generation.");
                    } else {
                        importantLog("[CHATGPT_WORKER] No image found after generation.");
                    }

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

                    const MAX_TIMEOUT = 120000;
                    const CHECK_INTERVAL = 1000;
                    let isReady = false;
                    const startTime = Date.now();

                    importantLog("[CHATGPT_WORKER] Starting DOM-based image readiness check...");

                    while (Date.now() - startTime < MAX_TIMEOUT) {
                        const ready = await page.evaluate(() => {
                            const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                            if (!img) return false;
                            return img.complete && img.naturalHeight > 0;
                        });

                        if (ready) {
                            isReady = true;
                            importantLog("[CHATGPT_WORKER] Image fully loaded (DOM check passed).");
                            break;
                        }
                        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                    }

                    if (!isReady) {
                        throw new Error("Image did not finish loading within timeout.");
                    }
                    importantLog("[CHATGPT_WORKER] Image readiness check completed.");

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
                                    const img = imgs[imgs.length - 1];
                                    return (img && img.complete && img.naturalHeight > 0) ? img.src : null;
                                }
                                return null;
                            });
                            if (imageUrl) break;
                            await page.waitForTimeout(CHECK_INTERVAL);
                        }

                        if (!imageUrl) throw new Error("Image did not finish loading within timeout.");

                        importantLog("[CHATGPT_WORKER] Image fully loaded and URL extracted:", imageUrl);
                        lastImageUrl = imageUrl;
                        dataUrl = imageUrl;
                    } catch (waitError) {
                        importantLog("[CHATGPT_WORKER] Error waiting for image:", waitError.message);
                        await redisClient.set(
                            `puppeteer_image_generation_result:${task_id}`,
                            JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                            { EX: 600 }
                        );
                        return;
                    }

                } catch (waitError) {
                    importantLog("[CHATGPT_WORKER] Error waiting for or extracting image:", waitError.message);
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                    importantLog(`[CHATGPT_WORKER] Image generation error for task ${task_id} reported to Redis.`);
                    return;
                }

                const downloadedImagePaths = [];
                if (dataUrl) {
                    try {
                        const filename = `${task_id}_0.png`;
                        const dataDir = path.join('/app', 'data');
                        const imageSavePath = path.join(dataDir, filename);

                        if (!fs.existsSync(dataDir)) {
                            fs.mkdirSync(dataDir, { recursive: true });
                            importantLog(`[CHATGPT_WORKER] Created data directory: ${dataDir}`);
                        }

                        await new Promise((resolve, reject) => {
                            const downloadUrl = new URL(dataUrl);
                            downloadUrl.searchParams.append('_cache_buster', Date.now());
                            https.get(downloadUrl.toString(), (response) => {
                                importantLog(`[CHATGPT_WORKER] Downloading image from: ${downloadUrl.toString()}`);
                                importantLog(`[CHATGPT_WORKER] Response status: ${response.statusCode}`);
                                importantLog(`[CHATGPT_WORKER] Content-Type: ${response.headers['content-type']}`);
                                importantLog(`[CHATGPT_WORKER] Content-Length: ${response.headers['content-length'] || 'N/A'}`);

                                if (response.statusCode !== 200) {
                                    reject(new Error(`Failed to get '${downloadUrl.toString()}' (${response.statusCode})`));
                                    return;
                                }
                                const fileStream = fs.createWriteStream(imageSavePath);
                                response.pipe(fileStream);
                                fileStream.on('finish', () => {
                                    fileStream.close();
                                    importantLog(`[CHATGPT_WORKER] File stream finished for ${filename}.`);
                                    resolve();
                                });
                                fileStream.on('error', (err) => {
                                    importantLog(`[CHATGPT_WORKER] File stream error for ${filename}:`, err);
                                    reject(err);
                                });
                            }).on('error', (err) => {
                                importantLog(`[CHATGPT_WORKER] HTTPS GET error for ${downloadUrl.toString()}:`, err);
                                reject(err);
                            });
                        });

                        downloadedImagePaths.push(`/data/${filename}`);
                        importantLog(`[CHATGPT_WORKER] Saved image: ${imageSavePath}`);

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
                        importantLog(`[CHATGPT_WORKER] Error saving image from URL:`, saveError);
                        await redisClient.set(
                            `puppeteer_image_generation_result:${task_id}`,
                            JSON.stringify({ status: "error", error: saveError.message, timestamp: new Date().toISOString() }),
                            { EX: 600 }
                        );
                    }
                } else {
                    importantLog("[CHATGPT_WORKER] No image URL obtained for saving.");
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                            JSON.stringify({ status: "error", error: "No image URL obtained.", timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                }
                importantLog(`[CHATGPT_WORKER] Image generation results for task ${task_id} reported to Redis.`);

            } catch (error) {
                importantLog(`[CHATGPT_WORKER] Error during image generation for task ${task_id}:`, error);
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
                importantLog(`[CHATGPT_WORKER] Image generation error for task ${task_id} reported to Redis.`);
            }
        } else {
            importantLog(`[CHATGPT_WORKER] Unknown task type received: ${task.type}`);
        }
    } catch (error) {
        importantLog(`[CHATGPT_WORKER] Unhandled error in executeTask for task type ${task.type}:`, error);
        throw error;
    } finally {
        importantLog(`[CHATGPT_WORKER] Exiting executeTask for task type: ${task.type}`);
    }
}

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_chatgpt_tasks_list";

async function main() {
    importantLog("[CHATGPT_WORKER] Starting Puppeteer ChatGPT worker...");
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => importantLog('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    importantLog("[REDIS] Connected to Redis successfully.");

    importantLog(`[REDIS] ChatGPT Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                importantLog("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await executeTask(task, redisClient);
            }
        } catch (error) {
            importantLog("[CHATGPT_WORKER] An error occurred in the main loop:", error);
            if (error.message.includes('detached Frame')) {
                importantLog('[CHATGPT_WORKER] Detached frame error detected. Resetting browser instance.');
                browserInstance = null;
                pageInstance = null;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
