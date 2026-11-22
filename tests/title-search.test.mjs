import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogueSearch, needsExactCatalogueFallback, mergeCatalogueResults } from '../src/title-search.js';

test('catalogue search parses a trailing year without breaking year-shaped titles', () => {
  assert.deepEqual(parseCatalogueSearch('9'), { raw: '9', title: '9', year: null });
  assert.deepEqual(parseCatalogueSearch('9 2009'), { raw: '9 2009', title: '9', year: 2009 });
  assert.deepEqual(parseCatalogueSearch('9 (2009)'), { raw: '9 (2009)', title: '9', year: 2009 });
  assert.deepEqual(parseCatalogueSearch('1917'), { raw: '1917', title: '1917', year: null });
});

test('short titles and explicit years get an exact-search fallback', () => {
  assert.equal(needsExactCatalogueFallback('9'), true);
  assert.equal(needsExactCatalogueFallback('It'), true);
  assert.equal(needsExactCatalogueFallback('Up (2009)'), true);
  assert.equal(needsExactCatalogueFallback('Matrix'), false);
});

test('the film 9 is promoted above noisy multi-search matches', () => {
  const multi = [
    { id: 17654, media_type: 'movie', title: 'District 9', release_date: '2009-08-14' },
    { id: 75219, media_type: 'tv', name: '9-1-1', first_air_date: '2018-01-03' },
  ];
  const movies = [
    { id: 22947, title: '9', original_title: '9', release_date: '2009-08-19' },
    { id: 99999, title: '9', release_date: '2019-01-01' },
  ];

  const plain = mergeCatalogueResults('9', [multi, movies]);
  assert.equal(plain[0].id, 22947);
  assert.equal(plain[0].media_type, 'movie');

  const dated = mergeCatalogueResults('9 (2009)', [multi, movies]);
  assert.equal(dated[0].id, 22947);
  assert.notEqual(dated[1]?.id, 99999);
});

test('a blank TMDB duplicate of a real film is hidden', () => {
  const out = mergeCatalogueResults('Clean, Shaven', [[
    { id: 1479, media_type: 'movie', title: 'Clean, Shaven', release_date: '1995-04-14', vote_count: 109, overview: 'Peter Winter…' },
    { id: 1803766, media_type: 'movie', title: 'CLEAN,SHAVEN', release_date: '1993-09-05', vote_count: 0, overview: '' },
    { id: 9, media_type: 'movie', title: 'Clean Slate', release_date: '2020-01-01', vote_count: 0, overview: '' },
  ]]);
  assert.deepEqual(out.map((x) => x.id), [1479, 9]);
});

test('a famous title beats obscure exact-name matches', () => {
  const out = mergeCatalogueResults('endgame', [[
    { id: 1, media_type: 'tv', name: 'The Endgame', first_air_date: '2022-02-21', vote_count: 130, popularity: 6 },
    { id: 2, media_type: 'movie', title: 'Endgame', release_date: '1983-01-01', vote_count: 59, popularity: 2 },
    { id: 3, media_type: 'movie', title: 'Endgame', release_date: '2015-01-01', vote_count: 9, popularity: 1 },
    { id: 299534, media_type: 'movie', title: 'Avengers: Endgame', release_date: '2019-04-24', vote_count: 29481, popularity: 74 },
    { id: 4, media_type: 'movie', title: 'Highlander: Endgame', release_date: '2000-09-01', vote_count: 491, popularity: 3 },
  ]]);
  assert.equal(out[0].id, 299534);
  assert.deepEqual(out.slice(1, 3).map((x) => x.id), [1, 2]);
});

test('an exact well-known name still wins over a sequel', () => {
  const out = mergeCatalogueResults('dune', [[
    { id: 10, media_type: 'tv', name: 'Dune: Prophecy', first_air_date: '2024-11-17', vote_count: 690, popularity: 28 },
    { id: 11, media_type: 'movie', title: 'Dune: Part Two', release_date: '2024-02-27', vote_count: 9037, popularity: 52 },
    { id: 438631, media_type: 'movie', title: 'Dune', release_date: '2021-09-15', vote_count: 16023, popularity: 44 },
  ]]);
  assert.equal(out[0].id, 438631);
});
