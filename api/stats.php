<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$file = __DIR__ . '/../data/counters.json';
if (!file_exists($file)) {
    echo json_encode(['discovered' => 0, 'totalTriggers' => 0, 'todayTriggers' => 0]);
    exit;
}

$data = json_decode(file_get_contents($file), true);
$today = date('Y-m-d');

$eggs = $data['eggs'] ?? [];
$discovered = 0;
foreach ($eggs as $k => $v) {
    if (strpos($k, '_') === false) $discovered++;
}

echo json_encode([
    'discovered'    => $discovered,
    'totalTriggers' => $data['total'] ?? 0,
    'todayTriggers' => ($data['daily'] ?? [])[$today] ?? 0
]);
