# API Endpoints

This folder contains the REST API endpoints for Fragma. Each PHP file handles one resource type and routes requests internally based on `$_SERVER['REQUEST_METHOD']`.

---

## File Responsibilities

| File | Resource | Methods |
|---|---|---|
| `entities.php` | Entity CRUD | GET, POST, PUT, DELETE |
| `data.php` | Data points (push from IoT devices, pull for dashboard) | GET, POST |
| `widgets.php` | Widget configuration | GET, POST, PUT, DELETE |

---

## Request Routing Pattern

Every file in this folder follows the same structure:

```php
declare(strict_types=1);
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handle_get();
        break;
    case 'POST':
        handle_post();
        break;
    case 'PUT':
        handle_put();
        break;
    case 'DELETE':
        handle_delete();
        break;
    default:
        json_response(405, ['success' => false, 'error' => 'Method not allowed']);
}
```

---

## Rules

- Always call `set_cors_headers()` from `response.php` at the top of every file.
- Handle `OPTIONS` preflight requests by returning 200 with CORS headers.
- Read JSON body with `json_decode(file_get_contents('php://input'), true)`.
- Use `$_GET` for query parameters (`id`, `entity_id`, `limit`, `range`).
- Every handler function must validate input and return early on failure with `json_response(400, ...)`.
- Auth-protected endpoints must call `validate_api_key()` from `auth.php` before processing.
- Never echo raw output. Always use `json_response()` helper.
