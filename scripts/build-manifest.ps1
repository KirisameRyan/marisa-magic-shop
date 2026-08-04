# =============================================
#  霧雨魔法店 · 离线包版本清单生成器 (Windows 本地版)
#  Linux 服务器上部署用 scripts/build-manifest.php
#  用法: powershell -File scripts/build-manifest.ps1
#  注意: 必须无 BOM UTF-8 输出(org.json 不认 BOM)
# =============================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$skipDirs = @('.git', 'api', 'android-app', 'scripts', '.opencode', 'proxy_cache_dir', '.well-known')
$skipFiles = @('version.json', '.gitignore', '.htaccess', '.user.ini', 'bdunion.txt',
    '39be8777283b6964b055eb7e87a6dadb.txt', 'README.md')
$skipPatterns = @('\.tmp$', '\.log$', '\.DS_Store$', '\.php$',
    'leaderboard.*\.json$', 'counters\.json$', 'suggestions\.json$',
    'auth_rate\.json$', 'bot_token\.json$', 'waifu_quiz_sessions\.json$',
    '^site\.db', 'roulette.*\.json$')

$sha = [System.Security.Cryptography.SHA256]::Create()
$files = @{}
$all = [System.IO.Directory]::GetFiles($root, '*', [System.IO.SearchOption]::AllDirectories)
foreach ($f in $all) {
    $rel = $f.Substring($root.Length + 1).Replace('\', '/')
    $dir = $rel.Split('/')[0]
    if ($skipDirs -contains $dir) { continue }
    if ($skipFiles -contains $rel) { continue }
    $skip = $false
    foreach ($p in $skipPatterns) { if ($rel -match $p) { $skip = $true; break } }
    if ($skip) { continue }
    $stream = [System.IO.File]::OpenRead($f)
    try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLower() }
    finally { $stream.Dispose() }
    $files[$rel] = $hash
}

$ordered = [System.Collections.Generic.SortedDictionary[string,string]]::new()
foreach ($k in $files.Keys) { $ordered[$k] = $files[$k] }

$totalBytes = 0
foreach ($f in $all) {
    $rel = $f.Substring($root.Length + 1).Replace('\', '/')
    if ($ordered.ContainsKey($rel)) { $totalBytes += (Get-Item $f).Length }
}

$filesJson = @{}
foreach ($kv in $ordered.GetEnumerator()) { $filesJson[$kv.Key] = $kv.Value }
$digest = [System.Security.Cryptography.SHA256]::Create()
$digestText = [BitConverter]::ToString($digest.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(($ordered | ConvertTo-Json -Compress)))).Replace('-', '').ToLower()

$out = [ordered]@{
    version   = $digestText.Substring(0, 16)
    generated = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    files     = $filesJson
}
$json = $out | ConvertTo-Json -Depth 3 -Compress
$dst = Join-Path $root 'version.json'
[System.IO.File]::WriteAllText($dst, $json + "`n", [System.Text.UTF8Encoding]::new($false))
"version=$($out.version) 文件数=$($ordered.Count) 总大小=$([math]::Round($totalBytes/1MB,1))MB 写入 $dst"
