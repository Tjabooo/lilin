import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Restrict (People): restricted people keep Watch Together but see nobody else's likes, nobody sees theirs,
// and only the owner can switch it (never for the owner).
test('the owner restricts people; restricted likes and sight stay out of social spots', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-restrict-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@r.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@r.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  try {
    const owner = (await request('/api/me')).me;
    const mum = (await request('/api/me', undefined, 'mum@r.test')).me;
    await request('/api/me', undefined, 'pal@r.test');
    assert.equal(mum.restricted, false);
    assert.equal(owner.restricted, false);

    await request(`/api/admin/users/${owner.id}`, { restricted: true }, undefined, 400);
    await request(`/api/admin/users/${mum.id}`, { restricted: true }, 'pal@r.test', 403);
    await request(`/api/admin/users/${mum.id}`, { restricted: true });
    assert.equal((await request('/api/me', undefined, 'mum@r.test')).me.restricted, true);
    assert.equal((await request('/api/admin/users')).users.find((u) => u.id === mum.id).restricted, true);

    // Everyone likes the same film.
    for (const who of ['owner@r.test', 'mum@r.test', 'pal@r.test']) await request('/api/social/rate', { key: 'movie:603', value: 1 }, who);
    const seenByPal = await request('/api/social/title?key=movie:603', undefined, 'pal@r.test');
    assert.deepEqual(seenByPal.likedBy, [owner.name], 'the restricted person’s like is not shown by name');
    assert.equal(seenByPal.likes, 3, 'but still counts');
    const seenByMum = await request('/api/social/title?key=movie:603', undefined, 'mum@r.test');
    assert.deepEqual(seenByMum.likedBy, [], 'restricted people see nobody else');
    assert.deepEqual(seenByMum.people, []);
    assert.equal(seenByMum.mine, 1, 'their own thumb still works');

    await request(`/api/admin/users/${mum.id}`, { restricted: false });
    assert.equal((await request('/api/social/title?key=movie:603', undefined, 'pal@r.test')).likedBy.length, 2);
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true });
  }
});
