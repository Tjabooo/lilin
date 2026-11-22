import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLIDAYS, holidayAt, tiltForYou } from '../public/holiday.js';
import { VIBES } from '../src/vibes.js';

const day = (m, d) => new Date(2026, m - 1, d, 12);

test('every holiday is a seasonal vibe that is on during its whole window', () => {
  for (const x of HOLIDAYS) {
    const v = VIBES.find((y) => y.id === x.vibe);
    assert.ok(v, `${x.vibe} exists`);
    assert.ok(v.months.includes(x.from[0]) && v.months.includes(x.to[0]), `${x.vibe} months cover its window`);
  }
});

test('holidayAt picks the right holiday, wraps over New Year, and is null between', () => {
  assert.equal(holidayAt(day(10, 20))?.name, 'halloween');
  assert.equal(holidayAt(day(11, 22))?.name, 'christmas');
  assert.equal(holidayAt(day(12, 24))?.name, 'christmas');
  assert.equal(holidayAt(day(12, 31))?.name, 'new-year');
  assert.equal(holidayAt(day(1, 1))?.name, 'new-year');
  assert.equal(holidayAt(day(2, 14))?.name, 'valentines');
  for (const [m, d] of [[1, 10], [3, 1], [7, 4], [10, 9], [11, 1], [2, 15]]) assert.equal(holidayAt(day(m, d)), null, `${m}-${d}`);
});

test('tiltForYou lifts holiday titles, mixes in ones that fit your taste, and keeps your first pick first', () => {
  const t = (id, genres = [18], type = 'movie') => ({ id, type, genres });
  const items = Array.from({ length: 20 }, (_, i) => t(i + 1, i < 10 ? [35] : [18]));
  const pool = [t(15), t(100, [27]), t(101, [35]), t(102, [35, 18]), t(103, [35]), t(104, [35])];
  const out = tiltForYou(items, pool, { skip: (x) => x.id === 104 });
  assert.equal(out.length, 20);
  assert.equal(out[0].id, 1, 'your own top pick stays first');
  const ids = out.map((x) => x.id);
  assert.ok(ids.indexOf(15) < ids.indexOf(12), 'a For you title in the holiday pool moves up');
  assert.deepEqual([ids[1], ids[4], ids[7]], [102, 101, 103], 'best-fitting holiday titles go in at 2, 5 and 8');
  assert.ok(!ids.includes(104), 'owned titles are skipped');
  assert.ok(!ids.includes(100), 'the poorest fit is left out');
  assert.deepEqual(tiltForYou(items, []), items, 'no holiday, no change');
});
