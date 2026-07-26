<?php

/**
 * 雾雨魔法店 · 老婆测试结果海报生成器
 * GET /api/poster.php?id=88572&match=95
 */

header('Content-Type: image/png');

$charId  = (int) ($_GET['id'] ?? 0);
$match   = (int) ($_GET['match'] ?? 80);
if ($match < 1) $match = 80;
if ($match > 100) $match = 100;

// 缓存目录
$cacheDir = __DIR__ . '/../data/cache/posters';
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
$cacheFile = $cacheDir . "/waifu_{$charId}_{$match}.png";

// 缓存 1 小时
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
    readfile($cacheFile);
    exit;
}

// 加载角色数据
$dbFile = __DIR__ . '/../data/waifu-db-zh.json';
if (!file_exists($dbFile)) {
    http_response_code(404);
    echo file_get_contents(__DIR__ . '/../images/placeholder.png');
    exit;
}
$raw = file_get_contents($dbFile);
$raw = ltrim($raw, "\xEF\xBB\xBF");
$db  = json_decode($raw, true);
if (!is_array($db)) {
    http_response_code(500);
    exit;
}

// 查找角色
$char = null;
foreach ($db as $c) {
    if (($c['id'] ?? 0) == $charId) { $char = $c; break; }
}
if (!$char) {
    http_response_code(404);
    exit;
}

// 加载标签翻译
$tagMap = [];
$tagFile = __DIR__ . '/../data/waifu-tags.json';
if (file_exists($tagFile)) {
    $tagRaw = file_get_contents($tagFile);
    $tagRaw = ltrim($tagRaw, "\xEF\xBB\xBF");
    $tagData = json_decode($tagRaw, true);
    if ($tagData) {
        foreach (($tagData['dimensions'] ?? []) as $dim) {
            foreach (($dim['tags'] ?? []) as $tag) {
                $tagMap[$tag['id']] = $tag['name'];
            }
        }
    }
}

// ═══ 字体检测 ═══
$fontPath = null;
$candidates = [
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/wqy-microhei/wqy-microhei.ttc',
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    __DIR__ . '/../data/fonts/SourceHanSansSC-Regular.otf',
    __DIR__ . '/../data/fonts/NotoSansSC-Regular.ttf',
    __DIR__ . '/../data/fonts/wqy-microhei.ttc',
];
foreach ($candidates as $f) {
    if (file_exists($f)) { $fontPath = $f; break; }
}

// ═══ GD 绘图 ═══
$W   = 600;
$H   = 800;
$img = imagecreatetruecolor($W, $H);

// 暗紫渐变背景
for ($y = 0; $y < $H; $y++) {
    $r = (int) (26 + $y * 0.02);
    $g = (int) (10 + $y * 0.03);
    $b = (int) (46 + $y * 0.04);
    $lineColor = imagecolorallocate($img, $r, $g, $b);
    imageline($img, 0, $y, $W, $y, $lineColor);
}

$white    = imagecolorallocate($img, 255, 255, 255);
$gold     = imagecolorallocate($img, 255, 215, 0);
$gray     = imagecolorallocate($img, 180, 180, 190);
$lightPurp = imagecolorallocate($img, 180, 140, 220);
$tagBg    = imagecolorallocate($img, 80, 40, 120);
$tagBorder = imagecolorallocate($img, 140, 100, 200);
$pink     = imagecolorallocate($img, 255, 100, 150);

// ═══ 角色立绘（如果没字体，至少显示角色名用内置字体） ═══
$name   = $char['name'] ?? '未知角色';
$source = $char['source_anime'] ?? '';
$matchStr = $match . '%';
$tagNames = [];
foreach (($char['tags'] ?? []) as $dim => $tagObjs) {
    foreach ($tagObjs as $t) {
        $cn = $tagMap[$t['id']] ?? $t['id'];
        if (!in_array($cn, $tagNames)) $tagNames[] = $cn;
    }
}
$tagNames = array_slice($tagNames, 0, 8);

if ($fontPath) {
    // ── 有中文字体：完整排版 ──

    // 标题
    $title = '二次元老婆鉴定结果';
    $titleSize = 22;
    $titleBox = imagettfbbox($titleSize, 0, $fontPath, $title);
    $titleW = $titleBox[2] - $titleBox[0];
    imagettftext($img, $titleSize, 0, (int)(($W - $titleW) / 2), 60, $gold, $fontPath, $title);

    // 装饰线
    imageline($img, 100, 75, $W - 100, 75, $lightPurp);

    // 角色名（大字，金色）
    $nameSize = 36;
    $nameBox = imagettfbbox($nameSize, 0, $fontPath, $name);
    $nameW = $nameBox[2] - $nameBox[0];
    imagettftext($img, $nameSize, 0, (int)(($W - $nameW) / 2), 150, $gold, $fontPath, $name);

    // 日文名
    $native = $char['name_native'] ?? '';
    if ($native) {
        $natSize = 18;
        $natBox = imagettfbbox($natSize, 0, $fontPath, $native);
        $natW = $natBox[2] - $natBox[0];
        imagettftext($img, $natSize, 0, (int)(($W - $natW) / 2), 180, $gray, $fontPath, $native);
    }

    // 来源动漫
    if ($source) {
        $srcText = '《' . $source . '》';
        $srcSize = 20;
        $srcBox = imagettfbbox($srcSize, 0, $fontPath, $srcText);
        $srcW = $srcBox[2] - $srcBox[0];
        imagettftext($img, $srcSize, 0, (int)(($W - $srcW) / 2), 220, $white, $fontPath, $srcText);
    }

    // 匹配度（大号醒目）
    $matchText = '匹配度 ' . $matchStr;
    $matchSize = 48;
    $matchBox = imagettfbbox($matchSize, 0, $fontPath, $matchText);
    $matchW = $matchBox[2] - $matchBox[0];
    imagettftext($img, $matchSize, 0, (int)(($W - $matchW) / 2), 290, $pink, $fontPath, $matchText);

    // 标签（泡泡排列）
    $tagY = 340;
    $tagX = 30;
    $tagRowH = 40;
    foreach ($tagNames as $tag) {
        $tagSize = 14;
        $tagBox = imagettfbbox($tagSize, 0, $fontPath, $tag);
        $tagW = $tagBox[2] - $tagBox[0] + 20;
        $tagH = $tagBox[1] - $tagBox[7] + 14;

        if ($tagX + $tagW > $W - 30) {
            $tagX = 30;
            $tagY += $tagRowH;
        }

        // 标签背景圆角矩形
        imagefilledrectangle($img, (int)$tagX, (int)$tagY, (int)($tagX + $tagW), (int)($tagY + $tagH), $tagBg);
        imagerectangle($img, (int)$tagX, (int)$tagY, (int)($tagX + $tagW), (int)($tagY + $tagH), $tagBorder);

        // 标签文字
        imagettftext($img, $tagSize, 0, (int)($tagX + 10), (int)($tagY + $tagH - 6), $white, $fontPath, $tag);
        $tagX += $tagW + 8;
    }

    // ═══ 底部品牌 ═══
    $footerY = 720;
    imageline($img, 150, $footerY, $W - 150, $footerY, $lightPurp);

    $brandText = '🧹 霧雨魔法店';
    $brandSize = 18;
    $brandBox = imagettfbbox($brandSize, 0, $fontPath, $brandText);
    $brandW = $brandBox[2] - $brandBox[0];
    imagettftext($img, $brandSize, 0, (int)(($W - $brandW) / 2), $footerY + 35, $gold, $fontPath, $brandText);

    $urlText = 'www.azureflame.cloud';
    $urlSize = 14;
    $urlBox = imagettfbbox($urlSize, 0, $fontPath, $urlText);
    $urlW = $urlBox[2] - $urlBox[0];
    imagettftext($img, $urlSize, 0, (int)(($W - $urlW) / 2), $footerY + 60, $gray, $fontPath, $urlText);

    // 星星装饰
    $starSize = 16;
    imagettftext($img, $starSize, 0, 120, 720, $gold, $fontPath, '★');
    imagettftext($img, $starSize, 0, $W - 140, 720, $gold, $fontPath, '★');

} else {
    // ── 无中文字体：基础英文 ──
    $fallbackText = 'Waifu Test Result';
    imagestring($img, 5, (int)(($W - 150) / 2), 50, $fallbackText, $white);

    $nameText = $name;
    imagestring($img, 5, (int)(($W - strlen($nameText) * 9) / 2), 130, $nameText, $gold);

    $matchText = 'Match: ' . $matchStr;
    imagestring($img, 5, (int)(($W - strlen($matchText) * 9) / 2), 180, $matchText, $pink);

    $brandText = 'azureflame.cloud';
    imagestring($img, 4, (int)(($W - strlen($brandText) * 8) / 2), 700, $brandText, $gray);
}

// ── 输出 ──
imagepng($img, $cacheFile);
imagepng($img);
imagedestroy($img);
