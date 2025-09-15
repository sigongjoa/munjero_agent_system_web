const { createClient } = require("redis");
const puppeteer = require("puppeteer");
const fs = require('fs');
const util = require('util');
const path = require("path");
const { URL } = require('url');

const logFile = fs.createWriteStream('/app/quiz_automation_worker_logs.txt', { flags: 'a' });

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
    logFile.write("[IMPORTANT] [QUIZ_AUTOMATION_WORKER] " + util.format.apply(null, args) + '\n');
}

function fileOnlyLog(...args) {
    logFile.write(util.format.apply(null, args) + '\n');
}

let browserInstance;
let pageInstance;

async function getBrowser() {
    importantLog("[QUIZ_AUTOMATION_WORKER] Entering getBrowser function.");
    if (!browserInstance || !pageInstance) {
        importantLog("[QUIZ_AUTOMATION_WORKER] Initializing new browser instance...");
        try {
            browserInstance = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--no-first-run',
                    '--user-data-dir=./user_data_quiz_automation', // Dedicated user data dir
                    '--profile-directory=Default'
                ]
            });
            importantLog("[QUIZ_AUTOMATION_WORKER] Browser launched successfully.");
            pageInstance = await browserInstance.newPage();
            importantLog("[QUIZ_AUTOMATION_WORKER] New page created.");
            await pageInstance.setViewport({ width: 1366, height: 768 });
            await pageInstance.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36');

            pageInstance.on('console', msg => {
                importantLog('[QUIZ_AUTOMATION_WORKER_PAGE_LOG]', msg.text());
            });
            pageInstance.on('request', request => {
                fileOnlyLog('[QUIZ_AUTOMATION_WORKER_NETWORK_REQ]', request.method(), request.url());
            });
            pageInstance.on('response', async response => {
                fileOnlyLog('[QUIZ_AUTOMATION_WORKER_NETWORK_RES]', response.status(), response.url());
            });
            pageInstance.on('pageerror', err => {
                importantLog('[QUIZ_AUTOMATION_WORKER_PAGE_ERROR]', err.message);
            });
            browserInstance.on('targetchanged', target => {
                importantLog('[QUIZ_AUTOMATION_WORKER_BROWSER_TARGET_CHANGED]', target.url());
            });
            browserInstance.on('disconnected', () => {
                importantLog('[QUIZ_AUTOMATION_WORKER_BROWSER_DISCONNECTED]');
            });

            importantLog("[QUIZ_AUTOMATION_WORKER] Browser instance created and configured.");
        } catch (error) {
            importantLog("[QUIZ_AUTOMATION_WORKER] Error during browser initialization:", error);
            throw error;
        }
    }
    importantLog("[QUIZ_AUTOMATION_WORKER] Exiting getBrowser function, returning page.");
    return pageInstance;
}

async function executeTask(task, redisClient) {
    importantLog(`[QUIZ_AUTOMATION_WORKER] Entering executeTask for task type: ${task.type}`);
    const page = await getBrowser();

    try {
        if (task.type === "generate_quiz_shorts") {
            const { generatedQuizData, userInput, task_id, frontend_url } = task.payload;
            importantLog(`[QUIZ_AUTOMATION_WORKER] Processing quiz shorts generation for task: ${task_id}`);

            const downloadPath = path.join(__dirname, 'data', 'quiz_shorts', task_id);
            if (!fs.existsSync(downloadPath)) {
                fs.mkdirSync(downloadPath, { recursive: true });
                importantLog(`[QUIZ_AUTOMATION_WORKER] Created download directory: ${downloadPath}`);
            }

            await page._client().send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath,
            });
            importantLog(`[QUIZ_AUTOMATION_WORKER] Set download behavior to allow downloads to: ${downloadPath}`);

            try {
                importantLog(`[QUIZ_AUTOMATION_WORKER] Navigating to frontend URL: ${frontend_url}`);
                await page.goto(frontend_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                importantLog("[QUIZ_AUTOMATION_WORKER] Frontend page loaded.");

                // Inject data into the frontend application
                importantLog("[QUIZ_AUTOMATION_WORKER] Injecting quiz data into frontend...");
                await page.evaluate((data) => {
                    if (window.loadQuizDataForAutomation) {
                        window.loadQuizDataForAutomation(data);
                    } else {
                        throw new Error("window.loadQuizDataForAutomation is not defined.");
                    }
                }, { generatedQuizData, userInput });
                importantLog("[QUIZ_AUTOMATION_WORKER] Quiz data injected. Waiting for QuizDisplay...");

                // Wait for QuizDisplay component to render
                await page.waitForSelector('[aria-label="quiz-display-container"]', { visible: true, timeout: 30000 });
                importantLog("[QUIZ_AUTOMATION_WORKER] QuizDisplay component rendered.");

                // Click PDF Download Button
                importantLog("[QUIZ_AUTOMATION_WORKER] Clicking PDF Download button...");
                await page.click('[aria-label="PDF 다운로드"]');
                importantLog("[QUIZ_AUTOMATION_WORKER] PDF Download button clicked.");
                await new Promise(r => setTimeout(r, 2000)); // Give time for download to initiate

                // Click JSON Download Button
                importantLog("[QUIZ_AUTOMATION_WORKER] Clicking JSON Download button...");
                await page.click('[aria-label="JSON 다운로드"]');
                importantLog("[QUIZ_AUTOMATION_WORKER] JSON Download button clicked.");
                await new Promise(r => setTimeout(r, 2000)); // Give time for download to initiate

                // Click AI Shorts Tab Button
                importantLog("[QUIZ_AUTOMATION_WORKER] Clicking AI Shorts Tab button...");
                await page.click('[aria-label="AI 쇼츠 대본 탭"]');
                importantLog("[QUIZ_AUTOMATION_WORKER] AI Shorts Tab button clicked. Waiting for #question-select...");

                // Wait for #question-select dropdown
                await page.waitForSelector('#question-select', { visible: true, timeout: 10000 });
                importantLog("[QUIZ_AUTOMATION_WORKER] #question-select dropdown found.");

                const numQuestions = generatedQuizData.quiz ? generatedQuizData.quiz.length : 0;
                const downloadedFiles = [];

                for (let i = 0; i < numQuestions; i++) {
                    importantLog(`[QUIZ_AUTOMATION_WORKER] Processing question ${i + 1}/${numQuestions}...`);
                    // Select each question
                    await page.select('#question-select', i.toString());
                    importantLog(`[QUIZ_AUTOMATION_WORKER] Selected question index: ${i}`);
                    await new Promise(r => setTimeout(r, 1000)); // Give time for UI to update

                    // Click Question Frame Download Button
                    importantLog("[QUIZ_AUTOMATION_WORKER] Clicking Question Frame Download button...");
                    await page.click('[aria-label="문제 프레임 다운로드"]');
                    importantLog("[QUIZ_AUTOMATION_WORKER] Question Frame Download button clicked.");
                    await new Promise(r => setTimeout(r, 2000)); // Give time for download to initiate

                    // Click Answer Frame Download Button
                    importantLog("[QUIZ_AUTOMATION_WORKER] Clicking Answer Frame Download button...");
                    await page.click('[aria-label="정답 프레임 다운로드"]');
                    importantLog("[QUIZ_AUTOMATION_WORKER] Answer Frame Download button clicked.");
                    await new Promise(r => setTimeout(r, 2000)); // Give time for download to initiate

                    // Click TTS Script Download Button
                    importantLog("[QUIZ_AUTOMATION_WORKER] Clicking TTS Script Download button...");
                    await page.click('[aria-label="TTS 대본 다운로드"]');
                    importantLog("[QUIZ_AUTOMATION_WORKER] TTS Script Download button clicked.");
                    await new Promise(r => setTimeout(r, 2000)); // Give time for download to initiate
                }

                // Wait for all expected files to be downloaded
                // This part is tricky. A robust solution would involve monitoring the download directory.
                // For now, we'll just wait a bit more.
                importantLog("[QUIZ_AUTOMATION_WORKER] Waiting for all downloads to complete...");
                await new Promise(r => setTimeout(r, numQuestions * 3000 + 5000)); // Heuristic wait time

                // List downloaded files (optional, for verification)
                const files = fs.readdirSync(downloadPath);
                importantLog(`[QUIZ_AUTOMATION_WORKER] Downloaded files in ${downloadPath}: ${files.join(', ')}`);
                downloadedFiles.push(...files.map(f => path.join(downloadPath, f)));

                await redisClient.set(`quiz_automation_result:${task_id}`, JSON.stringify({ status: "success", downloadedFiles, downloadPath }), { EX: 600 });
                importantLog(`[QUIZ_AUTOMATION_WORKER] Quiz shorts generation for task ${task_id} completed successfully.`);

            } catch (error) {
                importantLog(`[QUIZ_AUTOMATION_WORKER] Error during quiz shorts generation for task ${task_id}:`, error);
                const errorDetails = {
                    name: error.name || "Error",
                    message: error.message || "Unknown error",
                    stack: error.stack || "No stack trace",
                    timestamp: new Date().toISOString()
                };
                await redisClient.set(`quiz_automation_result:${task_id}`, JSON.stringify({ status: "error", error: errorDetails }), { EX: 600 });
            }
        } else {
            importantLog(`[QUIZ_AUTOMATION_WORKER] Unknown task type received: ${task.type}`);
        }
    } catch (error) {
        importantLog(`[QUIZ_AUTOMATION_WORKER] Unhandled error in executeTask for task type ${task.type}:`, error);
        throw error;
    } finally {
        importantLog(`[QUIZ_AUTOMATION_WORKER] Exiting executeTask for task type: ${task.type}`);
        if (browserInstance) {
            await browserInstance.close();
            browserInstance = null;
            pageInstance = null;
            importantLog("[QUIZ_AUTOMATION_WORKER] Browser closed after task completion.");
        }
    }
}

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "quiz_automation_queue";

async function main() {
    importantLog("[QUIZ_AUTOMATION_WORKER] Starting Puppeteer Quiz Automation worker...");
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => importantLog('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    importantLog("[REDIS] Connected to Redis successfully.");

    importantLog(`[REDIS] Quiz Automation Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                importantLog("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await executeTask(task, redisClient);
            }
        } catch (error) {
            importantLog("[QUIZ_AUTOMATION_WORKER] An error occurred in the main loop:", error);
            if (error.message.includes('detached Frame')) {
                importantLog('[QUIZ_AUTOMATION_WORKER] Detached frame error detected. Resetting browser instance.');
                browserInstance = null;
                pageInstance = null;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();