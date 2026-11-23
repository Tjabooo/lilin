# Restarts the scheduled task created by install-service.ps1 and reports status.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\restart-lilin.ps1
# (or: node setup.js service restart)

$dir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not (Get-ScheduledTask -TaskName 'Lilin' -ErrorAction SilentlyContinue)) {
  Write-Host "No Lilin task found. Run scripts\windows\install-service.ps1 (or node setup.js service install) first." -ForegroundColor Red
  exit 1
}

Write-Host 'Stopping Lilin...'
# Find Lilin and everything it started (ffmpeg conversions, Apple TV helpers) before stopping it,
# so no conversion is left running on its own. Downloads are unaffected: qBittorrent keeps going.
$all = @(Get-CimInstance Win32_Process)
# Only this Lilin's server.js: other Node apps on the machine run `node server.js` too. Lilin's is the one whose
# command line, or a parent's (the task's cmd /c <dir>\start-lilin.cmd), points into this folder, or that listens on its port.
$port = 8080
$envFile = Join-Path $dir '.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}
$listener = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess })
function Test-OursProcess($p) {
  if ($listener -contains $p.ProcessId) { return $true }
  for ($i = 0; $p -and $i -lt 4; $i++) {
    if ($p.CommandLine -and $p.CommandLine.IndexOf("$dir\", [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    $parentId = $p.ParentProcessId
    $p = $all | Where-Object { $_.ProcessId -eq $parentId } | Select-Object -First 1
  }
  return $false
}
$nodes = @($all | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.js' -and (Test-OursProcess $_) })
function Get-Descendants($parentId) {
  foreach ($c in ($all | Where-Object { $_.ParentProcessId -eq $parentId })) { $c; Get-Descendants $c.ProcessId }
}
$helpers = @(foreach ($n in $nodes) { Get-Descendants $n.ProcessId })

Stop-ScheduledTask -TaskName 'Lilin' -ErrorAction SilentlyContinue
# Stopping the task can leave node.exe and its helpers running.
foreach ($p in $nodes + $helpers) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
# Conversions orphaned by an earlier restart (they write *.lilin-tmp files). Conversions run by
# src\convert-runner.js are left alone: they outlive the restart on purpose and Lilin picks them up again.
$runners = @($all | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'convert-runner\.js' } | ForEach-Object { $_.ProcessId })
Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" |
  Where-Object { $_.CommandLine -match 'lilin-tmp' -and $runners -notcontains $_.ParentProcessId } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host 'Starting Lilin...'
Start-ScheduledTask -TaskName 'Lilin'

$status = $null
for ($i = 0; $i -lt 20 -and -not $status; $i++) {
  Start-Sleep -Seconds 1
  try { $status = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2 } catch { }
}
# Feature summary (needs the shared home account; with HOME_NETWORK_ACCESS=signin it's skipped).
$health = $status
if ($status) { try { $status = Invoke-RestMethod "http://127.0.0.1:$port/api/status" -TimeoutSec 2 } catch { $status = $null } }

function OnOff($v) { if ($v) { 'on' } else { 'off' } }

if ($health) {
  Write-Host "Lilin is running on port $port." -ForegroundColor Green
}
if ($status) {
  Write-Host ("  Search: {0}   Library: {1}   Downloads: {2}   Torrents: {3}   Subtitles: {4}" -f `
    (OnOff $status.search), (OnOff $status.library), (OnOff $status.downloads), (OnOff $status.torrents), (OnOff $status.subtitles))
} elseif (-not $health) {
  Write-Host "Lilin didn't respond within 20 seconds. Last lines of the log:" -ForegroundColor Yellow
  Get-Content (Join-Path $dir 'logs\lilin.log') -Tail 15 -ErrorAction SilentlyContinue
}
