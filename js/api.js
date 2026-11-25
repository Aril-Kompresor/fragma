const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
        'Accept': 'application/json',
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const mergedOptions = {
        credentials: 'same-origin',
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
        const parseErr = new Error(`Server returned status ${response.status} with non-JSON output`);
        parseErr.status = response.status;
        throw parseErr;
    }

    if (!response.ok || !json.success) {
        const message = (json && json.error) ? json.error : `Request failed with status ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }

    return json.data !== undefined ? json.data : json;
}
