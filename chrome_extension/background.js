// background.js
console.log("Ext_BG(1): Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://127.0.0.1:8765";
let websocket;

// --- State Management ---
const readyTabIds = new Set();
const messageQueue = new Map();

function connectWebSocket() {
    console.log("Ext_BG(2): Attempting to connect WebSocket to: " + WEBSOCKET_SERVER_URL);
    websocket = new WebSocket(WEBSOCKET_SERVER_URL);

    websocket.onopen = () => {
        console.log("Ext_BG(3): WebSocket connected successfully!");
        websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
    };

    websocket.onmessage = (event) => {
        console.log("Ext_BG(6): WebSocket message received.");
        const data = JSON.parse(event.data);

        if (data.type === "SEND_TO_CHATGPT") {
            console.log("Ext_BG(6a): Received SEND_TO_CHATGPT command from server.");
            handleSendToChatGPT(data.payload);
        }
    };

    websocket.onclose = (event) => {
        console.log(`Ext_BG(E1): WebSocket disconnected: Code ${event.code}`);
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = (error) => {
        console.error("Ext_BG(E2): WebSocket error:", error);
        websocket.close();
    };
}

function handleSendToChatGPT(payload) {
    console.log("Ext_BG(7): handleSendToChatGPT called.");
    chrome.tabs.query({ url: ["*://chat.openai.com/*", "*://chatgpt.com/*"] }, (tabs) => {
        if (tabs && tabs.length > 0) {
            const tabId = tabs[0].id;
            console.log(`Ext_BG(7a): Found ChatGPT tab ${tabId}.`);

            if (readyTabIds.has(tabId)) {
                console.log(`Ext_BG(7b): Tab ${tabId} is in ready set. Sending message immediately.`);
                const messageToSend = { type: "SEND_TO_CHATGPT", payload: payload };
                console.log("Ext_BG(DEBUG): Preparing to send message with corrected payload structure:", messageToSend);
                sendMessageToContentScript(tabId, messageToSend);
            } else {
                console.log(`Ext_BG(7c): Tab ${tabId} is not ready. Queuing message.`);
                if (!messageQueue.has(tabId)) {
                    messageQueue.set(tabId, []);
                }
                messageQueue.get(tabId).push({ type: "SEND_TO_CHATGPT", ...payload });
            }
        } else {
            console.warn("Ext_BG(W1): ChatGPT tab not found.");
        }
    });
}

function sendMessageToContentScript(tabId, message) {
    console.log(`Ext_BG(8): Sending message of type '${message.type}' to tab ${tabId}.`);
    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Ext_BG(E3): Error sending message:", chrome.runtime.lastError.message);
        } else {
            console.log("Ext_BG(9): Response from content script:", response);
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`Ext_BG(4): Received message: ${message.type} from sender`, sender);

    if (message.type === "CONTENT_SCRIPT_READY") {
        if (sender.tab && sender.tab.id) {
            const tabId = sender.tab.id;
            console.log(`Ext_BG(4a): Received CONTENT_SCRIPT_READY from tab ${tabId}. Adding to ready set.`);
            readyTabIds.add(tabId);
            
            if (messageQueue.has(tabId)) {
                const queuedMessages = messageQueue.get(tabId);
                console.log(`Ext_BG(5): Found ${queuedMessages.length} queued message(s) for tab ${tabId}. Sending now.`);
                queuedMessages.forEach(msg => sendMessageToContentScript(tabId, msg));
                messageQueue.delete(tabId);
            }
            sendResponse({status: "Ready signal received for tab " + tabId});
        } else {
            console.warn("Ext_BG(W2): Received CONTENT_SCRIPT_READY from a sender without a tab object.");
            sendResponse({status: "Ready signal received from non-tab sender"});
        }
    } 
    else if (sender.tab && sender.tab.id) {
        const tabId = sender.tab.id;
        if (message.type === "CHATGPT_OUTPUT") {
            console.log(`Ext_BG(10): Received CHATGPT_OUTPUT from tab ${tabId}.`);
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify(message));
                console.log("Ext_BG(11): Sent CHATGPT_OUTPUT to server.");
            }
            sendResponse({status: "Output received"});
        }
    }
    return true; // Keep message port open for async response
});

console.log("Ext_BG(1a): Adding message listener and connecting WebSocket.");
connectWebSocket();
