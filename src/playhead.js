// Play now with playhead (https://github.com/Tjabooo/playhead), a BitTorrent engine built for streaming.
//
// qBittorrent keeps downloading the torrent as before: in order, with its own peers, and it's still the
// one that finishes, seeds and files the video. playhead runs next to it in "assist" mode, on the same
// torrent: it reads whatever qBittorrent already has from qBittorrent's own file, leaves the pieces
// qBittorrent is busy with alone, and fetches only what the player needs next that qBittorrent doesn't
// have yet. Those are the start, the spot someone seeks to, and pieces stuck on a slow peer. That's what
// makes seeking ahead work and stops one slow peer from freezing the picture.
//
// Safety: playhead is bound to exactly the network qBittorrent is bound to (its interface address, e.g.
// the torrent VPN's tunnel), or to PLAYHEAD_BIND_ADDRESS / PLAYHEAD_BIND_INTERFACE. If qBittorrent is
// bound to an interface Lilin can't mirror, playhead doesn't run at all. playhead itself refuses to
// start when that address is missing and drops every connection when the tunnel goes away. Lilin talks
// to it over loopback with a random token, and anything going wrong just means Play now carries on with
// qBittorrent alone.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const HEALTH_MS = 10_000;
const DOWN_RESTART_MS = 60_000; // tunnel gone this long: start again with a fresh look at the binding
const RESTART_MIN_MS = 15_000, RESTART_MAX_MS = 5 * 60_000;

// Where playhead may send traffic. null = nowhere safe to put it (playhead stays off).
export async function playheadBinding({ env = process.env, qbit, platform = process.platform } = {}) {
  if (env.PLAYHEAD_BIND_ADDRESS) return { address: env.PLAYHEAD_BIND_ADDRESS.trim() };
  if (env.PLAYHEAD_BIND_INTERFACE) return { interface: env.PLAYHEAD_BIND_INTERFACE.trim() };
  if (/^(1|true|yes|on)$/i.test(env.PLAYHEAD_UNBOUND || '')) return { unbound: true };
  if (!qbit) return null;
  const prefs = await qbit('/api/v2/app/preferences');
  const address = String(prefs?.current_interface_address || '').trim();
  const iface = String(prefs?.current_network_interface || '').trim();
  if (address && !/^(0\.0\.0\.0|::)$/.test(address)) return { address, mirrored: true };
  // Interface names only mean the same thing to both programs on Linux/macOS (Windows' are internal IDs).
  if (iface) return platform === 'win32' ? null : { interface: iface, mirrored: true };
  return { unbound: true, mirrored: true }; // qBittorrent isn't bound to anything either
}

export function bindingArgs(binding) {
  if (!binding) return null;
  if (binding.address) return ['--bind-address', binding.address];
  if (binding.interface) return ['--bind-interface', binding.interface];
  if (binding.unbound) return ['--unbound'];
  return null;
}

export const statesString = (states) => (Array.isArray(states) ? states.map((s) => (s === 2 ? '2' : s === 1 ? '1' : '0')).join('') : '');

// qBittorrent's states with playhead's own pieces on top: what can be read, from either.
export function mergeStates(states, own) {
  if (!Array.isArray(states)) return states;
  if (typeof own !== 'string' || !own) return states;
  return states.map((s, i) => (s === 2 || own.charCodeAt(i) === 50 ? 2 : s));
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

export class PlayheadService {
  // bin(): path of the playhead program (may wait for its download); binding(): see playheadBinding.
  constructor({ bin, binding, dataDir, cacheDir, dns = [], log = console, spawnFn = spawn, fetchFn = globalThis.fetch, extraArgs = [] }) {
    Object.assign(this, { bin, binding, dataDir, cacheDir, dns, log, spawnFn, fetchFn, extraArgs });
    this.child = null;
    this.port = null;
    this.token = null;
    this.starting = null;
    this.lastStart = 0;
    this.backoff = RESTART_MIN_MS;
    this.healthAt = 0;
    this.healthy = false;
    this.downSince = null;
    this.reason = 'not started';
  }

  headers(extra = {}) { return { Authorization: `Bearer ${this.token}`, ...extra }; }
  url(p) { return `http://127.0.0.1:${this.port}${p}`; }

  // True when playhead is running and its network is up. Starts it (again) when needed.
  async ready() {
    if (this.child && Date.now() - this.healthAt < HEALTH_MS) return this.healthy;
    if (!this.child) {
      if (Date.now() - this.lastStart < this.backoff) return false;
      this.starting ||= this.start().finally(() => { this.starting = null; });
      await this.starting;
      if (!this.child) return false;
    }
    await this.checkHealth();
    if (!this.healthy && this.downSince && Date.now() - this.downSince > DOWN_RESTART_MS) {
      this.log.warn?.(`[playhead] network down for a minute (${this.reason}); restarting it`);
      this.stop();
    }
    return this.healthy;
  }

  async checkHealth() {
    this.healthAt = Date.now();
    try {
      const h = await this.request('GET', '/api/health');
      this.healthy = Boolean(h?.network?.up);
      this.reason = this.healthy ? 'ok' : `network down: ${h?.network?.reason || 'unknown'}`;
    } catch (error) { this.healthy = false; this.reason = error.message; }
    if (this.healthy) { this.downSince = null; this.backoff = RESTART_MIN_MS; } else this.downSince ??= Date.now();
    return this.healthy;
  }

  async start() {
    this.lastStart = Date.now();
    this.backoff = Math.min(RESTART_MAX_MS, this.backoff * 2);
    let program, binding;
    try {
      program = await this.bin();
      binding = await this.binding();
    } catch (error) { this.reason = error.message; return; }
    const bind = bindingArgs(binding);
    if (!program || !fs.existsSync(program)) { this.reason = 'playhead isn’t installed'; return; }
    if (!bind) { this.reason = 'qBittorrent is bound to an interface Lilin can’t mirror; set PLAYHEAD_BIND_ADDRESS'; this.log.warn?.(`[playhead] off: ${this.reason}`); return; }
    const dir = path.join(this.dataDir, 'playhead');
    fs.mkdirSync(dir, { recursive: true });
    this.token = crypto.randomBytes(24).toString('hex');
    const tokenFile = path.join(dir, 'token');
    fs.writeFileSync(tokenFile, this.token, { mode: 0o600 });
    this.port = await freePort();
    const args = ['serve', '--api', `127.0.0.1:${this.port}`, '--token-file', tokenFile, '--cache-dir', this.cacheDir, ...bind,
      ...this.dns.flatMap((d) => ['--dns', d]), ...this.extraArgs];
    const child = this.spawnFn(program, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PLAYHEAD_LOG: 'warn' } });
    this.child = child;
    const lines = (chunk) => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) this.log.warn?.(`[playhead] ${line.replace(/^\[playhead \w+\] /, '')}`); };
    child.stdout?.on('data', lines);
    child.stderr?.on('data', lines);
    child.once('exit', (code, signal) => {
      if (this.child === child) { this.child = null; this.healthy = false; this.reason = `exited (${code ?? signal})`; }
      if (code) this.log.warn?.(`[playhead] exited with ${code}`);
    });
    child.once('error', (error) => { if (this.child === child) { this.child = null; this.reason = error.message; } });
    for (let i = 0; i < 50 && this.child === child; i++) {
      if (await this.checkHealth()) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (this.child === child) this.log.info?.(`[playhead] running (${bind.join(' ')})${this.healthy ? '' : `, not ready: ${this.reason}`}`);
  }

  async request(method, p, body, timeout = 10_000) {
    if (!this.port || !this.token) throw new Error('playhead isn’t running');
    const r = await this.fetchFn(this.url(p), { method, headers: this.headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!r.ok) throw Object.assign(new Error(`playhead: ${data?.error || r.status}`), { status: r.status });
    return data;
  }

  // { hash, file, torrent (Buffer|null), trackers, peers, paths, states } → { id, url, state }
  open({ hash, file, torrent, trackers = [], peers = [], paths = [], states = null }) {
    return this.request('POST', '/api/streams', {
      info_hash: hash, file, assist: true, trackers, peers, external_paths: paths, states: statesString(states),
      ...(torrent ? { torrent: Buffer.from(torrent).toString('base64') } : {}),
    }, 75_000);
  }

  update(id, { states, paths }) {
    return this.request('PUT', `/api/streams/${id}/external`, { ...(states ? { states: statesString(states) } : {}), ...(paths ? { paths } : {}) });
  }

  addPeers(id, peers) { return this.request('PUT', `/api/streams/${id}/peers`, { peers }); }
  status(id) { return this.request('GET', `/api/streams/${id}`); }
  close(id) { return this.request('DELETE', `/api/streams/${id}`); }

  // The stream, from `start` on (playhead holds the read until the pieces are there).
  fetchRange(url, start, end, signal) {
    return this.fetchFn(this.url(url), { headers: this.headers({ Range: `bytes=${start}-${end}` }), signal });
  }

  stop() {
    const c = this.child;
    this.child = null;
    this.healthy = false;
    try { c?.kill(); } catch { /* gone */ }
  }
}
