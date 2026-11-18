"""lilin-house for Windows: tell Lilin's House tab that a dual-boot machine is up in Windows.

The Windows side of agents/lilin-house. On a machine that also boots Linux, Lilin shows one card per
machine; without this it can only say "Off, or in Windows". Run as SYSTEM at startup, it sends:

  - the boot poll (every 30 s, /api/house/boot) with `running: "windows"`: the power card shows
    "On · Windows" and its Restart buttons work (Windows restarts into GRUB's default, Linux)
  - a health report (every 5 min, /api/house/report): Windows version, uptime, memory, disks

  python lilin-house-windows.py setup URL TOKEN [--host NAME]   admin, once, at home: saves the
        server + HOUSE_TOKEN + this network's router (by MAC) and installs the startup task.
        NAME is the machine's name in Lilin: its Linux hostname, so both systems are one card.
        TOKEN may be @FILE: read from that file, which is then deleted (keeps it off command lines).
  python lilin-house-windows.py run       the loop the task runs (as SYSTEM)
  python lilin-house-windows.py json      print what would be sent
  python lilin-house-windows.py remove    admin: delete the task and the saved settings

Like the Linux agent it only talks while the router's MAC matches the one saved by setup, so the
token never goes to some other network. Python 3.9+ standard library only.
"""
import ctypes
import json
import os
import platform
import re
import shutil
import string
import subprocess
import sys
import time
import urllib.request
import winreg
from ctypes import wintypes
from pathlib import Path

HOME = Path(os.environ.get('ProgramData', r'C:\ProgramData')) / 'lilin-house'
CONF = HOME / 'config.json'
AGENT = HOME / 'lilin-house-windows.py'
LOG = HOME / 'agent.log'
TASK = 'lilin-house'
POLL_S = 30
REPORT_S = 300
NO_WINDOW = 0x08000000


def sh(*cmd, timeout=10):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW).stdout
    except (OSError, subprocess.TimeoutExpired):
        return ''


def log(msg):
    try:
        if LOG.exists() and LOG.stat().st_size > 256 * 1024:
            LOG.replace(LOG.with_suffix('.old'))
        with LOG.open('a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except OSError:
        pass


# ---------- home network check ----------
def gateway():
    best = None
    for line in sh('route', 'print', '-4', '0.0.0.0').splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == '0.0.0.0' and f[1] == '0.0.0.0' and re.match(r'^\d+\.\d+\.\d+\.\d+$', f[2]):
            metric = int(f[4]) if f[4].isdigit() else 9999
            if best is None or metric < best[1]:
                best = (f[2], metric)
    return best[0] if best else None


def gw_mac():
    gw = gateway()
    if not gw:
        return ''
    for _ in range(2):
        m = re.search(re.escape(gw) + r'\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})', sh('arp', '-a', gw), re.I)
        if m:
            return m.group(1).lower().replace('-', ':')
        sh('ping', '-n', '1', '-w', '1000', gw)  # just booted: nothing has talked to the router yet
    return ''


def at_home(conf):
    return bool(conf.get('url') and conf.get('token') and conf.get('home_gw_mac')) and gw_mac() == conf['home_gw_mac']


# ---------- what this machine is ----------
class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [('dwLength', wintypes.DWORD), ('dwMemoryLoad', wintypes.DWORD), ('ullTotalPhys', ctypes.c_ulonglong),
                ('ullAvailPhys', ctypes.c_ulonglong), ('ullTotalPageFile', ctypes.c_ulonglong),
                ('ullAvailPageFile', ctypes.c_ulonglong), ('ullTotalVirtual', ctypes.c_ulonglong),
                ('ullAvailVirtual', ctypes.c_ulonglong), ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]


def uptime():
    k = ctypes.windll.kernel32
    k.GetTickCount64.restype = ctypes.c_ulonglong
    return int(k.GetTickCount64() // 1000)


def memory():
    st = MEMORYSTATUSEX()
    st.dwLength = ctypes.sizeof(st)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
    return {'total': st.ullTotalPhys, 'avail': st.ullAvailPhys}


def disks():
    out = []
    mask = ctypes.windll.kernel32.GetLogicalDrives()
    for i, letter in enumerate(string.ascii_uppercase):
        root = f'{letter}:\\'
        if mask >> i & 1 and ctypes.windll.kernel32.GetDriveTypeW(root) == 3:  # DRIVE_FIXED
            try:
                u = shutil.disk_usage(root)
                out.append({'mount': f'{letter}:', 'size': u.total, 'used': u.used})
            except OSError:
                pass
    return out[:8]


def reg(path, name):
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as k:
            return winreg.QueryValueEx(k, name)[0]
    except OSError:
        return None


def os_name():
    v = r'SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    name = reg(v, 'ProductName') or 'Windows'
    build = reg(v, 'CurrentBuildNumber')
    if build and int(build) >= 22000:
        name = name.replace('Windows 10', 'Windows 11')  # ProductName still says 10 on 11
    return name


def kernel():
    v = r'SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    build, ubr = reg(v, 'CurrentBuildNumber'), reg(v, 'UBR')
    return f'{platform.version().rsplit(".", 1)[0]}.{build}.{ubr}' if build and ubr is not None else platform.version()


def secure_boot():
    v = reg(r'SYSTEM\CurrentControlSet\Control\SecureBoot\State', 'UEFISecureBootEnabled')
    return None if v is None else bool(v)


def wired_mac():
    """MAC of the connected wired card (the one Wake-on-LAN uses), as aa:bb:cc:dd:ee:ff."""
    rows = sh('getmac', '/fo', 'csv', '/nh', '/v').splitlines()
    for row in rows:
        f = [x.strip('"') for x in row.split('","')]
        if len(f) >= 4 and re.match(r'^[0-9A-F]{2}(-[0-9A-F]{2}){5}$', f[2], re.I) and 'disconnected' not in f[3].lower() \
                and not re.search(r'wi-?fi|wireless|wlan|virtual|vpn|wireguard|bluetooth|parsec|hyper-v', f[0] + f[1], re.I):
            return f[2].lower().replace('-', ':'), f[0]
    return '', ''


def boot_body(conf):
    mac, iface = wired_mac()
    return {'host': conf['host'], 'running': 'windows', 'mac': mac, 'iface': iface[:20], 'wired': bool(mac), 'uptime': uptime()}


def report_body(conf):
    return {'host': conf['host'], 'kind': 'desktop', 'os': os_name(), 'kernel': kernel(), 'uptime': uptime(),
            'load': None, 'cpus': os.cpu_count(), 'mem': memory(), 'disks': disks(), 'failed': [],
            'updates': None, 'last_backup': None, 'battery': None, 'secure_boot': secure_boot(), 'vpn': None}


def post(conf, path, body):
    req = urllib.request.Request(conf['url'] + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'X-Lilin-Token': conf['token']})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read() or b'{}')


# ---------- the loop ----------
def run():
    last_report = 0
    log('started')
    while True:
        conf = read_conf()
        try:
            if conf and at_home(conf):
                reply = post(conf, '/api/house/boot', boot_body(conf))
                if reply.get('reboot'):
                    # Windows can't pick GRUB's entry: it restarts into GRUB's default (Linux), and Lilin
                    # has Linux hand over again when the restart was meant to end in Windows
                    log(f"Lilin asked for a restart{' into ' + reply['entry'] if reply.get('entry') else ''}")
                    sh('shutdown', '/r', '/t', '5', '/c', 'Lilin: restarting')
                    return
                if time.time() - last_report >= REPORT_S:
                    post(conf, '/api/house/report', report_body(conf))
                    last_report = time.time()
        except Exception as e:  # server down or restarting: try again next round
            log(f'{type(e).__name__}: {e}')
        time.sleep(POLL_S)


# ---------- setup ----------
def read_conf():
    try:
        return json.loads(CONF.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except OSError:
        return False


def setup(url, token, host):
    if not is_admin():
        sys.exit('setup needs an elevated prompt (it installs a startup task that runs as SYSTEM)')
    if token.startswith('@'):
        src = Path(token[1:])
        token = src.read_text(encoding='utf-8').strip()
        src.unlink()
    mac = gw_mac()
    if not mac:
        sys.exit('no default route: connect to the home network first')
    HOME.mkdir(parents=True, exist_ok=True)
    CONF.write_text(json.dumps({'url': url.rstrip('/'), 'token': token, 'host': host, 'home_gw_mac': mac}, indent=2), encoding='utf-8')
    # the token: SYSTEM and administrators only
    sh('icacls', str(HOME), '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
    if Path(__file__).resolve() != AGENT:
        shutil.copy2(__file__, AGENT)
    pyw = Path(sys.executable).with_name('pythonw.exe')
    action = f'"{pyw if pyw.exists() else sys.executable}" "{AGENT}" run'
    out = subprocess.run(['schtasks', '/create', '/f', '/tn', TASK, '/sc', 'onstart', '/ru', 'SYSTEM', '/rl', 'HIGHEST', '/tr', action],
                         capture_output=True, text=True)
    if out.returncode:
        sys.exit(f'could not create the startup task: {(out.stderr or out.stdout).strip()}')
    subprocess.run(['schtasks', '/run', '/tn', TASK], capture_output=True)
    conf = read_conf()
    print(f'saved {CONF} (home = router {mac}); task "{TASK}" runs at startup as SYSTEM and is running now')
    try:
        post(conf, '/api/house/boot', boot_body(conf))
        print(f'Lilin accepted the first poll: {host} shows as on in Windows')
    except Exception as e:
        print(f'first poll failed ({e}); the task keeps trying every {POLL_S} s')


def remove():
    if not is_admin():
        sys.exit('remove needs an elevated prompt')
    subprocess.run(['schtasks', '/end', '/tn', TASK], capture_output=True)
    subprocess.run(['schtasks', '/delete', '/f', '/tn', TASK], capture_output=True)
    shutil.rmtree(HOME, ignore_errors=True)
    print('removed')


def main():
    a = sys.argv[1:]
    cmd = a[0] if a else ''
    if cmd == 'setup' and len(a) >= 3:
        host = a[a.index('--host') + 1] if '--host' in a else platform.node().lower()
        if not re.match(r'^[\w.-]{1,40}$', host):
            sys.exit('bad --host name')
        setup(a[1], a[2], host)
    elif cmd == 'run':
        run()
    elif cmd == 'json':
        conf = read_conf() or {'host': platform.node().lower()}
        print(json.dumps({'boot': boot_body(conf), 'report': report_body(conf), 'at_home': bool(read_conf()) and at_home(conf)}, indent=2))
    elif cmd == 'remove':
        remove()
    else:
        print(__doc__.strip())
        sys.exit(2)


if __name__ == '__main__':
    main()
