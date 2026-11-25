#!/usr/bin/env bash
set -euo pipefail

php -r '
$host = getenv("DB_HOST") ?: "db";
$port = getenv("DB_PORT") ?: "3306";
$name = getenv("DB_NAME") ?: "fragma";
$user = getenv("DB_USER") ?: "fragma";
$pass = getenv("DB_PASS") !== false ? (string) getenv("DB_PASS") : "";
for ($i = 0; $i < 30; $i++) {
    try {
        new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass);
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, "Waiting for MySQL ({$host}:{$port})...\n");
        sleep(2);
    }
}
fwrite(STDERR, "Timed out waiting for MySQL.\n");
exit(1);
'

php /var/www/html/includes/migrate.php

exec apache2-foreground

