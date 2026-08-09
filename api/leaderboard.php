<?php
// =============================================
//  霧雨魔法店 · 排行榜（需登录使用）
//  GET 查看 Top 20 / POST 提交分数（用户名取自账号）
//  冷却记录独立存储,榜单文件只含有效成绩;同一账号每榜仅保留最高分
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
$suffix = $game !== '' ? '_' . $game : '';
$file = __DIR__ . '/../data/leaderboard' . $suffix . '.json';
$cdFile = __DIR__ . '/../data/lb_cooldown' . $suffix . '.json';

function lb_read($f) {
    $d = file_exists($f) ? json_decode(file_get_contents($f), true) : [];
    if (!is_array($d)) $d = [];
    // 清理旧版混入榜单的冷却标记
    $d = array_values(array_filter($d, function ($e) {
        return is_array($e) && !isset($e['__cooldown__']);
    }));
    return $d;
}

function lb_write($f, $arr) {
    $tmp = $f . '.tmp';
    file_put_contents($tmp, json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    rename($tmp, $f);
}

// ═══════════ GET: 返回 Top 20 ═══════════
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $entries = lb_read($file);
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
$graze = max(0, intval($_POST['graze'] ?? 0));

// 校验
if ($score <= 0 || $score > 99999999) {
    http_response_code(400);
    echo json_encode(['error' => '分数无效']);
    exit;
}

// IP 频率限制（5 分钟冷却,独立文件记录,不污染榜单数据）
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$key = md5($ip);
$cds = file_exists($cdFile) ? json_decode(file_get_contents($cdFile), true) : [];
if (!is_array($cds)) $cds = [];
if (($cds[$key] ?? 0) > time()) {
    http_response_code(429);
    echo json_encode(['error' => '提交太频繁,请 5 分钟后再来']);
    exit;
}

$entries = lb_read($file);

// 同一账号每榜只保留最高分
$found = null;
$foundIdx = -1;
foreach ($entries as $i => $e) {
    if (isset($e['user_id']) && (int)$e['user_id'] === (int)$user['id']) {
        $found = $e;
        $foundIdx = $i;
        break;
    }
}
if ($found !== null && (int)$found['score'] >= $score) {
    // 旧分数更高:不覆盖,只刷新冷却并返回原排名
    $cds[$key] = time() + 300;
    lb_write($cdFile, $cds);
    echo json_encode(['ok' => true, 'rank' => $foundIdx + 1, 'total' => count($entries)]);
    exit;
}
if ($foundIdx >= 0) array_splice($entries, $foundIdx, 1);

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
usort($entries, function ($a, $b) {
    return $b['score'] - $a['score'];
});

// 最多保留 200 条
$entries = array_slice($entries, 0, 200);

// 原子写入
lb_write($file, $entries);

// 写入冷却标记（独立文件）
$cds[$key] = time() + 300;
lb_write($cdFile, $cds);

// 计算排名
$rank = 0;
foreach ($entries as $i => $e) {
    if (isset($e['id']) && $e['id'] === $entry['id']) {
        $rank = $i + 1;
        break;
    }
}

echo json_encode(['ok' => true, 'rank' => $rank, 'total' => count($entries)]);
