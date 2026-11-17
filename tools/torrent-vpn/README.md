# Torrent VPN (Windows)

Puts qBittorrent, and only qBittorrent, behind a WireGuard VPN, so peers and trackers see the
VPN's address instead of yours. Lilin, remote access, DNS and everything else on the machine keep
the normal connection. It fails closed: if the tunnel is down, torrents stop moving instead of
falling back to your connection.

## How it works

| Layer | What it does |
| --- | --- |
| Split tunnel | A WireGuard tunnel service with `Table = off`, so it adds no routes of its own. The tunnel gets a default route with a high metric (5000): normal traffic keeps using your router, but a socket bound to the tunnel address can only leave through the tunnel. Windows uses the strong host model, so a source address is only ever sent out of its own interface. |
| Kill switch 1 | qBittorrent is bound to the tunnel interface *and* its address (Advanced → Network interface / Optional IP address to bind to). When the tunnel is down there is nothing to bind to, so nothing gets out. UPnP and Local Peer Discovery are turned off; both would work outside the tunnel. |
| Kill switch 2 | Windows Firewall block rules (in and out) for `qbittorrent.exe` on every local address except the tunnel's and loopback (loopback keeps its WebUI working). |
| Watchdog | Scheduled task `TorrentVpn Watchdog`, SYSTEM, every minute and at boot. It keeps the tunnel, route, firewall rules and qBittorrent binding in place, and restarts the tunnel when the handshake goes stale. After two restarts it moves to another server (picked by free bandwidth when `loadUrl` is set, see Server choice). Every 10 minutes it checks the exit IP through the tunnel. If qBittorrent ever has a connection outside the tunnel, or reports your home IP as its public address, the watchdog stops every torrent. |

Allowed IPs are `0.0.0.0/1, 128.0.0.0/1` rather than `0.0.0.0/0`. With `/0`, WireGuard for
Windows turns on its own whole-machine kill switch, which would cut the server off from the LAN.

qBittorrent's own web requests (update checks, fetching `.torrent` links) are blocked by kill
switch 2. Lilin therefore downloads `.torrent` links itself (`torrent-fetch.js`) and hands the
file to qBittorrent.

## Install

1. Install WireGuard for Windows: `winget install WireGuard.WireGuard`.
2. Get WireGuard configs from your VPN provider. For Mullvad: mullvad.net → Account → WireGuard
   configuration → Windows → Generate key. Pick a country, then **Download zip archive**. Every
   server in the zip shares one key, so the extra servers become fallbacks.
3. In an elevated PowerShell:

   ```powershell
   cd C:\path\to\lilin\tools\torrent-vpn
   .\Install-TorrentVpn.ps1 -Config $HOME\Downloads\mullvad_wireguard_windows_se_all.zip -Prefer 'se-sto'
   ```

   `-Config` takes one `.conf`, several, a folder or a `.zip`. `-Prefer` is a regex that picks
   which server to try first. qBittorrent's WebUI credentials come from Lilin's `.env`
   (`QBIT_URL`, `QBIT_USER`, `QBIT_PASS`; `-EnvFile` to point elsewhere). qBittorrent is restarted
   once so no connection opened before the switch survives it (`-NoQbitRestart` to skip).

The tunnel config, including the private key, lives in `C:\ProgramData\TorrentVpn`, readable only
by SYSTEM and Administrators.

## Check it

```powershell
.\Test-TorrentVpn.ps1          # PASS/FAIL per layer, exit IP, qBittorrent's public address
.\Test-TorrentVpn.ps1 -Drill   # also stops the tunnel for 20 s and proves nothing moves
```

- Live state: `C:\ProgramData\TorrentVpn\status.json` (copy readable by any local user, for Lilin's House tab:
  `C:\ProgramData\TorrentVpn-Status\status.json`; `lastDropAt` = when the tunnel last lost its handshake)
- Log: `C:\ProgramData\TorrentVpn\watchdog.log`

## Server choice

```powershell
.\Set-TorrentVpnServer.ps1                    # every server, * = current, free bandwidth if loadUrl is set
.\Set-TorrentVpnServer.ps1 -Server Formosa    # switch by name (regex, must match one)
.\Set-TorrentVpnServer.ps1 -Best              # switch to the one the watchdog would pick
```

A crowded VPN server is the usual reason torrents crawl. With `loadUrl` set (`-LoadUrl` at install, or
`"loadUrl"` in `config.json`; AirVPN: `https://airvpn.org/api/status/`), the watchdog reads every
server's bandwidth use every 10 minutes and moves the tunnel when the current server has less than
`minFreeMbit` (3000) Mbit/s free and another configured one has at least `moveMarginMbit` (2000) more,
or when the provider marks the current one unhealthy. It moves to the first server in the peer list
with room to spare (both thresholds added up), so keep the nearest servers first in `config.json`;
without one it takes the server with the most free bandwidth. A server with room is kept, even if it
is not the first in the list (every switch costs the peers' connections). To avoid flapping, the move has to be wanted on
two checks in a row, at least 30 minutes after the last switch, and it waits up to 20 minutes while
someone is watching a Play now download (a switch drops every peer connection). Failover picks the
same way, skipping servers that stopped answering in the last 30 minutes.
Only peers whose endpoint is an IP address are matched to the load list; a country entry given by host
name (AirVPN's `se3.vpn.airdns.org`) is only used by the plain rotation when no load data is available.
`status.json` shows the last check under `serverLoad`.

Measured from Stockholm on 2026-11-17 (AirVPN, through the tunnel, 1 and 6 parallel HTTP streams):

| Server | Capacity, load | 1 stream | 6 streams |
| --- | --- | --- | --- |
| Formosa | 20 Gbit/s, 52 % | 17 MB/s | 86 MB/s |
| Segin | 20 Gbit/s, 54 % | 9 MB/s | 54 MB/s |
| Copernicus | 2 Gbit/s, 4 % | 4 MB/s | 9 MB/s |
| Lupus | 2 Gbit/s, 88 % | 2 MB/s | 5 MB/s |
| (no tunnel) | 1 Gbit/s line | 104 MB/s | 94 MB/s |

That is why the choice goes by free bandwidth, not load percent: the 2 Gbit/s servers were slow even
nearly empty. All AirVPN servers share one public key and your device's preshared key, so another
server is a copy of a peer in `config.json` with its `ip_v4_in3` address from the status API and the same port.

## Remove

```powershell
.\Uninstall-TorrentVpn.ps1                # tunnel + watchdog gone, qBittorrent stays fenced in (no torrent traffic)
.\Uninstall-TorrentVpn.ps1 -AllowDirect   # also unbinds qBittorrent and removes the firewall rules
```

## Notes

- Providers without port forwarding (Mullvad) still download fine. Fewer peers can connect *to*
  you, so seeding and rare torrents are slower. qBittorrent shows "firewalled"; that's expected.
- DNS lookups for trackers go through the system resolver. Use DNS over HTTPS (for example
  AdGuard Home with DoH upstreams) if your ISP shouldn't see tracker hostnames.
- With a provider other than Mullvad, pass `-CheckUrl`: AirVPN `https://airvpn.org/api/whatismyip/`
  (also confirms the exit is AirVPN's and names the server), anything else `https://ipinfo.io/json`. The
  default check is Mullvad's, and it reports any other provider's exit as a problem. ipinfo.io rate-limits
  busy shared VPN exits; an answer without an IP counts as a failed check.
- Port forwarding: set qBittorrent's listening port to the exact port you reserved. Don't remap it to
  another local port, or trackers will announce the wrong one.
- Check each server's real speed before settling on one. Servers from the same provider and city can
  differ a lot. The installer starts with the first config in name order, so use `-Prefer` to choose,
  and see "Server choice" above for letting the watchdog keep choosing.
