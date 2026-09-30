<?php
/**
 * REST API endpoint for Entity CRUD operations.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/keygen.php';

handle_cors_preflight();

/**
 * Handle GET requests to list all entities or retrieve a single entity by ID.
 */
function handle_get(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT id, name, api_key, fields, created_at, updated_at FROM entities WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $entity = $stmt->fetch();

        if (!$entity) {
            json_response(404, ['success' => false, 'error' => 'Entity not found']);
        }

        $fields = json_decode((string) $entity['fields'], true);
        $entity['fields'] = is_array($fields) ? $fields : [];
        $entity['api_key_masked'] = mask_api_key((string) $entity['api_key']);
        unset($entity['api_key']);

        $countStmt = $pdo->prepare('SELECT COUNT(*) as total, MAX(recorded_at) as last_point FROM data_points WHERE entity_id = :entity_id');
        $countStmt->execute([':entity_id' => $id]);
        $stats = $countStmt->fetch();

        $entity['data_count'] = (int) ($stats['total'] ?? 0);
        $entity['last_data_at'] = $stats['last_point'] ?? null;

        json_response(200, ['success' => true, 'data' => $entity]);
    }

    $stmt = $pdo->query('
        SELECT e.id, e.name, e.api_key, e.fields, e.created_at, e.updated_at,
               COUNT(d.id) AS data_count,
               MAX(d.recorded_at) AS last_data_at
        FROM entities e
        LEFT JOIN data_points d ON d.entity_id = e.id
        GROUP BY e.id
        ORDER BY e.id DESC
    ');

    $entities = $stmt->fetchAll();
    $result = [];

    foreach ($entities as $row) {
        $fields = json_decode((string) $row['fields'], true);
        $row['fields'] = is_array($fields) ? $fields : [];
        $row['api_key_masked'] = mask_api_key((string) $row['api_key']);
        unset($row['api_key']);
        $row['data_count'] = (int) $row['data_count'];
        $result[] = $row;
    }

    json_response(200, ['success' => true, 'data' => $result]);
}

/**
 * Handle POST requests to create a new entity and generate its unique API key.
 */
function handle_post(PDO $pdo): void
{
    $body = get_json_input();

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        json_response(400, ['success' => false, 'error' => "Field 'name' is required"]);
    }

    $rawFields = $body['fields'] ?? [];
    if (!is_array($rawFields)) {
        json_response(400, ['success' => false, 'error' => "Field 'fields' must be an array"]);
    }

    $cleanFields = [];
    foreach ($rawFields as $field) {
        if (!is_array($field)) {
            continue;
        }
        $fieldName = isset($field['name']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', trim((string) $field['name'])) : '';
        if ($fieldName === '') {
            continue;
        }
        $cleanFields[] = [
            'name' => $fieldName,
            'type' => isset($field['type']) ? trim((string) $field['type']) : 'number',
            'unit' => isset($field['unit']) ? trim((string) $field['unit']) : '',
        ];
    }

    $apiKey = generate_api_key();
    $jsonFields = json_encode($cleanFields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $stmt = $pdo->prepare('INSERT INTO entities (name, api_key, fields) VALUES (:name, :api_key, :fields)');
    $stmt->execute([
        ':name'    => $name,
        ':api_key' => $apiKey,
        ':fields'  => $jsonFields,
    ]);

    $newId = (int) $pdo->lastInsertId();

    json_response(201, [
        'success' => true,
        'data'    => [
            'id'             => $newId,
            'name'           => $name,
            'api_key'        => $apiKey,
            'api_key_masked' => mask_api_key($apiKey),
            'fields'         => $cleanFields,
            'created_at'     => date('Y-m-d H:i:s'),
        ]
    ]);
}

/**
 * Handle PUT requests to update an entity's name or fields.
 */
function handle_put(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity ID']);
    }

    require_api_key($pdo, $id);

    $body = get_json_input();
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

    if (isset($body['fields'])) {
        if (!is_array($body['fields'])) {
            json_response(400, ['success' => false, 'error' => "Field 'fields' must be an array"]);
        }
        $cleanFields = [];
        foreach ($body['fields'] as $field) {
            if (!is_array($field)) {
                continue;
            }
            $fieldName = isset($field['name']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', trim((string) $field['name'])) : '';
            if ($fieldName === '') {
                continue;
            }
            $cleanFields[] = [
                'name' => $fieldName,
                'type' => isset($field['type']) ? trim((string) $field['type']) : 'number',
                'unit' => isset($field['unit']) ? trim((string) $field['unit']) : '',
            ];
        }
        $updates[] = 'fields = :fields';
        $params[':fields'] = json_encode($cleanFields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    if (empty($updates)) {
        json_response(400, ['success' => false, 'error' => 'No valid fields provided for update']);
    }

    $sql = 'UPDATE entities SET ' . implode(', ', $updates) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    json_response(200, [
        'success' => true,
        'message' => 'Entity updated successfully'
    ]);
}

/**
 * Handle DELETE requests to delete an entity and its associated data.
 */
function handle_delete(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity ID']);
    }

    require_api_key($pdo, $id);

    $stmt = $pdo->prepare('DELETE FROM entities WHERE id = :id');
    $stmt->execute([':id' => $id]);

    json_response(200, [
        'success' => true,
        'message' => 'Entity and all associated data deleted successfully'
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
