<?php

/**
 * 雾雨魔法店 · QQ Bot Webhook 入口
 * 
 * 接收 QQ 开放平台事件推送，验证签名，路由命令，回复消息。
 * 无需 Node.js 桥接 — 纯 PHP，Webhook 模式。
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bot_token.php';

// ── 调试日志（部署初期开启，稳定后可注释） ──
define('BOT_DEBUG', true);
function botLog($msg) {
    if (!BOT_DEBUG) return;
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n";
    file_put_contents(__DIR__ . '/../data/bot_debug.log', $line, FILE_APPEND | LOCK_EX);
}

// ═══════════════════════════════════════════
//  Ed25519 工具
// ═══════════════════════════════════════════

function getBotSeed() {
    $seed = BOT_APP_SECRET;
    while (strlen($seed) < 32) { $seed .= $seed; }
    return substr($seed, 0, 32);
}

function getBotKeypair() {
    static $keypair = null;
    if ($keypair === null) {
        $keypair = sodium_crypto_sign_seed_keypair(getBotSeed());
    }
    return $keypair;
}

// ═══════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════

try {
    $rawBody = file_get_contents('php://input');

    if (empty($rawBody)) {
        http_response_code(400);
        echo json_encode(['error' => 'empty body']);
        exit;
    }

    $payload = json_decode($rawBody, true);
    if (!$payload || !isset($payload['op'])) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid json']);
        exit;
    }

    $op = (int) $payload['op'];
    botLog("收到 op={$op}");

    // ── op=13: Webhook 验证握手 ──
    if ($op === 13) {
        handleValidation($payload);
        exit;
    }

    // ── op=0: 事件推送 ──
    if ($op === 0) {
        // 签名校验
        verifyWebhookSignature($rawBody);

        $eventType = $payload['t'] ?? '';
        $eventData = $payload['d'] ?? [];
        botLog("事件 t={$eventType}");

        // 仅处理群聊 @机器人 消息
        if ($eventType === 'GROUP_AT_MESSAGE_CREATE') {
            handleAtMessage($eventData);
        } elseif ($eventType === 'C2C_MESSAGE_CREATE') {
            handleC2cMessage($eventData);
        } elseif ($eventType === 'GROUP_ADD_ROBOT') {
            handleGroupAdd($eventData);
        }

        // ACK 确认收到
        echo json_encode(['op' => 12]);
        exit;
    }

    // 未知 opcode
    http_response_code(400);
    echo json_encode(['error' => 'unknown opcode']);

} catch (\Throwable $e) {
    botLog("异常: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

// ═══════════════════════════════════════════
//  Webhook 验证握手 (op=13)
// ═══════════════════════════════════════════

function handleValidation($payload) {
    $plainToken = $payload['d']['plain_token'] ?? '';
    $eventTs    = $payload['d']['event_ts'] ?? '';

    if (!$plainToken || !$eventTs) {
        http_response_code(400);
        echo json_encode(['error' => 'missing token or timestamp']);
        exit;
    }

    $keypair   = getBotKeypair();
    $secretKey = sodium_crypto_sign_privatekey($keypair);

    $message   = $eventTs . $plainToken;
    $signature = sodium_crypto_sign_detached($message, $secretKey);

    botLog("验证握手 plain_token={$plainToken}");

    echo json_encode([
        'plain_token' => $plainToken,
        'signature'   => bin2hex($signature),
    ]);
}

// ═══════════════════════════════════════════
//  签名验证
// ═══════════════════════════════════════════

function verifyWebhookSignature($rawBody) {
    $sigHex   = $_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? '';
    $timestamp = $_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? '';

    if (!$sigHex || !$timestamp) {
        // 首次配置时可能没有签名头，不阻断
        botLog("签名头缺失，跳过验证");
        return;
    }

    $signature = @hex2bin($sigHex);
    if (!$signature || strlen($signature) !== 64) {
        throw new \RuntimeException('invalid signature hex');
    }

    $keypair   = getBotKeypair();
    $publicKey = sodium_crypto_sign_publickey($keypair);

    $message = $timestamp . $rawBody;
    $valid   = sodium_crypto_sign_verify_detached($signature, $message, $publicKey);

    if (!$valid) {
        throw new \RuntimeException('signature verification failed');
    }
    botLog("签名验证通过");
}

// ═══════════════════════════════════════════
//  群聊 @机器人 消息处理
// ═══════════════════════════════════════════

function handleAtMessage($event) {
    $content      = trim($event['content'] ?? '');
    $msgId        = $event['id'] ?? '';
    $groupOpenid  = $event['group_openid'] ?? '';
    $authorName   = $event['author']['username'] ?? '';

    botLog("群消息 author={$authorName} group={$groupOpenid} content={$content}");

    if (!$content || !$groupOpenid) return;

    $reply = routeCommand($content);
    if ($reply !== null && $reply !== '') {
        botLog("回复: " . str_replace("\n", "\\n", mb_substr($reply, 0, 100)));
        sendGroupReply($groupOpenid, $reply, $msgId);
    }
}

// ═══════════════════════════════════════════
//  单聊消息处理
// ═══════════════════════════════════════════

function handleC2cMessage($event) {
    $content      = trim($event['content'] ?? '');
    $msgId        = $event['id'] ?? '';
    $userOpenid   = $event['author']['user_openid'] ?? '';

    botLog("单聊消息 content={$content}");

    if (!$content || !$userOpenid) return;

    $reply = routeCommand($content);
    if ($reply !== null && $reply !== '') {
        sendC2cReply($userOpenid, $reply, $msgId);
    }
}

// ═══════════════════════════════════════════
//  机器人被加入群聊
// ═══════════════════════════════════════════

function handleGroupAdd($event) {
    $groupOpenid = $event['group_openid'] ?? '';
    botLog("机器人被加入群聊 group={$groupOpenid}");
    // 入群打招呼
    $msg = "雾雨魔法店·QQ机器人 来了！\n"
         . "命令帮助：/help\n"
         . "本项目主页：www.azureflame.cloud";
    sendGroupMessage($groupOpenid, $msg);
}

// ═══════════════════════════════════════════
//  命令路由
// ═══════════════════════════════════════════

function routeCommand($content) {
    $content = ltrim($content);

    // ── /ping ──
    if (preg_match('#^/?(ping|PING)\s*$#', $content)) {
        return 'pong! 🧹';
    }

    // ── /help /帮助 ──
    if (preg_match('#^/?(help|帮助|h|命令|菜单)\s*$#i', $content)) {
        return "🧹 雾雨魔法店 · 机器人命令\n"
             . "━━━━━━━━━━\n"
             . "/ping    测试连接\n"
             . "/help    显示帮助\n"
             . "/排行     游戏排行榜 TOP5\n"
             . "/统计     测试触发统计\n"
             . "/幸存者   幸存者排行榜\n"
             . "/吃什么   今天吃什么推荐\n"
             . "/高考 [名] 模拟高考成绩\n"
             . "━━━━━━━━━━\n"
             . "官网：www.azureflame.cloud";
    }

    // ── /leaderboard /排行 /幸存者 ──
    if (preg_match('#^/?(排行|leaderboard|phb|幸存者|survivor)\s*(.*)$#iu', $content, $m)) {
        $game = trim($m[2]);
        // 幸存者 → survivor 榜
        if (!empty($m[1]) && stripos($m[1], '幸存') !== false) {
            $game = 'survivor';
        }
        return getLeaderboard($game);
    }

    // ── /stats /统计 ──
    if (preg_match('#^/?(stats|统计|数据)\s*$#i', $content)) {
        return getStats();
    }

    // ── /吃什么 /eat ──
    if (preg_match('#^/?(吃什么|eat|吃啥|午饭|晚饭|宵夜)\s*$#i', $content)) {
        return getFoodRecommendation();
    }

    // ── /高考 ──
    if (preg_match('#^/?(高考|gaokao|gk)\s+(.+)$#iu', $content, $m)) {
        $name = trim($m[2]);
        $name = mb_substr($name, 0, 10);
        return getGaokaoResult($name);
    }

    // ── /老婆 /waifu ──
    if (preg_match('#^/?(老婆|waifu|二次元老婆|随机角色)\s*$#i', $content)) {
        return getRandomWaifu();
    }

    // ── 模糊匹配：只在消息以 / 或特定关键词开头时回复 ──
    if (preg_match('#^/?(老婆|排行|统计|吃什么|高考|幸存者|help|ping)#iu', $content)) {
        return null; // 未识别但不回复（避免噪音）
    }

    return null;
}

// ═══════════════════════════════════════════
//  功能实现
// ═══════════════════════════════════════════

function getLeaderboard($game = '') {
    $file = __DIR__ . '/../data/leaderboard'
          . ($game ? '_' . preg_replace('/[^a-z0-9_-]/', '', strtolower($game)) : '')
          . '.json';

    if (!file_exists($file)) {
        return $game ? "「{$game}」暂无排行数据" : '暂无排行数据';
    }
    $entries = json_decode(file_get_contents($file), true);
    if (!is_array($entries) || count($entries) === 0) {
        return '暂无排行数据';
    }

    $title = $game ? strtoupper($game) : '跑酷';
    $lines = ["🏆 {$title} 排行榜 TOP 5："];
    $top = array_slice($entries, 0, 5);
    foreach ($top as $i => $e) {
        $no    = $i + 1;
        $medal = ($no === 1) ? '🥇' : (($no === 2) ? '🥈' : (($no === 3) ? '🥉' : "{$no}."));
        $graze = !empty($e['graze']) ? " 擦弹" . $e['graze'] : '';
        $score = number_format((int) ($e['score'] ?? 0));
        $lines[] = "{$medal} {$e['name']}  {$score}分{$graze}";
    }
    return implode("\n", $lines);
}

function getStats() {
    $file = __DIR__ . '/../data/counters.json';
    if (!file_exists($file)) {
        return '暂无统计数据';
    }
    $data = json_decode(file_get_contents($file), true);

    $eggs = $data['eggs'] ?? [];
    $discovered = 0;
    foreach ($eggs as $k => $v) {
        if (strpos($k, '_') === false) $discovered++;
    }

    $total = (int) ($data['total'] ?? 0);
    $today = (int) (($data['daily'] ?? [])[date('Y-m-d')] ?? 0);

    return "📊 雾雨魔法店 数据统计\n"
         . "已发现彩蛋：{$discovered} 个\n"
         . "累计测试触发：{$total} 次\n"
         . "今日触发：{$today} 次";
}

function getFoodRecommendation() {
    $foods = [
        '黄焖鸡米饭', '麻辣烫', '兰州拉面', '沙县小吃', '过桥米线',
        '酸菜鱼', '水煮肉片', '宫保鸡丁', '麻婆豆腐', '回锅肉',
        '螺蛳粉', '热干面', '煎饼果子', '肉夹馍', '凉皮',
        '烤串', '火锅', '麻辣香锅', '寿司', '披萨',
        '汉堡', '炸鸡', '石锅拌饭', '部队锅', '冬阴功',
        '泡面+鸡蛋', '蛋炒饭', '西红柿炒蛋', '红烧肉', '糖醋排骨',
        '白切鸡', '叉烧饭', '煲仔饭', '肠粉', '虾饺',
        '小龙虾', '烤鱼', '毛血旺', '辣子鸡', '钵钵鸡',
        '饺子', '馄饨', '包子', '油条', '豆浆',
        '葱油拌面', '阳春面', '炸酱面', '担担面', '冷面',
    ];

    $idx   = array_rand($foods);
    $food  = $foods[$idx];
    $today = date('m月d日');

    return "🍽 {$today} 推荐：\n{$food}！";
}

function getGaokaoResult($name) {
    $subjects = ['语文', '数学', '英语', '综合'];
    $scores   = [];
    $total    = 0;

    foreach ($subjects as $sub) {
        $s = match($sub) {
            '语文' => rand(60, 145),
            '数学' => rand(40, 150),
            '英语' => rand(50, 148),
            '综合' => rand(100, 300),
        };
        $scores[$sub] = $s;
        $total += $s;
    }

    if ($total >= 700 || ($scores['数学'] === 150 && $scores['综合'] >= 285)) {
        $comment = '清华北大稳了！这是要起飞啊 🚀';
    } elseif ($total >= 600) {
        $comment = '211 妥妥的，985 冲一冲！';
    } elseif ($total >= 500) {
        $comment = '一本线稳了，再努把力能更好~';
    } elseif ($total >= 400) {
        $comment = '发挥正常，本科在向你招手 ✨';
    } elseif ($total >= 200) {
        $comment = '……要不咱们看看专科？';
    } else {
        $comment = '你是蒙着眼睛答的题吗？😅';
    }

    $lines = ["📝 {$name} 的高考成绩："];
    foreach ($scores as $sub => $s) {
        $lines[] = "{$sub}：{$s} 分";
    }
    $lines[] = "总分：{$total} 分";
    $lines[] = $comment;

    return implode("\n", $lines);
}

function getRandomWaifu() {
    $dbFile = __DIR__ . '/../data/waifu-db-zh.json';
    if (!file_exists($dbFile)) {
        // fallback: load JS version
        $jsFile = __DIR__ . '/../data/waifu-db-zh.js';
        if (file_exists($jsFile)) {
            $content = file_get_contents($jsFile);
            if (preg_match('/var\s+WAIFU_DB\s*=\s*(\[[\s\S]*\]);?/', $content, $m)) {
                $chars = json_decode($m[1], true);
            }
        }
    } else {
        $chars = json_decode(file_get_contents($dbFile), true);
    }

    if (empty($chars) || !is_array($chars)) {
        return '角色库读取失败，待我来修修……';
    }

    $char = $chars[array_rand($chars)];
    $name = $char['name'] ?? '不知名角色';
    $tags = $char['tags'] ?? [];

    // 选 3-5 个标签
    if (!empty($tags)) {
        shuffle($tags);
        $showTags = array_slice($tags, 0, rand(3, min(5, count($tags))));
        $tagStr   = implode('、', $showTags);
        return "✨ 你的二次元老婆是：\n{$name}\n属性：{$tagStr}";
    }

    return "✨ 你的二次元老婆是：\n{$name}";
}

// ═══════════════════════════════════════════
//  QQ HTTP API 调用
// ═══════════════════════════════════════════

function sendGroupReply($groupOpenid, $content, $msgId) {
    sendGroupMessage($groupOpenid, $content, $msgId);
}

function sendGroupMessage($groupOpenid, $content, $msgId = null, $msgSeq = 1) {
    $token = getBotAccessToken();

    $body = [
        'msg_type' => 0,
        'content'  => $content,
        'msg_seq'  => $msgSeq,
    ];
    if ($msgId) $body['msg_id'] = $msgId;

    $ch = curl_init("https://api.bot.qq.com/v2/groups/{$groupOpenid}/messages");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: QQBot ' . $token,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => 10,
    ]);
    $res      = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        botLog("发送群消息失败 HTTP{$httpCode}: {$res}");
    }
}

function sendC2cReply($userOpenid, $content, $msgId) {
    $token = getBotAccessToken();

    $body = [
        'msg_type' => 0,
        'content'  => $content,
        'msg_seq'  => 1,
    ];
    if ($msgId) $body['msg_id'] = $msgId;

    $ch = curl_init("https://api.bot.qq.com/v2/users/{$userOpenid}/messages");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: QQBot ' . $token,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => 10,
    ]);
    $res      = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        botLog("发送单聊消息失败 HTTP{$httpCode}: {$res}");
    }
}
