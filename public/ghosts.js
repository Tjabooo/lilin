// Ghost reactions: Watch Together for people who are never online at the same time. The player's smiley button opens a
// small tray of emoji; tapping one leaves it at this second of the film or episode. When a friend plays the same thing
// later, it pops up over the picture right then ("ebi 💀 41:12"), and the seek bar carries a small mark wherever
// friends reacted. The tray's switch turns friends' pop-ups off on this device. Server side: src/ghosts.js, /api/ghosts.
//
// Pop-ups only fire while the video plays through a moment, never when you jump past it. They sit low on the left,
// out of the subtitles' way, and several at the same second are drawn as one bubble.
//
// app.js passes in its helpers and the player's pieces; this file owns its own DOM and state.
import { T } from './i18n.js';

const SHOW_KEY = 'lilin.ghosts.show';
const POP_MS = 3600;
const MAX_POPS = 3;

export function createGhosts({ h, api, jsonPost, toast, icon, people, me, video, playerEl, seekEl, current, about, fmtTime, closeOthers = () => {}, showUi = () => {} }) {
  const btn = h('button', { type: 'button', class: 'pc-btn cc-btn ghost-btn', id: 'ghost-btn', 'aria-label': T('React at this moment'), title: T('React at this moment'),
    'aria-haspopup': 'true', 'aria-expanded': 'false', hidden: true }, icon('smile'));
  const tray = h('div', { class: 'ghost-tray', role: 'group', 'aria-label': T('Leave a reaction here for friends'), hidden: true });
  const pops = h('div', { class: 'ghost-pops', 'aria-live': 'polite' });
  const marks = h('div', { class: 'ghost-marks', 'aria-hidden': 'true' });
  let state = null; // { video: { key, season, episode }, list: [...], next: index, emoji: [...] }
  let lastT = null;
  let showing = (() => { try { return localStorage.getItem(SHOW_KEY) !== 'off'; } catch { return true; } })();

  function mount() {
    const anchor = playerEl.querySelector('#clip-btn') || playerEl.querySelector('#settings-btn');
    anchor?.before(btn);
    playerEl.querySelector('#player-controls')?.append(tray);
    playerEl.querySelector('#player-stage')?.append(pops);
    seekEl.append(marks);
  }

  // What's playing, as the server names it, or null for things you can't react on (clips, notes, Live TV, untitled files).
  function videoOf(f) {
    if (!f || f.live || !['lib', 'part'].includes(f.kind)) return null;
    const a = about(f);
    if (!a?.titleKey) return null;
    if (a.titleKey.startsWith('tv:') && (a.season == null || a.episode == null)) return null;
    return { key: a.titleKey, season: a.titleKey.startsWith('tv:') ? a.season : null, episode: a.titleKey.startsWith('tv:') ? a.episode : null };
  }
  const query = (v) => new URLSearchParams(Object.entries(v).filter(([, x]) => x != null)).toString();

  // A new video in the player.
  async function sync() {
    stop();
    const f = current();
    const v = videoOf(f);
    const m = me();
    if (!v || !m?.email || m.restricted) return;
    const mine = (state = { video: v, list: [], emoji: [], file: f });
    try {
      const r = await api(`/api/ghosts?${query(v)}`);
      if (state !== mine || r.off) { if (state === mine) state = null; return; }
      mine.list = r.reactions || [];
      mine.emoji = r.emoji || [];
    } catch { if (state === mine) state = null; return; }
    btn.hidden = false;
    drawTray();
    drawMarks();
  }
  function stop() {
    state = null; lastT = null;
    btn.hidden = true;
    closeTray();
    pops.replaceChildren();
    marks.replaceChildren();
  }

  // ---------- leaving one ----------
  function drawTray() {
    if (!state) return;
    tray.replaceChildren(
      h('div', { class: 'ghost-tray-emoji' }, state.emoji.map((e) => h('button', { type: 'button', class: 'ghost-emoji', 'aria-label': T('React {0}', e), onclick: (ev) => drop(e, ev.currentTarget) }, e))),
      h('div', { class: 'ghost-tray-foot' },
        h('span', { class: 'ghost-tray-hint' }, T('Friends see it at {0} when they watch', fmtTime(video.currentTime || 0))),
        h('button', { type: 'button', role: 'switch', class: 'ghost-show', 'aria-checked': String(showing), onclick: () => setShowing(!showing) },
          h('span', { class: 'ghost-show-knob', 'aria-hidden': 'true' }), T('Friends’ reactions'))));
  }
  function openTray() {
    if (!state) return;
    closeOthers();
    drawTray();
    tray.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    playerEl.classList.add('ghost-tray-open');
    showUi();
  }
  function closeTray() {
    tray.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    playerEl.classList.remove('ghost-tray-open');
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); tray.hidden ? openTray() : closeTray(); });
  tray.addEventListener('click', (e) => e.stopPropagation());
  // The hint follows the picture while the tray is open.
  video.addEventListener('timeupdate', () => { if (!tray.hidden) { const hint = tray.querySelector('.ghost-tray-hint'); if (hint) hint.textContent = T('Friends see it at {0} when they watch', fmtTime(video.currentTime || 0)); } });

  async function drop(emoji, b) {
    if (!state) return;
    const at = video.currentTime || 0;
    const mine = state;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    pop({ emoji, name: T('You'), avatar: me()?.avatar, person: me(), at, mine: true });
    try {
      const { reaction } = await api('/api/ghosts', jsonPost({ ...mine.video, at, emoji }));
      if (state !== mine) return;
      if (!mine.list.some((r) => r.id === reaction.id)) {
        mine.list.push({ ...reaction, userId: me()?.id, mine: true });
        mine.list.sort((a, c) => a.at - c.at);
        drawMarks();
      }
    } catch (err) { toast(err.message); }
    setTimeout(() => { if (state === mine) closeTray(); }, 450);
  }

  function setShowing(on) {
    showing = on;
    try { localStorage.setItem(SHOW_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    if (!on) pops.querySelectorAll('.ghost-pop:not(.mine)').forEach((p) => p.remove());
    drawTray();
    drawMarks();
    toast(on ? T('Friends’ reactions pop up while you watch') : T('Friends’ reactions are off on this device'));
  }

  // ---------- seeing friends' ----------
  // Fires for reactions the picture just played through (timeupdate comes about four times a second). A jump
  // (seek, skip intro) only moves the line, so nothing piles up after skipping ahead.
  video.addEventListener('timeupdate', () => {
    if (!state || video.seeking) { lastT = null; return; }
    const t = video.currentTime;
    const from = lastT;
    lastT = t;
    if (from == null || t <= from || t - from > 1.5 || !showing || video.paused) return;
    const due = state.list.filter((r) => !r.mine && r.at > from && r.at <= t);
    if (!due.length) return;
    // Same emoji at (about) the same second from several friends: one bubble with all their names.
    const groups = new Map();
    for (const r of due) {
      const k = r.emoji;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const [emoji, rs] of groups) pop({ emoji, people: rs, at: rs[0].at });
  });
  video.addEventListener('seeking', () => { lastT = null; });

  function pop({ emoji, people: from = null, person = null, name = null, at, mine = false }) {
    const who = from ? from.map((r) => ({ name: r.name, avatar: r.avatar, id: r.userId })) : [person || { name }];
    const names = from ? namesOf(from.map((r) => r.name)) : name;
    const el = h('div', { class: `ghost-pop${mine ? ' mine' : ''}` },
      h('span', { class: 'ghost-pop-faces' }, who.slice(0, 3).map((p) => people.face(p, { size: 28 }))),
      h('span', { class: 'ghost-pop-emoji', 'aria-hidden': 'true' }, emoji),
      h('span', { class: 'ghost-pop-text' }, h('strong', {}, names), h('small', {}, fmtTime(at))));
    el.setAttribute('aria-label', `${names} ${emoji} ${fmtTime(at)}`);
    pops.append(el);
    while (pops.childElementCount > MAX_POPS) pops.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, POP_MS);
  }
  const namesOf = (list) => (list.length === 1 ? list[0] : list.length === 2 ? T('{0} and {1}', list[0], list[1]) : T('{0} and {1} others', list[0], list.length - 1));

  // Marks on the seek bar: one per moment friends reacted (yours in a softer colour), placed once the length is known.
  function drawMarks() {
    marks.replaceChildren();
    const d = video.duration;
    if (!state || !isFinite(d) || d <= 0) return;
    const seen = new Set();
    for (const r of state.list) {
      if (!r.mine && !showing) continue;
      const pct = Math.min(100, Math.max(0, (r.at / d) * 100));
      const slot = `${Math.round(pct * 4)}|${r.mine ? 1 : 0}`; // one mark per quarter percent
      if (seen.has(slot)) continue;
      seen.add(slot);
      marks.append(h('span', { class: `ghost-mark${r.mine ? ' mine' : ''}`, style: `left:${pct}%` }));
    }
  }
  video.addEventListener('durationchange', drawMarks);
  video.addEventListener('loadedmetadata', drawMarks);

  mount();
  return { sync, stop, closeTray, trayOpen: () => !tray.hidden, openTray };
}
