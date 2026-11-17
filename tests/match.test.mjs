import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as social from '../src/social.js';
import * as friends from '../src/friends.js';
import { tasteFrom, scoreCandidate, diversify, passes, cleanFilters, genreLeaning, createMatch, GENRES, HAND } from '../src/match.js';
import { GENRE_KEYS, swipeOutcome } from '../public/match.js';

const NOW = Date.UTC(2026, 10, 17, 20);
const DAY = 86400000;

test('taste: thumbs up and finished films lead, recent counts more, thumbs down and the other type stay out', () => {
  const t = tasteFrom({
    watched: [
      { key: 'movie:1', title: 'Old Favourite', seconds: 7000, finished: 1, at: NOW - 400 * DAY },
      { key: 'movie:2', title: 'Last Week', seconds: 7000, finished: 1, at: NOW - 7 * DAY },
      { key: 'movie:3', title: 'Peeked', seconds: 300, finished: 0, at: NOW - DAY },
      { key: 'movie:4', title: 'Hated', seconds: 6000, finished: 1, at: NOW - DAY },
      { key: 'tv:9', title: 'A Show', seconds: 30000, finished: 1, at: NOW - DAY },
    ],
    rated: [{ key: 'movie:5', value: 1, title: 'Loved', at: NOW - 30 * DAY }, { key: 'movie:4', value: -1, title: 'Hated', at: NOW }],
  }, 'movie', NOW);
  assert.deepEqual(t.seeds.map((s) => s.key), ['movie:5', 'movie:2', 'movie:1'], 'a thumbs up first, then the recent film');
  assert.equal(t.seeds[0].liked, true);
  assert.ok(!t.seeds.some((s) => s.key === 'movie:3'), 'five minutes is no taste');
  assert.ok(t.seen.has('movie:2') && t.seen.has('movie:5') && t.seen.has('tv:9') && !t.seen.has('movie:3'));
  assert.ok(t.disliked.has('movie:4') && !t.seeds.some((s) => s.key === 'movie:4'));
  assert.equal(t.cold, false);
  assert.equal(tasteFrom({}, 'movie').cold, true, 'no history: cold');
  assert.deepEqual(tasteFrom({ watched: [{ key: 'tv:9', title: 'A Show', seconds: 30000, finished: 1, at: NOW }] }, 'tv', NOW).seeds.map((s) => s.id), [9]);
});

test('score: a title both people could like beats one only one of them loves', () => {
  const people = [{ id: 1, norm: 2, genres: { 18: 0.6, 53: 0.4 } }, { id: 2, norm: 2, genres: { 35: 1 } }];
  const both = { t: { type: 'movie', rating: 7.2, votes: 3000, genres: [18, 35] }, per: { 1: 1.2, 2: 1.2 }, src: ['taste'] };
  const one = { t: { type: 'movie', rating: 7.6, votes: 3000, genres: [18, 53] }, per: { 1: 2 }, src: ['taste'] };
  const crowd = { t: { type: 'movie', rating: 8.4, votes: 20000, genres: [28] }, per: {}, src: ['crowd'] };
  assert.ok(scoreCandidate(both, people) > scoreCandidate(one, people));
  assert.ok(scoreCandidate(both, people) > scoreCandidate(crowd, people));
  assert.ok(scoreCandidate(crowd, people, { onServer: true }) > scoreCandidate(crowd, people), 'on the server lifts a little');
  // nobody has history: quality decides
  const cold = [{ id: 1, norm: 1, genres: {} }];
  assert.ok(scoreCandidate(crowd, cold) > scoreCandidate({ ...crowd, t: { ...crowd.t, rating: 6.5 } }, cold));
});

test('the stack spreads genres and learns from yes votes', () => {
  const list = [28, 28, 28, 35, 18, 28].map((g, i) => ({ key: `movie:${i}`, t: { genres: [g] } }));
  const out = diversify(list).map((x) => x.t.genres[0]);
  for (let i = 1; i < 4; i++) assert.notEqual(out[i], out[i - 1], out.join());
  assert.equal(diversify([]).length, 0);
  const pool = [{ per: { 1: 1 }, t: { genres: [18] } }, { per: { 1: 1 }, t: { genres: [35] } }];
  const before = genreLeaning(1, pool);
  const after = genreLeaning(1, pool, [{ vote: 1, genres: [35] }, { vote: 1, genres: [35] }, { vote: -1, genres: [18] }]);
  assert.equal(before[18], before[35]);
  assert.ok(after[35] > after[18], JSON.stringify(after));
});

test('filters: genre, unreleased, obscure, server only, cleaned input', () => {
  const t = { id: 1, poster: 'p', date: '2020-01-01', genres: [18, 53], votes: 500 };
  assert.ok(passes({ t }, cleanFilters({}), { type: 'movie', day: '2026-11-17' }));
  assert.ok(passes({ t }, cleanFilters({ genre: 'thriller' }), { type: 'movie', day: '2026-11-17' }));
  assert.ok(!passes({ t }, cleanFilters({ genre: 'comedy' }), { type: 'movie', day: '2026-11-17' }));
  assert.ok(!passes({ t: { ...t, date: '2027-01-01' } }, cleanFilters({}), { type: 'movie', day: '2026-11-17' }), 'not out yet');
  assert.ok(!passes({ t: { ...t, votes: 10 } }, cleanFilters({}), { type: 'movie', day: '2026-11-17' }), 'obscure');
  assert.ok(passes({ t: { ...t, votes: 10 } }, cleanFilters({}), { type: 'movie', onServer: true, day: '2026-11-17' }), 'unless it’s on the server');
  assert.ok(!passes({ t }, cleanFilters({ serverOnly: true }), { type: 'movie', day: '2026-11-17' }));
  assert.ok(!passes({ t: { ...t, genres: [10764] } }, cleanFilters({}, 'tv'), { type: 'tv', day: '2026-11-17' }), 'reality TV');
  assert.deepEqual(cleanFilters({ genre: 'nope', maxMinutes: 95, unseen: false }), { genre: '', maxMinutes: 0, unseen: false, serverOnly: false });
  assert.deepEqual(cleanFilters({ genre: 'horror', maxMinutes: 120 }, 'tv'), { genre: '', maxMinutes: 0, unseen: true, serverOnly: false }, 'no horror or length for shows');
  assert.equal(cleanFilters({ maxMinutes: '120' }).maxMinutes, 120);
});

test('the page and the server know the same genres', () => {
  assert.deepEqual([...GENRE_KEYS].sort(), Object.keys(GENRES).sort());
});

test('a swipe counts once it goes far enough or fast enough', () => {
  assert.equal(swipeOutcome(0, 0, 360), 0);
  assert.equal(swipeOutcome(150, 0, 360), 1);
  assert.equal(swipeOutcome(-150, 0, 360), -1);
  assert.equal(swipeOutcome(60, 0, 360), 0);
  assert.equal(swipeOutcome(60, 0.9, 360), 1, 'a flick');
  assert.equal(swipeOutcome(-40, -0.8, 360), -1);
  assert.equal(swipeOutcome(-40, 0.8, 360), 0, 'flicked back the other way');
});

// ---------- a whole pick, with a pretend TMDB ----------
function mapTitle(x, type) {
  const date = x.release_date || x.first_air_date || '';
  return { id: x.id, type, title: x.title || x.name, year: date ? Number(date.slice(0, 4)) : null, overview: x.overview || '',
    rating: x.vote_average || null, poster: x.poster_path ? `https://image.tmdb.org/t/p/w342${x.poster_path}` : null,
    backdrop: null, genres: x.genre_ids || [], popularity: 0, votes: x.vote_count || 0, date };
}
// Films 1-499. Film n's genre: drama for even, comedy for odd; runtime 90 + n % 80; recommendations of film n are n*10+1..n*10+12.
const film = (n) => ({ id: n, title: `Film ${n}`, release_date: '2015-05-05', poster_path: `/p${n}.jpg`, vote_average: 7 + (n % 10) / 10, vote_count: 900 + n,
  genre_ids: [n % 2 ? 35 : 18], overview: `About film ${n}` });
function fakeTmdb(calls) {
  return async (endpoint, params = {}, lang = 'en') => {
    calls.push(`${lang} ${endpoint}`);
    let m;
    if ((m = endpoint.match(/^\/movie\/(\d+)\/recommendations$/))) return { results: Array.from({ length: 12 }, (_, i) => film(Number(m[1]) * 10 + 1 + i)) };
    if ((m = endpoint.match(/^\/movie\/(\d+)$/))) {
      const n = Number(m[1]), f = film(n);
      return { ...f, runtime: 90 + (n % 80), genres: f.genre_ids.map((id) => ({ id, name: lang === 'sv' ? `Genre-sv ${id}` : `Genre ${id}` })), overview: lang === 'sv' ? `Om film ${n}` : f.overview };
    }
    if (endpoint === '/discover/movie') return { results: Array.from({ length: 20 }, (_, i) => film(300 + (Number(params.page) - 1) * 40 + (params.sort_by === 'popularity.desc' ? 20 : 0) + i)) };
    if (endpoint === '/trending/movie/week') return { results: [film(5), film(6)] };
    return { results: [] };
  };
}

test('a pick: dealt from both people’s history, private swipes, a match, leaving, more cards', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-match-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: ['owner@m.test'], mediaDir: null });
  friends.initFriends();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  const owner = make('owner@m.test', 'Olle'), pal = make('pal@m.test', 'Pal'), quiet = make('quiet@m.test', 'Quiet'), third = make('third@m.test', 'Third');
  accounts.updateUser(quiet.id, { restricted: true });
  // Olle watched films 1 and 2 and liked 3; Pal watched film 2 and 4. Film 21 (a recommendation of film 2) was seen by Pal.
  for (const [u, n] of [[owner, 1], [owner, 2], [pal, 2], [pal, 4], [pal, 21]]) {
    social.logWatch(u.id, { ref: `l:film${n}-${u.id}`, about: { titleKey: `movie:${n}`, title: `Film ${n}` }, watched: 30, finished: true });
  }
  social.rate(owner.id, 'movie:3', 1, 'Film 3');
  const calls = [], notes = [], told = [];
  const rooms = [];
  const svc = createMatch({ tmdb: fakeTmdb(calls), mapTitle, hasDevice: () => true,
    notify: async (ids, kind, msg) => { notes.push({ ids, kind, ...msg }); return ids.length; },
    publish: (uid) => told.push(uid), serverKeys: async () => ['movie:22'],
    startRoom: async (user, card, opts) => { rooms.push({ user: user.id, card: card.key, ...opts }); return { token: 'r'.repeat(24), startsAt: opts.startsAt || null }; } });
  const me = accounts.userById(owner.id), you = accounts.userById(pal.id), q = accounts.userById(quiet.id), t3 = accounts.userById(third.id);

  const start = await svc.list(me);
  assert.deepEqual(start.people.map((p) => p.id).sort(), [pal.id, third.id].sort(), 'restricted people aren’t offered');
  await assert.rejects(svc.create(q, { invite: [owner.id] }), /link/, 'restricted people can’t invite');

  const pick = await svc.create(me, { type: 'movie', invite: [pal.id, quiet.id] });
  assert.equal(pick.joined, true);
  assert.equal(pick.cards.length, HAND);
  assert.deepEqual(pick.invited.map((p) => p.id), [pal.id], 'only Pal was invited');
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].ids, [pal.id]);
  assert.equal(notes[0].kind, 'watch');
  assert.equal(notes[0].url, `/?pick=${pick.id}`);
  const keys = pick.cards.map((c) => c.key);
  for (const seen of ['movie:1', 'movie:2', 'movie:3', 'movie:4', 'movie:21']) assert.ok(!keys.includes(seen), `${seen} was seen by someone`);
  // films recommended from both people's histories come first (film 2's, and film 3's and 4's shared ones)
  const shared = (k) => { const n = Number(k.split(':')[1]); return (n >= 22 && n <= 32) || n === 41 || n === 42; };
  assert.ok(keys.slice(0, 8).every(shared), keys.join());
  const fromTwo = pick.cards.find((c) => c.key === 'movie:22');
  assert.equal(fromTwo.onServer, true);
  assert.ok(['Film 1', 'Film 2'].includes(fromTwo.why?.title), 'Olle sees his own reason');
  assert.equal(fromTwo.why.liked, false);
  assert.ok(pick.cards.every((c) => c.poster?.includes('/w500/') && c.overview));
  // the invite shows on Pal's Discover card
  const palList = svc.list(you);
  assert.equal(palList.picks[0].id, pick.id);
  assert.equal(palList.picks[0].invited, true);

  // a stranger can see who's in, but no cards until they join
  const peek = await svc.view(pick.id, t3);
  assert.equal(peek.joined, false);
  assert.equal(peek.cards, undefined);
  await assert.rejects(async () => svc.vote(t3, pick.id, 'movie:22', 1), /Join/);

  // the restricted person joins by link
  const joinedQ = svc.join(q, pick.id);
  assert.equal((await joinedQ).joined, true);
  svc.leave(q, pick.id);

  const palView = await svc.join(you, pick.id);
  assert.equal(palView.cards.find((c) => c.key === 'movie:22').why?.title, 'Film 2', 'Pal watched film 2 too');
  assert.equal(palView.members.length, 2);

  // private: yes votes aren't in anyone else's view
  assert.equal(svc.vote(me, pick.id, 'movie:22', 1).match, null);
  assert.deepEqual((await svc.view(pick.id, you)).mine, {});
  assert.throws(() => svc.vote(me, pick.id, 'movie:999', 1), /isn’t in this pick/);
  assert.throws(() => svc.vote(me, pick.id, 'movie:22', 5), /yes or no/);
  // Pal says yes: a match
  told.length = 0;
  const hit = svc.vote(you, pick.id, 'movie:22', 1);
  assert.equal(hit.match, 'movie:22');
  assert.ok(told.includes(owner.id) && told.includes(pal.id));
  assert.equal(svc.vote(you, pick.id, 'movie:22', 1).match, null, 'a match happens once');
  const after = await svc.view(pick.id, me);
  assert.deepEqual(after.matches.map((m) => m.key), ['movie:22']);
  assert.equal(after.matches[0].onServer, true);
  assert.equal(after.members.find((m) => m.id === pal.id).swiped, 1);

  // Watch together on the match
  await assert.rejects(svc.watch(me, pick.id, { key: keys.find((k) => k !== 'movie:22'), clientId: 'c1' }), /isn’t a match/);
  const watched = await svc.watch(me, pick.id, { key: 'movie:22', clientId: 'c1' });
  assert.equal(watched.room.token.length, 24);
  assert.equal(rooms[0].card, 'movie:22');
  const roomNote = notes.at(-1);
  assert.deepEqual(roomNote.ids, [pal.id]);
  assert.match(roomNote.url, /^\/\?watch=r{24}$/);
  assert.equal((await svc.view(pick.id, you)).room.by, 'Olle');

  // a third person joins and leaves; Olle and Pal both said yes to another film while she was in: a match once she's gone
  svc.join(t3, pick.id);
  const other = keys.find((k) => k !== 'movie:22');
  svc.vote(me, pick.id, other, 1);
  assert.equal(svc.vote(you, pick.id, other, 1).match, null, 'Third hasn’t said yes');
  svc.leave(t3, pick.id);
  assert.ok((await svc.view(pick.id, me)).matches.some((m) => m.key === other));

  // running low: a new hand, which never repeats a card
  for (const k of keys) svc.vote(me, pick.id, k, -1);
  const dealt = await svc.more(me, pick.id);
  assert.equal(dealt.dealt, HAND);
  const all = (await svc.view(pick.id, me)).cards.map((c) => c.key);
  assert.equal(new Set(all).size, all.length);
  assert.equal((await svc.view(pick.id, me, { from: HAND })).cards.length, HAND, 'from= sends only the new cards');
  assert.deepEqual(await svc.more(you, pick.id), { dealt: 0 }, 'Pal still has plenty');

  // the last one out ends it
  svc.leave(me, pick.id); svc.leave(you, pick.id);
  await assert.rejects(svc.view(pick.id, me), /ended/);
});

test('a pick for short films, in Swedish too, and one nothing fits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-match-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: ['owner@m.test'], mediaDir: null });
  friends.initFriends();
  const owner = accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': 'owner@m.test' } }), { name: 'Olle', language: 'sv' });
  const calls = [];
  const svc = createMatch({ tmdb: fakeTmdb(calls), mapTitle, hasDevice: () => false, serverKeys: async () => [] });
  const me = accounts.userById(owner.id);
  // nobody has any history: crowd-pleasers, trending
  const pick = await svc.create(me, { type: 'movie', maxMinutes: 120 });
  assert.equal(pick.cards.length, HAND);
  assert.ok(pick.cards.every((c) => c.runtime <= 120), pick.cards.map((c) => c.runtime).join());
  assert.ok(calls.some((c) => c.startsWith('sv /movie/')), 'Swedish descriptions were asked for');
  assert.ok(pick.cards.every((c) => !c.why));
  const comedy = await svc.create(me, { type: 'movie', genre: 'comedy' });
  assert.ok(comedy.cards.every((c) => c.genres.includes(35)));
  await assert.rejects(svc.create(me, { type: 'movie', genre: 'horror' }), /Nothing fits/);
  await svc.create(me, { type: 'movie' });
  await assert.rejects(svc.create(me, { type: 'movie' }), /three picks/);
});
