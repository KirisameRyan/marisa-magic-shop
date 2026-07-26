# Touhou portrait downloader v4 - Fandom API + curl
$outDir = "images\touhou"
$dbFile = "data\waifu-db-zh.json"
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

$names = @(
  'Reimu_Hakurei','Marisa_Kirisame','Sakuya_Izayoi','Remilia_Scarlet','Flandre_Scarlet',
  'Patchouli_Knowledge','Alice_Margatroid','Cirno','Youmu_Konpaku','Yuyuko_Saigyouji',
  'Yukari_Yakumo','Koishi_Komeiji','Satori_Komeiji','Reisen_Udongein_Inaba','Sanae_Kochiya',
  'Aya_Shameimaru','Fujiwara_no_Mokou','Kaguya_Houraisan','Eirin_Yagokoro',
  'Keine_Kamishirasawa','Hata_no_Kokoro','Suika_Ibuki'
)
$startId = 900001
$apiBase = 'https://touhou.fandom.com/api.php'

$db = Get-Content -LiteralPath $dbFile -Raw -Encoding UTF8 | ConvertFrom-Json
$ok = 0; $fail = 0

for ($i = 0; $i -lt $names.Count; $i++) {
  $wikiName = $names[$i]
  $cid = $startId + $i
  $num = $i + 1
  $file = Join-Path $outDir "th$num.png"
  $ch = $db | Where-Object { $_.id -eq $cid }
  $name = if ($ch) { $ch.name } else { $wikiName }
  Write-Host -NoNewline "$name`: "

  # 1. Get image URL from Fandom API
  $apiUrl = "$apiBase`?action=query&prop=pageimages&format=json&pithumbsize=500&titles=$([uri]::EscapeDataString($wikiName))"
  try {
    $json = & curl.exe -s -H "User-Agent: $ua" $apiUrl 2>$null | ConvertFrom-Json
    $pages = $json.query.pages
    $imgUrl = $null
    foreach ($key in $pages.PSObject.Properties.Name) {
      $t = $pages.$key.thumbnail
      if ($t) { $imgUrl = $t.source }
    }
    if (-not $imgUrl) { Write-Host "no image in API"; $fail++; continue }
  } catch { Write-Host "API fail"; $fail++; continue }

  # 2. Download original image (remove scale-to-width-down part)
  # Original: https://static.wikia.nocookie.net/touhou/images/X/XX/FILENAME.png
  $origUrl = $imgUrl -replace '/revision/latest/scale-to-width-down/\d+.*$',''
  try {
    & curl.exe -s -L -H "User-Agent: $ua" -H "Referer: https://touhou.fandom.com/" -o $file $origUrl 2>$null
    if (-not (Test-Path $file)) { Write-Host "no file"; $fail++; continue }
    $size = (Get-Item $file).Length
    if ($size -lt 500) { Remove-Item $file; Write-Host "tiny ($size)"; $fail++; continue }
    Write-Host "$([math]::Round($size/1KB))KB OK"
    $ok++
  } catch { Write-Host "dl fail: $_"; $fail++ }
  Start-Sleep -Milliseconds 400
}

# Update DB
for ($i = 0; $i -lt $names.Count; $i++) {
  $num = $i + 1; $cid = $startId + $i
  $file = Join-Path $outDir "th$num.png"
  if (Test-Path $file) {
    $ch = $db | Where-Object { $_.id -eq $cid }
    if ($ch) { $ch.image = "images/touhou/th$num.png" }
  }
}
$db | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $dbFile -Encoding UTF8
"window.WAIFU_DB = " + ($db | ConvertTo-Json -Depth 6 -Compress) + ";" | Set-Content -LiteralPath ($dbFile -replace '\.json$', '.js') -Encoding UTF8
Write-Host "`n$ok OK, $fail failed. DB updated."
