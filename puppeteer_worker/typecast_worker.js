const { createClient } = require("redis");
const puppeteer = require("puppeteer");
const fs = require('fs');
const util = require('util');
const path = require("path");

const logFile = fs.createWriteStream('/app/typecast_worker_logs.txt', { flags: 'a' });

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
    logFile.write("[IMPORTANT] [TYPECAST_TTS] " + util.format.apply(null, args) + '\n');
}

function fileOnlyLog(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
}

let browserInstance;
let pageInstance;

async function getBrowser(profileName = 'default') { // Add profileName with a default value
    importantLog("[TYPECAST_TTS] Entering getBrowser function for Typecast.");
    if (!browserInstance || !pageInstance) {
        importantLog("[TYPECAST_TTS] Initializing new browser instance for Typecast...");
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
            importantLog("[TYPECAST_TTS] Browser launched successfully for Typecast.");
            pageInstance = await browserInstance.newPage();
            importantLog("[TYPECAST_TTS] New page created for Typecast.");
            await pageInstance.setViewport({ width: 1366, height: 768 });
            await pageInstance.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36');

            pageInstance.on('console', msg => {
                importantLog('[TYPECAST_TTS_PAGE_LOG]', msg.text());
            });
            pageInstance.on('request', request => {
                fileOnlyLog('[TYPECAST_TTS_NETWORK_REQ]', request.method(), request.url());
            });
            pageInstance.on('response', async response => {
                fileOnlyLog('[TYPECAST_TTS_NETWORK_RES]', response.status(), response.url());
            });
            pageInstance.on('pageerror', err => {
                importantLog('[TYPECAST_TTS_PAGE_ERROR]', err.message);
            });
            browserInstance.on('targetchanged', target => {
                importantLog('[TYPECAST_TTS_BROWSER_TARGET_CHANGED]', target.url());
            });
            browserInstance.on('disconnected', () => {
                importantLog('[TYPECAST_TTS_BROWSER_DISCONNECTED]');
            });

            importantLog("[TYPECAST_TTS] Browser instance created and configured for Typecast.");
        } catch (error) {
            importantLog("[TYPECAST_TTS] Error during browser initialization for Typecast:", error);
            throw error;
        }
    }
    importantLog("[TYPECAST_TTS] Exiting getBrowser function for Typecast, returning page.");
    return pageInstance;
}

async function generateTypecastTTS(page, textToConvert, filename, taskId, redisClient) {
    importantLog(`[TYPECAST_TTS] Entering generateTypecastTTS for task ${taskId} with text: "${textToConvert.substring(0, 50)}..."`);

    try {
        importantLog("[TYPECAST_TTS] Navigating to Typecast editor page...");
        await page.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded', timeout: 60000 });
        importantLog("[TYPECAST_TTS] Navigated to Typecast editor page.");
        await new Promise(r => setTimeout(r, 3000)); // Add a 3-second delay

        importantLog("[TYPECAST_TTS] Checking login status...");
        const isLoggedIn = await page.evaluate(() => {
            return document.querySelector('p[data-actor-id]') !== null;
        });
        importantLog(`[TYPECAST_TTS] Is logged in: ${isLoggedIn}`);

        if (!isLoggedIn) {
            importantLog("[TYPECAST_TTS] Typecast login required. Waiting for manual login...");
            await page.waitForSelector('p[data-actor-id]', { timeout: 0 });
            importantLog("[TYPECAST_TTS] Manual login for Typecast successful.");
        } else {
            importantLog("[TYPECAST_TTS] Already logged in to Typecast.");
        }

        const scriptAreaSelector = 'p[data-actor-id="603fa172a669dfd23f450abd"]';
        importantLog(`[TYPECAST_TTS] Waiting for script area selector: ${scriptAreaSelector}`);
        await page.waitForSelector(scriptAreaSelector, { visible: true });
        importantLog("[TYPECAST_TTS] Script area found. Inputting text...");
        await page.evaluate((selector, text) => {
            const element = document.querySelector(selector);
            if (element) {
                element.textContent = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, scriptAreaSelector, textToConvert);
        importantLog("[TYPECAST_TTS] Text input into script area.");
        await new Promise(r => setTimeout(r, 2000)); // Add a 2-second delay

        const downloadButtonSelector = '#download-button';
        importantLog(`[TYPECAST_TTS] Waiting for download button selector: ${downloadButtonSelector}`);
        await page.waitForSelector(downloadButtonSelector, { visible: true });
        importantLog("[TYPECAST_TTS] Download button found. Clicking...");
        await page.click(downloadButtonSelector);
        importantLog("[TYPECAST_TTS] Clicked download button.");
        await new Promise(r => setTimeout(r, 2000)); // Add a 2-second delay

        importantLog("[TYPECAST_TTS] Waiting for '오디오 파일' option to appear...");
        await page.waitForSelector('li.editor-popup-menu-item.t-body2', { visible: true });
        importantLog("[TYPECAST_TTS] '오디오 파일' option found. Evaluating and clicking...");
        await page.evaluate(() => {
            const elements = document.querySelectorAll('li.editor-popup-menu-item.t-body2');
            for (const el of elements) {
                if (el.innerText.includes('오디오 파일')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });
        importantLog("[TYPECAST_TTS] Selected '오디오 파일' option.");
        await new Promise(r => setTimeout(r, 2000)); // Add a 2-second delay

        const downloadSettingsModalSelector = 'div.custom-modal.col-xl-4';
        importantLog(`[TYPECAST_TTS] Waiting for download settings modal: ${downloadSettingsModalSelector}`);
        await page.waitForSelector(downloadSettingsModalSelector, { visible: true });
        importantLog("[TYPECAST_TTS] Download settings modal appeared.");

        const filenameInputSelector = 'div.option-container form.file-name-input input[type="text"]';
        importantLog(`[TYPECAST_TTS] Waiting for filename input selector: ${filenameInputSelector}`);
        await page.waitForSelector(filenameInputSelector, { visible: true });
        importantLog("[TYPECAST_TTS] Filename input found. Setting filename...");
        await page.evaluate((selector, name) => {
            const input = document.querySelector(selector);
            if (input) {
                input.value = name;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, filenameInputSelector, filename);
        importantLog(`[TYPECAST_TTS] Set filename to: "${filename}"`);
        await new Promise(r => setTimeout(r, 1000)); // Add a 1-second delay

        importantLog("[TYPECAST_TTS] Selecting MP3 format...");
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button.t-button.option.t-body3.bold');
            for (const el of elements) {
                if (el.innerText.includes('mp3')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });
        importantLog("[TYPECAST_TTS] Selected MP3 format.");
        await new Promise(r => setTimeout(r, 1000)); // Add a 1-second delay

        importantLog("[TYPECAST_TTS] Selecting '문장별로 나누기' option...");
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button.t-button.option.t-body3.bold');
            for (const el of elements) {
                if (el.innerText.includes('문장별로 나누기')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });
        importantLog("[TYPECAST_TTS] Selected '문장별로 나누기'.");
        await new Promise(r => setTimeout(r, 1000)); // Add a 1-second delay

        importantLog("[TYPECAST_TTS] Selecting '높음' quality...");
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button.t-button.option.t-body3.bold');
            for (const el of elements) {
                if (el.innerText.includes('높음')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });
        importantLog("[TYPECAST_TTS] Selected '높음' quality.");
        await new Promise(r => setTimeout(r, 1000)); // Add a 1-second delay

        const confirmDownloadButtonSelector = 'button.t-button.confirm.t-button.medium.small.primary';
        importantLog(`[TYPECAST_TTS] Waiting for confirm download button: ${confirmDownloadButtonSelector}`);
        await page.waitForSelector(confirmDownloadButtonSelector, { visible: true });
        importantLog("[TYPECAST_TTS] Confirm download button found. Clicking...");
        await page.click(confirmDownloadButtonSelector);
        importantLog("[TYPECAST_TTS] Clicked final confirm download button.");
        await new Promise(r => setTimeout(r, 3000)); // Add a 3-second delay

        importantLog("[TYPECAST_TTS] Setting up download behavior...");
        const client = await page.target().createCDPSession();
        const downloadPath = path.join(__dirname, 'data', 'tts_audio');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
            importantLog(`[TYPECAST_TTS] Created download directory: ${downloadPath}`);
        }
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });
        importantLog(`[TYPECAST_TTS] Set download behavior to allow downloads to: ${downloadPath}`);

        const expectedZipFilename = `${filename}.zip`;
        const expectedZipFilePath = path.join(downloadPath, expectedZipFilename);

        importantLog(`[TYPECAST_TTS] Waiting for file to download: ${expectedZipFilePath}`);
        let downloadComplete = false;
        const maxWaitTime = 120000;
        const checkInterval = 2000;
        const startTime = Date.now();

        while (!downloadComplete && (Date.now() - startTime < maxWaitTime)) {
            if (fs.existsSync(expectedZipFilePath)) {
                importantLog(`[TYPECAST_TTS] Downloaded file found: ${expectedZipFilePath}`);
                downloadComplete = true;
            } else {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
        }

        if (!downloadComplete) {
            throw new Error("TTS download timed out.");
        }

        importantLog("[TYPECAST_TTS] Typecast TTS generation complete.");
        return { status: "success", filePath: `/puppeteer_worker/data/tts_audio/${expectedZipFilename}` };

    } catch (error) {
        importantLog(`[TYPECAST_TTS] Error during Typecast TTS generation for task ${taskId}:`, error);
        return { status: "error", message: error.message };
    } finally {
        importantLog(`[TYPECAST_TTS] Exiting generateTypecastTTS for task ${taskId}.`);
    }
}

async function executeTask(task, redisClient) {
    importantLog(`[TYPECAST_TTS] Entering executeTask for task type: ${task.type}`);
    const { profile_name } = task.payload; // Extract profile_name
    const page = await getBrowser(profile_name);

    try {
        if (task.type === "generate_tts_typecast") {
            const { text_to_convert, filename, task_id } = task.payload;
            importantLog(`[TYPECAST_TTS] Processing generate_tts_typecast task: ${task_id}`);
            const result = await generateTypecastTTS(page, text_to_convert, filename, task_id, redisClient);
            await redisClient.set(`puppeteer_response:${task_id}`, JSON.stringify(result), { EX: 600 });
            importantLog(`[TYPECAST_TTS] Typecast TTS result for task ${task_id} reported to Redis.`);
        } else if (task.type === "healthcheck") {
            importantLog("[TYPECAST_TTS] Running Typecast healthcheck...");
            const healthcheckResults = {
                overall: "error",
                message: "Typecast healthcheck not completed.",
                details: {
                    login: "not_checked",
                    text_input: "not_checked"
                },
                timestamp: new Date().toISOString()
            };

            try {
                await page.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);

                const typecastLoggedIn = await page.evaluate(() => {
                    return document.querySelector('p[data-actor-id]') !== null;
                });

                if (typecastLoggedIn) {
                    healthcheckResults.details.login = "ok";
                    healthcheckResults.details.message = "Logged in.";

                    const scriptAreaSelector = 'p[data-actor-id="603fa172a669dfd23f450abd"]';
                    const canType = await page.evaluate((selector) => {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.textContent = 'test message';
                            return el.textContent === 'test message';
                        }
                        return false;
                    }, scriptAreaSelector);

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
                    healthcheckResults.message = "Typecast checks passed.";
                } else {
                    healthcheckResults.overall = "error";
                    healthcheckResults.message = "Some Typecast checks failed. See details.";
                }

            } catch (typecastErr) {
                healthcheckResults.overall = "error";
                healthcheckResults.message = `Error during Typecast healthcheck: ${typecastErr.message}`;
                importantLog(`[TYPECAST_TTS] Error during Typecast healthcheck: ${typecastErr.message}`);
            } finally {
                await redisClient.set(`typecast_healthcheck_result:${task.id}`, JSON.stringify(healthcheckResults), { EX: 15 });
                importantLog("[TYPECAST_TTS] Healthcheck result set to Redis.");
            }
            return;
        } else if (task.type === "manual_login_setup_typecast") {
            importantLog("[TYPECAST_TTS] Starting manual login setup for Typecast...");
            importantLog("[TYPECAST_TTS] Navigating to Typecast for manual login...");
            try {
                await page.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded' });
                importantLog("[TYPECAST_TTS] Typecast page loaded for manual login. Waiting for selector...");

                importantLog("[TYPECAST_TTS] Please login manually in the opened browser for Typecast...");
                await page.waitForSelector('p[data-actor-id="603fa172a669dfd23f450abd"]', { timeout: 0 });
                importantLog("✅ Typecast Login successful - Editor element detected.");
                importantLog("✅ Typecast session saved automatically.");
                return;
            } catch (error) {
                importantLog("[TYPECAST_TTS] Error during Typecast manual login setup:", error);
                if (browserInstance) {
                    await browserInstance.close();
                    browserInstance = null;
                    pageInstance = null;
                    importantLog("[TYPECAST_TTS] Browser closed due to Typecast manual login setup error.");
                }
                throw error;
            }
        } else {
            importantLog(`[TYPECAST_TTS] Unknown task type received: ${task.type}`);
        }
    } catch (error) {
        importantLog(`[TYPECAST_TTS] Unhandled error in executeTask for task type ${task.type}:`, error);
        throw error;
    } finally {
        importantLog(`[TYPECAST_TTS] Exiting executeTask for task type: ${task.type}`);
    }
}

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_typecast_tasks_list"; // Separate Redis list for Typecast tasks

async function main() {
    importantLog("[TYPECAST_TTS] Starting Puppeteer Typecast worker...");
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => importantLog('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    importantLog("[REDIS] Connected to Redis successfully.");

    importantLog(`[REDIS] Typecast Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

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
                browserInstance = null;
                pageInstance = null;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();