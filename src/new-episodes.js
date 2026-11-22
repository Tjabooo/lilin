// New episodes this week: running series that just put out an episode, like a weekly show mid-season, or a
// season that just dropped. Replaces TMDB's /tv/on_the_air, which ranks by popularity alone and is mostly
// daily talk shows, soaps and news with an episode *coming* in the next week.
//
// A show makes the list when its latest aired episode (TMDB last_episode_to_air) is at most EPISODE_DAYS old,
// or the season it's in started at most SEASON_DAYS ago (a whole season out at once, Netflix-style).
// Each item carries `fresh`: { kind: 'episode' | 'season' | 'series', season, episode, date } for the card's
// New tag and its "S3 · E5" line.
//
// Ranking (tested in tests/new-episodes.test.mjs):
//   hype    = ln(1 + popularity) / ln(1 + REF_POPULARITY)
//   recency = 0.5 ^ (days since the latest episode / HALF_LIFE_DAYS)
//   score   = hype³ × recency
// Titles with hype under HIDE_BELOW are left out. Built in the background and cached like Coming soon.

export const EPISODE_DAYS = 7;    // an episode counts as new for a week
export const SEASON_DAYS = 30;    // a new season or series for a month
export const HALF_LIFE_DAYS = 4;
export const REF_POPULARITY = 60;
export const HIDE_BELOW = 0.45;
export const MAX_SEASON_EPISODES = 40; // daily shows (hundreds of episodes a season) aren't what this row is for
export const PAGE_SIZE = 20;
const DETAIL_TTL = 6 * 3600 * 1000;
const LIST_TTL = 2 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const DAY = 86400000;
const SKIP_TV_GENRES = '10762,10763,10764,10766,10767'; // Kids, News, Reality, Soap, Talk
const KEYS = new Set(['on-air', 'new-episodes']);

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const daysSince = (iso, today) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY);

export const hype = (popularity) => Math.log1p(Math.max(0, Number(popularity) || 0)) / Math.log1p(REF_POPULARITY);
export const score = (item, today) => hype(item.popularity) ** 3 * 0.5 ** (Math.max(0, daysSince(item.fresh.date, today)) / HALF_LIFE_DAYS);

// What's new about a show today, from its TMDB details, or null.
export function freshness(details, today) {
  const last = details?.last_episode_to_air;
  if (!last || !isIso(last.air_date) || last.season_number < 1) return null;
  const age = daysSince(last.air_date, today);
  if (age < 0 || age > SEASON_DAYS) return null;
  const season = (details.seasons || []).find((s) => s.season_number === last.season_number);
  if ((season?.episode_count || last.episode_number) > MAX_SEASON_EPISODES) return null;
  const start = isIso(season?.air_date) ? season.air_date : last.episode_number === 1 ? last.air_date : null;
  const seasonAge = start ? daysSince(start, today) : Infinity;
  const fresh = { season: last.season_number, episode: last.episode_number, date: last.air_date };
  if (seasonAge >= 0 && seasonAge <= SEASON_DAYS) return { ...fresh, kind: last.season_number === 1 ? 'series' : 'season' };
  return age <= EPISODE_DAYS ? { ...fresh, kind: 'episode' } : null;
}

export function rank(items, today) {
  return items.filter((i) => i?.poster && i.fresh && hype(i.popularity) >= HIDE_BELOW)
    .map((i) => ({ i, s: score(i, today) }))
    .sort((a, b) => b.s - a.s || b.i.fresh.date.localeCompare(a.i.fresh.date))
    .map((x) => x.i);
}

async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i]).catch(() => null); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

// deps as in coming-soon.js: tmdb(endpoint, params) raw, listTmdb(endpoint, params) cached in the viewer's language,
// mapTitle(x, type), language() (cache key), now().
export function createNewEpisodes({ tmdb, listTmdb, mapTitle, language = () => 'en', now = Date.now, log = () => {} }) {
  const details = new Map(); // tv id -> { at, fresh }
  const lists = new Map();   // language -> { at, ready, building }

  async function freshFor(id, today) {
    const hit = details.get(id);
    if (hit && now() - hit.at < DETAIL_TTL) return hit.fresh;
    const fresh = freshness(await tmdb(`/tv/${id}`), today);
    details.set(id, { at: now(), fresh });
    if (details.size > 2000) details.delete(details.keys().next().value);
    return fresh;
  }

  const pages = async (endpoint, params, count) => {
    const all = await Promise.all(Array.from({ length: count }, (_, i) => listTmdb(endpoint, { ...params, page: String(i + 1) }).catch(() => null)));
    return all.flatMap((d) => d?.results || []).filter((x) => x && !x.adult);
  };

  async function build() {
    const today = isoDay(now());
    // Shows with an episode in the last month, the most popular first; trending shows on top in case TMDB's
    // air_date filter misses one.
    const [aired, trending] = await Promise.all([
      pages('/discover/tv', { 'air_date.gte': isoDay(now() - SEASON_DAYS * DAY), 'air_date.lte': today, sort_by: 'popularity.desc',
        without_genres: SKIP_TV_GENRES, 'vote_count.gte': '10', include_adult: 'false' }, 4),
      pages('/trending/tv/week', {}, 1),
    ]);
    const seen = new Set();
    const shows = [...trending, ...aired].filter((x) => x.poster_path && !seen.has(x.id) && seen.add(x.id)
      && !(x.genre_ids || []).some((g) => SKIP_TV_GENRES.split(',').includes(String(g))));
    const fresh = await pool(shows, 6, (x) => freshFor(x.id, today));
    return { tv: rank(shows.map((x, i) => fresh[i] && { ...mapTitle(x, 'tv'), fresh: fresh[i] }).filter(Boolean), today), today };
  }

  function snapshot() {
    const key = language();
    let entry = lists.get(key);
    if (!entry) { entry = { at: 0, ready: null, building: null }; lists.set(key, entry); }
    if (now() - entry.at >= LIST_TTL && !entry.building) {
      entry.building = build().then((v) => { entry.ready = v; entry.at = now(); return v; }, (err) => {
        log(`[new-episodes] ${err.message}`);
        entry.at = now() - LIST_TTL + RETRY_MS;
        throw err;
      }).finally(() => { entry.building = null; });
      entry.building.catch(() => {});
    }
    return entry.ready ? Promise.resolve(entry.ready) : entry.building || Promise.reject(new Error('New episodes aren’t available right now.'));
  }

  async function list(key, page = 1, { wait = 0 } = {}) {
    if (!KEYS.has(key)) return null;
    const work = snapshot().then((s) => s.tv);
    const all = wait ? await Promise.race([work, new Promise((r) => setTimeout(r, wait, null))]) : await work;
    if (!all) return null;
    return { results: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, totalPages: Math.max(1, Math.ceil(all.length / PAGE_SIZE)) };
  }

  return { list, warm: () => snapshot().catch(() => null), handles: (key) => KEYS.has(key) };
}
