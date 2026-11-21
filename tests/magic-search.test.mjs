import test from 'node:test';
import assert from 'node:assert/strict';
import { createMagicSearch, readQuery, coverage, stem, normalizeQuery } from '../src/magic-search.js';

test('reading a description: filler words out, type and decade hints, ideas spotted', () => {
  const q = readQuery('the show where a guy relives the same day over and over in the 90s');
  assert.equal(q.type, 'tv');
  assert.equal(q.decade, 1990);
  assert.deepEqual(q.terms.map((t) => t.word), ['time loop', 'guy', 'relives', 'same', 'day']);
  assert.ok(q.terms[1].alts.includes('man'), 'guy also matches man');
  assert.equal(readQuery('a film about a dog').type, 'movie');
  assert.deepEqual(readQuery('the one with the').terms, []);
});

test('word forms meet: kills/killing, lives/living, neighbours/neighbors', () => {
  assert.equal(stem('kills'), 'kill');
  assert.equal(stem('killing'), 'kill');
  const text = new Set(['living', 'neighbors', 'methamphetamine'].map((w) => readQuery(w).terms[0].alts[0]));
  const { matched } = coverage(readQuery('lives next to neighbours selling meth').terms, text);
  assert.deepEqual(matched, ['lives', 'neighbours', 'meth']);
});

const pages = (list) => ({ query: { pages: list.map(([qid, title, extract], index) => ({ index: index + 1, title, extract, pageprops: { wikibase_item: qid } })) } });
const tmdb = {
  Q1079: { id: 1396, type: 'tv', title: 'Breaking Bad', year: 2008, votes: 16000, overview: 'A chemistry teacher diagnosed with cancer.' },
  Q2: { id: 186, type: 'tv', title: 'Weeds', year: 2005, votes: 1500, overview: 'A widowed mother sells marijuana.' },
  Q3: { id: 9, type: 'movie', title: 'Teachers', year: 1984, votes: 90, overview: 'A teacher and a student.' },
};

test('a search: Wikipedia finds, plots decide, TMDB keeps films and series; cached per wording', async () => {
  const asked = [];
  const magic = createMagicSearch({
    wiki: async (lang, params) => {
      asked.push(params.gsrsearch);
      assert.match(params.gsrsearch, /hastemplate:"Infobox film\|Infobox television/);
      return pages([
        ['Q3', 'Teachers (film)', 'A comedy about a teacher at a high school and a student.'],
        ['Q2', 'Weeds (TV series)', 'A widowed mother sells marijuana in the suburbs.'],
        ['Q1079', 'Breaking Bad', 'A high school chemistry teacher turned methamphetamine manufacturer, with his former student.'],
        ['Q99', 'Breaking Bad (novel)', 'Not on TMDB: a teacher, meth and a student.'],
      ]);
    },
    findTmdb: async (qid) => tmdb[qid] || null,
    extra: async (t) => ({ text: t.id === 1396 ? 'meth lab drug dealer' : '' }),
  });
  const a = await magic.search('  teacher makes   meth with his student ');
  assert.deepEqual(a.results.map((t) => t.title), ['Breaking Bad', 'Teachers']);
  assert.deepEqual(a.results[0].matched, ['teacher', 'meth', 'student']);
  assert.equal(a.sure, true);
  assert.deepEqual(asked, ['teacher meth student', 'teacher OR meth OR methamphetamine OR crystal OR student'].map((q) => `${q} hastemplate:"Infobox film|Infobox television|Infobox animanga/Header"`));
  await magic.search('Teacher makes meth with his student');
  assert.equal(asked.length, 2, 'same wording again comes from the cache');
});

test('Swedish asks both Wikipedias; no Wikipedia at all is an error, not an empty answer', async () => {
  const langs = [];
  const sv = createMagicSearch({ wiki: async (lang) => { langs.push(lang); return pages([]); }, findTmdb: async () => null });
  assert.deepEqual((await sv.search('lärare kokar meth', { lang: 'sv' })).results, []);
  assert.deepEqual([...new Set(langs)], ['sv', 'en']);
  const down = createMagicSearch({ wiki: async () => { throw new Error('HTTP 429'); }, findTmdb: async () => null });
  await assert.rejects(down.search('a heist inside dreams'), (e) => e.code === 'offline');
  assert.equal(normalizeQuery(' a\n b '), 'a b');
});
