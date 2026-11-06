document.addEventListener('DOMContentLoaded', () => {
    initCreatePage();
});

function initCreatePage() {
    const form = document.getElementById('createEntityForm');
    const nameInput = document.getElementById('entityNameInput');
    const nameError = document.getElementById('entityNameError');
    const notesInput = document.getElementById('entityNotesInput');
    const notesError = document.getElementById('entityNotesError');
    const notesCounter = document.getElementById('entityNotesCounter');
    const copyKeyBtn = document.getElementById('copyCreatedKeyBtn');
    const copyCurlBtn = document.getElementById('copyCurlBtn');
    const headerSubmitBtn = document.getElementById('headerSubmitCreateBtn');
    const createAnotherBtn = document.getElementById('createAnotherBtn');

    if (nameInput) {
        nameInput.focus();
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

    if (headerSubmitBtn && form) {
        headerSubmitBtn.addEventListener('click', () => {
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }

    if (form) {
        form.addEventListener('submit', handleCreateEntitySubmit);
    }

    if (copyKeyBtn) {
        copyKeyBtn.addEventListener('click', () => {
            const keyEl = document.getElementById('createdApiKeyDisplay');
            if (keyEl) {
                copyToClipboard(keyEl.textContent.trim(), copyKeyBtn);
            }
        });
    }

    if (copyCurlBtn) {
        copyCurlBtn.addEventListener('click', () => {
            const curlEl = document.getElementById('createdCurlSnippet');
            if (curlEl) {
                copyToClipboard(curlEl.textContent.trim(), copyCurlBtn);
            }
        });
    }

    if (createAnotherBtn) {
        createAnotherBtn.addEventListener('click', resetCreatePage);
    }
}

function resetCreatePage() {
    const form = document.getElementById('createEntityForm');
    const formSection = document.getElementById('createFormSection');
    const successSection = document.getElementById('createSuccessSection');
    const notesCounter = document.getElementById('entityNotesCounter');
    const nameInput = document.getElementById('entityNameInput');

    if (form) form.reset();
    clearAllCreateFormErrors();

    if (notesCounter) {
        notesCounter.textContent = '0 / 150';
        notesCounter.classList.remove('form-counter--limit');
    }

    if (successSection) successSection.style.display = 'none';
    if (formSection) formSection.style.display = 'block';

    if (nameInput) {
        setTimeout(() => nameInput.focus(), 50);
    }
}

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

function validateEntityNotes(notes) {
    if (notes.length > 150) {
        return { valid: false, error: 'Location notes cannot exceed 150 characters.' };
    }
    return { valid: true };
}

function setFieldError(inputEl, errorEl, errorMessage) {
    if (!inputEl || !errorEl) return;
    const errorClass = inputEl.tagName === 'SELECT' ? 'form-select--error' : (inputEl.tagName === 'TEXTAREA' ? 'form-textarea--error' : 'form-input--error');
    inputEl.classList.add(errorClass);
    inputEl.setAttribute('aria-invalid', 'true');
    errorEl.textContent = errorMessage;
    errorEl.classList.add('form-error--visible');
}

function clearFieldError(inputEl, errorEl) {
    if (!inputEl || !errorEl) return;
    inputEl.classList.remove('form-input--error', 'form-select--error', 'form-textarea--error');
    inputEl.setAttribute('aria-invalid', 'false');
    errorEl.textContent = '';
    errorEl.classList.remove('form-error--visible');
}

function clearAllCreateFormErrors() {
    const fields = [
        { inputId: 'entityNameInput', errorId: 'entityNameError' },
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

function validateEntireCreateForm() {
    clearAllCreateFormErrors();

    const nameInput = document.getElementById('entityNameInput');
    const nameError = document.getElementById('entityNameError');
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

    if (notesInput && notesInput.value) {
        const notesRes = validateEntityNotes(notesInput.value);
        if (!notesRes.valid) {
            setFieldError(notesInput, notesError, notesRes.error);
            errors.push(notesRes.error);
            if (!firstInvalidElement) firstInvalidElement = notesInput;
        }
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

async function handleCreateEntitySubmit(e) {
    e.preventDefault();
    if (!validateEntireCreateForm()) {
        return;
    }

    const submitBtn = document.getElementById('submitCreateBtn');
    const submitBtnText = document.getElementById('submitCreateBtnText');
    const headerSubmitBtn = document.getElementById('headerSubmitCreateBtn');
    const nameInput = document.getElementById('entityNameInput');
    const summaryEl = document.getElementById('formValidationSummary');

    const name = nameInput.value.trim();

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (headerSubmitBtn) {
            headerSubmitBtn.disabled = true;
            const span = headerSubmitBtn.querySelector('span');
            if (span) span.textContent = 'Adding...';
        }
        if (submitBtnText) submitBtnText.textContent = 'Adding...';

        const newEntity = await apiFetch('/entities.php', {
            method: 'POST',
            body: { name, fields: [] }
        });

        saveLocalApiKey(newEntity.id, newEntity.api_key);
        showCreationSuccess(newEntity);
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
        if (headerSubmitBtn) {
            headerSubmitBtn.disabled = false;
            const span = headerSubmitBtn.querySelector('span');
            if (span) span.textContent = 'Add Device';
        }
        if (submitBtnText) submitBtnText.textContent = 'Add Device';
    }
}

function showCreationSuccess(entity) {
    const formSection = document.getElementById('createFormSection');
    const successSection = document.getElementById('createSuccessSection');
    const nameDisplay = document.getElementById('createdDeviceName');
    const keyDisplay = document.getElementById('createdApiKeyDisplay');
    const curlSnippet = document.getElementById('createdCurlSnippet');
    const viewDeviceLink = document.getElementById('goToEntityLink');

    if (nameDisplay) nameDisplay.textContent = entity.name;
    if (keyDisplay) keyDisplay.textContent = entity.api_key;

    const curlCmd = `curl -X POST "${window.location.origin}/api/data.php?entity_id=${entity.id}" -H "Content-Type: application/json" -H "X-API-Key: ${entity.api_key}" -d '{"temperature": 24.5, "humidity": 62, "status": "active"}'`;
    if (curlSnippet) curlSnippet.textContent = curlCmd;

    if (viewDeviceLink) {
        viewDeviceLink.href = `/entity/index.html?id=${entity.id}`;
    }

    if (formSection) formSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
