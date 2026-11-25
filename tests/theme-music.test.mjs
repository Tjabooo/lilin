import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { themeSpan, themeOrder, themeArgs, createThemeMusic, THEME_SECONDS } from '../src/theme-music.js';
import { initCredits, storedIntro } from '../src/credits.js';
import { themeLevel, saveThemeLevel, resumeAt, envelope, themeUrl, createThemeMusic as createPlayer, LEVELS, RESUME_WITHIN } from '../public/theme-music.js';
import { killTree } from './kill-tree.mjs';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG || 'ffmpeg', FFPROBE = process.env.FFPROBE || 'ffprobe';
async function haveFfmpeg() {
  try { await run(FFMPEG, ['-version']); await run(FFPROBE, ['-version']); return true; } catch { return false; }
}
const tmp = (t, prefix) => fs.mkdtemp(path.join(os.tmpdir(), prefix)).then((dir) => { t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })); return dir; });

// ---- the server side ----
test('the theme is the start of the opening, 30 seconds at most, never a short title card', () => {
  assert.deepEqual(themeSpan({ start: 62.4, end: 148 }), { start: 62.4, length: THEME_SECONDS });
  assert.deepEqual(themeSpan({ start: 0, end: 21.55 }), { start: 0, length: 21.6 });
  for (const intro of [null, {}, { start: 10, end: 19 }, { start: -1, end: 60 }, { start: 'x', end: 60 }, { start: 50, end: 40 }]) assert.equal(themeSpan(intro), null);
  const args = themeArgs('/m/a.mkv', { start: 62.4, length: 30 }, '/c/x.m4a');
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 6), ['-ss', '62.400', '-i', '/m/a.mkv', '-t', '30.000']);
  assert.ok(args.includes('aac') && args.at(-1) === '/c/x.m4a');
});

test('episodes are tried from the first season on; the background search starts on a second episode', () => {
  const eps = [{ file: 'S2E1', season: 2, episode: 1 }, { file: 'S1E2', season: 1, episode: 2 }, { file: 'S1E1', season: 1, episode: 1 }, { file: 'S1E3', season: 1, episode: 3 }];
  const { list, searchFirst } = themeOrder(eps);
  assert.deepEqual(list.map((e) => e.file), ['S1E1', 'S1E2', 'S1E3', 'S2E1']);
  assert.equal(searchFirst.file, 'S1E2');
  assert.equal(themeOrder([{ file: 'S3E7', season: 3, episode: 7 }]).searchFirst.file, 'S3E7');
  assert.equal(themeOrder([]).searchFirst, null);
});

test('stored intros are read from the Skip intro cache without touching the file', async (t) => {
  const dir = await tmp(t, 'lilin-theme-credits-');
  const span = (start, end) => ({ start, end });
  await fs.writeFile(path.join(dir, '.lilin-credits.json'), JSON.stringify({ files: {
    '/m/chapter.mkv': { key: 'a', tok: 'a', intro: span(30, 95), ivs: { 'b|/m/x': span(1, 50) }, ifar: {} },
    '/m/two.mkv': { key: 'b', tok: 'b', intro: null, ivs: { 'c|/m/p': span(60, 150), 'd|/m/n': span(62, 148), 'e|/m/q': null }, ifar: {} },
    '/m/apart.mkv': { key: 'c', tok: 'c', intro: null, ivs: { 'c|/m/p': span(10, 30), 'd|/m/n': span(200, 260) }, ifar: {} },
    '/m/far.mkv': { key: 'd', tok: 'd', intro: null, ivs: { 'x|/m/p': null }, ifar: { 'x|/m/p': span(600, 690), 'y|/m/n': span(601, 689) } },
    '/m/far-one.mkv': { key: 'e', tok: 'e', intro: null, ivs: {}, ifar: { 'x|/m/p': span(600, 690) } },
  } }));
  initCredits({ dataDir: dir });
  t.after(() => initCredits({}));
  assert.deepEqual(storedIntro('/m/chapter.mkv'), span(30, 95)); // a chapter wins
  assert.deepEqual(storedIntro('/m/two.mkv'), span(62, 148)); // neighbours agree on the overlap
  assert.equal(storedIntro('/m/apart.mkv'), null); // they don't: nothing
  assert.deepEqual(storedIntro('/m/far.mkv'), span(601, 689)); // the longer search needs both
  assert.equal(storedIntro('/m/far-one.mkv'), null);
  assert.equal(storedIntro('/m/unknown.mkv'), null);
});

test('a theme is cut once into the cache, and unknown intros are looked for in the background once', { timeout: 30000 }, async (t) => {
  if (!(await haveFfmpeg())) { t.skip('FFmpeg unavailable'); return; }
  const dir = await tmp(t, 'lilin-theme-cut-');
  const video = path.join(dir, 'Show.S01E02.mkv');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=60', '-c:a', 'aac', '-y', video]);
  const intros = new Map([[video, { start: 12, end: 55 }]]);
  const searched = [];
  let idle = true;
  const music = createThemeMusic({ dir: path.join(dir, 'cache'), storedIntro: (f) => intros.get(f) ?? null, idle: () => idle,
    search: async (f) => { searched.push(f); } });
  const eps = [{ file: path.join(dir, 'Show.S01E01.mkv'), season: 1, episode: 1 }, { file: video, season: 1, episode: 2 }];
  const [a, b] = await Promise.all([music.themeFor('show', eps), music.themeFor('show', eps)]);
  assert.ok(a && a === b, 'one cut for both requests');
  assert.match(path.basename(a), /^[0-9a-f]{24}\.m4a$/);
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,channels', '-of', 'json', a]);
  const probe = JSON.parse(stdout);
  assert.ok(Math.abs(Number(probe.format.duration) - 30) < 0.5, probe.format.duration);
  assert.equal(probe.streams[0].codec_name, 'aac');
  assert.equal(probe.streams[0].channels, 2);
  const first = await fs.stat(a);
  assert.equal(await music.themeFor('show', eps), a);
  assert.equal((await fs.stat(a)).ino, first.ino, 'served from the cache, not cut again');
  assert.deepEqual((await fs.readdir(path.join(dir, 'cache'))).filter((n) => n.endsWith('.tmp')), []);
  assert.deepEqual(searched, []);

  // No intro known: silent, and one episode is looked at in the background, once (not while someone watches).
  const other = [{ file: '/m/Other.S02E01.mkv', season: 2, episode: 1 }, { file: '/m/Other.S02E02.mkv', season: 2, episode: 2 }];
  assert.equal(await music.themeFor('other', other), null);
  assert.equal(await music.themeFor('other', other), null);
  await new Promise((r) => { setImmediate(r); });
  assert.deepEqual(searched, ['/m/Other.S02E02.mkv']);
  idle = false;
  assert.equal(await music.themeFor('third', [{ file: '/m/Third.S01E01.mkv', season: 1, episode: 1 }]), null);
  await new Promise((r) => { setImmediate(r); });
  assert.deepEqual(searched, ['/m/Other.S02E02.mkv']);

  // A file ffmpeg can't read: no theme, nothing left behind.
  const broken = path.join(dir, 'Broken.S01E01.mkv');
  await fs.writeFile(broken, 'not a video');
  intros.set(broken, { start: 0, end: 40 });
  assert.equal(await music.themeFor('broken', [{ file: broken, season: 1, episode: 1 }]), null);
  assert.equal((await fs.readdir(path.join(dir, 'cache'))).length, 1);
});

test('GET /api/media/lib/<id>/theme serves the show’s theme, or 204 without one', { timeout: 40000 }, async (t) => {
  if (!(await haveFfmpeg())) { t.skip('FFmpeg unavailable'); return; }
  // Removed after the server has exited (below): after-hooks run in the order they were added.
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-theme-api-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const media = path.join(app, 'media');
  const show = path.join(media, 'Example Show', 'Season 1'), quiet = path.join(media, 'Quiet Show');
  await fs.mkdir(show, { recursive: true }); await fs.mkdir(quiet, { recursive: true });
  const make = (file) => run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=1:d=40', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-y', file]);
  const e1 = path.join(show, 'Example.Show.S01E01.mp4'), e2 = path.join(show, 'Example.Show.S01E02.mp4'), q1 = path.join(quiet, 'Quiet.Show.S01E01.mp4');
  await Promise.all([make(e1), make(e2), make(q1)]);
  // Skip intro already found the second episode's opening.
  await fs.writeFile(path.join(app, '.lilin-credits.json'), JSON.stringify({ files: {
    [e2]: { key: 'k', tok: 'k', duration: 40, chapter: null, intro: null, ivs: { 'o|other': { start: 4, end: 26 } }, ifar: {}, vs: {}, probed: true, v: 2, at: Date.now() },
  } }));
  for (const entry of await fs.readdir(root)) if (entry.endsWith('.js') || entry === 'package.json') await fs.copyFile(path.join(root, entry), path.join(app, entry));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', MEDIA_DIR: media, ADMIN_EMAILS: 'owner@test.local',
    CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', CAST_APPLETV: 'off', SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = ''; child.stdout.on('data', (c) => { logs += c; }); child.stderr.on('data', (c) => { logs += c; });
  t.after(async () => {
    const exited = new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    // killTree(child) on Windows ends only node: ffmpeg/ffprobe it started would keep the temp folder open (EBUSY).
    killTree(child);
    await exited;
    await fs.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${logs}`)), 60000);
    child.stdout.on('data', (c) => { const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(String(c)); if (ready) { clearTimeout(timer); resolve(Number(ready[1])); } });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(logs)); });
  });
  const get = (file) => fetch(`http://127.0.0.1:${port}/api/media/lib/${Buffer.from(path.relative(media, file)).toString('base64url')}/theme`,
    { headers: { 'cf-access-authenticated-user-email': 'owner@test.local' } });
  const res = await get(e1); // any episode of the show: the theme comes from whichever one has a known opening
  assert.equal(res.status, 200, logs);
  assert.equal(res.headers.get('content-type'), 'audio/mp4');
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.length > 2000 && body.includes(Buffer.from('ftyp')), `an MP4 audio file (${body.length} bytes)`);
  assert.equal((await fs.readdir(path.join(app, 'cache', 'theme-music'))).filter((n) => n.endsWith('.m4a')).length, 1);
  const none = await get(q1);
  assert.equal(none.status, 204);
  await none.arrayBuffer();
});

// ---- the page side ----
test('the level is per device: quiet by default, off or louder when chosen', () => {
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(themeLevel(ls), 'quiet');
  saveThemeLevel('off', ls); assert.equal(themeLevel(ls), 'off');
  saveThemeLevel('louder', ls); assert.equal(themeLevel(ls), 'louder');
  saveThemeLevel('nonsense', ls); assert.equal(themeLevel(ls), 'quiet');
  assert.equal(themeLevel({ getItem() { throw new Error('blocked'); } }), 'quiet');
  assert.ok(LEVELS.quiet < LEVELS.louder && LEVELS.louder <= 0.5);
});

test('coming back to a show soon carries on, a finished song stays finished, later it starts over', () => {
  assert.equal(resumeAt(null, 1000, 30), 0);
  assert.equal(resumeAt({ offset: 12.5, at: 0 }, 60e3, 30), 12.5);
  assert.equal(resumeAt({ offset: 28, at: 0 }, 60e3, 30), null);
  assert.equal(resumeAt({ offset: 12.5, at: 0 }, RESUME_WITHIN + 1, 30), 0);
  const steps = envelope(10, 40, 0.2);
  assert.deepEqual(steps, [[0.2, 11.5], [0.2, 37], [0, 40]]);
  assert.deepEqual(envelope(39, 40, 0.2).at(-1), [0, 40]);
  assert.deepEqual(envelope(40, 40, 0.2), []);
  assert.equal(themeUrl([{ id: 'b', season: 2, episode: 1 }, { id: 'a', season: 1, episode: 3 }, { id: 'f' }]), '/api/media/lib/a/theme');
  assert.equal(themeUrl([]), null);
});

// A pretend Web Audio, enough to follow what the page asks of it.
function fakeAudio() {
  const sources = [], fetched = [];
  class Param { constructor() { this.value = 0; this.events = []; } setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); }
    linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); } cancelScheduledValues(t) { this.events.push(['cancel', t]); } }
  class Ctx {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() { return { gain: new Param(), connect() {}, disconnect() {} }; }
    createBufferSource() { const s = { connect() {}, start(when, offset) { s.offset = offset; sources.push(s); }, stop(t) { s.stopped = t; } }; return s; }
    decodeAudioData(data, ok) { ok({ duration: 30 }); }
  }
  const store = new Map();
  Object.assign(globalThis, {
    window: { AudioContext: Ctx },
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    fetch: async (url) => { fetched.push(url); return { status: url.includes('none') ? 204 : 200, arrayBuffer: async () => new ArrayBuffer(4) }; },
  });
  return { sources, fetched };
}
const settle = () => new Promise((r) => { setTimeout(r, 5); });
const fakeEl = () => ({ isConnected: true, hidden: false, dataset: {}, classList: { toggle() {} }, setAttribute() {}, replaceChildren() {}, append() {} });

test('a show page plays its theme, keeps it between seasons, fades on leaving and on play', async () => {
  const { sources, fetched } = fakeAudio();
  let page = null, quiet = false;
  const music = createPlayer({ h: () => fakeEl(), icon: () => '', page: () => page, quiet: () => quiet });
  page = 'show-a';
  music.enter('show-a', '/api/media/lib/a/theme');
  await settle();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].offset, 0);
  music.enter('show-a', '/api/media/lib/a/theme'); // another season of the same show
  await settle();
  assert.equal(sources.length, 1, 'still the same song');
  assert.equal(fetched.length, 1);

  page = null; music.leave(); // the sheet closed
  assert.ok(sources[0].stopped != null);
  page = 'show-a'; music.enter('show-a', '/api/media/lib/a/theme'); // straight back: carries on
  await settle();
  assert.equal(sources.length, 2);
  assert.equal(fetched.length, 1, 'the clip is kept');

  music.stop(); // pressing play
  assert.ok(sources[1].stopped != null);
  music.enter('show-a', '/api/media/lib/a/theme'); // the player closed, page redrawn: stays quiet this visit
  await settle();
  assert.equal(sources.length, 2);

  page = 'show-b'; music.enter('show-b', '/api/media/lib/none/theme'); // a show without a known opening
  await settle();
  assert.equal(sources.length, 2);

  quiet = true; page = 'show-c'; music.enter('show-c', '/api/media/lib/c/theme'); // Watch Together, a TV, a trailer
  await settle();
  assert.equal(sources.length, 2);

  quiet = false; music.setLevel('off'); page = 'show-d'; music.enter('show-d', '/api/media/lib/d/theme');
  await settle();
  assert.equal(sources.length, 2, 'switched off on this device');
  music.setLevel('quiet');
});
