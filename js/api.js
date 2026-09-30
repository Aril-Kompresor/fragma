/**
 * Centralized fetch wrapper for Fragma REST API requests.
 */

const API_BASE = '/api';

/**
 * Execute an HTTP request against the Fragma API and parse the JSON response.
 */
async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
        'Accept': 'application/json',
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const mergedOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {}),
        }
    };

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const response = await fetch(url, mergedOptions);

    let json;
    try {
        json = await response.json();
    } catch (e) {
        throw new Error(`Server returned status ${response.status} with non-JSON output`);
    }

    if (!response.ok || !json.success) {
        const message = (json && json.error) ? json.error : `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return json.data !== undefined ? json.data : json;
}
