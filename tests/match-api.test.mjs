import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { topicFor } from '../src/live.js';
import { killTree } from './kill-tree.mjs';

test('pick routes tell the person’s other pages', () => {
  const id = 'Pk3x9QmZ2aBcDeFgHiJkLm';
  for (const p of ['/api/match', `/api/match/${id}/vote`, `/api/match/${id}/join`, `/api/match/${id}/watch`]) {
    assert.deepEqual(topicFor(p), { topic: 'match', audience: 'user' }, p);
  }
  assert.equal(topicFor(`/api/match/${id}/nope`), null);
});

// The server end to end without TMDB: the routes exist, POSTs get through the allow-list, and the answer
// says TMDB is needed (in Swedish too). The picking itself is tested with a pretend TMDB in match.test.mjs.
test('the pick API is wired up and needs TMDB', { timeout: 30000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-match-api-'));
  const media = path.join(app, 'media');
  await fs.mkdir(media, { recursive: true });
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  for (const dir of ['src', 'public']) await fs.cp(path.join(root, dir), path.join(app, dir), { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', MEDIA_DIR: media, ADMIN_EMAILS: 'owner@m.test', CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off',
    SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0', TMDB_TOKEN: '', TMDB_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = ''; child.stderr.on('data', (c) => { logs += c; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const m = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, headers = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': 'owner@m.test', 'content-type': 'application/json', ...headers },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  try {
    const id = 'Pk3x9QmZ2aBcDeFgHiJkLm';
    let r = await request('/api/match');
    assert.equal(r.status, 503);
    assert.match(r.data.error, /TMDB/);
    r = await request('/api/match', { type: 'movie' });
    assert.equal(r.status, 503, 'a POST gets through to the route');
    for (const action of ['join', 'vote', 'more', 'invite', 'leave', 'watch']) assert.equal((await request(`/api/match/${id}/${action}`, {})).status, 503, action);
    assert.equal((await request(`/api/match/${id}/delete`, {})).status, 405, 'anything else is refused');
    r = await request('/api/match', undefined, { 'x-lilin-lang': 'sv' });
    assert.match(r.data.error, /Välj tillsammans behöver TMDB/);
  } finally {
    killTree(child);
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
