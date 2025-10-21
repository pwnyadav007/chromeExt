const xmlFileInput = document.getElementById('xmlFileInput');
const processFromFileBtn = document.getElementById('processFromFile');
const saveNameInput = document.getElementById('saveNameInput');
const saveXmlToStorageBtn = document.getElementById('saveXmlToStorage');
const storedXmlSelect = document.getElementById('storedXmlSelect');
const loadXmlFromStorageBtn = document.getElementById('loadXmlFromStorage');
const deleteSelectedXmlBtn = document.getElementById('deleteSelectedXml');
const statusDiv = document.getElementById('status');
const saveStatusSpan = document.getElementById('saveStatus');

let currentLoadedXmlContent = null; // Stores the raw XML string that was last loaded/processed
let currentLoadedTasksArray = null; // Stores the parsed array of tasks

document.addEventListener('DOMContentLoaded', loadStoredXmlOptions);

processFromFileBtn.addEventListener('click', async () => {
    const file = xmlFileInput.files[0];
    if (!file) {
        setStatus('Please select an XML file.', 'error');
        return;
    }

    setStatus('Reading XML file...', '');
    const reader = new FileReader();
    reader.onload = async (e) => {
        const xmlContent = e.target.result;
        currentLoadedXmlContent = xmlContent; // Store raw content for potential saving

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                setStatus(`Error parsing XML file: ${errorNode.textContent}`, 'error');
                console.error("XML Parsing Error:", errorNode);
                return;
            }

            // --- CRITICAL NEW/UPDATED LOGIC HERE: Extract tasks into a serializable array ---
            const tasks = xmlDoc.querySelectorAll('task');
            const tasksArray = [];
            tasks.forEach(taskElement => {
                const action = taskElement.querySelector('action')?.textContent;
                const url = taskElement.querySelector('url')?.textContent;
                const selector = taskElement.querySelector('selector')?.textContent;
                const value = taskElement.querySelector('value')?.textContent;
                const scrapeAttribute = taskElement.querySelector('scrapeAttribute')?.textContent;

                tasksArray.push({
                    action: action,
                    url: url,
                    selector: selector,
                    value: value,
                    scrapeAttribute: scrapeAttribute
                });
            });
            currentLoadedTasksArray = tasksArray; // Store for potential processing

            // Now send the serializable array of tasks to the background script
            await processTasks(tasksArray);

        } catch (parseError) {
            setStatus(`Error parsing XML file: ${parseError.message}`, 'error');
            console.error("XML Parsing Error:", parseError);
        }
    };
    reader.onerror = () => {
        setStatus('Error reading file.', 'error');
    };
    reader.readAsText(file);
});

saveXmlToStorageBtn.addEventListener('click', async () => {
    const name = saveNameInput.value.trim();
    if (!name) {
        setSaveStatus('Please enter a name for the XML.', 'error');
        return;
    }
    if (!currentLoadedXmlContent) { // We save the raw XML content, not the parsed array
        setSaveStatus('No XML loaded to save. Load from file first.', 'error');
        return;
    }

    // Validate XML before saving (good practice)
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(currentLoadedXmlContent, "application/xml");
        if (xmlDoc.querySelector('parsererror')) {
            setSaveStatus('Cannot save invalid XML. Please fix the file.', 'error');
            return;
        }
    } catch (e) {
        setSaveStatus(`Invalid XML structure: ${e.message}`, 'error');
        return;
    }

    setSaveStatus('Saving XML...', '');
    chrome.runtime.sendMessage({
        action: 'saveXmlToStorage',
        name: name,
        xmlContent: currentLoadedXmlContent // Send raw string to background for storage
    }, (response) => {
        if (response && response.status === 'success') {
            setSaveStatus(`XML "${name}" saved successfully!`, 'success');
            saveNameInput.value = ''; // Clear input
            loadStoredXmlOptions(); // Refresh the select box
        } else {
            setSaveStatus(`Error saving XML: ${response?.message || 'Unknown error'}`, 'error');
        }
    });
});

loadXmlFromStorageBtn.addEventListener('click', async () => {
    const selectedName = storedXmlSelect.value;
    if (!selectedName) {
        setStatus('Please select a stored XML configuration.', 'error');
        return;
    }

    setStatus(`Loading "${selectedName}" from storage...`, '');
    chrome.runtime.sendMessage({
        action: 'loadXmlFromStorage',
        name: selectedName
    }, async (response) => {
        if (response && response.status === 'success' && response.xmlContent) {
            currentLoadedXmlContent = response.xmlContent; // Store raw content for re-saving if needed

            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(currentLoadedXmlContent, "application/xml");
                const errorNode = xmlDoc.querySelector('parsererror');
                if (errorNode) {
                    setStatus(`Error parsing stored XML: ${errorNode.textContent}`, 'error');
                    console.error("Stored XML Parsing Error:", errorNode);
                    return;
                }

                // --- CRITICAL NEW/UPDATED LOGIC HERE: Extract tasks into a serializable array ---
                const tasks = xmlDoc.querySelectorAll('task');
                const tasksArray = [];
                tasks.forEach(taskElement => {
                    const action = taskElement.querySelector('action')?.textContent;
                    const url = taskElement.querySelector('url')?.textContent;
                    const selector = taskElement.querySelector('selector')?.textContent;
                    const value = taskElement.querySelector('value')?.textContent;
                    const scrapeAttribute = taskElement.querySelector('scrapeAttribute')?.textContent;

                    tasksArray.push({
                        action: action,
                        url: url,
                        selector: selector,
                        value: value,
                        scrapeAttribute: scrapeAttribute
                    });
                });
                currentLoadedTasksArray = tasksArray; // Store for potential processing

                // Send the serializable array of tasks to the background script
                await processTasks(tasksArray);

            } catch (parseError) {
                setStatus(`Error parsing stored XML: ${parseError.message}`, 'error');
                console.error("Stored XML Parsing Error:", parseError);
            }

        } else {
            setStatus(`Error loading XML: ${response?.message || 'Unknown error'}`, 'error');
        }
    });
});

deleteSelectedXmlBtn.addEventListener('click', async () => {
    const selectedName = storedXmlSelect.value;
    if (!selectedName) {
        setStatus('Please select an XML configuration to delete.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${selectedName}"?`)) {
        return;
    }

    setStatus(`Deleting "${selectedName}"...`, '');
    chrome.runtime.sendMessage({
        action: 'deleteXmlFromStorage',
        name: selectedName
    }, (response) => {
        if (response && response.status === 'success') {
            setStatus(`"${selectedName}" deleted.`, 'success');
            loadStoredXmlOptions(); // Refresh the select box
            currentLoadedXmlContent = null; // Clear if the deleted one was current
            currentLoadedTasksArray = null;
        } else {
            setStatus(`Error deleting XML: ${response?.message || 'Unknown error'}`, 'error');
        }
    });
});

// Renamed and updated function to send the tasksArray

async function processTasks(tasksArray) {
    setStatus('Sending tasks to background...', '');
    console.log("Popup: Attempting to send message to background with tasksArray:", tasksArray); // ADD THIS LINE
    chrome.runtime.sendMessage({ action: 'processXmlInstructions', tasksArray: tasksArray }, (response) => {
        console.log("Popup: Received response from background:", response); // ADD THIS LINE for checking response
        if (response && response.status === 'success') {
            setStatus('XML processing complete!', 'success');
        } else if (response && response.status === 'error') {
            setStatus(`Error: ${response.message}`, 'error');
        } else {
            setStatus('Unknown response from background script.', 'error');
        }
    });
}


function setStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type ? `status ${type}` : 'status';
}

function setSaveStatus(message, type) {
    saveStatusSpan.textContent = message;
    saveStatusSpan.className = type ? `status ${type}` : 'status';
    // Clear after a few seconds
    setTimeout(() => {
        saveStatusSpan.textContent = '';
        saveStatusSpan.className = 'status';
    }, 3000);
}

function loadStoredXmlOptions() {
    chrome.runtime.sendMessage({ action: 'getStoredXmlNames' }, (response) => {
        storedXmlSelect.innerHTML = '<option value="">-- Select a configuration --</option>'; // Clear existing options
        if (response && response.status === 'success' && response.names) {
            response.names.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                storedXmlSelect.appendChild(option);
            });
        }
    });
}