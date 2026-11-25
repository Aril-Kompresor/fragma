<?php
declare(strict_types=1);

/**
 * Multi-Flow CRUD and Server Execution Logs API endpoint.
 */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

/**
 * Format a database flow row into an API response array.
 */
function format_flow_row(array $row): array
{
    $blocks = json_decode((string) $row['blocks'], true);
    $testInputs = $row['test_inputs'] !== null ? json_decode((string) $row['test_inputs'], true) : [];

    return [
        'id' => (int) $row['id'],
        'user_id' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
        'project_id' => isset($row['project_id']) && $row['project_id'] !== null ? (int) $row['project_id'] : null,
        'entity_id' => $row['entity_id'] !== null ? (int) $row['entity_id'] : null,
        'name' => (string) $row['name'],
        'enabled' => (bool) $row['enabled'],
        'blocks' => is_array($blocks) ? $blocks : [],
        'test_inputs' => is_array($testInputs) ? $testInputs : [],
        'last_run_at' => $row['last_run_at'],
        'last_status' => $row['last_status'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}

/**
 * Verify that the authenticated user owns the flow, manages its project, or is a superadmin.
 */
function require_flow_access(PDO $pdo, int $flowId, array $user): array
{
    $stmt = $pdo->prepare('SELECT * FROM flows WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $flowId]);
    $flow = $stmt->fetch();

    if (!$flow) {
        json_response(404, ['success' => false, 'error' => 'Flow not found']);
    }

    $hasProjectAccess = !empty($flow['project_id']) && can_manage_project($pdo, (int) $flow['project_id'], $user);
    if (!is_superadmin($user) && (int) $flow['user_id'] !== (int) $user['id'] && !$hasProjectAccess) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not own this flow']);
    }

    return $flow;
}

/**
 * Handle GET requests for listing flows or fetching server execution logs.
 */
function handle_get(PDO $pdo, array $user): void
{
    $projectId = resolve_requested_project_id($pdo, $_GET) ?? 0;
    if ($projectId > 0 && !can_manage_project($pdo, $projectId, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have access to this project']);
    }

    if (isset($_GET['logs']) && ($_GET['logs'] === '1' || $_GET['logs'] === 'true')) {
        $flowId = isset($_GET['flow_id']) ? (int) $_GET['flow_id'] : 0;
        $limit = isset($_GET['limit']) ? max(1, min(100, (int) $_GET['limit'])) : 20;

        $where = [];
        $params = [];

        if ($flowId > 0) {
            require_flow_access($pdo, $flowId, $user);
            $where[] = 'l.flow_id = :flow_id';
            $params[':flow_id'] = $flowId;
        }
        if ($projectId > 0) {
            $where[] = '(f.project_id = :project_id OR e.project_id = :project_id_e)';
            $params[':project_id'] = $projectId;
            $params[':project_id_e'] = $projectId;
        }
        if (!is_superadmin($user) && $flowId <= 0) {
            $where[] = '(f.user_id = :user_id OR f.project_id IN (SELECT id FROM projects WHERE user_id = :uid_p))';
            $params[':user_id'] = (int) $user['id'];
            $params[':uid_p'] = (int) $user['id'];
        }

        $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
        $sql = "
            SELECT l.id, l.flow_id, l.entity_id, l.status, l.alerts, l.logs, l.output_payload, l.executed_at,
                   f.name AS flow_name, e.name AS entity_name
            FROM flow_logs l
            INNER JOIN flows f ON f.id = l.flow_id
            INNER JOIN entities e ON e.id = l.entity_id
            {$whereSql}
            ORDER BY l.executed_at DESC, l.id DESC
            LIMIT {$limit}
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $formattedLogs = [];
        foreach ($rows as $r) {
            $alerts = $r['alerts'] !== null ? json_decode((string) $r['alerts'], true) : [];
            $logs = json_decode((string) $r['logs'], true);
            $outputPayload = json_decode((string) $r['output_payload'], true);

            $formattedLogs[] = [
                'id' => (int) $r['id'],
                'flow_id' => (int) $r['flow_id'],
                'flow_name' => (string) $r['flow_name'],
                'entity_id' => (int) $r['entity_id'],
                'entity_name' => (string) $r['entity_name'],
                'status' => (string) $r['status'],
                'alerts' => is_array($alerts) ? $alerts : [],
                'logs' => is_array($logs) ? $logs : [],
                'output_payload' => is_array($outputPayload) ? $outputPayload : [],
                'executed_at' => $r['executed_at'],
            ];
        }

        json_response(200, ['success' => true, 'data' => $formattedLogs]);
    }

    $where = [];
    $params = [];
    if ($projectId > 0) {
        $where[] = 'project_id = :project_id';
        $params[':project_id'] = $projectId;
    }
    if (!is_superadmin($user)) {
        $where[] = '(user_id = :user_id OR project_id IN (SELECT id FROM projects WHERE user_id = :uid_p))';
        $params[':user_id'] = (int) $user['id'];
        $params[':uid_p'] = (int) $user['id'];
    }
    $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
    $stmt = $pdo->prepare("SELECT * FROM flows {$whereSql} ORDER BY id ASC");
    $stmt->execute($params);

    $rows = $stmt->fetchAll();
    $flows = [];
    foreach ($rows as $row) {
        $flows[] = format_flow_row($row);
    }

    json_response(200, ['success' => true, 'data' => $flows]);
}

/**
 * Handle POST requests to create a new flow rule.
 */
function handle_post(PDO $pdo, array $user): void
{
    $body = get_json_input();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        $name = 'Untitled Flow';
    }

    $projectId = resolve_requested_project_id($pdo, $_GET, $body);

    if ($projectId !== null && !can_manage_project($pdo, $projectId, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have access to this project']);
    }

    $entityId = null;
    if (isset($body['entity_id']) && $body['entity_id'] !== '' && $body['entity_id'] !== null && $body['entity_id'] !== 'sandbox') {
        $candidateId = (int) $body['entity_id'];
        if ($candidateId > 0) {
            require_entity_access($pdo, $candidateId);
            $entityId = $candidateId;
            if ($projectId === null) {
                $epStmt = $pdo->prepare('SELECT project_id FROM entities WHERE id = :id LIMIT 1');
                $epStmt->execute([':id' => $entityId]);
                $epRow = $epStmt->fetch();
                if ($epRow && !empty($epRow['project_id'])) {
                    $projectId = (int) $epRow['project_id'];
                }
            }
        }
    }

    $enabled = isset($body['enabled']) ? ((bool) $body['enabled'] ? 1 : 0) : 1;
    $blocks = isset($body['blocks']) && is_array($body['blocks']) ? $body['blocks'] : [];
    $testInputs = isset($body['test_inputs']) && is_array($body['test_inputs']) ? $body['test_inputs'] : [];

    $stmt = $pdo->prepare('
        INSERT INTO flows (user_id, project_id, entity_id, name, enabled, blocks, test_inputs)
        VALUES (:user_id, :project_id, :entity_id, :name, :enabled, :blocks, :test_inputs)
    ');
    $stmt->execute([
        ':user_id' => (int) $user['id'],
        ':project_id' => $projectId,
        ':entity_id' => $entityId,
        ':name' => mb_substr($name, 0, 120),
        ':enabled' => $enabled,
        ':blocks' => json_encode($blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ':test_inputs' => json_encode($testInputs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    $newId = (int) $pdo->lastInsertId();
    $fetchStmt = $pdo->prepare('SELECT * FROM flows WHERE id = :id LIMIT 1');
    $fetchStmt->execute([':id' => $newId]);
    $created = $fetchStmt->fetch();

    json_response(201, ['success' => true, 'data' => format_flow_row($created)]);
}

/**
 * Handle PUT requests to update an existing flow rule.
 */
function handle_put(PDO $pdo, array $user): void
{
    $flowId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($flowId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid flow id']);
    }

    $existing = require_flow_access($pdo, $flowId, $user);
    $body = get_json_input();

    $name = array_key_exists('name', $body) ? trim((string) $body['name']) : (string) $existing['name'];
    if ($name === '') {
        $name = 'Untitled Flow';
    }

    $entityId = $existing['entity_id'] !== null ? (int) $existing['entity_id'] : null;
    if (array_key_exists('entity_id', $body)) {
        if ($body['entity_id'] === null || $body['entity_id'] === '' || $body['entity_id'] === 'sandbox') {
            $entityId = null;
        } else {
            $candidateId = (int) $body['entity_id'];
            if ($candidateId > 0) {
                require_entity_access($pdo, $candidateId);
                $entityId = $candidateId;
            } else {
                $entityId = null;
            }
        }
    }

    $enabled = array_key_exists('enabled', $body)
        ? ((bool) $body['enabled'] ? 1 : 0)
        : (int) $existing['enabled'];

    $blocksJson = array_key_exists('blocks', $body) && is_array($body['blocks'])
        ? json_encode($body['blocks'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        : (string) $existing['blocks'];

    $testInputsJson = array_key_exists('test_inputs', $body) && is_array($body['test_inputs'])
        ? json_encode($body['test_inputs'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        : $existing['test_inputs'];

    $stmt = $pdo->prepare('
        UPDATE flows
        SET entity_id = :entity_id,
            name = :name,
            enabled = :enabled,
            blocks = :blocks,
            test_inputs = :test_inputs
        WHERE id = :id
    ');
    $stmt->execute([
        ':entity_id' => $entityId,
        ':name' => mb_substr($name, 0, 120),
        ':enabled' => $enabled,
        ':blocks' => $blocksJson,
        ':test_inputs' => $testInputsJson,
        ':id' => $flowId,
    ]);

    $fetchStmt = $pdo->prepare('SELECT * FROM flows WHERE id = :id LIMIT 1');
    $fetchStmt->execute([':id' => $flowId]);
    $updated = $fetchStmt->fetch();

    json_response(200, ['success' => true, 'data' => format_flow_row($updated)]);
}

/**
 * Handle DELETE requests to remove a flow rule.
 */
function handle_delete(PDO $pdo, array $user): void
{
    $flowId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($flowId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid flow id']);
    }

    require_flow_access($pdo, $flowId, $user);

    $stmt = $pdo->prepare('DELETE FROM flows WHERE id = :id');
    $stmt->execute([':id' => $flowId]);

    json_response(200, ['success' => true, 'data' => ['deleted_id' => $flowId]]);
}

try {
    $pdo = get_db();
    $user = require_auth();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ($method) {
        case 'GET':
            handle_get($pdo, $user);
            break;
        case 'POST':
            handle_post($pdo, $user);
            break;
        case 'PUT':
            handle_put($pdo, $user);
            break;
        case 'DELETE':
            handle_delete($pdo, $user);
            break;
        default:
            json_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'Server error occurred']);
}
