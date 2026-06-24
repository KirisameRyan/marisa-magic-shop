<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$egg = trim($_POST['egg'] ?? '');
if (!$egg || mb_strlen($egg) > 50) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid egg name']);
    exit;
}

$file = __DIR__ . '/../data/counters.json';
$data = file_exists($file)
    ? json_decode(file_get_contents($file), true)
    : ['eggs' => [], 'total' => 0, 'daily' => []];

$data['eggs'][$egg] = ($data['eggs'][$egg] ?? 0) + 1;
$data['total'] += 1;
$today = date('Y-m-d');
$data['daily'][$today] = ($data['daily'][$today] ?? 0) + 1;

$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
rename($tmp, $file);

echo json_encode([
    'count' => $data['eggs'][$egg],
    'total' => $data['total'],
    'egg'   => $egg
]);
