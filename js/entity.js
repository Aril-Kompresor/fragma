/**
 * Entity detail page controller managing field auto-detection, telemetry streaming, and connection instructions.
 */

let currentEntityId = 0;
let currentEntity = null;
let currentDataPoints = [];
let entityPollingIntervalId = null;

/**
 * Initialize entity page upon DOM ready.
 */
document.addEventListener('DOMContentLoaded', () => {
    initEntityPage();
});

/**
 * Parse URL query parameters, mount handlers, and initialize data loading.
 */
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

/**
 * Fetch entity metadata and initiate data points rendering.
 */
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

/**
 * Render entity title, metadata, API key display, detection banner, and field tags.
 */
function renderEntityHeader(entity) {
    const titleEl = document.getElementById('entityTitle');
    const createdEl = document.getElementById('entityCreatedDate');
    const apiKeyEl = document.getElementById('entityApiKeyDisplay');
    const copyKeyBtn = document.getElementById('copyApiKeyBtn');
    const fieldsListEl = document.getElementById('entityFieldsList');
    const redetectBtn = document.getElementById('redetectFieldsBtn');
    const detectionCard = document.getElementById('fieldDetectionCard');
    const detectEndpointEl = document.getElementById('detectEndpointDisplay');
    const detectTokenEl = document.getElementById('detectTokenDisplay');
    const copyEndpointBtn = document.getElementById('copyEndpointBtn');
    const copyTokenBtn = document.getElementById('copyTokenBtn');

    if (titleEl) titleEl.textContent = entity.name;
    if (createdEl) createdEl.textContent = `Created ${formatDateTime(entity.created_at)}`;

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
                    if (detectTokenEl) detectTokenEl.textContent = keyToCopy;
                } else {
                    keyToCopy = entity.api_key_masked;
                }
            }
            copyToClipboard(keyToCopy, copyKeyBtn);
        };
    }

    const endpointUrl = `${window.location.origin}/api/data.php?entity_id=${entity.id}`;
    if (detectEndpointEl) detectEndpointEl.textContent = `POST ${endpointUrl}`;
    if (detectTokenEl) detectTokenEl.textContent = displayKey;

    if (copyEndpointBtn) {
        copyEndpointBtn.onclick = () => copyToClipboard(endpointUrl, copyEndpointBtn);
    }

    if (copyTokenBtn) {
        copyTokenBtn.onclick = () => {
            let tokenToCopy = storedKey;
            if (!tokenToCopy) {
                const entered = prompt('Full API key is not stored locally in this browser. Enter full API key to save and copy (or leave empty to copy masked key):');
                if (entered && entered.trim()) {
                    tokenToCopy = entered.trim();
                    saveLocalApiKey(entity.id, tokenToCopy);
                    if (apiKeyEl) apiKeyEl.textContent = tokenToCopy;
                    if (detectTokenEl) detectTokenEl.textContent = tokenToCopy;
                } else {
                    tokenToCopy = entity.api_key_masked;
                }
            }
            copyToClipboard(tokenToCopy, copyTokenBtn);
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

/**
 * Render ESP32 C++ and curl sample code snippets for sending data based on selected platform.
 */
function renderConnectionSnippets(entity) {
    const curlEl = document.getElementById('curlSnippetCode');
    const espEl = document.getElementById('esp32SnippetCode');
    const copyCurlBtn = document.getElementById('copyCurlBtn');
    const copyEspBtn = document.getElementById('copyEspBtn');
    const platformSelect = document.getElementById('curlPlatformSelect');

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

    const payloadJsonStr = JSON.stringify(samplePayload);

    function getCurlCommand(platform) {
        if (platform === 'cmd') {
            const escapedJson = payloadJsonStr.replace(/"/g, '\\"');
            return `curl -X POST "${origin}/api/data.php?entity_id=${entity.id}" -H "Content-Type: application/json" -H "X-API-Key: ${storedKey}" -d "${escapedJson}"`;
        }
        if (platform === 'ps') {
            return `Invoke-RestMethod -Uri "${origin}/api/data.php?entity_id=${entity.id}" -Method POST -Headers @{ "X-API-Key" = "${storedKey}" } -ContentType "application/json" -Body '${payloadJsonStr}'`;
        }
        return `curl -X POST "${origin}/api/data.php?entity_id=${entity.id}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${storedKey}" \\\n  -d '${payloadJsonStr}'`;
    }

    if (platformSelect) {
        platformSelect.onchange = () => {
            if (curlEl) curlEl.textContent = getCurlCommand(platformSelect.value);
        };
    }

    const selectedPlatform = platformSelect ? platformSelect.value : 'cmd';
    if (curlEl) curlEl.textContent = getCurlCommand(selectedPlatform);

    const espSnippet = `#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "${origin}/api/data.php?entity_id=${entity.id}";
const char* apiKey = "${storedKey}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", apiKey);
    
    String payload = "${payloadJsonStr.replace(/"/g, '\\"')}";
    int httpResponseCode = http.POST(payload);
    http.end();
  }
  delay(10000);
}`;

    if (espEl) espEl.textContent = espSnippet;

    if (copyCurlBtn) {
        copyCurlBtn.onclick = () => {
            const currentPlatform = platformSelect ? platformSelect.value : 'cmd';
            copyToClipboard(getCurlCommand(currentPlatform), copyCurlBtn);
        };
    }
    if (copyEspBtn) copyEspBtn.onclick = () => copyToClipboard(espSnippet, copyEspBtn);
}

/**
 * Configure the in-browser test sender form to submit test payload and detect fields immediately.
 */
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

/**
 * Reset entity fields to re-enter detection mode for new schema configurations.
 */
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

/**
 * Fetch recent time-series data points recorded for this entity.
 */
async function loadDataPoints() {
    try {
        const data = await apiFetch(`/data.php?entity_id=${currentEntityId}&limit=50`);
        currentDataPoints = Array.isArray(data) ? data : [];
    } catch (e) {
        currentDataPoints = [];
    }
}

/**
 * Perform periodic polling refresh of telemetry data and entity status.
 */
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

/**
 * Render raw telemetry table rows showing timestamps and formatted payloads.
 */
function renderDataTable() {
    const tbody = document.getElementById('dataTableBody');
    const emptyRow = document.getElementById('dataTableEmpty');
    if (!tbody) return;

    if (currentDataPoints.length === 0) {
        tbody.innerHTML = '';
        if (emptyRow) emptyRow.style.display = 'table-row';
        return;
    }

    if (emptyRow) emptyRow.style.display = 'none';
    tbody.innerHTML = '';

    currentDataPoints.slice(0, 20).forEach(pt => {
        const tr = document.createElement('tr');

        const timeTd = document.createElement('td');
        timeTd.textContent = formatDateTime(pt.recorded_at);
        tr.appendChild(timeTd);

        const relTd = document.createElement('td');
        relTd.textContent = formatRelativeTime(pt.recorded_at);
        relTd.style.color = 'var(--text-secondary)';
        tr.appendChild(relTd);

        const payloadTd = document.createElement('td');
        const formattedPayload = Object.entries(pt.payload || {})
            .map(([k, v]) => `<span class="field-tag">${escapeHtml(k)}: ${escapeHtml(v)}</span>`)
            .join(' ');
        payloadTd.innerHTML = formattedPayload;
        tr.appendChild(payloadTd);

        tbody.appendChild(tr);
    });
}

/**
 * Configure entity deletion modal dialog and security confirmation.
 */
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

/**
 * Dismiss the entity delete modal dialog.
 */
function closeDeleteModal() {
    const modal = document.getElementById('deleteEntityModal');
    if (modal) modal.classList.remove('modal-backdrop--open');
}

/**
 * Handle entity deletion confirmation with API key authentication header.
 */
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

/**
 * Register global keyboard accessibility shortcuts for modal management.
 */
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDeleteModal();
        }
    });
}
