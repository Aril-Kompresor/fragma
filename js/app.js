/**
 * Main dashboard application controller managing entity listings, creation modal, and polling.
 */

let pollingIntervalId = null;

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
    loadEntities();

    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
    }
    pollingIntervalId = setInterval(loadEntities, 10000);

    window.addEventListener('beforeunload', () => {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
        }
    });
}

/**
 * Fetch entity collection from backend and update DOM grid.
 */
async function loadEntities() {
    const grid = document.getElementById('entitiesGrid');
    const loading = document.getElementById('entitiesLoading');

    try {
        const entities = await apiFetch('/entities.php');
        if (loading) loading.style.display = 'none';

        if (!Array.isArray(entities) || entities.length === 0) {
            renderEmptyState(grid);
            return;
        }

        renderEntityGrid(grid, entities);
    } catch (err) {
        if (loading) loading.style.display = 'none';
        if (grid && !grid.querySelector('.entity-card')) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state__icon">⚠️</div>
                    <div class="empty-state__title">Unable to load entities</div>
                    <div class="empty-state__text">${escapeHtml(err.message)}</div>
                    <button class="btn btn--ghost" onclick="loadEntities()">Retry</button>
                </div>
            `;
        }
    }
}

/**
 * Render empty state placeholder when no entities exist.
 */
function renderEmptyState(grid) {
    grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state__icon">📡</div>
            <div class="empty-state__title">No IoT Entities Yet</div>
            <div class="empty-state__text">Create your first entity to start pushing data from your ESP32, Arduino, or other devices.</div>
            <button class="btn btn--primary" onclick="openCreateModal()">+ Create Entity</button>
        </div>
    `;
}

/**
 * Render entity list items into card elements.
 */
function renderEntityGrid(grid, entities) {
    grid.innerHTML = '';

    for (const item of entities) {
        const card = document.createElement('a');
        card.href = `/entity/index.html?id=${item.id}`;
        card.className = 'card entity-card';

        const header = document.createElement('div');
        header.className = 'entity-card__header';

        const title = document.createElement('h3');
        title.className = 'entity-card__title';
        title.textContent = item.name;

        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);
        const badge = document.createElement('span');
        badge.className = `entity-card__badge ${isRecent ? 'entity-card__badge--active' : 'entity-card__badge--idle'}`;
        badge.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span> ${isRecent ? 'Online' : 'Idle'}`;

        header.appendChild(title);
        header.appendChild(badge);

        const body = document.createElement('div');
        body.className = 'entity-card__body';

        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'entity-card__fields';

        if (Array.isArray(item.fields) && item.fields.length > 0) {
            item.fields.forEach(f => {
                const tag = document.createElement('span');
                tag.className = 'field-tag';
                tag.textContent = `${f.name}${f.unit ? ` (${f.unit})` : ''}`;
                fieldsContainer.appendChild(tag);
            });
        } else {
            const noField = document.createElement('span');
            noField.className = 'field-tag';
            noField.style.background = 'rgba(243, 156, 18, 0.12)';
            noField.style.color = 'var(--warning)';
            noField.style.borderColor = 'rgba(243, 156, 18, 0.3)';
            noField.textContent = 'Awaiting Field Detection';
            fieldsContainer.appendChild(noField);
        }

        body.appendChild(fieldsContainer);

        const footer = document.createElement('div');
        footer.className = 'entity-card__footer';

        const countSpan = document.createElement('span');
        countSpan.textContent = `${item.data_count || 0} data points`;

        const timeSpan = document.createElement('span');
        timeSpan.textContent = item.last_data_at ? formatRelativeTime(item.last_data_at) : 'No data yet';

        footer.appendChild(countSpan);
        footer.appendChild(timeSpan);

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);

        grid.appendChild(card);
    }
}

/**
 * Validate entity name length, presence, and allowed character pattern.
 */
function validateEntityName(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return { valid: false, error: 'Entity name is required.' };
    }
    if (trimmed.length < 3 || trimmed.length > 50) {
        return { valid: false, error: 'Entity name must be between 3 and 50 characters.' };
    }
    if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Entity name may only contain letters, numbers, spaces, hyphens, and underscores.' };
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
 * Validate optional field key identifier syntax and length constraint.
 */
function validateInitialFieldName(fieldName) {
    const trimmed = fieldName.trim();
    if (!trimmed) {
        return { valid: true };
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
        return { valid: false, error: 'Field key must be between 2 and 30 characters.' };
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
        return { valid: false, error: 'Field key must start with a lowercase letter and contain only lowercase letters, digits, and underscores.' };
    }
    return { valid: true };
}

/**
 * Validate optional telemetry field unit length constraint.
 */
function validateInitialFieldUnit(unit) {
    const trimmed = unit.trim();
    if (trimmed.length > 10) {
        return { valid: false, error: 'Measurement unit cannot exceed 10 characters.' };
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
        { inputId: 'initialFieldNameInput', errorId: 'initialFieldNameError' },
        { inputId: 'initialFieldUnitInput', errorId: 'initialFieldUnitError' },
        { inputId: 'entityNotesInput', errorId: 'entityNotesError' }
    ];

    fields.forEach(({ inputId, errorId }) => {
        const id = inputId || 'initialFieldNameInput';
        const inputEl = document.getElementById(id);
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
    const fieldNameInput = document.getElementById('initialFieldNameInput');
    const fieldNameError = document.getElementById('initialFieldNameError');
    const fieldUnitInput = document.getElementById('initialFieldUnitInput');
    const fieldUnitError = document.getElementById('initialFieldUnitError');
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

    const fieldNameRes = validateInitialFieldName(fieldNameInput.value);
    if (!fieldNameRes.valid) {
        setFieldError(fieldNameInput, fieldNameError, fieldNameRes.error);
        errors.push(fieldNameRes.error);
        if (!firstInvalidElement) firstInvalidElement = fieldNameInput;
    }

    const fieldUnitRes = validateInitialFieldUnit(fieldUnitInput.value);
    if (!fieldUnitRes.valid) {
        setFieldError(fieldUnitInput, fieldUnitError, fieldUnitRes.error);
        errors.push(fieldUnitRes.error);
        if (!firstInvalidElement) firstInvalidElement = fieldUnitInput;
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
    const fieldNameInput = document.getElementById('initialFieldNameInput');
    const fieldNameError = document.getElementById('initialFieldNameError');
    const fieldUnitInput = document.getElementById('initialFieldUnitInput');
    const notesInput = document.getElementById('entityNotesInput');
    const notesError = document.getElementById('entityNotesError');
    const notesCounter = document.getElementById('entityNotesCounter');

    if (openBtn) openBtn.addEventListener('click', openCreateModal);
    if (closeBtn) closeBtn.addEventListener('click', closeCreateModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCreateModal);
    if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', closeSuccessModal);

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

    if (fieldNameInput) {
        fieldNameInput.addEventListener('input', () => {
            if (fieldNameInput.getAttribute('aria-invalid') === 'true') {
                const res = validateInitialFieldName(fieldNameInput.value);
                if (res.valid) clearFieldError(fieldNameInput, fieldNameError);
            }
        });
        fieldNameInput.addEventListener('blur', () => {
            if (fieldNameInput.value.trim().length > 0) {
                const res = validateInitialFieldName(fieldNameInput.value);
                if (!res.valid) setFieldError(fieldNameInput, fieldNameError, res.error);
                else clearFieldError(fieldNameInput, fieldNameError);
            }
        });
    }

    if (fieldUnitInput) {
        fieldUnitInput.addEventListener('input', () => {
            if (fieldUnitInput.getAttribute('aria-invalid') === 'true') {
                const res = validateInitialFieldUnit(fieldUnitInput.value);
                const unitError = document.getElementById('initialFieldUnitError');
                if (res.valid) clearFieldError(fieldUnitInput, unitError);
            }
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
    const fieldNameInput = document.getElementById('initialFieldNameInput');
    const fieldUnitInput = document.getElementById('initialFieldUnitInput');
    const summaryEl = document.getElementById('formValidationSummary');

    const name = nameInput.value.trim();
    const fields = [];
    const fieldKey = fieldNameInput ? fieldNameInput.value.trim() : '';
    const fieldUnit = fieldUnitInput ? fieldUnitInput.value.trim() : '';

    if (fieldKey) {
        fields.push({
            name: fieldKey,
            type: 'number',
            unit: fieldUnit
        });
    }

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.textContent = 'Creating...';

        const newEntity = await apiFetch('/entities.php', {
            method: 'POST',
            body: { name, fields }
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
            alert(`Failed to create entity: ${err.message}`);
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = 'Create Entity';
    }
}

/**
 * Display the created entity's API key with copy controls and redirect action.
 */
function showKeySuccessModal(entity) {
    const modal = document.getElementById('keySuccessModal');
    const keyDisplay = document.getElementById('newApiKeyDisplay');
    const copyBtn = document.getElementById('copyNewKeyBtn');
    const viewEntityBtn = document.getElementById('goToNewEntityBtn');

    if (!modal) return;

    if (keyDisplay) keyDisplay.textContent = entity.api_key;

    if (copyBtn) {
        copyBtn.onclick = () => {
            copyToClipboard(entity.api_key, copyBtn);
        };
    }

    if (viewEntityBtn) {
        viewEntityBtn.onclick = () => {
            window.location.href = `/entity/index.html?id=${entity.id}`;
        };
    }

    modal.classList.add('modal-backdrop--open');
}
