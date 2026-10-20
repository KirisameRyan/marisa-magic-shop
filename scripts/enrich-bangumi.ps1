param(
    [string]$InputFile = "data/selected-characters-v2.json",
    [string]$CacheFile = "data/bangumi-cache.json",
    [int]$Limit = 0,
    [int]$DelayMs = 1150
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Fix-Text($value) {
    if ($null -eq $value) { return "" }
    if ($value -is [System.Array]) {
        return (($value | ForEach-Object { Fix-Text $_ }) -join " / ")
    }
    $text = [string]$value
    try {
        return [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::GetEncoding(28591).GetBytes($text))
    } catch {
        return $text
    }
}

function Normalize-Name($value) {
    if (-not $value) { return "" }
    $text = [string]$value
    try { $text = $text.Normalize([System.Text.NormalizationForm]::FormKC) } catch {}
    $text = $text.ToLowerInvariant()
    $text = [regex]::Replace($text, '[^\p{L}\p{N}]', '')
    return $text
}

function Get-InfoboxValue($infobox, $keyName) {
    foreach ($item in @($infobox)) {
        if ((Fix-Text $item.key) -eq $keyName) {
            return (Fix-Text $item.value)
        }
    }
    return ""
}

function Get-CandidateNames($hit) {
    $names = New-Object System.Collections.Generic.List[string]
    $primary = Fix-Text $hit.name
    if ($primary) { $names.Add($primary) }
    $cn = Get-InfoboxValue $hit.infobox "简体中文名"
    if ($cn) { $names.Add($cn) }
    foreach ($item in @($hit.infobox)) {
        $key = Fix-Text $item.key
        if ($key -in @("别名", "英文名", "日文名", "罗马字", "罗马音")) {
            $value = $item.value
            if ($value -is [System.Array]) {
                foreach ($entry in $value) {
                    if ($entry -is [PSCustomObject]) {
                        if ($entry.v) { $names.Add((Fix-Text $entry.v)) }
                        if ($entry.k) { $names.Add((Fix-Text $entry.k)) }
                    } elseif ($entry) {
                        $names.Add((Fix-Text $entry))
                    }
                }
            } elseif ($value) {
                $names.Add((Fix-Text $value))
            }
        }
    }
    return ($names | Where-Object { $_ } | Select-Object -Unique)
}

function Get-SummaryLanguage($text) {
    if (-not $text) { return "" }
    $kana = ([regex]::Matches($text, '[\u3040-\u30ff]')).Count
    $han = ([regex]::Matches($text, '[\u4e00-\u9fff]')).Count
    if ($kana -eq 0 -and $han -eq 0) { return "other" }
    if ($kana -gt 20 -and $kana -gt $han * 0.35) { return "ja" }
    return "zh"
}

function Read-JsonFile($path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $raw = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $path), [System.Text.Encoding]::UTF8)
    return ($raw | ConvertFrom-Json)
}

function Write-JsonFile($path, $value) {
    $json = $value | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $path), $json, (New-Object System.Text.UTF8Encoding($false)))
}

$selected = Read-JsonFile $InputFile
if (-not $selected) { throw "Input file not found: $InputFile" }

$cache = Read-JsonFile $CacheFile
if (-not $cache) { $cache = [PSCustomObject]@{} }

$targets = @($selected.characters | Where-Object { $_.needs_bangumi })
if ($Limit -gt 0) { $targets = $targets | Select-Object -First $Limit }

Write-Host "Bangumi enrichment"
Write-Host "  targets: $($targets.Count), delay: ${DelayMs}ms"

$done = 0
$matched = 0
$unmatched = 0
$requestCount = 0

foreach ($char in $targets) {
    $key = [string]$char.id
    if ($cache.PSObject.Properties.Name -contains $key) {
        $done++
        if ($cache.$key.matched) { $matched++ } else { $unmatched++ }
        continue
    }

    $queries = @($char.search_names | Where-Object { $_ } | Select-Object -Unique)
    if ($queries.Count -eq 0) { $queries = @($char.name) }

    $best = $null
    $bestScore = -1
    $tried = New-Object System.Collections.Generic.List[string]

    foreach ($query in $queries) {
        if (-not $query) { continue }
        $tried.Add($query)

        $body = @{
            keyword = [string]$query
            filter = @{ nsfw = $false }
        } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)

        $response = $null
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $response = Invoke-RestMethod -Uri "https://api.bgm.tv/v0/search/characters" -Method Post -ContentType "application/json; charset=utf-8" -Headers @{ "User-Agent" = "MarisaProject/1.0 (https://azureflame.cloud)" } -Body $bytes -TimeoutSec 45
                $requestCount++
                break
            } catch {
                if ($attempt -eq 3) {
                    Write-Warning "query failed for $($char.name) '$query': $($_.Exception.Message)"
                } else {
                    Start-Sleep -Seconds (2 * $attempt)
                }
            }
        }

        Start-Sleep -Milliseconds $DelayMs
        if (-not $response) { continue }

        $qNorm = Normalize-Name $query
        foreach ($hit in @($response.data)) {
            $candidateNames = Get-CandidateNames $hit
            $score = 0
            foreach ($candidate in $candidateNames) {
                $cNorm = Normalize-Name $candidate
                if (-not $cNorm -or -not $qNorm) { continue }
                if ($cNorm -eq $qNorm) {
                    $score = [Math]::Max($score, 12)
                } elseif ($cNorm.Length -ge 3 -and $qNorm.Length -ge 3 -and ($cNorm.Contains($qNorm) -or $qNorm.Contains($cNorm))) {
                    $score = [Math]::Max($score, 7)
                }
            }

            $hitGender = (Fix-Text $hit.gender).ToLowerInvariant()
            $expected = [string]$char.gender
            if ($hitGender -and $expected -and $hitGender -ne "unknown") {
                if ($hitGender -eq $expected) { $score += 2 } else { $score -= 5 }
            }

            $collects = 0
            try { $collects = [int]$hit.stat.collects } catch {}
            if ($collects -gt 0) {
                $score += [Math]::Min(3, [Math]::Round([Math]::Log10($collects + 1), 2))
            }

            if ($score -gt $bestScore) {
                $bestScore = $score
                $best = $hit
            }
        }

        if ($bestScore -ge 8) { break }
    }

    $entry = [ordered]@{
        queried_at = (Get-Date).ToUniversalTime().ToString("o")
        tried = @($tried)
        matched = $false
        score = $bestScore
    }

    if ($best -and $bestScore -ge 8) {
        $nameCn = Get-InfoboxValue $best.infobox "简体中文名"
        $bangumiName = Fix-Text $best.name
        if (-not $nameCn) {
            if ($bangumiName -match '[\u4e00-\u9fff]') { $nameCn = $bangumiName }
        }
        $summary = Fix-Text $best.summary
        $entry.matched = $true
        $entry.bangumi_id = $best.id
        $entry.bangumi_name = $bangumiName
        $entry.name_cn = $nameCn
        $entry.summary_cn = $summary
        $entry.summary_lang = Get-SummaryLanguage $summary
        $entry.gender = (Fix-Text $best.gender).ToLowerInvariant()
        $entry.collects = $best.stat.collects
        $matched++
    } else {
        $unmatched++
    }

    $cache | Add-Member -MemberType NoteProperty -Name $key -Value ([PSCustomObject]$entry) -Force
    $done++

    if ($done % 10 -eq 0 -or $done -eq $targets.Count) {
        Write-Host "  [$done/$($targets.Count)] matched=$matched unmatched=$unmatched requests=$requestCount"
        Write-JsonFile $CacheFile $cache
    }
}

Write-JsonFile $CacheFile $cache
Write-Host "Done. matched=$matched unmatched=$unmatched requests=$requestCount"
Write-Host "Cache: $CacheFile"
