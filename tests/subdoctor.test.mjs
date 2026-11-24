import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SubDoctor, diagnose } from '../src/subdoctor.js';
import { parseCues } from '../src/subsync.js';

const stamp = (t) => { const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(Math.floor(t) % 60)},000`; };
// n lines spread evenly up to `until` seconds.
const srt = (n, until) => Array.from({ length: n }, (_, i) => { const t = Math.round((i + 1) * until / n) - 2; return `${i + 1}\n${stamp(t)} --> ${stamp(t + 1.5)}\nline ${i}\n`; }).join('\n');

function setup(files, deps = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-doctor-'));
  const old = Date.now() - 3600_000;
  for (const [name, body] of Object.entries(files)) { const p = path.join(dir, name); fs.writeFileSync(p, body); fs.utimesSync(p, old / 1000, old / 1000); }
  const video = path.join(dir, Object.keys(files).find((n) => n.endsWith('.mp4')));
  const sidecar = video.replace(/\.mp4$/, '.en.srt');
  const calls = [];
  const doctor = new SubDoctor({
    dataDir: dir, log: () => {},
    videos: async () => [video],
    infoFor: () => ({ title: 'Film', tmdbId: 1 }),
    findSidecar: (f) => (fs.existsSync(sidecar) ? sidecar : null),
    ensureSubtitle: async () => { calls.push('ensure'); fs.writeFileSync(sidecar, srt(900, 7000)); return sidecar; },
    otherUploads: async () => { calls.push('others'); return []; },
    parseCues,
    duration: async () => 7200,
    sync: () => calls.push('sync'),
    ...deps,
  });
  return { dir, video, sidecar, doctor, calls };
}

test('diagnose: fine, short, long, unreadable, missing', () => {
  assert.equal(diagnose({ text: srt(900, 7000), duration: 7200, parseCues }), null);
  assert.equal(diagnose({ text: srt(500, 3000), duration: 7200, parseCues }), 'short');
  assert.equal(diagnose({ text: srt(1800, 12000), duration: 7358, parseCues }), 'long');
  assert.equal(diagnose({ text: 'garbage', duration: 7200, parseCues }), 'unreadable');
  assert.equal(diagnose({ text: null, duration: 7200, parseCues }), 'missing');
  assert.equal(diagnose({ text: srt(10, 300), duration: 600, parseCues }), null, 'short clips are not judged on coverage');
});

test('a video without English subtitles gets them', async () => {
  const { doctor, sidecar, calls } = setup({ 'Film.mp4': 'x' });
  const t = await doctor.round();
  assert.ok(fs.existsSync(sidecar));
  assert.deepEqual(calls, ['ensure', 'sync']);
  assert.equal(t.fixed, 1);
  assert.equal((await doctor.round()).checked, 0, 'a fixed video is not checked again right away');
});

test('an unreadable file is set aside and fetched again', async () => {
  const { doctor, sidecar, dir, calls } = setup({ 'Film.mp4': 'x', 'Film.en.srt': '\u0000\u0001 nothing timed' });
  await doctor.round();
  assert.deepEqual(calls, ['ensure', 'sync']);
  assert.equal(parseCues(fs.readFileSync(sidecar, 'utf8')).length, 900);
  assert.equal(fs.readdirSync(path.join(dir, 'cache', 'subdoctor')).length, 1);
});

test('subtitles that stop halfway are replaced by an upload that covers the video', async () => {
  const { doctor, sidecar } = setup({ 'Film.mp4': 'x', 'Film.en.srt': srt(400, 3000) }, {
    otherUploads: async () => [{ text: srt(300, 2500), label: 'also short' }, { text: srt(950, 7100), label: 'full' }],
  });
  await doctor.round();
  assert.equal(parseCues(fs.readFileSync(sidecar, 'utf8')).length, 950);
  assert.equal(doctor.state[Object.keys(doctor.state)[0]].status, 'ok');
});

test('when every upload runs past the end, the video is reported as cut off', async () => {
  const { doctor } = setup({ 'Film.mp4': 'x', 'Film.en.srt': srt(1800, 12000) }, {
    duration: async () => 7358,
    otherUploads: async () => [{ text: srt(1700, 12010), label: 'a' }, { text: srt(1750, 11990), label: 'b' }],
  });
  await doctor.round();
  assert.equal(Object.values(doctor.state)[0].status, 'video-short');
});

test('no downloads when the daily limit is nearly used; tried again later', async () => {
  let now = Date.now();
  const { doctor, calls } = setup({ 'Film.mp4': 'x' }, { quotaLow: () => true, now: () => now });
  await doctor.round();
  assert.deepEqual(calls, []);
  assert.equal(Object.values(doctor.state)[0].status, 'waiting');
  now += 7 * 3600 * 1000;
  doctor.deps.quotaLow = () => false;
  await doctor.round();
  assert.deepEqual(calls, ['ensure', 'sync']);
});

test('a failed download is retried on a later round', async () => {
  let now = Date.now();
  let fail = true;
  const { doctor, sidecar } = setup({ 'Film.mp4': 'x' }, {
    now: () => now,
    ensureSubtitle: async () => { if (fail) throw Object.assign(new Error('rejected'), { status: 502 }); fs.writeFileSync(sidecar, srt(900, 7000)); return sidecar; },
  });
  await doctor.round();
  assert.equal(Object.values(doctor.state)[0].status, 'failed');
  fail = false; now += 7 * 3600 * 1000;
  await doctor.round();
  assert.equal(Object.values(doctor.state)[0].status, 'ok');
});

test('extras and unmatched videos are left alone', async () => {
  const a = setup({ 'Interview.mp4': 'x' }, { duration: async () => 600 });
  await a.doctor.round();
  assert.deepEqual(a.calls, []);
  const b = setup({ 'Random home video.mp4': 'x' }, { infoFor: () => ({ title: 'Random home video' }) });
  await b.doctor.round();
  assert.deepEqual(b.calls, []);
  assert.equal(Object.values(b.doctor.state)[0].status, 'nothing');
});
