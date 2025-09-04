// content.js
// This script runs in the context of the ChatGPT page.
// It can interact with the DOM of the ChatGPT page.

console.log("Munjero Agent Bridge: content.js loaded on", window.location.href);

// Example: Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SEND_TO_CHATGPT") {
        console.log("Content script received message to send to ChatGPT:", message.payload);
        // Here, you would typically interact with the ChatGPT page's DOM
        // For example, typing into an input field or clicking a button.
        // Due to security restrictions on chat.openai.com, direct DOM manipulation
        // might be limited. We might need to use chrome.scripting.executeScript
        // from the background script for more privileged operations.

        // For now, just log and acknowledge.
        alert(`Received from Agent: ${message.payload}`); // For demonstration
        sendResponse({ status: "Message received by content script" });
    }
});

// Example: Send messages from the content script to the background script
// This could be used to send ChatGPT's output back to the Agent AI.
function sendMessageToBackground(data) {
    chrome.runtime.sendMessage({ type: "CHATGPT_OUTPUT", payload: data });
}

// You might want to observe changes in the ChatGPT page's DOM
// and send relevant information back to the background script.
// For example, when a new response appears in the chat.
// const observer = new MutationObserver((mutations) => {
//     for (let mutation of mutations) {
//         if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
//             // Check for new chat messages and send them to background
//             // sendMessageToBackground("New chat message detected!");
//         }
//     }
// });
// observer.observe(document.body, { childList: true, subtree: true });
