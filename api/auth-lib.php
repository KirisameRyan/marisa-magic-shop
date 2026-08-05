<?php
// =============================================
//  霧雨魔法店 · 账号公共库 (SQLite)
//  被 auth.php / leaderboard.php / 记账等复用
// =============================================

define('MMS_DB', __DIR__ . '/../data/site.db');

function mms_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
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
                email TEXT NOT NULL UNIQUE,
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

function mms_json_error(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function mms_json_ok(array $data = []): void {
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 取当前请求携带的 token（Authorization 头优先，兼容 GET/POST 参数）──
function mms_bearer_token(): string {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', trim($auth), $m)) return trim($m[1]);
    $t = $_REQUEST['token'] ?? '';
    return is_string($t) ? trim($t) : '';
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
        'SELECT u.id, u.username, u.email FROM sessions s
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
    if (mb_strlen($password) < 6 || mb_strlen($password) > 32) {
        mms_json_error(400, '密码需为 6-32 位');
    }
    return $password;
}

// ── IP 限速存储（data/auth_rate.json，沿用项目 JSON 模式）──
function mms_rate_read(): array {
    $f = __DIR__ . '/../data/auth_rate.json';
    $d = @json_decode((string)@file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

function mms_rate_write(array $data): void {
    $f = __DIR__ . '/../data/auth_rate.json';
    $tmp = $f . '.tmp';
    @file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE));
    @rename($tmp, $f);
}

function mms_ip_key(): string {
    return md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

// 登录失败 5 次 → 封 IP 10 分钟
function mms_login_blocked(): bool {
    $d = mms_rate_read();
    $k = mms_ip_key();
    if (isset($d['block'][$k]) && $d['block'][$k] > time()) return true;
    if (($d['fail'][$k] ?? 0) >= 5) {
        $d['block'][$k] = time() + 600;
        $d['fail'][$k] = 0;
        mms_rate_write($d);
        return true;
    }
    return false;
}

function mms_login_failed(): void {
    $d = mms_rate_read();
    $k = mms_ip_key();
    $d['fail'][$k] = ($d['fail'][$k] ?? 0) + 1;
    mms_rate_write($d);
}

function mms_login_ok(): void {
    $d = mms_rate_read();
    $k = mms_ip_key();
    unset($d['fail'][$k], $d['block'][$k]);
    mms_rate_write($d);
}

// 忘记密码限速: 同邮箱 5 分钟一次 / 同 IP 每小时 5 次
function mms_forgot_blocked(string $email): bool {
    $d = mms_rate_read();
    $ek = 'fmail_' . md5($email);
    if (($d['forgot'][$ek] ?? 0) > time()) return true;
    $ik = 'fip_' . mms_ip_key();
    $now = time();
    $hist = array_values(array_filter($d['fhist'][$ik] ?? [], function ($t) use ($now) { return $t > $now - 3600; }));
    if (count($hist) >= 5) return true;
    $d['fhist'][$ik] = $hist;
    $d['fhist'][$ik][] = $now;
    $d['forgot'][$ek] = $now + 300;
    mms_rate_write($d);
    return false;
}
