import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTvPicks, candidates, draw, firstSeason, chooseChannel, pickPages, CHANNELS, MAX_AGE, EPISODES } from '../src/tv-picks.js';
import { Channels, poolFor } from '../src/channels.js';

const GB = 1024 ** 3, DAY = 24 * 3600 * 1000;
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tvpicks-')), 'picks.json');

// A fake server: TMDB lists, jobs that add one torrent each, torrents that finish when told.
function fakeServer({ cap = 100 * GB, free = 5000 * GB, here = [], sizes = {} } = {}) {
  const s = { now: Date.UTC(2026, 10, 16, 12), torrents: new Map(), sizes: new Map(), held: new Set(), forgotten: [], dropped: [], jobs: new Map(), started: [] };
  // TMDB: discover answers by genre (page 1 only), trending films, details.
  const discover = {
    'tv|16': [{ id: 20, name: 'Anime A', genre_ids: [16] }],
    'tv|35': [{ id: 10, name: 'Show Ten', genre_ids: [35] }, { id: 11, name: 'Talk Show', genre_ids: [35, 10767] }],
    'movie|': [{ id: 1, title: 'Film One' }, { id: 2, title: 'Film Two' }, { id: 3, title: 'Adult', adult: true }],
  };
  const tmdbList = (endpoint, params) => {
    if (params.page !== 1) return [];
    if (endpoint === '/trending/movie/week') return [{ id: 2, title: 'Film Two' }];
    const type = endpoint === '/discover/tv' ? 'tv' : endpoint === '/discover/movie' ? 'movie' : null;
    return (type && discover[`${type}|${params.with_genres || ''}`]) || [];
  };
  const details = {
    '/movie/1': { id: 1, title: 'Film One', out: true }, '/movie/2': { id: 2, title: 'Film Two', out: false },
    '/tv/10': { id: 10, name: 'Show Ten', seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 24 }] },
    '/tv/20': { id: 20, name: 'Anime A', seasons: [{ season_number: 1, episode_count: 12 }] },
  };
  s.picks = createTvPicks({
    file: tmpFile(), capBytes: cap, reserveBytes: 300 * GB, now: () => s.now, rand: () => 0,
    tmdb: async (endpoint, params) => (details[endpoint] || { results: tmdbList(endpoint, params) }),
    channelSizes: () => sizes,
    filmOut: (d) => ({ out: Boolean(d.out) }),
    onServer: () => new Set(here),
    start: (pick) => {
      const id = `job${s.started.length}`;
      s.started.push(pick);
      s.jobs.set(id, { state: 'running' });
      const hash = `h${s.started.length}`;
      s.torrents.set(hash, { hash, progress: 0, size: 10 * GB });
      queueMicrotask(() => s.picks.noteHash(pick.id, hash));
      return id;
    },
    job: (id) => s.jobs.get(id) || null,
    torrents: async (hashes) => hashes.map((h) => s.torrents.get(h)).filter(Boolean),
    sizeOf: (k) => s.sizes.get(k) ?? null, held: (k) => s.held.has(k),
    forget: (k) => s.forgotten.push(k), dropTorrent: (h) => { s.dropped.push(h); s.torrents.delete(h); },
    freeBytes: () => free,
  });
  return s;
}

test('trending lists become candidates: no adult titles, no talk shows, duplicates keep their best rank', () => {
  const list = candidates([
    { type: 'movie', results: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, adult: true }] },
    { type: 'movie', results: [{ id: 2, title: 'B' }] },
    { type: 'tv', results: [{ id: 2, name: 'Show B' }, { id: 9, genre_ids: [10764] }] },
  ]);
  assert.deepEqual(list.map((c) => `${c.type}:${c.id}@${c.rank}`), ['movie:1@0', 'movie:2@0', 'tv:2@0']);
  assert.equal(draw(list, () => 0), list[0]);
  assert.equal(draw(list, () => 0.999), list.at(-1));
});

test('a show gets its first season, only the start of a long one', () => {
  assert.deepEqual(firstSeason({ seasons: [{ season_number: 0, episode_count: 5 }, { season_number: 1, episode_count: 8 }] }), { season: 1, episodes: null });
  assert.equal(firstSeason({ seasons: [{ season_number: 1, episode_count: 40 }] }).episodes.length, EPISODES);
  assert.equal(firstSeason({ seasons: [] }), null);
});

test('the emptiest channel is the likeliest to get a pick, but not the only one', () => {
  const sizes = Object.fromEntries(Object.keys(CHANNELS).map((c) => [c, 40]));
  sizes.anime = 0;
  const wins = {};
  for (let i = 0; i < 1000; i++) { const c = chooseChannel(sizes, [], new Set(), () => i / 1000); wins[c] = (wins[c] || 0) + 1; }
  assert.ok(wins.anime > 500, `anime won ${wins.anime} of 1000`);
  assert.ok(Object.keys(wins).length === Object.keys(CHANNELS).length, 'every channel still gets a chance');
  assert.equal(chooseChannel(sizes, [], new Set(['anime']), () => 0) !== 'anime', true);
  for (let i = 0; i < 50; i++) { const [x, y] = pickPages(() => (i * 0.137) % 1); assert.ok(x !== y && x >= 1 && x <= 5 && y >= 1 && y <= 5); }
});

test('a round picks for several channels, never a title that is not out, a talk show or one already here', async () => {
  const s = fakeServer();
  await s.picks.round();
  // rand 0: the channels in order, one pick each: Anime, Sitcoms, then Films (Film Two isn't out, Film One is).
  assert.deepEqual(s.started.map((p) => `${p.channel}:${p.type}:${p.tmdbId}`), ['anime:tv:20', 'sitcoms:tv:10', 'films:movie:1']);
  const show = s.started.find((p) => p.tmdbId === 10);
  assert.equal(show.season, 1);
  assert.equal(show.episodes.length, EPISODES);
  assert.equal(s.started[0].episodes, null, 'a short first season comes whole');
  await new Promise((r) => setImmediate(r));
  s.jobs.forEach((j) => { j.state = 'done'; });
  s.now += 3 * 3600 * 1000;
  await s.picks.round();
  assert.equal(s.started.length, 3, 'nothing left to pick');
  assert.deepEqual(s.picks.summary().picks.map((p) => p.state), ['downloading', 'downloading', 'downloading']);

  const here = fakeServer({ here: ['movie:1', 'tv:10', 'tv:20'] });
  await here.picks.round();
  assert.equal(here.started.length, 0);
});

test('finished picks are tracked, kept ones are never deleted, the rest leave over the cap or with age', async () => {
  const s = fakeServer({ cap: 40 * GB, here: ['tv:20'] });
  await s.picks.round();
  await new Promise((r) => setImmediate(r));
  s.jobs.forEach((j) => { j.state = 'done'; });
  const [film, show] = ['movie', 'tv'].map((t) => s.picks.data().picks.find((p) => p.type === t));
  s.picks.noteFiles(film.hashes[0], ['films/film.one']);
  s.picks.noteFiles(show.hashes[0], ['shows/show.ten.s01e01', 'shows/show.ten.s01e02']);
  assert.ok(s.picks.isPick('films/film.one'));
  for (const t of s.torrents.values()) t.progress = 1;
  s.sizes.set('films/film.one', 12 * GB);
  s.sizes.set('shows/show.ten.s01e01', 2 * GB);
  s.sizes.set('shows/show.ten.s01e02', 2 * GB);
  s.held.add('shows/show.ten.s01e01'); // someone pressed Add to library
  s.now += 3 * 3600 * 1000;
  await s.picks.round();
  assert.deepEqual(s.forgotten, [], 'under the cap: nothing goes');
  assert.equal(s.picks.summary().bytes, 14 * GB, 'the kept episode no longer counts');

  s.now += MAX_AGE;
  await s.picks.round();
  assert.deepEqual(s.forgotten.sort(), ['films/film.one', 'shows/show.ten.s01e02'], 'old picks go, the kept episode stays');
  assert.ok(!s.picks.isPick('films/film.one'));
});

test('a download that never finishes is given up and its torrent removed', async () => {
  const s = fakeServer();
  await s.picks.round();
  await new Promise((r) => setImmediate(r));
  s.jobs.forEach((j) => { j.state = 'done'; });
  s.now += 4 * DAY;
  await s.picks.round();
  assert.equal(s.dropped.length, 3);
  assert.equal(s.picks.data().picks.filter((p) => p.state === 'failed').length, 3);
});

test('nothing is picked when the cap is 0 or the drive is short of its reserve', async () => {
  const off = fakeServer({ cap: 0 });
  await off.picks.round();
  assert.equal(off.started.length, 0);
  const full = fakeServer({ free: 310 * GB });
  await full.picks.round();
  assert.equal(full.started.length, 0);
});

test('Fresh plays a show in order between other titles, and remembers where it got to', async () => {
  const ep = (n) => ({ key: `show-1-${n}`, id: `s${n}`, kind: 'episode', show: 'show', showTitle: 'Show', title: 'Show', season: 1, episode: n, genres: [18], fresh: true });
  const items = [ep(1), ep(2), ep(3), { key: 'f-a', id: 'fa', kind: 'film', title: 'A', genres: [28], fresh: true },
    { key: 'f-b', id: 'fb', kind: 'film', title: 'B', genres: [28], fresh: true }, { key: 'f-old', id: 'fo', kind: 'film', title: 'Old', genres: [28] }];
  const fresh = { id: 'fresh', order: 'series' };
  const pool = poolFor(fresh, items);
  assert.ok(!pool.some((i) => i.key === 'f-old'));
  let now = Date.UTC(2026, 10, 16, 20);
  const ch = new Channels({ now: () => now });
  await ch.extend(fresh, pool, now + 6 * 3600 * 1000, async () => ({ duration: 1500 }));
  const shown = ch.data.plans.fresh.entries.filter((e) => e.m.show === 'show').map((e) => e.m.episode);
  assert.ok(shown.length >= 2);
  assert.deepEqual(shown.slice(0, 3), [1, 2, 3].slice(0, Math.min(3, shown.length)), 'episodes air in order');
  // Hours later the guide has moved on; the show carries on after the last episode that aired.
  const last = shown.at(-1);
  now += 12 * 3600 * 1000;
  await ch.extend(fresh, pool, now + 3600 * 1000, async () => ({ duration: 1500 }));
  assert.ok(ch.data.plans.fresh.pos?.show, 'position kept');
  const next = ch.data.plans.fresh.entries.find((e) => e.m.show === 'show');
  if (next) assert.equal(next.m.episode, (last % 3) + 1);
});

test('the new channels: Drama is series only, Sci-Fi and Action take films and series, anime and docs stay out', () => {
  const ep = (show, genres, extra = {}) => ({ key: `${show}-1-1`, kind: 'episode', show, showTitle: show, season: 1, episode: 1, genres, ...extra });
  const film = (name, genres) => ({ key: `f-${name}`, kind: 'film', title: name, genres });
  const items = [ep('crime', [80]), ep('dramedy', [18, 35]), ep('space', [10765]), ep('anime', [16, 10765], { anime: true }),
    film('heist', [80]), film('dune', [878, 12]), film('rocks', [99, 878]), ep('quest', [10759])];
  const keys = (id) => poolFor({ id }, items).map((i) => i.key).sort();
  assert.deepEqual(keys('drama'), ['crime-1-1']);
  assert.deepEqual(keys('scifi'), ['f-dune', 'space-1-1']);
  assert.deepEqual(keys('action'), ['f-dune', 'quest-1-1']);
});
