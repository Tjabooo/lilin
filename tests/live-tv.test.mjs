import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Channels, segmentsOf, placeIn, poolFor, liveToken, FREEZE } from '../src/channels.js';
import { createLiveTv } from '../src/live-tv.js';
import { WatchRooms } from '../src/watch.js';
import { playbackPlan } from '../public/watch-sync.js';

const MIN = 60000;
const ep = (show, season, episode, extra = {}) => ({ key: `${show}-${season}-${episode}`, id: `${show}${season}${episode}`, file: `/m/${show}/${season}/${episode}.mkv`,
  kind: 'episode', show, showTitle: show, title: show, season, episode, genres: [35], anime: false, ...extra });
const film = (name, extra = {}) => ({ key: `f-${name}`, id: `f${name}`, file: `/m/${name}.mkv`, kind: 'film', title: name, genres: [28], ...extra });
const times = { duration: 1320, intro: { start: 60, end: 120 }, creditsAt: 1260 };
const timesOf = async () => times;
const sitcoms = { id: 'sitcoms', order: 'shuffle' };

test('a programme airs everything but the opening titles and the credits', () => {
  assert.deepEqual(segmentsOf(times), [[0, 60], [120, 1260]]);
  assert.deepEqual(segmentsOf({ duration: 1320, intro: { start: 0.5, end: 50 }, creditsAt: null }), [[50, 1320]]);
  assert.deepEqual(segmentsOf({ duration: 5400, intro: null, creditsAt: 100 }), [[0, 5400]], 'credits that early are a mistake');
  assert.equal(segmentsOf({ duration: 10 }), null);
  assert.deepEqual(placeIn([[0, 60], [120, 1260]], 30), { segment: 0, position: 30, pieceEnds: 60 });
  assert.deepEqual(placeIn([[0, 60], [120, 1260]], 61), { segment: 1, position: 121, pieceEnds: 1200 });
});

test('the same seed and clock give the same schedule, and a library change never touches what is on now', async () => {
  const pool = [ep('Office', 1, 1), ep('Office', 1, 2), ep('Office', 1, 3), ep('Parks', 2, 1), ep('Parks', 2, 2)];
  let now = Date.UTC(2026, 10, 15, 20, 0, 0);
  const a = new Channels({ now: () => now }), b = new Channels({ now: () => now });
  await a.extend(sitcoms, pool, now + 3 * 3600000, timesOf);
  await b.extend(sitcoms, [...pool].reverse(), now + 3 * 3600000, timesOf);
  assert.deepEqual(a.plan('sitcoms').entries, b.plan('sitcoms').entries, 'deterministic, whatever order the library comes in');
  const entries = a.plan('sitcoms').entries;
  assert.ok(entries.length >= 9);
  for (let i = 1; i < entries.length; i++) assert.equal(entries[i].s, entries[i - 1].e, 'end to end');
  assert.equal(entries[0].e - entries[0].s, 1200 * 1000);
  now += 30 * MIN; // mid-programme
  const airing = a.at('sitcoms', now).entry;
  const soon = a.plan('sitcoms').entries.filter((e) => e.s <= now + FREEZE);
  await a.extend(sitcoms, [...pool, ep('Office', 1, 4), ep('Office', 1, 5)], now + 3 * 3600000, timesOf);
  assert.deepEqual(a.at('sitcoms', now).entry, airing, 'what is airing stays');
  assert.deepEqual(a.plan('sitcoms').entries.slice(0, soon.length), soon, 'and so does what is about to start');
  await a.extend(sitcoms, pool.slice(0, 2), now + 3 * 3600000, timesOf); // titles deleted
  assert.deepEqual(a.at('sitcoms', now).entry, airing);
  assert.ok(a.plan('sitcoms').entries.filter((e) => e.s > now + FREEZE).every((e) => ['Office-1-1', 'Office-1-2'].includes(e.k)));
});

test('in order plays a show through, and channels pick from the right part of the library', async () => {
  const items = [ep('B', 1, 2), ep('B', 1, 1), ep('A', 1, 1), film('Heat'), film('Planet', { genres: [99] }), ep('Naruto', 1, 1, { anime: true, genres: [16, 35] })];
  let now = Date.UTC(2026, 10, 15, 20, 0, 0);
  const c = new Channels({ now: () => now });
  await c.extend({ id: 'x', order: 'order' }, items.filter((i) => i.kind === 'episode' && !i.anime), now + 2 * 3600000, timesOf);
  const keys = c.plan('x').entries.map((e) => e.k);
  const at = keys.indexOf('A-1-1');
  assert.deepEqual(keys.slice(at, at + 3), ['A-1-1', 'B-1-1', 'B-1-2']);
  // B 1×1 airs and leaves the library: the channel carries on with B 1×2, not somewhere random.
  now = c.plan('x').entries.find((e) => e.k === 'B-1-1').s + 1000;
  await c.extend({ id: 'x', order: 'order' }, items.filter((i) => i.kind === 'episode' && !i.anime && i.key !== 'B-1-1'), now + 2 * 3600000, timesOf);
  const after = c.plan('x').entries.filter((e) => e.s > now);
  assert.equal(c.at('x', now).entry.k, 'B-1-1');
  assert.equal(after[0].k, 'B-1-2');
  assert.deepEqual(poolFor({ id: 'anime' }, items).map((i) => i.key), ['Naruto-1-1']);
  assert.deepEqual(poolFor({ id: 'sitcoms' }, items).map((i) => i.key).sort(), ['A-1-1', 'B-1-1', 'B-1-2']);
  assert.deepEqual(poolFor({ id: 'films' }, items).map((i) => i.key), ['f-Heat']);
  assert.deepEqual(poolFor({ id: 'docs' }, items).map((i) => i.key), ['f-Planet']);
  assert.deepEqual(poolFor({ id: 'c1', shows: ['A'], genres: [99] }, items).map((i) => i.key).sort(), ['A-1-1', 'f-Planet']);
  const picks = poolFor({ id: 'picks-1', picks: 1 }, [...items, film('Liked', { titleKey: 'movie:9' })],
    { picksOf: () => ({ keys: new Set(['f-Heat']), liked: new Set(['movie:9']) }) });
  assert.deepEqual(picks.map((i) => i.key), ['f-Heat', 'f-Liked']);
});

test('a long gap starts the channel afresh; unreadable videos are skipped', async () => {
  let now = Date.UTC(2026, 10, 15, 20, 0, 0);
  const c = new Channels({ now: () => now });
  const pool = [ep('A', 1, 1), ep('A', 1, 2), ep('A', 1, 3)];
  await c.extend(sitcoms, pool, now + 3600000, async (i) => (i.key === 'A-1-2' ? null : times));
  assert.ok(c.plan('sitcoms').entries.every((e) => e.k !== 'A-1-2'));
  now += 3 * 24 * 3600000;
  await c.extend(sitcoms, pool, now + 3600000, timesOf);
  assert.ok(c.at('sitcoms', now), 'on air again');
  assert.ok(c.plan('sitcoms').entries[0].s <= now);
});

test('schedules and the owner’s channels survive a restart', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'live-')), 'channels.json');
  const now = Date.UTC(2026, 10, 15, 20, 0, 0);
  const a = new Channels({ file, now: () => now });
  const mine = a.saveCustom({ name: '  Friday   night ', genres: [28], order: 'order' });
  assert.equal(mine.name, 'Friday night'); assert.equal(mine.number, 5);
  assert.throws(() => a.saveCustom({ name: 'Empty' }), /at least one/);
  await a.extend(sitcoms, [ep('A', 1, 1), ep('A', 1, 2)], now + 3600000, timesOf);
  a.saveNow();
  const b = new Channels({ file, now: () => now });
  assert.deepEqual(b.custom(), a.custom());
  assert.deepEqual(b.plan('sitcoms').entries, a.plan('sitcoms').entries);
  b.removeCustom(mine.id);
  assert.equal(b.custom().length, 0);
});

// A small server: three people (1 and 2 share a library), a library of sitcoms, the real WatchRooms.
function rig() {
  let now = Date.UTC(2026, 10, 15, 20, 0, 0);
  const users = [{ id: 1, name: 'Oliver', isOwner: true }, { id: 2, name: 'Ebi' }, { id: 3, name: 'Pappa' }];
  const library = [ep('Office', 1, 1), ep('Office', 1, 2), ep('Office', 1, 3), ep('Parks', 1, 1), film('Heat')];
  const libs = { 1: ['Office-1-1'], 2: ['Office-1-1'], 3: library.map((i) => i.key) };
  const rooms = new WatchRooms({ now: () => now });
  const tv = createLiveTv({
    now: () => now, watchRooms: rooms, name: () => 'SEELE TV', genres: () => [], timesOf,
    library: () => library,
    mediaFor: (key) => (library.some((i) => i.key === key) ? { kind: 'lib', id: key, mediaKey: key, title: key } : null),
    accounts: { listUsers: () => users, libraryOf: (id) => new Map((libs[id] || []).map((k) => [k, {}])), sameLibrary: (a, b) => a === b || (a <= 2 && b <= 2), serverSettings: () => ({}) },
    social: { likedKeys: () => new Set(), dislikedKeys: () => new Set() },
  });
  return { tv, rooms, users, library, clock: (ms) => { now += ms; return now; }, get now() { return now; } };
}

test('the guide shows each person their channels; tuning in joins everyone at the same moment', async () => {
  const r = rig();
  const [oliver, ebi, pappa] = r.users;
  const guide = await r.tv.guide(oliver);
  assert.equal(guide.name, 'SEELE TV');
  assert.deepEqual(guide.channels.map((c) => c.id), ['sitcoms']); // 1 film: too few for Films; no one has 5 picks
  assert.ok(guide.channels[0].programmes.length > 3);
  assert.deepEqual((await r.tv.guide(pappa)).channels.map((c) => c.id), ['sitcoms', 'picks-3']);
  await assert.rejects(r.tv.tune(ebi, 'picks-3', 'ebi-client-12345678'), /isn’t available/);

  const one = await r.tv.tune(oliver, 'sitcoms', 'oliver-client-1234567');
  r.clock(400);
  const two = await r.tv.tune(ebi, 'sitcoms', 'ebi-client-12345678');
  assert.equal(one.token, liveToken('sitcoms'));
  assert.equal(two.media.mediaKey, one.media.mediaKey);
  const at = r.now;
  assert.ok(Math.abs(playbackPlan(one, at, 0).target - playbackPlan(two, at, 0).target) < 0.01, 'same frame for both');
  assert.equal(two.live.channel.id, 'sitcoms');
  assert.ok(two.live.now.title && two.live.next.title);
  assert.equal(two.members.length, 2);
  assert.deepEqual((await r.tv.guide(oliver)).channels[0].faces.map((f) => f.name), ['Oliver', 'Ebi']);
  assert.throws(() => r.rooms.control(one.token, oliver, 'oliver-client-1234567', 'pause', 0), /live TV/);
  r.rooms.leave(one.token, oliver, 'oliver-client-1234567');
  r.rooms.leave(one.token, ebi, 'ebi-client-12345678');
  r.clock(2 * MIN);
  r.rooms.cleanup();
  assert.equal(r.rooms.rooms.size, 0, 'an empty channel closes');
});

test('the room follows the schedule across the intro jump and into the next programme', async () => {
  const r = rig();
  const [oliver] = r.users;
  const seen = [];
  const first = await r.tv.tune(oliver, 'sitcoms', 'oliver-client-1234567');
  r.rooms.subscribe(first.token, oliver, 'oliver-client-1234567', (s) => seen.push(s));
  const room = r.rooms.rooms.get(first.token);
  const entry = r.tv.channels.at('sitcoms', r.now).entry;
  // Up to the intro (60 s of video), then a jump to 120 s.
  r.clock(entry.s + 60500 - r.now);
  r.rooms.refreshLive(room);
  assert.ok(Math.abs(seen.at(-1).position - 120.5) < 0.01, `jumped over the intro (${seen.at(-1).position})`);
  r.clock(entry.e + 100 - r.now);
  r.rooms.refreshLive(room);
  const next = r.tv.channels.at('sitcoms', r.now).entry;
  assert.notEqual(next.n, entry.n);
  assert.equal(seen.at(-1).media.mediaKey, next.k);
  assert.ok(seen.at(-1).position < 1);
  clearTimeout(room.liveTimer);
});

test('a programme deleted while it airs leaves the channel off air until the next one', async () => {
  const r = rig();
  const [oliver] = r.users;
  const first = await r.tv.tune(oliver, 'sitcoms', 'oliver-client-1234567');
  const room = r.rooms.rooms.get(first.token);
  const airing = first.media.mediaKey;
  r.library.splice(r.library.findIndex((i) => i.key === airing), 1);
  r.clock(5000);
  r.rooms.refreshLive(room);
  assert.equal(room.media, null);
  assert.equal(r.rooms.snapshot(room).live.missing, true);
  assert.equal(r.rooms.protects(airing), false, 'a channel never blocks a delete');
  clearTimeout(room.liveTimer);
});

test('the TV app follows the same clock sum as the web player and surfs in guide order', async () => {
  const vm = await import('node:vm');
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(new URL('../public/tv/logic.js', import.meta.url), 'utf8'), sandbox);
  const L = sandbox.LilinTvLogic;
  const room = { position: 100, at: 50000, playing: true };
  assert.equal(L.liveTarget(room, 53500), playbackPlan(room, 53500, 0).target);
  assert.equal(L.liveTarget({ ...room, playing: false }, 99999), 100);
  assert.equal(L.clockOffset([{ rtt: 90, offset: 5 }, { rtt: 20, offset: 7 }, { rtt: 50, offset: 9 }]), 7);
  const list = [{ id: 'anime' }, { id: 'sitcoms' }, { id: 'films' }];
  assert.equal(L.neighbour(list, 'anime', -1).id, 'films');
  assert.equal(L.neighbour(list, 'films', 1).id, 'anime');
  assert.equal(L.channelName({ kind: 'picks', id: 'picks-2', person: 'Ebi' }, 1), 'Ebi’s picks');
  assert.equal(L.channelName({ kind: 'picks', id: 'picks-1', person: 'Oliver' }, 1), 'Your picks');
  assert.equal(L.programmeLine({ kind: 'episode', season: 1, episode: 2, name: 'Pilot' }), 'S01 E02 · Pilot');
});
