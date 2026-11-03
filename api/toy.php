<?php
// Toy-only game identities and sessions. These sessions cannot log into the website.
require __DIR__ . '/auth-lib.php';
header('Content-Type: application/json; charset=utf-8');
mms_cors(true);
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
$db=mms_db();
$db->exec('CREATE TABLE IF NOT EXISTS toy_players (id INTEGER PRIMARY KEY, nickname TEXT NOT NULL, created_at INTEGER NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS toy_game_credentials (credential_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES toy_players(id), expire INTEGER NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS toy_game_sessions (token_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES toy_players(id), expire INTEGER NOT NULL)');
function toy_user(array $row): array { return ['id'=>(int)$row['id'],'username'=>$row['nickname'],'provider'=>'bilibili','is_guest'=>0]; }
if ($_SERVER['REQUEST_METHOD']==='GET') {
    $st=$db->prepare('SELECT p.* FROM toy_game_sessions s JOIN toy_players p ON p.id=s.player_id WHERE s.token_hash=? AND s.expire>?');
    $st->execute([hash('sha256',mms_bearer_token()),time()]);$row=$st->fetch(PDO::FETCH_ASSOC);
    if(!$row)mms_json_error(401,'请重新使用B站进入');
    mms_json_ok(['user'=>toy_user($row)]);
}
if ($_SERVER['REQUEST_METHOD']!=='POST')mms_json_error(405,'POST only');
$action=mms_post_string('action',20);
if($action==='logout') { $db->prepare('DELETE FROM toy_game_sessions WHERE token_hash=?')->execute([hash('sha256',mms_bearer_token())]);mms_json_ok(); }
if($action!=='login')mms_json_error(400,'操作无效');
if(!mms_quota('toy-login-ip',mms_ip_key(),60,600))mms_json_error(429,'操作过于频繁');
$nickname=trim(mms_post_string('nickname',240));
if($nickname===''||mb_strlen($nickname)>60||preg_match('/[\x00-\x1f\x7f]/u',$nickname)||mms_has_sensitive($nickname))mms_json_error(400,'B站昵称格式不正确');
$credential=mms_post_string('credential',64);
if($credential!==''&&!preg_match('/^[a-f0-9]{64}$/',$credential))mms_json_error(401,'游戏存档凭证无效');
if($credential===''&&!mms_quota('toy-create-ip',mms_ip_key(),10,3600))mms_json_error(429,'创建账户过于频繁');
$db->exec('BEGIN IMMEDIATE');
try {
    $uid=null;
    if($credential!=='') {
        $hash=hash('sha256',$credential);
        $st=$db->prepare('SELECT player_id FROM toy_game_credentials WHERE credential_hash=? AND expire>?');$st->execute([$hash,time()]);$uid=$st->fetchColumn();
        if($uid===false) {
            // One-time migration: preserve the existing market ID, cash and positions.
            $st=$db->prepare('SELECT user_id FROM toy_credentials WHERE credential_hash=? AND expire>?');$st->execute([$hash,time()]);$uid=$st->fetchColumn();
            if($uid===false){$db->exec('ROLLBACK');mms_json_error(401,'游戏存档凭证已失效，请联系作者');}
            $db->prepare('INSERT OR IGNORE INTO toy_players VALUES(?,?,?)')->execute([$uid,$nickname,time()]);
            $db->prepare('INSERT INTO toy_game_credentials VALUES(?,?,?)')->execute([$hash,$uid,time()+365*86400]);
            $db->prepare('DELETE FROM toy_credentials WHERE credential_hash=?')->execute([$hash]);
        }
    } else {
        // Negative IDs form a separate namespace from positive website user IDs.
        do { $uid=-random_int(1,999999999999);$st=$db->prepare('SELECT id FROM toy_players WHERE id=?');$st->execute([$uid]); } while($st->fetch());
        $db->prepare('INSERT INTO toy_players VALUES(?,?,?)')->execute([$uid,$nickname,time()]);
        $credential=bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO toy_game_credentials VALUES(?,?,?)')->execute([hash('sha256',$credential),$uid,time()+365*86400]);
    }
    $db->prepare('UPDATE toy_players SET nickname=? WHERE id=?')->execute([$nickname,$uid]);
    $db->prepare('UPDATE toy_game_credentials SET expire=? WHERE credential_hash=?')->execute([time()+365*86400,hash('sha256',$credential)]);
    $token=bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO toy_game_sessions VALUES(?,?,?)')->execute([hash('sha256',$token),$uid,time()+30*86400]);
    $db->exec('DELETE FROM toy_game_sessions WHERE expire<'.time());
    $db->exec('COMMIT');
    mms_json_ok(['user'=>toy_user(['id'=>$uid,'nickname'=>$nickname]),'token'=>$token,'credential'=>$credential]);
} catch(Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
