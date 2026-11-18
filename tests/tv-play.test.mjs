import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tvPlay, playTarget, transfersFor, partFor } from '../src/tv-play.js';

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
