// anime.buildContext with a faked AniList: sequel chains that branch, and arc names TMDB lists among a show's names.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as anime from '../src/anime.js';

const media = (id, romaji, english, year, episodes, format = 'TV') => ({ id, format, episodes, status: 'FINISHED', startDate: { year }, title: { romaji, english }, synonyms: [], type: 'ANIME' });
const KURO = media(4898, 'Kuroshitsuji', 'Black Butler', 2008, 24);
const II = media(6707, 'Kuroshitsuji II', 'Black Butler II', 2010, 12);
const CIRCUS = media(20606, 'Kuroshitsuji: Book of Circus', 'Black Butler: Book of Circus', 2014, 10);
const MURDER = media(20850, 'Kuroshitsuji: Book of Murder', 'Black Butler: Book of Murder', 2014, 2, 'OVA');
const SCHOOL = media(150000, 'Kuroshitsuji: Kishuku Gakkou-hen', 'Black Butler: Public School Arc', 2024, 11);
const WITCH = media(170000, 'Kuroshitsuji: Midori no Majo-hen', 'Black Butler: Emerald Witch Arc', 2025, 13);
// AniList: Kuroshitsuji's sequels are II (a dead end) and Book of Circus, which goes on through an OVA.
const SEQ = { 4898: [II, CIRCUS], 6707: [], 20606: [MURDER], 20850: [SCHOOL], 150000: [WITCH], 170000: [] };
const edges = (id, depth) => ({ edges: (SEQ[id] || []).map((n) => ({ relationType: 'SEQUEL', node: depth ? { ...n, relations: edges(n.id, depth - 1) } : n })) });

const S = (n, c, y) => ({ season_number: n, episode_count: c, air_date: `${y}-07-01` });
const details = { name: 'Black Butler', original_name: '黒執事', first_air_date: '2008-10-02', status: 'Ended',
  seasons: [S(1, 24, 2008), S(2, 12, 2010), S(3, 10, 2014), S(4, 11, 2024), S(5, 13, 2025)] };
const alts = ['Kuroshitsuji', 'Kuroshitsuji: Kishuku Gakkou-hen', 'Kuroshitsuji: Midori no Majo-hen', 'Black Butler: Emerald Witch Arc', 'Black Butler: Book of Circus'];
const tmdb = async (p) => (p.endsWith('/alternative_titles') ? { results: alts.map((title) => ({ title, iso_3166_1: 'JP', type: 'Romaji' })) }
  : p.includes('/season/') ? { episodes: [{ episode_number: 1 }] } : details);

function fakeAniList(down = false) {
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, { body }) => {
    if (down) return new Response('', { status: 500 });
    const { query, variables } = JSON.parse(body);
    const data = query.includes('Page(') ? { Page: { media: [KURO] } } : { Media: { relations: edges(variables.id, 1) } };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return () => { globalThis.fetch = real; };
}
const place = (name, ctx) => anime.resolve(anime.parseAnimeName(name, { file: true }), ctx);

test('a sequel chain that branches still reaches the later arcs', { timeout: 60_000 }, async () => {
  anime.initAnime({});
  const restore = fakeAniList();
  try {
    const ctx = await anime.buildContext('tv', 50712, tmdb);
    assert.deepEqual(ctx.entries.map((e) => e.from), [1, 25, 37, 47, 58]);
    assert.deepEqual(place('[SubsPlease] Kuroshitsuji - Midori no Majo-hen - 01 (1080p) [E2D3E223].mkv', ctx), [{ season: 5, episode: 1 }]);
    assert.deepEqual(place('[SubsPlease] Kuroshitsuji - Kishuku Gakkou-hen - 03 (1080p) [E2D3E223].mkv', ctx), [{ season: 4, episode: 3 }]);
    assert.deepEqual(place('[sam] Kuroshitsuji - 07 [BD 1080p FLAC] [66F75105].mkv', ctx), [{ season: 1, episode: 7 }]);
  } finally { restore(); }
});

test('without AniList an arc name from TMDB is never the show itself', { timeout: 60_000 }, async () => {
  anime.initAnime({});
  const restore = fakeAniList(true);
  try {
    const ctx = await anime.buildContext('tv', 50713, tmdb);
    assert.ok(ctx.keys.includes('kuroshitsuji'));
    assert.equal(ctx.keys.includes('kuroshitsujimidorinomajohen'), false);
    assert.equal(place('[SubsPlease] Kuroshitsuji - Midori no Majo-hen - 01 (1080p) [E2D3E223].mkv', ctx), null);
    assert.deepEqual(place('[SubsPlease] Kuroshitsuji - 05 (1080p) [E2D3E223].mkv', ctx), [{ season: 1, episode: 5 }]);
  } finally { restore(); }
});
