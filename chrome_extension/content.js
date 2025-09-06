// content.js
console.log("Ext_CT: Munjero Agent Bridge: content.js loaded on", window.location.href);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Ext_CT: Received message from background script:", message.type);
    if (message.type === "SEND_TO_CHATGPT") {
        console.log("Ext_CT: Content script received message to send to ChatGPT:", message.payload);
        
        // Find the textarea for input
        const textarea = document.getElementById('prompt-textarea');
        
        if (!textarea) {
            console.error('Ext_CT: ChatGPT textarea with id "prompt-textarea" not found.');
            sendResponse({ status: "Error", error: "Textarea not found" });
            return; // Stop execution if textarea is not found
        }
        console.log("Ext_CT: Textarea found.");

        // Set the value of the textarea
        textarea.value = message.payload;
        console.log("Ext_CT: Textarea value set.");

        // Dispatch an input event. This is crucial for websites like ChatGPT (built with React)
        // to recognize the change in the textarea.
        const inputEvent = new Event('input', { bubbles: true });
        textarea.dispatchEvent(inputEvent);
        console.log("Ext_CT: Input event dispatched.");

        // Find the send button. It's typically a <button> element near the textarea.
        // We look for a button that is not disabled, which usually happens after text is entered.
        // This selector might need adjustment if ChatGPT's UI changes.
        const sendButton = textarea.parentElement.querySelector("button:not([disabled])");

        if (sendButton) {
            console.log('Ext_CT: Send button found, clicking it.');
            sendButton.click();
            sendResponse({ status: "Message sent successfully" });
            console.log("Ext_CT: Send button clicked.");
        } else {
            console.error('Ext_CT: ChatGPT send button not found or it is disabled.');
            sendResponse({ status: "Error", error: "Send button not found" });
        }
    }
});

// Example: Send a message to the background script when the page loads
// This can be useful for letting the agent know the content script is ready.
console.log("Ext_CT: Sending CHATGPT_OUTPUT (content script loaded) to background.");
chrome.runtime.sendMessage({ type: "CHATGPT_OUTPUT", payload: "Content script loaded and ready." });