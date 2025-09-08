// content.js
console.log("Ext_CT(1): Munjero Agent Bridge: content.js loaded on", window.location.href);

// This is a more robust way to simulate user input
function simulateTyping(editableDiv, text) {
    console.log("Ext_CT(5): Simulating typing using execCommand.");
    editableDiv.focus();
    document.execCommand("insertText", false, text);
}

function findSendButton() {
    // This selector seems to be the most stable for the send button.
    return document.querySelector('button[data-testid="send-button"]');
}

function findTextarea() {
    return document.getElementById('prompt-textarea');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Ext_CT(DEBUG): Received full message object:", message);
    console.log(`Ext_CT(4): Received message of type '${message.type}' from background script.`);

    if (message.type === "SEND_TO_CHATGPT") {
        const textarea = findTextarea();
        if (!textarea) {
            console.error('Ext_CT(E1): ChatGPT textarea not found.');
            sendResponse({ status: "Error", error: "Textarea not found" });
            return;
        }

        console.log("Ext_CT(4a): Textarea found. Simulating typing.");
        // Use the more robust typing simulation instead of setting value directly
        simulateTyping(textarea, message.payload.prompt);

        // Increased timeout for more stability, allowing UI to update after simulated typing
        setTimeout(() => {
            const sendButton = findSendButton();
            if (sendButton && !sendButton.disabled) {
                console.log("Ext_CT(4b): Send button found and enabled. Clicking.", sendButton);
                sendButton.click();
                sendResponse({ status: "Message sent" });
                // Correctly pass the request_id from the payload
                observeChatGPTResponse(message.payload.request_id);
            } else {
                console.error('Ext_CT(E2): Send button not found or is disabled.', sendButton);
                sendResponse({ status: "Error", error: "Send button not found or disabled" });
            }
        }, 500);
    }
    return true; // Indicate async response
});

function observeChatGPTResponse(requestId) {
    console.log(`Ext_CT(6): Observing for ChatGPT response for request_id: ${requestId}`);
    const observer = new MutationObserver((mutations, obs) => {
        const responseElements = document.querySelectorAll('.markdown.prose');
        if (responseElements.length > 0) {
            const lastResponseElement = responseElements[responseElements.length - 1];
            // Heuristic to check for completion: the streaming text indicator is gone
            const streamingIndicator = lastResponseElement.querySelector('.result-streaming');
            if (!streamingIndicator) {
                const responseText = lastResponseElement.innerText;
                console.log("Ext_CT(7): Response complete. Sending to background.");
                chrome.runtime.sendMessage({
                    type: "CHATGPT_OUTPUT",
                    payload: responseText,
                    request_id: requestId
                });
                obs.disconnect();
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function announceReady() {
    console.log("Ext_CT(2): Announcing readiness to background script.");
    chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" });
}

console.log("Ext_CT(1a): Adding message listener and announcing readiness.");
announceReady();