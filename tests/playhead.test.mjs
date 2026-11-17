import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PartialStreams, readyToStart, startBytes } from '../src/partial-stream.js';
import { PlayheadService, playheadBinding, bindingArgs, mergeStates, statesString } from '../src/playhead.js';
import { ensurePlayhead, playheadAsset, PLAYHEAD_SHA256 } from '../src/setup/playhead.js';

const PIECE = 1024;
const HASH = 'b'.repeat(40);

test('playhead is bound where qBittorrent is bound, or not run at all', async () => {
  const qbit = (prefs) => async () => prefs;
  assert.deepEqual(await playheadBinding({ env: {}, qbit: qbit({ current_interface_address: '10.1.2.3', current_network_interface: 'iftype53_32768' }), platform: 'win32' }),
    { address: '10.1.2.3', mirrored: true });
  assert.equal(await playheadBinding({ env: {}, qbit: qbit({ current_interface_address: '', current_network_interface: 'iftype53_32768' }), platform: 'win32' }), null,
    'a Windows interface ID can’t be mirrored: playhead stays off');
  assert.deepEqual(await playheadBinding({ env: {}, qbit: qbit({ current_interface_address: '', current_network_interface: 'wg0' }), platform: 'linux' }),
    { interface: 'wg0', mirrored: true });
  assert.deepEqual(await playheadBinding({ env: {}, qbit: qbit({ current_interface_address: '0.0.0.0', current_network_interface: '' }) }), { unbound: true, mirrored: true });
  assert.deepEqual(await playheadBinding({ env: { PLAYHEAD_BIND_ADDRESS: '10.9.9.9' }, qbit: qbit({}) }), { address: '10.9.9.9' });
  assert.deepEqual(bindingArgs({ address: '10.1.2.3' }), ['--bind-address', '10.1.2.3']);
  assert.equal(bindingArgs(null), null);
});

test('readable pieces come from qBittorrent or playhead', () => {
  assert.deepEqual(mergeStates([2, 1, 0, 0], '0022'), [2, 1, 2, 2]);
  assert.deepEqual(mergeStates([2, 0], ''), [2, 0]);
  assert.equal(statesString([2, 1, 0, 7]), '2100');
});

test('the playhead download is only installed when it matches its pinned checksum', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const asset = playheadAsset('linux', 'x64');
  const good = Buffer.from('pretend binary');
  const fetchOf = (body) => async () => ({ ok: true, arrayBuffer: async () => body });
  await assert.rejects(ensurePlayhead({ dataDir: dir, env: {}, platform: 'linux', arch: 'x64', fetchFn: fetchOf(good), log: {} }), /checksum/);
  await assert.rejects(fs.access(path.join(dir, 'bin', 'playhead')), 'nothing written on a mismatch');
  const saved = PLAYHEAD_SHA256[asset];
  PLAYHEAD_SHA256[asset] = crypto.createHash('sha256').update(good).digest('hex');
  t.after(() => { PLAYHEAD_SHA256[asset] = saved; });
  const file = await ensurePlayhead({ dataDir: dir, env: {}, platform: 'linux', arch: 'x64', fetchFn: fetchOf(good), log: {} });
  assert.deepEqual(await fs.readFile(file), good);
  let fetched = false;
  await ensurePlayhead({ dataDir: dir, env: {}, platform: 'linux', arch: 'x64', fetchFn: async () => { fetched = true; }, log: {} });
  assert.equal(fetched, false, 'a checked copy isn’t downloaded again');
  assert.equal(await ensurePlayhead({ dataDir: dir, env: { PLAYHEAD_BIN: '/opt/playhead' } }), path.resolve('/opt/playhead'));
});

// A qBittorrent stand-in plus a PartialStreams on it.
function rig(t, { size, states }) {
  const torrent = { hash: HASH, state: 'downloading', seq_dl: true, f_l_piece_prio: true, force_start: false, dlspeed: 1000, save_path: '/x' };
  const list = [{ index: 0, name: 'Film.mkv', size, priority: 1, piece_range: [0, Math.ceil(size / PIECE) - 1] }];
  const qbit = async (endpoint) => {
    if (endpoint.includes('/torrents/info')) return [{ ...torrent }];
    if (endpoint.includes('/torrents/files')) return list;
    if (endpoint.includes('/torrents/properties')) return { piece_size: PIECE };
    if (endpoint.includes('/torrents/pieceStates')) return states();
    throw new Error(`unexpected ${endpoint}`);
  };
  return (file, extra) => {
    const s = new PartialStreams({ qbit, post: async () => {}, filePath: () => file, isVideo: () => true, start: async () => {},
      probe: async () => ({ duration: 100, bitrate: 1000, height: 1080 }), log: {}, ...extra });
    t.after(() => s.close());
    return s;
  };
}

// A playhead stand-in serving `data`; `cutAfter` bytes into a response it drops the connection, `stallAfter` bytes
// into one it sends nothing more (and never ends it).
async function fakePlayhead(t, data, { cutAfter = Infinity, stallAfter = Infinity, own = '' } = {}) {
  const calls = { open: [], update: [], close: [] };
  const server = http.createServer((req, res) => {
    const [, s, e] = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '') || [];
    const start = Number(s || 0), end = Number(e || data.length - 1);
    res.writeHead(206, { 'Content-Length': end - start + 1 });
    const body = data.subarray(start, end + 1);
    if (body.length > stallAfter) { res.write(body.subarray(0, stallAfter)); return; }
    if (body.length > cutAfter) { res.write(body.subarray(0, cutAfter)); setTimeout(() => res.destroy(), 50); } else res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections?.(); server.close(); });
  const port = server.address().port;
  const assist = {
    ready: async () => true,
    open: async (o) => { calls.open.push(o); return { id: 'x1', url: '/s/x1/file/0', state: 'ready' }; },
    update: async (id, u) => { calls.update.push(u); },
    status: async () => ({ own, download_rate: 5000, peers_connected: 4 }),
    close: async (id) => { calls.close.push(id); },
    fetchRange: (url, a, b, signal) => fetch(`http://127.0.0.1:${port}${url}`, { headers: { Range: `bytes=${a}-${b}` }, signal }),
  };
  return { assist, calls };
}

test('with playhead helping, Play now reads through it, including parts qBittorrent doesn’t have', { timeout: 15000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const real = crypto.randomBytes(8192);
  const file = path.join(dir, 'Film.mkv');
  const partial = Buffer.alloc(8192);
  real.copy(partial, 0, 0, 2048);
  await fs.writeFile(file, partial);
  const make = rig(t, { size: 8192, states: () => [2, 2, 0, 0, 0, 0, 0, 0] });
  const { assist, calls } = await fakePlayhead(t, real, { own: '00000022' });
  const streams = make(file, { assist, exportTorrent: async () => Buffer.from('torrent'), peersOf: async () => ['1.2.3.4:5'], trackersOf: async () => ['udp://t:1'] });
  const id = `${HASH}-0`;
  const { entry } = await streams.open(id);
  await entry.assisting;
  assert.ok(entry.assist, 'playhead was started for it');
  assert.deepEqual(calls.open[0].peers, ['1.2.3.4:5']);
  assert.deepEqual(calls.open[0].paths, [file]);
  assert.equal(calls.open[0].startLead, 8192, 'playhead fetches the start too (here: the whole small file)');
  await streams.refresh(entry, { force: true });
  assert.equal(calls.update.at(-1).states.join(''), '22000000', 'qBittorrent’s states were passed on');
  assert.equal(streams.readable(entry, 6144), 2048, 'playhead’s own pieces count as readable');
  const st = streams.status(entry);
  assert.equal(st.assisted, true);
  assert.equal(st.speed, 6000);
  // A seek far past qBittorrent's download is answered at once.
  const url = await streams.inputUrl(entry);
  const r = await fetch(url, { headers: { Range: 'bytes=5000-8191' } });
  assert.equal(r.status, 206);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), real.subarray(5000));
  // Leaving closes the playhead stream.
  await streams.sweep(Date.now() + 10 * 60_000);
  assert.deepEqual(calls.close, ['x1']);
});

test('if playhead fails mid-read, the read carries on from qBittorrent at the same spot', { timeout: 15000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const real = crypto.randomBytes(8192);
  const file = path.join(dir, 'Film.mkv');
  await fs.writeFile(file, real); // qBittorrent has it all
  const make = rig(t, { size: 8192, states: () => new Array(8).fill(2) });
  const { assist, calls } = await fakePlayhead(t, real, { cutAfter: 3000 });
  const streams = make(file, { assist, exportTorrent: async () => null });
  const { entry } = await streams.open(`${HASH}-0`);
  await entry.assisting;
  assert.ok(entry.assist);
  const url = await streams.inputUrl(entry);
  const got = Buffer.from(await (await fetch(url)).arrayBuffer());
  assert.equal(got.length, 8192);
  assert.ok(got.equals(real), 'no gap, no repeat at the switch-over');
  assert.equal(entry.assist, null, 'playhead was dropped');
  assert.deepEqual(calls.close, ['x1']);
});

// 2026-11-17: Blade Runner 2049 waited 168 s for its start while playhead was stuck (its API timing out); every such
// timeout used to end playhead's stream for good. Now: a read stalled on bytes qBittorrent has comes from its file, and
// playhead not answering means qBittorrent alone until it answers again, with its stream (and peers) kept.
test('a read through playhead that stalls on bytes qBittorrent has comes from qBittorrent’s file; playhead stays', { timeout: 20000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const real = crypto.randomBytes(8192);
  const file = path.join(dir, 'Film.mkv');
  await fs.writeFile(file, real); // qBittorrent has it all
  const make = rig(t, { size: 8192, states: () => new Array(8).fill(2) });
  const { assist, calls } = await fakePlayhead(t, real, { stallAfter: 1500 });
  const streams = make(file, { assist, exportTorrent: async () => null });
  const { entry } = await streams.open(`${HASH}-0`);
  await entry.assisting;
  assert.ok(entry.assist);
  const url = await streams.inputUrl(entry);
  const at = Date.now();
  const got = Buffer.from(await (await fetch(url)).arrayBuffer());
  assert.ok(got.equals(real), 'all of it, no gap, no repeat');
  assert.ok(Date.now() - at < 9000, 'rescued within seconds');
  assert.ok(entry.assist, 'playhead is still helping');
  assert.deepEqual(calls.close, []);
});

test('playhead not answering: qBittorrent alone meanwhile, the same stream again once it answers; a lost stream is dropped', { timeout: 15000 }, async (t) => {
  const real = crypto.randomBytes(8192);
  const make = rig(t, { size: 8192, states: () => [2, 2, 0, 0, 0, 0, 0, 0] });
  const { assist, calls } = await fakePlayhead(t, real, { own: '00000022' });
  const streams = make('/nowhere/Film.mkv', { assist, exportTorrent: async () => null });
  const { entry } = await streams.open(`${HASH}-0`);
  await entry.assisting;
  let fail = null;
  assist.update = async () => { if (fail) throw fail; };
  await streams.refresh(entry, { force: true });
  assert.equal(streams.readable(entry, 6144), 2048, 'its pieces count while it answers');
  fail = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  for (let i = 0; i < 3; i++) await streams.refresh(entry, { force: true });
  assert.ok(entry.assist && entry.assistQuiet, 'quiet, not dropped');
  assert.equal(streams.helping(entry), false);
  assert.equal(streams.readable(entry, 6144), 0, 'its pieces don’t count while it doesn’t answer');
  assert.equal(streams.status(entry).assisted, false);
  fail = null;
  await streams.refresh(entry, { force: true });
  assert.equal(entry.assistQuiet, null);
  assert.equal(streams.helping(entry), true, 'helping again, same stream');
  assert.deepEqual(calls.close, []);
  fail = Object.assign(new Error('playhead: no such stream'), { status: 404 });
  await streams.refresh(entry, { force: true });
  assert.equal(entry.assist, null, 'its stream is gone: dropped (started again later)');
});

// Matroska keeps tags and cues at its end, which ffmpeg reads first when it can seek: a start that doesn't wait for the
// last piece reads the file from the start instead (MP4 is left alone: its index can be at the end).
test('a Matroska start doesn’t wait for the last piece: probed from the start, the usual probe if that fails', async (t) => {
  let states = [2, 2, 2, 0, 0, 0, 0, 0];
  const make = rig(t, { size: 8192, states: () => states });
  const asked = [];
  let linearFails = false;
  const probe = async (input, opts) => { asked.push(Boolean(opts.linear)); if (opts.linear && linearFails) throw new Error('no'); return { duration: 100, bitrate: 1000, height: 1080 }; };
  const streams = make('/x/Film.mkv', { probe });
  const { entry } = await streams.open(`${HASH}-0`);
  await entry.probing;
  assert.deepEqual(asked, [true]);
  assert.equal(streams.linearStart(entry), true);
  states = new Array(8).fill(2);
  await streams.refresh(entry, { force: true });
  assert.equal(streams.linearStart(entry), false, 'the end is there: the usual way');
  const mp4 = make('/x/Film.mp4', { probe });
  mp4.entries.clear();
  const { entry: m } = await mp4.open(`${HASH}-0`);
  m.name = 'Film.mp4';
  assert.equal(mp4.linearStart(m), false);
  // A file that needs its end after all (no duration up front): probed the usual way at once, not counted as a failure.
  states = [2, 2, 2, 0, 0, 0, 0, 0];
  linearFails = true;
  asked.length = 0;
  const again = make('/x/Film.mkv', { probe });
  const { entry: e2 } = await again.open(`${HASH}-0`);
  await e2.probing;
  assert.deepEqual(asked, [true, false]);
  assert.ok(e2.info);
  assert.equal(e2.probeFailures, 0);
});

test('playhead can’t start without a safe binding, and a missing program just means qBittorrent alone', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let spawned = 0;
  const spawnFn = () => { spawned++; throw new Error('should not spawn'); };
  const noBinding = new PlayheadService({ bin: async () => process.execPath, binding: async () => null, dataDir: dir, cacheDir: dir, spawnFn, log: {} });
  assert.equal(await noBinding.ready(), false);
  assert.match(noBinding.reason, /can’t mirror/);
  const noProgram = new PlayheadService({ bin: async () => path.join(dir, 'nope'), binding: async () => ({ unbound: true }), dataDir: dir, cacheDir: dir, spawnFn, log: {} });
  assert.equal(await noProgram.ready(), false);
  assert.equal(spawned, 0);
});

// The real thing, when a playhead build is given: PLAYHEAD_E2E_BIN=/path/to/playhead node --test tests/playhead.test.mjs
// A local seeder (playhead seed) has the whole file; "qBittorrent" has the first quarter. Play now streams
// all of it through the real daemon.
test('end to end with a real playhead', { skip: !process.env.PLAYHEAD_E2E_BIN, timeout: 60000 }, async (t) => {
  const bin = process.env.PLAYHEAD_E2E_BIN;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ph-e2e-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const size = 4 * 1024 * 1024, piece = 64 * 1024;
  const real = crypto.randomBytes(size);
  const source = path.join(dir, 'Film.mkv');
  await fs.writeFile(source, real);
  const run = (args) => new Promise((resolve, reject) => {
    const c = spawn(bin, args); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('exit', (code) => (code ? reject(new Error(`exit ${code}`)) : resolve(out)));
  });
  const torrentFile = path.join(dir, 'film.torrent');
  const [hash] = (await run(['make-torrent', source, '-o', torrentFile, '--piece-kb', String(piece / 1024)])).trim().split(' ');
  const seeder = spawn(bin, ['seed', torrentFile, source, '--listen', '127.0.0.1:0']);
  t.after(() => seeder.kill());
  const seedAddr = await new Promise((resolve) => {
    let out = '';
    seeder.stdout.on('data', (d) => { out += d; const m = /seeding \w+ on (\S+)/.exec(out); if (m) resolve(m[1]); });
  });
  const qbitFile = path.join(dir, 'qbit', 'Film.mkv');
  await fs.mkdir(path.dirname(qbitFile));
  const have = size / 4;
  const partial = Buffer.alloc(size);
  real.copy(partial, 0, 0, have);
  await fs.writeFile(qbitFile, partial);
  const n = size / piece;
  const states = Array.from({ length: n }, (_, i) => (i < n / 4 ? 2 : 0));
  const service = new PlayheadService({ bin: async () => bin, binding: async () => ({ unbound: true }), dataDir: dir, cacheDir: path.join(dir, 'cache'),
    extraArgs: ['--no-dht'], log: {} });
  t.after(() => service.stop());
  const torrentBytes = await fs.readFile(torrentFile);
  const streams = new PartialStreams({
    qbit: async (endpoint) => {
      if (endpoint.includes('/torrents/info')) return [{ hash, state: 'downloading', seq_dl: true, f_l_piece_prio: true, dlspeed: 0, save_path: dir }];
      if (endpoint.includes('/torrents/files')) return [{ index: 0, name: 'Film.mkv', size, priority: 1, piece_range: [0, n - 1] }];
      if (endpoint.includes('/torrents/properties')) return { piece_size: piece };
      if (endpoint.includes('/torrents/pieceStates')) return states;
      throw new Error(endpoint);
    },
    post: async () => {}, filePath: () => qbitFile, isVideo: () => true, start: async () => {}, probe: async () => ({ duration: 100, bitrate: 1000 }), log: {},
    assist: service, exportTorrent: async () => torrentBytes, peersOf: async () => [seedAddr], trackersOf: async () => [],
  });
  t.after(() => streams.close());
  const { entry } = await streams.open(`${hash}-0`);
  await entry.assisting;
  assert.ok(entry.assist, `playhead didn’t start: ${service.reason}`);
  const url = await streams.inputUrl(entry);
  const got = Buffer.from(await (await fetch(url, { headers: { Range: `bytes=${size / 2}-` } })).arrayBuffer());
  assert.ok(got.equals(real.subarray(size / 2)), 'a seek past qBittorrent’s part streams correctly');
  const all = Buffer.from(await (await fetch(url)).arrayBuffer());
  assert.ok(all.equals(real), 'the whole file streams correctly');
  await streams.refresh(entry, { force: true });
  assert.equal(entry.assist.own.slice(0, n / 4), '0'.repeat(n / 4), 'qBittorrent’s part was read from its file, not downloaded');
});

test('with playhead helping, playback starts on a shorter lead', () => {
  const size = 1e10, bitrate = 8e6; // 1 MB/s
  const lead = { min: 8, goal: 20, graceMs: 8000 };
  assert.equal(readyToStart(25e6, size, bitrate, null, 0), false, 'qBittorrent alone wants 45 s');
  assert.equal(readyToStart(25e6, size, bitrate, null, 0, lead), true, 'helped: 20 s is enough');
  assert.equal(readyToStart(startBytes(size, bitrate, 8), size, bitrate, 0, 9000, lead), true, 'or 8 s after a short grace');
});
