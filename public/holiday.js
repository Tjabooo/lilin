// Holiday Discover. In the weeks before a holiday, Discover gets that holiday's row near the top and For you leans
// toward it: titles in the holiday's pool move up, and a few of the pool's titles that suit what you watch are mixed
// in. Each holiday is a seasonal vibe (src/vibes.js), so See all opens the usual mood page. The date is the viewer's
// own clock. Windows are [month, day] to [month, day], inclusive; New Year's Eve wraps over the new year.
import { T } from './i18n.js';
import { orderVibe, dailySeed } from './vibes.js';

export const HOLIDAYS = [
  { name: 'halloween', vibe: 'halloween', from: [10, 10], to: [10, 31] },
  { name: 'christmas', vibe: 'snowed-in-christmas', from: [11, 15], to: [12, 26] },
  { name: 'new-year', vibe: 'new-years-eve', from: [12, 27], to: [1, 2] },
  { name: 'valentines', vibe: 'valentines', from: [2, 1], to: [2, 14] },
];

const md = (m, d) => m * 100 + d;
// The holiday whose window holds this date, or null.
export function holidayAt(date = new Date()) {
  const now = md(date.getMonth() + 1, date.getDate());
  return HOLIDAYS.find((x) => {
    const from = md(...x.from), to = md(...x.to);
    return from <= to ? now >= from && now <= to : now >= from || now <= to;
  }) || null;
}

const keyOf = (t) => `${t.type}:${t.id}`;

// For you with the holiday's lean. `items` is For you best first, `pool` the holiday vibe's titles. Titles in both
// move up a few places; then up to `mix` pool titles you don't have yet, picked by how many genres they share with
// your For you, go in at places 2, 5 and 8 so the row still starts with your own taste. Pure, for the tests.
export function tiltForYou(items, pool, { mix = 3, skip = () => false, type = 'all', max = 20 } = {}) {
  if (!pool?.length) return items.slice(0, max);
  const inPool = new Set(pool.map(keyOf));
  const lifted = items.map((t, i) => ({ t, rank: i - (inPool.has(keyOf(t)) ? 4 : 0) }))
    .sort((a, b) => a.rank - b.rank).map((x) => x.t);
  const have = new Set(items.map(keyOf));
  const taste = new Map();
  for (const t of items) for (const g of t.genres || []) taste.set(g, (taste.get(g) || 0) + 1);
  const extras = pool.filter((t) => !have.has(keyOf(t)) && !skip(t) && (type === 'all' || t.type === type))
    .map((t, i) => ({ t, fit: (t.genres || []).reduce((n, g) => n + (taste.get(g) || 0), 0), i }))
    .sort((a, b) => b.fit - a.fit || a.i - b.i).slice(0, mix).map((x) => x.t);
  const out = [...lifted];
  extras.forEach((t, i) => out.splice(Math.min(1 + i * 3, out.length), 0, t));
  return out.slice(0, max);
}

const ROW_MAX = 20;

export function createHoliday(ui) {
  const { h } = ui;

  // The holiday vibe's data (name, colours, titles) when one is on, else null. Cached by cachedApi.
  async function current(signal) {
    const x = holidayAt();
    if (!x) return null;
    const data = await ui.cachedApi(`/api/vibes/${x.vibe}`, signal).catch(() => null);
    return data?.results?.length ? { holiday: x.name, ...data } : null;
  }

  // The holiday row for Discover's home, or null.
  async function row(type, signal) {
    const data = await current(signal);
    if (signal.aborted || !data) return null;
    const items = orderVibe(data.results, { seed: dailySeed(), owned: ui.owned, type }).slice(0, ROW_MAX);
    if (items.length < 4) return null;
    const vibe = { id: data.id, name: data.name, blurb: data.blurb, colors: data.colors, glyph: data.glyph, types: data.types };
    const shelf = ui.carousel(data.name, h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': data.name }, items.map(ui.titleCard)),
      h('button', { class: 'see-all', onclick: () => ui.openVibe(vibe, type) }, T('See all')), `holiday-shelf is-${data.holiday}`);
    shelf.style.setProperty('--holiday-a', data.colors[0]);
    shelf.style.setProperty('--holiday-b', data.colors[1]);
    return shelf;
  }

  // The holiday's titles for tiltForYou, or [] outside a holiday.
  async function pool(signal) {
    return (await current(signal))?.results || [];
  }

  return { row, pool };
}
