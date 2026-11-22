// Search: one box that finds titles, plus Go to (places.js) for screens and settings by name. Results open in a
// layer over the page (#search-layer): the page underneath stays as it was, and Escape or Cancel closes the layer.
// Filtering a page (Library, Activity, Machines, Game clips, Notes) is a small field on that page, not this box.
// People (findPeople: by name, opens their profile) and Live (findChannels: a channel by name or what's on now,
// tunes in) show as groups of their own when something matches.
// MAGIc search: when the box holds a description rather than a title ("teacher makes meth with his student"),
// a row offers to find it from that (/api/magic-search: Wikipedia's plot write-ups + TMDB, a few seconds). Only on a
// tap: Wikipedia's API asks to be used gently, and a half-typed description finds nothing anyway.
// Lines (lines: quote-search.js): films and episodes on the server where what you typed is said. Above the titles
// when it reads like a quote (two words or more, no title on the server by that name), below them otherwise.
import { matchPlaces, defaultPlaces, placeLabel } from './places.js';
import { ROUTES } from './routes.js';

const RECENT_KEY = 'lilin:recent-search';

export function createSearch({ h, T, lang, api, input, layer, me, status, onLilin, openPlace, titleGrid, titleCard, carousel,
  skeletonGrid, emptyState, notice, footer, onChange, findPeople = null, findChannels = null, icon, openTitle, poster, lines = null }) {
  let ctrl = null, timer = 0, peopleCtrl = null, magicCtrl = null, magicTick = 0;
  let magic = null; // { q, slot }: the MAGIc row or its results, kept while the box says the same
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
  function remember(text = input.value) {
    const q = String(text || '').trim();
    if (q.length < 2) return;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5))); } catch { /* private mode */ }
  }
  function forget(text) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent().filter((r) => r !== text))); } catch { /* private mode */ }
  }
  const isOpen = () => !layer.hidden;
  function open() {
    if (isOpen()) return;
    layer.hidden = false; input.setAttribute('aria-expanded', 'true');
    render(); onChange?.(true);
  }
  function close() {
    clearTimeout(timer); ctrl?.abort(); peopleCtrl?.abort(); stopMagic(); magic = null; lines?.stop();
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
      ctrl?.abort(); lines?.stop();
      const recents = recent();
      layer.replaceChildren(h('div', { class: 'sr-body' },
        recents.length > 0 && group(T('Recent searches'), chips(recents.map((r, i) => h('span', { class: 'chip sr-recent' },
          h('button', { type: 'button', class: 'sr-recent-pick', onclick: () => {
            input.value = r; input.dispatchEvent(new Event('input')); input.focus();
          } }, r),
          h('button', { type: 'button', class: 'sr-recent-x', title: T('Remove'), 'aria-label': T('Remove “{0}” from recent searches', r), onclick: () => {
            forget(r); render();
            // keep focus in the sheet: the next × along, else the box
            const xs = layer.querySelectorAll('.sr-recent-x');
            (xs[Math.min(i, xs.length - 1)] || input).focus({ preventScroll: true });
          } }, icon('close')))))),
        group(T('Go to'), chips(defaultPlaces(me(), status()).map((p) => h('button', { type: 'button', class: 'chip', onclick: () => go(p) }, T(placeLabel(p))))))));
      return;
    }
    const places = matchPlaces(q, { me: me(), status: status(), T, lang });
    const owned = onLilin(q);
    const channels = findChannels?.(q) || [];
    const titles = h('div', { class: 'sr-titles' }, status().search ? skeletonGrid(6) : null);
    const folks = h('div', { class: 'sr-people' });
    const said = h('div', { class: 'sr-lines' }), quoteFirst = q.split(' ').filter(Boolean).length >= 2 && !owned.length; // lines
    if (magic?.q !== q) { stopMagic(); magic = { q, slot: h('div', { class: 'sr-magic' }) }; if (describes(q)) offerMagic(q); }
    layer.replaceChildren(h('div', { class: 'sr-body' }, magic.slot,
      places.length > 0 && group(T('Go to'), h('div', { class: 'set-stack' }, places.map(placeRow))),
      owned.length > 0 && group(T('Plays instantly'), h('div', { class: 'set-stack' }, owned)),
      channels.length > 0 && group(T('Live'), h('div', { class: 'set-stack' }, channels.map((c) => h('button', { type: 'button', class: 'sr-row', onclick: () => { remember(); close(); c.tune(); } },
        h('span', { class: 'guide-number', 'aria-hidden': 'true' }, String(c.number)),
        h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, c.name), c.now && h('span', { class: 'set-hint' }, T('Now: {0}', c.now))))))),
      folks,
      quoteFirst && said,
      titles,
      !quoteFirst && said,
      h('div', { class: 'sr-more' }, footer(q))));
    timer = setTimeout(() => {
      if (status().search) findTitles(q, titles);
      if (findPeople && q.length >= 2) findSomeone(q, folks);
      if (lines && status().lines) lines.find(q, said); else lines?.stop();
    }, 250);
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
      // Nothing by that name: maybe it's a description after all (the offer stands in for "No matches").
      if (!data.results.length && !svt.length && q.length >= 4 && magic?.q === q && !magic.slot.firstChild) offerMagic(q);
      slot.replaceChildren(...[
        data.results.length > 0 && group(T('Films and shows'), titleGrid(data.results)),
        svt.length > 0 && carousel(T('Free on SVT Play'), h('ul', { class: 'shelf-items wide-cards', tabindex: '0', 'aria-label': T('Free on SVT Play') }, svt.map(titleCard))),
        !data.results.length && !svt.length && !magic?.slot.firstChild && emptyState(T('No matches for “{0}”', q), T('Check the spelling, or try the original title.')),
      ].filter(Boolean));
    } catch (err) {
      if (err.name !== 'AbortError') slot.replaceChildren(notice(T('Search didn’t work'), err.message, () => findTitles(q, slot)));
    }
  }

  // ---- MAGIc search ----
  // Three words or more reads as a description; a title that long ("the lord of the rings") just gets the offer too.
  const describes = (q) => status().magic && q.split(' ').filter(Boolean).length >= 3;
  function stopMagic() { magicCtrl?.abort(); magicCtrl = null; clearInterval(magicTick); }
  function offerMagic(q) {
    if (!status().magic || !magic) return;
    magic.slot.replaceChildren(h('div', { class: 'set-stack' }, h('button', { type: 'button', class: 'sr-row magic-offer', onclick: () => runMagic(q) },
      h('span', { class: 'magic-mark', 'aria-hidden': 'true' }, icon('magic')),
      h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, T('MAGIc search')),
        h('span', { class: 'set-hint' }, T('Find it from what you remember: plot, a scene, an actor')))),
      ));
  }
  async function runMagic(q) {
    stopMagic();
    const slot = magic.slot;
    const started = Date.now();
    const clock = h('span', { class: 'set-hint' }, T('Looking through plots…'));
    slot.replaceChildren(h('div', { class: 'set-stack' }, h('div', { class: 'sr-row magic-wait', role: 'status' },
      h('span', { class: 'magic-mark is-busy', 'aria-hidden': 'true' }, icon('magic')),
      h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, T('MAGIc search')), clock))));
    const steps = [[0, T('Looking through plots…')], [4, T('Checking them against what you said…')], [12, T('Still looking: this one’s a puzzle…')]];
    magicTick = setInterval(() => { const s = (Date.now() - started) / 1000; clock.textContent = steps.filter(([at]) => s >= at).at(-1)[1]; }, 1000);
    magicCtrl = new AbortController();
    try {
      const data = await api(`/api/magic-search?q=${encodeURIComponent(q)}`, { signal: magicCtrl.signal });
      stopMagic();
      if (magic?.slot !== slot) return;
      const list = data.results || [];
      if (!list.length) {
        slot.replaceChildren(group(T('MAGIc search'), emptyState(T('Nothing came to mind'), T('Add a detail or two: roughly when it came out, a scene, someone in it.'))));
        return;
      }
      const kind = (t) => (t.type === 'tv' ? T('Series') : T('Film'));
      slot.replaceChildren(group(T('MAGIc search'), h('ul', { class: 'set-stack magic-list' }, list.map((t, i) => h('li', {},
        h('button', { type: 'button', class: `sr-row magic-hit${i === 0 && data.sure ? ' is-best' : ''}`, onclick: (e) => { remember(); openTitle(t, e.currentTarget); } },
          h('span', { class: 'magic-poster' }, poster(t) || h('span', { class: 'poster-fallback' }, t.title)),
          h('span', { class: 'lrow-text' },
            h('span', { class: 'magic-name' }, h('span', { class: 'set-label' }, t.title), i === 0 && data.sure && h('span', { class: 'magic-best' }, T('Best match'))),
            h('span', { class: 'set-hint' }, [t.year, kind(t)].filter(Boolean).join(' · ')),
            t.matched?.length > 0 && h('span', { class: 'magic-why' }, T('Matches: {0}', t.matched.join(', '))))))))));
    } catch (err) {
      stopMagic();
      if (err.name === 'AbortError' || magic?.slot !== slot) return;
      slot.replaceChildren(notice(T('MAGIc search didn’t work'), err.message, () => runMagic(q)));
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
