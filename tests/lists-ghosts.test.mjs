import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as social from '../src/social.js';
import * as profiles from '../src/profiles.js';
import * as lists from '../src/lists.js';
import * as ghosts from '../src/ghosts.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-lists-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  social.initSocial?.();
  profiles.initProfiles();
  lists.initLists();
  ghosts.initGhosts();
  ghosts._reset();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  return { anna: make('anna@example.test', 'Anna'), ben: make('ben@example.test', 'Ben') };
}
const cards = { 'movie:603': { title: 'The Matrix', year: 1999, poster: 'https://image.tmdb.org/t/p/w342/abc.jpg' }, 'movie:550': { title: 'Fight Club', year: 1999 }, 'tv:1399': { title: 'Game of Thrones' } };
const resolve = async (k) => cards[k] || null;

test('lists: make, fill, reorder, keep private, delete', async () => {
  const { anna, ben } = setup();
  const l = await lists.create(anna.id, { name: '  films that   ruined my sleep ', keys: ['movie:603', 'movie:550'] }, { resolve });
  assert.equal(l.name, 'films that ruined my sleep');
  assert.deepEqual(l.items.map((i) => i.key), ['movie:603', 'movie:550']);
  assert.equal(l.preview[0].poster, cards['movie:603'].poster);
  await lists.add(anna.id, l.id, 'tv:1399', { resolve });
  await lists.add(anna.id, l.id, 'movie:603', { resolve }); // already there: stays put
  const r = lists.update(anna.id, l.id, { order: ['tv:1399'], ranked: true });
  assert.deepEqual(r.items.map((i) => i.key), ['tv:1399', 'movie:603', 'movie:550']);
  assert.equal(r.ranked, true);
  await assert.rejects(lists.add(ben.id, l.id, 'movie:550', { resolve }), /maker/);
  assert.throws(() => lists.update(anna.id, l.id, { name: '' }), /name/);

  // Others see it when they can see Anna's profile, never when it's private.
  assert.equal(lists.get(l.id, ben.id, () => true).mine, false);
  assert.throws(() => lists.get(l.id, ben.id, () => false), /private or gone/);
  lists.update(anna.id, l.id, { private: true });
  assert.throws(() => lists.get(l.id, ben.id, () => true), /private or gone/);
  assert.equal(lists.listsOf(anna.id).length, 0);
  assert.equal(lists.listsOf(anna.id, { self: true, key: 'movie:550' })[0].has, true);

  lists.removeItem(anna.id, l.id, 'movie:550');
  assert.equal(lists.get(l.id, anna.id, () => true).count, 2);
  lists.remove(anna.id, l.id);
  assert.throws(() => lists.get(l.id, anna.id, () => true), /gone/);
});

test('lists: a profile saved before lists gets the section in its place', () => {
  const s = profiles.cleanSections(['favorites', 'recent', 'stats', 'ratings', 'reviews', 'liked', 'friends']);
  assert.deepEqual(s.map((x) => x.id), ['favorites', 'recent', 'stats', 'ratings', 'reviews', 'lists', 'liked', 'friends']);
});

test('ghosts: per film or episode, own + friends only, no doubles, limits', () => {
  const { anna, ben } = setup();
  const film = { key: 'movie:603' };
  const a = ghosts.add(anna.id, { ...film, at: 2472.04, emoji: '💀' }, 1000);
  assert.equal(a.at, 2472);
  assert.equal(ghosts.add(anna.id, { ...film, at: 2473, emoji: '💀' }, 1100).id, a.id, 'same emoji a second later = same one');
  ghosts.add(anna.id, { key: 'tv:1399', season: 1, episode: 9, at: 300, emoji: '😭' }, 1200);
  assert.throws(() => ghosts.add(anna.id, { key: 'tv:1399', at: 1, emoji: '😭' }), /episode/);
  assert.throws(() => ghosts.add(anna.id, { ...film, at: 1, emoji: 'hi' }), /reactions/);

  assert.equal(ghosts.forVideo(ben.id, film).reactions.length, 0, 'not friends: nothing');
  const seen = ghosts.forVideo(ben.id, film, { friends: new Set([anna.id]), nameOf: () => 'Anna' }).reactions;
  assert.deepEqual(seen.map((r) => [r.name, r.emoji, r.at, r.mine]), [['Anna', '💀', 2472, false]]);
  assert.equal(ghosts.forVideo(ben.id, film, { friends: new Set([anna.id]), hidden: () => true }).reactions.length, 0, 'restricted: hidden');
  assert.equal(ghosts.forVideo(ben.id, { key: 'tv:1399', season: 1, episode: 9 }, { friends: new Set([anna.id]) }).reactions.length, 1);
  assert.equal(ghosts.forVideo(ben.id, { key: 'tv:1399', season: 1, episode: 8 }, { friends: new Set([anna.id]) }).reactions.length, 0);

  assert.throws(() => ghosts.remove(ben.id, a.id), /gone/);
  ghosts.remove(anna.id, a.id);
  assert.equal(ghosts.forVideo(anna.id, film).reactions.length, 0);
  for (let i = 0; i < 28; i++) ghosts.add(anna.id, { ...film, at: i * 10, emoji: '🔥' }, 5000);
  assert.throws(() => ghosts.add(anna.id, { ...film, at: 999, emoji: '🔥' }, 5000), /Easy/);
});

test('lists: shared() gives the link card data, never for private lists', async () => {
  const { anna } = setup();
  const l = await lists.create(anna.id, { name: 'cosy', keys: ['movie:603', 'movie:550'] }, { resolve });
  const s = lists.shared(l.id);
  assert.equal(s.name, 'cosy');
  assert.equal(s.count, 2);
  assert.deepEqual(s.posters, [cards['movie:603'].poster]);
  lists.update(anna.id, l.id, { private: true });
  assert.equal(lists.shared(l.id), null);
  assert.equal(lists.shared('nope'), null);
});
