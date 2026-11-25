/**
 * Format a UTC database timestamp string as an ISO UTC string.
 */
function normalizeUtcTimestamp(dateString) {
    if (!dateString) return '';
    const trimmed = String(dateString).trim();
    if (/Z|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return trimmed;
    }
    return trimmed.replace(' ', 'T') + 'Z';
}

/**
 * Format a timestamp into a human-friendly relative string (e.g., 5m ago).
 */
function formatRelativeTime(dateString) {
    if (!dateString) return 'Belum pernah';
    const date = new Date(normalizeUtcTimestamp(dateString));
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (isNaN(diffSeconds)) {
        return dateString;
    }

    if (diffSeconds < 5) return 'Baru saja';
    if (diffSeconds < 60) return `${diffSeconds} dtk lalu`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} mnt lalu`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} jam lalu`;
    return `${Math.floor(diffSeconds / 86400)} hari lalu`;
}

/**
 * Format a UTC database timestamp into the user's local date and time string.
 */
function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(normalizeUtcTimestamp(dateString));
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format a UTC database timestamp into a localized short date string.
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(normalizeUtcTimestamp(dateString));
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Copy text to the clipboard with a fallback and update trigger button feedback.
 */
async function copyToClipboard(text, triggerButton) {
    if (text === null || text === undefined || text === '') {
        return false;
    }
    const stringText = String(text);
    let success = false;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(stringText);
            success = true;
        } catch (e) {
            success = false;
        }
    }

    if (!success) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = stringText;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            success = document.execCommand('copy');
            document.body.removeChild(textarea);
        } catch (e) {
            success = false;
        }
    }

    if (success && triggerButton) {
        const originalText = triggerButton.textContent;
        triggerButton.textContent = 'Tersalin!';
        triggerButton.disabled = true;
        setTimeout(() => {
            triggerButton.textContent = originalText;
            triggerButton.disabled = false;
        }, 1800);
    }

    return success;
}

/**
 * Escape HTML special characters to prevent XSS in text interpolation.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Persist an entity API key in localStorage for convenience.
 */
function saveLocalApiKey(entityId, apiKey) {
    try {
        localStorage.setItem(`fragma_key_${entityId}`, apiKey);
    } catch (e) {
        return;
    }
}

/**
 * Retrieve a stored entity API key from localStorage if available.
 */
function getLocalApiKey(entityId) {
    try {
        return localStorage.getItem(`fragma_key_${entityId}`) || '';
    } catch (e) {
        return '';
    }
}
