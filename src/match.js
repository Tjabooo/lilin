// Pick together: for nights when nobody can agree on what to watch. One person starts a pick and sends it to
// the others (the Watch Together invite tiles and notifications, or a link). Everyone swipes through the same
// stack of posters, yes or no, and as soon as everyone in the pick has said yes to the same title it's a
// match, with Watch together (now or planned) when the film is on the server.
//
// The stack isn't limited to what's on the server. It's dealt from the people in the pick:
// - Taste: each person's own history seeds TMDB's recommendations (watch_log: films and shows they watched
//   for a while or finished; a thumbs up counts most; recent counts more). Titles recommended from several
//   people's histories come first, since those are the ones a group can agree on, and the genres each person
//   watches lift a title a little.
// - Not enough history (a new account, the shared Home network one): the household's Popular on Lilin
//   stands in for that person's taste, and well-loved crowd-pleasers fill the stack. Cards are spread over
//   genres, so the first swipes say something.
// - The stack learns while you swipe: each new hand (20 cards) is scored again with the genres of what each
//   person said yes to, and brings in TMDB's recommendations for titles that got a yes. Who said yes to what
//   is never shown to anyone; only matches are shared.
// - Titles on the server get a small lift and an On server mark (they can be watched together right away).
// - Filters: films or shows, a genre, a longest running time (films), leave out what anyone in the pick has
//   seen (on by default), only what's on the server.
//
// Swipes don't count as thumbs. Restricted people (accounts.isRestricted) can start a pick and join one by its
// link, but aren't offered as invitees and can't send invites. Tables in .lilin.db: match_picks, match_members,
// match_cards, match_votes, match_hits. A pick goes 12 hours after its last swipe.
import crypto from 'node:crypto';
import { database, userById, isRestricted, listUsers } from './accounts.js';
import { popular } from './social.js';
import { friendIds } from './friends.js';
import { currentLanguage } from './i18n.js';

const DAY = 86400000;
export const HAND = 20;           // cards dealt at a time
export const LOW = 8;             // a new hand is dealt when someone has fewer cards left than this
export const MAX_CARDS = 300;     // the most one pick ever deals
const MAX_MEMBERS = 12;           // like a Watch Together room
const KEEP_MS = 12 * 3600 * 1000; // a pick goes this long after the last swipe
const PER_DAY = 20;               // picks one person can start in 24 hours (each costs TMDB requests)
const OPEN_PER_HOST = 3;
const SEEDS = 6;                  // titles from each person's history asked for recommendations
const MIN_SEEDS = 3;              // fewer than this: the household's favourites stand in
const SEEN_SECONDS = 1200;        // twenty minutes of something counts as having seen it
const POOL_LOW = 40;              // fewer candidates than this left: look for more
const POOL_MAX = 400;
const INVITE_GAP = 120000;        // each person is invited once every two minutes per pick
const CACHE_TTL = 6 * 3600 * 1000;
const ID = /^[A-Za-z0-9_-]{22}$/;
export const LENGTHS = [0, 100, 120, 150]; // the longest running time for films, minutes (0 = any)
const JUNK_TV = [10763, 10764, 10766, 10767]; // news, reality, soap, talk: not what a pick is for

// The genre filter: one key, TMDB's genre ids for films and for shows (shows have fewer, merged genres).
// public/match.js has the same keys with their names.
export const GENRES = {
  action: { movie: [28], tv: [10759] },
  comedy: { movie: [35], tv: [35] },
  drama: { movie: [18], tv: [18] },
  thriller: { movie: [53], tv: [9648, 80] },
  horror: { movie: [27] },
  scifi: { movie: [878], tv: [10765] },
  fantasy: { movie: [14], tv: [10765] },
  romance: { movie: [10749] },
  crime: { movie: [80], tv: [80] },
  mystery: { movie: [9648], tv: [9648] },
  animation: { movie: [16], tv: [16] },
  family: { movie: [10751], tv: [10751] },
  adventure: { movie: [12], tv: [10759] },
  war: { movie: [10752], tv: [10768] },
  history: { movie: [36] },
  documentary: { movie: [99], tv: [99] },
};

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const today = () => new Date().toISOString().slice(0, 10);

// ---------- taste (pure, for the tests) ----------
// What one person's history says for a pick of `type`: seeds for recommendations (best first), what they've
// seen (watched 20 minutes or more, finished, or rated) and what they gave a thumbs down.
// history: { watched: [{ key, title, seconds, finished, at }], rated: [{ key, value, title, at }] }
export function tasteFrom({ watched = [], rated = [] } = {}, type = 'movie', now = Date.now()) {
  const seen = new Set(), disliked = new Set(), byKey = new Map();
  for (const r of rated) { seen.add(r.key); if (r.value < 0) disliked.add(r.key); }
  for (const w of watched) if (w.finished || w.seconds >= SEEN_SECONDS) seen.add(w.key);
  const prefix = `${type}:`;
  const entry = (key, title) => {
    if (!byKey.has(key)) byKey.set(key, { key, id: Number(key.slice(prefix.length)), title: title || '', w: 0, at: 0, liked: false });
    return byKey.get(key);
  };
  for (const w of watched) {
    if (!String(w.key).startsWith(prefix) || disliked.has(w.key)) continue;
    const e = entry(w.key, w.title);
    // a show is watched for hours, a film for two: an hour of each counts about the same
    e.w += (w.finished ? 1.5 : 0) + (type === 'tv' ? Math.min(w.seconds / 3600, 6) * 0.35 : Math.min(w.seconds / 3600, 2) * 0.6);
    e.at = Math.max(e.at, w.at || 0);
  }
  for (const r of rated) {
    if (!String(r.key).startsWith(prefix) || r.value < 0) continue;
    const e = entry(r.key, r.title);
    e.w += 3.5; e.liked = true; e.at = Math.max(e.at, r.at || 0); // said so out loud: counts most
    if (r.title) e.title = r.title;
  }
  const seeds = [...byKey.values()].filter((e) => e.w >= 0.5 && Number.isSafeInteger(e.id) && e.id > 0)
    .map((e) => ({ ...e, w: Math.round(e.w * (0.45 + 0.55 * Math.exp(-Math.max(0, now - e.at) / (180 * DAY))) * 100) / 100 }))
    .sort((a, b) => b.w - a.w || b.at - a.at);
  return { seeds, seen, disliked, cold: seeds.length < MIN_SEEDS };
}

// How well a candidate suits the group. people: [{ id, norm, genres: { genreId: share } }]. A candidate is
// { t: { type, rating, votes, genres }, per: { userId: taste }, src: [] }. Titles everyone could like beat
// titles one person loves: the group's average counts, the least keen person counts again, and titles
// recommended from two or more people's histories get a lift.
export function scoreCandidate(c, people, { onServer = false } = {}) {
  const t = c.t || {};
  const votes = t.votes || 0, prior = t.type === 'tv' ? 150 : 500;
  const quality = ((t.rating || 0) * votes + 6.4 * prior) / (votes + prior);
  let sum = 0, low = Infinity, fans = 0;
  for (const p of people) {
    const taste = Math.min(1.3, (c.per?.[p.id] || 0) / (p.norm || 1));
    let g = 0;
    for (const id of t.genres || []) g += p.genres?.[id] || 0;
    const v = taste + 0.5 * Math.min(1, g);
    sum += v; low = Math.min(low, v);
    if (taste > 0.05) fans++;
  }
  const n = people.length;
  const group = n ? sum / n + 0.6 * low + (n > 1 && fans > 1 ? 0.25 * (fans - 1) / (n - 1) : 0) : 0;
  const src = c.src || [];
  return Math.round((group * 2 + (quality - 6.4) * 0.8 + (onServer ? 0.35 : 0) + (src.includes('house') ? 0.15 : 0)
    + (src.includes('trend') ? 0.1 : 0)) * 1000) / 1000;
}

// Best first, but two of the same main genre in a row only when nothing else is near: the stack shows a
// spread, so the first swipes say something. Looks a few places ahead only, so the order stays close to the scores.
export function diversify(list, genreOf = (x) => x.t?.genres?.[0]) {
  const out = [], rest = [...list];
  while (rest.length) {
    const prev = out.length ? genreOf(out.at(-1)) : undefined;
    const i = Math.max(0, rest.findIndex((x, j) => j < 6 && (prev === undefined || genreOf(x) !== prev)));
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// Whether a candidate may go in the stack at all (running time is checked when it's dealt).
export function passes(c, filters, { type, onServer = false, day = today() } = {}) {
  const t = c.t || {};
  if (!t.poster || !t.id) return false;
  if (!t.date || t.date > day) return false; // nothing unreleased
  const genres = t.genres || [];
  if (filters.genre) {
    const want = GENRES[filters.genre]?.[type] || [];
    if (!genres.some((g) => want.includes(g))) return false;
  }
  if (type === 'tv' && genres.some((g) => JUNK_TV.includes(g))) return false;
  if (filters.serverOnly && !onServer) return false;
  if (!onServer && (t.votes || 0) < (type === 'tv' ? 30 : 80)) return false; // obscure and unrated
  return true;
}

// The filters a pick was started with, cleaned.
export function cleanFilters(body = {}, type = 'movie') {
  const genre = Object.hasOwn(GENRES, body.genre) && GENRES[body.genre][type] ? body.genre : '';
  const maxMinutes = type === 'movie' && LENGTHS.includes(Number(body.maxMinutes)) ? Number(body.maxMinutes) : 0;
  return { genre, maxMinutes, unseen: body.unseen !== false, serverOnly: Boolean(body.serverOnly) };
}

// Each person's genre leaning: the genres of what was recommended for them, then what they said yes to here
// (a no takes a little away). Shares that add up to 1.
export function genreLeaning(id, pool, votes = []) {
  const w = {};
  for (const c of pool) {
    const v = c.per?.[id];
    if (!v) continue;
    for (const g of c.t?.genres || []) w[g] = (w[g] || 0) + v;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const g of Object.keys(w)) w[g] = w[g] / total;
  for (const { genres = [], vote } of votes) for (const g of genres) w[g] = Math.max(0, (w[g] || 0) + (vote > 0 ? 0.6 : -0.15) / genres.length);
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const g of Object.keys(w)) w[g] = Math.round(w[g] / sum * 1000) / 1000;
  return w;
}

// ---------- the service ----------
// deps: { tmdb(endpoint, params, lang) (TMDB's raw answer; lang 'en' or 'sv'), mapTitle(raw, type),
//   serverKeys(): Promise<Set<"movie:603">> (titles on the server), hasDevice(userId), notify(ids, kind, message),
//   publish(userId) (a live "match" event to that person's pages), startRoom(user, card, { clientId, startsAt }) }
export function createMatch(deps) {
  const cache = new Map(); // `${lang}|${endpoint}|${params}` -> { at, promise }
  const dealing = new Map(); // pick id -> the deal in progress
  const invitesSent = new Map(); // `${pick}|${userId}` -> ms
  let server = { at: 0, keys: null };

  db().exec(`
    CREATE TABLE IF NOT EXISTS match_picks (
      id TEXT PRIMARY KEY,
      host_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      filters TEXT NOT NULL,
      invited TEXT NOT NULL DEFAULT '[]',
      pool TEXT NOT NULL DEFAULT '[]',
      extra TEXT NOT NULL DEFAULT '{}',
      room TEXT,
      created_at INTEGER NOT NULL,
      touched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS match_picks_host ON match_picks(host_id, created_at);
    CREATE TABLE IF NOT EXISTS match_members (
      pick_id TEXT NOT NULL REFERENCES match_picks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (pick_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS match_members_user ON match_members(user_id);
    CREATE TABLE IF NOT EXISTS match_cards (
      pick_id TEXT NOT NULL REFERENCES match_picks(id) ON DELETE CASCADE,
      pos INTEGER NOT NULL,
      title_key TEXT NOT NULL,
      card TEXT NOT NULL,
      PRIMARY KEY (pick_id, pos),
      UNIQUE (pick_id, title_key)
    );
    CREATE TABLE IF NOT EXISTS match_votes (
      pick_id TEXT NOT NULL REFERENCES match_picks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
      at INTEGER NOT NULL,
      PRIMARY KEY (pick_id, user_id, title_key)
    );
    CREATE TABLE IF NOT EXISTS match_hits (
      pick_id TEXT NOT NULL REFERENCES match_picks(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (pick_id, title_key)
    );
  `);
  cleanup();
  setInterval(cleanup, 3600 * 1000).unref?.();

  function cleanup(now = Date.now()) {
    db().prepare('DELETE FROM match_picks WHERE touched_at < ?').run(now - KEEP_MS);
  }

  // TMDB answers, kept for a few hours (a pick asks for the same recommendations and details again and again)
  function ask(endpoint, params = {}, lang = 'en') {
    const key = `${lang}|${endpoint}|${JSON.stringify(params)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.promise;
    const promise = Promise.resolve().then(() => deps.tmdb(endpoint, params, lang));
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 3000) cache.delete(cache.keys().next().value);
    return promise;
  }

  async function serverKeys() {
    if (server.keys && Date.now() - server.at < 5 * 60 * 1000) return server.keys;
    let keys = new Set();
    try { keys = new Set(await deps.serverKeys()); } catch { /* the library is busy: no marks this time */ }
    server = { at: Date.now(), keys };
    return keys;
  }

  // ---------- rows ----------
  const row = (id) => {
    if (!ID.test(String(id || ''))) return null;
    const r = db().prepare('SELECT * FROM match_picks WHERE id = ?').get(id);
    return r ? { ...r, filters: json(r.filters, {}), invited: json(r.invited, []), pool: json(r.pool, []), extra: json(r.extra, {}), room: json(r.room, null) } : null;
  };
  const pickOr404 = (id) => {
    const r = row(id);
    if (!r || r.touched_at < Date.now() - KEEP_MS) throw fail(404, 'This pick has ended. Start a new one.');
    return r;
  };
  const memberIds = (id) => db().prepare('SELECT user_id FROM match_members WHERE pick_id = ? ORDER BY joined_at').all(id).map((r) => r.user_id);
  const isMember = (id, userId) => Boolean(db().prepare('SELECT 1 FROM match_members WHERE pick_id = ? AND user_id = ?').get(id, userId));
  const cardsOf = (id) => db().prepare('SELECT pos, title_key, card FROM match_cards WHERE pick_id = ? ORDER BY pos').all(id).map((r) => json(r.card, null)).filter(Boolean);
  const touch = (id) => db().prepare('UPDATE match_picks SET touched_at = ? WHERE id = ?').run(Date.now(), id);
  const face = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar || null } : null);
  const tell = (id, except = null) => { for (const uid of memberIds(id)) if (uid !== except) deps.publish?.(uid); };

  function historyOf(userId) {
    const watched = db().prepare(`SELECT title_key AS key, MAX(title) AS title, SUM(seconds) AS seconds, MAX(finished) AS finished, MAX(last_at) AS at
      FROM watch_log WHERE user_id = ? AND title_key IS NOT NULL GROUP BY title_key`).all(userId);
    const rated = db().prepare('SELECT title_key AS key, value, title, updated_at AS at FROM ratings WHERE user_id = ?').all(userId);
    return { watched, rated };
  }

  // People who can be invited by a notification: like Watch Together, anyone with invites on and a device
  // that gets notifications, not restricted, friends first.
  function invitable(user, except = new Set()) {
    if (isRestricted(user)) return [];
    const mine = new Set(friendIds(user.id));
    return listUsers().filter((u) => u.id !== user.id && !except.has(u.id) && !u.restricted && deps.hasDevice?.(u.id) && u.settings?.pushWatch !== false)
      .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null, friend: mine.has(u.id) }))
      .sort((a, b) => Number(b.friend) - Number(a.friend));
  }

  // ---------- finding candidates ----------
  const slim = (t) => ({ id: t.id, type: t.type, title: t.title, year: t.year, poster: t.poster, rating: t.rating, votes: t.votes, genres: (t.genres || []).slice(0, 6), date: t.date });

  function crowdParams(type, filters, page, sort) {
    const genres = filters.genre ? GENRES[filters.genre]?.[type] : null;
    return {
      sort_by: sort, include_adult: 'false', page: String(page),
      'vote_average.gte': type === 'tv' ? '7.4' : '6.9',
      'vote_count.gte': sort === 'vote_count.desc' ? (type === 'tv' ? '400' : '1500') : (type === 'tv' ? '150' : '400'),
      ...(genres ? { with_genres: genres.join('|') } : {}),
      ...(type === 'tv' ? { without_genres: JUNK_TV.join(',') } : {}),
      ...(type === 'movie' && filters.maxMinutes ? { 'with_runtime.lte': String(filters.maxMinutes), 'with_runtime.gte': '60' } : {}),
      ...(sort === 'popularity.desc' ? { [type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte']: `${new Date().getFullYear() - 12}-01-01` } : {}),
    };
  }

  function houseSeeds(type) {
    try {
      return popular({ type, limit: 10 }).map((p) => ({ key: p.key, id: Number(p.key.split(':')[1]), title: '', w: 0.6, house: true }))
        .filter((s) => Number.isSafeInteger(s.id) && s.id > 0);
    } catch { return []; }
  }

  // New candidates for a pick. tastes: Map userId -> tasteFrom(); fresh: people whose history isn't in the pool
  // yet; yes: [{ key, voters }] titles that got a yes here, to ask for more like them; crowd: the page of
  // crowd-pleasers to fetch (0: none); serverTitles: on-server keys to bring in.
  async function gather(pick, { tastes, fresh = [], yes = [], crowd = 0, serverTitles = [] }) {
    const type = pick.type, out = new Map();
    const add = (raw, src) => {
      const t = deps.mapTitle(raw, type);
      if (!t?.id || raw.adult) return null;
      const key = `${type}:${t.id}`;
      let c = out.get(key);
      if (!c) out.set(key, c = { key, t: slim(t), per: {}, why: {}, src: [] });
      if (!c.src.includes(src)) c.src.push(src);
      return c;
    };
    const jobs = [];
    for (const uid of fresh) {
      const taste = tastes.get(uid);
      if (!taste) continue;
      let seeds = taste.seeds.slice(0, SEEDS);
      if (seeds.length < MIN_SEEDS) seeds = [...seeds, ...houseSeeds(type).filter((s) => !taste.seen.has(s.key) && !taste.disliked.has(s.key) && !seeds.some((x) => x.key === s.key))].slice(0, MIN_SEEDS + 1);
      for (const seed of seeds) {
        jobs.push(ask(`/${type}/${seed.id}/recommendations`, { page: '1' }).then((d) => {
          (d?.results || []).forEach((x, i) => {
            const c = add(x, seed.house ? 'house' : 'taste');
            if (!c) return;
            c.per[uid] = Math.round(((c.per[uid] || 0) + seed.w * (1 - i / 40)) * 1000) / 1000;
            if (!seed.house && seed.title && (!c.why[uid] || c.why[uid].w < seed.w)) c.why[uid] = { title: seed.title, liked: seed.liked, w: seed.w };
          });
        }).catch(() => {}));
      }
    }
    for (const { key, voters } of yes) {
      const id = Number(key.split(':')[1]);
      jobs.push(ask(`/${type}/${id}/recommendations`, { page: '1' }).then((d) => {
        (d?.results || []).forEach((x, i) => {
          const c = add(x, 'yes');
          if (c) for (const v of voters) c.per[v] = Math.round(((c.per[v] || 0) + 1.2 * (1 - i / 40)) * 1000) / 1000;
        });
      }).catch(() => {}));
    }
    if (crowd) {
      for (const sort of ['vote_count.desc', 'popularity.desc']) {
        jobs.push(ask(`/discover/${type}`, crowdParams(type, pick.filters, crowd, sort))
          .then((d) => { for (const x of d?.results || []) add(x, 'crowd'); }).catch(() => {}));
      }
      if (crowd === 1) jobs.push(ask(`/trending/${type}/week`, {}).then((d) => { for (const x of d?.results || []) add(x, 'trend'); }).catch(() => {}));
    }
    for (const key of serverTitles) {
      const id = Number(key.split(':')[1]);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      jobs.push(ask(`/${type}/${id}`, {}).then((d) => {
        if (d && !d.adult) add({ ...d, genre_ids: (d.genres || []).map((g) => g.id) }, 'server');
      }).catch(() => {}));
    }
    // eight at a time is plenty: the answers are cached, and TMDB doesn't like bursts
    for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8));
    return out;
  }

  function merge(pool, found) {
    const byKey = new Map(pool.map((c) => [c.key, c]));
    for (const c of found.values()) {
      const old = byKey.get(c.key);
      if (!old) { byKey.set(c.key, c); continue; }
      for (const [uid, v] of Object.entries(c.per)) old.per[uid] = Math.round(((old.per[uid] || 0) + v) * 1000) / 1000;
      for (const [uid, w] of Object.entries(c.why)) if (!old.why[uid] || old.why[uid].w < w.w) old.why[uid] = w;
      for (const s of c.src) if (!old.src.includes(s)) old.src.push(s);
    }
    return [...byKey.values()];
  }

  // The card everyone sees: TMDB's details (running time, seasons, genres, the description in each member's
  // language), plus whose history it came from (each person only ever sees their own reason).
  async function cardFor(c, type, langs) {
    const d = await ask(`/${type}/${c.t.id}`, {});
    if (!d || d.adult) return null;
    const t = deps.mapTitle({ ...d, genre_ids: (d.genres || []).map((g) => g.id) }, type);
    const local = {};
    for (const lang of langs) if (lang !== 'en') local[lang] = await ask(`/${type}/${c.t.id}`, {}, lang).catch(() => null);
    const overview = { en: d.overview || '' }, genreNames = { en: (d.genres || []).slice(0, 3).map((g) => g.name) };
    for (const [lang, l] of Object.entries(local)) {
      if (l?.overview) overview[lang] = l.overview;
      if (l?.genres?.length) genreNames[lang] = l.genres.slice(0, 3).map((g) => g.name);
    }
    const why = {};
    for (const [uid, w] of Object.entries(c.why || {})) why[uid] = { title: w.title, liked: Boolean(w.liked) };
    return {
      key: c.key, type, id: t.id, title: t.title, year: t.year,
      poster: t.poster ? t.poster.replace('/w342/', '/w500/') : null, backdrop: t.backdrop,
      rating: t.rating, votes: t.votes, genres: t.genres, genreNames, overview,
      runtime: type === 'movie' ? (d.runtime || null) : (d.episode_run_time?.[0] || null),
      seasons: type === 'tv' ? (d.number_of_seasons || null) : null,
      src: c.src, why,
    };
  }

  function yesVotes(id) {
    const rows = db().prepare('SELECT title_key, user_id FROM match_votes WHERE pick_id = ? AND vote = 1').all(id);
    const by = new Map();
    for (const r of rows) by.set(r.title_key, [...(by.get(r.title_key) || []), r.user_id]);
    return [...by.entries()].map(([key, voters]) => ({ key, voters })).sort((a, b) => b.voters.length - a.voters.length);
  }

  // Deals the next hand. Returns how many cards were dealt (0: nothing left that fits).
  function deal(id) {
    if (dealing.has(id)) return dealing.get(id);
    const job = dealNow(id).finally(() => dealing.delete(id));
    dealing.set(id, job);
    return job;
  }

  async function dealNow(id) {
    const pick = row(id);
    if (!pick) return 0;
    const dealtCards = cardsOf(id);
    if (dealtCards.length >= MAX_CARDS) return 0;
    const members = memberIds(id);
    const people = [...new Set([...members, ...pick.invited])];
    const tastes = new Map(people.map((uid) => [uid, tasteFrom(historyOf(uid), pick.type)]));
    const extra = { tasted: [], expanded: [], crowd: 0, server: false, ...pick.extra };
    const keys = await serverKeys();
    const dealt = new Set(dealtCards.map((c) => c.key));
    const exclude = new Set();
    for (const t of tastes.values()) {
      for (const k of t.disliked) exclude.add(k);
      if (pick.filters.unseen) for (const k of t.seen) exclude.add(k);
    }
    const ok = (c) => !dealt.has(c.key) && !exclude.has(c.key) && passes(c, pick.filters, { type: pick.type, onServer: keys.has(c.key) });
    let pool = pick.pool.filter(ok);

    // more candidates: new people's history, more like what got a yes, the next crowd-pleasers, the server's titles
    const fresh = people.filter((uid) => !extra.tasted.includes(uid));
    const yes = yesVotes(id).filter((y) => !extra.expanded.includes(y.key)).slice(0, 4);
    const low = pool.length < POOL_LOW;
    if (fresh.length || yes.length || low || !extra.server) {
      let serverTitles = [];
      if (!extra.server) {
        serverTitles = [...keys].filter((k) => k.startsWith(`${pick.type}:`) && !exclude.has(k));
        // a big library: a changing sample, unless the pick is for what's on the server only
        if (!pick.filters.serverOnly) serverTitles = serverTitles.sort(() => Math.random() - 0.5).slice(0, 40);
        else serverTitles = serverTitles.slice(0, POOL_MAX);
      }
      const crowd = low && !pick.filters.serverOnly && extra.crowd < 12 ? extra.crowd + 1 : 0;
      const found = await gather(pick, { tastes, fresh, yes, crowd, serverTitles });
      pool = merge(pool, found).filter(ok);
      extra.tasted = [...new Set([...extra.tasted, ...fresh])];
      extra.expanded = [...new Set([...extra.expanded, ...yes.map((y) => y.key)])];
      if (crowd) extra.crowd = crowd;
      extra.server = true;
    }

    // score for the people in the pick now, with what each of them said yes and no to so far
    const byKey = new Map(dealtCards.map((c) => [c.key, c]));
    const myVotes = db().prepare('SELECT user_id, title_key, vote FROM match_votes WHERE pick_id = ?').all(id);
    const scoring = people.map((uid) => {
      const norm = Math.max(0.001, ...pool.map((c) => c.per?.[uid] || 0));
      const votes = myVotes.filter((v) => v.user_id === uid).map((v) => ({ vote: v.vote, genres: byKey.get(v.title_key)?.genres || [] }));
      return { id: uid, norm, genres: genreLeaning(uid, pool, votes) };
    });
    const ordered = diversify(pool.map((c) => ({ ...c, s: scoreCandidate(c, scoring, { onServer: keys.has(c.key) }) }))
      .sort((a, b) => b.s - a.s || a.key.localeCompare(b.key)));

    // detail each card; a film over the longest running time is dropped here
    const langs = new Set(['en', currentLanguage()]);
    for (const uid of people) { const l = userById(uid)?.settings?.language; if (l) langs.add(l); }
    const room = Math.min(HAND, MAX_CARDS - dealtCards.length);
    const hand = [], gone = new Set();
    for (let i = 0; i < ordered.length && hand.length < room; i += 8) {
      const batch = ordered.slice(i, i + 8);
      const cards = await Promise.all(batch.map((c) => cardFor(c, pick.type, langs).catch(() => null)));
      batch.forEach((c, j) => {
        const card = cards[j];
        if (!card || (pick.filters.maxMinutes && card.runtime && card.runtime > pick.filters.maxMinutes)) { gone.add(c.key); return; }
        if (hand.length < room) hand.push(card);
      });
    }
    const handKeys = new Set(hand.map((c) => c.key));
    const rest = ordered.filter((c) => !handKeys.has(c.key) && !gone.has(c.key)).slice(0, POOL_MAX).map(({ s, ...c }) => c);
    if (!hand.length && !rest.length) extra.exhausted = true;
    const now = Date.now();
    db().exec('BEGIN');
    try {
      const insert = db().prepare('INSERT OR IGNORE INTO match_cards (pick_id, pos, title_key, card) VALUES (?, ?, ?, ?)');
      hand.forEach((card, i) => insert.run(id, dealtCards.length + i, card.key, JSON.stringify(card)));
      db().prepare('UPDATE match_picks SET pool = ?, extra = ?, touched_at = ? WHERE id = ?').run(JSON.stringify(rest), JSON.stringify(extra), now, id);
      db().exec('COMMIT');
    } catch (e) { db().exec('ROLLBACK'); throw e; }
    return hand.length;
  }

  // ---------- what a person sees ----------
  async function view(id, user, { from = 0 } = {}) {
    const pick = pickOr404(id);
    const joined = isMember(id, user.id);
    const members = memberIds(id);
    const host = face(userById(pick.host_id));
    const base = { id, joined, type: pick.type, filters: pick.filters, host, created: pick.created_at,
      members: members.map((uid) => ({ ...face(userById(uid)), host: uid === pick.host_id, me: uid === user.id })).filter((m) => m.id) };
    if (!joined) return base;
    const cards = cardsOf(id);
    const keys = await serverKeys();
    const lang = currentLanguage();
    const counts = new Map(db().prepare('SELECT user_id, COUNT(*) AS n FROM match_votes WHERE pick_id = ? GROUP BY user_id').all(id).map((r) => [r.user_id, r.n]));
    const more = !pick.extra.exhausted && cards.length < MAX_CARDS;
    base.members = base.members.map((m) => ({ ...m, swiped: counts.get(m.id) || 0, done: !more && (counts.get(m.id) || 0) >= cards.length }));
    const start = Math.max(0, Math.min(cards.length, Number(from) || 0));
    return {
      ...base,
      invited: pick.invited.filter((uid) => !members.includes(uid)).map((uid) => face(userById(uid))).filter(Boolean),
      total: cards.length, from: start, more,
      cards: cards.slice(start).map((c) => ({
        key: c.key, type: c.type, id: c.id, title: c.title, year: c.year, poster: c.poster, backdrop: c.backdrop, rating: c.rating,
        genres: c.genres, genreNames: c.genreNames?.[lang] || c.genreNames?.en || [], overview: c.overview?.[lang] || c.overview?.en || '',
        runtime: c.runtime, seasons: c.seasons, onServer: keys.has(c.key), why: c.why?.[user.id] || null,
      })),
      mine: Object.fromEntries(db().prepare('SELECT title_key, vote FROM match_votes WHERE pick_id = ? AND user_id = ?').all(id, user.id).map((r) => [r.title_key, r.vote])),
      matches: db().prepare('SELECT title_key AS key, at FROM match_hits WHERE pick_id = ? ORDER BY at').all(id).map((r) => ({ ...r, onServer: keys.has(r.key) })),
      room: pick.room ? { ...pick.room, by: face(userById(pick.room.by))?.name || '' } : null,
      canInvite: !isRestricted(user),
    };
  }

  // Your picks that are still going (Discover's Pick together card), and who you could invite to a new one.
  function list(user) {
    const rows = db().prepare(`SELECT p.id, p.host_id, p.type, p.created_at, p.touched_at FROM match_picks p JOIN match_members m ON m.pick_id = p.id
      WHERE m.user_id = ? AND p.touched_at >= ? ORDER BY p.touched_at DESC LIMIT 5`).all(user.id, Date.now() - KEEP_MS);
    const invitedTo = db().prepare('SELECT id, host_id, type, invited, created_at, touched_at FROM match_picks WHERE touched_at >= ? ORDER BY touched_at DESC LIMIT 50')
      .all(Date.now() - KEEP_MS).filter((p) => json(p.invited, []).includes(user.id) && !isMember(p.id, user.id)).slice(0, 3);
    const out = (p, invited) => ({
      id: p.id, type: p.type, host: face(userById(p.host_id)), mine: p.host_id === user.id, invited, created: p.created_at,
      members: memberIds(p.id).map((uid) => face(userById(uid))).filter(Boolean),
      matches: db().prepare('SELECT COUNT(*) AS n FROM match_hits WHERE pick_id = ?').get(p.id).n,
    });
    return { picks: [...invitedTo.map((p) => out(p, true)), ...rows.map((p) => out(p, false))], people: invitable(user), canInvite: !isRestricted(user) };
  }

  async function create(user, body = {}) {
    cleanup();
    const type = body.type === 'tv' ? 'tv' : 'movie';
    const filters = cleanFilters(body, type);
    const since = Date.now() - DAY;
    if (db().prepare('SELECT COUNT(*) AS n FROM match_picks WHERE host_id = ? AND created_at >= ?').get(user.id, since).n >= PER_DAY) {
      throw fail(429, 'That’s a lot of picks for one day. Try again tomorrow.');
    }
    const open = db().prepare(`SELECT COUNT(*) AS n FROM match_picks p JOIN match_members m ON m.pick_id = p.id AND m.user_id = p.host_id
      WHERE p.host_id = ? AND p.touched_at >= ?`).get(user.id, Date.now() - KEEP_MS).n;
    if (open >= OPEN_PER_HOST) throw fail(429, 'You have three picks going. Leave one first.');
    const asked = Array.isArray(body.invite) ? body.invite.map(Number) : [];
    if (asked.length && isRestricted(user)) throw fail(403, 'Copy the pick’s link and send it instead.');
    const allowed = new Set(invitable(user).map((u) => u.id));
    const invite = [...new Set(asked)].filter((uid) => allowed.has(uid)).slice(0, MAX_MEMBERS - 1);
    const id = crypto.randomBytes(16).toString('base64url');
    const now = Date.now();
    db().prepare('INSERT INTO match_picks (id, host_id, type, filters, invited, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, user.id, type, JSON.stringify(filters), JSON.stringify(invite), now, now);
    db().prepare('INSERT INTO match_members (pick_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, user.id, now);
    let dealt = 0;
    try { dealt = await deal(id); } catch (e) { db().prepare('DELETE FROM match_picks WHERE id = ?').run(id); throw e; }
    if (!dealt) {
      db().prepare('DELETE FROM match_picks WHERE id = ?').run(id);
      throw fail(404, 'Nothing fits those filters. Try another genre or a longer running time.');
    }
    if (invite.length) await sendInvites(user, id, invite, type);
    return view(id, user);
  }

  async function sendInvites(user, id, ids, type) {
    const fresh = ids.filter((uid) => {
      const k = `${id}|${uid}`;
      if (Date.now() - (invitesSent.get(k) || 0) < INVITE_GAP) return false;
      invitesSent.set(k, Date.now());
      return true;
    });
    if (invitesSent.size > 2000) invitesSent.delete(invitesSent.keys().next().value);
    if (!fresh.length) return 0;
    for (const uid of fresh) deps.publish?.(uid); // their Discover card shows the invite
    return deps.notify?.(fresh, 'watch', {
      title: type === 'tv' ? `${user.name || 'Someone'} wants to pick a show with you` : `${user.name || 'Someone'} wants to pick a film with you`,
      body: 'Swipe through posters together. The first one you all say yes to wins.', url: `/?pick=${id}`, tag: `pick-${id}` }) || 0;
  }

  async function invite(user, id, userIds) {
    const pick = pickOr404(id);
    if (!isMember(id, user.id)) throw fail(403, 'Join this pick first.');
    if (isRestricted(user)) throw fail(403, 'Copy the pick’s link and send it instead.');
    const allowed = new Set(invitable(user, new Set(memberIds(id))).map((u) => u.id));
    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number))].filter((uid) => allowed.has(uid)).slice(0, 20);
    if (!ids.length) throw fail(400, 'Choose someone to invite.');
    const before = new Set(pick.invited);
    const invited = [...new Set([...pick.invited, ...ids])].slice(-40);
    db().prepare('UPDATE match_picks SET invited = ?, touched_at = ? WHERE id = ?').run(JSON.stringify(invited), Date.now(), id);
    const sent = await sendInvites(user, id, ids, pick.type);
    if (ids.some((uid) => !before.has(uid))) tell(id, user.id); // their faces show as invited
    return { invited: ids.length, sent };
  }

  function join(user, id) {
    pickOr404(id);
    if (!isMember(id, user.id)) {
      if (memberIds(id).length >= MAX_MEMBERS) throw fail(409, 'This pick is full (12 people).');
      db().prepare('INSERT OR IGNORE INTO match_members (pick_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, user.id, Date.now());
      touch(id);
      tell(id, user.id);
    }
    return view(id, user);
  }

  // Everyone in the pick (two or more) said yes to it: a match, once.
  function checkMatch(id, key) {
    const members = memberIds(id);
    if (members.length < 2) return false;
    const n = db().prepare(`SELECT COUNT(*) AS n FROM match_votes v JOIN match_members m ON m.pick_id = v.pick_id AND m.user_id = v.user_id
      WHERE v.pick_id = ? AND v.title_key = ? AND v.vote = 1`).get(id, key).n;
    if (n < members.length) return false;
    return db().prepare('INSERT OR IGNORE INTO match_hits (pick_id, title_key, at) VALUES (?, ?, ?)').run(id, key, Date.now()).changes > 0;
  }

  function announce(id, key, voter) {
    const card = cardsOf(id).find((c) => c.key === key);
    // whoever hasn't swiped in the last minute has probably put their phone down
    const away = db().prepare(`SELECT m.user_id, MAX(v.at) AS last FROM match_members m LEFT JOIN match_votes v ON v.pick_id = m.pick_id AND v.user_id = m.user_id
      WHERE m.pick_id = ? GROUP BY m.user_id`).all(id).filter((r) => r.user_id !== voter && (!r.last || Date.now() - r.last > 60000)).map((r) => r.user_id);
    if (card && away.length) deps.notify?.(away, 'watch', { title: `It’s a match: ${card.title}`, body: 'Everyone said yes. Tap to watch it together.', url: `/?pick=${id}`, tag: `pick-${id}` });
    tell(id);
  }

  function vote(user, id, key, value) {
    pickOr404(id);
    if (!isMember(id, user.id)) throw fail(403, 'Join this pick first.');
    key = String(key || '');
    if (!db().prepare('SELECT 1 FROM match_cards WHERE pick_id = ? AND title_key = ?').get(id, key)) throw fail(400, 'That poster isn’t in this pick.');
    value = Number(value);
    if (![1, -1, 0].includes(value)) throw fail(400, 'Swipe yes or no.');
    if (!value) db().prepare('DELETE FROM match_votes WHERE pick_id = ? AND user_id = ? AND title_key = ?').run(id, user.id, key);
    else db().prepare(`INSERT INTO match_votes (pick_id, user_id, title_key, vote, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pick_id, user_id, title_key) DO UPDATE SET vote = excluded.vote, at = excluded.at`).run(id, user.id, key, value, Date.now());
    touch(id);
    const matched = value === 1 && checkMatch(id, key);
    if (matched) announce(id, key, user.id);
    const left = db().prepare(`SELECT COUNT(*) AS n FROM match_cards c WHERE c.pick_id = ? AND NOT EXISTS
      (SELECT 1 FROM match_votes v WHERE v.pick_id = c.pick_id AND v.user_id = ? AND v.title_key = c.title_key)`).get(id, user.id).n;
    // the last card of the stack: the others' faces show you're done
    if (!left) tell(id, user.id);
    return { ok: true, match: matched ? key : null, left };
  }

  // Deals another hand when you're running out (the page asks when fewer than LOW cards are left for you).
  async function more(user, id) {
    pickOr404(id);
    if (!isMember(id, user.id)) throw fail(403, 'Join this pick first.');
    const left = db().prepare(`SELECT COUNT(*) AS n FROM match_cards c WHERE c.pick_id = ? AND NOT EXISTS
      (SELECT 1 FROM match_votes v WHERE v.pick_id = c.pick_id AND v.user_id = ? AND v.title_key = c.title_key)`).get(id, user.id).n;
    if (left >= LOW) return { dealt: 0 };
    const dealt = await deal(id);
    if (dealt) tell(id, user.id);
    return { dealt };
  }

  function leave(user, id) {
    const pick = row(id);
    if (!pick) return { ok: true };
    db().prepare('DELETE FROM match_votes WHERE pick_id = ? AND user_id = ?').run(id, user.id);
    db().prepare('DELETE FROM match_members WHERE pick_id = ? AND user_id = ?').run(id, user.id);
    if (pick.invited.includes(user.id)) db().prepare('UPDATE match_picks SET invited = ? WHERE id = ?').run(JSON.stringify(pick.invited.filter((u) => u !== user.id)), id);
    if (!memberIds(id).length) { db().prepare('DELETE FROM match_picks WHERE id = ?').run(id); return { ok: true }; }
    // with one person fewer, a title everyone else already said yes to is a match now
    let hit = null;
    for (const { key } of yesVotes(id)) if (checkMatch(id, key)) hit = key;
    if (hit) announce(id, hit, user.id); else tell(id);
    return { ok: true };
  }

  // Watch a match together: a room on the server's copy of the film, now or at startsAt (a planned party).
  async function watch(user, id, { key, clientId, startsAt } = {}) {
    const pick = pickOr404(id);
    if (!isMember(id, user.id)) throw fail(403, 'Join this pick first.');
    key = String(key || '');
    if (!db().prepare('SELECT 1 FROM match_hits WHERE pick_id = ? AND title_key = ?').get(id, key)) throw fail(400, 'That isn’t a match yet.');
    const card = cardsOf(id).find((c) => c.key === key);
    if (!card || card.type !== 'movie') throw fail(409, 'Open the show and start an episode, then press Watch together.');
    const planned = startsAt != null && startsAt !== '';
    const room = await deps.startRoom(user, card, { clientId, startsAt: planned ? Number(startsAt) : null });
    const record = { token: room.token, key, title: card.title, by: user.id, startsAt: room.startsAt || null, at: Date.now() };
    db().prepare('UPDATE match_picks SET room = ?, touched_at = ? WHERE id = ?').run(JSON.stringify(record), Date.now(), id);
    const others = memberIds(id).filter((uid) => uid !== user.id);
    if (others.length) {
      deps.notify?.(others, 'watch', planned
        ? { title: `${card.title} is planned`, body: `${user.name || 'Someone'} planned it for later. Tap to see when it starts.`, url: `/?watch=${room.token}`, tag: `pick-${id}` }
        : { title: `${card.title} is starting`, body: `${user.name || 'Someone'} started the room. Tap to join.`, url: `/?watch=${room.token}`, tag: `pick-${id}` });
    }
    tell(id, user.id);
    return { room };
  }

  // The API under /api/match (server.js passes it on). Returns what to send, or null for an unknown route.
  async function api(user, method, p, body = {}, query = new URLSearchParams()) {
    if (p === '/api/match' && method === 'GET') return list(user);
    if (p === '/api/match' && method === 'POST') return create(user, body);
    const m = p.match(/^\/api\/match\/([A-Za-z0-9_-]{22})(?:\/(join|vote|more|invite|invitees|leave|watch))?$/);
    if (!m) return null;
    const [, id, action] = m;
    if (!action && method === 'GET') return view(id, user, { from: query.get('from') });
    if (action === 'invitees' && method === 'GET') {
      pickOr404(id);
      if (!isMember(id, user.id)) throw fail(403, 'Join this pick first.');
      return { people: invitable(user, new Set(memberIds(id))) };
    }
    if (method !== 'POST') return null;
    if (action === 'join') return join(user, id);
    if (action === 'vote') return vote(user, id, body.key, body.vote);
    if (action === 'more') return more(user, id);
    if (action === 'invite') return invite(user, id, body.userIds);
    if (action === 'leave') return leave(user, id);
    if (action === 'watch') return watch(user, id, body);
    return null;
  }

  return { api, list, create, view, join, vote, more, invite, leave, watch, deal, tasteOf: (uid, type) => tasteFrom(historyOf(uid), type) };
}
