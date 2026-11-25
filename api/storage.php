<?php
declare(strict_types=1);

/**
 * Automation Storage CRUD API endpoint for records explicitly persisted by Otomasi Save nodes.
 */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

/**
 * Resolve and authorize the active project ID for the authenticated user.
 */
function resolve_authorized_storage_project(PDO $pdo, array $user, array $body = []): int
{
    $projectId = resolve_requested_project_id($pdo, $_GET, $body) ?? 0;
    if ($projectId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing project identifier']);
    }
    if (!can_manage_project($pdo, $projectId, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have access to this project']);
    }
    return $projectId;
}

/**
 * Format a flow_storage database row into a clean API record array.
 */
function format_storage_row(array $row): array
{
    $decoded = json_decode((string) $row['data'], true);
    return [
        'id' => (int) $row['id'],
        'project_id' => (int) $row['project_id'],
        'flow_id' => (int) $row['flow_id'],
        'flow_name' => (string) ($row['flow_name'] ?? 'Workflow'),
        'entity_id' => (int) $row['entity_id'],
        'entity_name' => (string) ($row['entity_name'] ?? 'Perangkat'),
        'mode' => (string) ($row['mode'] ?? 'all'),
        'data' => is_array($decoded) ? $decoded : [],
        'saved_at' => (string) $row['saved_at'],
    ];
}

/**
 * Handle GET requests for listing project automation storage entries and summary counters.
 */
function handle_storage_get(PDO $pdo, array $user): void
{
    $projectId = resolve_authorized_storage_project($pdo, $user);

    $statsStmt = $pdo->prepare('
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT flow_id) AS flows_count,
               COUNT(DISTINCT entity_id) AS devices_count,
               MAX(saved_at) AS last_saved_at
        FROM flow_storage
        WHERE project_id = :project_id
    ');
    $statsStmt->execute([':project_id' => $projectId]);
    $rawStats = $statsStmt->fetch() ?: [];

    $where = ['s.project_id = :project_id'];
    $params = [':project_id' => $projectId];

    $flowId = isset($_GET['flow_id']) ? (int) $_GET['flow_id'] : 0;
    if ($flowId > 0) {
        $where[] = 's.flow_id = :flow_id';
        $params[':flow_id'] = $flowId;
    }

    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    if ($entityId > 0) {
        $where[] = 's.entity_id = :entity_id';
        $params[':entity_id'] = $entityId;
    }

    $mode = trim((string) ($_GET['mode'] ?? ''));
    if ($mode !== '' && strtolower($mode) !== 'all_modes') {
        $where[] = 's.mode = :mode';
        $params[':mode'] = $mode;
    }

    $search = trim((string) ($_GET['q'] ?? ''));
    if ($search !== '') {
        $where[] = '(CAST(s.data AS CHAR) LIKE :q OR f.name LIKE :q2 OR e.name LIKE :q3)';
        $like = '%' . $search . '%';
        $params[':q'] = $like;
        $params[':q2'] = $like;
        $params[':q3'] = $like;
    }

    $limit = isset($_GET['limit']) ? max(1, min(300, (int) $_GET['limit'])) : 100;
    $whereSql = implode(' AND ', $where);

    $sql = "
        SELECT s.id, s.project_id, s.flow_id, s.entity_id, s.data, s.mode, s.saved_at,
               f.name AS flow_name, e.name AS entity_name
        FROM flow_storage s
        INNER JOIN flows f ON f.id = s.flow_id
        INNER JOIN entities e ON e.id = s.entity_id
        WHERE {$whereSql}
        ORDER BY s.saved_at DESC, s.id DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $items = [];
    foreach ($rows as $row) {
        $items[] = format_storage_row($row);
    }

    $flowStmt = $pdo->prepare('SELECT id, name FROM flows WHERE project_id = :project_id ORDER BY id ASC');
    $flowStmt->execute([':project_id' => $projectId]);
    $flows = [];
    foreach ($flowStmt->fetchAll() as $f) {
        $flows[] = ['id' => (int) $f['id'], 'name' => (string) $f['name']];
    }

    $devStmt = $pdo->prepare('SELECT id, name FROM entities WHERE project_id = :project_id ORDER BY name ASC');
    $devStmt->execute([':project_id' => $projectId]);
    $devices = [];
    foreach ($devStmt->fetchAll() as $d) {
        $devices[] = ['id' => (int) $d['id'], 'name' => (string) $d['name']];
    }

    json_response(200, [
        'success' => true,
        'data' => [
            'items' => $items,
            'filters' => [
                'flows' => $flows,
                'devices' => $devices,
            ],
            'stats' => [
                'total' => (int) ($rawStats['total'] ?? 0),
                'flows_count' => (int) ($rawStats['flows_count'] ?? 0),
                'devices_count' => (int) ($rawStats['devices_count'] ?? 0),
                'last_saved_at' => $rawStats['last_saved_at'] ?? null,
            ],
        ],
    ]);
}

/**
 * Handle DELETE requests to remove a storage record or clear all storage records in a project.
 */
function handle_storage_delete(PDO $pdo, array $user): void
{
    $projectId = resolve_authorized_storage_project($pdo, $user);

    if (isset($_GET['all']) && ($_GET['all'] === '1' || $_GET['all'] === 'true')) {
        $stmt = $pdo->prepare('DELETE FROM flow_storage WHERE project_id = :project_id');
        $stmt->execute([':project_id' => $projectId]);
        json_response(200, [
            'success' => true,
            'data' => ['deleted_count' => $stmt->rowCount()],
        ]);
    }

    $recordId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($recordId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing storage record id']);
    }

    $stmt = $pdo->prepare('DELETE FROM flow_storage WHERE id = :id AND project_id = :project_id');
    $stmt->execute([':id' => $recordId, ':project_id' => $projectId]);
    if ($stmt->rowCount() === 0) {
        json_response(404, ['success' => false, 'error' => 'Storage record not found']);
    }

    json_response(200, [
        'success' => true,
        'data' => ['deleted_id' => $recordId],
    ]);
}

try {
    $pdo = get_db();
    $user = require_auth();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ($method) {
        case 'GET':
            handle_storage_get($pdo, $user);
            break;
        case 'DELETE':
            handle_storage_delete($pdo, $user);
            break;
        default:
            json_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'Internal server error']);
}
