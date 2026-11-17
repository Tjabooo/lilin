// Coming soon: films and shows that come out in the next few months, the closest and most talked-about first.
//
// Films: the cinema date in this server's region (TMDB_REGION, else the country in TMDB_LANG) when that is
// still ahead, else the digital or disc date once the cinema run is over. A film Lilin can already get
// (watchlist.js filmOut) isn't coming any more, and one that's in cinemas with no home release date yet
// belongs to "In cinemas now". Shows: brand-new series (their first air date) and new seasons of running
// shows (next_episode_to_air is an episode 1, or TMDB lists a dated season that hasn't started).
//
// Ranking (rank/score, tested in tests/coming-soon.test.mjs):
//   hype      = ln(1 + popularity) / ln(1 + REF_POPULARITY[kind])   1 = typical buzz for that kind of release
//   closeness = 0.5 ^ (days until it's out / HALF_LIFE_DAYS)          halves every month
//   score     = hype³ × closeness, × DEMOTE_FACTOR when hype < DEMOTE_BELOW
// Titles with hype under HIDE_BELOW (or no poster) are left out, so the row isn't a wall of obscure premieres.
// TMDB's popularity runs on very different scales: a hyped new series sits around 10 while a big film sits at
// 100+, so each kind is measured against its own reference.
//
// The lists are built in the background and cached (events per title for EVENT_TTL, the ranked lists per
// language for LIST_TTL), so Discover never waits on a few hundred TMDB calls.
import { filmOut } from './watchlist.js';

export const HORIZON_DAYS = 120;        // how far ahead Coming soon looks
export const HALF_LIFE_DAYS = 30;
export const REF_POPULARITY = { cinema: 60, digital: 60, disc: 60, premiere: 8, season: 80 };
export const HIDE_BELOW = 0.35;
export const DEMOTE_BELOW = 0.5;
export const DEMOTE_FACTOR = 0.2;
export const PAGE_SIZE = 20;
const EVENT_TTL = 12 * 3600 * 1000;
const LIST_TTL = 3 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const DAY = 86400000;
const SKIP_TV_GENRES = '10763,10764,10766,10767'; // News, Reality, Soap, Talk
const KEYS = { 'coming-soon': 'all', 'coming-soon-movie': 'movie', 'coming-soon-tv': 'tv', upcoming: 'movie' }; // upcoming: the old Films row
export const comingSoonKind = (key) => KEYS[key] || null;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const daysUntil = (iso, today) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);

export function hype(popularity, kind) {
  return Math.log1p(Math.max(0, Number(popularity) || 0)) / Math.log1p(REF_POPULARITY[kind] || 60);
}
export const closeness = (days) => 0.5 ** (Math.max(0, days) / HALF_LIFE_DAYS);
export function score(item, today) {
  const h = hype(item.popularity, item.soon.kind);
  const s = h ** 3 * closeness(daysUntil(item.soon.date, today));
  return h < DEMOTE_BELOW ? s * DEMOTE_FACTOR : s;
}
// What makes the list: dated from today to the horizon, with a poster, not obscure.
export function keep(item, today) {
  if (!item?.poster || !item.soon || !isIso(item.soon.date)) return false;
  const days = daysUntil(item.soon.date, today);
  return days >= 0 && days <= HORIZON_DAYS && hype(item.popularity, item.soon.kind) >= HIDE_BELOW;
}
export function rank(items, today) {
  return items.filter((i) => keep(i, today))
    .map((i) => ({ i, s: score(i, today) }))
    .sort((a, b) => b.s - a.s || a.i.soon.date.localeCompare(b.i.soon.date) || String(a.i.title).localeCompare(String(b.i.title)))
    .map((x) => x.i);
}

// The next release of a film, or null when it's out already, in cinemas now, or has no date.
// Cinema: types 2 (limited) and 3 (theatrical); the region's own date wins over everyone else's.
export function filmEvent(details, today, region) {
  if (!details || details.status === 'Canceled') return null;
  if (filmOut(details, today).out) return null;
  let local = null, anywhere = null;
  for (const country of details.release_dates?.results || []) {
    for (const r of country.release_dates || []) {
      if (r.type !== 2 && r.type !== 3) continue;
      const date = String(r.release_date || '').slice(0, 10);
      if (!isIso(date)) continue;
      if (country.iso_3166_1 === region && (!local || date < local)) local = date;
      if (!anywhere || date < anywhere) anywhere = date;
    }
  }
  const cinema = local || anywhere || (isIso(details.release_date) ? details.release_date : null);
  if (cinema && cinema > today) return { date: cinema, kind: 'cinema', local: Boolean(local) };
  const rel = filmOut(details, today);
  if ((rel.kind === 'digital' || rel.kind === 'disc') && rel.date > today) return { date: rel.date, kind: rel.kind };
  return null;
}

// A show's next premiere: a new series, or a new season of one that has aired before. Mid-season episodes don't count.
export function showEvent(details, today) {
  if (!details || details.status === 'Canceled') return null;
  const aired = details.last_episode_to_air;
  const kind = (season) => (season === 1 && !aired ? 'premiere' : 'season');
  const next = details.next_episode_to_air;
  if (next && next.season_number >= 1 && next.episode_number === 1 && isIso(next.air_date) && next.air_date >= today) {
    return { date: next.air_date, kind: kind(next.season_number), season: next.season_number };
  }
  if (next && next.episode_number > 1) return null; // mid-season: that's New episodes this week
  const after = aired?.season_number || 0;
  const season = (details.seasons || [])
    .filter((s) => s.season_number > after && s.season_number >= 1 && isIso(s.air_date) && s.air_date >= today)
    .sort((a, b) => a.air_date.localeCompare(b.air_date))[0];
  if (season) return { date: season.air_date, kind: kind(season.season_number), season: season.season_number };
  if (!aired && isIso(details.first_air_date) && details.first_air_date >= today) return { date: details.first_air_date, kind: 'premiere', season: 1 };
  return null;
}

// Runs `fn` over `list` with at most `limit` at a time.
async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i]).catch(() => null); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

// deps: tmdb(endpoint, params) raw and language-independent (dates only), listTmdb(endpoint, params) cached and in
// the viewer's language, mapTitle(x, type), region (two letters), language() (cache key), now().
export function createComingSoon({ tmdb, listTmdb, mapTitle, region = 'US', language = () => 'en', now = Date.now, log = () => {} }) {
  const events = new Map(); // movie:1 / tv:2 -> { at, event }
  const lists = new Map();  // language -> { at, promise of { movie: [...], tv: [...] } }

  async function eventFor(type, id, today) {
    const key = `${type}:${id}`;
    const hit = events.get(key);
    if (hit && now() - hit.at < EVENT_TTL) return hit.event;
    const d = type === 'movie'
      ? await tmdb(`/movie/${id}`, { append_to_response: 'release_dates' })
      : await tmdb(`/tv/${id}`);
    const event = type === 'movie' ? filmEvent(d, today, region) : showEvent(d, today);
    events.set(key, { at: now(), event });
    if (events.size > 2000) events.delete(events.keys().next().value);
    return event;
  }

  const pages = async (endpoint, params, count) => {
    const all = await Promise.all(Array.from({ length: count }, (_, i) => listTmdb(endpoint, { ...params, page: String(i + 1) }).catch(() => null)));
    return all.flatMap((d) => d?.results || []).filter((x) => x && !x.adult);
  };
  const unique = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.id) && seen.add(x.id)); };

  async function build() {
    const today = isoDay(now());
    const until = isoDay(now() + HORIZON_DAYS * DAY);
    const window = { 'release_date.gte': today, 'release_date.lte': until, sort_by: 'popularity.desc', include_adult: 'false' };
    // Films: cinema in this region, cinema anywhere, digital or disc anywhere. Each film's real dates come from its details.
    const [localCinema, cinema, home, premieres, airing] = await Promise.all([
      pages('/discover/movie', { ...window, region, with_release_type: '2|3' }, 2),
      pages('/discover/movie', { ...window, with_release_type: '2|3' }, 2),
      pages('/discover/movie', { ...window, with_release_type: '4|5' }, 2),
      pages('/discover/tv', { 'first_air_date.gte': today, 'first_air_date.lte': until, sort_by: 'popularity.desc', without_genres: SKIP_TV_GENRES }, 3),
      // Shows with an episode coming up: running seasons and new ones. Details tell them apart.
      pages('/discover/tv', { 'air_date.gte': today, 'air_date.lte': until, sort_by: 'popularity.desc', without_genres: SKIP_TV_GENRES }, 5),
    ]);
    const films = unique([...localCinema, ...cinema, ...home]).filter((x) => x.poster_path);
    const filmEvents = await pool(films, 6, (x) => eventFor('movie', x.id, today));
    const movie = films.map((x, i) => filmEvents[i] && { ...mapTitle(x, 'movie'), soon: filmEvents[i] }).filter(Boolean);
    // New series come with their date; returning shows need a look at what airs next.
    const fresh = unique(premieres).filter((x) => x.poster_path && isIso(x.first_air_date));
    const freshIds = new Set(fresh.map((x) => x.id));
    const running = unique(airing).filter((x) => x.poster_path && !freshIds.has(x.id));
    const showEvents = await pool(running, 6, (x) => eventFor('tv', x.id, today));
    const tv = [
      ...fresh.map((x) => ({ ...mapTitle(x, 'tv'), soon: { date: x.first_air_date, kind: 'premiere', season: 1 } })),
      ...running.map((x, i) => showEvents[i] && { ...mapTitle(x, 'tv'), soon: showEvents[i] }).filter(Boolean),
    ];
    return { movie: rank(movie, today), tv: rank(tv, today), today };
  }

  // The ranked lists in the viewer's language. Past LIST_TTL the old lists keep serving while new ones are built;
  // a failed build is retried after RETRY_MS.
  function snapshot() {
    const key = language();
    let entry = lists.get(key);
    if (!entry) { entry = { at: 0, ready: null, building: null }; lists.set(key, entry); }
    if (now() - entry.at >= LIST_TTL && !entry.building) {
      entry.building = build().then((v) => { entry.ready = v; entry.at = now(); return v; }, (err) => {
        log(`[coming-soon] ${err.message}`);
        entry.at = now() - LIST_TTL + RETRY_MS;
        throw err;
      }).finally(() => { entry.building = null; });
      entry.building.catch(() => {}); // nobody may be waiting for it
    }
    return entry.ready ? Promise.resolve(entry.ready) : entry.building || Promise.reject(new Error('Coming soon isn’t available right now.'));
  }

  // Everything coming, ranked: kind 'all' merges films and shows by score.
  async function items(kind = 'all') {
    const s = await snapshot();
    if (kind === 'movie') return s.movie;
    if (kind === 'tv') return s.tv;
    return [...s.movie, ...s.tv].map((i) => ({ i, s: score(i, s.today) })).sort((a, b) => b.s - a.s).map((x) => x.i);
  }

  // A Discover list (row, See all on the TV apps). wait: give up after this many ms and return null (the row is skipped).
  async function list(key, page = 1, { wait = 0 } = {}) {
    const kind = comingSoonKind(key);
    if (!kind) return null;
    const work = items(kind);
    const all = wait ? await Promise.race([work, new Promise((r) => setTimeout(r, wait, null))]) : await work;
    if (!all) return null;
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    return { results: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, totalPages };
  }

  return { items, list, warm: () => snapshot().catch(() => null), handles: (key) => Boolean(comingSoonKind(key)) };
}
