import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as reviews from '../src/reviews.js';
import * as profiles from '../src/profiles.js';
import * as social from '../src/social.js';
import * as friends from '../src/friends.js';
import * as lb from '../src/letterboxd.js';
import * as lists from '../src/lists.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-diary-move-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  reviews.initReviews(); friends.initFriends(); profiles.initProfiles(); lb.initLetterboxd(); lists.initLists();
  return accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': 'anna@example.test' } }), { name: 'Anna' });
}
const at = (day, clock) => new Date(`${day}T${clock}:00`).getTime();

test('diary: Edit dates moves a film to another day, keeping or setting the time', () => {
  const anna = setup();
  social.logWatch(anna.id, { ref: 'm:film', about: { title: 'Heat', titleKey: 'movie:949' }, watched: 30, now: at('2026-11-20', '21:00') });
  for (let i = 1; i <= 120; i++) social.logWatch(anna.id, { ref: 'm:film', about: { title: 'Heat', titleKey: 'movie:949' }, watched: 60, now: at('2026-11-20', '21:00') + i * 60_000 });
  social.logWatch(anna.id, { ref: 'm:film', about: { title: 'Heat', titleKey: 'movie:949' }, finished: true, watched: 0, now: at('2026-11-20', '23:05') });
  assert.equal(profiles.diary(anna.id).entries[0].day, '2026-11-20');
  assert.equal(profiles.moveWatch(anna.id, { key: 'movie:949', day: '2026-11-20', to: '2026-11-02', now: at('2026-11-23', '12:00') }), 1);
  let e = profiles.diary(anna.id).entries[0];
  assert.equal(e.day, '2026-11-02');
  assert.equal(new Date(e.at).getHours(), 23);
  profiles.moveWatch(anna.id, { key: 'movie:949', day: '2026-11-02', to: '2026-11-02', time: '18:30', now: at('2026-11-23', '12:00') });
  e = profiles.diary(anna.id).entries[0];
  assert.equal(new Date(e.at).getHours(), 18);
  assert.throws(() => profiles.moveWatch(anna.id, { key: 'movie:949', day: '2026-11-02', to: '2027-01-01', now: at('2026-11-23', '12:00') }), /happened/);
  assert.throws(() => profiles.moveWatch(anna.id, { key: 'movie:949', day: '2026-11-03', to: '2026-11-01' }), /Nothing/);
});

test('diary: episodes marked watched by hand show up and move as a day', () => {
  const anna = setup();
  for (const ep of [1, 2]) social.markEpisode(anna.id, { key: 'tv:4586', season: 1, episode: ep, seen: true, title: 'Gilmore Girls', now: at('2026-11-23', '10:00') + ep });
  let e = profiles.diary(anna.id).entries[0];
  assert.deepEqual([e.day, e.episodes], ['2026-11-23', [[1, 1], [1, 2]]]);
  profiles.moveWatch(anna.id, { key: 'tv:4586', day: '2026-11-23', to: '2026-10-01', episodes: [[1, 2]], now: at('2026-11-23', '12:00') });
  const days = profiles.diary(anna.id).entries.map((x) => `${x.day}:${x.episodes.map((p) => p.join('x'))}`);
  assert.deepEqual(days, ['2026-11-23:1x1', '2026-10-01:1x2']);
});
