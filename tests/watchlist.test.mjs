import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WatchlistStore, runRound, filmRelease, filmOut, airedAfter, baselineFrom, retryDelay, startSeasons } from '../src/watchlist.js';
import { comingUp, newEpisodes, watchStatus, listLine, dayLabel } from '../public/watchlist.js';
import { topicFor } from '../src/live.js';
import { killTree } from './kill-tree.mjs';

const HOUR = 3600e3, DAY = 24 * HOUR;
const at = (iso) => Date.parse(`${iso}T12:00:00Z`);
const tempStore = async () => new WatchlistStore(await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-watchlist-')));
const meta = (title) => ({ title, year: 2026, poster: null, backdrop: null, overview: null, rating: null });

test('a film is expected at its earliest digital or disc release, else its first release date', () => {
  const details = { release_date: '2026-07-01', release_dates: { results: [
    { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2026-07-01T00:00:00.000Z' }, { type: 4, release_date: '2026-09-10T00:00:00.000Z' }] },
    { iso_3166_1: 'SE', release_dates: [{ type: 5, release_date: '2026-09-02T00:00:00.000Z' }] }] } };
  assert.deepEqual(filmRelease(details), { date: '2026-09-02', kind: 'disc' });
  assert.deepEqual(filmRelease({ release_date: '2026-07-01' }), { date: '2026-07-01', kind: 'cinema' });
  assert.deepEqual(filmRelease({}), { date: null, kind: null });
});

test('following starts after the last aired episode and never counts specials', () => {
  assert.deepEqual(baselineFrom({ last_episode_to_air: { season_number: 2, episode_number: 4 } }), { season: 2, episode: 4 });
  assert.deepEqual(baselineFrom({ last_episode_to_air: { season_number: 0, episode_number: 3 } }), { season: 0, episode: 0 });
  assert.deepEqual(baselineFrom({}), { season: 0, episode: 0 });
  const eps = [
    { season: 2, episode: 4, airDate: '2026-11-01' }, { season: 2, episode: 5, airDate: '2026-11-05' },
    { season: 2, episode: 6, airDate: '2026-11-12' }, { season: 3, episode: 1, airDate: null }, { season: 0, episode: 9, airDate: '2026-11-02' }];
  assert.deepEqual(airedAfter(eps, { season: 2, episode: 4 }, '2026-11-05').map((e) => e.episode), [5]);
  assert.equal(retryDelay(1), HOUR);
  assert.equal(retryDelay(99), DAY);
});

test('a saved film waits for its release, then downloads once, retrying while nothing good is out', async () => {
  const store = await tempStore();
  const user = { id: 1, canDownload: true };
  store.set(1, 'movie', 10, meta('Late Film'), { saved: true, auto: true });
  store.set(1, 'movie', 11, meta('Just a reminder'), { saved: true });
  let now = at('2026-11-05');
  const downloads = [];
  let outcome = { state: 'done', outcome: 'none', message: 'No release clearly matches this title.' };
  const deps = {
    now: () => now, user: (id) => (id === 1 ? user : null), canAuto: (u) => u.canDownload,
    film: async (id) => (id === 10 ? { release_date: '2026-10-01', release_dates: { results: [{ release_dates: [{ type: 4, release_date: '2026-11-07' }] }] } } : { release_date: '2027-03-01' }),
    download: async (u, spec) => { downloads.push(spec); return outcome; },
  };
  await runRound(store, deps);
  let [late, reminder] = [store.list(1).find((i) => i.id === 10), store.list(1).find((i) => i.id === 11)];
  assert.equal(late.release, '2026-11-07');
  assert.equal(late.state, 'waiting');
  assert.equal(reminder.release, '2027-03-01');
  assert.equal(downloads.length, 0, 'nothing downloads before the release, and never without the switch');

  now = at('2026-11-08');
  await runRound(store, deps);
  late = store.list(1).find((i) => i.id === 10);
  assert.equal(downloads.length, 1);
  assert.equal(late.state, 'looking');
  assert.match(late.note, /No release/);
  await runRound(store, deps);
  assert.equal(downloads.length, 1, 'waits before trying again');

  now += 2 * HOUR;
  outcome = { state: 'done', outcome: 'started', message: 'Downloading.' };
  await runRound(store, deps);
  assert.equal(downloads.length, 2);
  assert.equal(store.list(1).find((i) => i.id === 10).state, 'got');
  now += 3 * DAY;
  await runRound(store, deps);
  assert.equal(downloads.length, 2, 'a film is downloaded only once');
});

test('a followed show downloads newly aired episodes only, marks them new and gives up on old misses', async () => {
  const store = await tempStore();
  const user = { id: 7, canDownload: true };
  store.set(7, 'tv', 500, meta('Followed'), { follow: true, auto: true, baseline: { season: 1, episode: 2 } });
  let now = at('2026-11-05');
  const season1 = [1, 2, 3, 4, 5].map((n) => ({ episode_number: n, air_date: `2026-11-0${n}` }));
  const calls = [];
  let answer = (spec) => ({ state: 'done', outcome: 'partial', have: [3], queued: [], added: [{ episode: 4, episodes: [4] }], unavailable: [{ episode: 5, reason: 'Nothing found.' }] });
  const deps = {
    now: () => now, user: () => user, canAuto: () => true,
    show: async () => ({ last_episode_to_air: { season_number: 1, episode_number: 5 }, next_episode_to_air: { season_number: 1, episode_number: 6, name: 'Six', air_date: '2026-11-12' } }),
    season: async (id, n) => ({ episodes: n === 1 ? season1 : [] }),
    download: async (u, spec) => { calls.push(spec); return answer(spec); },
  };
  await runRound(store, deps);
  assert.deepEqual(calls, [{ type: 'tv', tmdbId: 500, season: 1, episodes: [3, 4, 5] }], 'nothing from before following');
  let item = store.list(7)[0];
  assert.deepEqual(item.nextEpisode, { season: 1, episode: 6, name: 'Six', airDate: '2026-11-12' });
  assert.deepEqual(item.newEpisodes, [{ season: 1, episode: 4 }], 'one you already had is not new');
  assert.deepEqual(item.waiting.map((e) => e.episode), [5]);
  assert.equal(item.state, 'looking');

  answer = () => ({ state: 'done', outcome: 'none', have: [], queued: [], added: [], unavailable: [{ episode: 5, reason: 'Nothing found.' }] });
  now += 2 * HOUR;
  await runRound(store, deps);
  assert.deepEqual(calls.at(-1).episodes, [5], 'only the missing one is looked for again');
  now = at('2026-11-21');
  await runRound(store, deps);
  item = store.list(7)[0];
  assert.deepEqual(item.missed.map((e) => e.episode), [5]);
  assert.equal(item.state, 'waiting');

  assert.equal(store.markSeen(7, 500), 1);
  assert.deepEqual(store.list(7)[0].newEpisodes, []);
  // Unfollowing forgets the episodes; a show neither saved nor followed leaves the list.
  assert.equal(store.set(7, 'tv', 500, null, { follow: false }), null);
  assert.deepEqual(store.list(7), []);
});

test('following without download rights only tracks what is coming', async () => {
  const store = await tempStore();
  store.set(2, 'tv', 9, meta('Watch only'), { follow: true, auto: true, baseline: { season: 1, episode: 0 } });
  let downloaded = false;
  await runRound(store, {
    now: () => at('2026-11-05'), user: () => ({ id: 2, canDownload: false }), canAuto: (u) => u.canDownload,
    show: async () => ({ last_episode_to_air: { season_number: 1, episode_number: 1 }, next_episode_to_air: null }),
    season: async () => ({ episodes: [{ episode_number: 1, air_date: '2026-11-01' }] }),
    download: async () => { downloaded = true; },
  });
  assert.equal(downloaded, false);
  assert.deepEqual(store.list(2)[0].waiting, []);
});

test('the page words: dates, Coming up, New badges and status lines', () => {
  const today = '2026-11-05';
  assert.equal(dayLabel('2026-11-05', today), 'Today');
  assert.equal(dayLabel('2026-11-06', today), 'Tomorrow');
  assert.equal(dayLabel('2026-11-12', today), 'Thu 12 Nov');
  assert.equal(dayLabel('2026-11-09', today), 'Monday 9 Nov');
  assert.equal(dayLabel('2027-01-20', today), '20 Jan 2027');
  const items = [
    { type: 'movie', id: 1, title: 'Film', saved: true, release: '2026-12-01', releaseKind: 'digital' },
    { type: 'movie', id: 2, title: 'Old film', saved: true, release: '2020-01-01', releaseKind: 'cinema' },
    { type: 'tv', id: 3, title: 'Show', follow: true, nextEpisode: { season: 2, episode: 5, name: 'Five', airDate: '2026-11-06' } },
    { type: 'tv', id: 4, title: 'Saved show', saved: true, follow: false, nextEpisode: { season: 1, episode: 1, airDate: '2026-11-07' } },
  ];
  assert.deepEqual(comingUp(items, today).map((c) => [c.item.id, c.when, c.what]), [[3, 'Tomorrow', 'S02E05 · Five'], [1, 'Tue 1 Dec', 'Out to stream']]);
  const show = { type: 'tv', follow: true, auto: true, newEpisodes: [{ season: 2, episode: 4 }, { season: 2, episode: 5 }], waiting: [{ season: 2, episode: 6 }], missed: [],
    nextEpisode: { season: 2, episode: 7, airDate: '2026-11-06' } };
  assert.equal(newEpisodes(show, [{ season: 2, episode: 4, done: true }, { season: 2, episode: 5, done: false }]), 1, 'only episodes ready to play');
  assert.equal(watchStatus(show, { today, autoDownload: true }), 'Next: S02E07 airs tomorrow. Looking for S02E06.');
  assert.equal(watchStatus(show, { today, autoDownload: false }), 'Next: S02E07 airs tomorrow.');
  assert.equal(watchStatus({ type: 'movie', saved: true, auto: true, state: 'waiting', release: '2026-12-01' }, { today, autoDownload: true }),
    'Downloads by itself once it’s out on Tue 1 Dec.');
  assert.equal(watchStatus({ type: 'movie', saved: true, auto: false, release: '2026-12-01', releaseKind: 'disc' }, { today }), 'Out on disc on Tue 1 Dec.');
  assert.equal(watchStatus({ type: 'movie', saved: true, auto: true, state: 'got' }, { today, autoDownload: true }), 'Downloaded from My list when it came out.');
  assert.equal(watchStatus({ type: 'tv', saved: true, follow: true, state: 'waiting' }, { today, autoDownload: true }), 'New episodes download by themselves as they air.');
  // My list cards on Discover
  assert.equal(listLine({ type: 'movie', release: '2026-12-01', releaseKind: 'digital' }, { today, autoDownload: true }), 'Out to stream · Tue 1 Dec');
  assert.equal(listLine({ type: 'movie', release: '2026-01-01', state: 'got' }, { today, autoDownload: true, coming: true }), 'On its way');
  assert.equal(listLine({ type: 'movie', release: '2026-01-01', state: 'got' }, { today, autoDownload: true, ready: true }), 'Ready to watch');
  assert.equal(listLine({ type: 'movie', release: '2026-01-01', state: 'looking' }, { today, autoDownload: true }), 'Looking for a good copy');
  assert.equal(listLine(show, { today }), '2 new episodes');
  assert.equal(listLine({ ...show, newEpisodes: [] }, { today }), 'S02E07 · Tomorrow');
});

test('watchlist changes reach the person’s other pages', () => {
  assert.deepEqual(topicFor('/api/watchlist'), { topic: 'watchlist', audience: 'user' });
  assert.deepEqual(topicFor('/api/watchlist/seen'), { topic: 'watchlist', audience: 'user' });
});

test('watchlist API: list, validation, removal and a clear message without TMDB', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-watchlist-api-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name.endsWith('.json')) await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0; // 0 = the server picks a free port and prints it (see the ready line below)
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: String(port), ADMIN_EMAILS: 'owner@wl.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
  });
  const call = async (method, p, body, status = 200) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'cf-access-authenticated-user-email': 'owner@wl.test', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data;
  };
  try {
    assert.deepEqual((await call('GET', '/api/watchlist')).items, []);
    await call('POST', '/api/watchlist', { type: 'book', tmdbId: 1, saved: true }, 400);
    await call('POST', '/api/watchlist', { type: 'movie', tmdbId: -4, saved: true }, 400);
    assert.match((await call('POST', '/api/watchlist', { type: 'movie', tmdbId: 603, saved: true }, 503)).error, /TMDB/);
    assert.equal((await call('POST', '/api/watchlist', { type: 'tv', tmdbId: 603, saved: false, follow: false })).item, null);
    assert.equal((await call('POST', '/api/watchlist/seen', { tmdbId: 603 })).cleared, 0);
  } finally {
    killTree(child);
    await exited;
  }
});

test('a film counts as out only once a proper copy can exist (never just in cinemas)', () => {
  const doomsday = { status: 'Post Production', release_date: '2026-12-18', release_dates: { results: [
    { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2026-12-18T00:00:00.000Z' }] }] } };
  assert.equal(filmOut(doomsday, '2026-11-15').out, false);
  assert.equal(filmOut(doomsday, '2026-11-15').cinema, '2026-12-18');
  // in cinemas, no digital date: waits the cinema window
  const cinema = { status: 'Released', release_date: '2026-10-01' };
  assert.deepEqual([filmOut(cinema, '2026-11-15').out, filmOut(cinema, '2026-11-15').expect], [false, '2026-12-30']);
  assert.equal(filmOut(cinema, '2026-12-30').out, true);
  // a digital date wins either way: out early, or later than the window
  const digital = (d) => ({ status: 'Released', release_date: '2026-10-01', release_dates: { results: [{ release_dates: [{ type: 4, release_date: d }] }] } });
  assert.equal(filmOut(digital('2026-11-07'), '2026-11-15').out, true);
  assert.equal(filmOut(digital('2027-02-01'), '2026-12-31').out, false);
  // old films are out whatever new disc dates TMDB lists; undated ones unless unfinished
  assert.equal(filmOut({ release_date: '1999-03-31', release_dates: { results: [{ release_dates: [{ type: 5, release_date: '2027-01-01' }] }] } }, '2026-11-15').out, true);
  assert.equal(filmOut({ status: 'Released' }, '2026-11-15').out, true);
  assert.equal(filmOut({ status: 'In Production' }, '2026-11-15').out, false);
});

test('My list: a show starts with the season after the last episode you finished, the next one near a season’s end', () => {
  const details = { last_episode_to_air: { season_number: 3, episode_number: 4 }, seasons: [
    { season_number: 0, episode_count: 5, air_date: '2019-01-01' }, { season_number: 1, episode_count: 10, air_date: '2020-01-01' },
    { season_number: 2, episode_count: 8, air_date: '2022-01-01' }, { season_number: 3, episode_count: 10, air_date: '2026-10-01' },
    { season_number: 4, episode_count: 10, air_date: '2027-10-01' }] };
  const today = '2026-11-05';
  assert.deepEqual(startSeasons(details, null, today), [1], 'never watched: season 1, never specials');
  assert.deepEqual(startSeasons(details, { season: 1, episode: 4 }, today), [1]);
  assert.deepEqual(startSeasons(details, { season: 1, episode: 8 }, today), [1, 2], 'two from the end: the next season too');
  assert.deepEqual(startSeasons(details, { season: 1, episode: 10 }, today), [2]);
  assert.deepEqual(startSeasons(details, { season: 3, episode: 4 }, today), [3], 'season 4 hasn’t aired');
  assert.deepEqual(startSeasons(details, { season: 3, episode: 10 }, today), []);
  assert.deepEqual(startSeasons({ seasons: [{ season_number: 1, episode_count: 8, air_date: '2027-01-01' }] }, null, today), [], 'not aired: new episodes come as they air');
});

test('My list: a show downloads its first season once, then follows new episodes; a failed season is tried again', async () => {
  const store = await tempStore();
  const user = { id: 1, canDownload: true };
  store.set(1, 'tv', 30, meta('Listed Show'), { saved: true, baseline: { season: 2, episode: 3 } });
  const item = store.list(1)[0];
  assert.equal(item.follow, true, 'shows on My list are followed');
  let now = at('2026-11-05');
  const downloads = [];
  let seasonJob = { state: 'done', outcome: 'none', message: 'No release clearly matches this title.', added: [] };
  const deps = {
    now: () => now, user: () => user, canAuto: () => true, finished: () => null,
    show: async () => ({ last_episode_to_air: { season_number: 2, episode_number: 3 }, next_episode_to_air: null,
      seasons: [{ season_number: 1, episode_count: 8, air_date: '2024-01-01' }, { season_number: 2, episode_count: 8, air_date: '2026-10-01' }] }),
    season: async () => ({ episodes: [] }),
    download: async (u, spec) => { downloads.push(spec); return spec.episodes ? { state: 'done', added: [] } : seasonJob; },
  };
  await runRound(store, deps);
  assert.deepEqual(downloads, [{ type: 'tv', tmdbId: 30, season: 1 }]);
  assert.equal(store.list(1)[0].state, 'looking');
  now += 30 * 60e3;
  await runRound(store, deps);
  assert.equal(downloads.length, 1, 'not before its retry time');
  now += 2 * HOUR;
  seasonJob = { state: 'done', outcome: 'started', added: [{ episodes: [1, 2, 3, 4, 5, 6, 7, 8] }] };
  await runRound(store, deps);
  assert.equal(downloads.length, 2);
  assert.deepEqual(store.list(1)[0].seasons, [1]);
  assert.equal(store.list(1)[0].state, 'waiting');
  now += 4 * HOUR;
  await runRound(store, deps);
  assert.equal(downloads.length, 2, 'a season is fetched once');
});

test('My list: someone who can’t download hears once that a film is out; old saved and followed rows join the list', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-watchlist-'));
  const { DatabaseSync } = (await import('node:module')).createRequire(import.meta.url)('node:sqlite');
  const old = new DatabaseSync(path.join(dir, '.lilin.db'));
  old.exec(`CREATE TABLE watchlist (
        user_id INTEGER NOT NULL, type TEXT NOT NULL, tmdb_id INTEGER NOT NULL,
        title TEXT NOT NULL, year INTEGER, poster TEXT, backdrop TEXT, overview TEXT, rating REAL,
        saved INTEGER NOT NULL DEFAULT 0, follow INTEGER NOT NULL DEFAULT 0, auto INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL, release TEXT, release_kind TEXT, next_ep TEXT, baseline TEXT,
        state TEXT NOT NULL DEFAULT 'waiting', note TEXT, tries INTEGER NOT NULL DEFAULT 0,
        check_at INTEGER NOT NULL DEFAULT 0, checked_at INTEGER,
        PRIMARY KEY (user_id, type, tmdb_id));
    INSERT INTO watchlist (user_id, type, tmdb_id, title, saved, follow, auto, added_at, check_at) VALUES
      (2, 'movie', 40, 'Saved Film', 1, 0, 0, 1, 99999999999999), (2, 'tv', 41, 'Followed Show', 0, 1, 0, 2, 0), (2, 'tv', 42, 'Saved Show', 1, 0, 0, 3, 0);`);
  old.close();
  const store = new WatchlistStore(dir);
  assert.deepEqual(store.list(2).map((i) => [i.id, i.saved, i.follow, i.auto]), [[42, true, true, true], [41, true, true, true], [40, true, false, true]]);
  const told = [];
  const deps = {
    now: () => at('2026-11-05'), user: () => ({ id: 2, canDownload: false }), canAuto: () => false, notify: (id, msg) => told.push([id, msg.title]),
    film: async () => ({ release_date: '2024-01-01' }), show: async () => ({ last_episode_to_air: { season_number: 1, episode_number: 2 } }),
    download: async () => { throw Error('no downloads for this person'); },
  };
  await runRound(store, deps);
  assert.deepEqual(told, [[2, 'Saved Film is out']]);
  assert.deepEqual(JSON.parse(store.get(2, 'tv', 42).baseline), { season: 1, episode: 2 }, 'a saved show starts its new episodes from now, not the back catalogue');
  store.patch(store.get(2, 'movie', 40), { check_at: 0 });
  await runRound(store, deps);
  assert.equal(told.length, 1, 'once');
});
