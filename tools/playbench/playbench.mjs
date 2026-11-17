#!/usr/bin/env node
// playbench: how long a first-time watch takes on a Lilin server, measured through Lilin's real API the way the
// web app's Add / Play now does it. No dependencies (Node 22+). ffprobe on PATH checks the first HLS piece.
//
// Per title it presses Add (POST /api/downloads/smart, polled like app.js), waits for the download to show up and
// for its Play now button (listDownloads `started`, polled every 3 s like the app), presses Play now
// (/api/part/open every 1.5 s until ready), then plays the HLS stream with a virtual player that fetches pieces
// like hls.js (30 s ahead, RebufferHold 8/16/32 s after a stall) and polls /api/part/status every 3 s.
// Optionally a read-only sampler on the server (server-sampler.ps1) records what else is going on (see below).
//
//   playbench.mjs resolve  TITLES.json                       TMDB ids via Lilin's search + "already on the server?"
//   playbench.mjs run      TITLES.json [--only a,b] [--cap-min 10] [--out FILE.jsonl] [--keep] [--stop-when-smooth]
//                          (default: watch until the download is done + 2 min, or the cap; --stop-when-smooth ends a
//                          title 30 s after playback is smooth, skipping the full-download time)
//   playbench.mjs together TITLES.json --only a,b[,c] ...    the same, all pressed at once (contention)
//   playbench.mjs cleanup  FILE.jsonl [--dry-run] [--finished-only]   removes what the runs started (Lilin's own
//                                                            paths); --finished-only leaves running downloads alone
//   playbench.mjs summary  FILE.jsonl [...more] [--md OUT.md]
//
// TITLES.json: [{ "label": "phm", "category": "new-film", "query": "Project Hail Mary", "type": "movie",
//                 "year": 2026, "tmdbId": 687163, "season": 1, "episode": 3, "profile": "best" }, ...]
//   profile is optional (default: the account's saved one, like the app). Episodes are asked for one at a time,
//   like the episode row's Download button.
//
// Configuration (env, or KEY=VALUE lines in $PLAYBENCH_ENV, default ~/.config/lilin-playbench/playbench.env):
//   LILIN_URL        e.g. http://192.0.2.10:8080 (the server as a viewer at home reaches it)
//   LILIN_EMAIL      the account to test with (use a dedicated one: downloads land in its library)
//   LILIN_PASSWORD   its Lilin password (sign-in via /api/auth/login; the session is cached next to the env file)
//   PLAYBENCH_SSH    optional: an ssh alias for a Windows Lilin server; then server-sampler.ps1 (copied there, path in
//                    PLAYBENCH_SAMPLER, default C:\Users\Public\playbench-sampler.ps1) runs for the whole benchmark over
//                    ONE ssh session and records read-only background info: the torrent tunnel's status file, Lilin's
//                    TV picks in flight and its log lines ([fake], [swarm], [play now], [smart], other people's downloads)
// playbench never talks to qBittorrent itself: everything about downloads comes through Lilin.
// Never commit the env file.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { execFile, spawn } from 'node:child_process';

const ENV_FILE = process.env.PLAYBENCH_ENV || path.join(os.homedir(), '.config/lilin-playbench/playbench.env');
loadEnv(ENV_FILE);
const SESSION_FILE = path.join(path.dirname(ENV_FILE), 'session.txt');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

// ---------- HTTP with timing ----------
const agents = { 'http:': new http.Agent({ keepAlive: true, maxSockets: 16 }), 'https:': new https.Agent({ keepAlive: true, maxSockets: 16 }) };
function request(url, { method = 'GET', headers = {}, body = null, timeoutMs = 60_000, signal = null, keepBody = true } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const started = performance.now();
    let ttfb = null;
    if (body != null) headers = { ...headers, 'content-length': Buffer.byteLength(body) }; // some servers can't read chunked bodies
    const req = lib.request(u, { method, headers, agent: agents[u.protocol] }, (res) => {
      const chunks = []; let bytes = 0;
      res.on('data', (c) => { if (ttfb == null) ttfb = performance.now() - started; bytes += c.length; if (keepBody) chunks.push(c); });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: keepBody ? Buffer.concat(chunks) : null, bytes, ttfb: ttfb ?? performance.now() - started, ms: performance.now() - started }); });
      res.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const timer = setTimeout(() => req.destroy(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs);
    if (signal) {
      if (signal.aborted) { req.destroy(new Error('aborted')); }
      else signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
    }
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

// ---------- Lilin ----------
class Lilin {
  constructor({ url, email, password }) {
    if (!url) throw new Error('Set LILIN_URL (see the header of playbench.mjs).');
    Object.assign(this, { url: url.replace(/\/+$/, ''), email, password, cookie: null });
    try { this.cookie = fs.readFileSync(SESSION_FILE, 'utf8').trim() || null; } catch { /* sign in on first use */ }
  }
  async signIn() {
    if (!this.email || !this.password) throw new Error('Set LILIN_EMAIL and LILIN_PASSWORD.');
    const r = await request(`${this.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }) });
    if (r.status !== 200) throw new Error(`Lilin sign-in failed (${r.status}): ${r.body.toString().slice(0, 200)}`);
    const c = [].concat(r.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('lilin_session='));
    if (!c) throw new Error('Lilin sign-in gave no session cookie.');
    this.cookie = c;
    fs.writeFileSync(SESSION_FILE, c, { mode: 0o600 });
  }
  // { status, json, ms, ttfb }. Throws on network errors; HTTP errors come back as status (the caller decides).
  async call(p, { method = 'GET', body, timeoutMs = 60_000, signal } = {}, retried = false) {
    if (!this.cookie) await this.signIn();
    const headers = { cookie: this.cookie };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await request(this.url + p, { method, headers, body: body === undefined ? null : JSON.stringify(body), timeoutMs, signal });
    if (r.status === 401 && !retried) { this.cookie = null; return this.call(p, { method, body, timeoutMs, signal }, true); }
    let json = null;
    try { json = JSON.parse(r.body.toString() || 'null'); } catch { /* not JSON */ }
    return { status: r.status, json, ms: r.ms, ttfb: r.ttfb };
  }
  async api(p, opts) {
    const r = await this.call(p, opts);
    if (r.status >= 400) throw Object.assign(new Error(r.json?.error || `HTTP ${r.status} for ${p}`), { status: r.status });
    return r.json;
  }
}

// ---------- output ----------
class Out {
  constructor(file) { this.file = file; fs.mkdirSync(path.dirname(file), { recursive: true }); }
  write(obj) { fs.appendFileSync(this.file, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n'); }
}
const args = process.argv.slice(2);
const flag = (name, def = null) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- the virtual player's rebuffer rule (public/player-partial.js RebufferHold) ----------
class RebufferHold {
  constructor() { Object.assign(this, { goals: [8, 16, 32], floor: 4, maxHoldMs: 30_000, memoryMs: 90_000, step: -1, since: null, lastEnd: -Infinity }); }
  get goal() { return this.goals[Math.max(0, this.step)]; }
  begin(now) { this.step = now - this.lastEnd < this.memoryMs ? Math.min(this.step + 1, this.goals.length - 1) : 0; this.since = now; }
  ready(ahead, left, now) { return ahead >= this.goal || ahead + 0.5 >= left || (now - this.since >= this.maxHoldMs && ahead >= this.floor); }
  end(now) { this.since = null; this.lastEnd = now; }
}

const ffprobe = (file) => new Promise((resolve) => {
  execFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], { timeout: 20_000 }, (err, stdout) => {
    if (err) return resolve({ ok: false, error: String(err.message || err).slice(0, 200) });
    try {
      const j = JSON.parse(stdout);
      const v = (j.streams || []).find((s) => s.codec_type === 'video');
      resolve({ ok: Boolean(v), video: v ? `${v.codec_name} ${v.width}x${v.height}` : null, audio: (j.streams || []).some((s) => s.codec_type === 'audio'), duration: Number(j.format?.duration) || null });
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
});

// ---------- one title, start to finish ----------
const claimedHashes = new Set();
const together = { active: false };
async function runTitle(spec, { lilin, out, capMs, me, stopWhenSmooth = false }) {
  const run = `${spec.label}@${stamp()}`;
  const ctl = new AbortController();
  const { signal } = ctl;
  const t0 = Date.now();
  const T = () => Date.now() - t0;
  const ev = {};
  const mark = (name, data = {}, at = T()) => { if (ev[name] != null) return; ev[name] = at; out.write({ type: 'ev', run, t: ev[name], name, ...data }); log(`${spec.label}: ${name} at ${(ev[name] / 1000).toFixed(1)} s`, Object.keys(data).length ? JSON.stringify(data).slice(0, 160) : ''); };
  const res = { run, label: spec.label, category: spec.category, title: spec.query, mediaType: spec.type, tmdbId: spec.tmdbId, season: spec.season ?? null, episode: spec.episode ?? null,
    profile: spec.profile || 'account', started: new Date(t0).toISOString(), failure: null, notes: [], hashes: [] };
  out.write({ type: 'start', run, spec });
  log(`=== ${spec.label}: ${spec.query}${spec.season ? ` S${spec.season}E${spec.episode}` : ''} (${res.profile})`);

  const known = { hash: null, names: new Set() };

  try {
    // ---- search, as typed (not part of the press timeline) ----
    if (spec.query) {
      const r = await lilin.call(`/api/search?q=${encodeURIComponent(spec.query)}`);
      res.searchMs = Math.round(r.ms);
      const hit = (r.json?.results || []).findIndex((x) => Number(x.id) === Number(spec.tmdbId));
      res.searchRank = hit < 0 ? null : hit + 1;
    }

    // ---- Add: the smart download job, polled like runDownloadCommand ----
    const body = spec.type === 'tv' ? { type: 'tv', tmdbId: spec.tmdbId, season: spec.season, episodes: [spec.episode], profile: spec.profile || me.profile }
      : { type: 'movie', tmdbId: spec.tmdbId, ...(spec.profile ? { profile: spec.profile } : {}) };
    const t0Wall = Date.now();
    const started = await lilin.call('/api/downloads/smart', { method: 'POST', body });
    if (started.status >= 400) throw Object.assign(new Error(started.json?.error || `smart ${started.status}`), { kind: 'add-refused' });
    mark('job_accepted', { ms: Math.round(started.ms) });
    let job = null, lastStep = null;
    for (let i = 0; i < 500 && !signal.aborted; i++) {
      job = await lilin.api(`/api/downloads/smart/${started.json.id}`);
      if (job.step && job.step !== lastStep) { out.write({ type: 'step', run, t: T(), step: job.step }); (res.steps ||= []).push([T(), job.step]); lastStep = job.step; }
      if (job.state !== 'running') break;
      if (T() > capMs) break;
      await sleep(i < 8 ? 800 : 1500, signal);
    }
    mark('job_done', { outcome: job?.outcome, message: job?.message });
    res.job = { outcome: job?.outcome, message: job?.message, added: job?.added, unavailable: job?.unavailable, ms: Date.now() - t0Wall };
    for (const a of job?.added || []) if (a.name) known.names.add(norm(a.name));
    const pick = job?.added?.[0];
    if (pick) Object.assign(res, { release: pick.name, quality: pick.quality, size: pick.size, seeders: pick.seeders, pack: Boolean(pick.pack), source: pick.source || 'torrent' });
    if (!['started', 'partial'].includes(job?.outcome)) throw Object.assign(new Error(job?.message || job?.error || `job ${job?.state}`), { kind: job?.outcome === 'none' ? 'no-source' : job?.outcome === 'have' || job?.outcome === 'queued' ? 'already-here' : 'job-failed' });
    if (pick?.source && pick.source !== 'torrent') res.notes.push(`source ${pick.source}: no Play now`);

    // ---- the download appears; its Play now button shows once the start is verified (polled every 3 s) ----
    let item = null, file = null;
    const findItem = (items) => {
      const fresh = items.filter((d) => d.mine !== false && d.hash && (!d.added || d.added >= t0 - 120_000));
      const byId = fresh.filter((d) => Number(d.tmdbId) === Number(spec.tmdbId));
      const byName = fresh.filter((d) => (job.added || []).some((a) => norm(a.name) && norm(d.name) === norm(a.name)));
      const pool = (byName.length ? byName : byId).toSorted((a, b) => (b.added || 0) - (a.added || 0));
      if (spec.type !== 'tv') return pool[0] || null;
      return pool.find((d) => (d.episodes || []).some((e) => e.season === spec.season && e.episode === spec.episode)) || pool[0] || null;
    };
    const pickFile = (d) => {
      if (!d?.files?.length) return null;
      if (spec.type === 'tv') {
        const e = (d.episodes || []).find((x) => x.season === spec.season && x.episode === spec.episode);
        if (e) return { index: e.fileIndex, started: e.started, available: e.available, size: d.files.find((f) => f.index === e.fileIndex)?.size, name: d.files.find((f) => f.index === e.fileIndex)?.name };
      }
      const [main] = d.files.toSorted((a, b) => b.size - a.size);
      return main;
    };
    while (!signal.aborted && T() < capMs) {
      const r = await lilin.call('/api/downloads');
      res.downloadsPollMs = Math.max(res.downloadsPollMs || 0, Math.round(r.ms));
      item = findItem(r.json?.items || []);
      if (item) {
        if (!ev.listed) mark('listed', { hash: item.hash, name: item.name, state: item.state });
        if (!res.hashes.includes(item.hash)) { claimedHashes.add(item.hash); res.hashes.push(item.hash); out.write({ type: 'track', run, hash: item.hash, name: item.name, tmdbId: spec.tmdbId, via: 'lilin' }); }
        if (known.hash && item.hash !== known.hash) {
          // Lilin dropped the first pick (a fake, say) and started another: follow the new one.
          res.replaced = (res.replaced || 0) + 1;
          out.write({ type: 'ev', run, t: T(), name: `replaced_${res.replaced}`, from: known.hash, to: item.hash, newName: item.name });
          log(`${spec.label}: Lilin replaced the download with ${item.name}`);
          for (const k of ['files_known', 'first_piece_downloading', 'first_bytes']) delete ev[k];
        }
        known.hash = item.hash;
        file = pickFile(item);
        out.write({ type: 'dl', run, t: T(), hash: item.hash.slice(0, 8), state: item.state, progress: item.progress, speed: item.speed, seeds: item.seeds, swarmSeeds: item.swarmSeeds,
          hasVideo: item.hasVideo, started: file?.started ?? null, startState: file?.startState ?? null, ms: Math.round(r.ms) });
        (res.preSpeeds ||= []).push(item.speed || 0);
        if (!ev.first_bytes && item.progress > 0) mark('first_bytes', { progress: item.progress });
        if (!ev.first_piece_downloading && file?.startState === 'downloading') mark('first_piece_downloading');
        if (!res.swarm && item.swarmSeeds != null) res.swarm = { seeds: item.seeds, swarmSeeds: item.swarmSeeds };
        if (item.canPlayNow && file?.started && !item.done) { mark('playnow_visible', { fileIndex: file.index, fileSize: file.size, state: item.state, seeds: item.seeds, swarmSeeds: item.swarmSeeds }); break; }
        if (item.done || item.ready) { mark('ready_in_library'); break; }
        if (file && !ev.files_known) mark('files_known', { fileIndex: file.index, fileSize: file.size, files: item.files.length, skipped: item.skippedFiles });
      }
      await sleep(3000, signal);
    }
    if (!item) throw Object.assign(new Error('the download never showed up'), { kind: 'not-listed' });
    res.file = file ? { name: file.name, size: file.size, index: file.index } : null;
    if (!ev.playnow_visible && !ev.ready_in_library) throw Object.assign(new Error('Play now never showed within the cap'), { kind: 'no-playnow' });
    if (ev.ready_in_library && !ev.playnow_visible) res.notes.push('finished before Play now showed');
    if (!ev.playnow_visible) throw Object.assign(new Error('finished before Play now; full-file play not measured'), { kind: 'done-first' });

    // ---- Play now: /api/part/open every 1.5 s until ready ----
    const key = `${item.hash}-${file.index}`;
    let opened = null;
    while (!signal.aborted && T() < capMs) {
      const r = await lilin.call(`/api/part/open?id=${encodeURIComponent(key)}`, { timeoutMs: 120_000 });
      if (r.status >= 400) {
        out.write({ type: 'open-error', run, t: T(), status: r.status, error: r.json?.error });
        if (!ev.open_error) mark('open_error', { status: r.status, error: r.json?.error });
        await sleep(5000, signal); continue; // a person would press Play now again
      }
      if (!ev.open_first) mark('open_first', { ms: Math.round(r.ms), assisted: r.json?.status?.assisted });
      out.write({ type: 'open', run, t: T(), ready: r.json?.ready, ms: Math.round(r.ms), status: r.json?.status });
      if (r.json?.ready) { opened = r.json; mark('open_ready', { assisted: opened.status?.assisted, sourceHeight: opened.sourceHeight, inOrder: opened.status?.inOrder, speed: opened.status?.speed }); break; }
      await sleep(1500, signal);
    }
    if (!opened) throw Object.assign(new Error('Play now never got ready within the cap'), { kind: 'not-ready' });
    res.sourceHeight = opened.sourceHeight;
    res.assisted = Boolean(opened.status?.assisted);

    // ---- the stream, played by a virtual hls.js ----
    const base = new URL(opened.url, lilin.url);
    const pl = await request(base.href, { timeoutMs: 90_000 });
    mark('playlist', { ms: Math.round(pl.ms), status: pl.status });
    if (pl.status !== 200) throw Object.assign(new Error(`playlist ${pl.status}`), { kind: 'playlist' });
    const segs = [];
    { let dur = null; for (const line of pl.body.toString().split('\n')) { const m = /^#EXTINF:([\d.]+)/.exec(line); if (m) dur = Number(m[1]); else if (line && !line.startsWith('#')) { segs.push({ uri: new URL(line.trim(), base).href, dur: dur ?? 4 }); dur = null; } } }
    res.duration = Math.round(segs.reduce((n, s) => n + s.dur, 0));
    res.bitrateMbit = file.size && res.duration ? Math.round(file.size * 8 / res.duration / 1e5) / 10 : null;
    const player = { pos: 0, bufEnd: 0, next: 0, playing: false, holdOn: false, stalls: [], fetchMs: [], ttfbMs: [] };
    const hold = new RebufferHold();
    const total = segs.reduce((n, s) => n + s.dur, 0);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playbench-'));
    const fetcher = (async () => {
      while (!signal.aborted && player.next < segs.length) {
        if (player.bufEnd - player.pos >= 30) { await sleep(250, signal); continue; }
        const n = player.next, tReq = T();
        let r;
        try { r = await request(segs[n].uri, { timeoutMs: 30 * 60_000, signal, keepBody: n === 0 }); }
        catch (e) { if (signal.aborted) break; out.write({ type: 'seg-error', run, n, t: T(), error: e.message }); await sleep(2000, signal); continue; }
        out.write({ type: 'seg', run, n, tReq, ttfb: Math.round(r.ttfb), ms: Math.round(r.ms), bytes: r.bytes, status: r.status });
        if (r.status !== 200) { await sleep(2000, signal); continue; }
        player.fetchMs.push(r.ms); player.ttfbMs.push(r.ttfb);
        if (n === 0) {
          mark('seg0_first_byte', { ttfb: Math.round(r.ttfb) }, tReq + Math.round(r.ttfb));
          const f = path.join(tmp, 's0.ts'); fs.writeFileSync(f, r.body);
          const probe = await ffprobe(f);
          res.seg0 = { bytes: r.bytes, ...probe };
          if (!probe.ok) { res.notes.push(`first piece not playable: ${probe.error}`); }
          mark('first_frame', { bytes: r.bytes, probe: probe.video, ok: probe.ok });
          player.playing = probe.ok; player.lastTick = Date.now();
        }
        player.bufEnd += segs[n].dur; player.next = n + 1;
      }
    })();
    // the clock: plays, stalls, holds
    const clock = (async () => {
      let last = Date.now();
      while (!signal.aborted) {
        await sleep(200, signal);
        const now = Date.now(), dt = (now - last) / 1000; last = now;
        if (ev.first_frame == null) continue;
        const left = total - player.pos;
        if (player.playing) {
          player.pos = Math.min(player.pos + dt, player.bufEnd);
          if (player.pos >= total - 0.05) { player.playing = false; mark('played_to_end'); break; }
          if (player.bufEnd - player.pos <= 0.05 && player.next < segs.length) {
            player.playing = false; hold.begin(now);
            player.stalls.push({ at: T(), pos: Math.round(player.pos), ms: null });
            out.write({ type: 'stall', run, t: T(), pos: player.pos });
          }
        } else if (player.stalls.length && player.stalls.at(-1).ms == null) {
          if (hold.ready(player.bufEnd - player.pos, left, now)) {
            const s = player.stalls.at(-1); s.ms = T() - s.at; hold.end(now); player.playing = true;
            out.write({ type: 'resume', run, t: T(), pos: player.pos, stalledMs: s.ms });
          }
        }
      }
    })();
    // status every 3 s, like the player; ends the run
    let keepUps = 0;
    while (!signal.aborted && T() < capMs) {
      const r = await lilin.call(`/api/part/status?id=${encodeURIComponent(key)}`).catch((e) => ({ status: 0, json: { error: e.message } }));
      const s = r.json || {};
      const lead = s.duration ? (s.inOrder || 0) * s.duration - player.pos : null;
      out.write({ type: 'status', run, t: T(), http: r.status, pos: Math.round(player.pos), buf: Math.round(player.bufEnd - player.pos), lead: lead == null ? null : Math.round(lead),
        progress: s.progress, inOrder: s.inOrder, speed: s.speed, keepsUp: s.keepsUp, seeds: s.seeds, assisted: s.assisted, state: s.state, done: s.done });
      if (r.status === 200) {
        if (s.done) mark('download_done');
        if (ev.first_frame != null && (s.done || (lead != null && lead >= 120))) mark('smooth_lead', { lead: Math.round(lead ?? 0), pos: Math.round(player.pos) });
        keepUps = s.keepsUp ? keepUps + 1 : 0;
        if (ev.first_frame != null && (keepUps >= 3 || s.done)) mark('smooth_rate', { speed: s.speed });
        (res.speeds ||= []).push(s.speed || 0);
      }
      const watched = ev.first_frame != null ? T() - ev.first_frame : 0;
      if (ev.played_to_end) break;
      if (stopWhenSmooth && (ev.smooth_lead != null || ev.smooth_rate != null) && T() - ev.first_frame >= 30_000) break;
      if (ev.download_done && watched >= 120_000) break;
      if (ev.first_frame == null && T() > capMs) break;
      await sleep(3000, signal);
    }
    ctl.abort();
    await Promise.allSettled([fetcher, clock]);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (player.stalls.length && player.stalls.at(-1).ms == null) player.stalls.at(-1).ms = T() - player.stalls.at(-1).at; // still stalled at the end
    res.stalls = player.stalls;
    res.stallMs = player.stalls.reduce((n, s) => n + (s.ms || 0), 0);
    res.watchedS = ev.first_frame != null ? Math.round((T() - ev.first_frame) / 1000) : 0;
    res.posS = Math.round(player.pos);
    res.segments = player.next;
    const sorted = (a) => a.toSorted((x, y) => x - y);
    if (player.fetchMs.length) { const f = sorted(player.fetchMs); res.segMs = { p50: Math.round(f[Math.floor(f.length / 2)]), p90: Math.round(f[Math.floor(f.length * 0.9)]), max: Math.round(f.at(-1)) }; }
    // smooth from here on: the stall-free point (after the last stall ended)
    const lastStall = player.stalls.at(-1);
    res.smoothAfterLastStall = lastStall ? lastStall.at + (lastStall.ms || 0) : ev.first_frame;
  } catch (e) {
    res.failure = { kind: e.kind || 'error', message: e.message };
    log(`${spec.label}: FAILED ${res.failure.kind}: ${e.message}`);
  } finally {
    ctl.abort();
  }
  res.ev = ev;
  res.endedMs = T();
  out.write({ ...res, type: 'result' });
  log(`${spec.label}: done in ${(T() / 1000).toFixed(0)} s; first frame ${ev.first_frame != null ? (ev.first_frame / 1000).toFixed(1) + ' s' : '-'}, stalls ${res.stalls?.length ?? '-'}`);
  return res;
}

// ---------- cleanup: remove what the runs started, through Lilin ----------
async function cleanup(files, { lilin, dryRun, finishedOnly = false }) {
  const tracked = new Map(), ended = new Set();
  for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.type === 'track') tracked.set(o.hash, o);
    if (o.type === 'result') ended.add(o.run);
  }
  // --finished-only: never touch the run that is still going
  if (finishedOnly) for (const [hash, t] of tracked) if (!ended.has(t.run)) tracked.delete(hash);
  const downloads = (await lilin.api('/api/downloads')).items || [];
  const lib = await lilin.api('/api/library');
  const report = [];
  for (const [hash, t] of tracked) {
    const d = downloads.find((x) => x.hash === hash);
    if (d && finishedOnly) { report.push({ hash, name: t.name, action: 'still downloading: left alone (--finished-only)' }); continue; }
    if (d) {
      if (d.others) { report.push({ hash, name: t.name, action: 'leave (someone else wants it: Lilin keeps it for them)' }); }
      else report.push({ hash, name: t.name, action: 'leave (cancel + delete files)' });
      if (!dryRun) { const r = await lilin.call(`/api/downloads/${hash}/leave`, { method: 'POST', body: {} }); report.at(-1).result = r.json || r.status; }
      continue;
    }
    // Finished and claimed: it's a library item now.
    const items = (lib.items || []).filter((i) => (Number(i.tmdbId) === Number(t.tmdbId)) || norm(i.file).startsWith(norm(t.name).slice(0, 20)));
    if (!items.length) { report.push({ hash, name: t.name, action: 'nothing left (gone already)' }); continue; }
    for (const i of items) {
      const info = await lilin.api(`/api/library/delete-info?id=${encodeURIComponent(i.id)}`).catch((e) => ({ error: e.message }));
      report.push({ hash, name: i.file, action: info.others ? 'remove from my library (others hold it: file kept)' : 'delete (whole download)', info: { others: info.others } });
      if (!dryRun) { const r = await lilin.call('/api/library/delete', { method: 'POST', body: { id: i.id, scope: 'torrent' } }); report.at(-1).result = r.json || r.status; }
    }
  }
  return report;
}

// ---------- summary ----------
function pct(a, p) { if (!a.length) return null; const s = a.toSorted((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
const sec = (ms) => (ms == null ? '–' : (ms / 1000).toFixed(ms < 10_000 ? 1 : 0));
const mbs = (b) => (b == null ? '–' : (b / 1e6).toFixed(1));
const avgOf = (a) => (a.length ? a.reduce((n, v) => n + v, 0) / a.length : null);
const nameOf = (r) => `${r.title}${r.season ? ` S${r.season}E${r.episode}` : ''}${r.profile !== 'account' ? ` (${r.profile})` : ''}`;

function load(files) {
  const results = [], raw = new Map(), server = [];
  for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.type === 'result' || (o.endedMs != null && o.ev)) results.push(o); // (early files: type held the media type)
    else if (o.type === 'server') server.push(o);
    else if (o.run) {
      const r = raw.get(o.run) || { status: [], open: [], dl: [] };
      raw.set(o.run, r);
      if (o.type === 'status') r.status.push(o); else if (o.type === 'open') r.open.push(o); else if (o.type === 'dl') r.dl.push(o);
    }
  }
  // What the server was doing during each run (server-sampler.ps1 lines in its time window).
  for (const r of results) {
    const from = Date.parse(r.started), to = from + (r.endedMs || 0);
    const during = server.filter((s) => { const t = Date.parse(s.t); return t >= from && t <= to + 15_000; });
    const minutes = [...new Map(during.filter((s) => s.vpn).map((s) => [s.vpn.at, s.vpn])).values()];
    const logs = during.flatMap((s) => s.log || []);
    r.server = {
      lineDl: avgOf(minutes.map((v) => v.dl || 0)), lineDlMax: minutes.length ? Math.max(...minutes.map((v) => v.dl || 0)) : null, vpnServer: minutes[0]?.server || null,
      picks: during.length ? Math.max(...during.map((s) => (s.picks || []).filter((p) => /^downloading/.test(p)).length)) : null,
      othersStarted: logs.filter((l) => /^\[activity\] <someone>.*: download /.test(l)).length,
      fake: logs.filter((l) => /^\[fake\]/.test(l)), swarm: logs.filter((l) => /^\[swarm\]/.test(l)),
      playNow: logs.filter((l) => /^\[play now\]/.test(l) && /waited for the download/.test(l)),
    };
  }
  return { results, raw, server };
}

function summarize(files) {
  const { results, raw } = load(files);
  const rows = ['| Title | Category | Release (size, seeders) | Source picked | Play now shown | Stream ready | **First frame** | Smooth (lead ≥ 2 min / speed ≥ bitrate) | Stalls (n, total s) | Full download | Bitrate (Mbit/s) | Our speed (MB/s) | Line total (MB/s), TV picks |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const e = r.ev || {}, x = raw.get(r.run) || { status: [], dl: [] };
    const rel = r.release ? `${r.release.slice(0, 50)} (${r.size ? (r.size / 1e9).toFixed(1) + ' GB' : '?'}, ${r.seeders ?? '?'})` : '–';
    const speeds = [...x.dl.map((d) => d.speed || 0), ...x.status.filter((s) => s.http === 200).map((s) => s.speed || 0)];
    rows.push(`| ${nameOf(r)}${r.failure ? ` **(${r.failure.kind})**` : ''}${r.replaced ? ` (${r.replaced} fake${r.replaced > 1 ? 's' : ''} replaced)` : ''} | ${r.category} | ${rel} | ${sec(e.job_done)} | ${sec(e.playnow_visible)} | ${sec(e.open_ready)} | **${sec(e.first_frame)}** | ${r.failure ? '–' : `${sec(e.smooth_lead)} / ${sec(e.smooth_rate)}`} | ${r.stalls ? `${r.stalls.length}, ${sec(r.stallMs)}` : '–'} | ${sec(e.download_done)} | ${r.bitrateMbit ?? '–'} | ${mbs(avgOf(speeds))} | ${mbs(r.server?.lineDl)}, ${r.server?.picks ?? '–'} |`);
  }
  const ok = results.filter((r) => !r.failure && r.ev?.first_frame != null);
  const smoothOf = (r) => { const a = r.ev.smooth_lead, b = r.ev.smooth_rate; return a == null ? b ?? null : b == null ? a : Math.min(a, b); };
  const stat = (list, pick) => { const v = list.map(pick).filter((n) => n != null); return v.length ? `${sec(pct(v, 0.5))} / ${sec(pct(v, 0.9))} s (n=${v.length})` : '–'; };
  const cats = {};
  for (const r of results) (cats[r.category] ||= []).push(r);
  const table = ['| Category | Runs | With first frame | First frame median / p90 | Smooth median / p90 (never smooth) | Stalls median |', '|---|---|---|---|---|---|'];
  const catRow = (c, list) => { const good = list.filter((r) => ok.includes(r)); const never = good.filter((r) => smoothOf(r) == null).length;
    return `| ${c} | ${list.length} | ${good.length} | ${stat(good, (r) => r.ev.first_frame)} | ${stat(good, smoothOf)} (${never}) | ${good.length ? pct(good.map((r) => r.stalls?.length || 0), 0.5) : '–'} |`; };
  for (const [c, list] of Object.entries(cats)) table.push(catRow(c, list));
  table.push(catRow('**all**', results));
  const lines = [table.join('\n'), '', rows.join('\n')];
  const failed = results.filter((r) => r.failure || r.ev?.first_frame == null);
  if (failed.length) { lines.push('', 'Failures:'); for (const r of failed) lines.push(`- ${nameOf(r)}: ${r.failure?.kind || 'no first frame'}: ${r.failure?.message || ''}`); }
  lines.push('', breakdown(results, raw));
  return lines.join('\n');
}

// Where the time went, per run: the press-to-first-frame phases and the watching phase.
function breakdown(results, raw) {
  const rows = ['| Title | A: press → source picked | B: picked → Play now shown | C: Play now → stream ready | D: ready → first frame | In order / downloaded at ready | Speed before Play now / after (MB/s) | Needed (MB/s) | Watched, stalled | Server log during run |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  const phases = { A: [], B: [], C: [], D: [] };
  for (const r of results) {
    const e = r.ev || {}, x = raw.get(r.run) || { status: [], open: [], dl: [] };
    const A = e.job_done, B = e.playnow_visible != null ? e.playnow_visible - (e.job_done ?? 0) : null;
    const C = e.open_ready != null ? e.open_ready - e.playnow_visible : null, D = e.first_frame != null ? e.first_frame - e.open_ready : null;
    if (e.first_frame != null) { phases.A.push(A); phases.B.push(B); phases.C.push(C); phases.D.push(D); }
    const ready = x.open.find((o) => o.ready) || x.open.at(-1);
    const order = ready?.status ? `${(ready.status.inOrder * 100).toFixed(1)} % / ${(ready.status.progress * 100).toFixed(1)} %` : '–';
    const before = avgOf(x.dl.map((d) => d.speed || 0)), after = avgOf(x.status.filter((s) => s.http === 200).map((s) => s.speed || 0));
    const need = r.bitrateMbit ? r.bitrateMbit / 8 * 1e6 : null;
    const notes = [r.server?.fake?.length ? `${r.server.fake.length} fake` : '', r.server?.swarm?.length ? 'slow-swarm check' : '', r.server?.othersStarted ? `${r.server.othersStarted} other download(s) started` : ''].filter(Boolean).join(', ');
    rows.push(`| ${nameOf(r)} | ${sec(A)} | ${sec(B)} | ${sec(C)} | ${sec(D)} | ${order} | ${mbs(before)} / ${mbs(after)} | ${mbs(need)} | ${r.watchedS ?? '–'} s, ${r.stalls ? `${r.stalls.length}× ${sec(r.stallMs)} s` : '–'} | ${notes || '–'} |`);
  }
  const med = (k) => { const v = phases[k].filter((n) => n != null); return v.length ? `median ${sec(pct(v, 0.5))} s, p90 ${sec(pct(v, 0.9))} s` : '–'; };
  return ['Where the time to first frame went (runs with a first frame):',
    `- A press → source picked (TMDB + torrent search + add): ${med('A')}`, `- B source picked → Play now shown (metadata + first piece verified, app polls every 3 s): ${med('B')}`,
    `- C Play now → stream ready (probe + start lead): ${med('C')}`, `- D stream ready → first frame (playlist + first piece transcoded): ${med('D')}`, '', rows.join('\n')].join('\n');
}

// ---------- commands ----------
async function main() {
  const [cmd, file] = args;
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return; }
  if (cmd === 'summary') {
    const files = args.slice(1).filter((a) => !a.startsWith('--') && a !== flag('md'));
    const md = summarize(files);
    if (flag('md')) fs.writeFileSync(flag('md'), md + '\n'); else console.log(md);
    return;
  }
  const lilin = new Lilin({ url: process.env.LILIN_URL, email: process.env.LILIN_EMAIL, password: process.env.LILIN_PASSWORD });
  if (cmd === 'cleanup') {
    const files = args.slice(1).filter((a) => !a.startsWith('--'));
    const report = await cleanup(files, { lilin, dryRun: Boolean(flag('dry-run')), finishedOnly: Boolean(flag('finished-only')) });
    for (const r of report) console.log(JSON.stringify(r));
    return;
  }
  const titles = JSON.parse(fs.readFileSync(file, 'utf8'));
  const only = flag('only') ? String(flag('only')).split(',') : null;
  const specs = only ? only.map((l) => titles.find((t) => t.label === l) || (() => { throw new Error(`no title labelled ${l}`); })()) : titles;
  const me = (await lilin.api('/api/me')).me;
  const savedProfile = ['save', 'balanced', 'best'].includes(me.settings?.downloadProfile) ? me.settings.downloadProfile
    : ['2160p', '1440p'].includes(me.settings?.quality) ? 'best' : me.settings?.quality === '720p' ? 'save' : 'balanced';
  if (cmd === 'resolve') {
    const lib = await lilin.api('/api/library');
    const server = lib.server || [];
    for (const s of specs) {
      const r = await lilin.call(`/api/search?q=${encodeURIComponent(s.query)}`);
      const hits = (r.json?.results || []).filter((x) => (x.type || x.media_type) === s.type).slice(0, 4).map((x) => `${x.id} ${x.title || x.name} (${String(x.date || x.release_date || x.first_air_date || '').slice(0, 4)})`);
      const here = server.filter((f) => Number(f.tmdbId) === Number(s.tmdbId) || (s.type === 'tv' && f.show === `tv-${s.tmdbId}`));
      const epHere = s.type === 'tv' ? here.some((f) => f.season === s.season && f.episode === s.episode) : here.length > 0;
      console.log(`${s.label.padEnd(10)} ${String(Math.round(r.ms)).padStart(5)} ms  want ${s.tmdbId}  ${epHere ? 'ON SERVER' : here.length ? `show here (${here.length} eps), episode not` : 'not here'}  | ${hits.join(' | ')}`);
    }
    return;
  }
  const out = new Out(flag('out') || path.join(path.dirname(new URL(import.meta.url).pathname), 'results', `run-${stamp()}.jsonl`));
  const capMs = Number(flag('cap-min', 10)) * 60_000;
  const ctx = { lilin, out, capMs, me: { id: me.id, profile: savedProfile }, stopWhenSmooth: Boolean(flag('stop-when-smooth')) };
  const sampler = startSampler(out);
  out.write({ type: 'session', cmd, me: { id: me.id, name: me.name, profile: savedProfile }, capMs, lilin: lilin.url });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { sampler?.kill(); process.exit(130); });
  if (cmd === 'together') {
    together.active = true;
    const results = await Promise.all(specs.map((s) => runTitle(s, ctx)));
    if (!flag('keep')) for (const r of results) await cleanupRun(r, lilin, out);
  } else if (cmd === 'run') {
    for (const s of specs) {
      const r = await runTitle(s, ctx);
      if (!flag('keep')) await cleanupRun(r, lilin, out);
      if (flag('pause-s')) await sleep(Number(flag('pause-s')) * 1000);
    }
  } else throw new Error(`unknown command ${cmd}`);
  sampler?.kill();
  log(`results in ${out.file}`);
}

// Read-only background info from the server, over one ssh session for the whole benchmark (server-sampler.ps1).
function startSampler(out) {
  const host = process.env.PLAYBENCH_SSH;
  if (!host) return null;
  const remote = process.env.PLAYBENCH_SAMPLER || 'C:\\Users\\Public\\playbench-sampler.ps1';
  const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', host, `powershell -NoProfile -ExecutionPolicy Bypass -File ${remote}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  child.stdout.on('data', (c) => {
    buf += c.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try { out.write({ ...JSON.parse(line), type: 'server' }); } catch { /* partial line */ }
    }
  });
  child.on('exit', (code) => log(`server sampler ended (${code})`));
  process.on('exit', () => child.kill());
  return child;
}

// Right after a run: cancel its download through Lilin (/leave), unless someone else also wants it.
async function cleanupRun(r, lilin, out) {
  for (const hash of r.hashes || []) {
    const d = ((await lilin.api('/api/downloads').catch(() => ({ items: [] }))).items || []).find((x) => x.hash === hash);
    if (!d) { out.write({ type: 'cleanup', run: r.run, hash, action: 'not in downloads (finished or gone): run cleanup later' }); continue; }
    const res = await lilin.call(`/api/downloads/${hash}/leave`, { method: 'POST', body: {} });
    out.write({ type: 'cleanup', run: r.run, hash, action: 'leave', others: d.others, status: res.status, result: res.json });
    log(`${r.label}: removed download ${hash.slice(0, 8)} (${res.status}${d.others ? ', kept for others' : ''})`);
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
