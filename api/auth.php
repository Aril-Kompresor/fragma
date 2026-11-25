<?php
/**
 * Authentication and user role management API endpoint.
 * Handles register, login, logout, current user session lookup, and admin user management.
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

/**
 * Format a user database row into a safe public array without password_hash.
 */
function format_user_payload(array $row): array
{
    return [
        'id'         => (int) $row['id'],
        'username'   => (string) $row['username'],
        'email'      => (string) $row['email'],
        'role'       => (string) $row['role'],
        'created_at' => $row['created_at'] ?? null,
    ];
}

/**
 * Register a new operator account, hash the password with bcrypt, and start a session.
 */
function handle_register(PDO $pdo): void
{
    $body = get_json_input();
    $username = isset($body['username']) ? trim((string) $body['username']) : '';
    $email = isset($body['email']) ? trim(strtolower((string) $body['email'])) : '';
    $password = isset($body['password']) ? (string) $body['password'] : '';

    if ($username === '' || !preg_match('/^[a-zA-Z0-9_-]{3,50}$/', $username)) {
        json_response(400, [
            'success' => false,
            'error'   => 'Username must be 3-50 characters using letters, numbers, underscores, or hyphens'
        ]);
    }

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(400, [
            'success' => false,
            'error'   => 'A valid email address is required'
        ]);
    }

    if (strlen($password) < 6) {
        json_response(400, [
            'success' => false,
            'error'   => 'Password must be at least 6 characters'
        ]);
    }

    $checkStmt = $pdo->prepare('SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1');
    $checkStmt->execute([':username' => $username, ':email' => $email]);
    if ($checkStmt->fetch()) {
        json_response(409, [
            'success' => false,
            'error'   => 'Username or email is already registered'
        ]);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $role = 'user';

    $insertStmt = $pdo->prepare('INSERT INTO users (username, email, password_hash, role) VALUES (:username, :email, :password_hash, :role)');
    $insertStmt->execute([
        ':username'      => $username,
        ':email'         => $email,
        ':password_hash' => $passwordHash,
        ':role'          => $role,
    ]);

    $userId = (int) $pdo->lastInsertId();
    $user = [
        'id'         => $userId,
        'username'   => $username,
        'email'      => $email,
        'role'       => $role,
        'created_at' => date('Y-m-d H:i:s'),
    ];

    start_secure_session();
    session_regenerate_id(true);
    $_SESSION['user'] = $user;

    json_response(201, [
        'success' => true,
        'data'    => $user
    ]);
}

/**
 * Authenticate an existing user by username or email and create a session.
 */
function handle_login(PDO $pdo): void
{
    $body = get_json_input();
    $identifier = isset($body['username']) ? trim((string) $body['username']) : '';
    $password = isset($body['password']) ? (string) $body['password'] : '';

    if ($identifier === '' || $password === '') {
        json_response(400, [
            'success' => false,
            'error'   => 'Username and password are required'
        ]);
    }

    $stmt = $pdo->prepare('SELECT id, username, email, password_hash, role, created_at FROM users WHERE username = :username OR email = :email LIMIT 1');
    $stmt->execute([
        ':username' => $identifier,
        ':email'    => strtolower($identifier),
    ]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, (string) $row['password_hash'])) {
        json_response(401, [
            'success' => false,
            'error'   => 'Invalid username or password'
        ]);
    }

    $user = format_user_payload($row);

    start_secure_session();
    session_regenerate_id(true);
    $_SESSION['user'] = $user;

    json_response(200, [
        'success' => true,
        'data'    => $user
    ]);
}

/**
 * Destroy the active user session and clear the session cookie.
 */
function handle_logout(): void
{
    start_secure_session();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'] ?? '/',
            $params['domain'] ?? '',
            (bool) ($params['secure'] ?? false),
            (bool) ($params['httponly'] ?? true)
        );
    }

    session_destroy();

    json_response(200, [
        'success' => true,
        'message' => 'Logged out successfully'
    ]);
}

/**
 * Return the currently authenticated user profile, or null when optional=1.
 */
function handle_me(): void
{
    $isOptional = isset($_GET['optional']) && ($_GET['optional'] === '1' || $_GET['optional'] === 'true');
    if ($isOptional) {
        $user = get_authenticated_user();
        json_response(200, [
            'success' => true,
            'data'    => $user
        ]);
    }

    $user = require_auth();
    json_response(200, [
        'success' => true,
        'data'    => $user
    ]);
}

/**
 * List all registered user accounts (admin role only).
 */
function handle_list_users(PDO $pdo): void
{
    require_role('admin');
    $stmt = $pdo->query('SELECT id, username, email, role, created_at FROM users ORDER BY id ASC');
    $rows = $stmt->fetchAll();

    $users = [];
    foreach ($rows as $row) {
        $users[] = format_user_payload($row);
    }

    json_response(200, [
        'success' => true,
        'data'    => $users
    ]);
}

/**
 * Update a user's access role (admin role only).
 */
function handle_update_role(PDO $pdo): void
{
    $currentUser = require_role('superadmin', 'admin');
    $body = get_json_input();
    $targetId = isset($body['user_id']) ? (int) $body['user_id'] : 0;
    $newRole = isset($body['role']) ? trim((string) $body['role']) : '';

    if ($targetId <= 0 || !in_array($newRole, ['superadmin', 'admin', 'user'], true)) {
        json_response(400, [
            'success' => false,
            'error'   => "Valid 'user_id' and 'role' ('superadmin', 'admin', or 'user') are required"
        ]);
    }

    if ($targetId === (int) $currentUser['id'] && !in_array($newRole, ['superadmin', 'admin'], true)) {
        json_response(400, [
            'success' => false,
            'error'   => 'Cannot demote your own active superadmin account'
        ]);
    }

    $stmt = $pdo->prepare('UPDATE users SET role = :role WHERE id = :id');
    $stmt->execute([':role' => $newRole, ':id' => $targetId]);

    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
        $check->execute([':id' => $targetId]);
        if (!$check->fetch()) {
            json_response(404, ['success' => false, 'error' => 'User not found']);
        }
    }

    json_response(200, [
        'success' => true,
        'message' => 'User role updated successfully'
    ]);
}

try {
    $pdo = get_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = isset($_GET['action']) ? strtolower(trim((string) $_GET['action'])) : '';

    if ($method === 'POST' && $action === 'register') {
        handle_register($pdo);
    } elseif ($method === 'POST' && $action === 'login') {
        handle_login($pdo);
    } elseif ($method === 'POST' && $action === 'logout') {
        handle_logout();
    } elseif ($method === 'GET' && ($action === 'me' || $action === '')) {
        handle_me();
    } elseif ($method === 'GET' && $action === 'users') {
        handle_list_users($pdo);
    } elseif ($method === 'PUT' && $action === 'role') {
        handle_update_role($pdo);
    } else {
        json_response(400, ['success' => false, 'error' => 'Invalid auth action or HTTP method']);
    }
} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'Server error occurred']);
}

