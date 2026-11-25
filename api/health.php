<?php
declare(strict_types=1);

/**
 * Lightweight application and database health check endpoint.
 */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';

handle_cors_preflight();

try {
    $pdo = get_db();
    $pdo->query('SELECT 1');
    json_response(200, [
        'success' => true,
        'data' => [
            'status' => 'ok',
            'database' => 'connected',
        ],
    ]);
} catch (Throwable $e) {
    json_response(500, [
        'success' => false,
        'error' => 'Health check failed',
    ]);
}
