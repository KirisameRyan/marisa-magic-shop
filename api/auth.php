<?php
// =============================================
//  霧雨魔法店 · 账号接口
//  POST register / login / logout / forgot / reset
//  GET  me
// =============================================

require __DIR__ . '/auth-lib.php';
require __DIR__ . '/smtp.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = strtolower(trim($_POST['action'] ?? ($_REQUEST['action'] ?? '')));

if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($action === '' || $action === 'me')) {
    // ── 校验会话 ──
    $u = mms_auth_user();
    if (!$u) mms_json_error(401, '需要登录');
    mms_json_ok(['user' => $u]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    mms_json_error(405, 'POST only');
}

$db = mms_db();

switch ($action) {

    case 'register': {
        $username = mms_validate_username($_POST['username'] ?? '');
        $email    = mms_validate_email($_POST['email'] ?? '');
        $password = mms_validate_password($_POST['password'] ?? '');

        $st = $db->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
        $st->execute([$username, $email]);
        if ($st->fetch()) mms_json_error(400, '用户名或邮箱已被注册');

        $db->prepare('INSERT INTO users (username, email, pass_hash, created_at) VALUES (?,?,?,?)')
            ->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), date('Y-m-d H:i:s')]);
        $uid = (int)$db->lastInsertId();
        $token = mms_issue_token($uid);

        mms_json_ok(['user' => ['id' => $uid, 'username' => $username, 'email' => $email], 'token' => $token]);
    }

    case 'login': {
        $username = trim($_POST['username'] ?? '');
        $password = (string)($_POST['password'] ?? '');

        if ($username === '' || $password === '') mms_json_error(400, '请输入用户名和密码');
        if (mms_login_blocked()) mms_json_error(429, '尝试次数过多，请 10 分钟后再试');

        $st = $db->prepare('SELECT id, username, email, pass_hash FROM users WHERE username = ?');
        $st->execute([$username]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row || !password_verify($password, $row['pass_hash'])) {
            mms_login_failed();
            mms_json_error(401, '用户名或密码错误');
        }
        mms_login_ok();
        $token = mms_issue_token((int)$row['id']);
        mms_json_ok(['user' => ['id' => (int)$row['id'], 'username' => $row['username'], 'email' => $row['email']], 'token' => $token]);
    }

    case 'logout': {
        mms_revoke_token(mms_bearer_token());
        mms_json_ok();
    }

    case 'forgot': {
        $email = strtolower(trim($_POST['email'] ?? ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) mms_json_error(400, '邮箱格式不正确');
        if (mms_forgot_blocked($email)) mms_json_error(429, '操作太频繁，请稍后再试');

        $st = $db->prepare('SELECT id, username FROM users WHERE email = ?');
        $st->execute([$email]);
        $user = $st->fetch(PDO::FETCH_ASSOC);

        // 无论邮箱是否存在，统一回复，防账号枚举
        $okMsg = ['ok' => true, 'msg' => '如果该邮箱已注册，重置链接已发送'];
        if (!$user) mms_json_ok($okMsg);

        $token = bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO resets (user_id, token_hash, expires_at, used) VALUES (?,?,?,0)')
            ->execute([(int)$user['id'], hash('sha256', $token), time() + 1800]);

        $link = 'https://www.azureflame.cloud/reset.html?t=' . $token;
        $subject = '霧雨魔法店 · 重置密码';
        $body = "你好，{$user['username']}！\n\n"
              . "你正在重置 霧雨魔法店(azureflame.cloud) 的账号密码。\n\n"
              . "重置链接（30 分钟内有效，只能使用一次）：\n{$link}\n\n"
              . "如果这不是你本人操作，请忽略此邮件。\n\n—— 霧雨魔法店";
        mms_send_mail($email, $subject, $body);

        mms_json_ok($okMsg);
    }

    case 'reset': {
        $token = trim((string)($_POST['token'] ?? ''));
        $password = mms_validate_password($_POST['password'] ?? '');
        if ($token === '' || strlen($token) > 128) mms_json_error(400, '链接无效或已过期');

        $st = $db->prepare('SELECT id, user_id, used, expires_at FROM resets WHERE token_hash = ? LIMIT 1');
        $st->execute([hash('sha256', $token)]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if (!$r || $r['used'] || $r['expires_at'] < time()) mms_json_error(400, '链接无效或已过期');

        $db->prepare('UPDATE resets SET used = 1 WHERE id = ?')->execute([(int)$r['id']]);
        $db->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), (int)$r['user_id']]);
        $db->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([(int)$r['user_id']]);

        mms_json_ok(['msg' => '密码已重置，请重新登录']);
    }

    default:
        mms_json_error(400, '未知操作');
}
