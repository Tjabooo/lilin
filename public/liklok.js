// LikLok: a vertical feed of short clips from the shows on the server. Swipe (or scroll, or ↑/↓) from one to the
// next; each one loops until you move on. Keep watching opens the episode at the second the clip is at, so the
// scene just carries on; From episode 1 starts the show; My list and the show's page are on the right.
// Server side: src/liklok.js (/api/liklok/*). Everyone gets it (LIKLOK=off on the server turns it off).
//
// Three <video> elements are shared by all the slides (slide k uses pool[k % 3]), so the one before and the two
// around the current one are loaded and nothing else is: phones only allow so many videos. The first tap turns
// the sound on for all three at once (iOS wants a tap per element before it plays sound).
//
// app.js passes in its helpers; this file owns its own DOM and state.
import { T } from './i18n.js';

const SVG = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  nope: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
};

// WebVTT → [{ start, end, text }] (the server writes plain cues, so this stays small).
export function parseVtt(text) {
  const stamp = (s) => { const p = s.trim().split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  const out = [];
  for (const block of String(text || '').replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = stamp(a), end = stamp(b.trim().split(/\s/)[0]);
    if (Number.isFinite(start) && Number.isFinite(end)) out.push({ start, end, text: lines.slice(at + 1).join('\n').trim() });
  }
  return out;
}

export function createLikLok({ h, api, jsonPost, toast, root, play, openShow, isSaved, toggleSave, playerOpen }) {
  const slides = []; // { c, el, stage, cap, bar, save, cues }
  let current = -1;
  let active = false;
  let built = false;
  let loading = false;
  let finished = false;
  let sound = false;
  let feed = null;
  let observer = null;
  let emptyTimer = null;
  let watch = null; // the current clip: { id, played, loops, last, length }

  const pool = [0, 1, 2].map(() => {
    const v = document.createElement('video');
    v.className = 'lk-video';
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.loop = true; v.muted = true; v.preload = 'auto'; v.disablePictureInPicture = true;
    v.setAttribute('disableremoteplayback', '');
    v._slide = -1;
    v.addEventListener('loadeddata', () => { slides[v._slide]?.el.classList.add('lk-ready'); });
    v.addEventListener('timeupdate', () => tick(v));
    v.addEventListener('play', () => slides[v._slide]?.el.classList.remove('lk-paused'));
    v.addEventListener('pause', () => { if (v._slide === current && active) slides[v._slide]?.el.classList.add('lk-paused'); });
    return v;
  });
  const videoOf = (k) => (pool[k % 3]._slide === k ? pool[k % 3] : null);

  function event(id, kind, ms = 0) { api('/api/liklok/event', jsonPost({ id, kind, ms: Math.round(ms) })).catch(() => {}); }

  function tick(v) {
    const k = v._slide;
    const s = slides[k];
    if (!s) return;
    const t = v.currentTime || 0, d = v.duration || (s.c.end - s.c.start);
    s.bar.style.transform = `scaleX(${d ? Math.min(1, t / d) : 0})`;
    const cue = s.cues?.find((q) => t >= q.start && t <= q.end);
    const text = cue ? cue.text : '';
    if (s.cap.textContent !== text) s.cap.textContent = text;
    if (k === current && watch && !v.paused) {
      if (t + 1 < watch.last) watch.loops++;
      else if (t > watch.last) watch.played += Math.min(1, t - watch.last);
      watch.last = t;
    }
  }

  // ---------- building the page ----------
  function build() {
    built = true;
    feed = h('div', { class: 'lk-feed', tabindex: '-1', 'aria-label': 'LikLok' });
    root.replaceChildren(feed, h('div', { class: 'lk-brand', 'aria-hidden': 'true' }, 'LikLok'),
      h('button', { type: 'button', class: 'lk-sound-chip', onclick: () => setSound(!sound) }, T('Tap for sound')));
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setCurrent(Number(e.target.dataset.i));
    }, { root: feed, threshold: [0.6] });
    load();
  }

  async function load() {
    if (loading || finished) return;
    loading = true;
    try {
      const skip = slides.map((s) => s.c.id).slice(-300).join(',');
      const data = await api(`/api/liklok/feed?n=8${skip ? `&skip=${skip}` : ''}`);
      const fresh = (data.clips || []).filter((c) => !slides.some((s) => s.c.id === c.id));
      if (!fresh.length) {
        if (!slides.length) showEmpty(data.status);
        else { finished = true; feed.append(h('div', { class: 'lk-end' }, T('That’s every clip for now'))); }
        return;
      }
      feed.querySelector('.lk-empty')?.remove();
      clearTimeout(emptyTimer);
      for (const c of fresh) addSlide(c);
      if (current < 0) setCurrent(0);
    } catch (e) {
      if (!slides.length) feed.replaceChildren(h('div', { class: 'lk-empty' }, h('h2', {}, T('Couldn’t load LikLok')), h('p', {}, e.message || ''),
        h('button', { type: 'button', class: 'chip', onclick: () => { feed.replaceChildren(); load(); } }, T('Try again'))));
    } finally { loading = false; }
  }

  function showEmpty(st) {
    const lines = st ? [T('{0} episodes looked at · {1} clips', st.scanned || 0, st.clips || 0), st.current && T('Now: {0}', st.current)].filter(Boolean) : [];
    feed.replaceChildren(h('div', { class: 'lk-empty' },
      h('h2', {}, T('LikLok is cutting its first clips')),
      h('p', {}, T('It looks through the first episodes of every show on the server and cuts out the best bits. This page fills in by itself.')),
      ...lines.map((l) => h('p', { class: 'lk-empty-status' }, l))));
    clearTimeout(emptyTimer);
    emptyTimer = setTimeout(() => { if (active && !slides.length) load(); }, 20000);
  }

  function icon(name) { const i = h('i', { class: 'lk-ico', 'aria-hidden': 'true' }); i.innerHTML = SVG[name]; return i; }
  function railButton(name, label, onclick) {
    return h('button', { type: 'button', class: 'lk-rail-btn', 'aria-label': label, onclick: (e) => { e.stopPropagation(); onclick(e); } }, icon(name), h('span', {}, label));
  }

  function addSlide(c) {
    const i = slides.length;
    const ep = [c.season != null && c.episode != null ? T('S{0} E{1}', c.season, c.episode) : null, c.episodeName].filter(Boolean).join(' · ');
    const stage = h('div', { class: 'lk-stage' }, h('img', { class: 'lk-poster', src: c.poster, alt: '', loading: i < 3 ? 'eager' : 'lazy', decoding: 'async' }));
    const cap = h('div', { class: 'lk-cap', 'aria-hidden': 'true' });
    const bar = h('i', { class: 'lk-bar-fill' });
    const why = h('p', { class: 'lk-why', hidden: true }, c.why || '');
    const s = { c, stage, cap, bar, cues: null };
    s.save = c.card ? railButton(isSaved(c.card) ? 'check' : 'plus', T('My list'), () => saveClip(s)) : null;
    if (s.save && isSaved(c.card)) s.save.classList.add('is-on');
    s.el = h('article', { class: 'lk-slide', 'data-i': String(i), onclick: (e) => tap(i, e) },
      h('div', { class: 'lk-bg', style: `background-image:url("${c.poster}")` }),
      stage, cap,
      h('div', { class: 'lk-paused-mark', 'aria-hidden': 'true' }, icon('play')),
      h('div', { class: 'lk-info' },
        h('button', { type: 'button', class: 'lk-show', onclick: (e) => { e.stopPropagation(); showPage(s); } }, c.showTitle || ''),
        ep ? h('p', { class: 'lk-ep' }, ep) : null,
        h('div', { class: 'lk-actions' },
          h('button', { type: 'button', class: 'lk-keep', onclick: (e) => { e.stopPropagation(); keepWatching(i); } }, icon('play'), T('Keep watching')),
          h('button', { type: 'button', class: 'lk-first', onclick: (e) => { e.stopPropagation(); fromStart(i); } }, c.first ? T('From episode 1') : T('From the start'))),
        c.why ? h('button', { type: 'button', class: 'lk-why-btn', onclick: (e) => { e.stopPropagation(); why.hidden = !why.hidden; } }, T('Why this clip')) : null,
        why),
      h('div', { class: 'lk-rail' },
        s.save,
        c.card ? railButton('info', T('About the show'), () => showPage(s)) : null,
        railButton('nope', T('Not for me'), () => nope(i))),
      h('div', { class: 'lk-bar' }, bar));
    slides.push(s);
    feed.append(s.el);
    observer.observe(s.el);
    if (current >= 0 && Math.abs(i - current) <= 1) attach(i);
  }

  function attach(k) {
    const s = slides[k];
    if (!s) return;
    const v = pool[k % 3];
    if (v._slide === k) return;
    v.pause();
    slides[v._slide]?.el.classList.remove('lk-ready');
    v._slide = k;
    s.stage.append(v);
    v.src = s.c.video;
    v.muted = !sound;
    v.load();
    if (!s.cues && s.c.vtt) {
      s.cues = [];
      fetch(s.c.vtt, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : '')).then((t) => { s.cues = parseVtt(t); }).catch(() => {});
    }
  }

  function flush() {
    if (!watch) return;
    const { id, played, loops, length } = watch;
    if (loops > 0 || played >= length * 0.9) event(id, 'done', played * 1000);
    else if (played < 3) event(id, 'skip', played * 1000);
    watch = null;
  }

  function setCurrent(i) {
    if (i === current || !slides[i]) return;
    flush();
    current = i;
    for (const k of [i - 1, i, i + 1]) attach(k);
    for (const v of pool) if (v._slide !== i) v.pause();
    const s = slides[i];
    watch = { id: s.c.id, played: 0, loops: 0, last: 0, length: s.c.end - s.c.start };
    event(s.c.id, 'view');
    if (active) start(i);
    if (i >= slides.length - 4) load();
  }

  function start(i) {
    const v = videoOf(i);
    if (!v || !active) return;
    v.muted = !sound;
    const p = v.play();
    p?.catch?.(() => { if (!v.muted) { v.muted = true; setSound(false, { quiet: true }); v.play().catch(() => {}); } });
  }

  function setSound(on, { quiet = false } = {}) {
    sound = on;
    root.classList.toggle('lk-sound', on);
    const chip = root.querySelector('.lk-sound-chip');
    if (chip) chip.textContent = on ? T('Sound on') : T('Tap for sound');
    for (const v of pool) {
      v.muted = !on;
      // Called from a tap: let the other two play with sound later too (iOS), without showing anything.
      if (on && !quiet && v._slide !== current && v.src) v.play().then(() => v.pause()).catch(() => {});
    }
    if (on && !quiet) start(current);
  }

  function tap(i, e) {
    if (e.target.closest('button, a')) return;
    if (i !== current) return;
    if (!sound) { setSound(true); return; }
    const v = videoOf(i);
    if (!v) return;
    if (v.paused) start(i); else v.pause();
  }

  function go(step) {
    const next = slides[current + step];
    if (next) next.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pauseAll() { for (const v of pool) v.pause(); }

  function keepWatching(i) {
    const s = slides[i], v = videoOf(i);
    const at = s.c.start + (v ? v.currentTime || 0 : 0);
    event(s.c.id, 'watch', (watch?.played || 0) * 1000);
    pauseAll();
    play(s.c.play, Math.max(1, at));
  }
  function fromStart(i) {
    const s = slides[i];
    event(s.c.id, 'watch', (watch?.played || 0) * 1000);
    pauseAll();
    play(s.c.first || s.c.play, 0);
  }
  function showPage(s) {
    if (!s.c.card) return;
    pauseAll();
    openShow(s.c.card, s.el);
  }
  async function saveClip(s) {
    try {
      const on = await toggleSave(s.c.card);
      s.save.classList.toggle('is-on', on);
      s.save.querySelector('.lk-ico').innerHTML = on ? SVG.check : SVG.plus;
      if (on) event(s.c.id, 'save');
    } catch (e) { toast(e.message); }
  }
  function nope(i) {
    const s = slides[i];
    event(s.c.id, 'nope');
    const show = s.c.titleKey || s.c.showTitle;
    toast(T('Got it. No more {0}.', s.c.showTitle || ''));
    // Later slides of that show go (their videos are let go, and the rest move up into their places).
    for (let k = slides.length - 1; k > i; k--) {
      if ((slides[k].c.titleKey || slides[k].c.showTitle) !== show) continue;
      observer.unobserve(slides[k].el);
      slides[k].el.remove();
      slides.splice(k, 1);
    }
    slides.forEach((x, k) => { x.el.dataset.i = String(k); });
    for (const v of pool) if (v._slide > i) { v.pause(); v._slide = -1; }
    for (const k of [i - 1, i, i + 1]) attach(k);
    if (slides[i + 1]) go(1); else load();
  }

  document.addEventListener('keydown', (e) => {
    if (!active || playerOpen() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.sheet.open, #sheet.open')) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j' || k === 'PageDown') { e.preventDefault(); go(1); }
    else if (k === 'ArrowUp' || k === 'k' || k === 'PageUp') { e.preventDefault(); go(-1); }
    else if (k === ' ') { e.preventDefault(); const v = videoOf(current); if (v) { if (v.paused) start(current); else v.pause(); } }
    else if (k === 'm') setSound(!sound);
  });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) pauseAll(); else if (!playerOpen()) start(current);
  });

  return {
    // The tab is showing (true) or not.
    setActive(on) {
      if (on === active) return;
      active = on;
      document.body.classList.toggle('liklok-on', on);
      if (!on) { pauseAll(); flush(); return; }
      if (!built) { build(); return; }
      if (!slides.length) { load(); return; }
      const s = slides[current];
      if (s && !watch) { watch = { id: s.c.id, played: 0, loops: 0, last: videoOf(current)?.currentTime || 0, length: s.c.end - s.c.start }; event(s.c.id, 'view'); }
      start(current);
    },
    pause: pauseAll,
    // Back from the player or a title page: carry on where it was.
    resume() { if (active && !playerOpen()) start(current); },
  };
}
