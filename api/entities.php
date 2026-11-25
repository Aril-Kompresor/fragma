<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/keygen.php';

handle_cors_preflight();

function handle_get(PDO $pdo): void
{
    $user = require_auth();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $hasProjectFilter = !empty($_GET['project_uuid']) || !empty($_GET['uuid']) || !empty($_GET['project_id']);
    $projectId = $hasProjectFilter ? (resolve_requested_project_id($pdo, $_GET) ?? 0) : 0;
    $isSuper = is_superadmin($user);

    if ($id > 0) {
        $stmt = $pdo->prepare('
            SELECT e.id, e.user_id, e.project_id, p.uuid AS project_uuid, p.name AS project_name, u.username AS owner_username,
                   e.name, e.notes, e.api_key, e.fields, e.created_at, e.updated_at
            FROM entities e
            LEFT JOIN users u ON u.id = e.user_id
            LEFT JOIN projects p ON p.id = e.project_id
            WHERE e.id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $entity = $stmt->fetch();

        if (!$entity) {
            json_response(404, ['success' => false, 'error' => 'Entity not found']);
        }

        if ($projectId > 0 && (int) $entity['project_id'] !== $projectId) {
            json_response(404, ['success' => false, 'error' => 'Entity not found in this project']);
        }

        if (!can_manage_entity($pdo, $id, $user)) {
            json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to view this device']);
        }

        $entity['id'] = (int) $entity['id'];
        $entity['user_id'] = $entity['user_id'] !== null ? (int) $entity['user_id'] : null;
        $entity['project_id'] = $entity['project_id'] !== null ? (int) $entity['project_id'] : null;
        $entity['project_uuid'] = $entity['project_uuid'] !== null ? (string) $entity['project_uuid'] : null;
        $fields = json_decode((string) $entity['fields'], true);
        $entity['fields'] = is_array($fields) ? $fields : [];
        $entity['api_key'] = (string) $entity['api_key'];
        $entity['api_key_masked'] = mask_api_key((string) $entity['api_key']);

        $countStmt = $pdo->prepare('SELECT COUNT(*) as total, MAX(recorded_at) as last_point FROM data_points WHERE entity_id = :entity_id');
        $countStmt->execute([':entity_id' => $id]);
        $stats = $countStmt->fetch();

        $entity['data_count'] = (int) ($stats['total'] ?? 0);
        $entity['last_data_at'] = $stats['last_point'] ?? null;

        $latestStmt = $pdo->prepare('SELECT payload FROM data_points WHERE entity_id = :entity_id ORDER BY recorded_at DESC, id DESC LIMIT 1');
        $latestStmt->execute([':entity_id' => $id]);
        $latestRow = $latestStmt->fetch();
        $latestPayload = $latestRow && !empty($latestRow['payload']) ? json_decode((string) $latestRow['payload'], true) : null;
        $entity['latest_payload'] = is_array($latestPayload) ? $latestPayload : null;

        json_response(200, ['success' => true, 'data' => $entity]);
    }

    $whereClauses = [];
    $params = [];

    if ($projectId > 0) {
        if (!can_manage_project($pdo, $projectId, $user)) {
            json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have access to this project']);
        }
        $whereClauses[] = 'e.project_id = :project_id';
        $params[':project_id'] = $projectId;
    }

    if (!$isSuper) {
        $whereClauses[] = '(e.user_id = :uid OR e.project_id IN (SELECT id FROM projects WHERE user_id = :uid_p))';
        $params[':uid'] = $user['id'];
        $params[':uid_p'] = $user['id'];
    }

    $whereSql = !empty($whereClauses) ? 'WHERE ' . implode(' AND ', $whereClauses) : '';

    $sql = "
        SELECT e.id, e.user_id, e.project_id, p.uuid AS project_uuid, p.name AS project_name, u.username AS owner_username,
               e.name, e.notes, e.api_key, e.fields, e.created_at, e.updated_at,
               COUNT(d.id) AS data_count,
               MAX(d.recorded_at) AS last_data_at,
               (
                   SELECT d2.payload
                   FROM data_points d2
                   WHERE d2.entity_id = e.id
                   ORDER BY d2.recorded_at DESC, d2.id DESC
                   LIMIT 1
               ) AS latest_payload
        FROM entities e
        LEFT JOIN users u ON u.id = e.user_id
        LEFT JOIN projects p ON p.id = e.project_id
        LEFT JOIN data_points d ON d.entity_id = e.id
        {$whereSql}
        GROUP BY e.id
        ORDER BY e.id DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $entities = $stmt->fetchAll();
    $result = [];

    foreach ($entities as $row) {
        $row['id'] = (int) $row['id'];
        $row['user_id'] = $row['user_id'] !== null ? (int) $row['user_id'] : null;
        $row['project_id'] = $row['project_id'] !== null ? (int) $row['project_id'] : null;
        $row['project_uuid'] = $row['project_uuid'] !== null ? (string) $row['project_uuid'] : null;
        $fields = json_decode((string) $row['fields'], true);
        $row['fields'] = is_array($fields) ? $fields : [];
        $row['api_key_masked'] = mask_api_key((string) $row['api_key']);
        unset($row['api_key']);
        $row['data_count'] = (int) $row['data_count'];
        $latestPayload = !empty($row['latest_payload']) ? json_decode((string) $row['latest_payload'], true) : null;
        $row['latest_payload'] = is_array($latestPayload) ? $latestPayload : null;
        $result[] = $row;
    }

    json_response(200, ['success' => true, 'data' => $result]);
}

function handle_post(PDO $pdo): void
{
    $user = require_auth();
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

    $projectId = resolve_requested_project_id($pdo, $_GET, $body);
    if ($projectId !== null && !can_manage_project($pdo, $projectId, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you cannot add devices to this project']);
    }

    $projectUuid = null;
    if ($projectId === null) {
        $defaultPStmt = $pdo->prepare('SELECT id, uuid FROM projects WHERE user_id = :uid ORDER BY id ASC LIMIT 1');
        $defaultPStmt->execute([':uid' => $user['id']]);
        $defRow = $defaultPStmt->fetch();
        if ($defRow) {
            $projectId = (int) $defRow['id'];
            $projectUuid = (string) $defRow['uuid'];
        }
    } else {
        $uuidStmt = $pdo->prepare('SELECT uuid FROM projects WHERE id = :id LIMIT 1');
        $uuidStmt->execute([':id' => $projectId]);
        $uuidVal = $uuidStmt->fetchColumn();
        $projectUuid = $uuidVal ? (string) $uuidVal : null;
    }

    $rawNotes = isset($body['notes']) ? trim((string) $body['notes']) : '';
    $notes = $rawNotes !== '' ? mb_substr($rawNotes, 0, 150) : null;

    $apiKey = generate_api_key();
    $jsonFields = json_encode($cleanFields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $stmt = $pdo->prepare('INSERT INTO entities (user_id, project_id, name, notes, api_key, fields) VALUES (:user_id, :project_id, :name, :notes, :api_key, :fields)');
    $stmt->execute([
        ':user_id'    => (int) $user['id'],
        ':project_id' => $projectId,
        ':name'       => $name,
        ':notes'      => $notes,
        ':api_key'    => $apiKey,
        ':fields'     => $jsonFields,
    ]);

    $newId = (int) $pdo->lastInsertId();

    json_response(201, [
        'success' => true,
        'data'    => [
            'id'             => $newId,
            'user_id'        => (int) $user['id'],
            'project_id'     => $projectId,
            'project_uuid'   => $projectUuid,
            'owner_username' => $user['username'],
            'name'           => $name,
            'notes'          => $notes,
            'api_key'        => $apiKey,
            'api_key_masked' => mask_api_key($apiKey),
            'fields'         => $cleanFields,
            'created_at'     => date('Y-m-d H:i:s'),
        ]
    ]);
}

function handle_put(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity ID']);
    }

    require_entity_access($pdo, $id);

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

    if (array_key_exists('project_uuid', $body) || array_key_exists('project_id', $body)) {
        $user = require_auth();
        $targetPid = null;
        if (!empty($body['project_uuid']) || (!empty($body['project_id']) && (int) $body['project_id'] > 0)) {
            $targetPid = resolve_requested_project_id($pdo, [], $body);
        }
        if ($targetPid !== null && !can_manage_project($pdo, $targetPid, $user)) {
            json_response(403, ['success' => false, 'error' => 'Forbidden: you cannot move device to this project']);
        }
        $updates[] = 'project_id = :project_id';
        $params[':project_id'] = $targetPid;
    }

    if (array_key_exists('notes', $body)) {
        $trimmedNotes = $body['notes'] !== null ? trim((string) $body['notes']) : '';
        $updates[] = 'notes = :notes';
        $params[':notes'] = $trimmedNotes !== '' ? mb_substr($trimmedNotes, 0, 150) : null;
    }

    $newApiKey = null;
    if (!empty($body['regenerate_key'])) {
        $newApiKey = generate_api_key();
        $updates[] = 'api_key = :api_key';
        $params[':api_key'] = $newApiKey;
    }

    if (empty($updates)) {
        json_response(400, ['success' => false, 'error' => 'No valid fields provided for update']);
    }

    $sql = 'UPDATE entities SET ' . implode(', ', $updates) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $responseData = [
        'success' => true,
        'message' => 'Entity updated successfully'
    ];
    if ($newApiKey !== null) {
        $responseData['data'] = [
            'api_key'        => $newApiKey,
            'api_key_masked' => mask_api_key($newApiKey),
        ];
    }

    json_response(200, $responseData);
}

function handle_delete(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity ID']);
    }

    require_entity_access($pdo, $id);

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
