# Shared functions for the torrent VPN split tunnel (Windows, WireGuard, qBittorrent).
# Only qBittorrent uses the tunnel; everything else keeps the normal connection.
# Fail closed: qBittorrent is bound to the tunnel interface + address, and a firewall rule blocks
# qbittorrent.exe on every local address except the tunnel's.

$Script:DataDir = Join-Path $env:ProgramData 'TorrentVpn'
$Script:ConfigFile = Join-Path $Script:DataDir 'config.json'
$Script:StatusFile = Join-Path $Script:DataDir 'status.json'
$Script:StateFile = Join-Path $Script:DataDir 'state.json'
$Script:LogFile = Join-Path $Script:DataDir 'watchdog.log'
$Script:WgDir = Join-Path $env:ProgramFiles 'WireGuard'
$Script:RulePrefix = 'TorrentVpn: block qBittorrent outside tunnel'
# Lilin's Play now helper (src/playhead.js) gets the same fence: tunnel address and loopback only.
$Script:PlayheadRulePrefix = 'TorrentVpn: block playhead outside tunnel'

function Get-TvDataDir { $Script:DataDir }

function Write-TvLog([string]$Message) {
  New-Item -ItemType Directory -Force $Script:DataDir | Out-Null
  if ((Test-Path $Script:LogFile) -and (Get-Item $Script:LogFile).Length -gt 1MB) {
    Move-Item -Force $Script:LogFile "$($Script:LogFile).1"
  }
  Add-Content -Path $Script:LogFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message)
}

function Assert-TvAdmin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this as Administrator.' }
}

function Read-TvConfig {
  if (-not (Test-Path $Script:ConfigFile)) { return $null }
  Get-Content -Raw $Script:ConfigFile | ConvertFrom-Json
}

function Save-TvJson($Object, [string]$Path) {
  New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
  $tmp = "$Path.tmp"
  $Object | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $tmp
  Move-Item -Force $tmp $Path
}

# The status (no secrets: tunnel/exit addresses, problems) in a folder every local user may read,
# because the data folder is SYSTEM + Administrators only and Lilin runs unelevated.
$Script:PublicDir = Join-Path $env:ProgramData 'TorrentVpn-Status'
function Publish-TvStatus($Status) {
  if (-not (Test-Path $Script:PublicDir)) {
    New-Item -ItemType Directory -Force $Script:PublicDir | Out-Null
    & icacls $Script:PublicDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-11:(OI)(CI)RX' | Out-Null
  }
  Save-TvJson $Status (Join-Path $Script:PublicDir 'status.json')
}

function Read-TvState {
  if (Test-Path $Script:StateFile) { try { return Get-Content -Raw $Script:StateFile | ConvertFrom-Json } catch { } }
  [pscustomobject]@{}
}

# Restrict a file or folder to SYSTEM + Administrators (the tunnel config holds the private key).
function Protect-TvPath([string]$Path) {
  & icacls $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
}

# ---------- WireGuard config ----------

# Parses a provider WireGuard config and returns the fields the split tunnel needs.
function ConvertFrom-TvWireGuardConfig([string]$Text) {
  $section = ''; $iface = @{}; $peers = @()
  $peer = $null
  foreach ($raw in ($Text -split "`r?`n")) {
    $line = ($raw -replace '#.*$', '').Trim()
    if (-not $line) { continue }
    if ($line -match '^\[(\w+)\]$') {
      $section = $matches[1].ToLower()
      if ($section -eq 'peer') { $peer = @{}; $peers += $peer }
      continue
    }
    if ($line -notmatch '^([^=]+?)\s*=\s*(.*)$') { continue }
    $key = $matches[1].Trim().ToLower(); $value = $matches[2].Trim()
    if ($section -eq 'interface') { $iface[$key] = $value } elseif ($section -eq 'peer' -and $peer) { $peer[$key] = $value }
  }
  if (-not $iface.privatekey) { throw 'The WireGuard config has no [Interface] PrivateKey.' }
  if ($peers.Count -ne 1) { throw "Expected exactly one [Peer] in the WireGuard config, found $($peers.Count)." }
  $p = $peers[0]
  if (-not $p.publickey -or -not $p.endpoint) { throw 'The [Peer] needs a PublicKey and an Endpoint.' }
  $v4 = @(($iface.address -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}(/\d+)?$' })
  if (-not $v4.Count) { throw 'The [Interface] Address has no IPv4 address.' }
  [pscustomobject]@{
    PrivateKey   = $iface.privatekey
    Address      = ($v4[0] -split '/')[0]
    Mtu          = $iface.mtu
    PublicKey    = $p.publickey
    PresharedKey = $p.presharedkey
    Endpoint     = $p.endpoint
  }
}

# The tunnel config WireGuard runs: no routes of its own (Table = off), no DNS, IPv4 only.
# AllowedIPs is two /1 halves, not 0.0.0.0/0: with /0 WireGuard for Windows turns on its own
# whole-machine kill switch, which would cut the server off from the LAN.
function New-TvTunnelConfig($Parsed, $Peer = $null) {
  if ($Peer) { $Parsed = $Parsed.PSObject.Copy(); $Parsed.PublicKey = $Peer.publicKey; $Parsed.Endpoint = $Peer.endpoint; $Parsed.PresharedKey = $Peer.presharedKey }
  $lines = @('[Interface]', "PrivateKey = $($Parsed.PrivateKey)", "Address = $($Parsed.Address)/32", 'Table = off')
  if ($Parsed.Mtu) { $lines += "MTU = $($Parsed.Mtu)" }
  $lines += @('', '[Peer]', "PublicKey = $($Parsed.PublicKey)")
  if ($Parsed.PresharedKey) { $lines += "PresharedKey = $($Parsed.PresharedKey)" }
  $lines += @("Endpoint = $($Parsed.Endpoint)", 'AllowedIPs = 0.0.0.0/1, 128.0.0.0/1', 'PersistentKeepalive = 25')
  ($lines -join "`r`n") + "`r`n"
}

function Get-TvServiceName([string]$Name) { "WireGuardTunnel`$$Name" }

# wg.exe complains on stderr when the tunnel interface is gone. With stderr redirected, Windows PowerShell
# 5.1 turns that into an error that stops a caller running with ErrorActionPreference Stop: on 2026-11-15
# it ended every watchdog run while the tunnel service could not start, so the watchdog never failed over.
function Invoke-TvWg([string[]]$WgArgs) {
  $ErrorActionPreference = 'Continue'
  try { & (Join-Path $Script:WgDir 'wg.exe') @WgArgs 2>$null } catch { $null }
}

function Get-TvHandshakeAge([string]$Name) {
  $out = Invoke-TvWg @('show', $Name, 'latest-handshakes')
  if (-not $out) { return $null }
  $epoch = [long](($out -split '\s+')[1])
  if ($epoch -le 0) { return $null }
  [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $epoch)
}

# The server address the tunnel really talks to (a peer given by host name resolves at service start).
function Get-TvLiveEndpointIp([string]$Name) {
  $out = Invoke-TvWg @('show', $Name, 'endpoints')
  if ("$out" -match '\s(\d{1,3}(?:\.\d{1,3}){3}):\d+') { return $matches[1] }
  $null
}

# Points the tunnel at config.peers[$Index]. WireGuard for Windows only picks up a new endpoint when the
# tunnel service restarts (wg set does not move it), so the config is rewritten and the service restarted.
# Waits up to 20 s for the first handshake with the new server.
function Switch-TvPeer($Config, [int]$Index, [string]$Why) {
  $from = $Config.peers[[int]$Config.peerIndex].name
  $next = $Config.peers[$Index]
  $Config.peerIndex = $Index
  Set-Content -Encoding ascii -Path (Join-Path $Script:DataDir "$($Config.name).conf") -Value (New-TvTunnelConfig $Config.interface $next)
  Save-TvJson $Config $Script:ConfigFile
  Write-TvLog "switching server $from -> $($next.name): $Why"
  Restart-Service (Get-TvServiceName $Config.name) -Force
  Start-Sleep 5
  Set-TvRoute $Config | Out-Null
  for ($i = 0; $i -lt 15; $i++) {
    $age = Get-TvHandshakeAge $Config.name
    if ($null -ne $age -and $age -lt 30) { return $true }
    Start-Sleep 1
  }
  $false
}

# One switch at a time: the watchdog holds this for its whole run, Set-TorrentVpnServer while it switches.
# The mutex grants SYSTEM and Administrators full access: with the default security an elevated admin
# shell can't open the one the SYSTEM watchdog created ("Access denied"), and the other way round.
function Enter-TvLock([int]$TimeoutS = 90) {
  $sec = New-Object Security.AccessControl.MutexSecurity
  foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') {
    $who = New-Object Security.Principal.SecurityIdentifier $sid
    $sec.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule($who, [Security.AccessControl.MutexRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow)))
  }
  $deadline = (Get-Date).AddSeconds($TimeoutS)
  $m = $null
  while (-not $m) {
    try { $created = $false; $m = [Threading.Mutex]::new($false, 'Global\TorrentVpnWatchdog', [ref]$created, $sec) }
    catch [UnauthorizedAccessException] {
      # An older copy of this code holds a mutex with default security; it goes away when that run ends.
      if ((Get-Date) -gt $deadline) { throw 'the TorrentVpn lock is held by a run this account cannot open' }
      Start-Sleep 1
    }
  }
  $left = [Math]::Max(1000, [int](($deadline - (Get-Date)).TotalMilliseconds))
  try { if (-not $m.WaitOne($left)) { $m.Dispose(); throw 'another TorrentVpn run holds the lock' } }
  catch [Threading.AbandonedMutexException] { }   # the previous holder died; the lock is ours now
  $m
}
function Exit-TvLock($Mutex) { if ($Mutex) { try { $Mutex.ReleaseMutex() } catch { }; $Mutex.Dispose() } }

# ---------- routing ----------

# A default route on the tunnel with a high metric: normal traffic still prefers Ethernet, but a
# socket bound to the tunnel address (qBittorrent) can only leave through the tunnel, because
# Windows uses the strong host model (a source address is only sent out of its own interface).
function Set-TvRoute($Config) {
  $adapter = Get-NetAdapter -Name $Config.name -ErrorAction SilentlyContinue
  if (-not $adapter -or $adapter.Status -ne 'Up') { return $false }
  $ip = Get-NetIPInterface -InterfaceAlias $Config.name -AddressFamily IPv4 -ErrorAction SilentlyContinue
  if ($ip.InterfaceMetric -ne $Config.metric) { Set-NetIPInterface -InterfaceAlias $Config.name -AddressFamily IPv4 -InterfaceMetric $Config.metric }
  if ($ip.WeakHostSend -ne 'Disabled') { Set-NetIPInterface -InterfaceAlias $Config.name -AddressFamily IPv4 -WeakHostSend Disabled }
  $route = Get-NetRoute -InterfaceAlias $Config.name -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue
  if (-not $route) {
    New-NetRoute -InterfaceAlias $Config.name -DestinationPrefix '0.0.0.0/0' -NextHop '0.0.0.0' -RouteMetric $Config.metric -PolicyStore ActiveStore | Out-Null
    Write-TvLog 'route added on tunnel'
  }
  $true
}

# ---------- firewall ----------

function ConvertTo-TvUInt([string]$Ip) {
  $b = ([Net.IPAddress]::Parse($Ip)).GetAddressBytes(); [Array]::Reverse($b); [BitConverter]::ToUInt32($b, 0)
}
function ConvertFrom-TvUInt([uint32]$N) {
  $b = [BitConverter]::GetBytes($N); [Array]::Reverse($b); ([Net.IPAddress]$b).ToString()
}

# Every local address except the tunnel's and loopback, as firewall ranges.
function Get-TvBlockedLocalRanges([string]$TunnelIp) {
  $holes = @(
    @((ConvertTo-TvUInt '127.0.0.0'), (ConvertTo-TvUInt '127.255.255.255')),
    @((ConvertTo-TvUInt $TunnelIp), (ConvertTo-TvUInt $TunnelIp))
  ) | Sort-Object { $_[0] }
  $ranges = @(); [uint64]$start = 0
  foreach ($h in $holes) {
    if ([uint64]$h[0] -gt $start) { $ranges += '{0}-{1}' -f (ConvertFrom-TvUInt ([uint32]$start)), (ConvertFrom-TvUInt ([uint32]([uint64]$h[0] - 1))) }
    $start = [uint64]$h[1] + 1
  }
  if ($start -le [uint32]::MaxValue) { $ranges += '{0}-255.255.255.255' -f (ConvertFrom-TvUInt ([uint32]$start)) }
  $ranges + @('::-::0', '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
}

# Where Lilin keeps playhead.exe: playheadExe in the config, else PLAYHEAD_BIN or DATA_DIR\bin from
# Lilin's .env, else the bin folder next to that .env (Lilin's default DATA_DIR).
function Get-TvPlayheadExe($Config) {
  if ($Config.playheadExe) { return $Config.playheadExe }
  $root = Split-Path $Config.envFile
  $vars = @{}
  if (Test-Path $Config.envFile) {
    foreach ($line in Get-Content $Config.envFile) {
      if ($line -match '^\s*(PLAYHEAD_BIN|DATA_DIR)\s*=\s*"?([^"#]*?)"?\s*$') { $vars[$Matches[1]] = $Matches[2] }
    }
  }
  if ($vars.PLAYHEAD_BIN) { return [IO.Path]::GetFullPath((Join-Path $root $vars.PLAYHEAD_BIN)) }
  $data = if ($vars.DATA_DIR) { [IO.Path]::GetFullPath((Join-Path $root $vars.DATA_DIR)) } else { $root }
  Join-Path $data 'bin\playhead.exe'
}

function Set-TvProgramFirewall($Config, [string]$Prefix, [string]$Exe, [string]$Label) {
  $ranges = Get-TvBlockedLocalRanges $Config.address
  $sig = "[sig $($Config.address) $Exe]"
  foreach ($dir in 'Outbound', 'Inbound') {
    $name = "$Prefix ($dir)"
    $existing = @(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
    $good = @($existing | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' -and "$($_.Description)".EndsWith($sig) })
    if ($good.Count -eq 1 -and $existing.Count -eq 1) { continue }
    # New rule first, then drop the old ones, so the program is never unfenced in between.
    $rule = New-NetFirewallRule -DisplayName $name -Direction $dir -Action Block -Program $Exe -LocalAddress $ranges -Profile Any `
      -Description "Torrent VPN kill switch: $Label may only use the tunnel address (and loopback for its API). $sig"
    $existing | Where-Object { $_.Name -ne $rule.Name } | Remove-NetFirewallRule
    Write-TvLog "firewall rule for $Label ($dir) set"
  }
}

function Set-TvFirewall($Config) {
  Set-TvProgramFirewall $Config $Script:RulePrefix $Config.qbitExe 'qBittorrent'
  Set-TvProgramFirewall $Config $Script:PlayheadRulePrefix (Get-TvPlayheadExe $Config) 'playhead'
}

# ---------- qBittorrent ----------

function Get-TvQbitCredentials($Config) {
  $vals = @{}
  Get-Content $Config.envFile | Where-Object { $_ -match '^\s*(QBIT_URL|QBIT_USER|QBIT_PASS)\s*=\s*(.*)$' } | ForEach-Object {
    $vals[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
  $url = if ($Config.qbitUrl) { $Config.qbitUrl } elseif ($vals.QBIT_URL) { $vals.QBIT_URL } else { 'http://127.0.0.1:8080' }
  [pscustomobject]@{ Url = $url.TrimEnd('/'); User = $vals.QBIT_USER; Pass = $vals.QBIT_PASS }
}

function Connect-TvQbit($Config) {
  $c = Get-TvQbitCredentials $Config
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $headers = @{ Referer = $c.Url }
  if ($c.User) {
    $r = Invoke-WebRequest -UseBasicParsing -WebSession $session -Method Post "$($c.Url)/api/v2/auth/login" `
      -Body @{ username = $c.User; password = $c.Pass } -Headers $headers -TimeoutSec 10
    if ($r.Content -match 'Fails') { throw 'qBittorrent rejected the login from the env file.' }
  }
  [pscustomobject]@{ Url = $c.Url; Session = $session; Headers = $headers }
}

function Invoke-TvQbit($Q, [string]$Path, $Form = $null) {
  if ($Form) {
    $r = Invoke-WebRequest -UseBasicParsing -WebSession $Q.Session -Method Post "$($Q.Url)$Path" -Body $Form -Headers $Q.Headers -TimeoutSec 15
  } else {
    $r = Invoke-WebRequest -UseBasicParsing -WebSession $Q.Session "$($Q.Url)$Path" -Headers $Q.Headers -TimeoutSec 15
  }
  $text = "$($r.Content)".Trim()
  if ($text.StartsWith('{') -or $text.StartsWith('[')) { return $text | ConvertFrom-Json }
  $text
}

function Get-TvQbitInterfaceValue($Q, [string]$Name) {
  $list = Invoke-TvQbit $Q '/api/v2/app/networkInterfaceList'
  ($list | Where-Object { $_.name -eq $Name } | Select-Object -First 1).value
}

# Binds qBittorrent to the tunnel interface and address and turns UPnP off (a UPnP mapping on the
# home router would point at the home IP). Returns what changed.
function Set-TvQbitBinding($Config, $Q) {
  $prefs = Invoke-TvQbit $Q '/api/v2/app/preferences'
  $want = @{}
  $iface = Get-TvQbitInterfaceValue $Q $Config.name
  if (-not $iface -and $Config.qbitInterface) { $iface = $Config.qbitInterface }   # tunnel down: keep the last known value
  if (-not $iface) { $iface = "missing-$($Config.name)" }                          # never fall back to "any interface"
  if ($prefs.current_network_interface -ne $iface) { $want.current_network_interface = $iface }
  if ($prefs.current_interface_address -ne $Config.address) { $want.current_interface_address = $Config.address }
  if ($prefs.upnp) { $want.upnp = $false }
  if ($prefs.lsd) { $want.lsd = $false }   # Local Peer Discovery multicasts on the LAN, outside the tunnel
  if ($want.Count) {
    Invoke-TvQbit $Q '/api/v2/app/setPreferences' @{ json = ($want | ConvertTo-Json -Compress) } | Out-Null
    Write-TvLog ("qBittorrent binding set: " + (($want.Keys | Sort-Object) -join ', '))
  }
  [pscustomobject]@{ Interface = $iface; Changed = @($want.Keys) }
}

# qBittorrent sockets that are NOT on the tunnel (loopback excepted).
# Leaks = connections actually open or opening on another address (the firewall should make these
# impossible). Strays = listening or UDP sockets on another address: blocked by the firewall, but
# reported so a config drift gets noticed. Unconnected "Bound" TCP sockets are neither.
function Get-TvQbitSockets($Config) { Get-TvProgramSockets $Config $Config.qbitExe }

# The same for any program (playhead).
function Get-TvProgramSockets($Config, [string]$Exe) {
  $result = [pscustomobject]@{ Leaks = @(); Strays = @(); Ids = @() }
  $ids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe } | ForEach-Object Id)
  $result.Ids = $ids
  if (-not $ids.Count) { return $result }
  $ok = { param($a) $a -eq $Config.address -or $a -like '127.*' -or $a -eq '::1' }
  $tcp = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess -and -not (& $ok $_.LocalAddress) })
  $result.Leaks = @($tcp | Where-Object { $_.State -notin 'Listen', 'Bound' -and $_.RemoteAddress -notlike '127.*' -and $_.RemoteAddress -ne '::1' -and $_.RemoteAddress -ne '0.0.0.0' } |
    ForEach-Object { "tcp $($_.State) $($_.LocalAddress):$($_.LocalPort) -> $($_.RemoteAddress):$($_.RemotePort)" })
  $result.Strays = @($tcp | Where-Object State -eq 'Listen' | ForEach-Object { "listen $($_.LocalAddress):$($_.LocalPort)" }) +
    @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess -and -not (& $ok $_.LocalAddress) } |
      ForEach-Object { "udp $($_.LocalAddress):$($_.LocalPort)" })
  $result
}

# ---------- exit check ----------

# Asks the provider's check page which IP the tunnel exits from, using a socket bound to the tunnel.
# Understands Mullvad's (am.i.mullvad.net/json) and AirVPN's (airvpn.org/api/whatismyip/) answers, which
# also confirm the exit is theirs, and generic ones with an "ip" field (ipinfo.io/json). An answer without
# an IP (ipinfo.io rate-limits busy VPN exits with a 429 body) is a failed check, not a pass.
function Test-TvExit($Config) {
  $json = & curl.exe -s -m 12 --interface $Config.address $Config.checkUrl 2>$null
  if (-not $json) { return [pscustomobject]@{ ok = $false; ip = $null; provider = $null; error = 'no answer through the tunnel' } }
  try { $j = ($json -join '') | ConvertFrom-Json } catch { return [pscustomobject]@{ ok = $false; ip = $null; provider = $null; error = 'unexpected answer' } }
  if ("$($j.ip)" -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    $why = if ($j.status) { " (status $($j.status))" } else { '' }
    return [pscustomobject]@{ ok = $false; ip = $null; provider = $null; error = "no IP in the answer$why" }
  }
  $isVpn = $null; $server = $null; $city = $j.city; $country = $j.country
  if ($null -ne $j.mullvad_exit_ip) { $isVpn = [bool]$j.mullvad_exit_ip; $server = $j.mullvad_exit_ip_hostname }
  elseif ($null -ne $j.airvpn) { $isVpn = [bool]$j.airvpn; $server = $j.server_name; if ($j.geo) { $country = $j.geo.name } }
  [pscustomobject]@{ ok = $true; ip = $j.ip; provider = $isVpn; city = $city; country = $country; server = $server; error = $null }
}

# ---------- server choice (provider load) ----------
# AirVPN publishes every server's bandwidth use (loadUrl = https://airvpn.org/api/status/). Peers are
# matched to servers by entry IP, so only peers whose endpoint is an IP address take part. Measured
# 2026-11-17 from Stockholm: 20 Gbit/s servers with ~9 Gbit/s free gave 54-86 MB/s through the tunnel,
# 2 Gbit/s servers 5-9 MB/s even at 4 % load, so the choice goes by free bandwidth, not load percent.
# The peer list order is the preference (nearest first): the first server with room to spare wins.

# Hashtable entry IP -> server (name, load %, free and max Mbit/s, healthy), or $null without data.
function Get-TvServerLoad($Config) {
  if (-not $Config.loadUrl) { return $null }
  $json = & curl.exe -s -m 15 $Config.loadUrl 2>$null
  if (-not $json) { return $null }
  try { $j = ($json -join "`n") | ConvertFrom-Json } catch { return $null }
  if (-not $j.servers) { return $null }
  $byIp = @{}
  foreach ($s in $j.servers) {
    $info = [pscustomobject]@{ name = $s.public_name; loadPct = [int]$s.currentload; freeMbit = [int]$s.bw_max - [int]$s.bw; maxMbit = [int]$s.bw_max; healthy = ($s.health -eq 'ok') }
    foreach ($k in 'ip_v4_in1', 'ip_v4_in2', 'ip_v4_in3', 'ip_v4_in4') { if ($s.$k) { $byIp[[string]$s.$k] = $info } }
  }
  $byIp
}

function Get-TvPeerIp($Peer) { ($Peer.endpoint -split ':')[0] }

# Thresholds in Mbit/s: a server is crowded below minFreeMbit free (config.json, default 3000); a move
# needs moveMarginMbit (default 2000) more; "room to spare" is the sum of both.
function Get-TvLoadLimits($Config) {
  $min = if ($Config.minFreeMbit) { [int]$Config.minFreeMbit } else { 3000 }
  $margin = if ($Config.moveMarginMbit) { [int]$Config.moveMarginMbit } else { 2000 }
  [pscustomobject]@{ minFree = $min; margin = $margin; roomy = $min + $margin }
}

# The server the tunnel uses now and the one to move to: the first configured server (list order) with
# room to spare, else the one with the most free bandwidth. Skips unhealthy servers, the current one and
# $Skip (peer indexes that failed recently). settled = the current server is roomy and nothing roomy comes
# before it in the list.
function Get-TvServerChoice($Config, $Load, [int[]]$Skip = @()) {
  $roomy = (Get-TvLoadLimits $Config).roomy
  $liveIp = Get-TvLiveEndpointIp $Config.name
  if (-not $liveIp) { $liveIp = Get-TvPeerIp $Config.peers[[int]$Config.peerIndex] }
  $current = $Load[[string]$liveIp]
  $currentPos = -1; $first = $null; $firstIndex = -1; $most = $null; $mostIndex = -1
  for ($i = 0; $i -lt $Config.peers.Count; $i++) {
    $ip = Get-TvPeerIp $Config.peers[$i]
    if ($ip -eq $liveIp -and $currentPos -lt 0) { $currentPos = $i }
    $s = $Load[[string]$ip]
    if (-not $s -or -not $s.healthy -or $ip -eq $liveIp -or $Skip -contains $i) { continue }
    if ($firstIndex -lt 0 -and $s.freeMbit -ge $roomy) { $first = $s; $firstIndex = $i }
    if (-not $most -or $s.freeMbit -gt $most.freeMbit) { $most = $s; $mostIndex = $i }
  }
  if ($currentPos -lt 0) { $currentPos = [int]$Config.peerIndex }
  $best = if ($first) { $first } else { $most }
  $bestIndex = if ($first) { $firstIndex } else { $mostIndex }
  $settled = [bool]($current -and $current.healthy -and $current.freeMbit -ge $roomy -and ($firstIndex -lt 0 -or $currentPos -lt $firstIndex))
  [pscustomobject]@{ current = $current; best = $best; bestIndex = $bestIndex; settled = $settled }
}

# Leave the current server when the provider marks it unhealthy, or when it has less than minFreeMbit
# free and the chosen one has at least moveMarginMbit more. An unknown current server stays.
function Test-TvShouldMove($Config, $Choice) {
  if (-not $Choice.best -or -not $Choice.current) { return $false }
  if (-not $Choice.current.healthy) { return $true }
  $lim = Get-TvLoadLimits $Config
  $Choice.current.freeMbit -lt $lim.minFree -and $Choice.best.freeMbit -ge $Choice.current.freeMbit + $lim.margin
}

# The peer to fail over to when the current one stops answering: the server Get-TvServerChoice picks
# when load data is available, otherwise the next one in the list.
function Select-TvFailoverPeer($Config, [int[]]$Skip = @()) {
  $load = Get-TvServerLoad $Config
  if ($load) {
    $choice = Get-TvServerChoice $Config $load (@($Skip) + @([int]$Config.peerIndex))
    if ($choice.bestIndex -ge 0) { return $choice.bestIndex }
  }
  ([int]$Config.peerIndex + 1) % $Config.peers.Count
}

# True while Lilin's Play now helper has peer connections, i.e. someone is watching a download.
function Test-TvPlayNowBusy($Config) {
  $exe = Get-TvPlayheadExe $Config
  $ids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | ForEach-Object Id)
  if (-not $ids.Count) { return $false }
  [bool](Get-NetTCPConnection -State Established -LocalAddress $Config.address -ErrorAction SilentlyContinue |
    Where-Object { $ids -contains $_.OwningProcess } | Select-Object -First 1)
}

function Get-TvHomeIp {
  $ip = & curl.exe -s -m 8 https://api.ipify.org 2>$null
  if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
  $null
}

Export-ModuleMember -Function *
