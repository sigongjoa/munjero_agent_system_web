// content.js
console.log("Ext_CT(1): Munjero Agent Bridge: content.js loaded on", window.location.href);

// This is a more robust way to simulate user input
function simulateTyping(editableDiv, text) {
    console.log("Ext_CT(5): Simulating typing using execCommand.");
    editableDiv.focus();
    document.execCommand("insertText", false, text);
}



// New, more robust function to find the input field with retry logic
function findInputFieldWithRetry(retries = 10, delay = 100) {
    console.log(`Ext_CT(3a): Attempting to find input field (retry: ${retries}).`);
    let inputField = null;
    
    // Try to find by data-placeholder text
    inputField = document.querySelector('p[data-placeholder*="Send a message"]');
    if (!inputField) {
        inputField = document.querySelector('p[data-placeholder*="무엇이든 물어보세요"]'); // Korean placeholder
    }
    // Fallback to ID, which is present in the provided HTML
    if (!inputField) {
        inputField = document.getElementById('prompt-textarea');
    }
    // Fallback to a more generic contenteditable element if needed, though not ideal
    if (!inputField) {
        inputField = document.querySelector('div[contenteditable="true"]');
    }

    if (inputField) {
        console.log("Ext_CT(3b): Input field found.", inputField);
        return inputField;
    } else if (retries > 0) {
        console.log(`Ext_CT(3c): Input field not found, retrying in ${delay}ms.`);
        return new Promise(resolve => setTimeout(() => resolve(findInputFieldWithRetry(retries - 1, delay)), delay));
    } else {
        console.error("Ext_CT(E1): Input field not found after multiple retries.");
        return null;
    }
}

// Use a named port for communication with the background script
let backgroundPort;

function connectToBackground() {
    console.log("Ext_CT(P1): Attempting to connect to background script.");
    try {
        backgroundPort = chrome.runtime.connect({ name: "content-script-port" });

        backgroundPort.onMessage.addListener((message) => {
            console.log("Ext_CT(P2): Message received from background script:", message);
            if (message.type === "SEND_TO_CHATGPT") {
                handleSendToChatGPT(message);
            } else if (message.type === "PING") {
                backgroundPort.postMessage({ type: "PONG" });
            }
        });

        backgroundPort.onDisconnect.addListener(() => {
            // This will be triggered when the background script is updated or the extension is reloaded.
            console.log("Ext_CT(P3): Port disconnected. Will attempt to reconnect on next action or periodically.");
            backgroundPort = null; // Clear the invalid port
        });

        // Announce readiness immediately after connecting
        backgroundPort.postMessage({ type: "CONTENT_SCRIPT_READY", url: window.location.href });
        console.log("Ext_CT(P4): Sent CONTENT_SCRIPT_READY via port.");

    } catch (error) {
        console.error("Ext_CT(E-CON): Error connecting to background script:", error.message);
        // If the context is invalidated, wait and try to reconnect.
        if (error.message.includes("Extension context invalidated")) {
            console.log("Ext_CT(E-CON): Context invalidated. Retrying connection in 2 seconds...");
            setTimeout(connectToBackground, 2000);
        }
    }
}

// Initial connection attempt
connectToBackground();

async function handleSendToChatGPT(message) {
    console.log("Ext_CT(DEBUG): Received full message object:", message);
    console.log(`Ext_CT(4): Received message of type '${message.type}' from background script.`);

    if (message.type === "SEND_TO_CHATGPT") {
        const inputField = await findInputFieldWithRetry(); // Await the retry function
        if (!inputField) {
            console.error('Ext_CT(E1): ChatGPT input field not found after retries.');
            backgroundPort.postMessage({ status: "Error", error: "Input field not found" });
            return;
        }

        console.log("Ext_CT(4a): Input field found. Simulating typing.");
        simulateTyping(inputField, message.payload.prompt);

        // Use MutationObserver to wait for the send button to appear and be enabled
        let timeoutId = null;
        const observer = new MutationObserver((mutations, obs) => {
            const sendButton = document.getElementById('composer-submit-button');
            if (sendButton && !sendButton.disabled) {
                clearTimeout(timeoutId); // Cancel the timeout on success
                obs.disconnect(); // Stop observing

                console.log("Ext_CT(4b): Send button found and enabled. Clicking.", sendButton);
                sendButton.click();
                backgroundPort.postMessage({ status: "Message sent" });
                observeChatGPTResponse(message.payload.request_id);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        // Set a timeout for the observer in case the button never appears/enables
        timeoutId = setTimeout(() => {
            observer.disconnect();
            console.error('Ext_CT(E2): Send button not found or enabled within timeout.');
            backgroundPort.postMessage({ status: "Error", error: "Send button not found or disabled within timeout" });
        }, 10000); // 10 seconds timeout
    }
}

function observeChatGPTResponse(requestId) {
  console.log("Ext_CT(DEBUG): Observing ChatGPT response...");

  const responseContainer = document.querySelector('main');
  if (!responseContainer) {
    console.error("Ext_CT(E3): Response container not found.");
    return;
  }

  let debounceTimeout = null; // For debouncing

  const observer = new MutationObserver((mutations, obs) => {
    const messages = document.querySelectorAll(
      "div.markdown.prose, div.markdown.prose.dark\\:prose-invert"
    );
    const lastMessage = messages[messages.length - 1];

    if (lastMessage) {
      const text = lastMessage.innerText.trim();
      
      clearTimeout(debounceTimeout); // Clear previous timeout

      if (text && !text.endsWith("▌")) {
        // The cursor is gone. This *might* be the end.
        // Let's wait a bit to be sure no more text is coming.
        debounceTimeout = setTimeout(() => {
          // After the delay, check the text again to be absolutely sure.
          const currentText = lastMessage.innerText.trim();
          if (currentText === text) {
            console.log("Ext_CT(6): Final response captured:", currentText);
            obs.disconnect();
            
            // Restore message format that background.js now expects
            backgroundPort.postMessage({
              type: "CHATGPT_OUTPUT",
              payload: currentText,
              request_id: requestId
            });
          }
        }, 10000); // 10s debounce delay
      }
    }
  });

  observer.observe(responseContainer, {
    childList: true,
    subtree: true,
    characterData: true
  });
}