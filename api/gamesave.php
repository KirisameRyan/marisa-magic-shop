<?php
// =============================================
//  雾雨魔法店 · 游戏云端存档接口
//  每个玩家每游戏存一份 JSON(整包存档, 以 updated_at 决定新旧)
//  action: load(读) / save(写)
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

$user = mms_require_user();
$uid  = (int)$user['id'];
$db   = mms_db();

$db->exec(
    "CREATE TABLE IF NOT EXISTS game_saves (
        user_id    INTEGER NOT NULL,
        game       TEXT NOT NULL,
        data       TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, game)
    )"
);
$db->exec('CREATE INDEX IF NOT EXISTS idx_gamesave_game ON game_saves(game)');

$game = strtolower(preg_replace('/[^a-z0-9_-]/', '', (string)($_REQUEST['game'] ?? '')));
if ($game === '' || strlen($game) > 20) mms_json_error(400, 'game 参数无效');

$action = strtolower(trim($_REQUEST['action'] ?? 'load'));

switch ($action) {

    case 'load': {
        $st = $db->prepare('SELECT data, updated_at FROM game_saves WHERE user_id = ? AND game = ?');
        $st->execute([$uid, $game]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) mms_json_ok(['data' => null]);
        $data = json_decode($row['data'], true);
        if (!is_array($data)) $data = null;
        mms_json_ok(['data' => $data, 'updated_at' => (int)$row['updated_at']]);
        break;
    }

    case 'save': {
        $raw = $_REQUEST['data'] ?? '';
        $data = json_decode((string)$raw, true);
        if (!is_array($data)) mms_json_error(400, '存档格式无效');
        // 大小上限保护(约 512KB)
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        if (strlen($json) > 524288) mms_json_error(413, '存档过大');
        $now = time();
        // 客户端可带 updated_at, 服务端拒绝旧包覆盖新包
        $clientAt = isset($_REQUEST['updated_at']) ? (int)$_REQUEST['updated_at'] : 0;
        $st = $db->prepare('SELECT updated_at FROM game_saves WHERE user_id = ? AND game = ?');
        $st->execute([$uid, $game]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row && $clientAt > 0 && (int)$row['updated_at'] > $clientAt) {
            mms_json_error(409, '云端有更新的存档');
        }
        $st = $db->prepare(
            'INSERT INTO game_saves (user_id, game, data, updated_at) VALUES (?,?,?,?)
             ON CONFLICT(user_id, game) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
        );
        $st->execute([$uid, $game, $json, $now]);
        mms_json_ok(['updated_at' => $now]);
        break;
    }

    default:
        mms_json_error(400, '未知 action');
}
