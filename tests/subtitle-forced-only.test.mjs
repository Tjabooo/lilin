import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { findSidecar } = await import('../src/subtitles.js');

const srt = (n) => Array.from({ length: n }, (_, i) => `${i + 1}\n00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String(i % 60).padStart(2, '0')},900\nline ${i}\n`).join('\n');

function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-forced-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test('a forced-only en.srt gives way to the full en.2.srt', () => {
  const dir = folder({ 'Show.S03E01.mp4': '', 'Show.S03E01.en.srt': srt(7), 'Show.S03E01.en.2.srt': srt(572), 'Show.S03E01.en.sdh.srt': srt(692) });
  const video = path.join(dir, 'Show.S03E01.mp4');
  const hit = findSidecar(video, 'en');
  assert.equal(path.basename(hit), 'Show.S03E01.en.srt');
  assert.equal((fs.readFileSync(hit, 'utf8').match(/-->/g) || []).length, 572, 'non-SDH full track wins over SDH');
  assert.equal((fs.readFileSync(path.join(dir, 'Show.S03E01.en.forced.srt'), 'utf8').match(/-->/g) || []).length, 7, 'forced track kept');
  assert.ok(!fs.existsSync(path.join(dir, 'Show.S03E01.en.2.srt')));
});

test('only an SDH sibling: it takes the plain name', () => {
  const dir = folder({ 'Film.mp4': '', 'Film.en.srt': srt(1), 'Film.en.sdh.srt': srt(555) });
  const hit = findSidecar(path.join(dir, 'Film.mp4'), 'en');
  assert.equal((fs.readFileSync(hit, 'utf8').match(/-->/g) || []).length, 555);
});

test('a full en.srt is left alone', () => {
  const dir = folder({ 'Ep.mp4': '', 'Ep.en.srt': srt(565), 'Ep.en.sdh.srt': srt(670) });
  const hit = findSidecar(path.join(dir, 'Ep.mp4'), 'en');
  assert.equal((fs.readFileSync(hit, 'utf8').match(/-->/g) || []).length, 565);
  assert.ok(!fs.existsSync(path.join(dir, 'Ep.en.forced.srt')));
});
