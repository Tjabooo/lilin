// The credits card. When the closing credits start (the same moment Up next does: an ending chapter, or the
// credits music found by comparing episodes), the picture shrinks into a corner and a card takes the screen: the
// song from the title's soundtrack (More details' MusicBrainz data, src/details.js) and Up next, moved in from its
// usual spot. "Back to the picture", a click on the small picture or Keep watching puts it back.
//
// Which song: there are no per-scene timestamps anywhere free, so it's a best guess and the card says how sure it is.
// A track named for the end credits ("End Credits", "Ending Theme", "Outro") → "Over the credits"; a show's theme
// (it usually plays out the episode) → "Theme"; otherwise the last track of the soundtrack → "From the soundtrack".
import { T } from './i18n.js';
import { SERVICES, songQuery } from './details.js';

const CREDITS_RE = /\b(?:end(?:ing)?|closing|final)\s*(?:credits?|titles?|theme|song)\b|\bend\s*credit|\boutro\b|^ed\b|\bED\s*\d*$/i;
const THEME_RE = /\b(?:main\s*(?:title|theme)s?|opening\s*(?:theme|titles?|credits)|theme\s*(?:song|from)|title\s*(?:theme|song))\b|\btheme$|^theme\b/i;

// { track, album, why: 'credits' | 'theme' | 'soundtrack' } or null. albums as /api/title/.../details sends them.
export function creditsSong(albums, { type = 'movie' } = {}) {
  const list = (albums || []).filter((a) => a?.tracks?.length);
  if (!list.length) return null;
  const find = (re) => {
    for (const album of list) {
      // the last match: "End Credits" beats an earlier "End Titles (Reprise)"… unless it's a reprise
      const hits = album.tracks.filter((t) => re.test(t.title || ''));
      const track = hits.find((t) => !/reprise|instrumental|karaoke/i.test(t.title)) || hits[0];
      if (track) return { track, album };
    }
    return null;
  };
  const credits = find(CREDITS_RE);
  if (credits) return { ...credits, why: 'credits' };
  if (type === 'tv') {
    const theme = find(THEME_RE);
    if (theme) return { ...theme, why: 'theme' };
  }
  const album = list[0];
  return { track: album.tracks[album.tracks.length - 1], album, why: 'soundtrack' };
}

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

// deps: h, api, playerEl, stage, video, upNextEl, gapBelow() (px the controls need at the bottom), onChange()
export function createCreditsCard({ h, api, playerEl, stage, video, upNextEl, gapBelow = () => 96, onChange = () => {} }) {
  const svg = (markup, cls) => { const s = h('span', { class: cls, 'aria-hidden': 'true' }); s.innerHTML = markup; return s; };
  const why = h('p', { class: 'crd-why' });
  const track = h('p', { class: 'crd-track' });
  const by = h('p', { class: 'crd-by' });
  const find = h('a', { class: 'crd-find', target: '_blank', rel: 'noopener noreferrer' });
  const song = h('div', { class: 'crd-song', hidden: true }, svg(NOTE, 'crd-note'), h('div', { class: 'crd-song-text' }, why, track, by), find);
  const name = h('p', { class: 'crd-name' });
  const slot = h('div', { class: 'crd-next' });
  const back = h('button', { type: 'button', class: 'crd-back' }, T('Back to the picture'));
  const card = h('aside', { class: 'credits-card', 'aria-label': T('End credits'), hidden: true },
    h('p', { class: 'crd-kicker' }, T('End credits')), name, song, slot, back);
  playerEl.append(card);
  const home = { parent: upNextEl.parentNode, next: upNextEl.nextSibling };

  let session = null, on = false, fit = null;
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
    slot.append(upNextEl);
    playerEl.classList.add('is-credits', 'credits-moving');
    place();
    onChange(true);
  }
  function leave() {
    if (!on) return;
    on = false;
    card.hidden = true;
    home.parent.insertBefore(upNextEl, home.next && home.next.parentNode === home.parent ? home.next : null);
    playerEl.classList.remove('is-credits');
    video.style.transform = ''; video.style.clipPath = ''; video.style.transformOrigin = '';
    clearTimeout(leave.timer);
    leave.timer = setTimeout(() => { if (!on) playerEl.classList.remove('credits-moving'); }, 800);
    onChange(false);
  }

  // Called with Up next's state. rolling: the credits are playing (or the file ended right after them).
  // next: whether Up next is showing. ref: { type, id } of the title (TMDB) or null; title: its name.
  function sync(s, { rolling, next, ref, title }) {
    if (s !== session) { session = s; song.hidden = true; delete song.dataset.ref; if (on) leave(); }
    if (!s || !rolling || s.creditsDismissed) { leave(); return; }
    name.textContent = title || '';
    const key = ref ? `${ref.type}/${ref.id}` : null;
    if (key && song.dataset.ref !== key && !s.creditsSongAsked) {
      s.creditsSongAsked = true;
      songFor(ref).then((music) => {
        if (session !== s) return;
        s.creditsSong = creditsSong(music?.albums, { type: ref.type });
        paintSong(s.creditsSong, ref);
        sync(s, { rolling: s.creditsRolling, next: s.creditsNext, ref, title });
      });
    }
    s.creditsRolling = rolling; s.creditsNext = next;
    const worth = next || Boolean(s.creditsSong);
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
