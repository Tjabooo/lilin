// "More details" on a title page: who made it (creators, directors, writers, composer, key crew), the
// facts (studios, countries, language, money, dates), keywords, outside links and the soundtrack.
// Nothing here is shown until someone opens the disclosure at the bottom of the page (public/details.js).
//
// Crew and facts come from TMDB in one call (the caller's cached TMDB). TMDB has no music, so the
// soundtrack comes from Wikidata and MusicBrainz, both free, keyless and open data:
//   1. Wikidata, asked by TMDB id (P4947 film / P4983 show), gives the title's soundtrack albums
//      (film → P406 "soundtrack release", album → P9899 "music created for") with their MusicBrainz
//      release group ids (P436), plus its Wikipedia pages.
//   2. When Wikidata has none, a MusicBrainz search for a soundtrack release group with the same title
//      from the same years (a film's composer counts as proof too).
//   3. MusicBrainz then gives each album's track list (one official release picked per album).
// MusicBrainz allows one request a second, so its requests queue. Answers are kept on disk for weeks
// (soundtracks don't change), failures only briefly; when nothing is found the page just has no Music.
// No per-scene song timestamps: no free source has them (Tunefind and the like are closed or forbid it).
import fs from 'node:fs';
import path from 'node:path';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Lilin/2 (self-hosted media server; https://github.com/Tjabooo/lilin)';
const MB_GAP_MS = 1100;          // MusicBrainz: at most one request a second per client
const FOUND_DAYS = 30;           // how long a found soundtrack is trusted
const NOTHING_DAYS = 7;          // and how long "no soundtrack" is
const FAILED_MS = 30 * 60 * 1000;
const MAX_ALBUMS = 4;
const MAX_TRACKS = 80;
const MAX_KEPT = 3000;           // titles in the cache file
const DAY = 24 * 3600 * 1000;

// ---------- crew and facts (pure; tests/details.test.mjs) ----------

// Groups in page order. `jobs`: TMDB crew job names; the first group a job lands in wins.
export const PEOPLE_GROUPS = [
  { key: 'creators' },                                     // TMDB created_by (shows)
  { key: 'showrunners', jobs: ['Showrunner'] },
  { key: 'directors', jobs: ['Director', 'Series Director'] },
  { key: 'writers', jobs: ['Screenplay', 'Writer', 'Teleplay', 'Story', 'Screenstory', 'Script', 'Head Writer', 'Story Editor'] },
  { key: 'source', jobs: ['Novel', 'Book', 'Author', 'Comic Book', 'Characters', 'Original Story', 'Original Concept', 'Idea', 'Graphic Novel', 'Short Story', 'Play'] },
  { key: 'music', jobs: ['Original Music Composer', 'Music', 'Composer', 'Main Title Theme Composer', 'Theme Song Performance'] },
  { key: 'musicSupervisors', jobs: ['Music Supervisor'] },
  { key: 'camera', jobs: ['Director of Photography'] },
  { key: 'editing', jobs: ['Editor'] },
  { key: 'producers', jobs: ['Producer'] },
  { key: 'executives', jobs: ['Executive Producer'] },
  { key: 'design', jobs: ['Production Design'] },
  { key: 'costumes', jobs: ['Costume Design'] },
  { key: 'casting', jobs: ['Casting'] },
  { key: 'effects', jobs: ['Visual Effects Supervisor'] },
];
const GROUP_LIMIT = { executives: 6, producers: 6, effects: 2, writers: 6, directors: 6 };
const JOB_GROUP = new Map(PEOPLE_GROUPS.flatMap((g) => (g.jobs || []).map((j) => [j, g.key])));
// Jobs that say more than the group's name; shown next to the name ("Story", "Novel", "Theme").
const NOTED_JOBS = new Set(['Story', 'Screenstory', 'Teleplay', 'Novel', 'Book', 'Comic Book', 'Characters', 'Original Story',
  'Original Concept', 'Idea', 'Graphic Novel', 'Short Story', 'Play', 'Main Title Theme Composer', 'Theme Song Performance', 'Series Director', 'Head Writer', 'Story Editor']);

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
const validId = (id) => Number.isInteger(id) && id > 0;

// Crew from a film's credits ({ job }) or a show's aggregate_credits ({ jobs: [{ job, episode_count }] }).
export function peopleGroups(type, d) {
  const groups = new Map(PEOPLE_GROUPS.map((g) => [g.key, new Map()]));
  const add = (key, person, job, episodes = 0) => {
    const name = cleanName(person.name);
    if (!name || !groups.has(key)) return;
    const list = groups.get(key);
    const id = validId(person.id) ? person.id : null;
    const k = id ?? name;
    const seen = list.get(k) || { id, name, jobs: [], episodes: 0, order: list.size };
    if (job && NOTED_JOBS.has(job) && !seen.jobs.includes(job)) seen.jobs.push(job);
    seen.episodes = Math.max(seen.episodes, episodes);
    list.set(k, seen);
  };
  if (type === 'tv') for (const c of d?.created_by || []) add('creators', c);
  const credits = type === 'tv' ? d?.aggregate_credits : d?.credits;
  for (const c of credits?.crew || []) {
    const jobs = Array.isArray(c.jobs) ? c.jobs.map((j) => [j.job, Number(j.episode_count) || 0]) : [[c.job, 0]];
    for (const [job, episodes] of jobs) if (JOB_GROUP.has(job)) add(JOB_GROUP.get(job), c, job, episodes);
  }
  // Someone listed as creator isn't repeated as a showrunner.
  const creators = new Set([...groups.get('creators').keys()]);
  for (const k of creators) groups.get('showrunners').delete(k);
  const out = [];
  for (const { key } of PEOPLE_GROUPS) {
    let people = [...groups.get(key).values()];
    if (type === 'tv') people.sort((a, b) => b.episodes - a.episodes || a.order - b.order);
    // Shows: four per group (long-running ones list dozens), and no Story/Teleplay notes on every writer.
    const limit = type === 'tv' && key !== 'creators' ? 4 : GROUP_LIMIT[key] || 4;
    const noted = type !== 'tv' || key === 'source' || key === 'music';
    people = people.slice(0, limit).map((p) => ({
      id: p.id, name: p.name,
      ...(p.jobs.length && noted ? { jobs: p.jobs } : {}),
      ...(type === 'tv' && p.episodes > 0 && key !== 'creators' ? { episodes: p.episodes } : {}),
    }));
    if (people.length) out.push({ key, people });
  }
  return out;
}

// The release dates worth listing: the world premiere, and cinema / digital / disc in the viewer's country
// (or the US when that country has none). TMDB types: 1 premiere, 2 limited, 3 cinema, 4 digital, 5 disc, 6 TV.
export function filmDates(d, country = 'US') {
  const all = (d?.release_dates?.results || []).flatMap((r) => (r.release_dates || []).map((x) => ({ country: r.iso_3166_1, type: Number(x.type), date: String(x.release_date || '').slice(0, 10) })))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  const out = [];
  const first = all.filter((x) => x.type <= 3).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (first) out.push({ kind: 'premiere', date: first.date, country: first.country });
  const kinds = [['cinema', [3, 2]], ['digital', [4]], ['disc', [5]]];
  for (const [kind, types] of kinds) {
    for (const c of [country, 'US']) {
      const hit = all.filter((x) => x.country === c && types.includes(x.type)).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (hit) { if (!(kind === 'cinema' && first && hit.date === first.date && hit.country === first.country)) out.push({ kind, date: hit.date, country: hit.country }); break; }
    }
  }
  if (!out.length && /^\d{4}-\d{2}-\d{2}$/.test(d?.release_date || '')) out.push({ kind: 'release', date: d.release_date, country: null });
  return out;
}

const names = (list, max = 6) => (list || []).map((x) => cleanName(x?.name)).filter(Boolean).slice(0, max);
const codes = (list, key = 'iso_3166_1') => [...new Set((list || []).map((x) => (typeof x === 'string' ? x : x?.[key])).filter((c) => /^[A-Za-z]{2}$/.test(c || '')).map((c) => c.toUpperCase()))];
const money = (n) => (Number.isFinite(Number(n)) && Number(n) >= 1000 ? Math.round(Number(n)) : null);
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);

export function titleFacts(type, d, country = 'US') {
  const tv = type === 'tv';
  const title = tv ? d?.name : d?.title;
  const original = tv ? d?.original_name : d?.original_title;
  const facts = {
    studios: names(d?.production_companies),
    networks: tv ? names(d?.networks, 4) : [],
    countries: codes(tv ? (d?.origin_country?.length ? d.origin_country : d?.production_countries) : d?.production_countries),
    language: /^[a-z]{2}$/.test(d?.original_language || '') && d.original_language !== 'xx' ? d.original_language : null,
    spoken: codes(d?.spoken_languages, 'iso_639_1').map((c) => c.toLowerCase()).filter((c) => c !== d?.original_language && c !== 'xx').slice(0, 6),
    originalTitle: original && title && cleanName(original) !== cleanName(title) ? cleanName(original) : null,
    collection: !tv && d?.belongs_to_collection?.name ? cleanName(d.belongs_to_collection.name) : null,
    budget: tv ? null : money(d?.budget),
    revenue: tv ? null : money(d?.revenue),
    dates: tv ? [] : filmDates(d, country),
    firstAired: tv ? date(d?.first_air_date) : null,
    lastAired: tv && d?.status !== 'Returning Series' ? date(d?.last_air_date) : null,
    nextAired: tv ? date(d?.next_episode_to_air?.air_date) : null,
    status: tv ? (d?.status || null) : null,
    episodeRuntime: tv ? (Number(d?.episode_run_time?.[0]) || Number(d?.last_episode_to_air?.runtime) || null) : null,
    seasons: tv ? Number(d?.number_of_seasons) || null : null,
    episodes: tv ? Number(d?.number_of_episodes) || null : null,
  };
  for (const [k, v] of Object.entries(facts)) if (v == null || (Array.isArray(v) && !v.length)) delete facts[k];
  return facts;
}

export function titleKeywords(type, d) {
  const list = type === 'tv' ? d?.keywords?.results : d?.keywords?.keywords;
  return [...new Set((list || []).map((k) => cleanName(k?.name)).filter((k) => k && k.length <= 40))].slice(0, 20);
}

export function titleLinks(type, id, d) {
  const ids = d?.external_ids || {};
  const imdb = ids.imdb_id || d?.imdb_id;
  const links = [];
  if (/^tt\d{5,10}$/.test(imdb || '')) links.push({ kind: 'imdb', url: `https://www.imdb.com/title/${imdb}/` });
  links.push({ kind: 'tmdb', url: `https://www.themoviedb.org/${type}/${id}` });
  if (type === 'movie') links.push({ kind: 'letterboxd', url: `https://letterboxd.com/tmdb/${id}/` });
  if (/^https?:\/\/[^\s"<>]{3,300}$/.test(d?.homepage || '')) links.push({ kind: 'homepage', url: d.homepage });
  return links;
}

// What /api/title/:type/:id/details sends, without the music (that's added by createDetails).
export function shapeDetails(type, id, d, { country = 'US' } = {}) {
  return { people: peopleGroups(type, d), facts: titleFacts(type, d, country), keywords: titleKeywords(type, d), links: titleLinks(type, id, d) };
}

// An episode's own director, writers and guest stars (TMDB season answers carry them), for the episode
// list. Empty when TMDB has none, so the list stays exactly as it was.
export function episodeCredits(e) {
  const crew = Array.isArray(e?.crew) ? e.crew : [];
  const pick = (jobs) => {
    const seen = new Map();
    for (const c of crew) if (jobs.includes(c.job) && cleanName(c.name) && !seen.has(c.id ?? c.name)) seen.set(c.id ?? c.name, { id: validId(c.id) ? c.id : null, name: cleanName(c.name) });
    return [...seen.values()].slice(0, 4);
  };
  const directors = pick(['Director']);
  const writers = pick(['Writer', 'Teleplay', 'Story', 'Screenplay']);
  const guests = (Array.isArray(e?.guest_stars) ? e.guest_stars : []).filter((g) => cleanName(g?.name)).slice(0, 6)
    .map((g) => ({ id: validId(g.id) ? g.id : null, name: cleanName(g.name), ...(cleanName(g.character) ? { character: cleanName(g.character) } : {}) }));
  if (!directors.length && !writers.length && !guests.length) return null;
  return { directors, writers, guests };
}

// ---------- music (Wikidata + MusicBrainz) ----------

// Lower case, no accents or punctuation: "Amélie (Original Soundtrack)" → "amelie original soundtrack".
export const normTitle = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const year = (s) => (/^\d{4}/.test(String(s || '')) ? Number(String(s).slice(0, 4)) : null);

// Is this MusicBrainz search hit really this title's soundtrack? Same title (as a whole word prefix),
// from the right years: a film's year ±1, or within a show's run. A film's composer credited on the
// album counts as proof when the year is off by a little more (late re-releases).
export function soundtrackMatches(group, { titles, from, to, composers = [] }) {
  const t = normTitle(group?.title);
  if (!t || !(group?.['secondary-types'] || []).includes('Soundtrack')) return false;
  if (!titles.map(normTitle).filter(Boolean).some((name) => t === name || t.startsWith(`${name} `))) return false;
  const y = year(group['first-release-date']);
  if (!y || !from) return false;
  if (y >= from - 1 && y <= (to || from) + 1) return true;
  const artists = (group['artist-credit'] || []).map((a) => normTitle(a?.name || a?.artist?.name));
  return y >= from - 1 && y <= (to || from) + 4 && composers.map(normTitle).some((c) => c && artists.includes(c));
}

// One release of an album: Latin script, digital or CD, a worldwide/English-market issue, the most tracks.
export function pickRelease(releases) {
  const score = (r) => {
    const formats = (r.media || []).map((m) => m.format || '');
    return (r['text-representation']?.script === 'Latn' ? 8 : r['text-representation']?.script ? 0 : 4)
      + (formats.includes('Digital Media') ? 3 : formats.some((f) => /CD/.test(f)) ? 2 : 0)
      + (r.country === 'XW' ? 2 : ['US', 'GB', 'XE'].includes(r.country) ? 1 : 0)
      + (r.status === 'Official' ? 1 : 0);
  };
  const tracks = (r) => (r.media || []).reduce((n, m) => n + (m.tracks?.length || 0), 0);
  return [...(releases || [])].filter((r) => tracks(r) > 0)
    .sort((a, b) => score(b) - score(a) || tracks(b) - tracks(a) || String(a.date || '9999').localeCompare(String(b.date || '9999')))[0] || null;
}

const credit = (list) => (list || []).map((a) => `${cleanName(a?.name || a?.artist?.name)}${a?.joinphrase || ''}`).join('').trim();

// A MusicBrainz release (with recordings + artist credits + its release group) → the album the page shows.
export function shapeAlbum(groupId, release) {
  if (!release) return null;
  const group = release['release-group'] || {};
  const artist = credit(release['artist-credit']) || credit(group['artist-credit']);
  const tracks = [];
  const discs = (release.media || []).filter((m) => m.tracks?.length);
  for (const [i, m] of discs.entries()) {
    for (const t of m.tracks) {
      const title = cleanName(t.title || t.recording?.title);
      if (!title) continue;
      const by = credit(t['artist-credit'] || t.recording?.['artist-credit']);
      const ms = Number(t.length || t.recording?.length);
      tracks.push({ title, ...(by && by !== artist ? { artist: by } : {}), ...(ms > 0 ? { length: Math.round(ms / 1000) } : {}), ...(discs.length > 1 ? { disc: i + 1 } : {}) });
      if (tracks.length >= MAX_TRACKS) break;
    }
  }
  if (!tracks.length) return null;
  const title = cleanName(group.title || release.title);
  return {
    id: groupId, title, artist: artist || null,
    year: year(group['first-release-date'] || release.date),
    kind: albumKind(title, artist, tracks),
    cover: `https://coverartarchive.org/release-group/${groupId}/front-250`,
    url: `https://musicbrainz.org/release-group/${groupId}`,
    tracks,
  };
}

// "score" when the title says so, "songs" when the tracks are by several artists (a compilation of the
// songs heard in it), otherwise just "album" (one artist's soundtrack, often the score by another name).
export function albumKind(title, artist, tracks) {
  if (/\bscore\b/i.test(title)) return 'score';
  if (/^various artists$/i.test(artist || '') || new Set(tracks.map((t) => t.artist || artist)).size > 2) return 'songs';
  return 'album';
}
// Songs first, then other albums, then the score; oldest first within each.
const KIND_ORDER = { songs: 0, album: 1, score: 2 };
export const albumOrder = (a, b) => (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1) || (a.year || 9999) - (b.year || 9999);

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The SPARQL answer → album ids (in order, no repeats) and Wikipedia pages.
export function readWikidata(json) {
  const rows = json?.results?.bindings || [];
  const albums = [], wiki = {};
  for (const r of rows) {
    const mb = r.mb?.value;
    if (MBID.test(mb || '') && !albums.includes(mb)) albums.push(mb);
    for (const lang of ['en', 'sv']) {
      const url = r[`${lang}wiki`]?.value;
      if (!wiki[lang] && /^https:\/\/(en|sv)\.wikipedia\.org\/wiki\/\S+$/.test(url || '')) wiki[lang] = url;
    }
    if (!wiki.item && /^http:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(r.item?.value || '')) wiki.item = r.item.value.replace('http://', 'https://').replace('/entity/', '/wiki/');
  }
  return { albums, wiki };
}

export function createDetails({ tmdb, country = () => 'US', cacheFile = null, enabled = true, fetch = globalThis.fetch, log = () => {}, now = Date.now } = {}) {
  let cache = {};
  try { cache = cacheFile ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}; } catch { cache = {}; }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  const failed = new Map();   // key -> time of a failed lookup (memory only)
  const running = new Map();  // key -> promise
  let saveTimer = null;
  const save = () => {
    if (!cacheFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const keys = Object.keys(cache);
      if (keys.length > MAX_KEPT) for (const k of keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - MAX_KEPT)) delete cache[k];
      const tmp = `${cacheFile}.tmp`;
      fs.promises.mkdir(path.dirname(tmp), { recursive: true }).then(() => fs.promises.writeFile(tmp, JSON.stringify(cache))).then(() => fs.promises.rename(tmp, cacheFile)).catch((e) => log(`[details] cache save: ${e.message}`));
    }, 2000);
    saveTimer.unref?.();
  };

  const get = async (url, accept = 'application/json') => {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw Object.assign(new Error(`${new URL(url).host} answered ${r.status}`), { status: r.status });
    return r.json();
  };
  // MusicBrainz, one request at a time with a gap; a busy answer (503) is tried once more.
  let queue = Promise.resolve();
  let last = 0;
  const mb = (route) => {
    const run = queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const wait = last + MB_GAP_MS * (attempt + 1) - now();
        if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
        last = now();
        try { return await get(`${MUSICBRAINZ}/${route}${route.includes('?') ? '&' : '?'}fmt=json`); } catch (e) { if (e.status !== 503 || attempt >= 2) throw e; }
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  const wikidata = async (type, id) => {
    const prop = type === 'tv' ? 'P4983' : 'P4947';
    const query = `SELECT ?item ?mb ?enwiki ?svwiki WHERE { ?item wdt:${prop} "${Number(id)}" .
      OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?svwiki schema:about ?item; schema:isPartOf <https://sv.wikipedia.org/> }
      OPTIONAL { { ?item wdt:P406 ?album } UNION { ?album wdt:P9899 ?item } ?album wdt:P436 ?mb } } LIMIT 40`;
    return readWikidata(await get(`${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`, 'application/sparql-results+json'));
  };

  const searchSoundtracks = async (type, d) => {
    const titles = [...new Set([type === 'tv' ? d.name : d.title, type === 'tv' ? d.original_name : d.original_title].filter(Boolean))];
    const from = year(type === 'tv' ? d.first_air_date : d.release_date);
    if (!titles.length || !from) return [];
    const to = type === 'tv' ? (d.status === 'Returning Series' ? new Date(now()).getUTCFullYear() : year(d.last_air_date) || from) : from;
    const crew = type === 'tv' ? d.aggregate_credits?.crew : d.credits?.crew;
    const composers = (crew || []).filter((c) => (c.jobs ? c.jobs.map((j) => j.job) : [c.job]).some((j) => ['Original Music Composer', 'Music', 'Composer'].includes(j))).map((c) => c.name);
    const q = `releasegroup:"${titles[0].replace(/["\\]/g, ' ')}" AND secondarytype:soundtrack`;
    const res = await mb(`release-group?query=${encodeURIComponent(q)}&limit=15`);
    return (res['release-groups'] || []).filter((g) => (g.score ?? 100) >= 50 && MBID.test(g.id || '') && soundtrackMatches(g, { titles, from, to, composers })).map((g) => g.id);
  };

  const album = async (groupId) => {
    const res = await mb(`release?release-group=${groupId}&inc=recordings+artist-credits+release-groups&status=official&limit=12`);
    return shapeAlbum(groupId, pickRelease(res.releases));
  };

  const lookup = async (type, id, d) => {
    let found = { albums: [], wiki: {} };
    try { found = await wikidata(type, id); } catch (e) { log(`[details] Wikidata ${type}/${id}: ${e.message}`); found.failed = true; }
    if (!found.albums.length) {
      try { found.albums = await searchSoundtracks(type, d); } catch (e) { log(`[details] MusicBrainz search ${type}/${id}: ${e.message}`); found.failed = true; }
    }
    const albums = [];
    for (const groupId of found.albums.slice(0, MAX_ALBUMS)) {
      try { const a = await album(groupId); if (a) albums.push(a); } catch (e) { log(`[details] MusicBrainz album ${groupId}: ${e.message}`); found.failed = true; }
    }
    albums.sort(albumOrder);
    return { albums, wiki: found.wiki, failed: Boolean(found.failed) && !albums.length };
  };

  // Music + Wikipedia for a title: the cached answer, or null while it's looked up (a lookup starts then).
  function extras(type, id, d) {
    if (!enabled) return { done: true, value: null };
    const key = `${type}:${id}`;
    const hit = cache[key];
    const fresh = hit && now() - hit.at < (hit.albums?.length ? FOUND_DAYS : NOTHING_DAYS) * DAY;
    if (fresh) return { done: true, value: hit };
    if (failed.has(key) && now() - failed.get(key) < FAILED_MS) return { done: true, value: hit || null };
    if (!running.has(key)) {
      const p = lookup(type, id, d).then((value) => {
        if (value.failed) failed.set(key, now());
        else { cache[key] = { at: now(), albums: value.albums, wiki: value.wiki }; save(); }
        return value.failed ? hit || null : cache[key];
      }).catch((e) => { failed.set(key, now()); log(`[details] ${key}: ${e.message}`); return hit || null; })
        .finally(() => running.delete(key));
      running.set(key, p);
    }
    return { done: false, promise: running.get(key), value: hit || null };
  }

  // Everything for the page. Waits up to `waitMs` for a soundtrack lookup; past that the answer says
  // `musicPending` and the page asks again a little later (the lookup keeps going meanwhile).
  async function titleDetails(type, id, { waitMs = 4000 } = {}) {
    const tv = type === 'tv';
    const d = await tmdb(`/${type}/${id}`, { append_to_response: tv ? 'aggregate_credits,keywords,external_ids' : 'credits,keywords,external_ids,release_dates' });
    const out = shapeDetails(type, id, d, { country: country() });
    let x = extras(type, id, d);
    if (!x.done) {
      const value = await Promise.race([x.promise, new Promise((ok) => { const t = setTimeout(ok, waitMs, undefined); t.unref?.(); })]);
      x = value === undefined ? { done: false, value: x.value } : { done: true, value };
    }
    const value = x.value;
    out.music = { albums: value?.albums || [] };
    if (!x.done) out.musicPending = true;
    const wiki = value?.wiki || {};
    const wikipedia = (country() === 'SE' && wiki.sv) || wiki.en || wiki.sv;
    if (wikipedia) out.links.splice(out.links.findIndex((l) => l.kind === 'tmdb') + 1, 0, { kind: 'wikipedia', url: wikipedia });
    return out;
  }

  return { titleDetails, extras, flush: () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; fs.writeFileSync(cacheFile, JSON.stringify(cache)); } } };
}
