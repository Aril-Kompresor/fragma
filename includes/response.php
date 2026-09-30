<?php
/**
 * Shared JSON response helpers and CORS headers for Fragma API.
 */

declare(strict_types=1);

/**
 * Configure and send CORS headers to allow cross-origin requests.
 */
function set_cors_headers(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');
    header('Access-Control-Max-Age: 86400');
}

/**
 * Handle HTTP OPTIONS preflight request.
 */
function handle_cors_preflight(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        set_cors_headers();
        http_response_code(204);
        exit;
    }
}

/**
 * Send a structured JSON response and terminate the script.
 */
function json_response(int $status, array $data): void
{
    set_cors_headers();
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Read and decode the raw JSON input from the request body.
 */
function get_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response(400, [
            'success' => false,
            'error' => 'Invalid JSON payload'
        ]);
    }

    return $decoded;
}
