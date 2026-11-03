<?php
// =============================================
//  霧雨魔法店 · 账号公共库 (SQLite)
//  被 auth.php / leaderboard.php / 记账等复用
// =============================================

require_once __DIR__ . '/bootstrap.php';
define('MMS_DB', mms_private_dir() . '/site.db');

function mms_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        if (!is_file(MMS_DB) && is_file(__DIR__ . '/../data/site.db')) {
            throw new RuntimeException('Private storage migration required');
        }
        $dir = dirname(MMS_DB);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        $pdo = new PDO('sqlite:' . MMS_DB);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA busy_timeout=3000');
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT UNIQUE,
                pass_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expire INTEGER NOT NULL
            )"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            )"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '📦',
                kind TEXT NOT NULL DEFAULT 'expense',
                sort INTEGER NOT NULL DEFAULT 0
            )"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'expense',
                amount_cents INTEGER NOT NULL,
                category_id INTEGER NOT NULL DEFAULT 0,
                merchant TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                happened_at TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
        $columns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        if (!in_array('email_verified_at', $columns, true)) {
            $pdo->exec('BEGIN IMMEDIATE');
            try {
                $columns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC), 'name');
                if (!in_array('email_verified_at', $columns, true)) $pdo->exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
                $pdo->exec('COMMIT');
            } catch (Throwable $error) { $pdo->exec('ROLLBACK'); throw $error; }
        }
        mms_migrate_optional_email($pdo);
        $pdo->exec('CREATE TABLE IF NOT EXISTS guest_accounts (user_id INTEGER PRIMARY KEY REFERENCES users(id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS toy_credentials (credential_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expire INTEGER NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS email_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_resets_user ON resets(user_id)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, happened_at)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_tx_user_upd ON transactions(user_id, updated_at)');
        // 默认分类种子(仅首次)
        $cnt = (int)$pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn();
        if ($cnt === 0) {
            $defaults = [
                ['餐饮', '🍜', 'expense'], ['交通', '🚇', 'expense'], ['购物', '🛍️', 'expense'],
                ['娱乐', '🎮', 'expense'], ['居住', '🏠', 'expense'], ['医疗', '💊', 'expense'],
                ['学习', '📚', 'expense'], ['人情', '🎁', 'expense'], ['其他', '📦', 'expense'],
                ['工资', '💰', 'income'], ['理财', '📈', 'income'], ['红包', '🧧', 'income'],
                ['其他收入', '✨', 'income'],
            ];
            $st = $pdo->prepare('INSERT INTO categories (user_id, name, icon, kind, sort) VALUES (0,?,?,?,?)');
            foreach ($defaults as $i => $d) {
                $st->execute([$d[0], $d[1], $d[2], $i]);
            }
        }
    }
    return $pdo;
}

// SQLite cannot drop NOT NULL in-place. Preserve IDs, sequence, columns and indexes.
function mms_migrate_optional_email(PDO $db): void {
    $info = $db->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC);
    $emailColumn = array_values(array_filter($info, fn($c) => $c['name'] === 'email'))[0] ?? null;
    if (!$emailColumn || !$emailColumn['notnull']) return;
    $foreignKeys = (int)$db->query('PRAGMA foreign_keys')->fetchColumn();
    $db->exec('PRAGMA foreign_keys=OFF');
    $db->exec('BEGIN IMMEDIATE');
    try {
        $info = $db->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC);
        $emailColumn = array_values(array_filter($info, fn($c) => $c['name'] === 'email'))[0];
        if ($emailColumn['notnull']) {
            $sql = $db->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")->fetchColumn();
            $sql = preg_replace('/\bemail\s+TEXT\s+NOT\s+NULL\b/i', 'email TEXT', $sql, 1, $changed);
            if ($changed !== 1) throw new RuntimeException('Unsupported users schema; migration required');
            $sql = preg_replace('/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?users["`\]]?/i', 'CREATE TABLE mms_users_optional', $sql, 1);
            $indexes = $db->query("SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
            $sequence = (int)$db->query("SELECT seq FROM sqlite_sequence WHERE name='users'")->fetchColumn();
            $quote = fn($name) => '"' . str_replace('"', '""', $name) . '"';
            $names = implode(',', array_map(fn($c) => $quote($c['name']), $info));
            $values = implode(',', array_map(fn($c) => $c['name'] === 'email' ? "NULLIF(email,'')" : $quote($c['name']), $info));
            $db->exec($sql);
            $db->exec("INSERT INTO mms_users_optional ($names) SELECT $values FROM users");
            $db->exec('DROP TABLE users');
            $db->exec('ALTER TABLE mms_users_optional RENAME TO users');
            foreach ($indexes as $indexSql) $db->exec($indexSql);
            $db->exec("UPDATE sqlite_sequence SET seq=MAX(seq,$sequence) WHERE name='users'");
            if ($db->query('PRAGMA foreign_key_check')->fetch()) throw new RuntimeException('Foreign key check failed');
        }
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
    finally { $db->exec('PRAGMA foreign_keys=' . $foreignKeys); }
}

function mms_json_error(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function mms_json_ok(array $data = []): void {
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 取当前请求携带的 token（只接受 Authorization Bearer 头）──
function mms_bearer_token(): string {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', trim($auth), $m)) return trim($m[1]);
    return ''; // Session tokens must never travel in URL/query parameters.
}

// ── 发放会话 token（DB 只存 SHA-256 哈希），30 天有效 ──
function mms_issue_token(int $userId): string {
    $db = mms_db();
    $token = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO sessions (token, user_id, expire) VALUES (?,?,?)')
        ->execute([hash('sha256', $token), $userId, time() + 2592000]);
    $db->exec('DELETE FROM sessions WHERE expire < ' . time());
    return $token;
}

function mms_revoke_token(string $token): void {
    if ($token === '') return;
    mms_db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([hash('sha256', $token)]);
}

// ── 校验 token → 返回用户数组或 null ──
function mms_auth_user(): ?array {
    $token = mms_bearer_token();
    if ($token === '') return null;
    $st = mms_db()->prepare(
        'SELECT u.id, u.username, u.email, u.email_verified_at, EXISTS(SELECT 1 FROM guest_accounts g WHERE g.user_id=u.id) AS is_guest FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expire > ?'
    );
    $st->execute([hash('sha256', $token), time()]);
    $u = $st->fetch(PDO::FETCH_ASSOC);
    return $u ?: null;
}

// ── 未登录直接 401 退出 ──
function mms_require_user(): array {
    $u = mms_auth_user();
    if (!$u) mms_json_error(401, '需要登录');
    return $u;
}

// ── 敏感词检测（与 leaderboard.php 同逻辑，注册时挡在第一关）──
function mms_has_sensitive(string $text): bool {
    $clean = preg_replace('/[^\x{4e00}-\x{9fa5}a-zA-Z0-9]/u', '', $text);
    if ($clean === '' || mb_strlen($clean) < 2) return false;
    $words = [];
    $jsFile = __DIR__ . '/../js/sensitive-words.js';
    if (file_exists($jsFile)) {
        $content = @file_get_contents($jsFile);
        if (preg_match('/\[([\s\S]*)\]/', (string)$content, $m)) {
            $arr = @json_decode('[' . $m[1] . ']', true);
            if (is_array($arr)) $words = array_flip($arr);
        }
    }
    if (!$words) return false;
    $len = mb_strlen($clean);
    for ($i = 0; $i < $len; $i++) {
        for ($j = $i + 2; $j <= $len && ($j - $i) <= 10; $j++) {
            if (isset($words[mb_substr($clean, $i, $j - $i)])) return true;
        }
    }
    return false;
}

function mms_validate_username(string $username): string {
    $u = trim($username);
    if ($u === '' || !preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z0-9_]{2,12}$/u', $u)) {
        mms_json_error(400, '用户名需为 2-12 位中文/字母/数字/下划线');
    }
    if (mms_has_sensitive($u)) mms_json_error(400, '用户名包含敏感词');
    return $u;
}

function mms_validate_email(string $email): string {
    $e = strtolower(trim($email));
    if ($e === '' || strlen($e) > 100 || !filter_var($e, FILTER_VALIDATE_EMAIL)) {
        mms_json_error(400, '邮箱格式不正确');
    }
    return $e;
}

function mms_validate_password(string $password): string {
    if (mb_strlen($password) < 8 || mb_strlen($password) > 32 || strlen($password) > 72 || strpos($password, "\0") !== false) {
        mms_json_error(400, '新密码需为 8-32 位，UTF-8编码不超过72字节');
    }
    return $password;
}

// ── IP 限速存储（data/auth_rate.json，沿用项目 JSON 模式）──
function mms_rate_read(): array {
    $f = mms_private_dir() . '/auth_rate.json';
    $d = @json_decode((string)@file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

function mms_rate_write(array $data): void {
    $f = mms_private_dir() . '/auth_rate.json';
    $tmp = $f . '.tmp';
    @file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE));
    @rename($tmp, $f);
}

function mms_ip_key(): string {
    return md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

// 登录失败 5 次 → 封 IP 10 分钟
function mms_login_blocked(string $username = ''): bool {
    return !mms_quota('login-ip', mms_ip_key(), 50, 600)
        || ($username !== '' && !mms_quota('login-name', $username, 10, 600));
}

function mms_login_failed(): void {
    // Attempts are counted atomically before password verification.
}

function mms_login_ok(): void {
    // A successful login must not clear another request's shared IP quota.
}

// 忘记密码限速: 同邮箱 5 分钟一次 / 同 IP 每小时 5 次
function mms_forgot_blocked(string $email): bool {
    return !mms_quota('forgot-ip', mms_ip_key(), 5, 3600) || !mms_quota('forgot-mail', $email, 1, 300);
}

function mms_post_string(string $name, int $max = 256, string $default = ''): string {
    $value = $_POST[$name] ?? $default;
    if (!is_string($value) || strlen($value) > $max) mms_json_error(400, '请求字段格式不正确');
    return $value;
}

function mms_account_link(string $page, string $token): string {
    $origin = rtrim(mms_env('MMS_PUBLIC_ORIGIN', 'https://www.azureflame.cloud'), '/');
    if (!preg_match('~^https://[a-z0-9.-]+(?::[0-9]+)?$~i', $origin)) throw new RuntimeException('Invalid public origin');
    return $origin . '/' . $page . '?t=' . rawurlencode($token);
}

// Opaque game credential stored in Toy's per-user private cloud, not an asserted Toy ID.
function mms_toy_credential(int $uid): string {
    $credential=bin2hex(random_bytes(32));
    mms_db()->prepare('INSERT INTO toy_credentials(credential_hash,user_id,expire) VALUES(?,?,?)')->execute([hash('sha256',$credential),$uid,time()+365*86400]);
    return $credential;
}
