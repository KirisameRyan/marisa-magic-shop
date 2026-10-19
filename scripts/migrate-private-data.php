<?php
// Run during maintenance, with the SAME MMS_PRIVATE_DIR as PHP-FPM.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../api/bootstrap.php';
$source = dirname(__DIR__) . '/data';
$dest = mms_private_dir();
$names = ['site.db', 'site.db-wal', 'site.db-shm', 'auth_rate.json'];
// Check every destination before moving the first SQLite file.
foreach ($names as $name) {
    if (is_file($source . '/' . $name) && file_exists($dest . '/' . $name)) {
        fwrite(STDERR, "Destination exists; stopped without overwriting\n"); exit(1);
    }
}
foreach ($names as $name) {
    $from = $source . '/' . $name; $to = $dest . '/' . $name;
    if (!is_file($from)) continue;
    if (file_exists($to)) { fwrite(STDERR, "Destination exists; stopped without overwriting\n"); exit(1); }
    if (!rename($from, $to)) { fwrite(STDERR, "Migration failed\n"); exit(1); }
    chmod($to, 0600); echo "Migrated {$name}\n";
}
echo "Remove stale deployed bot files and old downloadable packages separately.\n";
