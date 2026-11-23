import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initSubsync, ensureSync } from '../src/subsync.js';

test('a check that failed against a video that is gone runs again on the file that replaced it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-subsync-'));
  const srt = path.join(dir, 'Show.S01E01.en.srt');
  const video = path.join(dir, 'Show.S01E01.mp4');
  fs.writeFileSync(srt, '1\n00:00:01,000 --> 00:00:02,000\nHi\n');
  fs.writeFileSync(video, '');
  const s = fs.statSync(srt);
  const key = process.platform === 'win32' ? path.resolve(srt).toLowerCase() : path.resolve(srt);
  fs.writeFileSync(path.join(dir, '.lilin-subsync.json'), JSON.stringify({
    [key]: { path: srt, video: path.join(dir, 'Show.S01E01.mkv'), state: 'failed', version: 3, error: 'ffmpeg exited with null', stamp: `${s.size}:${Math.floor(s.mtimeMs)}` },
  }));
  initSubsync({ dataDir: dir });
  assert.ok(['queued', 'syncing'].includes(ensureSync(srt, video).state));
});
