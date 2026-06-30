<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// ── 数据文件 ──
$file = __DIR__ . '/../data/leaderboard.json';

// ═══════════ GET: 返回 Top 20 ═══════════
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($file)) {
        echo json_encode([]);
        exit;
    }
    $entries = json_decode(file_get_contents($file), true);
    if (!is_array($entries)) $entries = [];
    // 只返回前20，剥离 id
    $out = array_slice($entries, 0, 20);
    foreach ($out as &$e) unset($e['id']);
    echo json_encode($out);
    exit;
}

// ═══════════ POST: 提交分数 ═══════════
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$name  = trim($_POST['name'] ?? '');
$score = intval($_POST['score'] ?? 0);
$graze = intval($_POST['graze'] ?? 0);

// 校验
if (!$name || mb_strlen($name) > 20) {
    http_response_code(400);
    echo json_encode(['error' => '昵称 1-20 字']);
    exit;
}
if ($score <= 0 || $score > 99999999) {
    http_response_code(400);
    echo json_encode(['error' => '分数无效']);
    exit;
}

// 内容过滤
$blockKeys = ['http://','https://','www.','@','<','>','script','onerror','onclick','javascript:','<img','<div','eval(','document.','window.','alert('];
foreach ($blockKeys as $w) {
    if (stripos($name, $w) !== false) {
        http_response_code(400);
        echo json_encode(['error' => '包含非法字符']);
        exit;
    }
}

// 敏感词检测（与 checkname.php 相同逻辑）
$clean = preg_replace('/[^\x{4e00}-\x{9fa5}a-zA-Z0-9]/u', '', $name);
if ($clean && mb_strlen($clean) >= 2) {
    $words = [];
    $jsFile = __DIR__ . '/../js/sensitive-words.js';
    if (file_exists($jsFile)) {
        $content = file_get_contents($jsFile);
        if (preg_match('/\[([\s\S]*)\]/', $content, $m)) {
            $arr = @json_decode('[' . $m[1] . ']', true);
            if (is_array($arr)) { $words = array_flip($arr); }
        }
    }
    $len = mb_strlen($clean);
    for ($i = 0; $i < $len; $i++) {
        for ($j = $i + 2; $j <= $len && ($j - $i) <= 10; $j++) {
            if (isset($words[mb_substr($clean, $i, $j - $i)])) { $name = '匿名玩家'; break 2; }
        }
    }
}

// 加载数据
$entries = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
if (!is_array($entries)) $entries = [];

// IP 频率限制（5 分钟冷却）
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$cooldownKey = 'cooldown_' . md5($ip);
$first = $entries[0] ?? null;
if ($first && isset($first['__cooldown__']) && ($first['__cooldown__'][$cooldownKey] ?? 0) > time()) {
    http_response_code(429);
    echo json_encode(['error' => '提交太频繁，请 5 分钟后再来']);
    exit;
}

// 追加条目
$entry = [
    'id'    => uniqid('', true),
    'name'  => $name,
    'score' => $score,
    'graze' => $graze,
    'time'  => date('Y-m-d H:i:s')
];
$entries[] = $entry;

// 按分数降序
usort($entries, function($a, $b) {
    return $b['score'] - $a['score'];
});

// 最多保留 200 条
$entries = array_slice($entries, 0, 200);

// 写入冷却标记
$entries[0]['__cooldown__'] = [$cooldownKey => time() + 300];

// 原子写入
$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode($entries, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
rename($tmp, $file);

// 计算排名
$rank = 0;
foreach ($entries as $i => $e) {
    if (isset($e['id']) && $e['id'] === $entry['id']) {
        $rank = $i + 1;
        break;
    }
}

echo json_encode(['ok' => true, 'rank' => $rank, 'total' => count($entries) - (isset($entries[0]['__cooldown__']) ? 1 : 0)]);
