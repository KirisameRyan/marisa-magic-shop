<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$testDir = sys_get_temp_dir() . '/mms-security-' . bin2hex(random_bytes(6));
mkdir($testDir, 0700);
putenv('MMS_PRIVATE_DIR=' . $testDir);
touch($testDir . '/site.db');
require_once __DIR__ . '/../api/auth-lib.php';
function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
try {
    check(MMS_DB === $testDir . '/site.db', 'Database is not private');
    check(mms_quota('test', 'fixture', 2, 60), 'First request blocked');
    check(mms_quota('test', 'fixture', 2, 60), 'Second request blocked');
    check(!mms_quota('test', 'fixture', 2, 60), 'Quota bypass');
    $_REQUEST['token'] = 'fixture-query-token';
    check(mms_bearer_token() === '', 'Session token accepted from query');
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer fixture-header-token';
    check(mms_bearer_token() === 'fixture-header-token', 'Header token not accepted');
    putenv('MMS_ZHIPU_API_KEY');
    $config = require __DIR__ . '/../api/llm-config.php';
    check($config['api_key'] === '', 'Hardcoded LLM credential remains');
    $db = mms_db();
    check((int)$db->query('SELECT count(*) FROM users')->fetchColumn() === 0, 'Fresh private DB failed');
    check(!file_exists(__DIR__ . '/../api/bot.php') && !file_exists(__DIR__ . '/../api/bot_token.php'), 'Bot endpoint remains');
    echo "Backend checks passed: private DB, quota, bearer-only auth, empty environment credentials, bot removal\n";
} finally {
    // Remove only the exact test files inside the generated temporary directory.
    foreach (glob($testDir . '/*') as $file) if (is_file($file)) @unlink($file);
    @rmdir($testDir);
}
