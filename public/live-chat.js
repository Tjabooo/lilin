// The chat on a Live TV channel (server: src/live-chat.js). A panel beside the picture on wide or landscape
// screens and a sheet under it on phones; collapsed it's a Chat button in the channel strip (with a dot for new
// messages) and new lines float briefly over the picture. Messages come over the channel room's own stream
// (watch-sync.js), so this only draws them. Restricted people get no panel (the server sends them nothing either).
import { T } from './i18n.js';

const SVG = {
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1.2-4.2A7.5 7.5 0 1 1 20 12.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
};
const STORE = 'live:chat';

// deps: { h, api, jsonPost, toast, people, social (chatLine, floatMessage, burst), reactions, me() -> user,
//   client (this player's room id), player (the #player element), floats (#chat-layer), bursts (#reaction-layer),
//   say(text) -> Promise, react(emoji), layout() (after the picture moved) }
export function createLiveChat(deps) {
  const { h, people, social } = deps;
  const svg = (name) => { const s = h('span'); s.innerHTML = SVG[name]; return s.firstChild; };
  let open = false;
  try { open = localStorage.getItem(STORE) === 'open'; } catch { /* blocked */ }
  let session = null, channel = null, messages = [], unread = 0, hideTimer = null, shown = false;

  const dot = h('i', { class: 'live-chat-dot', 'aria-hidden': 'true', hidden: true });
  const toggle = h('button', { type: 'button', class: 'chip live-chat-toggle', 'aria-controls': 'live-chat', 'aria-expanded': 'false', hidden: true,
    onclick: (e) => { e.stopPropagation(); setOpen(!open); } }, svg('chat'), h('span', {}, T('Chat')), dot);
  const title = h('span', { class: 'live-chat-where' });
  const faces = h('span', { class: 'live-chat-faces' });
  const log = h('ol', { class: 'chat-log live-chat-log', 'aria-label': T('Messages'), 'aria-live': 'polite' });
  const empty = h('p', { class: 'chat-empty' }, T('No messages yet. Everyone tuned in to this channel sees what you write here.'));
  const input = h('input', { type: 'text', maxlength: '300', placeholder: T('Message the channel'), 'aria-label': T('Message the channel'), enterkeyhint: 'send' });
  const form = h('form', { class: 'chat-form', autocomplete: 'off', onsubmit: async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !session) return;
    input.value = '';
    try { await deps.say(text); } catch (err) { input.value = text; deps.toast(err.message); }
  } }, input, h('button', { class: 'chat-send', type: 'submit', 'aria-label': T('Send message') }, svg('send')));
  const reactions = h('div', { class: 'reaction-bar', role: 'group', 'aria-label': T('Send a reaction') },
    ...deps.reactions.map((emoji) => h('button', { type: 'button', class: 'reaction-btn', 'aria-label': T('React {0}', emoji), onclick: (e) => {
      const b = e.currentTarget; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      social.burst(deps.bursts, emoji, ''); deps.react(emoji);
    } }, emoji)));
  const panel = h('aside', { class: 'live-chat', id: 'live-chat', role: 'region', 'aria-label': T('Channel chat'), hidden: true },
    h('header', { class: 'live-chat-head' },
      h('div', { class: 'live-chat-heading' }, h('b', {}, T('Chat')), title),
      faces,
      h('button', { type: 'button', class: 'icon-btn live-chat-close', 'aria-label': T('Hide the chat'), onclick: () => setOpen(false) }, svg('close'))),
    h('div', { class: 'live-chat-body' }, log, empty),
    reactions, form);
  // Clicks and keys in the panel stay in the panel (the picture behind toggles the controls on a tap).
  for (const ev of ['click', 'pointerdown', 'dblclick']) panel.addEventListener(ev, (e) => e.stopPropagation());
  deps.player.append(panel);

  const me = () => deps.me() || {};
  const mine = (m) => m.from === deps.client || (m.uid != null && m.uid === me().id);
  const allowed = () => !me().restricted;

  function setOpen(next) {
    open = Boolean(next);
    try { localStorage.setItem(STORE, open ? 'open' : 'closed'); } catch { /* blocked */ }
    if (open) { unread = 0; deps.floats?.replaceChildren(); }
    place();
    if (open) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  // Where the panel is and whether it shows (CSS docks it on wide/landscape screens, a sheet on phones).
  function place() {
    const on = shown && open;
    panel.hidden = !on;
    toggle.hidden = !shown;
    toggle.setAttribute('aria-expanded', String(on));
    toggle.classList.toggle('is-on', on);
    dot.hidden = !(shown && !open && unread);
    toggle.setAttribute('aria-label', unread && !open ? T('Chat, {0} new', unread > 9 ? '9+' : unread) : T('Chat'));
    if (deps.player.classList.contains('live-chat-open') !== on) {
      deps.player.classList.toggle('live-chat-open', on);
      deps.layout();
    }
  }

  function draw() {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const owner = Boolean(me().isOwner);
    log.replaceChildren(...messages.map((m, i) => {
      const line = social.chatLine(m, mine(m), messages[i - 1]);
      if (owner) {
        line.classList.add('can-remove');
        line.append(h('button', { type: 'button', class: 'live-chat-remove', title: T('Remove message'), 'aria-label': T('Remove message'),
          onclick: () => remove(m) }, svg('close')));
      }
      return line;
    }));
    log.hidden = !messages.length;
    empty.hidden = Boolean(messages.length);
    if (nearBottom || mine(messages.at(-1) || {})) log.scrollTop = log.scrollHeight;
  }

  async function remove(m) {
    if (!channel) return;
    try { await deps.api(`/api/live/${encodeURIComponent(channel)}/chat/delete`, deps.jsonPost({ id: m.id })); }
    catch (err) { deps.toast(err.message); }
  }

  function drawHeader(state) {
    const ch = state.live?.channel || {};
    title.textContent = [ch.number, deps.channelName(ch)].filter((x) => x != null && x !== '').join(' ');
    const seen = new Map();
    for (const m of state.members || []) if (!seen.has(m.name)) seen.set(m.name, m);
    const key = JSON.stringify([...seen.values()].map((m) => [m.name, m.avatar]));
    if (faces.dataset.key !== key) {
      faces.dataset.key = key;
      faces.replaceChildren(...[people.faces([...seen.values()], { size: 22, max: 4 }), seen.size ? h('small', {}, T('{0} watching', seen.size)) : null].filter(Boolean));
    }
  }

  return {
    toggle,
    get open() { return open && shown; },
    // The player's room changed (renderParty): show the chat for a channel, hide it for anything else. Between two
    // programmes the room is swapped for a moment, so hiding waits a little.
    update(next) {
      const live = next?.state?.live && allowed() ? next : null;
      if (!live) {
        session = null;
        if (next || deps.player.hidden || !allowed()) { clearTimeout(hideTimer); hideTimer = null; shown = false; place(); }
        else hideTimer ||= setTimeout(() => { hideTimer = null; if (!session) { shown = false; place(); } }, 1500);
        return;
      }
      clearTimeout(hideTimer); hideTimer = null;
      const id = live.state.live.channel?.id || null;
      if (id !== channel) { channel = id; messages = []; unread = 0; draw(); }
      if (session !== live) { session = live; if (live.chat.length) { messages = live.chat.slice(); draw(); } }
      shown = true;
      drawHeader(live.state);
      place();
    },
    // A message (or, with null, the whole history) arrived on the channel's stream.
    message(msg, from) {
      if (!allowed() || !from?.state?.live) return;
      messages = from.chat.slice();
      draw();
      if (!msg || mine(msg) || open) return;
      unread++;
      social.floatMessage(deps.floats, msg);
      place();
    },
  };
}
