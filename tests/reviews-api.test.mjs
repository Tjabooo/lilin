import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from './kill-tree.mjs';

// Reviews over HTTP: write, read, the thumb that follows the stars, owner removal and restricted people.
test('reviews API: write, read, remove, and restricted people neither write nor see', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-reviews-api-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@reviews.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@reviews.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  const get = (email, all = false) => request(`/api/reviews?key=movie:603${all ? '&all=1' : ''}`, undefined, email);
  try {
    await request('/api/me');
    const a = await request('/api/me', undefined, 'a@reviews.test');
    const b = await request('/api/me', undefined, 'b@reviews.test');
    const idOf = (x) => x.me?.id ?? x.id;

    const saved = await request('/api/reviews', { key: 'movie:603', title: 'The Matrix', stars: 5, text: '<img src=x onerror=alert(1)> great', spoiler: false }, 'a@reviews.test');
    assert.equal(saved.mine.stars, 5);
    assert.equal(saved.rating.mine, 1, 'five stars is a thumbs up');
    assert.equal(saved.reviews[0].text, '<img src=x onerror=alert(1)> great', 'stored as plain text; the app never renders it as HTML');
    await request('/api/reviews', { key: 'movie:603', stars: 2 }, 'b@reviews.test');
    await request('/api/reviews', { key: 'movie:603', stars: 9 }, 'b@reviews.test', 400);
    await request('/api/reviews', { key: 'nope', stars: 3 }, 'b@reviews.test', 400);
    await request('/api/reviews', { key: 'movie:603', text: 'x'.repeat(2001) }, 'b@reviews.test', 400);

    const forOwner = await get('owner@reviews.test');
    assert.equal(forOwner.average, 3.5);
    assert.equal(forOwner.ratings, 2);
    assert.equal(forOwner.count, 1);
    assert.equal(forOwner.reviews[0].canRemove, true, 'the owner can remove anyone’s');
    assert.equal((await get('b@reviews.test')).reviews[0].canRemove, false);

    // A thumbs up on its own disagrees with B's two stars: the stars go, the thumb stays.
    await request('/api/social/rate', { key: 'movie:603', value: 1 }, 'b@reviews.test');
    assert.equal((await get('b@reviews.test')).mine, null);

    // Only your own, unless you're the owner.
    await request('/api/reviews/delete', { key: 'movie:603', userId: idOf(a) }, 'b@reviews.test', 403);
    await request('/api/reviews/delete', { key: 'movie:603', userId: idOf(a) }, 'owner@reviews.test');
    assert.equal((await get('b@reviews.test')).count, 0);

    // Restricted people (accounts.js isRestricted, set by the owner in People): the API holds the line.
    await request('/api/reviews', { key: 'movie:603', stars: 4, text: 'Before the switch' }, 'b@reviews.test');
    await request('/api/reviews', { key: 'movie:603', stars: 5, text: 'Owner says hi' }, 'owner@reviews.test');
    const patched = await fetch(`http://127.0.0.1:${port}/api/admin/users/${idOf(b)}`, { method: 'POST',
      headers: { 'cf-access-authenticated-user-email': 'owner@reviews.test', 'content-type': 'application/json' }, body: JSON.stringify({ restricted: true }) });
    assert.ok(patched.ok);
    assert.equal((await request('/api/me', undefined, 'b@reviews.test')).me?.restricted, true);
    const forB = await get('b@reviews.test', true);
    assert.equal(forB.restricted, true);
    assert.deepEqual(forB.reviews, []);
    await request('/api/reviews', { key: 'movie:603', stars: 3, text: 'Let me in' }, 'b@reviews.test', 403);
    const forA = await get('a@reviews.test', true);
    assert.deepEqual(forA.reviews.map((r) => r.text), ['Owner says hi'], 'their old review is hidden from everyone else');
    assert.equal(forA.ratings, 1, 'their stars leave the average too');
    assert.equal(forA.average, null);
  } finally {
    killTree(child);
    await exited;
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
