/**
 * Main dashboard application controller managing ThingsBoard-style entity table, creation modal, and polling.
 */

let pollingIntervalId = null;
let rawEntities = [];
let currentTab = 'all';
let searchQuery = '';
let currentPage = 1;
let pageSize = 10;
let isPollingEnabled = true;
let selectedEntityIds = new Set();

/**
 * Initialize dashboard view, load entities, and establish background polling.
 */
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

/**
 * Mount event listeners, render initial entities, and start the polling cycle.
 */
function initDashboard() {
    setupModalEvents();
    setupThingsBoardControls();
    loadEntities();
    startPolling();

    window.addEventListener('beforeunload', () => {
        stopPolling();
    });
}

/**
 * Start periodic live polling.
 */
function startPolling() {
    stopPolling();
    if (!isPollingEnabled) return;
    pollingIntervalId = setInterval(loadEntities, 10000);
}

/**
 * Clear existing background polling timer.
 */
function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

/**
 * Setup ThingsBoard toolbar controls, search, tabs, and pagination handlers.
 */
function setupThingsBoardControls() {
    const tabAll = document.getElementById('tabAllEntities');
    const tabActive = document.getElementById('tabActiveEntities');
    const tabInactive = document.getElementById('tabInactiveEntities');
    const searchInput = document.getElementById('tbSearchInput');
    const refreshBtn = document.getElementById('tbRefreshBtn');
    const pollingToggle = document.getElementById('tbPollingToggle');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const pageSizeSelect = document.getElementById('itemsPerPageSelect');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');

    const selectTab = (tabName, clickedBtn) => {
        currentTab = tabName;
        [tabAll, tabActive, tabInactive].forEach(btn => {
            if (btn) {
                btn.classList.remove('tb-tab--active');
                btn.setAttribute('aria-selected', 'false');
            }
        });
        if (clickedBtn) {
            clickedBtn.classList.add('tb-tab--active');
            clickedBtn.setAttribute('aria-selected', 'true');
        }
        currentPage = 1;
        applyFilterAndRender();
    };

    if (tabAll) tabAll.onclick = () => selectTab('all', tabAll);
    if (tabActive) tabActive.onclick = () => selectTab('active', tabActive);
    if (tabInactive) tabInactive.onclick = () => selectTab('inactive', tabInactive);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            currentPage = 1;
            applyFilterAndRender();
        });
    }

    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            await loadEntities();
            refreshBtn.disabled = false;
        };
    }

    if (pollingToggle) {
        pollingToggle.onchange = () => {
            isPollingEnabled = pollingToggle.checked;
            if (isPollingEnabled) {
                startPolling();
            } else {
                stopPolling();
            }
        };
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.onchange = () => {
            const isChecked = selectAllCheckbox.checked;
            const rowCheckboxes = document.querySelectorAll('.tb-row-checkbox');
            rowCheckboxes.forEach(cb => {
                cb.checked = isChecked;
                const entityId = parseInt(cb.dataset.id, 10);
                if (isChecked) {
                    selectedEntityIds.add(entityId);
                } else {
                    selectedEntityIds.delete(entityId);
                }
                const tr = cb.closest('tr');
                if (tr) tr.classList.toggle('tb-row-selected', isChecked);
            });
        };
    }

    if (pageSizeSelect) {
        pageSizeSelect.onchange = () => {
            pageSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentPage = 1;
            applyFilterAndRender();
        };
    }

    if (btnFirst) btnFirst.onclick = () => { currentPage = 1; applyFilterAndRender(); };
    if (btnPrev) btnPrev.onclick = () => { if (currentPage > 1) { currentPage--; applyFilterAndRender(); } };
    if (btnNext) btnNext.onclick = () => { currentPage++; applyFilterAndRender(); };
    if (btnLast) btnLast.onclick = () => {
        const filtered = getFilteredEntities();
        const maxPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = maxPages;
        applyFilterAndRender();
    };
}

/**
 * Fetch entity collection from backend and update ThingsBoard data table.
 */
async function loadEntities() {
    const loading = document.getElementById('entitiesLoading');

    try {
        const entities = await apiFetch('/entities.php');
        if (loading) loading.style.display = 'none';

        rawEntities = Array.isArray(entities) ? entities : [];
        updateTabCounts();
        applyFilterAndRender();
    } catch (err) {
        if (loading) loading.style.display = 'none';
        const tbody = document.getElementById('entitiesTableBody');
        if (tbody && rawEntities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--danger);">
                        Failed to load devices: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * Update entity count indicators on tabs.
 */
function updateTabCounts() {
    const countAll = document.getElementById('countAllEntities');
    const countActive = document.getElementById('countActiveEntities');
    const countInactive = document.getElementById('countInactiveEntities');

    let activeCount = 0;
    let inactiveCount = 0;

    rawEntities.forEach(item => {
        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);
        if (isRecent) {
            activeCount++;
        } else {
            inactiveCount++;
        }
    });

    if (countAll) countAll.textContent = String(rawEntities.length);
    if (countActive) countActive.textContent = String(activeCount);
    if (countInactive) countInactive.textContent = String(inactiveCount);
}

/**
 * Filter entity list based on active tab and search query string.
 */
function getFilteredEntities() {
    return rawEntities.filter(item => {
        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);

        if (currentTab === 'active' && !isRecent) return false;
        if (currentTab === 'inactive' && isRecent) return false;

        if (searchQuery) {
            const nameMatch = (item.name || '').toLowerCase().includes(searchQuery);
            const fieldsMatch = Array.isArray(item.fields) && item.fields.some(f => (f.name || '').toLowerCase().includes(searchQuery));
            if (!nameMatch && !fieldsMatch) return false;
        }

        return true;
    });
}

/**
 * Apply filtering, calculate pagination slice, and render table rows.
 */
function applyFilterAndRender() {
    const filtered = getFilteredEntities();
    const totalCount = filtered.length;
    const maxPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (currentPage > maxPages) currentPage = maxPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalCount);
    const pageItems = filtered.slice(startIndex, endIndex);

    renderThingsBoardTable(pageItems, totalCount, startIndex, endIndex, maxPages);
}

/**
 * Render ThingsBoard-style entity table rows and update pagination elements.
 */
function renderThingsBoardTable(items, totalCount, startIndex, endIndex, maxPages) {
    const tableEl = document.getElementById('entitiesTable');
    const tbody = document.getElementById('entitiesTableBody');
    const emptyEl = document.getElementById('entitiesEmptyState');
    const paginationInfo = document.getElementById('tbPaginationInfo');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (!tbody) return;

    if (totalCount === 0) {
        tbody.replaceChildren();
        if (tableEl) tableEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        if (paginationInfo) paginationInfo.textContent = '0 - 0 of 0';
        if (btnFirst) btnFirst.disabled = true;
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        if (btnLast) btnLast.disabled = true;
        return;
    }

    if (tableEl) tableEl.style.display = 'table';
    if (emptyEl) emptyEl.style.display = 'none';
    tbody.replaceChildren();

    if (paginationInfo) {
        paginationInfo.textContent = `${startIndex + 1} - ${endIndex} of ${totalCount}`;
    }

    if (btnFirst) btnFirst.disabled = currentPage <= 1;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= maxPages;
    if (btnLast) btnLast.disabled = currentPage >= maxPages;

    let allChecked = items.length > 0;

    items.forEach(item => {
        const tr = document.createElement('tr');
        const isSelected = selectedEntityIds.has(item.id);
        if (isSelected) tr.classList.add('tb-row-selected');

        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);

        const checkTd = document.createElement('td');
        checkTd.className = 'tb-td-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tb-checkbox tb-row-checkbox';
        checkbox.dataset.id = String(item.id);
        checkbox.checked = isSelected;
        if (!isSelected) allChecked = false;
        checkbox.onchange = (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedEntityIds.add(item.id);
                tr.classList.add('tb-row-selected');
            } else {
                selectedEntityIds.delete(item.id);
                tr.classList.remove('tb-row-selected');
            }
        };
        checkTd.appendChild(checkbox);
        tr.appendChild(checkTd);

        const timeTd = document.createElement('td');
        timeTd.style.fontFamily = 'var(--font-mono)';
        timeTd.style.fontSize = '0.8rem';
        timeTd.style.color = 'var(--text-secondary)';
        timeTd.textContent = formatDateTime(item.created_at);
        tr.appendChild(timeTd);

        const nameTd = document.createElement('td');
        const nameLink = document.createElement('a');
        nameLink.href = `/entity/index.html?id=${item.id}`;
        nameLink.className = 'tb-row-name-link';
        nameLink.textContent = item.name;
        nameTd.appendChild(nameLink);
        tr.appendChild(nameTd);

        const profileTd = document.createElement('td');
        const profileBadge = document.createElement('span');
        profileBadge.className = 'tb-profile-badge';
        profileBadge.textContent = 'ESP32 Device Profile';
        profileTd.appendChild(profileBadge);
        tr.appendChild(profileTd);

        const fieldsTd = document.createElement('td');
        const fieldsWrap = document.createElement('div');
        fieldsWrap.style.display = 'flex';
        fieldsWrap.style.flexWrap = 'wrap';
        fieldsWrap.style.gap = '6px';
        fieldsWrap.style.alignItems = 'center';

        const hasData = (item.data_count || 0) > 0;
        const latest = (item.latest_payload && typeof item.latest_payload === 'object') ? item.latest_payload : {};
        const fields = Array.isArray(item.fields) ? item.fields : [];

        if (!hasData || fields.length === 0) {
            const waitingPill = document.createElement('span');
            waitingPill.className = 'tb-telemetry-badge tb-telemetry-badge--waiting';
            waitingPill.innerHTML = `<span class="tb-pulse-dot"></span><span>Awaiting API Telemetry</span>`;
            fieldsWrap.appendChild(waitingPill);
        } else {
            const maxVisible = 3;
            fields.slice(0, maxVisible).forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'tb-telemetry-chip';
                const keySpan = document.createElement('span');
                keySpan.className = 'tb-telemetry-chip__key';
                keySpan.textContent = `${f.name}:`;
                chip.appendChild(keySpan);

                const valSpan = document.createElement('span');
                valSpan.className = 'tb-telemetry-chip__val';
                let valDisplay = latest[f.name] !== undefined ? String(latest[f.name]) : '-';
                if (f.unit && valDisplay !== '-') {
                    valDisplay += ` ${f.unit}`;
                }
                valSpan.textContent = valDisplay;
                chip.appendChild(valSpan);

                fieldsWrap.appendChild(chip);
            });

            if (fields.length > maxVisible) {
                const moreChip = document.createElement('span');
                moreChip.className = 'tb-telemetry-chip';
                moreChip.style.color = 'var(--text-muted)';
                moreChip.title = fields.slice(maxVisible).map(f => f.name).join(', ');
                moreChip.textContent = `+${fields.length - maxVisible} more`;
                fieldsWrap.appendChild(moreChip);
            }
        }
        fieldsTd.appendChild(fieldsWrap);
        tr.appendChild(fieldsTd);

        const stateTd = document.createElement('td');
        const stateBadge = document.createElement('span');
        stateBadge.className = `tb-state-badge ${isRecent ? 'tb-state-badge--active' : 'tb-state-badge--inactive'}`;
        stateBadge.textContent = isRecent ? 'Active' : 'Inactive';
        stateTd.appendChild(stateBadge);
        tr.appendChild(stateTd);

        const countTd = document.createElement('td');
        countTd.style.fontFamily = 'var(--font-mono)';
        countTd.style.fontSize = '0.82rem';
        countTd.textContent = `${item.data_count || 0}`;
        tr.appendChild(countTd);

        const lastTd = document.createElement('td');
        lastTd.style.fontSize = '0.8rem';
        lastTd.style.color = 'var(--text-secondary)';
        lastTd.textContent = item.last_data_at ? formatRelativeTime(item.last_data_at) : 'Never';
        tr.appendChild(lastTd);

        const actionsTd = document.createElement('td');
        actionsTd.style.textAlign = 'right';
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'tb-row-actions';

        const credBtn = document.createElement('a');
        credBtn.href = `/entity/index.html?id=${item.id}`;
        credBtn.className = 'tb-action-icon-btn';
        credBtn.title = 'Device credentials';
        credBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
        actionsWrap.appendChild(credBtn);

        const openBtn = document.createElement('a');
        openBtn.href = `/entity/index.html?id=${item.id}`;
        openBtn.className = 'tb-action-icon-btn';
        openBtn.title = 'View device details';
        openBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        actionsWrap.appendChild(openBtn);

        const deleteBtn = document.createElement('a');
        deleteBtn.href = `/entity/index.html?id=${item.id}`;
        deleteBtn.className = 'tb-action-icon-btn';
        deleteBtn.title = 'Manage or delete device';
        deleteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        actionsWrap.appendChild(deleteBtn);
        actionsTd.appendChild(actionsWrap);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = allChecked;
    }
}

/**
 * Validate entity name length, presence, and allowed character pattern.
 */
function validateEntityName(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return { valid: false, error: 'Device name is required.' };
    }
    if (trimmed.length < 3 || trimmed.length > 50) {
        return { valid: false, error: 'Device name must be between 3 and 50 characters.' };
    }
    if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Device name may only contain letters, numbers, spaces, hyphens, and underscores.' };
    }
    return { valid: true };
}

/**
 * Validate hardware platform selection against allowed list.
 */
function validateEntityPlatform(platform) {
    const validPlatforms = ['esp32', 'esp8266', 'arduino', 'raspberry_pi', 'custom'];
    if (!platform || !validPlatforms.includes(platform)) {
        return { valid: false, error: 'Please choose a target hardware platform.' };
    }
    return { valid: true };
}

/**
 * Validate telemetry interval is a whole integer between 5 and 3600 seconds.
 */
function validateEntityInterval(intervalVal) {
    const num = Number(intervalVal);
    if (!intervalVal || !Number.isInteger(num) || num < 5 || num > 3600) {
        return { valid: false, error: 'Post interval must be a whole number between 5 and 3600 seconds.' };
    }
    return { valid: true };
}

/**
 * Validate optional location description length constraint.
 */
function validateEntityNotes(notes) {
    if (notes.length > 150) {
        return { valid: false, error: 'Location notes cannot exceed 150 characters.' };
    }
    return { valid: true };
}

/**
 * Mark input element as invalid and render error message in live region.
 */
function setFieldError(inputEl, errorEl, errorMessage) {
    if (!inputEl || !errorEl) return;
    const errorClass = inputEl.tagName === 'SELECT' ? 'form-select--error' : (inputEl.tagName === 'TEXTAREA' ? 'form-textarea--error' : 'form-input--error');
    inputEl.classList.add(errorClass);
    inputEl.setAttribute('aria-invalid', 'true');
    errorEl.textContent = errorMessage;
    errorEl.classList.add('form-error--visible');
}

/**
 * Restore input element to valid state and clear associated error message.
 */
function clearFieldError(inputEl, errorEl) {
    if (!inputEl || !errorEl) return;
    inputEl.classList.remove('form-input--error', 'form-select--error', 'form-textarea--error');
    inputEl.setAttribute('aria-invalid', 'false');
    errorEl.textContent = '';
    errorEl.classList.remove('form-error--visible');
}

/**
 * Reset all error messages and validation highlights on create entity form.
 */
function clearAllCreateFormErrors() {
    const fields = [
        { inputId: 'entityNameInput', errorId: 'entityNameError' },
        { inputId: 'entityPlatformSelect', errorId: 'entityPlatformError' },
        { inputId: 'entityIntervalInput', errorId: 'entityIntervalError' },
        { inputId: 'entityNotesInput', errorId: 'entityNotesError' }
    ];

    fields.forEach(({ inputId, errorId }) => {
        const inputEl = document.getElementById(inputId);
        const errorEl = document.getElementById(errorId);
        clearFieldError(inputEl, errorEl);
    });

    const summaryEl = document.getElementById('formValidationSummary');
    if (summaryEl) {
        summaryEl.textContent = '';
        summaryEl.classList.add('form-summary--hidden');
    }
}

/**
 * Execute client-side validation rules and manage visual focus for invalid inputs.
 */
function validateEntireCreateForm() {
    clearAllCreateFormErrors();

    const nameInput = document.getElementById('entityNameInput');
    const nameError = document.getElementById('entityNameError');
    const platformInput = document.getElementById('entityPlatformSelect');
    const platformError = document.getElementById('entityPlatformError');
    const intervalInput = document.getElementById('entityIntervalInput');
    const intervalError = document.getElementById('entityIntervalError');
    const notesInput = document.getElementById('entityNotesInput');
    const notesError = document.getElementById('entityNotesError');
    const summaryEl = document.getElementById('formValidationSummary');

    const errors = [];
    let firstInvalidElement = null;

    const nameRes = validateEntityName(nameInput.value);
    if (!nameRes.valid) {
        setFieldError(nameInput, nameError, nameRes.error);
        errors.push(nameRes.error);
        if (!firstInvalidElement) firstInvalidElement = nameInput;
    }

    const platformRes = validateEntityPlatform(platformInput.value);
    if (!platformRes.valid) {
        setFieldError(platformInput, platformError, platformRes.error);
        errors.push(platformRes.error);
        if (!firstInvalidElement) firstInvalidElement = platformInput;
    }

    const intervalRes = validateEntityInterval(intervalInput.value);
    if (!intervalRes.valid) {
        setFieldError(intervalInput, intervalError, intervalRes.error);
        errors.push(intervalRes.error);
        if (!firstInvalidElement) firstInvalidElement = intervalInput;
    }

    const notesRes = validateEntityNotes(notesInput.value);
    if (!notesRes.valid) {
        setFieldError(notesInput, notesError, notesRes.error);
        errors.push(notesRes.error);
        if (!firstInvalidElement) firstInvalidElement = notesInput;
    }

    if (errors.length > 0) {
        if (summaryEl) {
            summaryEl.textContent = `Please correct the ${errors.length} highlighted error(s) below before submitting.`;
            summaryEl.classList.remove('form-summary--hidden');
        }
        if (firstInvalidElement) {
            firstInvalidElement.focus();
        }
        return false;
    }

    return true;
}

/**
 * Handle accessibility keyboard trap and Escape dismiss within the create modal.
 */
function handleModalKeyDown(e) {
    if (e.key === 'Escape') {
        closeCreateModal();
        return;
    }

    if (e.key === 'Tab') {
        const modal = document.getElementById('createModal');
        if (!modal) return;
        const focusable = modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

/**
 * Configure modal dialog triggers, backdrop clicks, live validation, and form submissions.
 */
function setupModalEvents() {
    const modal = document.getElementById('createModal');
    const successModal = document.getElementById('keySuccessModal');
    const openBtn = document.getElementById('openCreateModalBtn');
    const closeBtn = document.getElementById('closeCreateModalBtn');
    const cancelBtn = document.getElementById('cancelCreateModalBtn');
    const closeSuccessBtn = document.getElementById('closeSuccessModalBtn');
    const form = document.getElementById('createEntityForm');

    const nameInput = document.getElementById('entityNameInput');
    const nameError = document.getElementById('entityNameError');
    const platformInput = document.getElementById('entityPlatformSelect');
    const platformError = document.getElementById('entityPlatformError');
    const intervalInput = document.getElementById('entityIntervalInput');
    const intervalError = document.getElementById('entityIntervalError');
    const notesInput = document.getElementById('entityNotesInput');
    const notesError = document.getElementById('entityNotesError');
    const notesCounter = document.getElementById('entityNotesCounter');

    const doneSuccessBtn = document.getElementById('doneSuccessModalBtn');

    if (openBtn) openBtn.addEventListener('click', openCreateModal);
    if (closeBtn) closeBtn.addEventListener('click', closeCreateModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCreateModal);
    if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', closeSuccessModal);
    if (doneSuccessBtn) doneSuccessBtn.addEventListener('click', closeSuccessModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCreateModal();
        });
        modal.addEventListener('keydown', handleModalKeyDown);
    }

    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) closeSuccessModal();
        });
    }

    if (nameInput) {
        nameInput.addEventListener('input', () => {
            if (nameInput.getAttribute('aria-invalid') === 'true') {
                const res = validateEntityName(nameInput.value);
                if (res.valid) clearFieldError(nameInput, nameError);
            }
        });
        nameInput.addEventListener('blur', () => {
            if (nameInput.value.trim().length > 0) {
                const res = validateEntityName(nameInput.value);
                if (!res.valid) setFieldError(nameInput, nameError, res.error);
                else clearFieldError(nameInput, nameError);
            }
        });
    }

    if (platformInput) {
        platformInput.addEventListener('change', () => {
            const res = validateEntityPlatform(platformInput.value);
            if (!res.valid) setFieldError(platformInput, platformError, res.error);
            else clearFieldError(platformInput, platformError);
        });
    }

    if (intervalInput) {
        intervalInput.addEventListener('input', () => {
            if (intervalInput.getAttribute('aria-invalid') === 'true') {
                const res = validateEntityInterval(intervalInput.value);
                if (res.valid) clearFieldError(intervalInput, intervalError);
            }
        });
        intervalInput.addEventListener('blur', () => {
            const res = validateEntityInterval(intervalInput.value);
            if (!res.valid) setFieldError(intervalInput, intervalError, res.error);
            else clearFieldError(intervalInput, intervalError);
        });
    }

    if (notesInput && notesCounter) {
        notesInput.addEventListener('input', () => {
            const currentLen = notesInput.value.length;
            notesCounter.textContent = `${currentLen} / 150`;
            if (currentLen >= 150) {
                notesCounter.classList.add('form-counter--limit');
            } else {
                notesCounter.classList.remove('form-counter--limit');
            }
            if (notesInput.getAttribute('aria-invalid') === 'true') {
                const res = validateEntityNotes(notesInput.value);
                if (res.valid) clearFieldError(notesInput, notesError);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', handleCreateEntitySubmit);
    }
}

/**
 * Display the create entity modal dialog, reset fields, and focus initial input.
 */
function openCreateModal() {
    const modal = document.getElementById('createModal');
    const form = document.getElementById('createEntityForm');
    const notesCounter = document.getElementById('entityNotesCounter');
    if (!modal) return;

    if (form) form.reset();
    clearAllCreateFormErrors();

    if (notesCounter) {
        notesCounter.textContent = '0 / 150';
        notesCounter.classList.remove('form-counter--limit');
    }

    const intervalInput = document.getElementById('entityIntervalInput');
    if (intervalInput) intervalInput.value = '30';

    modal.classList.add('modal-backdrop--open');
    const nameInput = document.getElementById('entityNameInput');
    if (nameInput) {
        setTimeout(() => nameInput.focus(), 50);
    }
}

/**
 * Dismiss the create entity modal dialog and restore trigger focus.
 */
function closeCreateModal() {
    const modal = document.getElementById('createModal');
    if (modal) modal.classList.remove('modal-backdrop--open');
    const openBtn = document.getElementById('openCreateModalBtn');
    if (openBtn) openBtn.focus();
}

/**
 * Dismiss the API key success confirmation modal.
 */
function closeSuccessModal() {
    const successModal = document.getElementById('keySuccessModal');
    if (successModal) successModal.classList.remove('modal-backdrop--open');
    loadEntities();
}

/**
 * Process entity creation submission and display API key dialog.
 */
async function handleCreateEntitySubmit(e) {
    e.preventDefault();
    if (!validateEntireCreateForm()) {
        return;
    }

    const submitBtn = document.getElementById('submitCreateBtn');
    const submitBtnText = document.getElementById('submitCreateBtnText');
    const nameInput = document.getElementById('entityNameInput');
    const summaryEl = document.getElementById('formValidationSummary');

    const name = nameInput.value.trim();

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.textContent = 'Creating...';

        const newEntity = await apiFetch('/entities.php', {
            method: 'POST',
            body: { name, fields: [] }
        });

        saveLocalApiKey(newEntity.id, newEntity.api_key);
        closeCreateModal();
        showKeySuccessModal(newEntity);
    } catch (err) {
        if (summaryEl) {
            summaryEl.textContent = `Server error: ${err.message}`;
            summaryEl.classList.remove('form-summary--hidden');
            summaryEl.focus();
        } else {
            alert(`Failed to create device: ${err.message}`);
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = 'Create Device';
    }
}

/**
 * Display the created entity's API key with copy controls, cURL snippet, and test push action.
 */
function showKeySuccessModal(entity) {
    const modal = document.getElementById('keySuccessModal');
    const keyDisplay = document.getElementById('newApiKeyDisplay');
    const curlSnippetEl = document.getElementById('newApiCurlSnippet');
    const copyCurlBtn = document.getElementById('copyCurlExampleBtn');
    const copyBtn = document.getElementById('copyNewKeyBtn');
    const testPushBtn = document.getElementById('testPushTelemetryBtn');
    const viewEntityBtn = document.getElementById('goToNewEntityBtn');

    if (!modal) return;

    if (keyDisplay) keyDisplay.textContent = entity.api_key;

    const curlCmd = `curl -X POST ${window.location.origin}/api/data.php \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${entity.api_key}" \\
  -d '{"temperature": 24.5, "humidity": 62, "status": "active"}'`;

    if (curlSnippetEl) {
        curlSnippetEl.textContent = curlCmd;
    }

    if (copyCurlBtn) {
        copyCurlBtn.onclick = () => {
            copyToClipboard(curlCmd, copyCurlBtn);
        };
    }

    if (copyBtn) {
        copyBtn.onclick = () => {
            copyToClipboard(entity.api_key, copyBtn);
        };
    }

    if (testPushBtn) {
        testPushBtn.disabled = false;
        testPushBtn.textContent = 'Send Test Telemetry';
        testPushBtn.style.color = 'var(--accent)';
        testPushBtn.style.borderColor = 'var(--accent)';
        testPushBtn.onclick = async () => {
            testPushBtn.disabled = true;
            testPushBtn.textContent = 'Streaming...';
            try {
                await apiFetch('/data.php', {
                    method: 'POST',
                    headers: { 'X-API-Key': entity.api_key },
                    body: {
                        temperature: Number((22 + Math.random() * 6).toFixed(1)),
                        humidity: Number((50 + Math.random() * 20).toFixed(1)),
                        battery: 98,
                        status: 'online'
                    }
                });
                testPushBtn.textContent = 'Telemetry Ingested!';
                testPushBtn.style.color = 'var(--success)';
                testPushBtn.style.borderColor = 'var(--success)';
                await loadEntities();
            } catch (err) {
                testPushBtn.disabled = false;
                testPushBtn.textContent = 'Push Failed';
                testPushBtn.style.color = 'var(--danger)';
            }
        };
    }

    if (viewEntityBtn) {
        viewEntityBtn.onclick = () => {
            window.location.href = `/entity/index.html?id=${entity.id}`;
        };
    }

    modal.classList.add('modal-backdrop--open');
}

