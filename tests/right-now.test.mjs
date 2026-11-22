import test from 'node:test';
import assert from 'node:assert/strict';
import { rightNowRows, KINDS } from '../public/right-now.js';
import { libraryUnion } from '../public/library-downloads.js';
import { ROUTES, resolve, linkRoute, startRoute } from '../public/routes.js';

const NOW = Date.UTC(2026, 10, 17, 12);
const H = 3600000;
const film = (id, extra = {}) => ({ id, mediaKey: `k-${id}`, title: `Film ${id}`, tmdbId: Number(id.replace(/\D/g, '')) || 1, addedAt: NOW - 72 * H, ...extra });
const dl = (hash, extra = {}) => ({ hash, name: 'release', canonicalTitle: `Download ${hash}`, mediaType: 'movie', tmdbId: 900 + hash.length, progress: 0.4, size: 100, mine: true, done: false, state: 'downloading', ...extra });
const ctx = (extra = {}) => ({ now: NOW, owner: true, entries: [], parties: [], travel: [], hidden: {}, played: () => false, ...extra });

test('nothing time-bound: no rows, so the strip stays absent', () => {
  assert.deepEqual(rightNowRows(ctx({ entries: libraryUnion([film('f1')]) })), []);
});

test('rows come in priority order and at most three show', () => {
  const entries = libraryUnion([film('f1'), film('f2', { addedAt: NOW - H })], [], [dl('a'), dl('bb', { state: 'error' })]);
  const rows = rightNowRows(ctx({ entries, parties: [{ token: 't', startsAt: NOW + 2 * H, title: 'The Odyssey', mine: true }], wrapped: { year: 2026 } }));
  assert.deepEqual(rows.map((r) => r.kind), ['party', 'attention', 'ready']);
  const all = rightNowRows(ctx({ entries, parties: [{ token: 't', startsAt: NOW + 2 * H, title: 'The Odyssey' }], wrapped: { year: 2026 } }), 10);
  assert.deepEqual(all.map((r) => r.kind), ['party', 'attention', 'ready', 'wrapped', 'onway']);
  for (const r of all) assert.ok(KINDS.includes(r.kind));
});

test('a party shows from 12 hours before it starts, and while it runs', () => {
  const later = { token: 'late', startsAt: NOW + 13 * H, title: 'Later' }, soon = { token: 'soon', startsAt: NOW + 3 * H, title: 'Soon' };
  assert.deepEqual(rightNowRows(ctx({ parties: [later] })), []);
  const [row] = rightNowRows(ctx({ parties: [later, soon] }));
  assert.equal(row.id, 'party:soon'); assert.equal(row.chip.act.do, 'join'); assert.equal(row.open.to, 'live');
  assert.equal(rightNowRows(ctx({ parties: [{ token: 'on', startsAt: NOW - H, started: true, title: 'On' }] }))[0].chip.act.token, 'on');
});

test('ready: arrived in the last day and not played yet; one ✕ hides it on this device', () => {
  const fresh = libraryUnion([film('f1', { addedAt: NOW - 2 * H })]);
  const [row] = rightNowRows(ctx({ entries: fresh }));
  assert.equal(row.kind, 'ready'); assert.equal(row.dismiss, true); assert.equal(row.chip.act.do, 'play');
  assert.deepEqual(rightNowRows(ctx({ entries: fresh, played: () => true })), []);
  assert.deepEqual(rightNowRows(ctx({ entries: fresh, hidden: { [row.id]: NOW } })), []);
  assert.deepEqual(rightNowRows(ctx({ entries: libraryUnion([film('f1', { addedAt: NOW - 30 * H })]) })), []);
});

test('only ready, Wrapped and phone rows can be dismissed; the rest resolve themselves', () => {
  const entries = libraryUnion([film('f1')], [], [dl('a'), dl('bb', { state: 'error' })]);
  const rows = rightNowRows(ctx({ entries, wrapped: { year: 2026 }, touch: true, travel: [{ id: 'x', quality: 'small', state: 'ready', url: '/t/x', title: 'X' }] }), 10);
  assert.deepEqual(rows.filter((r) => r.dismiss).map((r) => r.kind), ['wrapped', 'phone']);
});

test('phone copies only on touch devices; downloads already fetched are left out', () => {
  const travel = [{ id: 'x', quality: 'small', state: 'ready', url: '/t/x', title: 'X' }, { id: 'y', quality: 'small', state: 'ready', url: '/t/y', title: 'Y', downloadedAt: NOW }];
  assert.deepEqual(rightNowRows(ctx({ travel })), []);
  const [row] = rightNowRows(ctx({ travel, touch: true }));
  assert.equal(row.kind, 'phone'); assert.match(row.title, /^1 copy/); assert.equal(row.chip.act.do, 'travel');
});

test('downloads (owners): attention links to House › Downloads; the rest is one On the way row with its percent', () => {
  const rows = rightNowRows(ctx({ entries: libraryUnion([], [], [dl('a', { progress: 0.64 }), dl('bb', { state: 'missingFiles' })]) }));
  assert.equal(rows[0].kind, 'attention'); assert.deepEqual(rows[0].open, { do: 'route', to: 'house/downloads' }); assert.equal(rows[0].alert, true);
  assert.equal(rows[1].kind, 'onway'); assert.match(rows[1].sub, /On its way · 64 %/); assert.equal(rows[1].progress, 0.64);
});

test('members (play first): no downloads, no deletes; their own starts say Getting it ready and Play', () => {
  const entries = libraryUnion([film('f1')], [], [dl('a', { progress: 0.64 }), dl('bb', { state: 'missingFiles' })]);
  const rows = rightNowRows(ctx({ owner: false, entries }), 10);
  assert.ok(!rows.some((r) => r.kind === 'attention'), rows.map((r) => r.kind).join());
  const onway = rows.find((r) => r.kind === 'onway');
  assert.equal(onway.title, 'Getting 2 titles ready'); assert.equal(onway.progress, undefined);
  assert.ok(!JSON.stringify(rows).includes('downloads'), 'no row points at downloads');
  const [one] = rightNowRows(ctx({ owner: false, entries: libraryUnion([], [], [dl('a')]) }));
  assert.equal(one.sub, 'Getting it ready'); assert.equal(one.chip.act.do, 'play'); assert.equal(one.open.do, 'title');
  const ready = libraryUnion([film('f1', { addedAt: NOW - 2 * H }), film('f2', { addedAt: NOW - 3 * H })]);
  assert.deepEqual(rightNowRows(ctx({ owner: false, entries: ready }))[0].open, { do: 'route', to: 'discover/instant' });
});

// The Library tab is gone (play first): its deep links land on Discover's Instant filter, House › Downloads (owners)
// or Discover, for every role, old addresses included.
const ROLES = {
  owner: { me: { id: 1, email: 'o@x.test', isOwner: true }, status: { admin: true, downloads: true } },
  member: { me: { id: 2, email: 'm@x.test' }, status: { downloads: true } },
  restricted: { me: { id: 3, email: 'r@x.test', restricted: true }, status: {} },
  home: { me: { id: 4, email: null }, status: { downloads: true } },
};
test('old Library deep links land on their new homes for every role', () => {
  for (const [name, { me, status }] of Object.entries(ROLES)) {
    const downloads = name === 'owner' ? 'house/downloads' : 'discover';
    for (const [hash, id] of [['#library', 'discover/instant'], ['#library/watchlist', 'discover'], ['#library/downloads', downloads],
      ['#downloads', downloads], ['#watchlist', 'discover'], ['#discover', 'discover']]) {
      assert.equal(resolve(hash, me, status), id, `${name} ${hash}`);
    }
    assert.equal(linkRoute(new URLSearchParams('travel=1'), me, status), downloads, name);
    assert.equal(startRoute('downloads', me, status), downloads, name);
    assert.equal(startRoute('library', me, status), 'discover', name);
    assert.equal(ROUTES.library, undefined);
  }
});
