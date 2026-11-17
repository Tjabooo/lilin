// Theme music on show pages: the show's opening theme (cut by the server from the opening Skip intro found,
// src/theme-music.js) plays quietly while its page is open and fades out when you leave the page or press play.
// Seasons and episodes are part of the same page, so moving between them keeps the song going, and coming back
// to the same show within two minutes carries on where it stopped (or stays quiet if it already played out).
// Silent while the player, a trailer, Watch Together or a TV of yours is playing, and switched per device.
// Web Audio rather than an <audio> element: it can be faded on iPhones (which ignore an element's volume) and
// puts no media controls on the phone's lock screen.
import { T } from './i18n.js';

const KEY = 'lilin:themeMusic'; // 'off', 'quiet' (the default) or 'louder'; this device only
export const LEVELS = { quiet: 0.2, louder: 0.45 }; // gain on a clip the server evened out to -18 LUFS
export const FADE_IN = 1.5, FADE_OUT = 3, FADE_AWAY = 0.8, FADE_QUICK = 0.25; // seconds
export const RESUME_WITHIN = 120e3; // ms

export function themeLevel(store = globalThis.localStorage) {
  try { const v = store?.getItem(KEY); return v === 'off' || v === 'louder' ? v : 'quiet'; } catch { return 'quiet'; }
}
export function saveThemeLevel(v, store = globalThis.localStorage) {
  try { store?.setItem(KEY, v === 'off' || v === 'louder' ? v : 'quiet'); } catch { /* private mode */ }
}

// Where a show's theme picks up: where it stopped, if the page was left only a moment ago (null: it already
// played to its end then, so it stays quiet), else from the start.
export function resumeAt(memory, now, duration) {
  if (!memory || !(now - memory.at <= RESUME_WITHIN)) return 0;
  return memory.offset >= duration - FADE_OUT ? null : Math.max(0, memory.offset);
}

// The volume over the rest of the clip from `now`: up to the level, held, then down to silence at its end.
export function envelope(now, end, level, rise = FADE_IN) {
  const left = end - now;
  if (!(left > 0.1)) return [];
  const up = Math.min(rise, left / 3), down = Math.min(FADE_OUT, left / 2);
  return [[level, now + up], [level, Math.max(now + up, end - down)], [0, end]];
}

// One request per show page: any ready episode (the server picks the show's theme across its seasons).
export function themeUrl(files) {
  const first = [...(files || [])].filter((f) => f?.id && f.season != null && f.episode != null)
    .sort((a, b) => a.season - b.season || a.episode - b.episode || String(a.id).localeCompare(String(b.id)))[0];
  return first ? `/api/media/lib/${encodeURIComponent(first.id)}/theme` : null;
}

// page(): the id of the show whose page is on screen, or null. quiet(): something else has the sound now.
// watch: elements whose changes may mean either changed (the sheet, its body, document.body).
export function createThemeMusic({ h, icon, page, quiet, watch = [] }) {
  const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  let level = themeLevel();
  let ctx = null, visit = null, play = null, starting = null, button = null, idle = null;
  const buffers = new Map(); // url -> Promise<AudioBuffer | null>
  const memory = new Map(); // show id -> { offset, at }: where its theme was when it faded out

  function context() {
    if (!ctx && Ctx) { try { ctx = new Ctx(); } catch { ctx = null; } }
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); // in a click, this is what lets it sound
    return ctx;
  }
  async function running(c) {
    for (let i = 0; i < 10 && c.state !== 'running'; i++) {
      c.resume().catch(() => {});
      await new Promise((r) => { setTimeout(r, 100); });
    }
    return c.state === 'running';
  }
  // iPhones: an ambient sound mixes with music already playing and keeps to the silent switch.
  function session(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* not there */ } }

  function load(url) {
    if (buffers.has(url)) return buffers.get(url);
    const task = fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.status === 200 ? r.arrayBuffer() : null))
      .then((data) => (data && ctx ? new Promise((resolve, reject) => { ctx.decodeAudioData(data, resolve, reject); }) : null))
      .catch(() => null);
    buffers.set(url, task);
    while (buffers.size > 6) buffers.delete(buffers.keys().next().value);
    task.then((b) => { if (!b && buffers.get(url) === task) buffers.delete(url); }); // asked again next visit
    return task;
  }

  const wanted = () => Boolean(visit && level !== 'off' && !visit.stopped && !quiet() && !document.hidden);

  // Called whenever a show page is drawn (opening it, picking a season): the same show keeps its song going.
  function enter(id, url) {
    if (visit && visit.id !== id) leave();
    if (!id || !url || level === 'off' || !Ctx) return;
    if (!visit) {
      const v = visit = { id, url, stopped: false, ended: false, ready: false };
      context();
      v.buffer = ctx ? load(url) : Promise.resolve(null);
      v.buffer.then((b) => { v.ready = Boolean(b); if (visit === v) refresh(); });
    }
    refresh();
  }

  function leave() {
    visit = null;
    fadeAway(FADE_AWAY);
    paint();
  }

  // Pressing play (or anything opening the player): the song is done for this visit to the page.
  function stop() {
    if (visit) visit.stopped = true;
    session('auto');
    fadeAway(FADE_QUICK);
    paint();
  }

  function refresh() {
    if (visit && page() !== visit.id) leave();
    if (!wanted()) { if (play) fadeAway(FADE_AWAY); paint(); return; }
    if (play?.id === visit.id) { paint(); return; }
    start(visit);
  }

  async function start(v) {
    if (starting === v) return;
    starting = v;
    try {
      const buffer = await v.buffer;
      if (!buffer || visit !== v || !wanted() || play?.id === v.id) return;
      const at = resumeAt(memory.get(v.id), Date.now(), buffer.duration);
      if (at == null) { v.ended = true; return; }
      const c = context();
      if (!c || !(await running(c)) || visit !== v || !wanted()) return;
      if (play) fadeAway(FADE_QUICK); // another show's song, still fading
      clearTimeout(idle);
      session('ambient');
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(c.destination);
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      const now = c.currentTime;
      const p = { id: v.id, source, gain, began: now - at, duration: buffer.duration };
      shape(p, FADE_IN, true);
      source.onended = () => {
        if (play !== p) return;
        play = null;
        remember(p.id, p.duration);
        if (visit?.id === p.id) visit.ended = true;
        gain.disconnect();
        settle();
        paint();
      };
      source.start(now, at);
      play = p;
    } finally {
      if (starting === v) starting = null;
      paint();
    }
  }

  // Keeps the volume where it is now, so a new fade starts from there (Firefox lacks cancelAndHoldAtTime).
  function hold(param, now) {
    if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(now); return; }
    const value = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
  function shape(p, rise, fresh = false) {
    const g = p.gain.gain, now = ctx.currentTime;
    if (fresh) g.setValueAtTime(0, now); else hold(g, now);
    for (const [value, time] of envelope(now, p.began + p.duration, LEVELS[level] || LEVELS.quiet, rise)) g.linearRampToValueAtTime(value, time);
  }

  function remember(id, offset) {
    memory.delete(id);
    memory.set(id, { offset, at: Date.now() });
    while (memory.size > 40) memory.delete(memory.keys().next().value);
  }

  function fadeAway(seconds) {
    const p = play;
    if (!p) return;
    play = null;
    const now = ctx.currentTime;
    remember(p.id, Math.min(p.duration, Math.max(0, now - p.began)));
    p.source.onended = null;
    hold(p.gain.gain, now);
    p.gain.gain.linearRampToValueAtTime(0, now + seconds);
    try { p.source.stop(now + seconds + 0.05); } catch { /* already stopped */ }
    setTimeout(() => { try { p.gain.disconnect(); } catch { /* gone */ } }, (seconds + 0.3) * 1000);
    settle();
  }

  // Nothing playing: let go of the sound hardware a little later (phones keep it awake otherwise).
  function settle() {
    session('auto');
    clearTimeout(idle);
    idle = setTimeout(() => { if (!play && ctx?.state === 'running') ctx.suspend().catch(() => {}); }, 3000);
  }

  // The small speaker on the show's backdrop: stops the song for this visit, or plays it again.
  function hero(el) {
    button = h('button', { type: 'button', class: 'theme-btn', hidden: true, onclick: (e) => {
      e.stopPropagation();
      if (!visit) return;
      if (play) { visit.stopped = true; fadeAway(FADE_AWAY); paint(); return; }
      visit.stopped = false;
      context(); // a click: allowed to sound
      refresh();
    } });
    el.append(button);
    paint();
    return el;
  }
  function paint() {
    const b = button;
    if (!b?.isConnected) return;
    const on = Boolean(play && play.id === visit?.id);
    const paused = !on && Boolean(visit?.ready && visit.stopped && !visit.ended && level !== 'off');
    b.hidden = !(on || paused);
    if (b.hidden) return;
    const label = on ? T('Stop theme music') : T('Play theme music');
    if (b.dataset.state === String(on)) return;
    b.dataset.state = String(on);
    b.classList.toggle('is-off', !on);
    b.setAttribute('aria-label', label);
    b.title = label;
    b.replaceChildren(icon(on ? 'volumeHigh' : 'muted'));
  }

  function setLevel(v) {
    saveThemeLevel(v);
    level = themeLevel();
    if (level === 'off') { fadeAway(FADE_AWAY); paint(); return; }
    if (play && ctx) shape(play, 0.4);
  }

  // Settings → Watching
  function settings(settingsRow, segmented, rerender) {
    return settingsRow(T('Theme music'), T('A show’s theme song plays softly on its page. Only on this device.'),
      segmented([['off', T('Off')], ['quiet', T('Quiet')], ['louder', T('Louder')]], level, (v) => { setLevel(v); rerender(); }, T('Theme music')));
  }

  let queued = false;
  const later = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; refresh(); }); };
  if (typeof MutationObserver !== 'undefined') {
    for (const [el, options] of watch) if (el) new MutationObserver(later).observe(el, options);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', later);

  return { enter, leave, stop, hero, settings, level: () => level, setLevel };
}
