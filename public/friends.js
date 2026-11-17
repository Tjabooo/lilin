// Friends (You → Friends): find people by name, send a request, answer the ones you get, and see
// your friends. Friends can send each other Moments (moments.js). Restricted people (People → Restrict)
// have no friends, so they get no page at all. Server side: src/friends.js, /api/friends.
// Requests also show as For you cards at the top of You (forYou), and pop up once when Lilin opens (askSheet).
//
// app.js passes in its helpers; this file keeps its own little state and asks app.js to redraw the You page.
import { T } from './i18n.js';

export function createFriends({ h, api, jsonPost, toast, icon, people, me, rerender, openProfile = null, invite = () => null }) {
  const view = { loaded: false, loading: null, data: { friends: [], incoming: [], outgoing: [] }, query: '', results: null, searching: 0 };

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
    let ok = false;
    try {
      const r = await api(`/api/friends/${action}`, jsonPost({ id: person.id }));
      view.data = { friends: r.friends, incoming: r.incoming, outgoing: r.outgoing };
      view.loaded = true;
      if (view.results) view.results = view.results.map((p) => (p.id === person.id ? { ...p, state: r.state || null } : p));
      if (done) toast(done(r));
      ok = true;
    } catch (err) { toast(err.message); }
    rerender();
    return ok;
  }

  // The friend request popup (app.js: maybeAskFriends): unanswered requests pop up when Lilin opens and
  // when one arrives while it's open, so nobody has to go looking for them. Later (or closing the
  // sheet) hides those requests on this device until tomorrow; a new request pops up right away.
  const LATER = 'lilin:friend-asks-later';
  const askKey = (p) => `${p.id}:${p.at}`;
  const laterList = () => { try { return JSON.parse(localStorage.getItem(LATER)) || {}; } catch { return {}; } };
  function waitingAsks() {
    if (me()?.restricted || !me()?.email) return [];
    const later = laterList(), now = Date.now();
    return (view.data.incoming || []).filter((p) => !(later[askKey(p)] > now));
  }
  function askLater(people) {
    const now = Date.now();
    const later = Object.fromEntries(Object.entries(laterList()).filter(([, until]) => until > now));
    for (const p of people) later[askKey(p)] = now + 20 * 3600e3;
    try { localStorage.setItem(LATER, JSON.stringify(later)); } catch { /* blocked: it asks again next visit */ }
  }
  // The sheet's content. close: closes the sheet. Returns { node, unanswered } (unanswered: for askLater).
  function askSheet({ close }) {
    const asks = waitingAsks();
    const answered = new Map(); // id → 'yes' | 'no'
    const list = h('ul', { class: 'friend-list friend-asks-list' });
    const done = h('button', { class: 'play-btn whats-new-done', type: 'button', onclick: () => close() }, T('Later'));
    const draw = () => {
      list.replaceChildren(...asks.map((p) => {
        const a = answered.get(p.id);
        if (a) return row(p, null, h('span', { class: 'friend-state' }, a === 'yes' ? icon('check') : null, a === 'yes' ? T('Friends') : T('Declined')));
        const busy = (btns) => btns.forEach((b) => { b.disabled = true; });
        const yes = h('button', { type: 'button', class: 'chip friend-yes', onclick: async () => {
          busy([yes, no]);
          if (await act('accept', p)) answered.set(p.id, 'yes');
          draw();
        } }, T('Accept'));
        const no = h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Decline {0}', p.name), title: T('Decline'), onclick: async () => {
          busy([yes, no]);
          if (await act('remove', p)) answered.set(p.id, 'no');
          draw();
        } }, icon('close'));
        return row(p, null, yes, no);
      }));
      done.textContent = answered.size === asks.length ? T('Done') : T('Later');
    };
    draw();
    const one = asks.length === 1;
    const node = h('div', { class: 'whats-new friend-asks' },
      h('p', { class: 'whats-new-eyebrow' }, T('Friend requests')),
      h('h2', { id: 'picker-title' }, one ? T('{0} wants to be your friend', asks[0].name) : T('{0} people want to be your friend', asks.length)),
      h('p', { class: 'picker-sub muted' }, T('Friends can send each other moments from films and episodes.')),
      list,
      h('div', { class: 'whats-new-actions' }, done));
    return { node, count: asks.length, unanswered: () => asks.filter((p) => !answered.has(p.id)) };
  }

  // Search as you type (a short pause first); the results replace themselves without redrawing the page.
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
  // profiles: the face and name open the person's profile.
  function row(p, meta, ...actions) {
    const who = [people.face(p, { size: 40 }),
      h('div', { class: 'friend-text' }, h('div', { class: 'friend-name' }, p.name), meta && h('div', { class: 'friend-meta' }, meta))];
    return h('li', { class: 'friend' },
      openProfile ? h('button', { type: 'button', class: 'friend-open', 'aria-label': T('Open {0}’s profile', p.name), onclick: (e) => openProfile(p, e.currentTarget) }, ...who) : who,
      h('div', { class: 'friend-actions' }, ...actions));
  }

  // Accept / Decline for one request (the page's list and the For you cards).
  const answerButtons = (p) => [
    h('button', { type: 'button', class: 'chip friend-yes', onclick: () => act('accept', p, () => T('You and {0} are friends now', p.name)) }, T('Accept')),
    h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Decline {0}', p.name), title: T('Decline'), onclick: () => act('remove', p) }, icon('close'))];

  // You → Friends. Empty for restricted people and the shared home account (no friends at all).
  function page() {
    if (me()?.restricted || !me()?.email) return [];
    needed();
    const d = view.data;
    const body = [];
    if (d.incoming?.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, T('Asked to be your friend')),
        h('ul', { class: 'friend-list' }, d.incoming.map((p) => row(p, null, ...answerButtons(p))))));
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
    // Someone who isn't on Lilin yet: invite() is app.js's way to invite them, or null when this person can't.
    const inviting = invite();
    if (inviting) body.push(h('div', {}, h('button', { type: 'button', class: 'chip', onclick: (e) => inviting(e.currentTarget) }, icon('plus'), T('Invite someone to Lilin'))));
    return [h('div', { class: 'friends' }, body)];
  }

  // For you (the top of You): the newest requests as cards, Accept / Decline right there.
  function forYou(limit = 3) {
    if (me()?.restricted || !me()?.email) return [];
    return (view.data.incoming || []).slice(0, limit).map((p) => row(p, T('Wants to be your friend'), ...answerButtons(p)));
  }
  const summary = () => ({ friends: friendList().length, requests: incomingCount(), loaded: view.loaded });

  return { page, forYou, summary, load, invalidate, friendList, incomingCount, waitingAsks, askLater, askSheet, jumpNext: () => { view.loaded = false; } };
}
