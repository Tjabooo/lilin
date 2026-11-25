// More details on title pages (src/details.js): crew, facts, links, episode credits, the soundtrack
// lookup (Wikidata + MusicBrainz, mocked) and GET /api/title/:type/:id/details against a running server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  peopleGroups, filmDates, titleFacts, titleKeywords, titleLinks, episodeCredits, normTitle, soundtrackMatches,
  pickRelease, shapeAlbum, albumKind, albumOrder, readWikidata, createDetails,
} from '../src/details.js';
import { songQuery, fmtLength, SERVICES } from '../public/details.js';
import { killTree } from './kill-tree.mjs';

const FILM = {
  id: 27205, title: 'Inception', original_title: 'Inception', release_date: '2010-07-15', original_language: 'en',
  production_companies: [{ name: 'Legendary Pictures' }, { name: 'Syncopy' }], production_countries: [{ iso_3166_1: 'GB' }, { iso_3166_1: 'US' }],
  spoken_languages: [{ iso_639_1: 'en' }, { iso_639_1: 'ja' }, { iso_639_1: 'fr' }], budget: 160000000, revenue: 839030630,
  belongs_to_collection: null, homepage: 'https://www.warnerbros.com/movies/inception', imdb_id: 'tt1375666',
  credits: { cast: [{ id: 6193, name: 'Leonardo DiCaprio' }], crew: [
    { id: 525, name: 'Christopher Nolan', job: 'Director' },
    { id: 525, name: 'Christopher Nolan', job: 'Screenplay' },
    { id: 525, name: 'Christopher Nolan', job: 'Producer' },
    { id: 947, name: 'Hans Zimmer', job: 'Original Music Composer' },
    { id: 559, name: 'Wally Pfister', job: 'Director of Photography' },
    { id: 560, name: 'Lee Smith', job: 'Editor' },
    { id: 556, name: 'Emma Thomas', job: 'Producer' },
    { id: 9, name: 'Somebody', job: 'Best Boy Grip' },
    { id: 10, name: '  ', job: 'Director' },
  ] },
  keywords: { keywords: [{ name: 'dream' }, { name: 'heist' }, { name: 'dream' }, { name: 'x'.repeat(60) }] },
  external_ids: { imdb_id: 'tt1375666' },
  release_dates: { results: [
    { iso_3166_1: 'GB', release_dates: [{ type: 1, release_date: '2010-07-08T00:00:00.000Z' }, { type: 3, release_date: '2010-07-16T00:00:00.000Z' }] },
    { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2010-07-16T00:00:00.000Z' }, { type: 4, release_date: '2010-12-07T00:00:00.000Z' }, { type: 5, release_date: '2010-12-07T00:00:00.000Z' }] },
    { iso_3166_1: 'SE', release_dates: [{ type: 3, release_date: '2010-07-21T00:00:00.000Z' }] },
  ] },
};
const SHOW = {
  id: 1396, name: 'Breaking Bad', original_name: 'Breaking Bad', first_air_date: '2008-01-20', last_air_date: '2013-09-29', status: 'Ended',
  created_by: [{ id: 66633, name: 'Vince Gilligan' }], networks: [{ name: 'AMC' }], origin_country: ['US'], original_language: 'en',
  episode_run_time: [45], number_of_seasons: 5, number_of_episodes: 62,
  aggregate_credits: { crew: [
    { id: 66633, name: 'Vince Gilligan', jobs: [{ job: 'Showrunner', episode_count: 62 }, { job: 'Director', episode_count: 5 }, { job: 'Executive Producer', episode_count: 62 }] },
    { id: 1, name: 'Michelle MacLaren', jobs: [{ job: 'Director', episode_count: 11 }] },
    { id: 2, name: 'Adam Bernstein', jobs: [{ job: 'Director', episode_count: 3 }] },
    { id: 3, name: 'Dave Porter', jobs: [{ job: 'Original Music Composer', episode_count: 62 }] },
    { id: 4, name: 'Thomas Golubić', jobs: [{ job: 'Music Supervisor', episode_count: 60 }] },
    { id: 5, name: 'Peter Gould', jobs: [{ job: 'Writer', episode_count: 9 }, { job: 'Teleplay', episode_count: 1 }] },
  ] },
  keywords: { results: [{ name: 'drug dealer' }] },
  external_ids: { imdb_id: 'tt0903747' },
};

test('crew groups: the right jobs, notes, episode counts, no empty names', () => {
  const film = peopleGroups('movie', FILM);
  const byKey = Object.fromEntries(film.map((g) => [g.key, g.people]));
  assert.deepEqual(film.map((g) => g.key), ['directors', 'writers', 'music', 'camera', 'editing', 'producers']);
  assert.deepEqual(byKey.directors, [{ id: 525, name: 'Christopher Nolan' }]);
  assert.deepEqual(byKey.producers.map((p) => p.name), ['Christopher Nolan', 'Emma Thomas']);
  assert.ok(!film.some((g) => g.people.some((p) => p.name === 'Somebody')), 'unlisted jobs stay out');

  const show = peopleGroups('tv', SHOW);
  const tv = Object.fromEntries(show.map((g) => [g.key, g.people]));
  assert.deepEqual(tv.creators, [{ id: 66633, name: 'Vince Gilligan' }]);
  assert.equal(tv.showrunners, undefined, 'a creator is not repeated as showrunner');
  assert.deepEqual(tv.directors.map((p) => [p.name, p.episodes]), [['Michelle MacLaren', 11], ['Vince Gilligan', 5], ['Adam Bernstein', 3]]);
  assert.deepEqual(tv.writers, [{ id: 5, name: 'Peter Gould', episodes: 9 }], 'shows: no Story/Teleplay notes');
  assert.deepEqual(tv.musicSupervisors.map((p) => p.name), ['Thomas Golubić']);
});

test('facts: dates for the viewer’s country, money, languages, only what has data', () => {
  assert.deepEqual(filmDates(FILM, 'SE'), [
    { kind: 'premiere', date: '2010-07-08', country: 'GB' },
    { kind: 'cinema', date: '2010-07-21', country: 'SE' },
    { kind: 'digital', date: '2010-12-07', country: 'US' },
    { kind: 'disc', date: '2010-12-07', country: 'US' },
  ]);
  assert.deepEqual(filmDates({ release_date: '2001-02-03' }), [{ kind: 'release', date: '2001-02-03', country: null }]);
  const f = titleFacts('movie', FILM, 'US');
  assert.deepEqual(f.studios, ['Legendary Pictures', 'Syncopy']);
  assert.deepEqual(f.countries, ['GB', 'US']);
  assert.equal(f.language, 'en');
  assert.deepEqual(f.spoken, ['ja', 'fr']);
  assert.equal(f.budget, 160000000);
  assert.equal(f.originalTitle, undefined, 'same as the title: left out');
  assert.equal(f.collection, undefined);
  assert.equal(f.status, undefined, 'films have no status row');
  const s = titleFacts('tv', SHOW);
  assert.deepEqual(s.networks, ['AMC']);
  assert.equal(s.lastAired, '2013-09-29');
  assert.equal(s.episodeRuntime, 45);
  assert.equal(s.budget, undefined);
  assert.equal(titleFacts('tv', { ...SHOW, status: 'Returning Series' }).lastAired, undefined, 'a running show has no last aired');
  assert.equal(titleFacts('movie', { title: 'Amélie', original_title: 'Le Fabuleux Destin d’Amélie Poulain' }).originalTitle, 'Le Fabuleux Destin d’Amélie Poulain');
  assert.deepEqual(titleKeywords('movie', FILM), ['dream', 'heist']);
  assert.deepEqual(titleKeywords('tv', SHOW), ['drug dealer']);
});

test('links: IMDb, TMDB, Letterboxd for films, the official site when it looks like one', () => {
  assert.deepEqual(titleLinks('movie', 27205, FILM).map((l) => l.kind), ['imdb', 'tmdb', 'letterboxd', 'homepage']);
  assert.deepEqual(titleLinks('tv', 1396, { ...SHOW, homepage: 'javascript:alert(1)' }).map((l) => l.url),
    ['https://www.imdb.com/title/tt0903747/', 'https://www.themoviedb.org/tv/1396']);
});

test('episode credits: director, writers, guests; nothing when TMDB has none', () => {
  assert.equal(episodeCredits({ crew: [], guest_stars: [] }), null);
  assert.equal(episodeCredits({}), null);
  const c = episodeCredits({
    crew: [{ id: 1, name: 'Michelle MacLaren', job: 'Director' }, { id: 5, name: 'Peter Gould', job: 'Writer' }, { id: 5, name: 'Peter Gould', job: 'Teleplay' }, { id: 7, name: 'X', job: 'Editor' }],
    guest_stars: [{ id: 9, name: 'Giancarlo Esposito', character: 'Gus Fring' }, { id: 10, name: 'Nobody', character: '' }],
  });
  assert.deepEqual(c, {
    directors: [{ id: 1, name: 'Michelle MacLaren' }], writers: [{ id: 5, name: 'Peter Gould' }],
    guests: [{ id: 9, name: 'Giancarlo Esposito', character: 'Gus Fring' }, { id: 10, name: 'Nobody' }],
  });
});

test('soundtrack search hits must be the same title from the right years', () => {
  assert.equal(normTitle('Amélie (Original Soundtrack) & More'), 'amelie original soundtrack and more');
  const g = (title, date, artist = 'X') => ({ title, 'first-release-date': date, 'secondary-types': ['Soundtrack'], 'artist-credit': [{ name: artist }] });
  const fight = { titles: ['Fight Club'], from: 1999, to: 1999, composers: ['The Dust Brothers'] };
  assert.equal(soundtrackMatches(g('Fight Club: Original Motion Picture Score', '1999-07-27', 'The Dust Brothers'), fight), true);
  assert.equal(soundtrackMatches(g('Fight Club', '2005-12-27', 'Pritam'), fight), false, 'another film with the same name');
  assert.equal(soundtrackMatches(g('Fight Club', '2002', 'The Dust Brothers'), fight), true, 'a late release with the composer');
  assert.equal(soundtrackMatches({ ...g('Fight Club', '1999'), 'secondary-types': [] }, fight), false, 'not a soundtrack');
  const bear = { titles: ['The Bear'], from: 2022, to: 2026 };
  assert.equal(soundtrackMatches(g('Jack the Bear', '2001'), bear), false);
  assert.equal(soundtrackMatches(g('The Bearded Lady', '2023'), bear), false, 'whole words only');
  assert.equal(soundtrackMatches(g('The Bear: The Final Season (Original Soundtrack)', '2026-06-26'), bear), true);
});

const release = (over) => ({ id: 'r', title: 'Album', status: 'Official', 'text-representation': { script: 'Latn' }, media: [{ format: 'CD', tracks: [{ title: 'A' }] }], ...over });
test('one release per album: Latin script, digital, most tracks', () => {
  const jp = release({ id: 'jp', 'text-representation': { script: 'Jpan' }, media: [{ format: 'Digital Media', tracks: [{}, {}, {}] }] });
  const cd = release({ id: 'cd', country: 'US' });
  const digital = release({ id: 'dig', country: 'XW', media: [{ format: 'Digital Media', tracks: [{}, {}] }] });
  assert.equal(pickRelease([jp, cd, digital]).id, 'dig');
  assert.equal(pickRelease([jp, cd]).id, 'cd');
  assert.equal(pickRelease([release({ media: [] })]), null);
  assert.equal(pickRelease([]), null);
});

test('albums: tracks with their own artists, kinds, order', () => {
  const a = shapeAlbum('950092d6-45f6-4269-87da-99a9ff2fcc52', {
    title: 'Awesome Mix', date: '2014-07-29', 'artist-credit': [{ name: 'Various Artists' }],
    'release-group': { title: 'Guardians of the Galaxy: Awesome Mix, Vol. 1', 'first-release-date': '2014-07-29' },
    media: [{ tracks: [
      { title: 'Hooked on a Feeling', length: 173000, 'artist-credit': [{ name: 'Blue Swede' }] },
      { title: 'Ain’t No Mountain High Enough', length: 150500, 'artist-credit': [{ name: 'Marvin Gaye', joinphrase: ' & ' }, { name: 'Tammi Terrell' }] },
      { title: 'Spirit in the Sky', 'artist-credit': [{ name: 'Norman Greenbaum' }] },
    ] }],
  });
  assert.equal(a.title, 'Guardians of the Galaxy: Awesome Mix, Vol. 1');
  assert.equal(a.year, 2014);
  assert.equal(a.kind, 'songs');
  assert.deepEqual(a.tracks[1], { title: 'Ain’t No Mountain High Enough', artist: 'Marvin Gaye & Tammi Terrell', length: 151 });
  assert.deepEqual(a.tracks[2], { title: 'Spirit in the Sky', artist: 'Norman Greenbaum' });
  assert.match(a.cover, /coverartarchive\.org\/release-group\/950092d6/);
  assert.equal(shapeAlbum('x', { media: [] }), null);
  const two = shapeAlbum('y', { 'artist-credit': [{ name: 'Hans Zimmer' }], 'release-group': { title: 'Inception: Music From the Motion Picture' },
    media: [{ tracks: [{ title: 'Half Remembered Dream', 'artist-credit': [{ name: 'Hans Zimmer' }] }] }, { tracks: [{ title: 'Time' }] }] });
  assert.deepEqual(two.tracks, [{ title: 'Half Remembered Dream', disc: 1 }, { title: 'Time', disc: 2 }], 'the album artist isn’t repeated per track');
  assert.equal(two.kind, 'album');
  assert.equal(albumKind('Barbie – Score From the Original Motion Picture Soundtrack', 'Mark Ronson', []), 'score');
  assert.deepEqual([{ kind: 'score', year: 2014 }, { kind: 'songs', year: 2017 }, { kind: 'songs', year: 2014 }, { kind: 'album' }].sort(albumOrder),
    [{ kind: 'songs', year: 2014 }, { kind: 'songs', year: 2017 }, { kind: 'album' }, { kind: 'score', year: 2014 }]);
});

test('Wikidata answers: album ids once each, Wikipedia pages, junk ignored', () => {
  const mb = '950092d6-45f6-4269-87da-99a9ff2fcc52';
  const w = readWikidata({ results: { bindings: [
    { item: { value: 'http://www.wikidata.org/entity/Q5887360' }, mb: { value: mb }, enwiki: { value: 'https://en.wikipedia.org/wiki/Guardians_of_the_Galaxy_(film)' } },
    { item: { value: 'http://www.wikidata.org/entity/Q5887360' }, mb: { value: mb }, svwiki: { value: 'https://sv.wikipedia.org/wiki/Guardians_of_the_Galaxy_(film)' } },
    { mb: { value: 'not-an-id' }, enwiki: { value: 'javascript:alert(1)' } },
  ] } });
  assert.deepEqual(w.albums, [mb]);
  assert.equal(w.wiki.en, 'https://en.wikipedia.org/wiki/Guardians_of_the_Galaxy_(film)');
  assert.equal(w.wiki.sv, 'https://sv.wikipedia.org/wiki/Guardians_of_the_Galaxy_(film)');
  assert.equal(w.wiki.item, 'https://www.wikidata.org/wiki/Q5887360');
  assert.deepEqual(readWikidata(null), { albums: [], wiki: {} });
});

test('song links and lengths in the web app', () => {
  assert.equal(songQuery({ title: 'Hooked on a Feeling', artist: 'Blue Swede' }, { artist: 'Various Artists' }), 'Hooked on a Feeling Blue Swede');
  assert.equal(songQuery({ title: 'Time' }, { artist: 'Hans Zimmer' }), 'Time Hans Zimmer');
  assert.equal(songQuery({ title: 'Theme' }, { artist: 'Various Artists' }), 'Theme');
  assert.equal(SERVICES.spotify.url('a b&c'), 'https://open.spotify.com/search/a%20b%26c');
  assert.equal(SERVICES.ytmusic.url('a b'), 'https://music.youtube.com/search?q=a%20b');
  assert.equal(fmtLength(173), '2:53');
  assert.equal(fmtLength(0), '');
});

// Fake Wikidata + MusicBrainz for the lookups below and the API test.
const GROUP = '950092d6-45f6-4269-87da-99a9ff2fcc52';
const SCORE = 'bc04101a-f099-3da6-a89f-41342bab4b80';
function musicMock(calls, { wikidataFails = false } = {}) {
  return async (url) => {
    const u = new URL(url);
    calls.push(u.host + u.pathname);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.host === 'query.wikidata.org') {
      if (wikidataFails) return json({}, 500);
      const q = u.searchParams.get('query');
      if (q.includes('"118340"')) return json({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q5887360' }, mb: { value: GROUP }, enwiki: { value: 'https://en.wikipedia.org/wiki/Guardians' } }] } });
      return json({ results: { bindings: [] } });
    }
    if (u.pathname.endsWith('/release-group')) return json({ 'release-groups': [
      { id: SCORE, score: 68, title: 'Fight Club: Original Motion Picture Score', 'first-release-date': '1999-07-27', 'secondary-types': ['Soundtrack'], 'artist-credit': [{ name: 'The Dust Brothers' }] },
      { id: 'f45c3d80-c913-3771-9142-6017c682e51e', score: 100, title: 'Fight Club', 'first-release-date': '2005', 'secondary-types': ['Soundtrack'], 'artist-credit': [{ name: 'Pritam' }] },
    ] });
    if (u.pathname.endsWith('/release')) {
      const group = u.searchParams.get('release-group');
      return json({ releases: [release({ 'release-group': { title: group === GROUP ? 'Awesome Mix' : 'Fight Club: Original Motion Picture Score', 'first-release-date': '2014' },
        'artist-credit': [{ name: group === GROUP ? 'Various Artists' : 'The Dust Brothers' }],
        media: [{ format: 'Digital Media', tracks: [{ title: 'Hooked on a Feeling', length: 173000, 'artist-credit': [{ name: 'Blue Swede' }] }] }] })] });
    }
    return json({}, 404);
  };
}

test('soundtrack lookups: Wikidata first, MusicBrainz search second, cached on disk', { timeout: 20000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-details-'));
  const cacheFile = path.join(dir, 'cache', 'title-music.json');
  const calls = [];
  const tmdb = async (endpoint) => (endpoint.startsWith('/movie/550') ? { title: 'Fight Club', original_title: 'Fight Club', release_date: '1999-10-15' }
    : endpoint.startsWith('/movie/118340') ? { title: 'Guardians of the Galaxy', release_date: '2014-07-30' } : { title: 'Nothing', release_date: '2001-01-01' });
  const d = createDetails({ tmdb, cacheFile, fetch: musicMock(calls), country: () => 'US' });
  const gotg = await d.titleDetails('movie', 118340, { waitMs: 10000 });
  assert.equal(gotg.music.albums.length, 1);
  assert.equal(gotg.music.albums[0].tracks[0].artist, 'Blue Swede');
  assert.deepEqual(gotg.links.map((l) => l.kind), ['tmdb', 'wikipedia', 'letterboxd']);
  assert.equal(gotg.musicPending, undefined);
  assert.ok(!calls.some((c) => c.endsWith('/release-group')), 'Wikidata had it: no search');

  const fight = await d.titleDetails('movie', 550, { waitMs: 10000 });
  assert.deepEqual(fight.music.albums.map((a) => a.title), ['Fight Club: Original Motion Picture Score'], 'search fallback, wrong film skipped');

  // Asked again: from the cache, no new requests.
  const before = calls.length;
  await d.titleDetails('movie', 118340);
  assert.equal(calls.length, before);
  d.flush();
  const saved = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['movie:118340', 'movie:550']);
  // A new process reads the file instead of asking.
  const calls2 = [];
  const again = createDetails({ tmdb, cacheFile, fetch: musicMock(calls2) });
  assert.equal((await again.titleDetails('movie', 550)).music.albums.length, 1);
  assert.deepEqual(calls2, []);

  // Slow lookups answer "pending" and keep going; failures degrade to no music and aren't cached on disk.
  const slow = createDetails({ tmdb, fetch: async (...a) => { await new Promise((r) => setTimeout(r, 300)); return musicMock([])(...a); } });
  const first = await slow.titleDetails('movie', 118340, { waitMs: 20 });
  assert.equal(first.musicPending, true);
  assert.deepEqual(first.music.albums, []);
  const broken = createDetails({ tmdb, fetch: musicMock([], { wikidataFails: true }) });
  const none = await broken.titleDetails('movie', 999, { waitMs: 10000 });
  assert.deepEqual(none.music.albums, []);
  assert.equal(none.musicPending, undefined);
  const off = createDetails({ tmdb, enabled: false, fetch: () => { throw Error('no requests when off'); } });
  assert.deepEqual((await off.titleDetails('movie', 118340)).music.albums, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('GET /api/title/:type/:id/details against a running server', { timeout: 30000 }, async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-details-api-'));
  const mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = {};
    if (url.pathname === '/3/movie/27205') body = FILM;
    else if (url.pathname === '/3/tv/1396') body = SHOW;
    else if (url.pathname === '/3/tv/1396/season/1') body = { episodes: [{ episode_number: 1, name: 'Pilot', crew: [{ id: 66633, name: 'Vince Gilligan', job: 'Director' }], guest_stars: [] }, { episode_number: 2, name: 'Cat' }] };
    else if (url.pathname === '/sparql') body = { results: { bindings: [] } };
    else if (url.pathname === '/ws/2/release-group') body = { 'release-groups': [] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockBase = `http://127.0.0.1:${mock.address().port}`;
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name.endsWith('.json')) await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  const server = await fs.readFile(path.join(app, 'src', 'server.js'), 'utf8');
  await fs.writeFile(path.join(app, 'src', 'server.js'), server.replace('https://api.themoviedb.org/3', `${mockBase}/3`));
  const details = await fs.readFile(path.join(app, 'src', 'details.js'), 'utf8');
  await fs.writeFile(path.join(app, 'src', 'details.js'), details.replace('https://query.wikidata.org/sparql', `${mockBase}/sparql`).replace('https://musicbrainz.org/ws/2', `${mockBase}/ws/2`));

  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@test.local', TMDB_TOKEN: 'test', CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', SVT_PLAY: 'off',
    CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '', port = 0;
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
    child.stdout.on('data', () => { const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const get = async (p, lang = 'en') => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'cf-access-authenticated-user-email': 'owner@test.local', 'X-Lilin-Lang': lang } });
    return { status: r.status, body: await r.json() };
  };

  let r = await get('/api/title/movie/27205/details');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const film = r.body.details;
  assert.deepEqual(film.people.find((g) => g.key === 'directors').people, [{ id: 525, name: 'Christopher Nolan' }]);
  assert.equal(film.facts.budget, 160000000);
  assert.equal(film.facts.dates.find((d) => d.kind === 'cinema').country, 'US');
  assert.deepEqual(film.music, { albums: [] });
  assert.equal(film.musicPending, undefined);
  assert.equal(film.links[0].url, 'https://www.imdb.com/title/tt1375666/');
  // Swedish readers get Swedish cinema dates.
  r = await get('/api/title/movie/27205/details', 'sv');
  assert.equal(r.body.details.facts.dates.find((d) => d.kind === 'cinema').country, 'SE');

  r = await get('/api/title/tv/1396/details');
  assert.equal(r.body.details.people[0].key, 'creators');
  assert.equal(r.body.details.facts.seasons, 5);

  r = await get('/api/title/book/1/details');
  assert.equal(r.status, 404);

  // Episodes carry their own credits only when TMDB has some.
  r = await get('/api/tv/1396/season/1');
  assert.deepEqual(r.body.episodes[0].credits, { directors: [{ id: 66633, name: 'Vince Gilligan' }], writers: [], guests: [] });
  assert.equal('credits' in r.body.episodes[1], false);
});
