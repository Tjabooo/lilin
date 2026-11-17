// Friends (Settings → Friends): find people by name, send a request, answer the ones you get, and see
// your friends. Friends can send each other Moments (moments.js). Restricted people (People → Restrict)
// have no friends, so they get no section at all. Server side: src/friends.js, /api/friends.
//
// app.js passes in its helpers; this file keeps its own little state and asks app.js to redraw Settings.
import { T } from './i18n.js';

export function createFriends({ h, api, jsonPost, toast, icon, people, me, rerender }) {
  const view = { loaded: false, loading: null, data: { friends: [], incoming: [], outgoing: [] }, query: '', results: null, searching: 0, jump: false };

  function load() {
    view.loading ||= api('/api/friends').then((r) => { view.data = r; view.loaded = true; })
      .catch(() => { view.loaded = true; }).finally(() => { view.loading = null; });
    return view.loading;
  }
  const needed = () => { if (view.loaded || view.loading) return; load().then(rerender); };
  const invalidate = () => { view.loaded = false; };
  const friendList = () => view.data.friends || [];
  const incomingCount = () => (view.data.incoming || []).length;

  async function act(action, person, done) {
    try {
      const r = await api(`/api/friends/${action}`, jsonPost({ id: person.id }));
      view.data = { friends: r.friends, incoming: r.incoming, outgoing: r.outgoing };
      view.loaded = true;
      if (view.results) view.results = view.results.map((p) => (p.id === person.id ? { ...p, state: r.state || null } : p));
      if (done) toast(done(r));
    } catch (err) { toast(err.message); }
    rerender();
  }

  // Search as you type (a short pause first); the results replace themselves without redrawing Settings.
  let timer = null;
  function searchBox() {
    const input = h('input', { type: 'search', class: 'invite-note friends-search', placeholder: T('Find someone by name'), 'aria-label': T('Find someone by name'),
      maxlength: '40', value: view.query, autocomplete: 'off', enterkeyhint: 'search' });
    const results = h('div', { class: 'friends-results', 'aria-live': 'polite' });
    const show = () => results.replaceChildren(...resultNodes());
    input.addEventListener('input', () => {
      view.query = input.value;
      clearTimeout(timer);
      if (input.value.trim().length < 2) { view.results = null; show(); return; }
      timer = setTimeout(async () => {
        const n = ++view.searching;
        try {
          const r = await api(`/api/friends/search?q=${encodeURIComponent(input.value.trim())}`);
          if (n === view.searching) { view.results = r.people || []; show(); }
        } catch (err) { if (n === view.searching) { view.results = []; toast(err.message); show(); } }
      }, 220);
    });
    show();
    return h('div', { class: 'friends-find' }, h('span', { class: 'friends-find-field' }, icon('search'), input), results);
  }
  function resultNodes() {
    if (!view.results) return [];
    if (!view.results.length) return [h('p', { class: 'set-hint friends-none' }, T('Nobody by that name.'))];
    return [h('ul', { class: 'friend-list' }, view.results.map((p) => {
      const action = p.state === 'friend' ? h('span', { class: 'friend-state' }, icon('check'), T('Friends'))
        : p.state === 'sent' ? h('span', { class: 'friend-state' }, T('Asked'))
          : p.state === 'received' ? h('button', { type: 'button', class: 'chip friend-yes', onclick: () => act('accept', p, () => T('You and {0} are friends now', p.name)) }, T('Accept'))
            : h('button', { type: 'button', class: 'chip', onclick: () => act('request', p, (r) => (r.state === 'friend' ? T('You and {0} are friends now', p.name) : T('Friend request sent to {0}', p.name))) }, icon('plus'), T('Add'));
      return row(p, null, action);
    }))];
  }
  function row(p, meta, ...actions) {
    return h('li', { class: 'friend' }, people.face(p, { size: 40 }),
      h('div', { class: 'friend-text' }, h('div', { class: 'friend-name' }, p.name), meta && h('div', { class: 'friend-meta' }, meta)),
      h('div', { class: 'friend-actions' }, ...actions));
  }

  // The Settings group. Empty for restricted people (no friends at all).
  function settings() {
    if (me()?.restricted || !me()?.email) return [];
    needed();
    const d = view.data;
    const out = [h('h3', { class: 'set-head', 'data-anchor': 'friends' }, T('Friends'))];
    const body = [];
    if (d.incoming?.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, T('Asked to be your friend')),
        h('ul', { class: 'friend-list' }, d.incoming.map((p) => row(p, null,
          h('button', { type: 'button', class: 'chip friend-yes', onclick: () => act('accept', p, () => T('You and {0} are friends now', p.name)) }, T('Accept')),
          h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Decline {0}', p.name), title: T('Decline'), onclick: () => act('remove', p) }, icon('close')))))));
    }
    body.push(searchBox());
    if (d.friends?.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, d.friends.length === 1 ? T('1 friend') : T('{0} friends', d.friends.length)),
        h('ul', { class: 'friend-list' }, d.friends.map((p) => row(p, null,
          h('button', { type: 'button', class: 'friend-link', onclick: () => { if (confirm(T('Remove {0} from your friends?', p.name))) act('remove', p, () => T('Removed')); } }, T('Remove')))))));
    } else if (view.loaded && !d.incoming?.length) {
      body.push(h('p', { class: 'set-hint friends-empty' }, T('Add friends to send them moments from films and episodes. They say yes first.')));
    }
    if (d.outgoing?.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, T('Waiting for an answer')),
        h('ul', { class: 'friend-list' }, d.outgoing.map((p) => row(p, null,
          h('button', { type: 'button', class: 'friend-link', onclick: () => act('remove', p, () => T('Request taken back')) }, T('Take back')))))));
    }
    out.push(h('div', { class: 'friends' }, body));
    if (view.jump) {
      view.jump = false;
      requestAnimationFrame(() => document.querySelector('[data-anchor="friends"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    return out;
  }

  return { settings, load, invalidate, friendList, incomingCount, jumpNext: () => { view.jump = true; view.loaded = false; } };
}
