// Lists: shelves of films and shows people put together and share ("films that ruined my sleep"), a bit like
// Letterboxd's. They show on the maker's profile (profiles.js, section Lists) as a fan of posters, open as a page of
// their own (/#list/<id>), and grow from the List button beside the thumbs on every title page.
// Server side: src/lists.js, /api/lists. Who sees a list = who sees its maker's profile, unless it's kept private.
//
// app.js passes in its helpers; this file has no globals beyond the DOM.
import { T, locale } from './i18n.js';

const small = (url, size = 'w185') => (url ? String(url).replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${size}/`) : null);
const MAX_NAME = 80;
const MAX_ABOUT = 600;

export function createLists({ h, api, jsonPost, toast, icon, people, me, openTitle, overlay, picker, copyText, openProfile, titleSearch,
  changed = () => {} }) {
  const nestedNow = () => ['#sheet', '#picker'].some((s) => document.querySelector(s)?.classList.contains('open'))
    || Boolean(document.querySelector('.pf.pf-nested.open'));
  const over = () => Boolean(document.querySelector('.pf.pf-nested.open')); // the picker has to sit over a nested page
  // One sheet at a time: close the one that's open, then open the next once it has slid away.
  const thenOpen = (fn) => { picker.close(); setTimeout(fn, 340); };
  const countText = (n) => (n === 1 ? T('1 title') : T('{0} titles', Number(n).toLocaleString(locale)));

  // ---------- cards (a profile's Lists section) ----------
  // The first five posters fanned out over each other, then the name and how many.
  function card(list, { nested = false } = {}) {
    const fan = h('span', { class: 'ls-fan', 'aria-hidden': 'true' },
      [0, 1, 2, 3, 4].map((i) => {
        const p = list.preview?.[i];
        return h('span', { class: `ls-fan-p${p ? '' : ' empty'}`, style: `--i:${i}` }, p?.poster ? h('img', { src: small(p.poster, 'w154'), alt: '', loading: 'lazy', decoding: 'async' }) : null);
      }));
    const btn = h('button', { type: 'button', class: 'ls-card', onclick: () => open(list.id, btn, { nested }) }, fan,
      h('span', { class: 'ls-card-text' },
        h('strong', {}, list.name),
        h('small', {}, countText(list.count), list.ranked ? ` · ${T('Ranked')}` : '', list.private ? h('span', { class: 'ls-lock', title: T('Only you can see this list') }, icon('lock')) : null)));
    return btn;
  }
  // The section's body: cards, and for yourself a New list button.
  function cards(lists, { mine = false, nested = false, onNew } = {}) {
    return h('ul', { class: 'ls-cards' },
      lists.map((l) => h('li', {}, card(l, { nested }))),
      mine ? h('li', {}, h('button', { type: 'button', class: 'ls-card ls-new', onclick: (e) => newList(e.currentTarget, { done: onNew }) },
        h('span', { class: 'ls-fan ls-fan-new', 'aria-hidden': 'true' }, icon('plus')), h('span', { class: 'ls-card-text' }, h('strong', {}, T('New list')), h('small', {}, T('Films and shows you put together'))))) : null);
  }

  // ---------- a list's page ----------
  function open(id, opener, { nested = nestedNow() } = {}) {
    const page = h('div', { class: `pf ls-page${nested ? ' pf-nested' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': T('List'), tabindex: '-1' });
    const ctx = { id, page, nested, data: null, closed: false };
    page.append(bar(ctx), h('div', { class: 'ls-head' }, h('div', { class: 'pf-line skel' }), h('div', { class: 'pf-line short skel' })));
    document.body.append(page);
    requestAnimationFrame(() => { page.classList.add('open'); page.focus({ preventScroll: true }); });
    const hashBefore = location.hash;
    history.replaceState(history.state, '', `${location.pathname}${location.search}#list/${id}`);
    overlay.push(() => {
      ctx.closed = true;
      page.classList.remove('open');
      setTimeout(() => page.remove(), 320);
      if (location.hash === `#list/${id}`) history.replaceState(history.state, '', `${location.pathname}${location.search}${hashBefore.startsWith('#list/') ? '' : hashBefore}`);
      opener?.isConnected && opener.focus?.({ preventScroll: true });
    });
    load(ctx);
    return ctx;
  }
  // /#list/<id> opens it once Lilin has started.
  function fromHash(hash = location.hash) {
    const m = /^#list\/([a-z0-9]{10})$/.exec(hash);
    if (m) open(m[1], null, { nested: false });
  }

  async function load(ctx) {
    try { ctx.data = (await api(`/api/lists/${ctx.id}`)).list; } catch (err) {
      ctx.page.replaceChildren(bar(ctx), h('div', { class: 'pf-gone' }, h('h2', {}, T('Couldn’t open this list')), h('p', { class: 'muted' }, err.message)));
      return;
    }
    if (!ctx.closed) paint(ctx);
  }

  function bar(ctx) {
    const d = ctx.data;
    return h('div', { class: 'pf-bar' },
      h('button', { type: 'button', class: 'icon-btn pf-back', 'aria-label': T('Back'), onclick: () => overlay.close() }, icon('back')),
      h('span', { class: 'pf-bar-title' }, d?.name || ''),
      h('div', { class: 'pf-bar-actions' },
        d && !d.private && h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('Share list'), title: T('Share list'), onclick: () => share(d) }, icon('share')),
        d?.mine && h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('Edit list'), title: T('Edit list'), onclick: (e) => edit(ctx, e.currentTarget) }, icon('pencil'))));
  }

  async function share(d) {
    // /c/l/ so Discord & co. can show the list's name and posters (list-share.js); people land on /#list/<id>.
    const url = `${location.origin}/c/l/${d.id}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: d.name, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    if (await copyText(url)) toast(T('Link copied. It opens for people who can see your profile.'));
  }

  function paint(ctx) {
    const d = ctx.data;
    const page = ctx.page;
    page.setAttribute('aria-label', d.name);
    // The page takes its colour from the first poster's corner of the fan: a wash of the first title's backdrop.
    const wash = d.items.find((i) => i.backdrop)?.backdrop;
    const who = d.person;
    const scrollTop = page.scrollTop;
    page.replaceChildren(...[ // filter: replaceChildren writes null out as text
      bar(ctx),
      wash ? h('div', { class: 'pf-wash ls-wash', 'aria-hidden': 'true' }, h('img', { src: small(wash, 'w300'), alt: '', decoding: 'async' })) : null,
      h('header', { class: 'ls-head' },
        who && h('button', { type: 'button', class: 'ls-maker', onclick: (e) => openProfile(who, e.currentTarget) }, people.face(who, { size: 26 }), h('span', {}, T('A list by {0}', who.name))),
        h('h2', { class: 'ls-name' }, d.name),
        d.about && h('p', { class: 'ls-about' }, d.about),
        h('p', { class: 'ls-meta' }, countText(d.count), d.ranked ? ` · ${T('Ranked')}` : '', d.private ? ` · ${T('Only you')}` : '',
          ` · ${T('Updated {0}', new Date(d.updated).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }))}`)),
      d.items.length
        ? h('ol', { class: `ls-grid${d.ranked ? ' ranked' : ''}` }, d.items.map((it, i) => {
          const btn = h('button', { type: 'button', class: 'pf-poster', title: it.title, 'aria-label': d.ranked ? `${i + 1}. ${it.title}` : it.title, onclick: () => openTitle(it, btn, ctx.nested) },
            it.poster ? h('img', { src: small(it.poster, 'w342'), alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'pf-poster-title' }, it.title));
          return h('li', {}, d.ranked ? h('span', { class: 'ls-rank', 'aria-hidden': 'true' }, String(i + 1)) : null, btn);
        }))
        : h('div', { class: 'ls-empty' }, h('p', {}, d.mine ? T('Nothing on it yet. Tap List beside the thumbs on any film or show, or add some here.') : T('Nothing on this list yet.')),
          d.mine && h('button', { type: 'button', class: 'chip', onclick: (e) => edit(ctx, e.currentTarget, true) }, icon('plus'), T('Add titles')))].filter(Boolean));
    page.scrollTop = scrollTop;
  }

  // ---------- editing a list ----------
  function edit(ctx, opener, toSearch = false) {
    const d = ctx.data;
    const draft = { name: d.name, about: d.about, ranked: d.ranked, private: d.private, items: d.items.map((i) => ({ ...i })), removed: new Set() };
    let saved = false;
    const body = h('div', { class: 'sheet-content pf-editor ls-editor' });
    const search = titleSearch({ placeholder: T('Search for a film or show'), onPick: async (c) => {
      const key = `${c.type}:${c.id}`;
      if (draft.items.some((i) => i.key === key)) { toast(T('{0} is on the list already', c.title)); return; }
      try {
        await api(`/api/lists/${d.id}/add`, jsonPost({ key }));
        draft.removed.delete(key);
        draft.items.push({ key, type: c.type, id: c.id, title: c.title, year: c.year, poster: c.poster });
        draw();
      } catch (err) { toast(err.message); }
    } });
    const draw = () => {
      const name = h('input', { type: 'text', class: 'pf-ed-input', value: draft.name, maxlength: String(MAX_NAME), 'aria-label': T('Name') });
      name.addEventListener('input', () => { draft.name = name.value; });
      const about = h('textarea', { class: 'pf-ed-input pf-ed-bio-input', rows: '3', maxlength: String(MAX_ABOUT), placeholder: T('What ties them together (optional)'), 'aria-label': T('Description') });
      about.value = draft.about || '';
      about.addEventListener('input', () => { draft.about = about.value; });
      const sw = (label, key, hint) => h('div', { class: 'ls-switch-row' },
        h('button', { type: 'button', role: 'switch', class: 'pf-switch', 'aria-checked': String(draft[key]), 'aria-label': label, onclick: () => { draft[key] = !draft[key]; draw(); } }, h('span', {})),
        h('span', {}, h('strong', {}, label), h('small', { class: 'set-hint' }, hint)));
      body.replaceChildren(
        h('h2', { id: 'picker-title', class: 'pf-ed-heading' }, T('Edit list')),
        h('section', { class: 'ls-ed-section' },
          h('div', { class: 'pf-ed-group' }, fieldRow(T('Name'), name, MAX_NAME), fieldRow(T('Description'), about, MAX_ABOUT)),
          h('div', { class: 'pf-ed-group ls-switches' },
            sw(T('Ranked'), 'ranked', T('Numbers the titles in your order.')),
            sw(T('Only me'), 'private', T('Hidden from your profile and from links.')))),
        h('section', { class: 'ls-ed-section' }, h('h3', { class: 'pf-ed-title' }, T('Titles')),
          search.node,
          draft.items.length ? h('ol', { class: 'pf-order ls-order' }, draft.items.map((it, i) => h('li', {},
            it.poster ? h('img', { class: 'ls-order-poster', src: small(it.poster, 'w92'), alt: '', loading: 'lazy' }) : h('span', { class: 'ls-order-poster' }),
            h('span', { class: 'pf-order-name' }, draft.ranked ? `${i + 1}. ` : '', it.title, it.year ? h('span', { class: 'muted' }, ` ${it.year}`) : null),
            h('button', { type: 'button', class: 'pf-move', 'aria-label': T('Move {0} up', it.title), disabled: i === 0, onclick: () => { move(draft.items, i, -1); draw(); } }, icon('up')),
            h('button', { type: 'button', class: 'pf-move', 'aria-label': T('Move {0} down', it.title), disabled: i === draft.items.length - 1, onclick: () => { move(draft.items, i, 1); draw(); } }, icon('down')),
            h('button', { type: 'button', class: 'pf-move', 'aria-label': T('Take {0} off the list', it.title), onclick: () => { draft.removed.add(it.key); draft.items.splice(i, 1); draw(); } }, icon('close')))))
            : h('p', { class: 'set-hint' }, T('Search above, or tap List beside the thumbs on any title page.'))),
        h('section', { class: 'ls-ed-section' },
          h('button', { type: 'button', class: 'chip ls-delete', onclick: (e) => removeList(ctx, e.currentTarget) }, icon('trash'), T('Delete list'))),
        h('div', { class: 'pf-save-bar' }, h('button', { type: 'button', class: 'play-btn', onclick: (e) => save(e.currentTarget) }, T('Save'))));
    };
    async function save(btn) {
      btn.disabled = true;
      try {
        for (const key of draft.removed) await api(`/api/lists/${d.id}/remove`, jsonPost({ key }));
        ctx.data = (await api(`/api/lists/${d.id}`, jsonPost({ name: draft.name, about: draft.about, ranked: draft.ranked, private: draft.private, order: draft.items.map((i) => i.key) }))).list;
        saved = true;
        paint(ctx);
        changed();
        picker.close();
      } catch (err) { toast(err.message); btn.disabled = false; }
    }
    draw();
    picker.open([body], opener, () => { if (!saved && draft.items.length !== d.items.length) load(ctx); }, over());
    if (toSearch) requestAnimationFrame(() => search.focus());
  }
  // One row of the grouped fields (the profile editor's look): label over a borderless input, with a live count.
  const fieldRow = (label, input, max) => {
    const count = h('span', { class: 'pf-count' }, `${input.value.length}/${max}`);
    input.addEventListener('input', () => { count.textContent = `${input.value.length}/${max}`; });
    return h('label', { class: 'pf-ed-row' }, h('span', { class: 'pf-ed-label' }, h('span', {}, label), count), input);
  };
  const move = (list, i, by) => { const [x] = list.splice(i, 1); list.splice(i + by, 0, x); };

  async function removeList(ctx, btn) {
    if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.lastChild.textContent = T('Tap again to delete'); return; }
    btn.disabled = true;
    try {
      await api(`/api/lists/${ctx.id}/delete`, jsonPost({}));
      changed();
      picker.close();
      setTimeout(() => overlay.close(), 340);
    } catch (err) { toast(err.message); btn.disabled = false; }
  }

  // ---------- making one ----------
  // key: start it with this title (from Add to list). done(list) after it's made.
  function newList(opener, { key = null, title = '', done } = {}) {
    const name = h('input', { type: 'text', class: 'pf-ed-input', maxlength: String(MAX_NAME), placeholder: T('e.g. Films that ruined my sleep'), 'aria-label': T('Name'), enterkeyhint: 'done' });
    const about = h('textarea', { class: 'pf-ed-input pf-ed-bio-input', rows: '3', maxlength: String(MAX_ABOUT), placeholder: T('What ties them together (optional)'), 'aria-label': T('Description') });
    const go = h('button', { type: 'button', class: 'play-btn' }, T('Make list'));
    const make = async () => {
      if (!name.value.trim()) { name.focus(); return; }
      go.disabled = true;
      try {
        const { list } = await api('/api/lists', jsonPost({ name: name.value, about: about.value, key }));
        changed();
        picker.close();
        done ? done(list) : setTimeout(() => open(list.id, null), 340);
      } catch (err) { toast(err.message); go.disabled = false; }
    };
    go.onclick = make;
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
    picker.open([h('div', { class: 'sheet-content ls-editor ls-new' },
      h('h2', { id: 'picker-title', class: 'pf-ed-heading' }, T('New list')),
      key && title && h('p', { class: 'picker-sub muted' }, T('Starts with {0}', title)),
      h('section', { class: 'ls-ed-section' },
        h('div', { class: 'pf-ed-group' }, fieldRow(T('Name'), name, MAX_NAME), fieldRow(T('Description'), about, MAX_ABOUT)),
        h('p', { class: 'pf-ed-note' }, T('Shows on your profile, for the people who can see it.'))),
      h('div', { class: 'pf-save-bar' }, go))], opener, null, over());
    requestAnimationFrame(() => name.focus());
  }

  // ---------- Add to list (the List button beside the thumbs) ----------
  async function addTo(key, title, opener) {
    const body = h('div', { class: 'sheet-content ls-add' }, h('h2', { id: 'picker-title' }, T('Add to a list')), h('p', { class: 'picker-sub muted' }, title), h('p', { class: 'muted' }, T('Loading…')));
    picker.open([body], opener, null, over());
    let lists;
    try { lists = (await api(`/api/lists?key=${encodeURIComponent(key)}`)).lists; } catch (err) { body.lastChild.textContent = err.message; return; }
    const row = (l) => {
      const btn = h('button', { type: 'button', class: 'ls-add-row', 'aria-pressed': String(Boolean(l.has)) },
        h('span', { class: 'ls-add-poster', 'aria-hidden': 'true' }, l.preview?.[0]?.poster ? h('img', { src: small(l.preview[0].poster, 'w92'), alt: '', loading: 'lazy' }) : icon('plus')),
        h('span', { class: 'ls-add-text' }, h('strong', {}, l.name), h('small', {}, countText(l.count), l.private ? ` · ${T('Only you')}` : '')),
        h('span', { class: 'ls-add-check', 'aria-hidden': 'true' }, icon('check')));
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const r = await api(`/api/lists/${l.id}/${l.has ? 'remove' : 'add'}`, jsonPost({ key }));
          l.has = !l.has; l.count = r.list.count;
          btn.replaceWith(row(l));
          changed();
        } catch (err) { toast(err.message); btn.disabled = false; }
      };
      return btn;
    };
    body.replaceChildren(body.firstChild, body.children[1],
      h('div', { class: 'ls-add-list' }, ...lists.map(row)),
      h('button', { type: 'button', class: 'ls-add-row ls-add-new', onclick: () => thenOpen(() => newList(opener, { key, title, done: () => {} })) },
        h('span', { class: 'ls-add-poster', 'aria-hidden': 'true' }, icon('plus')), h('span', { class: 'ls-add-text' }, h('strong', {}, T('New list')), h('small', {}, T('Starts with this title')))));
  }
  // The pill beside the thumbs on title pages (social.js rateHooks.extra). Hidden where lists aren't available.
  function listButton(key, title) {
    const m = me();
    if (!key || !m?.email || m.restricted || m.email === 'home') return null;
    const btn = h('button', { type: 'button', class: 'rate-review rate-list', 'aria-label': T('Add to a list'), title: T('Add to a list') }, icon('list'), h('span', {}, T('List')));
    btn.onclick = () => addTo(key, title, btn);
    return btn;
  }

  return { cards, open, fromHash, newList, addTo, listButton };
}
