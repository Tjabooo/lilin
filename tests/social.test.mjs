import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as social from '../src/social.js';
import { WatchRooms } from '../src/watch.js';
import { topicFor } from '../src/live.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-social-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  const anna = make('anna@example.test', 'Anna'), ben = make('ben@example.test', 'Ben'), cleo = make('cleo@example.test', 'Cleo');
  const nameOf = (id) => accounts.userById(id)?.name || 'Someone';
  return { dir, anna, ben, cleo, nameOf };
}

test('thumbs: people see who liked a title, dislikes stay private, clearing removes it', () => {
  const { anna, ben, cleo, nameOf } = setup();
  social.rate(anna.id, 'movie:603', 1, 'The Matrix');
  social.rate(ben.id, 'movie:603', 1, 'The Matrix');
  social.rate(cleo.id, 'movie:603', -1, 'The Matrix');
  const forCleo = social.ratingFor(cleo.id, 'movie:603', nameOf);
  assert.equal(forCleo.mine, -1);
  assert.deepEqual(forCleo.likedBy.toSorted(), ['Anna', 'Ben']);
  assert.equal(forCleo.likes, 2);
  const forAnna = social.ratingFor(anna.id, 'movie:603', nameOf);
  assert.deepEqual(forAnna.likedBy, ['Ben'], 'your own like is shown as yours, not in the list');
  social.rate(anna.id, 'movie:603', 0);
  assert.equal(social.ratingFor(anna.id, 'movie:603', nameOf).mine, 0);
  assert.deepEqual(social.ratingsFor(ben.id, ['movie:603', 'tv:1', 'junk']), { 'movie:603': { mine: 1, likes: 1 } });
  assert.deepEqual([...social.dislikedKeys(cleo.id)], ['movie:603'], 'Discover leaves out what you disliked');
  assert.equal(social.dislikedKeys(ben.id).size, 0);
  assert.throws(() => social.rate(anna.id, 'movie:abc', 1), { status: 400 });
  assert.throws(() => social.rate(anna.id, 'tv:1', 5), { status: 400 });
  assert.equal(topicFor('/api/social/rate').topic, 'social');
});

test('watch log credits real playback, capped by elapsed time, and survives finishing a video', () => {
  const { anna, ben, nameOf } = setup();
  const t0 = new Date('2026-03-02T20:00:00').getTime();
  const about = { titleKey: 'tv:1399', title: 'Game of Thrones', season: 1, episode: 1 };
  assert.equal(social.logWatch(anna.id, { ref: 'm:got/s01e01', about, watched: 10, now: t0 }), 10);
  // A save that claims far more than the time that passed is cut down to ~2x speed.
  assert.ok(social.logWatch(anna.id, { ref: 'm:got/s01e01', about, watched: 600, now: t0 + 15000 }) < 40);
  social.logWatch(anna.id, { ref: 'm:got/s01e01', about, watched: 15, finished: true, now: t0 + 30000 });
  accounts.saveProgress(anna.id, 'm:got/s01e01', null, 3600); // finished: the progress row goes away
  // Next day, together with Ben in a room.
  let now = t0 + 86400000;
  for (let i = 0; i < 8; i++, now += 60000) {
    social.logWatch(anna.id, { ref: 'm:got/s01e02', about: { ...about, episode: 2 }, watched: 60, companions: [ben.id], now });
    social.logWatch(ben.id, { ref: 'm:got/s01e02', about: { ...about, episode: 2 }, watched: 60, companions: [anna.id], now });
  }
  social.logWatch(anna.id, { ref: 'm:films/arrival', about: { titleKey: 'movie:329865', title: 'Arrival' }, watched: 30, now: t0 + 3 * 86400000 });
  assert.equal(social.logWatch(anna.id, { ref: 'bad', about, watched: 5 }), 0);
  assert.equal(social.logWatch(anna.id, { ref: 'm:x', about: {}, watched: 5 }), 0, 'needs a title');

  const w = social.wrapped(anna.id, 2026, nameOf);
  assert.equal(w.empty, undefined);
  assert.ok(w.seconds > 500 && w.seconds < 600, `seconds ${w.seconds}`);
  assert.equal(w.top[0].title, 'Game of Thrones');
  assert.equal(w.top[0].episodes, 2);
  assert.equal(w.topShow.title, 'Game of Thrones');
  assert.equal(w.episodes, 2);
  assert.equal(w.films, 1);
  assert.equal(w.first.title, 'Game of Thrones');
  assert.equal(w.streak.days, 2);
  assert.equal(w.activeDays, 3);
  assert.equal(w.busiestMonth, 'March');
  assert.equal(w.busiestDay.day, '2026-03-03');
  assert.deepEqual(w.company.map((c) => c.name), ['Ben']);
  assert.equal(w.together, 450); // the first save of a session counts at most 30 s
  assert.equal(w.people, 2);
  assert.equal(w.rank, 1);
  assert.deepEqual(w.years, [2026]);
  assert.equal(social.wrapped(anna.id, 2025, nameOf).empty, true);
  assert.throws(() => social.wrapped(anna.id, 'x', nameOf), { status: 400 });
});

test('Popular on Lilin ranks by likes, viewers and hours, filters by type and drops disliked titles', () => {
  const { anna, ben, cleo } = setup();
  const now = Date.now();
  social.rate(anna.id, 'movie:1', 1); social.rate(ben.id, 'movie:1', 1);
  social.rate(anna.id, 'tv:2', 1);
  social.rate(anna.id, 'movie:3', -1); social.rate(ben.id, 'movie:3', -1);
  for (const u of [anna, ben, cleo]) {
    for (let i = 0; i < 10; i++) social.logWatch(u.id, { ref: 'm:show/e1', about: { titleKey: 'tv:2', title: 'Show' }, watched: 60, now: now + i * 60000 });
  }
  social.logWatch(cleo.id, { ref: 'm:film/peek', about: { titleKey: 'movie:4', title: 'Peek' }, watched: 30, now });
  const list = social.popular({ now: now + 3600000 });
  assert.deepEqual(list.map((p) => p.key), ['tv:2', 'movie:1']);
  assert.equal(list[0].viewers, 3);
  assert.equal(list[1].likes, 2);
  assert.deepEqual(social.popular({ type: 'movie', now: now + 3600000 }).map((p) => p.key), ['movie:1']);
});

test('Popular on Lilin stays balanced when one person likes hundreds of titles', () => {
  const { anna, ben, cleo } = setup();
  const now = Date.now();
  for (let i = 1; i <= 300; i++) social.rate(cleo.id, `movie:${1000 + i}`, 1); // a big Letterboxd import
  social.rate(anna.id, 'movie:1', 1); social.rate(ben.id, 'movie:1', 1);
  social.rate(anna.id, 'tv:2', 1);
  social.rate(cleo.id, 'movie:1', 1);
  const list = social.popular({ now: now + 3600000 });
  assert.equal(list[0].key, 'movie:1', 'what several people like comes first');
  assert.equal(list.filter((p) => p.likedBy.length === 1 && p.likedBy[0] === cleo.id).length, 3, 'at most 3 titles only Cleo backs');
  assert.ok(list.some((p) => p.key === 'tv:2'), "Anna's single like still shows");
  assert.equal(list.length, 5);
});

test('planned watch parties: countdown, auto start, creator hosts, survive a restart, cancel', () => {
  const { anna, ben } = setup();
  let now = Date.now();
  const clock = () => now;
  const rooms = new WatchRooms({ now: clock, store: social.partyStore });
  const media = { kind: 'lib', id: 'arrival', title: 'Arrival', mediaKey: 'films/arrival' };
  assert.throws(() => rooms.plan(anna, media, now - 1000), { status: 400 });
  assert.throws(() => rooms.plan(anna, media, now + 30 * 86400000), { status: 400 });
  const startsAt = now + 3600000;
  const planned = rooms.plan(anna, media, startsAt);
  assert.equal(planned.startsAt, startsAt);
  assert.equal(rooms.preview(planned.token).host, 'Anna');
  assert.equal(rooms.preview(planned.token).startsAt, startsAt);
  assert.equal(rooms.protects('films/arrival'), true, 'a planned party keeps its video');
  assert.equal(topicFor('/api/watch/plan').topic, 'parties');

  // Restart: the party comes back from the database with its people.
  now += 20 * 60000;
  const again = new WatchRooms({ now: clock, store: social.partyStore });
  const token = planned.token;
  again.join(token, ben, 'bobby-client-123456');
  again.cleanup();
  assert.equal(again.parties(ben)[0].token, token);
  assert.equal(again.parties(anna)[0].mine, true);
  // Ben arrived first, then Anna, who planned it, takes over as host before it starts.
  const s = again.join(token, anna, 'alice-client-123456');
  assert.equal(s.host, 'alice-client-123456');
  assert.equal(s.startsAt, startsAt);
  const ready = { ready: true, buffering: false, blocked: false, rtt: 50 };
  again.subscribe(token, anna, 'alice-client-123456', () => {});
  again.subscribe(token, ben, 'bobby-client-123456', () => {});
  again.heartbeat(token, anna, 'alice-client-123456', ready);
  again.heartbeat(token, ben, 'bobby-client-123456', ready);
  assert.equal(again.snapshot(again.room(token)).intentPlaying, false, 'waits for the start time');
  now = startsAt + 10;
  again.heartbeat(token, anna, 'alice-client-123456', ready);
  again.heartbeat(token, ben, 'bobby-client-123456', ready);
  again.cleanup();
  const started = again.snapshot(again.room(token));
  assert.equal(started.intentPlaying, true);
  assert.equal(started.startsAt, null);
  assert.deepEqual(again.companions(token, anna.id), [ben.id]);
  assert.throws(() => again.cancel(token, ben), { status: 403 });
  again.cancel(token, anna);
  assert.throws(() => again.room(token), { status: 410 });
  assert.equal(new WatchRooms({ now: clock, store: social.partyStore }).rooms.size, 0, 'cancelled parties are gone after a restart too');
});

test('room chat and reactions reach everyone, late joiners get recent chat, both are rate limited', () => {
  let now = 10000;
  const rooms = new WatchRooms({ now: () => now });
  const a = { id: 1, name: 'Alice' }, b = { id: 2, name: 'Bob' }, c = { id: 3, name: 'Cy' };
  const media = { kind: 'lib', id: 'movie', title: 'Movie', mediaKey: 'films/movie' };
  const { token } = rooms.create(a, media, 'alice-client-123456');
  rooms.join(token, b, 'bobby-client-123456');
  const bobSaw = [];
  rooms.subscribe(token, b, 'bobby-client-123456', (m) => bobSaw.push(m));
  const msg = rooms.chat(token, a, 'alice-client-123456', '  hello\n  there  ');
  assert.equal(msg.text, 'hello there');
  assert.equal(msg.name, 'Alice');
  assert.deepEqual(bobSaw.at(-1), { chat: msg });
  assert.equal(rooms.react(token, b, 'bobby-client-123456', '😂'), true);
  assert.throws(() => rooms.react(token, b, 'bobby-client-123456', '<script>'), { status: 400 });
  assert.throws(() => rooms.chat(token, b, 'bobby-client-123456', '   '), { status: 400 });
  assert.throws(() => rooms.chat(token, c, 'cyrus-client-123456', 'hi'), { status: 403 });
  for (let i = 0; i < 5; i++) rooms.chat(token, a, 'alice-client-123456', `m${i}`);
  assert.throws(() => rooms.chat(token, a, 'alice-client-123456', 'spam'), { status: 429 });
  now += 11000;
  rooms.chat(token, a, 'alice-client-123456', 'later');
  let dropped = 0;
  for (let i = 0; i < 20; i++) if (!rooms.react(token, a, 'alice-client-123456', '🔥')) dropped++;
  assert.ok(dropped >= 8);
  rooms.join(token, c, 'cyrus-client-123456');
  const cySaw = [];
  rooms.subscribe(token, c, 'cyrus-client-123456', (m) => cySaw.push(m));
  assert.equal(cySaw.at(-1).chatLog.length, 7);
  // Host-set countdown inside a running room; playing early starts it.
  const sched = rooms.schedule(token, a, 'alice-client-123456', now + 300000);
  assert.equal(sched.startsAt, now + 300000);
  assert.throws(() => rooms.schedule(token, b, 'bobby-client-123456', now + 300000), { status: 403 });
  const played = rooms.control(token, a, 'alice-client-123456', 'play', 0);
  assert.equal(played.startsAt, null);
});

test('Wrapped extras: prime time, biggest binge, persona, Lilin totals and the first-year note', () => {
  const { anna, ben, nameOf } = setup();
  const show = { titleKey: 'tv:1396', title: 'Breaking Bad', season: 1 };
  // Five episodes late one night, each 45 min in 1-minute saves.
  let now = new Date('2026-06-12T22:00:00').getTime();
  for (let ep = 1; ep <= 5; ep++) {
    for (let i = 0; i < 45; i++, now += 60000) social.logWatch(anna.id, { ref: `m:bb/s01e0${ep}`, about: { ...show, episode: ep }, watched: 60, now });
  }
  for (let i = 0, t = new Date('2026-06-20T18:00:00').getTime(); i < 5; i++, t += 60000) {
    social.logWatch(ben.id, { ref: 'm:bb/s01e01', about: { ...show, episode: 1 }, watched: 60, now: t });
  }
  const w = social.wrapped(anna.id, 2026, nameOf);
  assert.equal(w.hours.length, 24);
  assert.ok([22, 23, 0, 1, 2].includes(w.peakHour), `peak ${w.peakHour}`);
  assert.ok(w.night > 0.9, `night ${w.night}`);
  // After midnight the log rolls over to the next day, so the binge is the episodes before it.
  assert.ok(w.binge && w.binge.episodes >= 3 && w.binge.title === 'Breaking Bad', JSON.stringify(w.binge));
  assert.equal(w.persona, 'owl');
  assert.equal(w.lilin.people, 2);
  assert.equal(w.lilin.top.title, 'Breaking Bad');
  assert.equal(w.lilin.top.people, 2);
  assert.equal(w.countingSince, '2026-06-12', 'the log started mid-year');
  assert.deepEqual(w.genreKeys.map((g) => g.key), ['tv:1396']);
  assert.equal(social.personaFor({ seconds: 600 }), 'regular', 'too little to say');
  assert.equal(social.personaFor({ seconds: 36000, binge: { episodes: 9 }, night: 0.1 }), 'binger');
  assert.equal(social.personaFor({ seconds: 36000, titles: 30, share: 0.1 }), 'explorer');
});

test('Wrapped season: home card from release day to end of January, one push from 18:00 on release day', () => {
  const at = (s) => new Date(s).getTime();
  assert.equal(social.wrappedSeason(at('2026-11-30T23:00:00'), '12-01'), null);
  assert.equal(social.wrappedSeason(at('2026-12-01T00:05:00'), '12-01').year, 2026);
  assert.equal(social.wrappedSeason(at('2027-01-20T12:00:00'), '12-01').year, 2026, 'January still shows last year');
  assert.equal(social.wrappedSeason(at('2027-02-01T12:00:00'), '12-01'), null);
  assert.equal(social.wrappedSeason(at('2026-11-15T12:00:00'), '11-15').year, 2026, 'WRAPPED_FROM moves it');
  assert.equal(social.wrappedPushDue([], at('2026-12-01T12:00:00'), '12-01'), null, 'not before 18:00');
  assert.equal(social.wrappedPushDue([], at('2026-12-01T18:01:00'), '12-01'), 2026);
  assert.equal(social.wrappedPushDue([2026], at('2026-12-01T18:01:00'), '12-01'), null, 'once a year');
  assert.equal(social.wrappedPushDue([], at('2026-12-10T18:01:00'), '12-01'), null, 'not days late');
});

test('last finished: a hand mark on an older episode never moves Up next back; playing one through does', () => {
  const { anna } = setup();
  const t0 = Date.now();
  const about = (season, episode) => ({ title: 'Rings', titleKey: 'tv:84773', season, episode });
  social.logWatch(anna.id, { ref: 'm:tv/r.s01e03.mkv', about: about(1, 3), watched: 20, now: t0 });
  social.logWatch(anna.id, { ref: 'm:tv/r.s03e08.mkv', about: about(3, 8), watched: 20, finished: true, now: t0 + 1000 });
  social.logWatch(anna.id, { ref: 'm:tv/r.s01e08.mkv', about: about(1, 8), watched: 0, finished: true, now: t0 + 2000 });
  social.markEpisode(anna.id, { key: 'tv:84773', season: 2, episode: 1, seen: true, title: 'Rings', now: t0 + 3000 });
  assert.deepEqual({ ...social.lastFinished(anna.id)['tv:84773'], at: 0 }, { season: 3, episode: 8, at: 0 });
  assert.deepEqual(social.episodeRefsBefore(anna.id, 'tv:84773', 3, 8).toSorted().filter((r) => r.startsWith('m:')), ['m:tv/r.s01e03.mkv', 'm:tv/r.s01e08.mkv']);
  social.logWatch(anna.id, { ref: 'm:tv/r.s01e01.mkv', about: about(1, 1), watched: 20, finished: true, now: t0 + 4000 });
  assert.equal(social.lastFinished(anna.id)['tv:84773'].episode, 1, 'a rewatch played to the end');
});

test('episodes: marked watched by hand ticks them off without watch time; unmarking clears them', () => {
  const { anna } = setup();
  social.markEpisode(anna.id, { key: 'tv:4586', season: 1, episode: 3, seen: true, title: 'Gilmore Girls' });
  social.markEpisode(anna.id, { key: 'tv:4586', season: 1, episode: 4, seen: true, title: 'Gilmore Girls' });
  assert.deepEqual(social.finishedEpisodes(anna.id)['tv:4586'].toSorted(), ['1:3', '1:4']);
  assert.equal(social.lastFinished(anna.id)['tv:4586'].episode, 4);
  social.markEpisode(anna.id, { key: 'tv:4586', season: 1, episode: 4, seen: false });
  assert.deepEqual(social.finishedEpisodes(anna.id)['tv:4586'], ['1:3']);
  assert.throws(() => social.markEpisode(anna.id, { key: 'movie:603', season: 1, episode: 1, seen: true }));
});
