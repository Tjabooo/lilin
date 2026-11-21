// My list, per person (it was Save for later + Follow until 2026-11-21; both are one list now).
//
// Everything on someone's list downloads by itself (when they may download; see runRound):
// - A film waits for its release: once TMDB says it's out (digital or disc; the cinema date when neither is known)
//   the server looks for a good copy with the normal Download command (smart-download.js, which never takes a
//   cam; see filmOut) and keeps looking, with growing pauses, until one turns up. The person hears about it when
//   it lands (server.js announceArrivals). People who can't download hear once that it's out.
// - A show gets the season to start with (the one after the last episode you finished, else season 1; the next
//   one too once you're two episodes from a season's end), and each new episode once it has aired, starting after
//   the last episode that had aired when it was added, so the list never pulls in the whole back catalogue at once.
//   Episodes that arrive by themselves carry a "New" badge until you open the show, and the next episodes and
//   release dates fill the "Coming up" shelf in the Library.
//
// Checks run in the background (runRound), one title at a time.
import path from 'node:path';
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const GIVE_UP_DAYS = 14;          // an episode not found this long after it aired is reported as missing
const SHOW_EVERY = 3 * HOUR;      // a followed show's next episode is refreshed this often
const FILM_EVERY = DAY;           // a saved film's release dates are refreshed this often
const RETRY = [1, 2, 4, 8, 12].map((h) => h * HOUR); // then once a day

export const retryDelay = (tries) => RETRY[Math.max(0, tries - 1)] ?? DAY;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// When a film can be expected as a proper download: the earliest digital (type 4) or disc (type 5)
// release anywhere, else the first release date (cinema), else unknown.
export function filmRelease(details) {
  let best = null;
  for (const country of details?.release_dates?.results || []) {
    for (const r of country.release_dates || []) {
      if (r.type !== 4 && r.type !== 5) continue;
      const date = String(r.release_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!best || date < best.date) best = { date, kind: r.type === 4 ? 'digital' : 'disc' };
    }
  }
  if (best) return best;
  const date = String(details?.release_date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, kind: 'cinema' } : { date: null, kind: null };
}

// Whether a film can be downloaded as a proper copy yet (so never a cinema recording). Out once its
// digital or disc date has passed. With only a cinema date, Lilin waits CINEMA_WINDOW_DAYS after it,
// about how long films stay cinema-only; a film that came out over a year ago counts as out whatever
// TMDB lists (old films get new 4K disc dates). No date at all: out unless TMDB says it's unfinished.
// `expect`: the day it should be out (null when unknown).
export const CINEMA_WINDOW_DAYS = 90;
const UNFINISHED = new Set(['Rumored', 'Planned', 'In Production', 'Post Production', 'Canceled']);
const plusDays = (iso, days) => isoDay(Date.parse(`${iso}T00:00:00Z`) + days * DAY);
export function filmOut(details, today = isoDay(Date.now())) {
  const rel = filmRelease(details);
  const cinema = /^\d{4}-\d{2}-\d{2}$/.test(String(details?.release_date || '').slice(0, 10)) ? String(details.release_date).slice(0, 10) : null;
  if (cinema && plusDays(cinema, 365) <= today) return { ...rel, cinema, expect: null, out: true };
  if (rel.kind === 'digital' || rel.kind === 'disc') return { ...rel, cinema, expect: rel.date, out: rel.date <= today };
  if (rel.kind === 'cinema') {
    const expect = plusDays(rel.date, CINEMA_WINDOW_DAYS);
    return { ...rel, cinema, expect, out: expect <= today };
  }
  return { ...rel, cinema, expect: null, out: !UNFINISHED.has(details?.status) };
}

// Where following starts: the last episode that has aired (specials don't count).
export function baselineFrom(details) {
  const last = details?.last_episode_to_air;
  return last && last.season_number >= 1 ? { season: last.season_number, episode: last.episode_number || 0 } : { season: 0, episode: 0 };
}

export function nextUp(details) {
  const n = details?.next_episode_to_air;
  if (!n || !(n.season_number >= 1)) return null;
  return { season: n.season_number, episode: n.episode_number, name: n.name || null, airDate: n.air_date || null };
}

// Episodes that aired by `today` and come after the baseline.
export function airedAfter(episodes, baseline, today) {
  const b = baseline || { season: 0, episode: 0 };
  return episodes.filter((e) => e.season >= 1 && e.episode >= 1 && e.airDate && e.airDate <= today
    && (e.season > b.season || (e.season === b.season && e.episode > b.episode)));
}

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export class WatchlistStore {
  constructor(dataDir) {
    this.db = new DatabaseSync(path.join(dataDir, '.lilin.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS watchlist (
        user_id INTEGER NOT NULL, type TEXT NOT NULL, tmdb_id INTEGER NOT NULL,
        title TEXT NOT NULL, year INTEGER, poster TEXT, backdrop TEXT, overview TEXT, rating REAL,
        saved INTEGER NOT NULL DEFAULT 0, follow INTEGER NOT NULL DEFAULT 0, auto INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL, release TEXT, release_kind TEXT, next_ep TEXT, baseline TEXT,
        state TEXT NOT NULL DEFAULT 'waiting', note TEXT, tries INTEGER NOT NULL DEFAULT 0,
        check_at INTEGER NOT NULL DEFAULT 0, checked_at INTEGER,
        PRIMARY KEY (user_id, type, tmdb_id));
      CREATE TABLE IF NOT EXISTS follow_episodes (
        user_id INTEGER NOT NULL, tmdb_id INTEGER NOT NULL, season INTEGER NOT NULL, episode INTEGER NOT NULL,
        air_date TEXT, state TEXT NOT NULL DEFAULT 'waiting', tries INTEGER NOT NULL DEFAULT 0,
        check_at INTEGER NOT NULL DEFAULT 0, note TEXT, got_at INTEGER, seen INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, tmdb_id, season, episode));`);
    // My list (2026-11-21): seasons = the seasons a show's list entry has fetched, start_* = when to try the next
    // one again, out_told = a film's "it's out" notice went to someone who can't download. Old rows join the list:
    // every saved or followed title is on it, shows are followed, and everything downloads by itself.
    if (!this.db.prepare("SELECT 1 FROM pragma_table_info('watchlist') WHERE name = 'seasons'").get()) {
      this.db.exec(`ALTER TABLE watchlist ADD COLUMN seasons TEXT;
        ALTER TABLE watchlist ADD COLUMN start_tries INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE watchlist ADD COLUMN start_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE watchlist ADD COLUMN out_told INTEGER NOT NULL DEFAULT 0;
        UPDATE watchlist SET saved = 1, follow = CASE WHEN type = 'tv' THEN 1 ELSE 0 END, auto = 1, check_at = 0, tries = 0;`);
    }
  }

  get(userId, type, tmdbId) {
    return this.db.prepare('SELECT * FROM watchlist WHERE user_id = ? AND type = ? AND tmdb_id = ?').get(userId, type, tmdbId) || null;
  }

  // meta: { title, year, poster, backdrop, overview, rating }; flags: { saved?, follow?, baseline? }: saved (or, from
  // older pages, follow) false takes the title off the list. On the list, a show is followed and all of it downloads.
  set(userId, type, tmdbId, meta, flags, now = Date.now()) {
    const old = this.get(userId, type, tmdbId);
    const on = flags.saved ?? flags.follow ?? Boolean(old?.saved || old?.follow);
    if (!on) { this.remove(userId, type, tmdbId); return null; }
    const follow = type === 'tv';
    const m = { title: meta?.title || old?.title || 'Untitled', year: meta?.year ?? old?.year ?? null, poster: meta?.poster ?? old?.poster ?? null,
      backdrop: meta?.backdrop ?? old?.backdrop ?? null, overview: meta?.overview ?? old?.overview ?? null, rating: meta?.rating ?? old?.rating ?? null };
    const baseline = flags.baseline ? JSON.stringify(flags.baseline) : old?.baseline ?? null;
    this.db.prepare(`INSERT INTO watchlist (user_id, type, tmdb_id, title, year, poster, backdrop, overview, rating, saved, follow, auto, added_at, baseline, check_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, 0)
      ON CONFLICT(user_id, type, tmdb_id) DO UPDATE SET title = excluded.title, year = excluded.year, poster = excluded.poster,
        backdrop = excluded.backdrop, overview = excluded.overview, rating = excluded.rating, saved = 1, follow = excluded.follow,
        auto = 1, baseline = excluded.baseline`)
      .run(userId, type, tmdbId, m.title, m.year, m.poster, m.backdrop, m.overview, m.rating, follow ? 1 : 0, old?.added_at ?? now, baseline);
    return this.get(userId, type, tmdbId);
  }

  remove(userId, type, tmdbId) {
    this.db.prepare('DELETE FROM watchlist WHERE user_id = ? AND type = ? AND tmdb_id = ?').run(userId, type, tmdbId);
    if (type === 'tv') this.db.prepare('DELETE FROM follow_episodes WHERE user_id = ? AND tmdb_id = ?').run(userId, tmdbId);
  }

  patch(row, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    this.db.prepare(`UPDATE watchlist SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ? AND type = ? AND tmdb_id = ?`)
      .run(...keys.map((k) => fields[k]), row.user_id, row.type, row.tmdb_id);
  }

  // Rows whose next check is due: shows, and films not yet downloaded.
  due(now = Date.now()) {
    return this.db.prepare(`SELECT * FROM watchlist WHERE check_at <= ?
      AND (type = 'tv' OR (type = 'movie' AND state != 'got')) ORDER BY check_at`).all(now);
  }

  addEpisode(userId, tmdbId, season, episode, airDate) {
    this.db.prepare(`INSERT OR IGNORE INTO follow_episodes (user_id, tmdb_id, season, episode, air_date) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, tmdbId, season, episode, airDate || null);
  }

  pendingEpisodes(userId, tmdbId, now = Date.now()) {
    return this.db.prepare(`SELECT * FROM follow_episodes WHERE user_id = ? AND tmdb_id = ? AND state = 'waiting' AND check_at <= ?
      ORDER BY season, episode`).all(userId, tmdbId, now);
  }

  waitingCount(userId, tmdbId) {
    return this.db.prepare("SELECT COUNT(*) AS n FROM follow_episodes WHERE user_id = ? AND tmdb_id = ? AND state = 'waiting'").get(userId, tmdbId).n;
  }

  markEpisode(ep, fields) {
    const keys = Object.keys(fields);
    this.db.prepare(`UPDATE follow_episodes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ? AND tmdb_id = ? AND season = ? AND episode = ?`)
      .run(...keys.map((k) => fields[k]), ep.user_id, ep.tmdb_id, ep.season, ep.episode);
  }

  markSeen(userId, tmdbId) {
    return Number(this.db.prepare("UPDATE follow_episodes SET seen = 1 WHERE user_id = ? AND tmdb_id = ? AND state = 'got' AND seen = 0").run(userId, tmdbId).changes);
  }

  // Who follows which show (by title): new-episode notifications (push.js via server.js).
  followers() {
    return this.db.prepare("SELECT user_id, title FROM watchlist WHERE type = 'tv' AND follow = 1").all();
  }

  // Everything on everyone's list (by title): "From My list" notifications when it lands (server.js).
  listed() {
    return this.db.prepare('SELECT user_id, type, tmdb_id, title, year FROM watchlist WHERE saved = 1 OR follow = 1').all();
  }

  // A person's list, newest first, as the page sees it.
  list(userId) {
    const eps = this.db.prepare('SELECT * FROM follow_episodes WHERE user_id = ? ORDER BY season, episode').all(userId);
    return this.db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC').all(userId).map((r) => {
      const mine = r.type === 'tv' ? eps.filter((e) => e.tmdb_id === r.tmdb_id) : [];
      return {
        type: r.type, id: r.tmdb_id, tmdbId: r.tmdb_id, title: r.title, year: r.year, poster: r.poster, backdrop: r.backdrop,
        overview: r.overview, rating: r.rating, saved: Boolean(r.saved), follow: Boolean(r.follow), auto: Boolean(r.auto),
        addedAt: r.added_at, release: r.release, releaseKind: r.release_kind, nextEpisode: parse(r.next_ep),
        state: r.state, note: r.note, checkedAt: r.checked_at, seasons: parse(r.seasons) || [],
        newEpisodes: mine.filter((e) => e.state === 'got' && !e.seen).map((e) => ({ season: e.season, episode: e.episode })),
        waiting: mine.filter((e) => e.state === 'waiting').map((e) => ({ season: e.season, episode: e.episode, note: e.note })),
        missed: mine.filter((e) => e.state === 'missed').map((e) => ({ season: e.season, episode: e.episode, note: e.note })),
      };
    });
  }
}

// One pass over everything that is due. deps:
//   user(id) -> user | null, canAuto(user) -> may this person download now,
//   film(tmdbId) -> TMDB /movie/{id} with release_dates, show(tmdbId) -> TMDB /tv/{id},
//   season(tmdbId, n) -> TMDB /tv/{id}/season/{n},
//   download(user, { type, tmdbId, season?, episodes? }) -> the finished smart-download job,
//   finished(userId, tmdbId) -> the last episode they finished { season, episode } or null,
//   notify(userId, { title, body }) -> a "From My list" notification, changed(userId), log(msg), now()
export async function runRound(store, deps) {
  const now = deps.now?.() ?? Date.now();
  let checked = 0;
  for (const row of store.due(now)) {
    const user = deps.user(row.user_id);
    if (!user) continue;
    try {
      if (row.type === 'movie') await checkFilm(store, row, user, deps, now);
      else await checkShow(store, row, user, deps, now);
    } catch (e) {
      store.patch(row, { note: e.message || String(e), check_at: now + HOUR, checked_at: now });
      deps.log?.(`[watchlist] ${row.title}: ${e.message || e}`);
    }
    checked++;
    deps.changed?.(row.user_id);
  }
  return checked;
}

async function checkFilm(store, row, user, deps, now) {
  const today = isoDay(now);
  const rel = filmOut(await deps.film(row.tmdb_id), today);
  const base = { release: rel.date, release_kind: rel.kind, checked_at: now };
  if (!deps.canAuto(user)) {
    // Someone who can't download hears once that it's out (the list can't fetch it for them).
    const tell = rel.out && !row.out_told;
    if (tell) deps.notify?.(row.user_id, { title: `${row.title} is out`, body: 'It’s on your list, and a proper copy can be had now.' });
    return store.patch(row, { ...base, state: 'waiting', note: null, check_at: now + FILM_EVERY, ...(tell ? { out_told: 1 } : {}) });
  }
  if (!rel.out) return store.patch(row, { ...base, state: 'waiting', note: null, tries: 0, check_at: now + FILM_EVERY });
  const job = await deps.download(user, { type: 'movie', tmdbId: row.tmdb_id });
  if (job?.state === 'done' && ['started', 'queued', 'have'].includes(job.outcome)) {
    deps.log?.(`[watchlist] ${row.title}: ${job.message}`);
    return store.patch(row, { ...base, state: 'got', note: job.message, tries: 0, check_at: now });
  }
  const tries = row.tries + 1;
  store.patch(row, { ...base, state: 'looking', note: job?.message || job?.error || 'No suitable release yet.', tries, check_at: now + retryDelay(tries) });
}

// The seasons a show on someone's list should have now: the one with the next episode they haven't finished
// (season 1 when they haven't watched any), plus the one after once they're within two episodes of a season's end.
// Only seasons that have started airing; specials never.
export function startSeasons(details, finished, today) {
  const lastAired = details?.last_episode_to_air?.season_number || 0;
  const aired = (details?.seasons || []).filter((s) => s.season_number >= 1 && s.episode_count > 0 && s.season_number <= lastAired
    && (!s.air_date || s.air_date <= today)).sort((a, b) => a.season_number - b.season_number);
  if (!aired.length) return [];
  const fin = finished?.season >= 1 ? finished : null;
  let i = fin ? aired.findIndex((s) => s.season_number >= fin.season) : 0;
  if (i < 0) return [];
  if (fin && aired[i].season_number === fin.season && fin.episode >= aired[i].episode_count) i++;
  if (i >= aired.length) return [];
  const out = [aired[i].season_number];
  const left = fin && aired[i].season_number === fin.season ? aired[i].episode_count - fin.episode : Infinity;
  if (left <= 2 && aired[i + 1]) out.push(aired[i + 1].season_number);
  return out;
}

async function checkShow(store, row, user, deps, now) {
  const today = isoDay(now);
  const details = await deps.show(row.tmdb_id);
  const fields = { next_ep: JSON.stringify(nextUp(details)), checked_at: now, note: null };
  const auto = deps.canAuto(user);
  // Rows from before My list that were only saved have no starting point: new episodes start after today's last one.
  if (!row.baseline) { row.baseline = JSON.stringify(baselineFrom(details)); fields.baseline = row.baseline; }
  let failed = false;
  if (auto && (row.start_at || 0) <= now) {
    const got = new Set(parse(row.seasons) || []);
    for (const season of startSeasons(details, deps.finished?.(row.user_id, row.tmdb_id), today).filter((n) => !got.has(n))) {
      let job = null, error = null;
      try { job = await deps.download(user, { type: 'tv', tmdbId: row.tmdb_id, season }); } catch (e) { error = e.message || String(e); }
      const some = ['added', 'have', 'queued'].some((k) => job?.[k]?.length);
      if (job?.state === 'done' && some) {
        got.add(season);
        if (job.added?.length) deps.log?.(`[watchlist] ${row.title} S${String(season).padStart(2, '0')}: on its way (My list)`);
      } else {
        failed = true;
        fields.note = error || job?.message || job?.error || 'No suitable release yet.';
      }
    }
    fields.seasons = JSON.stringify([...got].sort((a, b) => a - b));
    const tries = failed ? (row.start_tries || 0) + 1 : 0;
    fields.start_tries = tries;
    fields.start_at = failed ? now + retryDelay(tries) : 0;
  } else if (auto && row.start_tries) { failed = true; fields.note = row.note; } // a season to try again later
  if (auto) {
    const baseline = parse(row.baseline) || { season: 0, episode: 0 };
    const last = details?.last_episode_to_air;
    for (let n = Math.max(1, baseline.season); last && n <= last.season_number; n++) {
      const season = await deps.season(row.tmdb_id, n);
      const eps = (season?.episodes || []).map((e) => ({ season: n, episode: e.episode_number, airDate: e.air_date }));
      for (const e of airedAfter(eps, baseline, today)) store.addEpisode(row.user_id, row.tmdb_id, e.season, e.episode, e.airDate);
    }
    const pending = store.pendingEpisodes(row.user_id, row.tmdb_id, now);
    for (const season of [...new Set(pending.map((e) => e.season))]) {
      const list = pending.filter((e) => e.season === season);
      let job = null, error = null;
      try { job = await deps.download(user, { type: 'tv', tmdbId: row.tmdb_id, season, episodes: list.map((e) => e.episode) }); } catch (e) { error = e.message || String(e); }
      const added = new Set((job?.added || []).flatMap((a) => (a.episodes?.length ? a.episodes : [a.episode])));
      const already = new Set([...(job?.have || []), ...(job?.queued || [])]);
      const reasons = new Map((job?.unavailable || []).map((u) => [u.episode, u.reason]));
      for (const ep of list) {
        if (added.has(ep.episode)) store.markEpisode(ep, { state: 'got', got_at: now, seen: 0, note: null });
        else if (already.has(ep.episode)) store.markEpisode(ep, { state: 'got', got_at: now, seen: 1, note: null }); // you got it yourself
        else {
          const tries = ep.tries + 1;
          const old = ep.air_date && (now - Date.parse(`${ep.air_date}T00:00:00Z`)) > GIVE_UP_DAYS * DAY;
          const note = reasons.get(ep.episode) || error || job?.message || 'Not found yet.';
          store.markEpisode(ep, old ? { state: 'missed', tries, note } : { tries, note, check_at: now + retryDelay(tries) });
        }
      }
      if (added.size) deps.log?.(`[watchlist] ${row.title} S${String(season).padStart(2, '0')}: ${added.size} new episode${added.size === 1 ? '' : 's'} downloading`);
    }
  }
  const waiting = auto ? store.waitingCount(row.user_id, row.tmdb_id) : 0;
  fields.state = waiting || failed ? 'looking' : 'waiting';
  fields.check_at = now + (waiting || failed ? HOUR : SHOW_EVERY);
  store.patch(row, fields);
}
