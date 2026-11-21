import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createTvProfiles, hashKey, HOME_TV } from '../src/tv-profiles.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

test('a TV gets a device key once and its profiles once', () => {
  const db = new DatabaseSync(':memory:');
  const tv = createTvProfiles(db);
  const first = tv.inbox(null, {});
  assert.match(first.device, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tv.inbox(first.device, {}).device, null);
  db.prepare('INSERT INTO tv_profile_drops (device, token, user_id, created_at) VALUES (?, ?, ?, ?)').run(hashKey(first.device), 'tok', 1, Date.now());
  assert.deepEqual(tv.inbox(first.device, {}).drops, [{ token: 'tok', userId: 1 }]);
  assert.deepEqual(tv.inbox(first.device, {}).drops, []);
});

test('home-tv drops go only to a TV at home on the shared account', () => {
  const db = new DatabaseSync(':memory:');
  const tv = createTvProfiles(db);
  db.prepare('INSERT INTO tv_profile_drops (device, token, user_id, created_at) VALUES (?, ?, ?, ?)').run(HOME_TV, 'h', 8, Date.now());
  assert.deepEqual(tv.inbox(null, { home: false }).drops, []);
  assert.deepEqual(tv.inbox(null, { home: true }).drops, [{ token: 'h', userId: 8 }]);
  assert.deepEqual(tv.inbox(null, { home: true }).drops, []);
});
