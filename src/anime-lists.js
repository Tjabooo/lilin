// Anime lists: link a MyAnimeList or AniList account (or both) to a Lilin profile. The profile then shows an Anime
// section with what they're watching there, what they finished last and a few numbers, and a link in the header.
// If they like (Show my full list, off by default), the whole list is kept too and visitors can browse it by status.
//
// Nothing is imported into Lilin's own diary, stars or reviews: anime sites count seasons and episodes their own way
// (one entry per cour, absolute episode numbers), so a list only mirrors what the site says, read again every few
// hours. Both sites hand this out on purpose without a key:
//   - AniList: its public GraphQL API (the user's stats and their latest list entries).
//   - MyAnimeList: the JSON behind a public anime list page (myanimelist.net/animelist/USER/load.json). A private
//     list answers 400, the same as a name that doesn't exist.
import { database } from './accounts.js';
import { anilistQuery } from './anime.js';

export const SERVICES = ['anilist', 'mal'];
export const NAMES = { anilist: 'AniList', mal: 'MyAnimeList' };
export const USERNAME = /^[A-Za-z0-9_-]{2,20}$/;
export const SYNC_EVERY = 6 * 3600 * 1000;
const SHOW = 12;                 // entries kept per shelf (watching, finished)
const MAL_PAGE = 300;            // what load.json sends per page
const MAL_PAGES = 15;            // 4,500 entries is plenty
const MAL_URL = process.env.MAL_URL || 'https://myanimelist.net';
const FULL_MAX = 5000;           // entries kept for Show my full list
export const STATUSES = ['watching', 'completed', 'paused', 'dropped', 'planning'];

const made = new WeakSet(); // databases that have the table (tests open several)
const db = () => { const d = database(); if (!made.has(d)) { made.add(d); initAnimeLists(d); } return d; };
const fail = (status, message) => Object.assign(new Error(message), { status });

export function initAnimeLists(d = db()) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS anime_links (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      username TEXT NOT NULL,
      linked_at INTEGER NOT NULL,
      synced_at INTEGER,
      error TEXT,
      data TEXT,
      PRIMARY KEY (user_id, service)
    );
  `);
  // show_full: they chose to show the whole list; full: that list (JSON), kept only while show_full is on
  const cols = new Set(d.prepare('PRAGMA table_info(anime_links)').all().map((c) => c.name));
  if (!cols.has('show_full')) d.exec('ALTER TABLE anime_links ADD COLUMN show_full INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('full')) d.exec('ALTER TABLE anime_links ADD COLUMN full TEXT');
}

export const cleanUsername = (raw) => {
  const u = String(raw ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(myanimelist\.net\/(profile|animelist)|anilist\.co\/user)\//i, '').replace(/[/?#].*$/, '');
  return USERNAME.test(u) ? u : null;
};
const urlOf = (service, username) => (service === 'mal' ? `https://myanimelist.net/animelist/${encodeURIComponent(username)}` : `https://anilist.co/user/${encodeURIComponent(username)}/`);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const text = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Only pictures from the sites' own CDNs go into an <img>.
const COVER = /^https:\/\/(cdn\.myanimelist\.net|s4\.anilist\.co|img\.anili\.st)\/[^\s"'<>]+$/;
const cover = (u) => (COVER.test(String(u || '')) ? String(u) : null);
const SITE = /^https:\/\/(myanimelist\.net|anilist\.co)\/[^\s"'<>]*$/;
const site = (u) => (SITE.test(String(u || '')) ? String(u) : null);
const num = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);
const entry = (e) => ({ title: text(e.title), cover: cover(e.cover), url: site(e.url), progress: num(e.progress) || null, episodes: num(e.episodes) || null, score: num(e.score) || null });
// A full-list entry, short keys (a long list is thousands of these): title, cover, url, progress, episodes, score,
// status (STATUSES), updated (seconds).
const fullEntry = (e) => {
  const x = entry(e);
  if (!x.title || !STATUSES.includes(e.status)) return null;
  return { t: x.title, c: x.cover, u: x.url, p: x.progress, e: x.episodes, s: x.score, st: e.status, at: num(e.updated) || 0 };
};
const capFull = (list) => list.filter(Boolean).sort((a, b) => b.at - a.at).slice(0, FULL_MAX);

// ---------- reading the sites ----------
const ANILIST_QUERY = `query($n:String){
  User(name:$n){ name siteUrl statistics{ anime{ count episodesWatched minutesWatched meanScore statuses{ status count } } } }
  w: Page(perPage:${SHOW}){ mediaList(userName:$n, type:ANIME, status_in:[CURRENT,REPEATING], sort:UPDATED_TIME_DESC){ progress score(format:POINT_10_DECIMAL) media{ siteUrl episodes title{ userPreferred } coverImage{ large } } } }
  d: Page(perPage:${SHOW}){ mediaList(userName:$n, type:ANIME, status:COMPLETED, sort:[UPDATED_TIME_DESC]){ progress score(format:POINT_10_DECIMAL) media{ siteUrl episodes title{ userPreferred } coverImage{ large } } } }
}`;
const ANILIST_FULL = `query($n:String){
  MediaListCollection(userName:$n, type:ANIME){ lists{ isCustomList entries{ status progress updatedAt score(format:POINT_10_DECIMAL) media{ siteUrl episodes title{ userPreferred } coverImage{ medium } } } } }
}`;
const ANILIST_STATUS = { CURRENT: 'watching', REPEATING: 'watching', COMPLETED: 'completed', PAUSED: 'paused', DROPPED: 'dropped', PLANNING: 'planning' };

// full: also read the whole list (a second query), for Show my full list.
export async function readAnilist(username, { query = anilistQuery, full = false } = {}) {
  let data;
  try { data = await query(ANILIST_QUERY, { n: username }); } catch (e) {
    if (/not found|404/i.test(String(e.message))) throw fail(400, 'There’s no AniList user by that name.');
    throw fail(502, 'AniList didn’t answer. Try again in a bit.');
  }
  const user = data?.User;
  if (!user) throw fail(400, 'There’s no AniList user by that name, or their profile is private.');
  const st = user.statistics?.anime || {};
  const done = (st.statuses || []).find((s) => s.status === 'COMPLETED')?.count || 0;
  const mean = num(st.meanScore);
  const toEntry = (l) => entry({ title: l.media?.title?.userPreferred, cover: l.media?.coverImage?.large, url: l.media?.siteUrl, progress: l.progress, episodes: l.media?.episodes, score: l.score });
  let whole = null;
  if (full) {
    try {
      const all = await query(ANILIST_FULL, { n: username });
      // custom lists repeat entries that are also on a status list
      whole = capFull((all?.MediaListCollection?.lists || []).filter((l) => !l.isCustomList).flatMap((l) => l.entries || [])
        .map((l) => fullEntry({ title: l.media?.title?.userPreferred, cover: l.media?.coverImage?.medium, url: l.media?.siteUrl, progress: l.progress,
          episodes: l.media?.episodes, score: l.score, status: ANILIST_STATUS[l.status], updated: l.updatedAt })));
    } catch { throw fail(502, 'AniList didn’t send the full list. Try again in a bit.'); }
  }
  return {
    full: whole,
    username: text(user.name, 40) || username,
    stats: { completed: done, episodes: num(st.episodesWatched), days: Math.round(num(st.minutesWatched) / 144) / 10, mean: mean > 10 ? Math.round(mean) / 10 : mean },
    watching: (data.w?.mediaList || []).map(toEntry).filter((e) => e.title),
    finished: (data.d?.mediaList || []).map(toEntry).filter((e) => e.title),
  };
}

async function malPage(username, offset) {
  const r = await fetch(`${MAL_URL}/animelist/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; Lilin)' },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 400 || r.status === 404) throw fail(400, 'There’s no MyAnimeList user by that name, or their list is private.');
  if (!r.ok) throw fail(502, 'MyAnimeList didn’t answer. Try again in a bit.');
  const list = await r.json().catch(() => null);
  if (!Array.isArray(list)) throw fail(502, 'MyAnimeList sent something odd. Try again in a bit.');
  return list;
}

// MAL statuses: 1 watching, 2 completed, 3 on hold, 4 dropped, 6 plan to watch.
const MAL_STATUS = { 1: 'watching', 2: 'completed', 3: 'paused', 4: 'dropped', 6: 'planning' };
export async function readMal(username, { page = malPage, full = false } = {}) {
  const all = [];
  for (let i = 0; i < MAL_PAGES; i++) {
    const list = await page(username, i * MAL_PAGE);
    all.push(...list);
    if (list.length < MAL_PAGE) break;
  }
  const newest = (a, b) => num(b.updated_at) - num(a.updated_at);
  const toEntry = (e) => entry({ title: e.anime_title, cover: e.anime_image_path, url: e.anime_url ? `https://myanimelist.net${String(e.anime_url).startsWith('/') ? '' : '/'}${e.anime_url}` : null,
    progress: e.num_watched_episodes, episodes: e.anime_num_episodes, score: e.score });
  const scored = all.filter((e) => num(e.score) && e.status !== 6);
  const episodes = all.reduce((n, e) => n + (e.status === 6 ? 0 : num(e.num_watched_episodes)), 0);
  return {
    full: full ? capFull(all.map((e) => fullEntry({ title: e.anime_title, cover: e.anime_image_path, url: toEntry(e).url, progress: e.num_watched_episodes,
      episodes: e.anime_num_episodes, score: e.score, status: e.is_rewatching ? 'watching' : MAL_STATUS[e.status], updated: e.updated_at }))) : null,
    username,
    stats: { completed: all.filter((e) => e.status === 2).length, episodes, days: null,
      mean: scored.length ? Math.round(scored.reduce((n, e) => n + num(e.score), 0) / scored.length * 10) / 10 : 0 },
    watching: all.filter((e) => e.status === 1 || e.is_rewatching).sort(newest).slice(0, SHOW).map(toEntry).filter((e) => e.title),
    finished: all.filter((e) => e.status === 2 && !e.is_rewatching).sort(newest).slice(0, SHOW).map(toEntry).filter((e) => e.title),
  };
}

const READERS = { anilist: readAnilist, mal: readMal };

// ---------- links ----------
export function linksOf(userId) {
  return db().prepare('SELECT * FROM anime_links WHERE user_id = ? ORDER BY linked_at').all(userId).map((r) => ({
    service: r.service, username: r.username, url: urlOf(r.service, r.username), syncedAt: r.synced_at, error: r.error, showFull: Boolean(r.show_full),
    fullCount: r.show_full && r.full ? (parse(r.full) || []).length : 0, ...(parse(r.data) || {}),
  }));
}

// The whole list, when they chose to show it (null otherwise): { service, name, username, url, entries }.
export function fullListOf(userId, service) {
  const r = db().prepare('SELECT username, show_full, full FROM anime_links WHERE user_id = ? AND service = ?').get(userId, service);
  if (!r || !r.show_full || !r.full) return null;
  return { service, name: NAMES[service], username: r.username, url: urlOf(service, r.username), entries: parse(r.full) || [] };
}

// Show my full list on or off. On reads the list now (so it's there right away); off forgets the copy.
export async function setShowFull(userId, service, on, { readers = READERS, now = Date.now() } = {}) {
  const r = db().prepare('SELECT 1 FROM anime_links WHERE user_id = ? AND service = ?').get(userId, service);
  if (!r) throw fail(404, `No ${NAMES[service] || 'anime'} account is linked.`);
  db().prepare('UPDATE anime_links SET show_full = ?, full = CASE WHEN ? THEN full ELSE NULL END WHERE user_id = ? AND service = ?').run(on ? 1 : 0, on ? 1 : 0, userId, service);
  if (on) await sync(userId, service, { readers, now });
}

// What a profile shows: every linked list that has been read at least once. self adds the ones still failing, and why.
export function viewOf(userId, { self = false } = {}) {
  return linksOf(userId).filter((l) => self || l.stats).map((l) => ({
    service: l.service, name: NAMES[l.service], username: l.username, url: l.url,
    stats: l.stats || null, watching: l.watching || [], finished: l.finished || [], fullCount: l.fullCount,
    ...(self ? { syncedAt: l.syncedAt, error: l.error, showFull: l.showFull } : {}),
  }));
}

// Links (or relinks under a new name) and reads the list right away; a name that doesn't work isn't kept.
export async function link(userId, service, username, { readers = READERS, now = Date.now() } = {}) {
  if (!SERVICES.includes(service)) throw fail(400, 'Pick AniList or MyAnimeList.');
  const u = cleanUsername(username);
  if (!u) throw fail(400, `That doesn’t look like a ${NAMES[service]} username.`);
  const got = await readers[service](u);
  db().prepare(`INSERT INTO anime_links (user_id, service, username, linked_at, synced_at, error, data) VALUES (?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(user_id, service) DO UPDATE SET username = excluded.username, synced_at = excluded.synced_at, error = NULL, data = excluded.data`)
    .run(userId, service, got.username || u, now, now, JSON.stringify({ stats: got.stats, watching: got.watching, finished: got.finished }));
}

export function unlink(userId, service) {
  db().prepare('DELETE FROM anime_links WHERE user_id = ? AND service = ?').run(userId, service);
}

export async function sync(userId, service, { readers = READERS, now = Date.now() } = {}) {
  const r = db().prepare('SELECT username, show_full FROM anime_links WHERE user_id = ? AND service = ?').get(userId, service);
  if (!r) throw fail(404, `No ${NAMES[service] || 'anime'} account is linked.`);
  try {
    const got = await readers[service](r.username, { full: Boolean(r.show_full) });
    db().prepare('UPDATE anime_links SET synced_at = ?, error = NULL, data = ?, full = ? WHERE user_id = ? AND service = ?')
      .run(now, JSON.stringify({ stats: got.stats, watching: got.watching, finished: got.finished }), r.show_full && got.full ? JSON.stringify(got.full) : null, userId, service);
  } catch (e) {
    // the last good copy stays on the profile; the error is for the owner's editor
    db().prepare('UPDATE anime_links SET synced_at = ?, error = ? WHERE user_id = ? AND service = ?').run(now, text(e.message || e), userId, service);
    throw e;
  }
}

// Every list not read for SYNC_EVERY, one at a time (AniList's own queue spaces its requests).
export async function syncRound({ readers = READERS, now = Date.now() } = {}) {
  for (const r of db().prepare('SELECT user_id, service, synced_at FROM anime_links').all()) {
    if (r.synced_at && now - r.synced_at < SYNC_EVERY) continue;
    try { await sync(r.user_id, r.service, { readers, now }); } catch { /* kept in the link's error; tried again next round */ }
  }
}
