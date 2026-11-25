import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tvPlay, playTarget, transfersFor, partFor } from '../src/tv-play.js';
import { killTree } from './kill-tree.mjs';

const user = { id: 'u1', canDownload: true };
function deps(over = {}) {
  const calls = { started: [], added: [] };
  const d = {
    calls,
    libraryView: async () => ({ items: [], server: [], shows: [{ id: 'tv-1399', tmdbId: 1399 }] }),
    addToLibrary: async (u, item) => { calls.added.push(item.id); return true; },
    listDownloads: async () => [],
    startSmart: async (u, body) => { calls.started.push(body); return { id: 'abcdef012345' }; },
    smartJob: () => null,
    partLink: async () => ({ ready: false, status: { startProgress: 0.4, startEta: 12 } }),
    ...over,
  };
  return d;
}

test('playTarget wants a film id, or a show with season and episode', () => {
  assert.deepEqual(playTarget({ type: 'movie', tmdbId: '27205' }), { type: 'movie', tmdbId: 27205 });
  assert.deepEqual(playTarget({ type: 'tv', tmdbId: 1399, season: '1', episode: '2' }), { type: 'tv', tmdbId: 1399, season: 1, episode: 2 });
  assert.equal(playTarget({ type: 'tv', tmdbId: 1399, season: 1 }), null);
  assert.equal(playTarget({ type: 'movie', tmdbId: 'x' }), null);
});

test('your own copy plays at once; someone else’s joins your library first', async () => {
  const film = { id: 'a', tmdbId: 27205, season: null };
  let r = await tvPlay(deps({ libraryView: async () => ({ items: [film], server: [], shows: [] }) }), user, { type: 'movie', tmdbId: 27205 });
  assert.deepEqual(r, { play: { kind: 'lib', file: film } });
  const d = deps({ libraryView: async () => ({ items: [], server: [{ id: 'b', show: 'tv-1399', season: 1, episode: 2 }], shows: [] }) });
  r = await tvPlay(d, user, { type: 'tv', tmdbId: 1399, season: 1, episode: 2 });
  assert.equal(r.play.file.id, 'b');
  assert.deepEqual(d.calls.added, ['b']);
});

test('nothing here: POST starts one episode, GET follows the job', async () => {
  const d = deps();
  let r = await tvPlay(d, user, { type: 'tv', tmdbId: 1399, season: 3, episode: 4 }, { start: true });
  assert.deepEqual(r, { phase: 'finding', job: 'abcdef012345' });
  assert.deepEqual(d.calls.started, [{ type: 'tv', tmdbId: 1399, season: 3, episodes: [4] }]);
  r = await tvPlay(deps({ smartJob: () => ({ id: 'abcdef012345', state: 'done', outcome: 'none', message: 'Couldn’t find it' }) }), user,
    { type: 'movie', tmdbId: 5, job: 'abcdef012345' });
  assert.deepEqual(r, { phase: 'failed', message: 'Couldn’t find it', job: 'abcdef012345' });
  r = await tvPlay(deps(), { id: 'u2', canDownload: false }, { type: 'movie', tmdbId: 5 }, { start: true });
  assert.equal(r.phase, 'failed');
});

test('a transfer with the episode: starting, then the Play now stream', async () => {
  const dl = { hash: 'h1', mine: true, tmdbId: 1399, mediaType: 'tv', season: 1, canPlayNow: true, showId: 'tv-1399', canonicalTitle: 'GoT',
    episodes: [{ season: 1, episode: 1, available: true, fileIndex: 0 }, { season: 1, episode: 2, available: false, fileIndex: 1, mediaKey: 'k2' }] };
  const x = { type: 'tv', tmdbId: 1399, season: 1, episode: 2 };
  assert.equal(transfersFor(x, [dl, { ...dl, tmdbId: 1 }]).length, 1);
  assert.equal(partFor(x, [dl]).id, 'h1-1');
  let r = await tvPlay(deps({ listDownloads: async () => [dl] }), user, x);
  assert.deepEqual(r, { phase: 'starting', startProgress: 0.4, startEta: 12 });
  r = await tvPlay(deps({ listDownloads: async () => [dl], partLink: async () => ({ ready: true, url: '/play/part/x/index.m3u8', status: { duration: 3000 } }) }), user, x);
  assert.equal(r.play.kind, 'part');
  assert.equal(r.play.url, '/play/part/x/index.m3u8');
  assert.equal(r.play.mediaKey, 'k2');
  r = await tvPlay(deps({ listDownloads: async () => [{ ...dl, canPlayNow: false }] }), user, x);
  assert.deepEqual(r, { phase: 'connecting' });
});

test('a film transfer plays its one big file', async () => {
  const dl = { hash: 'h2', tmdbId: 27205, mediaType: 'movie', canPlayNow: true, files: [{ index: 0, size: 9e9, available: false }, { index: 1, size: 1e6 }] };
  assert.equal(partFor({ type: 'movie', tmdbId: 27205 }, [dl]).id, 'h2-0');
});

// The TV apps POST here: the server's list of allowed POSTs has to include it (it once didn't: "Method not allowed").
test('POST /api/tv/play is let through on a running server', { timeout: 30000 }, async (t) => {
  const { default: fs } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  const { default: os } = await import('node:os');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-tv-play-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name.endsWith('.json')) await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@test.local', CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', SVT_PLAY: 'off',
    CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '', port = 0;
  child.stdout.on('data', (c) => { logs += c; });
  child.stderr.on('data', (c) => { logs += c; });
  t.after(async () => {
    killTree(child);
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    await fs.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Startup timeout: ${logs}`)), 60000);
    child.stdout.on('data', () => { const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const r = await fetch(`http://127.0.0.1:${port}/api/tv/play`, { method: 'POST',
    headers: { 'cf-access-authenticated-user-email': 'owner@test.local', 'X-Lilin-TV': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'movie', tmdbId: 687163 }) });
  const body = await r.json();
  // No media folder in this bare server (503); what matters is that it reaches the route.
  assert.notEqual(r.status, 405, JSON.stringify(body));
  assert.notEqual(r.status, 404, JSON.stringify(body));
});

test('bestCopy: 4K for 4K TVs, 1080p for the rest, converting copies last', async () => {
  const { bestCopy } = await import('../src/tv-play.js');
  const hd = { id: 'a', file: 'Film 2026 1080p WEB AC3 H264.mp4', size: 10e9 };
  const uhd = { id: 'b', file: 'Film.2026.2160p.UHD.BluRay.Remux.HDR.mp4', size: 84e9 };
  assert.equal(bestCopy([hd, uhd]).id, 'b');
  assert.equal(bestCopy([hd, uhd], { uhd: false }).id, 'a');
  assert.equal(bestCopy([{ ...uhd, converting: true }, hd]).id, 'a');
  assert.equal(bestCopy([]), null);
});
