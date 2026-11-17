// Search: one box that finds titles, plus Go to (places.js) for screens and settings by name. Results open in a
// layer over the page (#search-layer): the page underneath stays as it was, and Escape or Cancel closes the layer.
// Filtering a page (Library, Activity, Machines, Game clips, Notes) is a small field on that page, not this box.
// People (findPeople: by name, opens their profile) and Live (findChannels: a channel by name or what's on now,
// tunes in) show as groups of their own when something matches.
import { matchPlaces, defaultPlaces, placeLabel } from './places.js';
import { ROUTES } from './routes.js';

const RECENT_KEY = 'lilin:recent-search';

export function createSearch({ h, T, lang, api, input, layer, me, status, onLilin, openPlace, titleGrid, titleCard, carousel,
  skeletonGrid, emptyState, notice, footer, onChange, findPeople = null, findChannels = null }) {
  let ctrl = null, timer = 0, peopleCtrl = null;
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
  function remember(text = input.value) {
    const q = String(text || '').trim();
    if (q.length < 2) return;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5))); } catch { /* private mode */ }
  }
  const isOpen = () => !layer.hidden;
  function open() {
    if (isOpen()) return;
    layer.hidden = false; input.setAttribute('aria-expanded', 'true');
    render(); onChange?.(true);
  }
  function close() {
    clearTimeout(timer); ctrl?.abort(); peopleCtrl?.abort();
    if (!isOpen()) return;
    layer.hidden = true; layer.replaceChildren(); input.setAttribute('aria-expanded', 'false');
    onChange?.(false);
  }
  const go = (p) => { remember(); close(); openPlace(p); };

  const group = (title, ...kids) => h('section', { class: 'sr-group' }, h('h3', { class: 'sr-head' }, title), ...kids);
  // "Watching · You": where a place lives
  const where = (p) => { const r = ROUTES[p.route]; return r && r.tab !== p.route ? T(ROUTES[r.tab].label) : ''; };
  const placeRow = (p) => h('button', { type: 'button', class: 'sr-row', onclick: () => go(p) },
    h('span', { class: 'set-label' }, T(placeLabel(p))), h('span', { class: 'set-hint' }, where(p)));
  const chips = (list) => h('div', { class: 'sr-chips' }, list);

  function render() {
    if (!isOpen()) return;
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) {
      ctrl?.abort();
      const recents = recent();
      layer.replaceChildren(h('div', { class: 'sr-body' },
        recents.length > 0 && group(T('Recent searches'), chips(recents.map((r) => h('button', { type: 'button', class: 'chip', onclick: () => {
          input.value = r; input.dispatchEvent(new Event('input')); input.focus();
        } }, r)))),
        group(T('Go to'), chips(defaultPlaces(me(), status()).map((p) => h('button', { type: 'button', class: 'chip', onclick: () => go(p) }, T(placeLabel(p))))))));
      return;
    }
    const places = matchPlaces(q, { me: me(), status: status(), T, lang });
    const owned = onLilin(q);
    const channels = findChannels?.(q) || [];
    const titles = h('div', { class: 'sr-titles' }, status().search ? skeletonGrid(6) : null);
    const folks = h('div', { class: 'sr-people' });
    layer.replaceChildren(h('div', { class: 'sr-body' },
      places.length > 0 && group(T('Go to'), h('div', { class: 'set-stack' }, places.map(placeRow))),
      owned.length > 0 && group(T('On Lilin'), h('div', { class: 'set-stack' }, owned)),
      channels.length > 0 && group(T('Live'), h('div', { class: 'set-stack' }, channels.map((c) => h('button', { type: 'button', class: 'sr-row', onclick: () => { remember(); close(); c.tune(); } },
        h('span', { class: 'guide-number', 'aria-hidden': 'true' }, String(c.number)),
        h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, c.name), c.now && h('span', { class: 'set-hint' }, T('Now: {0}', c.now))))))),
      folks,
      titles,
      h('div', { class: 'sr-more' }, footer(q))));
    timer = setTimeout(() => { if (status().search) findTitles(q, titles); if (findPeople && q.length >= 2) findSomeone(q, folks); }, 250);
    if (!status().search && !places.length && !owned.length && !channels.length) titles.replaceChildren(emptyState(T('No matches for “{0}”', q), T('Check the spelling, or try the original title.')));
  }

  // People by name: a face and a name; tapping opens their profile over the results.
  async function findSomeone(q, slot) {
    peopleCtrl?.abort();
    peopleCtrl = new AbortController();
    try {
      const found = await findPeople(q, peopleCtrl.signal);
      slot.replaceChildren(...(found.length ? [group(T('People'), h('div', { class: 'set-stack' }, found.map((p) => h('button', { type: 'button', class: 'sr-row', onclick: (e) => { remember(); p.open(e.currentTarget); } },
        p.face, h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, p.name), p.hint && h('span', { class: 'set-hint' }, p.hint))))))] : []));
    } catch { slot.replaceChildren(); }
  }

  async function findTitles(q, slot) {
    ctrl?.abort();
    ctrl = new AbortController();
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      const svt = data.svt || [];
      slot.replaceChildren(...[
        data.results.length > 0 && group(T('Films and shows'), titleGrid(data.results)),
        svt.length > 0 && carousel(T('Free on SVT Play'), h('ul', { class: 'shelf-items wide-cards', tabindex: '0', 'aria-label': T('Free on SVT Play') }, svt.map(titleCard))),
        !data.results.length && !svt.length && emptyState(T('No matches for “{0}”', q), T('Check the spelling, or try the original title.')),
      ].filter(Boolean));
    } catch (err) {
      if (err.name !== 'AbortError') slot.replaceChildren(notice(T('Search didn’t work'), err.message, () => findTitles(q, slot)));
    }
  }

  // Keyboard: ↓ from the box into the results, ↑↓ between them, Escape back out.
  const items = () => [...layer.querySelectorAll('button, a[href]')].filter((el) => !el.disabled && el.offsetParent);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && isOpen()) { const first = items()[0]; if (first) { e.preventDefault(); first.focus(); } }
  });
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); input.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = items(), i = list.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    (e.key === 'ArrowDown' ? list[i + 1] : list[i - 1] || input)?.focus();
  });
  // Opening a title from the results counts as a search worth remembering.
  layer.addEventListener('click', (e) => { if (e.target.closest?.('.title-card')) remember(); });

  return { open, close, isOpen, render, remember };
}
