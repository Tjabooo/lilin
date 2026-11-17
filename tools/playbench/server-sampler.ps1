# Read-only background sampler for playbench, run ON a Windows Lilin server over SSH (one session for a whole
# benchmark). Every -Seconds it prints one JSON line: the torrent tunnel's status file (if any), Lilin's TV picks in
# flight, and new Lilin log lines worth knowing about (other people's emails replaced by <someone>). It never talks
# to qBittorrent or changes anything.
#   powershell -NoProfile -ExecutionPolicy Bypass -File server-sampler.ps1 -LilinDir C:\lilin [-StatusFile PATH] [-Seconds 15] [-Hours 8]
param(
  [string]$LilinDir = 'C:\lilin',
  [string]$StatusFile = 'C:\ProgramData\TorrentVpn\status.json',
  [int]$Seconds = 15,
  [double]$Hours = 8
)
$ErrorActionPreference = 'SilentlyContinue'
$log = Join-Path $LilinDir 'logs\lilin.log'
$picksFile = Join-Path $LilinDir '.lilin-tv-picks.json'
$pattern = '^\[(fake|swarm|play now|smart|tv-picks|order|playhead|downloads|convert|same-name|slow|activity)\]'
$pos = (Get-Item $log).Length
$end = (Get-Date).AddHours($Hours)
while ((Get-Date) -lt $end) {
  $o = [ordered]@{ type = 'server'; t = (Get-Date).ToUniversalTime().ToString('o') }
  if (Test-Path $StatusFile) {
    $s = Get-Content $StatusFile -Raw | ConvertFrom-Json
    $o.vpn = [ordered]@{ at = $s.at; server = $s.server; tunnel = $s.tunnel; ok = $s.ok; dl = $s.qbit.dlSpeed; up = $s.qbit.upSpeed; conn = $s.qbit.connection }
  }
  if (Test-Path $picksFile) {
    $p = Get-Content $picksFile -Raw | ConvertFrom-Json
    $o.picks = @($p.picks | Where-Object { $_.state -in @('downloading', 'searching', 'queued') } | ForEach-Object { "$($_.state): $($_.title)" })
  }
  $len = (Get-Item $log).Length
  if ($len -lt $pos) { $pos = 0 }
  if ($len -gt $pos) {
    $fs = [IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
    [void]$fs.Seek($pos, 'Begin')
    $sr = New-Object IO.StreamReader($fs)
    $text = $sr.ReadToEnd()
    $sr.Close()
    $pos = $len
    $o.log = @($text -split "`r?`n" | Where-Object { $_ -match $pattern } | Select-Object -First 60 | ForEach-Object { $l = $_; if ($l -notmatch 'playbench@') { $l = $l -replace '[\w.+-]+@[\w-]+(\.[\w-]+)+', '<someone>' }; $l.Substring(0, [Math]::Min(300, $l.Length)) })
  }
  try { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() } catch { exit 0 }
  Start-Sleep -Seconds $Seconds
}
