// Live TV: channels that are always on, made from the library. Everyone tuned to a channel sees the same
// moment of the same video, so it works like a Watch Together room nobody had to plan.
//
// A channel's schedule is a list of programmes laid end to end. Nothing runs in the background: the list is
// extended only when someone looks (the guide, tuning in), from the channel's seed and the programme's
// number, so the same library always gives the same schedule. Programmes that have started (or start in the
// next few minutes) are saved and never change again; the rest is worked out afresh whenever the library or
// the channel changes. A new title or a deleted one therefore only changes the future, never what's on now.
//
// Each programme skips what was found to skip (credits.js): the opening titles and the end credits, so the
// next one follows straight on.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIN = 60000, HOUR = 60 * MIN;
export const FREEZE = 5 * MIN;        // programmes starting this soon are fixed (the guide's "Next" never flips)
export const KEEP_PAST = 3 * HOUR;    // aired programmes kept for the guide's left edge
export const HORIZON = 6 * HOUR;      // how far ahead a schedule is worked out at most
const MIN_SEGMENT = 2;                // seconds: shorter pieces between skips aren't worth a jump
const MAX_PICKS = 400;                // programmes worked out per request at most (a cold start, a long guide)
export const AUTO = ['anime', 'sitcoms', 'films', 'docs', 'fresh', 'drama', 'scifi', 'action'];
const DRAMA = [18, 80, 9648], SCIFI = [878, 14, 10765], ACTION = [28, 12, 10759]; // TMDB film + TV genre ids
export const COMEDY = 35, DOCUMENTARY = 99, ANIMATION = 16;

const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = (text) => crypto.createHash('sha256').update(String(text)).digest();
// A number in [0, 1) from the channel's seed and the programme's number: the schedule's only randomness.
export const draw = (seed, n) => hash(`${seed}|${n}`).readUInt32BE(0) / 0x100000000;
// The Watch Together room a channel plays in (same token shape as a room link).
export const liveToken = (id) => `L${hash(`lilin-live|${id}`).toString('base64url').slice(0, 23)}`;

// The pieces of a video that air, in its own seconds: everything except the opening titles and the credits.
// times: { duration, intro: { start, end } | null, creditsAt }.
export function segmentsOf(times) {
  const duration = Number(times?.duration);
  if (!Number.isFinite(duration) || duration < 30) return null;
  const credits = Number(times.creditsAt);
  const end = Number.isFinite(credits) && credits > duration * 0.5 && credits < duration ? credits : duration;
  let pieces = [[0, end]];
  const intro = times.intro;
  if (intro && Number.isFinite(intro.start) && Number.isFinite(intro.end) && intro.end > intro.start && intro.end < end) {
    pieces = [[0, Math.max(0, intro.start)], [intro.end, end]];
  }
  pieces = pieces.filter(([a, b]) => b - a >= MIN_SEGMENT).map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
  return pieces.length ? pieces : null;
}
const airtime = (segments) => segments.reduce((n, [a, b]) => n + (b - a), 0);

// Where in the video `offset` seconds into a programme are, and when that piece ends (seconds into the programme).
export function placeIn(segments, offset) {
  let before = 0;
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    if (offset < before + (b - a) || i === segments.length - 1) {
      return { segment: i, position: Math.min(b, a + Math.max(0, offset - before)), pieceEnds: before + (b - a) };
    }
    before += b - a;
  }
  return null;
}

// Which library items a channel plays. items: the server's library, one per title (no duplicate versions),
// each { key, id, kind: 'film'|'episode', show, showTitle, title, season, episode, genres, anime, file }.
// ctx: { picksOf(userId) -> { keys:Set, liked:Set } } for the people's channels.
export function poolFor(channel, items, ctx = {}) {
  const genres = (i) => i.genres || [];
  const docs = (i) => genres(i).includes(DOCUMENTARY);
  let pool;
  if (channel.id === 'anime') pool = items.filter((i) => i.kind === 'episode' && i.anime);
  else if (channel.id === 'sitcoms') pool = items.filter((i) => i.kind === 'episode' && !i.anime && !docs(i) && genres(i).includes(COMEDY));
  else if (channel.id === 'films') pool = items.filter((i) => i.kind === 'film' && !docs(i));
  else if (channel.id === 'docs') pool = items.filter(docs);
  else if (channel.id === 'fresh') pool = items.filter((i) => i.fresh); // new on the server, and the TV picks (tv-picks.js)
  // Drama: series only (films have the Films channel). Sci-Fi & Fantasy and Action & Adventure: films and series.
  else if (channel.id === 'drama') pool = items.filter((i) => i.kind === 'episode' && !i.anime && !docs(i) && !genres(i).includes(COMEDY) && genres(i).some((g) => DRAMA.includes(g)));
  else if (channel.id === 'scifi') pool = items.filter((i) => !i.anime && !docs(i) && genres(i).some((g) => SCIFI.includes(g)));
  else if (channel.id === 'action') pool = items.filter((i) => !i.anime && !docs(i) && genres(i).some((g) => ACTION.includes(g)));
  else if (channel.picks != null) {
    const picks = ctx.picksOf?.(channel.picks);
    pool = picks ? items.filter((i) => picks.keys.has(i.key) || (i.titleKey && picks.liked.has(i.titleKey))) : [];
  } else {
    const shows = new Set(channel.shows || []), wanted = new Set(channel.genres || []);
    const libs = (channel.libraries || []).map((id) => ctx.picksOf?.(id)?.keys).filter(Boolean);
    const any = shows.size || wanted.size || libs.length;
    pool = items.filter((i) => {
      if (channel.types === 'films' && i.kind !== 'film') return false;
      if (channel.types === 'episodes' && i.kind !== 'episode') return false;
      if (!any) return true;
      return (i.show && shows.has(i.show)) || genres(i).some((g) => wanted.has(g)) || libs.some((keys) => keys.has(i.key));
    });
  }
  return pool;
}

// In order: by show, season and episode (films by title), so a channel plays a series through.
const orderKey = (i) => `${(i.showTitle || i.title || '').toLowerCase()}\u0000${String(i.season ?? 0).padStart(4, '0')}\u0000${String(i.episode ?? 0).padStart(5, '0')}\u0000${i.key}`;

export class Channels {
  // file: where channels and schedules are kept. now: the clock (tests pass their own).
  constructor({ file = null, now = Date.now } = {}) {
    this.file = file; this.now = now;
    this.data = { custom: [], plans: {} };
    if (file) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(saved.custom)) this.data.custom = saved.custom;
        if (saved.plans && typeof saved.plans === 'object') this.data.plans = saved.plans;
      } catch { /* first run */ }
    }
    this.busy = new Map();
  }

  save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 1500);
    this.saveTimer.unref?.();
  }
  saveNow() {
    if (!this.file) return;
    clearTimeout(this.saveTimer); this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch (e) { console.warn(`[live] couldn't save the schedules: ${e.message}`); }
  }

  // ---------- the owner's own channels ----------
  custom() { return this.data.custom.map((c) => ({ ...c })); }
  saveCustom(input) {
    const name = String(input.name || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) throw fail(400, 'Give the channel a name.');
    const ints = (list, max = 200) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, max);
    const showIds = [...new Set((Array.isArray(input.shows) ? input.shows : []).map(String).filter((s) => /^[\w:-]{1,120}$/.test(s)))].slice(0, 200);
    const channel = {
      id: input.id && this.data.custom.some((c) => c.id === input.id) ? input.id : `c${crypto.randomBytes(5).toString('hex')}`,
      name, shows: showIds, genres: ints(input.genres, 30), libraries: ints(input.libraries, 30),
      types: ['films', 'episodes'].includes(input.types) ? input.types : 'all',
      order: input.order === 'order' ? 'order' : 'shuffle',
      audience: ints(input.audience, 100),
    };
    if (!channel.shows.length && !channel.genres.length && !channel.libraries.length && channel.types === 'all') {
      throw fail(400, 'Pick at least one show, genre or library for the channel.');
    }
    const at = this.data.custom.findIndex((c) => c.id === channel.id);
    if (at >= 0) {
      channel.number = this.data.custom[at].number;
      this.data.custom[at] = channel;
      this.replan(channel.id); // what's on now stays; the rest follows the new rules
    } else {
      if (this.data.custom.length >= 40) throw fail(409, 'That’s plenty of channels. Remove one first.');
      const used = new Set(this.data.custom.map((c) => c.number));
      let number = AUTO.length + 1;
      while (used.has(number)) number++;
      channel.number = number;
      this.data.custom.push(channel);
    }
    this.save();
    return { ...channel };
  }
  removeCustom(id) {
    const at = this.data.custom.findIndex((c) => c.id === id);
    if (at < 0) throw fail(404, 'That channel is gone already.');
    this.data.custom.splice(at, 1);
    delete this.data.plans[id];
    this.save();
  }

  // ---------- schedules ----------
  plan(id) { return (this.data.plans[id] ||= { sig: '', entries: [] }); }

  // Forget the programmes that haven't started (and aren't about to): they're worked out again.
  replan(id, now = this.now()) {
    const plan = this.data.plans[id];
    if (!plan) return;
    plan.entries = plan.entries.filter((e) => e.s <= now + FREEZE);
    plan.sig = '';
  }

  // Work the schedule out up to `until`. pool: the channel's items; timesOf(item) -> { duration, intro, creditsAt }
  // (null when the video can't be read). Returns the plan. One run per channel at a time.
  async extend(channel, pool, until, timesOf) {
    const id = channel.id;
    while (this.busy.has(id)) await this.busy.get(id);
    const run = this.extendNow(channel, pool, until, timesOf);
    this.busy.set(id, run);
    try { return await run; } finally { this.busy.delete(id); }
  }

  async extendNow(channel, pool, until, timesOf) {
    const now = this.now();
    const plan = this.plan(channel.id);
    const seed = channel.seed || channel.id;
    const order = channel.order || 'shuffle';
    const sig = hash(`${order}|${pool.map((i) => i.key).sort().join('|')}`).toString('base64url').slice(0, 16);
    let changed = false;
    const before = plan.entries.length;
    // Series order remembers how far each show got once its programmes leave the guide.
    if (order === 'series') for (const e of plan.entries) if (e.e < now - KEEP_PAST && e.m?.show) (plan.pos ||= {})[e.m.show] = posKey(e);
    plan.entries = plan.entries.filter((e) => e.e >= now - KEEP_PAST);
    if (plan.entries.length !== before) changed = true;
    // A different library (or channel): keep what has started or is about to, work out the rest again.
    if (plan.sig !== sig) {
      plan.entries = plan.entries.filter((e) => e.s <= now + FREEZE);
      plan.sig = sig; changed = true;
    }
    until = Math.min(until, now + HORIZON);
    if (!pool.length) { if (changed) this.save(); return plan; }
    // Nobody looked for a while (the last programme ended before now): start afresh on a round minute.
    // Nobody can have seen the gap, so where the new run starts doesn't matter, only that it's the same for everyone.
    if (!plan.entries.length || plan.entries.at(-1).e < now) {
      if (order === 'series') for (const e of plan.entries) if (e.m?.show) (plan.pos ||= {})[e.m.show] = posKey(e);
      plan.entries = [];
      plan.start = Math.floor(now / MIN) * MIN;
      changed = true;
    }
    const ordered = order === 'order' ? [...pool].sort((a, b) => orderKey(a).localeCompare(orderKey(b))) : null;
    const sorted = ordered || [...pool].sort((a, b) => (a.key < b.key ? -1 : 1));
    const series = order === 'series' ? seriesOf(pool) : null;
    // A fresh run is numbered from the clock, so it doesn't open with the same programme every time.
    let n = plan.entries.length ? plan.entries.at(-1).n + 1 : Math.floor(now / MIN);
    let picks = 0, misses = 0;
    while ((plan.entries.at(-1)?.e ?? plan.start) < until && picks < MAX_PICKS && misses < 30) {
      const last = plan.entries.at(-1);
      const recent = plan.entries.slice(-Math.min(60, Math.floor(pool.length / 2))).map((e) => e.k);
      const item = series ? this.pickSeries({ seed, n, series, plan })
        : this.pick({ seed, n, sorted, ordered: Boolean(ordered), recent, last, misses });
      let segments = null;
      try { segments = segmentsOf(await timesOf(item)); } catch { /* unreadable: another one */ }
      if (!segments) { misses++; n++; continue; }
      misses = 0;
      const start = last ? last.e : plan.start;
      plan.entries.push({ n, s: start, e: start + Math.round(airtime(segments) * 1000), k: item.key, id: item.id, seg: segments, m: meta(item) });
      n++; picks++; changed = true;
    }
    if (changed) this.save();
    return plan;
  }

  // The next programme. Shuffle: a seeded draw among titles that haven't aired lately. In order: the item after
  // the last one (round again at the end); the draw only picks where a fresh channel starts.
  pick({ seed, n, sorted, ordered, recent, last, misses }) {
    if (ordered) {
      let at = last ? sorted.findIndex((i) => i.key === last.k) : -1;
      // The last one has left the library: carry on from where it would have been.
      if (at < 0 && last) {
        const was = orderKey({ key: last.k, showTitle: last.m?.title, season: last.m?.season, episode: last.m?.episode });
        at = sorted.findIndex((i) => orderKey(i) > was) - 1;
        if (at < -1) at = sorted.length - 1;
      }
      if (at < 0 && !last) at = Math.floor(draw(seed, n) * sorted.length) - 1;
      return sorted[(at + 1 + misses) % sorted.length];
    }
    const recentSet = new Set(recent);
    const fresh = sorted.filter((i) => !recentSet.has(i.key));
    const from = fresh.length ? fresh : sorted;
    return from[Math.floor(draw(seed, n) * from.length)];
  }

  // Series: a seeded draw among the titles (a film, or a show) that haven't aired lately; a show plays its next
  // episode after the one that aired last (from the start again after its last).
  pickSeries({ seed, n, series, plan }) {
    const recent = new Set(plan.entries.slice(-Math.min(30, Math.floor(series.length / 2))).map((e) => e.m?.show || e.k));
    const fresh = series.filter((t) => !recent.has(t.id));
    const from = fresh.length ? fresh : series;
    const title = from[Math.floor(draw(seed, n) * from.length)];
    if (title.items.length === 1) return title.items[0];
    let was = plan.pos?.[title.id] || null;
    for (const e of plan.entries) if (e.m?.show === title.id) was = posKey(e);
    return (was && title.items.find((i) => orderKey(i) > was)) || title.items[0];
  }

  // What's on at `at` (ms): { entry, offset (s into the programme), place: { segment, position, pieceEnds } }, or null.
  at(id, at = this.now()) {
    const plan = this.data.plans[id];
    const entry = plan?.entries.find((e) => e.s <= at && at < e.e);
    if (!entry) return null;
    const offset = (at - entry.s) / 1000;
    return { entry, offset, place: placeIn(entry.seg, offset) };
  }

  // Programmes overlapping [from, to).
  between(id, from, to) {
    return (this.data.plans[id]?.entries || []).filter((e) => e.e > from && e.s < to);
  }
  next(id, entry) {
    const list = this.data.plans[id]?.entries || [];
    return list[list.indexOf(entry) + 1] || null;
  }
  horizon(id) { return this.data.plans[id]?.entries.at(-1)?.e ?? 0; }
}

// Titles for series order: films alone, a show's episodes together in order. [{ id, items }], sorted.
function seriesOf(pool) {
  const by = new Map();
  for (const i of pool) {
    const id = i.kind === 'episode' && i.show ? i.show : i.key;
    if (!by.has(id)) by.set(id, { id, items: [] });
    by.get(id).items.push(i);
  }
  const list = [...by.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const t of list) t.items.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
  return list;
}
// Where a programme sits in its show's order (the same key orderKey gives the item).
const posKey = (e) => orderKey({ key: e.k, showTitle: e.m?.title, season: e.m?.season, episode: e.m?.episode });

// What the guide shows about a programme, kept with it (no lookups when drawing the guide).
function meta(item) {
  return { kind: item.kind, title: item.showTitle || item.title || '', season: item.season ?? null, episode: item.episode ?? null,
    name: item.episodeName || null, art: item.art || null, show: item.show || null, tk: item.titleKey || null };
}
