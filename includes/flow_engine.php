<?php
declare(strict_types=1);

/**
 * Server-side Flow execution engine supporting both 2D node graphs and legacy block arrays.
 */

/**
 * Parse a raw block value into boolean, number, or trimmed string.
 */
function flow_parse_smart_value($raw)
{
    $trimmed = trim((string) ($raw ?? ''));
    if ($trimmed === '') {
        return '';
    }
    if ($trimmed === 'true') {
        return true;
    }
    if ($trimmed === 'false') {
        return false;
    }
    if (is_numeric($trimmed)) {
        return strpos($trimmed, '.') !== false ? (float) $trimmed : (int) $trimmed;
    }
    return trim($trimmed, "\"'");
}

/**
 * Evaluate a comparison operator between two values.
 */
function flow_compare_values($left, string $operator, $right): bool
{
    $lVal = flow_parse_smart_value($left);
    $rVal = flow_parse_smart_value($right);

    if ($operator === '>') {
        return (float) $lVal > (float) $rVal;
    }
    if ($operator === '<') {
        return (float) $lVal < (float) $rVal;
    }
    if ($operator === '>=') {
        return (float) $lVal >= (float) $rVal;
    }
    if ($operator === '<=') {
        return (float) $lVal <= (float) $rVal;
    }
    if ($operator === '==') {
        return (string) $lVal === (string) $rVal;
    }
    if ($operator === '!=') {
        return (string) $lVal !== (string) $rVal;
    }
    return false;
}

/**
 * Execute a single node against mutable flow execution state and return branch route ('out', 'true', 'false', or 'stop').
 */
function execute_single_flow_node(array $node, array &$state, ?int $entityId): string
{
    if ($state['stopped']) {
        return 'stop';
    }

    $type = (string) ($node['type'] ?? '');

    if ($type === 'input') {
        $scope = (string) ($node['scope'] ?? 'all');
        if ($scope === 'specific' && !empty($node['entity_id']) && $entityId !== null && (int) $node['entity_id'] !== $entityId) {
            $state['skipped'] = true;
            $state['stopped'] = true;
            return 'stop';
        }
        if ($scope === 'multiple') {
            $allowedIds = array_map('intval', is_array($node['entity_ids'] ?? null) ? $node['entity_ids'] : []);
            if ($entityId !== null && !in_array($entityId, $allowedIds, true)) {
                $state['skipped'] = true;
                $state['stopped'] = true;
                return 'stop';
            }
        }
        $filterField = trim((string) ($node['filter_field'] ?? ''));
        if ($filterField !== '') {
            $filterOp = (string) ($node['filter_operator'] ?? 'exists');
            $filterVal = $node['filter_value'] ?? '';
            $hasField = array_key_exists($filterField, $state['payload']);
            if (!$hasField || ($filterOp !== 'exists' && !flow_compare_values($state['payload'][$filterField], $filterOp, $filterVal))) {
                $state['skipped'] = true;
                $state['stopped'] = true;
                return 'stop';
            }
        }
        return 'out';
    }

    if ($type === 'require') {
        $field = (string) ($node['field'] ?? '');
        $operator = (string) ($node['operator'] ?? '>=');
        $expected = $node['value'] ?? '';
        $hasField = $field !== '' && array_key_exists($field, $state['payload']);
        $actual = $hasField ? $state['payload'][$field] : null;
        $passed = $hasField && flow_compare_values($actual, $operator, $expected);

        if ($passed) {
            $state['logs'][] = [
                'type' => 'info',
                'text' => "REQUIRE {$field} {$operator} {$expected}: passed ({$actual})",
            ];
            return 'out';
        }
        $state['stopped'] = true;
        $actualLabel = $hasField ? (string) $actual : 'missing';
        $state['logs'][] = [
            'type' => 'alert',
            'text' => "REQUIRE failed ({$field} is {$actualLabel}). Flow stopped.",
        ];
        return 'stop';
    }

    if ($type === 'set') {
        $key = trim((string) ($node['field'] ?? ''));
        $val = flow_parse_smart_value($node['value'] ?? '');
        if ($key !== '') {
            $state['payload'][$key] = $val;
        }
        $valLabel = is_bool($val) ? ($val ? 'true' : 'false') : (string) $val;
        $state['logs'][] = [
            'type' => 'info',
            'text' => "SET {$key} = {$valLabel}",
        ];
        return 'out';
    }

    if ($type === 'math') {
        $targetKey = trim((string) ($node['target'] ?? ''));
        $sourceKey = trim((string) ($node['source'] ?? ''));
        $operator = (string) ($node['operator'] ?? '+');
        $sourceVal = isset($state['payload'][$sourceKey]) ? (float) $state['payload'][$sourceKey] : 0.0;
        $operandVal = (float) ($node['operand'] ?? 0);
        $result = $sourceVal;

        if ($operator === '+') {
            $result = $sourceVal + $operandVal;
        } elseif ($operator === '-') {
            $result = $sourceVal - $operandVal;
        } elseif ($operator === '*') {
            $result = $sourceVal * $operandVal;
        } elseif ($operator === '/') {
            $result = $operandVal != 0.0 ? $sourceVal / $operandVal : 0.0;
        } elseif ($operator === '%') {
            $result = $operandVal != 0.0 ? fmod($sourceVal, $operandVal) : 0.0;
        }

        $rounded = round($result, 2);
        if ($targetKey !== '') {
            $state['payload'][$targetKey] = $rounded;
        }
        $state['logs'][] = [
            'type' => 'info',
            'text' => "MATH {$targetKey} = {$sourceVal} {$operator} {$operandVal} -> {$rounded}",
        ];
        return 'out';
    }

    if ($type === 'if') {
        $field = (string) ($node['field'] ?? '');
        $operator = (string) ($node['operator'] ?? '>');
        $expected = $node['value'] ?? '';
        $hasField = $field !== '' && array_key_exists($field, $state['payload']);
        $actual = $hasField ? $state['payload'][$field] : null;
        $matched = $hasField && flow_compare_values($actual, $operator, $expected);
        $actualLabel = $hasField ? (string) $actual : 'missing';
        $state['logs'][] = [
            'type' => 'info',
            'text' => "IF {$field} ({$actualLabel}) {$operator} {$expected} -> " . ($matched ? 'true' : 'false'),
        ];
        return $matched ? 'true' : 'false';
    }

    if ($type === 'alert') {
        $level = (string) ($node['level'] ?? 'Warning');
        $message = (string) ($node['message'] ?? '');
        $state['has_alert'] = true;
        $state['alerts'][] = [
            'level' => $level,
            'message' => $message,
        ];
        $state['logs'][] = [
            'type' => 'alert',
            'text' => '[' . strtoupper($level) . '] ' . $message,
        ];
        return 'out';
    }

    if ($type === 'debug') {
        $label = trim((string) ($node['label'] ?? ($node['message'] ?? 'Debug')));
        $mode = (string) ($node['mode'] ?? 'all');
        $targetField = trim((string) ($node['field'] ?? ''));
        $snapshot = ($mode === 'field' && $targetField !== '')
            ? [$targetField => $state['payload'][$targetField] ?? null]
            : $state['payload'];
        $includeResp = !isset($node['include_in_response']) || (bool) $node['include_in_response'];
        if ($includeResp) {
            $state['debugs'][] = [
                'label' => $label !== '' ? $label : 'Debug',
                'data'  => $snapshot,
            ];
        }
        $state['logs'][] = [
            'type' => 'info',
            'text' => 'DEBUG [' . ($label !== '' ? $label : 'Debug') . ']: ' . json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ];
        return 'out';
    }

    if ($type === 'save') {
        $mode = (string) ($node['mode'] ?? 'all');
        $savePayload = $state['payload'];
        if ($mode === 'exclude') {
            $rawExclude = (string) ($node['exclude_fields'] ?? '');
            $excludeList = array_filter(array_map('trim', explode(',', $rawExclude)), static fn(string $v): bool => $v !== '');
            foreach ($excludeList as $exKey) {
                unset($savePayload[$exKey]);
                unset($state['payload'][$exKey]);
            }
        }
        $state['saved'] = true;
        $state['save_entries'][] = [
            'mode' => $mode,
            'data' => $savePayload,
        ];
        $state['logs'][] = [
            'type' => 'success',
            'text' => 'SAVE: Payload stored to storage',
        ];
        return 'out';
    }

    return 'out';
}

/**
 * Traverse a 2D node graph ({ nodes, edges }) starting from its Input node(s).
 */
function execute_flow_graph(array $graph, array &$state, ?int $entityId): void
{
    $nodes = isset($graph['nodes']) && is_array($graph['nodes']) ? $graph['nodes'] : [];
    $edges = isset($graph['edges']) && is_array($graph['edges']) ? $graph['edges'] : [];
    if (empty($nodes)) {
        return;
    }

    $nodeMap = [];
    $incomingCounts = [];
    foreach ($nodes as $n) {
        if (!is_array($n) || empty($n['id'])) {
            continue;
        }
        $nid = (string) $n['id'];
        $nodeMap[$nid] = $n;
        $incomingCounts[$nid] = 0;
    }

    $adj = [];
    foreach ($edges as $edge) {
        if (!is_array($edge) || empty($edge['from']) || empty($edge['to'])) {
            continue;
        }
        $fromId = (string) $edge['from'];
        $toId = (string) $edge['to'];
        if (!isset($nodeMap[$fromId]) || !isset($nodeMap[$toId])) {
            continue;
        }
        $port = strtolower((string) ($edge['fromPort'] ?? 'out'));
        $adj[$fromId][$port][] = $toId;
        $incomingCounts[$toId] = ($incomingCounts[$toId] ?? 0) + 1;
    }

    $queue = [];
    foreach ($nodeMap as $nid => $n) {
        if (($n['type'] ?? '') === 'input') {
            $queue[] = $nid;
        }
    }
    if (empty($queue)) {
        foreach ($incomingCounts as $nid => $cnt) {
            if ($cnt === 0) {
                $queue[] = $nid;
            }
        }
    }
    if (empty($queue)) {
        $firstKey = array_key_first($nodeMap);
        if ($firstKey !== null) {
            $queue[] = $firstKey;
        }
    }

    $maxSteps = max(20, count($nodeMap) * 4);
    $steps = 0;
    $executedIds = [];

    while (!empty($queue) && !$state['stopped'] && $steps < $maxSteps) {
        $currentId = array_shift($queue);
        if (isset($executedIds[$currentId])) {
            continue;
        }
        $executedIds[$currentId] = true;
        $steps++;

        $currentNode = $nodeMap[$currentId];
        $route = execute_single_flow_node($currentNode, $state, $entityId);
        if ($route === 'stop' || $state['stopped']) {
            break;
        }

        $nextIds = [];
        if (($currentNode['type'] ?? '') === 'if') {
            $branchEdges = $adj[$currentId][$route] ?? [];
            foreach ($branchEdges as $tid) {
                $nextIds[] = $tid;
            }
        } else {
            foreach (($adj[$currentId] ?? []) as $portTargets) {
                foreach ($portTargets as $tid) {
                    $nextIds[] = $tid;
                }
            }
        }

        foreach ($nextIds as $tid) {
            if (!isset($executedIds[$tid])) {
                $queue[] = $tid;
            }
        }
    }
}

/**
 * Execute either a 2D graph payload or a legacy flat array of logic blocks.
 */
function execute_flow_blocks(array $blocks, array $payload, ?int $entityId = null): array
{
    $state = [
        'payload' => $payload,
        'logs' => [
            ['type' => 'info', 'text' => 'Received data with ' . count($payload) . ' field(s)'],
        ],
        'alerts' => [],
        'debugs' => [],
        'save_entries' => [],
        'stopped' => false,
        'skipped' => false,
        'has_alert' => false,
        'saved' => false,
    ];

    if (isset($blocks['nodes']) && is_array($blocks['nodes'])) {
        execute_flow_graph($blocks, $state, $entityId);
    } else {
        $runner = function (array $block) use (&$state, &$runner, $entityId): void {
            if ($state['stopped']) {
                return;
            }
            $route = execute_single_flow_node($block, $state, $entityId);
            if (($block['type'] ?? '') === 'if' && $route === 'true') {
                $children = isset($block['children']) && is_array($block['children']) ? $block['children'] : [];
                foreach ($children as $child) {
                    if (is_array($child)) {
                        $runner($child);
                    }
                }
            }
        };

        foreach ($blocks as $block) {
            if (is_array($block)) {
                $runner($block);
            }
        }
    }

    $status = 'completed';
    if ($state['stopped']) {
        $status = 'stopped';
    } elseif ($state['has_alert']) {
        $status = 'alert';
    }

    return [
        'status' => $status,
        'payload' => $state['payload'],
        'alerts' => $state['alerts'],
        'debugs' => $state['debugs'],
        'save_entries' => $state['save_entries'],
        'logs' => $state['logs'],
        'stopped' => $state['stopped'],
        'skipped' => $state['skipped'],
    ];
}

/**
 * Find and execute all active flows matching an incoming entity telemetry payload.
 */
function run_entity_flows(PDO $pdo, int $entityId, ?int $entityUserId, array $payload): array
{
    $epStmt = $pdo->prepare('SELECT project_id FROM entities WHERE id = :id LIMIT 1');
    $epStmt->execute([':id' => $entityId]);
    $epRow = $epStmt->fetch();
    $entityProjectId = ($epRow && !empty($epRow['project_id'])) ? (int) $epRow['project_id'] : null;

    if ($entityProjectId !== null) {
        $stmt = $pdo->prepare('
            SELECT id, project_id, name, blocks
            FROM flows
            WHERE enabled = 1
              AND (entity_id = :entity_id OR (entity_id IS NULL AND project_id = :project_id))
            ORDER BY id ASC
        ');
        $stmt->execute([
            ':entity_id' => $entityId,
            ':project_id' => $entityProjectId,
        ]);
    } elseif ($entityUserId !== null) {
        $stmt = $pdo->prepare('
            SELECT id, project_id, name, blocks
            FROM flows
            WHERE enabled = 1
              AND (entity_id = :entity_id OR (entity_id IS NULL AND project_id IS NULL AND user_id = :user_id))
            ORDER BY id ASC
        ');
        $stmt->execute([
            ':entity_id' => $entityId,
            ':user_id' => $entityUserId,
        ]);
    } else {
        $stmt = $pdo->prepare('
            SELECT id, project_id, name, blocks
            FROM flows
            WHERE enabled = 1
              AND entity_id = :entity_id
            ORDER BY id ASC
        ');
        $stmt->execute([':entity_id' => $entityId]);
    }

    $flows = $stmt->fetchAll();
    if (!$flows) {
        return [
            'payload' => $payload,
            'executions' => [],
        ];
    }

    $currentPayload = $payload;
    $executions = [];
    $insertLogStmt = $pdo->prepare('
        INSERT INTO flow_logs (flow_id, entity_id, status, alerts, logs, output_payload)
        VALUES (:flow_id, :entity_id, :status, :alerts, :logs, :output_payload)
    ');
    $insertNotifStmt = $pdo->prepare('
        INSERT INTO flow_notifications (project_id, flow_id, entity_id, level, message, payload)
        VALUES (:project_id, :flow_id, :entity_id, :level, :message, :payload)
    ');
    $insertStorageStmt = $pdo->prepare('
        INSERT INTO flow_storage (project_id, flow_id, entity_id, data, mode)
        VALUES (:project_id, :flow_id, :entity_id, :data, :mode)
    ');
    $updateFlowStmt = $pdo->prepare('
        UPDATE flows
        SET last_run_at = CURRENT_TIMESTAMP, last_status = :status
        WHERE id = :id
    ');

    foreach ($flows as $flowRow) {
        $blocks = json_decode((string) $flowRow['blocks'], true);
        if (!is_array($blocks)) {
            continue;
        }

        $result = execute_flow_blocks($blocks, $currentPayload, $entityId);
        if (!empty($result['skipped'])) {
            continue;
        }
        $currentPayload = $result['payload'];
        $flowId = (int) $flowRow['id'];
        $flowProjectId = !empty($flowRow['project_id']) ? (int) $flowRow['project_id'] : $entityProjectId;

        $insertLogStmt->execute([
            ':flow_id' => $flowId,
            ':entity_id' => $entityId,
            ':status' => $result['status'],
            ':alerts' => json_encode($result['alerts'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':logs' => json_encode($result['logs'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':output_payload' => json_encode($result['payload'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);

        if ($flowProjectId !== null && $flowProjectId > 0) {
            if (!empty($result['alerts']) && is_array($result['alerts'])) {
                $encodedPayload = json_encode($currentPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                foreach ($result['alerts'] as $alertItem) {
                    $insertNotifStmt->execute([
                        ':project_id' => $flowProjectId,
                        ':flow_id' => $flowId,
                        ':entity_id' => $entityId,
                        ':level' => mb_substr((string) ($alertItem['level'] ?? 'Warning'), 0, 32),
                        ':message' => (string) ($alertItem['message'] ?? ''),
                        ':payload' => $encodedPayload,
                    ]);
                }
            }

            if (!empty($result['save_entries']) && is_array($result['save_entries'])) {
                foreach ($result['save_entries'] as $saveItem) {
                    $insertStorageStmt->execute([
                        ':project_id' => $flowProjectId,
                        ':flow_id' => $flowId,
                        ':entity_id' => $entityId,
                        ':data' => json_encode($saveItem['data'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                        ':mode' => mb_substr((string) ($saveItem['mode'] ?? 'all'), 0, 24),
                    ]);
                }
            }
        }

        $updateFlowStmt->execute([
            ':status' => $result['status'],
            ':id' => $flowId,
        ]);

        $executions[] = [
            'flow_id' => $flowId,
            'flow_name' => $flowRow['name'],
            'status' => $result['status'],
            'alerts' => $result['alerts'],
            'debug' => $result['debugs'],
            'saved_count' => is_array($result['save_entries'] ?? null) ? count($result['save_entries']) : 0,
        ];
    }

    return [
        'payload' => $currentPayload,
        'executions' => $executions,
    ];
}
