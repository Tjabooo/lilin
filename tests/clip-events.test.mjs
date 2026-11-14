import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const clipsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-clip-events-'));
process.env.CLIPS_DIR = clipsDir;
const clips = await import('../src/clips.js');

test('game events are checked before the editor draws them', () => {
  const events = clips.cleanEvents({ events: [
    { t: 5, type: 'death', label: 'Death' },
    { t: 1.23456, type: 'kill', label: 'Headshot', hs: true, map: 'de_dust2' },
    { t: 3, type: '<img onerror=x>', label: 'Odd\u0007 one' },
    { t: -1, type: 'kill', label: 'before' },
    { t: 99, type: 'kill', label: 'after' },
    { t: 'x', type: 'kill' },
    null,
  ] }, 10);
  assert.deepEqual(events, [
    { t: 1.235, type: 'kill', label: 'Headshot', hs: true },
    { t: 3, type: 'other', label: 'Odd  one' },
    { t: 5, type: 'death', label: 'Death' },
  ]);
  assert.deepEqual(clips.cleanEvents('nope'), []);
  assert.deepEqual(clips.cleanEvents({ events: [{ t: 1, type: 'kill', label: 'x'.repeat(100) }] })[0].label.length, 40);
});

test('an edit keeps the events inside its parts, on its own timeline', () => {
  const events = [{ t: 1, type: 'kill', label: 'Kill' }, { t: 4, type: 'death', label: 'Death' }, { t: 8, type: 'round_end', label: 'Round lost' }];
  // parts 0.5..3 and 6..9 → output 0..2.5 and 2.5..5.5
  assert.deepEqual(clips.shiftEvents(events, [{ from: 0.5, end: 3 }, { from: 6, end: 9 }]).map((e) => [e.label, e.t]), [['Kill', 0.5], ['Round lost', 4.5]]);
});

const ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe';
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0 && spawnSync(ffprobe, ['-version']).status === 0;
test('the editor gets the events, edits carry them and delete moves them along', { skip: !hasFfmpeg && 'ffmpeg not installed', timeout: 60000 }, async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-clip-events-data-'));
  try {
    clips.initClips({ dataDir: data });
    await fs.mkdir(path.join(clipsDir, 'CS2'), { recursive: true });
    const src = path.join(clipsDir, 'CS2', 'Replay.mp4');
    const made = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=10',
      '-c:v', 'libx264', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', src]);
    assert.equal(made.status, 0, String(made.stderr));
    await fs.writeFile(path.join(clipsDir, 'CS2', 'Replay.events.json'), JSON.stringify({ version: 1, source: 'cs2', events: [
      { t: 2.5, type: 'kill', label: 'Kill', hs: false }, { t: 7.25, type: 'bomb_planted', label: 'Bomb planted' }] }));
    const listed = (await clips.listClips()).clips;
    assert.equal(listed.length, 1, 'the sidecar is not a clip');
    const info = await clips.trimInfo(listed[0].id);
    assert.deepEqual(info.events.map((e) => [e.t, e.type]), [[2.5, 'kill'], [7.25, 'bomb_planted']]);
    const r = await clips.trim(listed[0].id, [{ start: 6, end: 9 }]);
    const sidecar = JSON.parse(await fs.readFile(path.join(clipsDir, 'Trimmed Clips', 'CS2', `${r.title}.events.json`), 'utf8'));
    assert.deepEqual(sidecar.events.map((e) => [e.t, e.label]), [[1.25, 'Bomb planted']]);
    await clips.deleteClip(listed[0].id);
    const trash = await fs.readdir(path.join(clipsDir, '.deleted'));
    assert.ok(trash.some((n) => n.endsWith('Replay.events.json')), trash.join());
    await assert.rejects(fs.stat(path.join(clipsDir, 'CS2', 'Replay.events.json')));
  } finally {
    await fs.rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(clipsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
