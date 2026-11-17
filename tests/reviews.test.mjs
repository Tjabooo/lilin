import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as social from '../src/social.js';
import * as reviews from '../src/reviews.js';
import { topicFor } from '../src/live.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-reviews-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  reviews.initReviews();
  reviews.resetLimits();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  const anna = make('anna@example.test', 'Anna'), ben = make('ben@example.test', 'Ben'), cleo = make('cleo@example.test', 'Cleo');
  const nameOf = (id) => accounts.userById(id)?.name || 'Someone';
  const viewer = (u, extra = {}) => ({ id: u.id, isOwner: false, restricted: false, ...extra });
  return { anna, ben, cleo, nameOf, viewer };
}

test('reviews: stars set the thumb and the thumb clears stars that disagree', () => {
  const { anna, nameOf } = setup();
  const thumb = () => social.ratingFor(anna.id, 'movie:603', nameOf).mine;
  assert.equal(reviews.save(anna.id, 'movie:603', { stars: 5, title: 'The Matrix' }), 1);
  assert.equal(thumb(), 1, '4-5 stars = thumbs up');
  reviews.save(anna.id, 'movie:603', { stars: 2 });
  assert.equal(thumb(), -1, '1-2 stars = thumbs down');
  assert.ok(social.dislikedKeys(anna.id).has('movie:603'));
  reviews.save(anna.id, 'movie:603', { stars: 3, text: 'Fine.' });
  assert.equal(thumb(), 0, '3 stars = no thumb');

  // A thumb that agrees leaves the stars alone; one that disagrees clears them, never the text.
  reviews.save(anna.id, 'movie:603', { stars: 4, text: 'Better the second time.' });
  assert.equal(reviews.onThumb(anna.id, 'movie:603', 1), false);
  assert.equal(reviews.onThumb(anna.id, 'movie:603', -1), true);
  assert.deepEqual([reviews.reviewOf(anna.id, 'movie:603').stars, reviews.reviewOf(anna.id, 'movie:603').text], [null, 'Better the second time.']);
  // Stars without text go away entirely when the thumb is cleared.
  reviews.save(anna.id, 'tv:1399', { stars: 5 });
  reviews.onThumb(anna.id, 'tv:1399', 0);
  assert.equal(reviews.reviewOf(anna.id, 'tv:1399'), null);

  // Without stars, the sheet's own thumb counts; nothing at all removes the review but keeps the thumb.
  reviews.save(anna.id, 'tv:1', { text: 'Loved it', thumb: 1 });
  assert.equal(social.ratingFor(anna.id, 'tv:1', nameOf).mine, 1);
  reviews.save(anna.id, 'tv:1', { text: '   ' });
  assert.equal(reviews.reviewOf(anna.id, 'tv:1'), null);
  assert.equal(social.ratingFor(anna.id, 'tv:1', nameOf).mine, 1);
});

test('reviews: plain text, limits and validation', () => {
  const { anna } = setup();
  reviews.save(anna.id, 'movie:1', { text: '<b>bold</b>\r\n\r\n\r\n\r\nline\u0007 two', spoiler: true });
  const r = reviews.reviewOf(anna.id, 'movie:1');
  assert.equal(r.text, '<b>bold</b>\n\nline two', 'kept as text, controls out, blank lines squeezed');
  assert.equal(r.spoiler, 1);
  reviews.save(anna.id, 'movie:1', { stars: 4, spoiler: true });
  assert.equal(reviews.reviewOf(anna.id, 'movie:1').spoiler, 0, 'no text, nothing to spoil');
  assert.throws(() => reviews.save(anna.id, 'movie:1', { text: 'x'.repeat(reviews.MAX_TEXT + 1) }), { status: 400 });
  assert.throws(() => reviews.save(anna.id, 'movie:1', { stars: 6 }), { status: 400 });
  assert.throws(() => reviews.save(anna.id, 'movie:1', { stars: 2.5 }), { status: 400 });
  assert.throws(() => reviews.save(anna.id, 'season:1', { stars: 4 }), { status: 400 });
  reviews.resetLimits();
  const now = Date.now();
  for (let i = 0; i < 20; i++) reviews.save(anna.id, 'movie:2', { stars: 1 + (i % 5) }, now + i);
  assert.throws(() => reviews.save(anna.id, 'movie:2', { stars: 3 }, now + 30), { status: 429 });
  reviews.save(anna.id, 'movie:2', { stars: 3 }, now + 11 * 60000); // the window moved on
});

test('reviews: what people see, restricted people and the owner', () => {
  const { anna, ben, cleo, nameOf, viewer } = setup();
  const t = Date.now();
  reviews.save(anna.id, 'movie:603', { stars: 5, text: 'A classic.' }, t);
  reviews.save(ben.id, 'movie:603', { stars: 2 }, t + 1); // stars only: counted, not listed
  reviews.save(cleo.id, 'movie:603', { stars: 4, text: 'Spoiler: he is the one.', spoiler: true }, t + 2);

  const forBen = reviews.forTitle(viewer(ben), 'movie:603', { nameOf });
  assert.equal(forBen.ratings, 3);
  assert.equal(forBen.average, 3.7);
  assert.equal(forBen.count, 2);
  assert.deepEqual(forBen.reviews.map((r) => r.name), ['Cleo', 'Anna'], 'newest first');
  assert.equal(forBen.reviews[0].spoiler, true);
  assert.equal(forBen.reviews[0].canRemove, false);
  assert.deepEqual(forBen.mine && [forBen.mine.stars, forBen.mine.text], [2, '']);

  // Your own first, then friends'.
  assert.deepEqual(reviews.forTitle(viewer(anna), 'movie:603', { nameOf }).reviews.map((r) => r.name), ['Anna', 'Cleo']);
  const withFriend = reviews.forTitle(viewer(ben), 'movie:603', { nameOf, friends: new Set([anna.id]) });
  assert.deepEqual(withFriend.reviews.map((r) => [r.name, r.friend]), [['Anna', true], ['Cleo', false]]);

  // Cleo is restricted: everyone else stops seeing her review and stars, and she sees nothing.
  const hidden = (id) => id === cleo.id;
  const forAnna = reviews.forTitle(viewer(anna), 'movie:603', { nameOf, hidden });
  assert.deepEqual(forAnna.reviews.map((r) => r.name), ['Anna']);
  assert.equal(forAnna.ratings, 2);
  assert.equal(forAnna.average, 3.5);
  const forCleo = reviews.forTitle(viewer(cleo, { restricted: true }), 'movie:603', { nameOf, hidden });
  assert.equal(forCleo.restricted, true);
  assert.deepEqual(forCleo.reviews, []);
  assert.equal(forCleo.canWrite, false);

  // One person's stars are no average; the preview is two reviews, `all` gives the rest.
  reviews.save(anna.id, 'tv:5', { stars: 4, text: 'One' }, t);
  assert.equal(reviews.forTitle(viewer(ben), 'tv:5', { nameOf }).average, null);
  reviews.save(ben.id, 'tv:5', { text: 'Two' }, t + 1);
  reviews.save(cleo.id, 'tv:5', { text: 'Three' }, t + 2);
  assert.equal(reviews.forTitle(viewer(ben), 'tv:5', { nameOf }).reviews.length, 2);
  assert.equal(reviews.forTitle(viewer(ben), 'tv:5', { nameOf, all: true }).reviews.length, 3);

  // Removing: your own, or anyone's as the owner.
  assert.throws(() => reviews.remove(viewer(ben), 'tv:5', anna.id), { status: 403 });
  assert.equal(reviews.remove(viewer(ben, { isOwner: true }), 'tv:5', anna.id), true);
  assert.equal(reviews.remove(viewer(cleo), 'tv:5'), true);
  assert.deepEqual(reviews.forTitle(viewer(ben), 'tv:5', { nameOf }).reviews.map((r) => r.name), ['Ben']);
  assert.equal(topicFor('/api/reviews').topic, 'reviews');
  assert.equal(topicFor('/api/reviews/delete').topic, 'reviews');
});
