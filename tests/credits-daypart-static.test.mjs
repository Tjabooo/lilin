import test from 'node:test';
import assert from 'node:assert/strict';
import { creditsSong, cornerFit } from '../public/credits-card.js';
import { daypartAt } from '../public/daypart.js';
import { fillGrain, STATIC_MIN_MS } from '../public/channel-static.js';
import { VIBES, createVibes, discoverParams } from '../src/vibes.js';

const album = (title, tracks, extra = {}) => ({ id: title, title, artist: 'Ramin Djawadi', kind: 'score', tracks: tracks.map((t) => (typeof t === 'string' ? { title: t } : t)), ...extra });

test('credits card: a track named for the credits wins, in any album', () => {
  const s = creditsSong([album('Songs', ['Opening', 'Road']), album('Score', ['Main Title', 'The Rains', 'End Credits', 'End Credits (Reprise)'])]);
  assert.equal(s.why, 'credits');
  assert.equal(s.track.title, 'End Credits');
  assert.equal(s.album.title, 'Score');
  assert.equal(creditsSong([album('A', ['Ending Theme'])]).why, 'credits');
  assert.equal(creditsSong([album('A', ['Outro'])]).why, 'credits');
});

test('credits card: a show falls back to its theme, a film to the last track', () => {
  const tracks = ['Main Title', 'Battle', 'Goodbye'];
  assert.deepEqual([creditsSong([album('A', tracks)], { type: 'tv' }).why, creditsSong([album('A', tracks)], { type: 'tv' }).track.title], ['theme', 'Main Title']);
  const film = creditsSong([album('A', tracks)], { type: 'movie' });
  assert.equal(film.why, 'soundtrack');
  assert.equal(film.track.title, 'Goodbye');
  assert.equal(creditsSong([], {}), null);
  assert.equal(creditsSong([album('Empty', [])]), null);
  assert.equal(creditsSong(null), null);
  // "Theme" inside another word doesn't count as the theme
  assert.equal(creditsSong([album('A', ['Themes of Love', 'Last'])], { type: 'tv' }).why, 'soundtrack');
});

test('credits card: the picture lands in the corner, letterbox clipped off', () => {
  // 1600x900 stage, 2.39:1 film: the picture is letterboxed top and bottom
  const f = cornerFit({ W: 1600, H: 900, vw: 1920, vh: 803, width: 400, right: 24, bottom: 100 });
  const picH = 1600 / (1920 / 803);
  assert.ok(Math.abs(f.s - 0.25) < 1e-9);
  assert.ok(Math.abs(f.rect.x - (1600 - 24 - 400)) < 1e-6);
  assert.ok(Math.abs(f.rect.y + f.rect.h - (900 - 100)) < 1e-6);
  assert.ok(Math.abs(f.clip.top - (900 - picH) / 2) < 1e-6 && f.clip.left === 0);
  // the picture's own top-left goes exactly to rect.x/rect.y under the transform (origin 0 0)
  assert.ok(Math.abs(f.clip.left * f.s + f.tx - f.rect.x) < 1e-6);
  assert.ok(Math.abs(f.clip.top * f.s + f.ty - f.rect.y) < 1e-6);
  // narrow screen, top placement, pillarboxed 4:3
  const g = cornerFit({ W: 1600, H: 900, vw: 640, vh: 480, width: 300, top: 64 });
  assert.equal(g.rect.y, 64);
  assert.ok(g.clip.left > 0 && g.clip.top === 0);
  assert.equal(cornerFit({ W: 0, H: 0 }), null);
});

test('daypart: morning, late night, otherwise nothing', () => {
  const at = (hour) => daypartAt(new Date(2026, 10, 19, hour, 30));
  assert.equal(at(0), 'late');
  assert.equal(at(4), 'late');
  assert.equal(at(5), 'morning');
  assert.equal(at(10), 'morning');
  assert.equal(at(11), null);
  assert.equal(at(18), null);
  assert.equal(at(23), null);
});

test('daypart vibes are hidden from the Moods row but open as pages', async () => {
  for (const id of ['morning-short', 'late-night']) {
    const v = VIBES.find((x) => x.id === id);
    assert.ok(v?.hidden, id);
    // every film query keeps films short
    for (const q of v.queries) if (q.movie) assert.ok(Number(discoverParams(v, q, 'movie')['with_runtime.lte']) <= 100, id);
  }
  const vibes = createVibes({ tmdb: async () => ({ results: [] }), mapTitle: (x) => x, language: () => 'en' });
  assert.ok(!vibes.list().some((v) => v.id === 'late-night' || v.id === 'morning-short'));
  const late = await vibes.vibe('late-night');
  assert.equal(late.name, 'Late night: under 95 min');
});

test('channel static: grey grain, a brighter band, a quarter second at least', () => {
  let n = 0;
  const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const data = fillGrain(new Uint32Array(20 * 20), 20, 20, { band: 10, rand });
  for (const px of data) {
    const r = px & 0xff, g = (px >> 8) & 0xff, b = (px >> 16) & 0xff;
    assert.ok(r === g && g === b, 'grey');
    assert.equal(px >>> 24, 0xff);
  }
  const mean = (rows) => rows.reduce((sum, y) => sum + Array.from({ length: 20 }, (_, x) => data[y * 20 + x] & 0xff).reduce((a, b) => a + b, 0), 0) / (rows.length * 20);
  assert.ok(mean([9, 10, 11]) > mean([0, 1, 2, 3, 4, 5]));
  assert.equal(STATIC_MIN_MS, 250);
});
