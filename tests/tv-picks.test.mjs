import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTvPicks, candidates, draw, firstSeason, MAX_AGE, EPISODES } from '../src/tv-picks.js';
import { Channels, poolFor } from '../src/channels.js';

const GB = 1024 ** 3, DAY = 24 * 3600 * 1000;
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tvpicks-')), 'picks.json');

// A fake server: TMDB lists, jobs that add one torrent each, torrents that finish when told.
function fakeServer({ cap = 100 * GB, free = 5000 * GB, here = [] } = {}) {
  const s = { now: Date.UTC(2026, 10, 16, 12), torrents: new Map(), sizes: new Map(), held: new Set(), forgotten: [], dropped: [], jobs: new Map(), started: [] };
  const lists = {
    '/trending/movie/week': [{ id: 1, title: 'Film One' }, { id: 2, title: 'Film Two' }, { id: 3, title: 'Adult', adult: true }],
    '/trending/movie/day': [{ id: 2, title: 'Film Two' }],
    '/trending/tv/week': [{ id: 10, name: 'Show Ten' }, { id: 11, name: 'Talk Show', genre_ids: [10767] }],
    '/trending/tv/day': [],
  };
  const details = {
    '/movie/1': { id: 1, title: 'Film One', out: true }, '/movie/2': { id: 2, title: 'Film Two', out: false },
    '/tv/10': { id: 10, name: 'Show Ten', seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 24 }] },
  };
  s.picks = createTvPicks({
    file: tmpFile(), capBytes: cap, reserveBytes: 300 * GB, now: () => s.now, rand: () => 0,
    tmdb: async (endpoint, params) => (lists[endpoint] ? { results: params.page === 1 ? lists[endpoint] : [] } : details[endpoint]),
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

test('a round picks a film and a show, never one that is not out or already here', async () => {
  const s = fakeServer({ here: [] });
  await s.picks.round();
  assert.deepEqual(s.started.map((p) => `${p.type}:${p.tmdbId}`).sort(), ['movie:1', 'tv:10']);
  const show = s.started.find((p) => p.type === 'tv');
  assert.equal(show.season, 1);
  assert.equal(show.episodes.length, EPISODES);
  // Film Two isn't out: tried, so the next round doesn't look again; Film One and Show Ten are taken.
  await new Promise((r) => setImmediate(r));
  s.jobs.forEach((j) => { j.state = 'done'; });
  s.now += 3 * 3600 * 1000;
  await s.picks.round();
  assert.equal(s.started.length, 2, 'nothing left to pick');
  assert.deepEqual(s.picks.summary().picks.map((p) => p.state).sort(), ['downloading', 'downloading']);

  const here = fakeServer({ here: ['movie:1', 'tv:10'] });
  await here.picks.round();
  assert.equal(here.started.length, 0);
});

test('finished picks are tracked, kept ones are never deleted, the rest leave over the cap or with age', async () => {
  const s = fakeServer({ cap: 40 * GB });
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
  assert.equal(s.dropped.length, 2);
  assert.equal(s.picks.data().picks.filter((p) => p.state === 'failed').length, 2);
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
