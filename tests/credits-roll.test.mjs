import test from 'node:test';
import assert from 'node:assert/strict';
import { creditsRollStart, parseLooks } from '../src/credits.js';

// Keyframes every 2.5 s from `from` to `to`, each made by look(t).
const frames = (from, to, look) => { const out = []; for (let t = from; t <= to; t += 2.5) out.push({ t, ...look(t) }); return out; };
const scene = { y: 160, lo: 40, hi: 230, s: 14 };
const page = { y: 16, lo: 15, hi: 16, s: 2 }; // text on black
const busyPage = { y: 19, lo: 15, hi: 34, s: 2.2 }; // a page with more names
const darkScene = { y: 24, lo: 16, hi: 38, s: 1.8 }; // a dim, colourless closing shot

test('a time found inside the credits moves back to where the black pages start', () => {
  // Rings of Power S02E03: the audio match landed at 3757.9, the roll starts at 3702.5.
  const f = frames(3510, 3830, (t) => (t < 3702 ? scene : t < 3737 ? page : busyPage));
  assert.equal(creditsRollStart(f, 3757.9, 3830.6), 3702.5);
});

test('a time already at the start of the credits stays', () => {
  const f = frames(3510, 3830, (t) => (t < 3702 ? scene : page));
  assert.equal(creditsRollStart(f, 3702.5, 3830.6), null);
});

test('never later: a time before the black pages (anime ending, credits over footage) is left alone', () => {
  const f = frames(1200, 1440, (t) => (t < 1340 ? scene : page));
  assert.equal(creditsRollStart(f, 1260, 1440), null);
});

test('a dark, colourless closing scene is not credits', () => {
  const f = frames(3800, 4000, (t) => (t < 3860 ? scene : darkScene));
  assert.equal(creditsRollStart(f, 3960, 4497), null);
});

test('a fade to black in the scene is too short to start the roll', () => {
  const f = frames(3500, 3800, (t) => (t >= 3600 && t < 3605 ? page : t < 3700 ? busyPage : scene));
  assert.equal(creditsRollStart(f, 3690, 3800), null);
});

test('the roll may break for a logo', () => {
  const f = frames(2000, 2300, (t) => (t < 2100 ? scene : t >= 2150 && t < 2155 ? scene : page));
  assert.equal(creditsRollStart(f, 2250, 2300), 2100);
});

test('never before the middle or further back than four minutes', () => {
  const f = frames(0, 2000, (t) => (t < 400 ? scene : page));
  assert.equal(creditsRollStart(f, 1900, 2000), null);
});

test('ffmpeg metadata print is read, with timestamps from the start of the look', () => {
  const out = [
    'frame:0    pts:0       pts_time:0',
    'lavfi.signalstats.YLOW=15', 'lavfi.signalstats.YAVG=16.2', 'lavfi.signalstats.YHIGH=16', 'lavfi.signalstats.SATAVG=2.01',
    'frame:1    pts:2500    pts_time:2.5',
    'lavfi.signalstats.YLOW=40', 'lavfi.signalstats.YAVG=150', 'lavfi.signalstats.YHIGH=220', 'lavfi.signalstats.SATAVG=12',
  ].join('\n');
  assert.deepEqual(parseLooks(out, 3500), [{ t: 3500, y: 16.2, lo: 15, hi: 16, s: 2.01 }, { t: 3502.5, y: 150, lo: 40, hi: 220, s: 12 }]);
  // Files that keep their own timestamps after the seek.
  assert.equal(parseLooks(out.replace('pts_time:0', 'pts_time:3500.4').replace('pts_time:2.5', 'pts_time:3502.9'), 3500)[0].t, 3500.4);
});
