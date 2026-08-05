<?php
// =============================================
//  霧雨魔法店 · 账本解析接口(需登录)
//  action=image  截图 → 视觉模型 → 候选记录 JSON
//  action=csv    CSV 内容 → 规则解析 → 候选记录(异常格式 LLM 兜底)
//  原图解析后立即删除
// =============================================

require __DIR__ . '/auth-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$user = mms_require_user();
$action = strtolower(trim($_REQUEST['action'] ?? ''));

$uploadDir = __DIR__ . '/../data/uploads';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

// ── LLM 调用(智谱 OpenAI 兼容)──
function mms_llm_config(): ?array {
    $f = __DIR__ . '/llm-config.php';
    if (!file_exists($f)) return null;
    $cfg = require $f;
    return is_array($cfg) && !empty($cfg['api_key']) ? $cfg : null;
}

function mms_llm_chat(array $messages, string $model, bool $jsonMode = false): array {
    $cfg = mms_llm_config();
    if (!$cfg) return ['ok' => false, 'error' => 'LLM 未配置', 'http_code' => 0];
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'temperature' => 0.1,
    ];
    if ($jsonMode) $payload['response_format'] = ['type' => 'json_object'];
    $ch = curl_init($cfg['base_url'] . '/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $cfg['api_key'],
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($resp === false) return ['ok' => false, 'error' => '请求失败: ' . $err, 'http_code' => 0];
    if ($code !== 200) {
        $msg = 'HTTP ' . $code;
        $data = json_decode($resp, true);
        if (isset($data['error']['message'])) $msg .= ' ' . $data['error']['message'];
        return ['ok' => false, 'error' => $msg, 'http_code' => $code];
    }
    $data = json_decode($resp, true);
    $content = $data['choices'][0]['message']['content'] ?? null;
    return ['ok' => $content !== null, 'content' => (string)$content, 'error' => '内容为空', 'http_code' => 200];
}

// 带模型降级的调用: 主模型失败自动试备选; 限流(429/1305)秒切不重试
function mms_llm_try(array $messages, bool $jsonMode, string $kind): ?array {
    $cfg = mms_llm_config();
    if (!$cfg) return null;
    $models = [];
    if ($kind === 'vision') $models = [$cfg['vision_model'], $cfg['vision_fallback'] ?? null];
    else $models = [$cfg['text_model']];
    $lastErr = '';
    foreach ($models as $m) {
        if (!$m) continue;
        $r = mms_llm_chat($messages, $m, $jsonMode);
        if ($r['ok']) return $r;
        $lastErr = $r['error'];
        // 限流/配额错误 → 立即换模型, 不重试
        if (($r['http_code'] ?? 0) === 429) continue;
    }
    return ['error' => $lastErr];
}

// ── 金额归一: "12.50元" / "1,234.56" / "¥5" → 分 ──
function mms_parse_amount(string $raw): ?int {
    $s = preg_replace('/[^0-9.\-]/', '', $raw);
    if ($s === '' || $s === '-' || $s === '.') return null;
    $n = round((float)$s * 100);
    if ($n <= 0) return null;
    return (int)$n;
}

function mms_parse_time(string $raw): string {
    // 2026-08-04 12:30 / 2026/8/4 / 08-04 12:30 → Y-m-d H:i:s
    $s = trim($raw);
    $s = str_replace('/', '-', $s);
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})([ T](\d{1,2}):(\d{2})(:\d{2})?)?$/', $s, $m)) {
        $h = $m[5] ?? '00';
        $i = $m[6] ?? '00';
        $sec = isset($m[7]) && strlen($m[7]) > 1 ? substr($m[7], 1) : '00';
        return sprintf('%04d-%02d-%02d %02d:%02d:%02d', $m[1], $m[2], $m[3], $h, $i, $sec);
    }
    if (preg_match('/^(\d{1,2})-(\d{1,2})([ T](\d{1,2}):(\d{2}))?$/', $s, $m)) {
        $y = date('Y');
        $mo = sprintf('%02d', $m[1]);
        $d = sprintf('%02d', $m[2]);
        if (checkdate((int)$mo, (int)$d, (int)$y)) {
            return sprintf('%04d-%s-%s %s:%s:00', $y, $mo, $d, $m[4] ?? '00', $m[5] ?? '00');
        }
    }
    return date('Y-m-d H:i:s');
}

function mms_clean_record(array $r, string $source): ?array {
    $type = ($r['type'] ?? '') === 'income' ? 'income' : 'expense';
    $amount = mms_parse_amount((string)($r['amount'] ?? ''));
    if ($amount === null) return null;
    return [
        'type' => $type,
        'amount_cents' => $amount,
        'category_id' => 0,
        'category' => (string)($r['category'] ?? ''),
        'merchant' => mb_substr((string)($r['merchant'] ?? ''), 0, 100),
        'note' => mb_substr((string)($r['note'] ?? ''), 0, 500),
        'happened_at' => mms_parse_time((string)($r['happened_at'] ?? '')),
        'source' => $source,
    ];
}

switch ($action) {

    /* ═══════ 截图解析 ═══════ */
    case 'image': {
        if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            mms_json_error(400, '未收到图片');
        }
        $f = $_FILES['file'];
        if ($f['size'] <= 0 || $f['size'] > 5 * 1024 * 1024) mms_json_error(400, '图片需 ≤ 5MB');
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $f['tmp_name']);
        finfo_close($finfo);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            mms_json_error(400, '仅支持 JPG/PNG/WebP 图片');
        }

        $saved = $uploadDir . '/parse_' . bin2hex(random_bytes(8)) . '.img';
        if (!move_uploaded_file($f['tmp_name'], $saved)) mms_json_error(500, '保存失败');
        $b64 = base64_encode((string)file_get_contents($saved));
        @unlink($saved); // 原图即删

        $system = "你是账单识别助手。从微信/支付宝/美团等支付截图或账单列表中提取所有交易记录。" .
            "严格输出 JSON 数组，不要多余文字。每条: {\"type\":\"expense|income\",\"amount\":\"12.50\",\"category\":\"餐饮\",\"merchant\":\"商户名\",\"happened_at\":\"2026-08-04 12:30\",\"note\":\"备注\"}。" .
            "金额只填数字不含符号；看不清/不确定的字段填空字符串；有多条就全部列出；截图里没有交易则输出 []。";

        $result = null;
        $lastErr = '';
        $cfg = mms_llm_config();
        if (!$cfg) mms_json_error(500, 'LLM 未配置，请联系店主');
        $try = mms_llm_try([
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => [
                ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $mime . ';base64,' . $b64]],
            ]],
        ], true, 'vision');
        if ($try !== null && !empty($try['ok'])) {
            $content = trim((string)$try['content']);
            $content = preg_replace('/^```(json)?|```$/i', '', $content);
            $content = trim($content);
            if (preg_match('/\[[\s\S]*\]/', $content, $m)) {
                $arr = json_decode($m[0], true);
                if (is_array($arr)) $result = $arr;
            }
        } else {
            $lastErr = $try['error'] ?? '未知错误';
        }

        if ($result === null) {
            mms_json_error(502, '识别失败(' . $lastErr . ')，请重试或手动记账');
        }
        $records = [];
        foreach ($result as $r) {
            if (!is_array($r)) continue;
            $rec = mms_clean_record($r, 'screenshot');
            if ($rec !== null) $records[] = $rec;
        }
        mms_json_ok(['records' => $records, 'count' => count($records)]);
    }

    /* ═══════ CSV 解析(微信/支付宝官方导出) ═══════ */
    case 'csv': {
        $raw = (string)($_REQUEST['csv'] ?? '');
        if ($raw === '') mms_json_error(400, 'CSV 内容为空');
        if (strlen($raw) > 2 * 1024 * 1024) mms_json_error(400, 'CSV 过大');
        $raw = str_replace(["\r\n", "\r"], "\n", $raw);
        $lines = array_values(array_filter(explode("\n", $raw), function ($l) { return trim($l) !== ''; }));
        if (count($lines) < 2) mms_json_error(400, 'CSV 内容太少');

        $records = [];
        $rules = [
            // 微信: 交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
            'wechat' => [
                'needle' => '交易类型',
                'cols' => ['time' => 0, 'peer' => 2, 'product' => 3, 'flow' => 4, 'amount' => 5, 'note' => 10],
            ],
            // 支付宝: 交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注
            'alipay' => [
                'needle' => '交易分类',
                'cols' => ['time' => 0, 'category' => 1, 'peer' => 2, 'product' => 4, 'flow' => 5, 'amount' => 6, 'note' => 11],
            ],
        ];
        $engine = null;
        foreach ($rules as $key => $rule) {
            if (mb_strpos($lines[0], $rule['needle']) !== false) { $engine = $key; break; }
        }

        if ($engine === null) {
            // 未知格式 → 文本模型兜底
            $cfg = mms_llm_config();
            $text = mb_substr($raw, 0, 30000);
            $system = "你是账单解析助手。从以下账单 CSV 文本中提取交易记录。" .
                "严格输出 JSON 数组，不要多余文字。每条: {\"type\":\"expense|income\",\"amount\":\"12.50\",\"category\":\"餐饮\",\"merchant\":\"商户名\",\"happened_at\":\"2026-08-04 12:30\",\"note\":\"备注\"}。";
            $result = null;
            $lastErr = '';
            $cfg = mms_llm_config();
            if (!$cfg) mms_json_error(500, 'LLM 未配置，请联系店主');
            $try = mms_llm_try([
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $text],
            ], true, 'text');
            if ($try !== null && !empty($try['ok'])) {
                if (preg_match('/\[[\s\S]*\]/', trim((string)$try['content']), $m)) {
                    $arr = json_decode($m[0], true);
                    if (is_array($arr)) $result = $arr;
                }
            } else {
                $lastErr = $try['error'] ?? '未知错误';
            }
            if ($result === null) mms_json_error(502, '无法识别该 CSV 格式(' . $lastErr . ')');
            foreach ($result as $r) {
                if (!is_array($r)) continue;
                $rec = mms_clean_record($r, 'csv');
                if ($rec !== null) $records[] = $rec;
            }
            mms_json_ok(['records' => $records, 'count' => count($records)]);
        }

        $cols = $rules[$engine]['cols'];
        for ($i = 1; $i < count($lines); $i++) {
            $cells = str_getcsv($lines[$i]);
            if (count($cells) <= max($cols)) continue;
            $flow = strtolower(trim($cells[$cols['flow']]));
            $type = strpos($flow, '收') !== false ? 'income' : 'expense';
            $amount = mms_parse_amount($cells[$cols['amount']]);
            if ($amount === null) continue;
            $merchant = trim($cells[$cols['peer']]);
            $product = trim($cells[$cols['product']]);
            $note = isset($cols['note']) ? trim($cells[$cols['note']]) : '';
            $category = isset($cols['category']) ? trim($cells[$cols['category']]) : '';
            $records[] = [
                'type' => $type,
                'amount_cents' => $amount,
                'category_id' => 0,
                'category' => mb_substr($category, 0, 12),
                'merchant' => mb_substr($merchant ?: $product, 0, 100),
                'note' => mb_substr($note, 0, 500),
                'happened_at' => mms_parse_time($cells[$cols['time']]),
                'source' => 'csv',
            ];
        }
        if (count($records) === 0) mms_json_error(400, '未解析出有效记录，请检查格式');
        mms_json_ok(['records' => $records, 'count' => count($records)]);
    }

    default:
        mms_json_error(400, '未知操作');
}
