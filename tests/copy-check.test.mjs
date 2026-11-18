import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCinemaRecording } from '../src/torrents.js';
import { copyVerdict, createCopyCheck } from '../src/copy-check.js';
import { pickBest } from '../src/recommend.js';

test('cinema recordings are recognised by their release names', () => {
  for (const name of ['Project Hail Mary 2026 1080p WEB Line AC3 H264-DJT', 'Movie.2026.HDCAM.x264', 'Movie 2026 HQCAM 720p',
    'Movie (2026) HDTS 1080p', 'Movie.2026.TELESYNC', 'Movie 2026 HDCAMRip', 'Movie.2026.1080p.TS.x264', 'Film 2026 PreDVD',
    'Film 2026 720p HDTC', 'Film.2026.1080p.WEBRip.LiNE.Audio', 'Film 2026 1080p HD-TS', 'Film 2026 CAMRip']) {
    assert.equal(isCinemaRecording(name), true, name);
  }
  for (const name of ['The Thin Red Line 1998 1080p BluRay', 'Line of Duty S06 1080p WEB-DL', 'Tsunami 2026 1080p', 'Camera Obscura 2026 1080p WEB',
    'Project Hail Mary (2026) [2160p DV P7 HDR MULTiLANG MULTISUB BluRay Remux] - BTM [80GB]', 'Movie.2026.1080p.AMZN.WEB-DL.DDP5.1.Atmos.H.264-FLUX',
    'Cast Away 2000 1080p', 'Mad Max Fury Road 2015 2160p UHD BluRay']) {
    assert.equal(isCinemaRecording(name), false, name);
  }
});

test('the verdict: a proper copy, only cinema recordings, or nothing', () => {
  assert.equal(copyVerdict([{ cam: true, seeders: 90 }, { cam: false, seeders: 3 }]), 'ok');
  assert.equal(copyVerdict([{ cam: true, seeders: 90 }, { cam: false, seeders: 1 }]), 'cam');
  assert.equal(copyVerdict([]), 'none');
});

test('recent films are searched once; old and unreleased ones are not', async () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  let searches = 0;
  const films = { 1: { title: 'New', release_date: '2026-10-01' }, 2: { title: 'Old', release_date: '1999-01-01' }, 3: { title: 'Soon', release_date: '2026-11-10' } };
  const check = createCopyCheck({
    details: async (id) => films[id], now: () => now,
    filmOut: (d) => (d.title === 'Soon' ? { out: false, expect: '2027-01-20' } : { out: true }),
    search: async () => { searches++; return [{ name: 'New 2026 1080p HDTS', cam: true, seeders: 40 }, { name: 'Other 2026 1080p WEB-DL', cam: false, seeders: 40 }]; },
    matches: (q, name) => name.startsWith(q.split(' ')[0]),
  });
  assert.deepEqual(await check.check(1), { verdict: 'cam', proper: 0, cams: 1 });
  await check.check(1);
  assert.equal(searches, 1, 'cached');
  assert.equal((await check.check(2)).verdict, 'skip');
  assert.deepEqual(await check.check(3), { verdict: 'soon', expect: '2027-01-20' });
  assert.equal(searches, 1);
});

test('a cinema recording is only picked when someone said yes and nothing proper exists', () => {
  const parseName = (n) => ({ title: n.split(' 2026')[0], year: 2026, season: null });
  const cam = { name: 'Film 2026 1080p HDTS', cam: true, seeders: 80, quality: '1080p', size: 2e9, tags: [] };
  const want = { type: 'movie', title: 'Film', year: 2026 };
  assert.equal(pickBest([cam], want, parseName).pick, null);
  assert.equal(pickBest([cam], { ...want, allowCam: true }, parseName).pick?.name, cam.name);
  const web = { name: 'Film 2026 1080p WEB-DL', cam: false, seeders: 30, quality: '1080p', size: 4e9, tags: [] };
  assert.equal(pickBest([cam, web], { ...want, allowCam: true }, parseName).pick?.name, web.name);
});
