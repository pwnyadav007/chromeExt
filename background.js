// Listener for messages from other parts of the extension (e.g., popup.js)
console.log("Service Worker script loaded and starting up!");
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Always log the incoming message to the Service Worker console for debugging
    console.log("Background: Received message:", request);

    // --- Handling XML Processing Instructions ---
    if (request.action === 'processXmlInstructions' && request.tasksArray) {
        console.log("Background: Processing 'processXmlInstructions'.");

        const tasks = request.tasksArray;

        if (tasks.length === 0) {
            console.warn("Background: No tasks found in the received array. Sending error response.");
            sendResponse({ status: 'error', message: 'No tasks found in XML.' });
            return true; // Synchronous response, ensures the listener knows it's handled
        }

        console.log(`Background: ${tasks.length} tasks received. Querying active tab...`);

        // Query for the active tab to execute tasks on
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            console.log("Background: chrome.tabs.query callback executed. Tabs found:", tabs.length);

            if (tabs.length === 0) {
                console.error("Background: No active tab found for processing tasks. Sending error response.");
                sendResponse({ status: 'error', message: 'No active tab found.' });
                return; // Asynchronous response within the callback
            }

            const activeTabId = tabs[0].id;
            console.log(`Background: Active tab ID is ${activeTabId}. Starting sequential task execution.`);

            // Begin executing tasks sequentially
            executeTasksSequentially(tasks, activeTabId, 0, sendResponse);
        });

        // IMPORTANT: Return true to indicate that `sendResponse` will be called asynchronously
        // within the chrome.tabs.query callback or executeTasksSequentially.
        return true;
    }

    // --- Handling XML Storage: Save ---
    if (request.action === 'saveXmlToStorage') {
        const { name, xmlContent } = request;
        console.log(`Background: Received 'saveXmlToStorage' for name: ${name}`);

        if (!name || !xmlContent) {
            console.error("Background: Missing name or XML content for saveXmlToStorage.");
            sendResponse({ status: 'error', message: 'Name and XML content are required.' });
            return true;
        }

        chrome.storage.local.set({ [`xml_${name}`]: xmlContent }, () => {
            if (chrome.runtime.lastError) {
                console.error("Background: Error saving XML to storage:", chrome.runtime.lastError.message);
                sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
            } else {
                console.log(`Background: Successfully saved XML "${name}" to storage.`);
                sendResponse({ status: 'success' });
            }
        });
        return true; // Asynchronous operation
    }

    // --- Handling XML Storage: Load ---
    if (request.action === 'loadXmlFromStorage') {
        const { name } = request;
        console.log(`Background: Received 'loadXmlFromStorage' for name: ${name}`);

        if (!name) {
            console.error("Background: Missing name for loadXmlFromStorage.");
            sendResponse({ status: 'error', message: 'Name is required to load XML.' });
            return true;
        }

        chrome.storage.local.get([`xml_${name}`], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Background: Error loading XML from storage:", chrome.runtime.lastError.message);
                sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
            } else if (result[`xml_${name}`]) {
                console.log(`Background: Successfully loaded XML "${name}" from storage.`);
                sendResponse({ status: 'success', xmlContent: result[`xml_${name}`] });
            } else {
                console.warn(`Background: XML "${name}" not found in storage.`);
                sendResponse({ status: 'error', message: `XML "${name}" not found.` });
            }
        });
        return true; // Asynchronous operation
    }

    // --- Handling XML Storage: Delete ---
    if (request.action === 'deleteXmlFromStorage') {
        const { name } = request;
        console.log(`Background: Received 'deleteXmlFromStorage' for name: ${name}`);

        if (!name) {
            console.error("Background: Missing name for deleteXmlFromStorage.");
            sendResponse({ status: 'error', message: 'Name is required to delete XML.' });
            return true;
        }

        chrome.storage.local.remove([`xml_${name}`], () => {
            if (chrome.runtime.lastError) {
                console.error("Background: Error deleting XML from storage:", chrome.runtime.lastError.message);
                sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
            } else {
                console.log(`Background: Successfully deleted XML "${name}" from storage.`);
                sendResponse({ status: 'success' });
            }
        });
        return true; // Asynchronous operation
    }

    // --- Handling XML Storage: Get All Names ---
    if (request.action === 'getStoredXmlNames') {
        console.log("Background: Received 'getStoredXmlNames'.");
        chrome.storage.local.get(null, (items) => { // Get all items from local storage
            if (chrome.runtime.lastError) {
                console.error("Background: Error getting all stored XML names:", chrome.runtime.lastError.message);
                sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
                return;
            }
            const names = Object.keys(items)
                                .filter(key => key.startsWith('xml_'))
                                .map(key => key.substring(4)); // Remove 'xml_' prefix
            console.log("Background: Found stored XML names:", names);
            sendResponse({ status: 'success', names: names });
        });
        return true; // Asynchronous operation
    }

    // --- Fallback for Unhandled Messages ---
    // If the message's action did not match any of the above 'if' conditions,
    // we still need to send a response to prevent the sender from hanging.
    console.warn("Background: Received unhandled message action:", request.action, ". Sending error response.");
    sendResponse({ status: 'error', message: `Unhandled message action: ${request.action}` });
    return true; // Synchronous response
});

/**
 * Executes a list of tasks sequentially on a given tab.
 * @param {Array<Object>} tasks - An array of task objects to execute.
 * @param {number} tabId - The ID of the Chrome tab to execute tasks on.
 * @param {number} index - The current task index to execute.
 * @param {function} sendResponse - The original sendResponse callback from onMessage listener.
 */
function executeTasksSequentially(tasks, tabId, index, sendResponse) {
    if (index >= tasks.length) {
        console.log("Background: All tasks completed successfully.");
        sendResponse({ status: 'success', message: 'All tasks processed.' });
        return;
    }

    const task = tasks[index]; // Task is already a plain object
    const { action, url, selector, value, scrapeAttribute } = task;

    console.log(`Background: Executing task ${index + 1}/${tasks.length} (Action: ${action}, Selector: ${selector || url})...`);

    // Handle 'navigate' action directly in the background script
    if (action === 'navigate' && url) {
        console.log(`Background: Navigating tab ${tabId} to URL: ${url}`);
        chrome.tabs.update(tabId, { url: url }, () => {
            if (chrome.runtime.lastError) {
                console.error(`Background: Error navigating tab ${tabId} to ${url}:`, chrome.runtime.lastError.message);
                // Decide whether to stop or continue on navigation error
                // For now, let's log and proceed to next task after a delay
            } else {
                console.log(`Background: Navigation to ${url} initiated for tab ${tabId}.`);
            }
            // Give the page a moment to load before executing the next task
            setTimeout(() => {
                executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
            }, 2000); // 2 seconds delay, adjust as needed for page load times
        });
    } else {
        // Send other actions (update, click, scrape) to the content script of the active tab
        console.log(`Background: Sending task to content script in tab ${tabId}.`);
        chrome.tabs.sendMessage(tabId, { action: 'executeTask', task: task }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`Background: Error sending message to content script in tab ${tabId}:`, chrome.runtime.lastError.message);
                // Decide whether to stop or continue on content script communication error
                // For now, let's log and proceed.
            }
            if (response && response.status === 'success') {
                console.log(`Background: Task ${index + 1} completed by content script. Result:`, response.result);
                // Continue to the next task
                setTimeout(() => { // Add a small delay between tasks to allow page rendering/event processing
                    executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                }, 500); // 0.5 seconds delay
            } else {
                console.error(`Background: Task ${index + 1} failed in content script. Error:`, response ? response.message : 'No response or unknown error.');
                // Even if one task fails, decide whether to continue or stop the sequence.
                // For now, we continue processing subsequent tasks after a delay.
                setTimeout(() => {
                    executeTasksSequentially(tasks, tabId, index + 1, sendResponse);
                }, 500);
            }
        });
    }
}