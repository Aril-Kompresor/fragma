# Frontend JavaScript

All client-side JavaScript for Fragma. No build step, no bundler — files are loaded directly via `<script>` tags or ES module imports.

---

## File Responsibilities

| File | Purpose |
|---|---|
| `api.js` | Centralized fetch wrapper. All API calls go through here. Handles base URL, JSON parsing, and error responses. |
| `app.js` | Dashboard page logic. Loaded by `/dashboard/index.html`. |
| `entity.js` | Entity detail page logic. Loaded by `/entity/index.html`. |
| `utils.js` | Shared frontend utilities: date formatting, DOM helpers, copy-to-clipboard, etc. |
| `widgets/line-chart.js` | Line Chart widget. Uses Chart.js. Exports a render function. |
| `widgets/value-card.js` | Value Card widget. Pure DOM. Exports a render function. |

---

## `api.js` Pattern

```javascript
const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');
    return json.data;
}
```

All other files call `apiFetch()` instead of `fetch()` directly.

---

## Widget Renderer Pattern

Every widget file exports a single render function:

```javascript
function render(container, data, config) { ... }
```

- `container` — the DOM element to render into.
- `data` — array of data points from the API.
- `config` — widget configuration object from the DB (`{ field, label, color, unit }`).
- The function must handle empty data gracefully (show a "no data" message).
- Line Chart: must destroy previous Chart.js instance before creating a new one.

---

## Rules

- No innerHTML with user-provided data. Use `textContent` or `createElement`.
- All DOM construction uses `document.createElement` or template strings rendered via safe methods.
- Polling uses `setInterval` with a 10-second default. Store the interval ID so it can be cleared on page unload.
- Chart.js canvases must have a fixed aspect ratio to prevent layout jumps on re-render.
