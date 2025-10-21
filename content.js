// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'executeTask' && request.task) {
        const task = request.task;
        console.log("Content script executing task:", task);

        try {
            switch (task.action) {
                case 'update':
                    const inputElement = document.querySelector(task.selector);
                    if (inputElement) {
                        inputElement.value = task.value;
                        sendResponse({ status: 'success', result: `Updated element ${task.selector}` });
                    } else {
                        sendResponse({ status: 'error', message: `Element not found: ${task.selector}` });
                    }
                    break;
                case 'click':
                    const clickableElement = document.querySelector(task.selector);
                    if (clickableElement) {
                        clickableElement.click();
                        sendResponse({ status: 'success', result: `Clicked element ${task.selector}` });
                    } else {
                        sendResponse({ status: 'error', message: `Element not found: ${task.selector}` });
                    }
                    break;
                case 'scrape':
                    const scrapeElement = document.querySelector(task.selector);
                    if (scrapeElement) {
                        let scrapedValue = '';
                        if (task.scrapeAttribute === 'innerText') {
                            scrapedValue = scrapeElement.innerText;
                        } else if (task.scrapeAttribute === 'value') {
                            scrapedValue = scrapeElement.value;
                        } else if (task.scrapeAttribute === 'href') {
                            scrapedValue = scrapeElement.href;
                        } else if (task.scrapeAttribute) {
                             scrapedValue = scrapeElement.getAttribute(task.scrapeAttribute);
                        } else {
                             scrapedValue = scrapeElement.innerText;
                        }
                        console.log(`Scraped ${task.selector}: ${scrapedValue}`);
                        sendResponse({ status: 'success', result: { selector: task.selector, value: scrapedValue } });
                    } else {
                        sendResponse({ status: 'error', message: `Element not found for scraping: ${task.selector}` });
                    }
                    break;

                // --- NEW CASE: selectByText ---
                case 'selectByText':
                    const selectElement = document.querySelector(task.selector);
                    const optionTextToSelect = task.value; // The visible text from XML 'value'

                    if (selectElement) {
                        let optionFound = false;
                        // Iterate through all options to find a match by textContent
                        for (let i = 0; i < selectElement.options.length; i++) {
                            if (selectElement.options[i].textContent.trim() === optionTextToSelect) {
                                selectElement.value = selectElement.options[i].value;
                                optionFound = true;

                                // Often, changing the 'value' programmatically doesn't trigger
                                // 'change' events. Manually dispatch one if needed for forms.
                                const event = new Event('change', { bubbles: true });
                                selectElement.dispatchEvent(event);

                                sendResponse({ status: 'success', result: `Selected option "${optionTextToSelect}" in ${task.selector}` });
                                break;
                            }
                        }
                        if (!optionFound) {
                            sendResponse({ status: 'error', message: `Option with text "${optionTextToSelect}" not found in dropdown ${task.selector}` });
                        }
                    } else {
                        sendResponse({ status: 'error', message: `Dropdown element not found: ${task.selector}` });
                    }
                    break;

                default:
                    sendResponse({ status: 'error', message: `Unknown action: ${task.action}` });
            }
        } catch (e) {
            sendResponse({ status: 'error', message: `Content script error: ${e.message}` });
        }
        return true; // Indicates an asynchronous response
    }
});