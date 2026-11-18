// Play now: watch a video while qBittorrent is still downloading it.
//
// qBittorrent downloads the video in order, with its first and last pieces early (many files keep their
// index at the end). A file being downloaded has holes that read as zeros, so nothing may read it directly:
// ffmpeg reads it over HTTP from a small server on the loopback interface instead, which holds every read
// until qBittorrent reports those pieces as finished and verified. Reads waiting for the download look like
// a slow disk to ffmpeg, so the rest of the pipeline is the ordinary live stream (phone-stream.js).
//
// qBittorrent has no way to prioritise a piece in the middle of a file, so a seek past the downloaded part
// waits until the download gets there. The original file is never changed.
//
// Even in order, the edge of what's readable moves in jumps: one slow peer can hold a piece back for half a
// minute while later pieces arrive. So playback starts with a lead that can ride that out when it comes cheaply.
//
// With playhead (src/playhead.js) next to qBittorrent, both of those go away: playhead fetches whatever the
// player needs next that qBittorrent doesn't have yet (a seek target, a piece stuck on a slow peer), and the
// loopback server reads through it. qBittorrent keeps downloading in order as before. If playhead fails, the
// read carries on from qBittorrent alone at the same spot, so ffmpeg never notices.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { probeInput } from './phone-stream.js';
import { mergeStates } from './playhead.js';

const HAVE = 2;                  // qBittorrent's piece state for "downloaded and verified"
const READ_BYTES = 4 * 1024 * 1024;
const POLL_MS = 1000;
const IDLE_MS = 3 * 60_000;      // nobody watching for this long: the download goes back to normal
const START_SECONDS = 20;        // never start with less than this in order
const START_GOAL_SECONDS = 45;   // start with this much when the download brings it soon
const START_GRACE_MS = 20_000;   // how long to wait for the goal after having the minimum
const EARLIER_LEFT_BYTES = 256 * 1024 * 1024; // extras before the video in a pack: not worth reordering for
const MIN_START_BYTES = 8 * 1024 * 1024;
const PROBE_MS = 10 * 60_000;    // reading the start and end of the file can wait for the download
const MAX_PROBE_FAILURES = 2;
const SHORT_READ_MS = 30_000;    // a verified piece that isn't readable yet (still being written)
// With playhead helping, the long lead isn't needed to ride out a stuck piece (playhead fetches it from a
// faster peer), so playback starts sooner. The start itself is fetched by both: qBittorrent from the front,
// playhead from the far end of START_LEAD_BYTES backwards.
const ASSIST_LEAD = { min: 8, goal: 20, graceMs: 8_000 };
const START_LEAD_BYTES = 64 * 1024 * 1024;
const ASSIST_WAIT_MS = 5_000;    // how long the first open waits for playhead, so the probe reads through it
// playhead not answering (3 calls in a row): reads go to qBittorrent's file meanwhile, and playhead keeps its stream (and
// its peers) for when it answers again. Only after this long is it closed and started afresh a minute later.
const ASSIST_QUIET_MAX_MS = 90_000;
// A read through playhead that has brought nothing for this long while qBittorrent has those bytes: that part comes
// from qBittorrent's file instead (up to RESCUE_BYTES), then reads go through playhead again.
const RESCUE_MS = 4_000;
const RESCUE_BYTES = 32 * 1024 * 1024;
// Matroska keeps optional parts (tags, cues) at the end, and ffmpeg reads them before the first picture when it can
// seek. Read straight from the start instead, nothing there is needed to play from the beginning, so the start doesn't
// wait for the file's last piece (tested 2026-11-17: same streams, duration and bitrate; MP4 is left alone, its index
// can be at the end).
const LINEAR_START = /\.(mkv|webm)$/i;
// A download bringing the picture this many times faster than it plays: the minimum lead is enough, it only grows.
const FAST_MARGIN = 2;
// A first-time watch (prewarm): Play now's download mode from the moment the file list is known, kept this long
// unless someone starts watching (then the usual idle rule applies).
export const PREWARM_MS = 10 * 60_000;

export const partialId = (hash, index) => `${String(hash).toLowerCase()}-${index}`;
export function parsePartialId(id) {
  const m = /^([a-f0-9]{40}|[a-f0-9]{64})-(\d{1,5})$/i.exec(String(id || ''));
  return m ? { hash: m[1].toLowerCase(), index: Number(m[2]) } : null;
}

// Where a file sits in the torrent's pieces. qBittorrent hides padding files, so the sum of the earlier
// sizes can fall short of the real start. Its piece_range is exact, so the sum is corrected to fit it.
export function fileLayout(files, index, pieceSize) {
  const list = files.map((f, i) => ({ ...f, index: f.index ?? i })).sort((a, b) => a.index - b.index);
  let offset = 0;
  for (const f of list) {
    if (f.index === index) {
      const [first, last] = Array.isArray(f.piece_range) ? f.piece_range : [Math.floor(offset / pieceSize), Math.floor((offset + Math.max(0, f.size - 1)) / pieceSize)];
      const low = first * pieceSize, high = low + pieceSize - 1;
      return { offset: Math.min(high, Math.max(low, offset)), size: f.size, first, last };
    }
    offset += f.size;
  }
  return null;
}

// How many bytes can be read in a row from `from` in this file.
export function readableBytes(layout, pieceSize, states, from = 0) {
  if (!layout || !states || from >= layout.size) return 0;
  let piece = Math.floor((layout.offset + from) / pieceSize);
  const start = piece;
  while (piece <= layout.last && states[piece] === HAVE) piece++;
  if (piece === start) return 0;
  return Math.max(0, Math.min(layout.size, piece * pieceSize - layout.offset) - from);
}

// Share of the file's pieces that are finished, in any order.
export function fileProgress(layout, states) {
  if (!layout || !states) return 0;
  let have = 0;
  for (let i = layout.first; i <= layout.last; i++) if (states[i] === HAVE) have++;
  return have / Math.max(1, layout.last - layout.first + 1);
}

// Enough in order to start: the first seconds at this video's bitrate, or all of a small file.
export const startBytes = (size, bitrate, seconds = START_SECONDS) => Math.min(size, Math.max(MIN_START_BYTES, Math.ceil(((bitrate || 0) / 8) * seconds)));

// Start with the full lead, or with the minimum once it has had a while to grow, or right away with the minimum when
// the download brings the picture well ahead of playback (`speed` in bytes/s). `enoughSince` = when the minimum was there.
export function readyToStart(readable, size, bitrate, enoughSince, now = Date.now(), lead = null, speed = 0) {
  if (readable >= startBytes(size, bitrate, lead?.goal ?? START_GOAL_SECONDS)) return true;
  if (enoughSince != null && bitrate > 0 && speed * 8 >= bitrate * FAST_MARGIN) return true;
  return enoughSince != null && now - enoughSince >= (lead?.graceMs ?? START_GRACE_MS);
}

// Watch Together on a video that is still downloading: one stop holds everyone, so the room waits for a lead
// instead of playing each piece as it arrives. All in seconds of video: `edge` = how far it's downloaded in order,
// `rate` = seconds of video the download brings per second (download speed / bitrate), `holding` = the room is
// waiting now. A download that keeps up needs ROOM_LEAD ahead. One that doesn't waits until the rest will
// arrive before playback gets there, or until ROOM_LEAD_ENOUGH is there (stops are then minutes apart).
// Returns { holding, wait }: wait = seconds until it can play (null when nobody can tell, e.g. no speed).
export const ROOM_LEAD = 30, ROOM_STOP = 8, ROOM_LEAD_ENOUGH = 300;
const RATE_MARGIN = 0.85; // download speeds wander: plan with a bit less than the current one
export function roomGate({ done, duration, position, edge, rate, holding }) {
  if (done || !(duration > 0)) return { holding: false, wait: 0 };
  const at = Math.max(0, Math.min(position || 0, duration));
  const reach = Math.max(0, Math.min(edge || 0, duration));
  const ahead = reach - at;
  if (reach >= duration - 1) return { holding: false, wait: 0 };   // the rest is all there
  if (!holding && ahead >= ROOM_STOP) return { holding: false, wait: 0 };
  const r = Math.max(0, rate || 0) * RATE_MARGIN;
  const lead = Math.min(ROOM_LEAD, duration - at);
  const keepsUp = r >= 1;
  const finishes = r > 0 && (duration - reach) / r <= duration - at;
  if (ahead >= lead && (keepsUp || finishes || ahead >= ROOM_LEAD_ENOUGH)) return { holding: false, wait: 0 };
  if (!(r > 0)) return { holding: true, wait: null };
  // The sooner of: the lead plus a download that will finish in time, or the long lead.
  const toLead = Math.max(0, (at + lead - reach) / r);
  const toFinish = keepsUp ? 0 : Math.max(0, (duration - reach) / r - (duration - at));
  const toEnough = Math.max(0, (at + Math.min(ROOM_LEAD_ENOUGH, duration - at) - reach) / r);
  const wait = Math.min(Math.max(toLead, toFinish), toEnough);
  return { holding: true, wait: wait <= 6 * 3600 ? wait : null }; // a crawl: no estimate worth showing
}

// What a pack's file priorities should be for watching file `index`. In sequential mode libtorrent takes
// top-priority pieces first but in rarest-first order, so priority 7 scatters the very file being watched: leave it
// off whenever the file can simply be next in line. Sequential goes by position and ignores normal priorities,
// so if a lot of earlier files are still missing, it would fetch those first: only then is 7 the better of the two.
// Returns [[file, priority], ...] for the files to change.
export function packPriorities(files, index) {
  const list = files.map((f, i) => ({ ...f, index: f.index ?? i }));
  const target = list.find((f) => f.index === index);
  if (!target) return [];
  const missing = (f) => (f.size || 0) * (1 - (f.progress || 0));
  const earlier = list.filter((f) => f.index < index && f.priority > 0).reduce((sum, f) => sum + missing(f), 0);
  if (earlier > EARLIER_LEFT_BYTES) return target.priority === 7 ? [] : [[index, 7]];
  const changes = list.filter((f) => f.priority === 7 && (f.index === index || (f.progress || 0) < 1)).map((f) => [f.index, 1]);
  return changes;
}

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve();
  const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', done, { once: true });
});
const failure = (status, message) => Object.assign(new Error(message), { status });

// Wait for room, or for the reader to go. A response that already closed never emits again: waiting on
// it would park the read for ever and its file handle would only be closed by the garbage collector
// ("Closing file descriptor ... on garbage collection").
const waitDrain = (res, signal) => new Promise((resolve) => {
  const go = () => { res.off('close', go); res.off('drain', go); signal.removeEventListener('abort', go); resolve(); };
  res.once('drain', go); res.once('close', go); signal.addEventListener('abort', go, { once: true });
  if (res.destroyed || signal.aborted) go();
});

export class PartialStreams {
  // qbit(path) = parsed JSON; post(path, fields) = a command; filePath(torrent, file) = where it is on disk;
  // isVideo(name); start(hash) = start a stopped torrent; probe = probeInput (tests replace it).
  // assist = a PlayheadService (or null); exportTorrent(hash) = the .torrent (Buffer) from qBittorrent;
  // peersOf(hash) / trackersOf(hash) = what qBittorrent knows, to get playhead going quickly.
  constructor({ qbit, post, filePath, finalPath = filePath, isVideo, start, probe = probeInput, log = console,
    assist = null, exportTorrent = null, peersOf = null, trackersOf = null }) {
    Object.assign(this, { qbit, post, filePath, finalPath, isVideo, start, probe, log, assist, exportTorrent, peersOf, trackersOf });
    this.entries = new Map();
    this.torrents = new Map(); // hash -> what Lilin changed, restored when the last viewer leaves
    this.token = crypto.randomBytes(24).toString('hex');
    this.server = null;
    this.port = null;
    this.timer = setInterval(() => this.sweep().catch((e) => this.log.warn?.(`[play now] ${e.message}`)), 30_000);
    this.timer.unref?.();
  }

  async listen() {
    if (this.port) return this.port;
    this.listening ||= new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.serve(req, res).catch(() => res.destroy()));
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { this.server = server; this.port = server.address().port; server.unref(); resolve(this.port); });
    });
    return this.listening;
  }

  async torrent(hash) {
    const list = await this.qbit(`/api/v2/torrents/info?hashes=${hash}`);
    return Array.isArray(list) ? list[0] || null : null;
  }

  async entry(id) {
    const known = this.entries.get(id);
    if (known) return known;
    const parsed = parsePartialId(id);
    if (!parsed) throw failure(400, 'Invalid video.');
    const t = await this.torrent(parsed.hash);
    if (!t) throw failure(404, 'That download no longer exists.');
    const files = await this.qbit(`/api/v2/torrents/files?hash=${parsed.hash}`);
    const file = Array.isArray(files) ? files.find((f, i) => (f.index ?? i) === parsed.index) : null;
    if (!file || file.priority === 0 || !this.isVideo(file.name)) throw failure(404, 'This download has no playable video file.');
    const props = await this.qbit(`/api/v2/torrents/properties?hash=${parsed.hash}`);
    const pieceSize = Number(props?.piece_size);
    if (!(pieceSize > 0)) throw failure(409, 'This download is still starting. Try again in a moment.');
    const layout = fileLayout(files, parsed.index, pieceSize);
    if (!layout || !(layout.size > 0)) throw failure(404, 'This download has no playable video file.');
    const raced = this.entries.get(id);
    if (raced) return raced;
    const entry = { id, hash: parsed.hash, index: parsed.index, file: this.filePath(t, file), finalFile: this.finalPath(t, file), name: file.name, priority: file.priority, multiFile: files.length > 1,
      size: layout.size, layout, pieceSize, states: null, statesAt: 0, torrent: t, last: Date.now(), info: null, probing: null, probeFailures: 0, probeError: null,
      gone: false, boosted: false, started: false, enoughSince: null, holds: 0, heldMs: 0, restorePriorities: [],
      assist: null, assistTriedAt: 0, assistFailures: 0, merged: null, assisting: null };
    this.entries.set(id, entry);
    return entry;
  }

  // Asks for fresh piece states at most once a second, however many readers are waiting.
  refresh(e, { force = false } = {}) {
    if (e.refreshing) return e.refreshing;
    if (!force && Date.now() - e.statesAt < POLL_MS) return Promise.resolve();
    e.refreshing = (async () => {
      try {
        // (A removed torrent answers 404 for its pieces: that's "gone", not an error to repeat every second.)
        const [t, states] = await Promise.all([this.torrent(e.hash), this.qbit(`/api/v2/torrents/pieceStates?hash=${e.hash}`).catch((error) => error)]);
        if (!t) { e.gone = true; return; }
        if (states instanceof Error) throw states;
        e.torrent = t;
        // Finished downloads move from the scratch drive to their save path (scratch.js).
        try { e.file = this.filePath(t, { name: e.name }) || e.file; } catch { /* keep the last known path */ }
        if (Array.isArray(states) && states.length) e.states = states;
        if (e.assist) await this.syncAssist(e);
        else this.startAssist(e);
      } catch (error) { this.log.warn?.(`[play now] ${error.message}`); } finally { e.statesAt = Date.now(); e.refreshing = null; }
    })();
    return e.refreshing;
  }

  // Readable from qBittorrent's file or playhead's pieces.
  readable(e, from = 0) { return readableBytes(e.layout, e.pieceSize, this.helping(e) ? e.merged || e.states : e.states, from); }

  // playhead is there for this video and answering.
  helping(e) { return Boolean(e.assist && this.assist && !e.assistQuiet); }

  // ffmpeg may read this video from the start without seeking to its end first (see LINEAR_START): a Matroska file
  // whose last piece isn't there yet.
  linearStart(e) {
    if (!LINEAR_START.test(e.name || '')) return false;
    return this.readable(e, e.size - 1) === 0;
  }

  // ---- playhead next to qBittorrent ----
  // Starts playhead on this torrent (once at a time; after a failure, again a minute later).
  startAssist(e) {
    if (!this.assist || e.assist || e.assisting || e.gone || Date.now() - e.assistTriedAt < 60_000) return null;
    e.assistTriedAt = Date.now();
    e.assisting = (async () => {
      if (!(await this.assist.ready())) return;
      const [torrent, peers, trackers] = await Promise.all([
        this.exportTorrent?.(e.hash).catch(() => null), this.peersOf?.(e.hash).catch(() => []), this.trackersOf?.(e.hash).catch(() => [])]);
      const opened = await this.assist.open({ hash: e.hash, file: e.index, torrent, peers: peers || [], trackers: trackers || [],
        paths: [...new Set([e.file, e.finalFile].filter(Boolean))], states: e.states, downloadLimit: this.assistLimit || 0,
        startLead: Math.min(e.size, START_LEAD_BYTES) });
      if (!opened?.id || opened.state !== 'ready') return; // no metadata yet: try again later
      e.assist = { id: opened.id, url: opened.url, own: '', rate: 0, peers: 0 };
      e.assistFailures = 0;
      this.log.info?.(`[play now] ${e.name}: playhead is helping`);
    })().catch((error) => this.log.warn?.(`[play now] playhead: ${error.message}`)).finally(() => { e.assisting = null; });
    return e.assisting;
  }

  // Tells playhead what qBittorrent has (and where the file is now), and gets what playhead has.
  async syncAssist(e) {
    const a = e.assist;
    try {
      await this.assist.update(a.id, { states: e.states, paths: [...new Set([e.file, e.finalFile].filter(Boolean))] });
      const st = await this.assist.status(a.id);
      a.own = String(st?.own || '');
      a.rate = Number(st?.download_rate) || 0;
      a.peers = Number(st?.peers_connected) || 0;
      e.merged = mergeStates(e.states, a.own);
      e.assistFailures = 0;
      if (e.assistQuiet) { this.log.info?.(`[play now] ${e.name}: playhead answers again`); e.assistQuiet = null; }
    } catch (error) {
      if (error?.status === 404) return this.dropAssist(e, error); // its stream is gone (playhead started again)
      if (++e.assistFailures < 3) return;
      if (!e.assistQuiet) {
        e.assistQuiet = Date.now();
        this.log.warn?.(`[play now] ${e.name}: playhead isn’t answering (${error?.message || error}); reading from qBittorrent meanwhile`);
      } else if (Date.now() - e.assistQuiet > ASSIST_QUIET_MAX_MS) this.dropAssist(e, error);
    }
  }

  dropAssist(e, error) {
    if (!e.assist) return;
    this.log.warn?.(`[play now] ${e.name}: playhead stopped helping (${error?.message || error}); carrying on with qBittorrent`);
    const id = e.assist.id;
    e.assist = null;
    e.merged = null;
    e.assistQuiet = null;
    e.assistTriedAt = Date.now();
    this.assist?.close(id).catch(() => {});
  }

  // Pipes [pos.at, end] from playhead into res, moving pos.at along; throws if playhead failed.
  async proxyAssist(e, res, pos, end, signal) {
    // Fresh piece states first (so playhead doesn't fetch what qBittorrent just got), and every second
    // while the read lasts: nothing else asks for them while playback is reading through playhead.
    await this.refresh(e);
    let last = Date.now(), rescued = false;
    // Rescue: nothing from playhead for a while, but qBittorrent has the next bytes. (Also when playhead hangs.)
    const own = new AbortController();
    const stop = () => own.abort();
    signal.addEventListener('abort', stop, { once: true });
    const tick = setInterval(() => {
      this.refresh(e).catch(() => {});
      if (Date.now() - last >= RESCUE_MS && readableBytes(e.layout, e.pieceSize, e.states, pos.at) > 0) { rescued = true; own.abort(); }
    }, POLL_MS);
    tick.unref?.();
    const rescue = () => Object.assign(new Error('playhead stalled on bytes qBittorrent has'), { rescue: true });
    let reader = null;
    try {
      const r = await this.assist.fetchRange(e.assist.url, pos.at, end, own.signal);
      if (r.status !== 206 && r.status !== 200) throw new Error(`playhead answered ${r.status}`);
      reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = Date.now();
        if (now - last > 1000 && e.started) { e.holds += 1; e.heldMs += now - last; }
        last = now;
        e.last = now;
        pos.at += value.length;
        if (!res.write(value)) await waitDrain(res, signal);
        if (signal.aborted) return;
      }
    } catch (error) {
      if (rescued && !signal.aborted) throw rescue();
      throw error;
    } finally { clearInterval(tick); signal.removeEventListener('abort', stop); reader?.releaseLock?.(); }
    if (pos.at <= end) throw new Error('playhead’s stream ended early');
  }

  complete(e) { return fileProgress(e.layout, e.states) >= 1; }

  // A video being watched whose download has finished and left qBittorrent.
  finished(id) { const e = this.entries.get(id); return Boolean(e?.gone && this.complete(e)); }

  // Waits until something can be read at `from` from qBittorrent's own file; resolves with how many bytes in a row.
  // Pieces only playhead has are not in that file (it would read holes), so they never count here. Resolves 0 when
  // playhead has come up meanwhile: the caller reads through it instead.
  async waitReadable(e, from, signal) {
    let waitingSince = null;
    const own = () => readableBytes(e.layout, e.pieceSize, e.states, from);
    for (;;) {
      if (signal?.aborted) throw failure(499, 'Stopped.');
      e.last = Date.now();
      const n = own();
      if (n > 0) {
        if (waitingSince != null && e.started) { e.holds += 1; e.heldMs += Date.now() - waitingSince; }
        return n;
      }
      if (this.helping(e)) return 0;
      waitingSince ??= Date.now();
      await this.refresh(e);
      if (e.gone) throw failure(410, 'That download no longer exists.');
      if (own() > 0 || this.helping(e)) continue;
      await sleep(POLL_MS, signal);
    }
  }

  // ---- the loopback file server ffmpeg reads from ----
  async inputUrl(e) {
    const port = await this.listen();
    return `http://127.0.0.1:${port}/${this.token}/${e.id}/video${path.extname(e.name).toLowerCase()}`;
  }

  async serve(req, res) {
    const [, token, id] = new URL(req.url, 'http://localhost').pathname.split('/');
    const given = Buffer.from(String(token)), wanted = Buffer.from(this.token);
    const e = given.length === wanted.length && crypto.timingSafeEqual(given, wanted) ? this.entries.get(id) : null;
    if (!e) { res.writeHead(404); res.end(); return; }
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), e.size - 1) : e.size - 1;
    if (start >= e.size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${e.size}` }); res.end(); return; }
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      ...(m ? { 'Content-Range': `bytes ${start}-${end}/${e.size}` } : {}) });
    if (req.method === 'HEAD') { res.end(); return; }
    const stop = new AbortController();
    res.once('close', () => stop.abort());
    let handle = null;
    try {
      let at = start;
      let direct = -1; // up to here, straight from qBittorrent's file (playhead stalled on bytes it has: rescue)
      while (at <= end) {
        // Through playhead whenever it's there (also when it comes up in the middle of a read).
        if (at >= direct && this.helping(e)) {
          const pos = { at };
          try { await this.proxyAssist(e, res, pos, end, stop.signal); }
          catch (error) {
            if (stop.signal.aborted) return;
            if (error.rescue) direct = pos.at + RESCUE_BYTES;
            else this.dropAssist(e, error);
          }
          at = pos.at;
          if (stop.signal.aborted) return;
          continue;
        }
        const ready = at < direct && this.helping(e) ? readableBytes(e.layout, e.pieceSize, e.states, at) : await this.waitReadable(e, at, stop.signal);
        if (!ready) { direct = -1; continue; }
        handle ||= await this.openWhenWritten([e.file, e.finalFile], stop.signal);
        const buffer = Buffer.allocUnsafe(Math.min(ready, READ_BYTES, end - at + 1));
        const { bytesRead } = await this.readFully(handle, buffer, at, stop.signal);
        at += bytesRead;
        if (!res.write(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead))) await waitDrain(res, stop.signal);
      }
      res.end();
    } catch { res.destroy(); } finally { await handle?.close().catch(() => {}); }
  }

  // files: where it is now first, then where it's moving to (a download leaving the scratch drive).
  async openWhenWritten(files, signal) {
    const list = [...new Set((Array.isArray(files) ? files : [files]).filter(Boolean))];
    const until = Date.now() + SHORT_READ_MS;
    for (;;) {
      let failure = null;
      for (const file of list) {
        try { return await fs.promises.open(file, 'r'); } catch (error) { failure ||= error; }
      }
      if (signal?.aborted || Date.now() > until) throw failure;
      await sleep(250, signal);
    }
  }

  // A piece qBittorrent just verified can be a moment away from the file on disk.
  async readFully(handle, buffer, at, signal) {
    const until = Date.now() + SHORT_READ_MS;
    for (;;) {
      const result = await handle.read(buffer, 0, buffer.length, at);
      if (result.bytesRead > 0) return result;
      if (signal?.aborted || Date.now() > until) throw failure(503, 'The downloaded part could not be read.');
      await sleep(250, signal);
    }
  }

  // ---- downloading for playback ----
  // In order, first and last pieces early, this file first, and running even if it was stopped or queued.
  async boost(e) {
    if (e.boosted) return;
    e.boosted = true;
    try {
      const t = await this.torrent(e.hash);
      if (!t) throw failure(404, 'That download no longer exists.');
      let was = this.torrents.get(e.hash);
      if (!was) {
        was = { sequential: Boolean(t.seq_dl), firstLast: Boolean(t.f_l_piece_prio), forced: Boolean(t.force_start) };
        this.torrents.set(e.hash, was);
        const hashes = new URLSearchParams({ hashes: e.hash });
        if (!t.seq_dl) await this.post('/api/v2/torrents/toggleSequentialDownload', hashes);
        if (!t.f_l_piece_prio) await this.post('/api/v2/torrents/toggleFirstLastPiecePrio', hashes);
      }
      if (/^(paused|stopped)/.test(t.state || '')) await this.start(e.hash);
      else if (/^queued/.test(t.state || '') && !t.force_start) await this.post('/api/v2/torrents/setForceStart', new URLSearchParams({ hashes: e.hash, value: 'true' }));
      if (e.multiFile) await this.orderPack(e);
    } catch (error) { e.boosted = false; throw error; }
  }

  // Someone already watching this pack keeps the order set for them.
  async orderPack(e) {
    if ([...this.entries.values()].some((x) => x !== e && x.hash === e.hash && x.boosted)) return;
    const files = await this.qbit(`/api/v2/torrents/files?hash=${e.hash}`);
    if (!Array.isArray(files)) return;
    const before = new Map(files.map((f, i) => [f.index ?? i, f.priority]));
    for (const [file, priority] of packPriorities(files, e.index)) {
      await this.post('/api/v2/torrents/filePrio', new URLSearchParams({ hash: e.hash, id: String(file), priority: String(priority) }));
      e.restorePriorities.push([file, before.get(file)]);
    }
  }

  async open(id) {
    const e = await this.entry(id);
    e.last = Date.now();
    e.opened = true;
    await this.boost(e);
    await this.refresh(e);
    // Finished torrents leave qBittorrent; the file is all there, so someone watching just carries on.
    if (e.gone && !this.complete(e)) { this.entries.delete(id); throw failure(404, 'That download no longer exists.'); }
    if (e.probeFailures >= MAX_PROBE_FAILURES) throw failure(422, e.probeError || 'Couldn’t read this video.');
    // The first time, give playhead a moment to start, so the probe (start and end of the file) reads through it.
    if (!e.info && !e.probing && e.assisting) await Promise.race([e.assisting, sleep(ASSIST_WAIT_MS)]);
    await this.startProbe(e);
    this.checkStart(e);
    return { ready: Boolean(e.info) && e.started, entry: e };
  }

  // Reads the video's length and bitrate (ffprobe through the loopback server, so it waits for the pieces it needs).
  async startProbe(e) {
    if (e.info || e.probing || e.probeFailures >= MAX_PROBE_FAILURES) return;
    const input = await this.inputUrl(e);
    if (e.info || e.probing) return;
    const linear = this.linearStart(e);
    e.probing = this.probe(input, { size: e.size, timeout: PROBE_MS, linear })
      // (Read from the start only, a file that needs its end after all gets the usual probe.)
      .catch((error) => (linear ? this.probe(input, { size: e.size, timeout: PROBE_MS }) : Promise.reject(error)))
      .then((info) => { e.info = info; })
      .catch((error) => { e.probeFailures += 1; e.probeError = error.message; })
      .finally(() => { e.probing = null; });
  }

  // Enough of the start in a row to begin playback?
  checkStart(e) {
    if (!e.info || e.started) return e.started;
    const readable = this.readable(e, 0);
    const lead = this.helping(e) ? ASSIST_LEAD : null;
    if (readable >= startBytes(e.size, e.info.bitrate, lead?.min)) e.enoughSince ??= Date.now();
    const speed = (Number(e.torrent?.dlspeed) || 0) + (this.helping(e) ? e.assist.rate || 0 : 0);
    e.started = readyToStart(readable, e.size, e.info.bitrate, e.enoughSince, Date.now(), lead, speed);
    return e.started;
  }

  // A first-time watch, before anyone presses Play: the same download mode as watching (in order, start and end first,
  // playhead fetching the start), and the probe, so that pressing Play finds the start there and the video read.
  // Lasts until `until` (or PREWARM_MS) even when nobody is watching. Call again to keep it up; returns the entry.
  async prewarm(id, { until = Date.now() + PREWARM_MS } = {}) {
    const e = await this.entry(id);
    e.keepUntil = Math.max(e.keepUntil || 0, until);
    e.prewarmed ??= Date.now();
    await this.boost(e);
    await this.refresh(e);
    if (e.gone) { this.entries.delete(id); throw failure(404, 'That download no longer exists.'); }
    // The probe reads through playhead when it's coming up (the next call starts it), else straight away.
    if (!e.assisting) await this.startProbe(e);
    this.checkStart(e);
    return e;
  }

  // Ends a prewarm nobody used (the download was replaced or removed): restores the torrent like an idle viewer.
  async drop(id) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    await this.restore(e).catch((error) => this.log.warn?.(`[play now] ${error.message}`));
  }

  // playhead's own pieces for a torrent ('' when it isn't helping): listed downloads count them as there.
  assistOwn(hash) {
    hash = String(hash || '').toLowerCase();
    for (const e of this.entries.values()) if (e.hash === hash && this.helping(e) && e.assist.own) return e.assist.own;
    return '';
  }

  // The watched (or prewarmed) entries of one torrent.
  entriesOf(hash) {
    hash = String(hash || '').toLowerCase();
    return [...this.entries.values()].filter((e) => e.hash === hash);
  }

  startStatus(e, speed) {
    if (e.started) return { startProgress: 1, startEta: 0 };
    const need = startBytes(e.size, e.info?.bitrate || 0, this.helping(e) ? ASSIST_LEAD.goal : START_GOAL_SECONDS);
    const have = Math.min(need, this.readable(e, 0));
    // No countdown while the start itself isn't moving: the total speed can be fine while the first pieces are stuck
    // (Nightcrawler 2026-11-18 showed "35 s" for minutes). Then the player says it's fetching the start.
    const now = Date.now();
    if (e.startSeen?.have !== have) e.startSeen = { have, at: now };
    const stuck = now - e.startSeen.at > 8000;
    return { startProgress: need ? have / need : 1, startEta: speed > 0 && !stuck ? Math.ceil((need - have) / speed) : null };
  }

  // What the player shows about the download.
  status(e) {
    const t = e.torrent || {};
    const progress = fileProgress(e.layout, e.states);
    const speed = (Number(t.dlspeed) || 0) + (this.helping(e) ? e.assist.rate || 0 : 0);
    const left = e.size * (1 - progress);
    const bitrate = e.info?.bitrate || 0;
    return { id: e.id, done: progress >= 1, progress, inOrder: e.size ? this.readable(e, 0) / e.size : 0, speed, eta: speed > 0 ? Math.round(left / speed) : null,
      state: t.state || '', paused: /^(paused|stopped)/.test(t.state || ''), seeds: Number.isFinite(t.num_seeds) ? t.num_seeds : null,
      keepsUp: bitrate > 0 ? speed * 8 >= bitrate * 1.1 : null, duration: e.info?.duration || null,
      // playhead is fetching what the player needs next (so a seek past the download doesn't wait for it).
      assisted: this.helping(e),
      // Before playback: how far along the start it waits for is (START_GOAL_SECONDS of video, or the
      // minimum until the video's bitrate is known), and roughly how long that takes at this speed.
      ...this.startStatus(e, speed) };
  }

  activeHashes() { return new Set([...this.entries.values()].map((e) => e.hash)); }

  // Nobody has asked for a while: the download carries on the way it was before.
  async sweep(now = Date.now()) {
    for (const e of [...this.entries.values()]) {
      if (now - e.last < IDLE_MS || (e.keepUntil || 0) > now) continue;
      this.entries.delete(e.id);
      await this.restore(e).catch((error) => this.log.warn?.(`[play now] ${error.message}`));
    }
  }

  async restore(e) {
    if (e.assist) { const id = e.assist.id; e.assist = null; await this.assist?.close(id).catch(() => {}); }
    if (e.started && e.opened) {
      const mbit = ((e.info?.bitrate || 0) / 1e6).toFixed(1);
      this.log.info?.(`[play now] ${e.name}: ${mbit} Mbit/s, the stream waited for the download ${e.holds} times, ${Math.round(e.heldMs / 1000)} s in all`);
    }
    for (const [file, priority] of e.restorePriorities) {
      await this.post('/api/v2/torrents/filePrio', new URLSearchParams({ hash: e.hash, id: String(file), priority: String(priority) }));
    }
    if ([...this.entries.values()].some((x) => x.hash === e.hash)) return;
    const was = this.torrents.get(e.hash);
    this.torrents.delete(e.hash);
    if (!was) return;
    const t = await this.torrent(e.hash);
    if (!t) return;
    const hashes = new URLSearchParams({ hashes: e.hash });
    if (Boolean(t.seq_dl) !== was.sequential) await this.post('/api/v2/torrents/toggleSequentialDownload', hashes);
    if (Boolean(t.f_l_piece_prio) !== was.firstLast) await this.post('/api/v2/torrents/toggleFirstLastPiecePrio', hashes);
    if (Boolean(t.force_start) !== was.forced) await this.post('/api/v2/torrents/setForceStart', new URLSearchParams({ hashes: e.hash, value: String(was.forced) }));
  }

  close() {
    clearInterval(this.timer);
    this.server?.close();
    this.server?.closeAllConnections?.();
  }
}
