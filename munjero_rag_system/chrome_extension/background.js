// background.js
console.log("Ext_BG: Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_URL = 'ws://localhost:8765/ws'; // FIXED: Use localhost to match manifest CSP
let websocket;

function connectWebSocket() {
    try {
        websocket = new WebSocket(WEBSOCKET_URL);

        websocket.onopen = () => {
            console.log("✅ WebSocket connection established successfully!");
            websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
        };

        websocket.onmessage = (event) => {
            console.log("Ext_BG: WebSocket message received:", event.data);
            const data = JSON.parse(event.data);
            // ... (onmessage logic)
        };

        websocket.onclose = (event) => {
            console.log(`Ext_BG: WebSocket disconnected: Code ${event.code}, Reason: ${event.reason}`);
            setTimeout(connectWebSocket, 5000);
            console.log("Ext_BG: Attempting to reconnect in 5 seconds.");
        };

        websocket.onerror = (error) => {
            console.error("Ext_BG: WebSocket error:", error);
            websocket.close();
        };
    } catch (e) {
        console.error("FATAL: Error in connectWebSocket() constructor:", e);
        setTimeout(connectWebSocket, 5000);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TRIGGER_DOM_CAPTURE") {
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
                }, async (results) => {
                    if (chrome.runtime.lastError) {
                        console.error("Ext_BG: Error executing script:", chrome.runtime.lastError.message);
                        sendResponse({ status: "Error", error: chrome.runtime.lastError.message });
                        return;
                    }
                    if (!results || results.length === 0 || !results[0].result) {
                        console.error("Ext_BG: executeScript returned no results.");
                        sendResponse({ status: "Error", error: "Failed to get DOM from page." });
                        return;
                    }
                    try {
                        const { dom, url } = results[0].result;
                        const response = await fetch('http://localhost:5000/api/receive-dom-from-extension', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dom, url })
                        });
                        const data = await response.json();
                        console.log("Ext_BG: DOM sent to dashboard response:", data);
                        sendResponse({ status: "Success", response: data });
                    } catch (error) {
                        console.error("Ext_BG: Error sending DOM to dashboard:", error);
                        sendResponse({ status: "Error", error: error.message });
                    }
                });
            } else {
                console.warn("Ext_BG: No active tab found to capture DOM.");
                sendResponse({ status: "Error", error: "No active tab found." });
            }
        });
        return true;
    }
    return false;
});

connectWebSocket();
