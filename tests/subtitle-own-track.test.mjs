// The video's own subtitle track beats downloads, also while a Play now video is still arriving,
// and a downloaded file that can't be lined up is swapped for another upload that can.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as subsync from '../src/subsync.js';

const hasFfmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).status === 0;
const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
// Irregular lines over `length` seconds, so the timing can only match one way.
function srt(length, shift = 0, { from = 0, word = 'Line' } = {}) {
  const out = [];
  let t = 2;
  let n = 0;
  while (t < length - 4) {
    const dur = 1 + ((n * 7) % 5) * 0.4;
    if (t >= from) out.push(`${out.length + 1}\n${stamp(t + shift)} --> ${stamp(t + shift + dur)}\n${word} ${n}\n`);
    t += dur + 0.6 + ((n * 13) % 7) * 0.35;
    n++;
  }
  return out.join('\n');
}
// Scenes in another order: what a broadcast cut of the same episode looks like next to the release.
function otherCut(text) {
  const blocks = text.trim().split(/\n\n+/);
  const half = Math.floor(blocks.length / 2);
  const parse = (b) => b.split('\n');
  const first = blocks.slice(0, half).map(parse);
  const second = blocks.slice(half).map(parse);
  const shiftBlock = (b, d) => b.map((line, i) => (i === 1 ? line.replace(/(\d\d):(\d\d):(\d\d),(\d\d\d)/g, (_, h, m, s2, ms) => stamp(Number(h) * 3600 + Number(m) * 60 + Number(s2) + Number(ms) / 1000 + d)) : line));
  const len = 300;
  return [...second.map((b) => shiftBlock(b, -len / 2)), ...first.map((b) => shiftBlock(b, len / 2))].map((b) => b.join('\n')).join('\n\n');
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-own-'));
  subsync.initSubsync({ dataDir: dir, cacheDir: path.join(dir, 'cache') });
  return dir;
}
function makeVideo(dir, name, subs) {
  const src = path.join(dir, 'track.srt');
  fs.writeFileSync(src, subs);
  const out = path.join(dir, name);
  const r = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x36:r=5:d=300',
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-i', src, '-t', '300', '-map', '0:v', '-map', '1:a', '-map', '2:s',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-c:s', 'srt', '-metadata:s:s:0', 'language=eng', '-y', out]);
  assert.equal(r.status, 0, String(r.stderr));
  return out;
}

test('the video’s own track is used and replaces a downloaded file', { skip: !hasFfmpeg }, async () => {
  const dir = setup();
  const video = makeVideo(dir, 'Show.S01E01.mkv', srt(300));
  assert.deepEqual([...await subsync.embeddedLanguages(video)], ['en']);
  const side = path.join(dir, 'Show.S01E01.en.srt');
  fs.writeFileSync(side, otherCut(srt(300)));
  subsync.queueSync(side, path.join(dir, 'missing.mkv')); // downloaded while the video wasn't there yet
  assert.equal(subsync.stateOf(side).state, 'waiting');
  assert.equal(subsync.replaceable(side), true);
  assert.equal(await subsync.useOwnTrack(video, side, 'en'), side);
  assert.match(fs.readFileSync(side, 'utf8'), /00:00:02,000 --> /);
  assert.equal(subsync.stateOf(side).state, 'trusted');
  assert.equal(subsync.replaceable(side), false, 'an extracted track is final');
  assert.equal(await subsync.useOwnTrack(video, path.join(dir, 'Show.S01E01.sv.srt'), 'sv'), null, 'no Swedish track');
});

test('a track read from a downloading file is read again once the download is complete', { skip: !hasFfmpeg }, async () => {
  const dir = setup();
  const partial = makeVideo(dir, 'partial.mkv', srt(300).split('\n\n').slice(0, 20).join('\n\n'));
  const final = path.join(dir, 'Film.mkv');
  const side = path.join(dir, 'Film.en.srt');
  assert.equal(await subsync.useOwnTrack(partial, side, 'en', { growing: true }), side);
  const state = subsync.stateOf(side);
  assert.equal(state.growing, true);
  assert.equal(subsync.replaceable(side), true, 'a conversion may still replace a partial read');
  assert.equal(await subsync.refreshOwnTrack(side, partial, true), false, 'not again within two minutes');
  makeVideo(dir, 'Film.mkv', srt(300));
  assert.equal(await subsync.refreshOwnTrack(side, final, false), true);
  assert.equal(subsync.stateOf(side).growing, false);
  assert.ok(subsync.parseCues(fs.readFileSync(side, 'utf8')).length > 20);
});

test('a download made for another cut is swapped for an upload that fits', { skip: !hasFfmpeg }, async () => {
  const dir = setup();
  // The release has a Swedish track only, so the English download is checked against that.
  const words = srt(300, 0, { word: 'Rad' });
  const video = makeVideo(dir, 'Movie.mkv', words);
  spawnSync('ffmpeg', ['-v', 'error', '-i', video, '-map', '0', '-c', 'copy', '-metadata:s:s:0', 'language=swe', '-y', path.join(dir, 'Movie2.mkv')]);
  const movie = path.join(dir, 'Movie2.mkv');
  const side = path.join(dir, 'Movie2.en.srt');
  fs.writeFileSync(side, otherCut(srt(300)));
  let asked = 0;
  subsync.setOtherUploads(async () => { asked++; return [{ text: srt(300, 3.5), label: 'Movie.BluRay' }]; });
  subsync.queueSync(side, movie);
  for (let i = 0; i < 200 && ['queued', 'syncing'].includes(subsync.stateOf(side).state); i++) await new Promise((r) => setTimeout(r, 100));
  const s = subsync.stateOf(side);
  assert.equal(asked, 1);
  assert.equal(s.state, 'synced');
  assert.equal(s.replaced, true);
  assert.equal(s.canUndo, true);
  assert.match(fs.readFileSync(side, 'utf8'), /00:00:02,000 --> /, 'the other upload, moved 3.5 s earlier');
  subsync.setOtherUploads(null);
});
