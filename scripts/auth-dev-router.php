<?php
// Loopback development router: never expose the repository or private files.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/api/auth.php') { require __DIR__ . '/../api/auth.php'; return; }
http_response_code(404); echo 'Not found';
