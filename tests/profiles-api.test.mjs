import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanHandle, handleFromName, cleanLook, cleanSections, cleanBio, LOOK_DEFAULTS, SECTIONS } from '../src/profiles.js';

test('usernames, looks and sections are cleaned', () => {
  assert.equal(cleanHandle(' @Ebi.Cat '), 'ebi.cat');
  for (const bad of ['ab', '.ebi', 'ebi_', 'e..bi', 'ebi cat', 'admin', 'x'.repeat(21)]) assert.throws(() => cleanHandle(bad), bad);
  assert.equal(handleFromName('Åsa Lind', 4), 'asalind');
  assert.equal(handleFromName('Bo', 7), 'user7');
  const look = cleanLook({ accent: '#FF8C1A', font: 'comic', posters: 'polaroid', banner: 'title' });
  assert.equal(look.accent, '#ff8c1a');
  assert.equal(look.font, LOOK_DEFAULTS.font, 'unknown fonts fall back');
  assert.equal(look.posters, 'polaroid');
  assert.equal(look.banner, 'auto', 'a title banner needs a title');
  assert.equal(cleanLook({ accent: 'red' }).accent, null);
  const sections = cleanSections([{ id: 'liked', on: false }, 'recent', { id: 'nope' }, 'recent']);
  assert.deepEqual(sections.slice(0, 2), [{ id: 'liked', on: false }, { id: 'recent', on: true }]);
  assert.equal(sections.length, SECTIONS.length);
  assert.equal(cleanBio('hi\r\n\r\n\r\n\u0007there  \n'), 'hi\n\nthere');
});

// Profiles over HTTP: a username is made on first view, visibility decides who sees what, and the diary
// comes from the watch log (rewatches marked).
test('profiles: privacy, usernames and the diary', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-profiles-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@p.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email = 'owner@p.test', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`); return data;
  };
  try {
    await request('/api/me');
    const ebi = (await request('/api/me', { name: 'Ebi' }, 'ebi@p.test')).me;
    const bo = (await request('/api/me', { name: 'Bo' }, 'bo@p.test')).me;
    const mum = (await request('/api/me', { name: 'Mamma' }, 'mum@p.test')).me;
    await request(`/api/admin/users/${mum.id}`, { restricted: true });

    // A username from the name on first view; friends-only by default.
    const mine = await request('/api/profiles/me', undefined, 'ebi@p.test');
    assert.equal(mine.person.handle, 'ebi');
    assert.equal(mine.me, true);
    assert.equal(mine.visibility, 'friends');
    assert.equal(mine.sections.length, 8);

    // Bo isn't a friend: locked page with name and picture only.
    let seen = await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test');
    assert.equal(seen.locked, true);
    assert.equal(seen.person.name, 'Ebi');
    assert.equal(seen.person.bio, undefined);
    assert.equal(seen.friend, null);
    await request(`/api/profiles/${ebi.id}/diary`, undefined, 'bo@p.test', 403);

    // Edits: username, pronouns, bio, look; a taken or bad username is refused.
    await request('/api/profiles/me', { handle: 'bobo' }, 'bo@p.test');
    await request('/api/profiles/me', { handle: '@BoBo' }, 'ebi@p.test', 409);
    await request('/api/profiles/me', { handle: 'x' }, 'ebi@p.test', 400);
    await request('/api/profiles/me', { bio: 'a'.repeat(301) }, 'ebi@p.test', 400);
    await request('/api/profiles/me', { visibility: 'everyone' }, 'ebi@p.test', 400);
    const saved = await request('/api/profiles/me', { handle: 'EbiCat', pronouns: 'she/her', bio: 'films at 3am\n\n\n\nalways', look: { accent: '#E9A0C4', font: 'serif' },
      sections: [{ id: 'recent', on: true }, { id: 'liked', on: false }] }, 'ebi@p.test');
    assert.equal(saved.person.handle, 'ebicat');
    assert.equal(saved.person.bio, 'films at 3am\n\nalways');
    assert.equal(saved.look.accent, '#e9a0c4');
    assert.equal(saved.look.font, 'serif');
    assert.equal(saved.sections[0].id, 'recent');
    assert.equal((await request('/api/profiles/@ebicat', undefined, 'bo@p.test')).person.id, ebi.id, 'found by username');

    // Watching: a finished film twice on different days would be a rewatch; here one film, one episode.
    await request('/api/me/progress', { ref: 'm:film', time: null, duration: 6000, watched: 20, about: { title: 'Lost in Translation', titleKey: 'movie:153' } }, 'ebi@p.test');
    await request('/api/me/progress', { ref: 'e:ep1', time: null, duration: 1500, watched: 20, about: { title: 'Fleabag', titleKey: 'tv:67070', season: 1, episode: 2 } }, 'ebi@p.test');
    await request('/api/me/progress', { ref: 'm:half', time: 300, duration: 6000, watched: 20, about: { title: 'Half watched', titleKey: 'movie:999' } }, 'ebi@p.test');
    await request('/api/social/rate', { key: 'movie:153', value: 1, title: 'Lost in Translation' }, 'ebi@p.test');

    // Public: Bo sees it all apart from switched-off sections.
    await request('/api/profiles/me', { visibility: 'public' }, 'ebi@p.test');
    seen = await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test');
    assert.equal(seen.locked, false);
    assert.equal(seen.person.pronouns, 'she/her');
    assert.deepEqual(seen.recent.map((r) => r.title), ['Fleabag', 'Lost in Translation'], 'half-watched films don’t count');
    assert.deepEqual(seen.recent[0].episodes, [[1, 2]]);
    assert.equal(seen.recent[1].liked, true);
    assert.deepEqual(seen.liked, [], 'Liked is switched off');
    assert.equal(seen.stats.films, 1);
    assert.equal(seen.stats.episodes, 1);
    assert.equal(seen.stats.likes, 1);
    const diary = await request(`/api/profiles/${ebi.id}/diary`, undefined, 'bo@p.test');
    assert.equal(diary.entries.length, 2);
    assert.equal(diary.more, false);
    const films = await request(`/api/profiles/${ebi.id}/diary?type=movie`, undefined, 'bo@p.test');
    assert.deepEqual(films.entries.map((e) => e.type), ['movie'], 'Films only');
    const shows = await request(`/api/profiles/${ebi.id}/diary?type=tv`, undefined, 'bo@p.test');
    assert.deepEqual(shows.entries.map((e) => e.type), ['tv'], 'Shows only');

    // Friends only: a friend sees it, others don't. Private: nobody but her.
    await request('/api/profiles/me', { visibility: 'friends' }, 'ebi@p.test');
    assert.equal((await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test')).locked, true);
    await request('/api/friends/request', { id: ebi.id }, 'bo@p.test');
    assert.equal((await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test')).friend, 'sent');
    await request('/api/friends/accept', { id: bo.id }, 'ebi@p.test');
    seen = await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test');
    assert.equal(seen.locked, false);
    assert.equal(seen.friend, 'friend');
    assert.deepEqual(seen.friends.map((f) => f.name), ['Bo']);
    await request('/api/profiles/me', { visibility: 'private' }, 'ebi@p.test');
    assert.equal((await request(`/api/profiles/${ebi.id}`, undefined, 'bo@p.test')).locked, true);
    const peek = await request(`/api/profiles/${ebi.id}`, undefined, 'owner@p.test');
    assert.equal(peek.locked, false, 'owners see private pages');
    assert.equal(peek.ownerPeek, true);
    assert.equal(seen.ownerPeek, false, 'a friend looking at a friends-only page is not peeking');
    assert.equal((await request('/api/profiles/me', undefined, 'ebi@p.test')).locked, false);

    // Restricted people: locked both ways.
    await request('/api/profiles/me', { visibility: 'public' }, 'ebi@p.test');
    assert.equal((await request(`/api/profiles/${ebi.id}`, undefined, 'mum@p.test')).locked, true);
    assert.equal((await request(`/api/profiles/${mum.id}`, undefined, 'ebi@p.test')).locked, true);
    await request('/api/profiles/99999', undefined, 'ebi@p.test', 404);
    await request('/api/profiles/@nobody', undefined, 'ebi@p.test', 404);
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); // Windows keeps the dead server's files locked briefly
  }
});
