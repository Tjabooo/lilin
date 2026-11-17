import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRange, cuesToVtt, planCut, pickAudio, MAX_SECONDS } from '../src/moments.js';
import { clampRange, stripWindow } from '../public/moments.js';

test('moment times: at least 2 s, at most 3 min, inside the video', () => {
  assert.deepEqual(checkRange(10, 40, 100), { start: 10, end: 40, length: 30 });
  assert.deepEqual(checkRange(-5, 20, 100), { start: 0, end: 20, length: 20 });
  assert.equal(checkRange(90, 130, 100).end, 100, 'an end past the video stops at its end');
  assert.throws(() => checkRange(10, 11, 100), /at least 2 seconds/);
  assert.throws(() => checkRange(0, MAX_SECONDS + 1, 1000), /at most 3 minutes/);
  assert.equal(checkRange(0, MAX_SECONDS, 1000).length, 180);
  assert.throws(() => checkRange(100, 103, 100), /past the end/);
  assert.throws(() => checkRange('x', 3), /starts and ends/);
  assert.throws(() => checkRange(null, undefined), /starts and ends/);
});

test('the picker keeps the range legal as either edge moves', () => {
  assert.deepEqual(clampRange(10, 400, 'start', 1000), { start: 10, end: 190 }, 'the end follows a start that made it too long');
  assert.deepEqual(clampRange(0, 400, 'end', 1000), { start: 220, end: 400 }, 'and the start follows the end');
  assert.deepEqual(clampRange(50, 50.5, 'start', 1000), { start: 50, end: 52 });
  assert.deepEqual(clampRange(990, 1200, 'end', 1000), { start: 990, end: 1000 });
  const w = stripWindow(100, 130, 7200);
  assert.equal(w.to - w.from, 360);
  assert.ok(w.from <= 100 && w.to >= 130);
  assert.deepEqual(stripWindow(5, 35, 7200), { from: 0, to: 360 }, 'the window stays inside the video');
  assert.deepEqual(stripWindow(0, 30, 200), { from: 0, to: 200 }, 'a short video shows whole');
});

test('subtitle cues become a WebVTT on the moment’s own clock, as plain text', () => {
  const vtt = cuesToVtt([
    { start: 5, end: 9, text: 'before' },
    { start: 9, end: 11, text: '<i>Hello</i>\nthere' },
    { start: 20, end: 25, text: 'last --> one' },
    { start: 40, end: 41, text: 'after' },
  ], 10, 22);
  assert.equal(vtt, 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\nthere\n\n00:00:10.000 --> 00:00:12.000\nlast → one\n');
  assert.equal(cuesToVtt([], 0, 10), null);
  assert.equal(cuesToVtt('nope', 0, 10), null);
});

test('cutting: copy when the source is browser-safe and a keyframe is at the start, else encode', () => {
  const h264 = { index: 0, codec_name: 'h264', pix_fmt: 'yuv420p', height: 1080 };
  const audio = { index: 2, codec_name: 'dts' };
  const copy = planCut({ input: 'C:\\Media\\Film.mkv', output: 'C:\\cache\\m.tmp.mp4', video: h264, audio, start: 61.1, end: 91.1, keyframes: [58.0, 60.97, 63.0] });
  assert.equal(copy.mode, 'copy');
  assert.deepEqual(copy.args.slice(copy.args.indexOf('-ss'), copy.args.indexOf('-ss') + 2), ['-ss', '60.970']);
  assert.ok(copy.args.includes('C:\\Media\\Film.mkv'));
  assert.equal(copy.args[copy.args.indexOf('-c:v') + 1], 'copy');
  assert.equal(copy.args[copy.args.indexOf('-t') + 1], '30.000');
  assert.equal(copy.args[copy.args.indexOf('-c:a') + 1], 'aac', 'audio is always made browser-safe');
  assert.ok(copy.args.includes('0:2'));
  assert.equal(copy.args.at(-1), 'C:\\cache\\m.tmp.mp4');

  const far = planCut({ input: 'a', output: 'b', video: h264, audio, start: 61.5, end: 70, keyframes: [60.0, 64.0] });
  assert.equal(far.mode, 'x264');
  assert.equal(far.args[far.args.indexOf('-ss') + 1], '61.500');
  const hevc = planCut({ input: 'a', output: 'b', video: { index: 0, codec_name: 'hevc', pix_fmt: 'yuv420p10le', height: 2160, color_transfer: 'smpte2084' },
    audio: null, start: 1, end: 5, keyframes: [1], encoder: 'nvenc' });
  assert.equal(hevc.mode, 'nvenc');
  assert.match(hevc.args[hevc.args.indexOf('-vf') + 1], /min\(1080,ih\).*tonemap/);
  assert.ok(!hevc.args.includes('-c:a'));
});

test('the audio is the person’s language, else the default track', () => {
  const a = [{ index: 1, tags: { language: 'eng' } }, { index: 2, tags: { language: 'swe' }, disposition: { default: 1 } }];
  assert.equal(pickAudio(a, 'sv').index, 2);
  assert.equal(pickAudio([{ index: 1, tags: { language: 'swe' } }, { index: 2, tags: { language: 'eng' }, disposition: { default: 1 } }], 'sv').index, 1);
  assert.equal(pickAudio(a, 'en').index, 1);
  assert.equal(pickAudio(a, '').index, 2);
  assert.equal(pickAudio([], 'en'), null);
});
