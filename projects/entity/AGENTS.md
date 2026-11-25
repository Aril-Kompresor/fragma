# Entity Detail Page

Single entity detail page showing entity info, field auto-detection onboarding, telemetry stream data table, and connection instructions. Visual widgets are managed globally on the View page (`/view/index.html`).

---

## Page: `index.html?id=:id`

### What It Shows

1. **Header section**: Entity name, masked API key with copy-full-key button, created date, detected field list (with re-detect button when fields are active).
2. **Field Detection Onboarding Card**: Appears when an entity has no detected fields yet. Displays the exact POST endpoint, the unique entity token, instructions, and an interactive in-browser test sender.
3. **Connection guide**: Code snippets for cURL and ESP32/Arduino showing how to POST data using the entity's unique token.
4. **Data table**: Recent raw data points in a scrollable table, newest first.
5. **Danger zone**: Delete entity button (requires entering the API key to confirm).

### Behavior

- On load: read `id` from URL query params, fetch entity detail from `GET /api/entities.php?id=:id`.
- If fields are empty: display the Field Detection card.
- On first payload: device or test sender POSTs to `POST /api/data.php?entity_id=:id` with header `X-API-Key: frag_...`. Server auto-detects payload schema, saves fields into `entities` table, and registers the data point.
- Polling: every 6 seconds, refresh data points and check if fields have been detected by an external device.
- Field reset: user can click "Re-detect Fields" to send `PUT /api/entities.php?id=:id` with `{ fields: [] }` and return to detection mode.
- Entity delete: DELETE to `/api/entities.php?id=:id` with API key, then redirect to dashboard.
- Note: Visual widgets (Line Charts, Value Cards) are created and rendered on the unified Global View (`/view/index.html`), not on this entity page.

### Files Used

- `index.html`: page markup, detection card, code snippets, telemetry table, delete modal.
- `/js/entity.js`: entity page logic (field detection handling, fetch, data points rendering, forms).
- `/js/api.js`: fetch wrapper.
- `/js/utils.js`: clipboard fallback and time formatting utilities.
- `/css/style.css`: global styles.
