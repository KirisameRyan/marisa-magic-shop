<?php
// Loopback development router: never expose the repository or private files.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/api/toy.php') { require __DIR__ . '/../api/toy.php'; return; }
if ($path === '/api/auth.php') { require __DIR__ . '/../api/auth.php'; return; }
if ($path === '/api/exchange.php') { require __DIR__ . '/../api/exchange.php'; return; }
http_response_code(404); echo 'Not found';
