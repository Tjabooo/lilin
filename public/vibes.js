// Discover → Moods: a row of vibe tiles ("Slow-burn rainy day thriller", "90s indie nostalgia") and the page
// behind each one. The server builds each mood's titles from TMDB and scores them (src/vibes.js); this page
// orders them with a seed, so they come out a little different every day and on every Shuffle, with what's
// already in your library first. app.js passes in its helpers, as it does for documentaries.js.
import { T } from './i18n.js';

// Small line drawings for the tiles (24 × 24, stroked). Unknown names fall back to the sparkle.
const GLYPHS = {
  rain: '<path d="M7 14a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 7.5 3.5 3.5 0 0 1 17 14"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  cassette: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8.5" cy="11.5" r="1.6"/><circle cx="15.5" cy="11.5" r="1.6"/><path d="M10.1 11.5h3.8M7 18l1.5-3h7l1.5 3"/>',
  mug: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3"/>',
  spiral: '<path d="M12 12.5a1 1 0 1 1 1-1 2.5 2.5 0 0 1-2.5 2.5A3.5 3.5 0 0 1 7 10.5 5 5 0 0 1 12 5.5a6.5 6.5 0 0 1 6.5 6.5A8 8 0 0 1 10.5 20"/>',
  couch: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4H3zM5 17v2M19 17v2"/>',
  neon: '<path d="M15 4a5.5 5.5 0 1 0 5 7.5A4.5 4.5 0 0 1 15 4z"/><path d="M3 21v-7h3v7M8 21V10h3v11M13 21v-5h3v5M2 21h20"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  star: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.9l-5 2.8 1.2-5.6L4 9.3l5.6-.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  diamond: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  antlers: '<path d="M12 21v-8M12 13c-4 0-6-3-6-7M6 9 3 7M6 6.5 5 3M12 13c4 0 6-3 6-7M18 9l3-2M18 6.5 19 3"/><path d="M9 13.5c0 2 1.3 3.5 3 3.5s3-1.5 3-3.5"/>',
  drop: '<path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  smirk: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10h.01M15.5 10h.01M8.5 15c2 1.2 5 1 7-1.5"/>',
  planet: '<circle cx="12" cy="12" r="5"/><path d="M4.5 15.5c-2 1.8-2.4 3.3-1.5 4 1.6 1.2 7.5-1.5 13-6.4 5-4.5 7.6-9 6-10.2-.8-.6-2.3-.2-4 .9"/>',
  magnifier: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5a2.5 2.5 0 0 1 2.5-2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7h2M9 6.5h3M15 9l-1-3h2"/>',
  road: '<path d="M8 3 4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3"/>',
  tower: '<path d="M6 21V8l3-2v15M9 21V4h5v17M14 21v-9l4 2v7M3 21h18"/><path d="M11 7h1M11 10h1M11 13h1"/>',
  pan: '<circle cx="9" cy="13" r="6"/><path d="M15 13h6.5M7 10.5c.8.8 1 2 .2 3"/><path d="M10 3.5c-.6.8.6 1.5 0 2.5M13 4c-.6.8.6 1.5 0 2.5"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M2.5 9h19M12 9v11.5M12 9c-1-3-5.5-4.5-5.5-2S10 9 12 9zM12 9c1-3 5.5-4.5 5.5-2S14 9 12 9z"/>',
  candle: '<path d="M9 21V11h6v10M7 21h10"/><path d="M12 11V9M12 3.5c1.8 2 1.8 3.8 0 4.8-1.8-1-1.8-2.8 0-4.8z"/>',
  blossom: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2c-2-1.6-2.3-4.6 0-6.2 2.3 1.6 2 4.6 0 6.2zM13.7 11.4c.8-2.4 3.6-3.5 5.8-1.8-.8 2.6-3.6 3.4-5.8 1.8zM13 13.6c2.6 0 4.4 2.4 3.6 5-2.7.1-4.3-2.3-3.6-5zM11 13.6c.7 2.7-.9 5.1-3.6 5-.8-2.6 1-5 3.6-5zM10.3 11.4c-2.2 1.6-5 .8-5.8-1.8 2.2-1.7 5-.6 5.8 1.8z"/>',
  crown: '<path d="M3.5 8l4.5 4 4-6.5 4 6.5 4.5-4-2 10h-13z"/><path d="M5.5 21h13"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 9-11.5h-6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z"/>',
  'eye-swirl': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M12 12.5a.6.6 0 1 1 .6-.6 1.6 1.6 0 0 1-1.6 1.6 2.4 2.4 0 0 1-2.4-2.4A3.4 3.4 0 0 1 12 7.7a4.2 4.2 0 0 1 4.2 4.2"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7zM19 16c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>',
};
export const glyphNames = () => Object.keys(GLYPHS);

export function glyph(name, cls = 'vibe-glyph') {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name] || GLYPHS.sparkle}</svg>`;
  return wrap.firstChild;
}

// A small, fast seeded random number in [0, 1) for one title: the same seed gives the same order.
function seeded(seed, text) {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 0x5bd1e995) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
export const dailySeed = (now = Date.now()) => Math.floor(now / 86400000);

// The page's order: the server's score plus a seeded shake (Gumbel noise), so the best titles still come
// early but not always the same ones; your own titles first. Pure, for the tests.
export function orderVibe(items, { seed = dailySeed(), owned = () => false, type = 'all' } = {}) {
  const shake = (t) => {
    const u = Math.min(Math.max(seeded(seed, `${t.type}:${t.id}`), 1e-9), 1 - 1e-9);
    return (t.score || 0) - 0.55 * Math.log(-Math.log(u));
  };
  return items
    .filter((t) => type === 'all' || t.type === type)
    .map((t) => ({ t, mine: Boolean(owned(t)), key: shake(t) }))
    .sort((a, b) => (b.mine - a.mine) || (b.key - a.key))
    .map((x) => x.t);
}

// Which moods the row shows first: the season's own ones, then a daily rotation, so the start of the
// row isn't always the same. Pure, for the tests.
export function rotateVibes(vibes, { type = 'all', day = dailySeed(), seasonal = new Set() } = {}) {
  const fits = vibes.filter((v) => type === 'all' || type === 'docs' || v.types.includes(type));
  if (!fits.length) return [];
  const start = ((day * 7) % fits.length + fits.length) % fits.length;
  const rotated = [...fits.slice(start), ...fits.slice(0, start)];
  return [...rotated.filter((v) => seasonal.has(v.id)), ...rotated.filter((v) => !seasonal.has(v.id))];
}

// Genre moods (they used to be rows of their own on Discover): one tile each, backed by a TMDB genre (movie and tv
// ids) and opening that genre's page. Two of them lead the row each day, marked Today.
export const GENRE_MOODS = [
  { id: 'g-laugh', name: T('Laugh out loud'), movie: 35, tv: 35, glyph: 'smirk', colors: ['#6b3d00', '#ffc94a'] },
  { id: 'g-edge', name: T('Edge of your seat'), movie: 53, tv: 9648, glyph: 'eye', colors: ['#3b0d0d', '#e5484d'] },
  { id: 'g-space', name: T('Out of this world'), movie: 878, tv: 10765, glyph: 'planet', colors: ['#10163d', '#7c8cff'] },
  { id: 'g-feel', name: T('Big feelings'), movie: 18, tv: 18, sort: 'rating', glyph: 'drop', colors: ['#2a1238', '#d17ad8'] },
  { id: 'g-anim', name: T('Animated worlds'), movie: 16, tv: 16, glyph: 'star', colors: ['#0d3036', '#4fd1c5'] },
  { id: 'g-dark', name: T('After dark'), movie: 27, tv: null, glyph: 'candle', colors: ['#120a12', '#9b2c4a'] },
  { id: 'g-love', name: T('Love stories'), movie: 10749, tv: null, glyph: 'blossom', colors: ['#3d0f22', '#ff8fb1'] },
  { id: 'g-unknown', name: T('Into the unknown'), movie: 12, tv: 10759, glyph: 'road', colors: ['#16301a', '#8ed47a'] },
  { id: 'g-crime', name: T('Crime scenes'), movie: 80, tv: 80, sort: 'rating', glyph: 'magnifier', colors: ['#1d1d24', '#a3a3b8'] },
  { id: 'g-real', name: T('Real lives'), movie: 99, tv: 99, glyph: 'mug', colors: ['#33200f', '#e0a96d'] },
];
// Today's genre moods for a type: a daily rotation, so the start of the row changes. Pure, for the tests.
export function todaysMoods(type = 'all', n = 2, day = dailySeed()) {
  const fits = GENRE_MOODS.filter((m) => (type === 'tv' ? m.tv : type === 'movie' ? m.movie : true));
  return Array.from({ length: Math.min(n, fits.length) }, (_, i) => fits[(day * 3 + i * 4) % fits.length]).filter((m, i, all) => all.indexOf(m) === i);
}

const PAGE = 36;

export function createVibes(ui) {
  const { h } = ui;
  const view = { vibe: null, type: 'all', seed: null };

  const tileStyle = (v) => `--v1:${v.colors[0]};--v2:${v.colors[1]}`;
  // The Moods row on Discover: `lead` (Pick together's tile) first, today's two genre moods, the vibes, then the other
  // genre moods. Duplicates by name are dropped. null when nothing fits this tab.
  async function row(type, signal, { lead = null } = {}) {
    const data = await ui.cachedApi('/api/vibes', signal).catch(() => null);
    if (signal.aborted) return null;
    const list = rotateVibes(data?.vibes || [], { type, seasonal: new Set((data?.vibes || []).filter((v) => v.seasonal).map((v) => v.id)) });
    const names = new Set(list.map((v) => v.name.toLowerCase()));
    const today = todaysMoods(type).filter((m) => !names.has(m.name.toLowerCase()));
    const others = GENRE_MOODS.filter((m) => !today.includes(m) && !names.has(m.name.toLowerCase()) && (type === 'tv' ? m.tv : type === 'movie' ? m.movie : true));
    const tile = (v, onclick, kicker) => h('li', { class: 'vibe-item' },
      h('button', { type: 'button', class: 'vibe-tile', style: tileStyle(v), onclick },
        glyph(v.glyph), kicker && h('span', { class: 'vibe-kicker' }, kicker), h('span', { class: 'vibe-name' }, v.name)));
    const tiles = [lead,
      ...today.map((m) => tile(m, () => ui.openGenre(m), T('Today'))),
      ...list.map((v) => tile(v, () => open(v, type))),
      ...others.map((m) => tile(m, () => ui.openGenre(m)))].filter(Boolean);
    if (tiles.length < 3) return null;
    return ui.carousel(T('Moods'), h('ul', { class: 'shelf-items vibe-tiles', tabindex: '0', 'aria-label': T('Moods') }, tiles), null, 'vibes-shelf');
  }

  function open(v, type = 'all') {
    Object.assign(view, { vibe: v, type: v.types.includes(type) ? type : 'all', seed: null });
    window.scrollTo({ top: 0 });
    ui.rerender();
  }
  const close = () => { view.vibe = null; ui.rerender(); };

  async function render(content, signal) {
    const v = view.vibe;
    const both = v.types.length > 1;
    const grid = h('ul', { class: 'grid vibe-grid' });
    const more = h('button', { class: 'load-more', hidden: true }, T('Show more'));
    const owned = h('p', { class: 'vibe-owned muted', hidden: true });
    const shuffle = h('button', { type: 'button', class: 'chip vibe-shuffle', onclick: () => {
      view.seed = Math.floor(Math.random() * 2 ** 31);
      draw();
      shuffle.classList.remove('spun'); void shuffle.offsetWidth; shuffle.classList.add('spun');
    } }, glyph('spiral', 'vibe-shuffle-icon'), h('span', {}, T('Shuffle')));
    content.before(h('header', { class: 'vibe-hero', style: tileStyle(v) },
      h('button', { class: 'back-link', onclick: close }, T('‹ Discover')),
      glyph(v.glyph, 'vibe-hero-glyph'),
      h('p', { class: 'vibe-kicker' }, T('Mood')),
      h('h2', { class: 'vibe-title' }, v.name),
      v.blurb && h('p', { class: 'vibe-blurb' }, v.blurb),
      h('div', { class: 'vibe-controls' },
        both && ui.segmented([['all', T('All')], ['movie', T('Films')], ['tv', T('Shows')]], view.type, (type) => { view.type = type; ui.rerender(); }, T('Show')),
        shuffle)));
    let items = [], shown = 0;
    const showMore = () => {
      grid.append(...items.slice(shown, shown + PAGE).map(ui.titleCard));
      shown = Math.min(items.length, shown + PAGE);
      more.hidden = shown >= items.length;
    };
    more.addEventListener('click', showMore);
    let pool = [];
    function draw() {
      items = orderVibe(pool, { seed: view.seed ?? dailySeed(), owned: ui.owned, type: view.type });
      const mine = items.filter(ui.owned).length;
      owned.hidden = !mine;
      owned.textContent = mine === 1 ? T('1 of these is in your library, so it comes first.') : T('{0} of these are in your library, so they come first.', mine);
      grid.replaceChildren();
      shown = 0;
      if (!items.length) { content.replaceChildren(ui.notice(T('Nothing here'), T('Try another type.'))); return; }
      if (!grid.isConnected) content.replaceChildren(owned, grid, more);
      showMore();
    }
    content.replaceChildren(ui.skeletonGrid());
    try {
      const data = await ui.cachedApi(`/api/vibes/${encodeURIComponent(v.id)}`, signal);
      if (signal.aborted) return;
      pool = data.results || [];
      draw();
    } catch (err) {
      if (err.name !== 'AbortError') content.replaceChildren(ui.notice(T('Couldn’t load this'), err.message, ui.rerender));
    }
  }

  return { row, render, open, active: () => Boolean(view.vibe), reset: () => { view.vibe = null; } };
}
