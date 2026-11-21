import test from 'node:test';
import assert from 'node:assert/strict';
import { createMagicSearch, parseCandidates, rank, normalizeQuery } from '../src/magic-search.js';

const db = {
  'Breaking Bad': { id: 1396, type: 'tv', title: 'Breaking Bad', year: 2008, overview: 'A chemistry teacher with cancer cooks meth with a former student.' },
  'Weeds': { id: 186, type: 'tv', title: 'Weeds', year: 2005, overview: 'A widowed mother sells marijuana.' },
  'Half Baked': { id: 9096, type: 'movie', title: 'Half Baked', year: 1998, overview: 'Stoners sell weed to free a friend.' },
};

test('candidates are cleaned: types, years, duplicates', () => {
  const got = parseCandidates({ results: [
    { title: 'Breaking Bad', year: '2008', type: 'series' },
    { title: 'breaking bad', year: 2008, type: 'tv' },
    { title: 'Half Baked', year: 3000, type: 'film' },
    { title: '' },
    { name: 'Weeds' },
  ] });
  assert.deepEqual(got, [
    { title: 'Breaking Bad', year: 2008, type: 'tv' },
    { title: 'Half Baked', year: null, type: 'movie' },
    { title: 'Weeds', year: null, type: null },
  ]);
  assert.deepEqual(parseCandidates(null), []);
});

test('the judge reorders, clear misses drop out, and without scores the first order stays', () => {
  const titles = [db.Weeds, db['Half Baked'], db['Breaking Bad'], { ...db.Weeds, id: 2 }, { ...db.Weeds, id: 3 }];
  const ranked = rank(titles, { 1: { match: 20, why: 'drugs' }, 2: { match: 5 }, 3: { match: 96, why: 'Walter cooks with Jesse' }, 4: { match: 8 }, 5: { match: 30 } });
  assert.deepEqual(ranked.map((t) => t.id), [1396, 3]);
  assert.equal(ranked[0].why, 'Walter cooks with Jesse');
  assert.deepEqual(rank(titles.slice(0, 2), null).map((t) => t.id), [186, 9096]);
});

test('a search: model names, TMDB checks, judge scores; made-up titles vanish; answers are cached', async () => {
  const calls = [];
  const magic = createMagicSearch({
    chat: async (system, user) => {
      calls.push(user);
      if (!user.includes('Candidates:')) return { results: [{ title: 'Weeds', type: 'tv' }, { title: 'The Meth Teacher', year: 2011 }, { title: 'Breaking Bad', year: 2008, type: 'tv' }] };
      assert.match(user, /1\. Weeds \(2005\), TV series: A widowed mother/);
      return { 1: { match: 30, why: 'drugs, but no teacher' }, 2: { match: 97, why: 'a chemistry teacher cooks meth with his ex-student' } };
    },
    find: async ({ title }) => db[title] || null,
  });
  const a = await magic.search('  teacher makes   meth with student ');
  assert.equal(a.sure, true);
  assert.deepEqual(a.results.map((t) => t.title), ['Breaking Bad', 'Weeds']);
  assert.equal(a.results[0].match, 97);
  assert.equal(calls[0], 'teacher makes meth with student');
  await magic.search('Teacher makes meth with student');
  assert.equal(calls.length, 2, 'same wording again comes from the cache');
});

test('a busy machine says so instead of searching, and a failed judge still gives titles', async () => {
  const busy = createMagicSearch({ chat: async () => assert.fail('no model while busy'), find: async () => null, busy: async () => true });
  await assert.rejects(busy.search('a heist inside dreams'), (e) => e.code === 'busy');
  const noJudge = createMagicSearch({
    chat: async (s, user) => { if (user.includes('Candidates:')) throw new Error('timeout'); return { results: [{ title: 'Breaking Bad' }] }; },
    find: async ({ title }) => db[title] || null,
  });
  const r = await noJudge.search('teacher makes meth');
  assert.deepEqual(r.results.map((t) => t.title), ['Breaking Bad']);
  assert.equal(r.sure, false);
  assert.equal(normalizeQuery(' a\n b '), 'a b');
});
