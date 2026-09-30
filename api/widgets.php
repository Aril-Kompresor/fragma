<?php
/**
 * REST API endpoint for managing visual widgets attached to entities.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';

handle_cors_preflight();

/**
 * Handle GET requests to list all configured widgets for a specific entity.
 */
function handle_get(PDO $pdo): void
{
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;

    if ($entityId > 0) {
        $stmt = $pdo->prepare('
            SELECT id, entity_id, type, config, position, created_at
            FROM widgets
            WHERE entity_id = :entity_id
            ORDER BY position ASC, id ASC
        ');
        $stmt->execute([':entity_id' => $entityId]);
    } else {
        $stmt = $pdo->query('
            SELECT w.id, w.entity_id, w.type, w.config, w.position, w.created_at, e.name as entity_name
            FROM widgets w
            JOIN entities e ON w.entity_id = e.id
            ORDER BY w.position ASC, w.id ASC
        ');
    }
    
    $rows = $stmt->fetchAll();

    $widgets = [];
    foreach ($rows as $row) {
        $cfg = json_decode((string) $row['config'], true);
        $row['config'] = is_array($cfg) ? $cfg : [];
        $row['position'] = (int) $row['position'];
        $widgets[] = $row;
    }

    json_response(200, ['success' => true, 'data' => $widgets]);
}

/**
 * Handle POST requests to attach a new visual widget to an entity.
 */
function handle_post(PDO $pdo): void
{
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    $body = get_json_input();

    if ($entityId <= 0 && isset($body['entity_id'])) {
        $entityId = (int) $body['entity_id'];
    }

    if ($entityId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity_id']);
    }

    $checkStmt = $pdo->prepare('SELECT id FROM entities WHERE id = :id LIMIT 1');
    $checkStmt->execute([':id' => $entityId]);
    if (!$checkStmt->fetch()) {
        json_response(404, ['success' => false, 'error' => 'Entity not found']);
    }

    $type = isset($body['type']) ? trim((string) $body['type']) : '';
    if (!in_array($type, ['line-chart', 'value-card'], true)) {
        json_response(400, ['success' => false, 'error' => "Widget type must be 'line-chart' or 'value-card'"]);
    }

    $config = isset($body['config']) && is_array($body['config']) ? $body['config'] : [];
    if (empty($config['field'])) {
        json_response(400, ['success' => false, 'error' => "Widget config requires a target 'field'"]);
    }

    $position = isset($body['position']) ? (int) $body['position'] : 0;
    $jsonConfig = json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $createdAt = date('Y-m-d H:i:s');

    $stmt = $pdo->prepare('INSERT INTO widgets (entity_id, type, config, position, created_at) VALUES (:entity_id, :type, :config, :position, :created_at)');
    $stmt->execute([
        ':entity_id'  => $entityId,
        ':type'       => $type,
        ':config'     => $jsonConfig,
        ':position'   => $position,
        ':created_at' => $createdAt,
    ]);

    $newId = (int) $pdo->lastInsertId();

    json_response(201, [
        'success' => true,
        'data'    => [
            'id'         => $newId,
            'entity_id'  => $entityId,
            'type'       => $type,
            'config'     => $config,
            'position'   => $position,
            'created_at' => $createdAt,
        ]
    ]);
}

/**
 * Handle PUT requests to update an existing widget's configuration or position.
 */
function handle_put(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid widget ID']);
    }

    $body = get_json_input();
    $updates = [];
    $params = [':id' => $id];

    if (isset($body['type'])) {
        $type = trim((string) $body['type']);
        if (!in_array($type, ['line-chart', 'value-card'], true)) {
            json_response(400, ['success' => false, 'error' => "Widget type must be 'line-chart' or 'value-card'"]);
        }
        $updates[] = 'type = :type';
        $params[':type'] = $type;
    }

    if (isset($body['config'])) {
        if (!is_array($body['config'])) {
            json_response(400, ['success' => false, 'error' => "Widget 'config' must be an object"]);
        }
        $updates[] = 'config = :config';
        $params[':config'] = json_encode($body['config'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    if (isset($body['position'])) {
        $updates[] = 'position = :position';
        $params[':position'] = (int) $body['position'];
    }

    if (empty($updates)) {
        json_response(400, ['success' => false, 'error' => 'No valid fields provided for update']);
    }

    $sql = 'UPDATE widgets SET ' . implode(', ', $updates) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    json_response(200, [
        'success' => true,
        'message' => 'Widget updated successfully'
    ]);
}

/**
 * Handle DELETE requests to remove a widget.
 */
function handle_delete(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid widget ID']);
    }

    $stmt = $pdo->prepare('DELETE FROM widgets WHERE id = :id');
    $stmt->execute([':id' => $id]);

    json_response(200, [
        'success' => true,
        'message' => 'Widget removed successfully'
    ]);
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
    json_response(500, ['success' => false, 'error' => 'Server error occurred']);
}
