<?php
// =============================================
//  手写 SMTP 客户端（无 Composer，项目惯例）
//  用法: mms_send_mail($to, $subject, $body) → bool
//  未配置 mail-config.php 时静默返回 false
// =============================================

function mms_smtp_config(): ?array {
    $f = __DIR__ . '/mail-config.php';
    if (!file_exists($f)) return null;
    $cfg = require $f;
    return is_array($cfg) && !empty($cfg['host']) ? $cfg : null;
}

function mms_smtp_read_line($fp): string {
    $line = '';
    while (!feof($fp)) {
        $ch = fgets($fp, 515);
        if ($ch === false) break;
        $line .= $ch;
        if (substr($ch, -1) === "\n") break;
    }
    return $line;
}

// 读多行响应（EHLO 以 "250-" 续行，直到 "250 " 结束）
function mms_smtp_read_multiline($fp): string {
    $all = '';
    do {
        $line = mms_smtp_read_line($fp);
        $all .= $line;
    } while (substr($line, 3, 1) === '-' && substr($line, 0, 3) === '250');
    return $all;
}

function mms_smtp_expect($fp, string $code): bool {
    $line = mms_smtp_read_line($fp);
    return substr($line, 0, 3) === $code;
}

function mms_send_mail(string $to, string $subject, string $body): bool {
    $cfg = mms_smtp_config();
    if (!$cfg) return false;

    $host = $cfg['host'];
    $port = (int)($cfg['port'] ?? 465);
    $ssl  = !empty($cfg['ssl']);
    $user = $cfg['user'];
    $pass = $cfg['pass'];

    $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $fp = @stream_socket_client(
        ($ssl ? 'ssl://' : '') . $host . ':' . $port,
        $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx
    );
    if (!$fp) return false;
    stream_set_timeout($fp, 15);

    if (!mms_smtp_expect($fp, '220')) { fclose($fp); return false; }

    fwrite($fp, "EHLO azureflame.cloud\r\n");
    mms_smtp_read_multiline($fp);

    fwrite($fp, "AUTH LOGIN\r\n");
    if (!mms_smtp_expect($fp, '334')) { fclose($fp); return false; }
    fwrite($fp, base64_encode($user) . "\r\n");
    if (!mms_smtp_expect($fp, '334')) { fclose($fp); return false; }
    fwrite($fp, base64_encode($pass) . "\r\n");
    if (!mms_smtp_expect($fp, '235')) { fclose($fp); return false; }

    fwrite($fp, "MAIL FROM: <" . $user . ">\r\n");
    if (!mms_smtp_expect($fp, '250')) { fclose($fp); return false; }
    fwrite($fp, "RCPT TO: <" . $to . ">\r\n");
    $code = substr(mms_smtp_read_line($fp), 0, 3);
    if ($code !== '250' && $code !== '251') { fclose($fp); return false; }

    fwrite($fp, "DATA\r\n");
    if (!mms_smtp_expect($fp, '354')) { fclose($fp); return false; }

    $enc = function (string $s): string {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    };
    $headers = "From: " . $enc('霧雨魔法店') . " <" . $user . ">\r\n"
        . "To: <" . $to . ">\r\n"
        . "Subject: " . $enc($subject) . "\r\n"
        . "Date: " . date('r') . "\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n";

    $payload = $headers . "\r\n" . str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body)) . "\r\n.\r\n";
    fwrite($fp, $payload);

    $done = mms_smtp_expect($fp, '250');
    fwrite($fp, "QUIT\r\n");
    fclose($fp);
    return $done;
}
