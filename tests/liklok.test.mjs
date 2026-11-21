import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClips, parseSrt, episodeQueue, planClip, pickSubtitleTrack } from '../src/liklok.js';
import { parseVtt } from '../public/liklok.js';

// A made-up 22-minute episode: a cut every 8 s, quiet talk, and one lively scene at 10:00-10:50 that ends on a laugh.
function episode() {
  const duration = 1320, cuts = [], rms = [], cues = [];
  for (let t = 8; t < duration; t += 8) cuts.push(t + 0.04);
  for (let s = 0; s < duration; s++) rms[s] = s >= 600 && s < 650 ? -18 : -30;
  for (let t = 30; t < duration - 30; t += 12) {
    if (t >= 590 && t < 660) continue;
    cues.push({ start: t + 1, end: t + 4, text: 'We should talk about the budget.' });
  }
  for (let t = 601; t < 646; t += 2.5) cues.push({ start: t, end: t + 2, text: t % 5 < 2.5 ? '- Out of my way!\n- Why are you crying?' : 'Get us a channel to the ocean!' });
  cues.push({ start: 647, end: 649, text: '[audience laughing]' });
  return { duration, cuts, rms, cues: cues.sort((a, b) => a.start - b.start) };
}

test('pickClips finds the lively scene, starting and ending on cuts and never mid-line', () => {
  const ep = episode();
  const clips = pickClips(ep);
  assert.ok(clips.length >= 1 && clips.length <= 3);
  const best = clips[0];
  assert.ok(best.start < 610 && best.end > 640, JSON.stringify(best));
  assert.ok(best.end - best.start >= 22 && best.end - best.start <= 70);
  for (const c of clips) {
    assert.ok(ep.cuts.includes(c.start) || !ep.cues.some((q) => q.start < c.start && q.end > c.start));
    assert.ok(!ep.cues.filter((q) => !/^\[/.test(q.text)).some((q) => q.start < c.end - 0.1 && q.end > c.end + 0.1), `ends mid-line: ${c.end}`);
  }
  // no two clips overlap
  for (const a of clips) for (const b of clips) if (a !== b) assert.ok(a.end <= b.start || b.end <= a.start);
});

test('pickClips keeps out of the recap, the opening titles and the last 15 %', () => {
  const ep = episode();
  const clips = pickClips({ ...ep, avoid: [[0, 90], [590, 660]], from: 91 });
  for (const c of clips) {
    assert.ok(c.start >= 91);
    assert.ok(c.end <= 590 || c.start >= 660, JSON.stringify(c));
    assert.ok(c.end <= ep.duration * 0.85);
  }
});

test('pickClips gives nothing for short videos and works without subtitles', () => {
  assert.deepEqual(pickClips({ duration: 100, cuts: [10, 20], rms: [] }), []);
  const { duration, cuts, rms } = episode();
  const clips = pickClips({ duration, cuts, rms });
  assert.ok(clips.length > 0);
  assert.match(clips[0].why, /no subs/);
});

test('parseSrt reads text, drops tags and broken blocks', () => {
  const cues = parseSrt('﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i> there\r\n\r\n2\r\n00:00:05,000 --> 00:00:04,000\r\nbackwards\r\n\r\n3\r\n00:01:00.250 --> 00:01:02,000\r\n- One\r\n- Two\r\n');
  assert.deepEqual(cues, [{ start: 1, end: 3.5, text: 'Hello there' }, { start: 60.25, end: 62, text: '- One\n- Two' }]);
});

test('parseVtt reads what the server writes', () => {
  assert.deepEqual(parseVtt('WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nHi\nthere\n\n00:01:00.000 --> 00:01:01.000\nBye\n'),
    [{ start: 1.5, end: 3, text: 'Hi\nthere' }, { start: 60, end: 61, text: 'Bye' }]);
});

test('episodeQueue: the first episodes of each show\'s first season, every show\'s first episode first', () => {
  const ep = (show, season, episode) => ({ key: `${show}${season}${episode}`, kind: 'episode', titleKey: `tv:${show}`, season, episode });
  const items = [ep(1, 2, 1), ep(1, 1, 3), ep(1, 1, 1), ep(1, 1, 2), ep(1, 1, 4), ep(2, 0, 1), ep(2, 3, 2), ep(2, 3, 1), { key: 'f', kind: 'film' }];
  assert.deepEqual(episodeQueue(items, 3).map((i) => i.key), ['111', '231', '112', '232', '113']);
});

test('planClip always encodes, frame-exact, and tone-maps HDR', () => {
  const args = planClip({ input: 'in.mkv', output: 'out.mp4', video: { index: 0, codec_name: 'hevc', pix_fmt: 'yuv420p10le', height: 2160, color_transfer: 'smpte2084', color_primaries: 'bt2020' },
    audio: { index: 1 }, start: 10.04, end: 50.8, encoder: 'nvenc' });
  assert.ok(args.includes('h264_nvenc'));
  assert.equal(args[args.indexOf('-ss') + 1], '10.040');
  assert.equal(args[args.indexOf('-t') + 1], '40.760');
  assert.ok(args.includes('bt709'));
  assert.ok(!args.includes('copy'));
});

test('pickSubtitleTrack: English text, SDH first, never forced or pictures', () => {
  const s = (index, codec_name, language, extra = {}) => ({ index, codec_name, tags: { language, title: extra.title }, disposition: { forced: extra.forced ? 1 : 0, hearing_impaired: extra.hi ? 1 : 0 } });
  assert.equal(pickSubtitleTrack([s(2, 'hdmv_pgs_subtitle', 'eng'), s(3, 'subrip', 'eng', { forced: true }), s(4, 'subrip', 'eng'), s(5, 'subrip', 'eng', { title: 'English SDH' })]).index, 5);
  assert.equal(pickSubtitleTrack([s(2, 'subrip', 'fre'), s(3, 'ass', 'und')]).index, 3);
  assert.equal(pickSubtitleTrack([s(2, 'hdmv_pgs_subtitle', 'eng')]), null);
});
