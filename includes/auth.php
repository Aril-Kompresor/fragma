<?php
declare(strict_types=1);

require_once __DIR__ . '/response.php';

function get_api_key_header(): ?string
{
    if (!empty($_SERVER['HTTP_X_API_KEY'])) {
        return trim((string) $_SERVER['HTTP_X_API_KEY']);
    }

    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $key => $value) {
        if (strcasecmp($key, 'X-API-Key') === 0 || strcasecmp($key, 'X-Authorization') === 0) {
            return trim((string) $value);
        }
    }

    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = trim((string) $_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($auth, 'Bearer ') === 0) {
            return trim(substr($auth, 7));
        }
    }

    if (!empty($_GET['api_key'])) {
        return trim((string) $_GET['api_key']);
    }

    if (!empty($_GET['token'])) {
        return trim((string) $_GET['token']);
    }

    return null;
}

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

function require_api_key(PDO $pdo, int $entityId): void
{
    if (!validate_api_key($pdo, $entityId)) {
        json_response(401, [
            'success' => false,
            'error'   => 'Invalid or missing API key'
        ]);
    }
}
