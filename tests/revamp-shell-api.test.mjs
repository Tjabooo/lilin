import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as accounts from '../src/accounts.js';
import { WatchRooms } from '../src/watch.js';
import { killTree } from './kill-tree.mjs';

// Every face can open a profile: room faces carry the account id for signed-in views, never on the public share page.
test('room faces carry account ids, except on the public share page', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-face-ids-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  const req = (email) => ({ headers: { 'cf-access-authenticated-user-email': email } });
  const anna = accounts.userFor(req('anna@example.test')), ben = accounts.userFor(req('ben@example.test'));
  const rooms = new WatchRooms({ avatarOf: () => null });
  const created = rooms.create(anna, { kind: 'lib', id: 'movie', mediaKey: 'movie' }, 'anna-client-12345678', 0);
  rooms.join(created.token, ben, 'ben-client-123456789');
  assert.deepEqual(rooms.preview(created.token).faces.map((f) => f.id), [anna.id, ben.id]);
  assert.deepEqual(rooms.preview(created.token, { ids: false }).faces.map((f) => Object.keys(f).sort()), [['avatar', 'name'], ['avatar', 'name']]);
  const planned = rooms.plan(anna, { kind: 'lib', id: 'movie', mediaKey: 'movie', title: 'Movie' }, Date.now() + 3600000);
  assert.ok(rooms.parties(anna).find((p) => p.token === planned.token).faces.every((f) => typeof f.id === 'number' || f.id === undefined));
  assert.match(fs.readFileSync(new URL('../src/watch-page.js', import.meta.url), 'utf8'), /rooms\.preview\(token, \{ ids: false \}\)/);
  assert.match(fs.readFileSync(new URL('../src/live-tv.js', import.meta.url), 'utf8'), /\(\{ id: m\.userId, name: m\.name, avatar: m\.avatar \|\| null \}\)/);
});

// The home network's shared account sees its own history and ratings (the You tab); nobody else can open it, and it
// still can't publish a page. Live and You are start views.
test('the shared home account opens its own profile and diary; start views include Live and You', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fsp.mkdtemp(path.join(os.tmpdir(), 'lilin-shell-'));
  for (const name of await fsp.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fsp.copyFile(path.join(root, name), path.join(app, name));
  await fsp.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fsp.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@p.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  // email null = no identity header: the loopback address counts as the home network (HOME_NETWORK_ACCESS=shared)
  const request = async (route, body, email = 'owner@p.test', status = 200) => {
    const headers = { 'content-type': 'application/json', ...(email && { 'cf-access-authenticated-user-email': email }) };
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`); return data;
  };
  try {
    const home = (await request('/api/me', undefined, null)).me;
    assert.equal(home.email, null, 'the shared home account');
    await request('/api/me', { name: 'Ebi' }, 'ebi@p.test');

    const mine = await request('/api/profiles/me', undefined, null);
    assert.equal(mine.me, true);
    assert.equal(mine.person.id, home.id);
    await request(`/api/profiles/${home.id}/diary`, undefined, null);
    await request(`/api/profiles/${home.id}/reviews`, undefined, null);
    await request(`/api/profiles/${home.id}`, undefined, 'ebi@p.test', 404);
    await request(`/api/profiles/${home.id}/diary`, undefined, 'ebi@p.test', 404);
    await request(`/api/profiles/@${mine.person.handle}`, undefined, 'ebi@p.test', 404);
    await request('/api/profiles/me', { bio: 'hello' }, null, 403);

    for (const view of ['live', 'you', 'library', 'downloads', 'discover']) {
      assert.equal((await request('/api/me', { startView: view }, 'ebi@p.test')).me.settings.startView, view);
    }
    assert.equal((await request('/api/me', { startView: 'house' }, 'ebi@p.test')).me.settings.startView, 'discover', 'unknown start views are ignored');
  } finally {
    killTree(child);
    await exited;
    await fsp.rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); // Windows keeps the dead server's files locked briefly
  }
});
