// Hide from my profile (src/profile-hidden.js): hidden titles leave the profile for everyone but its owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
import * as hidden from '../src/profile-hidden.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-hidden-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  social.initSocial?.();
  reviews.initReviews();
  friends.initFriends();
  profiles.initProfiles();
  letterboxd.initLetterboxd();
  lists.initLists();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  const anna = make('anna@example.test', 'Anna'), ben = make('ben@example.test', 'Ben');
  friends.request(anna, ben.id); friends.accept(ben, anna.id);
  return { anna, ben };
}
const db = () => accounts.database();
const watched = (userId, key, day, at) => db().prepare(`INSERT INTO watch_log (user_id, day, ref, title_key, title, seconds, finished, first_at, last_at, finished_at)
  VALUES (?, ?, ?, ?, ?, 7200, 1, ?, ?, ?)`).run(userId, day, `r:${key}`, key, key, at, at, at);
const star = (userId, key, stars, text = '') => db().prepare(`INSERT INTO reviews (user_id, title_key, stars, text, title, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, 1)`).run(userId, key, stars, text, key);

test('a hidden title leaves recent, diary, liked, reviews and the title page faces for others only', () => {
  const { anna, ben } = setup();
  watched(anna.id, 'movie:1', '2026-11-01', 1000);
  watched(anna.id, 'movie:2', '2026-11-02', 2000);
  social.rate(anna.id, 'movie:1', 1, 'One'); social.rate(anna.id, 'movie:2', 1, 'Two');
  star(anna.id, 'movie:2', 4, 'Good one');

  assert.equal(hidden.setHidden(anna.id, 'movie:2', true), true);
  assert.throws(() => hidden.setHidden(anna.id, 'nope', true), /Which film/);

  const theirs = profiles.view(ben, anna);
  assert.deepEqual(theirs.recent.map((r) => r.key), ['movie:1']);
  assert.deepEqual(theirs.liked.map((r) => r.key), ['movie:1']);
  assert.deepEqual(theirs.reviews.reviews, []);
  const d = profiles.diary(anna.id, { hide: hidden.hiddenKeys(anna.id) });
  assert.deepEqual(d.entries.map((e) => [e.key, e.stub]), [['movie:1', 1]], 'stubs count only what is shown');

  const own = profiles.view(anna, anna);
  assert.deepEqual(own.recent.map((r) => r.key), ['movie:2', 'movie:1'], 'she still sees everything');
  assert.equal(own.liked.length, 2);
  assert.equal(own.reviews.reviews.length, 1);

  const page = social.ratingFor(ben.id, 'movie:2', () => 'Anna');
  assert.deepEqual(page.likedBy, [], 'no face on the title page');
  assert.deepEqual(social.ratingFor(ben.id, 'movie:1', () => 'Anna').likedBy, ['Anna']);

  assert.equal(hidden.setHidden(anna.id, 'movie:2', false), false);
  assert.equal(profiles.view(ben, anna).recent.length, 2, 'switched back: on the profile again');
});

test('taste match leaves out what the friend hides', () => {
  const { anna, ben } = setup();
  star(ben.id, 'movie:9', 5);
  star(ben.id, 'movie:8', 5);
  hidden.setHidden(ben.id, 'movie:9', true);
  assert.deepEqual(taste.compare(anna.id, ben.id).theirs.map((t) => t.key), ['movie:8']);
});
