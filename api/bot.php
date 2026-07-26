<?php

/**
 * 雾雨魔法店 · QQ Bot Webhook 入口
 * 
 * 接收 QQ 开放平台事件推送，验证签名，路由命令，回复消息。
 * 支持：纯文本 / Markdown / 内嵌键盘按钮 / 13 题老婆测试 / 排行榜 / 高考 / 吃什么...
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bot_token.php';

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
//  Markdown & 键盘工具
// ═══════════════════════════════════════════

function sendGroupMarkdown($groupOpenid, $markdown, $keyboard = null, $msgId = null, $msgSeq = 1) {
    $token = getBotAccessToken();

    $body = [
        'msg_type' => 2,
        'markdown' => ['content' => $markdown],
        'msg_seq'  => $msgSeq,
    ];
    if ($msgId)   $body['msg_id'] = $msgId;
    if ($keyboard) $body['keyboard'] = $keyboard;

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
        botLog("发送Markdown失败 HTTP{$httpCode}: {$res}");
    }
}

function quickButton($label, $data, $style = 1) {
    return [
        'id'          => 'btn_' . substr(md5($data), 0, 8),
        'render_data' => ['label' => $label, 'style' => $style],
        'action'      => ['type' => 2, 'permission' => ['type' => 2], 'data' => $data, 'enter' => true],
    ];
}

function linkButton($label, $url, $style = 0) {
    return [
        'id'          => 'lnk_' . substr(md5($url), 0, 8),
        'render_data' => ['label' => $label, 'style' => $style],
        'action'      => ['type' => 0, 'permission' => ['type' => 2], 'data' => $url],
    ];
}

function buildKeyboard($rows) {
    $keyRows = [];
    foreach ($rows as $row) {
        $keyRows[] = ['buttons' => $row];
    }
    return ['content' => ['rows' => $keyRows]];
}

// ═══════════════════════════════════════════
//  Waifu 测试引擎
// ═══════════════════════════════════════════

function getWaifuQuestions() {
    return [
        // ── Layer 1: 3 题硬过滤 ──
        ['q' => '你偏好哪种性格气质？', 'layer' => 1, 'dim' => 'personality', 'opts' => [
            ['t' => '温柔治愈 — 善解人意，给人安心感',     'tags' => ['gentle']],
            ['t' => '傲娇反差 — 表面冷淡心里火热',        'tags' => ['tsundere']],
            ['t' => '元气活泼 — 精力充沛，带动气氛',      'tags' => ['genki', 'airhead']],
            ['t' => '冷傲神秘 — 话少但有深度、有故事',    'tags' => ['kuudere', 'mysterious']],
            ['t' => '成熟可靠 — 理性担当，像姐姐一样',    'tags' => ['mature']],
            ['t' => '强势执着 — 极致人格、危险又迷人',    'tags' => ['queen', 'yandere', 'cold']],
        ]],
        ['q' => '你偏好什么年龄段（外表）？', 'layer' => 1, 'dim' => 'age_visual', 'opts' => [
            ['t' => '萝莉型 — 娇小可爱，让人想保护',      'tags' => ['age_v_loli']],
            ['t' => '少女型 — 青春年华，最经典的二次元',  'tags' => ['age_v_teen']],
            ['t' => '御姐型 — 成熟魅力，气场全开',        'tags' => ['age_v_mature']],
            ['t' => '不太在意 — 觉得感觉对了就好',        'tags' => ['age_v_loli', 'age_v_teen', 'age_v_mature']],
        ]],
        ['q' => '你偏好什么样的作品氛围？', 'layer' => 1, 'dim' => 'series_tone', 'opts' => [
            ['t' => '热血战斗 — 燃到爆炸的世界',          'tags' => ['tone_battle']],
            ['t' => '恋爱日常 — 甜蜜温馨的校园',          'tags' => ['tone_romance']],
            ['t' => '黑暗深沉 — 有代价的世界观',          'tags' => ['tone_dark', 'tone_survival']],
            ['t' => '治愈温情 — 温暖慢节奏',              'tags' => ['tone_healing']],
            ['t' => '搞笑欢乐 — 每天都有乐子',            'tags' => ['tone_comedy']],
            ['t' => '科幻奇幻 — 超越现实',                'tags' => ['tone_scifi']],
        ]],

        // ── Layer 2: 4 题硬过滤 ──
        ['q' => '你偏好什么身份设定？', 'layer' => 2, 'dim' => 'role', 'opts' => [
            ['t' => '学生/校园 — 青春的校园生活',         'tags' => ['student', 'transfer', 'class_officer']],
            ['t' => '战士/战斗系 — 并肩作战的英姿',       'tags' => ['warrior', 'assassin']],
            ['t' => '偶像/艺人 — 聚光灯下的她',           'tags' => ['idol']],
            ['t' => '魔法/异能者 — 超越常人的力量',       'tags' => ['mage', 'godly']],
            ['t' => '贵族/大小姐 — 高贵优雅',             'tags' => ['noble']],
            ['t' => '职场/社会人 — 独立成熟',             'tags' => ['office_lady', 'scientist', 'detective']],
        ]],
        ['q' => '你偏好什么样的相处模式？', 'layer' => 2, 'dim' => 'relationship', 'opts' => [
            ['t' => '她依靠你 — 你是她的港湾',            'tags' => ['rel_dependent']],
            ['t' => '并肩作战 — 恋人就是战友',            'tags' => ['rel_equal']],
            ['t' => '她引领你 — 她有你想要的力量',        'tags' => ['rel_leader']],
            ['t' => '她治愈你 — 温暖你的心',              'tags' => ['rel_healer']],
            ['t' => '轻松搭子 — 各自安好有默契',          'tags' => ['rel_buddy']],
        ]],
        ['q' => '你偏好什么样的沟通风格？', 'layer' => 2, 'dim' => 'communication', 'opts' => [
            ['t' => '直接坦率 — 有什么说什么',            'tags' => ['comm_frank']],
            ['t' => '含蓄内敛 — 话不多但走心',            'tags' => ['comm_reserved']],
            ['t' => '毒舌吐槽 — 犀利幽默日常',            'tags' => ['comm_snarky']],
            ['t' => '寡言少语 — 静静的陪伴',              'tags' => ['comm_silent']],
            ['t' => '甜美可爱 — 声音甜到心里',            'tags' => ['comm_sweet']],
            ['t' => '理性冷静 — 沟通高效',                'tags' => ['comm_rational']],
        ]],
        ['q' => '你更看重什么样的价值观？', 'layer' => 2, 'dim' => 'values', 'opts' => [
            ['t' => '正义秩序 — 是非分明',                'tags' => ['val_justice']],
            ['t' => '自由不羁 — 不被束缚',                'tags' => ['val_freedom']],
            ['t' => '善良利他 — 愿为他人付出',            'tags' => ['val_kindness']],
            ['t' => '守护奉献 — 愿为重要之人牺牲',        'tags' => ['val_protective']],
            ['t' => '独立自主 — 坚定的自我',              'tags' => ['val_independent']],
        ]],

        // ── Layer 3: 4 题软加权 ──
        ['q' => '你偏好什么发色？', 'layer' => 3, 'dim' => 'hair', 'opts' => [
            ['t' => '黑发 / 深色 — 东方经典',             'tags' => ['hair_black', 'hair_brown']],
            ['t' => '白毛 / 银发 — 清冷仙气',             'tags' => ['hair_white']],
            ['t' => '金发 — 耀眼洋气',                   'tags' => ['hair_blonde']],
            ['t' => '红粉系 — 热情可爱',                  'tags' => ['hair_red']],
            ['t' => '蓝/紫/绿 — 冷静神秘',                'tags' => ['hair_blue', 'hair_purple', 'hair_green']],
            ['t' => '不太在意发色',                        'tags' => []],
        ]],
        ['q' => '你偏好什么身材肤色？', 'layer' => 3, 'dim' => 'body', 'opts' => [
            ['t' => '纤细/贫乳 — 萝莉体型',               'tags' => ['body_petite', 'body_slim', 'body_loli_height']],
            ['t' => '丰满/巨乳 — 傲人曲线',               'tags' => ['body_busty']],
            ['t' => '高挑修长 — 御姐身材',                'tags' => ['body_tall']],
            ['t' => '白皙皮肤 — 瓷娃娃般',                'tags' => ['skin_pale']],
            ['t' => '小麦/黑皮 — 健康活力',               'tags' => ['skin_tanned']],
            ['t' => '不太在意身材肤色',                    'tags' => []],
        ]],
        ['q' => '你喜欢什么样的瞳色？', 'layer' => 3, 'dim' => 'eye', 'opts' => [
            ['t' => '红瞳 — 危险魅惑',                   'tags' => ['eye_red']],
            ['t' => '蓝/青瞳 — 冷静清澈',                'tags' => ['eye_blue']],
            ['t' => '紫瞳 — 神秘高贵',                   'tags' => ['eye_purple']],
            ['t' => '金瞳 — 威严神性',                   'tags' => ['eye_gold']],
            ['t' => '棕/黑瞳 — 自然邻家',                'tags' => ['eye_brown']],
            ['t' => '不太在意瞳色',                        'tags' => []],
        ]],
        ['q' => '你喜欢什么服装风格？', 'layer' => 3, 'dim' => 'wardrobe', 'opts' => [
            ['t' => '校服/制服 — 青春感',                 'tags' => ['cloth_uniform']],
            ['t' => '战斗装/铠甲 — 英姿飒爽',             'tags' => ['cloth_armor']],
            ['t' => '和风/巫女服 — 东方美',               'tags' => ['cloth_kimono']],
            ['t' => '优雅礼服 — 高贵动人',                'tags' => ['cloth_elegant']],
            ['t' => '休闲便服 — 自然舒适',                'tags' => ['cloth_casual']],
            ['t' => '哥特/暗黑 — 独特气质',               'tags' => ['cloth_gothic']],
        ]],

        // ── Layer 4: 2 题精排 ──
        ['q' => '这么多特质里，你觉得最重要的是？', 'layer' => 4, 'dim' => 'priority', 'opts' => [
            ['t' => '性格契合 — 脾气要对',                'weightDims' => ['personality']],
            ['t' => '外貌吸引 — 看着要心动',              'weightDims' => ['hair', 'body', 'eye', 'wardrobe', 'expression']],
            ['t' => '相处舒适 — 在一起要舒服',            'weightDims' => ['relationship', 'communication', 'values']],
            ['t' => '世界观共鸣 — 来自对的作品',          'weightDims' => ['series_tone', 'role']],
        ]],
        ['q' => '有没有绝对不能接受的？', 'layer' => 4, 'dim' => 'penalty', 'opts' => [
            ['t' => '病娇/危险人格 — 太可怕',             'penaltyTags' => ['yandere', 'cold']],
            ['t' => '太黏人 — 需要独立空间',              'penaltyTags' => ['imouto', 'rel_dependent']],
            ['t' => '太冷淡 — 像隔着墙',                  'penaltyTags' => ['no_expression', 'kuudere', 'comm_silent']],
            ['t' => '黑暗残酷背景 — 怕虐',                'penaltyTags' => ['tone_dark', 'tone_survival']],
            ['t' => '特殊外形(兽耳等) — 不习惯',           'penaltyTags' => ['sp_nekomimi', 'sp_tail', 'sp_horn', 'sp_wings', 'sp_inhuman']],
            ['t' => '没什么特别不能接受的',                'penaltyTags' => []],
        ]],
    ];
}

function loadWaifuDB() {
    static $db = null;
    if ($db !== null) return $db;

    $file = __DIR__ . '/../data/waifu-db-zh.json';
    if (!file_exists($file)) {
        $file = __DIR__ . '/../data/waifu-db-zh.js';
        if (file_exists($file)) {
            $content = file_get_contents($file);
            if (preg_match('/var\s+WAIFU_DB\s*=\s*(\[[\s\S]*\]);?/', $content, $m)) {
                $db = json_decode($m[1], true);
            }
        }
    } else {
        $db = json_decode(file_get_contents($file), true);
    }
    if (!is_array($db)) $db = [];
    return $db;
}

function getCharTagIds($char, $dim) {
    if (!isset($char['tags'][$dim])) return [];
    $ids = [];
    foreach ($char['tags'][$dim] as $t) {
        $ids[] = $t['id'];
    }
    return $ids;
}

function hasAnyTag($charTags, $answerTags) {
    foreach ($answerTags as $t) {
        if (in_array($t, $charTags)) return true;
    }
    return false;
}

function computeWaifuResults($answers) {
    $db = loadWaifuDB();
    if (empty($db)) return [];

    $l1 = array_values(array_filter($answers, fn($a) => $a['layer'] === 1));
    $l2 = array_values(array_filter($answers, fn($a) => $a['layer'] === 2));
    $l3 = array_values(array_filter($answers, fn($a) => $a['layer'] === 3));
    $l4 = array_values(array_filter($answers, fn($a) => $a['layer'] === 4));
    $q12 = $l4[0] ?? null;
    $q13 = $l4[1] ?? null;

    // Level 0: L1+L2 硬过滤 + L3 软加权
    $r = waifuMatchScore(array_merge($l1, $l2), $l3, $q12, $q13, $db);
    if (count($r) >= 3) return array_slice($r, 0, 5);

    // Level 1: 仅 L1 硬过滤，L2+L3 软加权
    $r = waifuMatchScore($l1, array_merge($l2, $l3), $q12, $q13, $db);
    if (count($r) >= 3) return array_slice($r, 0, 5);

    // Level 2: 全部软加权
    $r = waifuMatchScore([], array_merge($l1, $l2, $l3), $q12, $q13, $db);
    if (count($r) >= 3) return array_slice($r, 0, 5);

    // Level 3: 究极兜底 — 纯随机
    shuffle($db);
    $fallback = [];
    $top = array_slice($db, 0, 5);
    foreach ($top as $i => $c) {
        $fallback[] = formatWaifuChar($c, 93 - $i * 4);
    }
    return $fallback;
}

function waifuMatchScore($hardFilters, $softFilters, $q12, $q13, $pool) {
    // Hard filter
    $passed = array_filter($pool, function($char) use ($hardFilters) {
        foreach ($hardFilters as $a) {
            if (empty($a['tags'])) continue;
            $ct = getCharTagIds($char, $a['dim']);
            if (!hasAnyTag($ct, $a['tags'])) return false;
        }
        return true;
    });

    // Soft scoring
    $scored = [];
    foreach ($passed as $char) {
        $score = 0;
        foreach ($softFilters as $a) {
            if (empty($a['tags'])) continue;
            $ct = getCharTagIds($char, $a['dim']);
            foreach ($a['tags'] as $t) {
                if (in_array($t, $ct)) $score += 1;
            }
        }
        $scored[] = ['char' => $char, 'score' => $score];
    }

    // Q12 weight bonus + Q13 penalty
    foreach ($scored as &$item) {
        if ($q12 && !empty($q12['weightDims'])) {
            $allAns = array_merge($hardFilters, $softFilters);
            foreach ($allAns as $a) {
                if (empty($a['tags'])) continue;
                if (in_array($a['dim'], $q12['weightDims'])) {
                    $ct = getCharTagIds($item['char'], $a['dim']);
                    foreach ($a['tags'] as $t) {
                        if (in_array($t, $ct)) $item['score'] += 2;
                    }
                }
            }
        }
        if ($q13 && !empty($q13['penaltyTags'])) {
            foreach ($item['char']['tags'] as $dim => $tagObjs) {
                foreach ($tagObjs as $t) {
                    if (in_array($t['id'], $q13['penaltyTags'])) {
                        $item['score'] -= 2;
                    }
                }
            }
        }
    }
    unset($item);

    usort($scored, fn($a, $b) => $b['score'] - $a['score']);
    if (empty($scored)) return [];

    $max = $scored[0]['score'];
    $results = [];
    foreach ($scored as $item) {
        $pct = $max > 0 ? round(80 + (max(0, $item['score']) / max(1, $max)) * 18) : 80;
        $results[] = formatWaifuChar($item['char'], $pct);
    }
    return $results;
}

function formatWaifuChar($char, $match) {
    return [
        'id'           => $char['id'] ?? 0,
        'name'         => $char['name'] ?? '未知角色',
        'name_native'  => $char['name_native'] ?? '',
        'source_anime' => $char['source_anime'] ?? '',
        'description'  => $char['description'] ?? '',
        'tags'         => $char['tags'] ?? [],
        'match'        => $match,
    ];
}

// ═══════════════════════════════════════════
//  Waifu 测试会话管理
// ═══════════════════════════════════════════

function getSessionFile() {
    return __DIR__ . '/../data/waifu_quiz_sessions.json';
}

function loadSessions() {
    $file = getSessionFile();
    if (!file_exists($file)) return [];
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

function saveSessions($sessions) {
    $file = getSessionFile();
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($sessions, JSON_UNESCAPED_UNICODE));
    rename($tmp, $file);
}

function cleanupExpiredSessions(&$sessions) {
    $now = time();
    foreach ($sessions as $key => $s) {
        if (($s['expires_at'] ?? 0) < $now) unset($sessions[$key]);
    }
}

function renderWaifuQuestion($q, $qIndex, $total) {
    $md = "## 📝 第 {$qIndex}/{$total} 题\n";
    $md .= "{$q['q']}\n\n";
    $md .= "点击下方选项或发送 /答 数字";

    $buttons = [];
    $row = [];
    foreach ($q['opts'] as $i => $opt) {
        $row[] = quickButton(($i + 1), "/答 " . ($i + 1), 1);
        if (count($row) >= 3) {
            $buttons[] = $row;
            $row = [];
        }
    }
    if (!empty($row)) $buttons[] = $row;

    // 取消按钮
    $buttons[] = [quickButton('取消测试', '/取消测试', 0)];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function renderWaifuResults($results) {
    if (empty($results)) return ['markdown' => '匹配失败，请重试...', 'keyboard' => null];

    $top = $results[0];
    $md = "## ✨ 测试完成！你的二次元老婆\n\n";
    $md .= "### 🥇 {$top['name']}";
    if ($top['name_native']) $md .= "（{$top['name_native']}）";
    $md .= "\n";
    if ($top['source_anime']) $md .= "**{$top['source_anime']}** · ";
    $md .= "匹配度 **{$top['match']}%**\n\n";
    if ($top['description']) {
        $desc = mb_substr($top['description'], 0, 120);
        $md .= "{$desc}\n\n";
    }

    // TOP 2-5
    if (count($results) > 1) {
        $md .= "---\n**备选结果：**\n";
        foreach (array_slice($results, 1) as $i => $r) {
            $no = $i + 2;
            $src = $r['source_anime'] ? " · *{$r['source_anime']}*" : '';
            $md .= "{$no}. **{$r['name']}**{$src}  —  {$r['match']}%\n";
        }
    }

    $buttons = [
        [quickButton('再来一次', '/老婆测试', 1), linkButton('去网站测完整版', 'https://www.azureflame.cloud/quiz-waifu-3.html', 0)],
    ];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function handleStartWaifuQuiz($memberOpenid, $groupOpenid, $msgId) {
    $questions = getWaifuQuestions();
    $sessions = loadSessions();
    cleanupExpiredSessions($sessions);

    $sessions[$memberOpenid] = [
        'state'        => 'answering',
        'current_q'    => 0,
        'answers'      => [],
        'started_at'   => time(),
        'expires_at'   => time() + 600,
        'group_openid' => $groupOpenid,
    ];
    saveSessions($sessions);

    $q = $questions[0];
    $rendered = renderWaifuQuestion($q, 1, count($questions));
    sendGroupMarkdown($groupOpenid, $rendered['markdown'], $rendered['keyboard'], $msgId);
}

function handleWaifuAnswer($memberOpenid, $groupOpenid, $msgId, $num) {
    $questions = getWaifuQuestions();
    $sessions = loadSessions();
    cleanupExpiredSessions($sessions);

    if (!isset($sessions[$memberOpenid]) || $sessions[$memberOpenid]['state'] !== 'answering') {
        sendGroupMessage($groupOpenid, '你还没有开始测试。发送 /老婆测试 开始吧~', $msgId);
        return;
    }

    $session = &$sessions[$memberOpenid];
    $qIndex = $session['current_q'];

    if ($num < 1 || $num > count($questions[$qIndex]['opts'])) {
        sendGroupMarkdown($groupOpenid, "请输入 1~" . count($questions[$qIndex]['opts']) . " 之间的数字哦~", null, $msgId);
        return;
    }

    // Record answer
    $chosen = $questions[$qIndex]['opts'][$num - 1];
    $session['answers'][] = [
        'layer'        => $questions[$qIndex]['layer'],
        'dim'          => $questions[$qIndex]['dim'],
        'tags'         => $chosen['tags'] ?? [],
        'weightDims'   => $chosen['weightDims'] ?? null,
        'penaltyTags'  => $chosen['penaltyTags'] ?? null,
    ];
    $session['expires_at'] = time() + 600;

    // Advance to next question
    $session['current_q'] = $qIndex + 1;

    if ($session['current_q'] >= count($questions)) {
        // Quiz complete
        $session['state'] = 'done';
        saveSessions($sessions);

        sendGroupMessage($groupOpenid, '✨ 测试完成！正在进行智能匹配...', $msgId);

        $results = computeWaifuResults($session['answers']);
        $rendered = renderWaifuResults($results);
        sendGroupMarkdown($groupOpenid, $rendered['markdown'], $rendered['keyboard']);

        // Clean up session
        unset($sessions[$memberOpenid]);
        saveSessions($sessions);
        return;
    }

    saveSessions($sessions);

    // Send next question
    $q = $questions[$session['current_q']];
    $rendered = renderWaifuQuestion($q, $session['current_q'] + 1, count($questions));

    $pos = mb_strpos($chosen['t'], ' — ');
    $ack = ($pos !== false) ? mb_substr($chosen['t'], 0, $pos) : $chosen['t'];
    sendGroupMessage($groupOpenid, "✅ 已选择「{$ack}」", $msgId);

    sendGroupMarkdown($groupOpenid, $rendered['markdown'], $rendered['keyboard']);
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

    if ($op === 13) {
        handleValidation($payload);
        exit;
    }

    if ($op === 0) {
        verifyWebhookSignature($rawBody);

        $eventType = $payload['t'] ?? '';
        $eventData = $payload['d'] ?? [];
        botLog("事件 t={$eventType}");

        if ($eventType === 'GROUP_AT_MESSAGE_CREATE') {
            handleAtMessage($eventData);
        } elseif ($eventType === 'C2C_MESSAGE_CREATE') {
            handleC2cMessage($eventData);
        } elseif ($eventType === 'GROUP_ADD_ROBOT') {
            handleGroupAdd($eventData);
        }

        echo json_encode(['op' => 12]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'unknown opcode']);

} catch (\Throwable $e) {
    botLog("异常: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
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
    $secretKey = sodium_crypto_sign_secretkey($keypair);

    $message   = $eventTs . $plainToken;
    $signature = sodium_crypto_sign_detached($message, $secretKey);

    botLog("验证握手 plain_token={$plainToken}");

    echo json_encode([
        'plain_token' => $plainToken,
        'signature'   => bin2hex($signature),
    ]);
}

function verifyWebhookSignature($rawBody) {
    $sigHex   = $_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? '';
    $timestamp = $_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? '';

    if (!$sigHex || !$timestamp) {
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
    $memberOpenid = $event['author']['member_openid'] ?? '';

    botLog("群消息 author={$authorName} group={$groupOpenid} content={$content}");

    if (!$content || !$groupOpenid) return;

    // Waifu quiz commands (need session state, handled before normal routing)
    if (preg_match('#^/?(老婆测试|waifu_test|waifutest|开始测试|重置测试|再测)\s*$#i', $content)) {
        handleStartWaifuQuiz($memberOpenid, $groupOpenid, $msgId);
        return;
    }
    if (preg_match('#^/?(答|A)\s*(\d+)\s*$#iu', $content, $m)) {
        handleWaifuAnswer($memberOpenid, $groupOpenid, $msgId, (int) $m[2]);
        return;
    }
    if (preg_match('#^/?(取消测试|cancel|quit|不测了)\s*$#i', $content)) {
        $sessions = loadSessions();
        unset($sessions[$memberOpenid]);
        saveSessions($sessions);
        sendGroupMessage($groupOpenid, '测试已取消。随时 /老婆测试 重新开始~', $msgId);
        return;
    }

    // Normal command routing
    $result = routeCommand($content);

    if (is_array($result)) {
        sendGroupMarkdown($groupOpenid, $result['markdown'], $result['keyboard'] ?? null, $msgId);
    } elseif (is_string($result) && $result !== '') {
        sendGroupMessage($groupOpenid, $result, $msgId);
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
    if (is_string($reply) && $reply !== '') {
        sendC2cReply($userOpenid, $reply, $msgId);
    }
}

// ═══════════════════════════════════════════
//  机器人被加入群聊
// ═══════════════════════════════════════════

function handleGroupAdd($event) {
    $groupOpenid = $event['group_openid'] ?? '';
    botLog("机器人被加入群聊 group={$groupOpenid}");

    $md = "## 🌟 雾雨魔法店 · QQ机器人\n\n"
        . "已连接！回复命令即可互动：\n\n"
        . "- **/help**  帮助菜单\n"
        . "- **/老婆测试**  13题二次元老婆测试\n"
        . "- **/排行**  游戏排行榜\n"
        . "- **/吃什么**  今天吃啥\n"
        . "- **/高考** [姓名]  模拟高考\n\n"
        . "[🌐 官方网站](https://www.azureflame.cloud)";

    sendGroupMarkdown($groupOpenid, $md);
}

// ═══════════════════════════════════════════
//  命令路由（返回 string 或 Markdown 数组）
// ═══════════════════════════════════════════

function routeCommand($content) {
    $content = ltrim($content);

    // /ping
    if (preg_match('#^/?(ping|PING)\s*$#', $content)) {
        return 'pong!';
    }

    // /help
    if (preg_match('#^/?(help|帮助|h|命令|菜单)\s*$#i', $content)) {
        return getHelpMarkdown();
    }

    // /leaderboard /排行 /幸存者
    if (preg_match('#^/?(排行|leaderboard|phb|幸存者|survivor)\s*(.*)$#iu', $content, $m)) {
        $game = trim($m[2]);
        if (!empty($m[1]) && stripos($m[1], '幸存') !== false) {
            $game = 'survivor';
        }
        return getLeaderboardMarkdown($game);
    }

    // /stats /统计
    if (preg_match('#^/?(stats|统计|数据)\s*$#i', $content)) {
        return getStats();
    }

    // /吃什么
    if (preg_match('#^/?(吃什么|eat|吃啥|午饭|晚饭|宵夜)\s*$#i', $content)) {
        return getFoodRecommendation();
    }

    // /高考
    if (preg_match('#^/?(高考|gaokao|gk)\s+(.+)$#iu', $content, $m)) {
        $name = trim($m[2]);
        $name = mb_substr($name, 0, 10);
        return getGaokaoMarkdown($name);
    }

    // /老婆 (random waifu — quick version, no quiz)
    if (preg_match('#^/?(老婆|waifu|二次元老婆|随机角色)\s*$#i', $content)) {
        return getRandomWaifuMarkdown();
    }

    // Fallback guard
    if (preg_match('#^/?(老婆测试|排行|统计|吃什么|高考|幸存者|help|ping|答)#iu', $content)) {
        return null;
    }

    return null;
}

// ═══════════════════════════════════════════
//  功能实现 — Markdown 版本
// ═══════════════════════════════════════════

function getHelpMarkdown() {
    $md = "## 🧹 雾雨魔法店 · 机器人命令\n\n"
        . "| 命令 | 说明 |\n"
        . "|------|------|\n"
        . "| `/老婆测试` | 13题完整二次元老婆鉴定 |\n"
        . "| `/老婆` | 随机翻老婆牌子 |\n"
        . "| `/排行` | 魔理沙快跑排行榜 |\n"
        . "| `/幸存者` | 魔理沙幸存者排行榜 |\n"
        . "| `/统计` | 全站测试触发统计 |\n"
        . "| `/吃什么` | 今天吃啥推荐 |\n"
        . "| `/高考 [姓名]` | 模拟高考成绩 |\n"
        . "| `/ping` | 测试连接 |\n\n"
        . "官网：[www.azureflame.cloud](https://www.azureflame.cloud)";

    $buttons = [[
        quickButton('老婆测试', '/老婆测试', 1),
        quickButton('游戏排行榜', '/排行', 1),
        linkButton('去网站看看', 'https://www.azureflame.cloud', 0),
    ]];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function getLeaderboardMarkdown($game = '') {
    $file = __DIR__ . '/../data/leaderboard'
          . ($game ? '_' . preg_replace('/[^a-z0-9_-]/', '', strtolower($game)) : '')
          . '.json';

    $title = $game ? '魔理沙幸存者' : '魔理沙快跑';
    $gameKey = $game ?: 'dash';

    if (!file_exists($file)) {
        return ['markdown' => "## 🏆 {$title} 排行榜\n\n暂无排行数据", 'keyboard' => buildKeyboard([[
            quickButton($game ? '魔理沙快跑' : '魔理沙幸存者',
                $game ? '/排行' : '/幸存者', 1),
        ]])];
    }

    $entries = json_decode(file_get_contents($file), true);
    if (!is_array($entries) || count($entries) === 0) {
        return ['markdown' => "## 🏆 {$title} 排行榜\n\n暂无排行数据", 'keyboard' => buildKeyboard([[
            quickButton($game ? '魔理沙快跑' : '魔理沙幸存者',
                $game ? '/排行' : '/幸存者', 1),
        ]])];
    }

    $md = "## 🏆 {$title} 排行榜\n\n";
    $md .= "| # | 玩家 | 分数 | 其他 |\n";
    $md .= "|---|------|------|------|\n";

    $top = array_slice($entries, 0, 20);
    foreach ($top as $i => $e) {
        $no    = $i + 1;
        $name  = mb_substr($e['name'] ?? '???', 0, 10);
        $score = number_format((int) ($e['score'] ?? 0));
        $extra = !empty($e['graze']) ? "擦弹{$e['graze']}" : ($e['time'] ?? '-');
        $md .= "| {$no} | {$name} | {$score} | {$extra} |\n";
    }

    $buttons = [[
        quickButton($game ? '魔理沙快跑' : '魔理沙幸存者',
            $game ? '/排行' : '/幸存者', 1),
    ]];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function getGaokaoMarkdown($name) {
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

    $md = "## 📝 {$name} 的高考成绩\n\n";
    $md .= "| 科目 | 分数 |\n";
    $md .= "|------|------|\n";
    foreach ($scores as $sub => $s) {
        $md .= "| {$sub} | {$s} |\n";
    }
    $md .= "| **总分** | **{$total}** |\n\n";
    $md .= "{$comment}";

    $buttons = [[
        quickButton('再来一次', "/高考 {$name}", 1),
    ]];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function getRandomWaifuMarkdown() {
    $db = loadWaifuDB();
    if (empty($db)) {
        return '角色库读取失败，待我来修修……';
    }

    $char = $db[array_rand($db)];
    $name = $char['name'] ?? '不知名角色';
    $native = $char['name_native'] ?? '';
    $source = $char['source_anime'] ?? '';
    $desc = $char['description'] ?? '';
    $tags = $char['tags'] ?? [];

    $tagLines = [];
    foreach ($tags as $dim => $tagObjs) {
        foreach ($tagObjs as $t) {
            $tagLines[] = $t['id'];
        }
    }
    shuffle($tagLines);
    $showTags = implode(' · ', array_slice($tagLines, 0, 6));

    $match = rand(80, 98);

    $md = "## ✨ 你的随缘老婆\n\n";
    $md .= "### {$name}";
    if ($native) $md .= "（{$native}）";
    $md .= "\n";
    if ($source) $md .= "**{$source}** · ";
    $md .= "匹配度 **{$match}%**\n\n";
    if ($desc) {
        $md .= mb_substr($desc, 0, 100) . "\n\n";
    }
    if ($showTags) {
        $md .= "属性：{$showTags}\n";
    }

    $buttons = [[
        quickButton('换一个', '/老婆', 3),
        quickButton('做完整测试', '/老婆测试', 1),
        linkButton('去网站测', 'https://www.azureflame.cloud/quiz-waifu-3.html', 0),
    ]];

    return ['markdown' => $md, 'keyboard' => buildKeyboard($buttons)];
}

function getStats() {
    $file = __DIR__ . '/../data/counters.json';
    if (!file_exists($file)) return '暂无统计数据';

    $data = json_decode(file_get_contents($file), true);
    $eggs = $data['eggs'] ?? [];
    $discovered = 0;
    foreach ($eggs as $k => $v) {
        if (strpos($k, '_') === false) $discovered++;
    }
    $total = (int) ($data['total'] ?? 0);
    $today = (int) (($data['daily'] ?? [])[date('Y-m-d')] ?? 0);

    return "📊 雾雨魔法店 数据统计\n已发现彩蛋：{$discovered} 个\n累计测试触发：{$total} 次\n今日触发：{$today} 次";
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
    return "🍽 {$today} 推荐：{$food}！";
}

// ═══════════════════════════════════════════
//  QQ HTTP API 调用
// ═══════════════════════════════════════════

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
