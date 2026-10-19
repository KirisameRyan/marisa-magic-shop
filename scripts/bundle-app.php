<?php
// CLI compatibility entry; never expose build tooling over HTTP.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$python = getenv('MMS_PYTHON_BIN') ?: 'python3';
$command = escapeshellarg($python) . ' ' . escapeshellarg(__DIR__ . '/release.py') . ' android';
passthru($command, $status);
exit($status);
