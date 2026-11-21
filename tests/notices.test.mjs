import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as notices from '../src/notices.js';

test('owner popups: once per person, never for restricted people or the owner, kept on disk', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-notices-'));
  notices.initNotices({ dataDir });
  assert.throws(() => notices.add({ title: { en: 'Hi' }, text: { en: '  ', sv: '' } }), /Write the message/);
  const a = notices.add({ title: { en: 'Heads up' }, text: { sv: 'Servern startar om ikväll' } });
  const b = notices.add({ text: { en: 'Second' } });
  const anna = { id: 7 }, owner = { id: 1, isOwner: true };
  assert.deepEqual(notices.pendingFor(anna).map((n) => n.id), [a.id, b.id]); // oldest first
  assert.equal(notices.pendingFor(anna)[0].title.sv, '');
  assert.deepEqual(notices.pendingFor(anna, { restricted: true }), []);
  assert.deepEqual(notices.pendingFor(owner), []);
  notices.seen(anna, a.id);
  assert.deepEqual(notices.pendingFor(anna).map((n) => n.id), [b.id]);
  notices.stop(b.id);
  assert.deepEqual(notices.pendingFor(anna), []);
  assert.deepEqual(notices.pendingFor({ id: 8 }).map((n) => n.id), [a.id]);
  notices.initNotices({ dataDir }); // reload from disk
  assert.equal(notices.all().find((n) => n.id === a.id).seen, 1);
  notices.remove(a.id);
  assert.equal(notices.all().length, 1);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
