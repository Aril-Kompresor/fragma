<?php
/**
 * REST API endpoint for pushing and querying IoT time-series data points.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

/**
 * Handle GET requests to query data points for an entity with optional limit, range, or latest filter.
 */
function handle_get(PDO $pdo): void
{
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    if ($entityId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity_id']);
    }

    $isLatest = isset($_GET['latest']) && ($_GET['latest'] === '1' || $_GET['latest'] === 'true');

    if ($isLatest) {
        $stmt = $pdo->prepare('
            SELECT id, entity_id, payload, recorded_at
            FROM data_points
            WHERE entity_id = :entity_id
            ORDER BY recorded_at DESC, id DESC
            LIMIT 1
        ');
        $stmt->execute([':entity_id' => $entityId]);
        $row = $stmt->fetch();

        if (!$row) {
            json_response(200, ['success' => true, 'data' => null]);
        }

        $payload = json_decode((string) $row['payload'], true);
        $row['payload'] = is_array($payload) ? $payload : [];

        json_response(200, ['success' => true, 'data' => $row]);
    }

    $limit = isset($_GET['limit']) ? max(1, min(500, (int) $_GET['limit'])) : 100;
    $range = isset($_GET['range']) ? trim((string) $_GET['range']) : '';
    $fieldFilter = isset($_GET['field']) ? trim((string) $_GET['field']) : '';

    $whereClauses = ['entity_id = :entity_id'];
    $params = [':entity_id' => $entityId];

    if ($range !== '') {
        $seconds = 0;
        if (preg_match('/^(\d+)([mhd])$/i', $range, $m)) {
            $val = (int) $m[1];
            $unit = strtolower($m[2]);
            if ($unit === 'm') {
                $seconds = $val * 60;
            } elseif ($unit === 'h') {
                $seconds = $val * 3600;
            } elseif ($unit === 'd') {
                $seconds = $val * 86400;
            }
        }

        if ($seconds > 0) {
            $threshold = date('Y-m-d H:i:s', time() - $seconds);
            $whereClauses[] = 'recorded_at >= :threshold';
            $params[':threshold'] = $threshold;
        }
    }

    $whereSql = implode(' AND ', $whereClauses);
    $sql = "SELECT id, entity_id, payload, recorded_at
            FROM data_points
            WHERE {$whereSql}
            ORDER BY recorded_at DESC, id DESC
            LIMIT {$limit}";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $data = [];
    foreach ($rows as $r) {
        $payload = json_decode((string) $r['payload'], true);
        $cleanPayload = is_array($payload) ? $payload : [];

        if ($fieldFilter !== '') {
            $r['payload'] = [
                $fieldFilter => $cleanPayload[$fieldFilter] ?? null
            ];
        } else {
            $r['payload'] = $cleanPayload;
        }

        $data[] = $r;
    }

    json_response(200, ['success' => true, 'data' => $data]);
}

/**
 * Handle POST requests from IoT devices to record incoming data points and auto-detect schema fields.
 */
function handle_post(PDO $pdo): void
{
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    if ($entityId <= 0) {
        $bodyTemp = get_json_input();
        if (isset($bodyTemp['entity_id'])) {
            $entityId = (int) $bodyTemp['entity_id'];
        }
    }

    if ($entityId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity_id']);
    }

    require_api_key($pdo, $entityId);

    $body = get_json_input();
    unset($body['entity_id']);

    if (empty($body)) {
        json_response(400, ['success' => false, 'error' => 'Data payload cannot be empty']);
    }

    $cleanPayload = [];
    foreach ($body as $key => $val) {
        $sanitizedKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $key);
        if ($sanitizedKey === '') {
            continue;
        }
        if (is_numeric($val)) {
            $cleanPayload[$sanitizedKey] = strpos((string) $val, '.') !== false ? (float) $val : (int) $val;
        } elseif (is_bool($val)) {
            $cleanPayload[$sanitizedKey] = $val;
        } else {
            $cleanPayload[$sanitizedKey] = (string) $val;
        }
    }

    if (empty($cleanPayload)) {
        json_response(400, ['success' => false, 'error' => 'Payload contains no valid fields']);
    }

    $stmtEntity = $pdo->prepare('SELECT fields FROM entities WHERE id = :id LIMIT 1');
    $stmtEntity->execute([':id' => $entityId]);
    $entityRow = $stmtEntity->fetch();

    $existingFields = [];
    if ($entityRow && !empty($entityRow['fields'])) {
        $decoded = json_decode((string) $entityRow['fields'], true);
        if (is_array($decoded)) {
            $existingFields = $decoded;
        }
    }

    $existingMap = [];
    foreach ($existingFields as $f) {
        if (isset($f['name'])) {
            $existingMap[$f['name']] = $f;
        }
    }

    $newFieldsDetected = false;
    $updatedFields = $existingFields;

    foreach ($cleanPayload as $fieldName => $val) {
        if (!isset($existingMap[$fieldName])) {
            $detectedType = 'string';
            if (is_numeric($val) || is_int($val) || is_float($val)) {
                $detectedType = 'number';
            } elseif (is_bool($val)) {
                $detectedType = 'boolean';
            }
            $newField = [
                'name' => $fieldName,
                'type' => $detectedType,
                'unit' => '',
            ];
            $updatedFields[] = $newField;
            $existingMap[$fieldName] = $newField;
            $newFieldsDetected = true;
        }
    }

    if ($newFieldsDetected) {
        $updateStmt = $pdo->prepare('UPDATE entities SET fields = :fields WHERE id = :id');
        $updateStmt->execute([
            ':fields' => json_encode($updatedFields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':id'     => $entityId,
        ]);
    }

    $jsonPayload = json_encode($cleanPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $recordedAt = date('Y-m-d H:i:s');

    $stmt = $pdo->prepare('INSERT INTO data_points (entity_id, payload, recorded_at) VALUES (:entity_id, :payload, :recorded_at)');
    $stmt->execute([
        ':entity_id'   => $entityId,
        ':payload'     => $jsonPayload,
        ':recorded_at' => $recordedAt,
    ]);

    $newId = (int) $pdo->lastInsertId();

    json_response(201, [
        'success' => true,
        'data'    => [
            'id'              => $newId,
            'entity_id'       => $entityId,
            'payload'         => $cleanPayload,
            'recorded_at'     => $recordedAt,
            'fields'          => $updatedFields,
            'fields_detected' => $newFieldsDetected,
        ]
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
        default:
            json_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'Server error occurred']);
}
