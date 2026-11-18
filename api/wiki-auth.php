<?php

require_once __DIR__ . '/auth-lib.php';

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('Content-Type: application/json; charset=utf-8');
$secret = mms_env('MMS_WIKI_SSO_SECRET');
if (strlen($secret) < 32) mms_json_error(503, '官网账号登录尚未启用');

function wiki_auth_field(array $input, string $name, string $pattern): string {
    $value = $input[$name] ?? '';
    if (!is_string($value) || !preg_match($pattern, $value)) {
        mms_json_error(400, '登录请求无效，请从 Wiki 重新发起');
    }
    return $value;
}

function wiki_auth_request(array $input, string $secret): array {
    $hex = '/\A[a-f0-9]{64}\z/';
    $challenge = wiki_auth_field($input, 'challenge', $hex);
    $expires = wiki_auth_field($input, 'expires', '/\A[0-9]{10}\z/');
    $callback = wiki_auth_field($input, 'callback', '~\Ahttps?://[^\s#]{1,1600}\z~');
    $signature = wiki_auth_field($input, 'signature', $hex);
    $expected = hash_hmac('sha256', "start\n$challenge\n$expires\n$callback", $secret);
    if ((int)$expires < time() || !hash_equals($expected, $signature)) {
        mms_json_error(400, '登录请求已过期或无效，请从 Wiki 重新发起');
    }
    return compact('challenge', 'expires', 'callback', 'signature');
}

function wiki_auth_db(): PDO {
    $db = mms_db();
    $db->exec('CREATE TABLE IF NOT EXISTS wiki_login_codes (
        code_hash TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        session_hash TEXT NOT NULL,
        expire INTEGER NOT NULL
    )');
    return $db;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $params = wiki_auth_request($_GET, $secret);
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'");
    $data = htmlspecialchars(http_build_query($params), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    ?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/">
  <title>用官网账号登录 Wiki · 霧雨魔法店</title>
  <link rel="stylesheet" href="css/common.css">
  <script src="js/auth.js" defer></script>
  <script src="js/wiki-sign-in.js" defer></script>
</head>
<body>
  <main style="max-width: 32rem; margin: 12vh auto; padding: 1.5rem" id="wikiSignIn" data-request="<?= $data ?>">
    <h1>用官网账号登录 Wiki</h1>
    <p id="wikiSignInStatus" role="status">正在检查官网登录状态。</p>
    <button id="wikiSignInButton" type="button" hidden>登录官网账号</button>
  </main>
</body>
</html>
    <?php
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') mms_json_error(405, 'POST only');
$action = $_POST['action'] ?? '';
if ($action === 'issue') {
    $params = wiki_auth_request($_POST, $secret);
    $user = mms_require_user();
    if (!empty($user['is_guest'])) mms_json_error(403, '请使用已注册的官网账号登录 Wiki');
    if (!mms_quota('wiki-sign-in', (string)$user['id'], 20, 300)) mms_json_error(429, '登录尝试过于频繁');

    $code = bin2hex(random_bytes(32));
    $db = wiki_auth_db();
    $db->prepare('DELETE FROM wiki_login_codes WHERE expire <= ?')->execute([time()]);
    $db->prepare('INSERT INTO wiki_login_codes VALUES (?, ?, ?, ?)')->execute([
        hash('sha256', $code), $params['challenge'], hash('sha256', mms_bearer_token()), time() + 60
    ]);
    mms_json_ok(['code' => $code]);
}

if ($action !== 'redeem') mms_json_error(400, '登录请求无效');
$hex = '/\A[a-f0-9]{64}\z/';
$code = wiki_auth_field($_POST, 'code', $hex);
$verifier = wiki_auth_field($_POST, 'verifier', $hex);
$proof = wiki_auth_field($_POST, 'proof', $hex);
if (!hash_equals(hash_hmac('sha256', "redeem\n$code\n$verifier", $secret), $proof)) {
    mms_json_error(403, '登录请求无效');
}

$db = wiki_auth_db();
$db->exec('BEGIN IMMEDIATE');
try {
    $hash = hash('sha256', $code);
    $query = $db->prepare('SELECT u.id FROM wiki_login_codes c
        JOIN sessions s ON s.token = c.session_hash
        JOIN users u ON u.id = s.user_id
        WHERE c.code_hash = ? AND c.challenge = ? AND c.expire > ? AND s.expire > ?
        AND NOT EXISTS (SELECT 1 FROM guest_accounts g WHERE g.user_id = u.id)');
    $now = time();
    $query->execute([$hash, hash('sha256', $verifier), $now, $now]);
    $id = $query->fetchColumn();
    if ($id) $db->prepare('DELETE FROM wiki_login_codes WHERE code_hash = ?')->execute([$hash]);
    $db->exec('COMMIT');
} catch (Throwable $error) {
    $db->exec('ROLLBACK');
    throw $error;
}
if (!$id) mms_json_error(401, '登录凭证已失效，请重新登录');
mms_json_ok(['id' => (int)$id]);
