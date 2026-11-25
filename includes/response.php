<?php
declare(strict_types=1);

/**
 * Return the explicit list of allowed CORS origins for credentialed browser requests.
 */
function get_allowed_cors_origins(): array
{
    $allowed = [
        'https://fragma.my.id',
        'http://fragma.my.id',
        'http://fragma.test',
        'https://fragma.test',
        'http://localhost',
        'https://localhost',
        'http://127.0.0.1',
        'https://127.0.0.1',
    ];

    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($host !== '' && preg_match('/^[a-zA-Z0-9.\-:]+$/', $host)) {
        $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';
        $scheme = $isHttps ? 'https' : 'http';
        $allowed[] = $scheme . '://' . $host;
    }

    $envOrigins = getenv('CORS_ALLOWED_ORIGINS');
    if ($envOrigins !== false && trim($envOrigins) !== '') {
        foreach (explode(',', $envOrigins) as $item) {
            $trimmed = trim($item);
            if ($trimmed !== '') {
                $allowed[] = $trimmed;
            }
        }
    }

    return array_values(array_unique($allowed));
}

/**
 * Set allowlisted CORS headers and baseline HTTP security headers.
 */
function set_cors_headers(): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '' && in_array($origin, get_allowed_cors_origins(), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');
    header('Access-Control-Max-Age: 86400');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

function handle_cors_preflight(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        set_cors_headers();
        http_response_code(204);
        exit;
    }
}

function json_response(int $status, array $data): void
{
    set_cors_headers();
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

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
