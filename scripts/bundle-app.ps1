# =============================================
#  霧雨魔法店 · App 离线包打包器 (Windows 本地版)
#  用法: powershell -File scripts/bundle-app.ps1
#  产出: android-app/app/src/main/assets/www.zip
#  注意: 用 .NET ZipArchive 生成 UTF-8 条目名,
#        规避 AGP 在中文 Windows 上的文件名乱码问题
# =============================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assetsDir = Join-Path $root 'android-app\app\src\main\assets'
$zipPath = Join-Path $assetsDir 'www.zip'

$skipDirs = @('.git', 'api', 'android-app', 'scripts', '.opencode', 'proxy_cache_dir', '.well-known')
$skipFiles = @('.htaccess', '.user.ini', 'bdunion.txt',
    '39be8777283b6964b055eb7e87a6dadb.txt', 'README.md')
$skipPatterns = @('\.tmp$', '\.log$', '\.DS_Store$', '\.php$',
    'leaderboard.*\.json$', 'counters\.json$', 'suggestions\.json$',
    'auth_rate\.json$', 'bot_token\.json$', 'waifu_quiz_sessions\.json$',
    '^site\.db', 'roulette.*\.json$')

if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
$count = 0
$bytes = 0L
try {
    $all = [System.IO.Directory]::GetFiles($root, '*', [System.IO.SearchOption]::AllDirectories)
    foreach ($f in $all) {
        $relSlash = $f.Substring($root.Length + 1).Replace('\', '/')
        $dir = $relSlash.Split('/')[0]
        if ($skipDirs -contains $dir) { continue }
        if ($skipFiles -contains $relSlash) { continue }
        $skip = $false
        foreach ($p in $skipPatterns) { if ($relSlash -match $p) { $skip = $true; break } }
        if ($skip) { continue }
        $entry = $zip.CreateEntry($relSlash, [System.IO.Compression.CompressionLevel]::Optimal)
        $in = [System.IO.File]::OpenRead($f)
        try {
            $es = $entry.Open()
            try { $in.CopyTo($es) } finally { $es.Dispose() }
        } finally { $in.Dispose() }
        $count++
        $bytes += (Get-Item $f).Length
    }
} finally {
    $zip.Dispose()
}
$zipSize = (Get-Item $zipPath).Length
"已打包 $count 个文件 (原始 $([math]::Round($bytes/1MB,1))MB, zip $([math]::Round($zipSize/1MB,1))MB) → $zipPath"
