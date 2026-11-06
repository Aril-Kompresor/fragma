let currentEntityId = 0;
let currentEntity = null;
let currentDataPoints = [];
let entityPollingIntervalId = null;

document.addEventListener('DOMContentLoaded', () => {
    initEntityPage();
});

function initEntityPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');

    if (!idParam) {
        window.location.href = '/dashboard/index.html';
        return;
    }

    currentEntityId = parseInt(idParam, 10);
    if (isNaN(currentEntityId) || currentEntityId <= 0) {
        window.location.href = '/dashboard/index.html';
        return;
    }

    setupDeleteModal();
    setupInlineTester();
    setupKeyboardShortcuts();
    setupStreamControls();
    loadEntityDetails();

    if (entityPollingIntervalId) {
        clearInterval(entityPollingIntervalId);
    }
    entityPollingIntervalId = setInterval(refreshData, 6000);

    window.addEventListener('beforeunload', () => {
        if (entityPollingIntervalId) {
            clearInterval(entityPollingIntervalId);
        }
    });
}

async function loadEntityDetails() {
    try {
        const entity = await apiFetch(`/entities.php?id=${currentEntityId}`);
        currentEntity = entity;
        renderEntityHeader(entity);
        renderConnectionSnippets(entity);

        await loadDataPoints();
        renderDataTable();
    } catch (err) {
        alert(`Failed to load entity: ${err.message}`);
        window.location.href = '/dashboard/index.html';
    }
}

let activeSnippetTab = 'curl';

function renderEntityHeader(entity) {
    const titleEl = document.getElementById('entityTitle');
    const createdEl = document.getElementById('entityCreatedDate');
    const apiKeyEl = document.getElementById('entityApiKeyDisplay');
    const copyKeyBtn = document.getElementById('copyApiKeyBtn');
    const fieldsListEl = document.getElementById('entityFieldsList');
    const redetectBtn = document.getElementById('redetectFieldsBtn');
    const detectionCard = document.getElementById('fieldDetectionCard');
    const breadcrumbEl = document.getElementById('breadcrumbEntityName');
    const stateBadge = document.getElementById('entityStateBadge');

    if (titleEl) titleEl.textContent = entity.name;
    if (breadcrumbEl) breadcrumbEl.textContent = entity.name;
    if (createdEl) createdEl.textContent = `Created ${formatDateTime(entity.created_at)}`;

    if (stateBadge) {
        stateBadge.style.display = 'inline-flex';
        const isRecent = entity.last_data_at && (new Date() - new Date(entity.last_data_at.replace(' ', 'T') + 'Z') < 120000);
        stateBadge.className = isRecent ? 'tb-state-badge tb-state-badge--active' : 'tb-state-badge tb-state-badge--inactive';
        stateBadge.textContent = isRecent ? 'Active' : 'Inactive';
    }

    const storedKey = getLocalApiKey(entity.id);
    const displayKey = storedKey ? storedKey : entity.api_key_masked;

    if (apiKeyEl) apiKeyEl.textContent = displayKey;

    if (copyKeyBtn) {
        copyKeyBtn.onclick = () => {
            let keyToCopy = storedKey;
            if (!keyToCopy) {
                const entered = prompt('Full API key is not stored locally in this browser. Enter full API key to save and copy (or leave empty to copy masked key):');
                if (entered && entered.trim()) {
                    keyToCopy = entered.trim();
                    saveLocalApiKey(entity.id, keyToCopy);
                    if (apiKeyEl) apiKeyEl.textContent = keyToCopy;
                } else {
                    keyToCopy = entity.api_key_masked;
                }
            }
            copyToClipboard(keyToCopy, copyKeyBtn);
        };
    }

    const hasFields = Array.isArray(entity.fields) && entity.fields.length > 0;

    if (fieldsListEl) {
        fieldsListEl.innerHTML = '';
        if (hasFields) {
            entity.fields.forEach(f => {
                const tag = document.createElement('span');
                tag.className = 'field-tag';
                tag.textContent = `${f.name} (${f.type}${f.unit ? `, ${f.unit}` : ''})`;
                fieldsListEl.appendChild(tag);
            });
        } else {
            const pendingTag = document.createElement('span');
            pendingTag.className = 'field-tag';
            pendingTag.style.background = 'rgba(243, 156, 18, 0.12)';
            pendingTag.style.color = 'var(--warning)';
            pendingTag.style.borderColor = 'rgba(243, 156, 18, 0.3)';
            pendingTag.textContent = 'Awaiting Detection';
            fieldsListEl.appendChild(pendingTag);
        }
    }

    if (redetectBtn) {
        redetectBtn.style.display = hasFields ? 'inline-flex' : 'none';
        redetectBtn.onclick = handleRedetectFields;
    }

    if (detectionCard) {
        detectionCard.style.display = hasFields ? 'none' : 'block';
    }
}

function renderConnectionSnippets(entity) {
    const activeCodeEl = document.getElementById('activeSnippetCode');
    const copySnippetBtn = document.getElementById('copyActiveSnippetBtn');
    const tabCurl = document.getElementById('tabSnippetCurl');
    const tabEsp32 = document.getElementById('tabSnippetEsp32');
    const tabPython = document.getElementById('tabSnippetPython');

    const origin = window.location.origin;
    const storedKey = getLocalApiKey(entity.id) || 'YOUR_API_KEY';

    const samplePayload = {};
    if (Array.isArray(entity.fields) && entity.fields.length > 0) {
        entity.fields.forEach(f => {
            samplePayload[f.name] = f.type === 'number' ? 24.5 : (f.type === 'boolean' ? true : 'ok');
        });
    } else {
        samplePayload['temperature'] = 25.4;
        samplePayload['humidity'] = 62.0;
    }

    const inlineJson = JSON.stringify(samplePayload);

    const snippets = {
        curl: `curl -X POST "${origin}/api/data.php?entity_id=${entity.id}" -H "Content-Type: application/json" -H "X-API-Key: ${storedKey}" -d '${inlineJson}'`,
        esp32: `#include <WiFi.h>\n#include <HTTPClient.h>\n\nconst char* ssid = "YOUR_WIFI_SSID";\nconst char* password = "YOUR_WIFI_PASSWORD";\nconst char* serverUrl = "${origin}/api/data.php?entity_id=${entity.id}";\nconst char* apiKey = "${storedKey}";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); }\n}\n\nvoid loop() {\n  if (WiFi.status() == WL_CONNECTED) {\n    HTTPClient http;\n    http.begin(serverUrl);\n    http.addHeader("Content-Type", "application/json");\n    http.addHeader("X-API-Key", apiKey);\n    \n    String payload = "${inlineJson.replace(/"/g, '\\"')}";\n    int httpResponseCode = http.POST(payload);\n    http.end();\n  }\n  delay(10000);\n}`,
        python: `import requests\n\nurl = "${origin}/api/data.php?entity_id=${entity.id}"\nheaders = {\n    "Content-Type": "application/json",\n    "X-API-Key": "${storedKey}"\n}\npayload = ${JSON.stringify(samplePayload, null, 4)}\n\nresponse = requests.post(url, json=payload, headers=headers)\nprint(response.status_code, response.json())`
    };

    const updateSnippetView = () => {
        if (activeCodeEl) activeCodeEl.textContent = snippets[activeSnippetTab] || snippets.curl;
        [tabCurl, tabEsp32, tabPython].forEach(btn => {
            if (btn) {
                btn.classList.remove('code-tab-btn--active');
                btn.setAttribute('aria-selected', 'false');
            }
        });
        if (activeSnippetTab === 'curl' && tabCurl) {
            tabCurl.classList.add('code-tab-btn--active');
            tabCurl.setAttribute('aria-selected', 'true');
        } else if (activeSnippetTab === 'esp32' && tabEsp32) {
            tabEsp32.classList.add('code-tab-btn--active');
            tabEsp32.setAttribute('aria-selected', 'true');
        } else if (activeSnippetTab === 'python' && tabPython) {
            tabPython.classList.add('code-tab-btn--active');
            tabPython.setAttribute('aria-selected', 'true');
        }
    };

    if (tabCurl) tabCurl.onclick = () => { activeSnippetTab = 'curl'; updateSnippetView(); };
    if (tabEsp32) tabEsp32.onclick = () => { activeSnippetTab = 'esp32'; updateSnippetView(); };
    if (tabPython) tabPython.onclick = () => { activeSnippetTab = 'python'; updateSnippetView(); };

    if (copySnippetBtn) {
        copySnippetBtn.onclick = () => {
            const codeToCopy = snippets[activeSnippetTab] || snippets.curl;
            copyToClipboard(codeToCopy, copySnippetBtn);
        };
    }

    updateSnippetView();
}

function setupInlineTester() {
    const form = document.getElementById('inlineTesterForm');
    const input = document.getElementById('testerPayloadInput');
    const feedback = document.getElementById('testerStatusFeedback');
    const submitBtn = document.getElementById('testerSubmitBtn');

    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const rawJson = input.value.trim();
        let parsed = null;

        try {
            parsed = JSON.parse(rawJson);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Payload must be a JSON object');
            }
        } catch (err) {
            feedback.innerHTML = `<span style="color: var(--danger);">Invalid JSON: ${escapeHtml(err.message)}</span>`;
            return;
        }

        let key = getLocalApiKey(currentEntityId);
        if (!key) {
            key = prompt('Enter your full Entity API Key / Token:');
            if (key) {
                key = key.trim();
                saveLocalApiKey(currentEntityId, key);
            } else {
                feedback.innerHTML = '<span style="color: var(--danger);">API key is required to send data.</span>';
                return;
            }
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            feedback.innerHTML = '<span style="color: var(--text-secondary);">Transmitting payload to endpoint...</span>';

            const res = await apiFetch(`/data.php?entity_id=${currentEntityId}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': key
                },
                body: parsed
            });

            const count = res && res.fields ? res.fields.length : Object.keys(parsed).length;
            feedback.innerHTML = `<span style="color: var(--success); font-weight: 600;">Success: Payload accepted, ${count} field(s) registered.</span>`;
            await loadEntityDetails();
        } catch (err) {
            feedback.innerHTML = `<span style="color: var(--danger);">Error: ${escapeHtml(err.message)}</span>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Test Payload';
        }
    };
}

async function handleRedetectFields() {
    if (!confirm('Reset detected fields? The entity will enter detection mode until a new payload is received.')) {
        return;
    }

    let key = getLocalApiKey(currentEntityId);
    if (!key) {
        key = prompt('Enter your full Entity API Key to confirm field reset:');
        if (key) {
            key = key.trim();
            saveLocalApiKey(currentEntityId, key);
        } else {
            return;
        }
    }

    try {
        await apiFetch(`/entities.php?id=${currentEntityId}`, {
            method: 'PUT',
            headers: {
                'X-API-Key': key
            },
            body: {
                fields: []
            }
        });

        await loadEntityDetails();
    } catch (err) {
        alert(`Failed to reset fields: ${err.message}`);
    }
}

async function loadDataPoints() {
    try {
        const data = await apiFetch(`/data.php?entity_id=${currentEntityId}&limit=50`);
        currentDataPoints = Array.isArray(data) ? data : [];
    } catch (e) {
        currentDataPoints = [];
    }
}

async function refreshData() {
    if (!currentEntity || !Array.isArray(currentEntity.fields) || currentEntity.fields.length === 0) {
        try {
            const entity = await apiFetch(`/entities.php?id=${currentEntityId}`);
            if (entity && Array.isArray(entity.fields) && entity.fields.length > 0) {
                currentEntity = entity;
                renderEntityHeader(entity);
                renderConnectionSnippets(entity);
            }
        } catch (e) {
        }
    }

    await loadDataPoints();
    renderDataTable();
}

function renderDataTable() {
    const tbody = document.getElementById('dataTableBody');
    const tableEl = document.getElementById('telemetryDataTable');
    const emptyEl = document.getElementById('dataTableEmpty');
    const countBadge = document.getElementById('streamCountBadge');
    if (!tbody) return;

    const latestKeys = new Map();

    currentDataPoints.forEach(pt => {
        const payload = (pt && typeof pt.payload === 'object' && pt.payload !== null) ? pt.payload : {};
        Object.entries(payload).forEach(([key, val]) => {
            if (!latestKeys.has(key)) {
                latestKeys.set(key, {
                    value: val,
                    recorded_at: pt.recorded_at
                });
            }
        });
    });

    const fieldMap = new Map();
    if (currentEntity && Array.isArray(currentEntity.fields)) {
        currentEntity.fields.forEach(f => {
            if (f && f.name) {
                fieldMap.set(f.name, f);
                if (!latestKeys.has(f.name)) {
                    latestKeys.set(f.name, {
                        value: null,
                        recorded_at: null
                    });
                }
            }
        });
    }

    if (countBadge) {
        const len = latestKeys.size;
        countBadge.textContent = `${len} ${len === 1 ? 'attribute' : 'attributes'}`;
    }

    if (latestKeys.size === 0) {
        tbody.replaceChildren();
        if (emptyEl) emptyEl.style.display = 'block';
        if (tableEl) tableEl.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'table';
    tbody.replaceChildren();

    const sortedKeys = Array.from(latestKeys.keys()).sort();

    sortedKeys.forEach(key => {
        const entry = latestKeys.get(key);
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        const keyEl = document.createElement('span');
        keyEl.style.fontFamily = 'var(--font-mono)';
        keyEl.style.fontWeight = '600';
        keyEl.style.color = 'var(--text-primary)';
        keyEl.style.fontSize = '0.88rem';
        keyEl.textContent = key;
        nameTd.appendChild(keyEl);
        tr.appendChild(nameTd);

        const valTd = document.createElement('td');
        const valSpan = document.createElement('span');
        valSpan.style.fontFamily = 'var(--font-mono)';
        valSpan.style.fontWeight = '600';
        valSpan.style.fontSize = '0.95rem';
        valSpan.style.color = 'var(--accent)';

        let displayVal = (entry.value !== null && entry.value !== undefined) ? String(entry.value) : '—';
        const fieldDef = fieldMap.get(key);
        if (fieldDef && fieldDef.unit && displayVal !== '—') {
            displayVal += ` ${fieldDef.unit}`;
        }
        valSpan.textContent = displayVal;
        valTd.appendChild(valSpan);
        tr.appendChild(valTd);

        const timeTd = document.createElement('td');
        timeTd.style.fontFamily = 'var(--font-mono)';
        timeTd.style.fontSize = '0.82rem';
        timeTd.style.color = 'var(--text-secondary)';
        if (entry.recorded_at) {
            timeTd.textContent = `${formatDateTime(entry.recorded_at)} (${formatRelativeTime(entry.recorded_at)})`;
        } else {
            timeTd.textContent = 'Awaiting telemetry';
        }
        tr.appendChild(timeTd);

        tbody.appendChild(tr);
    });
}

function setupStreamControls() {
    const refreshBtn = document.getElementById('refreshStreamBtn');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            await refreshData();
            refreshBtn.disabled = false;
        };
    }
}

function setupDeleteModal() {
    const modal = document.getElementById('deleteEntityModal');
    const openBtn = document.getElementById('openDeleteModalBtn');
    const closeBtn = document.getElementById('closeDeleteModalBtn');
    const cancelBtn = document.getElementById('cancelDeleteModalBtn');
    const form = document.getElementById('deleteEntityForm');

    if (openBtn) {
        openBtn.onclick = () => {
            const input = document.getElementById('deleteApiKeyInput');
            const storedKey = getLocalApiKey(currentEntityId);
            if (input && storedKey) {
                input.value = storedKey;
            }
            if (modal) modal.classList.add('modal-backdrop--open');
        };
    }

    if (closeBtn) closeBtn.onclick = closeDeleteModal;
    if (cancelBtn) cancelBtn.onclick = closeDeleteModal;

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    }

    if (form) {
        form.onsubmit = handleDeleteEntitySubmit;
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteEntityModal');
    if (modal) modal.classList.remove('modal-backdrop--open');
}

async function handleDeleteEntitySubmit(e) {
    e.preventDefault();
    const apiKey = document.getElementById('deleteApiKeyInput').value.trim();
    const submitBtn = document.getElementById('submitDeleteBtn');

    if (!apiKey) {
        alert('Please enter the API key to confirm deletion');
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Deleting...';
        }

        await apiFetch(`/entities.php?id=${currentEntityId}`, {
            method: 'DELETE',
            headers: {
                'X-API-Key': apiKey
            }
        });

        alert('Entity deleted successfully');
        window.location.href = '/dashboard/index.html';
    } catch (err) {
        alert(`Deletion failed: ${err.message}`);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Delete';
        }
    }
}

function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDeleteModal();
        }
    });
}
