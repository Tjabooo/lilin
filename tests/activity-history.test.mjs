import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initActivity, report } from '../src/activity.js';

// Someone quiet watched something days ago while others filled the log since: it must still be findable.
test('a quiet person’s older activity is still there after a busy few days and a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-activity-'));
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  const lines = [
    { at: now - 400 * day, user: 'ancient@example.test', action: 'play', detail: 'Too old' },
    { at: now - 3 * day, user: 'jack@example.test', action: 'joined', detail: 'Joined Lilin' },
    { at: now - 3 * day + 1, user: 'jack@example.test', action: 'play', detail: 'Hannibal S01 E01' },
  ];
  for (let i = 0; i < 3000; i++) lines.push({ at: now - 2 * day + i * 1000, user: 'busy@example.test', action: 'play', detail: `Show E${i}` });
  fs.writeFileSync(path.join(dir, '.lilin-activity.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  initActivity({ dataDir: dir });

  const front = report();
  assert.equal(front.events.length, 300);
  assert.equal(front.more, true, 'the newest page says there is more');
  assert.ok(!front.events.some((e) => e.user === 'jack@example.test'));

  const jack = report({ user: 'jack@example.test' });
  assert.deepEqual(jack.events.map((e) => e.detail), ['Hannibal S01 E01', 'Joined Lilin']);
  assert.equal(jack.more, false);
  assert.deepEqual(report({ q: 'hannibal' }).events.map((e) => e.user), ['jack@example.test']);
  assert.equal(report({ user: 'ancient@example.test' }).events.length, 0, 'older than a year is dropped');
  assert.equal(report({ limit: 600 }).events.length, 600);
  assert.equal(report({ limit: 10, since: now - 2 * day + 2995 * 1000 }).events.length, 10);
  assert.equal(report({ limit: 1, since: now - 2 * day + 2990 * 1000 }).events.length, 10, 'since pulls in everything after it');
});
