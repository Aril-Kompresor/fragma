function formatRelativeTime(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (isNaN(diffSeconds)) {
        return dateString;
    }

    if (diffSeconds < 5) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleString();
}

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
        triggerButton.textContent = 'Copied!';
        triggerButton.disabled = true;
        setTimeout(() => {
            triggerButton.textContent = originalText;
            triggerButton.disabled = false;
        }, 1800);
    }

    return success;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function saveLocalApiKey(entityId, apiKey) {
    try {
        localStorage.setItem(`fragma_key_${entityId}`, apiKey);
    } catch (e) {
    }
}

function getLocalApiKey(entityId) {
    try {
        return localStorage.getItem(`fragma_key_${entityId}`) || '';
    } catch (e) {
        return '';
    }
}
