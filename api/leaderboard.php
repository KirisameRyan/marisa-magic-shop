<?php
// =============================================
//  霧雨魔法店 · 排行榜（需登录使用）
//  GET 查看 Top 20 / POST 提交分数（用户名取自账号）
// =============================================

require __DIR__ . '/auth-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── 登录墙：查看/提交都必须登录 ──
$user = mms_require_user();

// ── 数据文件（可选 game 参数 → 各游戏独立榜单，默认保持原跑酷榜）──
$game = '';
if (isset($_REQUEST['game'])) {
    $g = strtolower(preg_replace('/[^a-z0-9_-]/', '', (string)$_REQUEST['game']));
    if ($g !== '' && strlen($g) <= 20) $game = $g;
}
$file = __DIR__ . '/../data/leaderboard' . ($game !== '' ? '_' . $game : '') . '.json';

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

$score = intval($_POST['score'] ?? 0);
$graze = intval($_POST['graze'] ?? 0);

// 校验
if ($score <= 0 || $score > 99999999) {
    http_response_code(400);
    echo json_encode(['error' => '分数无效']);
    exit;
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

// 追加条目（用户名来自账号，user_id 绑定身份）
$entry = [
    'id'      => uniqid('', true),
    'user_id' => (int)$user['id'],
    'name'    => $user['username'],
    'score'   => $score,
    'graze'   => $graze,
    'time'    => date('Y-m-d H:i:s')
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
