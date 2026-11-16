import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The idea box: people send ideas, see only their own, take back unanswered ones; the owner sees all and answers.
test('the idea box: send, list, answer and take back ideas', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-ideas-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@ideas.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@ideas.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
  try {
    await request('/api/me', undefined, 'owner@ideas.test');
    await request('/api/me', undefined, 'a@ideas.test');
    await request('/api/me', undefined, 'b@ideas.test');

    await request('/api/ideas', { text: '  ' }, 'a@ideas.test', 400);
    const sent = await request('/api/ideas', { text: 'Let me\n\n\n\nsort by rating', kind: 'feature' }, 'a@ideas.test');
    assert.equal(sent.idea.text, 'Let me\n\nsort by rating', 'blank lines squeezed');
    assert.equal(sent.idea.status, 'new');
    await request('/api/ideas', { text: 'Let me\n\nsort by rating' }, 'a@ideas.test', 400); // the same one twice
    const other = await request('/api/ideas', { text: 'Subtitles drift on episode 3', kind: 'fix' }, 'b@ideas.test');
    await request('/api/ideas', { text: 'Weird kind', kind: 'nonsense' }, 'b@ideas.test');

    // Each person sees only their own; only the owner sees everyone's.
    const a = await request('/api/ideas', undefined, 'a@ideas.test');
    assert.equal(a.mine.length, 1);
    assert.equal(a.all, undefined);
    const owner = await request('/api/ideas', undefined, 'owner@ideas.test');
    assert.equal(owner.all.length, 3);
    assert.equal(owner.all.find((i) => i.text === 'Weird kind').kind, 'feature', 'unknown kinds fall back');

    // Members can't answer; the owner can.
    await request(`/api/ideas/${sent.idea.id}`, { status: 'planned' }, 'b@ideas.test', 403);
    const answered = await request(`/api/ideas/${sent.idea.id}`, { status: 'planned', reply: 'Good one, on the list.' }, 'owner@ideas.test');
    assert.equal(answered.idea.status, 'planned');
    assert.ok(answered.idea.answered);
    await request(`/api/ideas/${sent.idea.id}`, { status: 'bogus' }, 'owner@ideas.test', 400);
    assert.equal((await request('/api/ideas', undefined, 'a@ideas.test')).mine[0].reply, 'Good one, on the list.');

    // Answered ideas stay; unanswered ones can be taken back, but only by whoever sent them.
    await request(`/api/ideas/${sent.idea.id}/delete`, {}, 'a@ideas.test', 403);
    await request(`/api/ideas/${other.idea.id}/delete`, {}, 'a@ideas.test', 403);
    assert.equal((await request(`/api/ideas/${other.idea.id}/delete`, {}, 'b@ideas.test')).mine.length, 1);
    await request(`/api/ideas/${sent.idea.id}/delete`, {}, 'owner@ideas.test');
    assert.equal((await request('/api/ideas', undefined, 'owner@ideas.test')).all.length, 1);
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
