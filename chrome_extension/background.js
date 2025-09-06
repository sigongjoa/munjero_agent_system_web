// background.js
// This is the service worker for the Chrome Extension.
// It runs in the background and handles events and communication.

console.log("Ext_BG: Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://127.0.0.1:8080/ws"; // Connect to the Nginx proxied WebSocket server
let websocket;

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

        if (data.type === "AGENT_COMMAND") {
            console.log("Ext_BG: Received AGENT_COMMAND:", data.command);
            if (data.command === "send_message_to_chatgpt") {
                const prompt = data.args.prompt;
                console.log("Ext_BG: Sending SEND_TO_CHATGPT to content script.");
                // Send message to content script (which is injected into ChatGPT page)
                chrome.tabs.query({ url: "https://chat.openai.com/*" }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: "SEND_TO_CHATGPT", payload: prompt });
                        console.log("Ext_BG: Message sent to ChatGPT tab.");
                    } else {
                        console.warn("Ext_BG: ChatGPT tab not found.");
                        // Optionally, send an error back to the Agent AI
                    }
                });
            }
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
                        fetch('http://localhost:5001/api/receive-dom-from-extension', {
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
    }
});
