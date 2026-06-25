<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$egg = trim($_GET['egg'] ?? '');
if (!$egg) { echo json_encode(['count' => 0]); exit; }

$file = __DIR__ . '/../data/counters.json';
if (!file_exists($file)) { echo json_encode(['count' => 0]); exit; }

$data = json_decode(file_get_contents($file), true);
echo json_encode(['count' => $data['eggs'][$egg] ?? 0]);
