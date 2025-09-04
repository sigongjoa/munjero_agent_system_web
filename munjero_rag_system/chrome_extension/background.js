// background.js
// This is the service worker for the Chrome Extension.
// It runs in the background and handles events and communication.

console.log("Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://localhost:8000/ws"; // Placeholder for your Agent AI WebSocket server
let websocket;

function connectWebSocket() {
    websocket = new WebSocket(WEBSOCKET_SERVER_URL);

    websocket.onopen = () => {
        console.log("WebSocket connected.");
        // Send a message to the Agent AI when connected
        websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
    };

    websocket.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
        const data = JSON.parse(event.data);

        if (data.type === "AGENT_COMMAND") {
            // Example: Agent AI wants to send a message to ChatGPT page
            if (data.command === "send_message_to_chatgpt") {
                const prompt = data.args.prompt;
                // Send message to content script (which is injected into ChatGPT page)
                chrome.tabs.query({ url: "https://chat.openai.com/*" }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: "SEND_TO_CHATGPT", payload: prompt });
                    } else {
                        console.warn("ChatGPT tab not found.");
                        // Optionally, send an error back to the Agent AI
                    }
                });
            }
        }
    };

    websocket.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        websocket.close();
    };
}

// Connect WebSocket when the background script starts
connectWebSocket();

// Listen for messages from content scripts (e.g., ChatGPT page output)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CHATGPT_OUTPUT") {
        console.log("Background script received ChatGPT output:", message.payload);
        // Send this output to the Agent AI via WebSocket
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: "CHATGPT_OUTPUT", payload: message.payload }));
        } else {
            console.warn("WebSocket not open, cannot send ChatGPT output to Agent AI.");
        }
        sendResponse({ status: "Output received by background script" });
    }
});

// Example of using chrome.scripting.executeScript (more privileged DOM access)
// This would typically be triggered by a message from the Agent AI
// function executeScriptInTab(tabId, func, args) {
//     chrome.scripting.executeScript({
//         target: { tabId: tabId },
//         function: func,
//         args: args
//     }, (results) => {
//         if (chrome.runtime.lastError) {
//             console.error("Script execution failed:", chrome.runtime.lastError.message);
//         } else {
//             console.log("Script execution results:", results);
//         }
//     });
// }
