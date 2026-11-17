// Moods on Discover: the vibe definitions (src/vibes.js), how a vibe's titles are pooled and ordered,
// the page's ordering helpers (public/vibes.js) and the API. `node tools/vibes-check.mjs` checks the
// TMDB IDs themselves against the live API; these tests run offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIBES, KEYWORDS, discoverParams, poolFrom, scoreTitle, vibeTypes, inSeason, createVibes } from '../src/vibes.js';
import { orderVibe, rotateVibes, dailySeed, glyphNames } from '../public/vibes.js';

const keywordIds = new Set(Object.values(KEYWORDS).map(([id]) => id));
const idsIn = (value) => String(value || '').split(/[|,]/).filter(Boolean).map(Number);

test('every vibe is complete: names and blurbs in both languages, a look, queries and anchors', () => {
  const ids = VIBES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(VIBES.length >= 20 && VIBES.length <= 32, `${VIBES.length} vibes`);
  const glyphs = new Set(glyphNames());
  for (const v of VIBES) {
    assert.match(v.id, /^[a-z0-9-]{1,40}$/, v.id);
    for (const field of ['name', 'blurb']) assert.ok(v[field].en?.trim() && v[field].sv?.trim(), `${v.id} ${field}`);
    assert.match(v.look[0], /^#[0-9a-f]{6}$/i, `${v.id} colour`);
    assert.match(v.look[1], /^#[0-9a-f]{6}$/i, `${v.id} colour`);
    assert.ok(glyphs.has(v.look[2]), `${v.id} glyph ${v.look[2]}`);
    assert.ok(v.queries.some((q) => !q.boost && (q.movie || q.tv)), `${v.id} needs a query that finds titles on its own`);
    assert.ok(v.anchors.length >= 6, `${v.id} has ${v.anchors.length} anchors`);
    assert.ok(vibeTypes(v).length >= 1);
    if (v.months) for (const m of v.months) assert.ok(m >= 1 && m <= 12, `${v.id} month`);
  }
});

test('keyword and title IDs look like TMDB IDs and every keyword a query uses is listed', () => {
  for (const [name, [id, label]] of Object.entries(KEYWORDS)) {
    assert.ok(Number.isSafeInteger(id) && id > 0, name);
    assert.ok(label && label === label.toLowerCase(), `${name} label`);
  }
  assert.equal(keywordIds.size, Object.keys(KEYWORDS).length, 'each keyword ID is listed once');
  for (const v of VIBES) {
    const anchors = new Set();
    for (const [type, id, title] of v.anchors) {
      assert.ok(['movie', 'tv'].includes(type) && Number.isSafeInteger(id) && id > 0 && title, `${v.id} anchor ${title}`);
      assert.ok(!anchors.has(`${type}:${id}`), `${v.id}: ${title} twice`);
      anchors.add(`${type}:${id}`);
    }
    for (const key of v.skip || []) {
      assert.match(key, /^(movie|tv):\d+$/, `${v.id} skip`);
      assert.ok(!anchors.has(key), `${v.id} skips its own anchor ${key}`);
    }
    for (const q of v.queries) {
      for (const type of ['movie', 'tv']) {
        if (!q[type]) continue;
        for (const id of idsIn(q[type].with_keywords)) assert.ok(keywordIds.has(id), `${v.id}: keyword ${id} isn't in KEYWORDS`);
      }
    }
  }
});

test('discover parameters keep adult titles out, apply the floors and never ask for a genre they exclude', () => {
  const day = '2026-11-17';
  for (const v of VIBES) {
    for (const q of v.queries) {
      for (const type of ['movie', 'tv']) {
        const p = discoverParams(v, q, type, 2, day);
        if (!q[type]) { assert.equal(p, null); continue; }
        assert.equal(p.include_adult, 'false');
        assert.equal(p.page, '2');
        assert.ok(Number(p['vote_count.gte']) >= 15, `${v.id} votes`);
        assert.ok(Number(p['vote_average.gte']) >= 6, `${v.id} rating`);
        const dateKey = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
        assert.ok(p[dateKey] <= day, `${v.id}: nothing unreleased`);
        const wanted = new Set(idsIn(p.with_genres));
        for (const id of idsIn(p.without_genres)) assert.ok(!wanted.has(id), `${v.id}: genre ${id} both wanted and excluded`);
        if (!wanted.has(99)) assert.ok(idsIn(p.without_genres).includes(99), `${v.id}: documentaries stay out unless asked for`);
      }
    }
  }
  const nineties = VIBES.find((v) => v.id === '90s-indie');
  assert.equal(discoverParams(nineties, nineties.queries[0], 'movie', 1, day)['primary_release_date.lte'], '1999-12-31');
});

const title = (type, id, extra = {}) => ({ type, id, title: `${type} ${id}`, poster: `/p${id}.jpg`, rating: 7.5, votes: 1000, ...extra });

test('a pool: boost-only titles are dropped, anchors and repeat finds rise, skipped titles go', () => {
  const vibe = { skip: ['movie:5'] };
  const found = [
    { boost: false, titles: [title('movie', 1), title('movie', 2), title('movie', 5), title('movie', 6, { poster: null })] },
    { boost: false, titles: [title('movie', 2)] },
    { boost: true, titles: [title('movie', 2), title('movie', 3)] },
  ];
  const pool = poolFrom(vibe, found, [title('tv', 9, { rating: 6, votes: 50 }), null]);
  const keys = pool.map((t) => `${t.type}:${t.id}`);
  assert.deepEqual(keys.sort(), ['movie:1', 'movie:2', 'tv:9'].sort());
  const score = (key) => pool.find((t) => `${t.type}:${t.id}` === key).score;
  assert.ok(score('movie:2') > score('movie:1'), 'found three times beats found once');
  assert.ok(scoreTitle(title('movie', 1), { anchor: true }) > scoreTitle(title('movie', 1)));
  assert.deepEqual(pool.map((t) => t.score), [...pool.map((t) => t.score)].sort((a, b) => b - a), 'best first');
});

test('seasonal vibes only show in their months', () => {
  const xmas = VIBES.find((v) => v.months);
  assert.ok(xmas, 'there is a seasonal vibe');
  assert.equal(inSeason(xmas, xmas.months[0]), true);
  const off = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => !xmas.months.includes(m));
  assert.equal(inSeason(xmas, off), false);
  const vibes = createVibes({ tmdb: async () => ({ results: [] }), mapTitle: (x) => x, language: () => 'en' });
  assert.ok(!vibes.list({ month: off }).some((v) => v.id === xmas.id));
  assert.ok(vibes.list({ month: xmas.months[0] }).find((v) => v.id === xmas.id).seasonal);
});

test('createVibes: names follow the language, pools are cached, adult anchors stay out', async () => {
  const calls = [];
  let lang = 'en';
  const tmdb = async (endpoint, params) => {
    calls.push(endpoint);
    if (endpoint.startsWith('/discover/')) {
      const type = endpoint.endsWith('tv') ? 'tv' : 'movie';
      return { results: [{ id: 100 + Number(params.page), [type === 'tv' ? 'name' : 'title']: 'Found', poster_path: '/x.jpg', vote_average: 7.4, vote_count: 900 }] };
    }
    const [, type, id] = endpoint.split('/');
    return { id: Number(id), title: `Anchor ${id}`, name: `Anchor ${id}`, poster_path: '/a.jpg', vote_average: 8, vote_count: 5000, adult: Number(id) === 146233, genres: [{ id: 18 }] };
  };
  const mapTitle = (x, type) => ({ id: x.id, type, title: x.title || x.name, poster: x.poster_path, rating: x.vote_average, votes: x.vote_count, genres: x.genre_ids });
  const vibes = createVibes({ tmdb, mapTitle, language: () => lang });
  const list = vibes.list();
  assert.equal(list[0].name, VIBES[0].name.en);
  assert.deepEqual(Object.keys(list[0]).sort(), ['blurb', 'colors', 'glyph', 'id', 'name', 'seasonal', 'types']);
  assert.equal(await vibes.vibe('no-such-vibe'), null);
  const rainy = await vibes.vibe('rainy-thriller');
  assert.ok(rainy.results.length > 3);
  assert.ok(!rainy.results.some((t) => t.type === 'movie' && t.id === 146233), 'adult anchor left out');
  assert.ok(rainy.results.find((t) => t.id === 1949).genres.includes(18), 'anchors carry their genres');
  const n = calls.length;
  await vibes.vibe('rainy-thriller');
  assert.equal(calls.length, n, 'cached');
  lang = 'sv';
  assert.equal((await vibes.vibe('rainy-thriller')).name, VIBES[0].name.sv);
  assert.ok(calls.length > n, 'each language has its own pool (descriptions differ)');
});

test('the page order: the same seed gives the same order, yours first, filtered by type', () => {
  const items = Array.from({ length: 40 }, (_, i) => title(i % 3 ? 'movie' : 'tv', i, { score: 9 - i / 20 }));
  const a = orderVibe(items, { seed: 7 }), b = orderVibe(items, { seed: 7 }), c = orderVibe(items, { seed: 8 });
  assert.deepEqual(a.map((t) => t.id), b.map((t) => t.id));
  assert.notDeepEqual(a.map((t) => t.id), c.map((t) => t.id), 'a new seed shuffles');
  assert.equal(a.length, 40);
  const top = (list) => list.slice(0, 10).reduce((sum, t) => sum + t.score, 0) / 10;
  assert.ok(top(a) > 8.4, 'better titles still come early');
  const mine = orderVibe(items, { seed: 7, owned: (t) => t.id === 39 || t.id === 30 });
  assert.deepEqual(mine.slice(0, 2).map((t) => t.id).sort(), [30, 39]);
  assert.ok(orderVibe(items, { type: 'tv' }).every((t) => t.type === 'tv'));
  assert.equal(dailySeed(86400000 * 3 + 5), 3);
});

test('the Moods row: a daily rotation, the season first, only moods that fit the tab', () => {
  const vibes = [{ id: 'a', types: ['movie', 'tv'] }, { id: 'b', types: ['tv'] }, { id: 'c', types: ['movie'] }, { id: 'x', types: ['movie'] }];
  assert.deepEqual(rotateVibes(vibes, { type: 'tv', day: 0 }).map((v) => v.id), ['a', 'b']);
  assert.notDeepEqual(rotateVibes(vibes, { day: 1 }).map((v) => v.id), rotateVibes(vibes, { day: 2 }).map((v) => v.id));
  assert.equal(rotateVibes(vibes, { day: 3, seasonal: new Set(['x']) })[0].id, 'x');
  assert.equal(rotateVibes(vibes, { day: 5 }).length, 4);
});

test('API: /api/vibes lists the moods and /api/vibes/<id> sends one mood without disliked titles', { timeout: 20000 }, async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-vibes-api-'));
  const media = path.join(app, 'media'); await fs.mkdir(media);
  const requests = [];
  const mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    let body = {};
    const m = url.pathname.match(/^\/(movie|tv)\/(\d+)$/);
    if (url.pathname.startsWith('/discover/')) {
      const tv = url.pathname.endsWith('/tv');
      body = { page: 1, total_pages: 1, results: [500, 501].map((id) => ({ id: id + (tv ? 10 : 0), [tv ? 'name' : 'title']: `Found ${id}`, [tv ? 'first_air_date' : 'release_date']: '2001-01-01', poster_path: '/f.jpg', vote_average: 7.6, vote_count: 900 })) };
    } else if (m) {
      body = { id: Number(m[2]), [m[1] === 'tv' ? 'name' : 'title']: `Anchor ${m[2]}`, poster_path: '/a.jpg', vote_average: 8, vote_count: 4000, genres: [{ id: 80 }] };
    }
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
    PORT: '0', MEDIA_DIR: media, ADMIN_EMAILS: 'owner@test.local', TMDB_TOKEN: 'test',
    CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', SVT_PLAY: 'off', CAST_APPLETV: 'off', SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '', port = 0;
  child.stdout.on('data', (c) => { logs += c; });
  child.stderr.on('data', (c) => { logs += c; });
  t.after(async () => {
    child.kill();
    await new Promise((r) => child.exitCode !== null ? r() : child.once('exit', r));
    mock.closeAllConnections();
    await new Promise((r) => mock.close(r));
    await fs.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 9000);
    child.stdout.on('data', (c) => { const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(String(c)); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const call = async (p, { lang = 'en', method = 'GET', body } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, body: body && JSON.stringify(body), headers: {
      'cf-access-authenticated-user-email': 'owner@test.local', 'x-lilin-lang': lang, ...(body ? { 'content-type': 'application/json' } : {}),
    } });
    return { status: r.status, data: await r.json() };
  };

  let r = await call('/api/vibes');
  assert.equal(r.status, 200);
  assert.ok(r.data.vibes.length >= 20);
  assert.ok(r.data.vibes.some((v) => v.id === 'rainy-thriller' && v.name === 'Slow-burn rainy day thriller'));
  r = await call('/api/vibes', { lang: 'sv' });
  assert.ok(r.data.vibes.some((v) => v.id === 'rainy-thriller' && v.name === 'Smygande thriller för regniga dagar'));

  r = await call('/api/vibes/rainy-thriller');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.results.some((t) => t.id === 500 && t.type === 'movie'));
  assert.ok(r.data.results.some((t) => t.id === 1949 && t.title === 'Anchor 1949'), 'anchors are in the pool');
  assert.ok(r.data.results.every((t) => typeof t.score === 'number'));
  const discover = requests.filter((q) => q.path.startsWith('/discover/'));
  assert.ok(discover.length > 0 && discover.every((q) => q.params.include_adult === 'false'));

  r = await call('/api/social/rate', { method: 'POST', body: { key: 'movie:500', value: -1, title: 'Found 500' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('/api/vibes/rainy-thriller');
  assert.ok(!r.data.results.some((t) => t.id === 500 && t.type === 'movie'), 'a thumbs down hides it here too');

  r = await call('/api/vibes/no-such-mood');
  assert.equal(r.status, 404);
});
