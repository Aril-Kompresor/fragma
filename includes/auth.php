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

/**
 * Start a secure PHP session with HttpOnly and SameSite=Lax cookie settings.
 */
function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');

    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';
    session_set_cookie_params([
        'lifetime' => 86400 * 7,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}

/**
 * Return the currently authenticated user from the session, or null if not logged in.
 */
function get_authenticated_user(): ?array
{
    start_secure_session();
    if (empty($_SESSION['user']) || !is_array($_SESSION['user'])) {
        return null;
    }

    return $_SESSION['user'];
}

/**
 * Require an authenticated user session; responds with 401 if unauthenticated.
 */
function require_auth(): array
{
    $user = get_authenticated_user();
    if ($user === null) {
        json_response(401, [
            'success' => false,
            'error'   => 'Authentication required. Please log in.'
        ]);
    }

    return $user;
}

/**
 * Check whether a user has superadmin/admin permissions.
 */
function is_superadmin(array $user): bool
{
    $role = (string) ($user['role'] ?? '');
    return $role === 'superadmin' || $role === 'admin';
}

/**
 * Require the authenticated user to have one of the specified roles; responds with 403 otherwise.
 */
function require_role(string ...$roles): array
{
    $user = require_auth();
    $role = (string) ($user['role'] ?? '');
    $isSuperAdmin = ($role === 'superadmin' || $role === 'admin');

    if ((in_array('admin', $roles, true) || in_array('superadmin', $roles, true)) && $isSuperAdmin) {
        return $user;
    }

    if (!in_array($role, $roles, true)) {
        json_response(403, [
            'success' => false,
            'error'   => 'Forbidden: insufficient permissions for this action'
        ]);
    }

    return $user;
}

/**
 * Validate whether a string matches the canonical UUID format.
 */
function is_valid_uuid(string $value): bool
{
    return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value);
}

/**
 * Resolve a requested project ID from UUID or integer parameters, returning null if unspecified.
 */
function resolve_requested_project_id(PDO $pdo, array $query, ?array $body = null): ?int
{
    $uuid = trim((string) ($query['project_uuid'] ?? $query['uuid'] ?? ($body['project_uuid'] ?? ($body['uuid'] ?? ''))));
    if ($uuid !== '') {
        if (!is_valid_uuid($uuid)) {
            json_response(400, ['success' => false, 'error' => 'Invalid project UUID']);
        }
        $stmt = $pdo->prepare('SELECT id FROM projects WHERE uuid = :uuid LIMIT 1');
        $stmt->execute([':uuid' => strtolower($uuid)]);
        $row = $stmt->fetch();
        if (!$row) {
            json_response(404, ['success' => false, 'error' => 'Project not found']);
        }
        return (int) $row['id'];
    }

    $isProjectsEndpoint = basename($_SERVER['SCRIPT_NAME'] ?? '') === 'projects.php';
    $pid = 0;
    if (isset($query['project_id'])) {
        $pid = (int) $query['project_id'];
    } elseif ($isProjectsEndpoint && isset($query['id'])) {
        $pid = (int) $query['id'];
    } elseif ($body !== null && isset($body['project_id'])) {
        $pid = (int) $body['project_id'];
    }

    if ($pid > 0) {
        $stmt = $pdo->prepare('SELECT id FROM projects WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $pid]);
        if (!$stmt->fetch()) {
            json_response(404, ['success' => false, 'error' => 'Project not found']);
        }
        return $pid;
    }

    return null;
}

/**
 * Check whether an authenticated user can manage the given project (superadmin or project owner).
 */
function can_manage_project(PDO $pdo, int $projectId, array $user): bool
{
    if (is_superadmin($user)) {
        return true;
    }

    $stmt = $pdo->prepare('SELECT user_id FROM projects WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $projectId]);
    $row = $stmt->fetch();

    if (!$row) {
        return false;
    }

    return (int) $row['user_id'] === (int) $user['id'];
}

/**
 * Check whether an authenticated user can manage the given entity (superadmin or owner).
 */
function can_manage_entity(PDO $pdo, int $entityId, array $user): bool
{
    if (is_superadmin($user)) {
        return true;
    }

    $stmt = $pdo->prepare('SELECT user_id, project_id FROM entities WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $entityId]);
    $row = $stmt->fetch();

    if (!$row) {
        return false;
    }

    if ($row['user_id'] !== null && (int) $row['user_id'] === (int) $user['id']) {
        return true;
    }

    if (!empty($row['project_id'])) {
        return can_manage_project($pdo, (int) $row['project_id'], $user);
    }

    return false;
}

/**
 * Authorize entity management via valid device X-API-Key or authenticated owner/admin session.
 */
function require_entity_access(PDO $pdo, int $entityId): void
{
    $apiKey = get_api_key_header();
    if ($apiKey !== null && $apiKey !== '') {
        if (validate_api_key($pdo, $entityId)) {
            return;
        }
        json_response(401, [
            'success' => false,
            'error'   => 'Invalid or missing API key'
        ]);
    }

    $user = require_auth();
    $stmt = $pdo->prepare('SELECT id, user_id FROM entities WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $entityId]);
    $entity = $stmt->fetch();

    if (!$entity) {
        json_response(404, [
            'success' => false,
            'error'   => 'Entity not found'
        ]);
    }

    if (!can_manage_entity($pdo, $entityId, $user)) {
        json_response(403, [
            'success' => false,
            'error'   => 'Forbidden: you do not have permission to modify this entity'
        ]);
    }
}
