<#
.SYNOPSIS
  Lists the torrent tunnel's servers, or switches the tunnel to one of them.

.DESCRIPTION
  Without arguments: every configured server, the current one marked with *, plus its free bandwidth
  when loadUrl is set in config.json (AirVPN's status API). -Server switches to the one whose name
  matches (a regex, it must match exactly one); -Best to the one with the most free bandwidth.
  The watchdog leaves a hand-picked server alone for 30 minutes, then moves on by itself if it is crowded.
  Run as Administrator.

.EXAMPLE
  .\Set-TorrentVpnServer.ps1
  .\Set-TorrentVpnServer.ps1 -Server Formosa
  .\Set-TorrentVpnServer.ps1 -Best
#>
param([string]$Server = '', [switch]$Best)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TorrentVpn.psm1') -Force
Assert-TvAdmin
$cfg = Read-TvConfig
if (-not $cfg) { throw 'Torrent VPN is not installed (no config.json).' }
$load = Get-TvServerLoad $cfg

if (-not $Server -and -not $Best) {
  if ($cfg.loadUrl -and -not $load) { Write-Warning "No answer from $($cfg.loadUrl)" }
  for ($i = 0; $i -lt $cfg.peers.Count; $i++) {
    $p = $cfg.peers[$i]
    $s = if ($load) { $load[[string](Get-TvPeerIp $p)] } else { $null }
    $info = if ($s) { '{0,6} Mbit/s free of {1,5} ({2,3} %){3}' -f $s.freeMbit, $s.maxMbit, $s.loadPct, $(if (-not $s.healthy) { ' UNHEALTHY' } else { '' }) } else { '' }
    '{0} {1,2} {2,-50} {3}' -f $(if ($i -eq [int]$cfg.peerIndex) { '*' } else { ' ' }), $i, $p.name, $info
  }
  $live = Get-TvLiveEndpointIp $cfg.name
  if ($live) { "live endpoint $live$(if ($load -and $load[$live]) { " = $($load[$live].name)" })" }
  return
}

if ($Best) {
  if (-not $load) { throw 'No load data: set loadUrl in config.json (https://airvpn.org/api/status/ for AirVPN).' }
  $choice = Get-TvServerChoice $cfg $load
  if ($choice.bestIndex -lt 0) { throw 'No other server with load data.' }
  if ($choice.current -and $choice.current.healthy -and $choice.current.freeMbit -ge $choice.best.freeMbit) {
    "Already on the server with the most free bandwidth ($($choice.current.name), $($choice.current.freeMbit) Mbit/s)."
    return
  }
  $index = $choice.bestIndex
} else {
  $hits = @(for ($i = 0; $i -lt $cfg.peers.Count; $i++) { if ($cfg.peers[$i].name -match $Server) { $i } })
  if ($hits.Count -ne 1) { throw "'$Server' matches $($hits.Count) servers; run without arguments to list them." }
  $index = $hits[0]
}

$lock = Enter-TvLock 90
try {
  $cfg = Read-TvConfig
  $t0 = Get-Date
  $ok = Switch-TvPeer $cfg $index 'chosen by hand'
  # The watchdog checks the new exit on its next run and keeps this server for at least 30 minutes.
  $state = Read-TvState
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  foreach ($kv in @{ exitAt = 0; lastSwitchAt = $now; moveWanted = 0; restarts = 0 }.GetEnumerator()) {
    $state | Add-Member -NotePropertyName $kv.Key -NotePropertyValue $kv.Value -Force
  }
  Save-TvJson $state (Join-Path (Get-TvDataDir) 'state.json')
} finally { Exit-TvLock $lock }

"{0} in {1:N0} s, handshake: {2}" -f $cfg.peers[$index].name, ((Get-Date) - $t0).TotalSeconds, $(if ($ok) { 'yes' } else { 'NOT YET (the watchdog fails over if it never comes)' })
$exit = Test-TvExit $cfg
if ($exit.ok) { "exit {0} {1} {2}" -f $exit.ip, $exit.server, $exit.country } else { "exit check: $($exit.error)" }
$sock = Get-TvQbitSockets $cfg
if ($sock.Leaks.Count) { Write-Warning ("qBittorrent connections outside the tunnel: " + ($sock.Leaks -join '; ')) }
