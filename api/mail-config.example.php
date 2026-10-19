<?php
// SMTP is configured through server environment variables; see .env.example.
return [
    'host' => getenv('MMS_SMTP_HOST') ?: '',
    'port' => (int)(getenv('MMS_SMTP_PORT') ?: 465),
    'ssl' => true,
    'user' => getenv('MMS_SMTP_USER') ?: '',
    'pass' => getenv('MMS_SMTP_PASS') ?: '',
];
