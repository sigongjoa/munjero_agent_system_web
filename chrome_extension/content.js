// content.js
if (!window.__munjeroContentInjected) {
  window.__munjeroContentInjected = true;
  console.log("Ext_CT(FLAG): Marking content.js as injected.");
}

// Wrap the entire script in an IIFE to create a new scope for each injection
(function() {
    // Ensure the content script runs only once per page load
    if (window.munjeroContentScriptLoaded) {
        console.log("Ext_CT(0): Munjero Agent Bridge: content.js already loaded. Skipping re-execution.");
        return; // Valid return within the IIFE
    }
    window.munjeroContentScriptLoaded = true;

    console.log("Ext_CT(1): Munjero Agent Bridge: content.js loaded on", window.location.href);

    // Global variables for the new architecture
    window.assistantMessageQueue = [];
    window.processingQueue = false;
    window.currentRequestId = null; // To associate detected nodes with the current request
    window.assistantResponseObserver = null;
    window.assistantResponseObserverInitialized = false;

    // Debounce function
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    // Function to detect the current page state (ENTRY_POINT or CHAT_ACTIVE)
    function detectPageState() {
      const inputField = document.querySelector('#prompt-textarea');
      const assistantMessage = document.querySelector('div[data-message-author-role="assistant"], div.markdown.prose.markdown-new-styling');

      if (inputField && !assistantMessage) {
        console.log("Ext_CT(STATE): ENTRY_POINT state (no conversation yet)");
        return "ENTRY_POINT";
      } else if (inputField && assistantMessage) {
        console.log("Ext_CT(STATE): CHAT_ACTIVE state (conversation in progress)");
        return "CHAT_ACTIVE";
      } else {
        console.log("Ext_CT(STATE): UNKNOWN state (DOM structure changed)");
        return "UNKNOWN";
      }
    }

    // This is a more robust way to simulate user input
    function simulateTyping(inputField, message) {
      if (!inputField) {
        console.error("Ext_CT(E-INPUT): Prompt textarea not found for typing simulation.");
        return;
      }

      inputField.focus();
      const event = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: message
      });

      inputField.textContent = message; // 실제 내용 넣기
      inputField.dispatchEvent(event);
      console.log("Ext_CT(DEBUG): Message inserted into #prompt-textarea");
    }


    // New, more robust function to find the input field with retry logic
    function findInputFieldWithRetry(retries = 10, delay = 100) {
        console.log(`Ext_CT(3a): Attempting to find input field (retry: ${retries}).`);
        const inputField = document.querySelector('#prompt-textarea');

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
    window.backgroundPort = null; // Global reference to the port

    function connectToBackground() {
        // Disconnect any existing port before creating a new one to avoid duplicates.
        if (window.backgroundPort) {
            console.log("Ext_CT(P1a): Disconnecting previous port before reconnecting.");
            window.backgroundPort.disconnect();
        }

        console.log("Ext_CT(P1): Attempting to establish a new connection to background script.");
        try {
            window.backgroundPort = chrome.runtime.connect({ name: "content-script-port" });

            // --- Port Message Listener ---
            window.backgroundPort.onMessage.addListener((message) => {
                console.log("Ext_CT(P2): Message received from background script:", message);
                if (message.type === "SEND_TO_CHATGPT") {
                    handleSendToChatGPT(message);
                } else if (message.type === "PING") {
                    // The background script should handle PONGs, but as a fallback:
                    window.backgroundPort.postMessage({ type: "PONG" });
                }
            });

            // --- Port Disconnect Listener ---
            window.backgroundPort.onDisconnect.addListener(() => {
                console.error("Ext_CT(P3): Port disconnected. Will attempt to reconnect in 2 seconds.");
                window.backgroundPort = null; // Important: clear the disconnected port reference
                setTimeout(connectToBackground, 2000); // Schedule reconnection
            });

            console.log("Ext_CT(P4): Port successfully established.");
            // Announce readiness now that the port is established.
            // The DOM scan will send the DOM_READY signal once it completes.
            window.backgroundPort.postMessage({ type: "CONTENT_SCRIPT_READY", url: window.location.href });

        } catch (error) {
            console.error("Ext_CT(E-PORT): Error connecting to background script:", error);
            // Retry connection on error
            setTimeout(connectToBackground, 5000);
        }
    }

    // Initial connection attempt
    connectToBackground();

    // Function to process messages from the queue with a state machine
    const processAssistantMessageQueue = debounce(() => {
        if (window.processingQueue) {
            console.log("Ext_CT(DEBUG): Queue already being processed. Skipping.");
            return;
        }
        window.processingQueue = true;
        console.log("Ext_CT(DEBUG): Starting to process assistant message queue. Queue size:", window.assistantMessageQueue.length);

        while (window.assistantMessageQueue.length > 0) {
            const { node, requestId, retriesLeft } = window.assistantMessageQueue.shift(); // Get the oldest message

            // State machine logic for each node
            let hasText = node.innerText && node.innerText.trim().length > 0;
            const img = node.querySelector('img[alt="생성된 이미지"]');
            let hasImage = img && img.complete && img.src;

            if (hasText || hasImage) {
                console.log("Ext_CT(DEBUG): Content detected for node. Capturing response.");
                // Call captureAndSendChatGPTResponse with the detected node
                // Note: captureAndSendChatGPTResponse will now need to accept the node directly
                // and extract content from it, rather than querying the document again.
                captureAndSendChatGPTResponse(requestId, node);
            } else if (retriesLeft > 0) {
                console.log(`Ext_CT(DEBUG): Content not yet ready for node. Retrying (${retriesLeft} left).`);
                // Re-queue the message for retry after a short delay
                setTimeout(() => {
                    window.assistantMessageQueue.push({ node, requestId, retriesLeft: retriesLeft - 1 });
                    processAssistantMessageQueue(); // Trigger processing again
                }, 500); // Retry after 500ms
            } else {
                console.warn("Ext_CT(W-RESP): Max retries reached for node. Sending error fallback.");
                // Max retries reached, send error fallback
                window.backgroundPort.postMessage({
                    type: "CHATGPT_OUTPUT",
                    payload: "Error: No valid response extracted after retries.",
                    request_id: requestId
                });
            }
        }
        window.processingQueue = false;
        console.log("Ext_CT(DEBUG): Finished processing assistant message queue.");
    }, 500); // Debounce by 500ms

    // Initialize the global MutationObserver for assistant responses
    if (!window.assistantResponseObserverInitialized) {
        window.assistantResponseObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (node.matches('div[data-message-author-role="assistant"]') || node.querySelector('div[data-message-author-role="assistant"]') || node.matches('div.markdown.prose.markdown-new-styling') || node.querySelector('div.markdown.prose.markdown-new-styling'))) {
                        console.log("Ext_CT(DEBUG): New assistant message container added to DOM.");
                        // Push the node and current request_id to the queue
                        window.assistantMessageQueue.push({ node, requestId: window.currentRequestId, retriesLeft: 5 }); // 5 retries
                        processAssistantMessageQueue(); // Trigger processing
                    }
                });
            });
        });
        window.assistantResponseObserver.observe(document.body, { childList: true, subtree: true });
        window.assistantResponseObserverInitialized = true;
        console.log("Ext_CT(DEBUG): Global assistantResponseObserver initialized.");
    }


    async function handleSendToChatGPT(message) {
        console.log("Ext_CT(DEBUG): Received full message object:", message);
        console.log(`Ext_CT(4): Received message of type '${message.type}' from background script.`);

        if (message.type === "SEND_TO_CHATGPT") {
            window.currentRequestId = message.payload.request_id; // Store current request ID
            const inputField = await findInputFieldWithRetry(); // Await the retry function
            if (!inputField) {
                console.error('Ext_CT(E1): ChatGPT input field not found after retries.');
                window.backgroundPort.postMessage({ status: "Error", error: "Input field not found" });
                return;
            }

            console.log("Ext_CT(4a): Input field found. Simulating typing.");
            simulateTyping(inputField, message.payload.prompt);

            // Use MutationObserver to wait for the send button to appear and be enabled
            let sendButtonTimeoutId = null;
            const sendButtonObserver = new MutationObserver((mutations, obs) => {
                const sendButton = document.getElementById('composer-submit-button');
                if (sendButton && !sendButton.disabled) {
                    clearTimeout(sendButtonTimeoutId); // Cancel the timeout on success
                    obs.disconnect(); // Stop observing

                    console.log("Ext_CT(4b): Send button found and enabled. Clicking.", sendButton);
                    sendButton.click();
                    console.log("Ext_CT(DEBUG): sendButton.click() executed.");
                    window.backgroundPort.postMessage({ status: "Message sent" });

                    // No longer need the assistantResponseObserver here, it's global now.
                    // The global observer will pick up the new assistant message.
                }
            });

            sendButtonObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

            // Set a timeout for the send button observer in case the button never appears/enables
            sendButtonTimeoutId = setTimeout(() => {
                sendButtonObserver.disconnect();
                console.error('Ext_CT(E2): Send button not found or enabled within timeout.');
                window.backgroundPort.postMessage({ status: "Error", error: "Send button not found or disabled within timeout" });
            }, 10000); // 10 seconds timeout for send button
        }
    }

    // captureAndSendChatGPTResponse now accepts the node directly and has improved image detection
    function captureAndSendChatGPTResponse(requestId, node) {
      console.log("Ext_CT(DEBUG): Attempting to capture response for", requestId, "within node:", node);

      const imgElement = node.querySelector('img'); // Find any image within the new message
      let responsePayload = null;

      // Improved Image Detection Logic
      if (imgElement && imgElement.src && imgElement.src.includes('oaiusercontent.com')) {
        console.log("Ext_CT(DEBUG): OpenAI-hosted image element found:", imgElement.src);
        
        if (imgElement.complete) {
          // Image is already loaded
          responsePayload = imgElement.src;
          console.log("Ext_CT(DEBUG): Found loaded OpenAI image URL:", responsePayload);
          window.backgroundPort.postMessage({
            type: "CHATGPT_OUTPUT",
            payload: responsePayload,
            request_id: requestId
          });
          console.log("Ext_CT(DEBUG): CHATGPT_OUTPUT (image) posted to background.");
        } else {
          // Image found but not yet loaded, wait for the 'load' event
          console.log("Ext_CT(DEBUG): OpenAI image found but not yet loaded. Waiting for load event...");
          imgElement.addEventListener("load", () => {
            responsePayload = imgElement.src;
            console.log("Ext_CT(DEBUG): OpenAI image loaded. URL:", responsePayload);
            window.backgroundPort.postMessage({
              type: "CHATGPT_OUTPUT",
              payload: responsePayload,
              request_id: requestId
            });
            console.log("Ext_CT(DEBUG): CHATGPT_OUTPUT (image) posted after load.");
          }, { once: true });

          imgElement.addEventListener("error", () => {
            console.error("Ext_CT(E-IMG): Failed to load OpenAI image.");
            window.backgroundPort.postMessage({
              type: "CHATGPT_OUTPUT",
              payload: "Error: OpenAI image load failed.",
              request_id: requestId
            });
          }, { once: true });
        }
      } else {
        // Fallback for non-image or non-OpenAI image responses (i.e., text)
        console.log("Ext_CT(DEBUG): No valid OpenAI image found. Attempting text fallback.");
        if (node.innerText && node.innerText.trim().length > 0) {
          responsePayload = node.innerText;
          console.log("Ext_CT(DEBUG): Found text response:", responsePayload);
          window.backgroundPort.postMessage({
            type: "CHATGPT_OUTPUT",
            payload: responsePayload,
            request_id: requestId
          });
          console.log("Ext_CT(DEBUG): CHATGPT_OUTPUT (text) posted to background.");
        } else {
          console.log("Ext_CT(DEBUG): No valid content found within node for text fallback.");
          // This case is now less likely due to the retry logic in processAssistantMessageQueue
          // but kept for robustness.
          window.backgroundPort.postMessage({
            type: "CHATGPT_OUTPUT",
            payload: "Error: No image or text response found in node.",
            request_id: requestId
          });
        }
      }
    }

    // --- DOM Ready Scan and Signal (Revised with heavy logging) ---
    async function performDomScanAndSignalReady() {
        console.log("Ext_CT(DOM_LOG): Starting DOM scan...");

        // 1. URL Filtering
        const currentUrl = window.location.href;
        if (!currentUrl.includes("chat.openai.com") && !currentUrl.includes("chatgpt.com")) {
            console.warn("Ext_CT(DOM_LOG): Not on a ChatGPT page. Skipping DOM scan.");
            if (window.backgroundPort && window.backgroundPort.connected) {
                window.backgroundPort.postMessage({ type: "DOM_NOT_READY", reason: "Not ChatGPT URL" });
            }
            return;
        }

        // 2. Wait for document to be fully loaded
        if (document.readyState !== "complete") {
            console.log("Ext_CT(DOM_LOG): document.readyState is '" + document.readyState + "'. Waiting for 'load' event...");
            await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
            console.log("Ext_CT(DOM_LOG): document.readyState is now complete.");
        }

        let inputFieldFound = false;
        let sendButtonFound = false;
        let responseAreaFound = false;

        const checkElements = () => {
            console.log("Ext_CT(DOM_LOG): Running checkElements()...");
            inputFieldFound = !!document.querySelector('#prompt-textarea');
            sendButtonFound = !!document.getElementById('composer-submit-button');
            responseAreaFound = !!document.querySelector('div[data-message-author-role="assistant"]') || !!document.querySelector('div.markdown.prose.markdown-new-styling');
            
            console.log(`Ext_CT(DOM_LOG): Status -> Input: ${inputFieldFound}, Button: ${sendButtonFound}, Response Area: ${responseAreaFound}`);
            
            // Core readiness condition is only the input field
            return inputFieldFound;
        };

        const sendReadySignal = () => {
            console.log("Ext_CT(DOM_LOG): Preparing to send DOM_READY signal.");
            if (window.backgroundPort && window.backgroundPort.connected) {
                const details = {
                    input: inputFieldFound,
                    button: sendButtonFound,
                    responseArea: responseAreaFound
                };
                window.backgroundPort.postMessage({ type: "DOM_READY", details });
                console.log("Ext_CT(DOM_LOG): DOM_READY signal sent with details:", details);
            } else {
                console.warn("Ext_CT(DOM_LOG): Cannot send DOM_READY signal, port not connected.");
            }
            const pageState = detectPageState();
            console.log(`Ext_CT(DOM_LOG): Current page state after DOM_READY signal: ${pageState}`);
        };

        if (checkElements()) {
            console.log("Ext_CT(DOM_LOG): Minimal critical DOM element (input) found immediately.");
            sendReadySignal();
            return;
        }

        console.log("Ext_CT(DOM_LOG): Minimal critical DOM element not found. Starting MutationObserver.");
        let observerTimeoutId = null;
        const observer = new MutationObserver((mutations, obs) => {
            console.log("Ext_CT(DOM_LOG): MutationObserver fired.");
            if (checkElements()) {
                console.log("Ext_CT(DOM_LOG): Minimal critical DOM element found via MutationObserver.");
                obs.disconnect();
                clearTimeout(observerTimeoutId);
                sendReadySignal();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log("Ext_CT(DOM_LOG): MutationObserver is now observing the document body.");

        observerTimeoutId = setTimeout(() => {
            observer.disconnect();
            console.log("Ext_CT(DOM_LOG): 15-second observer timeout reached.");
            
            // Re-run checkElements one last time after timeout
            checkElements(); 

            if (inputFieldFound) {
                 console.log("Ext_CT(DOM_LOG): Observer timed out, but minimal element (input) was found. Sending DOM_READY.");
                 sendReadySignal();
            } else {
                console.error("Ext_CT(DOM_LOG): Failed to find minimal critical DOM element (input) within timeout.");
                if (window.backgroundPort && window.backgroundPort.connected) {
                    const details = { 
                        input: inputFieldFound, 
                        button: sendButtonFound, 
                        responseArea: responseAreaFound 
                    };
                    window.backgroundPort.postMessage({ type: "DOM_NOT_READY", reason: "Timeout", details });
                    console.log("Ext_CT(DOM_LOG): DOM_NOT_READY signal sent with details:", details);
                }
            }
        }, 15000); // 15 seconds timeout
    }

    // Call DOM scan after initial connection attempt
    // This will now be the main entry point for DOM readiness
    performDomScanAndSignalReady();
    // --- END DOM Ready Scan and Signal ---
})(); // End of IIFE