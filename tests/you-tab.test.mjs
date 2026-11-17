import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROUTES, pagesOf, resolve, linkRoute } from '../public/routes.js';

// The You tab's root list: which rows each kind of person gets, in which group. A miscopied rule would show a row
// someone may not use (or hide one they need), so every role is spelled out here.
const ROLES = {
  owner: { me: { id: 1, email: 'o@x.test', isOwner: true, canDownload: true, canInvite: true, canSeeActivity: true }, status: { admin: true, downloads: true } },
  coOwner: { me: { id: 2, email: 'c@x.test', canDownload: true }, status: { admin: true, downloads: true } },
  member: { me: { id: 3, email: 'm@x.test', canDownload: false }, status: { downloads: true } },
  memberAct: { me: { id: 4, email: 'a@x.test', canSeeActivity: true }, status: {} },
  memberInv: { me: { id: 5, email: 'i@x.test', canInvite: true }, status: {} },
  memberDl: { me: { id: 6, email: 'd@x.test', canDownload: true }, status: { downloads: true } },
  restricted: { me: { id: 7, email: 'r@x.test', restricted: true }, status: {} },
  home: { me: { id: 8, email: null, name: 'Home network', canDownload: true }, status: { downloads: true } },
};
const rows = (role) => {
  const { me, status } = ROLES[role];
  const out = {};
  for (const id of pagesOf('you', me, status)) (out[ROUTES[id].group] ||= []).push(ROUTES[id].sub);
  return out;
};
const SETTINGS = ['account', 'look', 'watching', 'devices'];
const WATCHING = ['history', 'ratings', 'liked'];

test('You: each role gets exactly its rows, group by group', () => {
  // owners (co-owners too) invite from You as well as House → People
  assert.deepEqual(rows('owner'), { watching: WATCHING, people: ['friends', 'moments', 'invite'], settings: [...SETTINGS, 'download-settings'] });
  assert.deepEqual(rows('coOwner'), { watching: WATCHING, people: ['friends', 'moments', 'invite'], settings: [...SETTINGS, 'download-settings'], ideas: ['ideas'] });
  assert.deepEqual(rows('member'), { watching: WATCHING, people: ['friends', 'moments'], settings: SETTINGS, ideas: ['ideas'] });
  assert.deepEqual(rows('memberAct'), { watching: WATCHING, people: ['friends', 'moments', 'activity'], settings: SETTINGS, ideas: ['ideas'] });
  assert.deepEqual(rows('memberInv'), { watching: WATCHING, people: ['friends', 'moments', 'invite'], settings: SETTINGS, ideas: ['ideas'] });
  assert.deepEqual(rows('memberDl'), { watching: WATCHING, people: ['friends', 'moments'], settings: [...SETTINGS, 'download-settings'], ideas: ['ideas'] });
  // restricted: no stars to give, no friends; their own moments (link-only sharing) stay
  assert.deepEqual(rows('restricted'), { watching: ['history', 'liked'], people: ['moments'], settings: SETTINGS, ideas: ['ideas'] });
  // the shared home account: its own history and moments, no friends or public page
  assert.deepEqual(rows('home'), { watching: WATCHING, people: ['moments'], settings: [...SETTINGS, 'download-settings'], ideas: ['ideas'] });
});

test('You: every page in the list has something to draw', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const pages = app.slice(app.indexOf('const YOU_PAGES = {'), app.indexOf('};', app.indexOf('const YOU_PAGES = {')));
  for (const [id, r] of Object.entries(ROUTES)) {
    if (r.tab !== 'you' || r.view !== 'you' || !r.sub) continue;
    assert.match(pages, new RegExp(`(^|\\s)'?${r.sub}'?: `, 'm'), `YOU_PAGES has no ${id}`);
  }
  // groups the list draws, in its order
  assert.match(app, /const YOU_GROUPS = \(\) => \[\['watching', T\('Your watching'\)\], \['people', T\('People'\)\], \['settings', T\('Settings'\)\], \['ideas', null\]\];/);
});

test('You: old addresses and notification links open the right page for every role', () => {
  const q = (s) => new URLSearchParams(s);
  for (const role of Object.keys(ROLES)) {
    const { me, status } = ROLES[role];
    assert.equal(resolve('#settings', me, status), 'you', role);
    assert.equal(linkRoute(q('moment=abc123'), me, status), 'you/moments', `${role}: a moment link`);
    const friends = linkRoute(q('friends=1'), me, status);
    assert.equal(friends, me.email && !me.restricted ? 'you/friends' : null, `${role}: friends link`);
    assert.equal(linkRoute(q('ideas=1'), me, status), me.isOwner ? 'house/ideas' : 'you/ideas', `${role}: ideas link (a co-owner's answers too)`);
    assert.equal(resolve('#activity', me, status), status.admin ? 'house/activity' : me.canSeeActivity ? 'you/activity' : null, `${role}: #activity`);
    for (const sub of WATCHING) {
      const id = resolve(`#you/${sub}`, me, status);
      assert.equal(id, sub === 'ratings' && me.restricted ? null : `you/${sub}`, `${role}: #you/${sub}`);
    }
  }
});

// Your own lists over HTTP: Liked pages through everything (the public page shows 12), for you and for the home
// network's shared account; nobody else opens the home account's, and a hidden Liked section stays hidden.
test('You → Liked: every title, a page at a time; private to others when switched off', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fsp.mkdtemp(path.join(os.tmpdir(), 'lilin-you-'));
  for (const name of await fsp.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fsp.copyFile(path.join(root, name), path.join(app, name));
  await fsp.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fsp.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@p.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((done, fail) => {
    let logs = ''; const timer = setTimeout(() => fail(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); done(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); fail(Error(logs)); });
  });
  // email null: no identity header, so the loopback address is the home network's shared account
  const request = async (route, body, email = 'owner@p.test', status = 200) => {
    const headers = { 'content-type': 'application/json', ...(email && { 'cf-access-authenticated-user-email': email }) };
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`); return data;
  };
  try {
    const ebi = (await request('/api/me', { name: 'Ebi' }, 'ebi@p.test')).me;
    await request('/api/me', { name: 'Bo' }, 'bo@p.test');
    const home = (await request('/api/me', undefined, null)).me;
    for (let n = 1; n <= 30; n++) await request('/api/social/rate', { key: `movie:${1000 + n}`, value: 1, title: `Film ${n}` }, 'ebi@p.test');
    await request('/api/social/rate', { key: 'movie:42', value: 1, title: 'Home film' }, null);

    const first = await request(`/api/profiles/${ebi.id}/liked`, undefined, 'ebi@p.test');
    assert.equal(first.liked.length, 24);
    assert.equal(first.more, true);
    assert.equal(first.liked[0].title, 'Film 30', 'newest first');
    const rest = await request(`/api/profiles/${ebi.id}/liked?offset=24`, undefined, 'ebi@p.test');
    assert.equal(rest.liked.length, 6);
    assert.equal(rest.more, false);

    // Friends-only by default: Bo (not a friend) can't page through it; with the section off, nobody but Ebi can.
    await request(`/api/profiles/${ebi.id}/liked`, undefined, 'bo@p.test', 403);
    await request('/api/profiles/me', { visibility: 'public', sections: [{ id: 'liked', on: false }] }, 'ebi@p.test');
    await request(`/api/profiles/${ebi.id}/liked`, undefined, 'bo@p.test', 403);
    assert.equal((await request(`/api/profiles/${ebi.id}/liked`, undefined, 'ebi@p.test')).liked.length, 24, 'your own list ignores what the page shows');

    // The shared home account sees its own; nobody else opens it.
    assert.deepEqual((await request(`/api/profiles/${home.id}/liked`, undefined, null)).liked.map((l) => l.title), ['Home film']);
    await request(`/api/profiles/${home.id}/liked`, undefined, 'ebi@p.test', 404);
  } finally {
    child.kill();
    await exited;
    await fsp.rm(app, { recursive: true, force: true });
  }
});

// Answers to someone's idea are their own notification switch, not "Lilin updates" (release notes only).
test('idea answers notify on the idea switch, apart from Lilin updates', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /notify\(\[idea\.userId\], 'idea', \{ title, body: idea\.reply/);
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(!state\.me\?\.isOwner\) out\.push\(settingsRow\(T\('Answers to your ideas'\)/);
  assert.doesNotMatch(app, /or the owner answers an idea you sent/);
});
