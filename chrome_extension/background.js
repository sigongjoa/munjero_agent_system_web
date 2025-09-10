// background.js
console.log("Ext_BG(1): Munjero Agent Bridge: background.js loaded.");

const WEBSOCKET_SERVER_URL = "ws://127.0.0.1:8765";
let websocket;

// --- State Management ---
// Map to store active ports for each tabId
const contentScriptPorts = new Map(); // tabId -> Port

// Map to store pending messages for tabs that are not yet ready
const pendingMessages = new Map(); // tabId -> Array of messages

function connectWebSocket() {
    console.log("Ext_BG(2): Attempting to connect WebSocket to: " + WEBSOCKET_SERVER_URL);
    websocket = new WebSocket(WEBSOCKET_SERVER_URL);

    websocket.onopen = (event) => {
        console.log("Ext_BG(3): WebSocket connected successfully!", event);
        websocket.send(JSON.stringify({ type: "EXTENSION_READY", message: "Chrome Extension is ready." }));
        // Update server with connected status
        fetch("http://localhost:5000/api/update_extension_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "connected" })
        }).catch(err => console.error("Failed to update extension status (connected):", err));

        // Add a periodic keep-alive message
        // This helps keep the service worker alive and the WebSocket active
        setInterval(() => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({ type: "KEEP_ALIVE", timestamp: Date.now() }));
                console.log("Ext_BG(KA): Sent KEEP_ALIVE message.");
            }
        }, 25000); // Send every 25 seconds
    };

    websocket.onmessage = (event) => {
        console.log("Ext_BG(6): WebSocket message received.", event.data);
        const data = JSON.parse(event.data);

        if (data.type === "PING") {
            console.log("Ext_BG(PONG): Received PING from server. Sending PONG back.");
            websocket.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
        } else if (data.type === "SEND_TO_CHATGPT") {
            console.log("Ext_BG(6a): Received SEND_TO_CHATGPT command from server.");
            handleSendToChatGPT(data.payload);
        }
    };

    websocket.onclose = (event) => {
        console.log(`Ext_BG(E1): WebSocket disconnected: Code ${event.code}, Reason: ${event.reason}`);
        // Update server with disconnected status
        fetch("http://localhost:5000/api/update_extension_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "disconnected" })
        }).catch(err => console.error("Failed to update extension status (disconnected):", err));
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = (event) => {
        console.error("Ext_BG(E2): WebSocket error:", event);
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
            console.warn(`Ext_BG(W1): Port for tab ${tabId} not found. Queuing message.`);
            if (!pendingMessages.has(tabId)) {
                pendingMessages.set(tabId, []);
            }
            pendingMessages.get(tabId).push({ type: "SEND_TO_CHATGPT", payload: payload });
        }
    } else {
        console.warn("Ext_BG(W2): ChatGPT tab not found.");
    }
}

// --- Port-based Messaging from Content Script ---
chrome.runtime.onConnect.addListener((port) => {
    console.log(`Ext_BG(4): Port connected from ${port.name}.`);
    if (port.name === "content-script-port") {
        const tabId = port.sender.tab.id;
        if (tabId && isChatGPTTab(port.sender.tab.url)) {
            contentScriptPorts.set(tabId, port);
            console.log(`Ext_BG(4a): Stored port for tab ${tabId}.`);

            // Check for and send any pending messages for this tab
            if (pendingMessages.has(tabId)) {
                const messagesToProcess = pendingMessages.get(tabId);
                console.log(`Ext_BG(8): Found ${messagesToProcess.length} pending messages for tab ${tabId}. Sending now.`);
                messagesToProcess.forEach(msg => {
                    port.postMessage(msg);
                });
                pendingMessages.delete(tabId); // Clear the queue for this tab
            }

            port.onMessage.addListener((message) => {
                console.log(`Ext_BG(5): Message received from content script on tab ${tabId}:`, message);
                if (message.type === "CONTENT_SCRIPT_READY") {
                    console.log(`Ext_BG(5a): CONTENT_SCRIPT_READY received from tab ${tabId}.`);
                } else if (message.type === "CHATGPT_OUTPUT") {
                    console.log(`Ext_BG(10): Received CHATGPT_OUTPUT from tab ${tabId}.`);
                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        websocket.send(JSON.stringify(message));
                        console.log("Ext_BG(11): Sent CHATGPT_OUTPUT to server.");
                    }
                } else if (message.type === "DOM_READY") { // New: Handle DOM_READY from content.js
                    console.log(`Ext_BG(5b): DOM_READY received from tab ${tabId}. Details:`, message.details);
                    // Forward DOM_READY status to websocket server
                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        websocket.send(JSON.stringify({ type: "DOM_READY", tabId: tabId, details: message.details }));
                        console.log("Ext_BG(12): Sent DOM_READY to server.");
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

// Existing tab update handler
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isChatGPTTab(tab.url)) {
    console.log("Ext_BG(T1): Tab", tabId, "updated to complete. Checking if content.js is already injected...");

    // content.js가 이미 실행됐는지 확인
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        func: () => {
          return !!window.__munjeroContentInjected;
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.warn("Ext_BG(T1a): Error checking content.js injection:", chrome.runtime.lastError.message);
          return;
        }

        const alreadyInjected = results && results[0] && results[0].result;
        if (alreadyInjected) {
          console.log("Ext_BG(T1b): content.js already injected in tab", tabId, "- skipping re-injection.");
        } else {
          console.log("Ext_BG(T2): Injecting content.js into tab", tabId);
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"],
            // world: "MAIN"  // 필요시 추가
          });
        }
      }
    );
  }
});

console.log("Ext_BG(1a): Adding message listener and connecting WebSocket.");
connectWebSocket();