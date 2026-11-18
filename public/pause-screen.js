// The pause screen: paused for a few seconds, the picture dims a little and the title's logo (the same art as the
// Getting it ready screen), the episode and a short synopsis fade in at the bottom left. Any input clears it, and it
// comes back after the same wait if the video is still paused.
const REST_AFTER_MS = 3000;

export function createPauseScreen({ h, playerEl, stage, video, canRest, info, onRest }) {
  const card = h('div', { class: 'pause-card', 'aria-hidden': 'true' });
  stage.append(card);
  let timer = null, resting = false, filledFor = null, gen = 0, session = null;

  const clip = (text, max = 240) => {
    const t = String(text || '').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, cut.lastIndexOf(' ')))}…`;
  };

  async function fill(session) {
    if (filledFor === session) return;
    filledFor = session;
    const run = ++gen;
    card.replaceChildren();
    const d = await info(session).catch(() => null);
    if (run !== gen || !d) return;
    const logo = d.logo
      ? h('img', { class: `pause-logo${d.logo.dark ? ' is-dark' : ''}`, src: d.logo.url, alt: '', decoding: 'async' })
      : h('p', { class: 'pause-name' }, d.name);
    card.replaceChildren(
      h('p', { class: 'pause-kicker' }, d.kicker),
      logo,
      d.episode && h('p', { class: 'pause-episode' }, d.episode),
      d.synopsis && h('p', { class: 'pause-synopsis' }, clip(d.synopsis)));
  }

  function rest() {
    timer = null;
    if (!session || !video.paused || !canRest()) return;
    resting = true;
    playerEl.classList.add('is-resting');
    onRest(true);
  }
  function wake() {
    clearTimeout(timer);
    timer = null;
    if (resting) {
      resting = false;
      playerEl.classList.remove('is-resting');
      onRest(false);
    }
  }
  function arm() {
    wake();
    if (playerEl.hidden || !video.paused || video.ended) return;
    if (session) fill(session);
    timer = setTimeout(rest, REST_AFTER_MS);
  }

  video.addEventListener('pause', arm);
  for (const event of ['play', 'playing', 'emptied', 'ended', 'seeking']) video.addEventListener(event, wake);
  video.addEventListener('seeked', () => { if (video.paused) arm(); });
  // Any input clears it (and, still paused, starts the wait again).
  const nudge = () => { if (resting || timer) arm(); };
  for (const event of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) playerEl.addEventListener(event, nudge, { passive: true, capture: true });
  document.addEventListener('keydown', () => { if (!playerEl.hidden) nudge(); }, true);

  return {
    // A new video in the player: its details are fetched once, when it's first paused.
    load(next) { wake(); session = next || null; filledFor = null; gen++; card.replaceChildren(); },
    wake,
    get resting() { return resting; },
  };
}
