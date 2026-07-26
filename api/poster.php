<?php

/**
 * 雾雨魔法店 · 老婆测试结果海报生成器
 * GET /api/poster.php?id=88572&match=95
 */

header('Content-Type: image/png');

$charId = (int) ($_GET['id'] ?? 0);
$match  = (int) ($_GET['match'] ?? 80);
if ($match < 1) $match = 80;
if ($match > 100) $match = 100;

// ═══ 缓存目录 ═══
$cacheDir   = __DIR__ . '/../data/cache/posters';
$avatarDir  = __DIR__ . '/../data/cache/avatars';
if (!is_dir($cacheDir))  mkdir($cacheDir, 0755, true);
if (!is_dir($avatarDir)) mkdir($avatarDir, 0755, true);

$cacheFile  = $cacheDir . "/waifu_{$charId}_{$match}.png";
$avatarFile = $avatarDir . "/{$charId}.jpg";

// 海报缓存 1 小时
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
    readfile($cacheFile);
    exit;
}

// ═══ 加载角色数据 ═══
$dbFile = __DIR__ . '/../data/waifu-db-zh.json';
if (!file_exists($dbFile)) {
    http_response_code(404);
    exit;
}
$raw = file_get_contents($dbFile);
$raw = ltrim($raw, "\xEF\xBB\xBF");
$db  = json_decode($raw, true);
if (!is_array($db)) { http_response_code(500); exit; }

$char = null;
foreach ($db as $c) {
    if (($c['id'] ?? 0) == $charId) { $char = $c; break; }
}
if (!$char) { http_response_code(404); exit; }

// ═══ 加载标签翻译 ═══
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

// ═══ 字体 ═══
$fontPath = null;
$candidates = [
    __DIR__ . '/../data/fonts/LXGWWenKaiGB-Regular.ttf',
    '/www/wwwroot/www.azureflame.cloud/data/fonts/LXGWWenKaiGB-Regular.ttf',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/wqy-microhei/wqy-microhei.ttc',
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
];
foreach ($candidates as $f) {
    if (file_exists($f)) { $fontPath = $f; break; }
}

// ═══ 数据准备 ═══
$name      = $char['name'] ?? '未知角色';
$native    = $char['name_native'] ?? '';
$source    = $char['source_anime'] ?? '';
$imageUrl  = $char['image'] ?? '';
$matchStr  = $match . '%';
$tagNames  = [];
foreach (($char['tags'] ?? []) as $dim => $tagObjs) {
    foreach ($tagObjs as $t) {
        $cn = $tagMap[$t['id']] ?? $t['id'];
        if (!in_array($cn, $tagNames)) $tagNames[] = $cn;
    }
}
$tagNames = array_slice($tagNames, 0, 8);

// ═══ 下载角色立绘 ═══
$avatarImg = null;
if ($imageUrl && !file_exists($avatarFile)) {
    $imgData = @file_get_contents($imageUrl, false, stream_context_create([
        'http' => ['timeout' => 8, 'user_agent' => 'MarisaBot/1.0'],
        'ssl'  => ['verify_peer' => false],
    ]));
    if ($imgData && strlen($imgData) > 1024) {
        file_put_contents($avatarFile, $imgData);
    }
}

// ═══ GD 绘图 ═══
$W   = 600;
$H   = 800;
$img = imagecreatetruecolor($W, $H);

// 暗紫渐变背景
for ($y = 0; $y < $H; $y++) {
    $r = (int) (24 + $y * 0.015);
    $g = (int) (8  + $y * 0.025);
    $b = (int) (44 + $y * 0.038);
    $lineColor = imagecolorallocate($img, $r, $g, $b);
    imageline($img, 0, $y, $W, $y, $lineColor);
}

$white     = imagecolorallocate($img, 255, 255, 255);
$gold      = imagecolorallocate($img, 255, 215, 0);
$gray      = imagecolorallocate($img, 170, 170, 185);
$lightPurp = imagecolorallocate($img, 180, 140, 220);
$tagBg     = imagecolorallocate($img, 70, 30, 110);
$tagBorder = imagecolorallocate($img, 130, 90, 190);
$pink      = imagecolorallocate($img, 255, 90, 140);
$darkOverlay = imagecolorallocatealpha($img, 0, 0, 0, 80);

// ═══ 角色立绘（上方 300px 区域） ═══
if (file_exists($avatarFile)) {
    $av = @imagecreatefromstring(file_get_contents($avatarFile));
    if ($av) {
        $avW = imagesx($av);
        $avH = imagesy($av);

        // 目标尺寸 260×260，居中放置
        $thumbW = 260;
        $thumbH = 260;
        $thumb  = imagecreatetruecolor($thumbW, $thumbH);
        imagealphablending($thumb, false);
        imagesavealpha($thumb, true);

        // 等比缩放填满
        $scale  = max($thumbW / $avW, $thumbH / $avH);
        $srcW   = (int) ($thumbW / $scale);
        $srcH   = (int) ($thumbH / $scale);
        $srcX   = (int) (($avW - $srcW) / 2);
        $srcY   = (int) (($avH - $srcH) / 2);

        imagecopyresampled($thumb, $av, 0, 0, $srcX, $srcY, $thumbW, $thumbH, $srcW, $srcH);

        // 圆角遮罩
        $mask   = imagecreatetruecolor($thumbW, $thumbH);
        $trans  = imagecolorallocatealpha($mask, 0, 0, 0, 127);
        imagefill($mask, 0, 0, $trans);
        imagefilledellipse($mask, (int)($thumbW/2), (int)($thumbH/2), $thumbW, $thumbH, imagecolorallocate($mask, 255, 0, 255));
        imagecolortransparent($mask, imagecolorallocate($mask, 0, 0, 0));

        // 把圆裁剪到 thumb 上
        for ($x = 0; $x < $thumbW; $x++) {
            for ($y2 = 0; $y2 < $thumbH; $y2++) {
                $c = imagecolorat($mask, $x, $y2);
                $a = ($c >> 24) & 0x7F;
                if ($a === 127) {
                    imagesetpixel($thumb, $x, $y2, imagecolorallocatealpha($thumb, 0, 0, 0, 127));
                }
            }
        }

        $avX = (int) (($W - $thumbW) / 2);
        $avY = 30;

        // 紫色光晕圈
        $glow = imagecolorallocatealpha($img, 160, 100, 230, 60);
        imagefilledellipse($img, (int)($avX + $thumbW/2), (int)($avY + $thumbH/2), $thumbW + 20, $thumbH + 20, $glow);

        imagecopy($img, $thumb, $avX, $avY, 0, 0, $thumbW, $thumbH);
        imagedestroy($thumb);
        imagedestroy($mask);
        imagedestroy($av);
    }
}

// ═══ 文字排版 ═══
$textY = 320;

if ($fontPath) {
    // 装饰分隔线
    imageline($img, 80, $textY, $W - 80, $textY, $lightPurp);
    $textY += 25;

    // 角色名 — 金色大字
    $nameSize = 36;
    $nameBox  = imagettfbbox($nameSize, 0, $fontPath, $name);
    $nameW    = $nameBox[2] - $nameBox[0];
    imagettftext($img, $nameSize, 0, (int)(($W - $nameW) / 2), $textY + 36, $gold, $fontPath, $name);
    $textY += 55;

    // 日文名
    if ($native) {
        $natSize = 18;
        $natBox  = imagettfbbox($natSize, 0, $fontPath, $native);
        $natW    = $natBox[2] - $natBox[0];
        imagettftext($img, $natSize, 0, (int)(($W - $natW) / 2), $textY, $gray, $fontPath, $native);
        $textY += 28;
    }

    // 来源动漫
    if ($source) {
        $srcText = '《' . $source . '》';
        $srcSize = 20;
        $srcBox  = imagettfbbox($srcSize, 0, $fontPath, $srcText);
        $srcW    = $srcBox[2] - $srcBox[0];
        imagettftext($img, $srcSize, 0, (int)(($W - $srcW) / 2), $textY, $white, $fontPath, $srcText);
        $textY += 40;
    }

    // 匹配度
    $matchText = '匹配度 ' . $matchStr;
    $matchSize = 48;
    $matchBox  = imagettfbbox($matchSize, 0, $fontPath, $matchText);
    $matchW    = $matchBox[2] - $matchBox[0];
    imagettftext($img, $matchSize, 0, (int)(($W - $matchW) / 2), $textY + 10, $pink, $fontPath, $matchText);
    $textY += 60;

    // 标签泡泡（圆角椭圆）
    $tagX    = 30;
    $tagRowH = 36;
    foreach ($tagNames as $tag) {
        $tagSize = 13;
        $tagBox  = imagettfbbox($tagSize, 0, $fontPath, $tag);
        $tw      = $tagBox[2] - $tagBox[0] + 20;
        $th      = $tagBox[1] - $tagBox[7] + 12;

        if ($tagX + $tw > $W - 30) {
            $tagX  = 30;
            $textY += $tagRowH;
        }

        // 圆角椭圆底
        imagefilledellipse($img, (int)($tagX + $tw/2), (int)($textY + $th/2), $tw, $th, $tagBg);
        imageellipse($img, (int)($tagX + $tw/2), (int)($textY + $th/2), $tw, $th, $tagBorder);
        // 填充中心，修正椭圆视觉
        imagefilledrectangle($img, (int)($tagX + $tw/4), (int)$textY, (int)($tagX + $tw*3/4), (int)($textY + $th), $tagBg);

        imagettftext($img, $tagSize, 0, (int)($tagX + 10), (int)($textY + $th - 6), $white, $fontPath, $tag);
        $tagX += $tw + 10;
    }

    // ═══ 底部品牌 ═══
    $footerY = 720;

    $brandText = '霧雨魔法店';
    $brandSize = 18;
    $brandBox  = imagettfbbox($brandSize, 0, $fontPath, $brandText);
    $brandW    = $brandBox[2] - $brandBox[0];
    imagettftext($img, $brandSize, 0, (int)(($W - $brandW) / 2), $footerY + 30, $gold, $fontPath, $brandText);

    $urlText = 'www.azureflame.cloud';
    $urlSize = 14;
    $urlBox  = imagettfbbox($urlSize, 0, $fontPath, $urlText);
    $urlW    = $urlBox[2] - $urlBox[0];
    imagettftext($img, $urlSize, 0, (int)(($W - $urlW) / 2), $footerY + 55, $gray, $fontPath, $urlText);

    // 星星
    imagettftext($img, 14, 0, 100, $footerY + 2, $gold, $fontPath, '★');
    imagettftext($img, 14, 0, $W - 120, $footerY + 2, $gold, $fontPath, '★');

} else {
    // 无字体 fallback
    imagestring($img, 5, (int)(($W - 150) / 2), 320, 'Waifu Test Result', $white);
    $label = $name;
    imagestring($img, 5, (int)(($W - strlen($label) * 9) / 2), 370, $label, $gold);
    $label2 = 'Match: ' . $matchStr;
    imagestring($img, 5, (int)(($W - strlen($label2) * 9) / 2), 420, $label2, $pink);
    imagestring($img, 4, (int)(($W - 17 * 8) / 2), 700, 'azureflame.cloud', $gray);
}

// ── 输出 ──
imagepng($img, $cacheFile);
imagepng($img);
imagedestroy($img);
