<?php
declare(strict_types=1);

/**
 * Automation Notifications CRUD API endpoint for alerts triggered by Otomasi Peringatan nodes.
 */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

/**
 * Resolve and authorize the active project ID for the authenticated user.
 */
function resolve_authorized_notifications_project(PDO $pdo, array $user, array $body = []): int
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
 * Format a flow_notifications database row into a clean API item array.
 */
function format_notification_row(array $row): array
{
    $payload = $row['payload'] !== null ? json_decode((string) $row['payload'], true) : [];
    return [
        'id' => (int) $row['id'],
        'project_id' => (int) $row['project_id'],
        'flow_id' => (int) $row['flow_id'],
        'flow_name' => (string) ($row['flow_name'] ?? 'Workflow'),
        'entity_id' => (int) $row['entity_id'],
        'entity_name' => (string) ($row['entity_name'] ?? 'Perangkat'),
        'level' => (string) $row['level'],
        'message' => (string) $row['message'],
        'payload' => is_array($payload) ? $payload : [],
        'is_read' => (bool) $row['is_read'],
        'created_at' => (string) $row['created_at'],
    ];
}

/**
 * Handle GET requests for listing project notifications and summary counters.
 */
function handle_notifications_get(PDO $pdo, array $user): void
{
    $projectId = resolve_authorized_notifications_project($pdo, $user);

    $statsStmt = $pdo->prepare('
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
               SUM(CASE WHEN LOWER(level) = "critical" THEN 1 ELSE 0 END) AS critical_count,
               SUM(CASE WHEN LOWER(level) = "warning" THEN 1 ELSE 0 END) AS warning_count,
               SUM(CASE WHEN LOWER(level) = "info" THEN 1 ELSE 0 END) AS info_count
        FROM flow_notifications
        WHERE project_id = :project_id
    ');
    $statsStmt->execute([':project_id' => $projectId]);
    $rawStats = $statsStmt->fetch() ?: [];

    $where = ['n.project_id = :project_id'];
    $params = [':project_id' => $projectId];

    $level = trim((string) ($_GET['level'] ?? ''));
    if ($level !== '' && strtolower($level) !== 'all') {
        $where[] = 'LOWER(n.level) = :level';
        $params[':level'] = strtolower($level);
    }

    if (isset($_GET['unread']) && ($_GET['unread'] === '1' || $_GET['unread'] === 'true')) {
        $where[] = 'n.is_read = 0';
    }

    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    if ($entityId > 0) {
        $where[] = 'n.entity_id = :entity_id';
        $params[':entity_id'] = $entityId;
    }

    $search = trim((string) ($_GET['q'] ?? ''));
    if ($search !== '') {
        $where[] = '(n.message LIKE :q OR f.name LIKE :q2 OR e.name LIKE :q3)';
        $like = '%' . $search . '%';
        $params[':q'] = $like;
        $params[':q2'] = $like;
        $params[':q3'] = $like;
    }

    $limit = isset($_GET['limit']) ? max(1, min(200, (int) $_GET['limit'])) : 100;
    $whereSql = implode(' AND ', $where);

    $sql = "
        SELECT n.id, n.project_id, n.flow_id, n.entity_id, n.level, n.message, n.payload, n.is_read, n.created_at,
               f.name AS flow_name, e.name AS entity_name
        FROM flow_notifications n
        INNER JOIN flows f ON f.id = n.flow_id
        INNER JOIN entities e ON e.id = n.entity_id
        WHERE {$whereSql}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $items = [];
    foreach ($rows as $row) {
        $items[] = format_notification_row($row);
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
            'devices' => $devices,
            'stats' => [
                'total' => (int) ($rawStats['total'] ?? 0),
                'unread' => (int) ($rawStats['unread'] ?? 0),
                'critical' => (int) ($rawStats['critical_count'] ?? 0),
                'warning' => (int) ($rawStats['warning_count'] ?? 0),
                'info' => (int) ($rawStats['info_count'] ?? 0),
            ],
        ],
    ]);
}

/**
 * Handle PUT/PATCH requests to mark individual or all project notifications as read or unread.
 */
function handle_notifications_put(PDO $pdo, array $user): void
{
    $body = get_json_input();
    $projectId = resolve_authorized_notifications_project($pdo, $user, $body);
    $action = trim((string) ($body['action'] ?? ''));

    if ($action === 'mark_all_read') {
        $stmt = $pdo->prepare('UPDATE flow_notifications SET is_read = 1 WHERE project_id = :project_id AND is_read = 0');
        $stmt->execute([':project_id' => $projectId]);
        json_response(200, [
            'success' => true,
            'data' => ['updated_count' => $stmt->rowCount()],
        ]);
    }

    $notifId = isset($_GET['id']) ? (int) $_GET['id'] : (int) ($body['id'] ?? 0);
    if ($notifId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing notification id']);
    }

    $isRead = array_key_exists('is_read', $body) ? ((bool) $body['is_read'] ? 1 : 0) : 1;
    $stmt = $pdo->prepare('UPDATE flow_notifications SET is_read = :is_read WHERE id = :id AND project_id = :project_id');
    $stmt->execute([
        ':is_read' => $isRead,
        ':id' => $notifId,
        ':project_id' => $projectId,
    ]);

    if ($stmt->rowCount() === 0) {
        $chk = $pdo->prepare('SELECT id FROM flow_notifications WHERE id = :id AND project_id = :project_id LIMIT 1');
        $chk->execute([':id' => $notifId, ':project_id' => $projectId]);
        if (!$chk->fetch()) {
            json_response(404, ['success' => false, 'error' => 'Notification not found']);
        }
    }

    json_response(200, [
        'success' => true,
        'data' => ['id' => $notifId, 'is_read' => (bool) $isRead],
    ]);
}

/**
 * Handle DELETE requests to remove a notification or clear all notifications in a project.
 */
function handle_notifications_delete(PDO $pdo, array $user): void
{
    $projectId = resolve_authorized_notifications_project($pdo, $user);

    if (isset($_GET['all']) && ($_GET['all'] === '1' || $_GET['all'] === 'true')) {
        $stmt = $pdo->prepare('DELETE FROM flow_notifications WHERE project_id = :project_id');
        $stmt->execute([':project_id' => $projectId]);
        json_response(200, [
            'success' => true,
            'data' => ['deleted_count' => $stmt->rowCount()],
        ]);
    }

    $notifId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($notifId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing notification id']);
    }

    $stmt = $pdo->prepare('DELETE FROM flow_notifications WHERE id = :id AND project_id = :project_id');
    $stmt->execute([':id' => $notifId, ':project_id' => $projectId]);
    if ($stmt->rowCount() === 0) {
        json_response(404, ['success' => false, 'error' => 'Notification not found']);
    }

    json_response(200, [
        'success' => true,
        'data' => ['deleted_id' => $notifId],
    ]);
}

try {
    $pdo = get_db();
    $user = require_auth();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ($method) {
        case 'GET':
            handle_notifications_get($pdo, $user);
            break;
        case 'PUT':
        case 'PATCH':
            handle_notifications_put($pdo, $user);
            break;
        case 'DELETE':
            handle_notifications_delete($pdo, $user);
            break;
        default:
            json_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    json_response(500, ['success' => false, 'error' => 'Internal server error']);
}
