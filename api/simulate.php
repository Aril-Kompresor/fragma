<?php
/**
 * Internal API to inject simulated data points into all entities.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';

try {
    $pdo = get_db();

    $stmt = $pdo->query('SELECT id, fields FROM entities');
    $entities = $stmt->fetchAll();

    $inserted = 0;
    $simulatedData = [];

    foreach ($entities as $e) {
        $fields = json_decode((string) $e['fields'], true);
        if (!is_array($fields)) {
            $fields = [];
        }

        $payload = [];
        if (empty($fields)) {
            $payload = [
                'temperature' => round(20 + mt_rand(0, 1500) / 100, 2),
                'humidity'    => round(40 + mt_rand(0, 4000) / 100, 1),
                'battery'     => mt_rand(75, 100),
            ];
            $fields = [
                ['name' => 'temperature', 'type' => 'number', 'unit' => '°C'],
                ['name' => 'humidity', 'type' => 'number', 'unit' => '%'],
                ['name' => 'battery', 'type' => 'number', 'unit' => '%'],
            ];
            $upd = $pdo->prepare('UPDATE entities SET fields = ? WHERE id = ?');
            $upd->execute([json_encode($fields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $e['id']]);
        } else {
            foreach ($fields as $f) {
                $name = $f['name'];
                if ($f['type'] === 'number') {
                    $payload[$name] = round(20 + mt_rand(0, 6000) / 100, 2);
                } else {
                    $payload[$name] = 'Active';
                }
            }
        }

        $ins = $pdo->prepare('INSERT INTO data_points (entity_id, payload) VALUES (?, ?)');
        $ins->execute([$e['id'], json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
        $inserted++;

        $simulatedData[] = [
            'entity_id' => $e['id'],
            'payload'   => $payload,
        ];
    }

    json_response(200, [
        'success' => true,
        'message' => "Simulated data for $inserted entities.",
        'data'    => $simulatedData,
    ]);

} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
}
