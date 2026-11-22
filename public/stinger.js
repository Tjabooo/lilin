// Stay for the credits (src/stinger.js): films TMDB tags with a scene during or after the closing credits. The title
// page answer (/api/title/movie/<id>/page) says `stinger: 'during' | 'after' | 'both' | null`, and:
// - the film page shows one quiet line under the description ("Scene after the credits");
// - the pause screen shows the same line under the synopsis;
// - the credits card (credits-card.js) says "Stay: there's a scene after the credits", and puts the picture back full
//   size by itself STAY_CARD_SECONDS into the credits, so the scene isn't watched in a corner;
// - in Watch Together the room panel says it under the status, and when the credits start a banner over the picture
//   tells the room (every member's own player shows it, at the same moment, since the room plays in sync).
// A film without either keyword shows nothing at all: no keyword only means nobody tagged it, never "no scene".
import { T } from './i18n.js';

export const KINDS = ['during', 'after', 'both'];
export const kindOf = (v) => (KINDS.includes(v) ? v : null);
export const STAY_CARD_SECONDS = 20; // the credits card, then the picture full size again
export const BANNER_SECONDS = 15; // Watch Together's banner at the credits

// The film page and pause screen line.
export function sceneNote(kind) {
  if (kind === 'both') return T('Scenes during and after the credits');
  if (kind === 'during') return T('Scene during the credits');
  if (kind === 'after') return T('Scene after the credits');
  return '';
}
// The credits card and Watch Together line.
export function stayLine(kind) {
  if (kind === 'both') return T('Stay: there are scenes during and after the credits');
  if (kind === 'during') return T('Stay: there’s a scene during the credits');
  if (kind === 'after') return T('Stay: there’s a scene after the credits');
  return '';
}

// A credits start the player trusts (the same rule as Up next: in the second half, before the end).
const creditsStart = (creditsAt, duration) => Number.isFinite(creditsAt) && Number.isFinite(duration) && duration > 0
  && creditsAt > duration / 2 && creditsAt < duration;

// Watch Together's banner: from the credits start, for BANNER_SECONDS of the film.
export function bannerShowing({ kind, creditsAt, duration, time }) {
  return Boolean(kindOf(kind) && creditsStart(creditsAt, duration) && Number.isFinite(time)
    && time >= creditsAt && time < creditsAt + BANNER_SECONDS);
}
// The credits card goes back to the picture by itself, STAY_CARD_SECONDS into the credits (a film with a scene,
// nothing up next). Worked out from the time, so seeking back to the credits start shows the card again.
export function cardPutAway({ kind, next, creditsAt, time }) {
  return Boolean(kindOf(kind) && !next && Number.isFinite(creditsAt) && Number.isFinite(time) && time >= creditsAt + STAY_CARD_SECONDS);
}

// Credits lines, then a scene (the play mark).
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 10.5h8M4 15h6"/><path class="stay-play" d="M14.5 13.5v7l6-3.5z"/></svg>';
export function stayIcon(h) {
  const s = h('span', { class: 'stay-icon', 'aria-hidden': 'true' });
  s.innerHTML = ICON;
  return s;
}

// deps: h, video, stage (the picture's box: the banner sits over it), pageInfo(type, id) → Promise<page>, current() → the player's session, inParty() → in a
// Watch Together room (not a live broadcast), searchOn() → TMDB is set up, roomHead() → the room panel's header.
export function createStay({ h, video, stage, pageInfo, current, inParty = () => false, searchOn = () => true,
  roomHead = () => document.querySelector('#watch-bar .room-head') }) {
  const kindFor = (id) => (id && searchOn() ? pageInfo('movie', id).then((p) => kindOf(p?.stinger)).catch(() => null) : Promise.resolve(null));

  // The film page: a hidden line that shows once the answer says there's a scene.
  function pageNote(id) {
    const text = h('span', {});
    const el = h('p', { class: 'stay-note', hidden: true }, stayIcon(h), text);
    kindFor(id).then((kind) => {
      if (!kind) return;
      text.textContent = sceneNote(kind);
      el.hidden = false;
    });
    return el;
  }
  // The pause screen's line (pause-screen.js shows it under the synopsis), or null.
  const pauseLine = (kind) => (kindOf(kind) ? h('p', { class: 'pause-stay' }, stayIcon(h), h('span', {}, sceneNote(kind))) : null);

  // Watch Together: a line under the room's status.
  let roomLine = null;
  function room() {
    const s = current();
    const kind = inParty() ? kindOf(s?.stinger) : null;
    if (!kind && !roomLine) return;
    if (!roomLine) {
      const head = roomHead();
      if (!head) return;
      roomLine = h('p', { class: 'room-stay', hidden: true }, stayIcon(h), h('span', {}));
      head.append(roomLine);
    }
    if (kind) roomLine.lastChild.textContent = stayLine(kind);
    roomLine.hidden = !kind;
  }

  // Watch Together: the banner over the picture when the credits start.
  const banner = h('p', { class: 'stay-banner', role: 'status', hidden: true }, stayIcon(h), h('span', {}));
  stage.append(banner);
  function update() {
    const s = current();
    const on = Boolean(s && inParty() && bannerShowing({ kind: s.stinger, creditsAt: s.creditsAt, duration: video.duration, time: video.currentTime }));
    if (on && banner.lastChild.textContent !== stayLine(s.stinger)) banner.lastChild.textContent = stayLine(s.stinger);
    if (banner.hidden !== !on) banner.hidden = !on;
  }
  for (const event of ['timeupdate', 'seeked', 'emptied', 'durationchange']) video.addEventListener(event, update);

  // A film in the player: asked once and kept on the session (session.stinger); onKnown redraws the credits card.
  function load(session, onKnown = () => {}) {
    update(); room();
    if (!session || session.live || !['lib', 'part'].includes(session.kind) || session.show != null || session.season != null || !session.tmdbId) return;
    kindFor(session.tmdbId).then((kind) => {
      if (!kind || current() !== session) return;
      session.stinger = kind;
      room(); update(); onKnown();
    });
  }

  return { pageNote, pauseLine, load, room, update };
}
