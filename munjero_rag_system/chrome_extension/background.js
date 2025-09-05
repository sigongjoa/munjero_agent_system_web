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
//             console.error("Ext_BG: Script execution failed:", chrome.runtime.lastError.message);
//         } else {
//             console.log("Ext_BG: Script execution results:", results);
//         }
//     });
// }
