import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from './kill-tree.mjs';

const plus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test('Discover: one Coming soon row after New episodes this week, its own page, and the old Films key', { timeout: 20000 }, async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-coming-soon-api-'));
  const media = path.join(app, 'media'); await fs.mkdir(media);
  const requests = [];
  const releases = (rows) => ({ results: rows.map(([country, type, date]) => ({ iso_3166_1: country, release_dates: [{ type, release_date: `${date}T00:00:00.000Z` }] })) });
  const mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = Object.fromEntries(url.searchParams);
    requests.push({ path: url.pathname, params: q });
    let body = { page: 1, total_pages: 1, results: [] };
    const first = q.page === '1' || !q.page;
    if (url.pathname === '/discover/movie' && first && q.region === 'SE') {
      body.results = [{ id: 501, title: 'Swedish Premiere', popularity: 120, poster_path: '/a.jpg', release_date: plus(4) }];
    } else if (url.pathname === '/discover/movie' && first && q.with_release_type === '4|5') {
      body.results = [{ id: 502, title: 'Hated Film', popularity: 90, poster_path: '/b.jpg', release_date: plus(-50) }];
    } else if (url.pathname === '/discover/tv' && first && q['first_air_date.gte']) {
      body.results = [{ id: 601, name: 'Brand New Show', popularity: 6, poster_path: '/c.jpg', first_air_date: plus(8) }];
    } else if (url.pathname === '/trending/tv/week') { // New episodes this week (src/new-episodes.js): trending + details
      body.results = [{ id: 700, name: 'Weekly Show', popularity: 50, poster_path: '/d.jpg', first_air_date: '2020-01-01' }];
    } else if (url.pathname === '/tv/700') {
      body = { id: 700, last_episode_to_air: { air_date: plus(-2), season_number: 3, episode_number: 5 },
        seasons: [{ season_number: 3, episode_count: 10, air_date: plus(-40) }] };
    } else if (url.pathname === '/movie/501') body = { release_date: plus(4), release_dates: releases([['SE', 3, plus(4)]]) };
    else if (url.pathname === '/movie/502') body = { release_date: plus(-50), release_dates: releases([['US', 3, plus(-50)], ['US', 4, plus(10)]]) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockBase = `http://127.0.0.1:${mock.address().port}`;

  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  const source = await fs.readFile(path.join(app, 'src', 'server.js'), 'utf8');
  await fs.writeFile(path.join(app, 'src', 'server.js'), source.replace('https://api.themoviedb.org/3', mockBase));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });

  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', MEDIA_DIR: media, ADMIN_EMAILS: 'owner@test.local', TMDB_TOKEN: 'test', TMDB_REGION: 'se',
    CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', SVT_PLAY: 'off', CAST_APPLETV: 'off',
    SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  let port = 0;
  child.stdout.on('data', (c) => { logs += c; });
  child.stderr.on('data', (c) => { logs += c; });
  t.after(async () => {
    killTree(child);
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    mock.closeAllConnections();
    await new Promise((r) => mock.close(r));
    await fs.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Startup timeout: ${logs}`)), 60000);
    child.stdout.on('data', (c) => { const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(String(c)); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const headers = { 'cf-access-authenticated-user-email': 'owner@test.local' };
  const get = async (p) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers });
    const data = await r.json();
    assert.equal(r.status, 200, `${p}: ${JSON.stringify(data)}`);
    return data;
  };

  const home = await get('/api/discover/home?type=all');
  const keys = home.rows.map((r) => r.key);
  assert.deepEqual(keys, ['on-air', 'coming-soon'], 'only the rows with titles, Coming soon right after New episodes');
  const row = home.rows[1];
  assert.equal(row.title, 'Coming soon');
  assert.deepEqual(row.items.map((i) => i.title), ['Swedish Premiere', 'Hated Film', 'Brand New Show']);
  assert.deepEqual(row.items[0].soon, { date: plus(4), kind: 'cinema', local: true });
  assert.deepEqual(row.items[1].soon, { date: plus(10), kind: 'digital' });
  assert.deepEqual(row.items[2].soon, { date: plus(8), kind: 'premiere', season: 1 });
  assert.ok(requests.some((r) => r.path === '/discover/movie' && r.params.region === 'SE' && r.params.with_release_type === '2|3'), 'TMDB_REGION is used');

  // The Films tab's row is the same list, films only; the old key answers the same way.
  const films = await get('/api/discover/home?type=movie');
  assert.deepEqual(films.rows.find((r) => r.key === 'coming-soon-movie').items.map((i) => i.title), ['Swedish Premiere', 'Hated Film']);
  assert.deepEqual((await get('/api/discover/list?key=upcoming&page=1')).results.map((i) => i.title), ['Swedish Premiere', 'Hated Film']);
  const shows = await get('/api/discover/home?type=tv');
  assert.deepEqual(shows.rows.map((r) => r.key), ['trending-tv', 'on-air', 'coming-soon-tv'], 'Trending shares the mocked /trending/tv/week');

  // See all (TV apps) and the web page.
  const list = await get('/api/discover/list?key=coming-soon&page=1');
  assert.equal(list.results.length, 3);
  assert.equal(list.totalPages, 1);
  let page = await get('/api/discover/coming-soon?type=tv');
  assert.deepEqual(page.items.map((i) => i.title), ['Brand New Show']);
  assert.equal(page.region, 'SE');

  // A thumbs down hides it from your Coming soon too.
  const down = await fetch(`http://127.0.0.1:${port}/api/social/rate`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'movie:502', value: -1, title: 'Hated Film' }) });
  assert.equal(down.status, 200);
  page = await get('/api/discover/coming-soon?type=all');
  assert.deepEqual(page.items.map((i) => i.title), ['Swedish Premiere', 'Brand New Show']);
});
