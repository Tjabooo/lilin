import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, rank, createNewEpisodes, EPISODE_DAYS, SEASON_DAYS } from '../src/new-episodes.js';

const TODAY = '2026-11-22';
const ago = (days) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const show = (lastAgo, { season = 3, episode = 5, seasonStartAgo = 40, count = 8 } = {}) => ({
  last_episode_to_air: { air_date: ago(lastAgo), season_number: season, episode_number: episode },
  seasons: [{ season_number: season, air_date: ago(seasonStartAgo), episode_count: count }],
});

test('weekly show mid-season: new for a week', () => {
  assert.deepEqual(freshness(show(2), TODAY), { season: 3, episode: 5, date: ago(2), kind: 'episode' });
  assert.equal(freshness(show(EPISODE_DAYS + 1), TODAY), null);
});
test('a season that just started stays new for a month, series for season 1', () => {
  assert.equal(freshness(show(20, { seasonStartAgo: 20 }), TODAY).kind, 'season');
  assert.equal(freshness(show(20, { season: 1, seasonStartAgo: 20 }), TODAY).kind, 'series');
  assert.equal(freshness(show(SEASON_DAYS + 1, { seasonStartAgo: SEASON_DAYS + 1 }), TODAY), null);
});
test('daily shows and specials are left out', () => {
  assert.equal(freshness(show(1, { count: 200, episode: 150 }), TODAY), null);
  assert.equal(freshness(show(1, { season: 0 }), TODAY), null);
  assert.equal(freshness({}, TODAY), null);
});
test('ranking: buzz and recency, obscure ones hidden', () => {
  const it = (title, popularity, days) => ({ title, popularity, poster: '/p.jpg', fresh: { date: ago(days), kind: 'episode' } });
  const out = rank([it('old hit', 200, 6), it('fresh hit', 200, 0), it('obscure', 0.5, 0)], TODAY).map((x) => x.title);
  assert.deepEqual(out, ['fresh hit', 'old hit']);
});
test('list: builds from TMDB and pages', async () => {
  const now = () => Date.parse(`${TODAY}T12:00:00Z`);
  const ne = createNewEpisodes({
    now, mapTitle: (x, type) => ({ id: x.id, type, title: x.name, popularity: x.popularity, poster: x.poster_path }),
    listTmdb: async (endpoint) => ({ results: endpoint.startsWith('/discover') ? [{ id: 1, name: 'Weekly', popularity: 100, poster_path: '/a' }, { id: 2, name: 'Talk', popularity: 900, poster_path: '/b', genre_ids: [10767] }] : [] }),
    tmdb: async () => show(1),
  });
  assert.ok(ne.handles('on-air'));
  const page = await ne.list('on-air');
  assert.deepEqual(page.results.map((x) => x.title), ['Weekly']);
  assert.equal(page.results[0].fresh.kind, 'episode');
});
