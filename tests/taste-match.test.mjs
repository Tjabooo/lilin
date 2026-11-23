import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as social from '../src/social.js';
import * as reviews from '../src/reviews.js';
import * as friends from '../src/friends.js';
import * as profiles from '../src/profiles.js';
import * as letterboxd from '../src/letterboxd.js';
import * as lists from '../src/lists.js';
import * as taste from '../src/taste-match.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-taste-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  social.initSocial?.();
  reviews.initReviews();
  friends.initFriends();
  profiles.initProfiles();
  letterboxd.initLetterboxd();
  lists.initLists();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  return { anna: make('anna@example.test', 'Anna'), ben: make('ben@example.test', 'Ben'), cleo: make('cleo@example.test', 'Cleo') };
}
const db = () => accounts.database();
const star = (userId, key, stars, at = Date.now()) => db().prepare(`INSERT INTO reviews (user_id, title_key, stars, text, title, created_at, updated_at)
  VALUES (?, ?, ?, '', ?, ?, ?) ON CONFLICT(user_id, title_key) DO UPDATE SET stars = excluded.stars`).run(userId, key, stars, key, at, at);
const befriend = (a, b) => { friends.request(a, b.id); friends.accept(b, a.id); };

test('opinions in stars and the level from the gaps', () => {
  assert.equal(taste.valueOf({ thumb: 1 }), 4.5);
  assert.equal(taste.valueOf({ thumb: -1 }), 1.5);
  assert.equal(taste.valueOf({ stars: 3.5, thumb: 1 }), 4, 'a Letterboxd heart lifts the stars');
  assert.equal(taste.valueOf({ stars: 3 }), 3);
  assert.equal(taste.valueOf({}), null);
  assert.equal(taste.levelFor(Array(9).fill(0)), null, 'under ten in common: no level');
  assert.equal(taste.levelFor(Array(10).fill(0)), 'super');
  assert.equal(taste.levelFor([...Array(9).fill(0), 3]), 'veryHigh', 'one split in ten');
  assert.equal(taste.levelFor([...Array(8).fill(0), 3, 3]), 'high');
  assert.equal(taste.levelFor(Array(100).fill(1)), 'medium', 'a star apart on average is ordinary');
  assert.equal(taste.levelFor(Array(40).fill(2)), 'low');
  assert.deepEqual(taste.LEVELS, ['low', 'medium', 'high', 'veryHigh', 'super']);
});

test('compare: loved together, splits, and what they loved that you haven’t seen', () => {
  const { anna, ben } = setup();
  // Twelve films both rated: ten agree, two split.
  for (let i = 1; i <= 10; i++) { star(anna.id, `movie:${i}`, 5); star(ben.id, `movie:${i}`, i <= 8 ? 4.5 : 3.5); }
  star(anna.id, 'movie:11', 5); social.rate(ben.id, 'movie:11', -1, 'Eleven'); // Ben's bare thumbs down: private
  social.rate(anna.id, 'movie:12', -1, 'Twelve'); star(ben.id, 'movie:12', 5); // Anna's own thumbs down: hers to see
  star(anna.id, 'movie:13', 5); star(ben.id, 'movie:13', 1);
  // Ben loved three Anna hasn't rated: one she watched here, one on Letterboxd, one she never saw.
  social.rate(ben.id, 'movie:20', 1, 'Twenty'); star(ben.id, 'movie:21', 5); star(ben.id, 'movie:22', 4.5);
  db().prepare("INSERT INTO watch_log (user_id, day, ref, title_key, title, seconds, first_at, last_at) VALUES (?, '2026-11-01', 'r', 'movie:21', 'x', 60, 1, 1)").run(anna.id);
  db().prepare("INSERT INTO letterboxd_log (user_id, id, title_key, title, day, at) VALUES (?, 'w:22', 'movie:22', 'x', NULL, 0)").run(anna.id);
  star(ben.id, 'movie:23', 2); // not loved: never suggested

  const m = taste.compare(anna.id, ben.id);
  assert.equal(m.common, 13);
  assert.equal(m.need, taste.MIN_COMMON);
  assert.ok(taste.LEVELS.includes(m.level));
  assert.deepEqual(m.both.map((x) => x.key).slice(0, 3), ['movie:1', 'movie:2', 'movie:3'], 'the ones both rated highest come first');
  assert.ok(!m.both.some((x) => x.key === 'movie:9'), '3½ stars isn’t loving it');
  const splits = m.split.map((x) => x.key);
  assert.ok(splits.includes('movie:12') && splits.includes('movie:13'));
  assert.ok(!splits.includes('movie:11'), 'the other person’s bare thumbs down never shows');
  assert.equal(m.split[0].key, 'movie:13', 'the widest split first');
  assert.deepEqual(m.split.find((x) => x.key === 'movie:12').mine, { stars: null, liked: false, disliked: true });
  assert.deepEqual(m.split.find((x) => x.key === 'movie:13').theirs, { stars: 1, liked: false });
  assert.deepEqual(m.theirs.map((x) => x.key), ['movie:20'], 'watched here or on Letterboxd counts as seen');
  assert.equal(m.theirs[0].liked, true);

  // From Ben's side Anna's bare thumbs down on 12 is hidden the same way.
  const back = taste.compare(ben.id, anna.id);
  assert.ok(!back.split.some((x) => x.key === 'movie:12'));
  assert.ok(back.split.some((x) => x.key === 'movie:11'), 'his own thumbs down is his to see');
  assert.equal(back.level, m.level, 'the level is the same both ways');
});

test('only friends get it, never restricted people, and the friend can switch it off', async () => {
  const { anna, ben, cleo } = setup();
  for (let i = 1; i <= 10; i++) { social.rate(anna.id, `movie:${i}`, 1, 'x'); social.rate(ben.id, `movie:${i}`, 1, 'x'); social.rate(cleo.id, `movie:${i}`, 1, 'x'); }
  const withCards = async (list) => list.map((x) => ({ ...x, card: null }));
  const open = (viewer, target) => taste.forProfile(viewer, target, profiles.view(viewer, target), { withCards });
  profiles.profileOf(cleo);
  await profiles.save(cleo, { visibility: 'public' });
  assert.equal(await open(anna, cleo), null, 'a public profile isn’t enough: friends only');
  befriend(anna, ben);
  const m = await open(anna, ben);
  assert.equal(m.level, 'super');
  assert.equal(m.common, 10);
  assert.equal(await open(anna, anna), null, 'not on your own page');

  await profiles.save(ben, { sections: profiles.SECTIONS.map((id) => ({ id, on: id !== 'match' })) });
  assert.equal(await open(anna, ben), null, 'Ben switched his section off');
  assert.ok(await open(ben, anna), 'Anna still shows it on hers');

  accounts.updateUser(anna.id, { restricted: true });
  const restricted = accounts.userById(anna.id);
  assert.equal(taste.visible(restricted, ben, { sections: [{ id: 'match', on: true }] }), false);
  assert.equal(await open(ben, restricted), null);
});

test('old profiles get the section after Ratings', () => {
  assert.deepEqual(profiles.cleanSections(['favorites', 'ratings', 'reviews']).map((s) => s.id).slice(0, 5), ['favorites', 'ratings', 'match', 'anime', 'reviews']);
});

// Over HTTP: the profile answer carries `match` for a friend, and null for anyone else.
test('profiles API: match on a friend’s profile only', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fsp.mkdtemp(path.join(os.tmpdir(), 'lilin-taste-api-'));
  for (const name of await fsp.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fsp.copyFile(path.join(root, name), path.join(app, name));
  await fsp.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fsp.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@t.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const request = async (route, body, email, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`); return data;
  };
  try {
    await request('/api/me', undefined, 'owner@t.test');
    const ebi = (await request('/api/me', { name: 'Ebi' }, 'ebi@t.test')).me;
    const bo = (await request('/api/me', { name: 'Bo' }, 'bo@t.test')).me;
    for (let i = 1; i <= 4; i++) {
      await request('/api/social/rate', { key: `movie:${i}`, value: 1, title: `Film ${i}` }, 'ebi@t.test');
      await request('/api/social/rate', { key: `movie:${i}`, value: 1, title: `Film ${i}` }, 'bo@t.test');
    }
    await request('/api/social/rate', { key: 'movie:9', value: 1, title: 'Film 9' }, 'ebi@t.test');
    assert.equal((await request(`/api/profiles/${ebi.id}`, undefined, 'bo@t.test')).match, undefined, 'locked page: nothing');
    await request('/api/friends/request', { id: ebi.id }, 'bo@t.test');
    await request('/api/friends/accept', { id: bo.id }, 'ebi@t.test');
    const seen = await request(`/api/profiles/${ebi.id}`, undefined, 'bo@t.test');
    assert.equal(seen.match.level, null, 'four in common: not enough yet');
    assert.equal(seen.match.common, 4);
    assert.equal(seen.match.need, 10);
    assert.deepEqual(seen.match.both.map((x) => x.key).sort(), ['movie:1', 'movie:2', 'movie:3', 'movie:4']);
    assert.deepEqual(seen.match.theirs.map((x) => x.key), ['movie:9']);
    assert.ok('card' in seen.match.theirs[0], 'title cards are added (null without TMDB)');
    assert.equal((await request('/api/profiles/me', undefined, 'ebi@t.test')).match, null, 'not on your own page');
  } finally {
    child.kill();
    await exited;
    await fsp.rm(app, { recursive: true, force: true });
  }
});
