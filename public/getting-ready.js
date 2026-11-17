// Getting it ready: Play on a title that isn't playable here yet. The player opens at once on a calm screen (the
// title's picture, one line of plain words, a thin progress line, Cancel) while the server finds a copy and
// fetches the start of the video (cold-start.js and partial-stream.js there); the picture takes over by itself.
// readyWords() is pure (tests/getting-ready.test.mjs); createGettingReady() draws the screen inside the player.
// No looping animation: the line moves when the words do (a timer nudges it twice a second while it waits).
import { T } from './i18n.js';

// "30 s", "2 min": rounded so the number doesn't flicker between polls.
export function aboutTime(seconds) {
  if (seconds < 55) return T('{0} s', Math.max(5, Math.ceil(seconds / 5) * 5));
  return T('{0} min', Math.max(1, Math.round(seconds / 60)));
}

// phase: 'finding' (Lilin looks for a copy), 'connecting' (a copy is picked; its file list is on the way),
// 'starting' (the start of the video is downloading: startProgress 0-1, startEta in seconds or null),
// 'opening' (the stream is ready; the first frame is a moment away), 'whole' (SVT Play: the whole video has to
// arrive first; startProgress is how much has), 'failed' (message: what went wrong).
// phaseElapsed: seconds in this phase; elapsed: seconds since Play. Returns { line, hint, progress } (progress 0-1).
export function readyWords({ phase, elapsed = 0, phaseElapsed = elapsed, startProgress = null, startEta = null, message = '' }) {
  const ease = (from, to, secs) => from + (to - from) * (1 - Math.exp(-Math.max(0, phaseElapsed) / secs));
  const slow = elapsed > 150;
  const hint = slow ? T('This one is taking longer than usual. Lilin keeps trying.') : T('Usually ready in under a minute.');
  if (phase === 'failed') {
    return { line: message || T('Lilin couldn’t find a copy that plays well.'), hint: T('Try again in a little while, or pick something else.'), progress: 0 };
  }
  if (phase === 'finding') return { line: T('Finding the best copy…'), hint, progress: ease(0.04, 0.3, 12) };
  if (phase === 'connecting') return { line: T('Connecting to it…'), hint, progress: ease(0.3, 0.5, 15) };
  if (phase === 'whole') { // SVT Play: it plays once the whole video is here (progress 0-1)
    const p = Number.isFinite(startProgress) ? Math.max(0, Math.min(1, startProgress)) : 0;
    return { line: T('Fetching it from SVT Play…'), hint: T('It plays as soon as the whole video is here.'), progress: Math.max(0.1 + 0.85 * p, ease(0.04, 0.2, 20)) };
  }
  if (phase === 'starting') {
    const p = Number.isFinite(startProgress) ? Math.max(0, Math.min(1, startProgress)) : 0;
    const line = !Number.isFinite(startEta) || startEta === null ? T('Fetching the start of the video…')
      : startEta <= 5 ? T('Almost there…') : T('Starting in about {0}', aboutTime(startEta));
    return { line, hint: slow ? hint : '', progress: Math.max(0.5 + 0.45 * p, ease(0.5, 0.7, 40)) };
  }
  return { line: T('Starting…'), hint: '', progress: 0.97 };
}

// ui: { h, icon, mount (the player element), onBack(), onCancel(), onRetry() }
export function createGettingReady(ui) {
  const { h, icon } = ui;
  let root = null, parts = null, run = null, timer = 0;

  function build() {
    parts = {
      art: h('img', { class: 'gr-art', alt: '', decoding: 'async' }),
      title: h('h2', { class: 'gr-title', id: 'gr-title' }),
      sub: h('p', { class: 'gr-sub' }),
      bar: h('i'),
      line: h('p', { class: 'gr-line', role: 'status', 'aria-live': 'polite' }),
      hint: h('p', { class: 'gr-hint' }),
      cancel: h('button', { type: 'button', class: 'gr-cancel', onclick: () => ui.onCancel() }, T('Cancel')),
      retry: h('button', { type: 'button', class: 'play-btn gr-retry', hidden: true, onclick: () => ui.onRetry() }, T('Try again')),
    };
    parts.track = h('div', { class: 'gr-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-labelledby': 'gr-title' }, parts.bar);
    root = h('section', { class: 'getting-ready', id: 'getting-ready', 'aria-labelledby': 'gr-title', hidden: true },
      parts.art,
      h('button', { type: 'button', class: 'icon-btn gr-back', 'aria-label': T('Back'), onclick: () => ui.onBack() }, icon('back')),
      h('div', { class: 'gr-copy' },
        h('p', { class: 'gr-kicker' }, T('Getting it ready')),
        parts.title, parts.sub, parts.track, parts.line, parts.hint,
        h('div', { class: 'gr-actions' }, parts.retry, parts.cancel)));
    ui.mount.append(root);
  }

  function paint() {
    if (!run) return;
    const now = Date.now();
    const words = readyWords({ ...run.words, elapsed: (now - run.since) / 1000, phaseElapsed: (now - run.phaseSince) / 1000 });
    run.progress = run.words.phase === 'failed' ? 0 : Math.max(run.progress, words.progress);
    const pct = Math.round(run.progress * 100);
    parts.bar.style.width = `${pct}%`;
    parts.track.setAttribute('aria-valuenow', String(pct));
    if (parts.line.textContent !== words.line) parts.line.textContent = words.line;
    if (parts.hint.textContent !== words.hint) parts.hint.textContent = words.hint;
    parts.hint.hidden = !words.hint;
    const failed = run.words.phase === 'failed';
    root.classList.toggle('is-failed', failed);
    parts.retry.hidden = !failed || !run.canRetry;
    parts.cancel.textContent = failed ? T('Close') : T('Cancel');
  }

  return {
    // { title, sub, art }: shows the screen over the player, starting at "Finding the best copy…".
    show({ title, sub = '', art = null }) {
      if (!root) build();
      run = { since: Date.now(), phaseSince: Date.now(), words: { phase: 'finding' }, progress: 0, canRetry: false };
      parts.title.textContent = title || '';
      parts.sub.textContent = sub;
      parts.sub.hidden = !sub;
      if (art) parts.art.src = art; else parts.art.removeAttribute('src');
      parts.art.hidden = !art;
      root.classList.remove('is-leaving', 'is-failed');
      root.hidden = false;
      clearInterval(timer);
      timer = setInterval(paint, 500);
      paint();
      parts.cancel.focus({ preventScroll: true });
    },
    // { phase, startProgress, startEta, message, canRetry }
    update(words) {
      if (!run) return;
      if (words.phase !== run.words.phase) run.phaseSince = Date.now();
      if (words.phase !== 'failed' && run.words.phase === 'failed') run.progress = 0;
      run.words = words;
      run.canRetry = Boolean(words.canRetry);
      paint();
    },
    // The picture is moving: fade out (style.css), then gone.
    hide(now = false) {
      clearInterval(timer);
      if (!run) return;
      run = null;
      if (now || !root) { if (root) root.hidden = true; return; }
      parts.bar.style.width = '100%';
      root.classList.add('is-leaving');
      setTimeout(() => { if (!run) root.hidden = true; }, 450);
    },
    active: () => Boolean(run),
    phase: () => run?.words.phase || null,
  };
}
