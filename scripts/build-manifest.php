<?php
// =============================================
//  霧雨魔法店 · 离线包版本清单生成器
//  用法: php scripts/build-manifest.php
//  输出: version.json (提交进仓库, App 更新器据此拉差异文件)
//  打包范围: 网页根目录下所有静态资源(排除 api/ 等服务器侧内容)
// =============================================

$root = realpath(__DIR__ . '/..');
if (!$root) { fwrite(STDERR, "无法定位站点根目录\n"); exit(1); }

// 排除的目录(相对根)
$skipDirs = [
    '.git', 'api', 'android-app', 'scripts', '.opencode',
    'proxy_cache_dir', '.well-known',
];

// 排除的文件(完整相对路径)
$skipFiles = [
    'version.json', '.gitignore', '.htaccess', '.user.ini', 'bdunion.txt',
    '39be8777283b6964b055eb7e87a6dadb.txt', 'README.md',
];

// 排除的文件名模式
$skipPatterns = [
    '/\.tmp$/i', '/\.log$/i', '/\.DS_Store$/i', '/\.php$/i',
    '/leaderboard.*\.json$/i', '/counters\.json$/i',
    '/suggestions\.json$/i', '/auth_rate\.json$/i',
    '/bot_token\.json$/i', '/waifu_quiz_sessions\.json$/i',
    '/^site\.db/', '/roulette.*\.json$/i',
];

$files = [];
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
    $files[$rel] = hash_file('sha256', $file->getPathname());
}

ksort($files, SORT_STRING);

$digest = hash('sha256', json_encode($files));
$out = [
    'version'   => substr($digest, 0, 16),
    'generated' => date('Y-m-d H:i:s'),
    'files'     => $files,
];

$totalBytes = 0;
foreach ($files as $rel => $hash) {
    $totalBytes += filesize($root . '/' . $rel);
}
$dst = $root . '/version.json';
file_put_contents($dst, json_encode($out, JSON_UNESCAPED_SLASHES) . "\n");
printf("version=%s 文件数=%d 总大小=%.1fMB 写入 %s\n",
    $out['version'], count($files), $totalBytes / 1048576, $dst
);
