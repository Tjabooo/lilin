// Comments on profiles (src/profile-comments.js): who can delete, the length limit, newest first, paging, the burst limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as friends from '../src/friends.js';
import * as profiles from '../src/profiles.js';
import * as comments from '../src/profile-comments.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-comments-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  friends.initFriends();
  profiles.initProfiles();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  return { anna: make('anna@example.test', 'Anna'), ben: make('ben@example.test', 'Ben'), cleo: make('cleo@example.test', 'Cleo') };
}

test('Comments is a profile section, on by default and last for old profiles', () => {
  assert.ok(profiles.SECTIONS.includes('comments'));
  const s = profiles.cleanSections([{ id: 'favorites', on: true }]);
  assert.deepEqual(s.at(-1), { id: 'comments', on: true });
});

test('comments list newest first, with author and who may delete', () => {
  const { anna, ben, cleo } = setup();
  comments.add(ben, anna.id, 'first', 1000);
  comments.add(cleo, anna.id, '  second\r\n\n\n\nline  ', 2000);
  const asAnna = comments.list(anna, anna.id);
  assert.equal(asAnna.total, 2);
  assert.deepEqual(asAnna.comments.map((c) => c.text), ['second\n\nline', 'first']);
  assert.equal(asAnna.comments[0].author.name, 'Cleo');
  assert.ok(asAnna.comments.every((c) => c.canDelete)); // her own page
  const asBen = comments.list(ben, anna.id);
  assert.deepEqual(asBen.comments.map((c) => c.canDelete), [false, true]); // only his own
});

test('delete: author and profile owner yes, others no', () => {
  const { anna, ben, cleo } = setup();
  const a = comments.add(ben, anna.id, 'hi', 1000);
  const b = comments.add(ben, anna.id, 'again', 2000);
  assert.throws(() => comments.remove(cleo, a.id), { status: 403 });
  assert.equal(comments.remove(anna, a.id), anna.id);
  assert.equal(comments.remove(ben, b.id), anna.id);
  assert.throws(() => comments.remove(ben, b.id), { status: 404 });
  assert.equal(comments.list(anna, anna.id).total, 0);
});

test('empty and too long comments are refused; a burst is limited', () => {
  const { anna, ben } = setup();
  assert.throws(() => comments.add(ben, anna.id, '   \n '), { status: 400 });
  assert.throws(() => comments.add(ben, anna.id, 'x'.repeat(comments.MAX_COMMENT + 1)), { status: 400 });
  for (let i = 0; i < 5; i++) comments.add(ben, anna.id, `n${i}`, 500_000 + i);
  assert.throws(() => comments.add(ben, anna.id, 'one too many', 500_010), { status: 429 });
  assert.ok(comments.add(ben, anna.id, 'a minute later', 561_000));
});

test('paging: 20 at a time', () => {
  const { anna, cleo } = setup();
  for (let i = 0; i < 23; i++) comments.add(cleo, anna.id, `c${i}`, 1_000_000 + i * 61_000);
  const first = comments.list(anna, anna.id);
  assert.equal(first.comments.length, 20);
  assert.equal(first.more, true);
  const rest = comments.list(anna, anna.id, { offset: 20 });
  assert.deepEqual(rest.comments.map((c) => c.text), ['c2', 'c1', 'c0']);
  assert.equal(rest.more, false);
});
