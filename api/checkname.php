<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['safe' => true]);
    exit;
}

$name = trim($_POST['name'] ?? '');
if (!$name) { echo json_encode(['safe' => true]); exit; }

// 清洗：只保留中文、英文、数字
$clean = preg_replace('/[^\x{4e00}-\x{9fa5}a-zA-Z0-9]/u', '', $name);
if (!$clean || mb_strlen($clean) < 2) { echo json_encode(['safe' => true]); exit; }

// 加载敏感词库（从 JS 文件中提取 JSON 数组并建立 hash 表）
$words = [];
$jsFile = __DIR__ . '/../js/sensitive-words.js';
if (file_exists($jsFile)) {
    $content = file_get_contents($jsFile);
    if (preg_match('/\[([\s\S]*)\]/', $content, $m)) {
        $arr = @json_decode('[' . $m[1] . ']', true);
        if (is_array($arr)) {
            // array_flip 做 O(1) 查找
            $words = array_flip($arr);
        }
    }
}

// 子串滑窗匹配
$len = mb_strlen($clean);
$found = false;
for ($i = 0; $i < $len && !$found; $i++) {
    for ($j = $i + 2; $j <= $len && ($j - $i) <= 10 && !$found; $j++) {
        $sub = mb_substr($clean, $i, $j - $i);
        if (isset($words[$sub])) { $found = true; }
    }
}

echo json_encode(['safe' => !$found]);
