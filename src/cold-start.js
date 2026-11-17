// First-time watches ("cold starts"): someone pressed Download on a film or one episode that isn't on the server
// yet. From that moment the download runs for watching, and Lilin checks that the release it picked can deliver.
//
// - Prewarm: as soon as the file list is there, the download runs the way Play now runs it (in order, start and end
//   first, playhead fetching the start) and the video is probed, so pressing Play finds the start there.
// - Spares: the next best releases are added next to the pick, fetching only their file lists (qBittorrent stops
//   them right after: a few hundred KB each). A pick whose file list doesn't come, that turns out to be a fake, or
//   whose swarm can't keep up with its own picture while a spare's might, is replaced by that spare. The rest go.
//   Someone already watching the pick (playback started) is never switched.
// - Priority: while one is starting, background downloads (Live TV picks, upgrades, later episodes) are held back.
// - Next episodes: a single episode, once it plays smoothly, brings the episodes after it (server.js decides how).
//
// Everything that talks to qBittorrent or Lilin's records comes in as deps (server.js); the decisions are here.

export const META_WAIT = 20_000;       // pick without a file list this long, a spare has one: switch
export const RATE_SETTLE = 25_000;     // measure the pick's speed this long after its file list arrived
export const SPARE_TRIAL = 25_000;     // a spare started for comparison runs this long before the verdict
export const RACE_MAX = 4 * 60_000;    // after this the pick stays whatever happens, and the spares go
export const KEEPS_UP = 1;             // speed against the picture's own bitrate that counts as keeping up
export const SETTLED_LEAD = 120;       // seconds of video in a row: no reason to look further
export const COLD_MAX = 10 * 60_000;   // a start that hasn't settled by then stops holding others back
export const LIFETIME = 12 * 60_000;   // after this nothing more is done for it
const FASTER = 1.3;                    // a spare has to be clearly faster to take over
const SMOOTH = 0.3;                    // speed smoothing (new sample's weight)

// What to do next. c: { addedAt, metaAt, fake, rate, need, lead, done, watching, spares: [{ hash, metaAt, fake,
// running, startedAt, rate, tried }] }. Returns { swap, why } | { start } | { settle } | null (wait).
export function raceStep(c, now = Date.now()) {
  const clean = (c.spares || []).filter((s) => s.metaAt != null && !s.fake);
  const running = clean.find((s) => s.running);
  if (c.fake) {
    if (running || clean[0]) return { swap: (running || clean[0]).hash, why: 'fake' };
    return (c.spares || []).some((s) => s.metaAt == null && !s.fake) && now - c.addedAt < RACE_MAX ? null : { settle: true };
  }
  if (c.metaAt == null) {
    if (now - c.addedAt >= META_WAIT && clean.length) return { swap: clean[0].hash, why: 'its file list never came' };
    return now - c.addedAt >= RACE_MAX ? { settle: true } : null;
  }
  if (c.done || c.lead >= SETTLED_LEAD) return { settle: true };
  if (running) {
    if (now - running.startedAt < SPARE_TRIAL) return null;
    if (!c.watching && running.rate > Math.max(c.rate * FASTER, c.rate + 0.25 * (c.need || 0))) return { swap: running.hash, why: 'faster' };
    return { settle: true };
  }
  if (now - c.metaAt < RATE_SETTLE) return null;
  if (!(c.need > 0) || c.rate >= c.need * KEEPS_UP || c.watching) return { settle: true };
  const next = clean.find((s) => !s.tried);
  if (next) return { start: next.hash };
  if (now - c.addedAt >= RACE_MAX || !(c.spares || []).some((s) => s.metaAt == null && !s.fake)) return { settle: true };
  return null; // the spares' file lists may still come
}

// Still holding others back? Until the start has a good lead, the file is done, or COLD_MAX.
export const isCold = (c, now = Date.now()) => !c.ended && !c.done && !(c.lead >= SETTLED_LEAD) && now - c.addedAt < COLD_MAX;

export class ColdStarts {
  // deps: {
  //   info(hashes) -> Map(hash -> qBittorrent torrent info),  files(t) -> file list ([] / null without metadata),
  //   pickFile(c, t, files) -> file index for the film / episode (null: none), fake(files) -> why | null,
  //   partial: PartialStreams (prewarm, entriesOf, drop, readable), addSpare(c, candidate) -> { hash, name, link, ref } | null,
  //   startSpare(hash), stopSpare(hash), swap(c, spare, why) -> bool (the spare is now theirs and the old pick gone),
  //   removeSpare(hash), fakeFound(c, hash, name, why, { primary }), followUp(c), setLimit(hashes, bytesPerSecond),
  //   background() -> hashes to hold back, behind() -> true while someone watching a download is waiting for it, log }
  constructor(deps) {
    this.deps = deps;
    this.starts = new Map();     // id -> cold start
    this.throttled = new Set();  // hashes held back right now
    this.busy = false;
    this.seq = 0;
  }

  // A download someone started to watch. pick: { hash, name }, alternatives: search results for spares (best first).
  // kind 'movie' | 'episode'; runtime in minutes (for the picture's bitrate before the probe has read it).
  register({ userId, hash, name, kind, season = null, episode = null, runtime = null, alternatives = [], title = null, tmdbId = null }) {
    hash = String(hash || '').toLowerCase();
    if (!hash || [...this.starts.values()].some((c) => c.hash === hash)) return null;
    const c = { id: `c${++this.seq}`, userId, hash, name, kind, season, episode, runtime, title, tmdbId, addedAt: Date.now(),
      metaAt: null, fake: null, fileIndex: null, rate: 0, need: 0, lead: 0, done: false, watching: false, spares: [], settled: false,
      ended: false, swaps: 0, followed: false, pending: alternatives.slice(0, 2) };
    this.starts.set(c.id, c);
    this.addSpares(c).catch((e) => this.deps.log?.warn?.(`[cold] ${name}: spares: ${e.message}`));
    return c.id;
  }

  async addSpares(c) {
    const list = c.pending;
    c.pending = [];
    for (const r of list) {
      if (c.settled || c.ended) return;
      const s = await this.deps.addSpare(c, r).catch(() => null);
      if (s?.hash && s.hash !== c.hash) c.spares.push({ ...s, hash: s.hash.toLowerCase(), metaAt: null, fake: null, running: false, startedAt: null, rate: 0, tried: false, fileIndex: null });
    }
  }

  // Hashes this module looks after (picks and spares): the server's own fake check leaves them alone.
  owns(hash) {
    hash = String(hash || '').toLowerCase();
    return [...this.starts.values()].some((c) => !c.ended && (c.hash === hash || c.spares.some((s) => s.hash === hash)));
  }
  isSpare(hash) {
    hash = String(hash || '').toLowerCase();
    return [...this.starts.values()].some((c) => !c.ended && c.spares.some((s) => s.hash === hash));
  }
  active(now = Date.now()) { return [...this.starts.values()].some((c) => isCold(c, now)); }
  list() { return [...this.starts.values()]; }

  async round(now = Date.now()) {
    if (this.busy) return;
    this.busy = true;
    try {
      const starts = [...this.starts.values()];
      const hashes = starts.flatMap((c) => [c.hash, ...c.spares.map((s) => s.hash)]);
      const info = hashes.length ? await this.deps.info(hashes) : new Map();
      for (const c of starts) {
        try { await this.step(c, info, now); } catch (e) { this.deps.log?.warn?.(`[cold] ${c.name}: ${e.message}`); }
      }
      await this.priority(now).catch((e) => this.deps.log?.warn?.(`[cold] priority: ${e.message}`));
    } finally { this.busy = false; }
  }

  // Video file + prewarm for one torrent; returns { entry, meta } (entry null while there's no file list).
  async warm(c, t, holder, until) {
    const files = await this.deps.files(t).catch(() => null);
    if (!files?.length) return { entry: null, meta: false };
    holder.metaAt ??= Date.now();
    holder.fake ??= this.deps.fake(files) || false;
    if (holder.fake) return { entry: null, meta: true };
    holder.fileIndex ??= this.deps.pickFile(c, t, files);
    if (holder.fileIndex == null) return { entry: null, meta: true };
    const id = `${holder.hash}-${holder.fileIndex}`;
    const entry = await this.deps.partial.prewarm(id, { until }).catch((e) => { this.deps.log?.warn?.(`[cold] ${t.name}: ${e.message}`); return null; });
    return { entry, meta: true };
  }

  measure(holder, entry, t) {
    const speed = (Number(entry?.torrent?.dlspeed ?? t?.dlspeed) || 0) + (entry?.assist?.rate || 0);
    holder.rate = holder.samples ? holder.rate * (1 - SMOOTH) + speed * SMOOTH : speed;
    holder.samples = (holder.samples || 0) + 1;
  }

  async step(c, info, now) {
    if (c.ended) { this.starts.delete(c.id); return; }
    const t = info.get(c.hash);
    if (!t) { await this.end(c, 'gone'); return; }
    const until = c.addedAt + LIFETIME;
    const { entry } = await this.warm(c, t, c, until);
    if (entry) {
      this.measure(c, entry, t);
      const size = entry.size || 0, duration = entry.info?.duration || 0;
      c.need = entry.info?.bitrate ? entry.info.bitrate / 8 : size && c.runtime ? size / (c.runtime * 60) : 0;
      c.lead = duration && size ? (this.deps.partial.readable(entry, 0) / size) * duration : 0;
      c.done = this.deps.partial.status(entry).done;
      c.watching = Boolean(entry.opened && entry.started);
    }
    // Spares: their file lists, fakes, and the one running for comparison.
    for (const s of [...c.spares]) {
      const st = info.get(s.hash);
      if (!st) { c.spares = c.spares.filter((x) => x !== s); continue; }
      if (s.running) {
        const { entry: se } = await this.warm(c, st, s, until);
        if (se) this.measure(s, se, st);
        continue;
      }
      // (qBittorrent stops a spare once its file list is there; one that keeps going is stopped here.)
      if (s.metaAt != null && /^(downloading|stalledDL|forcedDL)$/.test(st.state || '')) await this.deps.stopSpare?.(s.hash);
      const files = s.metaAt == null ? await this.deps.files(st).catch(() => null) : null;
      if (files?.length) {
        s.metaAt = now;
        s.fake = this.deps.fake(files) || false;
        s.fileIndex = s.fake ? null : this.deps.pickFile(c, st, files);
        if (s.fake || s.fileIndex == null) {
          c.spares = c.spares.filter((x) => x !== s);
          if (s.fake) await this.deps.fakeFound(c, s.hash, st.name, s.fake, { primary: false });
          await this.deps.removeSpare(s.hash);
        }
      }
    }
    if (!c.settled) {
      const act = raceStep(c, now);
      if (act?.swap) await this.swapTo(c, c.spares.find((s) => s.hash === act.swap), act.why, t);
      else if (act?.start) {
        const s = c.spares.find((x) => x.hash === act.start);
        s.tried = true;
        s.running = true;
        s.startedAt = now;
        await this.deps.startSpare(s.hash);
        this.deps.log?.info?.(`[cold] ${c.name}: ${mb(c.rate)} of ${mb(c.need)} MB/s, trying ${s.name} next to it`);
      } else if (act?.settle) {
        await this.settle(c);
        // A fake with no spare to take over: the usual way (removed, and its Download runs again).
        if (c.fake) { await this.deps.fakeFound(c, c.hash, t.name, c.fake, { primary: true, retry: true }); await this.end(c); return; }
      }
    }
    if (!isCold(c, now) && c.kind === 'episode' && !c.followed && !c.fake) {
      c.followed = true;
      await Promise.resolve(this.deps.followUp?.(c)).catch((e) => this.deps.log?.warn?.(`[cold] ${c.name}: next episodes: ${e.message}`));
    }
    if (now - c.addedAt > LIFETIME && c.settled) { c.ended = true; this.starts.delete(c.id); }
  }

  async swapTo(c, spare, why, oldT) {
    if (!spare) return;
    const was = { hash: c.hash, name: c.name, fileIndex: c.fileIndex, fake: c.fake };
    const ok = await this.deps.swap(c, spare, why);
    if (!ok) { c.spares = c.spares.filter((s) => s !== spare); await this.deps.removeSpare(spare.hash).catch(() => {}); return; }
    this.deps.log?.info?.(`[cold] ${c.title || c.name}: ${was.name} → ${spare.name} (${why})`);
    if (was.fake) await this.deps.fakeFound(c, was.hash, oldT?.name || was.name, was.fake, { primary: true });
    if (was.fileIndex != null) await this.deps.partial.drop(`${was.hash}-${was.fileIndex}`);
    c.spares = c.spares.filter((s) => s !== spare);
    Object.assign(c, { hash: spare.hash, name: spare.name, metaAt: spare.metaAt, fake: false, fileIndex: spare.fileIndex, rate: spare.rate || 0,
      samples: spare.samples || 0, swaps: c.swaps + 1, watching: false });
    if (spare.running) c.metaAt = spare.startedAt; // its speed has been measured since then
    if (why === 'faster') await this.settle(c);
  }

  // The pick stays: spares go.
  async settle(c) {
    c.settled = true;
    for (const s of c.spares) {
      if (s.running && s.fileIndex != null) await this.deps.partial.drop(`${s.hash}-${s.fileIndex}`);
      await this.deps.removeSpare(s.hash).catch(() => {});
    }
    c.spares = [];
  }

  async end(c) {
    await this.settle(c);
    c.ended = true;
    this.starts.delete(c.id);
  }

  // Background downloads wait while someone's video is starting.
  async priority(now = Date.now()) {
    const hold = this.active(now) || this.deps.behind?.() ? new Set((await this.deps.background()).map((h) => h.toLowerCase())) : new Set();
    for (const c of this.starts.values()) { hold.delete(c.hash); for (const s of c.spares) hold.delete(s.hash); }
    const on = [...hold].filter((h) => !this.throttled.has(h));
    const off = [...this.throttled].filter((h) => !hold.has(h));
    if (on.length) await this.deps.setLimit(on, THROTTLE_BPS);
    if (off.length) await this.deps.setLimit(off, 0);
    for (const h of on) this.throttled.add(h);
    for (const h of off) this.throttled.delete(h);
  }
}

// What a held-back download may still use (bytes/s). An odd number, so one left behind by a crash is recognisable.
export const THROTTLE_BPS = 98_304;
const mb = (b) => (b / 1024 ** 2).toFixed(1);
