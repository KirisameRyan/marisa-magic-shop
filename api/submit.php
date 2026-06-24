<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$name = trim($_POST['name'] ?? '');
$source = trim($_POST['source'] ?? '');
$notes = trim($_POST['notes'] ?? '');

if (!$name || mb_strlen($name) > 50) {
    http_response_code(400);
    echo json_encode(['error' => '请填写角色名']);
    exit;
}

$file = __DIR__ . '/../data/suggestions.json';
$entries = file_exists($file)
    ? json_decode(file_get_contents($file), true)
    : [];

$entries[] = [
    'name'   => $name,
    'source' => $source ?: '未填写',
    'notes'  => $notes ?: '无',
    'time'   => date('Y-m-d H:i:s'),
    'ip'     => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
];

$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode($entries, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
rename($tmp, $file);

echo json_encode(['ok' => true, 'count' => count($entries)]);
