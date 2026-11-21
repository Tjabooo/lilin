import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as dubGraft from '../src/dub-graft.js';

const ffmpeg = (args) => spawnSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', ...args]);
const haveFfmpeg = !ffmpeg(['-version']).error;
const probe = (file) => JSON.parse(spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', file]).stdout);

// "Japanese": pink noise that swells and fades at an uneven rhythm, so there is one right shift.
const pattern = 'anoisesrc=d=200:c=pink:r=48000:s=7,volume=\'0.2+0.8*abs(sin(t*1.3)*sin(t*0.37+1))\':eval=frame';

test('the English dub of a dual-audio copy is added to the subtitled copy, shifted to line up', { skip: !haveFfmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-dub-'));
  dubGraft.init({ dataDir: dir });
  const source = path.join(dir, 'Show - 01 [Dual Audio].mkv'), target = path.join(dir, 'Show - 01.mp4');
  // Source: English (a tone) and Japanese; the target is the same Japanese, starting 2.5 s later.
  assert.equal(ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=200', '-f', 'lavfi', '-i', pattern, '-map', '0', '-map', '1', '-c:a', 'flac',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=jpn', source]).status, 0);
  assert.equal(ffmpeg(['-ss', '2.5', '-i', source, '-map', '0:a:1', '-c:a', 'aac', '-metadata:s:a:0', 'language=jpn', target]).status, 0);
  return dubGraft.graft(target, source).then((r) => {
    assert.equal(r.ok, true, r.error);
    assert.ok(Math.abs(r.shift - 2.5) < 0.06, `shift ${r.shift}`);
    const audio = probe(target).streams.filter((s) => s.codec_type === 'audio');
    assert.deepEqual(audio.map((s) => s.tags?.language), ['jpn', 'eng']);
    assert.ok(dubGraft.hasGraft(target));
    // Already has English now: never again.
    return dubGraft.graft(target, source);
  }).then((again) => {
    assert.match(again.error, /already has English/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('an episode that is not the same one is refused', { skip: !haveFfmpeg && 'no ffmpeg' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-dub-'));
  dubGraft.init({ dataDir: dir });
  const source = path.join(dir, 'Show - 02 [Dual Audio].mkv'), target = path.join(dir, 'Show - 01.mp4');
  assert.equal(ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=200', '-f', 'lavfi', '-i', pattern.replace('s=7', 's=99').replace('1.3', '0.71'), '-map', '0', '-map', '1', '-c:a', 'flac',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=jpn', source]).status, 0);
  assert.equal(ffmpeg(['-f', 'lavfi', '-i', pattern, '-c:a', 'aac', '-metadata:s:a:0', 'language=jpn', target]).status, 0);
  const r = await dubGraft.graft(target, source);
  assert.match(r.error || '', /didn't match/);
  assert.ok(dubGraft.pairFailed(target, source));
  assert.equal(probe(target).streams.filter((s) => s.codec_type === 'audio').length, 1, 'left as it was');
  fs.rmSync(dir, { recursive: true, force: true });
});
