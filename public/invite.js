// One Invite sheet for every way of asking someone in. Five contexts, one order: a title with its own verb, the people
// you can ask (tap = ask them), the link (Copy link, Share…) and one hint line. "Invite" means bringing someone into
// Lilin; the other titles say what they do.
//   lilin   Invite someone to Lilin: one-time links (the owner: /api/access; members with Can invite: /api/invites)
//   friend  Add a friend: requests waiting for you, then find someone by name; the link is your profile
//   room    Ask people to join: a Watch Together room (/api/watch/<token>/invitees); channels have none
//   pick    Ask people to pick: a Pick together going on (/api/match/<id>/invitees), or choosing who to ask first
//   moment  Send this moment: your friends, chosen; the link is made when it's copied
// open() shows a context in the #picker sheet (lilin, friend); mount() draws one in place: the room panel and the
// moment panel live in the player (a #picker sheet is hidden in element fullscreen), Pick together in its overlay.
//
// app.js passes in its helpers; this file has no globals beyond the DOM.
import { T, locale } from './i18n.js';

const TITLES = {
  lilin: () => T('Invite someone to Lilin'),
  friend: () => T('Add a friend'),
  room: () => T('Ask people to join'),
  pick: () => T('Ask people to pick'),
  moment: () => T('Send this moment'),
};

// Who gets what. ok: the context is there at all; people: it has people to tap (else the link only). Restricted
// people share by links only; the home network's shared account (no email) has no friends and makes no invites.
export function inviteAccess(kind, me, { admin = false, live = false, canInvite = false } = {}) {
  if (!me) return { ok: false, people: false };
  const social = Boolean(me.email && !me.restricted);
  switch (kind) {
    case 'lilin': return { ok: Boolean(admin || (social && me.canInvite)), people: false };
    case 'friend': return { ok: social, people: social };
    case 'room': return { ok: !live, people: !live && !me.restricted }; // a channel: everyone can tune in already
    case 'pick': return { ok: true, people: Boolean(canInvite && !me.restricted) };
    case 'moment': return { ok: true, people: social };
    default: return { ok: false, people: false };
  }
}

export function createInvite({ h, api, jsonPost, toast, icon, people, me, admin, copyWithToast, friendsUI, sheet }) {
  let shown = null; // the context in the open sheet, so a live update can redraw it
  const hintLine = (text) => h('p', { class: 'invite-hint' }, text);

  // ---------- the parts every context shares ----------
  // People to ask: tap one and they get a notification. send(u) resolves true when it reached them.
  function askTile(u, send) {
    const state = h('span', { class: 'room-invitee-state' }, T('Invite'));
    const tile = h('button', { type: 'button', class: 'room-invitee', 'aria-label': T('Invite {0}', u.name) },
      people.face(u, { size: 44 }), h('span', { class: 'room-invitee-name' }, u.name), state);
    tile.addEventListener('click', async () => {
      if (tile.dataset.state === 'sent' || tile.dataset.state === 'sending') return;
      tile.dataset.state = 'sending'; state.textContent = T('Sending…');
      try {
        const sent = await send(u);
        tile.dataset.state = sent ? 'sent' : 'failed';
        state.replaceChildren(...(sent ? [icon('check'), T('Invited')] : [T('Not reached')]));
        tile.setAttribute('aria-label', sent ? T('{0} invited', u.name) : T('{0} wasn’t reached', u.name));
        if (!sent) toast(T('{0}’s devices didn’t accept the notification. Copy the link instead.', u.name));
      } catch (err) { tile.dataset.state = 'failed'; state.textContent = T('Try again'); toast(err.message); }
    });
    return tile;
  }
  // The hint line says what to do: tap someone, or (nobody to ask) send the link instead.
  async function askGrid(slot, hint, { load, send, empty, tap = T('Tap someone to send them a notification.') }) {
    slot.replaceChildren(hintLine(T('Finding people…')));
    let list;
    try { list = await load(); } catch (err) { slot.replaceChildren(); hint.textContent = err.message; return; }
    slot.replaceChildren(...(list.length ? [h('ul', { class: 'room-invitee-grid' }, list.map((u) => h('li', {}, askTile(u, send))))] : []));
    hint.textContent = list.length ? tap : empty;
  }
  // Choosing people before anything is sent (who to ask to a pick, who gets a moment). states: [off, on] or none.
  function chooseGrid(list, chosen, { states = null, onChange } = {}) {
    return h('ul', { class: 'room-invitee-grid' }, list.map((u) => {
      const state = states && h('span', { class: 'room-invitee-state' });
      const tile = h('button', { type: 'button', class: 'room-invitee' }, people.face(u, { size: 44 }), h('span', { class: 'room-invitee-name' }, u.name), state);
      const paint = () => {
        const on = chosen.has(u.id);
        tile.setAttribute('aria-pressed', String(on));
        if (on) tile.dataset.state = 'sent'; else delete tile.dataset.state;
        if (state) state.textContent = on ? states[1] : states[0];
      };
      tile.addEventListener('click', () => { if (chosen.has(u.id)) chosen.delete(u.id); else chosen.add(u.id); paint(); onChange?.(chosen); });
      paint();
      return h('li', {}, tile);
    }));
  }
  // Copy link and Share… link: a URL, or a function that makes one (a moment's link exists once it's asked for).
  // compact: Share… as an icon (rows with more buttons on them).
  function linkButtons({ link, copied, title, done, pill = false, compact = false }) {
    const cls = pill ? 'room-pill' : 'chip';
    const url = async () => (typeof link === 'function' ? link() : link);
    const run = (fn) => async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { const u = await url(); if (u && await fn(u) !== false) done?.(); } catch (err) { toast(err.message); }
      finally { b.disabled = false; }
    };
    const copy = h('button', { type: 'button', class: cls, onclick: run((u) => copyWithToast(u, copied)) }, icon('copy'), T('Copy link'));
    const share = typeof navigator.share === 'function' && h('button', { type: 'button', class: cls, onclick: run(async (u) => {
      try { await navigator.share({ title, url: u }); } catch (err) { if (err?.name === 'AbortError') return false; await copyWithToast(u, copied); }
    }), ...(compact ? { 'aria-label': T('Share…'), title: T('Share…') } : {}) }, icon('share'), compact ? null : T('Share…'));
    return [copy, share].filter(Boolean);
  }

  // ---------- the five contexts ----------
  const CONTEXTS = {
    // A Watch Together room: the people grid (not for restricted people), then the room's link.
    room(ctx, access, { people: slot, link, hint }) {
      link.replaceChildren(...linkButtons({ link: `${location.origin}/c/w/${ctx.token}`, pill: true, title: ctx.title,
        copied: T('Room link copied. Everyone uses their usual Lilin sign-in.') }));
      if (!access.people) { slot.remove(); hint.textContent = T('Copy the link and send it to whoever you like.'); return; }
      askGrid(slot, hint, {
        load: async () => (await api(`/api/watch/${ctx.token}/invitees?clientId=${encodeURIComponent(ctx.clientId)}`)).people,
        send: async (u) => Boolean((await api(`/api/watch/${ctx.token}/invite`, jsonPost({ clientId: ctx.clientId, userIds: [u.id] }))).sent),
        empty: T('Nobody else has notifications on yet. Copy the link and send it instead.'),
      });
    },

    // Pick together. Going on: ask people now, or copy the link. Not started (ctx.chosen): choose who gets asked.
    pick(ctx, access, { people: slot, link, hint }) {
      if (ctx.chosen) {
        link.remove();
        const list = access.people ? ctx.people || [] : [];
        if (!list.length) { slot.remove(); hint.textContent = access.people ? T('Copy the link once it’s going and send it to whoever’s watching.') : T('Copy the link once it’s going and send it.'); return; }
        slot.replaceChildren(chooseGrid(list, ctx.chosen, { states: [T('Invite'), T('Invited')] }));
        hint.textContent = T('They get a notification. You can also copy a link once it’s going.');
        return;
      }
      link.replaceChildren(...linkButtons({ link: `${location.origin}/?pick=${ctx.id}`, copied: T('Link copied'), title: T('Pick together') }));
      if (!access.people) { slot.remove(); hint.textContent = ctx.hint || T('Send the link to whoever’s watching.'); return; }
      askGrid(slot, hint, { tap: ctx.hint, // what's being picked
        load: async () => (await api(`/api/match/${ctx.id}/invitees`)).people,
        send: async (u) => { await api(`/api/match/${ctx.id}/invite`, jsonPost({ userIds: [u.id] })); return true; },
        empty: T('Nobody else can get a notification right now. Copy the link instead.'),
      });
    },

    // A moment: choose friends (Send to N is the caller's), or copy a link that works for anyone.
    moment(ctx, access, { people: slot, link, hint }) {
      const friends = access.people ? ctx.friends || [] : [];
      link.replaceChildren(...linkButtons({ link: ctx.link, done: ctx.done, title: ctx.title,
        copied: T('Link copied. It works for anyone, and plays once it’s ready.') }), ...(ctx.actions || []));
      if (!friends.length) {
        slot.remove();
        hint.textContent = access.people ? T('Add friends under You → Friends to send moments straight to them. Or copy the link.') : T('Copy the link and send it to whoever you like.');
        return;
      }
      slot.replaceChildren(chooseGrid(friends, ctx.chosen, { onChange: ctx.onChange }));
      hint.remove();
    },

    // Add a friend: requests waiting for you, then find someone by name. The link is your own profile.
    friend(ctx, access, { people: slot, link, hint }) {
      slot.replaceChildren(...friendsUI.addNodes());
      hint.textContent = T('They say yes first. Friends can send each other moments from films and episodes.');
      link.replaceChildren(...linkButtons({ link: async () => {
        cache.handle ||= (await api('/api/profiles/me'))?.person?.handle || null;
        const handle = cache.handle;
        if (!handle) throw new Error(T('Your profile has no address yet. Open it once to get one.'));
        return `${location.origin}/#@${handle}`;
      }, title: T('{0} on Lilin', me()?.name || ''), copied: T('Link copied. It opens for people who can see your profile.') }));
    },

    // Invite someone to Lilin: a one-time link per person, and the links still waiting to be used.
    lilin(ctx, access, { people: slot, link, hint }) {
      const owner = admin();
      const paths = owner ? { list: '/api/access', make: '/api/access/invite', revoke: (i) => `/api/access/invite/${i.id}/revoke` }
        : { list: '/api/invites', make: '/api/invites', revoke: (i) => `/api/invites/${i.id}/revoke` };
      link.remove();
      const paint = (data) => {
        if (data.error && !data.invites) { slot.replaceChildren(); hint.textContent = data.error; return; }
        if (owner && !data.configured) {
          slot.replaceChildren();
          hint.textContent = T('Set CF_API_TOKEN, CF_ACCOUNT_ID and CF_ACCESS_LIST_ID in .env to invite people from here (see docs/remote-access.md in the Lilin folder).');
          return;
        }
        const open = (data.invites || []).filter((i) => !i.state || i.state === 'open');
        const full = data.max != null && open.length >= data.max;
        const note = h('input', { class: 'invite-note', type: 'text', maxlength: '60', placeholder: T('Who’s it for?'), 'aria-label': T('Who’s it for?') });
        const make = h('button', { type: 'button', class: 'play-btn', disabled: full }, icon('copy'), T('Make link'));
        const go = async () => {
          make.disabled = true;
          try {
            const inv = await api(paths.make, jsonPost({ note: note.value.trim() }));
            await copyWithToast(inv.url, T('Invite link copied: send it to them'));
          } catch (err) { toast(err.message); }
          load();
        };
        make.addEventListener('click', go);
        note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        const date = (ms) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
        const row = (i) => h('li', { class: 'invite-open' },
          h('span', { class: 'invite-open-what' }, h('strong', {}, i.note || T('Invite')),
            h('small', {}, [T('expires {0}', date(i.expires)), owner && i.byName && T('by {0}', i.byName)].filter(Boolean).join(' · '))),
          ...linkButtons({ link: `${location.origin}/c/i/${i.token}`, copied: T('Invite link copied'), title: T('Invite someone to Lilin'), compact: true }),
          h('button', { type: 'button', class: 'chip', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await api(paths.revoke(i), jsonPost({})); toast(T('Invite cancelled')); } catch (err) { toast(err.message); }
            load();
          } }, T('Cancel')));
        slot.replaceChildren(h('div', { class: 'invite-make' }, note, make),
          open.length > 0 && h('p', { class: 'invite-open-head' }, T('Waiting to be used')),
          open.length > 0 && h('ul', { class: 'invite-open-list' }, open.map(row)),
          data.error && hintLine(T('Couldn’t read the access list: {0}', data.error)));
        hint.textContent = [data.passwords ? T('Makes a one-time link (valid 7 days). They pick a password and are signed straight in.')
          : T('Makes a one-time link (valid 7 days). They enter their email and can sign in from then on.'),
        data.max != null && T('Up to {0} open at a time.', data.max)].filter(Boolean).join(' ');
      };
      const load = async () => {
        let data;
        try { data = await api(paths.list); } catch (err) { data = { error: err.message }; }
        cache.lilin = data;
        ctx.onChange?.(data);
        paint(data);
      };
      if (cache.lilin) paint(cache.lilin); else slot.replaceChildren(hintLine(T('Loading…')));
      load();
    },
  };
  const cache = { lilin: null, handle: null };

  // Draws a context into container (its children are replaced). title: false leaves the title to the container.
  function mount(container, ctx, { sheet: inSheet = false } = {}) {
    const access = inviteAccess(ctx.kind, me(), { admin: admin(), live: ctx.live, canInvite: ctx.canInvite });
    container.classList.add('invite');
    if (!access.ok) { container.replaceChildren(); return container; }
    const text = ctx.title === false ? null : ctx.title || TITLES[ctx.kind]();
    const parts = { people: h('div', { class: 'invite-people' }), link: h('div', { class: 'invite-link' }), hint: hintLine('') };
    container.replaceChildren(...[text && h(inSheet ? 'h2' : 'h3', { class: 'invite-title', id: inSheet ? 'picker-title' : null }, text),
      parts.people, parts.link, parts.hint].filter(Boolean));
    CONTEXTS[ctx.kind]({ ...ctx, title: ctx.title || TITLES[ctx.kind]() }, access, parts);
    return container;
  }

  // The sheet (#picker): Lilin and Friend.
  function open(ctx, opener) {
    if (!inviteAccess(ctx.kind, me(), { admin: admin() }).ok) return;
    const box = mount(h('div', { class: 'invite-sheet' }), ctx, { sheet: true });
    shown = ctx;
    sheet.open([box], opener, () => { shown = null; });
  }
  // Something changed (a friend request answered elsewhere): redraw the open sheet.
  function refresh(kind) {
    if (!shown || (kind && shown.kind !== kind)) return;
    const box = document.querySelector('#picker-body .invite-sheet');
    if (!box) return;
    const typing = document.activeElement?.matches?.('.invite-sheet input');
    mount(box, shown, { sheet: true });
    if (typing) box.querySelector('input')?.focus({ preventScroll: true });
  }

  return { open, mount, refresh, forget: () => { cache.lilin = null; } };
}
