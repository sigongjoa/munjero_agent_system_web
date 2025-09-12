const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { URL } = require('url');
const util = require('util');

// Custom logger for important messages, mirroring worker.js
const logFile = fs.createWriteStream('/app/puppeteer_worker_logs.txt', { flags: 'a' });
function importantLog(...args) {
    logFile.write("[IMPORTANT] [TYPECAST_TTS] " + util.format.apply(null, args) + '\n');
}

const COOKIES_FILE = path.join(__dirname, "typecast_cookies.json");
const LOCAL_STORAGE_FILE = path.join(__dirname, "typecast_localStorage.json");

async function loadSession(page) {
    if (fs.existsSync(COOKIES_FILE)) {
        const cookiesString = fs.readFileSync(COOKIES_FILE);
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        importantLog("Loaded cookies for Typecast.");
    }
    if (fs.existsSync(LOCAL_STORAGE_FILE)) {
        const localStorageData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE));
        await page.evaluate(data => {
            for (const key in data) {
                localStorage.setItem(key, data[key]);
            }
        }, localStorageData);
        importantLog("Loaded localStorage for Typecast.");
    }
}

async function saveSession(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    importantLog("Saved cookies for Typecast.");

    const localStorageData = await page.evaluate(() => {
        let data = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    });
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(localStorageData, null, 2));
    importantLog("Saved localStorage for Typecast.");
}

async function generateTypecastTTS(page, textToConvert, filename, taskId, redisClient) {
    importantLog(`Starting Typecast TTS generation for task ${taskId} with text: "${textToConvert.substring(0, 50)}..."`);

    try {
        // Load session before navigating
        await loadSession(page);

        await page.goto("https://app.typecast.ai/ko/editor/68c3954a7c0b34aac16ca8e7", { waitUntil: 'domcontentloaded', timeout: 60000 });
        importantLog("Navigated to Typecast editor page.");

        // Check if login is required (e.g., by checking for a login form or specific element)
        // This is a simple check, might need refinement based on actual Typecast login flow
        const isLoggedIn = await page.evaluate(() => {
            // Look for an element that only appears after successful login, e.g., a user profile icon or editor element
            return document.querySelector('p[data-actor-id]') !== null;
        });

        if (!isLoggedIn) {
            importantLog("Typecast login required. Please log in manually in the opened browser.");
            // You might want to add a timeout here or a way to signal the user to log in
            // For now, we'll wait for the editor element to appear, assuming manual login will happen
            await page.waitForSelector('p[data-actor-id]', { timeout: 0 }); // Wait indefinitely for manual login
            importantLog("Manual login for Typecast successful. Saving session...");
            await saveSession(page);
        } else {
            importantLog("Already logged in to Typecast.");
        }

        // Input text into the script area
        const scriptAreaSelector = 'p[data-actor-id="603fa172a669dfd23f450abd"]';
        await page.waitForSelector(scriptAreaSelector, { visible: true });
        await page.evaluate((selector, text) => {
            const element = document.querySelector(selector);
            if (element) {
                element.textContent = text;
                // Dispatch input event to trigger any internal listeners
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, scriptAreaSelector, textToConvert);
        importantLog("Text input into script area.");

        // Click the download button
        const downloadButtonSelector = '#download-button';
        await page.waitForSelector(downloadButtonSelector, { visible: true });
        await page.click(downloadButtonSelector);
        importantLog("Clicked download button.");

        // Wait for the download modal to appear and select "오디오 파일"
        const audioFileOptionSelector = 'li.editor-popup-menu-item.t-body2:has(span:text("오디오 파일"))';
        await page.waitForSelector(audioFileOptionSelector, { visible: true });
        await page.click(audioFileOptionSelector);
        importantLog("Selected '오디오 파일' option.");

        // Wait for the download settings modal to appear
        const downloadSettingsModalSelector = 'div.custom-modal.col-xl-4'; // A more general selector for the modal
        await page.waitForSelector(downloadSettingsModalSelector, { visible: true });
        importantLog("Download settings modal appeared.");

        // Set filename
        const filenameInputSelector = 'div.option-container form.file-name-input input[type="text"]';
        await page.waitForSelector(filenameInputSelector, { visible: true });
        await page.evaluate((selector, name) => {
            const input = document.querySelector(selector);
            if (input) {
                input.value = name;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, filenameInputSelector, filename);
        importantLog(`Set filename to: "${filename}"`);

        // Select MP3 format (assuming it's the default or first option, or find by text)
        const mp3ButtonSelector = 'button.t-button.option.t-body3.bold:has(span:text("mp3"))';
        await page.waitForSelector(mp3ButtonSelector, { visible: true });
        await page.click(mp3ButtonSelector);
        importantLog("Selected MP3 format.");

        // Select "문장별로 나누기" (Split by sentence)
        const splitBySentenceButtonSelector = 'button.t-button.option.t-body3.bold:has(span:text("문장별로 나누기"))';
        await page.waitForSelector(splitBySentenceButtonSelector, { visible: true });
        await page.click(splitBySentenceButtonSelector);
        importantLog("Selected '문장별로 나누기'.");

        // Select "높음" (High quality)
        const highQualityButtonSelector = 'button.t-button.option.t-body3.bold:has(span:text("높음"))';
        await page.waitForSelector(highQualityButtonSelector, { visible: true });
        await page.click(highQualityButtonSelector);
        importantLog("Selected '높음' quality.");

        // Click the final confirm download button
        const confirmDownloadButtonSelector = 'button.t-button.confirm.t-button.medium.small.primary';
        await page.waitForSelector(confirmDownloadButtonSelector, { visible: true });
        await page.click(confirmDownloadButtonSelector);
        importantLog("Clicked final confirm download button.");

        // Set up download behavior
        const client = await page.target().createCDPSession();
        const downloadPath = path.join(__dirname, 'data', 'tts_audio');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
            importantLog(`Created download directory: ${downloadPath}`);
        }
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });
        importantLog(`Set download behavior to allow downloads to: ${downloadPath}`);

        // Wait for the download to complete (this is tricky, might need to poll for file existence)
        // Typecast downloads a ZIP file. We need to wait for the ZIP to appear.
        const expectedZipFilename = `${filename}.zip`; // Typecast usually zips multiple files
        const expectedZipFilePath = path.join(downloadPath, expectedZipFilename);

        importantLog(`Waiting for file to download: ${expectedZipFilePath}`);
        let downloadComplete = false;
        const maxWaitTime = 120000; // 2 minutes
        const checkInterval = 2000; // Check every 2 seconds
        const startTime = Date.now();

        while (!downloadComplete && (Date.now() - startTime < maxWaitTime)) {
            if (fs.existsSync(expectedZipFilePath)) {
                importantLog(`Downloaded file found: ${expectedZipFilePath}`);
                downloadComplete = true;
            } else {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
        }

        if (!downloadComplete) {
            throw new Error("TTS download timed out.");
        }

        importantLog("Typecast TTS generation complete.");
        return { status: "success", filePath: `/puppeteer_worker/data/tts_audio/${expectedZipFilename}` };

    } catch (error) {
        importantLog(`Error during Typecast TTS generation for task ${taskId}:`, error);
        return { status: "error", message: error.message };
    }
}

module.exports = { generateTypecastTTS, saveSession, loadSession, COOKIES_FILE, LOCAL_STORAGE_FILE };