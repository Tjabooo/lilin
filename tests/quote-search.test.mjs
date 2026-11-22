import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createQuoteSearch, parseSrt, lineText, pickSidecars, ftsQueries, scoreLine, rankVideos, words, decodeSubtitle } from '../src/quote-search.js';

const srt = (cues) => cues.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}`).join('\n\n') + '\n';
function stamp(s) {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

test('parseSrt keeps what is said, merges same-timed halves and drops sounds', () => {
  const cues = parseSrt(srt([
    [1, 2, '<i>Hello there.</i>'],
    [3, 4, '[door slams]'],
    [5, 6.5, '{\\an8}I drink your'],
    [5, 6.5, 'milkshake!'],
    [7, 8, '♪ ♪'],
    [9, 10, '- (laughs)\n- Pivot!'],
    [11, 12, 'Translator{ note} kept'],
  ]));
  assert.deepEqual(cues.map((c) => c.text), ['Hello there.', 'I drink your\nmilkshake!', '- (laughs)\n- Pivot!', 'Translator kept']);
  assert.equal(cues[1].start, 5000);
  assert.equal(cues[1].end, 6500);
});

test('lineText leaves sound-only lines empty but keeps lyrics', () => {
  assert.equal(lineText('[MUSIC PLAYING]'), '');
  assert.equal(lineText('(sighs) ...'), '');
  assert.equal(lineText('♪ I drink your milkshake ♪'), '♪ I drink your milkshake ♪');
});

test('decodeSubtitle reads UTF-8, UTF-16 and Windows-1252', () => {
  assert.equal(decodeSubtitle(Buffer.from('﻿Café\r\nok', 'utf8')), 'Café\nok');
  assert.equal(decodeSubtitle(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Hej då', 'utf16le')])), 'Hej då');
  assert.equal(decodeSubtitle(Buffer.from([0x43, 0x61, 0x66, 0xe9])), 'Café');
});

test('pickSidecars prefers the plain file, then a full one, forced and AI ones last', () => {
  const entries = ['Show.S01E01.mp4', 'Show.S01E01.en.forced.srt', 'Show.S01E01.en.sdh.srt', 'show.s01e01.sv.ai.srt', 'Show.S01E01.de.srt', 'Show.S01E02.en.srt'];
  const picks = pickSidecars(entries, 'Show.S01E01', ['en', 'sv', 'fr']);
  assert.equal(picks.get('en'), 'Show.S01E01.en.sdh.srt');
  assert.equal(picks.get('sv'), 'show.s01e01.sv.ai.srt');
  assert.equal(picks.has('fr'), false);
  assert.equal(pickSidecars([...entries, 'Show.S01E01.en.srt'], 'Show.S01E01', ['en']).get('en'), 'Show.S01E01.en.srt');
});

test('ftsQueries quotes words, makes the last one a prefix and refuses too little', () => {
  assert.equal(ftsQueries('a'), null);
  assert.equal(ftsQueries('hi'), null);
  assert.equal(ftsQueries('?!'), null);
  assert.deepEqual(ftsQueries('Pivot'), { words: ['pivot'], prefix: true, phrase: '"pivot"*', all: null });
  const q = ftsQueries('I drink your "milk');
  assert.equal(q.phrase, '"i drink your milk"*');
  assert.equal(q.all, '"i" "drink" "your" "milk"*');
  assert.equal(ftsQueries('drink your I').phrase, '"drink your i"'); // a one-letter last word isn't a prefix
  assert.deepEqual(words('Où est-ce? I’m HERE'), ['ou', 'est', 'ce', 'i', 'm', 'here']);
});

test('scoreLine: exact phrase beats a prefix beats loose words; short lines win', () => {
  const q = words('i drink your milkshake');
  const exact = scoreLine('I drink your milkshake!', q);
  const buried = scoreLine('Listen, I drink your milkshake, and then I go home to bed.', q);
  const loose = scoreLine('Your milkshake? I drink it.', q);
  assert.ok(exact > buried && buried > loose && loose > 0);
  assert.ok(scoreLine('I drink your milkshake', words('i drink your milk')) < exact);
  assert.equal(scoreLine('Nothing like it', q), 0);
  assert.equal(scoreLine('I drink your milk', q, false), 0);
});

test('rankVideos keeps one language per video, the viewer’s first, and counts repeats', () => {
  const q = words('pivot');
  const rows = [
    { id: 1, key: 'friends-s05e16', lang: 'en', start: 60000, end: 61000, text: 'Pivot!' },
    { id: 2, key: 'friends-s05e16', lang: 'en', start: 62000, end: 63000, text: 'Pivot! Pivot!' },
    { id: 3, key: 'friends-s05e16', lang: 'en', start: 64000, end: 65000, text: 'PIVOT!' },
    { id: 4, key: 'friends-s05e16', lang: 'sv', start: 60000, end: 61000, text: 'Pivot!' },
    { id: 5, key: 'other', lang: 'en', start: 1000, end: 2000, text: 'We need to pivot the whole business plan.' },
  ];
  const sv = rankVideos(rows, q, { langs: ['sv', 'en'] });
  assert.equal(sv[0].key, 'friends-s05e16');
  assert.equal(sv[0].lang, 'sv');
  const en = rankVideos(rows, q, { langs: ['en'] });
  assert.equal(en[0].lang, 'en');
  assert.equal(en[0].count, 3);
  assert.deepEqual(en[0].times, [60000, 62000, 64000]);
  assert.equal(en[0].best.id, 1);
  assert.equal(en[1].key, 'other');
});

function library(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-lines-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const media = path.join(dir, 'media');
  fs.mkdirSync(path.join(media, 'Blood'), { recursive: true });
  fs.mkdirSync(path.join(media, 'Friends', 'Season 5'), { recursive: true });
  const film = path.join(media, 'Blood', 'There.Will.Be.Blood.2007.mp4');
  const ep = path.join(media, 'Friends', 'Season 5', 'Friends.S05E16.mp4');
  for (const f of [film, ep]) fs.writeFileSync(f, '');
  fs.writeFileSync(path.join(media, 'Blood', 'There.Will.Be.Blood.2007.en.srt'), srt([
    [9000, 9003, 'Drainage!'],
    [9004, 9006, 'I drink your milkshake!'],
    [9006.5, 9008, 'I drink it up!'],
    [9100, 9101, '[slurping]'],
  ]));
  fs.writeFileSync(path.join(media, 'Friends', 'Season 5', 'Friends.S05E16.en.srt'), srt([
    [60, 61, 'Here we go.'],
    [62, 63, 'Pivot!'],
    [64, 65, 'Pivot! Pivot!'],
  ]));
  fs.writeFileSync(path.join(media, 'Friends', 'Season 5', 'Friends.S05E16.sv.srt'), srt([[62, 63, 'Svängom!']]));
  fs.writeFileSync(path.join(media, 'Friends', 'Season 5', 'Friends.S05E16.de.srt'), srt([[62, 63, 'Drehen!']]));
  const items = [
    { key: 'Blood/There.Will.Be.Blood.2007', id: 'film', file: film, kind: 'film', title: 'There Will Be Blood' },
    { key: 'Friends/Season 5/Friends.S05E16', id: 'ep', file: ep, kind: 'episode', title: 'Friends', season: 5, episode: 16 },
  ];
  return { dir, media, film, ep, items };
}

test('the index reads the library, finds lines with context and follows changes', async (t) => {
  const lib = library(t);
  let items = lib.items;
  const logs = [];
  const qs = createQuoteSearch({ cacheDir: path.join(lib.dir, 'cache'), library: async () => items, languages: () => ['en', 'sv'], log: (m) => logs.push(m) });
  t.after(() => qs.close());
  assert.equal(qs.ready(), false);
  assert.deepEqual(await qs.round(), { indexed: 3, removed: 0 });
  assert.equal(qs.ready(), true);
  assert.equal(qs.status().files, 3);

  const [hit, ...rest] = qs.search('i drink your milk', { items, langs: ['en'] });
  assert.equal(rest.length, 0);
  assert.equal(hit.id, 'film');
  assert.equal(hit.title, 'There Will Be Blood');
  assert.deepEqual(hit.line, { at: 9004, end: 9006, text: 'I drink your milkshake!', before: 'Drainage!', after: 'I drink it up!' });
  assert.equal(hit.count, 1);

  const pivot = qs.search('PIVOT', { items, langs: ['en'] });
  assert.equal(pivot[0].id, 'ep');
  assert.equal(pivot[0].count, 2);
  assert.deepEqual(pivot[0].times, [62, 64]);
  assert.equal(pivot[0].line.before, 'Here we go.');
  assert.equal(qs.search('drehen', { items, langs: ['de'] }).length, 0); // German isn't one of the languages
  assert.equal(qs.search('svangom', { items, langs: ['sv'] })[0].lang, 'sv');
  assert.equal(qs.search('pivot', { items: [items[0]], langs: ['en'] }).length, 0); // only what this person may find
  assert.equal(qs.search('slurping', { items, langs: ['en'] }).length, 0); // sounds aren't lines

  // Nothing changed: nothing is read again.
  assert.deepEqual(await qs.round(), { indexed: 0, removed: 0 });
  // A re-timed file is read again; a deleted one is forgotten.
  const filmSrt = path.join(lib.media, 'Blood', 'There.Will.Be.Blood.2007.en.srt');
  fs.writeFileSync(filmSrt, srt([[100, 102, 'I drink your milkshake!']]));
  fs.utimesSync(filmSrt, new Date(), new Date(Date.now() + 5000));
  fs.rmSync(path.join(lib.media, 'Friends', 'Season 5', 'Friends.S05E16.sv.srt'));
  assert.deepEqual(await qs.round(), { indexed: 1, removed: 1 });
  assert.equal(qs.search('milkshake', { items, langs: ['en'] })[0].line.at, 100);
  assert.equal(qs.search('svangom', { items, langs: ['sv'] }).length, 0);

  // The library suddenly empty or halved (a drive away): nothing is forgotten.
  items = [];
  assert.deepEqual(await qs.round(), { indexed: 0, removed: 0 });
  assert.equal(qs.status().files, 2);
  // A video really gone: its lines go.
  items = [lib.items[0]];
  assert.deepEqual(await qs.round(), { indexed: 0, removed: 1 });
  assert.equal(qs.search('pivot', { items: lib.items, langs: ['en'] }).length, 0);
});

test('the index survives a restart and rebuilds on a new version', async (t) => {
  const lib = library(t);
  const cacheDir = path.join(lib.dir, 'cache');
  const first = createQuoteSearch({ cacheDir, library: async () => lib.items, languages: () => ['en'] });
  await first.round();
  first.close();
  const again = createQuoteSearch({ cacheDir, library: async () => lib.items, languages: () => ['en'] });
  t.after(() => again.close());
  again.start(); again.stop(); // opens the file without a round
  assert.equal(again.search('pivot', { items: lib.items })[0].id, 'ep');
  assert.deepEqual(await again.round(), { indexed: 0, removed: 0 });
});

test('a tidy-up hook sees the text before it is indexed', async (t) => {
  const lib = library(t);
  const seen = [];
  const qs = createQuoteSearch({ cacheDir: path.join(lib.dir, 'cache'), library: async () => lib.items, languages: () => ['en'],
    clean: (text, file, lang) => { seen.push(lang); return text.replace('Pivot!', 'Turn!'); } });
  t.after(() => qs.close());
  await qs.round();
  assert.deepEqual(seen, ['en', 'en']);
  assert.equal(qs.search('turn', { items: lib.items })[0].id, 'ep');
});

test('a feature-length file indexes and searches quickly', async (t) => {
  const lib = library(t);
  const lines = Array.from({ length: 1800 }, (_, i) => [i * 3, i * 3 + 2, `Line number ${i} about the ${['ranch', 'oil', 'church', 'boy'][i % 4]} and more words here`]);
  fs.writeFileSync(path.join(lib.media, 'Blood', 'There.Will.Be.Blood.2007.en.srt'), srt(lines));
  const qs = createQuoteSearch({ cacheDir: path.join(lib.dir, 'cache'), library: async () => lib.items, languages: () => ['en'] });
  t.after(() => qs.close());
  let t0 = performance.now();
  await qs.round();
  const indexMs = performance.now() - t0;
  t0 = performance.now();
  const hits = qs.search('about the oil', { items: lib.items });
  const searchMs = performance.now() - t0;
  assert.equal(hits[0].id, 'film');
  assert.equal(hits[0].times.length, 8);
  assert.ok(hits[0].count > 400);
  assert.ok(indexMs < 3000, `indexing took ${indexMs} ms`);
  assert.ok(searchMs < 500, `search took ${searchMs} ms`);
});
