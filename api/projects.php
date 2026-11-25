<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/keygen.php';

handle_cors_preflight();

/**
 * Handle GET requests: list accessible projects or fetch a single project detail.
 */
function handle_get(PDO $pdo): void
{
    $user = require_auth();
    $hasIdentifier = isset($_GET['uuid']) || isset($_GET['project_uuid']) || (isset($_GET['id']) && (int) $_GET['id'] > 0);
    $id = $hasIdentifier ? (resolve_requested_project_id($pdo, $_GET) ?? 0) : 0;

    if ($id > 0) {
        $stmt = $pdo->prepare('
            SELECT p.id, p.uuid, p.user_id, p.name, p.description, p.created_at, p.updated_at,
                   u.username AS owner_username, u.email AS owner_email
            FROM projects p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $project = $stmt->fetch();

        if (!$project) {
            json_response(404, ['success' => false, 'error' => 'Project not found']);
        }

        if (!can_manage_project($pdo, $id, $user)) {
            json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to view this project']);
        }

        $devicesStmt = $pdo->prepare('
            SELECT e.id, e.name, e.notes, e.fields, e.created_at, e.updated_at,
                   MAX(dp.recorded_at) AS last_data_at
            FROM entities e
            LEFT JOIN data_points dp ON dp.entity_id = e.id
            WHERE e.project_id = :project_id
            GROUP BY e.id
            ORDER BY e.id DESC
        ');
        $devicesStmt->execute([':project_id' => $id]);
        $devices = $devicesStmt->fetchAll();

        $activeCount = 0;
        $cutoff = time() - 120;
        foreach ($devices as &$dev) {
            $f = json_decode((string) $dev['fields'], true);
            $dev['fields'] = is_array($f) ? $f : [];
            if (!empty($dev['last_data_at']) && strtotime((string) $dev['last_data_at'] . ' UTC') >= $cutoff) {
                $activeCount++;
            }
        }
        unset($dev);

        $project['id'] = (int) $project['id'];
        $project['uuid'] = (string) $project['uuid'];
        $project['user_id'] = (int) $project['user_id'];
        $project['devices'] = $devices;
        $project['device_count'] = count($devices);
        $project['active_device_count'] = $activeCount;

        json_response(200, ['success' => true, 'data' => $project]);
    }

    $isSuper = is_superadmin($user);

    if ($isSuper) {
        $stmt = $pdo->query('
            SELECT p.id, p.uuid, p.user_id, p.name, p.description, p.created_at, p.updated_at,
                   u.username AS owner_username, u.email AS owner_email,
                   COUNT(DISTINCT e.id) AS device_count,
                   COUNT(DISTINCT CASE WHEN dp_latest.last_recorded_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 120 SECOND) THEN e.id END) AS active_device_count
            FROM projects p
            LEFT JOIN users u ON u.id = p.user_id
            LEFT JOIN entities e ON e.project_id = p.id
            LEFT JOIN (
                SELECT entity_id, MAX(recorded_at) AS last_recorded_at
                FROM data_points
                GROUP BY entity_id
            ) dp_latest ON dp_latest.entity_id = e.id
            GROUP BY p.id
            ORDER BY p.id DESC
        ');
    } else {
        $stmt = $pdo->prepare('
            SELECT p.id, p.uuid, p.user_id, p.name, p.description, p.created_at, p.updated_at,
                   u.username AS owner_username, u.email AS owner_email,
                   COUNT(DISTINCT e.id) AS device_count,
                   COUNT(DISTINCT CASE WHEN dp_latest.last_recorded_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 120 SECOND) THEN e.id END) AS active_device_count
            FROM projects p
            LEFT JOIN users u ON u.id = p.user_id
            LEFT JOIN entities e ON e.project_id = p.id
            LEFT JOIN (
                SELECT entity_id, MAX(recorded_at) AS last_recorded_at
                FROM data_points
                GROUP BY entity_id
            ) dp_latest ON dp_latest.entity_id = e.id
            WHERE p.user_id = :uid
            GROUP BY p.id
            ORDER BY p.id DESC
        ');
        $stmt->execute([':uid' => $user['id']]);
    }

    $rows = $stmt->fetchAll();
    $projects = [];
    foreach ($rows as $row) {
        $row['id'] = (int) $row['id'];
        $row['uuid'] = (string) $row['uuid'];
        $row['user_id'] = (int) $row['user_id'];
        $row['device_count'] = (int) $row['device_count'];
        $row['active_device_count'] = (int) ($row['active_device_count'] ?? 0);
        $projects[] = $row;
    }

    json_response(200, ['success' => true, 'data' => $projects]);
}

/**
 * Handle POST requests: create a new project owned by the authenticated user.
 */
function handle_post(PDO $pdo): void
{
    $user = require_auth();
    $body = get_json_input();

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        json_response(400, ['success' => false, 'error' => "Field 'name' is required"]);
    }

    $desc = isset($body['description']) ? trim((string) $body['description']) : null;
    $targetUserId = (is_superadmin($user) && !empty($body['user_id'])) ? (int) $body['user_id'] : (int) $user['id'];
    $uuid = generate_uuid();

    $stmt = $pdo->prepare('INSERT INTO projects (uuid, user_id, name, description) VALUES (:uuid, :user_id, :name, :description)');
    $stmt->execute([
        ':uuid'        => $uuid,
        ':user_id'     => $targetUserId,
        ':name'        => $name,
        ':description' => $desc,
    ]);

    $newId = (int) $pdo->lastInsertId();

    json_response(201, [
        'success' => true,
        'data'    => [
            'id'                  => $newId,
            'uuid'                => $uuid,
            'user_id'             => $targetUserId,
            'name'                => $name,
            'description'         => $desc,
            'device_count'        => 0,
            'active_device_count' => 0,
            'created_at'          => date('Y-m-d H:i:s'),
        ]
    ]);
}

/**
 * Handle PUT requests: update project title and description.
 */
function handle_put(PDO $pdo): void
{
    $user = require_auth();
    $body = get_json_input();
    $id = resolve_requested_project_id($pdo, $_GET, $body);
    if ($id === null || $id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid project identifier']);
    }

    if (!can_manage_project($pdo, $id, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to modify this project']);
    }

    $updates = [];
    $params = [':id' => $id];

    if (isset($body['name'])) {
        $name = trim((string) $body['name']);
        if ($name === '') {
            json_response(400, ['success' => false, 'error' => "Field 'name' cannot be empty"]);
        }
        $updates[] = 'name = :name';
        $params[':name'] = $name;
    }

    if (array_key_exists('description', $body)) {
        $updates[] = 'description = :description';
        $params[':description'] = $body['description'] !== null ? trim((string) $body['description']) : null;
    }

    if (is_superadmin($user) && isset($body['user_id'])) {
        $updates[] = 'user_id = :user_id';
        $params[':user_id'] = (int) $body['user_id'];
    }

    if (empty($updates)) {
        json_response(400, ['success' => false, 'error' => 'No valid fields provided for update']);
    }

    $sql = 'UPDATE projects SET ' . implode(', ', $updates) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    json_response(200, ['success' => true, 'message' => 'Project updated successfully']);
}

/**
 * Handle DELETE requests: delete project and unlink or cascade associated devices.
 */
function handle_delete(PDO $pdo): void
{
    $user = require_auth();
    $id = resolve_requested_project_id($pdo, $_GET);
    if ($id === null || $id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid project identifier']);
    }

    if (!can_manage_project($pdo, $id, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to delete this project']);
    }

    $stmt = $pdo->prepare('DELETE FROM projects WHERE id = :id');
    $stmt->execute([':id' => $id]);

    json_response(200, ['success' => true, 'message' => 'Project deleted successfully']);
}

try {
    $pdo = get_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ($method) {
        case 'GET':
            handle_get($pdo);
            break;
        case 'POST':
            handle_post($pdo);
            break;
        case 'PUT':
            handle_put($pdo);
            break;
        case 'DELETE':
            handle_delete($pdo);
            break;
        default:
            json_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'An unexpected server error occurred']);
}
