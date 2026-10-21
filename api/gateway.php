<?php
/**
 * Mock REST API endpoint representing an industrial IoT Edge Gateway cluster.
 * Provides configurable response states for testing loading, empty, and error conditions.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/response.php';

handle_cors_preflight();

$scenario = isset($_GET['scenario']) ? strtolower(trim((string) $_GET['scenario'])) : 'normal';
$delay = isset($_GET['delay']) ? (int) $_GET['delay'] : 0;

if ($scenario === 'delay' || $delay > 0) {
    $seconds = $delay > 0 ? min($delay, 5) : 2;
    sleep($seconds);
}

if ($scenario === 'error') {
    json_response(500, [
        'success' => false,
        'status' => 'error',
        'code' => 'GATEWAY_CLUSTER_TIMEOUT',
        'message' => 'Kesalahan Internal 500: Server edge gateway cluster gagal merespons permintaan telemetri.',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'details' => [
            'gateway_id' => 'FRAGMA-GW-EDGE-01',
            'error_origin' => 'Upstream Microcontroller Bus Fault',
            'suggested_action' => 'Periksa konektivitas jaringan transmisi atau ulangi permintaan.'
        ]
    ]);
}

if ($scenario === 'empty') {
    json_response(200, [
        'success' => true,
        'status' => 'empty',
        'gateway_id' => 'FRAGMA-GW-EDGE-01',
        'cluster_name' => 'Edge Gateway Telemetry Cluster',
        'message' => 'Cluster terhubung namun tidak ada node telemetri yang terdaftar dalam antrean aktif.',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'total_nodes' => 0,
        'nodes' => []
    ]);
}

$nowIso = gmdate('Y-m-d\TH:i:s\Z');
$nodes = [
    [
        'node_id' => 'node-101',
        'name' => 'Rack Server Air Inflow',
        'type' => 'temperature',
        'value' => round(23.5 + (mt_rand(-10, 15) / 10), 1),
        'unit' => '°C',
        'status' => 'optimal',
        'updated_at' => $nowIso
    ],
    [
        'node_id' => 'node-102',
        'name' => 'Rack Exhaust Outflow',
        'type' => 'temperature',
        'value' => round(31.8 + (mt_rand(-15, 20) / 10), 1),
        'unit' => '°C',
        'status' => 'optimal',
        'updated_at' => $nowIso
    ],
    [
        'node_id' => 'node-103',
        'name' => 'UPS Primary Line Power',
        'type' => 'power',
        'value' => round(1410.0 + (mt_rand(-30, 45)), 1),
        'unit' => 'W',
        'status' => 'optimal',
        'updated_at' => $nowIso
    ],
    [
        'node_id' => 'node-104',
        'name' => 'Chiller Coolant Flow',
        'type' => 'flow_rate',
        'value' => round(42.5 + (mt_rand(-10, 10) / 10), 1),
        'unit' => 'L/min',
        'status' => 'optimal',
        'updated_at' => $nowIso
    ]
];

json_response(200, [
    'success' => true,
    'status' => 'operational',
    'gateway_id' => 'FRAGMA-GW-EDGE-01',
    'cluster_name' => 'Edge Gateway Telemetry Cluster',
    'message' => 'Klaster edge gateway beroperasi secara nominal.',
    'timestamp' => $nowIso,
    'total_nodes' => count($nodes),
    'nodes' => $nodes
]);
