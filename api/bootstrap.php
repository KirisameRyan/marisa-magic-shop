<?php
// Shared server-only configuration. Credentials must be injected by the service manager.
ini_set('display_errors', '0');
if (PHP_SAPI !== 'cli') {
    set_exception_handler(function (Throwable $error): void {
        error_log('MMS server failure: ' . get_class($error));
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '服务暂时不可用，请稍后再试']);
    });
}

function mms_env(string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false || trim((string)$value) === '' ? $fallback : trim((string)$value);
}

function mms_private_dir(): string {
    $dir = mms_env('MMS_PRIVATE_DIR', dirname(__DIR__) . '/var/private');
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Private storage unavailable');
    }
    return rtrim($dir, '/\\');
}

function mms_cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = array_filter(array_map('trim', explode(',', mms_env('MMS_ALLOWED_ORIGINS',
        'https://www.azureflame.cloud,https://azureflame.cloud,https://appassets.androidapp.net'))));
    if ($origin !== '') {
        if (!in_array($origin, $allowed, true)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Origin not allowed']);
            exit;
        }
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

// Atomic fixed-window quota; do not persist credentials, request bodies or image contents.
function mms_quota(string $scope, string $subject, int $limit, int $seconds): bool {
    $path = mms_private_dir() . '/quota_' . hash('sha256', $scope . ':' . $subject) . '.json';
    $handle = fopen($path, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) return false;
    try {
        $record = json_decode(stream_get_contents($handle), true);
        $now = time();
        if (!is_array($record) || ($record['until'] ?? 0) <= $now) $record = ['until' => $now + $seconds, 'count' => 0];
        if ($record['count'] >= $limit) return false;
        $record['count']++;
        rewind($handle);
        ftruncate($handle, 0);
        return fwrite($handle, json_encode($record)) !== false;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
        @chmod($path, 0600);
    }
}
