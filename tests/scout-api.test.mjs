import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from './kill-tree.mjs';

const TOKEN = 'scout-test-token-0123456789abcdef';
const idea = (title, extra = {}) => ({ title, pitch: 'A short pitch about what this is like to use.', fit: 'Fits the player menu.', size: 'small',
  evidence: [{ text: 'People asked for it for years.', url: 'https://www.reddit.com/r/PleX/comments/x', where: 'r/PleX', year: 2016 },
    { text: 'Still wanted.', url: 'https://news.ycombinator.com/item?id=1', where: 'Hacker News', year: 2023 }], ...extra });

// The idea scout: the runner posts ideas with its token, the owner accepts/comments/declines in the idea inbox,
// the runner answers and reports builds. Members never see any of it, and their own ideas keep working.
test('the idea scout: token API, owner decisions and build reports', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-scout-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@scout.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1', SCOUT_TOKEN: TOKEN };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const call = async (route, body, headers, status) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'content-type': 'application/json', ...headers },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`); return data;
  };
  const as = (email) => ({ 'cf-access-authenticated-user-email': email });
  const runner = { authorization: `Bearer ${TOKEN}` };
  const user = (route, body, email = 'owner@scout.test', status = 200) => call(route, body, as(email), status);
  const bot = (route, body, status = 200) => call(route, body, runner, status);
  try {
    await user('/api/me'); await user('/api/me', undefined, 'a@scout.test');
    const member = await user('/api/ideas', { text: 'Let me sort by rating' }, 'a@scout.test');

    // Only the right token gets in.
    await call('/api/scout/ideas', undefined, {}, 403);
    await call('/api/scout/ideas', undefined, { authorization: 'Bearer nope' }, 403);
    await call('/api/scout/ideas', idea('Sneaky'), as('owner@scout.test'), 403);
    const empty = await bot('/api/scout/ideas');
    assert.deepEqual(empty.ideas, []);
    assert.deepEqual(empty.member.map((i) => i.text), ['Let me sort by rating'], 'the runner sees member ideas to avoid duplicates');
    assert.equal(empty.member[0].userId, undefined, 'but not who sent them');

    // Posting: needs evidence, keeps only web links, refuses the same title twice.
    await bot('/api/scout/ideas', { ...idea('No proof'), evidence: [] }, 400);
    await bot('/api/scout/ideas', { title: 'x', pitch: 'y' }, 400);
    const posted = (await bot('/api/scout/ideas', idea('Shuffle play', { evidence: [...idea('').evidence, { text: 'bad link', url: 'javascript:alert(1)', year: 1800 }] }))).idea;
    assert.equal(posted.status, 'new');
    assert.equal(posted.source, 'scout');
    assert.equal(posted.evidence.length, 3);
    assert.equal(posted.evidence[2].url, '', 'no javascript: links');
    assert.equal(posted.evidence[2].year, null);
    await bot('/api/scout/ideas', idea('  shuffle   PLAY! '), 409);
    const second = (await bot('/api/scout/ideas', idea('Film club', { size: 'huge' }))).idea;
    assert.equal(second.size, 'medium', 'unknown sizes fall back');

    // The owner sees scout ideas in the inbox; members don't.
    const owner = await user('/api/ideas');
    assert.equal(owner.scout.length, 2);
    assert.equal(owner.all.length, 1, 'member ideas stay apart');
    assert.equal((await user('/api/ideas', undefined, 'a@scout.test')).scout, undefined);
    await user(`/api/ideas/${posted.id}`, { action: 'accept' }, 'a@scout.test', 403);
    await user(`/api/ideas/${posted.id}/delete`, {}, 'a@scout.test'); // a member can't touch it (nothing of theirs to take back)
    assert.equal((await user('/api/ideas')).scout.length, 2);

    // The runner can't accept for the owner or skip ahead.
    await bot(`/api/scout/ideas/${posted.id}`, { status: 'approved' }, 409);
    await bot(`/api/scout/ideas/${posted.id}`, { status: 'building' }, 409);
    await bot(`/api/scout/ideas/${posted.id}`, { status: 'added' }, 409);

    // Comment → discuss → the scout answers → new again.
    await user(`/api/ideas/${posted.id}`, { action: 'comment', comment: ' ' }, undefined, 400);
    await user(`/api/ideas/${posted.id}`, { action: 'dance' }, undefined, 400);
    const discussed = (await user(`/api/ideas/${posted.id}`, { action: 'comment', comment: 'Only for shows, not films?' })).idea;
    assert.equal(discussed.status, 'discuss');
    assert.deepEqual(discussed.thread.map((c) => c.from), ['owner']);
    const answered = (await bot(`/api/scout/ideas/${posted.id}`, { status: 'new', comment: 'Yes, shows only.', pitch: 'Shuffle play for shows: a random episode.' })).idea;
    assert.equal(answered.status, 'new');
    assert.equal(answered.pitch, 'Shuffle play for shows: a random episode.');
    assert.deepEqual(answered.thread.map((c) => c.from), ['owner', 'scout']);

    // Accept with a comment → approved; the build goes building → added.
    const accepted = (await user(`/api/ideas/${posted.id}`, { action: 'accept', comment: 'Go, keep it small.' })).idea;
    assert.equal(accepted.status, 'approved');
    assert.ok(accepted.decided);
    await user(`/api/ideas/${posted.id}`, { action: 'accept' }, undefined, 409);
    const building = (await bot(`/api/scout/ideas/${posted.id}`, { status: 'building', build: { branch: 'scout/x-shuffle' } })).idea;
    assert.equal(building.status, 'building');
    assert.equal(building.build.branch, 'scout/x-shuffle');
    await user(`/api/ideas/${posted.id}`, { action: 'notnow' }, undefined, 409);
    await user(`/api/ideas/${posted.id}/delete`, {}, undefined, 409);
    const extra = (await user(`/api/ideas/${posted.id}`, { action: 'comment', comment: 'Also on the TV?' })).idea;
    assert.equal(extra.status, 'building', 'a comment during a build changes nothing');
    const added = (await bot(`/api/scout/ideas/${posted.id}`, { status: 'added', build: { commit: 'abc1234def', note: 'Shuffle button on show pages.' } })).idea;
    assert.equal(added.status, 'added');
    assert.equal(added.build.commit, 'abc1234def');
    assert.ok(added.build.finished);

    // Not now, then a failed build can be tried again.
    assert.equal((await user(`/api/ideas/${second.id}`, { action: 'notnow' })).idea.status, 'notnow');
    assert.equal((await user(`/api/ideas/${second.id}`, { action: 'accept' })).idea.status, 'approved');
    await bot(`/api/scout/ideas/${second.id}`, { status: 'building' });
    assert.equal((await bot(`/api/scout/ideas/${second.id}`, { status: 'failed', build: { note: 'Tests failed.' } })).idea.status, 'failed');
    assert.equal((await user(`/api/ideas/${second.id}`, { action: 'accept' })).idea.status, 'approved');

    // Delete, and the member's idea is untouched by all of it.
    await user(`/api/ideas/${second.id}/delete`, {});
    const after = await user('/api/ideas');
    assert.deepEqual(after.scout.map((i) => i.id), [posted.id]);
    assert.equal(after.all[0].id, member.idea.id);
    assert.equal((await user(`/api/ideas/${member.idea.id}`, { status: 'planned' })).idea.status, 'planned');
    await bot('/api/scout/ideas/00000000', { comment: 'hi' }, 404);
  } finally {
    killTree(child);
    await exited;
    await fs.rm(app, { recursive: true, force: true }).catch(() => {});
  }
});
