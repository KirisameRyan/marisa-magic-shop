<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$egg = trim($_GET['egg'] ?? '');
$prefix = trim($_GET['prefix'] ?? '');

$file = __DIR__ . '/../data/counters.json';
if (!file_exists($file)) {
    echo json_encode($prefix ? ['items' => [], 'total' => 0] : ['count' => 0]);
    exit;
}

$data = json_decode(file_get_contents($file), true);
$eggs = $data['eggs'] ?? [];

// 前缀模式：返回所有匹配前缀的 egg 及其计数
if ($prefix) {
    $items = [];
    $total = 0;
    foreach ($eggs as $key => $cnt) {
        if (strpos($key, $prefix) === 0) {
            $items[$key] = $cnt;
            $total += $cnt;
        }
    }
    echo json_encode(['items' => $items, 'total' => $total]);
    exit;
}

// 单 egg 模式
if (!$egg) { echo json_encode(['count' => 0]); exit; }
echo json_encode(['count' => $eggs[$egg] ?? 0]);
