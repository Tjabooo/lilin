// Save for later and Follow on the page: dates, the Coming up shelf, New badges and status lines.
// The server keeps the list and does the downloading (src/watchlist.js); these are the words.
import { T, langTag } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');
export const episodeCode = (e) => T('S{0}E{1}', pad(e.season), pad(e.episode));
export const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// "Today", "Tomorrow", "Yesterday", "Fri 14 Nov" (plus the year when it isn't this year).
export function dayLabel(iso, today = todayIso()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days === 0) return T('Today');
  if (days === 1) return T('Tomorrow');
  if (days === -1) return T('Yesterday');
  const d = new Date(`${iso}T12:00:00Z`);
  const opts = { weekday: Math.abs(days) < 7 ? 'long' : 'short', day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (iso.slice(0, 4) !== today.slice(0, 4)) { delete opts.weekday; opts.year = 'numeric'; }
  return d.toLocaleDateString(langTag, opts);
}

// The same, inside a sentence: "today", "tomorrow", "on Fri 14 Nov".
export function whenPhrase(iso, today = todayIso()) {
  const label = dayLabel(iso, today);
  return [T('Today'), T('Tomorrow'), T('Yesterday')].includes(label) ? label.toLowerCase() : label ? T('on {0}', label) : '';
}

const RELEASE_WORDS = { digital: T('Out to stream'), disc: T('Out on disc'), cinema: T('In cinemas') };

// What's next for saved films and followed shows, soonest first. Only dates from today on.
export function comingUp(items, today = todayIso()) {
  const out = [];
  for (const i of items || []) {
    if (i.type === 'tv' && i.follow && i.nextEpisode?.airDate >= today) {
      const e = i.nextEpisode;
      out.push({ item: i, date: e.airDate, when: dayLabel(e.airDate, today), what: [episodeCode(e), e.name].filter(Boolean).join(' · ') });
    } else if (i.type === 'movie' && i.release >= today) {
      out.push({ item: i, date: i.release, when: dayLabel(i.release, today), what: RELEASE_WORDS[i.releaseKind] || T('Release') });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title));
}

// New episodes of a followed show that are ready in your library (files: the show's library files).
export function newEpisodes(item, files) {
  if (!item?.newEpisodes?.length) return 0;
  const ready = new Set((files || []).filter((f) => f.done !== false).map((f) => `${f.season}:${f.episode}`));
  return item.newEpisodes.filter((e) => ready.has(`${e.season}:${e.episode}`)).length;
}

// One line under the Save / Follow buttons, or '' when there's nothing to add.
export function watchStatus(item, { today = todayIso(), autoDownload = false, inLibrary = false } = {}) {
  if (!item) return '';
  if (item.type === 'movie') {
    if (!item.auto || !autoDownload) {
      return item.release > today && !inLibrary ? `${RELEASE_WORDS[item.releaseKind] || T('Out')} ${whenPhrase(item.release, today)}.` : '';
    }
    if (item.state === 'got') return T('Downloaded when it came out.');
    if (inLibrary) return '';
    if (item.state === 'looking') return T('Out now. Looking for a good copy{0}', item.note ? `: ${item.note}` : '.');
    if (item.release > today) return T('Downloads automatically once it’s out {0}.', whenPhrase(item.release, today));
    if (!item.release) return T('Downloads automatically once a release date is known and it’s out.');
    return T('Looking for a good copy…');
  }
  const parts = [];
  const n = item.nextEpisode;
  if (item.follow && n?.airDate) parts.push(T('Next: {0} {1} {2}.', episodeCode(n), n.airDate < today ? T('aired') : T('airs'), whenPhrase(n.airDate, today)));
  else if (item.follow) parts.push(T('No new episodes announced yet.'));
  if (item.follow && item.auto && autoDownload) {
    if (item.waiting?.length) parts.push(T('Looking for {0}.', item.waiting.map(episodeCode).join(', ')));
    if (item.missed?.length) parts.push(T('Couldn’t find {0}.', item.missed.map(episodeCode).join(', ')));
  }
  return parts.join(' ');
}

// Library › Watchlist: Coming up (dated rows), Saved (out now, not in your library yet) and Following (shows, with
// the switch that adds new episodes as they air). app.js passes in its helpers, as it does for vibes.js.
// ui: { h, icon, items(), autoDownload(), inLibrary(item), setWatch(item, flags), openDetails(item, opener), titleCard,
//       emptyState, openComingSoon(), norm, toast }
export function createWatchlistView(ui) {
  const { h } = ui;
  const thumb = (i) => (i.poster ? h('img', { class: 'rn-thumb', src: i.poster, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'rn-thumb' }));
  // A switch that saves at once; a failure puts it back.
  const toggle = (label, on, flags, aria = label) => h('label', { class: 'wl-switch' },
    h('input', { type: 'checkbox', checked: on, 'aria-label': aria, onchange: async (e) => {
      const box = e.currentTarget; box.disabled = true;
      try { await ui.setWatch(flags(box.checked)); } catch (err) { box.checked = !box.checked; ui.toast(err.message); } finally { box.disabled = false; }
    } }), h('span', {}, label));
  const row = (i, when, sub, control) => h('li', { class: 'rn-row wl-row' },
    when && h('span', { class: 'wl-date' }, when),
    h('button', { type: 'button', class: 'rn-open', onclick: (e) => ui.openDetails(i, e.currentTarget) }, thumb(i),
      h('span', { class: 'rn-text' }, h('strong', { class: 'rn-title' }, i.title), h('span', { class: 'rn-sub' }, sub))),
    control);
  const section = (title, body) => h('section', { class: 'shelf wl-section', 'aria-label': title }, h('h3', { class: 'lib-subhead' }, title), body);
  const rows = (list) => h('ul', { class: 'rn-list' }, list);

  function render(box, { type = 'all', query = '' } = {}) {
    const today = todayIso();
    const q = ui.norm(query.trim());
    const all = ui.items().filter((i) => i.saved || i.follow);
    const items = all.filter((i) => (type === 'all' || i.type === type) && (!q || ui.norm(i.title).includes(q)));
    const upcoming = comingUp(items, today).slice(0, 30);
    const soon = new Set(upcoming.map((c) => c.item));
    const saved = items.filter((i) => i.saved && !soon.has(i) && !ui.inLibrary(i));
    const following = items.filter((i) => i.type === 'tv' && i.follow);
    const auto = ui.autoDownload();
    const nodes = [
      upcoming.length > 0 && section(T('Coming up'), rows(upcoming.map((c) => row(c.item, c.when, c.what, c.item.type === 'tv'
        && toggle(T('Following'), true, (on) => ({ type: 'tv', id: c.item.id, follow: on })))))),
      saved.length > 0 && section(T('Saved'), h('ul', { class: 'grid wl-grid' }, saved.map(ui.titleCard))),
      following.length > 0 && section(T('Following'), rows(following.map((i) => row(i, null, watchStatus(i, { today, autoDownload: auto }) || T('Following'),
        auto && toggle(T('Auto-add'), Boolean(i.auto), (on) => ({ type: 'tv', id: i.id, auto: on }), T('Add new episodes of {0} as they air', i.title)))))),
    ].filter(Boolean);
    if (!nodes.length) {
      nodes.push(all.length ? ui.emptyState(T('No matching titles'), T('Nothing on your watchlist matches these filters.'))
        : ui.emptyState(T('Nothing saved yet'), T('Tap Save on a film or Follow on a show, and it waits here with its dates.'),
          { label: T('See what’s coming soon'), run: ui.openComingSoon }));
    }
    box.replaceChildren(...nodes);
  }
  return { render };
}
