// Pick together: when nobody can agree on tonight's film. One person starts a pick (Discover's Pick together
// card), invites the others with the Watch Together tiles or a link (/?pick=<id>), and everyone swipes the same
// stack of posters: right (or ♥) for yes, left (or ✕) for no. The first title everyone says yes to pops up as a
// match, with Watch together (now, or planned for later) when the film is on the server.
// Server side: src/match.js (/api/match). Swipes are private; only matches are shared.
//
// app.js passes in its helpers; this file owns its own overlay (#pick, built here) and state.
import { T } from './i18n.js';

// The genre filter. The server (src/match.js GENRES) has the same keys with TMDB's ids.
export const GENRE_KEYS = ['action', 'comedy', 'drama', 'thriller', 'horror', 'scifi', 'fantasy', 'romance', 'crime', 'mystery',
  'animation', 'family', 'adventure', 'war', 'history', 'documentary'];
const FILM_ONLY = new Set(['horror', 'romance', 'history']);
const genreName = (key) => ({
  action: T('Action'), comedy: T('Comedy'), drama: T('Drama'), thriller: T('Thriller'), horror: T('Horror'), scifi: T('Sci-fi'),
  fantasy: T('Fantasy'), romance: T('Romance'), crime: T('Crime'), mystery: T('Mystery'), animation: T('Animation'), family: T('Family'),
  adventure: T('Adventure'), war: T('War'), history: T('Historical'), documentary: T('Documentary'),
}[key] || key);
const LENGTHS = [[0, () => T('Any length')], [100, () => T('Under 1 h 40')], [120, () => T('Under 2 h')], [150, () => T('Under 2 h 30')]];
const LOW = 8; // the server deals another hand when someone has fewer cards left than this (match.js LOW)

// Whether a drag ends as a swipe: far enough, or a quick flick the same way. 1 yes, -1 no, 0 back to the stack.
export function swipeOutcome(dx, vx, width) {
  const far = Math.min(120, (width || 360) * 0.3);
  if (Math.abs(dx) > far) return Math.sign(dx);
  if (Math.abs(vx) > 0.5 && Math.abs(dx) > 30 && Math.sign(vx) === Math.sign(dx)) return Math.sign(dx);
  return 0;
}

const fmtRuntime = (min) => (min >= 60 ? T('{0} h {1} min', Math.floor(min / 60), min % 60) : T('{0} min', min));
const pad = (n) => String(n).padStart(2, '0');
const localInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tonight = () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d.getTime() < Date.now() + 10 * 60000) d.setDate(d.getDate() + 1); return d.getTime(); };
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createMatch({ h, api, jsonPost, toast, icon, people, me, copyWithToast, pushOverlay, closeTopOverlay, openTitle,
  enterRoom, offerRoom, watchClient, canDownload = () => false, invite }) {
  let root = null, body = null, head = null;
  let open = false;
  let mode = null;           // 'setup' | 'join' | 'swipe' | 'loading'
  let pick = null;           // the server's view of the pick
  let cards = [];            // every card dealt so far
  let mine = {};             // my swipes, key -> 1 | -1
  let undoStack = [];        // keys I swiped, newest last
  let shownMatches = new Set();
  let dealing = null;
  let refreshing = null;
  let listCache = null;      // GET /api/match, for the Discover card and the setup sheet
  let entryEl = null;
  const setup = { type: 'movie', genre: '', maxMinutes: 0, unseen: true, serverOnly: false, invite: new Set() };

  // ---------- the overlay ----------
  function build() {
    if (root) return;
    head = h('div', { class: 'pick-head' });
    body = h('div', { class: 'pick-body' });
    root = h('div', { class: 'pick', id: 'pick', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pick-title', hidden: true },
      h('div', { class: 'pick-panel', tabindex: '-1' }, head, body));
    root.addEventListener('click', (e) => { if (e.target === root) closeTopOverlay(); });
    root.addEventListener('keydown', onKey);
    document.body.append(root);
  }
  function show() {
    build();
    if (open) return;
    open = true;
    root.hidden = false;
    document.body.classList.add('pick-open');
    requestAnimationFrame(() => root.classList.add('open'));
    pushOverlay(() => {
      open = false;
      root.classList.remove('open');
      document.body.classList.remove('pick-open');
      setTimeout(() => { if (!open) root.hidden = true; }, 260);
      refreshEntry();
    });
  }
  const close = () => { if (open) closeTopOverlay(); };

  function header({ title = '', faces = null, actions = [] } = {}) {
    head.replaceChildren(
      h('button', { type: 'button', class: 'icon-btn pick-close', 'aria-label': T('Close'), onclick: close }, icon('close')),
      h('div', { class: 'pick-head-mid' }, faces || h('h2', { id: 'pick-title', class: 'pick-head-title' }, title)),
      ...actions);
  }

  // ---------- start a pick ----------
  async function loadList() {
    try { listCache = { at: Date.now(), data: await api('/api/match') }; } catch { listCache = { at: Date.now(), data: { picks: [], people: [], canInvite: false } }; }
    return listCache.data;
  }

  async function openSetup() {
    mode = 'setup'; pick = null;
    show();
    header({ title: T('Pick together') });
    body.replaceChildren(h('p', { class: 'muted pick-loading' }, T('Loading…')));
    const data = await loadList();
    if (mode !== 'setup') return;
    renderSetup(data);
  }

  function renderSetup(data) {
    const status = h('p', { class: 'pick-status', role: 'status' });
    const section = (label, ...kids) => h('div', { class: 'pick-field' }, h('p', { class: 'pick-label' }, label), ...kids);
    const chips = (items, value, onPick, label) => h('div', { class: 'pick-chips', role: 'group', 'aria-label': label },
      items.map(([key, text]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(key === value), onclick: () => onPick(key) }, text)));
    const redraw = () => renderSetup(data);
    const genres = GENRE_KEYS.filter((k) => setup.type === 'movie' || !FILM_ONLY.has(k));
    if (!genres.includes(setup.genre)) setup.genre = '';
    const going = (data.picks || []).map((p) => h('li', {},
      h('button', { type: 'button', class: 'pick-going', onclick: () => openPick(p.id) },
        people.faces(p.invited ? [p.host] : p.members, { size: 30, max: 4 }),
        h('span', { class: 'pick-going-text' },
          h('strong', {}, p.invited ? (p.type === 'tv' ? T('{0} wants to pick a show with you', p.host?.name || '') : T('{0} wants to pick a film with you', p.host?.name || ''))
            : p.mine ? T('Your pick') : T('{0}’s pick', p.host?.name || '')),
          h('span', { class: 'muted' }, p.invited ? T('Join and start swiping') : p.matches ? (p.matches === 1 ? T('1 match so far') : T('{0} matches so far', p.matches)) : T('Still swiping'))),
        h('span', { class: 'pick-going-go', 'aria-hidden': 'true' }, '›'))));
    // Who to ask (the Invite sheet's Pick part, choosing before it starts): they get a notification once it's going.
    const ask = invite.mount(h('div'), { kind: 'pick', title: false, chosen: setup.invite, people: data.people || [], canInvite: data.canInvite });
    const start = h('button', { type: 'button', class: 'play-btn pick-start', onclick: async () => {
      start.disabled = true; status.textContent = '';
      mode = 'loading';
      body.replaceChildren(dealingNote());
      try {
        const state = await api('/api/match', jsonPost({ type: setup.type, genre: setup.genre, maxMinutes: setup.maxMinutes, unseen: setup.unseen,
          serverOnly: setup.serverOnly, invite: [...setup.invite] }));
        setup.invite.clear();
        listCache = null;
        enter(state);
        if (state.invited?.length) toast(T('Sent. They’ll see your pick when they open it.'));
      } catch (err) {
        mode = 'setup'; renderSetup(data);
        body.querySelector('.pick-status').textContent = err.message;
      }
    } }, T('Start swiping'));
    body.replaceChildren(h('div', { class: 'pick-setup' },
      h('p', { class: 'pick-lede' }, T('Everyone swipes through the same posters. The first one you all say yes to is the one.')),
      going.length ? h('ul', { class: 'pick-going-list', 'aria-label': T('Picks going on') }, going) : null,
      section(T('What'), h('div', { class: 'segmented', role: 'group', 'aria-label': T('What') },
        [['movie', T('Films')], ['tv', T('Shows')]].map(([key, text]) => h('button', { type: 'button', 'aria-pressed': String(setup.type === key),
          onclick: () => { setup.type = key; if (key === 'tv') setup.maxMinutes = 0; redraw(); } }, text)))),
      section(T('Genre'), chips([['', T('Any genre')], ...genres.map((k) => [k, genreName(k)])], setup.genre, (k) => { setup.genre = k; redraw(); }, T('Genre'))),
      setup.type === 'movie' && section(T('Length'), chips(LENGTHS.map(([m, label]) => [m, label()]), setup.maxMinutes, (m) => { setup.maxMinutes = m; redraw(); }, T('Length'))),
      h('div', { class: 'pick-switches' },
        switchRow(T('Skip what anyone here has seen'), setup.unseen, (v) => { setup.unseen = v; }),
        switchRow(T('Only what’s on the server'), setup.serverOnly, (v) => { setup.serverOnly = v; })),
      data.canInvite && data.people?.length ? section(T('Ask people to pick'), ask) : ask,
      h('div', { class: 'pick-start-row' }, start), status));
  }

  function switchRow(label, checked, onChange) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'pick-switch' }, h('span', {}, label), h('span', { class: 'switch' }, input, h('span', { 'aria-hidden': 'true' })));
  }

  const dealingNote = () => h('div', { class: 'pick-dealing', role: 'status' },
    h('div', { class: 'pick-dealing-cards', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {})),
    h('p', {}, T('Dealing posters from what you all like…')));

  // ---------- a pick ----------
  async function openPick(id) {
    if (!/^[A-Za-z0-9_-]{22}$/.test(String(id || ''))) { toast(T('That pick link doesn’t work.')); return; }
    if (open && pick?.id === id && mode === 'swipe') return;
    mode = 'loading';
    show();
    header({ title: T('Pick together') });
    body.replaceChildren(h('p', { class: 'muted pick-loading' }, T('Loading…')));
    try {
      const state = await api(`/api/match/${id}`);
      if (state.joined) enter(state); else renderJoin(state);
    } catch (err) {
      mode = 'setup';
      body.replaceChildren(h('div', { class: 'pick-gone' }, h('p', {}, err.message),
        h('button', { type: 'button', class: 'play-btn', onclick: openSetup }, T('Start a new pick'))));
    }
  }

  function renderJoin(state) {
    mode = 'join'; pick = state;
    header({ title: T('Pick together') });
    const status = h('p', { class: 'pick-status', role: 'status' });
    const join = h('button', { type: 'button', class: 'play-btn', onclick: async () => {
      join.disabled = true; status.textContent = '';
      try { enter(await api(`/api/match/${state.id}/join`, jsonPost({}))); listCache = null; }
      catch (err) { status.textContent = err.message; join.disabled = false; }
    } }, T('Join and swipe'));
    const others = (state.members || []).filter((m) => m.id !== state.host?.id);
    body.replaceChildren(h('div', { class: 'pick-join' },
      h('div', { class: 'pick-join-fan', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {})),
      people.face(state.host, { size: 64 }),
      h('h3', {}, state.type === 'tv' ? T('{0} wants to pick a show with you', state.host?.name || '') : T('{0} wants to pick a film with you', state.host?.name || '')),
      h('p', { class: 'muted' }, filterLine(state)),
      others.length ? h('p', { class: 'pick-join-here' }, people.faces(others, { size: 24, max: 5 }), h('span', {}, others.length === 1 ? T('{0} is swiping', others[0].name) : T('{0} people are swiping', others.length))) : null,
      h('p', { class: 'muted pick-hint' }, T('Swipe right for yes, left for no. Nobody sees your swipes, only what you all said yes to.')),
      join, status));
  }

  function filterLine(state) {
    const f = state.filters || {};
    return [state.type === 'tv' ? T('Shows') : T('Films'), f.genre && genreName(f.genre), f.maxMinutes && LENGTHS.find(([m]) => m === f.maxMinutes)?.[1](),
      f.unseen && T('nothing anyone has seen'), f.serverOnly && T('on the server')].filter(Boolean).join(' · ');
  }

  function enter(state) {
    if (pick?.id !== state.id) { cards = []; undoStack = []; shownMatches = new Set((state.matches || []).map((m) => m.key)); }
    apply(state);
    mode = 'swipe';
    show();
    renderSwipe();
    root.querySelector('.pick-panel').focus({ preventScroll: true }); // the arrow keys work from anywhere in it
    topUp();
  }

  // Takes the server's view in: new cards appended, my swipes, the people, the matches.
  function apply(state) {
    pick = state;
    if (state.from === 0) cards = state.cards || [];
    else if (state.cards?.length) {
      const have = new Set(cards.map((c) => c.key));
      cards.push(...state.cards.filter((c) => !have.has(c.key)));
    }
    mine = { ...state.mine };
  }

  async function refresh() {
    if (!pick?.joined || !open) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const state = await api(`/api/match/${pick.id}?from=${cards.length}`);
        if (!open || state.id !== pick?.id) return;
        const before = pick.matches?.length || 0;
        const hadRoom = pick.room?.token;
        // swipes still on their way to the server stay as they are
        const pending = Object.fromEntries(Object.entries(mine).filter(([k]) => !(k in (state.mine || {}))));
        apply(state);
        Object.assign(mine, pending);
        updateChrome();
        renderStack();
        const fresh = (state.matches || []).filter((m) => !shownMatches.has(m.key));
        if (fresh.length) { for (const m of fresh) shownMatches.add(m.key); showMatch(fresh.at(-1).key); }
        else if (state.room?.token && state.room.token !== hadRoom && matchOpen) showMatch(matchOpen);
        else if ((state.matches?.length || 0) !== before && matchOpen) showMatch(matchOpen);
      } catch (err) {
        if (err.status === 404) { toast(err.message); pick = null; close(); }
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  // Asks for another hand when I'm running out.
  async function topUp() {
    if (!pick?.more || dealing) return;
    if (unvoted().length >= LOW) return;
    dealing = (async () => {
      try {
        const r = await api(`/api/match/${pick.id}/more`, jsonPost({}));
        if (r.dealt || !unvoted().length) await refresh();
      } catch { /* the empty stack offers Try again */ }
      finally { dealing = null; if (!top()) renderStack(); }
    })();
  }

  const unvoted = () => cards.filter((c) => !(c.key in mine));
  const top = () => root?.querySelector('.pick-card.is-top');

  // ---------- swiping ----------
  let stack = null, undoBtn = null, matchesBtn = null, voteBtns = [];
  let matchOpen = null; // the key of the match on screen

  function renderSwipe() {
    stack = h('div', { class: 'pick-stack' });
    const no = h('button', { type: 'button', class: 'pick-act pick-no', 'aria-label': T('No'), onclick: () => decide(-1) },
      svg('<path d="M6 6l12 12M18 6 6 18"/>'));
    const yes = h('button', { type: 'button', class: 'pick-act pick-yes', 'aria-label': T('Yes'), onclick: () => decide(1) },
      svg('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>'));
    undoBtn = h('button', { type: 'button', class: 'pick-act pick-small', 'aria-label': T('Undo'), title: T('Undo'), onclick: undo },
      svg('<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/>'));
    const info = h('button', { type: 'button', class: 'pick-act pick-small', 'aria-label': T('About this one'), title: T('About this one'), onclick: () => top()?.classList.toggle('is-about') },
      svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>'));
    voteBtns = [no, yes, info];
    body.replaceChildren(h('div', { class: 'pick-swipe' },
      h('h2', { id: 'pick-title', class: 'sr-only' }, T('Pick together')),
      stack,
      h('div', { class: 'pick-actions' }, undoBtn, no, yes, info)));
    updateChrome();
    renderStack();
  }

  function svg(paths) {
    const s = h('span', { class: 'pick-icon', 'aria-hidden': 'true' });
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    return s;
  }

  function updateChrome() {
    if (!pick) return;
    const members = (pick.members || []).map((m) => ({ ...m, done: m.done }));
    const faces = h('div', { class: 'pick-people', title: [...members.map((m) => m.name), ...(pick.invited || []).map((u) => u.name)].join(', ') },
      ...members.slice(0, 5).map((m) => h('span', { class: `pick-person${m.done ? ' is-done' : ''}` }, people.face(m, { size: 30, label: m.me ? T('You') : m.name }))),
      ...(pick.invited || []).slice(0, Math.max(0, 5 - members.length)).map((u) => h('span', { class: 'pick-person is-invited' }, people.face(u, { size: 30, label: T('{0} (invited)', u.name) }))));
    const count = pick.matches?.length || 0;
    matchesBtn = h('button', { type: 'button', class: `chip pick-matches${count ? ' has-some' : ''}`, onclick: openMatches, hidden: !count },
      svg('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>'), String(count));
    matchesBtn.setAttribute('aria-label', count === 1 ? T('1 match') : T('{0} matches', count));
    const ask = h('button', { type: 'button', class: 'icon-btn pick-invite', 'aria-label': T('Ask people to pick'), title: T('Ask people to pick'), onclick: openInvite },
      svg('<circle cx="9.5" cy="8.5" r="3.5"/><path d="M3.5 19.5a6 6 0 0 1 12 0M18.5 8v6M15.5 11h6"/>'));
    header({ faces, actions: [matchesBtn, ask] });
    if (undoBtn) undoBtn.disabled = !undoStack.length;
  }

  // The top three unswiped cards, the top one last (it sits above the others).
  function renderStack() {
    if (!stack) return;
    const next = unvoted().slice(0, 3);
    const gone = [...stack.querySelectorAll('.pick-card.is-gone')]; // still flying off: let them finish
    if (!next.length) { stack.replaceChildren(emptyState(), ...gone); for (const b of voteBtns) b.disabled = true; return; }
    const keep = new Map([...stack.querySelectorAll('.pick-card:not(.is-gone)')].map((el) => [el.dataset.key, el]));
    const els = next.map((c, i) => {
      const el = keep.get(c.key) || cardEl(c);
      el.classList.toggle('is-top', i === 0);
      el.style.setProperty('--depth', String(i));
      el.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
      el.tabIndex = i === 0 ? 0 : -1;
      return el;
    });
    stack.replaceChildren(...els.reverse(), ...gone);
    const t = top();
    if (t && !t.dragReady) dragOn(t);
    for (const b of voteBtns) b.disabled = !t;
  }

  function emptyState() {
    if (dealing) return h('div', { class: 'pick-empty' }, dealingNote());
    if (pick?.more) return h('div', { class: 'pick-empty' }, h('p', { class: 'muted' }, T('Couldn’t deal more posters just now.')),
      h('button', { type: 'button', class: 'chip', onclick: () => { topUp(); renderStack(); } }, T('Try again')));
    const waiting = (pick?.members || []).filter((m) => !m.me && !m.done);
    return h('div', { class: 'pick-empty' },
      h('p', { class: 'pick-empty-title' }, T('That’s every poster')),
      h('p', { class: 'muted' }, waiting.length ? T('Waiting for {0} to finish.', waiting.map((m) => m.name).join(', ')) : (pick?.matches?.length ? T('Have a look at your matches.') : T('No match this time. Try a pick with other filters.'))),
      pick?.matches?.length ? h('button', { type: 'button', class: 'play-btn', onclick: openMatches }, T('See matches')) : h('button', { type: 'button', class: 'chip', onclick: () => { close(); setTimeout(openSetup, 320); } }, T('New pick')));
  }

  function cardEl(c) {
    const meta = [c.year, c.runtime && (c.type === 'movie' ? fmtRuntime(c.runtime) : null), c.type === 'tv' && c.seasons && (c.seasons === 1 ? T('1 season') : T('{0} seasons', c.seasons)),
      c.rating && `★ ${Number(c.rating).toFixed(1)}`].filter(Boolean).join(' · ');
    const img = h('img', { src: c.poster, alt: '', decoding: 'async', draggable: 'false' });
    img.addEventListener('error', () => img.remove(), { once: true });
    const why = c.why ? (c.why.liked ? T('Because you liked {0}', c.why.title) : T('Because you watched {0}', c.why.title)) : null;
    return h('article', { class: 'pick-card', 'data-key': c.key, 'aria-label': `${c.title}${c.year ? ` (${c.year})` : ''}` },
      h('div', { class: 'pick-card-art' }, img, h('span', { class: 'pick-card-fallback', 'aria-hidden': 'true' }, c.title)),
      c.onServer ? h('span', { class: 'pick-badge' }, T('On server')) : null,
      h('span', { class: 'pick-stamp is-yes', 'aria-hidden': 'true' }, T('Yes')),
      h('span', { class: 'pick-stamp is-no', 'aria-hidden': 'true' }, T('Nope')),
      h('div', { class: 'pick-card-text' },
        why && h('p', { class: 'pick-why' }, why),
        h('h3', {}, c.title),
        meta && h('p', { class: 'pick-meta' }, meta),
        c.genreNames?.length ? h('p', { class: 'pick-genres' }, c.genreNames.join(' · ')) : null),
      h('div', { class: 'pick-about' }, h('p', {}, c.overview || T('No description yet.'))));
  }

  // Drag the top card: it follows the finger, tilts, and shows Yes or Nope; let go far (or fast) enough to decide.
  function dragOn(el) {
    el.dragReady = true;
    let start = null, last = null, dx = 0, dy = 0, vx = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !el.classList.contains('is-top')) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now() }; last = { ...start };
      dx = dy = vx = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const now = performance.now();
      dx = e.clientX - start.x; dy = e.clientY - start.y;
      if (now - last.t > 16) { vx = (e.clientX - last.x) / (now - last.t); last = { x: e.clientX, y: e.clientY, t: now }; }
      el.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
      el.style.setProperty('--yes', String(Math.max(0, Math.min(1, dx / 90))));
      el.style.setProperty('--no', String(Math.max(0, Math.min(1, -dx / 90))));
    });
    const end = () => {
      if (!start) return;
      const moved = Math.hypot(dx, dy);
      start = null;
      el.classList.remove('is-dragging');
      const result = swipeOutcome(dx, vx, el.offsetWidth);
      if (result) { fly(el, result, dy); return; }
      el.style.transform = ''; el.style.removeProperty('--yes'); el.style.removeProperty('--no');
      if (moved < 6) el.classList.toggle('is-about');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { dx = 0; vx = 0; end(); });
  }

  function decide(vote) {
    const el = top();
    if (el) fly(el, vote, 0);
  }

  function fly(el, vote, dy) {
    const key = el.dataset.key;
    el.classList.remove('is-top');
    el.classList.add('is-gone');
    el.style.setProperty(vote > 0 ? '--yes' : '--no', '1');
    el.style.transform = `translate(${vote * (el.offsetWidth * 1.5 + 80)}px, ${dy * 0.3 + 30}px) rotate(${vote * 28}deg)`;
    setTimeout(() => el.remove(), reduced() ? 0 : 280);
    send(key, vote);
  }

  async function send(key, vote) {
    if (!pick) return;
    mine[key] = vote;
    undoStack.push(key);
    if (undoStack.length > 30) undoStack.shift();
    topUp(); // before drawing, so an empty stack says it's dealing
    renderStack(); updateUndo();
    try {
      const r = await api(`/api/match/${pick.id}/vote`, jsonPost({ key, vote }));
      if (r.match) {
        shownMatches.add(r.match);
        pick.matches = [...(pick.matches || []), { key: r.match, at: Date.now(), onServer: cards.find((c) => c.key === r.match)?.onServer }];
        updateChrome();
        showMatch(r.match);
      }
      if (!r.left) refresh();
    } catch (err) {
      delete mine[key];
      undoStack = undoStack.filter((k) => k !== key);
      renderStack(); updateUndo();
      toast(err.message);
    }
    topUp();
  }
  const updateUndo = () => { if (undoBtn) undoBtn.disabled = !undoStack.length; };

  async function undo() {
    const key = undoStack.pop();
    if (!key || !pick) return;
    const was = mine[key];
    delete mine[key];
    renderStack(); updateUndo();
    try { await api(`/api/match/${pick.id}/vote`, jsonPost({ key, vote: 0 })); }
    catch (err) { mine[key] = was; undoStack.push(key); renderStack(); updateUndo(); toast(err.message); }
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    if (mode !== 'swipe' || matchOpen || root.querySelector('.pick-pop')) {
      if (e.key === 'Escape' && root.querySelector('.pick-pop')) { e.stopPropagation(); closePop(); }
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); decide(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); decide(-1); }
    else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
    else if ((e.key === ' ' || e.key === 'ArrowUp') && top()) { e.preventDefault(); top().classList.toggle('is-about'); }
  }

  // ---------- a match ----------
  function closePop() {
    root.querySelector('.pick-pop')?.remove();
    matchOpen = null;
    root.querySelector('.pick-panel').focus({ preventScroll: true });
  }

  function showMatch(key) {
    const c = cards.find((x) => x.key === key);
    if (!c || !root) return;
    root.querySelector('.pick-pop')?.remove();
    matchOpen = key;
    const status = h('p', { class: 'pick-status', role: 'status' });
    const room = pick.room?.key === key ? pick.room : null;
    const film = c.type === 'movie';
    const onServer = Boolean(pick.matches?.find((m) => m.key === key)?.onServer ?? c.onServer);
    const plan = h('div', { class: 'pick-plan', hidden: true });
    const actions = h('div', { class: 'pick-pop-actions' });
    if (room) {
      actions.append(
        h('p', { class: 'pick-pop-room' }, room.startsAt ? T('{0} planned it for {1}', room.by, new Date(room.startsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) : T('{0} started the room', room.by)),
        h('button', { type: 'button', class: 'play-btn', onclick: () => offerRoom(room.token) }, icon('party'), room.startsAt ? T('Open the party') : T('Join the room')));
    } else if (film && onServer) {
      const now = h('button', { type: 'button', class: 'play-btn', onclick: async () => {
        now.disabled = true; status.textContent = '';
        try {
          const r = await api(`/api/match/${pick.id}/watch`, jsonPost({ key, clientId: watchClient }));
          closePop();
          await enterRoom(r.room);
        } catch (err) { status.textContent = err.message; now.disabled = false; }
      } }, icon('party'), T('Watch together'));
      actions.append(now, h('button', { type: 'button', class: 'chip', onclick: () => { plan.hidden = !plan.hidden; if (!plan.hidden) plan.querySelector('input')?.focus(); } }, icon('clock'), T('Plan for later')));
      plan.append(...planForm(key, status));
    } else {
      actions.append(h('p', { class: 'muted pick-pop-note' }, film ? (canDownload() ? T('Not on the server yet. Open it to download it, then watch it together.') : T('Not on the server yet. Open it to see your options.'))
        : T('Open the show, start an episode and press Watch together.')),
      h('button', { type: 'button', class: 'play-btn', onclick: () => openTitle(c) }, T('Open')));
    }
    if (room || (film && onServer)) actions.append(h('button', { type: 'button', class: 'chip', onclick: () => openTitle(c) }, T('Open')));
    const everyone = (pick.members || []);
    const pop = h('div', { class: 'pick-pop', role: 'alertdialog', 'aria-labelledby': 'pick-match-title', 'aria-modal': 'true' },
      h('div', { class: 'pick-pop-card' },
        h('p', { class: 'pick-pop-kicker' }, T('It’s a match')),
        h('div', { class: 'pick-pop-poster' }, h('img', { src: c.poster, alt: '' })),
        h('h3', { id: 'pick-match-title' }, c.title),
        h('p', { class: 'pick-pop-who' }, people.faces(everyone, { size: 26, max: 6 }), h('span', {}, everyone.length === 2 ? T('You both said yes') : T('All {0} of you said yes', everyone.length))),
        actions, plan, status,
        h('button', { type: 'button', class: 'pick-keep', onclick: closePop }, T('Keep swiping'))));
    root.querySelector('.pick-panel').append(pop);
    requestAnimationFrame(() => pop.classList.add('open'));
    pop.querySelector('.play-btn')?.focus({ preventScroll: true });
  }

  function planForm(key, status) {
    const input = h('input', { type: 'datetime-local', class: 'party-when', value: localInput(tonight()),
      min: localInput(Date.now() + 60000), max: localInput(Date.now() + 14 * 86400000), 'aria-label': T('Start time') });
    const quick = [[T('In 15 min'), () => Date.now() + 15 * 60000], [T('In 1 hour'), () => Date.now() + 3600000], [T('Tonight 20:00'), tonight]]
      .map(([label, at]) => h('button', { type: 'button', class: 'chip', onclick: () => { input.value = localInput(at()); } }, label));
    const go = h('button', { type: 'button', class: 'play-btn', onclick: async () => {
      const startsAt = new Date(input.value).getTime();
      if (!Number.isFinite(startsAt)) { status.textContent = T('Pick a day and time.'); return; }
      go.disabled = true; status.textContent = '';
      try {
        const r = await api(`/api/match/${pick.id}/watch`, jsonPost({ key, startsAt }));
        pick.room = { token: r.room.token, key, by: me()?.name || '', startsAt: r.room.startsAt || startsAt };
        showMatch(key);
        copyWithToast(`${location.origin}/?watch=${r.room.token}`, T('Party planned. Invite link copied.'));
      } catch (err) { status.textContent = err.message; go.disabled = false; }
    } }, T('Plan the party'));
    return [h('div', { class: 'party-quick' }, ...quick), input, go];
  }

  function openMatches() {
    const list = (pick?.matches || []).map((m) => cards.find((c) => c.key === m.key)).filter(Boolean).reverse();
    if (!list.length) return;
    root.querySelector('.pick-pop')?.remove();
    const pop = h('div', { class: 'pick-pop', role: 'dialog', 'aria-label': T('Matches'), 'aria-modal': 'true' },
      h('div', { class: 'pick-pop-card pick-pop-list' },
        h('p', { class: 'pick-pop-kicker' }, list.length === 1 ? T('1 match') : T('{0} matches', list.length)),
        h('ul', { class: 'pick-match-list' }, list.map((c) => h('li', {},
          h('button', { type: 'button', class: 'pick-match-row', onclick: () => showMatch(c.key) },
            h('img', { src: c.poster, alt: '', loading: 'lazy' }),
            h('span', {}, h('strong', {}, c.title), h('span', { class: 'muted' }, [c.year, c.onServer && T('On server')].filter(Boolean).join(' · '))),
            h('span', { class: 'pick-going-go', 'aria-hidden': 'true' }, '›'))))),
        h('button', { type: 'button', class: 'pick-keep', onclick: closePop }, T('Keep swiping'))));
    matchOpen = null;
    root.querySelector('.pick-panel').append(pop);
    requestAnimationFrame(() => pop.classList.add('open'));
  }

  // ---------- inviting, the link, leaving ----------
  // The Invite sheet's Pick part (invite.js) in a popup over the stack, with leaving the pick under it.
  function openInvite() {
    if (!pick) return;
    root.querySelector('.pick-pop')?.remove();
    const card = h('div', { class: 'pick-pop-card pick-pop-list' },
      invite.mount(h('div'), { kind: 'pick', id: pick.id, canInvite: pick.canInvite, hint: filterLine(pick) }),
      h('button', { type: 'button', class: 'pick-leave', onclick: leave }, T('Leave this pick')),
      h('button', { type: 'button', class: 'pick-keep', onclick: closePop }, T('Keep swiping')));
    const pop = h('div', { class: 'pick-pop', role: 'dialog', 'aria-label': T('Ask people to pick'), 'aria-modal': 'true' }, card);
    root.querySelector('.pick-panel').append(pop);
    requestAnimationFrame(() => pop.classList.add('open'));
  }

  async function leave() {
    if (!pick) return;
    try { await api(`/api/match/${pick.id}/leave`, jsonPost({})); } catch (err) { toast(err.message); return; }
    pick = null; cards = []; listCache = null;
    toast(T('You left the pick'));
    close();
  }

  // ---------- Discover's tile ----------
  // The first tile of Discover's Moods row: start a pick, or get back to one that's going (or that you were invited
  // to). A pick that's going lights the tile's edge (a still glow, no pulse).
  async function tile(signal) {
    const data = listCache && Date.now() - listCache.at < 30000 ? listCache.data : await loadList();
    if (signal?.aborted) return null;
    entryEl = h('li', { class: 'vibe-item' });
    fillEntry(data);
    return entryEl;
  }
  function fillEntry(data) {
    if (!entryEl) return;
    const p = (data.picks || [])[0];
    let title = T('Pick together'), sub = T('Everyone swipes, the first shared yes wins.'), faces = null;
    if (p?.invited) {
      title = p.type === 'tv' ? T('{0} wants to pick a show with you', p.host?.name || '') : T('{0} wants to pick a film with you', p.host?.name || '');
      sub = T('Join and start swiping'); faces = people.faces([p.host], { size: 28 });
    } else if (p) {
      title = p.mine ? T('Your pick is still going') : T('{0}’s pick is still going', p.host?.name || '');
      sub = p.matches ? (p.matches === 1 ? T('1 match so far') : T('{0} matches so far', p.matches)) : T('Carry on swiping');
      faces = people.faces(p.members, { size: 28, max: 3 });
    }
    entryEl.replaceChildren(h('button', { type: 'button', class: `vibe-tile pick-tile${p ? ' is-going' : ''}`, onclick: () => (p ? openPick(p.id) : openSetup()) },
      faces ? h('span', { class: 'pick-tile-art' }, faces) : h('span', { class: 'pick-tile-art', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {})),
      h('span', { class: 'vibe-kicker' }, sub), h('span', { class: 'vibe-name' }, title)));
  }
  async function refreshEntry() {
    if (!entryEl?.isConnected) return;
    fillEntry(await loadList());
  }

  // A "match" event from the server: someone joined, swiped their last card, a new hand or a match.
  function onLive() {
    listCache = null;
    if (open && mode === 'swipe') refresh();
    else refreshEntry();
  }

  return { tile, open: openSetup, openPick, onLive, isOpen: () => open };
}
