// content.js
console.log("Ext_CT: Munjero Agent Bridge: content.js loaded on", window.location.href);

// Helper function to simulate typing
function simulateTyping(editableDiv, text) {
    console.log("Ext_CT: Simulating typing using execCommand.");
    editableDiv.focus();
    document.execCommand("insertText", false, text);
    console.log("Ext_CT: execCommand insertText complete.");
}

// Helper function to simulate click
function simulateClick(button) {
    console.log("Ext_CT: Simulating click on button.");
    const rect = button.getBoundingClientRect();

    ["mousedown", "mouseup", "click"].forEach(type => {
        const evt = new MouseEvent(type, {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        });
        button.dispatchEvent(evt);
    });
    console.log("Ext_CT: Click simulation complete.");
}

// Function to observe the send button
function observeSendButton(callback) {
    console.log("Ext_CT: Observing for send button.");
    const observer = new MutationObserver(() => {
        const sendButton = document.querySelector('button[data-testid="send-button"]')
            || document.getElementById("composer-submit-button");

        if (sendButton && !sendButton.disabled) {
            console.log("Ext_CT: ✅ Send button appeared and is enabled:", sendButton);
            observer.disconnect(); // Stop observing
            callback(sendButton);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
    console.log("Ext_CT: MutationObserver attached to document.body.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Ext_CT: Received message from background script:", message.type);
    if (message.type === "SEND_TO_CHATGPT") {
        console.log("Ext_CT: Content script received message to send to ChatGPT:", message.payload);
        
        // Find the textarea for input
        console.log("Ext_CT: Attempting to find textarea with id 'prompt-textarea'.");
        const textarea = document.getElementById('prompt-textarea');
        
        if (!textarea) {
            console.error('Ext_CT: ChatGPT textarea with id "prompt-textarea" not found.');
            sendResponse({ status: "Error", error: "Textarea not found" });
            return; // Stop execution if textarea is not found
        }
        console.log("Ext_CT: Textarea found:", textarea);

        // Simulate typing
        simulateTyping(textarea, message.payload);

        // Observe for the send button to appear and then click it
        observeSendButton((btn) => {
            console.log("Ext_CT: Simulating click on send button after observation.");
            simulateClick(btn);
            sendResponse({ status: "Message sent successfully" });
            console.log("Ext_CT: Send button clicked after observation.");
        });
    }
});

// Send CONTENT_READY message to background script after listener is set up
console.log("Ext_CT: Sending CONTENT_READY to background.");
chrome.runtime.sendMessage({ type: "CONTENT_READY", url: window.location.href });

// Example: Send a message to the background script when the page loads
// This can be useful for letting the agent know the content script is ready.
console.log("Ext_CT: Sending CHATGPT_OUTPUT (content script loaded) to background.");
chrome.runtime.sendMessage({ type: "CHATGPT_OUTPUT", payload: "Content script loaded and ready." });