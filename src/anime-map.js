// Anime map: which Lilin (TMDB) title a MyAnimeList or AniList entry is, so a linked anime list's posters open the
// title page here instead of the anime site. The map is Fribb's anime-lists (github.com/Fribb/anime-lists, the
// community list Kometa, Shoko and others use): every MAL / AniList id with its TMDB id, when it has one. It's read
// once a week and kept small on disk (only entries with a TMDB id). A sequel season (its own entry on both sites)
// maps to the show itself.
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
export const REFRESH = 7 * 24 * 3600 * 1000;

let file = null;
let map = { at: 0, mal: {}, anilist: {} };

// The compact map from Fribb's list: { mal: { id: 'tv:30981' }, anilist: { … } }.
export function compact(list, at = Date.now()) {
  const out = { at, mal: {}, anilist: {} };
  for (const x of Array.isArray(list) ? list : []) {
    const t = x?.themoviedb_id;
    const key = t?.tv ? `tv:${Number(t.tv)}` : t?.movie ? `movie:${Number(t.movie)}` : null;
    if (!key || /NaN|:0$/.test(key)) continue;
    if (Number(x.mal_id) > 0) out.mal[x.mal_id] = key;
    if (Number(x.anilist_id) > 0) out.anilist[x.anilist_id] = key;
  }
  return out;
}

// cacheDir: where the map is kept. Loads it, and reads it again when it's a week old (in the background).
export function init({ cacheDir, fetcher = fetch } = {}) {
  file = cacheDir ? path.join(cacheDir, 'anime-map.json') : null;
  try { const m = JSON.parse(fs.readFileSync(file, 'utf8')); if (m?.mal && m?.anilist) map = m; } catch { /* first start: read below */ }
  return refresh({ fetcher });
}

export async function refresh({ fetcher = fetch, now = Date.now() } = {}) {
  if (now - (map.at || 0) < REFRESH) return false;
  try {
    const r = await fetcher(SOURCE, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    const next = compact(await r.json(), now);
    if (Object.keys(next.mal).length < 1000) throw new Error('the list looks cut short');
    map = next;
    if (file) await fs.promises.mkdir(path.dirname(file), { recursive: true }).then(() => fs.promises.writeFile(file, JSON.stringify(map))).catch(() => {});
    return true;
  } catch (e) {
    console.log(`[anime-map] ${e.message || e}`);
    map.at = now - REFRESH + 3600 * 1000; // try again in an hour
    return false;
  }
}

export const use = (m) => { map = m; }; // tests

// The Lilin title key ('tv:30981') of an entry's MyAnimeList / AniList page, or null when the map doesn't know it.
const PAGE = /^https:\/\/(myanimelist\.net|anilist\.co)\/anime\/(\d+)(?:[/?#]|$)/;
export function keyOf(url) {
  const m = PAGE.exec(String(url || ''));
  if (!m) return null;
  return (m[1] === 'anilist.co' ? map.anilist : map.mal)[m[2]] || null;
}
