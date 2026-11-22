import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBest } from '../src/recommend.js';
import { parseTpb } from '../src/torrents.js';
import { startSmartJob, smartJob } from '../src/smart-download.js';

import { parseName } from '../src/release-name.js';

const GB = 1024 ** 3;
let n = 0;
// Search results as torrents.js makes them, from apibay-shaped rows.
const results = (rows) => parseTpb(rows.map(([name, seeders, size = 2 * GB, status = 'member']) => ({
  info_hash: (++n).toString(16).padStart(40, '0'), name, seeders, leechers: 0, size, category: '207', status,
})), 'all');
const pick = (rows, want) => pickBest(results(rows), want, parseName).pick?.name ?? null;
const film = { type: 'movie', title: 'The Matrix', year: 1999 };

test('a film never gets a 720p download while a 1080p or 4K one exists', () => {
  assert.equal(pick([
    ['The.Matrix.1999.720p.BluRay.x264', 2000],
    ['The.Matrix.1999.1080p.BluRay.x264', 40],
    ['The.Matrix.1999.2160p.UHD.BluRay.x265', 300, 18 * GB],
  ], film), 'The.Matrix.1999.1080p.BluRay.x264', '1080p comes first');
  assert.equal(pick([
    ['The.Matrix.1999.720p.BluRay.x264', 2000],
    ['The.Matrix.1999.2160p.UHD.BluRay.x265', 300, 18 * GB],
  ], film), 'The.Matrix.1999.2160p.UHD.BluRay.x265', '4K when there is no 1080p');
  assert.equal(pick([
    ['The.Matrix.1999.720p.BluRay.x264', 2000],
    ['The.Matrix.1999.1080p.WEB-DL', 3],
  ], film), 'The.Matrix.1999.1080p.WEB-DL', 'A thin 1080p still beats a busy 720p');
  assert.equal(pick([
    ['The.Matrix.1999.720p.BluRay.x264', 2000],
    ['The.Matrix.1999.1080p.WEB-DL', 1],
  ], film), 'The.Matrix.1999.720p.BluRay.x264', 'One seeder is as good as none, so 720p it is');
  const low = pickBest(results([['The.Matrix.1999.720p.BluRay.x264', 20]]), film, parseName);
  assert.match(low.why, /Nothing in 1080p, 1440p or 4K/);
});

test('1440p aliases are classified and stripped from titles; generic 2K is not assumed to be 1440p', () => {
  for (const alias of ['1440p', 'QHD', '2560x1440', '2560×1440']) {
    const name = `The.Matrix.${alias}.WEB-DL`;
    assert.equal(results([[name, 30]])[0].quality, '1440p', alias);
    assert.equal(parseName(name, { file: false }).title, 'The Matrix', alias);
  }
  assert.equal(results([['The.Matrix.2K.WEB-DL', 30]])[0].quality, null);
});

test('1440p participates in Auto ranking and explicit film and season choices are strict', () => {
  const rows = [['The.Matrix.1999.720p.WEB', 1000], ['The.Matrix.1999.1440p.WEB', 10]];
  assert.equal(pick(rows, film), rows[1][0], 'Auto includes 1440p before lower resolutions');
  assert.equal(pick([...rows, ['The.Matrix.1999.1080p.WEB', 500]], { ...film, prefer: '1440p' }), rows[1][0]);
  assert.equal(pick(rows, { ...film, quality: '1440p' }), rows[1][0]);
  assert.equal(pick(rows.slice(0, 1), { ...film, quality: '1440p' }), null);
  const show = { type: 'tv', title: 'Severance', season: 2, quality: '1440p' };
  assert.equal(pick([['Severance.S02.1080p.WEB', 100]], show), null);
  assert.equal(pick([['Severance.S02.QHD.WEB', 3], ['Severance.S02.1080p.WEB', 100]], show), 'Severance.S02.QHD.WEB');
});

test('4K first when Settings prefers it; healthy torrents before thin ones', () => {
  const rows = [['The.Matrix.1999.1080p.BluRay.x264', 400], ['The.Matrix.1999.2160p.UHD.BluRay.x265', 60, 20 * GB]];
  assert.equal(pick(rows, { ...film, prefer: '2160p' }), 'The.Matrix.1999.2160p.UHD.BluRay.x265');
  assert.equal(pick([
    ['The.Matrix.1999.1080p.WEB-DL', 3],
    ['The.Matrix.1999.2160p.UHD.BluRay.x265', 60, 20 * GB],
  ], film), 'The.Matrix.1999.2160p.UHD.BluRay.x265', 'A 3-seeder 1080p loses to a healthy 4K');
});

test('an explicit recommended quality never falls back to another resolution', () => {
  const rows = [['The.Matrix.1999.720p.BluRay', 2000], ['The.Matrix.1999.1080p.BluRay', 300], ['The.Matrix.1999.2160p.BluRay', 3, 20 * GB]];
  assert.equal(pick(rows, { ...film, quality: '720p' }), rows[0][0]);
  assert.equal(pick(rows, { ...film, quality: '2160p' }), rows[2][0], 'Selected 4K can use a thin but live release');
  assert.equal(pick(rows.slice(0, 2), { ...film, quality: '2160p' }), null);
  assert.match(pickBest(results(rows.slice(0, 2)), { ...film, quality: '2160p' }, parseName).why, /No matching 4K/);
  assert.equal(pick([['Severance.S02.720p.WEB', 40], ['Severance.S02.1080p.WEB', 100]], {
    type: 'tv', title: 'Severance', season: 2, quality: '720p',
  }), 'Severance.S02.720p.WEB');
});

for (const quality of ['2160p', '1440p']) test(`episode fallback respects an exact ${quality} and reports unavailable episodes`, async () => {
  const added = [];
  const id = startSmartJob({ type: 'tv', title: 'Severance', season: 2, episodes: [1, 2], want: { quality } }, {
    parseName, seasonEpisodes: async () => ({ episodes: [{ episode: 1, aired: true }, { episode: 2, aired: true }] }),
    haveEpisodes: async () => new Set(), searchTorrents: async (query) => ({ results: results([
      [query.replace(/ /g, '.') + '.1080p.WEB', 500], ...(query.endsWith('E01') ? [[query.replace(/ /g, '.') + `.${quality}.WEB`, 2, 20 * GB]] : []),
    ]) }), addDownload: async (download) => added.push(download),
  });
  for (let tries = 0; smartJob(id).state === 'running' && tries < 200; tries++) await new Promise((r) => setTimeout(r, 5));
  const job = smartJob(id);
  assert.equal(job.state, 'done'); assert.deepEqual(job.unavailable.map((u) => u.episode), [2]);
  assert.deepEqual(job.added.map((r) => r.quality), [quality]); assert.equal(added.length, 1);
});

test('wrong films, cams, remuxes, burned-in subtitles and fakes are passed over', () => {
  assert.equal(pick([
    ['The.Matrix.Reloaded.2003.1080p.BluRay', 5000],
    ['The.Matrix.Resurrections.2021.1080p', 5000],
    ['The.Matrix.1999.HDCAM.1080p', 5000],
    ['The.Matrix.1999.1080p.BluRay.REMUX.AVC', 900, 30 * GB],
    ['The.Matrix.1999.1080p.HC.WEBRip', 900],
    ['The.Matrix.1999.1080p.BluRay.mkv', 900, 0.1 * GB],
    ['The.Matrix.1999.1080p.BluRay.x264', 150],
  ], film), 'The.Matrix.1999.1080p.BluRay.x264');
  assert.equal(pick([['The.Matrix.Reloaded.2003.1080p.BluRay', 5000]], film), null);
  assert.equal(pick([['The.Matrix.1987.1080p', 5000]], film), null, 'Same name, another year');
});

test('a show gets a pack of exactly the season asked for', () => {
  const show = { type: 'tv', title: 'Severance', season: 2 };
  assert.equal(pick([
    ['Severance.S02E03.1080p.WEB.h264', 5000],
    ['Severance.S01-S02.1080p.WEB', 5000],
    ['Severance.S01.1080p.WEB', 5000],
    ['Severance.S02.720p.WEB', 900],
    ['Severance.S02.1080p.ATVP.WEB-DL.DDP5.1.H.264', 120],
  ], show), 'Severance.S02.1080p.ATVP.WEB-DL.DDP5.1.H.264');
  assert.equal(pick([['Severance Season 2 Complete 1080p', 30]], show), 'Severance Season 2 Complete 1080p');
  assert.equal(pick([['Severance.S02E01.1080p', 300]], show), null, 'Episodes only: no pack to recommend');
  const office = { type: 'tv', title: 'The Office', season: 3 };
  assert.equal(pick([['The.Office.US.S03.1080p.BluRay.x265', 378], ['The.Office.Ladies.S03.1080p', 900]], office),
    'The.Office.US.S03.1080p.BluRay.x265', 'A country tag is fine; another show is not');
  assert.equal(pick([['The.Office.US.S03.1080p.BluRay.x265', 378], ['The.Office.S03.1080p.WEB', 40]], office),
    'The.Office.S03.1080p.WEB', 'The plain name wins over a country-tagged one');
});

test('recommended season packs support House / House MD aliases without accepting other House shows', () => {
  const want = { type: 'tv', title: 'House', season: 2 };
  assert.equal(pick([['House.MD.S02.1080p.WEB-DL', 15], ['House.of.the.Dragon.S02.1080p.WEB', 5000]], want), 'House.MD.S02.1080p.WEB-DL');
  assert.equal(pick([['House.of.the.Dragon.S02.1080p.WEB', 5000]], want), null);
});

// ---- Best Quality has to play while it downloads (streamable) ----
const flash = { type: 'movie', title: 'The Flash', year: 2023, profile: 'best', runtime: 144 };
test('Best Quality: a remux on a thin swarm gives way to a web download that keeps up', () => {
  // 55 GB over 144 min needs ~6.4 MB/s (7.6 with the margin); 24 seeders are guessed at ~4.8 MB/s.
  assert.equal(pick([
    ['The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN', 24, 55 * GB],
    ['The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 400, 18 * GB],
    ['The.Flash.2023.1080p.WEB-DL.DDP5.1.H.264-FLUX', 900, 7 * GB],
  ], flash), 'The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX');
});

test('Best Quality: a remux with a swarm that keeps up still wins', () => {
  assert.equal(pick([
    ['The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN', 150, 55 * GB],
    ['The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 400, 18 * GB],
  ], flash), 'The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN');
});

test('Best Quality: nothing keeps up, so the best picture stays', () => {
  assert.equal(pick([
    ['The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN', 24, 55 * GB],
    ['The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 12, 18 * GB],
  ], flash), 'The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN');
});

test('Best Quality upgrades (stream false) ignore the swarm speed', () => {
  assert.equal(pick([
    ['The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN', 24, 55 * GB],
    ['The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 400, 18 * GB],
  ], { ...flash, stream: false }), 'The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN');
});

test('Best Quality in a chosen resolution also picks one that keeps up', () => {
  assert.equal(pick([
    ['The.Flash.2023.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.Atmos-TRiToN', 24, 55 * GB],
    ['The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 400, 18 * GB],
  ], { ...flash, quality: '2160p' }), 'The.Flash.2023.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX');
});

// Oliver 2026-11-20: a seeder floor of 10. Black Swan's first watch took a 5-seed AV1 copy, then an 18-seed one that
// never sent a byte, while 130 and 282 seeders were in the same list.
test('nothing under 10 seeders while a release with 10 or more exists; otherwise the most-seeded', () => {
  const swan = { type: 'movie', title: 'Black Swan', year: 2010, runtime: 108 };
  const rows = [
    ['Black.Swan.2010.1080p.BluRay.10bit.AV1.Opus.5.1.RFranklin', 5, 6 * GB],
    ['Black.Swan.2010.1080p.BluRay.x264.DTS-SARTRE', 9, 4.4 * GB],
    ['Black Swan 2010 1080p BluRay x264 DD5 1-Pahe in', 18, 4.2 * GB],
    ['Black Swan (2010) 1080p BRRip 5.1 x264 -YTS', 130, 2 * GB],
    ['Black Swan 2010 1080p BluRay DDP 5 1 10bit H 265-iVy', 70, 1.5 * GB],
    ['Black Swan (2010) (1080p BluRay x265 HEVC 10bit AAC 5.1 afm72)', 282, 5.3 * GB],
  ];
  for (const profile of ['balanced', 'best', 'save']) {
    const name = pick(rows, { ...swan, profile });
    assert.ok(!/RFranklin|SARTRE/.test(name), `${profile}: ${name}`);
    // A first watch: the lively H.264 copy ("H 265" is HEVC too), not the thin one.
    assert.equal(pick(rows, { ...swan, profile, cold: true }), 'Black Swan (2010) 1080p BRRip 5.1 x264 -YTS', profile);
  }
  assert.equal(pick([
    ['Rare.Film.2001.1080p.BluRay.x264-A', 3], ['Rare.Film.2001.1080p.BluRay.x264-B', 7], ['Rare.Film.2001.1080p.WEB.x264-C', 4],
  ], { type: 'movie', title: 'Rare Film', year: 2001 }), 'Rare.Film.2001.1080p.BluRay.x264-B', 'none has 10: the most-seeded');
});

test('a starved "1080p" pack loses to a real one, but is still picked when it is all there is', () => {
  // Rings of Power S02 (2026-11-22): 0.75 GB per 70-minute episode in x265 is about 1.1 Mbit/s of picture.
  const show = { type: 'tv', title: 'Severance', season: 2, episodes: 8, runtime: 70 };
  const starved = ['Severance.S02.1080p.WEBRip.AAC5.1.x265-TINY', 500, 6 * GB];
  const proper = ['Severance.S02.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb', 40, 28 * GB];
  assert.equal(pick([starved, proper], show), proper[0], 'the real bitrate wins over more seeders');
  assert.equal(pick([starved], show), starved[0], 'nothing better: the starved one still comes');
  assert.equal(pick([starved, proper], { ...show, profile: 'save' }), starved[0], 'Save Space keeps small');
  const hevc = ['Severance.S02.1080p.WEB-DL.x265-GOOD', 300, 14 * GB];
  assert.equal(pick([starved, hevc], show), hevc[0], 'a solid HEVC encode passes the floor');
});
