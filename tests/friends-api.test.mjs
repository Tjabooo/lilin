import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Friends (friends.js): search by name, requests need a yes, removing works both ways, and
// restricted people can neither be found nor have friends.
test('friend requests, search and restricted people', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-friends-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@f.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@f.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  try {
    await request('/api/me');
    const alva = (await request('/api/me', { name: 'Alva' }, 'alva@f.test')).me;
    const bo = (await request('/api/me', { name: 'Bo' }, 'bo@f.test')).me;
    const mum = (await request('/api/me', { name: 'Mamma' }, 'mum@f.test')).me;
    await request(`/api/admin/users/${mum.id}`, { restricted: true });

    // Search: by part of the name, never yourself, never restricted people, needs two letters.
    assert.deepEqual((await request('/api/friends/search?q=b', undefined, 'alva@f.test')).people, []);
    assert.deepEqual((await request('/api/friends/search?q=bo', undefined, 'alva@f.test')).people.map((p) => [p.name, p.state]), [['Bo', null]]);
    assert.deepEqual((await request('/api/friends/search?q=mam', undefined, 'alva@f.test')).people, []);
    assert.deepEqual((await request('/api/friends/search?q=alv', undefined, 'alva@f.test')).people, []);

    // A request waits for a yes.
    const sent = await request('/api/friends/request', { id: bo.id }, 'alva@f.test');
    assert.equal(sent.state, 'sent');
    assert.deepEqual(sent.outgoing.map((p) => p.name), ['Bo']);
    assert.deepEqual(sent.friends, []);
    assert.equal((await request('/api/friends/request', { id: bo.id }, 'alva@f.test')).state, 'sent', 'asking twice changes nothing');
    const bosView = await request('/api/friends', undefined, 'bo@f.test');
    assert.deepEqual(bosView.incoming.map((p) => p.name), ['Alva']);
    assert.equal((await request('/api/friends/search?q=alva', undefined, 'bo@f.test')).people[0].state, 'received');
    await request('/api/friends/accept', { id: alva.id }, 'alva@f.test', 404); // you can't accept your own
    const accepted = await request('/api/friends/accept', { id: alva.id }, 'bo@f.test');
    assert.equal(accepted.state, 'friend');
    assert.deepEqual(accepted.friends.map((p) => p.name), ['Alva']);
    assert.deepEqual((await request('/api/friends', undefined, 'alva@f.test')).friends.map((p) => p.name), ['Bo']);

    // Restricted people can't ask, be asked or see friends.
    await request('/api/friends/request', { id: mum.id }, 'alva@f.test', 404);
    await request('/api/friends/request', { id: alva.id }, 'mum@f.test', 403);
    assert.deepEqual((await request('/api/friends/search?q=alva', undefined, 'mum@f.test')).people, []);
    assert.equal((await request('/api/friends', undefined, 'mum@f.test')).restricted, true);

    // Restricting a friend hides the friendship (kept for if it's lifted); a request to someone who asked you accepts it.
    await request(`/api/admin/users/${bo.id}`, { restricted: true });
    assert.deepEqual((await request('/api/friends', undefined, 'alva@f.test')).friends, []);
    await request(`/api/admin/users/${bo.id}`, { restricted: false });
    assert.deepEqual((await request('/api/friends', undefined, 'alva@f.test')).friends.map((p) => p.name), ['Bo']);
    await request('/api/friends/remove', { id: alva.id }, 'bo@f.test');
    assert.deepEqual((await request('/api/friends', undefined, 'alva@f.test')).friends, []);
    await request('/api/friends/remove', { id: alva.id }, 'bo@f.test', 404);
    await request('/api/friends/request', { id: alva.id }, 'bo@f.test');
    assert.equal((await request('/api/friends/request', { id: bo.id }, 'alva@f.test')).state, 'friend');
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true });
  }
});

test('areFriends and friendIds', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-friends-unit-'));
  const accounts = await import('../src/accounts.js');
  const friends = await import('../src/friends.js');
  accounts.initAccounts({ dataDir: dir, adminEmails: ['own@u.test'], mediaDir: dir });
  friends.initFriends();
  const user = (email, name) => { const req = { headers: { 'cf-access-authenticated-user-email': email }, auth: { via: 'proxy', email } }; return accounts.updateMe(accounts.userFor(req), { name }); };
  const a = user('a@u.test', 'A'), b = user('b@u.test', 'B'), c = user('c@u.test', 'C');
  friends.request(a, b.id);
  assert.equal(friends.areFriends(a.id, b.id), false);
  friends.accept(b, a.id);
  assert.equal(friends.areFriends(a.id, b.id), true);
  assert.equal(friends.areFriends(b.id, a.id), true);
  assert.deepEqual(friends.friendIds(a.id), [b.id]);
  assert.deepEqual(friends.friendIds(c.id), []);
  accounts.updateUser(b.id, { restricted: true });
  assert.equal(friends.areFriends(a.id, b.id), false);
  assert.deepEqual(friends.friendIds(a.id), []);
  assert.deepEqual(friends.friendIds(b.id), []);
  // the accounts database stays open, so Windows may refuse to delete it: leave the temp dir then
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});
