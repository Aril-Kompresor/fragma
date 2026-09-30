<?php
/**
 * Internal API to inject simulated data points into all entities.
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/response.php';

try {
    $pdo = get_db();

    // Fetch all entities
    $stmt = $pdo->query('SELECT id, fields FROM entities');
    $entities = $stmt->fetchAll();

    $inserted = 0;
    $simulatedData = [];

    foreach ($entities as $e) {
        $fields = json_decode((string) $e['fields'], true);
        if (!is_array($fields) || empty($fields)) {
            continue;
        }

        $payload = [];
        foreach ($fields as $f) {
            $name = $f['name'];
            if ($f['type'] === 'number') {
                // Generate a random reading with slight variation
                $payload[$name] = rand(20, 80) + (rand(0, 99) / 100);
            } else {
                $payload[$name] = "Status_" . rand(1, 5);
            }
        }

        $ins = $pdo->prepare('INSERT INTO data_points (entity_id, payload) VALUES (?, ?)');
        $ins->execute([$e['id'], json_encode($payload)]);
        $inserted++;
        
        $simulatedData[] = [
            'entity_id' => $e['id'],
            'payload' => $payload
        ];
    }

    json_response(200, [
        'success' => true,
        'message' => "Simulated data for $inserted entities.",
        'data' => $simulatedData
    ]);

} catch (PDOException $e) {
    json_response(500, ['success' => false, 'error' => 'Database error occurred']);
}
