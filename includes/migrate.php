<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/keygen.php';

/**
 * Create or verify all application database tables, columns, and seed accounts idempotently.
 */
function run_migrations(): array
{
    load_env_file(__DIR__ . '/../.env');

    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = getenv('DB_PORT') ?: '3306';
    $name = getenv('DB_NAME') ?: 'fragma';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASS') !== false ? (string) getenv('DB_PASS') : '';

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
    } catch (PDOException $e) {
        $rootDsn = "mysql:host={$host};port={$port};charset=utf8mb4";
        $pdoRoot = new PDO($rootDsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $pdoRoot->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
    }

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
            type ENUM('line-chart', 'value-card', 'gauge') NOT NULL,
            config JSON NOT NULL,
            position INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(120) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('superadmin', 'admin', 'user', 'operator') NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid CHAR(36) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS flows (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            project_id INT NULL,
            entity_id INT NULL,
            name VARCHAR(120) NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            blocks JSON NOT NULL,
            test_inputs JSON NULL,
            last_run_at TIMESTAMP NULL DEFAULT NULL,
            last_status VARCHAR(40) NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            INDEX idx_flows_entity (entity_id, enabled),
            INDEX idx_flows_project (project_id, enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS flow_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            flow_id INT NOT NULL,
            entity_id INT NOT NULL,
            status VARCHAR(40) NOT NULL,
            alerts JSON NULL,
            logs JSON NOT NULL,
            output_payload JSON NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            INDEX idx_flow_executed (flow_id, executed_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS flow_notifications (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            flow_id INT NOT NULL,
            entity_id INT NOT NULL,
            level VARCHAR(32) NOT NULL DEFAULT 'Warning',
            message TEXT NOT NULL,
            payload JSON NULL,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            INDEX idx_notif_project_read (project_id, is_read, created_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS flow_storage (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            flow_id INT NOT NULL,
            entity_id INT NOT NULL,
            data JSON NOT NULL,
            mode VARCHAR(24) NOT NULL DEFAULT 'all',
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            INDEX idx_storage_project_time (project_id, saved_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ];

    $executed = [];
    foreach ($queries as $sql) {
        $pdo->exec($sql);
        $executed[] = trim(substr($sql, 0, 50)) . '...';
    }

    $uuidColCheck = $pdo->query("SHOW COLUMNS FROM projects LIKE 'uuid'")->fetch();
    if (!$uuidColCheck) {
        $pdo->exec("ALTER TABLE projects ADD COLUMN uuid CHAR(36) NULL AFTER id");
    }

    $missingUuidRows = $pdo->query("SELECT id FROM projects WHERE uuid IS NULL OR uuid = ''")->fetchAll();
    if (!empty($missingUuidRows)) {
        $updUuidStmt = $pdo->prepare('UPDATE projects SET uuid = :uuid WHERE id = :id');
        foreach ($missingUuidRows as $prow) {
            $updUuidStmt->execute([
                ':uuid' => generate_uuid(),
                ':id'   => (int) $prow['id']
            ]);
        }
    }

    $uuidIdxCheck = $pdo->query("SHOW INDEX FROM projects WHERE Column_name = 'uuid' AND Non_unique = 0")->fetch();
    if (!$uuidIdxCheck) {
        $pdo->exec("ALTER TABLE projects MODIFY COLUMN uuid CHAR(36) NOT NULL, ADD UNIQUE INDEX idx_projects_uuid (uuid)");
    } else {
        $uuidColNow = $pdo->query("SHOW COLUMNS FROM projects LIKE 'uuid'")->fetch();
        if ($uuidColNow && ($uuidColNow['Null'] ?? '') === 'YES') {
            $pdo->exec("ALTER TABLE projects MODIFY COLUMN uuid CHAR(36) NOT NULL");
        }
    }

    $colCheck = $pdo->query("SHOW COLUMNS FROM entities LIKE 'user_id'")->fetch();
    if (!$colCheck) {
        $pdo->exec("ALTER TABLE entities ADD COLUMN user_id INT NULL AFTER id");
        $pdo->exec("ALTER TABLE entities ADD CONSTRAINT fk_entities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL");
    }

    $projectColCheck = $pdo->query("SHOW COLUMNS FROM entities LIKE 'project_id'")->fetch();
    if (!$projectColCheck) {
        $pdo->exec("ALTER TABLE entities ADD COLUMN project_id INT NULL AFTER user_id");
        $pdo->exec("ALTER TABLE entities ADD CONSTRAINT fk_entities_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL");
    }

    $notesColCheck = $pdo->query("SHOW COLUMNS FROM entities LIKE 'notes'")->fetch();
    if (!$notesColCheck) {
        $pdo->exec("ALTER TABLE entities ADD COLUMN notes VARCHAR(150) NULL AFTER name");
    }

    $pdo->exec("ALTER TABLE widgets MODIFY COLUMN type ENUM('line-chart', 'value-card', 'gauge') NOT NULL");

    $flowProjectColCheck = $pdo->query("SHOW COLUMNS FROM flows LIKE 'project_id'")->fetch();
    if (!$flowProjectColCheck) {
        $pdo->exec("ALTER TABLE flows ADD COLUMN project_id INT NULL AFTER user_id");
        $pdo->exec("ALTER TABLE flows ADD CONSTRAINT fk_flows_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE");
        $pdo->exec("ALTER TABLE flows ADD INDEX idx_flows_project (project_id, enabled)");
        $pdo->exec("UPDATE flows f INNER JOIN entities e ON f.entity_id = e.id SET f.project_id = e.project_id WHERE f.project_id IS NULL AND e.project_id IS NOT NULL");
    }

    $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('superadmin', 'admin', 'user', 'operator') NOT NULL DEFAULT 'user'");
    $pdo->exec("UPDATE users SET role = 'superadmin' WHERE role = 'admin' OR username = 'admin'");
    $pdo->exec("UPDATE users SET role = 'user' WHERE role = 'operator' OR username = 'operator'");

    $seedUsers = [
        ['admin', 'admin@gmail.com', 'admin123', 'superadmin'],
        ['user', 'user@gmail.com', 'user123', 'user'],
    ];

    $checkStmt = $pdo->prepare('SELECT id FROM users WHERE username = :username LIMIT 1');
    $insertStmt = $pdo->prepare('INSERT INTO users (username, email, password_hash, role) VALUES (:username, :email, :password_hash, :role)');

    foreach ($seedUsers as [$username, $email, $plainPassword, $role]) {
        $checkStmt->execute([':username' => $username]);
        if (!$checkStmt->fetch()) {
            $insertStmt->execute([
                ':username'      => $username,
                ':email'         => $email,
                ':password_hash' => password_hash($plainPassword, PASSWORD_BCRYPT),
                ':role'          => $role,
            ]);
        }
    }

    $pCount = (int) $pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn();
    if ($pCount === 0) {
        $superAdminId = (int) $pdo->query("SELECT id FROM users WHERE role = 'superadmin' OR username = 'superadmin' OR username = 'admin' LIMIT 1")->fetchColumn();
        $normalUserId = (int) $pdo->query("SELECT id FROM users WHERE role = 'user' OR username = 'user' OR username = 'operator' LIMIT 1")->fetchColumn();

        $pIns = $pdo->prepare('INSERT INTO projects (uuid, user_id, name, description) VALUES (:uuid, :uid, :name, :desc)');
        $pIns->execute([
            ':uuid' => generate_uuid(),
            ':uid'  => $superAdminId,
            ':name' => 'Industrial Fleet & City Telemetry',
            ':desc' => 'Central monitoring grid for industrial chillers, gateway bridges, and smart city weather nodes.'
        ]);
        $p1 = (int) $pdo->lastInsertId();

        $pIns->execute([
            ':uuid' => generate_uuid(),
            ':uid'  => $normalUserId ?: $superAdminId,
            ':name' => 'Greenhouse & Microclimate Node',
            ':desc' => 'Personal greenhouse environmental monitoring, soil moisture tracking, and ambient climate nodes.'
        ]);
        $p2 = (int) $pdo->lastInsertId();

        $pdo->exec("UPDATE entities SET project_id = {$p1} WHERE id IN (1, 3)");
        $pdo->exec("UPDATE entities SET project_id = {$p2} WHERE (id NOT IN (1, 3) OR project_id IS NULL)");
    }

    return [
        'database' => $name,
        'tables'   => ['projects', 'entities', 'data_points', 'widgets', 'users', 'flows', 'flow_logs', 'flow_notifications', 'flow_storage'],
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
    require_once __DIR__ . '/auth.php';
    require_role('superadmin', 'admin');
    try {
        $res = run_migrations();
        json_response(200, ['success' => true, 'data' => $res]);
    } catch (Throwable $e) {
        json_response(500, ['success' => false, 'error' => 'Migration failed']);
    }
    exit;
}
