import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as invites from '../src/invites.js';

// A password link leaves the owner's list once its person has a password (set through any link or the
// popup), and a new link for the same person replaces the old one.
test('password links close once the person has a password', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-password-links-'));
  const withPassword = new Set();
  invites.initInvites({ dataDir: dir, passwordFor: (email) => withPassword.has(email) });
  const req = { headers: { host: 'lilin.test' } };
  const open = () => invites.listInvites().filter((i) => i.state === 'open').map((i) => i.id);

  const first = invites.createInvite(req, 'Password for Ali', 'ali@pw.test');
  const second = invites.createInvite(req, 'Password for Ali', 'ali@pw.test');
  const other = invites.createInvite(req, 'Password for Eddie', 'eddie@pw.test');
  const plain = invites.createInvite(req, 'Laura');
  assert.deepEqual(open().sort(), [second.id, other.id, plain.id].sort(), 'the double-tapped first link is replaced');
  assert.ok(!open().includes(first.id));

  withPassword.add('ali@pw.test');
  assert.deepEqual(open().sort(), [other.id, plain.id].sort(), 'Ali has a password now: their link is done');
  assert.equal(invites.listInvites().find((i) => i.id === second.id).state, 'done');
  await fs.rm(dir, { recursive: true, force: true });
});
