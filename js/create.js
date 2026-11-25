let createProjectId = 0;
let createProjectUuid = '';

document.addEventListener('DOMContentLoaded', () => {
    initCreatePage();
});

/** Initialize create device form, validation listeners, and project context. */
async function initCreatePage() {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        createProjectId = project.id;
        createProjectUuid = project.uuid;
        const breadcrumbProj = document.getElementById('breadcrumbProjectName');
        if (breadcrumbProj) {
            breadcrumbProj.textContent = project.name;
        }
        const subtitleEl = document.querySelector('#createFormSection .page-header__subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = `Tambahkan perangkat IoT baru ke project "${project.name}" dan dapatkan API key-nya.`;
        }
        const dashboardUrl = window.FragmaAuth.buildProjectUrl(createProjectUuid, 'dashboard');
        document.querySelectorAll('#breadcrumbProjectName, #breadcrumbDevicesLink, #cancelCreateBtn, #backToListSuccessBtn').forEach(link => {
            link.setAttribute('href', dashboardUrl);
        });
    }

    const form = document.getElementById('createEntityForm');
    const nameInput = document.getElementById('entityNameInput');
    const nameError = document.getElementById('entityNameError');
    const notesInput = document.getElementById('entityNotesInput');
    const notesError = document.getElementById('entityNotesError');
    const notesCounter = document.getElementById('entityNotesCounter');
    const copyKeyBtn = document.getElementById('copyCreatedKeyBtn');
    const copyCurlBtn = document.getElementById('copyCurlBtn');
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

/** Reset form fields and return to the creation form view. */
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

/** Validate device name length and allowed characters. */
function validateEntityName(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return { valid: false, error: 'Nama perangkat wajib diisi.' };
    }
    if (trimmed.length < 3 || trimmed.length > 50) {
        return { valid: false, error: 'Nama perangkat harus antara 3 hingga 50 karakter.' };
    }
    if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Nama perangkat hanya boleh berisi huruf, angka, spasi, tanda hubung, dan garis bawah.' };
    }
    return { valid: true };
}

/** Validate optional location/label notes length. */
function validateEntityNotes(notes) {
    if (notes.length > 150) {
        return { valid: false, error: 'Catatan lokasi maksimal 150 karakter.' };
    }
    return { valid: true };
}

/** Mark an input element as invalid with an accessible error message. */
function setFieldError(inputEl, errorEl, errorMessage) {
    if (!inputEl || !errorEl) return;
    const errorClass = inputEl.tagName === 'SELECT' ? 'form-select--error' : (inputEl.tagName === 'TEXTAREA' ? 'form-textarea--error' : 'form-input--error');
    inputEl.classList.add(errorClass);
    inputEl.setAttribute('aria-invalid', 'true');
    errorEl.textContent = errorMessage;
    errorEl.classList.add('form-error--visible');
}

/** Clear invalid state and error message on an input element. */
function clearFieldError(inputEl, errorEl) {
    if (!inputEl || !errorEl) return;
    inputEl.classList.remove('form-input--error', 'form-select--error', 'form-textarea--error');
    inputEl.setAttribute('aria-invalid', 'false');
    errorEl.textContent = '';
    errorEl.classList.remove('form-error--visible');
}

/** Clear all validation errors and summary banner on the create form. */
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

/** Validate the entire create device form before submitting. */
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
            summaryEl.textContent = `Harap perbaiki ${errors.length} kesalahan di bawah sebelum menyimpan.`;
            summaryEl.classList.remove('form-summary--hidden');
        }
        if (firstInvalidElement) {
            firstInvalidElement.focus();
        }
        return false;
    }

    return true;
}

/** Submit create device request with name, notes, and project_id to the backend API. */
async function handleCreateEntitySubmit(e) {
    e.preventDefault();
    if (!validateEntireCreateForm()) {
        return;
    }

    const submitBtn = document.getElementById('submitCreateBtn');
    const submitBtnText = document.getElementById('submitCreateBtnText');
    const nameInput = document.getElementById('entityNameInput');
    const notesInput = document.getElementById('entityNotesInput');
    const summaryEl = document.getElementById('formValidationSummary');

    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : '';

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.textContent = 'Menyimpan...';

        const active = window.FragmaAuth && typeof window.FragmaAuth.getActiveProject === 'function'
            ? window.FragmaAuth.getActiveProject()
            : null;
        const targetProjectUuid = createProjectUuid || (active ? active.uuid : '');

        const newEntity = await apiFetch('/entities.php', {
            method: 'POST',
            body: { name, notes, fields: [], project_uuid: targetProjectUuid }
        });

        saveLocalApiKey(newEntity.id, newEntity.api_key);
        showCreationSuccess(newEntity);
    } catch (err) {
        if (summaryEl) {
            summaryEl.textContent = `Gagal menyimpan: ${err.message}`;
            summaryEl.classList.remove('form-summary--hidden');
            summaryEl.focus();
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = 'Simpan Perangkat';
    }
}

/** Display created device credentials and connection snippet. */
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
        const pUuid = entity.project_uuid || createProjectUuid;
        viewDeviceLink.href = pUuid ? window.FragmaAuth.buildProjectUrl(pUuid, 'entity', entity.id) : '/projects';
    }

    if (formSection) formSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
