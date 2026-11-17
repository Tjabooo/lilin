import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The owner can let someone see the Activity tab (read-only): the log yes, the access list and owner tabs no.
test('people the owner allows can see activity, and only activity', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-activity-access-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@act.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1',
    CF_API_TOKEN: 'x', CF_ACCOUNT_ID: 'x', CF_ACCESS_LIST_ID: 'x', CF_API_BASE: 'http://127.0.0.1:9' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@act.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  try {
    const member = (await request('/api/me', undefined, 'member@act.test')).me;
    assert.equal(member.canSeeActivity, false, 'off until the owner allows it');
    await request('/api/activity', undefined, 'member@act.test', 403);
    const owner = (await request('/api/me')).me;
    assert.equal(owner.canSeeActivity, true);
    await request(`/api/admin/users/${owner.id}`, { canSeeActivity: false }, undefined, 400);
    await request(`/api/admin/users/${member.id}`, { canSeeActivity: true }, 'member@act.test', 403);

    await request(`/api/admin/users/${member.id}`, { canSeeActivity: true });
    assert.equal((await request('/api/me', undefined, 'member@act.test')).me.canSeeActivity, true);
    const feed = await request('/api/activity', undefined, 'member@act.test');
    assert.ok(feed.events.some((e) => e.action === 'permission' && /can see activity/.test(e.detail)), 'the switch itself is logged');
    const status = await request('/api/status', undefined, 'member@act.test');
    assert.equal(status.admin, false, 'still not an owner');
    await request('/api/access', undefined, 'member@act.test', 403);
    await request('/api/house', undefined, 'member@act.test', 403);

    await request(`/api/admin/users/${member.id}`, { canSeeActivity: false });
    await request('/api/activity', undefined, 'member@act.test', 403);
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
