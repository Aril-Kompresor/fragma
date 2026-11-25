<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/auth.php';

handle_cors_preflight();

function handle_get(PDO $pdo): void
{
    $user = require_auth();
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    $projectId = resolve_requested_project_id($pdo, $_GET) ?? 0;
    $isSuper = is_superadmin($user);

    $whereClauses = [];
    $params = [];

    if ($entityId > 0) {
        $whereClauses[] = 'w.entity_id = :entity_id';
        $params[':entity_id'] = $entityId;
    }

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
        SELECT w.id, w.entity_id, w.type, w.config, w.position, w.created_at, e.name as entity_name, e.project_id, p.uuid AS project_uuid
        FROM widgets w
        JOIN entities e ON w.entity_id = e.id
        LEFT JOIN projects p ON p.id = e.project_id
        {$whereSql}
        ORDER BY w.position ASC, w.id ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $widgets = [];
    foreach ($rows as $row) {
        $cfg = json_decode((string) $row['config'], true);
        $row['config'] = is_array($cfg) ? $cfg : [];
        $row['position'] = (int) $row['position'];
        $row['project_id'] = $row['project_id'] !== null ? (int) $row['project_id'] : null;
        $row['project_uuid'] = $row['project_uuid'] !== null ? (string) $row['project_uuid'] : null;
        $widgets[] = $row;
    }

    json_response(200, ['success' => true, 'data' => $widgets]);
}

function handle_post(PDO $pdo): void
{
    $user = require_auth();
    $entityId = isset($_GET['entity_id']) ? (int) $_GET['entity_id'] : 0;
    $body = get_json_input();

    if ($entityId <= 0 && isset($body['entity_id'])) {
        $entityId = (int) $body['entity_id'];
    }

    if ($entityId <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid entity_id']);
    }

    $checkStmt = $pdo->prepare('SELECT id, project_id FROM entities WHERE id = :id LIMIT 1');
    $checkStmt->execute([':id' => $entityId]);
    $entityRow = $checkStmt->fetch();
    if (!$entityRow) {
        json_response(404, ['success' => false, 'error' => 'Entity not found']);
    }

    if (!can_manage_entity($pdo, $entityId, $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to add widgets to this entity']);
    }

    $type = isset($body['type']) ? trim((string) $body['type']) : '';
    if (!in_array($type, ['line-chart', 'value-card', 'gauge'], true)) {
        json_response(400, ['success' => false, 'error' => "Widget type must be 'line-chart', 'value-card', or 'gauge'"]);
    }

    $config = isset($body['config']) && is_array($body['config']) ? $body['config'] : [];
    if (empty($config['field'])) {
        json_response(400, ['success' => false, 'error' => "Widget config requires a target 'field'"]);
    }

    if (!isset($config['layout']) || !is_array($config['layout']) || !isset($config['layout']['x'])) {
        if (!empty($entityRow['project_id'])) {
            $existingStmt = $pdo->prepare('SELECT w.config, w.type FROM widgets w JOIN entities e ON w.entity_id = e.id WHERE e.project_id = :pid');
            $existingStmt->execute([':pid' => (int) $entityRow['project_id']]);
        } else {
            $existingStmt = $pdo->prepare('SELECT config, type FROM widgets WHERE entity_id = :eid');
            $existingStmt->execute([':eid' => $entityId]);
        }
        $existingRows = $existingStmt->fetchAll();
        $existingBoxes = [];
        foreach ($existingRows as $er) {
            $ec = json_decode((string) $er['config'], true);
            if (is_array($ec) && isset($ec['layout']) && is_array($ec['layout'])) {
                $el = $ec['layout'];
                $existingBoxes[] = [
                    'x' => (int) ($el['x'] ?? 0),
                    'y' => (int) ($el['y'] ?? 0),
                    'w' => (int) ($el['w'] ?? ($er['type'] === 'line-chart' ? 460 : 280)),
                    'h' => (int) ($el['h'] ?? ($er['type'] === 'line-chart' ? 300 : 180)),
                ];
            }
        }

        $newW = $type === 'line-chart' ? 460 : 280;
        $newH = $type === 'line-chart' ? 300 : 180;
        $snap = 20;
        $gap = 20;
        $startX = 40;
        $startY = 20;
        $containerW = 1200;
        $foundLayout = null;

        for ($y = $startY; $y <= 4000; $y += $snap) {
            for ($x = $startX; $x + $newW <= $containerW; $x += $snap) {
                $collision = false;
                foreach ($existingBoxes as $b) {
                    if (!($x + $newW + $gap <= $b['x'] || $x >= $b['x'] + $b['w'] + $gap || $y + $newH + $gap <= $b['y'] || $y >= $b['y'] + $b['h'] + $gap)) {
                        $collision = true;
                        break;
                    }
                }
                if (!$collision) {
                    $foundLayout = ['x' => $x, 'y' => $y, 'w' => $newW, 'h' => $newH];
                    break 2;
                }
            }
        }

        if ($foundLayout === null) {
            $maxBottom = $startY;
            foreach ($existingBoxes as $b) {
                if ($b['y'] + $b['h'] > $maxBottom) {
                    $maxBottom = $b['y'] + $b['h'];
                }
            }
            $fallbackY = (int) ceil(($maxBottom + $gap) / $snap) * $snap;
            $foundLayout = ['x' => $startX, 'y' => $fallbackY, 'w' => $newW, 'h' => $newH];
        }

        $config['layout'] = $foundLayout;
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

function handle_put(PDO $pdo): void
{
    $user = require_auth();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid widget ID']);
    }

    $ownerStmt = $pdo->prepare('SELECT w.entity_id, e.project_id FROM widgets w JOIN entities e ON w.entity_id = e.id WHERE w.id = :id LIMIT 1');
    $ownerStmt->execute([':id' => $id]);
    $widgetRow = $ownerStmt->fetch();
    if (!$widgetRow) {
        json_response(404, ['success' => false, 'error' => 'Widget not found']);
    }
    if (!can_manage_entity($pdo, (int) $widgetRow['entity_id'], $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to update this widget']);
    }

    $body = get_json_input();
    $updates = [];
    $params = [':id' => $id];

    if (isset($body['type'])) {
        $type = trim((string) $body['type']);
        if (!in_array($type, ['line-chart', 'value-card', 'gauge'], true)) {
            json_response(400, ['success' => false, 'error' => "Widget type must be 'line-chart', 'value-card', or 'gauge'"]);
        }
        $updates[] = 'type = :type';
        $params[':type'] = $type;
    }

    if (isset($body['config'])) {
        if (!is_array($body['config'])) {
            json_response(400, ['success' => false, 'error' => "Widget 'config' must be an object"]);
        }

        if (isset($body['config']['layout']) && is_array($body['config']['layout'])) {
            $newLayout = $body['config']['layout'];
            $targetX = (int) ($newLayout['x'] ?? 0);
            $targetY = (int) ($newLayout['y'] ?? 0);
            $targetW = (int) ($newLayout['w'] ?? 280);
            $targetH = (int) ($newLayout['h'] ?? 180);

            if (!empty($widgetRow['project_id'])) {
                $checkStmt = $pdo->prepare('SELECT w.id, w.config, w.type FROM widgets w JOIN entities e ON w.entity_id = e.id WHERE w.id != :id AND e.project_id = :pid');
                $checkStmt->execute([':id' => $id, ':pid' => (int) $widgetRow['project_id']]);
            } else {
                $checkStmt = $pdo->prepare('SELECT id, config, type FROM widgets WHERE id != :id AND entity_id = :eid');
                $checkStmt->execute([':id' => $id, ':eid' => (int) $widgetRow['entity_id']]);
            }
            $otherWidgets = $checkStmt->fetchAll();

            foreach ($otherWidgets as $ow) {
                $oc = json_decode((string) $ow['config'], true);
                if (is_array($oc) && isset($oc['layout']) && is_array($oc['layout'])) {
                    $ol = $oc['layout'];
                    $ox = (int) ($ol['x'] ?? 0);
                    $oy = (int) ($ol['y'] ?? 0);
                    $ow_w = (int) ($ol['w'] ?? ($ow['type'] === 'line-chart' ? 460 : 280));
                    $ow_h = (int) ($ol['h'] ?? ($ow['type'] === 'line-chart' ? 300 : 180));

                    $overlapX = $targetX < $ox + $ow_w && $targetX + $targetW > $ox;
                    $overlapY = $targetY < $oy + $ow_h && $targetY + $targetH > $oy;

                    if ($overlapX && $overlapY) {
                        json_response(409, ['success' => false, 'error' => 'Position overlaps with an existing widget']);
                    }
                }
            }
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

function handle_delete(PDO $pdo): void
{
    $user = require_auth();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        json_response(400, ['success' => false, 'error' => 'Missing or invalid widget ID']);
    }

    $ownerStmt = $pdo->prepare('SELECT entity_id FROM widgets WHERE id = :id LIMIT 1');
    $ownerStmt->execute([':id' => $id]);
    $widgetRow = $ownerStmt->fetch();
    if (!$widgetRow) {
        json_response(404, ['success' => false, 'error' => 'Widget not found']);
    }
    if (!can_manage_entity($pdo, (int) $widgetRow['entity_id'], $user)) {
        json_response(403, ['success' => false, 'error' => 'Forbidden: you do not have permission to delete this widget']);
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
