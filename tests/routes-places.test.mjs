import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sv from '../public/i18n-sv.js';
import { ROUTES, LEGACY, LINK_PARAMS, TABS, allowedRoute, tabsFor, pagesOf, resolve, linkRoute, startRoute } from '../public/routes.js';
import { PLACES, ACTIONS, placeLabel, placeShown, matchPlaces, defaultPlaces } from '../public/places.js';

// Who uses Lilin: the home network's shared account, members with and without switches, restricted people and owners.
const ROLES = {
  home: { me: { id: 1, email: null, name: 'Home network', canDownload: true }, status: { downloads: true } },
  member: { me: { id: 2, email: 'm@x.test', canDownload: false }, status: { downloads: true } },
  memberDl: { me: { id: 3, email: 'd@x.test', canDownload: true }, status: { downloads: true, torrents: true } },
  memberAct: { me: { id: 4, email: 'a@x.test', canSeeActivity: true }, status: {} },
  memberInv: { me: { id: 5, email: 'i@x.test', canInvite: true }, status: {} },
  restricted: { me: { id: 6, email: 'r@x.test', restricted: true }, status: {} },
  owner: { me: { id: 7, email: 'o@x.test', isOwner: true, canDownload: true, canInvite: true, canSeeActivity: true }, status: { admin: true, downloads: true, whatsNew: {} } },
  ownerNotes: { me: { id: 8, email: 'n@x.test', isOwner: true, canDownload: true, canInvite: true, canSeeActivity: true }, status: { admin: true, notes: true, clips: true, downloads: true, torrents: true, whatsNew: {} } },
};
const each = (fn) => Object.entries(ROLES).forEach(([name, { me, status }]) => fn(name, me, status));
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every route has a place in Go to, so it can be found by name', () => {
  const placed = new Set(PLACES.map((p) => p.route).filter(Boolean));
  const missing = Object.keys(ROUTES).filter((id) => ROUTES[id].searchable !== false && !placed.has(id));
  assert.deepEqual(missing, []);
});

test('every place points at a known route or action, and ids are unique', () => {
  const ids = new Set();
  for (const p of PLACES) {
    assert.ok(!ids.has(p.id), `duplicate place ${p.id}`); ids.add(p.id);
    assert.ok(Boolean(p.route) !== Boolean(p.action), `${p.id}: a route or an action`);
    if (p.route) assert.ok(ROUTES[p.route], `${p.id} → unknown route ${p.route}`);
    if (p.action) assert.ok(ACTIONS.includes(p.action), `${p.id} → unknown action ${p.action}`);
  }
});

test('app.js handles every Go to action and draws every view a route names', () => {
  const app = read('public/app.js');
  const block = app.slice(app.indexOf('const PLACE_ACTIONS = {'), app.indexOf('};', app.indexOf('const PLACE_ACTIONS = {')));
  for (const a of ACTIONS) assert.match(block, new RegExp(`'${a}':`), `PLACE_ACTIONS has no '${a}'`);
  const index = read('public/index.html');
  for (const { view } of Object.values(ROUTES)) {
    assert.ok(index.includes(`id="view-${view}"`) || app.includes(`'${view}'`), `no view for ${view}`);
  }
});

test('labels and words have Swedish', () => {
  const missing = [];
  for (const r of Object.values(ROUTES)) if (!(r.label in sv)) missing.push(r.label);
  for (const p of PLACES) {
    if (!(placeLabel(p) in sv)) missing.push(placeLabel(p));
    assert.ok(p.syn?.sv?.length > 0, `${p.id} has no Swedish words`);
    assert.ok(p.syn?.en?.length > 0, `${p.id} has no English words`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('no role gets more than 5 tabs; owners get House, nobody else does', () => {
  each((name, me, status) => {
    const tabs = tabsFor(me, status);
    assert.ok(tabs.length <= 5, `${name}: ${tabs.join(',')}`);
    assert.deepEqual(tabs.filter((t) => t !== 'house'), ['discover', 'live', 'library', 'you'], name);
    assert.equal(tabs.includes('house'), Boolean(status.admin), name);
  });
  for (const t of TABS) assert.equal(ROUTES[t].tab, t);
});

test('a place is only offered to people who may open it', () => {
  each((name, me, status) => {
    for (const p of PLACES) if (p.route && !allowedRoute(p.route, me, status)) assert.equal(placeShown(p, me, status), false, `${name}: ${p.id}`);
  });
  // owner tools stay with owners
  for (const role of ['home', 'member', 'memberAct', 'memberInv', 'restricted']) {
    const { me, status } = ROLES[role];
    assert.deepEqual(pagesOf('house', me, status), [], role);
    for (const p of PLACES) if (p.route?.startsWith('house')) assert.equal(placeShown(p, me, status), false, `${role}: ${p.id}`);
  }
});

test('You pages per role keep today’s rules', () => {
  const pages = (role) => pagesOf('you', ROLES[role].me, ROLES[role].status).map((id) => ROUTES[id].sub);
  const watching = ['history', 'ratings', 'liked'];
  assert.deepEqual(pages('home'), [...watching, 'moments', 'account', 'look', 'watching', 'devices', 'download-settings', 'ideas']);
  assert.deepEqual(pages('member'), [...watching, 'friends', 'moments', 'account', 'look', 'watching', 'devices', 'ideas']);
  assert.deepEqual(pages('memberAct'), [...watching, 'friends', 'moments', 'activity', 'account', 'look', 'watching', 'devices', 'ideas']);
  assert.deepEqual(pages('memberInv'), [...watching, 'friends', 'moments', 'invite', 'account', 'look', 'watching', 'devices', 'ideas']);
  assert.deepEqual(pages('restricted'), ['history', 'liked', 'moments', 'account', 'look', 'watching', 'devices', 'ideas']);
  assert.deepEqual(pages('owner'), [...watching, 'friends', 'moments', 'activity', 'account', 'look', 'watching', 'devices', 'download-settings']);
  assert.deepEqual(pagesOf('house', ROLES.owner.me, ROLES.owner.status).map((id) => ROUTES[id].sub), ['machines', 'people', 'ideas', 'rules', 'screen-time']);
  assert.deepEqual(pagesOf('house', ROLES.ownerNotes.me, ROLES.ownerNotes.status).map((id) => ROUTES[id].sub), ['machines', 'notes', 'clips', 'people', 'ideas', 'rules', 'screen-time']);
});

test('old addresses and notification links land on their new homes, or the start view when not allowed', () => {
  const { owner, ownerNotes, member, memberAct, home, restricted } = ROLES;
  assert.equal(resolve('#settings', member.me, member.status), 'you');
  assert.equal(resolve('#library', member.me, member.status), 'library');
  assert.equal(resolve('#downloads', member.me, member.status), 'library/downloads');
  assert.equal(resolve('#activity', memberAct.me, memberAct.status), 'you/activity');
  assert.equal(resolve('#activity', member.me, member.status), null);
  assert.equal(resolve('#notes', ownerNotes.me, ownerNotes.status), 'house/notes');
  assert.equal(resolve('#notes', owner.me, owner.status), null, 'Notes needs the notes switch');
  assert.equal(resolve('#clips', ownerNotes.me, ownerNotes.status), 'house/clips');
  assert.equal(resolve('#house', owner.me, owner.status), 'house');
  assert.equal(resolve('#house', member.me, member.status), null);
  assert.equal(resolve('#you/friends', restricted.me, restricted.status), null);
  assert.equal(resolve('#you/watching/', home.me, home.status), 'you/watching');
  assert.equal(resolve('#@ebicat', member.me, member.status), null);
  assert.equal(resolve('#%E0%A4%A', member.me, member.status), null, 'a broken address is ignored');
  assert.equal(resolve('#nonsense', member.me, member.status), null);
  // every old address resolves to something its role may open, or to nothing
  each((name, me, status) => { for (const old of Object.keys(LEGACY)) { const r = resolve(old, me, status); if (r) assert.ok(allowedRoute(r, me, status), `${name}: ${old}`); } });
  const q = (s) => new URLSearchParams(s);
  assert.equal(linkRoute(q('friends=1'), member.me, member.status), 'you/friends');
  assert.equal(linkRoute(q('ideas=1'), member.me, member.status), 'you/ideas');
  assert.equal(linkRoute(q('ideas=1'), owner.me, owner.status), 'house/ideas');
  assert.equal(linkRoute(q('moment=abc'), home.me, home.status), 'you/moments', 'the shared home account has its own moments');
  assert.equal(linkRoute(q('travel=1'), home.me, home.status), 'library/downloads');
  assert.equal(linkRoute(q('watch=x'), member.me, member.status), null);
  for (const key of Object.keys(LINK_PARAMS)) each((name, me, status) => { const r = linkRoute(q(`${key}=1`), me, status); if (r) assert.ok(allowedRoute(r, me, status)); });
  // start views: the saved choice, or Discover when it isn't allowed any more
  assert.equal(startRoute('live', member.me, member.status), 'live');
  assert.equal(startRoute('you', member.me, member.status), 'you');
  assert.equal(startRoute('downloads', member.me, member.status), 'library/downloads');
  assert.equal(startRoute(undefined, member.me, member.status), 'discover');
  assert.equal(startRoute('house', member.me, member.status), 'discover');
});

test('Go to finds places by name and by the words people type, in both languages', () => {
  const { member, owner, home } = ROLES;
  const ids = (q, role = member, lang = 'en', T) => matchPlaces(q, { me: role.me, status: role.status, lang, T }).map((p) => p.id);
  assert.equal(ids('subtitles')[0], 'watching');
  assert.equal(ids('sign out')[0], 'account');
  assert.equal(ids('undertexter', member, 'sv', (s) => sv[s] || s)[0], 'watching');
  assert.equal(ids('logga ut', member, 'sv', (s) => sv[s] || s)[0], 'account');
  assert.equal(ids('Inställningar', member, 'sv', (s) => sv[s] || s)[0], 'you', 'accents and case don’t matter');
  assert.ok(ids('people', owner).includes('people'));
  assert.ok(!ids('people', member).includes('people'), 'owner tools never show for members');
  assert.ok(!ids('friends', home).includes('friends'), 'the shared account has no friends');
  assert.deepEqual(ids(''), []);
  assert.ok(defaultPlaces(member.me, member.status).length > 0);
  assert.ok(defaultPlaces(owner.me, owner.status).every((p) => placeShown(p, owner.me, owner.status)));
});
