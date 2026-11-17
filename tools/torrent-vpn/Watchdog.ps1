# Runs every minute as SYSTEM (scheduled task "TorrentVpn Watchdog"). Keeps the torrent tunnel,
# its route, the firewall kill switch and qBittorrent's binding in place, rotates to another
# server when the current one stops answering or (with loadUrl set) gets crowded, and stops every
# torrent if a leak is ever seen.
# Writes C:\ProgramData\TorrentVpn\status.json, plus a copy any local user can read in
# C:\ProgramData\TorrentVpn-Status\status.json (Lilin's House tab runs unelevated).
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TorrentVpn.psm1') -Force

$config = Read-TvConfig
if (-not $config) { return }
$lock = Enter-TvLock 45
$config = Read-TvConfig   # re-read under the lock: a manual server switch may have just finished
$state = Read-TvState
function Get-StateValue($Name, $Default) { if ($null -ne $state.$Name) { $state.$Name } else { $Default } }
function Set-StateValue($Name, $Value) { $state | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force }

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
# Peers that stopped answering in the last 30 minutes are not picked again by a failover or load move.
function Get-RecentlyDead {
  $dead = Get-StateValue 'deadPeers' $null
  if (-not $dead) { return @() }
  @($dead.PSObject.Properties | Where-Object { $now - [long]$_.Value -lt 1800 } | ForEach-Object { [int]$_.Name })
}
$problems = New-Object System.Collections.Generic.List[string]
$status = [ordered]@{ at = (Get-Date).ToString('o'); name = $config.name; address = $config.address }

# 1. Tunnel service.
$svc = Get-Service (Get-TvServiceName $config.name) -ErrorAction SilentlyContinue
if (-not $svc) {
  $problems.Add('tunnel service is not installed')
} elseif ($svc.Status -ne 'Running') {
  Write-TvLog "tunnel service was $($svc.Status); starting"
  try { Start-Service $svc.Name; Start-Sleep 5 } catch { $problems.Add("could not start tunnel: $($_.Exception.Message)") }
}

# 2. Route on the tunnel (lost whenever the tunnel restarts).
$routeOk = $false
try { $routeOk = Set-TvRoute $config } catch { $problems.Add("route: $($_.Exception.Message)") }
$status.route = $routeOk

# 3. Handshake; restart, then rotate servers when the current one is dead.
$age = Get-TvHandshakeAge $config.name
$status.handshakeAgeS = $age
$healthy = $null -ne $age -and $age -lt 180
$peer = $config.peers[[int]$config.peerIndex]
$status.server = $peer.name
if ($healthy) {
  Set-StateValue 'downSince' $null; Set-StateValue 'restarts' 0
} elseif ($svc) {
  if ($null -eq (Get-StateValue 'downSince' $null)) { Set-StateValue 'dropAt' (Get-Date).ToString('o'); Write-TvLog 'tunnel dropped (no recent handshake)' }
  $downSince = Get-StateValue 'downSince' $now
  Set-StateValue 'downSince' $downSince
  $restarts = [int](Get-StateValue 'restarts' 0)
  $lastRestart = [long](Get-StateValue 'lastRestart' 0)
  if ($now - $lastRestart -ge 120) {
    try {
      if ($restarts -ge 2 -and $config.peers.Count -gt 1) {
        $dead = Get-StateValue 'deadPeers' ([pscustomobject]@{})
        $dead | Add-Member -NotePropertyName ([string]$config.peerIndex) -NotePropertyValue $now -Force
        Set-StateValue 'deadPeers' $dead
        $next = Select-TvFailoverPeer $config (Get-RecentlyDead)
        $restarts = 0
        Set-StateValue 'lastSwitchAt' $now
        Switch-TvPeer $config $next "server $($peer.name) not answering" | Out-Null
      } else {
        Write-TvLog "no handshake (age=$age); restarting tunnel"
        $restarts++
        Restart-Service (Get-TvServiceName $config.name) -Force; Start-Sleep 5; Set-TvRoute $config | Out-Null
      }
    } catch { $problems.Add("restart failed: $($_.Exception.Message)") }
    Set-StateValue 'restarts' $restarts; Set-StateValue 'lastRestart' $now
  }
  $problems.Add("tunnel has no recent handshake (down for $([int](($now - $downSince) / 60)) min); torrents are paused by the kill switch")
}
$status.tunnel = if ($healthy) { 'up' } else { 'down' }

# 3b. Server load (loadUrl, AirVPN's status API), every 10 minutes while the tunnel is up: move off a
# crowded server to the configured one with clearly more free bandwidth. Hysteresis: the move has to
# be wanted on two checks in a row, at least 30 minutes after the last switch, and waits up to
# 20 minutes while someone is watching a Play now download (a switch drops every peer connection).
if ($healthy -and $config.loadUrl -and $now - [long](Get-StateValue 'loadAt' 0) -ge 600) {
  Set-StateValue 'loadAt' $now
  $load = Get-TvServerLoad $config
  if ($load) {
    $choice = Get-TvServerChoice $config $load (Get-RecentlyDead)
    $cur = $choice.current; $best = $choice.best
    Set-StateValue 'serverLoad' ([pscustomobject][ordered]@{
        server = $cur.name; loadPct = $cur.loadPct; freeMbit = $cur.freeMbit; maxMbit = $cur.maxMbit
        best = $best.name; bestFreeMbit = $best.freeMbit; checkedAt = (Get-Date).ToString('o') })
    if (Test-TvShouldMove $config $choice) {
      $wanted = [int](Get-StateValue 'moveWanted' 0) + 1
      Set-StateValue 'moveWanted' $wanted
      $busy = Test-TvPlayNowBusy $config
      if (-not $busy) { Set-StateValue 'busySince' $null }
      elseif ($null -eq (Get-StateValue 'busySince' $null)) { Set-StateValue 'busySince' $now }
      $waited = $now - [long](Get-StateValue 'busySince' $now)
      if ($wanted -ge 2 -and $now - [long](Get-StateValue 'lastSwitchAt' 0) -ge 1800 -and (-not $busy -or $waited -ge 1200)) {
        $why = "$($cur.name) has $($cur.freeMbit) Mbit/s free ($($cur.loadPct) %), $($best.name) $($best.freeMbit)"
        Set-StateValue 'moveWanted' 0; Set-StateValue 'busySince' $null; Set-StateValue 'lastSwitchAt' $now
        Set-StateValue 'exitAt' 0   # check the new exit in this run
        try {
          if (-not (Switch-TvPeer $config $choice.bestIndex $why)) { Write-TvLog "no handshake yet with $($best.name) after the switch" }
          $age = Get-TvHandshakeAge $config.name
          $status.handshakeAgeS = $age
          $healthy = $null -ne $age -and $age -lt 180
          $status.tunnel = if ($healthy) { 'up' } else { 'down' }
          $status.server = $config.peers[[int]$config.peerIndex].name
        } catch { $problems.Add("server switch failed: $($_.Exception.Message)") }
      }
    } else {
      Set-StateValue 'moveWanted' 0; Set-StateValue 'busySince' $null
    }
  }
}
$status.serverLoad = Get-StateValue 'serverLoad' $null

# 4. Firewall kill switch.
try { Set-TvFirewall $config } catch { $problems.Add("firewall: $($_.Exception.Message)") }

# 5. qBittorrent binding, connection state and leaks.
$leaks = @()
$status.qbit = [ordered]@{ reachable = $false }
try {
  $q = Connect-TvQbit $config
  $bind = Set-TvQbitBinding $config $q
  if ($bind.Interface -notlike 'missing-*' -and $bind.Interface -ne $config.qbitInterface) {
    $config | Add-Member -NotePropertyName qbitInterface -NotePropertyValue $bind.Interface -Force
    Save-TvJson $config (Join-Path (Get-TvDataDir) 'config.json')
  }
  $info = Invoke-TvQbit $q '/api/v2/transfer/info'
  $status.qbit = [ordered]@{ reachable = $true; interface = $bind.Interface; connection = $info.connection_status; externalV4 = $info.last_external_address_v4; dlSpeed = $info.dl_info_speed; upSpeed = $info.up_info_speed }

  # qBittorrent's own idea of its public address must never be the home IP once it has seen the VPN one.
  $homeIp = Get-StateValue 'homeIp' $null
  if (-not $homeIp -or $now - [long](Get-StateValue 'homeIpAt' 0) -gt 3600) {
    $h = Get-TvHomeIp; if ($h) { $homeIp = $h; Set-StateValue 'homeIp' $h; Set-StateValue 'homeIpAt' $now }
  }
  $ext = $info.last_external_address_v4
  if ($ext -and $homeIp -and $ext -ne $homeIp) { Set-StateValue 'seenVpnExternal' $true }
  if ($ext -and $homeIp -and $ext -eq $homeIp -and (Get-StateValue 'seenVpnExternal' $false)) { $leaks += "qBittorrent reports the home IP $homeIp as its public address" }

  $sockets = Get-TvQbitSockets $config
  $leaks += @($sockets.Leaks)
  # Lilin's Play now helper: a connection outside the tunnel stops it at once (Lilin carries on with qBittorrent).
  $ph = Get-TvProgramSockets $config (Get-TvPlayheadExe $config)
  if ($ph.Leaks.Count) {
    Write-TvLog ("LEAK (playhead): " + ($ph.Leaks -join '; ') + ' -> stopping playhead')
    $ph.Ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    $leaks += @($ph.Leaks | ForEach-Object { "playhead $_" })
  }
  if ($ph.Strays.Count) { $problems.Add("playhead has sockets outside the tunnel (firewall blocks them): $($ph.Strays -join '; ')") }
  $status.strays = @($sockets.Strays)
  if ($sockets.Strays.Count) { $problems.Add("qBittorrent has sockets outside the tunnel (firewall blocks them): $($sockets.Strays -join '; ')") }
  if ($leaks.Count) {
    Write-TvLog ("LEAK: " + ($leaks -join '; ') + ' -> stopping all torrents')
    try { Invoke-TvQbit $q '/api/v2/torrents/stop' @{ hashes = 'all' } | Out-Null }
    catch { Invoke-TvQbit $q '/api/v2/torrents/pause' @{ hashes = 'all' } | Out-Null }
    Set-StateValue 'leakAt' (Get-Date).ToString('o')
  }
} catch {
  $problems.Add("qBittorrent: $($_.Exception.Message)")
}
$status.leaks = $leaks
$status.lastLeakAt = Get-StateValue 'leakAt' $null
$status.lastDropAt = Get-StateValue 'dropAt' $null

# 6. Exit check through the tunnel: every 10 minutes, and right after the tunnel comes back.
$lastExit = Get-StateValue 'exit' $null
$wasHealthy = Get-StateValue 'wasHealthy' $false
if ($healthy -and $routeOk -and (-not $lastExit -or -not $wasHealthy -or $now - [long](Get-StateValue 'exitAt' 0) -ge 600)) {
  $exit = Test-TvExit $config
  Set-StateValue 'exit' $exit; Set-StateValue 'exitAt' $now
  if ($exit.ok -and $exit.ip -ne $lastExit.ip) { Write-TvLog "exit IP $($exit.ip) ($($exit.city), $($exit.country)) provider=$($exit.provider)" }
  $lastExit = $exit
}
Set-StateValue 'wasHealthy' $healthy
$status.exit = $lastExit
if ($healthy -and $lastExit -and -not $lastExit.ok) { $problems.Add("exit check failed: $($lastExit.error)") }
if ($lastExit -and $lastExit.ok -and $lastExit.provider -eq $false) { $problems.Add("the tunnel exits from $($lastExit.ip), which the provider says is not one of theirs") }
if ($lastExit -and $lastExit.ok -and $homeIp -and $lastExit.ip -eq $homeIp) { $problems.Add('the tunnel exits from the home IP') }

$status.problems = @($problems)
$status.ok = $healthy -and $routeOk -and -not $leaks.Count -and -not $problems.Count
Save-TvJson $state (Join-Path (Get-TvDataDir) 'state.json')
Save-TvJson ([pscustomobject]$status) (Join-Path (Get-TvDataDir) 'status.json')
Publish-TvStatus ([pscustomobject]$status)
$previousOk = Get-StateValue 'ok' $null
if ($previousOk -ne $status.ok) {
  Write-TvLog ("status " + $(if ($status.ok) { 'OK' } else { 'NOT OK: ' + ($problems -join '; ') }))
  Set-StateValue 'ok' $status.ok; Save-TvJson $state (Join-Path (Get-TvDataDir) 'state.json')
}
Exit-TvLock $lock
if (-not $Quiet) { [pscustomobject]$status | ConvertTo-Json -Depth 5 }
