<?php

/**
 * QQ Bot access_token 管理
 * 缓存到 data/bot_token.json，过期前 60 秒自动刷新
 */

define('BOT_APP_ID', '1905286942');
define('BOT_APP_SECRET', 'Ufr3GThvAQgxEWo7Qk4Pl7UrFd2RrHiA');

function getBotAccessToken() {
    $cacheFile = __DIR__ . '/../data/bot_token.json';
    $now = time();

    // 读取缓存，若有效直接返回
    if (file_exists($cacheFile)) {
        $raw = file_get_contents($cacheFile);
        $data = json_decode($raw, true);
        if ($data && !empty($data['access_token']) && isset($data['expires_at'])) {
            if ($data['expires_at'] > $now + 60) {
                return $data['access_token'];
            }
        }
    }

    // 缓存过期或不存在 → 加文件锁后重新获取（防并发重复请求）
    $lockFile = $cacheFile . '.lock';
    $fp = fopen($lockFile, 'w');
    if ($fp && flock($fp, LOCK_EX)) {
        // double-check：可能另一个进程已经刷新过
        if (file_exists($cacheFile)) {
            $raw = file_get_contents($cacheFile);
            $data = json_decode($raw, true);
            if ($data && !empty($data['access_token']) && isset($data['expires_at'])
                && $data['expires_at'] > $now + 60) {
                flock($fp, LOCK_UN);
                fclose($fp);
                return $data['access_token'];
            }
        }

        // 请求 QQ API 获取新 token
        $ch = curl_init('https://api.bot.qq.com/app/getAppAccessToken');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode([
                'appId'        => BOT_APP_ID,
                'clientSecret' => BOT_APP_SECRET,
            ]),
            CURLOPT_TIMEOUT        => 15,
        ]);
        $res     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200 || !$res) {
            flock($fp, LOCK_UN);
            fclose($fp);
            throw new \RuntimeException("getAppAccessToken failed: HTTP {$httpCode}, curl_err: {$curlErr}, body: {$res}");
        }

        $result = json_decode($res, true);
        if (!$result || empty($result['access_token'])) {
            flock($fp, LOCK_UN);
            fclose($fp);
            throw new \RuntimeException("getAppAccessToken invalid response: {$res}");
        }

        $tokenData = [
            'access_token' => $result['access_token'],
            'expires_in'   => (int) ($result['expires_in'] ?? 7200),
            'expires_at'   => $now + (int) ($result['expires_in'] ?? 7200),
            'fetched_at'   => $now,
        ];

        // 原子写入
        $tmp = $cacheFile . '.tmp';
        file_put_contents($tmp, json_encode($tokenData, JSON_UNESCAPED_UNICODE));
        rename($tmp, $cacheFile);

        flock($fp, LOCK_UN);
        fclose($fp);

        return $tokenData['access_token'];
    }
    if ($fp) fclose($fp);

    throw new \RuntimeException('getBotAccessToken: unable to acquire lock');
}
