// Lilin's own controls for a title page's YouTube trailer. The iframe is laid out as a 1080p player and
// scaled down to its box (trailer-size.js) so YouTube sends HD, which shrank YouTube's own controls to a
// tiny, fiddly bar. So the trailer runs with controls=0 and this draws a normal-sized bar on top, talking
// to the player through YouTube's iframe postMessage API (the same messages the IFrame API script sends).
import { T } from './i18n.js';

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

// The embed URL for a trailer with our controls instead of YouTube's.
export function trailerSrc(key, hint = '') {
  const q = new URLSearchParams({
    autoplay: '1', controls: '0', rel: '0', playsinline: '1', iv_load_policy: '3', disablekb: '1',
    enablejsapi: '1', origin: location.origin,
  });
  return `${YT_ORIGIN}/embed/${encodeURIComponent(key)}?${q}${hint ? `&${hint}` : ''}`;
}

export const fmtClock = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const el = (tag, cls, attrs = {}) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// box: the .trailer-frame around the iframe; icon(name) returns an <svg> from app.js. Returns a stop function.
export function trailerControls(box, frame, icon) {
  const st = { state: -1, time: 0, duration: 0, loaded: 0, muted: false, ready: false, dragging: false };
  const send = (func, args = []) => frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), YT_ORIGIN);

  const ui = el('div', 'tc');
  const hit = el('div', 'tc-hit');
  const big = el('button', 'pc-btn tc-big', { type: 'button', 'aria-label': T('Play') });
  big.append(icon('play'));
  const bar = el('div', 'tc-bar');
  const play = el('button', 'pc-btn tc-play', { type: 'button' });
  const cur = el('span', 'pc-time tc-cur'); cur.textContent = '0:00';
  const seek = el('div', 'seek tc-seek', { role: 'slider', tabindex: '0', 'aria-label': T('Seek'), 'aria-valuemin': '0' });
  const track = el('div', 'seek-track');
  const buf = el('div', 'seek-buffer'), fill = el('div', 'seek-fill');
  track.append(buf, fill);
  seek.append(track, el('div', 'seek-thumb'));
  const dur = el('span', 'pc-time pc-duration tc-dur'); dur.textContent = '0:00';
  const mute = el('button', 'pc-btn tc-mute', { type: 'button', 'aria-label': T('Mute') });
  const full = el('button', 'pc-btn tc-full', { type: 'button', 'aria-label': T('Fullscreen') });
  bar.append(play, cur, seek, dur, mute, full);
  ui.append(hit, big, bar);
  box.append(ui);
  frame.tabIndex = -1; // focus stays on Lilin's page, so Esc closes the sheet instead of going to YouTube

  const playing = () => st.state === 1 || st.state === 3;
  const render = () => {
    box.classList.toggle('is-paused', st.ready && !playing());
    play.replaceChildren(icon(playing() ? 'pause' : 'play'));
    play.setAttribute('aria-label', playing() ? T('Pause') : T('Play'));
    mute.replaceChildren(icon(st.muted ? 'muted' : 'volumeHigh'));
    mute.setAttribute('aria-pressed', String(st.muted));
    full.replaceChildren(icon(document.fullscreenElement === box ? 'fullscreenExit' : 'fullscreen'));
    const pos = st.duration ? Math.min(1, st.time / st.duration) : 0;
    seek.style.setProperty('--pos', `${pos * 100}%`);
    seek.style.setProperty('--buf', `${Math.min(1, st.loaded) * 100}%`);
    seek.setAttribute('aria-valuemax', String(Math.round(st.duration)));
    seek.setAttribute('aria-valuenow', String(Math.round(st.time)));
    seek.setAttribute('aria-valuetext', `${fmtClock(st.time)} / ${fmtClock(st.duration)}`);
    cur.textContent = fmtClock(st.time);
    dur.textContent = fmtClock(st.duration);
  };

  // Show the bar while the pointer moves over the trailer, hide it 2.5 s after it stops (never while paused).
  let idle = 0;
  const wake = () => {
    box.classList.add('tc-awake');
    clearTimeout(idle);
    idle = setTimeout(() => { if (!st.dragging && !bar.contains(document.activeElement)) box.classList.remove('tc-awake'); }, 2500);
  };
  const toggle = () => {
    if (st.state === 0) { send('seekTo', [0, true]); send('playVideo'); st.state = 1; }
    else if (playing()) { send('pauseVideo'); st.state = 2; }
    else { send('playVideo'); st.state = 1; }
    render(); wake();
  };
  const seekTo = (s) => {
    st.time = Math.max(0, Math.min(st.duration || 0, s));
    send('seekTo', [st.time, true]);
    render(); wake();
  };
  const toggleMute = () => { st.muted = !st.muted; send(st.muted ? 'mute' : 'unMute'); render(); wake(); };
  const toggleFull = () => {
    if (document.fullscreenElement === box) document.exitFullscreen?.().catch(() => {});
    else (box.requestFullscreen || box.webkitRequestFullscreen)?.call(box)?.catch?.(() => {});
    wake();
  };

  // Touch: the first tap only shows the bar, a tap while it shows plays or pauses. Mouse: a click plays or pauses.
  hit.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' && !box.classList.contains('tc-awake')) { wake(); return; }
    toggle();
  });
  hit.addEventListener('dblclick', toggleFull);
  box.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') wake(); });
  box.addEventListener('pointerleave', () => { if (!st.dragging) { clearTimeout(idle); idle = setTimeout(() => box.classList.remove('tc-awake'), 600); } });
  big.addEventListener('click', toggle);
  play.addEventListener('click', toggle);
  mute.addEventListener('click', toggleMute);
  full.addEventListener('click', toggleFull);

  const at = (e) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (st.duration || 0);
  };
  seek.addEventListener('pointerdown', (e) => {
    if (!st.duration) return;
    st.dragging = true; seek.classList.add('is-dragging'); seek.setPointerCapture(e.pointerId);
    st.time = at(e); render();
  });
  seek.addEventListener('pointermove', (e) => { if (st.dragging) { st.time = at(e); render(); wake(); } });
  const drop = (e) => {
    if (!st.dragging) return;
    st.dragging = false; seek.classList.remove('is-dragging');
    if (e.type === 'pointerup') seekTo(at(e));
  };
  seek.addEventListener('pointerup', drop);
  seek.addEventListener('pointercancel', drop);
  seek.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -10, PageUp: 10 }[e.key];
    if (step) { e.preventDefault(); seekTo(st.time + step); }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
    else if (e.key === 'End') { e.preventDefault(); seekTo(st.duration - 1); }
  });
  box.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if ((k === ' ' && e.target === seek) || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFull();
    else if (k === 'j' || (k === 'arrowleft' && e.target !== seek)) seekTo(st.time - 5);
    else if (k === 'l' || (k === 'arrowright' && e.target !== seek)) seekTo(st.time + 5);
  });
  const onFull = () => render();
  document.addEventListener('fullscreenchange', onFull);

  // YouTube's player answers once it knows we listen: initialDelivery, then infoDelivery as values change.
  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || e.origin !== YT_ORIGIN) return;
    let msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.event === 'onReady') st.ready = true;
    const info = msg.info;
    if (msg.event === 'onStateChange' && typeof info === 'number') st.state = info;
    if ((msg.event === 'infoDelivery' || msg.event === 'initialDelivery') && info && typeof info === 'object') {
      st.ready = true;
      if (typeof info.playerState === 'number') st.state = info.playerState;
      if (typeof info.currentTime === 'number' && !st.dragging) st.time = info.currentTime;
      if (typeof info.duration === 'number' && info.duration > 0) st.duration = info.duration;
      if (typeof info.videoLoadedFraction === 'number') st.loaded = info.videoLoadedFraction;
      if (typeof info.muted === 'boolean') st.muted = info.muted;
    }
    if (st.ready) { clearInterval(hello); box.classList.add('tc-ready'); }
    render();
  };
  window.addEventListener('message', onMessage);
  const listen = () => frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN);
  frame.addEventListener('load', listen);
  let tries = 0;
  const hello = setInterval(() => {
    if (++tries <= 80) { listen(); return; }
    // 20 s without an answer: give the trailer YouTube's own controls back rather than leave it uncontrollable
    clearInterval(hello);
    if (!st.ready) { ui.remove(); frame.src = frame.src.replace('controls=0', 'controls=1'); }
  }, 250);

  render(); wake();
  return () => {
    clearInterval(hello); clearTimeout(idle);
    window.removeEventListener('message', onMessage);
    document.removeEventListener('fullscreenchange', onFull);
  };
}
