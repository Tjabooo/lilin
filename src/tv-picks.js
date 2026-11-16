// Live TV picks: the server downloads a few trending films and shows by itself, so the channels have something
// new on, like a real TV station. Nobody asked for them, so they sit in nobody's library: they air on the
// channels (and on Fresh, the channel for what's new) and anyone who likes one keeps it with Add to library.
//
// A round runs every few hours. It sees how the picks it started are getting on, makes room (the oldest picks
// nobody kept go first, and any pick older than MAX_AGE), then starts at most a couple of new ones while the
// total stays under the owner's cap (LIVE_TV_PICKS_GB) and the media drive keeps a healthy reserve.
//
// What to pick: TMDB's trending films and shows (this week and today), drawn at random with the top of the list
// more likely, films and shows taking turns. Films must be out to stream or buy; a show gets its first season
// (at most its first EPISODES episodes), because a first season is how you find something new. Anything already
// on the server, picked before or tried lately is skipped. Reality, talk, news and soap shows never air.
import fs from 'node:fs';
import path from 'node:path';

const HOUR = 3600 * 1000, DAY = 24 * HOUR, GB = 1024 ** 3;
export const ROUND_EVERY = 3 * HOUR;
export const MAX_AGE = 60 * DAY;          // a pick nobody kept leaves after this, cap or not
export const RETRY_AFTER = 30 * DAY;      // a title that couldn't be found is tried again after this
export const IN_FLIGHT = 3;               // picks searching or downloading at once (people's downloads come first)
export const PER_ROUND = 2;
export const EPISODES = 10;               // a long first season: just its start
export const ESTIMATE = { movie: 12 * GB, tv: 25 * GB }; // what a new pick will probably take
export const MAX_BYTES = { movie: 16 * GB, tv: 4 * GB }; // per film / per episode
export const STALLED = 3 * DAY;           // a download that hasn't finished by then is given up
export const SKIP_GENRES = new Set([10763, 10764, 10766, 10767]); // news, reality, soap, talk
const LISTS = [['movie', '/trending/movie/week', 2], ['movie', '/trending/movie/day', 1], ['tv', '/trending/tv/week', 2], ['tv', '/trending/tv/day', 1]];

// Trending lists -> candidates, best rank first: [{ type, id, rank, title }]. Duplicates keep their best rank.
export function candidates(lists) {
  const best = new Map();
  for (const { type, results } of lists) {
    (results || []).forEach((r, rank) => {
      if (!r?.id || r.adult || (r.genre_ids || []).some((g) => SKIP_GENRES.has(g))) return;
      if (r.media_type && r.media_type !== type) return;
      const key = `${type}:${r.id}`;
      const have = best.get(key);
      if (!have || rank < have.rank) best.set(key, { type, id: r.id, rank, title: r.title || r.name || '' });
    });
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

// One of the candidates at random, the top of the list more likely (weight 1/sqrt(rank+1)). rand: [0, 1).
export function draw(list, rand = Math.random) {
  if (!list.length) return null;
  const weights = list.map((c) => 1 / Math.sqrt(c.rank + 1));
  let at = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { at -= weights[i]; if (at < 0) return list[i]; }
  return list.at(-1);
}

// The first season and which of its episodes: the whole season (pack friendly) or its first EPISODES.
export function firstSeason(details) {
  const seasons = (details?.seasons || []).filter((s) => s.season_number >= 1 && s.episode_count > 0);
  const first = seasons.sort((a, b) => a.season_number - b.season_number)[0];
  if (!first) return null;
  const count = first.episode_count;
  return { season: first.season_number, episodes: count > EPISODES ? Array.from({ length: EPISODES }, (_, i) => i + 1) : null };
}

// deps: { file, capBytes, now?, rand?, tmdb(endpoint, params), filmOut(details) -> { out },
//   onServer() -> Set of 'movie:<id>' / 'tv:<id>' already on the server or downloading,
//   start(pick, details) -> job id (a smart download with nobody's name on it; its torrents come back via noteHash),
//   job(id) -> { state, added: [] } | null, torrents(hashes) -> [{ hash, progress, size, state, added_on }],
//   sizeOf(key) -> bytes | null (on disk), held(key) -> someone has it in their library,
//   forget(key) (the file goes: markDeleting), dropTorrent(hash) (delete with its files), freeBytes() -> media drive,
//   reserveBytes, log }
export function createTvPicks(deps) {
  const now = deps.now || Date.now;
  const log = deps.log || (() => {});
  let data = { picks: [], tried: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(deps.file, 'utf8'));
    if (Array.isArray(saved.picks)) data.picks = saved.picks;
    if (saved.tried && typeof saved.tried === 'object') data.tried = saved.tried;
  } catch { /* first run */ }
  const byHash = new Map();
  const index = () => { byHash.clear(); for (const p of data.picks) for (const h of p.hashes || []) byHash.set(h, p); };
  index();
  const keys = new Set();
  const indexKeys = () => { keys.clear(); for (const p of data.picks) if (p.state !== 'gone') for (const k of p.keys || []) keys.add(k); };
  indexKeys();

  function save() {
    if (!deps.file) return;
    try {
      fs.mkdirSync(path.dirname(deps.file), { recursive: true });
      fs.writeFileSync(`${deps.file}.tmp`, JSON.stringify(data));
      fs.renameSync(`${deps.file}.tmp`, deps.file);
    } catch (e) { log(`[tv-picks] couldn't save: ${e.message}`); }
  }

  const live = (p) => p.state !== 'gone' && p.state !== 'failed';
  const label = (p) => `${p.title}${p.season != null ? ` S${String(p.season).padStart(2, '0')}` : ''}`;

  // A torrent one of the picks' jobs just added.
  function noteHash(pickId, hash) {
    const p = data.picks.find((x) => x.id === pickId);
    if (!p || !hash) return;
    hash = hash.toLowerCase();
    if (!p.hashes.includes(hash)) p.hashes.push(hash);
    byHash.set(hash, p);
    if (p.state === 'searching') p.state = 'downloading';
    save();
  }
  const ownsHash = (hash) => byHash.has(String(hash || '').toLowerCase());
  // Videos of a pick's torrent that have arrived (server.js tracks them so nobody's library adopts them).
  function noteFiles(hash, list) {
    const p = byHash.get(String(hash || '').toLowerCase());
    if (!p) return;
    let changed = false;
    for (const k of list) if (k && !p.keys.includes(k)) { p.keys.push(k); keys.add(k); changed = true; }
    if (changed) save();
  }
  const isPick = (key) => keys.has(key);

  // Bytes the picks take: their files nobody kept, plus what their downloads will take.
  function usage(torrents) {
    let bytes = 0;
    for (const p of data.picks) {
      if (!live(p)) continue;
      if (p.state === 'downloading') {
        bytes += (p.hashes.map((h) => torrents.get(h)?.size || 0).reduce((a, b) => a + b, 0)) || ESTIMATE[p.type];
        continue;
      }
      if (p.state === 'searching') { bytes += ESTIMATE[p.type]; continue; }
      for (const k of p.keys) if (!deps.held(k)) bytes += deps.sizeOf(k) || 0;
    }
    return bytes;
  }

  async function progress(torrents) {
    const t = now();
    for (const p of data.picks) {
      if (p.state === 'searching') {
        const job = deps.job(p.job);
        // A restart forgets jobs; a job that finished without adding anything found nothing worth having.
        if (!job || job.state !== 'running') {
          if (p.hashes.length) p.state = 'downloading';
          else { p.state = 'failed'; p.why = job?.message || job?.error || 'nothing found'; log(`[tv-picks] ${label(p)}: ${p.why}`); }
        }
      }
      if (p.state === 'downloading') {
        const mine = p.hashes.map((h) => torrents.get(h)).filter(Boolean);
        const finished = mine.every((x) => x.progress >= 1);
        if (finished) { p.state = 'ready'; p.ready = t; log(`[tv-picks] ${label(p)}: ready`); continue; }
        if (t - p.at > STALLED) {
          for (const x of mine) if (x.progress < 1) await Promise.resolve(deps.dropTorrent(x.hash)).catch(() => {});
          p.state = p.keys.length ? 'ready' : 'failed';
          p.why = 'too slow';
          log(`[tv-picks] ${label(p)}: gave up on a slow download`);
        }
      }
    }
  }

  function evict(torrents) {
    const t = now();
    let used = usage(torrents);
    const room = deps.capBytes;
    const old = data.picks.filter((p) => p.state === 'ready').sort((a, b) => a.at - b.at);
    for (const p of old) {
      if (used <= room && t - p.at < MAX_AGE) continue;
      let freed = 0;
      for (const k of p.keys) {
        if (deps.held(k)) continue; // someone kept it: it's theirs now
        freed += deps.sizeOf(k) || 0;
        deps.forget(k);
        keys.delete(k);
      }
      used -= freed;
      p.state = 'gone'; p.gone = t;
      log(`[tv-picks] ${label(p)}: removed (${Math.round(freed / GB)} GB freed)`);
    }
    // Long gone picks are only remembered by `tried`.
    data.picks = data.picks.filter((p) => p.state !== 'gone' && p.state !== 'failed' ? true : t - (p.gone || p.at) < RETRY_AFTER);
    index();
    return used;
  }

  async function pickNew(used) {
    const inFlight = data.picks.filter((p) => p.state === 'searching' || p.state === 'downloading').length;
    let slots = Math.min(PER_ROUND, IN_FLIGHT - inFlight);
    if (slots <= 0) return 0;
    const lists = [];
    for (const [type, endpoint, pages] of LISTS) {
      for (let page = 1; page <= pages; page++) {
        try { lists.push({ type, results: (await deps.tmdb(endpoint, { page }))?.results || [] }); } catch (e) { log(`[tv-picks] ${endpoint}: ${e.message}`); }
      }
    }
    const t = now();
    const here = await Promise.resolve(deps.onServer()).catch(() => new Set());
    const taken = new Set(data.picks.map((p) => `${p.type}:${p.tmdbId}`));
    let pool = candidates(lists).filter((c) => {
      const key = `${c.type}:${c.id}`;
      return !here.has(key) && !taken.has(key) && !(t - (data.tried[key] || 0) < RETRY_AFTER);
    });
    let started = 0;
    for (let tries = 0; slots > 0 && pool.length && tries < 12; tries++) {
      // Films and shows take turns: the type with fewer live picks goes first.
      const count = (type) => data.picks.filter((p) => live(p) && p.type === type).length;
      const want = count('movie') <= count('tv') ? 'movie' : 'tv';
      const ofType = pool.filter((c) => c.type === want);
      const c = draw(ofType.length ? ofType : pool, deps.rand);
      pool = pool.filter((x) => x !== c);
      const key = `${c.type}:${c.id}`;
      if (used + ESTIMATE[c.type] > deps.capBytes) continue;
      const free = await Promise.resolve(deps.freeBytes(c.type)).catch(() => Infinity);
      if (free - ESTIMATE[c.type] < (deps.reserveBytes ?? 0)) { log('[tv-picks] the media drive is too full for more picks'); break; }
      data.tried[key] = t;
      let details;
      try { details = await deps.tmdb(`/${c.type}/${c.id}`, c.type === 'movie' ? { append_to_response: 'release_dates' } : {}); } catch { continue; }
      if (!details || details.adult || (details.genres || []).some((g) => SKIP_GENRES.has(g.id))) continue;
      if (c.type === 'movie' && !deps.filmOut(details).out) continue;
      const season = c.type === 'tv' ? firstSeason(details) : null;
      if (c.type === 'tv' && !season) continue;
      const pick = { id: `${key}:${t}`, type: c.type, tmdbId: c.id, title: String((c.type === 'tv' ? details.name : details.title) || c.title),
        season: season?.season ?? null, episodes: season?.episodes || null, at: t, state: 'searching', job: null, hashes: [], keys: [] };
      data.picks.push(pick);
      try { pick.job = await deps.start(pick, details); } catch (e) {
        pick.state = 'failed'; pick.why = e.message; log(`[tv-picks] ${label(pick)}: ${e.message}`); continue;
      }
      log(`[tv-picks] picked ${label(pick)}${pick.episodes ? ` E01-E${String(EPISODES).padStart(2, '0')}` : ''} (trending #${c.rank + 1})`);
      used += ESTIMATE[c.type];
      slots--; started++;
    }
    return started;
  }

  let busy = false;
  async function round() {
    if (busy || !(deps.capBytes > 0)) return;
    busy = true;
    try {
      const hashes = data.picks.flatMap((p) => (live(p) ? p.hashes : []));
      const torrents = new Map((hashes.length ? await deps.torrents(hashes) : []).map((x) => [x.hash.toLowerCase(), x]));
      await progress(torrents);
      const used = evict(torrents);
      await pickNew(used);
    } catch (e) {
      log(`[tv-picks] ${e.message}`);
    } finally {
      indexKeys();
      save();
      busy = false;
    }
  }

  // For the owner: what the picks are and what they take.
  function summary() {
    const list = data.picks.filter(live).sort((a, b) => b.at - a.at);
    let bytes = 0;
    for (const p of list) if (p.state === 'ready') for (const k of p.keys) if (!deps.held(k)) bytes += deps.sizeOf(k) || 0;
    return { cap: deps.capBytes, bytes, picks: list.map((p) => ({ type: p.type, tmdbId: p.tmdbId, title: p.title, season: p.season, state: p.state, at: p.at })) };
  }

  return { round, noteHash, noteFiles, ownsHash, isPick, summary, data: () => data };
}
