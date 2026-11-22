import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import { findStale, groupOf, sweep } from '../src/cleanup.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 22, 12);
const keys = (list) => list.map((v) => v.key).sort();

test('episodes group by show, films stay on their own', () => {
  assert.equal(groupOf('tv/atlanta (2016) season 1/atlanta (2016) - s01e01 - the big bang'), 'show:atlanta');
  assert.equal(groupOf('tv/atlanta (2016) season 2/atlanta.s02e04.1080p.web'), 'show:atlanta');
  assert.equal(groupOf('south park season 25/s25e01'), 'show:southpark', 'the folder names a show the file does not');
  assert.equal(groupOf('movies/dune.part.two.2024.1080p'), 'movies/dune.part.two.2024.1080p');
});

test('a download goes once it is over a month old and nobody watched it in 30 days', () => {
  const videos = [
    { key: 'old-unwatched', addedAt: NOW - 40 * DAY },
    { key: 'old-watched', addedAt: NOW - 40 * DAY },
    { key: 'old-watched-long-ago', addedAt: NOW - 90 * DAY },
    { key: 'new-unwatched', addedAt: NOW - 10 * DAY },
    { key: 'hand-copied', addedAt: NOW - 400 * DAY, existing: true },
  ];
  const watched = new Map([['old-watched', NOW - 3 * DAY], ['old-watched-long-ago', NOW - 45 * DAY]]);
  const stale = findStale(videos, watched, { now: NOW });
  assert.deepEqual(keys(stale), ['old-unwatched', 'old-watched-long-ago']);
  assert.equal(stale[0].key, 'old-watched-long-ago', 'oldest first');
  assert.equal(stale.find((v) => v.key === 'old-unwatched').lastWatched, 0);
});

test('a show stays while anyone watches any of it, even episodes already gone', () => {
  const ep = (n) => `tv/the bear season 1/the.bear.s01e0${n}`;
  const videos = [1, 2, 3].map((n) => ({ key: ep(n), addedAt: NOW - 60 * DAY }));
  const other = { key: 'tv/fargo season 1/fargo.s01e01', addedAt: NOW - 60 * DAY };
  assert.deepEqual(keys(findStale([...videos, other], new Map([[ep(1), NOW - DAY]]), { now: NOW })), [other.key]);
  // e04 was deleted earlier, but watching it yesterday still counts for the show
  assert.deepEqual(findStale(videos, new Map([[ep(4), NOW - DAY]]), { now: NOW }), []);
  assert.equal(findStale(videos, new Map([[ep(1), NOW - 31 * DAY]]), { now: NOW }).length, 3);
});

test('the sweep reads the database, takes stale videos out of every library and queues the files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-cleanup-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: ['owner@example.test'], mediaDir: null });
  const owner = accounts.userFor({ headers: { 'cf-access-authenticated-user-email': 'owner@example.test' } });
  const dad = accounts.userFor({ headers: { 'cf-access-authenticated-user-email': 'dad@example.test' } });
  accounts.addEntry(owner.id, 'films/old', 'download');
  accounts.addEntry(dad.id, 'films/old', 'added');
  accounts.addEntry(owner.id, 'films/seen', 'download');
  accounts.addEntry(owner.id, 'films/fresh', 'download');
  accounts.addEntry(owner.id, 'films/by-hand', 'existing');
  const db = accounts.database();
  db.prepare("UPDATE library SET added_at = ? WHERE media_key != 'films/fresh'").run(Date.now() - 45 * DAY);
  db.prepare("UPDATE media SET first_seen = ? WHERE key != 'films/fresh'").run(Date.now() - 45 * DAY);
  db.prepare("INSERT OR REPLACE INTO progress (user_id, ref, position, duration, updated_at) VALUES (?, 'm:films/seen', 100, 6000, ?)").run(dad.id, Date.now() - 2 * DAY);

  assert.deepEqual(keys(sweep(accounts)), ['films/old'], 'a dry run only reports');
  assert.ok(accounts.hasEntry(dad.id, 'films/old'));
  assert.deepEqual(keys(sweep(accounts, { run: true })), ['films/old']);
  assert.equal(accounts.hasEntry(owner.id, 'films/old') || accounts.hasEntry(dad.id, 'films/old'), false);
  assert.deepEqual(accounts.pendingDeletes(), ['films/old']);
  assert.ok(accounts.hasEntry(owner.id, 'films/by-hand') && accounts.hasEntry(owner.id, 'films/seen') && accounts.hasEntry(owner.id, 'films/fresh'));
});
