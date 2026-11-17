// First-time watches (cold-start.js): prewarm, spare releases racing a pick that can't deliver, background downloads
// held back while a video starts, and the Play now pieces that make it work (partial-stream.js, smart-download.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { raceStep, isCold, ColdStarts, edgePiece, stuckEdge, META_WAIT, RATE_SETTLE, SPARE_TRIAL, RACE_MAX, COLD_MAX, THROTTLE_BPS } from '../src/cold-start.js';
import { PartialStreams, readyToStart } from '../src/partial-stream.js';
import { startSmartJob, smartJob, fakeFound, uploaderOf, raceSwapped } from '../src/smart-download.js';
import { parseTpb } from '../src/torrents.js';
import { parseName } from '../src/release-name.js';

const T0 = 1_000_000;
const spare = (over = {}) => ({ hash: 's1', metaAt: T0 + 5000, fake: false, running: false, startedAt: null, rate: 0, tried: false, ...over });
const pick = (over = {}) => ({ addedAt: T0, metaAt: T0 + 10_000, fake: false, rate: 0, need: 1e6, lead: 0, done: false, watching: false, spares: [], ...over });

test('race: a pick whose file list never comes gives way to a spare that has one', () => {
  const c = pick({ metaAt: null, spares: [spare({ metaAt: null }), spare({ hash: 's2' })] });
  assert.equal(raceStep(c, T0 + META_WAIT - 1), null, 'gets its chance first');
  assert.deepEqual(raceStep(c, T0 + META_WAIT), { swap: 's2', why: 'its file list never came' });
  assert.equal(raceStep(pick({ metaAt: null, spares: [spare({ metaAt: null })] }), T0 + 60_000), null, 'no spare ready: waits');
  assert.deepEqual(raceStep(pick({ metaAt: null }), T0 + RACE_MAX), { settle: true });
});

test('race: a fake pick is replaced by a clean spare, and waits for one whose file list is still coming', () => {
  assert.deepEqual(raceStep(pick({ fake: 'holds a program', spares: [spare({ fake: 'x' }), spare({ hash: 's2' })] }), T0 + 11_000), { swap: 's2', why: 'fake' });
  assert.equal(raceStep(pick({ fake: 'x', spares: [spare({ metaAt: null })] }), T0 + 11_000), null);
  assert.deepEqual(raceStep(pick({ fake: 'x', spares: [] }), T0 + 11_000), { settle: true }, 'nothing to switch to: the usual fake path');
});

test('race: a slow pick tries a spare next to it and keeps whichever is clearly faster', () => {
  const at = T0 + 10_000 + RATE_SETTLE;
  assert.equal(raceStep(pick({ rate: 0.5e6, spares: [spare()] }), at - 1), null, 'measured for a while first');
  assert.deepEqual(raceStep(pick({ rate: 1.2e6, spares: [spare()] }), at), { settle: true }, 'keeps up: the spares go');
  assert.deepEqual(raceStep(pick({ rate: 0.2e6, spares: [spare()] }), at), { start: 's1' });
  const trial = (rate, over = {}) => raceStep(pick({ rate: 0.2e6, ...over, spares: [spare({ running: true, tried: true, startedAt: at, rate })] }), at + SPARE_TRIAL);
  assert.deepEqual(trial(1.5e6), { swap: 's1', why: 'faster' });
  assert.deepEqual(trial(0.25e6), { settle: true }, 'not clearly faster: the pick stays');
  assert.deepEqual(trial(1.5e6, { watching: true }), { settle: true }, 'someone is already watching the pick');
  assert.deepEqual(raceStep(pick({ rate: 0.2e6, lead: 200, spares: [spare()] }), at), { settle: true }, 'a good lead already');
  // Hopeless (a tenth of the bitrate): the spare starts early, and a clear winner takes over early too.
  const early = T0 + 10_000 + 12_000;
  assert.deepEqual(raceStep(pick({ rate: 0.1e6, spares: [spare()] }), early), { start: 's1' });
  assert.equal(raceStep(pick({ rate: 0.5e6, spares: [spare()] }), early), null, 'half the bitrate: measured longer');
  assert.deepEqual(raceStep(pick({ rate: 0.1e6, spares: [spare({ running: true, tried: true, startedAt: early, rate: 3e6 })] }), early + 12_000), { swap: 's1', why: 'faster' });
  assert.equal(raceStep(pick({ rate: 0.1e6, spares: [spare({ running: true, tried: true, startedAt: early, rate: 1.2e6 })] }), early + 12_000), null, 'not a clear win yet');
});

test('cold until the start has a good lead, the file is done, or it has taken too long', () => {
  assert.equal(isCold({ addedAt: T0, lead: 30 }, T0 + 1000), true);
  assert.equal(isCold({ addedAt: T0, lead: 130 }, T0 + 1000), false);
  assert.equal(isCold({ addedAt: T0, done: true }, T0 + 1000), false);
  assert.equal(isCold({ addedAt: T0 }, T0 + COLD_MAX), false);
});

test('a half-fetched piece at the edge with plenty after it is stuck; a slow swarm is not', () => {
  const layout = { first: 2, last: 20 };
  const states = [0, 0, 2, 1, ...new Array(10).fill(2), 0, 0, 0, 0, 0, 0, 0];
  assert.equal(edgePiece(layout, states), 3);
  assert.equal(stuckEdge(layout, states, 3, T0, T0 + 13_000), true);
  assert.equal(stuckEdge(layout, states, 3, T0, T0 + 5_000), false, 'not for long yet');
  assert.equal(stuckEdge(layout, [0, 0, 2, 1, 2, 2, 1, 1, 0], 3, T0, T0 + 60_000), false, 'nothing much after it: just slow');
  assert.equal(edgePiece(layout, new Array(21).fill(2)), null);
});

test('start: the minimum lead is enough when the download is well ahead of the picture', () => {
  const MB = 1024 * 1024;
  const now = Date.now();
  assert.equal(readyToStart(10 * MB, 4e9, 8e6, now, now, null, 0), false, 'slow download: the full lead or the grace period');
  assert.equal(readyToStart(10 * MB, 4e9, 8e6, now, now, null, 2.5e6), true, '20 Mbit/s for an 8 Mbit/s picture');
  assert.equal(readyToStart(10 * MB, 4e9, 8e6, null, now, null, 2.5e6), false, 'never below the minimum');
});

// ---------- Play now: prewarm, reads ----------
const PIECE = 1024;
function rig(t, { size = 8192 } = {}) {
  const calls = [];
  let states = new Array(Math.ceil(size / PIECE)).fill(0);
  const torrent = { hash: 'a'.repeat(40), state: 'downloading', seq_dl: false, f_l_piece_prio: true, force_start: false, dlspeed: 1000, save_path: '/x' };
  const qbit = async (endpoint) => {
    if (endpoint.includes('/torrents/info')) return [{ ...torrent }];
    if (endpoint.includes('/torrents/files')) return [{ index: 0, name: 'Film.mkv', size, priority: 1, piece_range: [0, states.length - 1] }];
    if (endpoint.includes('/torrents/properties')) return { piece_size: PIECE };
    if (endpoint.includes('/torrents/pieceStates')) return states;
    throw new Error(`unexpected ${endpoint}`);
  };
  const post = async (endpoint, body) => {
    calls.push(endpoint.split('/').pop());
    if (endpoint.endsWith('toggleSequentialDownload')) torrent.seq_dl = !torrent.seq_dl;
  };
  return { calls, torrent, setStates: (s) => { states = s; }, make: (file, extra = {}) => {
    const streams = new PartialStreams({ qbit, post, filePath: () => file, isVideo: () => true, start: async () => {}, log: {},
      probe: async () => ({ duration: 100, bitrate: 1000, height: 1080 }), ...extra });
    t.after(() => streams.close());
    return streams;
  } };
}

test('prewarm: watch mode and the probe before anyone presses Play, kept past the idle limit, then put back', async (t) => {
  const r = rig(t);
  let probed = 0;
  const streams = r.make('/nowhere.mkv', { probe: async () => { probed++; return { duration: 100, bitrate: 1000, height: 1080 }; } });
  const id = `${'a'.repeat(40)}-0`;
  const until = Date.now() + 10 * 60_000;
  const e = await streams.prewarm(id, { until });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(r.torrent.seq_dl, true, 'in order from the start');
  assert.equal(probed, 1);
  assert.ok(e.info, 'the video is read before Play');
  await streams.sweep(Date.now() + 4 * 60_000);
  assert.equal(streams.entries.size, 1, 'nobody watching yet, but kept for the first-time watch');
  await streams.sweep(until + 4 * 60_000);
  assert.equal(streams.entries.size, 0);
  assert.equal(r.torrent.seq_dl, false, 'back to how it was');
  await streams.prewarm(id);
  await streams.drop(id);
  assert.equal(streams.entries.size, 0);
  assert.equal(r.torrent.seq_dl, false, 'a dropped prewarm is put back too');
});

test('pieces only playhead has are never read from qBittorrent’s file (they are holes there)', { timeout: 10000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-cold-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'Film.mkv');
  const data = Buffer.alloc(8192);
  for (let i = 0; i < data.length; i++) data[i] = 1 + (i % 200);
  const sparse = Buffer.from(data);
  sparse.fill(0, 2048, 4096); // pieces 2-3 aren't in qBittorrent's file
  await fs.writeFile(file, sparse);
  const r = rig(t);
  r.setStates([2, 2, 0, 0, 2, 2, 2, 2]);
  // playhead serves the whole file and claims pieces 2-3.
  const ph = http.createServer((req, res) => {
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(req.headers.range);
    res.writeHead(206); res.end(data.subarray(Number(from), Number(to) + 1));
  });
  await new Promise((resolve) => ph.listen(0, '127.0.0.1', resolve));
  t.after(() => ph.close());
  let up = false;
  const assist = { ready: async () => up, open: async () => ({ id: 's', url: '/s/1/file/0', state: 'ready' }), update: async () => {},
    status: async () => ({ own: '00110000', download_rate: 0, peers_connected: 1 }), close: async () => {},
    fetchRange: (url, start, end, signal) => fetch(`http://127.0.0.1:${ph.address().port}${url}`, { headers: { Range: `bytes=${start}-${end}` }, signal }) };
  const streams = r.make(file, { assist, exportTorrent: async () => null, peersOf: async () => [], trackersOf: async () => [] });
  const id = `${'a'.repeat(40)}-0`;
  const e = await streams.entry(id);
  e.states = [2, 2, 0, 0, 2, 2, 2, 2];
  e.merged = [2, 2, 2, 2, 2, 2, 2, 2]; // playhead's pieces counted as readable, but playhead isn't the reader yet
  const url = await streams.inputUrl(e);
  const got = fetch(url).then((res) => res.arrayBuffer()).then((b) => Buffer.from(b));
  await new Promise((resolve) => setTimeout(resolve, 300));
  up = true; // playhead comes up in the middle of the read
  e.statesAt = 0; e.assistTriedAt = 0;
  const body = await got;
  assert.equal(body.length, 8192);
  assert.ok(body.equals(data), 'no zeros from the holes: the rest came through playhead');
});

// ---------- the module, with a pretend qBittorrent ----------
function world({ primaryMeta = true, spareMeta = true, files = (h) => [{ index: 0, name: `${h}.mkv`, size: 4e9, priority: 1 }] } = {}) {
  const torrents = new Map();
  const log = [];
  const prewarmed = [];
  const limits = new Map();
  const add = (hash, meta) => torrents.set(hash, { hash, name: `${hash} release`, state: meta ? 'downloading' : 'metaDL', dlspeed: 0, meta });
  add('p', primaryMeta);
  const entries = new Map();
  const deps = {
    info: async (hashes) => new Map(hashes.filter((h) => torrents.has(h)).map((h) => [h, torrents.get(h)])),
    files: async (t) => (t.meta ? files(t.hash) : []),
    pickFile: () => 0,
    fake: (list) => (list.some((f) => f.name.endsWith('.exe')) ? 'holds a program' : null),
    partial: {
      prewarm: async (id, { until }) => { prewarmed.push(id); const e = entries.get(id) || { id, size: 4e9, info: null, torrent: { dlspeed: torrents.get(id.split('-')[0])?.dlspeed || 0 } };
        e.torrent.dlspeed = torrents.get(id.split('-')[0])?.dlspeed || 0; e.until = until; entries.set(id, e); return e; },
      drop: async (id) => { entries.delete(id); log.push(['drop', id]); },
      readable: () => 0,
      status: () => ({ done: false }),
    },
    addSpare: async (c, r) => { add(r.hash, spareMeta); return { hash: r.hash, name: r.name }; },
    startSpare: async (h) => { log.push(['start', h]); },
    swap: async (c, s, why) => { log.push(['swap', c.hash, s.hash, why]); torrents.delete(c.hash); return true; },
    removeSpare: async (h) => { log.push(['remove', h]); torrents.delete(h); },
    fakeFound: async (c, h, name, why, opts) => { log.push(['fake', h, opts.primary, Boolean(opts.retry)]); },
    followUp: async (c) => { log.push(['follow', c.episode]); },
    background: async () => ['tv1', 'tv2'],
    setLimit: async (hashes, bps) => { for (const h of hashes) limits.set(h, bps); },
    log: { info: () => {}, warn: () => {} },
  };
  return { torrents, log, prewarmed, limits, deps, cold: new ColdStarts(deps), add };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a first-time watch: spares fetch their file lists, the pick is prewarmed, background downloads wait', async () => {
  const w = world();
  w.cold.register({ userId: 1, hash: 'p', name: 'p release', kind: 'movie', runtime: 120, alternatives: [{ hash: 's1', name: 'one' }, { hash: 's2', name: 'two' }, { hash: 's3', name: 'three' }] });
  await settle();
  assert.deepEqual(w.cold.list()[0].spares.map((s) => s.hash), ['s1', 's2'], 'two spares at most');
  assert.ok(w.cold.owns('s1') && w.cold.isSpare('s2') && !w.cold.isSpare('p'));
  await w.cold.round();
  assert.deepEqual(w.prewarmed, ['p-0']);
  assert.equal(w.limits.get('tv1'), THROTTLE_BPS, 'Live TV picks wait while it starts');
  // The pick keeps up: spares go, and background downloads get their speed back once the start is settled.
  w.torrents.get('p').dlspeed = 5e6;
  const c = w.cold.list()[0];
  c.metaAt = Date.now() - RATE_SETTLE - 1;
  await w.cold.round();
  assert.ok(w.log.some(([a, h]) => a === 'remove' && h === 's1') && w.log.some(([a, h]) => a === 'remove' && h === 's2'));
  c.addedAt -= COLD_MAX;
  await w.cold.round();
  assert.equal(w.limits.get('tv1'), 0, 'held back no longer');
});

test('a pick without a file list is swapped for a spare that has one; a fake spare is reported and removed', async () => {
  const w = world({ primaryMeta: false, files: (h) => (h === 's1' ? [{ index: 0, name: 'setup.exe', size: 1e6, priority: 1 }] : [{ index: 0, name: `${h}.mkv`, size: 4e9, priority: 1 }]) });
  w.cold.register({ userId: 1, hash: 'p', name: 'p', kind: 'movie', runtime: 120, alternatives: [{ hash: 's1', name: 'fake one' }, { hash: 's2', name: 'two' }] });
  await settle();
  await w.cold.round();
  assert.deepEqual(w.log.filter(([a]) => a === 'fake'), [['fake', 's1', false, false]], 'the fake spare is recorded, nothing runs again');
  assert.ok(w.log.some(([a, h]) => a === 'remove' && h === 's1'));
  const c = w.cold.list()[0];
  c.addedAt -= META_WAIT;
  await w.cold.round();
  assert.deepEqual(w.log.find(([a]) => a === 'swap'), ['swap', 'p', 's2', 'its file list never came']);
  assert.equal(c.hash, 's2');
  await w.cold.round();
  assert.ok(w.prewarmed.includes('s2-0'), 'the new pick runs for watching');
});

test('a slow pick: a spare runs next to it and takes over when clearly faster; an episode then brings the next ones', async () => {
  const w = world();
  w.cold.register({ userId: 1, hash: 'p', name: 'p', kind: 'episode', season: 1, episode: 4, runtime: 45, alternatives: [{ hash: 's1', name: 'one' }] });
  await settle();
  await w.cold.round();
  const c = w.cold.list()[0];
  w.torrents.get('p').dlspeed = 0.1e6;
  c.metaAt = Date.now() - RATE_SETTLE - 1;
  c.rate = 0.1e6;
  await w.cold.round();
  assert.ok(w.log.some(([a, h]) => a === 'start' && h === 's1'), 'started for comparison');
  w.torrents.get('s1').dlspeed = 3e6;
  for (let i = 0; i < 6; i++) await w.cold.round(); // its speed settles in
  c.spares[0].startedAt = Date.now() - SPARE_TRIAL - 1;
  await w.cold.round();
  assert.deepEqual(w.log.find(([a]) => a === 'swap'), ['swap', 'p', 's1', 'faster']);
  assert.equal(c.settled, true);
  c.addedAt -= COLD_MAX;
  await w.cold.round();
  assert.deepEqual(w.log.filter(([a]) => a === 'follow'), [['follow', 4]], 'once, after it has started well');
});

test('a season pack standing by for one episode downloads only that episode', async () => {
  const w = world({ files: (h) => (h === 'pk' ? [1, 2, 3].map((e) => ({ index: e - 1, name: `Show.S01E0${e}.mkv`, size: 2e9, priority: 1 })) : [{ index: 0, name: `${h}.mkv`, size: 2e9, priority: 1 }]) });
  const prepared = [];
  w.deps.prepareSpare = async (hash, files, index) => prepared.push([hash, index]);
  w.deps.pickFile = (c, t, files) => (files.length > 1 ? 1 : 0);
  w.cold.register({ userId: 1, hash: 'p', name: 'p', kind: 'episode', season: 1, episode: 2, alternatives: [], more: async () => [{ hash: 'pk', name: 'pack', pack: true }] });
  await settle();
  assert.deepEqual(w.cold.list()[0].spares.map((s) => [s.hash, s.pack]), [['pk', true]]);
  await w.cold.round();
  assert.deepEqual(prepared, [['pk', 1]]);
});

test('the pick removed by its owner ends the race and its spares', async () => {
  const w = world({ primaryMeta: false });
  w.cold.register({ userId: 1, hash: 'p', name: 'p', kind: 'movie', alternatives: [{ hash: 's1', name: 'one' }] });
  await settle();
  w.torrents.delete('p');
  await w.cold.round();
  assert.ok(w.log.some(([a, h]) => a === 'remove' && h === 's1'));
  assert.equal(w.cold.list().length, 0);
});

// ---------- the Download command hands a first-time watch its spares ----------
const GB = 1024 ** 3;
let n = 0;
const results = (rows) => parseTpb(rows.map(([name, seeders, size = 2 * GB, username = 'member1']) => ({
  info_hash: (++n).toString(16).padStart(40, '0'), name, seeders, leechers: 0, size, category: '207', status: 'member', username,
})), 'all');
const wait = async (id) => {
  for (let i = 0; i < 400 && smartJob(id).state === 'running'; i++) await new Promise((r) => setTimeout(r, 5));
  return smartJob(id);
};

test('Download on a film: the pick and the next two as spares; background jobs and nobody’s jobs get none', async () => {
  const rows = results([['Heat.1995.1080p.BluRay.x264', 900, 9 * GB], ['Heat.1995.1080p.WEB.x264', 400, 6 * GB], ['Heat.1995.720p.BluRay', 300, 4 * GB], ['Heat.1995.1080p.HDTV', 200, 4 * GB]]);
  const starts = [];
  const deps = (over = {}) => ({ parseName, searchTorrents: async () => ({ results: rows }), addDownload: async ({ link }) => ({ existing: false, hash: /btih:(\w+)/.exec(link)[1] }),
    coldStart: (x) => starts.push(x), ...over });
  await wait(startSmartJob({ type: 'movie', title: 'Heat', year: 1995, requester: 1, want: { profile: 'balanced' } }, deps()));
  assert.equal(starts.length, 1);
  assert.equal(starts[0].name, 'Heat.1995.1080p.BluRay.x264');
  assert.deepEqual(starts[0].alternatives.map((r) => r.name), ['Heat.1995.1080p.WEB.x264', 'Heat.1995.1080p.HDTV']);
  assert.equal(starts[0].kind, 'movie');
  await wait(startSmartJob({ type: 'movie', title: 'Heat', year: 1995, requester: 1, background: true, want: {} }, deps({ filmHave: async () => null })));
  await wait(startSmartJob({ type: 'movie', title: 'Heat', year: 1995, requester: null, want: {} }, deps()));
  assert.equal(starts.length, 1);
});

test('one episode asked for is a first-time watch; a fake’s uploader is skipped from then on', async () => {
  const rows = results([['Show.S01E04.1080p.WEB.H264-GRP', 50, 2 * GB, 'fakester'], ['Show.S01E04.1080p.WEB.H264-OTHER', 40, 2 * GB, 'honest']]);
  const starts = [], added = [];
  const deps = { parseName, seasonEpisodes: async () => ({ episodes: [1, 2, 3, 4].map((e) => ({ episode: e, aired: true })) }), haveEpisodes: async () => new Set(),
    searchTorrents: async () => ({ results: rows }), addDownload: async ({ link, name }) => { added.push(name); return { existing: false, hash: /btih:(\w+)/.exec(link)[1] }; },
    coldStart: (x) => starts.push(x) };
  await wait(startSmartJob({ type: 'tv', title: 'Show', season: 1, episodes: [4], requester: 1, want: { profile: 'balanced' } }, deps));
  assert.equal(starts.length, 1);
  assert.deepEqual([starts[0].kind, starts[0].season, starts[0].episode], ['episode', 1, 4]);
  assert.deepEqual(starts[0].alternatives.map((r) => r.name), ['Show.S01E04.1080p.WEB.H264-OTHER']);
  // The season pack stands by too (found a moment later, so the Download isn't held up by it).
  const packs = results([['Show.S01.1080p.WEB.H264-PACK', 300, 8 * GB]]);
  assert.equal((await starts[0].more()).length, 0, 'no pack in these results');
  starts.length = 0;
  await wait(startSmartJob({ type: 'tv', title: 'Show', season: 1, episodes: [2], requester: 1, want: { profile: 'balanced' } }, { ...deps, searchTorrents: async (q) => ({ results: /S01E0?2|1x02/i.test(q) ? results([['Show.S01E02.1080p.WEB.H264-OTHER', 40, 2 * GB, 'honest']]) : packs }) }));
  assert.deepEqual((await starts[0].more()).map((r) => [r.name, r.pack]), [['Show.S01.1080p.WEB.H264-PACK', true]]);
  // The pick turns out fake, but a spare already took over: nothing runs again, and that uploader is done for.
  const hash = /btih:(\w+)/.exec(rows[0].magnet)[1];
  const found = fakeFound(hash, { retry: false });
  assert.equal(found.retried, null);
  assert.equal(found.uploader, uploaderOf(rows[0]));
  assert.equal(uploaderOf({ source: 'tpb', uploader: 'Anonymous' }), null, 'a shared name never counts');
  added.length = 0;
  const more = results([['Show.S01E03.1080p.WEB.H264-GRP', 80, 2 * GB, 'fakester'], ['Show.S01E03.720p.WEB.H264-OTHER', 10, 1 * GB, 'honest']]);
  await wait(startSmartJob({ type: 'tv', title: 'Show', season: 1, episodes: [3], requester: 1, want: { profile: 'balanced' } }, { ...deps, searchTorrents: async () => ({ results: more }) }));
  assert.deepEqual(added, ['Show.S01E03.720p.WEB.H264-OTHER']);
});

test('a swap moves the Download’s record to the new release', async () => {
  const rows = results([['Ronin.1998.1080p.BluRay.x264', 900, 9 * GB], ['Ronin.1998.1080p.WEB.x264', 400, 6 * GB]]);
  const subs = [];
  const id = startSmartJob({ type: 'movie', title: 'Ronin', year: 1998, requester: 1, subs: ['sv'], want: {} }, { parseName, searchTorrents: async () => ({ results: rows }),
    addDownload: async ({ link }) => ({ existing: false, hash: /btih:(\w+)/.exec(link)[1] }), wantSubtitles: (link, list, name) => subs.push(name) });
  const job = await wait(id);
  const oldHash = job.added[0].hash;
  assert.equal(raceSwapped(oldHash, 'f'.repeat(40), { name: 'Ronin.1998.1080p.WEB.x264', link: 'magnet:?xt=urn:btih:' + 'f'.repeat(40), slow: true }), true);
  assert.equal(smartJob(id).added[0].name, 'Ronin.1998.1080p.WEB.x264');
  assert.deepEqual(subs, ['Ronin.1998.1080p.BluRay.x264', 'Ronin.1998.1080p.WEB.x264'], 'subtitles are fetched for the new one');
  assert.equal(fakeFound('f'.repeat(40), { retry: true }).retried != null, true, 'a fake verdict on it runs the Download again');
  const names = [];
  await wait(startSmartJob({ type: 'movie', title: 'Ronin', year: 1998, requester: 2, want: {} }, { parseName, searchTorrents: async () => ({ results: rows }),
    addDownload: async ({ name }) => { names.push(name); return { existing: false }; } }));
  assert.deepEqual(names, ['Ronin.1998.1080p.WEB.x264'], 'the one that couldn’t deliver is skipped for a day');
});

test('a quick search goes on without a slow site once another has found something', async () => {
  const { settleQuickly } = await import('../src/torrents.js');
  const later = (ms, value, fail = false) => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('down')) : resolve(value)), ms));
  const t0 = Date.now();
  const got = await settleQuickly([later(5, [1, 2]), later(10_000, [3]), later(5, null, true)], 50);
  assert.ok(Date.now() - t0 < 1000, 'didn’t wait for the slow one');
  assert.deepEqual(got.map((s) => s.status), ['fulfilled', 'rejected', 'rejected']);
  assert.equal(got[1].reason.message, 'still searching');
  const empty = await settleQuickly([later(5, []), later(30, [9])], 1000);
  assert.deepEqual(empty[1].value, [9], 'nothing found yet: waits for the others');
  assert.deepEqual(await settleQuickly([], 10), []);
});
