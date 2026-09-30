<?php
/**
 * API key authentication and verification routines.
 */

declare(strict_types=1);

require_once __DIR__ . '/response.php';

/**
 * Retrieve the X-API-Key header value from the current HTTP request.
 */
function get_api_key_header(): ?string
{
    if (!empty($_SERVER['HTTP_X_API_KEY'])) {
        return trim((string) $_SERVER['HTTP_X_API_KEY']);
    }

    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $key => $value) {
        if (strcasecmp($key, 'X-API-Key') === 0) {
            return trim((string) $value);
        }
    }

    return null;
}

/**
 * Validate that the provided API key header matches the registered key for the given entity ID.
 */
function validate_api_key(PDO $pdo, int $entityId): bool
{
    $apiKey = get_api_key_header();
    if ($apiKey === null || $apiKey === '') {
        return false;
    }

    $stmt = $pdo->prepare('SELECT api_key FROM entities WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $entityId]);
    $row = $stmt->fetch();

    if (!$row) {
        return false;
    }

    return hash_equals((string) $row['api_key'], $apiKey);
}

/**
 * Enforce that the request contains a valid API key for the target entity, terminating on failure.
 */
function require_api_key(PDO $pdo, int $entityId): void
{
    if (!validate_api_key($pdo, $entityId)) {
        json_response(401, [
            'success' => false,
            'error'   => 'Invalid or missing API key'
        ]);
    }
}
