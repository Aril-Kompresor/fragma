# Fragma — IoT Dashboard

Fragma is a public, simple, and easy-to-use IoT dashboard website. It lets users create **Entities** (data sources from IoT devices), push data via REST API, and visualize that data using **Widgets** (charts, gauges, cards, etc.).

---

## Core Concepts

1. **Entity** — A data container representing one IoT device or data source.
   - Has a unique `id`, `name`, `api_key`, `fields` (array of field definitions), and timestamps.
   - Devices (ESP32, Arduino, Raspberry Pi, etc.) POST data to an entity's endpoint using its API key.
   - Each POST creates a data point stored with a timestamp.

2. **Widget (Visual)** — A visual representation of an entity's data.
   - Attached to a specific entity.
   - Each widget maps to one or more entity fields.
   - Widget types for initial release: **Line Chart**, **Value Card**.
   - Future widget types: Gauge, Toggle Button, Bar Chart, LED Indicator, Map, Table.

### User Flow

1. User creates an Entity (name + field definitions).
2. System generates an API key for that entity.
3. User programs their IoT device to POST data to `/api/data.php?entity_id=:id` with the API key.
4. Data appears in the entity's data list on the dashboard.
5. User adds Widgets to visualize the data (Line Chart for time-series, Value Card for latest reading).
6. Dashboard auto-refreshes via polling to show live data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | PHP (via Laragon) |
| Database | MySQL / MariaDB (via Laragon) |
| Frontend | Vanilla HTML + CSS + JavaScript (no framework) |
| Charts | Chart.js |
| Data Refresh | Polling (setInterval, configurable interval) |
| Auth Model | API key per entity (no user login system) |

### Key Constraints

- No frontend framework (React, Vue, etc.). Use vanilla JS.
- No CSS framework (Tailwind, Bootstrap). Write vanilla CSS.
- No ORM. Use PDO with prepared statements.
- No build step. Files are served directly by Laragon's Apache.
- No Composer unless absolutely necessary. Keep it simple.
- The app runs locally via Laragon at `http://fragma.test`.

---

## Project Structure

Each folder has its own `AGENTS.md` with rules specific to that section.

```
fragma/
├── AGENTS.md                  # Root rules (this file)
├── index.html                 # Landing page
│
├── dashboard/
│   ├── AGENTS.md              # Dashboard page rules
│   └── index.html             # Main dashboard page
│
├── entity/
│   ├── AGENTS.md              # Entity detail page rules
│   └── index.html             # Single entity detail page
│
├── api/
│   ├── AGENTS.md              # API endpoint rules
│   ├── entities.php           # Entity CRUD endpoints
│   ├── data.php               # Data push/pull endpoints
│   └── widgets.php            # Widget config endpoints
│
├── includes/
│   ├── AGENTS.md              # Backend shared code rules
│   ├── db.php                 # PDO connection
│   ├── auth.php               # API key validation
│   ├── keygen.php             # API key generator
│   ├── response.php           # JSON response helpers
│   └── migrate.php            # Table creation script
│
├── css/
│   └── style.css              # Global styles (dark theme)
│
├── js/
│   ├── AGENTS.md              # Frontend JS rules
│   ├── api.js                 # Fetch wrapper for API calls
│   ├── app.js                 # Dashboard page logic
│   ├── entity.js              # Entity detail page logic
│   ├── utils.js               # Frontend utilities
│   └── widgets/
│       ├── line-chart.js      # Line Chart widget renderer
│       └── value-card.js      # Value Card widget renderer
│
└── docs/
    └── api.md                 # API documentation for IoT device users
```

---

## Database Schema

### `entities` table

```sql
CREATE TABLE entities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  api_key     VARCHAR(64) NOT NULL UNIQUE,
  fields      JSON NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `data_points` table

```sql
CREATE TABLE data_points (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_id   INT NOT NULL,
  payload     JSON NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  INDEX idx_entity_time (entity_id, recorded_at DESC)
);
```

### `widgets` table

```sql
CREATE TABLE widgets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  entity_id   INT NOT NULL,
  type        ENUM('line-chart', 'value-card') NOT NULL,
  config      JSON NOT NULL,
  position    INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

---

## API Endpoints

### Entity Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/entities.php` | Create a new entity. Body: `{ name, fields }`. Returns entity with generated `api_key`. |
| `GET` | `/api/entities.php` | List all entities. |
| `GET` | `/api/entities.php?id=:id` | Get single entity detail. |
| `PUT` | `/api/entities.php?id=:id` | Update entity. Requires `X-API-Key` header. |
| `DELETE` | `/api/entities.php?id=:id` | Delete entity and all its data. Requires `X-API-Key` header. |

### Data Push/Pull

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/data.php?entity_id=:id` | Push a data point. Header: `X-API-Key`. Body: `{ field: value, ... }`. |
| `GET` | `/api/data.php?entity_id=:id` | Get data points. Query: `limit`, `range`, `field`. |
| `GET` | `/api/data.php?entity_id=:id&latest=1` | Get the single latest data point. |

### Widget Configuration

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/widgets.php?entity_id=:id` | Add a widget. Body: `{ type, config }`. |
| `GET` | `/api/widgets.php?entity_id=:id` | List all widgets for an entity. |
| `PUT` | `/api/widgets.php?id=:wid` | Update widget config. |
| `DELETE` | `/api/widgets.php?id=:wid` | Remove a widget. |

### Auth Rules

- `POST /api/entities.php` — No auth required (public creation).
- `POST /api/data.php` — Requires `X-API-Key` header matching the entity's key.
- `PUT` and `DELETE` on entities — Requires `X-API-Key` header.
- All `GET` endpoints — No auth required (public dashboard).
- Widget endpoints — No auth required.

---

## Design System

### Theme: Dark, Clean, Minimal

- **Background**: Deep dark (`#0a0a0f` base, `#12121a` cards).
- **Surface**: Slightly elevated cards with subtle borders (`#1e1e2e`).
- **Text primary**: Soft white (`#e0e0e8`), secondary (`#8888a0`).
- **Accent**: Calm blue-teal (`#4ecdc4`) for interactive elements and data highlights.
- **Danger**: Muted red (`#e74c6f`) for delete actions and errors.
- **Success**: Green (`#2ecc71`) for online/active states.
- **Border radius**: `8px` for cards, `6px` for buttons/inputs.
- **Font**: `Inter` from Google Fonts. Monospace: `JetBrains Mono` for API keys and code.
- **Spacing scale**: 4px base (4, 8, 12, 16, 24, 32, 48, 64).

### Component Patterns

- Cards with `background: #12121a`, `border: 1px solid #1e1e2e`, `border-radius: 8px`.
- Buttons: filled accent for primary, ghost/outline for secondary.
- Inputs: dark background (`#0d0d14`), border on focus (`#4ecdc4`).
- Subtle hover transitions (`transition: all 0.2s ease`).
- No heavy shadows. Use border separation over box-shadow.
- Responsive: mobile-first, single column on small screens, grid on larger.

---

## Comment Rules (STRICT)

These rules apply to ALL code in this project — PHP, JavaScript, CSS, HTML.

### Allowed

- Comments **above** a function, class, or method as a docblock explaining what it does.
- File-level comments at the very top of a file describing the file's purpose (one block only).

### Forbidden

- **No comments inside function/method bodies.** Zero. Not a single line.
- No inline comments after code (`$x = 1; // set x`).
- No TODO/FIXME/HACK comments inside functions.
- No commented-out code anywhere.

### Examples

```php
/**
 * Generate a unique API key with the frag_ prefix.
 * Returns a 52-character string: "frag_" + 48 hex chars.
 */
function generate_api_key(): string
{
    $bytes = random_bytes(24);
    return 'frag_' . bin2hex($bytes);
}
```

```javascript
/** Fetch all entities from the API and return parsed JSON. */
async function fetchEntities() {
    const res = await fetch('/api/entities.php');
    const json = await res.json();
    return json.data;
}
```

```css
/* Entity card — the clickable card on the dashboard grid. */
.entity-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 24px;
    cursor: pointer;
    transition: border-color 0.2s ease;
}
```

---

## Coding Conventions

### PHP

- Use PDO with prepared statements for all database queries. Never concatenate user input into SQL.
- Return consistent JSON responses: `{ "success": true, "data": ... }` or `{ "success": false, "error": "message" }`.
- HTTP status codes: 200 (ok), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error).
- Set `Content-Type: application/json` header on all API responses.
- Use `$_SERVER['REQUEST_METHOD']` to route GET/POST/PUT/DELETE within a single PHP file.
- Validate request body fields before processing. Return 400 with a clear message on invalid input.
- Use `json_decode(file_get_contents('php://input'), true)` to read JSON request bodies.
- Wrap database operations in try/catch. Never expose raw SQL errors to the client.
- Use strict type declarations (`declare(strict_types=1)`) at the top of every PHP file.

### JavaScript (Frontend)

- All API calls go through a single `api.js` fetch wrapper.
- Widget renderers are modular: each widget type has its own JS file that exports a `render(container, data, config)` function.
- Use `document.createElement` or template literals for DOM construction. No innerHTML with user data (XSS prevention).
- Polling interval: 10 seconds default, configurable per dashboard page.
- Chart.js instances must be properly destroyed before re-rendering to prevent memory leaks.

### CSS

- One global `style.css` file. Use CSS custom properties for theme tokens.
- Class naming: BEM-like (`.entity-card`, `.entity-card__title`, `.entity-card--active`).
- No `!important` unless absolutely necessary.
- Mobile-first responsive breakpoints: 480px, 768px, 1024px, 1280px.

### General

- No TypeScript. Plain JavaScript only.
- File naming: lowercase with hyphens for frontend (`line-chart.js`), lowercase with underscores or plain for PHP (`entities.php`).

---

## Error Handling

- All PHP API files must wrap logic in try/catch.
- Database errors return 500 with a generic message (don't leak PDO errors to the client).
- Validation errors return 400 with a specific, helpful message (e.g., `"Field 'name' is required"`).
- 404 for nonexistent entities or data points.
- API key mismatch returns 401 with `"Invalid or missing API key"`.

---

## API Key Format

- Prefix: `frag_` followed by 48 random hex characters.
- Example: `frag_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6`
- Generated using `random_bytes(24)` → `bin2hex()`.
- Shown to the user once at entity creation. Displayed masked (`frag_a1b2...e5f6`) afterwards.

---

## Pages and Their Responsibilities

### Landing Page (`/index.html`)
- Hero section explaining what Fragma is.
- "Get Started" button leading to the dashboard.
- Brief steps: Create → Connect → Visualize.

### Dashboard (`/dashboard/index.html`)
- Grid of all entities as cards.
- Each card shows: entity name, field count, last data timestamp, quick stats.
- "Create Entity" button opens a modal/form.
- Clicking an entity card navigates to its detail page.

### Entity Detail (`/entity/index.html?id=:id`)
- Entity info header (name, API key with copy button, created date).
- "How to connect" section with code snippet for ESP32/Arduino and cURL.
- Data table showing recent raw data points.
- Danger zone: delete entity button.

### View (`/view/index.html`)
- Unified visual dashboard across all entities.
- Configurable widgets (Line Chart, Value Card).
- Add Widget modal to map entity fields to visualization widgets.

---

## Development Notes

- The app runs on Laragon's Apache at `http://fragma.test`.
- Database `fragma` must be created manually in MySQL. Tables are created by visiting or running `includes/migrate.php`.
- No Composer autoload. Use `require_once` for includes.
- CORS headers are set in each API file via `includes/response.php`.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

