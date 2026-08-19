$ErrorActionPreference = 'Stop'

$out = Join-Path $PSScriptRoot 'logos.json'

Write-Host '1/3 downloading logos.csv ...'
$csv = Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/iptv-org/database/master/data/logos.csv' -TimeoutSec 180 -UseBasicParsing
$text = $csv.Content
if ($text -is [byte[]]) { $text = [System.Text.Encoding]::UTF8.GetString($text) }
$rows = $text | ConvertFrom-Csv
Write-Host "   rows: $($rows.Count)"

Write-Host '2/3 downloading channel ids (channels.json + freeiptv playlist) ...'
$channels = Invoke-RestMethod -Uri 'https://iptv-org.github.io/api/channels.json' -TimeoutSec 180
$ids = [System.Collections.Generic.HashSet[string]]::new()
foreach ($ch in $channels) { [void]$ids.Add([string]$ch.id) }
try {
  $pl = Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8' -TimeoutSec 120 -UseBasicParsing
  $plt = $pl.Content
  if ($plt -is [byte[]]) { $plt = [System.Text.Encoding]::UTF8.GetString($plt) }
  foreach ($line in ($plt -split "`n")) {
    if ($line -match 'tvg-id="([^"]+)"') { [void]$ids.Add($Matches[1]) }
  }
} catch { Write-Warning "freeiptv playlist: $_" }
Write-Host "   channel ids: $($ids.Count)"

$prefOrder = @{ 'PNG' = 0; 'JPG' = 1; 'JPEG' = 1; 'WEBP' = 2; 'SVG' = 3; 'GIF' = 4 }
$best = [ordered]@{}
$bestFormat = [ordered]@{}
foreach ($row in $rows) {
  if ($row.in_use -ne 'TRUE') { continue }
  $cid = [string]$row.channel
  if (-not $cid -or -not $row.url) { continue }
  if (-not $ids.Contains($cid)) { continue }
  $fmt = ([string]$row.format).ToUpperInvariant()
  $rank = if ($prefOrder.ContainsKey($fmt)) { $prefOrder[$fmt] } else { 5 }
  if (-not $best.Contains($cid)) {
    $best[$cid] = [string]$row.url
    $bestFormat[$cid] = $rank
  } elseif ($rank -lt $bestFormat[$cid]) {
    $best[$cid] = [string]$row.url
    $bestFormat[$cid] = $rank
  }
}
Write-Host "3/3 matched logos: $($best.Count)"

$best | ConvertTo-Json -Compress | Set-Content -LiteralPath $out -Encoding utf8
Write-Host "written: $out"
Write-Host "size: $((Get-Item $out).Length) bytes"
