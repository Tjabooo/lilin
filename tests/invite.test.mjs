import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import { WatchRooms } from '../src/watch.js';
import { inviteAccess } from '../public/invite.js';
import { ROUTES, allowedRoute } from '../public/routes.js';

// The roles of the revamp: owner, member with email (with and without Can invite), restricted, the home network's
// shared account (no email).
const ROLES = {
  owner: [{ id: 1, email: 'o@x.test', isOwner: true, canInvite: true }, { admin: true }],
  member: [{ id: 2, email: 'm@x.test' }, {}],
  memberInv: [{ id: 3, email: 'i@x.test', canInvite: true }, {}],
  restricted: [{ id: 4, email: 'r@x.test', restricted: true, canInvite: true }, {}],
  home: [{ id: 5, email: null, canInvite: true }, {}],
};
const access = (kind, role, extra = {}) => inviteAccess(kind, ROLES[role][0], { admin: Boolean(ROLES[role][1].admin), ...extra });

test('Invite sheet: who gets which context, and who gets people or only the link', () => {
  // Invite someone to Lilin: the owner and members the owner lets invite; never restricted people or the home account
  assert.equal(access('lilin', 'owner').ok, true);
  assert.equal(access('lilin', 'memberInv').ok, true);
  for (const role of ['member', 'restricted', 'home']) assert.equal(access('lilin', role).ok, false, role);
  // Add a friend: people with email who aren't restricted
  for (const role of ['owner', 'member', 'memberInv']) assert.deepEqual(access('friend', role), { ok: true, people: true }, role);
  for (const role of ['restricted', 'home']) assert.equal(access('friend', role).ok, false, role);
  // Rooms: everyone gets the link; restricted people get nothing else; a channel has no Ask people at all
  for (const role of Object.keys(ROLES)) assert.equal(access('room', role).ok, true, role);
  assert.equal(access('room', 'restricted').people, false);
  assert.equal(access('room', 'home').people, true);
  assert.equal(access('room', 'owner', { live: true }).ok, false);
  // Pick together: people only when the server says so, and never for restricted people
  assert.equal(access('pick', 'member', { canInvite: true }).people, true);
  assert.equal(access('pick', 'member', { canInvite: false }).people, false);
  assert.equal(access('pick', 'restricted', { canInvite: true }).people, false);
  // Moments: friends to send to for social accounts, the link for everyone
  assert.equal(access('moment', 'member').people, true);
  for (const role of ['restricted', 'home']) assert.deepEqual(access('moment', role), { ok: true, people: false }, role);
  // Nobody signed in: nothing
  assert.equal(inviteAccess('room', null).ok, false);
});

test('You → Invite someone to Lilin follows the same rule as the sheet', () => {
  for (const [role, [me, status]] of Object.entries(ROLES)) {
    assert.equal(allowedRoute('you/invite', me, status), access('lilin', role).ok, role);
  }
  assert.equal(ROUTES['you/invite'].label, 'Invite someone to Lilin');
});

test('planned parties carry the host’s account id, so the host’s face opens a profile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-party-host-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  const anna = accounts.userFor({ headers: { 'cf-access-authenticated-user-email': 'anna@example.test' } });
  const rooms = new WatchRooms({ avatarOf: () => null });
  const planned = rooms.plan(anna, { kind: 'lib', id: 'movie', mediaKey: 'movie', title: 'Movie' }, Date.now() + 3600000);
  const party = rooms.parties(anna).find((p) => p.token === planned.token);
  assert.equal(party.hostId, anna.id);
  assert.equal(party.mine, true);
});

test('Live: the guide’s faces are buttons that open profiles, and only owners get the channel editor chip', () => {
  const live = fs.readFileSync(new URL('../public/live.js', import.meta.url), 'utf8');
  assert.match(live, /people\.faces\(watching, \{ size: 18, max: 3, open: true \}\)/);
  assert.match(live, /const tools = me\(\)\?\.isOwner \?/);
  const people = fs.readFileSync(new URL('../public/people.js', import.meta.url), 'utf8');
  assert.match(people, /if \(!p\.id \|\| !openProfile\) return face\(p, opts\);/, 'a face without an account id stays a plain face');
});
