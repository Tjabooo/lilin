// Time-of-day Discover. In the morning the page warms up (a soft amber glow from the top) and gets a row of short,
// bright picks; after midnight it goes dark and violet with a row of strange films under 95 minutes. The rest of the
// day it's the normal page. The rows are two hidden vibes (src/vibes.js: morning-short, late-night), so their
// See all page is the usual mood page. The hour is the viewer's own clock, not the server's.
import { T } from './i18n.js';
import { orderVibe, dailySeed } from './vibes.js';

export const DAYPARTS = {
  morning: { from: 5, to: 11, vibe: 'morning-short' },
  late: { from: 0, to: 5, vibe: 'late-night' },
};

// 'morning' (05:00-10:59), 'late' (00:00-04:59) or null.
export function daypartAt(date = new Date()) {
  const hour = date.getHours();
  for (const [name, p] of Object.entries(DAYPARTS)) if (hour >= p.from && hour < p.to) return name;
  return null;
}

const ROW_MAX = 20;

export function createDaypart(ui) {
  const { h } = ui;
  let part = null;

  // The page's look follows the clock: <html data-daypart="morning|late">, read by the Discover styles.
  function apply(now = new Date()) {
    part = daypartAt(now);
    if (part) document.documentElement.dataset.daypart = part;
    else delete document.documentElement.dataset.daypart;
    return part;
  }

  // The row for this time of day, or null (no part right now, or too little for this tab).
  async function row(type, signal) {
    const name = apply();
    const p = DAYPARTS[name];
    if (!p) return null;
    const data = await ui.cachedApi(`/api/vibes/${p.vibe}`, signal).catch(() => null);
    if (signal.aborted || !data?.results?.length) return null;
    const items = orderVibe(data.results, { seed: dailySeed(), owned: ui.owned, type }).slice(0, ROW_MAX);
    if (items.length < 4) return null;
    const vibe = { id: data.id, name: data.name, blurb: data.blurb, colors: data.colors, glyph: data.glyph, types: data.types };
    return ui.carousel(data.name, h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': data.name }, items.map(ui.titleCard)),
      h('button', { class: 'see-all', onclick: () => ui.openVibe(vibe, type) }, T('See all')), `daypart-shelf is-${name}`);
  }

  return { apply, row, part: () => part };
}
