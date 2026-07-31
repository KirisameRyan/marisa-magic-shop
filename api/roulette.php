<?php
// ═════════════════════════════════════════════
//  轮盘赌局 · 后端 v2
//  匹配队列 + 游戏状态机 + 房间管理
//  v2 修复: 匹配断裂 / 匹配竞态 / next_round 幂等 / 逃跑判负
// ═════════════════════════════════════════════
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

define('DATA_DIR', __DIR__ . '/../data/');
define('MATCH_FILE', DATA_DIR . 'roulette_match.json');
define('ROOM_TTL', 180);     // 房间闲置 3 分钟过期
define('MATCH_TTL', 30);     // 匹配等待 30 秒
define('IDLE_MAX', 30);      // 对手 30 秒无响应判负

// ── 基础读写 ──
function safeRead($file) {
    $h = @fopen($file, 'r');
    if (!$h) return null;
    if (!flock($h, LOCK_SH)) { fclose($h); return null; }
    $data = stream_get_contents($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $data ? json_decode($data, true) : null;
}
function safeWrite($file, $data) {
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $tmp = $file . '.tmp';
    $h = @fopen($tmp, 'w');
    if (!$h) return false;
    if (!flock($h, LOCK_EX)) { fclose($h); return false; }
    fwrite($h, json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    return rename($tmp, $file);
}
// ── 加锁读改写事务(防匹配竞态) ──
function lockedUpdate($file, $fn) {
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $h = @fopen($file, 'c+');
    if (!$h) return [null, 'lock_fail'];
    flock($h, LOCK_EX);
    $raw = stream_get_contents($h);
    $data = $raw ? json_decode($raw, true) : null;
    $out = $fn($data);              // 回调返回 [新数据, 返回值]
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, json_encode($out[0], JSON_UNESCAPED_UNICODE));
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $out[1];
}
function genId($len = 8) {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $s = '';
    for ($i = 0; $i < $len; $i++) $s .= $chars[rand(0, strlen($chars) - 1)];
    return $s;
}
function cleanRooms() {
    $files = glob(DATA_DIR . 'roulette_*.json');
    $cutoff = time() - ROOM_TTL;
    foreach ($files as $f) {
        $r = safeRead($f);
        if (!$r || ($r['updated'] ?? 0) < $cutoff) @unlink($f);
    }
}

$action = $_REQUEST['action'] ?? '';
$rid    = $_REQUEST['rid']    ?? '';
$peer   = intval($_REQUEST['peer'] ?? 0);

switch ($action) {

// ══════ 匹配(加锁事务) ══════
case 'match':
    cleanRooms();
    $result = lockedUpdate(MATCH_FILE, function($match) {
        if (!is_array($match)) $match = [];
        // 清理过期等待票
        $match = array_values(array_filter($match, function($m) {
            return ($m['time'] ?? 0) > time() - MATCH_TTL;
        }));
        if (!empty($match)) {
            $waiter = array_shift($match);
            // 房间号 = 等待者的票号(双方自然共享同一 ID)
            return [$match, ['matched', $waiter['rid']]];
        }
        $rid = genId();
        $match[] = ['rid' => $rid, 'time' => time()];
        return [$match, ['waiting', $rid]];
    });
    if ($result[0] === 'matched') {
        $rid = $result[1];
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
        echo json_encode(['ok' => true, 'state' => 'waiting', 'rid' => $result[1], 'peer' => 0]);
    }
    exit;

// ══════ 匹配状态查询(等待方轮询) ══════
case 'match_status':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    $roomFile = DATA_DIR . "roulette_{$rid}.json";
    if (file_exists($roomFile)) {
        echo json_encode(['ok' => true, 'state' => 'matched', 'peer' => 0]);
        exit;
    }
    $match = safeRead(MATCH_FILE) ?: [];
    foreach ($match as $m) {
        if (($m['rid'] ?? '') === $rid) { echo json_encode(['ok' => true, 'state' => 'waiting']); exit; }
    }
    echo json_encode(['ok' => true, 'state' => 'expired']);
    exit;

// ══════ 取消匹配 ══════
case 'cancel_match':
    if (!$rid) { echo json_encode(['error' => 'no rid']); exit; }
    lockedUpdate(MATCH_FILE, function($match) use ($rid) {
        if (!is_array($match)) $match = [];
        $match = array_values(array_filter($match, function($m) use ($rid) {
            return ($m['rid'] ?? '') !== $rid;
        }));
        return [$match, true];
    });
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
