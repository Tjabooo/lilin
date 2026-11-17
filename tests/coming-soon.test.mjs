import test from 'node:test';
import assert from 'node:assert/strict';
import { rank, score, hype, keep, filmEvent, showEvent, createComingSoon, comingSoonKind, HORIZON_DAYS, HIDE_BELOW, PAGE_SIZE } from '../src/coming-soon.js';
import { groupComingSoon, groupKey, shortDate, relativeDay, kindLabel } from '../public/coming-soon.js';

const TODAY = '2026-11-17'; // a Tuesday
const plus = (days, from = TODAY) => new Date(Date.parse(`${from}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const item = (title, popularity, days, kind = 'cinema', extra = {}) => ({ id: title.length * 1000 + days, type: ['premiere', 'season'].includes(kind) ? 'tv' : 'movie',
  title, popularity, poster: '/p.jpg', soon: { date: plus(days), kind, ...extra } });
const titles = (list) => list.map((t) => t.title);

test('ranking: closer wins at equal buzz, more buzz wins at equal date', () => {
  const ranked = rank([item('Later', 60, 60), item('Sooner', 60, 3), item('Quiet', 20, 3), item('Loud', 150, 3)], TODAY);
  assert.deepEqual(titles(ranked), ['Loud', 'Sooner', 'Quiet', 'Later']);
});

test('ranking: a big release a month out beats a small one tomorrow, but not a mid-size one this week', () => {
  const big = item('Avengers', 170, 29), small = item('Small', 12, 1), mid = item('Mid', 90, 2);
  assert.ok(score(big, TODAY) > score(small, TODAY));
  assert.ok(score(mid, TODAY) > score(big, TODAY));
});

test('ranking: each kind is measured against its own buzz, so a hyped new series is not buried under films', () => {
  // TMDB popularity for unreleased series runs ~10x lower than for films.
  assert.ok(hype(14, 'premiere') > hype(14, 'cinema'));
  const ranked = rank([item('Hyped series', 14, 10, 'premiere'), item('Film with the same number', 14, 10)], TODAY);
  assert.deepEqual(titles(ranked), ['Hyped series', 'Film with the same number']);
});

test('ranking: obscure titles are demoted, and below the floor left out', () => {
  const obscure = item('Obscure', 4, 1);       // hype ~0.39: shown, demoted
  const invisible = item('Invisible', 1, 1);   // hype ~0.17: hidden
  const normal = item('Normal', 25, 30);
  assert.ok(hype(4, 'cinema') >= HIDE_BELOW && hype(1, 'cinema') < HIDE_BELOW);
  assert.deepEqual(titles(rank([obscure, invisible, normal], TODAY)), ['Normal', 'Obscure']);
});

test('ranking: only dated titles from today to the horizon, with a poster', () => {
  assert.equal(keep(item('Today', 50, 0), TODAY), true);
  assert.equal(keep(item('Yesterday', 50, -1), TODAY), false);
  assert.equal(keep(item('Far', 50, HORIZON_DAYS + 1), TODAY), false);
  assert.equal(keep({ ...item('No art', 50, 3), poster: null }, TODAY), false);
  assert.equal(keep({ ...item('No date', 50, 3), soon: { kind: 'cinema', date: null } }, TODAY), false);
});

const dates = (list) => ({ results: list.map(([country, type, date]) => ({ iso_3166_1: country, release_dates: [{ type, release_date: `${date}T00:00:00.000Z` }] })) });

test('films: the region\'s cinema date first, then the home release once the cinema run is over', () => {
  // Out in the US last week, Swedish premiere on Friday.
  assert.deepEqual(filmEvent({ release_date: plus(-7), release_dates: dates([['US', 3, plus(-7)], ['SE', 3, plus(3)]]) }, TODAY, 'SE'),
    { date: plus(3), kind: 'cinema', local: true });
  // No Swedish date: the earliest cinema date anywhere.
  assert.deepEqual(filmEvent({ release_date: plus(10), release_dates: dates([['US', 3, plus(10)], ['GB', 2, plus(12)]]) }, TODAY, 'SE'),
    { date: plus(10), kind: 'cinema', local: false });
  // In cinemas since last month, streaming in two weeks.
  assert.deepEqual(filmEvent({ release_date: plus(-30), release_dates: dates([['SE', 3, plus(-30)], ['US', 4, plus(14)]]) }, TODAY, 'SE'),
    { date: plus(14), kind: 'digital' });
  // In cinemas with no home release date yet: that's In cinemas now, not Coming soon.
  assert.equal(filmEvent({ release_date: plus(-20), release_dates: dates([['SE', 3, plus(-20)]]) }, TODAY, 'SE'), null);
  // Already streaming somewhere: Lilin can get it, so it isn't coming.
  assert.equal(filmEvent({ release_date: plus(-60), release_dates: dates([['US', 3, plus(-60)], ['US', 4, plus(-5)], ['SE', 3, plus(5)]]) }, TODAY, 'SE'), null);
  assert.equal(filmEvent({ status: 'Canceled', release_date: plus(20) }, TODAY, 'SE'), null);
  assert.equal(filmEvent({ status: 'In Production' }, TODAY, 'SE'), null);
});

test('shows: new series and new seasons count, episodes mid-season do not', () => {
  assert.deepEqual(showEvent({ last_episode_to_air: { season_number: 2, episode_number: 8 },
    next_episode_to_air: { season_number: 3, episode_number: 1, air_date: plus(9) } }, TODAY), { date: plus(9), kind: 'season', season: 3 });
  assert.equal(showEvent({ last_episode_to_air: { season_number: 3, episode_number: 4 },
    next_episode_to_air: { season_number: 3, episode_number: 5, air_date: plus(2) } }, TODAY), null);
  assert.deepEqual(showEvent({ first_air_date: plus(5), next_episode_to_air: { season_number: 1, episode_number: 1, air_date: plus(5) } }, TODAY),
    { date: plus(5), kind: 'premiere', season: 1 });
  // A dated season with no episodes listed yet.
  assert.deepEqual(showEvent({ last_episode_to_air: { season_number: 1, episode_number: 10 }, next_episode_to_air: null,
    seasons: [{ season_number: 0, air_date: plus(1) }, { season_number: 1, air_date: plus(-300) }, { season_number: 2, air_date: plus(40) }] }, TODAY),
  { date: plus(40), kind: 'season', season: 2 });
  assert.equal(showEvent({ status: 'Canceled', first_air_date: plus(5) }, TODAY), null);
  assert.equal(showEvent({ last_episode_to_air: { season_number: 5, episode_number: 10 }, seasons: [] }, TODAY), null);
});

// A tiny TMDB: lists by endpoint, details by id.
function fakeTmdb() {
  const calls = [];
  const film = (id, title, popularity) => ({ id, title, popularity, poster_path: `/${id}.jpg`, release_date: plus(5) });
  const show = (id, name, popularity, first) => ({ id, name, popularity, poster_path: `/${id}.jpg`, first_air_date: first });
  const lists = {
    '/discover/movie': [film(1, 'Big film', 150), film(2, 'Streaming film', 70), film(3, 'Out already', 90)],
    '/discover/tv:first': [show(10, 'New series', 12, plus(3))],
    '/discover/tv:air': [show(11, 'Returning show', 90, '2020-01-01'), show(12, 'Mid-season show', 300, '2019-01-01')],
  };
  const details = {
    '/movie/1': { release_date: plus(20), release_dates: dates([['SE', 3, plus(20)]]) },
    '/movie/2': { release_date: plus(-40), release_dates: dates([['SE', 3, plus(-40)], ['US', 4, plus(6)]]) },
    '/movie/3': { release_date: plus(-40), release_dates: dates([['US', 4, plus(-1)]]) },
    '/tv/11': { last_episode_to_air: { season_number: 4, episode_number: 10 }, next_episode_to_air: { season_number: 5, episode_number: 1, air_date: plus(12) } },
    '/tv/12': { last_episode_to_air: { season_number: 2, episode_number: 3 }, next_episode_to_air: { season_number: 2, episode_number: 4, air_date: plus(1) } },
  };
  const listTmdb = async (endpoint, params) => {
    calls.push(endpoint);
    if (params.page !== '1') return { results: [] };
    const key = endpoint === '/discover/tv' ? (params['first_air_date.gte'] ? '/discover/tv:first' : '/discover/tv:air') : endpoint;
    return { results: lists[key] || [] };
  };
  const tmdb = async (endpoint) => { calls.push(endpoint); if (!details[endpoint]) throw new Error('404'); return details[endpoint]; };
  return { tmdb, listTmdb, calls };
}
const mapTitle = (x, type) => ({ id: x.id, type, title: x.title || x.name, popularity: x.popularity, poster: x.poster_path });

test('the lists: films and shows merged and ranked, cached, pages for the TV apps, the old Films key still works', async () => {
  const fake = fakeTmdb();
  const cs = createComingSoon({ ...fake, mapTitle, region: 'SE', now: () => Date.parse(`${TODAY}T10:00:00Z`) });
  const all = await cs.items('all');
  assert.deepEqual(new Set(titles(all)), new Set(['Big film', 'Streaming film', 'New series', 'Returning show']));
  assert.deepEqual(all.find((t) => t.title === 'Returning show').soon, { date: plus(12), kind: 'season', season: 5 });
  assert.deepEqual(all.find((t) => t.title === 'Streaming film').soon, { date: plus(6), kind: 'digital' });
  assert.deepEqual(titles(await cs.items('movie')).sort(), ['Big film', 'Streaming film']);
  assert.deepEqual(titles(await cs.items('tv')).sort(), ['New series', 'Returning show']);
  const before = fake.calls.length;
  await cs.items('all');
  assert.equal(fake.calls.length, before, 'served from the cache');
  assert.ok(!fake.calls.includes('/tv/10'), 'new series need no details');
  const page = await cs.list('coming-soon', 1);
  assert.equal(page.totalPages, 1);
  assert.equal(page.results.length, 4);
  assert.ok(page.results.length <= PAGE_SIZE);
  assert.deepEqual(titles((await cs.list('upcoming', 1)).results).sort(), ['Big film', 'Streaming film']);
  assert.equal(await cs.list('trending-all', 1), null);
  assert.equal(comingSoonKind('coming-soon-tv'), 'tv');
});

test('the Discover row doesn\'t wait for a slow first build', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const fake = fakeTmdb();
  const cs = createComingSoon({ ...fake, listTmdb: async (...a) => { await gate; return fake.listTmdb(...a); }, mapTitle, region: 'SE', now: () => Date.parse(`${TODAY}T10:00:00Z`) });
  const started = Date.now();
  assert.equal(await cs.list('coming-soon', 1, { wait: 50 }), null);
  assert.ok(Date.now() - started < 1000);
  release();
  assert.equal((await cs.list('coming-soon', 1)).results.length, 4);
});

test('the page groups by this week, next week, then month, in date order', () => {
  // Today is Tuesday 17 Nov: this week runs to Sunday 22 Nov, next week to 29 Nov.
  assert.equal(groupKey('2026-11-22', TODAY), 'week');
  assert.equal(groupKey('2026-11-23', TODAY), 'next-week');
  assert.equal(groupKey('2026-11-30', TODAY), '2026-11');
  assert.equal(groupKey('2027-01-04', TODAY), '2027-01');
  const groups = groupComingSoon([
    { title: 'Jan', soon: { date: '2027-01-06', kind: 'season', season: 9 } },
    { title: 'Mon next', soon: { date: '2026-11-23', kind: 'premiere' } },
    { title: 'Fri', soon: { date: '2026-11-20', kind: 'cinema' } },
    { title: 'Dec B', soon: { date: '2026-12-16', kind: 'cinema' } },
    { title: 'Dec A', soon: { date: '2026-12-02', kind: 'digital' } },
    { title: 'Gone', soon: { date: '2026-11-10', kind: 'cinema' } },
  ], TODAY);
  assert.deepEqual(groups.map((g) => g.key), ['week', 'next-week', '2026-12', '2027-01']);
  assert.deepEqual(groups.map((g) => g.label), ['This week', 'Next week', 'December', 'January 2027']);
  assert.deepEqual(groups[2].items.map((t) => t.title), ['Dec B', 'Dec A'], 'ranking order kept inside a group');
  assert.equal(groupComingSoon([{ title: 'Late Nov', soon: { date: '2026-11-30', kind: 'cinema' } }], TODAY)[0].label, 'Later in November');
});

test('cards say the date, how far away it is and what is coming', () => {
  assert.equal(shortDate('2026-11-20', TODAY), 'Fri 20 Nov');
  assert.equal(shortDate('2027-01-06', TODAY), '6 Jan 2027');
  assert.equal(relativeDay(TODAY, TODAY), 'today');
  assert.equal(relativeDay('2026-11-18', TODAY), 'tomorrow');
  assert.equal(relativeDay('2026-11-20', TODAY), 'in 3 days');
  assert.equal(relativeDay('2026-12-16', TODAY), 'in 4 weeks');
  assert.equal(relativeDay('2027-02-17', TODAY), 'in 3 months');
  assert.equal(kindLabel({ kind: 'season', season: 3 }), 'Season 3');
  assert.equal(kindLabel({ kind: 'digital' }), 'Streaming');
  assert.equal(kindLabel({ kind: 'premiere' }), 'New series');
});
