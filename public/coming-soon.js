// Discover → Coming soon: the row on the home screen and the full page behind See all, grouped by week and
// month. The server picks and ranks the titles (src/coming-soon.js); this draws them with their dates and a
// one-tap Save (films) or Follow (shows), through app.js's own Save for later / Follow (watchlist.js).
import { T, langTag } from './i18n.js';
import { todayIso } from './watchlist.js';

const DAY = 86400000;
const KEYS = { 'coming-soon': 'all', 'coming-soon-movie': 'movie', 'coming-soon-tv': 'tv', upcoming: 'movie' };
export const comingSoonKind = (key) => KEYS[key] || null;
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
export const daysUntil = (iso, today = todayIso()) => Math.round(dayNumber(iso) - dayNumber(today));

// "Fri 21 Nov" (plus the year when it isn't this year's).
export function shortDate(iso, today = todayIso()) {
  if (!isIso(iso)) return '';
  const opts = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (iso.slice(0, 4) !== today.slice(0, 4)) { delete opts.weekday; opts.year = 'numeric'; }
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(langTag, opts).replace(/^([^\s,]+),/, '$1'); // "Wed, 18 Nov" in some browsers
}
// "today", "tomorrow", "in 3 days", "in 2 weeks", "in 3 months".
export function relativeDay(iso, today = todayIso()) {
  const days = daysUntil(iso, today);
  if (days <= 0) return T('today');
  if (days === 1) return T('tomorrow');
  if (days < 14) return T('in {0} days', days);
  if (days < 60) return T('in {0} weeks', Math.round(days / 7));
  return T('in {0} months', Math.round(days / 30));
}
// What kind of release it is, in a word or two.
export function kindLabel(soon) {
  if (!soon) return '';
  if (soon.kind === 'cinema') return T('In cinemas');
  if (soon.kind === 'digital') return T('Streaming');
  if (soon.kind === 'disc') return T('On disc');
  if (soon.kind === 'premiere') return T('New series');
  if (soon.kind === 'season') return T('Season {0}', soon.season);
  return '';
}

// Week groups start on Monday. Group keys: 'week', 'next-week', then 'YYYY-MM' for the rest of each month.
const mondayOf = (iso) => { const n = dayNumber(iso); return n - ((new Date(n * DAY).getUTCDay() + 6) % 7); };
export function groupKey(iso, today = todayIso()) {
  const weeks = Math.floor((mondayOf(iso) - mondayOf(today)) / 7);
  if (weeks <= 0) return 'week';
  if (weeks === 1) return 'next-week';
  return iso.slice(0, 7);
}
export function groupLabel(key, today = todayIso()) {
  if (key === 'week') return T('This week');
  if (key === 'next-week') return T('Next week');
  const d = new Date(`${key}-15T12:00:00Z`);
  const month = d.toLocaleDateString(langTag, { month: 'long', timeZone: 'UTC' });
  const name = month.charAt(0).toUpperCase() + month.slice(1);
  if (key === today.slice(0, 7)) return T('Later in {0}', month);
  return key.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${key.slice(0, 4)}`;
}
// Groups in date order; inside each, the server's ranking (closest and most talked-about first).
export function groupComingSoon(items, today = todayIso()) {
  const groups = new Map();
  for (const t of items || []) {
    if (!isIso(t.soon?.date) || t.soon.date < today) continue;
    const key = groupKey(t.soon.date, today);
    if (!groups.has(key)) groups.set(key, { key, label: groupLabel(key, today), first: t.soon.date, items: [] });
    const g = groups.get(key);
    g.items.push(t);
    if (t.soon.date < g.first) g.first = t.soon.date;
  }
  return [...groups.values()].sort((a, b) => a.first.localeCompare(b.first));
}

// ui: h, icon, api helpers and app.js's Save for later / Follow (watchItem, setWatch), plus the shared Discover pieces.
export function createComingSoon(ui) {
  const { h, icon, toast } = ui;
  // A Save or Follow toast offers the way to Library › Watchlist, where the title now waits.
  const savedToast = (text) => (ui.savedToast || toast)(text);
  const view = { type: 'all' };

  // Save a film (it adds itself once a good copy is out, for people who may download) or Follow a show.
  function saveButton(t) {
    const isTv = t.type === 'tv';
    const button = h('button', { type: 'button', class: 'cs-save' });
    let busy = false;
    const draw = () => {
      const item = ui.watchItem(t.type, t.id);
      const on = isTv ? Boolean(item?.follow) : Boolean(item?.saved);
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
      const label = isTv ? (on ? T('Following {0}', t.title) : T('Follow {0}', t.title)) : (on ? T('Saved: {0}', t.title) : T('Save {0} for later', t.title));
      button.setAttribute('aria-label', label);
      button.title = isTv ? (on ? T('Following') : T('Follow')) : (on ? T('Saved') : T('Save'));
      button.replaceChildren(icon(isTv ? 'bell' : 'bookmark'));
    };
    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (busy) return;
      busy = true; button.classList.add('is-busy');
      const item = ui.watchItem(t.type, t.id);
      try {
        if (isTv) {
          const next = await ui.setWatch(t, { follow: !item?.follow });
          (next?.follow ? savedToast : toast)(next?.follow ? (next.auto ? T('Following. New episodes arrive as they air.') : T('Following')) : T('Stopped following'));
        } else {
          const auto = ui.autoDownload();
          const next = await ui.setWatch(t, item?.saved ? { saved: false } : { saved: true, ...(auto ? { auto: true } : {}) });
          (next?.saved ? savedToast : toast)(next?.saved ? (next.auto ? T('Saved. Lilin adds it once a good copy is out.') : T('Saved for later')) : T('Removed from Saved'));
        }
      } catch (err) { toast(err.message); } finally { busy = false; button.classList.remove('is-busy'); draw(); }
    });
    button._update = draw;
    draw();
    return button;
  }

  // A poster card with its date on the art and what's coming underneath.
  function card(t, today = todayIso()) {
    const days = daysUntil(t.soon.date, today);
    const open = h('button', { class: 'title-card', onclick: (e) => { if (ui.peek?.swallow(e)) return; ui.openDetails(t, e.currentTarget); } },
      h('div', { class: 'poster' },
        t.poster ? h('img', { src: t.poster, alt: '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'poster-fallback' }, t.title),
        ui.ownershipBadge(t),
        h('span', { class: `cs-date${days <= 7 ? ' is-near' : ''}` }, shortDate(t.soon.date, today))),
      h('div', { class: 'name' }, t.title),
      h('div', { class: 'sub' }, ...[kindLabel(t.soon), relativeDay(t.soon.date, today)].filter(Boolean)
        .flatMap((part, i) => [i ? ' · ' : null, h('span', { class: 'cs-part' }, part)]).filter(Boolean)));
    open._title = t; // peek.js
    return h('li', { class: 'cs-card' }, open, saveButton(t));
  }

  function openPage(type) {
    view.type = type || 'all';
    ui.openList({ key: 'coming-soon', title: T('Coming soon') });
  }

  // The Discover row (server: /api/discover/home).
  function row(r) {
    const today = todayIso();
    const items = r.items.filter((t) => isIso(t.soon?.date));
    if (!items.length) return null;
    return ui.carousel(r.title, h('ul', { class: 'shelf-items cs-items', tabindex: '0', 'aria-label': r.title }, items.map((t) => card(t, today))),
      h('button', { class: 'see-all', onclick: () => openPage(comingSoonKind(r.key)) }, T('See all')));
  }

  // The full page: Films / Shows, then a block per week or month.
  async function page(content, signal) {
    const head = h('div', { class: 'discover-head' },
      h('button', { class: 'back-link', onclick: ui.back }, T('‹ Discover')),
      h('h3', {}, T('Coming soon')),
      ui.segmented([['all', T('All')], ['movie', T('Films')], ['tv', T('Shows')]], view.type, (type) => { view.type = type; ui.rerender(); }, T('Show')));
    content.before(head);
    content.replaceChildren(ui.skeletonGrid());
    try {
      const data = await ui.cachedApi(`/api/discover/coming-soon?type=${view.type}`, signal);
      const today = todayIso();
      const groups = groupComingSoon(data.items, today);
      if (!groups.length) { content.replaceChildren(ui.notice(T('Nothing dated yet'), T('Nothing with a release date in the next few months. Check back soon.'))); return; }
      content.replaceChildren(
        h('p', { class: 'cs-intro' }, T('The closest and most talked-about first. Save a film or follow a show to keep track of it.')),
        ...groups.map((g) => h('section', { class: 'cs-group', 'aria-label': g.label },
          h('h4', { class: 'cs-group-head' }, g.label, h('span', { class: 'cs-count' }, String(g.items.length))),
          h('ul', { class: 'grid cs-grid' }, g.items.map((t) => card(t, today))))));
    } catch (err) {
      if (err.name === 'AbortError') return;
      content.replaceChildren(ui.notice(T('Couldn’t load this'), err.message, ui.rerender));
    }
  }

  return { handles: (key) => Boolean(comingSoonKind(key)), row, page };
}
