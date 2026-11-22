// The credits card. When the closing credits start (the same moment Up next does: an ending chapter, or the
// credits music found by comparing episodes), the picture shrinks into a corner and a card takes the screen: the
// song from the title's soundtrack (More details' MusicBrainz data, src/details.js) and Up next, moved in from its
// usual spot. "Back to the picture", a click on the small picture or Keep watching puts it back.
// Behind it all, like a streaming service's post-play screen: the title's best big backdrop (textless, 1440p+,
// picked on the server) full-bleed and darkened toward the card, the show's logo in place of its name, and the
// next episode's synopsis, runtime and air date under Up next.
//
// Which song: there are no per-scene timestamps anywhere free, so it's a best guess and the card says how sure it is.
// A track named for the end credits ("End Credits", "Ending Theme", "Outro") → "Over the credits"; a show's theme
// (it usually plays out the episode) → "Theme"; otherwise the last track of the soundtrack → "From the soundtrack".
import { T } from './i18n.js';
import { SERVICES, songQuery } from './details.js';
import { creditsSong } from './credits-song.js';
import { stayLine, stayIcon, cardPutAway } from './stinger.js'; // stinger: "Stay: there's a scene after the credits"

export { creditsSong };

// Where the picture goes. The <video> box fills the stage and letterboxes the picture inside it, so the transform
// is worked out for the picture itself: scaled to `width` and moved to the corner, the black bars clipped off.
// W/H: the stage, vw/vh: the video's own size. Returns a transform-origin-0 transform and a clip-path inset.
export function cornerFit({ W, H, vw, vh, width, right = 24, bottom = 96, top = null }) {
  if (!(W > 0 && H > 0)) return null;
  const aspect = vw > 0 && vh > 0 ? vw / vh : 16 / 9;
  const picW = Math.min(W, H * aspect), picH = picW / aspect; // the picture as object-fit: contain shows it
  const px = (W - picW) / 2, py = (H - picH) / 2;
  const s = Math.min(1, width / picW);
  const tw = picW * s, th = picH * s;
  const x = W - right - tw;
  const y = top != null ? top : H - bottom - th;
  return { s, tx: x - px * s, ty: y - py * s, clip: { top: py, right: W - px - picW, bottom: H - py - picH, left: px }, rect: { x, y, w: tw, h: th } };
}

const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const OUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } } };

// deps: h, api, playerEl, stage, video, upNextEl, gapBelow() (px the controls need at the bottom), onChange(),
// look(ref) → Promise<{ backdrop, logo: { url, dark } } | null>, episode(next) → Promise<{ overview, runtime, airDate } | null>,
// fmtRuntime(min), fmtDay(date)
export function createCreditsCard({ h, api, playerEl, stage, video, upNextEl, gapBelow = () => 96, onChange = () => {},
  look = async () => null, episode = async () => null, fmtRuntime = (m) => `${m} min`, fmtDay = (d) => d.toDateString() }) {
  const svg = (markup, cls) => { const s = h('span', { class: cls, 'aria-hidden': 'true' }); s.innerHTML = markup; return s; };
  const why = h('p', { class: 'crd-why' });
  const track = h('p', { class: 'crd-track' });
  const by = h('p', { class: 'crd-by' });
  const find = h('a', { class: 'crd-find', target: '_blank', rel: 'noopener noreferrer' });
  const song = h('div', { class: 'crd-song', hidden: true }, svg(NOTE, 'crd-note'), h('div', { class: 'crd-song-text' }, why, track, by), find);
  const name = h('p', { class: 'crd-name' });
  const stayText = h('span', {});
  const stay = h('p', { class: 'crd-stay', hidden: true }, stayIcon(h), stayText); // stinger
  const logo = h('img', { class: 'crd-logo', alt: '', decoding: 'async', hidden: true });
  const bgImg = h('img', { alt: '', decoding: 'async' });
  const bg = h('div', { class: 'crd-bg', 'aria-hidden': 'true' }, bgImg);
  const epMeta = h('p', { class: 'crd-ep-meta' });
  const epText = h('p', { class: 'crd-ep-text' });
  const epInfo = h('div', { class: 'crd-ep', hidden: true }, epMeta, epText);
  const slot = h('div', { class: 'crd-next' });
  const back = h('button', { type: 'button', class: 'crd-back' }, T('Back to the picture'));
  const card = h('aside', { class: 'credits-card', 'aria-label': T('End credits'), hidden: true },
    h('p', { class: 'crd-kicker' }, T('End credits')), logo, name, stay, song, slot, back);
  playerEl.append(card);
  stage.prepend(bg);
  // The synopsis sits inside Up next, between its title and buttons; CSS shows it only while Up next is in the card.
  upNextEl.querySelector('.up-next-actions')?.before(epInfo);
  bgImg.addEventListener('load', () => bg.classList.add('is-loaded'));
  bgImg.addEventListener('error', () => { bg.classList.remove('is-loaded'); bgImg.removeAttribute('src'); });
  logo.addEventListener('load', () => { logo.hidden = false; name.hidden = true; });
  logo.addEventListener('error', () => { logo.hidden = true; name.hidden = false; logo.removeAttribute('src'); });
  const home = { parent: upNextEl.parentNode, next: upNextEl.nextSibling };

  let session = null, on = false, fit = null, lookKey = null, epKey = null;
  const songs = new Map(); // 'tv/1396' -> Promise<{ albums } | null>

  function songFor(ref) {
    const key = `${ref.type}/${ref.id}`;
    if (!songs.has(key)) {
      const ask = (tries) => api(`/api/title/${key}/details`).then((d) => {
        const det = d.details || d;
        if (det.musicPending && tries > 0) return new Promise((r) => setTimeout(r, 4000)).then(() => ask(tries - 1));
        return det.music || null;
      });
      songs.set(key, ask(3).catch(() => { songs.delete(key); return null; }));
    }
    return songs.get(key);
  }

  function paintSong(s, ref) {
    if (!s) { song.hidden = true; return; }
    why.textContent = s.why === 'credits' ? T('Over the credits') : s.why === 'theme' ? T('The show’s theme') : T('From the soundtrack');
    track.textContent = s.track.title;
    const artist = s.track.artist || (/^various artists$/i.test(s.album.artist || '') ? '' : s.album.artist);
    by.textContent = [artist, s.album.title].filter(Boolean).join(' · ');
    const service = SERVICES[store.get('lilin:song-service')] || SERVICES.spotify;
    find.href = service.url(songQuery(s.track, s.album));
    find.replaceChildren(document.createTextNode(service.name), svg(OUT, 'crd-out'));
    find.title = T('Find “{0}” on {1}', s.track.title, service.name);
    song.hidden = false;
    song.dataset.ref = `${ref.type}/${ref.id}`;
  }

  // The backdrop and logo for this title (once per title; the image fades in when it has loaded).
  function paintLook(ref) {
    const key = ref ? `${ref.type}/${ref.id}` : null;
    if (key === lookKey) return;
    lookKey = key;
    bg.classList.remove('is-loaded'); bgImg.removeAttribute('src');
    logo.hidden = true; name.hidden = false; logo.removeAttribute('src');
    if (!ref) return;
    look(ref).then((l) => {
      if (lookKey !== key || !l) return;
      if (l.backdrop) bgImg.src = l.backdrop;
      if (l.logo?.url) { logo.classList.toggle('is-dark', Boolean(l.logo.dark)); logo.src = l.logo.url; }
    }).catch(() => {});
  }

  // The next episode's synopsis and facts (TMDB's season data).
  function paintEpisode(next) {
    const key = next ? next.id : null;
    if (key === epKey) return;
    epKey = key;
    epInfo.hidden = true;
    if (!next) return;
    episode(next).then((e) => {
      if (epKey !== key || !e) return;
      const date = e.airDate && new Date(`${e.airDate}T12:00:00`);
      const day = date && !Number.isNaN(+date) ? fmtDay(date) : '';
      epMeta.textContent = [e.runtime && fmtRuntime(e.runtime), day].filter(Boolean).join(' · ');
      epText.textContent = e.overview || '';
      epInfo.hidden = !(epMeta.textContent || epText.textContent);
      if (on) onChange(true);
    }).catch(() => {});
  }

  // The picture's corner spot, from the stage's current size.
  function place() {
    if (!on) return;
    const r = stage.getBoundingClientRect();
    const narrow = r.width < 700;
    const width = narrow ? Math.max(150, r.width * 0.46) : Math.min(560, Math.max(260, r.width * 0.34));
    fit = cornerFit({ W: r.width, H: r.height, vw: video.videoWidth, vh: video.videoHeight, width,
      right: narrow ? 14 : Math.max(24, r.width * 0.035), bottom: gapBelow() + 12, top: narrow ? 64 : null });
    if (!fit) return;
    const radius = 14 / fit.s;
    video.style.transformOrigin = '0 0';
    video.style.transform = `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.s})`;
    video.style.clipPath = `inset(${fit.clip.top}px ${fit.clip.right}px ${fit.clip.bottom}px ${fit.clip.left}px round ${radius}px)`;
    playerEl.style.setProperty('--crd-pic-top', `${fit.rect.y + fit.rect.h}px`);
  }

  function enter() {
    on = true;
    card.hidden = false;
    bg.classList.add('is-on');
    slot.append(upNextEl);
    playerEl.classList.add('is-credits', 'credits-moving');
    place();
    onChange(true);
  }
  function leave() {
    if (!on) return;
    on = false;
    card.hidden = true;
    bg.classList.remove('is-on');
    home.parent.insertBefore(upNextEl, home.next && home.next.parentNode === home.parent ? home.next : null);
    playerEl.classList.remove('is-credits');
    video.style.transform = ''; video.style.clipPath = ''; video.style.transformOrigin = '';
    clearTimeout(leave.timer);
    leave.timer = setTimeout(() => { if (!on) playerEl.classList.remove('credits-moving'); }, 800);
    onChange(false);
  }

  // Called with Up next's state. rolling: the credits are playing (or the file ended right after them).
  // next: whether Up next is showing; nextEp: the episode it offers. ref: { type, id } of the title (TMDB) or null;
  // title: its name. stinger: 'during' | 'after' | 'both' | null, a scene in or after the credits (stinger.js).
  function sync(s, { rolling, next, nextEp, ref, title, stinger = null }) {
    if (s !== session) { session = s; song.hidden = true; delete song.dataset.ref; if (on) leave(); }
    if (!s || !rolling || s.creditsDismissed) { leave(); return; }
    // stinger: the picture comes back full size by itself, so the scene isn't watched in the corner.
    if (cardPutAway({ kind: stinger, next, creditsAt: s.creditsAt, time: video.currentTime })) { leave(); return; }
    stayText.textContent = stayLine(stinger);
    stay.hidden = !stinger;
    name.textContent = title || '';
    logo.alt = title || '';
    paintLook(ref);
    paintEpisode(next ? nextEp : null);
    const key = ref ? `${ref.type}/${ref.id}` : null;
    if (key && song.dataset.ref !== key && !s.creditsSongAsked) {
      s.creditsSongAsked = true;
      songFor(ref).then((music) => {
        if (session !== s) return;
        s.creditsSong = creditsSong(music?.albums, { type: ref.type });
        paintSong(s.creditsSong, ref);
        sync(s, { rolling: s.creditsRolling, next: s.creditsNext, nextEp: s.creditsNextEp, ref, title, stinger: s.creditsStinger });
      });
    }
    s.creditsRolling = rolling; s.creditsNext = next; s.creditsNextEp = nextEp; s.creditsStinger = stinger;
    const worth = next || Boolean(s.creditsSong) || Boolean(stinger);
    if (!worth) { leave(); return; }
    back.hidden = false;
    if (!on) enter();
  }

  function dismiss() {
    if (session) session.creditsDismissed = true;
    leave();
  }
  back.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  // A click on the small picture brings it back too (and doesn't pause it).
  stage.addEventListener('click', (e) => {
    if (!on || !fit) return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x >= fit.rect.x && x <= fit.rect.x + fit.rect.w && y >= fit.rect.y && y <= fit.rect.y + fit.rect.h) {
      e.stopImmediatePropagation();
      dismiss();
    }
  }, true);
  new ResizeObserver(() => place()).observe(stage);
  video.addEventListener('loadedmetadata', () => place());

  return { sync, leave, dismiss, active: () => on };
}
