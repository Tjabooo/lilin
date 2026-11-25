import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from './kill-tree.mjs';

// Members without "Can invite people" ask the owners for an invite link; a yes makes one in their name.
// Dummy Cloudflare settings: making links never calls Cloudflare.
test('members ask to invite a friend, owners say yes or no, a yes gives them the link', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-invite-requests-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@inv.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1',
    CF_API_TOKEN: 'x', CF_ACCOUNT_ID: 'x', CF_ACCESS_LIST_ID: 'x', CF_API_BASE: 'http://127.0.0.1:9' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@inv.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  try {
    const member = (await request('/api/me', undefined, 'member@inv.test')).me;
    await request('/api/me', undefined, 'other@inv.test');
    assert.equal(member.canInvite, false);
    await request('/api/invites', { note: 'x' }, 'member@inv.test', 403); // no links of their own

    await request('/api/invite-requests', { name: '  ' }, 'member@inv.test', 400);
    const a = (await request('/api/invite-requests', { name: 'Anna', why: 'my cousin' }, 'member@inv.test')).request;
    await request('/api/invite-requests', { name: 'anna' }, 'member@inv.test', 400); // already asked
    const b = (await request('/api/invite-requests', { name: 'Bo' }, 'member@inv.test')).request;
    const c = (await request('/api/invite-requests', { name: 'Cleo' }, 'member@inv.test')).request;
    await request('/api/invite-requests', { name: 'Dan' }, 'member@inv.test', 400); // 3 waiting at most
    await request('/api/invite-requests', { name: 'Owner friend' }, undefined, 400); // the owner makes links

    // Owners see them; members can't answer.
    const waiting = (await request('/api/access')).requests;
    assert.deepEqual(waiting.map((r) => r.name), ['Anna', 'Bo', 'Cleo']);
    assert.equal(waiting[0].why, 'my cousin'); assert.equal(waiting[0].userName, member.name);
    assert.equal(waiting[0].token, null);
    await request(`/api/access/requests/${a.id}/accept`, {}, 'member@inv.test', 403);
    await request(`/api/invite-requests/${a.id}/cancel`, {}, 'other@inv.test', 404);

    // Yes: a link in the member's name, which only they get back.
    await request(`/api/access/requests/${a.id}/accept`, {});
    await request(`/api/access/requests/${a.id}/decline`, {}, undefined, 400);
    await request(`/api/access/requests/${b.id}/decline`, {});
    await request(`/api/invite-requests/${c.id}/cancel`, {}, 'member@inv.test');
    const mine = (await request('/api/invite-requests', undefined, 'member@inv.test')).requests;
    const yes = mine.find((r) => r.id === a.id);
    assert.equal(yes.state, 'accepted'); assert.equal(yes.invite.state, 'open');
    assert.match(yes.invite.url, /\/c\/i\/[A-Za-z0-9_-]{16}$/);
    assert.equal(yes.token, undefined);
    assert.equal(mine.find((r) => r.id === b.id).state, 'declined');
    assert.ok(!mine.some((r) => r.id === c.id));
    assert.equal((await request('/api/invite-requests', undefined, 'other@inv.test')).requests.length, 0);
    const access = await request('/api/access');
    assert.equal(access.requests.length, 0);
    assert.equal(access.invites.find((i) => i.id === yes.inviteId)?.byName, member.name);
    assert.equal(access.invites.find((i) => i.id === yes.inviteId)?.note, 'Anna');
  } finally {
    killTree(child);
    await exited;
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
