// PHASE LOCK: the preview skin's motion layer (phase.css does the rest). It never changes what anything does: it adds
// decorative, aria-hidden pieces next to the app's own elements and leaves those in place for screen readers.
// Every moment is a set of Web Animations on transform/opacity (clip-path never on a big area), started together, so it
// can be skipped (any tap), frozen for the motion strips (window.__phase), and dropped under reduced motion (end state).
//  - boot (E2): first open of the day, <= 1.2 s, tap skips: two signals step into phase, LiLiN locks, IN STEP 100.0
//  - billboard: stacked fitted names (A1 Press on every arrival), the harmonic ribbon (E1) locking with the
//    black-frame swap (A5: 210 ms decay, one black frame, hard cut), the slate queue pager (A4, red hairline timer)
//  - title pages: wave-edged backdrop + ribbon lock, the Press, lamp-tested facts (C4), roll call (A6), season cells
//    (D7), the countdown band (B7) when the next episode has a date; the whole entrance is under 400 ms
//  - tabs: burn-in word (A2) + a sine trace over a 200 ms opacity/translate page change (E4 lite)
//  - You as a profile file, one quiet player chrome (2f), Lilin's own colour themes
//  - Live merge rings (E3), living wordmark loader (E8)
// One MutationObserver on <body>, batched to one pass per frame, ignoring the player.
import { T } from './i18n.js';

const D = document, root = D.documentElement;
const $ = (s, r = D) => r.querySelector(s);
const $$ = (s, r = D) => [...r.querySelectorAll(s)];
const LAB = (() => { try { return JSON.parse(localStorage.getItem('ph:lab') || '{}') || {}; } catch { return {}; } })();
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const RM = () => mqReduce.matches || Boolean(LAB.reduced);
const CAN = typeof Element.prototype.animate === 'function';
const wide = () => matchMedia('(min-width: 900px)').matches;
const F = 42; // one frame at 24 fps: the unit of every cut
const TAU = Math.PI * 2;
root.classList.add('ph');
if (LAB.reduced) root.classList.add('ph-rm');

// the skin's own words: Swedish here (the app's catalogue doesn't have them), everything else through the app's T()
const SV = { 'In step': 'I takt', Locked: 'Låst', 'Getting in step': 'Kommer i takt', Together: 'Tillsammans', watched: 'sedda', days: 'dagar', You: 'Du', Lilin: 'Lilin' };
const W_ = (s) => { const t = T(s); return t === s && /^sv\b/.test(root.lang || '') && SV[s] ? SV[s] : t; };
const el = (tag, cls, text) => { const e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const deco = (tag, cls, html) => { const e = D.createElement(tag); if (cls) e.className = cls; e.setAttribute('aria-hidden', 'true'); if (html) e.innerHTML = html; return e; };
const pad2 = (n) => String(n).padStart(2, '0');
const ease = (p) => 1 - (1 - p) * (1 - p);

/* ================= moment engine ================= */
const live = new Set();
let hold = Boolean(LAB.hold); // motion strips: moments start paused at 0 and are moved with __phase.seek(ms)
let lastMoment = null;
function moment(name, dur, setup) {
  const m = { name, dur, anims: [], ticks: [], done: [], t0: performance.now(), ended: false };
  m.track = (target, prop, pts) => track(m, target, prop, pts);
  m.tick = (f) => m.ticks.push(f);
  m.then = (f) => m.done.push(f);
  setup(m);
  lastMoment = m;
  if (!CAN || RM()) { end(m); return m; }
  live.add(m);
  if (hold) { m.anims.forEach((a) => a.pause()); m.ticks.forEach((f) => f(0, false)); return m; }
  const loop = () => {
    if (m.ended) return;
    const t = performance.now() - m.t0;
    m.ticks.forEach((f) => f(Math.min(t, dur), false));
    if (t < dur) requestAnimationFrame(loop); else end(m);
  };
  requestAnimationFrame(loop);
  return m;
}
function end(m) {
  if (m.ended) return;
  m.ended = true;
  m.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  m.ticks.forEach((f) => f(m.dur, true));
  m.done.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  live.delete(m);
}
const endAll = () => [...live].forEach(end);
// keyframes from [[ms, value], ...], linear between points; two points on the same ms = a hard cut. The last value
// must be the element's resting (CSS) state: tracks don't fill forwards, so the page is never left holding styles.
function track(m, target, prop, pts) {
  if (!target || !CAN) return null;
  const dur = Math.max(1, pts[pts.length - 1][0]);
  const kf = pts.map(([ms, v]) => ({ [prop]: v, offset: Math.min(1, Math.max(0, ms / dur)) }));
  try {
    const a = target.animate(kf, { duration: dur, easing: 'linear', fill: 'backwards' });
    m.anims.push(a);
    return a;
  } catch { return null; }
}
// a value that changes in discrete steps ("on twos")
function stepped(t0, t1, n, f) {
  const pts = [[0, f(0)]];
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    if (k > 0) pts.push([t, pts[pts.length - 1][1]]);
    pts.push([t, f(k / n)]);
  }
  return pts;
}
const cutOn = (m, target, at) => m.track(target, 'opacity', [[0, 0], [at, 0], [at, 1]]);
// a tap anywhere finishes whatever is playing (the tap itself still goes through)
addEventListener('pointerdown', () => { if (!hold) endAll(); }, true);
// hidden tab: loops pause (CSS keys off html.ph-hidden)
const onVis = () => root.classList.toggle('ph-hidden', D.hidden);
D.addEventListener('visibilitychange', onVis); onVis();

/* ================= sine helpers ================= */
function sine(w, lam, amp, ph, yc, step = 4) {
  let d = '';
  for (let x = 0; x <= w + step; x += step) d += `${x ? 'L' : 'M'}${x.toFixed(1)},${(yc + amp * Math.sin((x / lam) * TAU + ph)).toFixed(2)}`;
  return d;
}
// a twisted rope of fine lines, two strands half a wave apart
function rope(w, h, lam, n) {
  const A = h / 2 - 3;
  let s = '';
  for (let i = 0; i < n; i++) {
    const ph = (i % 2 ? Math.PI : 0) + (i - n / 2) * 0.11;
    s += `<path d="${sine(w, lam, A * (1 - 0.06 * (i >> 1)), ph, h / 2, 5)}"/>`;
  }
  return s;
}
// E1: three layers of the same rope: you (red), the film (mint), and the locked one (bone)
function ribbon(host, { lines = 8, lam, drift = true } = {}) {
  const W = Math.max(200, host.clientWidth || innerWidth), H = host.clientHeight || 64;
  const L = Math.round(lam || Math.max(150, W * 0.46));
  host.style.setProperty('--lambda', `${L}px`);
  host.style.setProperty('--drift-dur', `${(L / Math.max(6, W * 0.02)).toFixed(1)}s`);
  const layer = (cls) => `<div class="rb-layer ${cls}"><svg viewBox="0 0 ${W + L} ${H}" preserveAspectRatio="none">${rope(W + L, H, L, lines)}</svg></div>`;
  host.innerHTML = `<div class="rb-drift">${layer('rb-a')}${layer('rb-b')}${layer('rb-l')}</div>`;
  host.classList.toggle('is-drift', drift);
  host._rb = { lam: L, a: $('.rb-a', host), b: $('.rb-b', host), l: $('.rb-l', host), w: W };
  return host._rb;
}
// desynced at t0 (red + mint apart), the film's strand walks back on twos, LOCK at t1 (bone, bright, then rests)
function lockRibbon(m, R, t0, t1, rest = 0.55, from = 0.5) {
  if (!R) return;
  m.track(R.l, 'opacity', [[0, t0 ? rest : 0], [t0, rest], [t0, 0], [t1, 0], [t1, 1], [t1 + 360, rest]]);
  m.track(R.a, 'opacity', [[0, t0 ? 0 : 1], [t0, 0], [t0, 1], [t1, 1], [t1, 0]]);
  m.track(R.b, 'opacity', [[0, t0 ? 0 : 1], [t0, 0], [t0, 1], [t1, 1], [t1, 0]]);
  const n = Math.max(3, Math.round((t1 - Math.max(t0, 0)) / (2 * F)));
  m.track(R.b, 'transform', [...stepped(t0, t1, n, (p) => `translateX(${(R.lam * from * (1 - ease(p))).toFixed(1)}px)`), [t1 + 1, 'translateX(0px)']]);
}
const squiggleSvg = (w, h, lam, amp, y) => `<svg class="ph-sine" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${sine(w, lam, amp, 0, y, 6)}"/></svg>`;

/* ================= the living wordmark (five letters, two i-dot cores) ================= */
const WM = [
  [0, 424, ['M0 0H242V22H0Z', 'M46 0H196V1000H46Z', 'M0 978H196V1000H0Z', 'M196 970L338 970L420 850L424 854L424 1000L196 1000Z']],
  [482, 724, ['M528 186H678V1000H528Z', 'M482 978H724V1000H482Z'], 'M528 0H678V150H528Z', 'a'],
  [798, 1222, ['M798 0H1040V22H798Z', 'M844 0H994V1000H844Z', 'M798 978H994V1000H798Z', 'M994 970L1136 970L1218 850L1222 854L1222 1000L994 1000Z']],
  [1280, 1522, ['M1326 186H1476V1000H1326Z', 'M1280 978H1522V1000H1280Z'], 'M1326 0H1476V150H1326Z', 'b'],
  [1596, 2098, ['M1642 0H1678V1000H1642Z', 'M1596 978H1724V1000H1596Z', 'M1596 0H1732V22H1596Z', 'M1642 0L1792 0L2052 1016L1902 1016Z', 'M2016 0H2052V1016H2016Z', 'M1970 0H2098V22H1970Z']],
];
const wordmarkHTML = () => `<span class="ph-lw">${WM.map(([x0, x1, ps, dot, core], k) =>
  `<span style="left:${((x0 / 2098) * 100).toFixed(3)}%;width:${(((x1 - x0) / 2098) * 100).toFixed(3)}%;--k:${[0, 3, 1, 4, 2][k]}"><svg viewBox="${x0} 0 ${x1 - x0} 1016" preserveAspectRatio="none">${
    ps.map((d) => `<path d="${d}"/>`).join('')}${dot ? `<path class="dot-${core}" d="${dot}"/>` : ''}</svg></span>`).join('')}</span>`;

/* ================= stacked names, fitted to the column ================= */
const ARTICLES = /^(the|a|an|den|det|en|ett|de|le|la|les|el|los|die|der|das)$/i;
function splitName(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  const at = text.search(/[:：]\s|\s[–—-]\s/);
  const main = (at > 0 ? text.slice(0, at) : text).trim();
  const sub = at > 0 ? text.slice(at + 1).replace(/^[\s–—-]+/, '').trim() : '';
  let words = main.split(' ');
  const out = [];
  if (words.length > 1 && ARTICLES.test(words[0]) && words.slice(1).join(' ').length >= 3) out.push({ t: words.shift(), sm: true });
  const rest = words.join(' ');
  // one line up to 11 characters; else the most even split into 2 (or 3 for long names) at word breaks
  const split = (ws, n) => {
    if (n <= 1 || ws.length < 2) return [ws.join(' ')];
    let best = null;
    const tryCut = (cuts) => {
      const parts = []; let s = 0;
      for (const c of [...cuts, ws.length]) { parts.push(ws.slice(s, c).join(' ')); s = c; }
      const worst = Math.max(...parts.map((p) => p.length));
      if (!best || worst < best.worst) best = { parts, worst };
    };
    for (let i = 1; i < ws.length; i++) {
      if (n === 2) tryCut([i]);
      else for (let j = i + 1; j < ws.length; j++) tryCut([i, j]);
    }
    return best.parts;
  };
  let lines;
  if (rest.length <= 11 || words.length < 2) lines = [rest];
  else { lines = split(words, 2); if (Math.max(...lines.map((l) => l.length)) > 15 && words.length > 2) lines = split(words, 3); }
  lines.forEach((t) => out.push({ t }));
  if (sub) out.push({ t: sub, sub: true });
  return out;
}
function nameBlock(title) {
  const box = el('p', 'ph-name');
  box.setAttribute('aria-hidden', 'true');
  for (const l of splitName(title)) {
    const ln = el('span', `ln${l.sm ? ' sm' : ''}${l.sub ? ' sub' : ''}`);
    if (l.sm) ln.textContent = l.t; else ln.append(el('span', 'fi', l.t));
    box.append(ln);
  }
  box.dataset.for = title;
  return box;
}
// every big line spans the column at the house condense; short lines cap at `max` and widen up to scaleX(1);
// lines never go under `min` (long Swedish words get squeezed instead), and the whole stack stays under `maxH`
function fit(box, { max = 110, min = 26, maxH = 220, S = 0.78 } = {}) {
  const W = box.clientWidth;
  if (!W) return false;
  const lines = $$('.ln:not(.sm)', box).map((ln) => {
    const fi = ln.firstElementChild;
    fi.style.fontSize = '100px'; fi.style.transform = 'none';
    return { ln, fi, w: (fi.getBoundingClientRect().width || 1) / 100, sub: ln.classList.contains('sub') };
  });
  const size = (l, cap) => {
    let fs = W / (l.w * S), s = S;
    if (fs > cap) { fs = cap; s = Math.min(1, W / (l.w * fs)); }
    if (fs < min) { fs = min; s = Math.max(0.55, W / (l.w * fs)); }
    return { fs, s };
  };
  const mainCap = Math.min(max, ...lines.filter((l) => !l.sub).map((l) => size(l, max).fs));
  let sizes = lines.map((l) => size(l, l.sub ? Math.max(min, Math.min(max * 0.42, mainCap * 0.62)) : max));
  const total = sizes.reduce((a, b) => a + b.fs * 0.82, 0);
  if (total > maxH) {
    const k = maxH / total;
    sizes = lines.map((l, i) => { const fs = Math.max(min, sizes[i].fs * k); return { fs, s: Math.min(1, Math.max(0.55, W / (l.w * fs))) }; });
  }
  lines.forEach((l, i) => {
    const { fs, s } = sizes[i];
    l.fi.style.fontSize = `${fs.toFixed(1)}px`;
    l.fi.style.transform = `scaleX(${s.toFixed(3)})`;
    l.fi.dataset.s = s.toFixed(3);
    l.ln.style.height = `${(fs * 0.8).toFixed(1)}px`;
  });
  box.classList.add('is-fit');
  return true;
}
// A1 THE PRESS: the word lands too wide (cropped by the column), squeezed to its width in 3 steps on twos (126 ms)
function press(m, box, at = 0, k = 1.28) {
  if (!box) return;
  $$('.ln', box).forEach((ln, i) => {
    cutOn(m, ln, at + (ln.classList.contains('sub') || ln.classList.contains('sm') ? F : 0));
    const fi = ln.querySelector('.fi');
    if (!fi) return;
    const c = +fi.dataset.s || 1, s = (x) => `scaleX(${(c * x).toFixed(3)})`;
    const a = at + (i ? 0 : 0);
    m.track(fi, 'transform', [[0, s(k)], [a + F, s(k)], [a + F, s(1 + (k - 1) * 0.5)], [a + 2 * F, s(1 + (k - 1) * 0.5)],
      [a + 2 * F, s(1 + (k - 1) * 0.18)], [a + 3 * F, s(1 + (k - 1) * 0.18)], [a + 3 * F, s(1)]]);
  });
}
// C4 LAMP TEST: all segments (88) for two frames, two garbled frames, then the real number. The real text never
// changes: the test digits are laid over it (data-ph-lamp + ::after), so screen readers and re-renders are safe.
function lamp(m, target, at = 0) {
  if (!target) return;
  const v = target.textContent;
  if (!/\d/.test(v)) return;
  const all8 = v.replace(/\d/g, '8');
  const garble = (k) => v.replace(/\d/g, (_, i) => String((k * 7 + i * 3 + 5) % 10));
  m.tick((t, fin) => {
    const d = t - at;
    const s = fin || d < 0 || d >= 4 * F ? null : d < 2 * F ? all8 : garble(Math.floor(d / F));
    if (s) { target.dataset.phLamp = s; target.classList.add('ph-lamping'); }
    else if (target.classList.contains('ph-lamping')) { target.classList.remove('ph-lamping'); delete target.dataset.phLamp; }
  });
}
// A6 ROLL CALL: items cut on one per frame
const rollcall = (m, items, at, step = F) => items.forEach((it, i) => cutOn(m, it, at + i * step));

/* ================= idle loops only on screen ================= */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
  e.target.classList.toggle('is-off', !e.isIntersecting);
  e.target._onView?.(e.isIntersecting);
  if (e.isIntersecting && e.target._onSeen) { const f = e.target._onSeen; e.target._onSeen = null; f(); }
}), { threshold: 0.15 }) : null;
const watch = (target, onSeen) => { if (onSeen) target._onSeen = onSeen; if (io) io.observe(target); else if (onSeen) onSeen(); };

/* ================= theme: keep the two signals apart ================= */
function hueOf(color) {
  const c = el('i'); c.style.color = color; D.body.append(c);
  const m = getComputedStyle(c).color.match(/[\d.]+/g); c.remove();
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function themeCheck() {
  const h = hueOf(getComputedStyle(root).getPropertyValue('--bulb').trim() || '#FB2C16');
  root.classList.toggle('ph-film-alt', h != null && h > 85 && h < 200);
}
new MutationObserver(() => { themeMap(); themeCheck(); }).observe(root, { attributes: true, attributeFilter: ['style', 'data-scheme'] });

/* ================= boot: the first open of the day (E2) ================= */
const today = new Date().toDateString();
let booting = null;
function wantBoot() {
  if (LAB.boot === 'never' || RM() || !CAN) return false;
  if (LAB.boot === 'force') return true;
  if (/[?&](watch|t)=/.test(location.search) || (location.hash && !/^#(discover)?$/.test(location.hash))) return false;
  try { return localStorage.getItem('ph:boot') !== today; } catch { return false; }
}
function boot() {
  try { localStorage.setItem('ph:boot', today); } catch { /* blocked */ }
  const d = new Date(), stamp = `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const B = deco('div', 'ph-boot', `<div class="b-bg"></div><div class="b-target ph-target"></div><div class="b-marks"></div><div class="b-win"><small>Lilin</small><small>${stamp}</small></div><div class="b-top"><span>Lilin</span><span>${stamp}</span></div><div class="b-mid"><div class="ph-ribbon"></div><div class="b-wm">${wordmarkHTML()}</div></div>
    <div class="b-read"><small>${W_('In step')}</small><span class="b-num"><span>0.0</span><small>%</small></span></div><span class="b-stamp">${W_('Locked')}</span>
    <div class="b-foot"><span><i style="background:var(--ph-you)"></i>${W_('You')}</span><span><i style="background:var(--ph-film)"></i>${W_('Lilin')}</span></div>`);
  D.body.append(B);
  frame($('.b-win', B), { hex: true });
  const R = ribbon($('.ph-ribbon', B), { lines: 8, drift: false });
  const letters = $$('.ph-lw > span', B);
  booting = moment('boot', 1200, (m) => {
    // two signals: the film's strand walks into phase with yours on twos, the rope flattens as they agree
    lockRibbon(m, R, 0, 720, 0.85, 0.5);
    m.track(R.a, 'transform', [...stepped(84, 720, 8, (p) => `scaleY(${(1 - 0.7 * ease(p)).toFixed(3)})`), [721, 'scaleY(.3)']]);
    m.track(R.b, 'transform', [...stepped(84, 720, 8, (p) => `translateX(${(R.lam * 0.5 * (1 - ease(p))).toFixed(1)}px) scaleY(${(1 - 0.7 * ease(p)).toFixed(3)})`), [721, 'scaleY(.3)']]);
    R.l.style.transform = 'scaleY(.3)';
    m.track(R.l.parentNode.parentNode, 'opacity', [[0, 1], [880, 1], [1040, 0], [1200, 0]]);
    // the letters ride their own phases, then land on one baseline (hard)
    letters.forEach((s, i) => {
      cutOn(m, s, F * [0, 2, 1, 3, 1][i]);
      m.track(s, 'transform', [...stepped(0, 680, 16, (p) => `translateY(${(26 * Math.pow(1 - p, 1.3) * Math.sin(i * 1.35 + p * 9)).toFixed(1)}px)`), [720, 'translateY(0px)']]);
    });
    $$('.dot-a, .dot-b', B).forEach((d) => m.track(d, 'opacity', [[0, 1], [720, 1], [720, 0]]));
    // the readout: lamp test, then the count on twos, 100.0 at the lock
    const num = $('.b-num > span', B);
    m.tick((t) => {
      const v = t < 2 * F ? '888.8' : t >= 720 ? '100.0' : (Math.min(99.9, 100 * ease(Math.floor((t - 2 * F) / (2 * F)) / Math.floor((720 - 2 * F) / (2 * F))))).toFixed(1);
      if (num.textContent !== v) num.textContent = v;
    });
    m.track($('.b-read', B), 'opacity', [[0, 1], [880, 1], [1040, 0], [1200, 0]]);
    const stamp = $('.b-stamp', B);
    m.track(stamp, 'opacity', [[0, 0], [720, 0], [720, 1], [762, 1], [762, 0], [804, 0], [804, 1], [1000, 1], [1100, 0], [1200, 0]]);
    m.track($('.b-foot', B), 'opacity', [[0, 1], [880, 1], [1040, 0], [1200, 0]]);
    [$('.b-marks', B), $('.b-top', B), $('.b-win', B), $('.b-target', B)].forEach((x) => m.track(x, 'opacity', [[0, 1], [880, 1], [1040, 0], [1200, 0]]));
    // hand-off: the wordmark flies to the header's
    const wm = $('.b-wm', B), dst = $('.wordmark .wm');
    const a = wm.getBoundingClientRect(), b = dst?.getBoundingClientRect();
    if (b && b.width) {
      const s = b.width / a.width, dx = b.left - a.left, dy = b.top - a.top;
      m.track(wm, 'transform', [[0, 'none'], [880, 'translate(0px,0px) scale(1)'], [1060, `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${s.toFixed(3)})`], [1200, `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${s.toFixed(3)})`]]);
      m.track(wm, 'opacity', [[0, 1], [1060, 1], [1200, 0]]);
    }
    m.track($('.b-bg', B), 'opacity', [[0, 1], [1040, 1], [1200, 0]]);
    m.then(() => { B.remove(); booting = null; afterBoot.forEach((f) => f()); afterBoot.length = 0; });
  });
  B.addEventListener('pointerdown', () => end(booting), { once: true });
}
const afterBoot = [];
const whenBooted = (f) => (booting && !booting.ended ? afterBoot.push(f) : f());

/* ================= cut-corner hairline frames (round 2c, after the FUI references) ================= */
// An SVG sized to its box in real pixels (so the cuts stay crisp): the outline with cut corners (`cut`, or `hex` for
// pointed ends), tick rulers along the top and bottom edges, and one short lit segment (the one accent).
function frame(host, { cut = 12, hex = false, ticks = true, hot = true } = {}) {
  const W = Math.round(host.clientWidth), H = Math.round(host.clientHeight);
  if (!W || !H) return;
  const key = `${W}x${H}`;
  if (host.dataset.phFrame === key) return;
  host.dataset.phFrame = key;
  const c = hex ? Math.min(H / 2, 48) : cut;
  const d = hex
    ? `M${c},0.5H${W - c}L${W - 0.5},${H / 2}L${W - c},${H - 0.5}H${c}L0.5,${H / 2}Z`
    : `M${c},0.5H${W - 0.5}V${H - c}L${W - c},${H - 0.5}H0.5V${c}Z`;
  let tk = '';
  if (ticks) {
    const x0 = c + 18, x1 = W - c - 18;
    for (let x = x0, i = 0; x <= x1; x += 12, i++) { const l = i % 5 ? 3 : 7; tk += `M${x.toFixed(1)},0.5v${l}M${x.toFixed(1)},${H - 0.5}v-${l}`; }
  }
  const lit = hot ? `<path class="hot" d="M${c + 18},${H - 0.5}h${Math.min(46, W / 6)}"/>` : '';
  let svg = host.querySelector(':scope > .ph-frame');
  if (!svg) { svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ph-frame'); svg.setAttribute('aria-hidden', 'true'); host.prepend(svg); }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<path d="${d}"/>${tk ? `<path class="tk" d="${tk}"/>` : ''}${lit}`;
}

/* ================= the billboard ================= */
const BB = { root: null, rb: null, black: null, swapping: false, timer: null, paused: false, visible: true };
function enhanceBillboard(bb) {
  if (bb._ph) return;
  bb._ph = true;
  BB.root = bb;
  const track = $('.bb-track', bb);
  const slides = $$('.bb-slide', track);
  slides.forEach((s, i) => {
    const copy = $('.bb-copy', s), t = s._title;
    if (!copy || !t) return;
    const box = nameBlock(t.title);
    $('.bb-title', copy).after(box);
    copy.classList.add('ph-has-name');
  });
  // the ribbon across the picture, above the active title; one black frame layer for the swap
  const rb = deco('div', 'ph-ribbon');
  bb.append(rb);
  BB.black = deco('div', 'ph-black');
  bb.append(BB.black);
  BB.marks = deco('div', 'ph-marks', '<b></b><b></b>');
  BB.marks.firstChild.textContent = (bb.getAttribute('aria-label') || T('Trending this week')).toUpperCase();
  bb.append(BB.marks);
  bb.classList.add('ph-marked');
  // A4 slate queue: the bulbs become the next titles in small type (the buttons keep their labels)
  $$('.bb-bulb', bb).forEach((btn, i) => {
    const t = slides[i]?._title;
    if (!t) return;
    const q = deco('span', 'ph-q');
    q.append(el('em', null, pad2(i + 1)), D.createTextNode(String(t.title).split(/[:：]/)[0]), el('i'));
    btn.append(q);
    btn.classList.add('ph-q-on');
  });
  fitBillboard();
  BB.rb = ribbon(rb, { lines: 8 });
  placeRibbon();
  D.fonts?.ready.then(placeRibbon);
  rb._onView = (v) => { BB.visible = v; hairline(); };
  watch(rb);
  // the black-frame swap for programmatic changes (auto-advance, the queue): billboard.js scrolls the track
  const scrollTo = track.scrollTo.bind(track);
  track.scrollTo = (opts) => {
    if (!opts || typeof opts !== 'object' || RM() || !CAN || BB.swapping || !wide()) { scrollTo(opts); return; }
    const to = Math.round(Math.abs(opts.left || 0) / Math.max(1, track.clientWidth));
    const from = slides.findIndex((s) => s.classList.contains('is-active'));
    if (to === from || !slides[to]) { scrollTo({ ...opts, behavior: 'instant' }); return; }
    swap(track, slides[from], slides[to], () => scrollTo({ ...opts, behavior: 'instant' }));
  };
  // swipes (phones) and the first slide: the Press + a short lock when a slide becomes the active one
  let active = slides.find((s) => s.classList.contains('is-active')) || slides[0];
  new MutationObserver(() => {
    const now = slides.find((s) => s.classList.contains('is-active'));
    if (!now || now === active) return;
    active = now;
    queueTo(slides.indexOf(now));
    if (!BB.swapping) arrive(now);
  }).observe(track, { subtree: true, attributes: true, attributeFilter: ['class'] });
  bb.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { BB.paused = true; hairline(); } });
  bb.addEventListener('pointerleave', () => { BB.paused = false; hairline(); });
  bb.addEventListener('focusin', () => { BB.paused = true; hairline(); });
  bb.addEventListener('focusout', () => { if (!bb.contains(D.activeElement)) { BB.paused = false; hairline(); } });
  queueTo(Math.max(0, slides.indexOf(active)));
  whenBooted(() => arrive(active, true));
}
function fitBillboard() {
  const bb = BB.root;
  if (!bb) return;
  const w = wide();
  $$('.bb-copy .ph-name', bb).forEach((box) => fit(box, w ? { max: 150, maxH: 250, min: 34 } : { max: 104, maxH: 196, min: 28 }));
}
function placeRibbon() {
  const bb = BB.root, slide = $('.bb-slide.is-active', bb) || $('.bb-slide', bb);
  const copy = slide && $('.bb-copy', slide);
  if (!copy) return;
  const copyTop = copy.getBoundingClientRect().top - bb.getBoundingClientRect().top;
  const top = copyTop - (wide() ? 96 : 70);
  bb.style.setProperty('--ph-rb-top', `${Math.max(wide() ? 130 : 70, top)}px`);
  if (BB.marks) {
    const mkTop = BB.marks.offsetTop, h = Math.round(copyTop - 16 - mkTop);
    bb.classList.toggle('ph-no-window', h < 90);
    bb.style.setProperty('--ph-mk-h', `${Math.max(0, h)}px`);
    if (h >= 90) requestAnimationFrame(() => frame(BB.marks, { cut: 14 }));
  }
}
function arrive(slide, first = false) {
  placeRibbon();
  const box = $('.ph-name', slide);
  moment('arrive', first ? 420 : 300, (m) => {
    press(m, box, 0);
    const meta = [$('.bb-rank', slide), $('.bb-meta', slide)];
    meta.forEach((x) => cutOn(m, x, 2 * F));
    lockRibbon(m, BB.rb, 0, first ? 336 : 252);
  });
  hairline();
}
// A5: old words decay linearly (210 ms), one black frame, hard cut to the new picture and name, pressed on
function swap(track, from, to, doScroll) {
  BB.swapping = true;
  let scrolled = false;
  const go = () => { if (!scrolled) { scrolled = true; doScroll(); placeRibbon(); } };
  moment('swap', 420, (m) => {
    m.track($('.bb-copy', from), 'opacity', [[0, 1], [210, 0], [211, 1]]);
    m.track(BB.black, 'opacity', [[0, 0], [210, 0], [210, 1], [210 + F, 1], [210 + F, 0]]);
    const at = 210 + F;
    press(m, $('.ph-name', to), at);
    [$('.bb-rank', to), $('.bb-meta', to), $('.bb-overview', to), $('.bb-actions', to)].forEach((x) => cutOn(m, x, at + F));
    m.track($('.bb-img', to), 'opacity', [[0, 0], [at, 0], [at, 1]]);
    lockRibbon(m, BB.rb, 0.01, 420);
    m.tick((t) => { if (t >= 210) go(); });
    m.then(() => { go(); BB.swapping = false; });
  });
}
function queueTo(i) {
  const n = BB.root ? $$('.bb-slide', BB.root).length : 0;
  if (BB.marks && n) BB.marks.lastChild.textContent = `${pad2(i + 1)} / ${pad2(n)}`;
  const bulbs = BB.root && $('.bb-bulbs', BB.root);
  const btn = bulbs && $$('.bb-bulb', bulbs)[i];
  if (!btn) return;
  const left = Math.max(0, btn.offsetLeft - bulbs.offsetLeft - 4);
  bulbs.scrollLeft = left;
  hairline();
}
// the auto-advance timer (billboard.js advances every 9 s on wide screens, paused on hover/focus/hidden)
function hairline() {
  const bb = BB.root;
  if (!bb) return;
  const i = $('.bb-bulb[aria-current="true"] .ph-q i', bb);
  if (BB.timer && BB.timer._i !== i) { BB.timer.cancel(); BB.timer = null; }
  if (!i || !wide() || RM() || !CAN) return;
  if (!BB.timer) { BB.timer = i.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 9000, easing: 'linear', fill: 'forwards' }); BB.timer._i = i; }
  if (BB.paused || !BB.visible || D.hidden || hold) BB.timer.pause(); else BB.timer.play();
}
D.addEventListener('visibilitychange', hairline);

/* ================= loading: the living wordmark (E8) ================= */
function enhanceSkeleton(sk) {
  if (sk._ph) return;
  sk._ph = true;
  const L = deco('div', 'ph-loader', `${wordmarkHTML()}<p>${W_('Getting in step')}</p>`);
  sk.append(L);
}

/* ================= title pages ================= */
let sheetSeen = null;
function enhanceSheet(sheet) {
  const content = $('.sheet-content', sheet), h2 = content && $('h2#sheet-title', content);
  if (!h2) return null;
  const text = $('img.page-logo', h2)?.alt || h2.textContent.trim();
  if (!text) return null;
  let box = $('.ph-name', h2);
  if (!box || box.dataset.for !== text) {
    box?.remove();
    if (!$('img.page-logo', h2) && !$('.ph-sr', h2)) h2.replaceChildren(el('span', 'ph-sr', text));
    box = nameBlock(text);
    h2.append(box);
    h2.classList.add('ph-named');
  }
  if (box._fitW !== box.clientWidth && fit(box, wide() ? { max: 132, maxH: 280, min: 30 } : { max: 112, maxH: 230, min: 26 })) box._fitW = box.clientWidth;
  // the wave edge + the ribbon that rides it
  const hero = $('.sheet-hero', sheet);
  if (hero && !hero.classList.contains('no-image') && !hero.classList.contains('is-playing')) {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (W && H && hero.dataset.phW !== `${W}x${H}`) {
      hero.dataset.phW = `${W}x${H}`;
      const lam = Math.round(W * 0.62), A = 11, yc = H - 26;
      const pts = [];
      for (let i = 24; i >= 0; i--) { const x = (W * i) / 24; pts.push(`${x.toFixed(1)}px ${(yc + A * Math.sin((x / lam) * TAU)).toFixed(1)}px`); }
      hero.style.setProperty('--ph-wave-clip', `polygon(0px 0px, 100% 0px, ${pts.join(', ')})`);
      hero.classList.add('ph-wave');
      let mk = $(':scope > .ph-marks', hero);
      if (!mk) { mk = deco('div', 'ph-marks'); hero.append(mk); }
      requestAnimationFrame(() => heroFrame(hero, mk));
      let edge = hero.nextElementSibling?.classList.contains('ph-edge') ? hero.nextElementSibling : null;
      if (!edge) { edge = deco('div', 'ph-edge', '<div class="ph-ribbon"></div>'); hero.after(edge); }
      const rb = $('.ph-ribbon', edge);
      rb.style.height = `${2 * A + 6}px`;
      edge.style.setProperty('--ph-edge-top', `${-26 - A - 3}px`);
      ribbon(rb, { lines: 6, lam, drift: false });
    }
  }
  enhanceEpisodes(sheet);
  return box;
}
function heroFrame(hero, mk) {
  const hr = hero.getBoundingClientRect();
  let top = 64, bottom = 46;
  const close = $('#sheet-close');
  if (close) { const r = close.getBoundingClientRect(); if (r.height) top = Math.max(top, r.bottom - hr.top + 10); }
  $$(':scope > button, :scope > a', hero).forEach((b) => { const r = b.getBoundingClientRect(); if (r.height && !b.hidden) bottom = Math.max(bottom, hr.bottom - r.top + 10); });
  mk.style.top = `${Math.round(top)}px`; mk.style.bottom = `${Math.round(bottom)}px`;
  mk.hidden = hr.height - top - bottom < 90;
  if (!mk.hidden) frame(mk, { cut: 12, hot: false });
}
function enhanceEpisodes(sheet) {
  const list = $('.episode-list', sheet);
  if (!list) return;
  const eps = $$(':scope > .ep', list);
  const key = eps.map((e) => `${e.dataset.episode}${e.className}`).join(',');
  if (list._phKey === key) return;
  list._phKey = key;
  const airsPrefix = T('Airs {0}', '').trim();
  let next = null, soon = null;
  eps.forEach((ep) => {
    const n = ep.getAttribute('data-episode');
    if (n && /^\d+$/.test(n)) ep.dataset.phN = pad2(n); else delete ep.dataset.phN;
    // "1. Pilot": the number is in the column now; keep it for screen readers only
    const tt = $('.ep-title', ep), first = tt?.firstChild;
    if (n && first?.nodeType === 3 && first.data.startsWith(`${n}. `)) { first.data = first.data.slice(n.length + 2); tt.prepend(el('span', 'ph-sr', `${n}. `)); }
    ep.classList.remove('ph-next');
    const watched = ep.classList.contains('is-watched');
    const meta = $('.ep-meta', ep)?.textContent || '';
    const upcoming = airsPrefix && meta.includes(airsPrefix);
    ep._phSoon = upcoming;
    if (!next && !watched && !upcoming && (ep.classList.contains('is-mine') || ep.classList.contains('is-here') || $('.poster-progress', ep))) next = ep;
    if (!soon && upcoming) soon = ep;
  });
  // the next one: the episode in progress, else the first unwatched after a watched one
  const inProgress = eps.find((e) => !e.classList.contains('is-watched') && $('.poster-progress i', e));
  next = inProgress || eps.find((e, i) => !e.classList.contains('is-watched') && !e._phSoon && (i === 0 || eps[i - 1].classList.contains('is-watched'))) || null;
  if (next && !eps.some((e) => e.classList.contains('is-watched')) && !inProgress) next = null;
  next?.classList.add('ph-next');
  // D7: the season as cells
  const sec = list.closest('.page-section') || list.parentElement;
  let cells = $('.ph-cells', sec), keyEl = $('.ph-cells-key', sec);
  if (eps.length >= 2 && eps.length <= 60) {
    if (!cells) { keyEl = deco('div', 'ph-cells-key'); cells = deco('div', 'ph-cells'); list.before(keyEl, cells); }
    const seen = eps.filter((e) => e.classList.contains('is-watched')).length;
    keyEl.innerHTML = `<span><b>${seen}</b> / ${eps.length} ${W_('watched')}</span>${next ? `<span><b class="n">${pad2(next.dataset.episode || '')}</b> ${T('Up next')}</span>` : ''}`;
    cells.innerHTML = eps.map((e) => `<i class="${e === next ? 'n' : e.classList.contains('is-watched') ? 'w' : e._phSoon ? 's' : e.classList.contains('is-missing') ? 'u' : ''}">${e.dataset.episode || ''}</i>`).join('');
  } else { cells?.remove(); keyEl?.remove(); }
  // B7: the countdown band for the next episode with a date ahead
  let band = $('.ph-cd', sec);
  const lab = LAB.countdown && !soon ? LAB.countdown : null; // lab: "E05|2026-11-29" to show the band on any show
  if (soon || lab) {
    const n = lab ? lab.split('|')[0] : `E${pad2(soon.dataset.episode || '')}`;
    const label = lab ? T('Airs {0}', new Date(`${lab.split('|')[1]}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) : ($('.ep-meta', soon).textContent.match(new RegExp(`${airsPrefix}[^·]*`)) || [''])[0].trim();
    const when = lab ? Date.parse(`${lab.split('|')[1]}T12:00:00`) : Date.parse(label.replace(airsPrefix, '').trim());
    const days = Number.isFinite(when) ? Math.max(0, Math.ceil((when - Date.now()) / 86400000)) : null;
    if (!band) { band = deco('div', 'ph-cd'); (keyEl || cells || list).before(band); }
    band.classList.toggle('is-today', days === 0);
    band.innerHTML = `<div><span><small>${T('Next episode')} · ${n}</small><small>${label}</small></span>${days == null ? '' : `<b>${days === 0 ? T('Today') : `${days}<small>${W_('days')}</small>`}</b>`}</div>`;
  } else band?.remove();
}
function sheetOpened(sheet) {
  const box = enhanceSheet(sheet);
  if (!box) return false;
  const hero = $('.sheet-hero', sheet), edgeRb = $('.ph-edge .ph-ribbon', sheet)?._rb;
  const facts = $$('.facts li', sheet).filter((li) => /\d/.test(li.textContent)).slice(0, 4);
  const eps = $$('.episode-list > .ep', sheet).slice(0, 6);
  const cells = $$('.ph-cells i', sheet).slice(0, 24);
  moment('title', 400, (m) => {
    if (hero) m.track($('.hero-img', hero), 'transform', [[0, 'scale(1.04)'], [F, 'scale(1.04)'], [F, 'scale(1.02)'], [3 * F, 'scale(1.02)'], [3 * F, 'scale(1)']]);
    press(m, box, F);
    cutOn(m, $('.page-tagline', sheet), 3 * F);
    facts.forEach((li, i) => { cutOn(m, li, 3 * F + i * F); if (li.classList.contains('fact-rating')) lamp(m, li, 3 * F + i * F); });
    cutOn(m, $('.title-bar', sheet), 4 * F);
    lockRibbon(m, edgeRb, 0, 336);
    rollcall(m, eps, 4 * F, F);
    cells.forEach((c, i) => m.track(c, 'transform', [[0, 'scale(0)'], [4 * F + i * 10, 'scale(0)'], [4 * F + i * 10, 'scale(.5)'], [5 * F + i * 10, 'scale(.5)'], [5 * F + i * 10, 'scale(1)']]));
    cutOn(m, $('.ph-cd', sheet), 6 * F);
  });
  return true;
}
function watchSheet() {
  const sheet = $('#sheet');
  if (!sheet || sheet._ph) return;
  sheet._ph = true;
  let pending = 0;
  new MutationObserver(() => {
    const open = sheet.classList.contains('open') && !sheet.hidden;
    if (!open) { sheetSeen = null; return; }
    const h2 = $('h2#sheet-title', sheet);
    const id = h2 && ($('img.page-logo', h2)?.alt || h2.textContent.trim());
    if (!id || sheetSeen === id) return;
    if (!$('.sheet-content .facts, .sheet-content .title-bar', sheet)) return; // still the skeleton
    sheetSeen = id;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => sheetOpened(sheet));
  }).observe(sheet, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true, subtree: true });
}

/* ================= tabs: burn-in (A2) + the trace over the page swap (E4 lite) ================= */
const TAB_VIEWS = ['discover', 'live', 'you', 'house', 'liklok'];
let trace = null;
function burnWord(view, name) {
  if (name === 'discover' || name === 'liklok') return null;
  let b = $(':scope > .ph-burn', view);
  const word = $(`.tabs .tab[data-view="${name}"] > span`)?.textContent.trim() || name;
  if (!b) { b = deco('div', 'ph-burn', '<span></span>'); view.prepend(b); }
  b.firstChild.textContent = word;
  return b.firstChild;
}
function tabMoment(view, name) {
  const word = burnWord(view, name);
  if (!trace) {
    trace = deco('div', 'ph-trace');
    // a straight hairline sweep: the line, a ruler of ticks under it, and a short accent tick at its head
    let ticks = ''; for (let x = 0; x <= 400; x += 16) ticks += `M${x},20v${x % 80 ? 3 : 6}`;
    trace.innerHTML = `<svg viewBox="0 0 400 40" preserveAspectRatio="none"><path class="r" d="M0,20H400${ticks}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/><path class="l" d="M24,13V27M24,20H64" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    D.body.append(trace);
  }
  const vh = innerHeight;
  moment('tab', 420, (m) => {
    m.track(view, 'opacity', [[0, 0], [200, 1]]);
    m.track(view, 'transform', [[0, 'translateY(12px)'], [200, 'translateY(0px)']]);
    m.track(trace, 'transform', [[0, `translateY(${vh}px)`], [200, 'translateY(-40px)']]);
    m.track(trace, 'opacity', [[0, 1], [200, 1], [200, 0]]);
    if (word) {
      const sx = getComputedStyle(root).getPropertyValue('--ph-sx').trim() || '.78', s = (k) => `scaleX(${(sx * k).toFixed(3)})`;
      m.track(word, 'opacity', [[0, 1], [160, 1], [420, 0.09]]);
      m.track(word, 'transform', [[0, s(1.3)], [F, s(1.3)], [F, s(1.16)], [2 * F, s(1.16)], [2 * F, s(1.05)], [3 * F, s(1.05)], [3 * F, s(1)]]);
    }
    if (name === 'you') { const nums = $$('.pf-stat dd, .you-tile-num', view).slice(0, 8); nums.forEach((n, i) => lamp(m, n, 3 * F + i * 21)); rollcall(m, $$('.pf-stat', view).slice(0, 6), 2 * F); }
    if (name === 'live') $$('.nownext-number', view).slice(0, 6).forEach((n, i) => lamp(m, n, 3 * F + i * F));
  });
}
function watchViews() {
  $$('#main > .view').forEach((view) => {
    if (view._ph) return;
    view._ph = true;
    const name = view.id.replace(/^view-/, '');
    if (!TAB_VIEWS.includes(name)) return;
    if (!view.hidden) burnWord(view, name);
    new MutationObserver(() => {
      if (view.hidden) { view._phShown = false; return; }
      if (view._phShown) return;
      view._phShown = true;
      tabMoment(view, name);
    }).observe(view, { attributes: true, attributeFilter: ['hidden'] });
    view._phShown = !view.hidden;
  });
}

/* ================= Live: friends' circles join into one ring (E3) ================= */
function enhanceParty(card) {
  if (card._ph) return;
  const faces = $$('.faces .face', card).filter((f) => !f.classList.contains('more')).slice(0, 4);
  if (faces.length < 1) return;
  card._ph = true;
  const people = faces.map((f) => ({ k: (f.textContent || '?').trim().slice(0, 1), c: f.style.getPropertyValue('--tint') || 'var(--ph-film)' }));
  const C = 2 * Math.PI * 40, seg = C / people.length, gap = people.length > 1 ? 7 : 0;
  const arcs = people.map((p, k) => `<circle cx="44" cy="44" r="40" stroke="${p.c}" stroke-dasharray="${(seg - gap).toFixed(1)} ${(C - seg + gap).toFixed(1)}" stroke-dashoffset="${(-k * seg).toFixed(1)}"/>`).join('');
  const box = deco('div', 'ph-merge', `${people.map((p) => `<span class="cell" style="--c:${p.c}">${p.k}</span>`).join('')}<span class="echo"></span>
    <span class="one"><svg viewBox="0 0 88 88">${arcs}</svg></span><span class="core"><span><b>${people.length}</b><small>${W_('Together')}</small></span></span>`);
  card.append(box);
  card.classList.add('ph-has-merge');
  watch(box, () => mergeMoment(box));
}
function mergeMoment(box) {
  const cells = $$('.cell', box), th0 = [-2.2, -0.5, 1.4, 2.6];
  moment('merge', 1000, (m) => {
    cells.forEach((c, k) => {
      m.track(c, 'transform', [...stepped(80 + k * 40, 560, 10, (p) => {
        const r = 30 * (1 - ease(p)), th = th0[k] + p * Math.PI * 1.1;
        return `translate(${(r * Math.cos(th)).toFixed(1)}px,${(r * Math.sin(th)).toFixed(1)}px) scale(${(1 - 0.35 * p).toFixed(3)})`;
      }), [561, 'scale(.65)']]);
      m.track(c, 'opacity', [[0, 1], [560, 1], [560, 0]]);
    });
    m.track($('.one', box), 'opacity', [[0, 0], [560, 0], [560, 1]]);
    m.track($('.one', box), 'transform', [[0, 'rotate(-150deg) scale(1.2)'], [560, 'rotate(-150deg) scale(1.2)'], [900, 'rotate(0deg) scale(1)']]);
    m.track($('.core', box), 'opacity', [[0, 0], [560, 0], [560, 1]]);
    m.track($('.echo', box), 'opacity', [[0, 0], [560, 0], [560, 0.9], [960, 0]]);
    m.track($('.echo', box), 'transform', [[0, 'scale(.8)'], [560, 'scale(.8)'], [960, 'scale(1.6)']]);
  });
}

/* ================= colour themes: Lilin's own set (round 2b) ================= */
// The app's presets (app.js THEMES) are re-mapped here: whatever preset applyTheme() puts on <html>, the skin swaps in
// one of these palettes (same variables, same light/dark logic), relabels the Appearance swatches and hides the
// presets that no longer exist. Every palette is checked for contrast (README.md: text 4.5:1, UI 3:1).
const PAL = {
  lilin: { name: 'Lilin', sv: 'Lilin', bg: '#15112B', surface: '#1E1939', raised: '#29234A', line: '#3D3666', text: '#F1EEFA', muted: '#B6AFCF', accent: '#A0DE59', support: '#A976C3', accentPic: '#A0DE59', supportPic: '#B89BE2', alert: '#FF9B85' },
  shallows: { name: 'Shallows', sv: 'Grund', bg: '#10141E', surface: '#171D2B', raised: '#212839', line: '#323C55', text: '#EAF0F7', muted: '#A5B0C4', accent: '#64A6AE', support: '#CBD8F6', accentPic: '#64A6AE', supportPic: '#CBD8F6', alert: '#FF9B85' },
  vesper: { name: 'Vesper', sv: 'Vesper', bg: '#160B14', surface: '#21121E', raised: '#2D1929', line: '#45273E', text: '#F6ECF1', muted: '#C4AAB8', accent: '#D2405C', support: '#D4A3CB', accentPic: '#D2405C', supportPic: '#D4A3CB', alert: '#FF9B85' },
  field: { name: 'Field', sv: 'Fält', bg: '#161710', surface: '#202218', raised: '#2B2E21', line: '#424633', text: '#F1EFE4', muted: '#B8B7A2', accent: '#CAA857', support: '#A3B49E', accentPic: '#CAA857', supportPic: '#A3B49E', alert: '#FF9B85' },
  daylight: { name: 'Daylight', sv: 'Dagsljus', bg: '#FFFFF4', surface: '#F4F0E3', raised: '#E3D4FF', line: '#CFC9B3', text: '#1B1530', muted: '#575069', accent: '#5E1DA8', support: '#466B5A', accentPic: '#B89BE2', supportPic: '#B2C084', alert: '#B42318' },
  full: { name: 'Full Contrast', sv: 'Full kontrast', bg: '#000000', surface: '#0C0C0C', raised: '#181818', line: '#4A4A4A', text: '#FFFFFF', muted: '#D9D9D9', accent: '#A0DE59', support: '#FFFFFF', accentPic: '#A0DE59', supportPic: '#FFFFFF', alert: '#FF8A8A' },
};
// app preset key -> palette (round 2g: built from ebi's palette references; retired presets fold into the nearest one)
const KEYMAP = { lilin: 'lilin', midnight: 'shallows', dusk: 'vesper', forest: 'field', bone: 'daylight', noir: 'full',
  synth: 'lilin', lagoon: 'shallows', ember: 'vesper', paper: 'daylight', daylight: 'daylight' };
const SHOWN = ['lilin', 'midnight', 'dusk', 'forest', 'bone', 'noir'];
// the app's own preset colours (bg + accent), to recognise which preset applyTheme just put on <html>
const OLD = { lilin: ['#140a14', '#fb2c16'], dusk: ['#17111f', '#a58bc9'], bone: ['#efe8e1', '#d42a14'], midnight: ['#0e1320', '#5cc8ff'],
  forest: ['#0f1a14', '#9be07a'], ember: ['#161312', '#ff7a3d'], lagoon: ['#0b1a1c', '#3ddbc4'], synth: ['#140f24', '#ff5fa2'],
  noir: ['#111111', '#e8e8e8'], paper: ['#f7f2ea', '#c2410c'], daylight: ['#f2f5fa', '#2563eb'] };
const hexL = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [hexL(a), hexL(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const palName = (id) => (/^sv\b/.test(root.lang || '') ? PAL[id].sv : PAL[id].name);
function oldKey(bg, accent) {
  bg = (bg || '').trim().toLowerCase(); accent = (accent || '').trim().toLowerCase();
  return Object.keys(OLD).find((k) => OLD[k][0] === bg && OLD[k][1] === accent) || null;
}
function paletteVars(c) {
  const light = hexL(c.bg) > 0.5;
  const darkInk = hexL(c.bg) < 0.15 ? c.bg : '#141414', lightInk = hexL(c.bg) > 0.8 ? c.bg : '#FFFFFF';
  const onAccent = ratio(darkInk, c.accent) >= ratio(lightInk, c.accent) ? darkInk : lightInk;
  return { light, vars: { '--velvet': c.bg, '--curtain': c.surface, '--seat': c.raised, '--line': c.line, '--paper': c.text, '--dust': c.muted,
    '--bulb': c.accent, '--alert': c.alert, '--bulb-dim': `${c.accent}33`, '--on-bulb': onAccent,
    '--on-bulb-bold': ratio('#FFFFFF', c.accent) >= 3 ? '#FFFFFF' : onAccent,
    // the skin's two signals: you = the accent, the film/readouts = the support colour (no third colour anywhere)
    '--ph-warn': c.support, '--ph-film': c.support, '--ph-ink-on-film': ratio('#141414', c.support) >= ratio('#FFFFFF', c.support) ? '#141414' : '#FFFFFF',
    '--ph-accent-pic': c.accentPic, '--ph-support-pic': c.supportPic } };
}
// The tab icon in the preset's colours (round 2g): the LN mark on a chamfered tile in the base, two registration
// ticks, one accent bar with a square notch. Same geometry as tools/icons.py (the app icons).
const MARK_L = 'M168 176H292V788H168Z M128 176H332V206H128Z M291 758L418 758L488 648L488 788L291 788Z M488 176H518V788H488Z M488 176L632 176L848 852L704 852Z M818 176H848V852H818Z M788 176H878V206H788Z M458 176H498V206H458Z';
const markSVG = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="${c.bg}" d="M160 0H1024V864L864 1024H0V160Z"/><path fill="none" stroke="${c.muted}" stroke-opacity=".55" stroke-width="44" d="M846 72H952V178 M72 846V952H178"/><path fill="${c.text}" d="${MARK_L}"/><rect x="128" y="836" width="300" height="52" fill="${c.accent}"/><rect x="452" y="836" width="52" height="52" fill="${c.accent}"/></svg>`;
const markURL = (c) => `data:image/svg+xml,${encodeURIComponent(markSVG(c))}`;
let favWant = null;
function setFavicon(url) {
  favWant = url;
  const link = document.getElementById('favicon');
  if (link && link.getAttribute('href') !== url) { link.setAttribute('type', 'image/svg+xml'); link.setAttribute('href', url); }
}
// app.js puts its own icon back whenever it applies a theme: put ours back right after
const favLink = document.getElementById('favicon');
if (favLink) new MutationObserver(() => { if (favWant && root.dataset.phTheme && favLink.getAttribute('href') !== favWant) setFavicon(favWant); }).observe(favLink, { attributes: true, attributeFilter: ['href'] });
let themeBusy = false;
function themeMap() {
  if (themeBusy || LAB.themes === 'off') return;
  const cs = getComputedStyle(root);
  const key = oldKey(root.style.getPropertyValue('--velvet') || cs.getPropertyValue('--velvet'), root.style.getPropertyValue('--bulb') || cs.getPropertyValue('--bulb'));
  if (!key) { // a custom theme, or already one of ours
    const mine = root.dataset.phTheme && root.style.getPropertyValue('--velvet').trim().toLowerCase() === PAL[root.dataset.phTheme].bg.toLowerCase();
    if (!mine && root.dataset.phTheme) { delete root.dataset.phTheme; for (const k of ['--ph-warn', '--ph-film', '--ph-ink-on-film', '--ph-accent-pic', '--ph-support-pic']) root.style.setProperty(k, ''); }
    return;
  }
  const id = KEYMAP[key], { light, vars } = paletteVars(PAL[id]);
  themeBusy = true;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = light ? 'light' : 'dark';
  root.dataset.scheme = light ? 'light' : 'dark';
  root.dataset.phTheme = id;
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = PAL[id].bg;
  const icon = markURL(PAL[id]);
  setFavicon(icon);
  // the next start paints these colours straight away (index.html reads lilin:theme before any script)
  try { const saved = JSON.parse(localStorage.getItem('lilin:theme') || 'null'); if (saved) { saved.vars = { ...saved.vars, ...vars }; saved.scheme = light ? 'light' : 'dark'; saved.icon = icon; localStorage.setItem('lilin:theme', JSON.stringify(saved)); } } catch { /* blocked */ }
  themeBusy = false;
}
// the Appearance picker: new names and colours on the swatches, the retired presets hidden
function relabelSwatches() {
  $$('.swatch').forEach((sw) => {
    if (sw.dataset.phOwn || $('.swatch-name', sw)?.textContent === T('Your own')) { sw.dataset.phOwn = '1'; sw.style.order = '99'; return; } // the custom one stays as it is
    const st = sw.style, key = sw.dataset.phKey || oldKey(st.getPropertyValue('--sw-bg'), st.getPropertyValue('--sw-accent'));
    if (!key) return;
    sw.dataset.phKey = key;
    if (!SHOWN.includes(key)) { sw.hidden = true; return; }
    const id = KEYMAP[key], c = PAL[id], name = palName(id);
    st.setProperty('--sw-bg', c.bg); st.setProperty('--sw-surface', c.surface); st.setProperty('--sw-text', c.text); st.setProperty('--sw-accent', c.accent); st.setProperty('--sw-muted', c.muted);
    st.setProperty('--ph-sw-support', c.support);
    const label = $('.swatch-name', sw);
    if (label && label.textContent !== name) label.textContent = name;
    if (sw.getAttribute('aria-label') !== T('{0} colours', name)) sw.setAttribute('aria-label', T('{0} colours', name));
    sw.style.order = String(SHOWN.indexOf(key));
  });
  $$('select option').forEach((o) => {
    if (!OLD[o.value]) return;
    if (!SHOWN.includes(o.value)) o.hidden = true;
    else if (o.textContent !== palName(KEYMAP[o.value])) o.textContent = palName(KEYMAP[o.value]);
  });
}

/* ================= You: a profile file, not a settings list (round 2b) ================= */
function enhanceYou() {
  $$('#view-you .you-id').forEach((id) => {
    if (!$('.pf-stats', id)) return;
    id.closest('.set-stack')?.classList.add('ph-you-hero');
    const nameEl = $('.you-id-name', id);
    if (!nameEl) return;
    const text = nameEl.textContent.trim();
    let box = $('.ph-you-name', id);
    if (!box || box.dataset.for !== text) {
      box?.remove();
      box = nameBlock(text); box.classList.add('ph-you-name');
      nameEl.after(box); nameEl.classList.add('ph-sr');
    }
    if (box._fitW !== box.clientWidth && fit(box, { max: 76, maxH: 132, min: 26, S: 0.8 })) box._fitW = box.clientWidth;
    if (!$(':scope > .ph-ring', id)) id.prepend(deco('span', 'ph-ring'));
    // the title block's micro label over the name
    if (!$('.ph-mlabel', id)) box.before(deco('span', 'ph-mlabel', sv() ? 'Profil' : 'Profile'));
    const stats = $('.pf-stats', id);
    if (stats && !stats.previousElementSibling?.classList.contains('ph-trace-line')) stats.before(deco('div', 'ph-trace-line', squiggleSvg(400, 10, 46, 3.2, 5)));
  });
}

/* ================= the player: one chrome (round 2f), it only cuts on when it appears ================= */
// The three earlier styles and their picker are gone; their saved choice is cleaned up on load.
try { localStorage.removeItem('ph:player'); } catch { /* blocked */ }
delete root.dataset.phPlayer;
const sv = () => /^sv\b/.test(root.lang || '');
// "Gilmore Girls · Season 1, Episode 1: Pilot" → micro label "S01 · E01 · PILOT" over "Gilmore Girls"
function titleBlock(text) {
  const [show, ...rest] = String(text || '').split(/\s+·\s+/);
  let ep = rest.join(' · ');
  const m = /(?:season|säsong)\s*(\d+)\D+?(?:episode|avsnitt)\s*(\d+)(?::\s*(.*))?/i.exec(ep);
  if (m) ep = [`S${pad2(m[1])}`, `E${pad2(m[2])}`, m[3]].filter(Boolean).join(' · ');
  return { show: show || text || '', ep };
}
let chromeAt = -1e9;
function enhancePlayer() {
  const p = $('#player');
  if (!p || p._ph) return;
  p._ph = true;
  const video = $('#video', p), seek = $('.seek', p), title = $('#player-title', p), bar = $('.player-bar', p);
  p.append(deco('div', 'ph-pmarks'));
  const tick = deco('span', 'ph-ptick');
  seek?.append(tick);
  const tb = deco('div', 'ph-ptitle', '<small></small><b></b>');
  if (title && bar) title.after(tb);
  const paintTitle = () => {
    const t = (title?.textContent || '').trim();
    if (tb.dataset.for === t) return;
    tb.dataset.for = t;
    const { show, ep } = titleBlock(t);
    tb.firstChild.textContent = ep; tb.lastChild.textContent = show;
    tb.firstChild.hidden = !ep;
    title?.classList.toggle('ph-titled', Boolean(t));
  };
  if (title) new MutationObserver(paintTitle).observe(title, { childList: true, characterData: true, subtree: true });
  paintTitle();
  const state = () => p.classList.toggle('ph-paused', Boolean(video?.paused));
  ['play', 'pause', 'playing', 'loadedmetadata'].forEach((e) => video?.addEventListener(e, state));
  state();
  let shown = p.classList.contains('ui-visible') && !p.hidden;
  new MutationObserver(() => {
    const v = p.classList.contains('ui-visible') && !p.hidden;
    if (v && !shown && (hold || performance.now() - chromeAt > 2000)) { chromeAt = performance.now(); chromeIn(p, tick); }
    shown = v;
  }).observe(p, { attributes: true, attributeFilter: ['class', 'hidden'] });
}
// one frame of the accent at the playhead, nothing else
function chromeIn(p, tick) {
  moment('chrome', 3 * F, (m) => { m.track(tick, 'opacity', [[0, 0], [F, 0], [F, 1], [2 * F, 1], [2 * F, 0]]); });
}

/* ================= title + synopsis: an episode-card kicker over the name (round 2b) ================= */
function ratingMeter(sheet) {
  const r = $('.facts .fact-rating', sheet);
  if (!r) return;
  const v = parseFloat(r.textContent.replace(',', '.').replace(/[^\d.]/g, ''));
  if (Number.isFinite(v)) { const w = `${Math.round(v * 10)}%`; if (r.style.getPropertyValue('--ph-r') !== w) r.style.setProperty('--ph-r', w); }
}
function titleKicker(sheet) {
  const content = $('.sheet-content', sheet), h2 = content && $('h2#sheet-title', content), facts = content && $('.facts', content);
  if (!h2 || !facts) return;
  const lis = $$(':scope > li', facts);
  const year = lis.find((li) => /^\d{4}$/.test(li.textContent.trim()));
  const kind = year && year.nextElementSibling && !/\d/.test(year.nextElementSibling.textContent) ? year.nextElementSibling : null;
  const words = [kind?.textContent.trim(), year?.textContent.trim()].filter(Boolean);
  let kick = h2.previousElementSibling?.classList.contains('ph-kick') ? h2.previousElementSibling : null;
  if (!words.length) { kick?.remove(); return; }
  if (!kick) { kick = deco('p', 'ph-kick'); h2.before(kick); }
  const want = words.join(' · ');
  if (kick.textContent !== want) kick.textContent = want;
  [year, kind].forEach((li) => li?.classList.add('ph-sr'));
}

/* ================= Live: sync panel (round 2d) ================= */
function enhanceLive() {
  const view = $('#view-live');
  if (!view || view.hidden) return;
  const n = $$('.nownext', view).length, rooms = $$('.party-card:not(.together-pick)', view).length;
  let p = $('.ph-sync', view);
  if (!n && !rooms) { p?.remove(); return; }
  if (!p) {
    p = deco('div', 'ph-sync', `<div class="tb"><small>${sv() ? 'Signal' : 'Signal'}</small><b></b><small></small></div><div class="gr"><svg viewBox="0 0 300 70" preserveAspectRatio="none"><path class="b" d="${sine(300, 150, 24, 0, 35, 5)}"/><path class="a" d="${sine(300, 150, 24, 1.3, 35, 5)}"/></svg></div>`);
    $(':scope > .view-heading', view)?.after(p);
  }
  const tools = $('#live-body > .live-tools', view);
  if (tools && tools.nextElementSibling !== p) tools.after(p); // under the channel tools, clear of the burn word
  const big = pad2(n), sub = sv() ? `${n === 1 ? 'kanal' : 'kanaler'} · ${rooms} rum` : `${n === 1 ? 'channel' : 'channels'} · ${rooms} room${rooms === 1 ? '' : 's'}`;
  if (p.querySelector('b').textContent !== big) p.querySelector('b').textContent = big;
  if (p.querySelector('.tb small:last-child').textContent !== sub) p.querySelector('.tb small:last-child').textContent = sub;
}

/* ================= shelves as panels (round 2d) ================= */
function enhanceShelves() {
  const shelves = $$('#discover-body .shelf:not(.vibes-shelf)');
  shelves.forEach((sh, i) => {
    const tag = `${pad2(i + 1)} / ${pad2(shelves.length)}`;
    if (sh.dataset.phTag !== tag) sh.dataset.phTag = tag;
    const head = $(':scope > .shelf-head', sh), n = $$('.shelf-items > li', sh).length;
    if (!head || !n) return;
    let cell = $(':scope > .ph-cell', head);
    if (!cell) { cell = deco('span', 'ph-cell', '<b></b><small></small>'); head.prepend(cell); }
    if (cell.firstChild.textContent !== pad2(i + 1)) cell.firstChild.textContent = pad2(i + 1);
    const cl = `${n} ${sv() ? (n === 1 ? 'titel' : 'titlar') : (n === 1 ? 'title' : 'titles')}`;
    if (cell.lastChild.textContent !== cl) cell.lastChild.textContent = cl;
    let cnt = $(':scope > .ph-count', head);
    if (!cnt) { cnt = deco('span', 'ph-count'); const see = $('.see-all, .carousel-controls', head); see ? see.before(cnt) : head.append(cnt); }
    const want = `${n}|${sv() ? (n === 1 ? 'titel' : 'titlar') : (n === 1 ? 'title' : 'titles')}`;
    if (cnt.dataset.v !== want) { cnt.dataset.v = want; cnt.innerHTML = `<b>${pad2(n)}</b>${want.split('|')[1]}`; }
  });
}

/* ================= the pass ================= */
function pass() {
  queued = false;
  const bb = $('#discover-body .billboard');
  if (bb && $('.bb-slide', bb)) enhanceBillboard(bb);
  $$('.skel-billboard').forEach(enhanceSkeleton);
  watchSheet();
  watchViews();
  const sheet = $('#sheet.open');
  if (sheet && !sheet.hidden) { enhanceSheet(sheet); titleKicker(sheet); ratingMeter(sheet); }
  enhanceYou();
  enhanceShelves();
  enhanceLive();
  enhancePlayer();
  relabelSwatches();
  $$('.party-card').forEach(enhanceParty);
}
let queued = false;
const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(pass); } };
const inPlayer = (node) => { const e = node.nodeType === 1 ? node : node.parentElement; return Boolean(e?.closest('#player, .player, .live-chat, .room, .ph-boot')); };
new MutationObserver((records) => {
  if (queued) return;
  for (const r of records) if (!inPlayer(r.target)) { schedule(); return; }
}).observe(D.body, { childList: true, subtree: true });
let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    fitBillboard();
    if (BB.root) { BB.rb = ribbon($('.ph-ribbon', BB.root), { lines: 8 }); placeRibbon(); }
    const sheet = $('#sheet.open'); if (sheet) { const h = $('.sheet-hero', sheet); if (h) delete h.dataset.phW; enhanceSheet(sheet); }
  }, 200);
});

/* ================= start ================= */
async function start() {
  if (sv()) root.style.setProperty('--ph-l-profile', '"PROFIL"');
  themeMap();
  themeCheck();
  if (wantBoot()) boot();
  try { await D.fonts.load('800 100px "Bricolage Grotesque"'); } catch { /* offline: fit with what we have */ }
  schedule();
  D.fonts.ready.then(() => { fitBillboard(); const s = $('#sheet.open'); if (s) enhanceSheet(s); });
}
start();

/* motion strips (design lab only): hold moments at 0, then seek them; never used by the app */
window.__phase = {
  get last() { return lastMoment && { name: lastMoment.name, dur: lastMoment.dur, ended: lastMoment.ended }; },
  hold(v = true) { hold = v; },
  seek(t) {
    for (const m of live) { m.anims.forEach((a) => { a.pause(); a.currentTime = t; }); m.ticks.forEach((f) => f(Math.min(t, m.dur), false)); }
  },
  finish: endAll,
  boot: () => boot(),
  next: () => { const b = $('.bb-bulb[aria-current="true"]', BB.root || D)?.nextElementSibling || $('.bb-bulb', BB.root || D); b?.click(); },
};
