<?php
// ═════════════════════════════════════════════
//  轮盘赌局 · 后端 v3
//  匹配(文件创建/删除,零锁) + 游戏状态机 + 房间管理
// ═════════════════════════════════════════════
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

define('DATA_DIR', __DIR__ . '/../data/');
define('WAIT_PREFIX', 'roulette_wait_');     // 排队票前缀
define('ROOM_TTL', 180);
define('MATCH_TTL', 60);                      // 排队票 60 秒过期
define('IDLE_MAX', 30);

function safeRead($file) {
    $h = @fopen($file, 'r');
    if (!$h) return null;
    if (!flock($h, LOCK_SH)) { fclose($h); return null; }
    $data = stream_get_contents($h);
    flock($h, LOCK_UN); fclose($h);
    return $data ? json_decode($data, true) : null;
}
function safeWrite($file, $data) {
    $dir = dirname($file);
    if (!is_dir($dir)) { if (!mkdir($dir, 0777, true)) return false; }
    $tmp = $file . '.tmp';
    $h = @fopen($tmp, 'w');
    if (!$h) return false;
    if (!flock($h, LOCK_EX)) { fclose($h); return false; }
    fwrite($h, json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($h);
    flock($h, LOCK_UN); fclose($h);
    return rename($tmp, $file);
}
function genId($len = 8) {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $s = '';
    for ($i = 0; $i < $len; $i++) $s .= $chars[rand(0, strlen($chars) - 1)];
    return $s;
}

// ── 清理过期 ──
function cleanStale() {
    $cutoff = time() - max(ROOM_TTL, MATCH_TTL);
    // 房间文件
    foreach (glob(DATA_DIR . 'roulette_*.json') as $f) {
        // 跳过排队票
        if (strpos(basename($f), WAIT_PREFIX) === 0) continue;
        $r = safeRead($f);
        if (!$r || ($r['updated'] ?? 0) < $cutoff) @unlink($f);
    }
    // 排队票(超时直接删)
    foreach (glob(DATA_DIR . WAIT_PREFIX . '*.json') as $f) {
        $stat = @stat($f);
        if (!$stat || $stat['mtime'] < time() - MATCH_TTL) @unlink($f);
    }
}

$action = $_REQUEST['action'] ?? '';
$rid    = $_REQUEST['rid']    ?? '';
$peer   = intval($_REQUEST['peer'] ?? 0);

switch ($action) {

// ══════ 匹配(文件创建,纯原子,零锁) ══════
case 'match':
    cleanStale();
    // 扫描是否有等待中的票
    $waitFiles = glob(DATA_DIR . WAIT_PREFIX . '*.json');
    $waiter = null;
    foreach ($waitFiles as $wf) {
        $wt = safeRead($wf);
        if ($wt && isset($wt['rid']) && ($wt['time'] ?? 0) > time() - MATCH_TTL) {
            $waiter = $wt['rid'];
            @unlink($wf);          // 销毁排队票
            break;
        }
        @unlink($wf);              // 过期票删掉
    }
    if ($waiter) {
        // 有等待者 → 创建房间
        $rid = $waiter;
        $room = [
            'rid' => $rid, 'state' => 'playing', 'round' => 1, 'phase' => 'load',
            'loader' => 0, 'shooter' => 1, 'scores' => [0, 0],
            'loadAmount' => null, 'message' => null,
            'chambers' => [], 'chamberPicked' => null,
            'shootTarget' => null, 'result' => null, 'winner' => null,
            'updated' => time(), 'lastActive' => [time(), time()]
        ];
        safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
        echo json_encode(['ok' => true, 'state' => 'matched', 'rid' => $rid, 'peer' => 1]);
    } else {
        // 没人等 → 建自己的排队票
        $rid = genId();
        safeWrite(DATA_DIR . WAIT_PREFIX . "{$rid}.json", ['rid' => $rid, 'time' => time()]);
        echo json_encode(['ok' => true, 'state' => 'waiting', 'rid' => $rid, 'peer' => 0]);
    }
    exit;

// ══════ 匹配状态查询(等待方轮询) ══════
case 'match_status':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    // 房间已建?
    if (file_exists(DATA_DIR . "roulette_{$rid}.json")) {
        echo json_encode(['ok' => true, 'state' => 'matched', 'peer' => 0]);
        exit;
    }
    // 排队票还在?
    if (file_exists(DATA_DIR . WAIT_PREFIX . "{$rid}.json")) {
        $wt = safeRead(DATA_DIR . WAIT_PREFIX . "{$rid}.json");
        if ($wt && ($wt['time'] ?? 0) > time() - MATCH_TTL) {
            echo json_encode(['ok' => true, 'state' => 'waiting']);
            exit;
        }
        @unlink(DATA_DIR . WAIT_PREFIX . "{$rid}.json");
    }
    echo json_encode(['ok' => true, 'state' => 'expired']);
    exit;

// ══════ 取消匹配 ══════
case 'cancel_match':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    @unlink(DATA_DIR . WAIT_PREFIX . "{$rid}.json");
    echo json_encode(['ok' => true]);
    exit;

// ══════ 游戏轮询 ══════
case 'poll':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $room = safeRead(DATA_DIR . "roulette_{$rid}.json");
    if (!$room) { echo json_encode(['error' => 'room expired', 'state' => 'expired']); exit; }
    $p = $peer;
    $room['lastActive'][$p] = time();
    // 对手超时判负(整局,不逐轮加)
    if ($room['state'] === 'playing') {
        $opp = 1 - $p;
        $idle = time() - ($room['lastActive'][$opp] ?? $room['updated']);
        if ($idle > IDLE_MAX) {
            $room['state'] = 'game_over';
            $room['phase'] = 'game_over';
            $room['winner'] = $p;
            $room['result'] = ['winner' => $p, 'msg' => '对手长时间未响应,自动认输'];
            $room['updated'] = time();
        }
    }
    safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
    $out = [
        'state' => $room['state'],
        'phase' => $room['phase'],
        'round' => $room['round'],
        'scores' => $room['scores'],
        'loader' => $room['loader'] === $p,
        'shooter' => $room['shooter'] === $p,
        'myTurn' => ($room['phase'] === 'load' && $room['loader'] === $p) ||
                     ($room['phase'] === 'shoot' && $room['shooter'] === $p),
        // 开枪方在开枪阶段看不到弹数;其余可见
        'loadAmount' => ($room['shooter'] === $p && $room['phase'] === 'shoot') ? null : $room['loadAmount'],
        'message' => $room['message'],
        'shootTarget' => $room['shootTarget'],
        'result' => $room['result'],
        'winner' => $room['winner'],
        'chamberPicked' => $room['chamberPicked'],
        'chambers' => ($room['phase'] === 'result' || $room['state'] === 'game_over') ? $room['chambers'] : []
    ];
    echo json_encode($out);
    exit;

// ══════ 装弹 ══════
case 'load':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $room = safeRead(DATA_DIR . "roulette_{$rid}.json");
    if (!$room) { echo json_encode(['error' => 'room expired']); exit; }
    if ($room['loader'] !== $peer || $room['phase'] !== 'load') {
        echo json_encode(['error' => 'not your turn']);
        exit;
    }
    $room['loadAmount'] = max(0, min(6, intval($_REQUEST['n'] ?? 0)));
    $room['phase'] = 'shoot';
    $room['lastActive'][$peer] = time();
    $room['updated'] = time();
    safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
    echo json_encode(['ok' => true, 'phase' => 'shoot']);
    exit;

// ══════ 留话 ══════
case 'message':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $room = safeRead(DATA_DIR . "roulette_{$rid}.json");
    if (!$room) { echo json_encode(['error' => 'room expired']); exit; }
    if ($room['loader'] !== $peer) { echo json_encode(['error' => 'not your turn']); exit; }
    $room['message'] = mb_substr(trim($_REQUEST['msg'] ?? ''), 0, 30);
    $room['updated'] = time();
    safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
    echo json_encode(['ok' => true]);
    exit;

// ══════ 开枪 ══════
case 'shoot':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $room = safeRead(DATA_DIR . "roulette_{$rid}.json");
    if (!$room) { echo json_encode(['error' => 'room expired']); exit; }
    if ($room['shooter'] !== $peer || $room['phase'] !== 'shoot') {
        echo json_encode(['error' => 'not your turn']);
        exit;
    }
    $target = $_REQUEST['target'] ?? '';
    if ($target !== 'opponent' && $target !== 'self') {
        echo json_encode(['error' => 'invalid target']);
        exit;
    }
    $room['shootTarget'] = $target;
    $room['lastActive'][$peer] = time();
    // 生成膛位: 随机 N 颗
    $n = $room['loadAmount'];
    $chambers = array_fill(0, 6, false);
    if ($n > 0) {
        $positions = array_rand(array_fill(0, 6, true), $n);
        if (!is_array($positions)) $positions = [$positions];
        foreach ($positions as $pos) $chambers[$pos] = true;
    }
    $room['chambers'] = $chambers;
    $pick = rand(0, 5);
    $room['chamberPicked'] = $pick;
    $hit = $chambers[$pick];

    $shooter = $peer;
    $loader = 1 - $shooter;
    if ($target === 'self') {
        if ($hit) {
            $room['result'] = ['winner' => $loader, 'hit' => true, 'target' => 'self',
                'msg' => '朝自己开枪——中了。开枪人倒下,装弹人得分。'];
            $room['scores'][$loader]++;
        } else {
            $room['result'] = ['winner' => $shooter, 'hit' => false, 'target' => 'self',
                'msg' => '朝自己开枪——空膛!开枪人活下来了,得一分。'];
            $room['scores'][$shooter]++;
        }
    } else {
        if ($hit) {
            $room['result'] = ['winner' => $shooter, 'hit' => true, 'target' => 'opponent',
                'msg' => '朝对方开枪——中了。装弹人倒下,开枪人得分。'];
            $room['scores'][$shooter]++;
        } else {
            $room['result'] = ['winner' => $loader, 'hit' => false, 'target' => 'opponent',
                'msg' => '朝对方开枪——空膛!没能命中,装弹人得分。'];
            $room['scores'][$loader]++;
        }
    }
    $s = $room['scores'];
    if ($s[0] >= 2 || $s[1] >= 2) {
        $room['state'] = 'game_over';
        $room['phase'] = 'game_over';
        $room['winner'] = $s[0] >= 2 ? 0 : 1;
    } else {
        $room['phase'] = 'result';
    }
    $room['updated'] = time();
    safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
    echo json_encode(['ok' => true, 'phase' => $room['phase'], 'result' => $room['result'],
        'chambers' => $chambers, 'pick' => $pick, 'scores' => $room['scores'], 'winner' => $room['winner']]);
    exit;

// ══════ 下一局(幂等:已被对方推进则直接回当前状态) ══════
case 'next_round':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $room = safeRead(DATA_DIR . "roulette_{$rid}.json");
    if (!$room) { echo json_encode(['error' => 'room expired']); exit; }
    if ($room['phase'] !== 'result') {
        echo json_encode(['ok' => true, 'already' => true, 'state' => $room['state'],
            'phase' => $room['phase'], 'round' => $room['round'], 'loader' => $room['loader'],
            'scores' => $room['scores'], 'winner' => $room['winner']]);
        exit;
    }
    $room['round']++;
    $s = $room['scores'];
    if ($room['round'] > 3 || $s[0] >= 2 || $s[1] >= 2) {
        $room['state'] = 'game_over';
        $room['phase'] = 'game_over';
        $room['winner'] = $s[0] >= 2 ? 0 : 1;
    } else {
        // 第 3 局平手随机装弹人;否则交换
        if ($room['round'] === 3 && $s[0] === $s[1]) {
            $ld = rand(0, 1);
            $room['loader'] = $ld;
            $room['shooter'] = 1 - $ld;
        } else {
            $room['loader'] = 1 - $room['loader'];
            $room['shooter'] = 1 - $room['loader'];
        }
        $room['phase'] = 'load';
        $room['loadAmount'] = null;
        $room['message'] = null;
        $room['shootTarget'] = null;
        $room['result'] = null;
        $room['chambers'] = [];
        $room['chamberPicked'] = null;
    }
    $room['updated'] = time();
    safeWrite(DATA_DIR . "roulette_{$rid}.json", $room);
    echo json_encode(['ok' => true, 'state' => $room['state'], 'phase' => $room['phase'],
        'round' => $room['round'], 'loader' => $room['loader'], 'scores' => $room['scores']]);
    exit;

default:
    echo json_encode(['error' => 'unknown action']);
}
