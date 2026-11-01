<?php
// =============================================
//  霧雨魔法店 · 账号接口
//  POST register / login / logout / forgot / reset
//  GET  me
// =============================================

require __DIR__ . '/auth-lib.php';
require __DIR__ . '/smtp.php';

header('Content-Type: application/json; charset=utf-8');
mms_cors();
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$rawAction = $_POST['action'] ?? $_GET['action'] ?? '';
if (!is_string($rawAction) || strlen($rawAction) > 40) mms_json_error(400, '操作格式不正确');
$action = strtolower(trim($rawAction));

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
        if (!mms_quota('register-ip', mms_ip_key(), 10, 3600)) mms_json_error(429, '注册过于频繁，请稍后重试');
        $username = mms_validate_username(mms_post_string('username', 48));
        $emailInput = trim(mms_post_string('email', 100));
        $email    = $emailInput === '' ? null : mms_validate_email($emailInput);
        $password = mms_validate_password(mms_post_string('password', 128));
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $db->exec('BEGIN IMMEDIATE');

        $st = $db->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
        $st->execute([$username, $email]);
        if ($st->fetch()) { $db->exec('ROLLBACK'); mms_json_error(409, '用户名或邮箱已被注册'); }

        $db->prepare('INSERT INTO users (username, email, pass_hash, created_at) VALUES (?,?,?,?)')
            ->execute([$username, $email, $hash, gmdate('Y-m-d H:i:s')]);
        $uid = (int)$db->lastInsertId();
        $token = mms_issue_token($uid);
        $db->exec('COMMIT');

        mms_json_ok(['user' => ['id' => $uid, 'username' => $username, 'email' => $email], 'token' => $token]);
    }

    case 'login': {
        $username = trim(mms_post_string('username', 48));
        $password = mms_post_string('password', 256);

        if ($username === '' || $password === '') mms_json_error(400, '请输入用户名和密码');
        if (mms_login_blocked($username)) mms_json_error(429, '尝试次数过多，请 10 分钟后再试');

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
        $email = strtolower(trim(mms_post_string('email', 100)));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) mms_json_error(400, '邮箱格式不正确');
        if (mms_forgot_blocked($email)) mms_json_error(429, '操作太频繁，请稍后再试');
        if (!mms_smtp_config()) mms_json_error(503, '邮件服务尚未配置，请联系站长');

        $st = $db->prepare('SELECT id, username FROM users WHERE email = ?');
        $st->execute([$email]);
        $user = $st->fetch(PDO::FETCH_ASSOC);

        // 无论邮箱是否存在，统一回复，防账号枚举
        $okMsg = ['ok' => true, 'msg' => '如果该邮箱已注册，重置链接已发送'];
        if (!$user) mms_json_ok($okMsg);

        $token = bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO resets (user_id, token_hash, expires_at, used) VALUES (?,?,?,0)')
            ->execute([(int)$user['id'], hash('sha256', $token), time() + 1800]);

        $link = mms_account_link('reset.html', $token);
        $subject = '霧雨魔法店 · 重置密码';
        $body = "你好，{$user['username']}！\n\n"
              . "你正在重置 霧雨魔法店(azureflame.cloud) 的账号密码。\n\n"
              . "重置链接（30 分钟内有效，只能使用一次）：\n{$link}\n\n"
              . "如果这不是你本人操作，请忽略此邮件。\n\n—— 霧雨魔法店";
        if (!mms_send_mail($email, $subject, $body)) error_log('MMS password-reset delivery failed');

        mms_json_ok($okMsg);
    }

    case 'reset': {
        if (!mms_quota('reset-ip', mms_ip_key(), 20, 900)) mms_json_error(429, '操作太频繁，请稍后再试');
        $token = trim(mms_post_string('token', 128));
        $password = mms_validate_password(mms_post_string('password', 128));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) mms_json_error(400, '链接无效或已过期');
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $db->exec('BEGIN IMMEDIATE');

        $st = $db->prepare('SELECT id, user_id, used, expires_at FROM resets WHERE token_hash = ? LIMIT 1');
        $st->execute([hash('sha256', $token)]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if (!$r || $r['used'] || $r['expires_at'] <= time()) { $db->exec('ROLLBACK'); mms_json_error(400, '链接无效或已过期'); }

        $db->prepare('UPDATE resets SET used = 1 WHERE user_id = ?')->execute([(int)$r['user_id']]);
        $db->prepare('UPDATE users SET pass_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
            ->execute([$hash, time(), (int)$r['user_id']]);
        $db->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([(int)$r['user_id']]);
        $db->exec('COMMIT');

        mms_json_ok(['msg' => '密码已重置，请重新登录']);
    }

    case 'request_verification': {
        $user = mms_require_user();
        if (!$user['email']) mms_json_error(400, '账户未填写邮箱，不能发送验证邮件或通过邮箱找回密码');
        if ($user['email_verified_at']) mms_json_ok(['msg' => '邮箱已验证']);
        if (!mms_smtp_config()) mms_json_error(503, '邮件服务尚未配置，请联系站长');
        if (!mms_quota('verify-user', (string)$user['id'], 1, 300) || !mms_quota('verify-ip', mms_ip_key(), 10, 3600)) mms_json_error(429, '验证邮件发送过于频繁');
        $token = bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO email_verifications(user_id,token_hash,expires_at) VALUES(?,?,?)')->execute([(int)$user['id'], hash('sha256', $token), time()+1800]);
        $link = mms_account_link('verify-email.html', $token);
        if (!mms_send_mail($user['email'], '霧雨魔法店 · 验证邮箱', "你好，{$user['username']}！\n\n请点击链接验证邮箱，30分钟内有效：\n{$link}\n\n如果不是你本人操作，请忽略。")) mms_json_error(503, '邮件发送暂时失败，请稍后重试');
        mms_json_ok(['msg' => '验证邮件已发送，请检查邮箱及垃圾邮件']);
    }

    case 'verify_email': {
        if (!mms_quota('verify-token-ip', mms_ip_key(), 30, 900)) mms_json_error(429, '请求过于频繁');
        $token = trim(mms_post_string('token', 128));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) mms_json_error(400, '验证链接无效或已过期');
        $db->exec('BEGIN IMMEDIATE');
        $st = $db->prepare('SELECT user_id FROM email_verifications WHERE token_hash=? AND used=0 AND expires_at>?');
        $st->execute([hash('sha256', $token), time()]); $id = $st->fetchColumn();
        if (!$id) { $db->exec('ROLLBACK'); mms_json_error(400, '验证链接无效或已过期'); }
        $db->prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?')->execute([time(), (int)$id]);
        $db->prepare('UPDATE email_verifications SET used=1 WHERE user_id=?')->execute([(int)$id]);
        $db->exec('COMMIT');mms_json_ok(['msg' => '邮箱验证成功']);
    }

    default:
        mms_json_error(400, '未知操作');
}
