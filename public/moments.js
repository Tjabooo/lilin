// Moments: cut a short piece of the film or episode you're watching and send it to friends, or copy a
// link anyone can open. Player scissors button (next to the cog) → Clip a moment: drag the two handles on the zoomed strip (the picture
// follows), preview, then Next → note, friends, Send / Copy link. You → Moments lists what friends
// sent you and the moments you made; unseen ones are For you cards at the top of You. Server side: src/moments.js (/api/moments, /c/m/<token>).
// Not the owner's game Clips (clips tab); that's why these are called moments.
//
// app.js passes in its helpers and the player's pieces; this file owns its own DOM and state.
import { T } from './i18n.js';

const MAX = 180;          // seconds; the server holds the same line (moments.js MAX_SECONDS)
const MIN = 2;
const DEFAULT = 30;
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
};
export const lengthText = (s) => (s < 60 ? T('{0} s', Math.round(s)) : fmt(s));

// The strip shows this much of the video around the moment, so a handle moves about a second per pixel.
export function stripWindow(start, end, duration, span = 360) {
  const width = Math.min(duration || span, Math.max(span, (end - start) * 2));
  let from = (start + end) / 2 - width / 2;
  from = Math.max(0, Math.min(from, (duration || width) - width));
  return { from, to: from + width };
}

// Keep the range legal after one edge moved: inside the video, at least MIN, at most MAX (the other edge follows).
export function clampRange(start, end, edge, duration) {
  const dur = duration || Infinity;
  start = Math.max(0, Math.min(start, dur - MIN));
  end = Math.max(MIN, Math.min(end, dur));
  if (edge === 'start') {
    if (end - start < MIN) end = Math.min(dur, start + MIN);
    if (end - start > MAX) end = start + MAX;
  } else {
    if (end - start < MIN) start = Math.max(0, end - MIN);
    if (end - start > MAX) start = end - MAX;
  }
  return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
}

export function createMoments({ h, api, jsonPost, toast, icon, people, me, friendsUI, invite, copyWithToast, fmtAgo, video, playerEl,
  current, describe, subCues, inRoom, closeOthers, openMoment, rerender }) {
  const clipBtn = document.getElementById('clip-btn');
  let clip = null; // { start, end, win, panel, step: 'pick' | 'share', ... } while clipping
  const view = { loaded: false, loading: null, data: { mine: [], shared: [], unseen: 0 }, jump: null };

  // ---------- the Clip a moment button (next to the settings cog) ----------
  const clippable = (f) => Boolean(f) && ['lib', 'dl'].includes(f.kind) && !f.live && !f.trailer;
  function sync() { clipBtn.hidden = !clippable(current()); }
  function closeMenu() {} // the ⋯ menu is gone; kept so callers stay simple
  clipBtn.addEventListener('click', (e) => { e.stopPropagation(); closeOthers(); start(); });

  // ---------- picking the range ----------
  const duration = () => (Number.isFinite(video.duration) ? video.duration : 0);
  function start() {
    const f = current();
    if (!clippable(f) || !duration()) { toast(T('Wait until the video has loaded.')); return; }
    const canSeek = !inRoom();
    if (canSeek) video.pause();
    const now = video.currentTime || 0;
    const r = clampRange(Math.max(0, now - DEFAULT / 2), now + DEFAULT / 2, 'end', duration());
    clip = { ...r, f, canSeek, step: 'pick', note: '', to: new Set(), subs: true, busy: false };
    clip.win = stripWindow(clip.start, clip.end, duration());
    clip.panel = h('section', { class: 'moment-panel', role: 'dialog', 'aria-label': T('Clip a moment') });
    clip.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (clip?.step === 'share') pick(); else stop(); }
      e.stopPropagation(); // the player's own shortcuts (space, arrows) stay out of the panel
    });
    playerEl.append(clip.panel);
    playerEl.classList.add('is-clipping');
    video.addEventListener('timeupdate', onTime);
    pick();
  }
  function stop() {
    if (!clip) return;
    video.removeEventListener('timeupdate', onTime);
    clip.panel.remove();
    playerEl.classList.remove('is-clipping');
    clip = null;
  }
  const open = () => Boolean(clip);

  let previewing = false;
  function onTime() {
    if (!clip) return;
    if (previewing && video.currentTime >= clip.end) { previewing = false; video.pause(); video.currentTime = clip.end; }
    drawPlayhead();
  }
  function seekTo(t) { if (clip?.canSeek) { previewing = false; video.currentTime = t; } }

  let strip, range, startH, endH, playhead, fromLabel, toLabel, summary;
  function pick() {
    clip.step = 'pick'; clip.link = null; // a new range makes a new link
    strip = h('div', { class: 'moment-strip' });
    range = h('div', { class: 'moment-range' });
    playhead = h('div', { class: 'moment-playhead', 'aria-hidden': 'true' });
    const handle = (edge) => h('div', { class: `moment-handle is-${edge}`, role: 'slider', tabindex: '0',
      'aria-label': edge === 'start' ? T('Start of the moment') : T('End of the moment'), 'data-edge': edge });
    startH = handle('start'); endH = handle('end');
    strip.append(range, playhead, startH, endH);
    fromLabel = h('span', {}); toLabel = h('span', {});
    summary = h('p', { class: 'moment-summary', 'aria-live': 'polite' });
    for (const el of [startH, endH]) {
      el.addEventListener('pointerdown', (e) => drag(e, el.dataset.edge));
      el.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 5 : 1;
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
        if (!d) return;
        e.preventDefault();
        move(el.dataset.edge, clip[el.dataset.edge] + d);
      });
    }
    // A tap on the strip (not a handle) shows that frame.
    strip.addEventListener('pointerdown', (e) => { if (!e.target.closest('.moment-handle')) seekTo(timeAt(e.clientX)); });
    const btn = (label, ic, onclick, cls = 'chip') => h('button', { type: 'button', class: cls, onclick }, ic && icon(ic), label);
    clip.panel.replaceChildren(
      h('div', { class: 'moment-head' },
        h('h2', { class: 'moment-title' }, T('Clip a moment')),
        summary,
        h('button', { type: 'button', class: 'moment-close', 'aria-label': T('Cancel'), onclick: stop }, icon('close'))),
      strip,
      h('div', { class: 'moment-scale', 'aria-hidden': 'true' }, fromLabel, toLabel),
      h('div', { class: 'moment-actions' },
        clip.canSeek && btn(T('Start here'), null, () => move('start', video.currentTime)),
        clip.canSeek && btn(T('Preview'), 'play', preview),
        clip.canSeek && btn(T('End here'), null, () => move('end', video.currentTime)),
        h('span', { class: 'moment-spacer' }),
        btn(T('Next'), null, share, 'chip moment-next')),
      !clip.canSeek && h('p', { class: 'moment-hint' }, T('In a Watch Together room the picture keeps playing: drag the handles to pick the moment.')));
    draw();
    requestAnimationFrame(() => startH.focus({ preventScroll: true }));
  }
  const timeAt = (x) => {
    const r = strip.getBoundingClientRect();
    return clip.win.from + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (clip.win.to - clip.win.from);
  };
  function move(edge, t, { recenter = true, show = true } = {}) {
    const r = clampRange(edge === 'start' ? t : clip.start, edge === 'end' ? t : clip.end, edge, duration());
    clip.start = r.start; clip.end = r.end;
    if (recenter && (clip.start < clip.win.from || clip.end > clip.win.to)) clip.win = stripWindow(clip.start, clip.end, duration());
    if (show) seekTo(clip[edge]);
    draw();
  }
  function drag(e, edge) {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('is-dragging');
    let frame = 0;
    const onMove = (ev) => {
      const t = timeAt(ev.clientX);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => move(edge, t, { recenter: false }));
    };
    const done = () => {
      el.removeEventListener('pointermove', onMove);
      el.classList.remove('is-dragging');
      move(edge, clip[edge], { show: false });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', done, { once: true });
    el.addEventListener('pointercancel', done, { once: true });
  }
  const pct = (t) => `${((t - clip.win.from) / (clip.win.to - clip.win.from)) * 100}%`;
  function draw() {
    if (!clip || clip.step !== 'pick') return;
    range.style.left = pct(clip.start);
    range.style.width = `${((clip.end - clip.start) / (clip.win.to - clip.win.from)) * 100}%`;
    startH.style.left = pct(clip.start); endH.style.left = pct(clip.end);
    for (const [el, t] of [[startH, clip.start], [endH, clip.end]]) {
      el.setAttribute('aria-valuenow', String(Math.round(t))); el.setAttribute('aria-valuetext', fmt(t));
      el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', String(Math.round(duration())));
    }
    fromLabel.textContent = fmt(clip.win.from); toLabel.textContent = fmt(clip.win.to);
    summary.textContent = `${fmt(clip.start)} – ${fmt(clip.end)} · ${lengthText(clip.end - clip.start)}`;
    drawPlayhead();
  }
  function drawPlayhead() {
    if (!clip || clip.step !== 'pick' || !playhead) return;
    const t = video.currentTime || 0;
    playhead.hidden = t < clip.win.from || t > clip.win.to;
    playhead.style.left = pct(t);
  }
  function preview() {
    if (!clip?.canSeek) return;
    video.currentTime = clip.start;
    previewing = true;
    video.play().catch(() => { previewing = false; });
  }

  // ---------- sharing ----------
  function cuesInRange() {
    const list = (subCues() || []).filter((c) => c.endTime > clip.start && c.startTime < clip.end);
    return list.map((c) => ({ start: c.startTime, end: c.endTime, text: c.text }));
  }
  function share() {
    if (!clip) return;
    previewing = false;
    if (clip.canSeek) video.pause();
    clip.step = 'share';
    const restricted = Boolean(me()?.restricted);
    const friends = restricted ? [] : friendsUI.friendList();
    if (!restricted) friendsUI.load().then(() => { if (clip?.step === 'share' && friendsUI.friendList().length !== friends.length) share(); });
    const cues = cuesInRange();
    const d = describe(clip.f);
    const note = h('textarea', { class: 'moment-note', rows: '2', maxlength: '200', placeholder: T('Add a note (optional)'), 'aria-label': T('Note') });
    note.value = clip.note;
    note.addEventListener('input', () => { clip.note = note.value; });
    const sendLabel = () => [icon('send'), clip.to.size > 1 ? T('Send to {0}', clip.to.size) : T('Send')];
    const sendBtn = h('button', { type: 'button', class: 'chip moment-next', disabled: !clip.to.size, onclick: send }, ...sendLabel());
    // The Invite sheet's Moment part (invite.js): friends to choose, Copy link / Share… (the link is made then), Send.
    const ask = invite.mount(h('div', { class: 'moment-ask' }), { kind: 'moment', title: false, friends, chosen: clip.to, link, done: stop,
      actions: friends.length ? [sendBtn] : [], onChange: () => { sendBtn.disabled = !clip.to.size; sendBtn.replaceChildren(...sendLabel()); } });
    clip.panel.replaceChildren(
      h('div', { class: 'moment-head' },
        h('button', { type: 'button', class: 'moment-close', 'aria-label': T('Back'), onclick: pick }, icon('back')),
        h('h2', { class: 'moment-title' }, T('Send this moment')),
        h('button', { type: 'button', class: 'moment-close', 'aria-label': T('Cancel'), onclick: stop }, icon('close'))),
      h('p', { class: 'moment-summary' }, [d.title, d.label].filter(Boolean).join(' · '), ` · ${fmt(clip.start)} – ${fmt(clip.end)} (${lengthText(clip.end - clip.start)})`),
      note,
      cues.length > 0 && h('label', { class: 'moment-subs' },
        h('input', { type: 'checkbox', checked: clip.subs, onchange: (e) => { clip.subs = e.target.checked; } }), T('Include the subtitles')),
      ask);
    requestAnimationFrame(() => note.focus({ preventScroll: true }));
    const create = async (to) => {
      const f = clip.f;
      const r = await api('/api/moments', jsonPost({ kind: f.kind, id: f.id, start: clip.start, end: clip.end, note: clip.note,
        title: d.title, label: d.label, subtitles: clip.subs ? cues : null, to }));
      invalidate();
      return r;
    };
    // Copy link / Share…: the moment is made then, once (the panel closes after).
    async function link() {
      if (clip.busy) return null;
      clip.busy = true;
      try { clip.link ||= (await create([])).link; return clip.link; } finally { if (clip) clip.busy = false; }
    }
    async function send() {
      if (clip.busy) return;
      clip.busy = true; sendBtn.disabled = true;
      try {
        const r = await create([...clip.to]);
        toast(r.sent ? T('Sent. They’ll get it as soon as it’s ready.') : T('Saved, but it couldn’t be sent.'));
        stop();
      } catch (err) {
        toast(err.message);
        if (clip) { clip.busy = false; sendBtn.disabled = !clip.to.size; }
      }
    }
  }

  // ---------- You → Moments ----------
  function load() {
    view.loading ||= api('/api/moments').then((r) => { view.data = r; view.loaded = true; })
      .catch(() => { view.loaded = true; }).finally(() => { view.loading = null; });
    return view.loading;
  }
  function invalidate() { view.loaded = false; }
  const needed = () => { if (view.loaded || view.loading) return; load().then(rerender); };
  function link(m) { return `${location.origin}${m.url}`; }
  async function removeMoment(m, mine) {
    if (mine && !confirm(T('Delete this moment? Its link stops working for everyone.'))) return;
    try { await api(`/api/moments/${m.id}/delete`, jsonPost({})); } catch (err) { toast(err.message); }
    invalidate(); await load(); rerender();
  }
  function play(m) {
    if (!m.seen && !m.mine) {
      m.seen = true; // off the For you cards and the tab's dot right away
      api(`/api/moments/${m.id}/seen`, jsonPost({})).then(() => { invalidate(); }).catch(() => {});
      rerender();
    }
    openMoment(m);
  }
  const thumb = (m) => h('span', { class: 'moment-thumb' }, m.thumb ? h('img', { src: m.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : icon('play'),
    h('span', { class: 'moment-len' }, lengthText(m.length)));
  // A moment someone sent you: tap to play (that marks it seen), × to remove it from your list.
  const sharedRow = (m) => h('li', { class: `moment-row${m.seen ? '' : ' is-new'}` },
    h('button', { type: 'button', class: 'moment-open', onclick: () => play(m), 'aria-label': T('Play {0}', m.title) }, thumb(m),
      h('span', { class: 'moment-text' },
        h('span', { class: 'moment-name' }, [m.title, m.label].filter(Boolean).join(' · ')),
        h('span', { class: 'moment-meta' }, people.face(m.from, { size: 18 }), T('{0} · {1}', m.from.name, fmtAgo(m.sentAt) || '')),
        m.note && h('span', { class: 'moment-note-text' }, m.note))),
    h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Remove {0}', m.title), title: T('Remove'), onclick: () => removeMoment(m, false) }, icon('close')));
  // For you (the top of You): moments sent to you that you haven't played yet.
  function forYou(limit = 3) {
    if (!me()) return [];
    return (view.data.shared || []).filter((m) => !m.seen).slice(0, limit).map(sharedRow);
  }
  const unseenCount = () => (view.data.shared || []).filter((m) => !m.seen).length;
  const counts = () => ({ mine: (view.data.mine || []).length, shared: (view.data.shared || []).length, unseen: unseenCount(), loaded: view.loaded });
  // Everyone has the page; restricted people and the shared home account only make moments and copy links.
  function page() {
    if (!me()) return [];
    needed();
    const { mine = [], shared = [] } = view.data;
    if (!mine.length && !shared.length) {
      return [h('p', { class: 'set-hint moment-foot' }, view.loaded ? T('Nothing yet. Clip a moment with the scissors next to the settings cog while a film or episode plays.') : T('Loading…'))];
    }
    const out = [];
    const body = [];
    if (shared.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, T('Shared with you')),
        h('ul', { class: 'moment-list' }, shared.map(sharedRow))));
    }
    if (mine.length) {
      body.push(h('div', { class: 'friends-block' }, h('p', { class: 'friends-label' }, T('Your moments')),
        h('ul', { class: 'moment-list' }, mine.map((m) => {
          const state = m.state === 'making' ? T('Being made…') : m.state === 'failed' ? T('Couldn’t be made') : m.to.length ? T('Sent to {0}', m.to.map((p) => p.name).join(', ')) : T('Link only');
          return h('li', { class: 'moment-row' },
            h('button', { type: 'button', class: 'moment-open', disabled: m.state !== 'ready', onclick: () => play(m), 'aria-label': T('Play {0}', m.title) }, thumb(m),
              h('span', { class: 'moment-text' },
                h('span', { class: 'moment-name' }, [m.title, m.label].filter(Boolean).join(' · ')),
                h('span', { class: 'moment-meta' }, state),
                m.note && h('span', { class: 'moment-note-text' }, m.note))),
            m.state !== 'failed' && h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Copy link'), title: T('Copy link'), onclick: () => copyWithToast(link(m), T('Link copied')) }, icon('copy')),
            h('button', { type: 'button', class: 'friend-x', 'aria-label': T('Delete {0}', m.title), title: T('Delete'), onclick: () => removeMoment(m, true) }, icon('trash')));
        }))));
      body.push(h('p', { class: 'set-hint moment-foot' }, T('Links work for anyone who has them, until you delete the moment or it expires.')));
    }
    out.push(h('div', { class: 'friends' }, body));
    if (view.jump && view.loaded) {
      const id = view.jump; view.jump = null;
      const m = shared.find((x) => x.id === id) || mine.find((x) => x.id === id);
      if (m && m.state === 'ready') setTimeout(() => play(m), 0);
    }
    return out;
  }
  // A "sent you a moment" notification: open You → Moments and play it.
  function jumpTo(id) { view.jump = id; view.loaded = false; }

  return { sync, closeMenu, start, stop, open, menuOpen: () => Boolean(clip), page, forYou, unseenCount, summary: counts, load, invalidate, jumpTo };
}
