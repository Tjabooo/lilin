#!/usr/bin/env node
// Checks the vibes in src/vibes.js against TMDB: every keyword ID still has the name written next to it,
// every anchor ID is the title written next to it, and every vibe finds enough titles.
//   TMDB_TOKEN=… node tools/vibes-check.mjs           check everything
//   TMDB_TOKEN=… node tools/vibes-check.mjs ID [ID…]  also list what those vibes find, best first
import { KEYWORDS, VIBES, createVibes } from '../src/vibes.js';

const token = process.env.TMDB_TOKEN;
if (!token) { console.error('Set TMDB_TOKEN (the same token as in .env).'); process.exit(2); }

const cache = new Map();
async function tmdb(endpoint, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('language', 'en-US');
  if (cache.has(url.href)) return cache.get(url.href);
  const p = (async () => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
      if (r.status === 429 && attempt < 5) { await new Promise((ok) => setTimeout(ok, 1000 * (attempt + 1))); continue; }
      if (!r.ok) throw new Error(`${endpoint}: TMDB ${r.status}`);
      return r.json();
    }
  })();
  cache.set(url.href, p);
  return p;
}
const mapTitle = (x, type) => ({
  id: x.id, type, title: x.title || x.name, year: Number((x.release_date || x.first_air_date || '').slice(0, 4)) || null,
  rating: x.vote_average ? Math.round(x.vote_average * 10) / 10 : null, votes: x.vote_count || 0,
  poster: x.poster_path || null, genres: x.genre_ids || [],
});

let problems = 0;
const fail = (line) => { problems++; console.log(`  ✗ ${line}`); };

console.log('Keywords');
const ids = new Map();
for (const [key, [id, name]] of Object.entries(KEYWORDS)) {
  if (ids.has(id) && ids.get(id) !== key) fail(`${key} and ${ids.get(id)} are both ${id}`);
  ids.set(id, key);
  const k = await tmdb(`/keyword/${id}`).catch((e) => ({ error: e.message }));
  if (k.name !== name) fail(`${key}: ${id} is "${k.name || k.error}", not "${name}"`);
}

console.log('Anchors');
for (const v of VIBES) {
  for (const [type, id, title] of v.anchors) {
    const d = await tmdb(`/${type}/${id}`).catch((e) => ({ error: e.message }));
    if ((d.title || d.name) !== title) fail(`${v.id}: ${type} ${id} is "${d.title || d.name || d.error}", not "${title}"`);
  }
}

console.log('Vibes');
const vibes = createVibes({ tmdb, mapTitle, language: () => 'en' });
const show = new Set(process.argv.slice(2));
for (const v of VIBES) {
  const data = await vibes.vibe(v.id, { month: v.months?.[0] });
  const films = data.results.filter((t) => t.type === 'movie').length, shows = data.results.length - films;
  console.log(`  ${v.id}: ${data.results.length} titles (${films} films, ${shows} shows)`);
  if (data.results.length < 30) fail(`${v.id} finds only ${data.results.length} titles`);
  if (show.has(v.id) || show.has('all')) {
    console.log(`     ${data.results.map((t) => `${t.title} (${t.type === 'tv' ? 'TV ' : ''}${t.year})#${t.type}:${t.id}`).join('; ')}`);
  }
}
console.log(problems ? `${problems} problem(s)` : 'All good');
process.exit(problems ? 1 : 0);
