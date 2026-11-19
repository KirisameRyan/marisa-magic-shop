<?php
// Retired website-to-Wiki login endpoint.
header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');
http_response_code(410);
echo json_encode(['ok' => false, 'error' => 'Wiki 请使用管理员发放的独立账号登录'], JSON_UNESCAPED_UNICODE);
