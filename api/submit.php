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

// ── 内容过滤：拦截 URL / 脚本 / 代码注入 ──
$blockKeys = ['http://','https://','www.','@','<','>','script','onerror','onclick','javascript:','<img','<div','eval(','document.','window.','alert('];
foreach ($blockKeys as $w) {
    if (stripos($name, $w) !== false || stripos($source, $w) !== false || stripos($notes, $w) !== false) {
        http_response_code(400);
        echo json_encode(['error' => '包含非法字符']);
        exit;
    }
}

// ── 敏感词过滤（PHP 层第二道防线） ──
$sensitiveWords = ['林彪'];
foreach ($sensitiveWords as $sw) {
    if (mb_strpos($name, $sw) !== false) {
        http_response_code(400);
        echo json_encode(['error' => '包含敏感词']);
        exit;
    }
}

// ── 加载数据文件 ──
$file = __DIR__ . '/../data/suggestions.json';
$entries = file_exists($file)
    ? json_decode(file_get_contents($file), true)
    : [];

// ── IP 频率限制（5 分钟冷却） ──
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$cooldownKey = 'cooldown_' . md5($ip);
$cooldown = ($entries['__meta__'][$cooldownKey] ?? 0);
if ($cooldown > time()) {
    http_response_code(429);
    echo json_encode(['error' => '提交太频繁，请 5 分钟后再来']);
    exit;
}

// ── 单日总量上限 ──
$todayKey = 'daily_' . date('Y-m-d');
$todayCount = ($entries['__meta__'][$todayKey] ?? 0);
if ($todayCount > 200) {
    http_response_code(429);
    echo json_encode(['error' => '今日建议已达上限，请明天再来']);
    exit;
}

// ── 剥离 meta 数据，追加新条目 ──
$meta = $entries['__meta__'] ?? [];
unset($entries['__meta__']);
$dataCount = count($entries);

$entries[] = [
    'name'   => $name,
    'source' => $source ?: '未填写',
    'notes'  => $notes ?: '无',
    'time'   => date('Y-m-d H:i:s')
];

// ── 文件大小上限：超出 5000 条裁掉最旧的 ──
if (count($entries) > 5000) {
    array_shift($entries);
}

// ── 写回 meta ──
$meta[$cooldownKey] = time() + 300;
$meta[$todayKey] = $todayCount + 1;
$entries['__meta__'] = $meta;

$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode($entries, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
rename($tmp, $file);

echo json_encode(['ok' => true, 'count' => $dataCount]);
