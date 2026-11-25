let currentEntityId = 0;
let currentProjectUuid = '';
let currentEntity = null;
let currentDataPoints = [];
let entityPollingIntervalId = null;
let isApiKeyVisible = false;
let activeSnippetTab = 'curl';

document.addEventListener('DOMContentLoaded', () => {
    initEntityPage();
});

/** Initialize device detail page, project UUID route check, modals, snippet tabs, and polling. */
async function initEntityPage() {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        currentProjectUuid = project.uuid;
        const crumbProj = document.getElementById('breadcrumbProjectName');
        if (crumbProj) crumbProj.textContent = project.name;

        const dashboardUrl = window.FragmaAuth.buildProjectUrl(currentProjectUuid, 'dashboard');
        const viewUrl = window.FragmaAuth.buildProjectUrl(currentProjectUuid, 'view');
        document.querySelectorAll('#breadcrumbProjectName, #breadcrumbDevicesLink, #backToDevicesBtn').forEach(link => {
            link.setAttribute('href', dashboardUrl);
        });
        document.querySelectorAll('#goToViewBtn').forEach(link => {
            link.setAttribute('href', viewUrl);
        });
    }

    const route = window.FragmaAuth && typeof window.FragmaAuth.parseProjectRoute === 'function'
        ? window.FragmaAuth.parseProjectRoute()
        : null;
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = (route && route.resourceId) ? route.resourceId : urlParams.get('id');

    const fallbackUrl = currentProjectUuid
        ? window.FragmaAuth.buildProjectUrl(currentProjectUuid, 'dashboard')
        : '/projects';

    if (!idParam) {
        window.location.href = fallbackUrl;
        return;
    }

    currentEntityId = parseInt(idParam, 10);
    if (isNaN(currentEntityId) || currentEntityId <= 0) {
        window.location.href = fallbackUrl;
        return;
    }

    setupDeleteModal();
    setupResetFieldsModal();
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

/** Load device metadata and recent telemetry from the API. */
async function loadEntityDetails() {
    try {
        const query = currentProjectUuid
            ? `/entities.php?id=${currentEntityId}&project_uuid=${encodeURIComponent(currentProjectUuid)}`
            : `/entities.php?id=${currentEntityId}`;
        const entity = await apiFetch(query);
        currentEntity = entity;
        if (entity.api_key) {
            saveLocalApiKey(entity.id, entity.api_key);
        }
        const resolvedUuid = entity.project_uuid || currentProjectUuid;
        if (resolvedUuid && window.FragmaAuth && typeof window.FragmaAuth.setActiveProject === 'function') {
            currentProjectUuid = resolvedUuid;
            window.FragmaAuth.setActiveProject(resolvedUuid, entity.project_name || 'Project', entity.project_id || 0);
            const dashboardUrl = window.FragmaAuth.buildProjectUrl(resolvedUuid, 'dashboard');
            const viewUrl = window.FragmaAuth.buildProjectUrl(resolvedUuid, 'view');
            document.querySelectorAll('#breadcrumbProjectName, #breadcrumbDevicesLink, #backToDevicesBtn').forEach(link => {
                link.setAttribute('href', dashboardUrl);
            });
            document.querySelectorAll('#goToViewBtn').forEach(link => {
                link.setAttribute('href', viewUrl);
            });
        }
        renderEntityHeader(entity);
        renderConnectionSnippets(entity);

        await loadDataPoints();
        renderDataTable();
    } catch (err) {
        window.location.href = currentProjectUuid
            ? window.FragmaAuth.buildProjectUrl(currentProjectUuid, 'dashboard')
            : '/projects';
    }
}

/** Check whether a device timestamp is within the last 120 seconds. */
function isDeviceOnline(lastDataAt) {
    if (!lastDataAt) return false;
    const utcStr = typeof normalizeUtcTimestamp === 'function'
        ? normalizeUtcTimestamp(lastDataAt)
        : lastDataAt.replace(' ', 'T') + 'Z';
    return (new Date() - new Date(utcStr)) < 120000;
}

/** Render device header, notes, detected fields, and API key actions. */
function renderEntityHeader(entity) {
    const titleEl = document.getElementById('entityTitle');
    const createdEl = document.getElementById('entityCreatedDate');
    const notesEl = document.getElementById('entityNotesDisplay');
    const apiKeyEl = document.getElementById('entityApiKeyDisplay');
    const toggleKeyBtn = document.getElementById('toggleApiKeyBtn');
    const copyKeyBtn = document.getElementById('copyApiKeyBtn');
    const regenKeyBtn = document.getElementById('regenApiKeyBtn');
    const fieldsListEl = document.getElementById('entityFieldsList');
    const redetectBtn = document.getElementById('redetectFieldsBtn');
    const detectionCard = document.getElementById('fieldDetectionCard');
    const breadcrumbEl = document.getElementById('breadcrumbEntityName');
    const stateBadge = document.getElementById('entityStateBadge');

    if (titleEl) titleEl.textContent = entity.name;
    if (breadcrumbEl) breadcrumbEl.textContent = entity.name;
    if (createdEl) createdEl.textContent = `Dibuat ${formatDateTime(entity.created_at)}`;

    if (notesEl) {
        if (entity.notes) {
            notesEl.style.display = 'block';
            notesEl.textContent = `Lokasi / Catatan: ${entity.notes}`;
        } else {
            notesEl.style.display = 'none';
        }
    }

    if (stateBadge) {
        stateBadge.style.display = 'inline-flex';
        const isRecent = isDeviceOnline(entity.last_data_at);
        stateBadge.className = isRecent ? 'tb-state-badge tb-state-badge--active' : 'tb-state-badge tb-state-badge--inactive';
        stateBadge.textContent = isRecent ? 'Aktif' : 'Nonaktif';
    }

    const fullKey = entity.api_key || getLocalApiKey(entity.id);
    const maskedKey = entity.api_key_masked || 'frag_...';

    const updateKeyView = () => {
        if (apiKeyEl) {
            apiKeyEl.textContent = (isApiKeyVisible && fullKey) ? fullKey : maskedKey;
        }
        if (toggleKeyBtn) {
            toggleKeyBtn.textContent = isApiKeyVisible ? 'Sembunyikan' : 'Tampilkan';
        }
    };

    updateKeyView();

    if (toggleKeyBtn) {
        toggleKeyBtn.onclick = () => {
            isApiKeyVisible = !isApiKeyVisible;
            updateKeyView();
        };
    }

    if (copyKeyBtn) {
        copyKeyBtn.onclick = () => {
            if (fullKey) {
                copyToClipboard(fullKey, copyKeyBtn);
            }
        };
    }

    if (regenKeyBtn) {
        regenKeyBtn.onclick = async () => {
            regenKeyBtn.disabled = true;
            const origText = regenKeyBtn.textContent;
            regenKeyBtn.textContent = 'Membuat...';
            try {
                const res = await fetch(`/api/entities.php?id=${currentEntityId}`, {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ regenerate_key: true })
                });
                const json = await res.json();
                if (json && json.success && json.data && json.data.api_key) {
                    currentEntity.api_key = json.data.api_key;
                    currentEntity.api_key_masked = json.data.api_key_masked;
                    saveLocalApiKey(currentEntity.id, json.data.api_key);
                    isApiKeyVisible = true;
                    renderEntityHeader(currentEntity);
                    renderConnectionSnippets(currentEntity);
                }
            } finally {
                regenKeyBtn.disabled = false;
                regenKeyBtn.textContent = origText;
            }
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
            pendingTag.textContent = 'Menunggu Deteksi';
            fieldsListEl.appendChild(pendingTag);
        }
    }

    if (redetectBtn) {
        redetectBtn.style.display = hasFields ? 'inline-flex' : 'none';
        redetectBtn.onclick = openResetModal;
    }

    if (detectionCard) {
        detectionCard.style.display = hasFields ? 'none' : 'block';
    }
}

/** Render cURL, ESP32, and Python code snippets using the active device API key. */
function renderConnectionSnippets(entity) {
    const activeCodeEl = document.getElementById('activeSnippetCode');
    const copySnippetBtn = document.getElementById('copyActiveSnippetBtn');
    const tabCurl = document.getElementById('tabSnippetCurl');
    const tabEsp32 = document.getElementById('tabSnippetEsp32');
    const tabPython = document.getElementById('tabSnippetPython');

    const origin = window.location.origin;
    const storedKey = entity.api_key || getLocalApiKey(entity.id) || 'API_KEY_ANDA';

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
        esp32: `#include <WiFi.h>\n#include <HTTPClient.h>\n\nconst char* ssid = "WIFI_SSID";\nconst char* password = "WIFI_PASSWORD";\nconst char* serverUrl = "${origin}/api/data.php?entity_id=${entity.id}";\nconst char* apiKey = "${storedKey}";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); }\n}\n\nvoid loop() {\n  if (WiFi.status() == WL_CONNECTED) {\n    HTTPClient http;\n    http.begin(serverUrl);\n    http.addHeader("Content-Type", "application/json");\n    http.addHeader("X-API-Key", apiKey);\n    \n    String payload = "${inlineJson.replace(/"/g, '\\"')}";\n    int httpResponseCode = http.POST(payload);\n    http.end();\n  }\n  delay(10000);\n}`,
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

/** Bind inline telemetry tester form for devices awaiting initial fields. */
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
                throw new Error('Payload harus berupa objek JSON');
            }
        } catch (err) {
            feedback.innerHTML = `<span style="color: var(--danger);">JSON tidak valid: ${escapeHtml(err.message)}</span>`;
            return;
        }

        const key = (currentEntity && currentEntity.api_key) ? currentEntity.api_key : getLocalApiKey(currentEntityId);
        if (!key) {
            feedback.innerHTML = '<span style="color: var(--danger);">API key belum tersedia. Klik "Buat Ulang" pada kartu API Key terlebih dahulu.</span>';
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Mengirim...';
            feedback.innerHTML = '<span style="color: var(--text-secondary);">Mengirim payload ke endpoint...</span>';

            const res = await apiFetch(`/data.php?entity_id=${currentEntityId}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': key
                },
                body: parsed
            });

            const count = res && res.fields ? res.fields.length : Object.keys(parsed).length;
            feedback.innerHTML = `<span style="color: var(--success); font-weight: 600;">Berhasil: ${count} field terdaftar.</span>`;
            await loadEntityDetails();
        } catch (err) {
            feedback.innerHTML = `<span style="color: var(--danger);">Gagal: ${escapeHtml(err.message)}</span>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kirim Uji Payload';
        }
    };
}

/** Open the reset detected fields confirmation modal. */
function openResetModal() {
    const modal = document.getElementById('resetFieldsModal');
    const errBox = document.getElementById('resetFieldsError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
}

/** Close the reset detected fields modal. */
function closeResetModal() {
    const modal = document.getElementById('resetFieldsModal');
    const errBox = document.getElementById('resetFieldsError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.classList.remove('modal-backdrop--open');
        modal.style.display = 'none';
    }
}

/** Submit field reset request using authenticated session ownership. */
async function handleResetFieldsSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitResetFieldsBtn');
    const errBox = document.getElementById('resetFieldsError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Mereset...';
        }

        await apiFetch(`/entities.php?id=${currentEntityId}`, {
            method: 'PUT',
            body: {
                fields: []
            }
        });

        closeResetModal();
        await loadEntityDetails();
    } catch (err) {
        if (errBox) {
            errBox.textContent = `Gagal mereset field: ${err.message}`;
            errBox.classList.remove('form-summary--hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Field';
        }
    }
}

/** Bind event handlers for the reset fields modal. */
function setupResetFieldsModal() {
    const modal = document.getElementById('resetFieldsModal');
    const closeBtn = document.getElementById('closeResetModalBtn');
    const cancelBtn = document.getElementById('cancelResetModalBtn');
    const form = document.getElementById('resetFieldsForm');

    if (closeBtn) closeBtn.onclick = closeResetModal;
    if (cancelBtn) cancelBtn.onclick = closeResetModal;

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeResetModal();
        });
    }

    if (form) {
        form.onsubmit = handleResetFieldsSubmit;
    }
}

/** Fetch recent data points for this device. */
async function loadDataPoints() {
    try {
        const data = await apiFetch(`/data.php?entity_id=${currentEntityId}&limit=50`);
        currentDataPoints = Array.isArray(data) ? data : [];
    } catch (e) {
        currentDataPoints = [];
    }
}

/** Refresh entity fields if pending and reload telemetry table. */
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
            currentDataPoints = currentDataPoints || [];
        }
    }

    await loadDataPoints();
    renderDataTable();
}

/** Render latest values per field in a responsive table. */
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
        countBadge.textContent = `${len} atribut`;
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
        nameTd.dataset.label = 'Field';
        const keyEl = document.createElement('span');
        keyEl.style.fontFamily = 'var(--font-mono)';
        keyEl.style.fontWeight = '600';
        keyEl.style.color = 'var(--text-primary)';
        keyEl.style.fontSize = '0.88rem';
        keyEl.textContent = key;
        nameTd.appendChild(keyEl);
        tr.appendChild(nameTd);

        const valTd = document.createElement('td');
        valTd.dataset.label = 'Nilai';
        const valSpan = document.createElement('span');
        valSpan.style.fontFamily = 'var(--font-mono)';
        valSpan.style.fontWeight = '600';
        valSpan.style.fontSize = '0.95rem';
        valSpan.style.color = 'var(--accent)';

        let displayVal = (entry.value !== null && entry.value !== undefined) ? String(entry.value) : '-';
        const fieldDef = fieldMap.get(key);
        if (fieldDef && fieldDef.unit && displayVal !== '-') {
            displayVal += ` ${fieldDef.unit}`;
        }
        valSpan.textContent = displayVal;
        valTd.appendChild(valSpan);
        tr.appendChild(valTd);

        const timeTd = document.createElement('td');
        timeTd.dataset.label = 'Pembaruan';
        timeTd.style.fontFamily = 'var(--font-mono)';
        timeTd.style.fontSize = '0.82rem';
        timeTd.style.color = 'var(--text-secondary)';
        if (entry.recorded_at) {
            timeTd.textContent = `${formatDateTime(entry.recorded_at)} (${formatRelativeTime(entry.recorded_at)})`;
        } else {
            timeTd.textContent = 'Menunggu data';
        }
        tr.appendChild(timeTd);

        tbody.appendChild(tr);
    });
}

/** Bind manual refresh button on telemetry panel. */
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

/** Bind open/close/submit handlers for the delete device modal. */
function setupDeleteModal() {
    const modal = document.getElementById('deleteEntityModal');
    const openBtn = document.getElementById('openDeleteModalBtn');
    const closeBtn = document.getElementById('closeDeleteModalBtn');
    const cancelBtn = document.getElementById('cancelDeleteModalBtn');
    const form = document.getElementById('deleteEntityForm');

    if (openBtn) {
        openBtn.onclick = () => {
            const errBox = document.getElementById('deleteEntityError');
            const confirmText = document.getElementById('deleteEntityConfirmText');
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }
            if (confirmText && currentEntity) {
                confirmText.textContent = `Hapus perangkat "${currentEntity.name}"? Semua data telemetri dan widget perangkat ini akan dihapus permanen.`;
            }
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('modal-backdrop--open');
            }
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

/** Close the delete device confirmation modal. */
function closeDeleteModal() {
    const modal = document.getElementById('deleteEntityModal');
    const errBox = document.getElementById('deleteEntityError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.classList.remove('modal-backdrop--open');
        modal.style.display = 'none';
    }
}

/** Delete the device using authenticated session ownership. */
async function handleDeleteEntitySubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitDeleteBtn');
    const errBox = document.getElementById('deleteEntityError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Menghapus...';
        }

        await apiFetch(`/entities.php?id=${currentEntityId}`, {
            method: 'DELETE'
        });

        const pUuid = (currentEntity && currentEntity.project_uuid) ? currentEntity.project_uuid : currentProjectUuid;
        window.location.href = pUuid ? window.FragmaAuth.buildProjectUrl(pUuid, 'dashboard') : '/projects';
    } catch (err) {
        if (errBox) {
            errBox.textContent = `Gagal menghapus perangkat: ${err.message}`;
            errBox.classList.remove('form-summary--hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Hapus Perangkat';
        }
    }
}

/** Close open modals on Escape key press. */
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDeleteModal();
            closeResetModal();
        }
    });
}
