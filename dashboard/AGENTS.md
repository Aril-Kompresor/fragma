# Dashboard Page

Main dashboard page showing a grid of all entities.

---

## Page: `index.html`

### What It Shows

- Grid of entity cards, each displaying: name, field count, last data timestamp, quick status indicator.
- "Create Entity" button that opens a modal form.
- Empty state message when no entities exist yet.

### Behavior

- On load: fetch all entities from `GET /api/entities.php` and render the grid.
- Polling: auto-refresh entity list every 10 seconds to update status and latest data.
- "Create Entity" modal: form with entity name and dynamic field builder (add/remove fields with name, type, unit).
- On entity creation: POST to `/api/entities.php`, show the generated API key in a success modal (one-time display, with copy button).
- Clicking an entity card navigates to `/entity/index.html?id=:id`.

### Files Used

- `index.html` — page markup and modal templates.
- `/js/app.js` — dashboard logic (fetch, render grid, create entity).
- `/js/api.js` — fetch wrapper.
- `/css/style.css` — global styles.
