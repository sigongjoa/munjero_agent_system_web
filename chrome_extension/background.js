// background.js
console.log("Ext_BG(1): Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://127.0.0.1:8766";
let websocket;

// --- State Management ---
// Map to store active ports for each tabId
const contentScriptPorts = new Map(); // tabId -> Port

function connectWebSocket() {
    console.log("Ext_BG(2): Attempting to connect WebSocket to: " + WEBSOCKET_SERVER_URL);
    websocket = new WebSocket(WEBSOCKET_SERVER_URL);

    websocket.onopen = () => {
        console.log("Ext_BG(3): WebSocket connected successfully!");
        websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
        // Update server with connected status
        fetch("http://localhost:5000/api/update_extension_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "connected" })
        }).catch(err => console.error("Failed to update extension status (connected):", err));
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
        // Update server with disconnected status
        fetch("http://localhost:5000/api/update_extension_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "disconnected" })
        }).catch(err => console.error("Failed to update extension status (disconnected):", err));
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = (error) => {
        console.error("Ext_BG(E2): WebSocket error:", error);
        // Update server with disconnected status on error
        fetch("http://localhost:5000/api/update_extension_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "disconnected" })
        }).catch(err => console.error("Failed to update extension status (error):", err));
        websocket.close();
    };
}

function isChatGPTTab(url) {
    return url.includes("chat.openai.com") || url.includes("chatgpt.com");
}

async function handleSendToChatGPT(payload) {
    console.log("Ext_BG(7): handleSendToChatGPT called.");
    const tabs = await chrome.tabs.query({ url: ["*://chat.openai.com/*", "*://chatgpt.com/*"] });

    if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        console.log(`Ext_BG(7a): Found ChatGPT tab ${tabId}.`);

        const port = contentScriptPorts.get(tabId);
        if (port) {
            console.log(`Ext_BG(7b): Port for tab ${tabId} is ready. Sending message immediately.`);
            const messageToSend = { type: "SEND_TO_CHATGPT", payload: payload };
            console.log("Ext_BG(DEBUG): Preparing to send message with corrected payload structure:", messageToSend);
            port.postMessage(messageToSend);
        } else {
            console.warn(`Ext_BG(W1): Port for tab ${tabId} not found. Content script might not be ready or connected.`);
            // In a more complex scenario, you might queue the message here.
            // For now, we assume content script will connect soon.
        }
    } else {
        console.warn("Ext_BG(W2): ChatGPT tab not found.");
    }
}

// --- Port-based Messaging from Content Script ---
chrome.runtime.onConnect.addListener((port) => {
    console.log(`Ext_BG(4): Port connected from ${port.name}.`);
    if (port.name === "content-script-port") {
        // Store the port by tabId
        const tabId = port.sender.tab.id;
        if (tabId && isChatGPTTab(port.sender.tab.url)) {
            contentScriptPorts.set(tabId, port);
            console.log(`Ext_BG(4a): Stored port for tab ${tabId}.`);

            port.onMessage.addListener((message) => {
                console.log(`Ext_BG(5): Message received from content script on tab ${tabId}:`, message);
                if (message.type === "CONTENT_SCRIPT_READY") {
                    console.log(`Ext_BG(5a): CONTENT_SCRIPT_READY received from tab ${tabId}.`);
                    // No need to add to readyTabIds set, as port itself signifies readiness
                } else if (message.type === "CHATGPT_OUTPUT") {
                    console.log(`Ext_BG(10): Received CHATGPT_OUTPUT from tab ${tabId}.`);
                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        websocket.send(JSON.stringify(message));
                        console.log("Ext_BG(11): Sent CHATGPT_OUTPUT to server.");
                    }
                }
            });

            port.onDisconnect.addListener(() => {
                console.log(`Ext_BG(E3): Port disconnected for tab ${tabId}.`);
                contentScriptPorts.delete(tabId);
            });
        } else {
            console.warn("Ext_BG(W3): Port connected from non-ChatGPT tab or without tab info.", port.sender);
        }
    }
});

// Listener for messages from popup.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("Ext_BG: Message received from runtime:", msg);
    if (msg.type === "TRIGGER_DOM_CAPTURE") {
        // For now, just acknowledge. Actual DOM capture logic would go here.
        sendResponse({ status: "DOM capture request received by background." });
    }
    // Return true to indicate that sendResponse will be called asynchronously
    return true;
});

console.log("Ext_BG(1a): Adding message listener and connecting WebSocket.");
connectWebSocket();
