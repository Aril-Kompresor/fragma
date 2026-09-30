<?php
/**
 * Database schema migration script for creating entities, data_points, and widgets tables.
 */

declare(strict_types=1);

/**
 * Execute schema migrations and establish database tables.
 */
function run_migrations(): array
{
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = getenv('DB_PORT') ?: '3306';
    $name = getenv('DB_NAME') ?: 'fragma';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASS') !== false ? (string) getenv('DB_PASS') : '';

    $rootDsn = "mysql:host={$host};port={$port};charset=utf8mb4";
    $pdoRoot = new PDO($rootDsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    $pdoRoot->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    $queries = [
        "CREATE TABLE IF NOT EXISTS entities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            api_key VARCHAR(64) NOT NULL UNIQUE,
            fields JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS data_points (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            entity_id INT NOT NULL,
            payload JSON NOT NULL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            INDEX idx_entity_time (entity_id, recorded_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS widgets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_id INT NOT NULL,
            type ENUM('line-chart', 'value-card') NOT NULL,
            config JSON NOT NULL,
            position INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ];

    $executed = [];
    foreach ($queries as $sql) {
        $pdo->exec($sql);
        $executed[] = trim(substr($sql, 0, 50)) . '...';
    }

    return [
        'database' => $name,
        'tables'   => ['entities', 'data_points', 'widgets'],
        'status'   => 'Migration completed successfully'
    ];
}

if (php_sapi_name() === 'cli') {
    try {
        $res = run_migrations();
        echo "[MIGRATION OK] " . $res['status'] . PHP_EOL;
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, "[MIGRATION ERROR] " . $e->getMessage() . PHP_EOL);
        exit(1);
    }
} else {
    header('Content-Type: application/json; charset=utf-8');
    try {
        $res = run_migrations();
        http_response_code(200);
        echo json_encode(['success' => true, 'data' => $res], JSON_PRETTY_PRINT);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}
