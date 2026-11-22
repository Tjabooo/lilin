// Right now: up to three short rows of what's time-bound for you (a party about to start, what just became ready,
// a Play that's still getting ready, Wrapped, copies for this phone). It sits under Discover's billboard, above the
// type chips (never filtered by them). Each row links to the item's own home; its one quiet chip does the thing.
// Play first: downloads are the owner's business, so downloads that need a look and
// transfer percentages are owner rows (ctx.owner); members see their own starts as "Getting it ready".
// rightNowRows() is pure (tests/right-now.test.mjs); app.js hands in the data and runs the actions.
import { T } from './i18n.js';

const HOUR = 3600000;
export const HIDDEN_KEY = 'lilin.rn.hidden';
export const PLAYED_KEY = 'lilin.rn.played';
// Highest first; a kind collapses into one summary row when several things share it.
export const KINDS = ['party', 'attention', 'preparing', 'ready', 'wrapped', 'phone', 'onway'];
const pct = (p) => `${Math.floor(Math.max(0, Math.min(1, p)) * 100)} %`;
const names = (list) => list.slice(0, 2).map((e) => e.name).join(' · ') + (list.length > 2 ? ` · +${list.length - 2}` : '');

// ctx: { now, owner, parties: [{ token, startsAt, started, title, poster }], entries (libraryUnion),
// played(f), travel (phone copies), touch, wrapped: { year, again } | null, convert, hidden: { id: at } }
export function rightNowRows(ctx, max = 3) {
  const now = ctx.now ?? Date.now(), hidden = ctx.hidden || {}, entries = ctx.entries || [];
  const out = [];
  const add = (row) => { if (!(row.dismiss && hidden[row.id])) out.push(row); };

  const parties = (ctx.parties || []).filter((p) => p.started || p.startsAt - now <= 12 * HOUR).sort((a, b) => a.startsAt - b.startsAt);
  if (parties.length === 1) {
    const [p] = parties, time = new Date(p.startsAt).toLocaleTimeString(ctx.locale, { hour: 'numeric', minute: '2-digit' });
    add({ id: `party:${p.token}`, kind: 'party', title: p.started ? T('Watch party now') : T('Watch party {0}', time),
      sub: [p.title, p.mine ? T('You planned this') : T('Planned by {0}', p.host || '')].join(' · '),
      thumb: p.poster, icon: 'party', chip: { label: T('Join'), aria: T('Join the watch party for {0}', p.title), act: { do: 'join', token: p.token } },
      open: { do: 'route', to: 'live' } });
  } else if (parties.length) {
    add({ id: 'party:many', kind: 'party', title: T('{0} watch parties soon', parties.length), sub: parties.map((p) => p.title).slice(0, 2).join(' · '),
      icon: 'party', open: { do: 'route', to: 'live' } });
  }

  const owner = Boolean(ctx.owner);
  const downloads = owner ? { do: 'route', to: 'house/downloads' } : null;
  const attention = owner ? entries.filter((e) => e.attention) : [];
  if (attention.length) add({ id: 'attention', kind: 'attention', title: attention.length === 1 ? T('1 download needs a look') : T('{0} downloads need a look', attention.length),
    sub: names(attention), icon: 'info', alert: true, chip: { label: T('See'), aria: T('See downloads that need a look'), act: downloads },
    open: downloads });

  const preparing = entries.filter((e) => e.preparing && (!e.attention || !owner) && !e.active.length);
  if (preparing.length === 1) {
    const [e] = preparing, p = ctx.convert?.(e);
    add({ id: `preparing:${e.key}`, kind: 'preparing', title: e.name, sub: p != null ? T('Preparing playback · {0}', pct(p / 100)) : T('Preparing playback'),
      thumb: e.poster, progress: p != null ? p / 100 : null, open: { do: 'title', entry: e } });
  } else if (preparing.length) {
    add({ id: 'preparing:many', kind: 'preparing', title: T('Preparing {0} titles for playback', preparing.length), sub: names(preparing), icon: 'clock', open: downloads || { do: 'title', entry: preparing[0] } });
  }

  const fresh = (e) => e.files.filter((f) => (f.addedAt || f.added || 0) > now - 24 * HOUR);
  const ready = entries.filter((e) => !e.active.length && !e.preparing && fresh(e).length && fresh(e).every((f) => !ctx.played?.(f)))
    .sort((a, b) => b.added - a.added);
  if (ready.length === 1) {
    const [e] = ready;
    add({ id: `ready:${e.key}`, kind: 'ready', title: e.name, sub: e.show ? T('New episodes to watch') : T('Just arrived'), thumb: e.poster,
      chip: { label: T('Play'), aria: T('Play {0}', e.name), act: { do: 'play', entry: e } }, open: { do: 'title', entry: e }, dismiss: true });
  } else if (ready.length) {
    add({ id: `ready:${ready.map((e) => e.key).sort().join(',')}`, kind: 'ready', title: T('{0} new titles ready', ready.length), sub: names(ready), thumb: ready[0].poster,
      open: { do: 'route', to: 'discover/instant' }, dismiss: true });
  }

  if (ctx.wrapped) add({ id: `wrapped:${ctx.wrapped.year}`, kind: 'wrapped', title: T('Your Lilin Wrapped {0}', ctx.wrapped.year),
    sub: ctx.wrapped.again ? T('See your year one more time') : T('Your year on Lilin is here'), icon: 'bulb',
    chip: { label: T('Open'), aria: T('Open Lilin Wrapped {0}', ctx.wrapped.year), act: { do: 'wrapped', year: ctx.wrapped.year } },
    open: { do: 'wrapped', year: ctx.wrapped.year }, dismiss: true });

  const copies = ctx.touch ? (ctx.travel || []).filter((i) => i.state === 'ready' && i.url && !i.downloadedAt) : [];
  if (copies.length) add({ id: `phone:${copies.map((i) => `${i.id}-${i.quality}`).sort().join(',')}`, kind: 'phone',
    title: copies.length === 1 ? T('1 copy ready for this phone') : T('{0} copies ready for this phone', copies.length), sub: copies.map((i) => i.title).slice(0, 2).join(' · '),
    icon: 'phone', chip: { label: T('Open'), aria: T('Open the copies for this phone'), act: { do: 'travel' } }, open: { do: 'travel' }, dismiss: true });

  // Starts still coming: the owner sees transfers and percentages, a member only that Play is getting it ready.
  const onway = entries.filter((e) => e.active.length && (!e.attention || !owner));
  if (onway.length) {
    const one = onway.length === 1 ? onway[0] : null;
    if (owner) {
      add({ id: 'onway', kind: 'onway', title: one ? one.name : T('{0} on the way', onway.length),
        sub: one ? [T('On its way'), one.progress != null && pct(one.progress)].filter(Boolean).join(' · ')
          : onway.slice(0, 2).map((e) => (e.progress != null ? `${e.name} ${pct(e.progress)}` : e.name)).join(' · '),
        thumb: one?.poster, icon: 'download', progress: one?.progress ?? null, open: downloads });
    } else {
      add({ id: 'onway', kind: 'onway', title: one ? one.name : T('Getting {0} titles ready', onway.length),
        sub: one ? T('Getting it ready') : names(onway), thumb: one?.poster, icon: 'play',
        chip: one ? { label: T('Play'), aria: T('Play {0}', one.name), act: { do: 'play', entry: one } } : null,
        open: { do: 'title', entry: one || onway[0] } });
    }
  }
  return out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)).slice(0, max);
}

// Remembered per device: hidden rows (id → when), and titles played here since they arrived (key → when).
function stored(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function remember(key, id) {
  const map = stored(key), cutoff = Date.now() - 60 * 86400000;
  map[id] = Date.now();
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(map).filter(([, at]) => at > cutoff).slice(-200)))); } catch { /* private mode */ }
}

// ui: { h, icon, context() → ctx without hidden/played, run(action, opener), toast }
export function createRightNow(ui) {
  const { h, icon } = ui;
  let section = null, list = null, shownIds = '', pending = false, lastPatch = 0;
  const context = () => {
    const base = ui.context(), played = stored(PLAYED_KEY);
    return { ...base, hidden: stored(HIDDEN_KEY), played: (f) => Boolean(played[f.mediaKey || f.id]) || Boolean(base.played?.(f)) };
  };
  const rowNode = (r) => {
    const art = r.thumb ? h('img', { class: 'rn-thumb', src: r.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'rn-thumb rn-icon' }, icon(r.icon || 'info'));
    const li = h('li', { class: `rn-row${r.alert ? ' is-alert' : ''}`, 'data-rn': r.id },
      h('button', { type: 'button', class: 'rn-open', onclick: (e) => ui.run(r.open, e.currentTarget) }, art,
        h('span', { class: 'rn-text' }, h('strong', { class: 'rn-title' }, r.title), h('span', { class: 'rn-sub' }, r.sub))),
      r.chip && h('button', { type: 'button', class: 'chip rn-chip', 'aria-label': r.chip.aria, onclick: (e) => ui.run(r.chip.act, e.currentTarget) }, r.chip.label),
      r.dismiss && h('button', { type: 'button', class: 'icon-btn rn-hide', 'aria-label': T('Hide “{0}”', r.title), onclick: () => {
        remember(HIDDEN_KEY, r.id);
        if (r.kind === 'wrapped') ui.toast(T('Wrapped is still in You'));
        render(true);
      } }, icon('close')),
      r.progress != null && h('span', { class: 'rn-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.floor(r.progress * 100)}%` })));
    li._row = r;
    return li;
  };
  // Rebuilds the rows; a row added or removed while the reader is below the strip waits for the next page render.
  function render(force = false) {
    if (!section) return;
    const rows = rightNowRows(context());
    const ids = rows.map((r) => r.id).join('|');
    if (ids === shownIds) return patch(rows);
    if (!force && section.isConnected && shownIds && section.getBoundingClientRect().top < 0) { pending = true; return; }
    shownIds = ids; pending = false;
    list.replaceChildren(...rows.map(rowNode));
    section.hidden = !rows.length;
  }
  // Same rows: only the words and bars change, in place, at most once a second.
  function patch(rows) {
    if (Date.now() - lastPatch < 1000) return;
    lastPatch = Date.now();
    rows.forEach((r, i) => {
      const li = list.children[i];
      if (!li) return;
      const title = li.querySelector('.rn-title'), sub = li.querySelector('.rn-sub'), bar = li.querySelector('.rn-bar i');
      if (title.textContent !== r.title) title.textContent = r.title;
      if (sub.textContent !== r.sub) sub.textContent = r.sub;
      if (bar && r.progress != null) bar.style.width = `${Math.floor(r.progress * 100)}%`;
    });
  }
  // A fresh strip for a page render (Discover home, Library › Titles): absent while there's nothing to show.
  function mount() {
    list = h('ul', { class: 'rn-list' });
    section = h('section', { class: 'right-now', 'aria-labelledby': 'rn-head', hidden: true }, h('h3', { class: 'rn-head', id: 'rn-head' }, T('Right now')), list);
    shownIds = ''; pending = false; lastPatch = 0;
    render(true);
    return section;
  }
  return {
    mount,
    update: () => { if (section?.isConnected) render(); },
    played: (f) => remember(PLAYED_KEY, f.mediaKey || f.id),
    hasPending: () => pending,
  };
}
