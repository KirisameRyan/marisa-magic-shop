<?php
// =============================================
//  霧雨魔法店 · App 离线包打包器
//  把全站静态资源复制进 android-app 的 assets/www
//  用法: php scripts/bundle-app.php
//  产出: android-app/app/src/main/assets/www/  (gitignored, 生成物)
//  规则与 build-manifest.php 一致: 排除 api/ 等服务器侧内容
// =============================================

$root = realpath(__DIR__ . '/..');
if (!$root) { fwrite(STDERR, "无法定位站点根目录\n"); exit(1); }

$dest = $root . '/android-app/app/src/main/assets/www';
if (!is_dir($dest)) {
    if (!@mkdir($dest, 0755, true)) { fwrite(STDERR, "无法创建目标目录: $dest\n"); exit(1); }
}

// 排除的目录(相对根)
$skipDirs = [
    '.git', 'api', 'android-app', 'scripts', '.opencode',
    'proxy_cache_dir', '.well-known',
];

// 排除的文件(完整相对路径) — 注意: 版本清单 version.json 要打进包(出厂基线)
$skipFiles = [
    '.htaccess', '.user.ini', 'bdunion.txt',
    '39be8777283b6964b055eb7e87a6dadb.txt', 'README.md',
];

$skipPatterns = [
    '/\.tmp$/i', '/\.log$/i', '/\.DS_Store$/i', '/\.php$/i',
    '/leaderboard.*\.json$/i', '/counters\.json$/i',
    '/suggestions\.json$/i', '/auth_rate\.json$/i',
    '/bot_token\.json$/i', '/waifu_quiz_sessions\.json$/i',
    '/^site\.db/', '/roulette.*\.json$/i',
];

$copied = 0;
$bytes = 0;
$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
);

foreach ($it as $file) {
    if (!$file->isFile()) continue;
    $rel = ltrim(str_replace('\\', '/', substr($file->getPathname(), strlen($root))), '/');
    $dir = strtok($rel, '/');
    if (in_array($dir, $skipDirs, true)) continue;
    if (in_array($rel, $skipFiles, true)) continue;
    foreach ($skipPatterns as $pat) {
        if (preg_match($pat, $rel)) continue 2;
    }
    $dstFile = $dest . '/' . $rel;
    if (!is_dir(dirname($dstFile))) @mkdir(dirname($dstFile), 0755, true);
    if (@copy($file->getPathname(), $dstFile)) {
        $copied++;
        $bytes += $file->getSize();
    }
}

printf("已打包 %d 个文件, 共 %.1fMB → %s\n", $copied, $bytes / 1048576, $dest);
