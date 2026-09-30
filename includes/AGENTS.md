# Backend Includes

This folder contains shared PHP files used by the API endpoints. These are utility modules, not standalone scripts (except `migrate.php`).

---

## File Responsibilities

| File | Purpose |
|---|---|
| `db.php` | Creates and exports a PDO connection instance. Returns `$pdo`. |
| `auth.php` | Provides `validate_api_key($pdo, $entity_id)` — reads `X-API-Key` header, checks against DB, returns true/false. |
| `keygen.php` | Provides `generate_api_key()` — returns `frag_` + 48 hex characters. |
| `response.php` | Provides `json_response($status, $data)` and `set_cors_headers()`. |
| `migrate.php` | Standalone script. Creates all tables if they don't exist. Run once during setup or visit in browser. |

---

## Rules

- Every file must start with `declare(strict_types=1);`.
- `db.php` reads credentials from a `config.php` or hardcoded constants (Laragon defaults: root, no password).
- `db.php` must set PDO error mode to `ERRMODE_EXCEPTION` and `FETCH_ASSOC` as default fetch mode.
- `response.php` must set `Content-Type: application/json` and CORS headers (`Access-Control-Allow-Origin: *`).
- `migrate.php` must be idempotent — safe to run multiple times without data loss (`CREATE TABLE IF NOT EXISTS`).
- All functions here are pure utilities. No direct output except `response.php` and `migrate.php`.
