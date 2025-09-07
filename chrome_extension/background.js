// background.js
// This is the service worker for the Chrome Extension.
// It runs in the background and handles events and communication.

console.log("Ext_BG: Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://127.0.0.1:8765/ws"; // Connect to the Nginx proxied WebSocket server
let websocket;

// Map to track if content script is ready for a given tabId
const contentScriptReady = new Map(); // tabId -> boolean
// Map to queue messages for content scripts that are not yet ready
const messageQueue = new Map(); // tabId -> [messages]

function connectWebSocket() {
    console.log("Ext_BG: Attempting to connect WebSocket to: " + WEBSOCKET_SERVER_URL);
    websocket = new WebSocket(WEBSOCKET_SERVER_URL);

    websocket.onopen = () => {
        console.log("Ext_BG: WebSocket connected.");
        console.log("✅ WebSocket connection established successfully!"); // Add clear success log
        // Send a message to the Agent AI when connected
        websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
        console.log("Ext_BG: Sent EXTENSION_READY message.");
    };

    websocket.onmessage = (event) => {
        console.log("Ext_BG: WebSocket message received:", event.data);
        const data = JSON.parse(event.data);

        if (data.type === "SEND_TO_CHATGPT") {
            console.log("Ext_BG: Received SEND_TO_CHATGPT message from WebSocket.");
            const prompt = data.payload;
            console.log("Ext_BG: Attempting to send SEND_TO_CHATGPT to content script.");
            // Send message to content script (which is injected into ChatGPT page)
            chrome.tabs.query({}, (tabs) => {
                console.log("Ext_BG: chrome.tabs.query result:", tabs);
                const chatgptTab = tabs.find(tab => tab.url && (tab.url.includes("chatgpt.com") || tab.url.includes("chat.openai.com")));

                if (chatgptTab) {
                    console.log("Ext_BG: Found ChatGPT tab. Tab ID:", chatgptTab.id, "URL:", chatgptTab.url);
                    const tabId = chatgptTab.id;

                    if (contentScriptReady.get(tabId)) {
                        console.log(`Ext_BG: Content script for tab ${tabId} is ready. Sending message immediately.`);
                        sendMessageToContentScript(tabId, { type: "SEND_TO_CHATGPT", payload: prompt });
                    } else {
                        console.log(`Ext_BG: Content script for tab ${tabId} not ready. Queuing message.`);
                        if (!messageQueue.has(tabId)) {
                            messageQueue.set(tabId, []);
                        }
                        messageQueue.get(tabId).push({ type: "SEND_TO_CHATGPT", payload: prompt });
                    }
                } else {
                    console.warn("Ext_BG: ChatGPT tab not found.");
                    // Optionally, send an error back to the Agent AI
                }
            });
        }
    };

    websocket.onclose = (event) => {
        console.log(`Ext_BG: WebSocket disconnected: Code ${event.code}, Reason: ${event.reason}`);
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
        console.log("Ext_BG: Attempting to reconnect in 5 seconds.");
    };

    websocket.onerror = (error) => {
        console.error("Ext_BG: WebSocket error:", error);
        websocket.close();
        console.log("Ext_BG: WebSocket closed due to error.");
    };
}

// Function to send messages to content script
function sendMessageToContentScript(tabId, message) {
    try {
        chrome.tabs.sendMessage(tabId, message, (res) => {
            if (chrome.runtime.lastError) {
                console.error("Ext_BG: sendMessage failed:", chrome.runtime.lastError.message);
            } else {
                console.log("Ext_BG: sendMessage response:", res);
            }
        });
        console.log(`Ext_BG: Message sent to content script for tab ${tabId}.`);
    } catch (e) {
        console.error("Ext_BG: Error sending message to content script:", e);
    }
}

// Connect WebSocket when the background script starts
connectWebSocket();

// Listen for messages from content scripts (e.g., ChatGPT page output)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Ext_BG: Received message from content script:", message.type);
    if (message.type === "CHATGPT_OUTPUT") {
        console.log("Ext_BG: Background script received ChatGPT output:", message.payload);
        // Send this output to the Agent AI via WebSocket
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: "CHATGPT_OUTPUT", payload: message.payload }));
            console.log("Ext_BG: Sent CHATGPT_OUTPUT to WebSocket.");
        } else {
            console.warn("Ext_BG: WebSocket not open, cannot send ChatGPT output to Agent AI.");
        }
        sendResponse({ status: "Output received by background script" });
    } else if (message.type === "TRIGGER_DOM_CAPTURE") {
        console.log("Ext_BG: Received TRIGGER_DOM_CAPTURE message.");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const tabId = tabs[0].id;
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: () => {
                        return {
                            dom: document.documentElement.outerHTML,
                            url: window.location.href
                        };
                    }
                }, (results) => {
                    if (chrome.runtime.lastError) {
                        console.error("Ext_BG: Error executing script:", chrome.runtime.lastError.message);
                        sendResponse({ status: "Error", error: chrome.runtime.lastError.message });
                    } else {
                        const { dom, url } = results[0].result;
                        fetch('http://localhost:5000/api/receive-dom-from-extension', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dom, url })
                        })
                        .then(res => res.json())
                        .then(data => {
                            console.log("Ext_BG: DOM sent to dashboard response:", data);
                            sendResponse({ status: "Success", response: data });
                        })
                        .catch(error => {
                            console.error("Ext_BG: Error sending DOM to dashboard:", error);
                            sendResponse({ status: "Error", error: error.message });
                        });
                    }
                });
            } else {
                console.warn("Ext_BG: No active tab found to capture DOM.");
                sendResponse({ status: "Error", error: "No active tab found." });
            }
        });
        return true; // Indicate that sendResponse will be called asynchronously
    } else if (message.type === "CONTENT_READY") {
        console.log(`Ext_BG: Received CONTENT_READY from tab ${sender.tab.id}.`);
        contentScriptReady.set(sender.tab.id, true);
        // Send any queued messages for this tab
        if (messageQueue.has(sender.tab.id)) {
            const queuedMessages = messageQueue.get(sender.tab.id);
            console.log(`Ext_BG: Sending ${queuedMessages.length} queued messages for tab ${sender.tab.id}.`);
            queuedMessages.forEach(msg => sendMessageToContentScript(sender.tab.id, msg));
            messageQueue.delete(sender.tab.id);
        }
    }
});
