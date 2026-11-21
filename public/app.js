// Lilin web client. Plain ES modules, no build step.
import { T, lang, langTag, locale, LANGUAGES, saveLanguage, translatePage } from './i18n.js';
import { WatchSession, offsetCues } from './watch-sync.js';
import { createNotesView } from './notes-view.js';
import { createLiveView, channelName, clock as liveClock, programmeLine } from './live.js';
import { createLiveChat, liveWatchers } from './live-chat.js'; // livechat
import { nextLibraryEpisode, isNextEpisodeTime, nextEpisodePromptAt, AUTOPLAY_SECONDS, AUTOPLAY_CHAIN, tvIntroShowing, tvNextShowing, tvFinished } from './player-next.js';
import { audioChoices, audioLanguage, nativeAudioMapping, sameAudio } from './player-audio.js';
import { createSeekPreview } from './seek-preview.js';
import { measureSpeed, speedWithin, slowForUhd, versionForSpeed, streamFor } from './connection.js';
import * as pushDevice from './notifications.js';
import { createStreamStats } from './player-stats.js';
import { playPartial, loadHls, fmtEta as fmtWait } from './player-partial.js';
import { SUB_SIZES, SUB_BACKGROUNDS, SUB_POSITIONS, subLook, subRaise, secondChoices, createNightAudio,
  SLEEP_MINUTES, sleepTimer, sleepSecondsLeft, sleepFade, sleepLabel } from './player-comfort.js';
import { comingUp, watchStatus, todayIso } from './watchlist.js';
import { createRightNow } from './right-now.js';
import { travelTitle, sizeWords, stateWords, travelSummary, travelOrder } from './travel.js';
import { libraryUnion, transferState, transferAttention, transferPaused, packScope } from './library-downloads.js';
import { createSocial, titleKeyOf, REACTIONS, countdownText, startLabel, namesText, fmtHours } from './social.js';
import { createReviews } from './reviews.js'; // reviews: stars + written reviews
import { rateHooks } from './social.js'; // reviews: the Review button beside the thumbs
import { createDocumentaries } from './documentaries.js';
import { createVibes, genreForMood } from './vibes.js'; // vibes: Discover's Moods row and pages
import { createPeople } from './people.js';
import { createFriends } from './friends.js'; // friends
import { createProfiles } from './profiles.js'; // profiles: everyone's own page
import { createLists } from './lists.js'; // lists: shelves on profiles, with their own links
import { createMoments } from './moments.js'; // friends: Moments
import { createGhosts } from './ghosts.js'; // ghost reactions: emoji left at a moment for friends who watch later
import { createMatch } from './match.js'; // pick: Pick together (swipe to match)
import { createInvite } from './invite.js'; // one Invite sheet: Lilin, Friend, Room, Pick, Moment
import { createBillboard } from './billboard.js';
import { fitTrailer, HD_HINT } from './trailer-size.js';
import { trailerSrc, trailerControls } from './trailer-controls.js';
import { createPeek } from './peek.js';
import { createComingSoon as createComingSoonView } from './coming-soon.js'; // comingsoon
import { createScout, scoutWaiting } from './scout.js'; // scout: the idea scout's cards in the owner's inbox
import { createTitleDetails } from './details.js'; // details: More details at the bottom of title pages
import { createThemeMusic, themeUrl } from './theme-music.js'; // theme: theme music on show pages
import { ROUTES, allowedRoute, tabsFor, pagesOf, resolve, linkRoute, startRoute } from './routes.js'; // the shell: tabs, addresses, Back
import { createSearch } from './search.js'; // search: titles + Go to (places.js)
import { titleModel } from './title-model.js'; // the one title page: its state, gold button, chips and ⋯ menu
import { createCreditsCard } from './credits-card.js'; // the credits card: picture in the corner, song + Up next
import { createDaypart } from './daypart.js'; // Discover by time of day: morning + late-night rows and look
import { createChannelStatic, STATIC_MIN_MS } from './channel-static.js'; // Live TV: grain + corner number on a channel switch
import { createPauseScreen } from './pause-screen.js'; // the pause screen: logo + synopsis after a few seconds paused
import { createGettingReady } from './getting-ready.js';
import { createNotices } from './notices.js'; // owner popups: shown once on the next open, OK to carry on // play first: the player's Getting it ready screen

translatePage();
saveLanguage(lang);
const $ = (sel, el = document) => el.querySelector(sel);

// DOM builder. Text is always inserted as text, never parsed as HTML.
// The DOM's own append/replaceChildren/... drop false, null and undefined like h() does, so the
// `cond && node` pattern can't print "false" on screen (Browse sheet, delete dialog).
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const name of ['append', 'prepend', 'replaceChildren', 'before', 'after', 'replaceWith']) {
    const native = proto[name];
    if (typeof native !== 'function') continue;
    proto[name] = function (...nodes) { return native.apply(this, nodes.filter((n) => n != null && n !== false)); };
  }
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const ICONS = {
  airplay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1"/><path d="M12 14l5 6H7z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>',
  skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7zM14 5l8 7-8 7z"/></svg>',
  tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16l-6.2 7.3V19l-3.6 1.6v-7.8z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M10 4h4M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v6M14 11v6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  upgrade: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M12 6.5v7M9.2 10.8l2.8 2.8 2.8-2.8M10.5 18h3"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg>',
  volumeHigh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  back10: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M6.5 3v3.9h3.9"/><text x="12.2" y="15.2" text-anchor="middle">10</text></svg>',
  fwd10: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M17.5 3v3.9h-3.9"/><text x="11.8" y="15.2" text-anchor="middle">10</text></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  fullscreenExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  party: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 15.2A4.3 4.3 0 0 1 21 18.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.2"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 3 8l5 4 4-6 4 6 5-4-1 9.5z"/></svg>',
  pip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect class="fill" x="12" y="11.5" width="6.5" height="5" rx="1"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M6 12.5v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  // profiles
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>',
  friends: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.6 14.7c1.6.7 2.6 2.4 2.9 4.8"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  rewatch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12A7.5 7.5 0 0 1 17.7 7.1"/><path d="M18 3v4.5h-4.5M6 21v-4.5h4.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  // play first: the quiet mark on titles that play at once (they're on the server)
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h6M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01M18 15v5M15.5 17.5h5"/></svg>',
  smile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9.2 9.6h.01M14.8 9.6h.01"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M13.2 2.8 5.6 13.1h5.6l-1 8.1 7.7-10.4h-5.6z"/></svg>',
};
const icon = (name) => { const s = h('span'); s.innerHTML = ICONS[name]; return s.firstChild; };

// A random ID for this browser, so each phone sees its own TV remotes.
const CLIENT_ID = (() => {
  const make = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
  try {
    let id = localStorage.getItem('lilin:client');
    if (!id) { id = make(); localStorage.setItem('lilin:client', id); }
    return id;
  } catch { return make(); }
})();

// This page only: live updates (see connectLive) skip changes this page already shows itself.
const TAB_ID = Math.random().toString(36).slice(2, 12);
async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(path, { ...opts, headers: { ...opts.headers, 'X-Lilin-Client': CLIENT_ID, 'X-Lilin-Tab': TAB_ID, 'X-Lilin-Lang': lang } });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (await signedOut()) throw new Error(T('You’ve been signed out. Sign in again to carry on.'));
    // The browser's own words ("Failed to fetch", "Load failed", …) mean nothing to anyone, and they're always English.
    throw Object.assign(new Error(T('No connection to Lilin. Check your Wi-Fi and try again.')), { offline: true, cause: err });
  }
  let data = {};
  try { data = await r.json(); } catch { /* non-JSON */ }
  if (r.status === 401 && data.signin) { toSignIn(); throw Object.assign(new Error(T('Sign in to carry on.')), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(data.error || T('The server responded with {0}.', r.status)), { status: r.status });
  return data;
}

// Lilin's own sign-in (auth.js): a 401 with `signin` means this browser needs to sign in.
function toSignIn() {
  location.assign(`/signin?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
}

// When the Cloudflare Access sign-in runs out, API calls get redirected to Cloudflare's login page,
// which fetch can't follow (it's another site), so they fail as network errors. Telling the two apart:
// a redirect seen without following it means signed out. Then a reload goes through the sign-in.
let signedOutShown = false;
async function signedOut() {
  let r;
  try { r = await fetch('/api/me', { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(3000) }); } catch { return false; } // really offline
  if (r.type !== 'opaqueredirect') return false;
  if (!signedOutShown) {
    signedOutShown = true;
    document.body.append(h('div', { class: 'signed-out', role: 'alert' },
      h('p', {}, h('strong', {}, T('You’ve been signed out.')), T(' Your sign-in ran out; sign in again to carry on where you were.')),
      h('button', { class: 'play-btn', onclick: () => location.reload() }, T('Sign in again'))));
  }
  return true;
}

// ---------- formatting ----------
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}
function fmtEta(s) {
  if (s == null) return null;
  if (s < 60) return T('under a minute left');
  if (s < 3600) return T('{0} min left', Math.round(s / 60));
  const hrs = Math.floor(s / 3600);
  return T('{0} h {1} min left', hrs, Math.round((s % 3600) / 60));
}
function fmtTime(s) {
  s = Math.floor(s);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
}
function fmtAgo(ms) {
  if (!ms) return null;
  const days = (Date.now() - ms) / 86400000;
  if (days < 1) return T('today');
  if (days < 2) return T('yesterday');
  if (days < 45) return T('{0} days ago', Math.round(days));
  if (days < 365) return T('{0} months ago', Math.round(days / 30));
  const yrs = Math.round(days / 365);
  return (yrs > 1 ? T('{0} years ago', yrs) : T('{0} year ago', yrs));
}
const pad2 = (n) => String(n).padStart(2, '0');
const episodeLabel = (f) => (f.season != null ? f.episode != null ? T('S{0} E{1}', pad2(f.season), pad2(f.episode)) : T('Season {0}', f.season) : null);
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// ---------- state ----------
const state = {
  view: 'discover', route: 'discover', sub: null, // routes.js: the view on screen, its address and the page inside it
  sessions: [],
  convert: null,
  status: { search: false, library: false, downloads: false, torrents: false, subtitles: false },
  library: [],
  libraryShows: [], // episodes grouped into shows (server side, TMDB posters per season)
  libraryError: null,
  downloads: [],
  downloadsError: null,
  dlScope: 'mine',  // the owner can switch Downloads to everyone's
  server: [],       // videos on the server that aren't in this person's library
  me: null,         // who's signed in, with their settings (accounts.js)
  rules: null,      // the server's auto-delete rules
  progress: {},     // where this person stopped watching, from any device
  hidden: {},       // taken out of Continue watching: title key → when (server time), from any device
  libFilter: 'all',
};// Page filters (Library, Activity, House → Machines, Game clips, Notes): what's typed in each page's own field.
const pageFilters = { library: '', activity: '', house: '', clips: '', notes: '' };

const canDownload = () => state.status.downloads && state.me?.canDownload !== false;
const prefs = () => state.me?.settings || {};

// Local files (library + finished downloads) that belong to a TMDB title.
// ---------- versions (src/versions.js) ----------
// Two files of one film or episode (a 4K and a 1080p) arrive from the server as one item with
// `versions`, best first. Which one plays here: the one you picked for the title, else the one you
// picked for its season (matched by quality and source, so one choice covers a season pack), else
// the best one, or on a phone the lightest 720p/1080p one. Picks are kept per device.
// The connection test runs a few seconds after the app opens, so pressing Play rarely waits for it (connection.js).
setTimeout(() => { measureSpeed().catch(() => {}); }, 5000);
const VERSION_PICKS = 'lilin:versions';
let versionPicks = {};
try { versionPicks = JSON.parse(localStorage.getItem(VERSION_PICKS)) || {}; } catch { /* blocked */ }
const versionSeasonKey = (f) => (/^ep:/.test(f?.versionKey || '') ? f.versionKey.replace(/^ep:/, 'season:').replace(/:\d+$/, '') : null);
function chooseVersion(all) {
  const picked = all.find((v) => v.mediaKey === versionPicks[all[0].versionKey]);
  if (picked) return picked;
  const season = versionSeasonKey(all[0]);
  const bySeason = season && all.find((v) => v.versionSignature === versionPicks[season]);
  if (bySeason) return bySeason;
  // Asked for this anime dubbed: a dual-audio copy unless they chose another one above.
  const dubs = all.filter((v) => v.preferDub);
  const list = dubs.length ? dubs : all;
  if (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600) {
    return [...list].reverse().find((v) => ['720p', '1080p'].includes(v.versionQuality)) || list.at(-1);
  }
  return list[0];
}
// Deleted files leave at once: a title keeps its other versions.
function dropFromLibrary(ids) {
  const gone = new Set(ids);
  const items = (state.libraryItems || state.library).flatMap((x) => {
    if (!(x.versions?.length > 1)) return gone.has(x.id) ? [] : [x];
    const left = x.versions.filter((v) => !gone.has(v.id));
    return !left.length ? [] : left.length === 1 ? [left[0]] : [{ ...left[0], versions: left }];
  });
  state.libraryItems = items;
  state.library = items.map(applyVersion);
}
const applyVersion = (item) => (item.versions?.length > 1 ? { ...chooseVersion(item.versions), versions: item.versions } : item);
// Every file behind these items (all versions), for deleting or keeping a whole title or season.
const allVersions = (files) => files.flatMap((f) => (f.versions?.length > 1 ? f.versions : [f]));
// season: the choice applies to the whole season (and replaces per-episode choices in it).
function setVersionPick(f, v, { season = false } = {}) {
  const sk = versionSeasonKey(f);
  if (season && sk) {
    versionPicks[sk] = v.versionSignature;
    const prefix = sk.replace(/^season:/, 'ep:') + ':';
    for (const k of Object.keys(versionPicks)) if (k.startsWith(prefix)) delete versionPicks[k];
  } else if (f.versionKey) versionPicks[f.versionKey] = v.mediaKey;
  const keys = Object.keys(versionPicks);
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete versionPicks[k];
  try { localStorage.setItem(VERSION_PICKS, JSON.stringify(versionPicks)); } catch { /* blocked */ }
  state.library = (state.libraryItems || state.library).map(applyVersion);
  updateUpNext();
}
// A season where episodes have versions: one choice for all of them, by quality and source
// ("4K · WEB-DL" / "1080p · BluRay"); episodes without that version keep theirs.
function seasonVersionPick(ready, onPicked) {
  const versioned = ready.filter((f) => f.versions?.length > 1);
  if (!versioned.length) return null;
  const options = new Map();
  for (const v of versioned.flatMap((f) => f.versions)) {
    if (!options.has(v.versionSignature)) options.set(v.versionSignature, v.versionLabel.replace(/ · [\d.]+ [GM]B$/, ''));
  }
  if (options.size < 2) return null;
  const counts = new Map();
  for (const f of versioned) counts.set(f.versionSignature, (counts.get(f.versionSignature) || 0) + 1);
  const current = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const n = versioned.length;
  return h('div', { class: 'season-versions' }, versionSelect({
    id: `ver-${versionSeasonKey(versioned[0])}`, label: T('Quality for this season'),
    options: [...options].map(([value, label]) => ({ value, label })), value: current,
    onPick: (sig) => { setVersionPick(versioned[0], { versionSignature: sig }, { season: true }); patchUnifiedLibrary(); onPicked(); },
  }), h('p', { class: 'muted version-hint' }, T('{0} more than one version. Your choice is remembered on this device.', plural(n, T('episode has'), T('episodes have')))));
}
// A film with versions: which one Play starts.
function filmVersionPick(t, onPicked) {
  const f = matchesFor(t).find((x) => x.kind === 'lib' && x.versions?.length > 1);
  if (!f) return null;
  return versionSelect({
    id: `ver-${f.versionKey}`, options: f.versions.map((v) => ({ value: v.mediaKey, label: v.versionLabel })), value: f.mediaKey,
    onPick: (key) => { setVersionPick(f, f.versions.find((v) => v.mediaKey === key)); patchUnifiedLibrary(); onPicked(); },
  });
}
// A small "Quality" select for a title or a season with versions. options: [{ value, label }].
function versionSelect({ id, label = T('Quality'), options, value, onPick }) {
  const sel = h('select', { class: 'sub-select version-select', id },
    options.map((o) => h('option', { value: o.value }, o.label)));
  sel.value = value;
  sel.addEventListener('change', () => onPick(sel.value));
  return h('div', { class: 'version-pick' }, h('label', { for: id }, label), sel);
}

function localFiles() {
  return [
    ...state.library.map((f) => ({ ...f, kind: 'lib', key: f.id, done: true })),
    ...state.downloads.filter((d) => d.mine !== false).map((d) => ({ ...d, title: d.canonicalTitle || d.title, show: d.showId || d.show, kind: 'dl', key: d.hash, file: d.name })),
  ];
}
const sameTitle = (t) => {
  const n = norm(t.title);
  return (f) => {
    if (t.type !== 'tv') {
      if (f.season != null || f.show || f.movieAmbiguous) return false;
      // A different (or unresolved) ID must never fall through to a title/year guess.
      if (t.id != null) return f.tmdbId != null && Number(f.tmdbId) === Number(t.id);
      return norm(f.title) === n && (!f.year || !t.year || f.year === t.year);
    }
    if (f.mediaType === 'tv' && f.tmdbId != null) return Number(f.tmdbId) === Number(t.id);
    if (f.tmdbId && f.season == null) return false;
    if (f.show?.startsWith('tv-')) return f.show === `tv-${t.id}`;
    return f.season != null && norm(f.title) === n;
  };
};
const byEpisode = (a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0);
function matchesFor(t) {
  return localFiles().filter(sameTitle(t)).sort(byEpisode);
}
// The same title on the server but not in this person's library: offered as "Add to my library".
function serverMatchesFor(t) {
  return state.server.filter(sameTitle(t)).map((f) => ({ ...f, kind: 'lib', key: f.id, done: true })).sort(byEpisode);
}

// ---------- themes (Settings → Appearance) ----------
// Each theme sets the colour tokens style.css is built on. A custom theme picks four colours and the
// rest are mixed from them. The result is cached in localStorage so index.html can paint the right
// colours before this script loads (no flash of the default theme).
const THEMES = {
  // Lilin's own: ink, bone and signal red (the screen's light). Dusk and Bone are the same identity's sky and paper.
  lilin: { name: 'Lilin', bg: '#140A14', surface: '#1D121C', raised: '#2A1C28', line: '#3A2A36', text: '#EFE8E1', muted: '#B8AAB2', accent: '#FB2C16', alert: '#FF9B85' },
  dusk: { name: T('Dusk'), bg: '#17111F', surface: '#211A2C', raised: '#2D2440', line: '#3C3152', text: '#EFE8E1', muted: '#B3A8C4', accent: '#A58BC9', alert: '#FF9B85' },
  bone: { name: T('Bone'), bg: '#EFE8E1', surface: '#F8F4EF', raised: '#E4DBD2', line: '#D3C7BC', text: '#140A14', muted: '#6B5A66', accent: '#D42A14', alert: '#B42318' },
  midnight: { name: T('Midnight'), bg: '#0E1320', surface: '#161D2E', raised: '#1F2840', line: '#2A3552', text: '#E8EEF8', muted: '#96A3BD', accent: '#5CC8FF', alert: '#FF8A8A' },
  forest: { name: T('Forest'), bg: '#0F1A14', surface: '#16241C', raised: '#1E3127', line: '#2A4134', text: '#E9F2EA', muted: '#9DB5A4', accent: '#9BE07A', alert: '#FF9B85' },
  ember: { name: T('Ember'), bg: '#161312', surface: '#221D1B', raised: '#2E2724', line: '#3D3430', text: '#F5EDE8', muted: '#B3A49C', accent: '#FF7A3D', alert: '#FF8A8A' },
  lagoon: { name: T('Lagoon'), bg: '#0B1A1C', surface: '#112629', raised: '#183337', line: '#22444A', text: '#E3F4F4', muted: '#93B8BA', accent: '#3DDBC4', alert: '#FF9B85' },
  synth: { name: T('Synthwave'), bg: '#140F24', surface: '#1D1633', raised: '#281E45', line: '#352858', text: '#F0EAFF', muted: '#A99BC9', accent: '#FF5FA2', alert: '#FFB36B' },
  noir: { name: T('Noir'), bg: '#111111', surface: '#1B1B1B', raised: '#262626', line: '#333333', text: '#F2F2F2', muted: '#A0A0A0', accent: '#E8E8E8', alert: '#FF8A8A' },
  paper: { name: T('Paper'), bg: '#F7F2EA', surface: '#FFFDF9', raised: '#EFE7DB', line: '#DDD2C2', text: '#241A14', muted: '#6E6157', accent: '#C2410C', alert: '#B42318' },
  daylight: { name: T('Daylight'), bg: '#F2F5FA', surface: '#FFFFFF', raised: '#E5EBF4', line: '#D2DAE7', text: '#141B2B', muted: '#5A6478', accent: '#2563EB', alert: '#C0262D' },
};
const THEME_FIELDS = [['bg', T('Background')], ['surface', T('Panels')], ['text', T('Text')], ['accent', T('Accent')]];

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t)); // t of the way from a to b
const luminance = (hex) => {
  const [r, g, b] = hexRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// A TMDB rating the same way everywhere: one decimal, in the reader's language ("8.0", Swedish "8,0").
const fmtRating = (r) => Number(r).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// WCAG contrast ratio between two colours (1 to 21).
const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// A saved theme ({ preset } or { preset: 'custom', colors }) -> the full set of colours.
function themeColors(theme) {
  const preset = THEMES[theme?.preset] || THEMES[state.rules?.defaultTheme] || THEMES.lilin;
  if (theme?.preset !== 'custom' || !theme.colors) return preset;
  const { bg, surface, text, accent } = theme.colors;
  const light = luminance(bg) > 0.5;
  return {
    name: T('Custom'), bg, surface, text, accent,
    raised: mix(surface, text, 0.08), line: mix(surface, text, 0.16), muted: mix(text, bg, 0.38),
    alert: light ? '#B42318' : '#FF9B85',
  };
}

// The tab icon in the theme's colours: the LN monogram (public/favicon.svg) in the accent, letters in the on-accent ink.
const ICON_PATH = 'M168.0 176.0H292.0V788.0H168.0Z M128.0 176.0H332.0V206.0H128.0Z M291.0 758.0 L418.0 758.0 L488.0 648.0 L488.0 788.0 L291.0 788.0Z M488.0 176.0H518.0V788.0H488.0Z M488.0 176.0 L632.0 176.0 L848.0 852.0 L704.0 852.0Z M818.0 176.0H848.0V852.0H818.0Z M788.0 176.0H878.0V206.0H788.0Z M458.0 176.0H498.0V206.0H458.0Z M0.0 778.0H1024.0V788.0H0.0Z';
const themeIcon = (accent, ink) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${accent}"/><path fill="${ink}" d="${ICON_PATH}"/></svg>`)}`;

function applyTheme(theme) {
  const c = themeColors(theme);
  const light = luminance(c.bg) > 0.5;
  // Text on the accent (primary buttons): whichever of a dark or light ink reads better on it.
  const darkInk = luminance(c.bg) < 0.15 ? c.bg : '#141414';
  const lightInk = luminance(c.bg) > 0.8 ? c.bg : '#FFFFFF';
  const onAccent = contrastRatio(darkInk, c.accent) >= contrastRatio(lightInk, c.accent) ? darkInk : lightInk;
  const vars = {
    '--velvet': c.bg, '--curtain': c.surface, '--seat': c.raised, '--line': c.line,
    '--paper': c.text, '--dust': c.muted, '--bulb': c.accent, '--alert': c.alert,
    '--bulb-dim': `${c.accent}33`, '--on-bulb': onAccent,
    // Big bold labels (Play, Next episode) stay white unless white really can't be read on the accent.
    '--on-bulb-bold': contrastRatio('#FFFFFF', c.accent) >= 3 ? '#FFFFFF' : onAccent,
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = light ? 'light' : 'dark';
  root.dataset.scheme = light ? 'light' : 'dark';
  pageThemeColor = c.bg;
  if (!current) setTheme(c.bg);
  const favicon = themeIcon(c.accent, onAccent);
  const link = document.getElementById('favicon');
  if (link && link.getAttribute('href') !== favicon) link.setAttribute('href', favicon);
  try { localStorage.setItem('lilin:theme', JSON.stringify({ vars, scheme: light ? 'light' : 'dark', icon: favicon })); } catch { /* blocked */ }
}

// ---------- shared UI bits ----------
function notice(title, text, retry) {
  return h('div', { class: 'notice' },
    h('h3', {}, title),
    h('p', {}, text),
    retry && h('button', { class: 'retry', onclick: retry }, T('Try again')));
}

// An empty state with personality: a lilin sign with a few bulbs lit, a line, and one way forward.
function emptyState(title, text, action) {
  return h('div', { class: 'notice empty-state' },
    h('div', { class: 'lilin-sign', 'aria-hidden': 'true' },
      h('div', { class: 'lilin-sign-bulbs' }, Array.from({ length: 9 }, () => h('i'))),
      h('div', { class: 'lilin-sign-word' }, 'Lilin'),
      h('div', { class: 'lilin-sign-bulbs' }, Array.from({ length: 9 }, () => h('i')))),
    h('h3', {}, title),
    h('p', {}, text),
    action && h('button', { type: 'button', class: 'play-btn', onclick: action.run }, action.icon && icon(action.icon), action.label));
}

function skeletonGrid(n = 8) {
  return h('ul', { class: 'grid', 'aria-hidden': 'true' },
    Array.from({ length: n }, () => h('li', { class: 'skeleton' }, h('div', { class: 'poster' }), h('div', { class: 'bar' }))));
}

let toastTimer;
// In the player, a note at the top (Making a version…, Off air) would sit under the toast: the toast goes below it.
function placeToast(t) {
  const note = document.body.classList.contains('in-player') ? $('#player-note') : null;
  const below = note && !note.hidden ? note.getBoundingClientRect().bottom : 0;
  t.style.top = below > 0 ? `${Math.round(below + 10)}px` : '';
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  placeToast(t);
  t.classList.remove('has-action');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// A toast with one button (Undo). It stays a little longer than a plain one.
function actionToast(msg, label, action, ms = 6000) {
  const t = $('#toast');
  placeToast(t);
  t.replaceChildren(h('span', {}, msg), h('button', { type: 'button', class: 'toast-action', onclick: () => { t.classList.remove('show'); action(); } }, label));
  t.classList.add('show', 'has-action');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// Deleting waits a few seconds behind an Undo toast: the items leave the screen at once, the server
// is only asked when the time is up (or right away if the page is closed or hidden meanwhile).
const UNDO_MS = 6000;
const pendingDeletes = new Set();
const pendingDeleteIds = () => new Set([...pendingDeletes].flatMap((j) => j.ids));
function undoableDelete({ ids, message, commit, after }) {
  const job = { ids, done: false };
  const refresh = async () => { await Promise.all([loadLibrary(), loadDownloads()]); if (state.view === 'library') renderLibrary(); if (state.view === 'downloads') renderDownloads(); };
  job.run = async (keepalive = false) => {
    if (job.done) return;
    job.done = true; clearTimeout(job.timer);
    try { const r = await commit(keepalive); after?.(r); }
    catch (err) { toast(err.message || T('Couldn’t delete that.')); }
    finally { pendingDeletes.delete(job); setTimeout(refresh, 4000); } // after the server's own clean-up
  };
  pendingDeletes.add(job);
  dropFromLibrary(ids);
  libraryRenderPending = true;
  if (state.view === 'library') renderLibrary();
  job.timer = setTimeout(() => job.run(), UNDO_MS);
  actionToast(message, T('Undo'), () => {
    if (job.done) return;
    job.done = true; clearTimeout(job.timer); pendingDeletes.delete(job);
    librarySignature = null; // the next load puts them back even if nothing changed on the server
    refresh();
  }, UNDO_MS);
}
const flushDeletes = () => { for (const j of [...pendingDeletes]) j.run(true); };
addEventListener('pagehide', flushDeletes);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDeletes(); });

function resumeKey(f) { return `resume:${f.kind}:${f.key}`; }
// Where this person stopped, synced through the server so it resumes on their other devices too.
// Library videos go by their media key, which stays the same when the MP4 copy replaces the original.
const progressRef = (f) => (f.mediaKey ? `m:${f.mediaKey}` : `${f.kind === 'dl' ? 'd' : 'l'}:${f.key}`);
function savedProgress(f) {
  // Versions share one watch position (the server saves it on all of them): the newest one counts.
  const synced = (f.versions?.length > 1 ? f.versions.map((v) => state.progress[progressRef(v)]).filter(Boolean)
    .sort((a, b) => (b.at || 0) - (a.at || 0))[0] : null) || state.progress[progressRef(f)];
  if (synced) return synced;
  try { return JSON.parse(localStorage.getItem(resumeKey(f))); } catch { return null; }
}
async function loadProgress() {
  try { const data = await api('/api/me/progress'); state.progress = data.progress || {}; state.finished = data.finished || {}; state.seen = data.seen || {}; state.hidden = data.hidden || {}; } catch { /* local copy only */ }
}

// ---------- Save for later and Follow (watchlist.js; the server downloads, src/watchlist.js) ----------
const watch = { items: [], autoDownload: false, revision: 0 };
const watchItem = (type, id) => watch.items.find((i) => i.type === type && i.id === Number(id)) || null;
async function loadWatchlist() {
  if (!state.status.search) return;
  try { Object.assign(watch, await api('/api/watchlist')); watch.revision++; } catch { return; }
  refreshWatchViews();
}
// Every place that shows the list: Save / Follow boxes in open sheets, Discover's Saved for later row.
function refreshWatchViews() {
  document.querySelectorAll('.watch-box').forEach((box) => box._update?.());
  refreshSavedRow();
  document.querySelectorAll('.cs-save').forEach((b) => b._update?.()); // comingsoon: Save / Follow on its cards
}
function refreshSavedRow() {
  const body = $('#discover-body');
  if (state.view !== 'discover' || instantPage() || disc.list || disc.genre || !body.querySelector('.discover-controls')) return;
  const old = body.querySelector('.saved-shelf'), fresh = savedRow();
  if (old) old.replaceWith(fresh || '');
  else if (fresh) (body.querySelector('.continue-shelf') || body.querySelector('.discover-controls')).after(fresh);
}
async function setWatch(t, flags) {
  const { item } = await api('/api/watchlist', jsonPost({ type: t.type, tmdbId: t.id, ...flags }));
  watch.items = watch.items.filter((i) => !(i.type === t.type && i.id === Number(t.id)));
  if (item) watch.items.unshift(item);
  watch.revision++;
  refreshWatchViews();
  return item;
}
// Saved: it waits in Saved for later on Discover (there's no list to go to); Follow says what it does.
const watchlistToast = (text) => toast(text);
// Save (any title), Follow (shows) and the automatic-download switch, with one status line. The title page puts
// box.save and box.follow in its button bar (lead: the one that's its gold button); the box keeps the rest.
function watchBox(t, { lead = null } = {}) {
  const isTv = t.type === 'tv';
  const box = h('div', { class: 'watch-box' });
  let busy = false;
  const act = async (flags, what) => {
    if (busy) return;
    busy = true; box.classList.add('is-busy');
    try {
      const item = await setWatch(t, flags);
      if (what) toast(what(item));
    } catch (err) { toast(err.message); } finally { busy = false; box.classList.remove('is-busy'); box._update(); }
  };
  const toggle = (id, run) => h('button', { type: 'button', class: `${lead === id ? 'play-btn action-btn' : 'chip'} watch-toggle`, 'data-act': id, onclick: () => run() });
  box.save = toggle('save', () => { const saved = Boolean(watchItem(t.type, t.id)?.saved); act({ saved: !saved }, (i) => (i?.saved ? T('Saved. It waits on Discover, in Saved for later.') : T('Removed from Saved'))); });
  box.follow = isTv ? toggle('follow', () => { const follow = Boolean(watchItem(t.type, t.id)?.follow);
    act({ follow: !follow }, (i) => (i?.follow ? (i.auto ? T('Following. New episodes arrive as they air.') : T('Following')) : T('Stopped following'))); }) : null;
  box._update = () => {
    if (!box.isConnected && box._drawn) return;
    box._drawn = true;
    const item = watchItem(t.type, t.id);
    const saved = Boolean(item?.saved), follow = Boolean(item?.follow);
    const auto = Boolean(item?.auto) && watch.autoDownload;
    const inLibrary = !isTv && matchesFor(t).some((f) => f.done);
    box.save.classList.toggle('is-on', saved); box.save.setAttribute('aria-pressed', String(saved));
    box.save.replaceChildren(icon('bookmark'), h('span', {}, saved ? T('Saved') : T('Save')));
    if (box.follow) {
      box.follow.classList.toggle('is-on', follow); box.follow.setAttribute('aria-pressed', String(follow));
      box.follow.replaceChildren(icon('bell'), h('span', {}, follow ? T('Following') : T('Follow')));
    }
    // Films: wait for the release. Shows: new episodes as they air (only while following).
    const offerAuto = watch.autoDownload && (isTv ? follow : saved && !inLibrary && item?.state !== 'got');
    const autoSwitch = offerAuto && h('label', { class: 'watch-auto' },
      h('input', { type: 'checkbox', checked: auto, onchange: (e) => act({ auto: e.currentTarget.checked }) }),
      h('span', {}, isTv ? T('Add new episodes as they air') : T('Add it when a good copy is out')));
    const line = watchStatus(item, { today: todayIso(), autoDownload: watch.autoDownload, inLibrary });
    box.replaceChildren(...[autoSwitch, line && h('p', { class: 'watch-status', role: 'status' }, line)].filter(Boolean));
    box.hidden = !autoSwitch && !line;
  };
  box._update();
  return box;
}

// A followed show's page was opened: its episodes that arrived by themselves aren't news any more.
function markShowSeen(tmdbId) {
  const item = watchItem('tv', tmdbId);
  if (!item?.newEpisodes?.length) return;
  item.newEpisodes = [];
  watch.revision++;
  api('/api/watchlist/seen', jsonPost({ tmdbId })).catch(() => {});
}

// ---------- auto-delete countdown ----------
// Videos in your library are deleted a set time after they finish downloading (the owner's setting,
// 7 days unless changed). The countdown shows on each one, with a button to keep it longer.
function timeLeft(ms) {
  const hours = (ms - Date.now()) / 3600000;
  if (hours <= 0) return T('Deleting soon');
  if (hours < 1) return T('Deleted within the hour');
  if (hours < 48) return T('{0} h left', Math.floor(hours));
  return T('{0} days left', Math.round(hours / 24));
}
const canExtend = (f) => f.expiresAt != null && (!state.rules?.maxExtensions || (f.extensions || 0) < state.rules.maxExtensions);
const extendDays = () => state.rules?.extendDays || 7;

// Pushes back when these library videos are deleted. Returns the updated items (or [] on failure).
async function extendItems(files) {
  try {
    const { entries } = await api('/api/library/extend', jsonPost({ ids: [...new Set(allVersions(files).map((f) => f.id || f.key))] }));
    const byKey = new Map(entries.map((e) => [e.key, e]));
    for (const f of state.library) {
      const e = byKey.get(f.mediaKey);
      if (e) Object.assign(f, { expiresAt: e.expiresAt, extensions: e.extensions });
      for (const v of f.versions || []) { const ve = byKey.get(v.mediaKey); if (ve) Object.assign(v, { expiresAt: ve.expiresAt, extensions: ve.extensions }); }
    }
    if (state.view === 'library') renderLibrary();
    return files.map((f) => state.library.find((x) => x.mediaKey === f.mediaKey)).filter(Boolean);
  } catch (err) {
    toast(err.message);
    return [];
  }
}

// A small menu behind a ⋯ button (a <details>, so it works without script tricks); closes on outside clicks and Escape.
function rowMenu(label, items) {
  const summary = h('summary', { class: 'row-more-btn', 'aria-label': label, title: label }, icon('more'));
  const menu = h('details', { class: 'row-more' }, summary, h('div', { class: 'row-menu' },
    items.filter(Boolean).map(([ic, text, run, cls]) => h('button', { type: 'button', class: `row-menu-item ${cls || ''}`.trim(), onclick: (e) => {
      e.stopPropagation();
      menu.open = false;
      run(summary);
    } }, ic, h('span', {}, text)))));
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    // Opens upward when there's no room below (a short title page, the last row of a list).
    const list = menu.querySelector('.row-menu');
    list.classList.remove('is-up');
    const box = list.getBoundingClientRect(), floor = Math.min(innerHeight, menu.closest('.sheet')?.getBoundingClientRect().bottom ?? innerHeight);
    if (box.bottom > floor - 8 && box.top - box.height - summary.offsetHeight > 8) list.classList.add('is-up');
    menu.querySelector('.row-menu-item:not([hidden])')?.focus();
  });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { e.stopPropagation(); menu.open = false; summary.focus(); } });
  return menu;
}
// The same actions spelled out as a row of chips where there's room (style.css swaps them for the ⋯ menu on phones).
function rowActions(label, items) {
  const chips = h('div', { class: 'row-actions', role: 'group', 'aria-label': label },
    items.filter(Boolean).map(([ic, text, run, cls]) => h('button', { type: 'button', class: `chip ${cls || ''}`.trim(),
      onclick: (e) => { e.stopPropagation(); run(e.currentTarget); } }, ic.cloneNode(true), h('span', {}, text))));
  return h('div', { class: 'row-tools' }, chips, rowMenu(label, items));
}
document.addEventListener('click', (e) => { for (const m of document.querySelectorAll('details.row-more[open]')) if (!m.contains(e.target)) m.open = false; });

// ---------- Download to phone (travel.js; the server makes the copies, src/travel.js) ----------
// Small MP4s to watch offline: Small (480p) or Standard (720p), or the file at full quality.
// The picker sheet shows one video's choices, a season's, or your list ("For your phone").
const travelView = { items: [], loaded: false, open: null }; // open: () => redraw the picker while it shows travel
async function loadTravel() {
  try { travelView.items = (await api('/api/travel')).items; travelView.loaded = true; } catch { return; }
  travelView.open?.();
  if (state.view === 'library') renderLibrary();
}
function travelOverlay(opener, draw) {
  travelView.open = draw;
  draw();
  if ($('#picker').hidden || !$('#picker').classList.contains('open')) {
    pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { travelView.open = null; opener?.focus({ preventScroll: true }); }));
  }
}
const travelLink = (url, label = T('Download')) => h('a', { class: 'chip travel-get', href: url, download: '' }, icon('download'), label);
async function askTravel(items, quality, btn) {
  if (btn) btn.disabled = true;
  try {
    travelView.items = (await api('/api/travel', jsonPost({ items, quality }))).items;
    travelView.loaded = true;
    return true;
  } catch (err) { toast(err.message); return false; } finally { if (btn) btn.disabled = false; }
}
function travelProgress(item) {
  return item.state === 'making' && h('div', { class: 'resume-track travel-track', role: 'progressbar', 'aria-valuenow': item.percent ?? 0, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('i', { style: `width:${item.percent ?? 0}%` }));
}

function openTravel(file, opener) {
  const f = { ...file, kind: file.kind || 'lib' };
  const id = mediaId(f), title = travelTitle(f);
  let data = null, error = null;
  const base = `/api/media/${f.kind}/${encodeURIComponent(id)}/travel`;
  const fetchOptions = async () => {
    try { data = await api(base); error = null; } catch (err) { error = err.message; }
    if (travelView.open === draw) draw();
  };
  function draw() {
    const rows = !data ? [h('li', { class: 'searching', role: 'status' }, error || T('Working out the sizes…'))]
      : [...data.qualities.map((q) => {
        const mine = travelView.items.find((i) => i.kind === f.kind && i.id === id && i.quality === q.quality);
        const item = { ...q, ...(mine || {}) };
        const action = item.state === 'ready' && mine?.url ? travelLink(mine.url)
          : item.state === 'making' || item.state === 'queued' ? null
            : h('button', { type: 'button', class: 'chip', onclick: async (e) => {
              if (await askTravel([{ kind: f.kind, id, title }], q.quality, e.currentTarget)) fetchOptions();
            } }, item.state === 'ready' ? T('Get it') : item.state === 'failed' ? T('Try again') : T('Make it'));
        return h('li', { class: 'row travel-row' },
          h('div', { class: 'row-text' },
            h('div', { class: 'row-title' }, `${T(q.label)} · ${q.height}p`),
            h('div', { class: 'row-meta' }, [sizeWords(item, fmtBytes), q.note && T(q.note), mine || item.state === 'ready' ? stateWords(item) : null].filter(Boolean).map((t) => h('span', {}, t))),
            travelProgress(item)),
          action && h('div', { class: 'row-actions' }, action));
      }),
      h('li', { class: 'row travel-row' },
        h('div', { class: 'row-text' },
          h('div', { class: 'row-title' }, T('Full quality')),
          h('div', { class: 'row-meta' }, [data.original.size && fmtBytes(data.original.size), T('The file as it is, ready now')].filter(Boolean).map((t) => h('span', {}, t)))),
        h('div', { class: 'row-actions' }, travelLink(data.original.url)))];
    $('#picker-body').replaceChildren(
      h('h2', { id: 'picker-title' }, T('Download to phone')),
      h('p', { class: 'muted picker-sub' }, title),
      h('ul', { class: 'rows travel-list' }, rows),
      h('p', { class: 'muted travel-note' }, T('Small and Standard are made on the server first, so you can close this and come back (with notifications on, you’ll hear when one is ready). They play in your phone’s own video player, subtitles included, and stay here for a week after your last download.')),
      // (replaceChildren would print a bare `false`)
      travelView.items.length > 0 ? h('button', { type: 'button', class: 'retry', onclick: () => openTravelList() }, T('All phone copies')) : '');
  }
  travelOverlay(opener, draw);
  if (!travelView.loaded) loadTravel();
  fetchOptions();
}

// A whole season in one go: pick a size, then the list shows each episode as it's made.
function openTravelSeason(files, label, opener) {
  const items = files.map((f) => ({ kind: 'lib', id: f.id, title: travelTitle(f) }));
  function draw() {
    $('#picker-body').replaceChildren(
      h('h2', { id: 'picker-title' }, T('Season to phone')),
      h('p', { class: 'muted picker-sub' }, (items.length === 1 ? T('{0} · {1} episode', label, items.length) : T('{0} · {1} episodes', label, items.length))),
      h('ul', { class: 'rows travel-list' }, ['small', 'standard'].map((quality) => {
        const q = quality === 'small' ? { label: T('Small · 480p'), note: T('About 230 MB per half hour') } : { label: T('Standard · 720p'), note: T('About 520 MB per half hour') };
        return h('li', { class: 'row travel-row' },
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, T(q.label)), h('div', { class: 'row-meta' }, h('span', {}, q.note ? T(q.note) : ''))),
          h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'chip', onclick: async (e) => {
            if (await askTravel(items, quality, e.currentTarget)) openTravelList();
          } }, T('Make them'))));
      })),
      h('p', { class: 'muted travel-note' }, T('Episodes are made one at a time. Each gets its own Download button in the list when it’s ready.')));
  }
  travelOverlay(opener, draw);
}

// Phone copies as rows, with Download buttons as copies finish: in the For your phone sheet and House › Downloads.
function travelRows(items, redraw) {
  return items.map((item) => h('li', { class: 'row travel-row' },
    h('div', { class: 'row-text' },
      h('div', { class: 'row-title' }, item.title),
      h('div', { class: `row-meta${item.state === 'failed' ? ' is-error' : ''}` }, [item.label && T(item.label), sizeWords(item, fmtBytes), stateWords(item),
        item.downloadedAt && T('Downloaded')].filter(Boolean).map((t) => h('span', {}, t))),
      travelProgress(item)),
    h('div', { class: 'row-actions' },
      item.state === 'failed' && h('button', { type: 'button', class: 'chip', onclick: (e) => askTravel([{ kind: item.kind, id: item.id, title: item.title }], item.quality, e.currentTarget).then(redraw) }, T('Try again')),
      item.url && travelLink(item.url),
      h('button', { type: 'button', class: 'cast-btn del-btn', title: T('Remove'), 'aria-label': T('Remove {0} ({1}) from your phone list', item.title, item.label), onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { travelView.items = (await api('/api/travel/remove', jsonPost({ kind: item.kind, id: item.id, quality: item.quality }))).items; } catch (err) { toast(err.message); }
        redraw();
        if (state.view === 'library') renderLibrary();
      } }, icon('trash')))));
}
// Everything you asked for, with Download buttons as copies finish.
function openTravelList(opener) {
  function draw() {
    const items = travelOrder(travelView.items);
    $('#picker-body').replaceChildren(
      h('h2', { id: 'picker-title' }, T('For your phone')),
      h('p', { class: 'muted picker-sub' }, travelSummary(items, items.length === 1 ? T('1 copy') : T('{0} copies', items.length)) || T('Nothing yet. Open a film or episode and choose Download to phone.')),
      h('ul', { class: 'rows travel-list' }, travelRows(items, draw)),
      ...(items.length ? [h('p', { class: 'muted travel-note' }, T('Removing one here doesn’t touch the copy already on your phone. Copies leave the server a week after you last download them.'))] : []));
  }
  travelOverlay(opener, draw);
  loadTravel();
}

// ---------- Discover ----------
let searchCtrl;
const disc = { type: 'all', genre: null, sort: 'popular', list: null, genres: null, cache: new Map() };
const TYPE_LABELS = [['all', T('All')], ['movie', T('Films')], ['tv', T('Shows')], ['anime', T('Anime')], ['docs', T('Documentaries')]];
// Types the Instant page has no filter of its own for (it shows everything instead).
const allOnInstant = (type) => (type === 'docs' || type === 'anime' ? 'all' : type);
const SORT_LABELS = [['popular', T('Popular')], ['rating', T('Top rated')], ['newest', T('Newest')]];

async function cachedApi(url, signal) {
  if (disc.cache.has(url)) return disc.cache.get(url);
  const data = await api(url, { signal });
  disc.cache.set(url, data);
  if (disc.cache.size > 60) disc.cache.delete(disc.cache.keys().next().value);
  return data;
}

// ---- Instant: what's on the server plays at once (play first: there is no library to browse) ----
// Everything here, yours or anyone's, as Discover titles: films by TMDB id (or name and year), shows by their TMDB id.
// Kept until the library changes. instantKey(t) says whether a card's title is one of them.
const instantCache = { library: null, server: null, list: [], keys: new Set() };
function instantTitles() {
  if (instantCache.library === state.library && instantCache.server === state.server) return instantCache.list;
  const films = new Map(), shows = new Map(), keys = new Set();
  const added = (f) => f.addedAt || f.added || 0;
  for (const f of [...state.library, ...state.server]) {
    if (f.season != null || f.show) {
      const id = /^tv-(\d+)$/.exec(String(f.show || ''))?.[1];
      if (!id) continue;
      const x = shows.get(id) || { added: 0, episodes: 0 };
      x.added = Math.max(x.added, added(f)); x.episodes++;
      shows.set(id, x);
      continue;
    }
    if (f.movieAmbiguous || (!f.tmdbId && !f.filmTitle)) continue;
    const key = f.tmdbId ? `movie:${f.tmdbId}` : `name:${norm(f.filmTitle)}:${f.year || ''}`;
    const old = films.get(key);
    if (old) { old.added = Math.max(old.added, added(f)); continue; }
    films.set(key, { added: added(f), t: { type: 'movie', id: f.tmdbId ?? null, title: f.filmTitle || f.title, year: f.year, poster: f.poster,
      backdrop: f.backdrop, rating: f.rating, overview: f.overview } });
  }
  const list = [...films.values()];
  for (const s of state.libraryShows) {
    const id = s.tmdbId != null ? String(s.tmdbId) : /^tv-(\d+)$/.exec(String(s.id || ''))?.[1];
    const x = id && shows.get(id);
    if (!x) continue;
    list.push({ added: x.added, t: { type: 'tv', id: Number(id), title: s.title, year: s.year, poster: s.poster, backdrop: s.backdrop, overview: s.overview } });
  }
  for (const { t } of list) if (t.id != null) keys.add(`${t.type}:${t.id}`);
  list.sort((a, b) => b.added - a.added);
  Object.assign(instantCache, { library: state.library, server: state.server, list, keys });
  return list;
}
const instantKey = (t) => t?.id != null && (t.type === 'movie' || t.type === 'tv') && (instantTitles(), instantCache.keys.has(`${t.type}:${t.id}`));
// On a card, the billboard or a peek: a small lightning mark when it plays at once. SVT Play titles match by name.
function isInstant(t) {
  if (!t) return false;
  if (t.type === 'svt') { const n = norm(t.title); return [...state.library, ...state.server].some((f) => norm(f.filmTitle || f.title) === n); }
  return instantKey(t) || (t.id == null && matchesFor(t).some((f) => f.done));
}
function ownershipBadge(t, { words = false } = {}) {
  if (!isInstant(t)) return null;
  return h('span', { class: `instant-mark${words ? ' has-words' : ''}`, title: T('Plays instantly'), 'aria-label': words ? null : T('Plays instantly') },
    icon('bolt'), words && h('span', {}, T('Plays instantly')));
}

// Posters fade in from their own colour: a card starts as a block of its poster's main colour (worked out once, the
// first time the poster loads, and remembered on this device) and crossfades into the picture, instead of grey
// boxes popping in. TMDB posters get their colour via rememberTone; other art just fades in.
const TONE_KEY = 'lilin.posterTones';
let tones = null, toneSave = 0;
const toneStore = () => (tones ||= (() => { try { return JSON.parse(localStorage.getItem(TONE_KEY)) || {}; } catch { return {}; } })());
const tmdbArt = (url) => /^https:\/\/image\.tmdb\.org\/t\/p\//.test(url);
const toneId = (url) => String(url).replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//, '');
const posterTone = (url) => (tmdbArt(url) ? toneStore()[toneId(url)] || null : null);
// The colour is read from TMDB's tiny w92 copy through /api/art (same origin), never from the poster itself:
// a crossorigin poster fails outright on iPhones (Safari's cache), which left "?" boxes on every card.
function rememberTone(url) {
  const store = toneStore(), id = toneId(url);
  if (store[id] || !/^[A-Za-z0-9_-]{4,64}\.(jpg|png)$/.test(id)) return;
  const img = new Image();
  img.onload = () => sampleTone(store, id, img);
  img.src = `/api/art?path=${encodeURIComponent(`/t/p/w92/${id}`)}`;
}
function sampleTone(store, id, img) {
  try {
    const c = document.createElement('canvas'); c.width = 6; c.height = 9;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 6, 9);
    const d = g.getImageData(0, 0, 6, 9).data, n = d.length / 4, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    store[id] = `#${sum.map((v) => Math.round(v / n * 0.82).toString(16).padStart(2, '0')).join('')}`;
  } catch { return; }
  clearTimeout(toneSave);
  toneSave = setTimeout(() => {
    const keys = Object.keys(store);
    for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) delete store[k]; // the newest 1500 posters
    try { localStorage.setItem(TONE_KEY, JSON.stringify(store)); } catch { /* full: next time */ }
  }, 2000);
}
// A poster's colour as a promise (ticket stubs on profiles): remembered, or read now from the tiny copy.
function toneFor(url) {
  const known = posterTone(url);
  if (known || !tmdbArt(url)) return Promise.resolve(known);
  const store = toneStore(), id = toneId(url);
  if (!/^[A-Za-z0-9_-]{4,64}\.(jpg|png)$/.test(id)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sampleTone(store, id, img); resolve(store[id] || null); };
    img.onerror = () => resolve(null);
    img.src = `/api/art?path=${encodeURIComponent(`/t/p/w92/${id}`)}`;
  });
}
function toneArt(url, tone) {
  const tmdb = tmdbArt(url);
  const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', class: 'tone-art',
    onload: () => {
      img.classList.add('is-in');
      if (tmdb && !tone) (window.requestIdleCallback || setTimeout)(() => rememberTone(url));
    },
    onerror: () => img.classList.add('is-in') });
  if (img.complete && img.naturalWidth) img.classList.add('is-in', 'is-instant'); // already in memory: no fade
  return img;
}

// SVT Play's art is wide and comes without posters, so its cards are wide and carry its name.
const isSeries = (t) => t.type === 'tv' || t.kind === 'series';
// The rating sits in the caption, not on the art, so it never fights the status badge on small cards.
function titleCard(t) {
  const svt = t.type === 'svt';
  const art = svt ? t.wide || t.poster : t.poster;
  const tone = art ? posterTone(art) : null;
  const button = h('button', { class: `title-card${svt ? ' is-wide' : ''}`, onclick: (e) => { if (peek.swallow(e)) return; openDetails(t, e.currentTarget); } },
    h('div', { class: 'poster', style: tone ? `--tone:${tone}` : null },
      art
        ? toneArt(art, tone)
        : h('div', { class: 'poster-fallback' }, t.title),
      ownershipBadge(t),
      svt && h('span', { class: 'svt-mark' }, 'SVT Play')),
    h('div', { class: 'name' }, t.title),
    // Narrow grid cards drop the Film/Series word (style.css) so the rating always fits.
    h('div', { class: 'sub' }, t.year ? String(t.year) : '',
      h('span', { class: t.year ? 'kind' : null }, `${t.year ? ' · ' : ''}${isSeries(t) ? T('Series') : T('Film')}`),
      t.rating ? h('span', { class: 'star', 'aria-label': T('Rated {0} out of 10', fmtRating(t.rating)) }, ` · ★ ${fmtRating(t.rating)}`) : null));
  button._title = t; // peek.js: the preview on hover or long press
  return h('li', {}, button);
}
const titleGrid = (items) => h('ul', { class: 'grid' }, items.map(titleCard));

const genreNames = (t) => (disc.genres || [])
  .filter((g) => t.genres?.includes(t.type === 'tv' ? g.tv : g.movie))
  .map((g) => g.name).slice(0, 2);
const genreFits = (g) => (disc.type === 'movie' ? g.movie : disc.type === 'tv' ? g.tv : disc.type === 'docs' ? false
  : disc.type === 'anime' ? Boolean(g.movie || g.tv) && g.movie !== 16 : g.movie || g.tv); // anime: all of it is Animation already

function segmented(options, value, onPick, label) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([key, text]) => h('button', {
      type: 'button', 'aria-pressed': String(key === value), onclick: () => onPick(key),
    }, text)));
}

// Discover home keeps your place: opening a mood, genre, documentary category or See all remembers how far down the
// page you were and how far along each row, and coming back (‹ Discover) puts you there again. Rows fill in after
// the page draws, so it keeps placing you for a few seconds, and stops the moment you scroll or tap yourself.
let discSpot = null, discRestore = null;
const discoverAtHome = () => state.view === 'discover' && !instantPage() && !vibesUi.active() && !disc.list && !disc.genre
  && !(disc.type === 'docs' && documentaries.inCategory());
// Each row by its name (the nth row of that name when two share one).
function discoverRows() {
  const seen = new Map();
  return [...$('#discover-body').querySelectorAll('.shelf-items')].map((el) => {
    const name = el.closest('section[aria-label]')?.getAttribute('aria-label') || el.getAttribute('aria-label') || '';
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return [`${name}#${n}`, el];
  });
}
function leaveDiscoverHome() {
  if (!discoverAtHome()) return;
  const rows = Object.fromEntries(discoverRows().filter(([, el]) => el.scrollLeft > 0).map(([key, el]) => [key, el.scrollLeft]));
  // The row nearest the top of the screen anchors the place: rows above it can still be filling in on the way back.
  const top = [...$('#discover-body').querySelectorAll('.shelf[aria-label]')].find((el) => el.getBoundingClientRect().bottom > 0);
  const anchor = top && { name: top.getAttribute('aria-label'), at: top.getBoundingClientRect().top };
  discSpot = { type: disc.type, y: window.scrollY, rows, anchor: window.scrollY > 0 ? anchor : null };
}
function restoreDiscoverHome() {
  discRestore?.();
  const spot = discSpot;
  discSpot = null;
  if (!spot || spot.type !== disc.type || (spot.y <= 0 && !Object.keys(spot.rows).length)) return;
  const rows = new Map(Object.entries(spot.rows));
  let still = 0, timer = 0;
  const stop = () => {
    clearInterval(timer);
    for (const e of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(e, stop, true);
    if (discRestore === stop) discRestore = null;
  };
  const step = () => {
    if (!discoverAtHome()) return stop();
    for (const [key, el] of discoverRows()) {
      const want = rows.get(key);
      if (want == null) continue;
      if (Math.abs(el.scrollLeft - want) > 4) el.scrollTo({ left: want, behavior: 'instant' });
      if (Math.abs(el.scrollLeft - want) <= 4) rows.delete(key);
    }
    const anchor = spot.anchor && [...$('#discover-body').querySelectorAll('.shelf[aria-label]')].find((el) => el.getAttribute('aria-label') === spot.anchor.name);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = Math.max(0, Math.min(max, anchor ? window.scrollY + anchor.getBoundingClientRect().top - spot.anchor.at : spot.y));
    if (Math.abs(window.scrollY - target) > 1) { window.scrollTo({ top: target, behavior: 'instant' }); still = 0; } else still++;
    if (still >= 6 && !rows.size && (anchor || !spot.anchor)) stop(); // in place and nothing moved for a moment
  };
  for (const e of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(e, stop, { capture: true, passive: true });
  timer = setInterval(step, 80);
  setTimeout(stop, 4000);
  discRestore = stop;
  requestAnimationFrame(step);
}

function pickDiscover(changes) {
  if (changes.genre) leaveDiscoverHome();
  Object.assign(disc, changes, { list: null });
  documentaries.reset();
  vibesUi.reset(); // vibes
  if (disc.genre && !genreFits(disc.genre)) disc.genre = null;
  window.scrollTo({ top: 0 });
  renderDiscover();
}
// The one control row, on every width: All · Films · Shows · Anime · Documentaries, then Genres, which opens the genre chips
// under the row. A picked genre turns the chip into "Comedy ✕". In the page flow under the billboard and Right now;
// everything above it is yours and unfiltered, everything below follows it.
function discoverControls() {
  const pick = pickDiscover;
  const open = Boolean(disc.genresOpen && !disc.genre);
  const chips = h('div', { class: 'genre-chips', id: 'genre-chips', role: 'group', 'aria-label': T('Genre'), hidden: !open },
    (disc.genres || []).filter(genreFits).map((g) => h('button', { type: 'button', class: 'chip', onclick: () => pick({ genre: g, genresOpen: false }) }, g.name)));
  const toggle = disc.genre
    ? h('button', { type: 'button', class: 'chip genres-toggle', 'aria-pressed': 'true', 'aria-label': T('{0}: show all genres', disc.genre.name), onclick: () => pick({ genre: null }) },
      h('span', {}, disc.genre.name), icon('close'))
    : h('button', { type: 'button', class: 'chip genres-toggle', 'aria-expanded': String(open), 'aria-controls': 'genre-chips', onclick: () => {
      disc.genresOpen = chips.hidden;
      chips.hidden = !chips.hidden;
      toggle.setAttribute('aria-expanded', String(!chips.hidden));
    } }, h('span', {}, T('Genres')), h('i', { class: 'chev', 'aria-hidden': 'true' }));
  // Instant: only what's on the server (it plays at once); its own address, #discover/instant.
  const instant = disc.type !== 'docs' && h('button', { type: 'button', class: 'chip instant-toggle', 'aria-pressed': String(instantPage()),
    onclick: () => setView(instantPage() ? 'discover' : 'discover/instant') }, icon('bolt'), h('span', {}, T('Instant')));
  return h('div', { class: 'discover-controls' },
    h('div', { class: 'dc-line' }, instantPage() ? segmented(TYPE_LABELS.slice(0, 3), allOnInstant(disc.type), (type) => pick({ type }), T('Show'))
      : segmented(TYPE_LABELS, disc.type, (type) => pick({ type }), T('Show')), disc.type !== 'docs' && !instantPage() && toggle, instant),
    disc.type !== 'docs' && !disc.genre && !instantPage() && chips);
}
const instantPage = () => state.route === 'discover/instant';

function heroSlide(t) {
  const meta = [t.year, isSeries(t) ? T('Series') : T('Film'), t.type === 'svt' && 'SVT Play', t.rating && `★ ${fmtRating(t.rating)}`, ...genreNames(t)].filter(Boolean);
  return h('li', { class: 'hero-slide' },
    h('button', { class: 'hero-card', onclick: (e) => openDetails(t, e.currentTarget) },
      h('img', { src: t.backdrop, alt: '', decoding: 'async' }),
      h('div', { class: 'hero-text' },
        ownershipBadge(t),
        h('div', { class: 'hero-title' }, t.title),
        h('div', { class: 'hero-meta' }, meta.join(' · ')),
        h('p', { class: 'hero-overview' }, t.overview))));
}

function carousel(title, list, seeAll = null, cls = '') {
  const move = (direction) => list.scrollBy({ left: direction * Math.max(160, list.clientWidth * 0.85),
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  const prev = h('button', { type: 'button', class: 'carousel-arrow', disabled: true, 'aria-label': T('Previous in {0}', title), onclick: () => move(-1) }, icon('back'));
  const next = h('button', { type: 'button', class: 'carousel-arrow next', 'aria-label': T('Next in {0}', title), onclick: () => move(1) }, icon('back'));
  let section, observer, shown = false;
  const update = () => {
    // Library shelves are rebuilt in place; a removed one stops watching its size.
    if (list.isConnected === false && shown) return observer?.disconnect();
    if (list.isConnected) shown = true;
    prev.disabled = list.scrollLeft <= 2;
    next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
    prev.hidden = next.hidden = prev.disabled && next.disabled; // everything fits: no arrows
    // soft edges: the row fades out on a side that has more to scroll to
    list.classList?.toggle('fade-start', !prev.disabled);
    list.classList?.toggle('fade-end', !next.disabled);
  };
  list.addEventListener('scroll', update, { passive: true });
  section = h('section', { class: `shelf carousel ${cls}`.trim(), 'aria-label': title },
    h('div', { class: 'shelf-head' }, h('h3', {}, title),
      h('div', { class: 'carousel-controls' }, seeAll, prev, next)), list);
  observer = new ResizeObserver(update);
  observer.observe(list);
  if (!cls) searchCtrl?.signal.addEventListener('abort', () => observer.disconnect(), { once: true }); // Discover rows
  requestAnimationFrame(update);
  return section;
}

function row(r) {
  return carousel(r.title, h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': r.title }, r.items.map(titleCard)),
    h('button', { class: 'see-all', onclick: () => { leaveDiscoverHome(); disc.list = { key: r.key, title: r.title }; window.scrollTo({ top: 0 }); renderDiscover(); } }, T('See all')));
}

// ---------- shared by the billboard, peek and title pages ----------
// TMDB backdrops come 780 px wide; screens with the pixels for it get the 1280 px version.
// Banner-sized art: TMDB's w1280 on mid screens, the original file (usually 1080p-4K) once the screen is
// wider than 1280 real pixels, where w1280 would be stretched (a 1440p monitor blew it up 2x).
function bigArt(url, max = Infinity) {
  if (!url || !/image\.tmdb\.org\/t\/p\/w780\//.test(url)) return url;
  const px = innerWidth * (devicePixelRatio || 1);
  const size = max > 1280 && px > 1400 ? 'original' : max > 780 && px > 900 ? 'w1280' : null;
  return size ? url.replace('/t/p/w780/', `/t/p/${size}/`) : url;
}
const metaFor = (t) => [t.year, isSeries(t) ? T('Series') : T('Film'), t.type === 'svt' && 'SVT Play', t.rating && `★ ${fmtRating(t.rating)}`, ...genreNames(t)].filter(Boolean).join(' · ');
// A title page's extras (logo art, runtime, genres, cast, similar titles: /api/title/:type/:id/page), kept for hours.
const pageInfo = (type, id) => cachedFor(`/api/title/${type}/${id}/page`, 6 * 3600 * 1000).then((d) => d.page);

// Films whose first release date (TMDB's, on cards) is still ahead. The title page knows more: page.release.
const isoToday = () => new Date().toISOString().slice(0, 10);
const filmUnreleased = (t) => t.type === 'movie' && /^\d{4}-\d{2}-\d{2}/.test(t.date || t.releaseDate || '') && (t.date || t.releaseDate).slice(0, 10) > isoToday();
// Nothing to add yet, from what a card knows: a future film, a film from the Coming soon row (the server
// already ran filmOut on those: in cinemas but not out to stream counts as not out), or a new series whose
// first episode hasn't aired. A new season of a running show still has its earlier seasons to add.
const cardUnreleased = (t) => t.type === 'movie' ? filmUnreleased(t) || Boolean(t.soon)
  : t.type === 'tv' && (t.soon?.kind === 'premiere' || (/^\d{4}-\d{2}-\d{2}/.test(t.date || '') && t.date.slice(0, 10) > isoToday()));
// What the Coming soon button's line says, from page.release (server.js titlePage, watchlist.js filmOut).
function comingSoonText(rel) {
  const day = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const today = isoToday();
  const line = (rel.kind === 'digital' || rel.kind === 'disc') && rel.date > today
    ? T(rel.kind === 'digital' ? 'Out to stream {0}' : 'Out on disc {0}', day(rel.date))
    : rel.cinema && rel.cinema > today ? T('In cinemas {0}', day(rel.cinema))
    : rel.cinema && rel.expect ? T('In cinemas now · streaming expected around {0}', day(rel.expect))
    : T('Not out yet · no release date');
  return canGet() ? `${line}. ${T('Save it and Lilin adds it once a good copy is out.')}` : `${line}.`;
}

// The one thing worth doing with a title from a card or the billboard: Play. It plays at once when it's on the
// server, else it gets ready in the player (playTitle). Nothing to play yet (not out, or nobody may fetch it): the
// title page says why.
function quickAction(t) {
  if (!t?.id || !['movie', 'tv'].includes(t.type)) return null;
  if (t.type === 'tv') {
    if (!isInstant(t) && !canGet()) return null;
    if (cardUnreleased(t) && !isInstant(t)) return null; // not aired yet: the corner Follow is the action
    return { icon: 'play', label: T('Play'), run: (b) => playShow(t, b) };
  }
  const s = titleState(t);
  const file = s.ready.find((f) => !f.converting);
  if (file) return { icon: 'play', label: partlyWatched(savedProgress(file)) ? T('Resume') : T('Play'), run: () => openPlayer(file) };
  if (s.ready.length) return null; // being prepared: the page shows where it is
  if (s.onServer.length || s.active.length) return { icon: 'play', label: T('Play'), run: (b) => playTitle({ t }, b) };
  if (!canGet() || cardUnreleased(t)) return null; // still to come: the page says Coming soon
  return { icon: 'play', label: T('Play'),
    // The card's dates can't see a film that's in cinemas but not out to stream (filmOut's 90 days):
    // the title page's release info settles it, and the card drops its Play when it says not out.
    stale: () => (state.status.search ? pageInfo('movie', t.id) : Promise.resolve(null))
      .then((page) => Boolean(page?.release && !page.release.out)).catch(() => false),
    run: (b) => playTitle({ t }, b) };
}

const wordedBadge = (t) => ownershipBadge(t, { words: true });
const billboard = createBillboard({ h, icon, cachedFor, pageInfo, openDetails, quickAction, ownershipBadge: wordedBadge, metaFor, bigArt });
const peek = createPeek({ h, icon, pageInfo, openDetails, quickAction, ownershipBadge, metaFor, bigArt });
// The header sits over the billboard while there is one (style.css: body.has-billboard).
new MutationObserver(() => document.body.classList.toggle('has-billboard', state.view === 'discover' && Boolean($('#discover-body .billboard'))))
  .observe($('#discover-body'), { childList: true, subtree: true });

// ---------- Discover: rows of your own ----------
// Anime: episodes of library shows TMDB calls anime (films carry no such flag, so they stay out).
const animeShow = (id) => state.libraryShows.some((s) => s.id === id && s.anime);
const homeType = (f) => (disc.type === 'all' ? true : disc.type === 'anime' ? Boolean(f.show) && animeShow(f.show) : disc.type === 'tv' ? f.season != null || Boolean(f.show) : f.season == null && !f.show);
// Continue watching, on Discover too: landscape cards that resume where you stopped.
// ---- where to pick a show up ----
// The server keeps the last episode you finished of each show (state.finished, "tv:ID" → { season, episode, at });
// finishing one here updates it at once.
function noteFinished(f, at = Date.now()) {
  const key = f?.season != null && titleKeyOf(f);
  if (!key || !/^tv:/.test(key)) return;
  state.finished = { ...(state.finished || {}), [key]: { season: f.season, episode: f.episode, at } };
  const seen = state.seen?.[key] || [];
  state.seen = { ...(state.seen || {}), [key]: [...seen, `${f.season}:${f.episode}`] };
}
// Finished this episode of this show at some point (any device)? showKey: "tv:1399".
const seenEpisode = (showKey, season, episode) => Boolean(showKey && episode != null && state.seen?.[showKey]?.includes(`${season}:${episode}`));
const watchedMark = () => h('span', { class: 'watched-mark' }, icon('check'), T('Watched'));
const watchedBadge = () => h('span', { class: 'watched-badge', 'aria-hidden': 'true' }, icon('check'));
const byEpisodeOrder = (a, b) => (a.season - b.season) || (a.episode - b.episode);
// The newest of: an episode you're partway through, or the one after the last you finished. Nothing watched
// yet: the first episode. Returns { f, progress, kind: 'resume' | 'next' | 'start', at } or null (all caught up).
function nextUp(showId, files = state.library) {
  const eps = [...new Map(files.filter((f) => f.show === showId && f.season != null && f.episode != null)
    .sort(byEpisodeOrder).map((f) => [`${f.season}:${f.episode}`, f])).values()];
  if (!eps.length) return null;
  const main = eps.some((f) => f.season > 0) ? eps.filter((f) => f.season > 0) : eps; // specials only when that's all there is
  const partial = eps.map((f) => ({ f, progress: savedProgress(libraryFile(f)) })).filter((x) => partlyWatched(x.progress))
    .sort((a, b) => (b.progress.at || 0) - (a.progress.at || 0))[0];
  const fin = state.finished?.[titleKeyOf({ show: showId })];
  const next = fin && main.find((f) => f.season > fin.season || (f.season === fin.season && f.episode > fin.episode));
  // Partway through the finished episode itself or the one after it: resume it whatever the clocks say (a rewatch,
  // or the next one). Any other episode only when it's newer than the finish: an old peek at a later season
  // mustn't take the place of the episode they just reached.
  const resumeAnyway = (f) => (f.season === fin.season && f.episode === fin.episode) || (next && f.season === next.season && f.episode === next.episode);
  if (partial && (!fin || resumeAnyway(partial.f) || (partial.progress.at || 0) >= fin.at)) return { ...partial, kind: 'resume', at: partial.progress.at || 0 };
  if (fin) {
    // Started and quit at once (not "partway" yet): still the newest thing of this show.
    const touched = next && savedProgress(libraryFile(next))?.at;
    return next ? { f: next, progress: null, kind: 'next', at: Math.max(fin.at, touched || 0) } : null;
  }
  return { f: main[0], progress: null, kind: 'start', at: 0 };
}
// "Up next" cards for Continue watching: shows whose last finished episode has a next one ready, and
// nothing partway through (that card is already there).
function upNextItems(files) {
  const shows = [...new Set(files.filter((f) => f.show && f.season != null).map((f) => f.show))];
  return shows.map((id) => nextUp(id, files)).filter((x) => x?.kind === 'next' && !hiddenFromContinue(x.f, { at: x.at }));
}

// Taken out of Continue watching (the ⋯ menu), kept on the server so every device agrees: title → when.
// Goes by the whole title (a show, not one episode), so an older half-watched episode can't take its place.
// Watching anything of it again brings it back.
const continueKey = (f) => titleKeyOf(f) || (f.show ? `show:${f.show}` : progressRef(libraryFile(f)));
const hiddenFromContinue = (f, progress) => { const at = state.hidden?.[continueKey(f)]; return at != null && at >= (progress?.at || 0); };
// Hides from before they were synced lived in this browser only (one video each): move them over once.
const LEGACY_HIDDEN = 'continue:hidden';
let legacyHiddenMoved = false;
function moveLegacyHidden(files) {
  if (legacyHiddenMoved || !files.length) return;
  legacyHiddenMoved = true;
  let old;
  try { old = JSON.parse(localStorage.getItem(LEGACY_HIDDEN)); } catch { return; }
  if (!old || typeof old !== 'object') return;
  const byRef = new Map(files.map((f) => [progressRef(libraryFile(f)), f]));
  const moves = [];
  for (const [ref, at] of Object.entries(old)) {
    const f = byRef.get(ref);
    if (!f) continue;
    const key = continueKey(f);
    if ((state.hidden[key] || 0) < at) state.hidden = { ...state.hidden, [key]: at };
    moves.push(api('/api/me/continue/hide', jsonPost({ key, at })));
  }
  Promise.all(moves).then(() => { try { localStorage.removeItem(LEGACY_HIDDEN); } catch { /* blocked */ } }, () => { legacyHiddenMoved = false; });
}
// What Continue watching shows (Discover and Library both use this, so they always agree): everything partway
// plus Up next cards, newest first, one card per show (its latest), at most 12.
function continueItems(files) {
  moveLegacyHidden(state.library || []);
  const watching = [...files.map((f) => ({ f, progress: savedProgress(libraryFile(f)) }))
    .filter((x) => partlyWatched(x.progress) && !hiddenFromContinue(x.f, x.progress)).map((x) => ({ ...x, at: x.progress.at || 0 })), ...upNextItems(files)]
    .sort((a, b) => b.at - a.at);
  const seen = new Set(), items = [];
  for (const x of watching) {
    const key = x.f.show || x.f.mediaKey || x.f.id;
    if (seen.has(key) || items.length >= 12) continue;
    seen.add(key); items.push(x);
  }
  return items;
}
function continueRow() {
  const cards = continueItems(state.library.filter(homeType)).map(({ f, progress }) => continueCard(f, progress));
  return cards.length ? continueShelf(cards) : null;
}
// New episodes: shows you follow, or watch and still have in your library, with episodes from the last two weeks
// you haven't seen, here (yours or anyone's) and past where you are. Shows already in Continue watching stay there.
// A show you removed from your library (only someone else's copy left) stays out unless you follow it.
function newEpisodeItems() {
  const since = Date.now() - 14 * 86400000;
  const followed = new Set(watch.items.filter((i) => i.type === 'tv' && i.follow).map((i) => Number(i.id)));
  const continuing = new Set(continueItems(state.library).map((x) => x.f.show).filter(Boolean));
  const mine = new Set(state.library.map((f) => f.show).filter(Boolean));
  const out = [];
  for (const s of state.libraryShows) {
    if (s.tmdbId == null || continuing.has(s.id) || (disc.type === 'anime' && !s.anime)) continue;
    if (!mine.has(s.id) && !followed.has(Number(s.tmdbId))) continue;
    const fin = state.finished?.[`tv:${s.tmdbId}`];
    const eps = [...state.library, ...state.server].filter((f) => f.show === s.id && f.season != null && f.episode != null);
    const watched = Boolean(fin) || eps.some((f) => savedProgress(libraryFile(f)));
    if (!watched && !followed.has(Number(s.tmdbId))) continue;
    const fresh = new Set(eps.filter((f) => (f.addedAt || f.added || 0) > since && !savedProgress(libraryFile(f))
      && (!fin || f.season > fin.season || (f.season === fin.season && f.episode > fin.episode))).map((f) => `${f.season}:${f.episode}`));
    if (fresh.size) out.push({ s, n: fresh.size, at: Math.max(...eps.map((f) => f.addedAt || f.added || 0)) });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 20);
}
function newEpisodesRow() {
  if (disc.type === 'movie') return null;
  const items = newEpisodeItems();
  if (!items.length) return null;
  const cards = items.map(({ s, n }) => {
    const li = titleCard({ type: 'tv', id: s.tmdbId, title: s.title, year: s.year, poster: s.poster, backdrop: s.backdrop, overview: s.overview });
    li.querySelector('.poster').append(h('span', { class: 'new-badge' }, n === 1 ? T('New') : T('{0} new', n)));
    li.querySelector('.sub').textContent = n === 1 ? T('{0} new episode', n) : T('{0} new episodes', n);
    return li;
  });
  return carousel(T('New episodes'), h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': T('New episodes') }, cards), null, 'home-shelf');
}
// Saved for later (Save on a title page): only when something is saved; films not out yet say when.
function savedRow() {
  const items = watch.items.filter((i) => i.saved && (disc.type === 'all' || disc.type === i.type));
  if (!items.length) return null;
  const upcoming = new Map(comingUp(items, todayIso()).map((c) => [c.item, c]));
  const cards = items.map((i) => {
    const li = titleCard({ type: i.type, id: i.id, title: i.title, year: i.year, poster: i.poster, backdrop: i.backdrop });
    const soon = upcoming.get(i);
    if (soon) li.querySelector('.sub').textContent = `${soon.what} · ${soon.when}`;
    return li;
  });
  return carousel(T('Saved for later'), h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': T('Saved for later') }, cards), null, 'home-shelf saved-shelf');
}
// Instant (#discover/instant): everything on the server, newest first or A–Z, a page at a time.
const INSTANT_SORTS = [['newest', T('Newest')], ['title', 'A–Z']];
function instantView(content) {
  const type = allOnInstant(disc.type);
  let list = instantTitles().filter((x) => type === 'all' || x.t.type === type);
  if (disc.instantSort === 'title') list = list.toSorted((a, b) => String(a.t.title).localeCompare(String(b.t.title), locale));
  const grid = h('ul', { class: 'grid' });
  const more = h('button', { class: 'load-more', hidden: true }, T('Load more'));
  let shown = 0;
  const card = (t) => { const li = titleCard(t); li.querySelector('.instant-mark')?.remove(); return li; }; // all of them play at once
  const page = () => { grid.append(...list.slice(shown, shown + 60).map((x) => card(x.t))); shown += 60; more.hidden = shown >= list.length; };
  more.addEventListener('click', page);
  const head = h('div', { class: 'instant-head' },
    h('p', { class: 'muted' }, list.length === 1 ? T('1 title plays right away') : T('{0} titles play right away', list.length)),
    list.length > 1 && segmented(INSTANT_SORTS, disc.instantSort || 'newest', (v) => { disc.instantSort = v; renderDiscover(); }, T('Sort by')));
  if (!list.length) {
    content.replaceChildren(emptyState(T('Nothing here plays instantly yet'), T('Press Play on anything in Discover. It’s ready in about a minute, and after that it plays at once for everyone.')));
    return;
  }
  page();
  content.replaceChildren(head, grid, more);
}
// What you watched last (with a TMDB id), newest first: the seeds for For you.
function watchedSeeds() {
  const shows = new Map(state.libraryShows.map((x) => [x.id, x]));
  const seeds = [], seen = new Set();
  const items = state.library.filter(homeType).map((f) => ({ f, p: savedProgress(libraryFile(f)) })).filter((x) => x.p?.at)
    .sort((a, b) => b.p.at - a.p.at);
  for (const { f } of items) {
    const show = shows.get(f.show);
    const seed = show?.tmdbId ? { type: 'tv', id: show.tmdbId, title: show.title } : f.tmdbId && f.season == null ? { type: 'movie', id: f.tmdbId, title: f.filmTitle || f.title } : null;
    if (!seed || seen.has(`${seed.type}:${seed.id}`)) continue;
    seen.add(`${seed.type}:${seed.id}`); seeds.push(seed);
    if (seeds.length >= 4) break;
  }
  return seeds;
}
const ownedTitle = (t) => matchesFor(t).some((f) => f.done) || (t.type === 'tv' && state.libraryShows.some((x) => x.tmdbId === t.id));
// For you: titles like the last few things you watched, the ones several of them point at first. Its See all page
// groups them by what you watched ("Because you watched …").
async function forYouGroups(seeds, signal) {
  const pages = await Promise.all(seeds.map((x) => pageInfo(x.type, x.id).catch(() => null)));
  if (signal.aborted) return [];
  return seeds.map((seed, i) => ({ seed, items: (pages[i]?.similar || []).filter((t) => !ownedTitle(t) && (disc.type === 'all' || t.type === disc.type)) }));
}
function forYouItems(groups) {
  const tally = new Map();
  for (const { items } of groups) for (const t of items) {
    const key = `${t.type}:${t.id}`, hit = tally.get(key) || { t, n: 0 };
    hit.n += 1; tally.set(key, hit);
  }
  return [...tally.values()].sort((a, b) => b.n - a.n || (b.t.rating || 0) - (a.t.rating || 0)).map((x) => x.t).slice(0, 20);
}
async function forYouRow(seeds, signal) {
  const items = forYouItems(await forYouGroups(seeds, signal));
  if (items.length < 4 || signal.aborted) return null;
  return carousel(T('For you'), h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': T('For you') }, items.map(titleCard)),
    h('button', { class: 'see-all', onclick: () => { leaveDiscoverHome(); disc.list = { key: 'for-you', title: T('For you') }; window.scrollTo({ top: 0 }); renderDiscover(); } }, T('See all')), 'home-shelf');
}
async function forYouPage(content, signal) {
  content.replaceChildren(skeletonGrid());
  const groups = (await forYouGroups(watchedSeeds(), signal)).filter((g) => g.items.length);
  if (signal.aborted) return;
  content.replaceChildren(...(groups.length ? groups.map((g) => h('section', { class: 'lib-group' },
    h('h3', { class: 'lib-subhead' }, T('Because you watched {0}', g.seed.title)), titleGrid(g.items)))
    : [notice(T('Nothing here'), T('Watch something and Lilin finds more like it.'))]));
}
// Popular and Top rated on All: TMDB's film and show lists woven into one row (the TV apps keep both rows).
const MERGED_ROWS = { 'popular-movie': ['popular-tv', 'Popular'], 'top-movie': ['top-tv', 'Top rated'] };
function mergeHomeRows(rows) {
  const out = [];
  for (const r of rows) {
    if (Object.values(MERGED_ROWS).some(([tv]) => tv === r.key) && rows.some((x) => MERGED_ROWS[x.key]?.[0] === r.key)) continue;
    const pair = MERGED_ROWS[r.key] && rows.find((x) => x.key === MERGED_ROWS[r.key][0]);
    if (!pair) { out.push(r); continue; }
    const items = [], seen = new Set();
    for (let i = 0; i < Math.max(r.items.length, pair.items.length); i++) for (const t of [r.items[i], pair.items[i]]) {
      if (t && !seen.has(`${t.type}:${t.id}`)) { seen.add(`${t.type}:${t.id}`); items.push(t); }
    }
    out.push({ key: r.key, keys: [r.key, pair.key], title: T(MERGED_ROWS[r.key][1]), items });
  }
  return out;
}
// Rows that arrive later fill a slot, so nothing above them jumps.
function rowSlot(promise, signal) {
  const slot = h('div', { class: 'row-slot' });
  promise.then((el) => { if (signal.aborted || !slot.isConnected) return; slot.replaceWith(el || ''); }).catch(() => slot.remove());
  return slot;
}
// Shaped like what's coming: the billboard, then rows of posters.
function homeSkeleton() {
  const posters = (n) => h('ul', { class: 'shelf-items', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('li', { class: 'skeleton' }, h('div', { class: 'poster' }), h('div', { class: 'bar' }))));
  return h('div', { class: 'home-skeleton', 'aria-busy': 'true', 'aria-label': T('Loading…') },
    h('div', { class: 'billboard skel-billboard' }, h('div', { class: 'bb-copy' }, h('div', { class: 'skel skel-line wide' }), h('div', { class: 'skel skel-line' }), h('div', { class: 'skel skel-btn' }))),
    ...[0, 1].map(() => h('div', { class: 'shelf' }, h('div', { class: 'skel skel-line shelf-skel-head' }), posters(8))));
}

// Paged grid for a genre or a "See all" list, with a Load more button.
async function pagedGrid(content, urlFor, signal, gridClass = 'grid') {
  const seen = new Set();
  const grid = h('ul', { class: gridClass });
  const more = h('button', { class: 'load-more', hidden: true }, T('Load more'));
  let page = 0;
  const load = async () => {
    more.disabled = true;
    more.textContent = T('Loading…');
    try {
      const data = await cachedApi(urlFor(page + 1), signal);
      if (page === 0) {
        if (!data.results.length) { content.replaceChildren(notice(T('Nothing here'), T('Try another genre or type.'))); return; }
        content.replaceChildren(grid, more);
      }
      page = data.page;
      const fresh = data.results.filter((t) => !seen.has(`${t.type}:${t.id}`)); // pages can overlap
      fresh.forEach((t) => seen.add(`${t.type}:${t.id}`));
      grid.append(...fresh.map(titleCard));
      more.hidden = page >= data.totalPages;
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (page === 0) content.replaceChildren(notice(T('Couldn’t load this'), err.message, () => { content.replaceChildren(skeletonGrid()); load(); }));
      else toast(err.message);
    } finally {
      more.disabled = false;
      more.textContent = T('Load more');
    }
  };
  more.addEventListener('click', load);
  content.replaceChildren(skeletonGrid());
  await load();
}

// Discover's home, at most 12 blocks: billboard · Right now · (the control row) · Continue watching · Moods ·
// Trending · For you · Popular on Lilin · then TMDB's rows (on All, Popular and Top rated are one row each).
// Films and Shows keep the same order with their own TMDB rows. Sub-pages (See all, a genre, a mood) have no Right now.
async function renderDiscover() {
  const body = $('#discover-body');
  const heading = $('#discover-heading');
  heading.textContent = T('Discover');
  heading.classList.add('sr-only');

  if (!state.status.search) {
    body.replaceChildren(notice(T('Discover isn’t set up yet'),
      T('Add a free TMDB token as TMDB_TOKEN in the .env file, then restart the server.')));
    return;
  }

  searchCtrl?.abort();
  searchCtrl = new AbortController();
  const { signal } = searchCtrl;

  if (!disc.genres) {
    try { disc.genres = (await cachedApi('/api/discover/genres', signal)).genres; } catch { disc.genres = []; }
    if (signal.aborted) return;
  }
  const content = h('div', { class: 'discover-content' });
  // vibes: a mood's page has its own header and type filter
  if (vibesUi.active()) { body.replaceChildren(content); return vibesUi.render(content, signal); }
  const home = !disc.list && !disc.genre;
  if (instantPage()) {
    body.replaceChildren(h('h3', { class: 'instant-title' }, icon('bolt'), T('Plays instantly')), discoverControls(), content);
    if (!state.status.library) { content.replaceChildren(notice(T('Nothing here plays instantly yet'), T('No media folder is configured.'))); return; }
    instantView(content);
    return;
  }
  body.replaceChildren(...(home ? [] : [discoverControls()]), content);
  if (discoverAtHome()) restoreDiscoverHome(); // back from a category: where you were

  if (disc.type === 'docs') {
    if (documentaries.inCategory()) { body.prepend(discoverControls()); return documentaries.render(content, signal); }
    await documentaries.render(content, signal);
    if (!signal.aborted && !body.querySelector('.discover-controls')) content.prepend(...homeTop(null)); // no billboard today
    return;
  }

  if (disc.list?.key === 'for-you') {
    content.before(h('div', { class: 'discover-head' },
      h('button', { class: 'back-link', onclick: () => { disc.list = null; renderDiscover(); } }, T('‹ Discover')), h('h3', {}, disc.list.title)));
    return forYouPage(content, signal);
  }
  if (disc.list && comingSoon.handles(disc.list.key)) return comingSoon.page(content, signal); // comingsoon: its own page
  if (disc.list) {
    const { keys } = disc.list;
    content.before(h('div', { class: 'discover-head' },
      h('button', { class: 'back-link', onclick: () => { disc.list = null; renderDiscover(); } }, T('‹ Discover')),
      h('h3', {}, disc.list.title),
      keys && segmented([[keys[0], T('Films')], [keys[1], T('Shows')]], disc.list.key, (key) => { disc.list = { ...disc.list, key }; renderDiscover(); }, T('Show'))));
    return pagedGrid(content, (page) => `/api/discover/list?key=${disc.list.key}&page=${page}`, signal);
  }

  if (disc.genre) {
    const g = disc.genre;
    content.before(h('div', { class: 'discover-head' },
      h('button', { class: 'back-link', onclick: () => { disc.genre = null; renderDiscover(); } }, T('‹ Discover')),
      h('h3', {}, g.name),
      segmented(SORT_LABELS, disc.sort, (sort) => { disc.sort = sort; renderDiscover(); }, T('Sort by'))));
    return pagedGrid(content, (page) => `/api/discover/genre?type=${disc.type}&movie=${g.movie || ''}&tv=${g.tv || ''}&sort=${disc.sort}&page=${page}`, signal);
  }

  content.replaceChildren(homeSkeleton());
  try {
    const data = await cachedApi(`/api/discover/home?type=${disc.type}`, signal);
    // Popular on Lilin arrives separately (it's quick, but shouldn't hold up TMDB's rows).
    const popularSlot = h('div', { class: 'popular-slot' });
    const anime = disc.type === 'anime'; // Anime: no Moods, daypart, For you or Popular on Lilin (they can't tell what's anime)
    const seeds = anime ? [] : watchedSeeds();
    const rows = (disc.type === 'all' ? mergeHomeRows(data.rows) : data.rows).map((r) => (comingSoon.handles(r.key) ? comingSoon.row(r) : row(r))); // comingsoon: dated cards
    const [trending, ...rest] = rows;
    const moods = anime ? Promise.resolve(null) : pickUi.tile(signal).catch(() => null) // pick: the first Moods tile
      .then((pick) => vibesUi.row(disc.type, signal, { lead: pick })); // vibes: the Moods row
    content.replaceChildren(...[
      ...homeTop(data.featured.length ? billboard(data.featured, { signal, label: anime ? T('New this season') : T('Trending this week') }) : null),
      continueRow(),
      newEpisodesRow(),
      !anime && rowSlot(daypartUi.row(disc.type, signal), signal), // daypart: Good morning / Late night
      savedRow(),
      !anime && rowSlot(moods, signal),
      trending,
      seeds.length > 0 && rowSlot(forYouRow(seeds, signal), signal),
      !anime && popularSlot,
      ...rest,
    ].filter(Boolean));
    if (!anime) social.popularShelf(disc.type, { carousel, titleCard, signal }).then((shelf) => { if (shelf && !signal.aborted) popularSlot.replaceWith(shelf); });
  } catch (err) {
    if (err.name !== 'AbortError') content.replaceChildren(notice(T('Couldn’t load Discover'), err.message, renderDiscover));
  }
}
// The top of Discover (and of Documentaries): search (phones), the billboard and the control row.
// (The "Right now" strip is off: Oliver found it annoying. right-now.js stays for now; unused.)
function homeTop(bb) {
  return [bb, discoverControls()].filter(Boolean);
}
// Documentaries draws its own billboard: the same top goes with it.
const docsBillboard = (items, o) => { const f = document.createDocumentFragment(); f.append(...homeTop(billboard(items, o))); return f; };

// ---- Right now (right-now.js): what it ranks, and what its rows do ----
const rnData = { parties: null, partiesAt: 0, wrapped: undefined };
function rightNowContext() {
  const jobs = state.convert?.active || (state.convert?.current ? [state.convert.current] : []);
  return {
    now: Date.now(), locale, owner: Boolean(state.status?.admin), entries: unifiedLibrary(), keep: Boolean(state.me?.keep), canExtend, extendDays: extendDays(),
    parties: (rnData.parties || []).map((p) => ({ token: p.token, startsAt: p.startsAt, started: p.started, mine: p.mine, host: p.host,
      title: partyTitle(p.media), poster: state.library.find((f) => f.id === p.media?.id)?.poster })),
    played: (f) => Boolean(savedProgress(libraryFile(f))),
    convert: (e) => jobs.find((j) => e.files.some((f) => f.converting && j.name === f.file))?.percent ?? null,
    travel: travelView.items, touch: touchDevice(), wrapped: rnData.wrapped || null,
  };
}
// Parties (a minute old at most) and the Wrapped season arrive after the page; the strip updates when they do.
async function loadRightNow(force = false) {
  const jobs = [];
  if (force || Date.now() - rnData.partiesAt > 60000) {
    rnData.partiesAt = Date.now();
    jobs.push(api('/api/watch/parties').then((d) => { rnData.parties = d.parties || []; }).catch(() => {}));
  }
  const year = state.status?.wrapped?.year;
  if (year && rnData.wrapped === undefined) {
    rnData.wrapped = null;
    let hidden = null, seen = null;
    try { hidden = localStorage.getItem('lilin:wrappedHidden'); seen = localStorage.getItem('lilin:wrappedSeen'); } catch { /* private mode */ }
    if (hidden !== String(year)) jobs.push(api(`/api/me/wrapped?year=${year}`).then((w) => { if (!w.empty) rnData.wrapped = { year, again: seen === String(year) }; }).catch(() => {}));
  }
  if (!jobs.length) return;
  await Promise.all(jobs);
  rightNow.update();
}
async function runRightNow(a, opener) {
  if (a.do === 'join') return offerWatchRoom(a.token);
  if (a.do === 'route') return setView(a.to);
  if (a.do === 'title') return openUnifiedTitle(a.entry, opener);
  if (a.do === 'wrapped') return openWrapped(a.year, opener);
  if (a.do === 'travel') return openTravelList(opener);
  if (a.do === 'keep') { opener.disabled = true; await extendItems(a.files); return rightNow.update(); }
  if (a.do === 'play') {
    const e = a.entry;
    e.files.forEach(rightNow.played);
    const up = e.show && nextUp(e.show.id);
    if (up?.f || e.files[0]) return openPlayer(libraryFile(up?.f || e.files[0]));
    const x = entryTarget(e);
    return x ? playTitle(x, opener) : openUnifiedTitle(e, opener);
  }
}
// A Right now row's title as a Play target: a film, or the episode a show's transfer brings.
function entryTarget(e) {
  const d = e.transfers[0];
  if (!d?.tmdbId) return null;
  const t = { type: e.show || d.mediaType === 'tv' ? 'tv' : 'movie', id: Number(d.tmdbId), title: e.name, poster: e.poster, backdrop: d.backdrop };
  if (t.type === 'movie') return { t };
  const ep = d.episodes?.[0] || (d.episode != null ? { season: d.season, episode: d.episode } : null);
  return ep ? { t, season: ep.season, episode: ep.episode } : null;
}
const rightNow = createRightNow({ h, icon, toast, context: rightNowContext, run: runRightNow });
// ---------- Library ----------
let libraryRequest = null;
let libraryLastChecked = 0;
let libraryProgressRevision = 0;
function invalidateLibraryProgress() { libraryProgressRevision++; }
let librarySignature = null;
let libraryRenderPending = false;
let libraryRefreshNeeded = false;
const libraryContentSignature = (data) => JSON.stringify([
  [...data.items].sort((a, b) => String(a.id).localeCompare(String(b.id))),
  [...(data.server || [])].sort((a, b) => String(a.id).localeCompare(String(b.id))),
  [...(data.shows || [])].sort((a, b) => String(a.id).localeCompare(String(b.id))),
]);
function loadLibrary() {
  if (!state.status.library) return Promise.resolve(false);
  if (libraryRequest) return libraryRequest;
  libraryLastChecked = Date.now();
  libraryRequest = (async () => {
    try {
      const data = await api('/api/library', { signal: AbortSignal.timeout(15000) });
      const signature = libraryContentSignature(data);
      const changed = signature !== librarySignature || state.libraryError !== null;
      if (signature !== librarySignature) {
        state.libraryItems = data.items;
        state.library = data.items.map(applyVersion);
        if (pendingDeletes.size) dropFromLibrary([...pendingDeleteIds()]); // still inside their Undo time
        state.server = data.server || [];
        state.libraryShows = data.shows || [];
        librarySignature = signature;
      }
      state.libraryError = null;
      libraryRenderPending ||= changed;
      updateUpNext();
      return changed;
    } catch (err) {
      const changed = state.libraryError !== err.message;
      state.libraryError = err.message;
      libraryRenderPending ||= changed;
      return changed;
    } finally { libraryRequest = null; }
  })();
  return libraryRequest;
}

// Background refreshes leave open sheets and the player intact. Restore the focused card and
// scroll position when the library itself changes; unchanged responses never rebuild its DOM.
function renderUpdatedLibrary() {
  if (!libraryRenderPending || state.view !== 'library' || overlayStack.length) return;
  const body = $('#library-body');
  const focused = document.activeElement;
  const key = focused?.getAttribute?.('data-library-focus');
  if (body.contains(focused) && !key) return; // an unkeyed control is currently being used
  const matches = key ? [...body.querySelectorAll('[data-library-focus]')].filter((el) => el.getAttribute('data-library-focus') === key) : [];
  const index = matches.indexOf(focused);
  const x = window.scrollX, y = window.scrollY;
  renderLibrary();
  if (key) [...body.querySelectorAll('[data-library-focus]')].filter((el) => el.getAttribute('data-library-focus') === key)[Math.max(0, index)]?.focus({ preventScroll: true });
  window.scrollTo(x, y);
}

async function loadConvert() {
  try { const next = await api(`/api/convert?plays=${extraPlayable()}`); if (state.convert?.current?.name && state.convert.current.name !== next.current?.name) libraryRefreshNeeded = true; state.convert = next; } catch { state.convert = null; }
}

// What each conversion job is for (src/convert.js sets `purpose`): one file can get two jobs,
// an MP4 for Apple devices and later an H.264 copy for browsers that can't play HEVC.
const CONVERT_PURPOSE = {
  apple: T('Making an MP4 copy that plays on iPhone and Apple TV'),
  'browser-h264': T('Making a one-time H.264 copy for browsers that can’t play HEVC. You can already watch it.'),
  'browser-audio': T('Making a browser copy with audio every browser can play. You can already watch it.'),
  subtitles: T('Saving the original’s subtitles before it’s removed'),
};

// Conversion progress banner shown at the top of the library.
function renderConvertBanner() {
  const el = $('#convert-banner');
  if (!el) return;
  const c = state.convert;
  const parts = [];
  const running = c?.active || (c?.current ? [c.current] : []);
  if (running.length) {
    running.forEach((cur, i) => {
      const bits = [h('strong', {}, `${cur.percent || 0}%`),
        cur.mode === 'Re-encoding' ? T('re-encoding') : cur.mode === 'Saving subtitles' ? T('saving subtitles') : T('quick repackage'),
        cur.speed && T('{0} speed', cur.speed),
        cur.eta != null && fmtEta(cur.eta),
        i === running.length - 1 && c.queued > 0 && T('{0} more waiting', c.queued)];
      parts.push(h('div', { class: 'convert-job' },
        h('div', { class: 'row-title' }, T('Preparing playback: {0}', cur.name)),
        h('div', { class: 'dl-state' }, CONVERT_PURPOSE[cur.purpose] || CONVERT_PURPOSE.apple),
        h('div', { class: 'bulbs', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
          'aria-valuenow': String(Math.floor(cur.percent || 0)), 'aria-label': T('Conversion progress'),
          style: `--p:${cur.percent || 0}%` }, h('i')),
        h('div', { class: 'dl-stats' }, bits.filter(Boolean).map((b) => (b instanceof Node ? b : h('span', {}, b))))));
    });
  } else if (c && !c.enabled && c.reason && !/turned off/i.test(c.reason)) {
    parts.push(h('div', { class: 'dl-state' }, T('Automatic MP4 conversion is off. {0}', c.reason)));
  }
  if (c?.recentFailures?.length) {
    parts.push(h('details', { class: 'convert-failures' },
      h('summary', {}, (c.recentFailures.length > 1 ? T('{0} files couldn’t be converted', c.recentFailures.length) : T('{0} file couldn’t be converted', c.recentFailures.length))),
      h('ul', {}, c.recentFailures.map((f) => h('li', {}, h('strong', {}, f.name), ` ${f.error}`)))));
  }
  el.hidden = !parts.length;
  el.replaceChildren(...parts);
}

// The owner's Downloads page (House › Downloads) keeps its rows here between renders.
let libraryUI = null;
const unifiedLibrary = () => libraryUnion(state.library, state.libraryShows, state.downloads);
// "Pappa", "Pappa and Anita", "Pappa, Anita and Home network"
const nameList = (names) => names.length < 2 ? names.join('') : T('{0} and {1}', names.slice(0, -1).join(', '), names[names.length - 1]);
// The people this person shares one library with (the owner sets it in House › People).
const libraryMates = () => (state.me?.sharedWith || []).map((m) => m.name);

// ---- House › Downloads (owners): there is no Library tab any more (play first) ----
// The old Library view (#view-library) draws the owner's Downloads page: transfers that need a look and the ones on
// their way, Leaving soon (what the automatic delete takes next, with Keep), copies for this phone and the rule.
// Rows are kept between renders, so polling never steals focus.
function renderLibrary() {
  libraryRenderPending = false;
  const body = $('#library-body');
  if (!libraryUI || !body.contains(libraryUI.root)) {
    const root = h('div', { class: 'house-downloads' });
    libraryUI = { root, content: root, dl: null };
    body.replaceChildren(root);
  }
  renderLibraryDownloads(unifiedLibrary());
  updateOpenTitle();
}

// "214 titles · 1.2 TB · Next to go: Dune, 13 h left" and the deletion rule.
function libraryFoot(all) {
  const mine = state.library, r = state.rules || {};
  const next = mine.filter((f) => f.expiresAt != null).sort((a, b) => a.expiresAt - b.expiresAt)[0];
  const line = [plural(all.filter((e) => e.files.length).length, 'title'), fmtBytes(mine.reduce((n, f) => n + (f.size || 0), 0)),
    next && T('Next to go: {0}, {1}', [next.filmTitle || next.title, episodeLabel(next)].filter(Boolean).join(' '), timeLeft(next.expiresAt))].filter(Boolean).join(' · ');
  return [h('p', {}, line),
    h('p', { class: 'muted' }, state.me?.keep ? T('The owner has set your videos to stay until you delete them.')
      : r.retentionDays
        ? T('Videos are deleted {0} after they finish, to keep space free. Press Play and they come back. Keep holds on to one longer{1}.', plural(r.retentionDays, 'day'), r.maxExtensions ? T(' (up to {0} per video)', plural(r.maxExtensions, 'time')) : '')
        : T('Nothing is deleted automatically.'))];
}
// Leaving soon: titles the automatic delete takes within two days, soonest first, each with Keep.
function leavingRow(e) {
  const files = e.files.filter((f) => f.expiresAt != null);
  const at = Math.min(...files.map((f) => f.expiresAt));
  const eligible = files.filter(canExtend);
  return h('li', { class: 'rn-row' },
    h('button', { type: 'button', class: 'rn-open', onclick: (ev) => openUnifiedTitle(e, ev.currentTarget) },
      e.poster ? h('img', { class: 'rn-thumb', src: e.poster, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'rn-thumb rn-icon' }, icon('clock')),
      h('span', { class: 'rn-text' }, h('strong', { class: 'rn-title' }, e.name), h('span', { class: 'rn-sub' }, timeLeft(at)))),
    eligible.length > 0 && h('button', { type: 'button', class: 'chip rn-chip', onclick: async (ev) => { ev.currentTarget.disabled = true; await extendItems(eligible); renderLibrary(); } },
      T('Keep {0} more days', extendDays())));
}

// ---- Downloads: everything about transfers, in one place ----
// Preparing playback, Needs attention and On the way (one row per title, ⋯ = its transfers), Leaving soon, then
// On this phone and the line about what's here.
const touchDevice = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
function renderLibraryDownloads(all) {
  if (!libraryUI.dl) {
    const actions = h('div', { class: 'lib-actions' },
      state.status.torrents && canDownload() && h('button', { type: 'button', class: 'chip', onclick: (e) => findTorrents('', e.currentTarget) }, icon('search'), T('Find torrents')),
      state.me?.isOwner && h('button', { type: 'button', class: 'chip', onclick: (e) => openTransferDetails(null, e.currentTarget) }, T('All server downloads')));
    const section = (title, cls = 'rn-list') => { const list = h('ul', { class: cls }); return { list, node: h('section', { class: 'shelf dl-section', 'aria-label': title, hidden: true }, h('h3', { class: 'lib-subhead' }, title), list) }; };
    libraryUI.dl = { attention: section(T('Needs attention')), onway: section(T('On the way')), leaving: section(T('Leaving soon')), phone: section(T('On this phone'), 'rows travel-list'),
      rows: new Map(), notices: h('div'), empty: h('div'), foot: h('div', { class: 'library-foot' }) };
    const d = libraryUI.dl;
    libraryUI.content.append(...[actions.childElementCount && actions,
      h('section', { class: 'shelf dl-section' }, h('div', { class: 'dl convert-banner', id: 'convert-banner', hidden: true })),
      d.attention.node, d.onway.node, d.empty, d.leaving.node, d.phone.node, d.notices, d.foot].filter(Boolean));
  }
  const d = libraryUI.dl;
  const attention = all.filter((e) => e.attention), onway = all.filter((e) => !e.attention && (e.active.length || e.preparing));
  const seen = new Set();
  for (const [sec, list] of [[d.attention, attention], [d.onway, onway]]) {
    list.forEach((e, i) => {
      let row = d.rows.get(e.key);
      if (!row) { row = downloadRow(e); d.rows.set(e.key, row); }
      updateDownloadRow(row, e);
      seen.add(e.key);
      if (sec.list.children[i] !== row) sec.list.insertBefore(row, sec.list.children[i] || null);
    });
    sec.node.hidden = !list.length;
  }
  for (const [key, row] of d.rows) if (!seen.has(key)) { row.remove(); d.rows.delete(key); }
  const busy = attention.length + onway.length > 0 || Boolean(state.convert?.active?.length || state.convert?.current);
  const emptyKey = busy ? '' : 'empty';
  if (d.empty.dataset.key !== emptyKey) {
    d.empty.dataset.key = emptyKey;
    d.empty.replaceChildren(busy ? '' : emptyState(T('Nothing on its way'), T('Everything people press Play on that isn’t here yet shows here while it downloads.')));
  }
  const soon = all.filter((e) => e.files.some((f) => f.expiresAt != null && f.expiresAt - Date.now() < 48 * 3600000))
    .sort((a, b) => nextExpiry(a.files) - nextExpiry(b.files));
  const leavingKey = JSON.stringify(soon.map((e) => [e.key, nextExpiry(e.files), e.files.map((f) => f.extensions || 0)]));
  if (d.leaving.key !== leavingKey) {
    d.leaving.key = leavingKey;
    d.leaving.list.replaceChildren(...soon.map(leavingRow));
    d.leaving.node.hidden = !soon.length;
    d.foot.replaceChildren(...libraryFoot(all));
  }
  const copies = travelOrder(travelView.items);
  d.phone.node.hidden = !copies.length && !touchDevice();
  const phoneKey = JSON.stringify(copies.map((i) => [i.id, i.quality, i.state, i.percent, i.url, i.downloadedAt]));
  if (d.phone.key !== phoneKey) {
    d.phone.key = phoneKey;
    d.phone.list.replaceChildren(...(copies.length ? travelRows(copies, () => { d.phone.key = null; renderLibrary(); })
      : [h('li', { class: 'muted dl-none' }, T('Copies you save to watch offline show here.'))]));
  }
  const errors = [state.downloadsError && T('Downloads unavailable: {0}', state.downloadsError)].filter(Boolean);
  if (d.notices.textContent !== errors.join(' ')) d.notices.replaceChildren(...errors.map(message => h('p', { class: 'library-source-notice', role: 'status' }, message)));
  renderConvertBanner();
}
// One title's downloads as a row: art, name, state and percent, a bar, and ⋯ for the transfers (Pause, Delete, Retry).
function downloadRow(e) {
  const row = h('li', { class: 'rn-row' },
    h('button', { type: 'button', class: 'rn-open', 'data-library-focus': `dl-${e.key}`, onclick: (ev) => openUnifiedTitle(row._entry, ev.currentTarget) },
      h('span', { class: 'rn-thumb' }), h('span', { class: 'rn-text' }, h('strong', { class: 'rn-title' }), h('span', { class: 'rn-sub' }))),
    h('button', { type: 'button', class: 'icon-btn rn-more', 'data-library-focus': `dl-more-${e.key}`, onclick: (ev) => openTransferDetails(row._entry, ev.currentTarget) }, icon('more')),
    h('span', { class: 'rn-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i')));
  return row;
}
function updateDownloadRow(row, e) {
  const old = row._entry;
  row._entry = e;
  if (!old || old.poster !== e.poster) row.querySelector('.rn-thumb').replaceChildren(e.poster ? h('img', { src: e.poster, alt: '', loading: 'lazy', decoding: 'async' }) : icon('download'));
  const pct = e.progress == null ? null : Math.floor(e.progress * 100);
  row.querySelector('.rn-title').textContent = e.name;
  const sub = row.querySelector('.rn-sub');
  sub.textContent = [e.state, pct != null && `${pct}%`, e.speed > 0 && `${fmtBytes(e.speed)}/s`].filter(Boolean).join(' · ');
  row.classList.toggle('is-alert', e.attention);
  row.classList.toggle('is-paused', e.state === T('Paused'));
  row.querySelector('.rn-more').setAttribute('aria-label', T('Download details for {0}', e.name));
  const bar = row.querySelector('.rn-bar');
  bar.hidden = pct == null;
  bar.setAttribute('aria-label', T('{0} download progress', e.name));
  if (pct != null) { bar.setAttribute('aria-valuenow', String(pct)); bar.firstChild.style.width = `${pct}%`; }
}

function openUnifiedTitle(entry, opener) {
  const hashes = entry.transfers.map(d => d.hash);
  if (entry.show) return openShow(entry.show.id, opener, hashes);
  if (entry.files.length) return openFilm(entry.files[0], opener);
  openTitle({ fileId: `entry:${entry.key}`, hashes }, opener);
}
// ---------- shows ----------
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? T(one) : T(many)}`;
const episodeCount = (files) => new Set(files.map((f) => `${f.season}:${f.episode}`)).size;
// TMDB's season names are cached in English; the plain ones have a translation of their own.
const localSeasonName = (name, n) => (/^(Season \d+|Specials)$/.test(String(name || '')) || !name ? seasonName(n) : name);
const seasonName = (n) => (n === 0 ? T('Specials') : T('Season {0}', n));

// Library cards share the same identity as playback, including old browser resume points.
const libraryFile = (f) => ({ ...f, kind: 'lib', key: f.id, done: true });
const nextExpiry = (files) => Math.min(...files.map((f) => f.expiresAt ?? Infinity));
const partlyWatched = (p) => p?.duration > 0 && p.time / p.duration > 0.01 && p.time / p.duration < 0.95;

function libraryEntries(items) {
  const shows = new Map(state.libraryShows.map((s) => [s.id, s]));
  const grouped = new Map();
  const entries = [];
  for (const f of items) {
    const show = shows.get(f.show);
    if (!show) { entries.push({ name: f.filmTitle || f.title, files: [f] }); continue; }
    if (!grouped.has(show.id)) {
      const entry = { show, name: show.title, files: [] };
      grouped.set(show.id, entry);
      entries.push(entry);
    }
    grouped.get(show.id).files.push(f);
  }
  return entries;
}

// Continue watching scrolls like the Discover rows: arrows beside the title, hidden while every card fits.
function continueShelf(cards) {
  return carousel(T('Continue watching'),
    h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': T('Continue watching') }, cards), null, 'library-shelf continue-shelf');
}

// 16:9 artwork (episode stills, backdrops). Each source is tried in turn, then a themed placeholder.
// A source is a URL, or { src, contain: true } for a portrait poster shown whole. With `sizes`, TMDB's
// small stills also offer the 780px version, for large cards on high-density screens.
function wideArt(sources, cls = '', sizes = null) {
  const list = sources.map((s) => (typeof s === 'string' ? { src: s } : s)).filter((s) => s?.src);
  const next = () => {
    const s = list.shift();
    const srcset = sizes && /\/t\/p\/w300\//.test(s?.src) ? `${s.src} 300w, ${s.src.replace('/t/p/w300/', '/t/p/w780/')} 780w` : null;
    return s ? h('img', { src: s.src, srcset, sizes: srcset && sizes, alt: '', loading: 'lazy', decoding: 'async', class: s.contain ? 'is-contained' : null, onerror: (e) => e.currentTarget.replaceWith(next()) })
      : h('div', { class: 'wide-art-fallback', 'aria-hidden': 'true' }, icon('tv'));
  };
  return h('div', { class: `wide-art ${cls}`.trim() }, next());
}
// TMDB art for an episode: its own still, then the show's backdrop.
const episodeArt = (still, show, cls, sizes) => wideArt([still, show?.backdrop], cls, sizes);

// Continue watching: a sharp frame where you stopped, grabbed from the video by the server (cached there,
// times rounded to 10 s). It fades in over the still once it has loaded; if the video is gone the still stays.
function stoppedFrame(id, time, art) {
  const url = `/api/media/lib/${encodeURIComponent(id)}/still?t=${Math.floor(time / 10) * 10}`;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    if (!art.isConnected && !art.parentNode) return;
    const frame = h('span', { class: 'continue-frame', 'aria-hidden': 'true' }, h('i', { style: `background-image:url("${url}")` }));
    art.insertBefore(frame, art.querySelector('.poster-progress'));
    requestAnimationFrame(() => requestAnimationFrame(() => frame.classList.add('is-in')));
  };
  img.src = url;
}
const CONTINUE_SIZES = '(min-width: 1600px) 420px, (min-width: 900px) 340px, (min-width: 600px) 300px, 74vw'; // --row-wide
// Continue watching: landscape cards that resume playback. Episodes show their still, films a backdrop.
function continueCard(f, progress) {
  const show = state.libraryShows.find((s) => s.id === f.show);
  const name = show?.title || f.filmTitle || f.title;
  // progress null = "Up next": the episode after the last one you finished.
  const left = progress ? T('{0} min left', Math.max(1, Math.ceil((progress.duration - progress.time) / 60))) : T('Up next');
  const pct = progress ? progress.time / progress.duration * 100 : 0;
  // No countdown to the automatic delete (play first): one that leaves just gets ready again when it's played.
  const art = f.season != null ? episodeArt(f.still, show, '', CONTINUE_SIZES) : wideArt([f.backdrop, { src: f.poster, contain: true }]);
  if (progress) art.append(h('span', { class: 'poster-progress', 'aria-label': T('{0}% watched', Math.round(pct)) }, h('i', { style: `width:${pct}%` })));
  if (progress?.time > 20 && f.id) stoppedFrame(f.id, progress.time, art);
  return h('li', { class: `continue-card${progress ? '' : ' is-up-next'}` },
    h('button', { type: 'button', class: 'continue-more', 'aria-label': T('More for {0}', name), title: T('More'), onclick: (e) => openContinueMenu(f, progress, name, e.currentTarget) }, icon('more')),
    h('button', { type: 'button', class: 'title-card', 'data-library-focus': `play-${f.id}`, onclick: () => openPlayer(libraryFile(f)) },
      art, h('div', { class: 'name' }, h('span', { class: 'continue-title', title: T('Details'),
        // The name opens the title page instead of playing (the rest of the card still resumes).
        onclick: (e) => { e.stopPropagation(); const b = e.currentTarget.closest('button'); show ? openShow(show.id, b) : openFilm(f, b); } }, name)),
      f.season != null && f.episodeName && h('div', { class: 'sub continue-episode' }, f.episodeName),
      h('div', { class: 'sub' }, [episodeLabel(f), left].filter(Boolean).join(' · '))));
}

// The ⋯ on a Continue watching card: mark it watched (everywhere), or just take it off the row.
function openContinueMenu(f, progress, name, opener) {
  const file = libraryFile(f), ref = progressRef(file);
  const label = [name, f.season != null && episodeLabel(f)].filter(Boolean).join(' · ');
  // The card goes at once (on Discover and in the library); the next library render agrees.
  const refresh = () => {
    const li = opener?.closest('li'), list = li?.parentElement;
    li?.remove();
    if (list && !list.children.length) list.closest('.continue-shelf')?.remove();
    invalidateLibraryProgress(); libraryRenderPending = true;
  };
  const choose = (fn) => () => { closeTopOverlay(); fn(); refresh(); };
  const watched = choose(() => {
    delete state.progress[ref];
    try { localStorage.removeItem(resumeKey(file)); } catch { /* blocked */ }
    noteFinished(f);
    api('/api/me/progress', jsonPost({ ref, time: null, duration: progress?.duration || 0, watched: 0, about: watchAbout(file) })).catch(() => toast(T('Couldn’t save that. Try again.')));
  });
  const hide = choose(() => {
    // Hidden at once here; the server's own time replaces the placeholder (progress times are server times too).
    const key = continueKey(f);
    state.hidden = { ...(state.hidden || {}), [key]: Number.MAX_SAFE_INTEGER };
    api('/api/me/continue/hide', jsonPost({ key })).then((r) => { state.hidden = { ...state.hidden, [key]: r.at }; }, () => {
      state.hidden = { ...state.hidden }; delete state.hidden[key];
      invalidateLibraryProgress(); libraryRenderPending = true;
      toast(T('Couldn’t save that. Try again.'));
    });
  });
  $('#picker-body').replaceChildren(
    h('h2', { id: 'picker-title' }, label),
    h('p', { class: 'muted' }, progress ? T('{0} min left', Math.max(1, Math.ceil(((progress.duration || 0) - (progress.time || 0)) / 60))) : T('Up next')),
    h('div', { class: 'del-actions continue-actions' },
      h('button', { type: 'button', class: 'del-cancel', onclick: () => dismissTopOverlay().catch(() => {}).then(() => { f.show != null && state.libraryShows.some((s) => s.id === f.show) ? openShow(f.show, opener) : openFilm(f, opener); }) }, icon('info'), T('Details')),
      h('button', { type: 'button', class: 'del-cancel', onclick: watched }, icon('check'), T('Mark as watched')),
      h('button', { type: 'button', class: 'del-cancel', onclick: hide }, T('Remove from Continue watching')),
      h('p', { class: 'muted continue-note' }, T('Removed on all your devices. Your place is kept: it comes back when you watch it again.')),
      h('button', { type: 'button', class: 'del-cancel continue-keep', onclick: () => closeTopOverlay() }, T('Cancel'))));
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => opener?.focus({ preventScroll: true })));
}

// ---------- Play: the only action (play first) ----------
// target: { t } a film (or a show: its next episode), or { t, season, episode } one episode. Yours plays; someone
// else's copy here joins your library and plays; anything else opens the player on Getting it ready
// (getting-ready.js) while the server finds a copy (a cold start, src/cold-start.js) and the start of the video
// arrives, and the picture takes over by itself. body: the smart-download request that fetches it (films pass their
// own, with the Dubbed choice); none = only wait for what's already coming.
const isEpisodeTarget = (x) => x.season != null && x.episode != null;
const sameEpisode = (x, f) => f.season === x.season && f.episode === x.episode;
function targetFile(x) {
  const files = x.t.type === 'tv' ? matchesFor(x.t).filter((f) => f.kind === 'lib') : titleState(x.t).ready.filter((f) => f.kind === 'lib');
  return files.find((f) => (isEpisodeTarget(x) ? sameEpisode(x, f) : f.season == null) && !f.converting) || null;
}
function targetServerCopy(x, { dub = false } = {}) {
  const copies = serverMatchesFor(x.t).filter((f) => (isEpisodeTarget(x) ? sameEpisode(x, f) : f.season == null));
  return (dub ? copies.find(isDubbedCopy) : copies[0]) || null;
}
// This person's transfers that bring the target (a film's, or the ones carrying that episode).
function targetTransfers(x) {
  const { active } = titleState(x.t);
  if (!isEpisodeTarget(x)) return active;
  return active.filter((d) => (d.episodes || []).some((ep) => sameEpisode(x, ep)) || (d.season === x.season && (d.episode == null || d.episode === x.episode)));
}
// A stream of it while it downloads (Play now), once the transfer knows its files.
function targetPart(x) {
  for (const d of targetTransfers(x)) {
    if (!d.canPlayNow) continue;
    if (isEpisodeTarget(x)) {
      const ep = (d.episodes || []).find((e) => sameEpisode(x, e) && !e.available && e.fileIndex != null);
      if (ep) return playNowItem(d, ep, ep);
    }
    const main = playNowCandidate(d);
    if (main && (!isEpisodeTarget(x) || d.episode === x.episode)) return playNowItem(d, main, isEpisodeTarget(x) ? x : null);
  }
  return null;
}
async function addAndPlay(copy, opts = {}) {
  await api('/api/library/add', jsonPost({ ids: [copy.id] }));
  await libraryRequest; // a read that started before the add wouldn't show it
  await loadLibrary();
  patchUnifiedLibrary();
  const added = state.library.find((f) => f.mediaKey === copy.mediaKey) || state.library.find((f) => f.id === copy.id);
  if (!added) throw new Error(T('That didn’t work. Try again.'));
  return opts.inShell ? loadPlayerMedia(libraryFile(added)) : openPlayer(libraryFile(added));
}
async function playTitle(x, opener, { body = null, dub = false } = {}) {
  const mine = targetFile(x);
  if (mine) return openPlayer(libraryFile(mine));
  const copy = targetServerCopy(x, { dub });
  if (copy) { try { await addAndPlay(copy); } catch (err) { toast(err.message); } return; }
  const fetch = body || (canGet() && x.t.id != null ? (isEpisodeTarget(x)
    ? { type: 'tv', tmdbId: x.t.id, season: x.season, episodes: [x.episode] }
    : { type: 'movie', tmdbId: x.t.id }) : null);
  if (!fetch && !targetTransfers(x).length) { toast(T('This isn’t on Lilin yet.')); return; }
  getReady(x, fetch, opener);
}

// The run behind the Getting it ready screen: one at a time, ended by the picture, Cancel or Back.
let readyRun = null;
const gettingReady = createGettingReady({ h, icon, mount: $('#player'),
  onBack: () => closeTopOverlay(),
  onCancel: () => cancelReady(),
  onRetry: () => { if (readyRun?.body) { readyRun.idleSince = 0; runDownloadCommand(readyRun.body); readyTick(); } } });
function getReady(x, body, opener) {
  openPlayerShell({ opener, title: x });
  const art = bigArt(x.t.backdrop, 1280) || x.t.poster || null;
  gettingReady.show({ title: x.t.title, sub: isEpisodeTarget(x) ? episodeLabel(x) : '', art });
  readyLogo(x.t);
  readyRun = { x, body, since: Date.now(), before: new Set(targetTransfers(x).map((d) => d.hash)), handed: false, timer: 0, reads: 0 };
  if (body && !targetTransfers(x).length && !downloadCommands.get(commandKey(body))?.busy) runDownloadCommand(body);
  readyTick();
}
// The title's logo art for the Getting it ready screen (it fills up as the progress). A big screen gets TMDB's
// original file (w500 is soft at the size it's drawn); dark lettering is drawn light over the dark picture.
function readyLogo(t) {
  if (!t?.id || !['movie', 'tv'].includes(t.type) || !state.status.search) return;
  pageInfo(t.type, t.id).then(async (page) => {
    if (!page?.logo?.url) return;
    const big = innerWidth * (devicePixelRatio || 1) > 700;
    const url = big ? page.logo.url.replace('/t/p/w500/', '/t/p/original/') : page.logo.url;
    const tone = await logoTone(page.logo.url);
    if (readyRun?.x.t === t) gettingReady.logo(url, { dark: tone !== null && tone < 0.3 });
  }).catch(() => {});
}
function stopReady({ quiet = false } = {}) {
  const run = readyRun;
  if (!run) return;
  readyRun = null;
  clearTimeout(run.timer);
  gettingReady.hide(true);
  // Back while it's still coming: it carries on, and Play picks it up again (it shows in Right now meanwhile).
  if (!quiet && !run.cancelled && (run.handed || !run.x || targetTransfers(run.x).length || downloadCommands.get(commandKey(run.body || {}))?.busy)) {
    toast(T('It keeps getting ready. Press Play again any time.'));
  }
}
// Cancel: what this Play started stops (others who want it keep it: /leave), then the player closes.
async function cancelReady() {
  const run = readyRun;
  if (!run) return closeTopOverlay();
  run.cancelled = true;
  const failed = gettingReady.phase() === 'failed';
  closeTopOverlay();
  if (failed || !run.x) return; // an SVT Play copy finishes anyway (it's quick and small)
  const cmd = run.body && downloadCommands.get(commandKey(run.body));
  if (cmd?.busy) await new Promise((r) => { const wait = () => (cmd.busy ? setTimeout(wait, 500) : r()); wait(); });
  await loadDownloads();
  // A film's own transfers stop; for an episode only what this Play started (a season pack may carry the next ones).
  const started = targetTransfers(run.x).filter((d) => d.mine !== false && (!isEpisodeTarget(run.x) || !run.before.has(d.hash)));
  for (const d of started) await api(`/api/downloads/${encodeURIComponent(d.hash)}/leave`, jsonPost({})).catch(() => {});
  if (started.length) { invalidateDownloadsRead(); await loadDownloads(); patchUnifiedLibrary(); }
}
async function readyTick() {
  const run = readyRun;
  if (!run || run.handed) return;
  clearTimeout(run.timer);
  const { x } = run;
  const mine = targetFile(x);
  if (mine) { run.handed = true; return loadPlayerMedia(libraryFile(mine)); }
  const copy = run.body ? null : targetServerCopy(x);
  if (copy) { run.handed = true; return addAndPlay(copy, { inShell: true }).catch((err) => { gettingReady.update({ phase: 'failed', message: err.message }); }); }
  const part = targetPart(x);
  if (part) { run.handed = true; return loadPlayerMedia(part); }
  const cmd = run.body && downloadCommands.get(commandKey(run.body));
  const result = commandResult(cmd);
  const transfers = targetTransfers(x);
  // The search ended without a failure, yet nothing arrived in a minute: say so instead of finding forever.
  if (cmd && !cmd.busy && !transfers.length) run.idleSince ||= Date.now(); else run.idleSince = 0;
  const lost = run.idleSince && Date.now() - run.idleSince > 60000;
  if (!transfers.length && (result?.retry || lost)) { gettingReady.update({ phase: 'failed', message: result?.text, canRetry: Boolean(run.body) }); return; }
  if (cmd?.busy || !transfers.length) gettingReady.update({ phase: 'finding' });
  else gettingReady.update({ phase: 'connecting' });
  // Faster than the page's own polling while someone waits; the library every few rounds (a finished copy).
  run.timer = setTimeout(async () => {
    if (readyRun !== run) return;
    run.reads++;
    await Promise.all([loadDownloads(), run.reads % 4 === 0 || transfers.some((d) => d.done || Number(d.progress) >= 1) ? loadLibrary() : null]);
    readyTick();
  }, 1500);
}

// Waiting for something that plays only once it's whole (SVT Play): check() → { id } a library id when it's here,
// { progress } while it comes, { failed } when it can't. The same screen, the same Back and Cancel.
function waitAndPlay({ title, sub = '', art = null, check, opener }) {
  openPlayerShell({ opener });
  gettingReady.show({ title, sub, art: bigArt(art, 1280) || art });
  const run = readyRun = { x: null, since: Date.now(), before: new Set(), handed: false, timer: 0 };
  const tick = async () => {
    if (readyRun !== run) return;
    let r = null;
    try { r = await check(); } catch { /* the next round asks again */ }
    if (readyRun !== run) return;
    if (r?.id) {
      await Promise.all([loadLibrary(), loadDownloads()]).catch(() => {});
      const f = localFiles().find((x) => x.id === r.id);
      if (f && readyRun === run) { run.handed = true; return loadPlayerMedia(libraryFile(f)); }
    }
    gettingReady.update(r?.failed ? { phase: 'failed', message: r.failed } : { phase: 'whole', startProgress: r?.progress ?? 0 });
    if (!r?.failed) run.timer = setTimeout(tick, 2500);
  };
  tick();
}

// A show's Play: where you are (Resume, the next one), else the episode after the last you finished, else the
// first, here or fetched. The seasons TMDB knows decide when a season ends; without them it's a fair guess.
const showSeasons = new Map(); // tmdb id -> TMDB's seasons, once asked
function knowSeasons(id) {
  if (id == null || showSeasons.has(id) || !state.status.search) return;
  showSeasons.set(id, null);
  tvSeasons(id).then((list) => { showSeasons.set(id, list || []); updateOpenTitle(); }, () => showSeasons.set(id, []));
}
function showNextTarget(t, up = null) {
  if (up && !up.f.converting) return { t, season: up.f.season, episode: up.f.episode, kind: up.kind, f: up.f, progress: up.progress };
  knowSeasons(t.id);
  const seasons = (showSeasons.get(t.id) || []).filter((s) => s.number > 0);
  const fin = t.id != null ? state.finished?.[`tv:${t.id}`] : null;
  const first = (n) => seasons.find((s) => s.number === n)?.first || 1;
  let season = fin ? fin.season : seasons[0]?.number ?? 1;
  let episode = fin ? fin.episode + 1 : first(season);
  const se = seasons.find((s) => s.number === season);
  if (se?.episodes && episode > first(season) + se.episodes - 1) {
    const next = seasons.find((s) => s.number > season);
    if (!next || next.upcoming) return null; // all caught up
    season = next.number; episode = first(season);
  }
  if (seasons.length && seasons.find((s) => s.number === season)?.upcoming && !targetServerCopy({ t, season, episode })) return null;
  return { t, season, episode, kind: fin ? 'next' : 'start' };
}
function playShow(t, opener) {
  const id = t.id != null ? state.libraryShows.find((s) => Number(s.tmdbId) === Number(t.id))?.id : null;
  const x = showNextTarget(t, id ? nextUp(id) : null);
  if (!x) return toast(T('You’re all caught up.'));
  return playTitle(x, opener);
}

// ---------- the title page: one page for every title, its buttons by state (title-model.js) ----------
// Discover's title page, the library's film page and its show page were three pages; openTitle draws one for all.
// ref: { t } a TMDB title (Discover, search, More like this, Coming up), { fileId } a library video, { showId } a
// library show, { fileId: 'entry:KEY' } a download with nothing ready yet; hashes: the downloads it was opened on.
// titleModel picks the page's one gold button; quiet chips sit beside it and a ⋯ menu holds the rest. The page is
// redrawn when its state changes (a download finished, a file left), except while someone types in it; the buttons
// update in place in between (commandViews).
const titleView = { ref: null, key: '', hero: null, heroKey: '', showId: null, season: new Map(), release: new Map() };
const stopTrailer = () => { $('#sheet-body .trailer-frame')?.remove(); document.body.classList.remove('trailer-live'); };
function openTitle(ref, opener) {
  peek.hide();
  const sheet = $('#sheet');
  // From inside an open title page (More like this): that title opens right here, and Back comes back.
  if (titleView.ref && sheet.classList.contains('open') && opener && sheet.contains(opener)) {
    const back = sheetState();
    stopTrailer();
    titleView.ref = ref; titleView.hero = null;
    renderTitle();
    sheet.scrollTo({ top: 0 });
    pushOverlay(() => { stopTrailer(); back(); });
    return;
  }
  titleView.ref = ref; titleView.hero = null;
  const onClosed = () => {
    stopTrailer(); // closing the sheet stops the trailer
    titleView.ref = null; titleView.showId = null; titleView.hero = null;
    opener?.focus({ preventScroll: true });
  };
  renderTitle();
  pushOverlay(showSheet(sheet, $('#sheet-backdrop'), onClosed));
}
// The old ways in stay, so cards, the billboard, peek, Coming soon and House › Downloads open titles as before.
function openDetails(t, opener) {
  if (t.type === 'svt') return documentaries.openTitle(t, opener);
  openTitle({ t }, opener);
}
function openFilm(f, opener) { openTitle({ fileId: f.id, mediaKey: f.mediaKey || null }, opener); }
function openShow(id, opener, hashes = null) {
  const tmdbId = unifiedLibrary().find((e) => e.show?.id === id)?.show?.tmdbId;
  if (tmdbId) markShowSeen(tmdbId);
  openTitle({ showId: id, hashes }, opener);
}
// What the title page shows now, as a function that puts it back (after going deeper with More like this).
function sheetState() {
  const ref = titleView.ref, top = $('#sheet').scrollTop;
  return () => {
    titleView.ref = ref; titleView.hero = null;
    renderTitle();
    requestAnimationFrame(() => { $('#sheet').scrollTop = top; });
  };
}
// An open title page is redrawn when what it shows changes (a download finished, a file left), except
// while someone is typing in it. A focused button doesn't count: holding the redraw for that left a
// finished download stuck on "Almost ready 100%" until the page was reloaded.
function sheetBusy() {
  const el = document.activeElement;
  return Boolean(el && $('#sheet-body').contains(el) && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable));
}
// When a conversion finishes the library lists the MP4 copy under a new id: follow the same video (same mediaKey),
// so an open page doesn't claim it was removed. A page opened on a download follows it to the film it became: same
// file (media key) or same TMDB film. Until the server links the two they can sit in separate entries, and the page
// then stayed on the finished download ("Almost ready 100%") until a reload.
function followTitle(ref) {
  if (ref.fileId && ref.mediaKey && !String(ref.fileId).startsWith('entry:') && !state.library.some((f) => f.id === ref.fileId)) {
    const moved = state.library.find((f) => f.mediaKey === ref.mediaKey);
    if (moved) ref.fileId = moved.id;
  }
  if (!ref.hashes?.length || ref.showId) return;
  const transfers = state.downloads.filter((d) => ref.hashes.includes(d.hash));
  // Remembered while the download is listed: it leaves the list once finished.
  if (transfers.length) ref.follow = {
    keys: new Set(transfers.flatMap((d) => (d.files || []).map((f) => f.mediaKey)).filter(Boolean)),
    ids: new Set(transfers.flatMap((d) => d.libraryIds || [])),
    tmdb: transfers.map((d) => d.mediaType !== 'tv' && d.tmdbId).find(Boolean) || null,
  };
  const done = !transfers.length || transfers.every((d) => d.done || Number(d.progress) >= 1);
  if (!done || !ref.follow) return;
  const { keys, ids, tmdb } = ref.follow;
  const f = state.library.find((x) => ids.has(x.id) || (x.mediaKey && keys.has(x.mediaKey)))
    || (tmdb && state.library.find((x) => x.season == null && Number(x.tmdbId) === Number(tmdb)));
  if (!f) return;
  ref.hashes = null; ref.follow = null; ref.fileId = f.id; ref.mediaKey = f.mediaKey || null;
}
// What a ref points at now: the TMDB title (made from the library's when it came from there), its Library entry
// and, for a library video, the file itself.
function titleSource(ref) {
  followTitle(ref);
  const lib = unifiedLibrary();
  const byHash = (e) => ref.hashes?.some((hash) => e.transfers.some((d) => d.hash === hash));
  let entry = null;
  if (ref.showId) entry = lib.find((e) => e.show && (e.show.id === ref.showId || byHash(e)));
  else if (ref.fileId) entry = lib.find((e) => ref.fileId === `entry:${e.key}` || e.files.some((f) => f.id === ref.fileId) || byHash(e));
  else if (ref.t?.id != null) entry = lib.find(ref.t.type === 'tv' ? (e) => e.show?.tmdbId != null && Number(e.show.tmdbId) === Number(ref.t.id)
    : (e) => e.type === 'movie' && e.files.some((f) => f.season == null && f.tmdbId != null && Number(f.tmdbId) === Number(ref.t.id)));
  const film = ref.fileId && !String(ref.fileId).startsWith('entry:')
    ? entry?.files.find((f) => f.id === ref.fileId) || entry?.files[0] || state.library.find((f) => f.id === ref.fileId) : null;
  let t = ref.t || null;
  if (!t && entry?.show) {
    const s = entry.show;
    t = { type: 'tv', id: s.tmdbId ?? null, title: s.title, year: s.year, backdrop: s.backdrop, overview: s.overview, poster: s.poster };
  } else if (!t && film) {
    t = { type: 'movie', id: film.season == null && !film.movieAmbiguous ? film.tmdbId ?? null : null, title: film.filmTitle || film.title,
      year: film.year, backdrop: film.backdrop, overview: film.overview, rating: film.rating, poster: film.poster };
  } else if (!t && entry) {
    const d = entry.transfers[0];
    t = { type: entry.type === 'tv' ? 'tv' : 'movie', id: d?.tmdbId ?? null, title: entry.name, year: d?.year, backdrop: d?.backdrop, poster: entry.poster };
  }
  return { t, entry, film };
}
// Everything the page needs about its title, and the model's verdict on it.
function titleContext(ref) {
  const { t, entry, film } = titleSource(ref);
  if (!t) return { gone: true, key: 'gone' };
  const tv = t.type === 'tv';
  // Films with a TMDB id go by the title (every version, your downloads, others' copies); shows in your library
  // and videos without one go by their Library entry.
  const byTitle = tv ? !entry : t.id != null;
  const entryNow = () => titleSource(ref).entry;
  const stateOf = byTitle ? () => titleState(t) : () => {
    const e = entryNow(), files = (e?.files || []).map(libraryFile);
    return { files, ready: files, onServer: serverMatchesFor(t), transfers: e?.transfers || [], active: e?.active || [] };
  };
  const s = stateOf();
  const mine = s.ready.filter((f) => (tv ? f.season != null : true));
  const libFiles = mine.filter((f) => f.kind === 'lib');
  const file = () => { const r = stateOf().ready; return r.find((f) => f.kind === 'lib' && !f.converting) || r.find((f) => f.kind === 'lib') || null; };
  const showId = tv ? entry?.show?.id ?? null : null;
  const up = showId ? nextUp(showId) : null;
  const next = nextExpiry(libFiles);
  const f0 = file();
  const facts = {
    type: tv ? 'tv' : 'movie', mine: mine.length, preparing: mine.length > 0 && mine.every((f) => f.converting),
    play: tv ? (up && !up.f.converting ? up.kind : null) : partlyWatched(f0 && savedProgress(f0)) ? 'resume' : 'play',
    onServer: tv ? serverOnlyEpisodes(s).length : s.onServer.length,
    transfers: s.active.length, playNow: s.active.length === 1 && Boolean(playNowFile(s.active[0])),
    canGet: canGet(), tmdb: t.id != null, search: Boolean(state.status.search),
    unreleased: tv ? cardUnreleased(t) : titleView.release.get(t.id) ?? cardUnreleased(t),
    leaving: next - Date.now() < 3 * 86400000, expires: Number.isFinite(next), keep: libFiles.some(canExtend),
    owner: Boolean(state.me?.isOwner), admin: Boolean(state.status.admin), ambiguous: Boolean(film?.movieAmbiguous), anime: true, // Dubbed shows once the server says it's anime
    versions: tv ? 0 : (f0?.versions?.length || 0),
  };
  const model = titleModel(facts);
  const key = JSON.stringify([ref.t ? `${t.type}:${t.id}` : ref.fileId || ref.showId, model.state, model.primary, model.secondary, model.more,
    libFiles.map((f) => [f.id, f.converting, f.expiresAt, f.mediaKey]), s.transfers.map((d) => [d.hash, d.done, d.season,
      (d.episodes || []).map((ep) => [ep.season, ep.episode, ep.available, ep.started, ep.libraryId])]), facts.onServer]);
  return { ref, t, tv, entry, film, entryNow, stateOf, file, up, showId, next, facts, model, key };
}
// A title page follows along from any tab (renderLibrary and patchUnifiedLibrary call this).
function updateOpenTitle() {
  if (!titleView.ref || !$('#sheet').classList.contains('open')) return;
  const { key } = titleContext(titleView.ref);
  if (key !== titleView.key && !sheetBusy()) { const top = $('#sheet').scrollTop; renderTitle(); $('#sheet').scrollTop = top; }
}
// The film left (deleted here, elsewhere or by the clean-up): a calm card instead of a bare heading,
// without the old backdrop's colour wash.
function titleGone(ref) {
  washPage(null);
  const gone = emptyState(T('This isn’t here any more'), T('Find it again in Discover and press Play.'),
    { label: T('Back'), icon: 'back', run: () => closeTopOverlay() });
  gone.querySelector('h3').id = 'sheet-title';
  $('#sheet-body').replaceChildren(h('div', { class: 'sheet-content sheet-gone' }, gone));
  gone.querySelector('button')?.focus({ preventScroll: true });
}

// Every button the model can name. Bar buttons get lead (they're the gold one) and return a node; menu ones
// return a ⋯ item ([icon, text, run, class]). Films keep their own Play (filmActions: it plays, adds or gets ready).
const titleChip = (act, lead, ic, text, run, cls = '') => h('button', { type: 'button', class: `${lead ? 'play-btn action-btn' : 'chip'} ${cls}`.trim(), 'data-act': act, onclick: run },
  ic && icon(ic), h('span', {}, text));
const TITLE_ACTIONS = {
  play: (c, lead) => (c.fa ? c.fa.play : showPlayButton(c, lead)),
  resume: (c, lead) => TITLE_ACTIONS.play(c, lead),
  save: (c) => c.watch?.save,
  follow: (c) => c.watch?.follow,
  playOnTv: (c) => c.file() && titleChip('playOnTv', false, 'tv', T('Play on TV'), (e) => openPicker(c.file(), e.currentTarget)),
  toPhone: (c) => c.file() && [icon('phone'), T('To phone'), (o) => openTravel(c.file(), o)],
  // The owner's tools (title-model.js: admin).
  download: (c) => c.fa && [icon('download'), T('Download without playing'), () => c.fa.download()],
  moreEpisodes: (c) => c.tvd && [icon('download'), T('Download a season'), () => {
    const ps = showPanels.get(c.t.id);
    if (ps) { ps.open = true; renderTitle(); }
    $('#sheet-body .dl-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }],
  keep: (c) => {
    const eligible = c.stateOf().ready.filter((f) => f.kind === 'lib' && canExtend(f));
    return [icon('clock'), eligible.length > 1 ? T('Keep all {0} · {1} more days', eligible.length, extendDays()) : T('Keep {0} more days', extendDays()),
      async () => { await extendItems(eligible); updateOpenTitle(); }];
  },
  getVersion: (c) => [icon('plus'), T('Get another version'), () => c.fa?.revealAdvanced()],
  advanced: (c) => [icon('search'), T('Advanced options'), () => c.fa?.revealAdvanced()],
  dubbed: (c) => (c.fa || c.tvd) && [icon('plus'), T('Dubbed'), () => (c.fa ? c.fa.chooseDub() : c.tvd.dubBtn.click()), 'title-dubbed'],
  identify: (c) => c.file() && [icon('pencil'), T('Identify film'), (o) => openFilmIdentity(c.file(), o)],
  delete: (c) => {
    if (!c.tv) return c.file() && [icon('trash'), T('Delete'), (o) => openDelete(c.file(), o), 'is-danger'];
    const files = c.stateOf().ready.filter((f) => f.kind === 'lib');
    // Downloads you're on, finished or not: with nothing ready yet the show is still in your library.
    const leaving = c.stateOf().transfers.filter((d) => d.mine !== false && !d.done && d.others !== undefined);
    if (!files.length && !leaving.length) return null;
    return [icon('trash'), files.length ? T('Delete show') : T('Stop downloading'),
      (o) => openDeleteMany({ files, transfers: leaving, what: T('this show'), label: c.t.title, onDone: closeTopOverlay }, o), 'is-danger'];
  },
  details: (c) => [icon('download'), T('Download details'), (o) => openTransferDetails(c.entryNow() || { key: `title:${c.t.title}`, name: c.t.title, transfers: c.stateOf().transfers }, o)],
};
// ⋯'s Dubbed shows once the server says it's anime; a ⋯ with nothing else in it hides with it.
function showDubbed(on, within = $('#sheet-body')) {
  const item = within.querySelector('.title-dubbed');
  if (!item) return;
  item.hidden = !on;
  const menu = item.closest('.row-more');
  if (menu) menu.hidden = ![...menu.querySelectorAll('.row-menu-item')].some((b) => !b.hidden);
}
// The show's Play: carry on where you left off, else the next episode (or the first), here or fetched.
function showPlayButton(c, lead) {
  const x = c.t.id != null ? showNextTarget(c.t, c.up) : c.up && !c.up.f.converting ? { t: c.t, season: c.up.f.season, episode: c.up.f.episode, kind: c.up.kind, f: c.up.f, progress: c.up.progress } : null;
  if (!x) return null;
  const ep = episodeLabel(x);
  const label = x.kind === 'resume' ? T('Resume {0} · {1} min left', ep, Math.max(1, Math.ceil((x.progress.duration - x.progress.time) / 60)))
    : x.kind === 'next' ? T('Play next: {0}', ep) : T('Play {0}', ep);
  return titleChip('play', lead, 'play', label, (e) => (x.f ? openPlayer(libraryFile(x.f)) : playTitle(x, e.currentTarget)));
}
// One line under the facts. Members: whether it plays at once (the lightning mark), is getting ready, or starts in
// about a minute; the owner also sees the copy (format, size), the automatic delete and a quiet Keep.
function titleStateLine(c) {
  const { model, tv, t } = c, s = c.stateOf();
  const tools = Boolean(state.status.admin);
  const libFiles = s.ready.filter((f) => f.kind === 'lib' && (!tv || f.season != null));
  const eligible = libFiles.filter(canExtend);
  const keep = tools && model.inline.includes('keep') && h('button', { type: 'button', class: 'keep-btn', 'data-act': 'keep', onclick: async (e) => {
    e.currentTarget.disabled = true;
    await extendItems(eligible);
    updateOpenTitle();
  } }, eligible.length > 1 ? T('Keep all {0} · {1} more days', eligible.length, extendDays()) : T('Keep {0} more days', extendDays()));
  const soonest = tools && libFiles.filter((f) => f.expiresAt != null).sort((a, b) => a.expiresAt - b.expiresAt)[0];
  const expiry = soonest && h('span', { class: `expiry${model.state === 'leavingSoon' ? ' is-soon' : ''}` },
    tv && libFiles.length > 1 ? T('Next to go: {0} · {1}', episodeLabel(soonest) || soonest.title, timeLeft(soonest.expiresAt)) : timeLeft(soonest.expiresAt));
  const f = c.file();
  const instant = h('span', { class: 'instant-mark has-words' }, icon('bolt'), h('span', {}, T('Plays instantly')));
  let parts = [];
  if (model.state === 'preparing') parts = [T('Preparing playback. It plays here as soon as the MP4 copy is ready.')];
  else if (model.state === 'ready' || model.state === 'leavingSoon') {
    parts = tv ? [instant, !c.up && !model.primary && T('You’re all caught up.')]
      : [instant, tools && !(f?.versions?.length > 1) && f?.format?.toUpperCase(), tools && !(f?.versions?.length > 1) && f && fmtBytes(f.size)];
    parts.push(expiry, keep);
  } else if (model.state === 'onServer') {
    parts = tv ? [instant, T('{0} here', plural(c.facts.onServer, 'episode'))] : [instant];
  } else if (model.state === 'onItsWay') parts = [T('Getting it ready')];
  else if (model.state === 'notOnLilin' && t.id != null && model.primary === 'play') parts = [tv ? T('Episodes start in about a minute') : T('Starts in about a minute')];
  else if (model.state === 'notOnLilin' && state.status.library && t.id != null) parts = [T('Not on Lilin yet')];
  else if (model.state === 'unreleased' && tv) parts = [airsLabel(t.date) || T('Not out yet · no release date')];
  parts = parts.filter(Boolean);
  return parts.length ? h('p', { class: `title-state is-${model.state}` }, parts.map((p) => (p instanceof Node ? p : h('span', {}, p)))) : null;
}

function renderTitle() {
  const ref = titleView.ref;
  if (!ref) return;
  const c = titleContext(ref);
  titleView.key = c.key;
  if (c.gone) { titleView.showId = null; titleGone(ref); return; }
  const { t, tv, model } = c;
  const lead = (id) => model.primary === id;
  const focused = $('#sheet-body').contains(document.activeElement) ? document.activeElement.dataset?.act : null;
  titleView.showId = c.showId;
  // The parts with buttons of their own: films' Play / Add pair, shows' download panel, Save / Follow.
  if (!tv) c.fa = filmActions(t, { stateOf: c.stateOf });
  // The season panel (a whole season, a quality) is the owner's: everyone else presses an episode.
  if (tv && canGet() && t.id != null && state.status.admin) {
    c.tvd = showDownload(t, { season: titleView.season.get(`tv:${t.id}`) ?? null, onAdded: () => updateOpenTitle(), lead: false });
  }
  if (state.status.search && t.id != null) c.watch = watchBox(t, { lead: ['save', 'follow'].find(lead) || null });
  const bar = h('div', { class: 'title-bar' });
  if (c.fa) bar.append(c.fa.play);
  const seen = new Set(c.fa ? [c.fa.play] : []);
  for (const id of [model.primary, ...model.secondary]) {
    const node = id && TITLE_ACTIONS[id](c, lead(id));
    if (node && !seen.has(node)) { seen.add(node); bar.append(node); }
  }
  const items = model.more.map((id) => TITLE_ACTIONS[id](c)).filter(Boolean);
  if (items.length) bar.append(rowMenu(T('More for {0}', t.title), items));
  showDubbed(Boolean(c.fa?.dub.anime || c.tvd?.dub.anime), bar);
  // The hero stays while the same title is redrawn, so a playing trailer (and the picture's fade) carries on.
  const heroKey = `${t.type}:${t.id}:${t.backdrop}`;
  if (!titleView.hero || titleView.heroKey !== heroKey) {
    titleView.hero = t.id != null && state.status.search ? detailsHero(t) : pageHero(t.backdrop);
    if (tv && c.showId) themeMusic.hero(titleView.hero); // theme
    titleView.heroKey = heroKey;
  }
  const rateKey = titleKeyOf(t) || titleKeyOf(c.film) || (c.showId && titleKeyOf({ show: c.showId }));
  const versions = !tv && (c.film && !ref.t ? c.film.versions?.length > 1 && versionSelect({
    id: `ver-${c.film.versionKey}`, options: c.film.versions.map((v) => ({ value: v.mediaKey, label: v.versionLabel })), value: c.film.mediaKey,
    onPick: (key) => {
      const v = c.film.versions.find((x) => x.mediaKey === key);
      setVersionPick(c.film, v);
      ref.fileId = v.id; ref.mediaKey = v.mediaKey;
      patchUnifiedLibrary(); renderTitle();
    },
  }) : filmVersionPick(t, () => renderTitle()));
  const reactions = rateKey && h('div', { class: 'title-reactions' }, social.rateRow(rateKey, t.title));
  $('#sheet-body').replaceChildren(titleView.hero,
    h('div', { class: 'sheet-content' },
      pageTitle(t.title, t.type, t.id),
      pageFacts([t.year, tv ? T('Series') : T('Film'), t.rating && h('li', { class: 'fact-rating' }, `★ ${fmtRating(t.rating)}`)], t.type, t.id),
      titleStateLine(c),
      bar,
      c.watch,
      tv && reactions, // shows: up top, not below a long episode list
      c.fa, versions || null,
      c.tvd?.panel, tv && state.status.admin && transferSummary(() => c.stateOf().transfers, t.title, { lead: () => false }),
      model.inline.includes('identityNote') && h('p', { class: 'identity-note' }, state.me?.isOwner
        ? T('Several films match this filename. Choose “Identify film” to select the right one.')
        : T('Several films match this filename. The server’s owner can identify this file.')),
      t.overview && h('p', { class: 'overview' }, t.overview),
      tv && episodeList(c),
      !tv && reactions,
      reviews.section(rateKey, t.title), // reviews
      castRail(t.type, t.id) || castLine(t.type, t.id),
      moreLike(t.type, t.id),
      titleDetails.section(t.type, t.id))); // details
  if (tv && c.showId) themeMusic.enter(c.showId, themeUrl(c.stateOf().ready)); // theme: keeps going between seasons
  // A redraw keeps the keyboard where it was.
  if (focused) ($(`#sheet-body [data-act="${focused}"]:not([hidden])`) || $('#sheet-body .title-bar button:not([hidden])'))?.focus({ preventScroll: true });
}

// Episodes: season chips (a picker above 8 seasons), then only that season's episodes. The still plays one you have
// and shows how far you got; ⋯ holds Play on TV, To phone, Keep and Delete. A missing one has a quiet Add, one on
// its way says how far it got. The season's own ⋯ adds or downloads it, upgrades it, keeps it, takes it to your
// phone or deletes it. TMDB fills in names, stills, running times and stories when it answers.
const SEASON_CHIPS_MAX = 8; // seasons before the chips become a picker
function episodeList(c) {
  const { t } = c;
  const skey = `tv:${t.id ?? c.showId}`;
  const section = h('section', { class: 'page-section episodes' });
  const tvT = { id: t.id ?? null, title: t.title, type: 'tv' }; // episodeRow decides what pressing an episode does
  const asks = new Map(); // season -> TMDB episodes (or [] when TMDB had none)
  let tmdbSeasons = null;
  const draw = () => {
    if (section._drawn && !section.isConnected) return;
    section._drawn = true;
    const s = c.stateOf(), show = c.entryNow()?.show;
    const files = s.ready.filter((f) => f.kind === 'lib' && f.season != null);
    const seasons = new Map();
    const add = (n, o = {}) => {
      if (n == null) return;
      const se = seasons.get(n) || { number: n };
      for (const [k, v] of Object.entries(o)) if (v != null && se[k] == null) se[k] = v;
      seasons.set(n, se);
    };
    for (const se of show?.seasons || []) add(se.number, { name: se.name, total: se.total, first: se.first, lib: se.episodes });
    for (const se of tmdbSeasons || []) add(se.number, { name: se.name, total: se.episodes, first: se.first, upcoming: se.upcoming });
    for (const f of files) add(f.season);
    for (const d of s.transfers) { add(d.season); for (const ep of d.episodes || []) add(ep.season); }
    const list = [...seasons.values()].sort((a, b) => a.number - b.number);
    if (!list.length) { section.replaceChildren(); section.hidden = true; return; }
    section.hidden = false;
    const owned = files.map((f) => f.season);
    let n = titleView.season.get(skey);
    if (!seasons.has(n)) {
      n = c.up?.f.season ?? (owned.some((x) => x > 0) ? Math.min(...owned.filter((x) => x > 0)) : owned.length ? Math.min(...owned) : null)
        ?? list.find((se) => se.number > 0 && !se.upcoming)?.number ?? list[0].number;
    }
    const se = seasons.get(n);
    const pick = (x) => {
      titleView.season.set(skey, x);
      const ps = showPanels.get(t.id);
      if (ps && !ps.touched) ps.season = x; // the download panel opens on the season you're looking at
      draw();
    };
    const label = (x) => localSeasonName(x.name, x.number);
    let picker = null;
    if (list.length > 1 && list.length <= SEASON_CHIPS_MAX) {
      picker = h('div', { class: 'season-chips', role: 'group', 'aria-label': T('Seasons') }, list.map((x) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(x.number === n), onclick: () => pick(x.number) }, label(x))));
    } else if (list.length > SEASON_CHIPS_MAX) {
      const sel = h('select', { class: 'sub-select season-select', 'aria-label': T('Season') }, list.map((x) => h('option', { value: String(x.number) }, label(x))));
      sel.value = String(n);
      sel.addEventListener('change', () => pick(Number(sel.value)));
      picker = sel;
    }
    // TMDB's episodes for the season, once (cachedFor keeps them for an hour across redraws).
    if (t.id != null && state.status.search && !asks.has(n)) {
      asks.set(n, null);
      cachedFor(`/api/tv/${t.id}/season/${n}`, 60 * 60 * 1000).then((d) => { asks.set(n, d.episodes || []); }, () => { asks.set(n, []); })
        .then(() => { if (titleView.season.get(skey) === n || !titleView.season.has(skey)) draw(); });
    }
    const info = new Map((asks.get(n) || []).map((ep) => [ep.number, ep]));
    const seasonFiles = files.filter((f) => f.season === n);
    const mine = new Map();
    for (const f of [...seasonFiles].sort((a, b) => a.episode - b.episode || String(a.id).localeCompare(String(b.id)))) if (!mine.has(f.episode)) mine.set(f.episode, f);
    const forSeason = s.transfers.filter((d) => d.season === n || (d.episodes || []).some((ep) => ep.season === n));
    const pending = new Map();
    for (const d of forSeason) for (const ep of d.episodes || []) if (ep.season === n && !mine.has(ep.episode) && !pending.has(ep.episode)) pending.set(ep.episode, { d, ep });
    const serverOnly = serverOnlyEpisodes(s, n);
    const numbers = new Set([...info.keys(), ...mine.keys(), ...pending.keys(), ...serverOnly.map((f) => f.episode)].filter((x) => x != null));
    if (!info.size && Number.isInteger(se.total) && se.total > 0 && se.total <= 1000) for (let k = se.first || 1; k < (se.first || 1) + se.total; k++) numbers.add(k);
    const rows = [...numbers].sort((a, b) => a - b).map((k) => episodeRow(c, { k, ep: info.get(k) || se.lib?.[k] || {}, f: mine.get(k), p: pending.get(k), season: n, tvT }));
    for (const f of seasonFiles.filter((x) => x.episode == null)) rows.push(episodeRow(c, { k: null, ep: { name: f.episodeName || f.file }, f, season: n, tvT }));
    const loading = !rows.length && asks.get(n) === null;
    // The season's own line and ⋯ menu.
    const ready = [...mine.values()];
    const readyCount = episodeCount(ready);
    const leaving = s.transfers.filter((d) => d.mine !== false && !d.done && d.others !== undefined
      && forSeason.includes(d) && (d.episodes || []).every((ep) => ep.season == null || ep.season === n));
    const eligible = seasonFiles.filter(canExtend);
    const upgrade = t.id != null ? upgradeState(tvT, n) : null;
    const packs = forSeason.filter((d) => !(d.episodes || []).some((ep) => ep.season === n));
    const complete = se.total && readyCount >= se.total;
    const tools = Boolean(state.status.admin); // the season's download tools are the owner's
    const seasonItems = [
      tools && serverOnly.length > 0 && [icon('plus'), T('Add season'), async () => { try { await addFromServer(serverOnly); } catch (err) { toast(err.message); } }],
      tools && !serverOnly.length && !complete && !se.upcoming && c.tvd && [icon('download'), T('Add Season {0}', n), () => {
        const ps = showPanels.get(t.id);
        Object.assign(ps, { season: n, touched: true, open: true });
        renderTitle();
        $('#sheet-body .dl-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }],
      tools && upgrade?.offered && !upgrade.started && [icon('upgrade'), upgradeLabel(upgrade), async () => {
        await upgradeState(tvT, n).run();
        const u = upgradeState(tvT, n);
        if (u.failed || (u.text && !u.started)) toast(u.text);
      }],
      tools && eligible.length > 0 && [icon('clock'), eligible.length > 1 ? T('Keep all {0} · {1} more days', eligible.length, extendDays()) : T('Keep {0} more days', extendDays()),
        async () => { await extendItems(eligible); updateOpenTitle(); }],
      ready.length > 0 && [icon('phone'), T('Season to phone'), (o) => openTravelSeason(ready, `${t.title} · ${label(se)}`, o)],
      ...(tools ? packs : []).map((d) => [icon('download'), T('Season pack details'), (o) => openTransferDetails({ ...(c.entryNow() || { key: `title:${t.title}`, name: t.title }), transfers: [d] }, o)]),
      tools && list.length > 1 && (seasonFiles.length > 0 || leaving.length > 0) && [icon('trash'), T('Delete season'),
        (o) => openDeleteMany({ files: seasonFiles, transfers: leaving, what: T('this season'), label: `${t.title} · ${label(se)}`, onDone: () => updateOpenTitle() }, o), 'is-danger'],
    ].filter(Boolean);
    const menu = seasonItems.length > 0 && rowActions(T('More for {0}', `${t.title} · ${label(se)}`), seasonItems);
    const summary = se.total ? plural(se.total, 'episode') : '';
    section.replaceChildren(
      h('h3', {}, T('Episodes')),
      picker,
      h('div', { class: 'season-head' }, h('p', { class: 'muted' }, summary), menu),
      seasonVersionPick(ready, () => draw()),
      tools && packs.length > 0 && h('p', { class: 'muted season-pack' }, T('{0} pack', label(se)), ' · ', T('Episode availability is shown when individual files are verified.')),
      h('ul', { class: 'episode-list', 'aria-live': 'polite' }, loading
        ? Array.from({ length: 3 }, () => h('li', { class: 'ep skeleton', 'aria-hidden': 'true' }, h('div', { class: 'wide-art' }), h('div', { class: 'ep-body' }, h('div', { class: 'bar' }), h('div', { class: 'bar' }))))
        : rows.length ? rows : [h('li', { class: 'muted' }, T('No episode details for this season yet.'))]));
  };
  if (t.id != null && state.status.search) {
    tvSeasons(t.id).then((list) => { tmdbSeasons = list || []; }, () => { tmdbSeasons = []; }).then(() => draw());
  }
  draw();
  return section;
}
// One episode, and pressing it plays it (play first): yours plays, someone else's copy plays at once, one that's
// coming or not here yet gets ready in the player (the server brings the next ones along). The lightning mark says
// it plays at once; one not aired yet shows its date. ⋯: Play on TV and To phone; the owner also Keep, Delete and the
// download's details.
function episodeRow(c, { k, ep, f, p, season, tvT }) {
  const name = k == null ? ep.name : `${k}. ${ep.name || f?.episodeName || T('Episode {0}', k)}`;
  const art = wideArt([ep.still || f?.still, c.t.backdrop]);
  const date = ep.airDate && new Date(`${ep.airDate}T12:00:00`);
  const airs = airsLabel(ep.airDate);
  const day = date && !airs && date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const tools = Boolean(state.status.admin);
  const body = (meta) => h('div', { class: 'ep-body' },
    h('p', { class: 'ep-title', title: f?.file || null }, name),
    h('p', { class: 'ep-meta' }, meta.filter(Boolean).map((x) => (x instanceof Node ? x : h('span', {}, x)))),
    ep.overview && h('p', { class: 'ep-overview' }, ep.overview),
    titleDetails.episodeCredits(ep)); // details: the episode's director, writers and guests, folded
  const seen = seenEpisode(tvT.id != null ? `tv:${tvT.id}` : titleKeyOf(f), season, k);
  const bolt = () => h('span', { class: 'instant-mark' }, icon('bolt'), h('span', { class: 'sr-only' }, T('Plays instantly')));
  if (f) {
    const file = libraryFile(f), saved = savedProgress(file);
    const pct = saved?.duration ? Math.min(100, saved.time / saved.duration * 100) : 0;
    if (pct > 1) art.append(h('span', { class: 'poster-progress', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })));
    const done = seen && pct <= 1; // partway through a rewatch: the progress says more than the tick
    if (done) art.append(watchedBadge());
    art.append(h('span', { class: 'play-glyph', 'aria-hidden': 'true' }, icon('play')));
    return h('li', { class: `ep is-mine${done ? ' is-watched' : ''}`, 'data-episode': k ?? '' },
      h('button', { type: 'button', class: 'ep-art title-card', 'aria-label': f.converting ? T('{0}: getting ready to play', name) : T('Play {0}', name),
        'aria-disabled': f.converting ? 'true' : null, onclick: () => (f.converting ? toast(T('Almost ready. It can be played in a moment.')) : openPlayer(file)) }, art),
      body([done && watchedMark(), !f.converting && pct <= 1 && !done && bolt(), ep.runtime && fmtRuntime(ep.runtime), day, f.converting ? T('Getting ready to play') : pct > 1 && T('{0}% watched', Math.round(pct)),
        tools && f.versions?.length > 1 && f.versionLabel, tools && f.expiresAt != null && h('span', { class: `expiry${f.expiresAt - Date.now() < 86400000 ? ' is-soon' : ''}` }, timeLeft(f.expiresAt))]),
      rowMenu(T('More for {0}', name), [
        [icon('tv'), T('Play on TV'), (o) => openPicker(file, o)],
        [icon('phone'), T('Download to phone'), (o) => openTravel(file, o)],
        tools && canExtend(f) && [icon('clock'), T('Keep {0} more days', extendDays()), async () => { await extendItems([f]); updateOpenTitle(); }],
        tools && [icon('trash'), T('Delete'), (o) => openDelete(file, o), 'is-danger'],
      ]));
  }
  const x = { t: tvT.id != null ? { ...c.t, id: tvT.id } : c.t, season, episode: k };
  const here = k != null && Boolean(targetServerCopy(x));
  const startable = k != null && !airs && (here || Boolean(p) || (canGet() && tvT.id != null));
  if (seen) art.append(watchedBadge());
  if (startable) art.append(h('span', { class: 'play-glyph', 'aria-hidden': 'true' }, icon('play')));
  const press = startable && h('button', { type: 'button', class: 'ep-art title-card', 'aria-label': T('Play {0}', name), onclick: (e) => playTitle(x, e.currentTarget) }, art);
  if (p) {
    const { d, ep: part } = p;
    return h('li', { class: 'ep is-missing pending-episode', 'data-episode': k, 'data-transfer-hash': d.hash, 'data-episode-number': part.episode, 'data-episode-season': part.season },
      press || h('div', { class: 'ep-art' }, art),
      body([tools ? h('span', { class: 'episode-transfer-state' }, part.available ? T('Ready · watch it from Details') : `${transferState(d)}${Number.isFinite(part.progress) ? ` · ${Math.floor(part.progress * 100)}%` : ''}`)
        : T('Getting it ready'), ep.runtime && fmtRuntime(ep.runtime)]),
      tools && h('div', { class: 'ep-actions' },
        h('button', { type: 'button', class: 'chip', onclick: (e) => openTransferDetails({ ...(c.entryNow() || { key: `title:${c.t.title}`, name: c.t.title }), transfers: [d] }, e.currentTarget) }, T('Details'))));
  }
  return h('li', { class: `ep ${here ? 'is-here' : 'is-missing'}${seen ? ' is-watched' : ''}`, 'data-episode': k },
    press || h('div', { class: 'ep-art' }, art),
    body([seen && watchedMark(), here && !seen && bolt(), ep.runtime && fmtRuntime(ep.runtime), airs || day]));
}
// "Airs 3 Dec 2026" for an episode whose air date (TMDB's YYYY-MM-DD) is still ahead, else null.
function airsLabel(airDate) {
  const date = airDate && new Date(`${airDate}T12:00:00`);
  if (!date || !(date > new Date())) return null;
  return T('Airs {0}', date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }));
}

function openFilmIdentity(f, opener) {
  let closed = false;
  let request = 0;
  const list = h('ul', { class: 'rows identity-results' });
  const status = h('p', { class: 'muted', role: 'status' });
  const input = h('input', { type: 'search', 'aria-label': T('Film title'), value: f.title });
  const form = h('form', { class: 'identity-search', onsubmit: (e) => { e.preventDefault(); search(); } }, input,
    h('button', { class: 'chip', type: 'submit' }, T('Search')));
  const draw = (results) => {
    list.replaceChildren(...results.map((t) => h('li', {}, h('button', { class: 'row identity-result', type: 'button', onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await api('/api/library/identify', jsonPost({ id: f.id, tmdbId: t.id }));
        if (!closed) closeTopOverlay();
        await loadLibrary();
        if (state.view === 'library') renderLibrary();
      } catch (err) { status.textContent = err.message; btn.disabled = false; }
    } },
    t.poster && h('img', { src: t.poster, alt: '', loading: 'lazy' }),
    h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, t.title),
      h('span', { class: 'row-meta' }, t.releaseDate || t.year || T('Release date unknown')),
      h('span', { class: 'identity-overview' }, t.overview || T('No description available.')))))));
    status.textContent = results.length ? T('Choose the poster and description that match your film.') : T('No films found. Try a different title.');
  };
  async function search() {
    const currentRequest = ++request;
    status.textContent = T('Searching…');
    try {
      const data = await api(`/api/library/identify?id=${encodeURIComponent(f.id)}&q=${encodeURIComponent(input.value.trim())}`);
      if (!closed && currentRequest === request) draw(data.results);
    } catch (err) { if (!closed && currentRequest === request) status.textContent = err.message; }
  }
  $('#picker-body').replaceChildren(h('h2', { id: 'picker-title' }, T('Identify film')),
    h('p', { class: 'muted' }, T('File: {0}', f.file)), form, status, list);
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { closed = true; opener?.focus({ preventScroll: true }); }));
  if (f.filmCandidates?.length) draw(f.filmCandidates); else search();
}

// ---------- end of the title page ----------

// ---------- Downloads ----------
// Cards are updated in place so progress animates and focus is preserved.
const dlCards = new Map();
const transferNodes = new Set();

let downloadsRequest = null;
let downloadsGeneration = 0;
// Mutations make every older in-flight snapshot stale, even within the same scope.
function invalidateDownloadsRead() { downloadsGeneration++; downloadsRequest = null; }
function downloadsChangedLibrary(before, after) {
  const own = (items) => items.filter((d) => d.mine !== false);
  const previous = new Map(own(before).map((d) => [d.hash, d]));
  const latest = new Map(own(after).map((d) => [d.hash, d]));
  const availability = d => JSON.stringify([(d?.libraryIds || []).slice().sort(), (d?.episodes || []).map(ep => [ep.season, ep.episode, ep.available, ep.libraryId])]);
  return [...latest.values()].some((d) => d.done && !previous.get(d.hash)?.done || availability(d) !== availability(previous.get(d.hash)))
    || [...previous.keys()].some((hash) => !latest.has(hash));
}
function loadDownloads() {
  if (!state.status.downloads) return Promise.resolve();
  const scope = state.dlScope;
  if (downloadsRequest?.scope === scope) return downloadsRequest.promise;
  const generation = ++downloadsGeneration;
  const promise = (async () => {
    try {
      const data = await api(`/api/downloads${scope === 'all' ? '?all=1' : ''}`, { signal: AbortSignal.timeout(15000) });
      if (generation !== downloadsGeneration || state.dlScope !== scope) return;
      libraryRefreshNeeded ||= downloadsChangedLibrary(state.downloads, data.items);
      state.downloads = data.items;
      state.downloadsError = null;
    } catch (err) { if (generation === downloadsGeneration) state.downloadsError = err.message; }
    finally { if (generation === downloadsGeneration) downloadsRequest = null; }
  })();
  downloadsRequest = { scope, promise };
  return promise;
}

function makeDlCard(d) {
  const refs = {};
  const el = h('li', { class: 'dl' },
    h('div', { class: 'dl-head' },
      h('div', { class: 'row-text' },
        refs.title = h('div', { class: 'row-title' }),
        refs.state = h('div', { class: 'dl-state' })),
      refs.actions = h('div', { class: 'row-actions' },
        refs.cast = h('button', { class: 'cast-btn', title: T('Play on TV'), onclick: () => openPicker({ ...refs.data, kind: 'dl', key: refs.data.hash }, refs.cast) }, icon('tv')),
        refs.play = h('button', { class: 'play-btn', onclick: () => {
          const part = playNowFile(refs.data);
          if (part) { openPlayer(playNowItem(refs.data, part)); return; }
          if (refs.data.converting) { toast(T('Almost ready. It can be played in a moment.')); return; }
          openPlayer({ ...refs.data, kind: 'dl', key: refs.data.hash });
        } }, icon('play'), T('Play')))),
    refs.release = h('p', { class: 'transfer-release' }),
    refs.files = h('details', { class: 'transfer-files' }, h('summary', {}, T('Files')), h('ul')),
    refs.error = h('p', { class: 'transfer-action-error', role: 'status' }),
    refs.bar = h('div', { class: 'bulbs', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i')),
    h('div', { class: 'dl-foot' },
      refs.stats = h('div', { class: 'dl-stats' }),
      h('div', { class: 'dl-controls' },
        refs.pause = h('button', { type: 'button', class: 'chip dl-ctl', onclick: () => togglePause(refs.data, refs.pause) }),
        refs.del = h('button', { type: 'button', class: 'chip dl-ctl', onclick: (e) => openDeleteDownload(refs.data, e.currentTarget) }, T('Delete')),
        refs.retry = h('button', { type: 'button', class: 'chip dl-ctl', onclick: () => { if (transferOperations.get(refs.data.hash)?.label) return; transferOperations.delete(refs.data.hash); runTransferAction(refs.data, 'retry'); } }, T('Retry')))));
  el._refs = refs;
  return el;
}

const isPaused = (d) => /^(paused|stopped)/.test(d.state || '');

const transferOperations = new Map();
async function runTransferAction(d, action) {
  if (d.canManage === false || transferOperations.has(d.hash)) return;
  const opener = document.activeElement, actionCard = opener?.closest?.('.dl');
  const operation = { label: action === 'pause' ? T('Pausing…') : action === 'resume' ? T('Resuming…') : T('Checking files…') };
  transferOperations.set(d.hash, operation); patchTransferNodes();
  try {
    await api(`/api/downloads/${encodeURIComponent(d.hash)}/${action}`, jsonPost({}));
    invalidateDownloadsRead();
    const latest = state.downloads.find(item => item.hash === d.hash);
    if (latest) latest.state = action === 'pause' ? 'pausedDL' : action === 'resume' ? 'downloading' : 'checkingDL';
    operation.error = null;
  } catch (err) { operation.error = err.message; }
  finally {
    if (operation.error) { operation.label = ''; } else transferOperations.delete(d.hash); patchUnifiedLibrary();
    if (document.activeElement === document.body) {
      const target = opener?.isConnected && !opener.hidden && !opener.disabled ? opener : [...(actionCard?.querySelectorAll('button') || [])].find(button => !button.hidden && !button.disabled && button.getClientRects().length > 0);
      target?.focus({ preventScroll: true });
    }
  }
}
async function togglePause(d) { const prior = transferOperations.get(d.hash); if (prior?.error) transferOperations.delete(d.hash); await runTransferAction(d, isPaused(d) ? 'resume' : 'pause'); }

function openDeleteDownload(d, opener) {
  if (transferOperations.get(d.hash)?.label || d.canManage === false) return;
  const restoreManager = pickerManagerSubview(opener);
  const body = $('#picker-body');
  const status = h('p', { class: 'device-status', role: 'status' });
  const label = [d.title, episodeLabel(d), d.year && !d.season ? `(${d.year})` : null].filter(Boolean).join(' ');
  const run = async (files, btn) => {
    body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    btn.textContent = T('Deleting…');
    try {
      await api(`/api/downloads/${d.hash}/delete`, jsonPost({ files }));
      invalidateDownloadsRead();
      if (!restoreManager) closeTopOverlay();
      state.downloads = state.downloads.filter((x) => x.hash !== d.hash);
      restoreManager?.();
      if (state.view === 'library') renderLibrary();
      if (state.view === 'downloads') renderDownloads();
      setTimeout(async () => { await Promise.all([loadLibrary(), loadDownloads()]); renderView(); }, 4000);
    } catch (err) {
      body.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      btn.textContent = btn.dataset.label;
      status.className = 'device-status is-error';
      status.textContent = err.message;
      if (document.activeElement === document.body) btn.focus({ preventScroll: true });
    }
  };
  const button = (text, cls, files) => {
    const b = h('button', { class: cls, 'data-label': text }, text);
    b.addEventListener('click', () => run(files, b));
    return b;
  };
  const cancel = h('button', { class: 'del-cancel', onclick: () => restoreManager ? restoreManager() : closeTopOverlay() }, T('Keep it'));
  body.replaceChildren(...[
    h('h2', { id: 'picker-title' }, d.done ? T('Delete this download?') : T('Cancel this download?')),
    h('p', { class: 'del-name' }, label),
    h('p', { class: 'muted' }, d.name),
    d.season != null && d.episode == null && h('p', { class: 'muted' }, T('This action affects every file in this season pack.')),
    d.libraryIds?.length && h('p', { class: 'muted' }, T('Files still used by another person’s library are protected. The server will refuse file deletion while they are shared.')),
    h('p', { class: 'muted' }, d.done
      ? T('Removes it from qBittorrent, so it stops seeding, and deletes its files ({0}). This can’t be undone.', fmtBytes(d.size))
      : T('Stops the download and deletes what has been downloaded so far ({0}% of {1}).', Math.floor(d.progress * 100), fmtBytes(d.size))),
    h('div', { class: 'del-actions' },
      button(d.done ? T('Remove transfer and delete files') : T('Cancel and delete downloaded files'), 'del-confirm', true),
      button(T('Remove from list, keep files'), 'del-confirm del-secondary', false),
      cancel),
    status].filter(Boolean));
  if (!restoreManager) pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => opener?.focus({ preventScroll: true })));
  cancel.focus();
}

// "12 of 340 seeders": connected now, of the whole swarm. The bulb is lit when plenty feed it, dim with a few, out with none.
function seedersChip(d) {
  if (!Number.isFinite(d.seeds)) return null;
  const swarm = Number.isFinite(d.swarmSeeds) && d.swarmSeeds > d.seeds ? d.swarmSeeds : null;
  const health = d.seeds >= 10 ? 'good' : d.seeds >= 1 ? 'ok' : 'poor';
  const text = swarm != null ? T('{0} of {1} seeders', d.seeds.toLocaleString(locale), swarm.toLocaleString(locale)) : `${d.seeds.toLocaleString(locale)} ${d.seeds === 1 ? 'seeder' : 'seeders'}`;
  return h('span', { class: `seeds seeds-${health}`, title: swarm != null ? T('Connected to {0} of the {1} seeders the trackers report', d.seeds.toLocaleString(locale), swarm.toLocaleString(locale)) : T('Seeders connected right now') }, text);
}

// Play now: one video still downloading, sample files aside. A season pack offers it per episode instead.
function playNowCandidate(d) {
  if (!d?.canPlayNow || d.ready || d.done || !d.files?.length) return null;
  const [main, next] = d.files.toSorted((a, b) => b.size - a.size);
  return main.available || (next && main.size < next.size * 3) ? null : main;
}
// Play now shows once the start of the video is on the server; until then a line says it's coming.
function playNowFile(d) { const main = playNowCandidate(d); return main?.started ? main : null; }
function playNowSoon(d) {
  const main = playNowCandidate(d);
  if (!main || main.started || isPaused(d)) return '';
  return main.startState === 'downloading' ? T('Play now in a moment: getting the start of the video') : T('Play now once the start of the video arrives');
}
const playNowItem = (d, file, ep = null) => ({ kind: 'part', key: `${d.hash}-${file.index ?? file.fileIndex}`, hash: d.hash, mediaKey: file.mediaKey || undefined,
  title: d.canonicalTitle || d.title, filmTitle: d.canonicalTitle || d.title, show: d.showId || undefined, tmdbId: d.tmdbId ?? undefined,
  season: ep?.season ?? d.season ?? null, episode: ep?.episode ?? d.episode ?? null,
  episodeName: ep?.episodeName || (ep == null || ep.episode === d.episode ? d.episodeName : null) || null });

function updateDlCard(el, d) {
  if (!el) return;
  const r = el._refs;
  r.data = d;
  const pct = Math.floor(Math.max(0, Math.min(1, Number(d.progress) || 0)) * 100);
  const operation = transferOperations.get(d.hash);
  const label = operation?.label || (d.ready ? (d.converting ? T('Preparing playback') : T('Ready to watch')) : transferState(d));
  r.release.textContent = d.name;
  const scope = packScope(d);
  r.error.textContent = operation?.error || (d.ready && d.mediaType === 'tv' && d.episode == null && !(d.libraryIds || []).length ? T('Verified files are outside the media library. Add the download folder to the media library to play individual episodes.') : '') || (d.canManage === false ? T('Shared download. Only the person who started it can change the transfer.') : '');
  const fileKey = JSON.stringify(d.files || []);
  if (r.fileKey !== fileKey) { r.fileKey = fileKey; r.files.hidden = !(d.files || []).length; r.files.querySelector('ul').replaceChildren(...(d.files || []).map(f => h('li', {}, `${f.name} · ${fmtBytes(f.size)} · ${f.available ? T('File ready') : `${Math.floor((f.progress || 0)*100)}%`}`))); }
  r.title.textContent = [d.canonicalTitle || d.title, scope ? `${seasonName(d.season)} · ${scope}` : d.season != null && d.episode == null ? T('{0} pack', seasonName(d.season)) : episodeLabel(d), d.year && !d.season ? `(${d.year})` : null].filter(Boolean).join(' ');
  r.title.title = d.name;
  const soon = playNowSoon(d);
  r.state.textContent = [state.dlScope === 'all' && d.owner ? T('{0} · for {1}', label, d.owner) : label, soon].filter(Boolean).join(' · ');
  r.state.classList.toggle('is-error', d.state === 'error' || d.state === 'missingFiles');
  const playNow = playNowFile(d);
  r.actions.hidden = !playNow && (!d.ready || d.mediaType === 'tv' && d.episode == null);
  r.cast.hidden = Boolean(playNow);
  r.play.lastChild.textContent = playNow ? T('Play now') : T('Play');
  r.play.setAttribute('aria-label', T('Play {0} here', d.title));
  r.cast.setAttribute('aria-label', T('Play {0} on a TV', d.title));
  r.bar.hidden = d.done;
  r.bar.style.setProperty('--p', `${pct}%`);
  if (Number.isFinite(d.progress) && d.size > 0) r.bar.setAttribute('aria-valuenow', String(Math.floor(pct))); else r.bar.removeAttribute('aria-valuenow');
  r.bar.setAttribute('aria-valuetext', `${label}${Number.isFinite(d.progress) && d.size > 0 ? `, ${pct} percent` : ''}`);
  r.bar.setAttribute('aria-label', T('{0} download progress', d.title));
  const SUB_STATE = { waiting: T('subtitles when done'), ready: T('subtitles ready'), missing: T('subtitles not found'), error: T('subtitles failed') };
  const subs = (d.subs || []).map((x) => h('span', { class: `sub-state sub-${x.state}` }, `${x.name} ${SUB_STATE[x.state] || ''}`));
  const stats = d.done
    ? [fmtBytes(d.size), ...subs]
    : [h('strong', {}, Number.isFinite(d.progress) && d.size > 0 ? `${pct}%` : label), d.size > 0 && `${fmtBytes(Math.round(d.size * (Number(d.progress) || 0)))} / ${fmtBytes(d.size)}`, !isPaused(d) && !transferAttention(d) && !/checking/.test(d.state || '') && d.speed > 0 && `${fmtBytes(d.speed)}/s`, !isPaused(d) && !transferAttention(d) && !/checking/.test(d.state || '') && Number.isFinite(d.eta) && d.eta >= 0 && d.eta < 8640000 && fmtEta(d.eta), !isPaused(d) && !/checking/.test(d.state || '') && seedersChip(d), ...subs];
  if (scope) stats.push(T('Skipping {0} of {1} episodes', d.skippedFiles, d.packFiles));
  r.stats.replaceChildren(...stats.filter(Boolean).map((s) => (s instanceof Node ? s : h('span', {}, s))));
  r.pause.hidden = d.done;
  r.del.hidden = d.canManage === false;
  r.del.textContent = d.done ? T('Remove transfer') : !scope && d.season != null && d.episode == null ? T('Cancel season pack') : T('Cancel download');
  r.pause.disabled = d.canManage === false; r.del.disabled = false;
  r.pause.setAttribute('aria-disabled', String(d.canManage === false || Boolean(operation?.label))); r.del.setAttribute('aria-disabled', String(Boolean(operation?.label)));
  r.retry.hidden = !transferAttention(d) && !operation?.error; r.retry.disabled = d.canManage === false; r.retry.setAttribute('aria-disabled', String(d.canManage === false || Boolean(operation?.label)));
  r.play.classList.toggle('is-disabled', Boolean(d.converting));
  r.play.setAttribute('aria-disabled', String(Boolean(d.converting)));
  r.play.title = d.converting ? T('Getting ready to play') : '';
  r.pause.textContent = operation?.label || (isPaused(d) ? T('Resume') : T('Pause'));
  r.pause.setAttribute('aria-label', `${isPaused(d) ? T('Resume') : T('Pause')} ${d.title}`);
}

let managerView = null;
function pickerManagerSubview(opener) {
  if (!managerView || !$('#picker-body').contains(opener)) return null;
  const manager = managerView, content = [...$('#picker-body').childNodes];
  manager.suspended = true;
  return () => {
    if (managerView !== manager) return;
    $('#picker-body').replaceChildren(...content); manager.suspended = false; drawTransferDetails();
    (opener?.isConnected ? opener : $('#picker-body').querySelector('button') || $('#picker').querySelector('.sheet-close'))?.focus({ preventScroll: true });
  };
}
function renderDownloads() { patchTransferNodes(); }
function openTransferDetails(entry, opener) {
  const list = h('ul', { class: 'rows transfer-detail-list' });
  const scope = h('div');
  $('#picker-body').replaceChildren(h('h2', { id: 'picker-title' }, entry ? T('{0} downloads', entry.name) : T('Manage server downloads')), scope, list);
  managerView = { list, entryKey: entry?.key || null, hashes: entry?.transfers.map(d => d.hash) || null, scope };
  if (!entry && state.me?.isOwner) scope.append(segmented([['mine', T('Mine')], ['all', T('Everyone')]], state.dlScope, async v => { state.dlScope = v; scope.querySelectorAll('button').forEach((b,i) => b.setAttribute('aria-pressed', String((i ? 'all' : 'mine') === v))); await loadDownloads(); drawTransferDetails(); }, T('Whose downloads')));
  drawTransferDetails();
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { managerView = null; if (state.dlScope !== 'mine') { state.dlScope = 'mine'; loadDownloads().then(patchUnifiedLibrary); } opener?.focus({ preventScroll: true }); }));
}
function drawTransferDetails() {
  if (!managerView || managerView.suspended) return;
  const { list, hashes } = managerView;
  const items = state.downloads.filter(d => hashes ? hashes.includes(d.hash) : true);
  if (items.length) for (const child of [...list.children]) if (!child._refs) child.remove();
  const seen = new Set();
  for (const [index,d] of items.entries()) {
    let card = dlCards.get(d.hash); if (!card || !list.contains(card)) { card = makeDlCard(d); dlCards.set(d.hash, card); transferNodes.add(card); }
    transferNodes.add(card); updateDlCard(card,d); seen.add(d.hash); if (list.children[index] !== card) list.insertBefore(card,list.children[index] || null);
  }
  for (const child of [...list.children]) if (child._refs && !seen.has(child._refs.data.hash)) child.remove();
  if (!items.length && !list.children.length) list.append(h('li', { class: 'muted' }, state.downloadsError || T('No downloads in this view.')));
}
function patchTransferNodes() {
  for (const node of transferNodes) {
    if (!node.isConnected) { transferNodes.delete(node); continue; }
    const d = state.downloads.find(d => d.hash === node._refs.data.hash); if (d) updateDlCard(node, d);
  }
  for (const row of document.querySelectorAll('.pending-episode')) {
    const d = state.downloads.find(d => d.hash === row.dataset.transferHash), ep = d?.episodes?.find(ep => String(ep.season) === row.dataset.episodeSeason && String(ep.episode) === row.dataset.episodeNumber);
    const line = $('.episode-transfer-state', row); // the owner's rows say how the transfer is doing
    if (ep && line) line.textContent = ep.available ? T('Ready · watch it from Details') : `${transferState(d)}${Number.isFinite(ep.progress) ? ` · ${Math.floor(ep.progress*100)}%` : ''}`;
  }
  drawTransferDetails();
  refreshCommandViews();
}
// An open title page follows along from any tab (renderLibrary does it too while House › Downloads is shown).
function patchUnifiedLibrary() {
  if (state.view === 'library') renderLibrary();
  else { updateOpenTitle(); rightNow.update(); }
  updateHouseDot();
  patchTransferNodes();
}

// Downloads claims completed files before replying, so read it before refreshing the library.
let mediaRefreshRequest = null;
function refreshMediaLibrary() {
  if (mediaRefreshRequest) return mediaRefreshRequest;
  mediaRefreshRequest = (async () => {
    await loadDownloads();
    if (state.view === 'downloads') renderDownloads();
    if (libraryRefreshNeeded || (state.view === 'library' || current) && Date.now() - libraryLastChecked >= 30000) {
      libraryRefreshNeeded = false;
      await loadLibrary();
      libraryRefreshNeeded ||= Boolean(state.libraryError);
      renderUpdatedLibrary();
    }
    if (typeof patchUnifiedLibrary === 'function') patchUnifiedLibrary();
  })().finally(() => { mediaRefreshRequest = null; });
  return mediaRefreshRequest;
}
let pollTimer;
function schedulePoll() {
  clearTimeout(pollTimer);
  const clipsBusy = state.view === 'clips' && state.clips?.clips?.some((c) => (c.share && !c.share.ready && !c.share.error) || c.editing);
  const powerBusy = state.view === 'house' && state.house?.power?.some((pw) => pw.pending);
  const downloading = state.downloads.some((d) => d.mine !== false && !d.done);
  const delay = state.view === 'library' && state.sub === 'downloads' ? 2000 : state.view === 'notes' ? 5000 : state.view === 'library' || downloading || current || clipsBusy || powerBusy ? 3000 : ['activity', 'house'].includes(state.view) ? 10000 : 15000;
  pollTimer = setTimeout(async () => {
    try {
      if (!document.hidden) {
        await Promise.all([refreshMediaLibrary(), loadSessions(), state.view === 'library' ? loadConvert() : null]);
        if (state.view === 'activity' && !$('#activity-body .person-name .clip-rename-form')) { await loadActivity(); if (state.view === 'activity') renderActivity(); }
        if (houseLive()) { await loadHouse(); if (houseLive()) renderHouse(); }
        if (state.view === 'notes') await notesView.poll();
        if (state.view === 'clips' && clipsBusy && !$('#clips-body .clip-rename-form')) { await loadClips(); if (state.view === 'clips') renderClips(); }
        if (state.view === 'library') renderConvertBanner();
      }
    } finally { schedulePoll(); }
  }, delay);
}
function refreshOnReturn() {
  if (document.hidden) return;
  refreshMediaLibrary().catch(() => {}).finally(schedulePoll);
  updateUpNext();
}
document.addEventListener('visibilitychange', refreshOnReturn);
window.addEventListener('pageshow', refreshOnReturn);
document.addEventListener('focusout', () => { if (libraryRenderPending) setTimeout(renderUpdatedLibrary, 0); });

// ---------- live updates ----------
// The server announces what changed (live.js on the server: a delete, a finished download, progress
// saved on another device, a new note...), and this page refetches just that part right away instead
// of waiting for the next poll or a reload. Polling above stays as the fallback.
const live = { source: null, topics: new Set(), timer: null, resync: false, retry: null };
function connectLive(resync = false) {
  if (live.source || document.hidden || typeof EventSource !== 'function') return;
  clearTimeout(live.retry);
  live.resync ||= resync;
  const source = live.source = new EventSource(`/api/events?tab=${TAB_ID}`);
  source.onopen = () => { if (live.resync) { live.resync = false; queueLive('all'); } };
  source.onmessage = (e) => { try { queueLive(JSON.parse(e.data).topic); } catch { /* not ours */ } };
  source.onerror = () => {
    live.resync = true; // events may have been missed while the stream was down
    if (source.readyState !== EventSource.CLOSED) return; // the browser reconnects by itself
    if (live.source === source) live.source = null; // e.g. the sign-in ran out; try again later
    live.retry = setTimeout(() => connectLive(true), 30000);
  };
}
function disconnectLive() { clearTimeout(live.retry); live.source?.close(); live.source = null; }
// Hidden pages drop the stream (phones, and the browser's limit on open connections) and catch up on return.
document.addEventListener('visibilitychange', () => { if (document.hidden) disconnectLive(); else connectLive(true); });
function queueLive(topic) {
  live.topics.add(topic);
  clearTimeout(live.timer);
  live.timer = setTimeout(applyLive, 150);
}
// A refresh that is already running may have started before the change, so run one more after it.
async function refreshLibraryNow() {
  libraryRefreshNeeded = true;
  if (mediaRefreshRequest) await mediaRefreshRequest.catch(() => {});
  if (libraryRefreshNeeded) await refreshMediaLibrary();
}
const editingIn = (sel) => { const el = document.activeElement; return Boolean(el && $(sel)?.contains(el) && el.matches('input, textarea, select, [contenteditable="true"]')); };
async function applyLive() {
  const topics = live.topics;
  live.topics = new Set();
  const has = (t) => topics.has('all') || topics.has(t);
  const view = state.view;
  const jobs = [];
  if (has('library') || has('people')) {
    jobs.push(refreshLibraryNow().then(() => (view === 'library' ? loadConvert().then(renderConvertBanner) : null)));
  }
  if (has('progress')) {
    jobs.push(loadProgress().then(() => { invalidateLibraryProgress(); if (state.view === 'library') renderLibrary(); updateUpNext(); }));
  }
  if (has('sessions')) jobs.push(loadSessions());
  if (has('watchlist')) jobs.push(loadWatchlist());
  if (has('travel')) jobs.push(loadTravel());
  if (has('push')) { pushView.loaded = false; if (settingsOpen() && !editingSettings()) jobs.push(loadPush().then(renderSettings)); }
  if (has('match')) pickUi.onLive(); // pick: Pick together
  // friends, Moments and answers to your ideas: You's For you and its tab dot (+ the friend request popup elsewhere)
  if (has('moments')) { momentsUI.invalidate(); jobs.push(momentsUI.load().then(() => { updateYouDot(); if (settingsOpen()) renderSettingsWhenStill(); })); }
  if (has('friends') || has('people')) { friendsUI.invalidate(); jobs.push(friendsUI.load().then(() => { updateYouDot(); if (settingsOpen()) renderSettingsWhenStill(); else maybeAskFriends(); })); }
  if (has('ideas')) { ideasView.loaded = false; if (settingsOpen() || !state.me?.isOwner) jobs.push(loadIdeas().then(() => { updateYouDot(); if (settingsOpen() && !editingSettings()) renderSettingsWhenStill(); })); }
  if (has('social') || has('avatars')) social.refreshRates();
  if (has('reviews') || has('social') || has('avatars') || has('people')) reviews.refresh(); // reviews
  if ((has('parties') || has('avatars') || has('match')) && view === 'live') jobs.push(loadParties().then(() => { if (state.view === 'live') renderLive(); }));
  if (has('me') || has('people') || has('avatars')) {
    jobs.push((async () => {
      try {
        state.status = await api('/api/status');
        state.me = state.status.me; state.rules = state.status.rules;
        applyTheme(prefs().theme);
        renderTabs(); // e.g. the owner just let them see Activity
      } catch { return; }
      maybeShowWhatsNew(); // e.g. the server came back from an update
      if (state.view === 'house' && state.sub === 'people') await loadPeople();
      if (settingsOpen()) renderSettingsWhenStill();
    })());
  }
  if (has('notes') && view === 'notes') jobs.push(notesView.poll());
  if (has('clips') && view === 'clips' && !$('#clips-body .clip-rename-form')) jobs.push(loadClips().then(() => { if (state.view === 'clips') renderClips(); }));
  if (has('house') && houseLive()) jobs.push(loadHouse().then(() => { if (state.view === 'house') renderHouse(); }));
  // Every change shows up in the Activity log.
  if (topics.size && view === 'activity') jobs.push(loadActivity().then(() => { if (state.view === 'activity') renderActivity(); }));
  await Promise.allSettled(jobs);
}

// Back closes the top overlay (below) or, with none open, moves between pages (the shell, near the end). This runs
// first, so the shell can tell which.
let popHadOverlay = false;
window.addEventListener('popstate', () => { popHadOverlay = overlayStack.length > 0; });

// ---------- overlays ----------
// Each overlay pushes a history entry so the browser/phone back gesture closes it.
const overlayStack = [];
// history.back() is asynchronous: a second tap on X before its popstate must not go back again, or
// it steps out of Lilin (on iPad Safari that closes a tab opened from another one).
let pendingBacks = 0;
function pushOverlay(close) {
  overlayStack.push(close);
  history.pushState({ overlay: overlayStack.length }, '');
}
function closeTopOverlay() {
  if (overlayStack.length <= pendingBacks) return;
  pendingBacks++;
  history.back();
  setTimeout(() => { pendingBacks = Math.max(0, pendingBacks - 1); }, 1500); // a lost popstate never locks the X
}
// Browser-back is asynchronous. Transitions must wait before pushing a replacement player.
function dismissTopOverlay() {
  if (!overlayStack.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { window.removeEventListener('popstate', done); reject(new Error(T('Couldn’t close the previous screen. Please try joining again.'))); }, 3000);
    window.addEventListener('popstate', done, { once: true });
    closeTopOverlay();
  });
}
// Replaces the top overlay without adding a history entry.
function swapTopOverlay(close) {
  overlayStack.pop()?.();
  overlayStack.push(close);
  history.replaceState({ overlay: overlayStack.length }, '');
}
window.addEventListener('popstate', () => { if (pendingBacks) pendingBacks--; overlayStack.pop()?.(); renderUpdatedLibrary(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!playerEl.hidden && playerMenuOpen()) {
    const back = [settingsMenu, ccMenu, audioMenu, nightMenu, qualityMenu].some((m) => !m.hidden) ? settingsBtn
      : !fsGuide.hidden ? fsBtn : null;
    closePlayerMenus();
    back?.focus();
    return;
  }
  if (watchPanelOpen) { setWatchPanel(false); $('#watch-btn').focus(); return; }
  if (fsElement()) { toggleFullscreen(); return; }
  if (Date.now() - fsExitedAt < 500) return; // that Escape just took the player out of fullscreen
  closeTopOverlay();
});

// ---------- sheets ----------
const sheetHideTimers = new Map();
function showSheet(sheet, backdrop, onClosed, { instant = false } = {}) {
  clearTimeout(sheetHideTimers.get(sheet));
  sheet.hidden = backdrop.hidden = false;
  sheet.scrollTop = 0;
  const open = () => { sheet.classList.add('open'); backdrop.classList.add('open'); };
  if (instant) open(); else requestAnimationFrame(open); // instant: inside a view transition, which animates it
  sheet.querySelector('.sheet-close').focus({ preventScroll: true });
  return () => {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    sheetHideTimers.set(sheet, setTimeout(() => { sheet.hidden = backdrop.hidden = true; }, 300));
    onClosed?.();
  };
}

for (const [sheetSel, backdropSel] of [['#sheet', '#sheet-backdrop'], ['#picker', '#picker-backdrop']]) {
  const sheet = $(sheetSel);
  sheet.querySelector('.sheet-close').addEventListener('click', closeTopOverlay);
  $(backdropSel).addEventListener('click', closeTopOverlay);
  // Swipe down to close
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { startY = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (startY != null && e.changedTouches[0].clientY - startY > 90) closeTopOverlay();
    startY = null;
  });
}

// The backdrop at the top of a title sheet. When TMDB has a trailer, a Trailer button sits on it and
// the trailer plays right there, in the backdrop's place (YouTube's no-cookie player, loaded on click).
function detailsHero(t) {
  const hero = pageHero(t.backdrop);
  if (!t.id || !['movie', 'tv'].includes(t.type)) return hero;
  cachedFor(`/api/title/${t.type}/${t.id}/trailer`, 60 * 60 * 1000).then(({ trailer }) => {
    if (!trailer || !hero.isConnected) return;
    const label = trailer.type === 'Teaser' ? T('Teaser') : T('Trailer');
    const play = h('button', { type: 'button', class: 'trailer-btn', 'aria-label': T('Play {0}: {1}', label.toLowerCase(), t.title) },
      icon('play'), h('span', {}, label));
    play.addEventListener('click', () => {
      // YouTube's controls would be shrunk with the scaled player, so Lilin draws its own (trailer-controls.js)
      const src = trailerSrc(trailer.key, HD_HINT);
      // the backdrop stays behind the player (blurred and dimmed on wide screens, see .is-playing in style.css)
      hero.classList.add('is-playing');
      document.body.classList.add('trailer-live');
      play.remove();
      // .trailer-frame is the box; the iframe inside is laid out at full-HD size and scaled to fit it (trailer-size.js)
      const box = h('div', { class: 'trailer-frame' });
      const frame = h('iframe', {
        src, title: `${t.title}: ${trailer.name}`,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      box.append(frame);
      hero.append(box);
      fitTrailer(frame, box);
      trailerControls(box, frame, icon);
    });
    hero.append(play);
  }).catch(() => {});
  return hero;
}

// ---------- title pages: the hero, a colour of their own, logo art, facts, cast, more like this ----------
// The backdrop at the top of a title page (an <img>, so it can fade in), and the page's colour wash.
const loadedArt = new Set(); // pictures already shown once: no fade the second time
function pageHero(backdrop) {
  const hero = h('div', { class: `sheet-hero${backdrop ? '' : ' no-image'}` });
  washPage(backdrop);
  if (!backdrop) return hero;
  const src = bigArt(backdrop);
  const img = h('img', { class: `hero-img${loadedArt.has(src) ? ' is-loaded' : ''}`, src, alt: '', decoding: 'async', fetchpriority: 'high' });
  img.addEventListener('load', () => { loadedArt.add(src); img.classList.add('is-loaded'); }, { once: true });
  img.addEventListener('error', () => { hero.style.backgroundImage = `url("${backdrop}")`; img.remove(); }, { once: true });
  hero.append(img);
  return hero;
}
// A colour sampled from the backdrop (a 24×14 read of TMDB's small copy, fetched through /api/art), kept in the
// lightness the theme needs, so every title page has its own room tone. Falls back to the theme's own.
const washes = new Map();
// Worked out once per title and remembered on this device, so a title page has its colour from the first frame.
const WASH_KEY = 'lilin.washes';
let washStore = null;
const washSaved = () => (washStore ||= (() => { try { return JSON.parse(localStorage.getItem(WASH_KEY)) || {}; } catch { return {}; } })());
function saveWash(key, rgb) {
  const store = washSaved();
  store[key] = rgb && rgb.map(Math.round);
  const keys = Object.keys(store);
  for (const k of keys.slice(0, Math.max(0, keys.length - 600))) delete store[k];
  try { localStorage.setItem(WASH_KEY, JSON.stringify(store)); } catch { /* full */ }
}
function washColour(url) {
  const small = String(url).replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w300/');
  const key = new URL(small).pathname;
  if (!washes.has(small) && key in washSaved()) washes.set(small, Promise.resolve(washSaved()[key]));
  if (!washes.has(small)) washes.set(small, new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 14;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 24, 14);
        const d = g.getImageData(0, 0, 24, 14).data;
        let r = 0, gr = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
          if (max < 24 || min > 236) continue; // skip black bars and blown-out sky
          const weight = 0.2 + ((max - min) / 255) ** 2 * 4; // colourful pixels count more
          r += d[i] * weight; gr += d[i + 1] * weight; b += d[i + 2] * weight; w += weight;
        }
        const rgb = w ? [r / w, gr / w, b / w] : null;
        saveWash(key, rgb);
        resolve(rgb);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = `/api/art?path=${encodeURIComponent(new URL(small).pathname)}`; // through the server: same origin, so its pixels can be read
  }));
  return washes.get(small);
}
function washPage(backdrop) {
  const sheet = $('#sheet');
  sheet.style.removeProperty('--wash');
  sheet.style.removeProperty('--wash-glow');
  if (!backdrop || !/^https:\/\/image\.tmdb\.org\//.test(backdrop)) return; // only TMDB lets a page read its pixels
  washColour(backdrop).then((rgb) => {
    if (!rgb || !sheet.querySelector('.sheet-hero')) return;
    // to HSL, then a lightness that suits the theme and a saturation that stays tasteful
    const [r, g, b] = rgb.map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const dlt = max - min, sat = dlt ? dlt / (1 - Math.abs(2 * l - 1)) : 0;
    const hue = !dlt ? 0 : max === r ? 60 * (((g - b) / dlt) % 6) : max === g ? 60 * ((b - r) / dlt + 2) : 60 * ((r - g) / dlt + 4);
    const light = document.documentElement.dataset.scheme === 'light';
    const h360 = Math.round((hue + 360) % 360);
    sheet.style.setProperty('--wash', `hsl(${h360} ${Math.round(Math.min(sat, light ? 0.45 : 0.6) * 100)}% ${light ? 82 : 30}%)`);
    // The same colour, lit, for the Play button's glow (a grey picture keeps the theme's own glow).
    if (sat > 0.12) sheet.style.setProperty('--wash-glow', `hsl(${h360} ${Math.round(Math.min(Math.max(sat, 0.5), 0.85) * 100)}% ${light ? 45 : 58}%)`);
  });
}
// The title as logo art when TMDB has some (the heading keeps the name as the picture's alt text).
const loadedLogos = new Set();
function pageTitle(title, type, id) {
  const heading = h('h2', { id: 'sheet-title' }, title);
  if (!id || !['movie', 'tv'].includes(type) || !state.status.search) return heading;
  pageInfo(type, id).then((page) => {
    if (!page?.logo || !heading.isConnected) return;
    const logo = h('img', { class: `page-logo${page.logo.aspect > 3.2 ? ' is-wide' : ''}`, src: page.logo.url, alt: title, decoding: 'async' });
    // Light themes: a white logo would vanish on the page, so light logos are drawn dark there.
    if (document.documentElement.dataset.scheme === 'light') logoIsLight(page.logo.url).then((light) => logo.classList.toggle('on-light', light));
    if (loadedLogos.has(page.logo.url)) heading.replaceChildren(logo);
    else logo.addEventListener('load', () => { loadedLogos.add(page.logo.url); if (heading.isConnected) heading.replaceChildren(logo); }, { once: true });
  }).catch(() => {});
  return heading;
}
// Whether a logo is mostly light (white lettering): the average brightness of its visible pixels (logoTone: 0-1,
// null when it can't be read, e.g. an SVG logo).
const logoTones = new Map();
const logoIsLight = (url) => logoTone(url).then((tone) => tone !== null && tone > 0.62);
function logoTone(url) {
  if (!logoTones.has(url)) logoTones.set(url, new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 48; c.height = 24;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 48, 24);
        const d = g.getImageData(0, 0, 48, 24).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
        resolve(n > 0 ? sum / n : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    const small = new URL(String(url).replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w185/')).pathname;
    if (!/\.png$/.test(small)) return resolve(null); // an SVG logo: leave it as it is
    img.src = `/api/art?path=${encodeURIComponent(small)}`;
  }));
  return logoTones.get(url);
}
const fmtRuntime = (min) => (min >= 60 ? T('{0} h {1} min', Math.floor(min / 60), min % 60) : T('{0} min', min));
// One quiet line of facts: year · age rating · running time or seasons · genres · ★. TMDB's extras fill in when they arrive.
function pageFacts(base, type, id) {
  const list = h('ul', { class: 'facts' }, base.filter(Boolean).map((x) => (x instanceof Node ? x : h('li', {}, x))));
  if (!id || !['movie', 'tv'].includes(type) || !state.status.search) return list;
  pageInfo(type, id).then((page) => {
    if (!page || !list.isConnected) return;
    const before = list.querySelector('.fact-rating, .fact-owned');
    const extra = [
      page.certification && h('li', {}, h('span', { class: 'fact-cert', title: T('Age rating') }, page.certification)),
      type === 'movie' && page.runtime && h('li', {}, fmtRuntime(page.runtime)),
      type === 'tv' && page.seasons && h('li', {}, plural(page.seasons, 'season')),
      page.genres?.length && h('li', {}, page.genres.slice(0, 3).join(', ')),
    ].filter(Boolean);
    if (before) before.before(...extra); else list.append(...extra);
    // Cards from Continue watching, New episodes or someone's list carry no rating: TMDB's fills it in.
    if (!list.querySelector('.fact-rating') && page.rating) list.append(h('li', { class: 'fact-rating' }, `★ ${fmtRating(page.rating)}`));
    if (page.tagline && !list.parentNode.querySelector('.page-tagline')) list.before(h('p', { class: 'page-tagline' }, page.tagline));
  }).catch(() => {});
  return list;
}
// The cast with faces; each opens the person on TMDB.
function castRail(type, id) {
  if (!id || !['movie', 'tv'].includes(type) || !state.status.search) return null;
  const section = h('section', { class: 'page-section cast-section', hidden: true });
  pageInfo(type, id).then((page) => {
    const people = page?.cast || [];
    if (!people.length || !section.isConnected) return;
    // Same arrows as the other rows (hidden on touch screens and while every face fits).
    section.replaceChildren(carousel(T('Cast'), h('ul', { class: 'cast-rail', tabindex: '0', 'aria-label': T('Cast') }, people.map((p) => h('li', {},
        h('a', { class: 'cast-person', href: `https://www.themoviedb.org/person/${encodeURIComponent(p.id)}`, target: '_blank', rel: 'noopener noreferrer' },
          p.photo ? h('span', { class: 'cast-face' }, h('img', { src: p.photo, alt: '', loading: 'lazy', decoding: 'async' }))
            : h('span', { class: 'cast-face no-photo', 'aria-hidden': 'true' }, p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')),
          h('span', { class: 'cast-name' }, p.name),
          p.character && h('span', { class: 'cast-role' }, p.character))))), null, 'page-shelf'));
    section.hidden = false;
  }).catch(() => {});
  return section;
}
// More like this: TMDB's recommendations. A card opens that title right here; Back comes back.
function moreLike(type, id) {
  if (!id || !['movie', 'tv'].includes(type) || !state.status.search) return null;
  const section = h('section', { class: 'page-section more-like', hidden: true });
  pageInfo(type, id).then((page) => {
    const items = (page?.similar || []).slice(0, 18);
    if (items.length < 3 || !section.isConnected) return;
    section.replaceChildren(carousel(T('More like this'), h('ul', { class: 'shelf-items', tabindex: '0', 'aria-label': T('More like this') }, items.map(titleCard)), null, 'page-shelf'));
    section.hidden = false;
  }).catch(() => {});
  return section;
}
// "Cast: …" under a title's description. Sheets re-render while they're open, so names already fetched
// go straight in instead of blinking; nothing shows when TMDB has no cast.
const knownCasts = new Map();
function castLine(type, id) {
  if (!id || !['movie', 'tv'].includes(type)) return null;
  const key = `${type}/${id}`;
  const line = h('p', { class: 'cast-line' });
  const fill = (people) => {
    line.hidden = !people?.length;
    if (!people?.length) return;
    line.replaceChildren(h('span', { class: 'cast-label' }, T('Cast:')), ' ', ...people.flatMap((p, i) => [i ? ', ' : '',
      h('a', { href: `https://www.themoviedb.org/person/${encodeURIComponent(p.id)}`, target: '_blank', rel: 'noopener noreferrer' }, p.name)]));
  };
  fill(knownCasts.get(key));
  if (!knownCasts.has(key)) {
    cachedFor(`/api/title/${key}/cast`, 60 * 60 * 1000).then(({ people }) => {
      knownCasts.set(key, people);
      fill(people);
    }).catch(() => {});
  }
  return line;
}

// Requests worth repeating within a few minutes (re-rendering a sheet shouldn't search again).
const shortCache = new Map(); // url -> { at, promise }
function cachedFor(url, ms = 5 * 60 * 1000) {
  const hit = shortCache.get(url);
  if (hit && Date.now() - hit.at < ms) return hit.promise;
  const promise = api(url);
  promise.catch(() => shortCache.delete(url));
  shortCache.set(url, { at: Date.now(), promise });
  return promise;
}
const tvSeasons = (id) => cachedFor(`/api/tv/${id}/seasons`, 30 * 60 * 1000).then((d) => d.seasons);

// ---------- Download: you choose what, the server chooses how (smart-download.js) ----------
// One command for films, seasons and single episodes. Films: Download picks a release straight away.
// Shows: Download opens a small panel (season, quality, Download Season). Manual releases and an
// exact resolution live under Advanced options. Progress shows where the title is, never as a list.
const EXACT_OPTIONS = [['', T('Automatic')], ['2160p', T('4K only')], ['1440p', T('1440p only')], ['1080p', T('1080p only')], ['720p', T('720p only')]];
// No Quality setting (Oliver 2026-11-18): the screen decides. "uhd" = more pixels than 1080p either way (phones,
// 1440p/4K monitors): a film starts on a quick 1080p and the best picture follows in the background, and playback
// moves to it (upgradeVersion). "hd" = a 1080p screen: 1080p only, no 4K fetched that it couldn't show.
// Sent with every download (server.js downloadWant).
const screenPixels = () => {
  const d = devicePixelRatio || 1;
  return [Math.max(screen.width, screen.height) * d, Math.min(screen.width, screen.height) * d];
};
// Phones count as 1080p (Oliver 2026-11-18): at phone size 4K looks no sharper, and a 4K file plays on a phone through
// the live 1080p stream anyway (HDR tone-mapped, phone-stream.js), so fetching it would only cost disk and time.
const phoneSized = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
// A connection too slow for 4K (connection.js, measured before playback) counts the same: 4K would only stall.
const sharpScreen = () => { const [long, short] = screenPixels(); return !phoneSized() && (long > 2400 || short > 1300) && !slowForUhd(); };
const screenClass = () => (sharpScreen() ? 'uhd' : 'hd');
const canGet = () => Boolean(state.status.torrents && canDownload());

// Commands by target, so a sheet that re-renders (or is reopened) shows the same state.
const downloadCommands = new Map(); // key -> { body, busy, job, error }
const commandKey = (b) => [b.type, b.tmdbId, b.season ?? '', (b.episodes || []).join(','), b.upgrade ? 'upgrade' : '', b.dub ? 'dub' : ''].join(':');
const commandViews = new Set();     // nodes with _update(), refreshed on command and transfer changes
function refreshCommandViews() {
  for (const node of commandViews) { if (!node.isConnected) commandViews.delete(node); else node._update(); }
}
const commandStep = (cmd) => (/^(Starting|Startar)/.test(cmd?.job?.step || '') ? T('Adding…') : T('Finding the best copy…'));

async function runDownloadCommand(body) {
  const key = commandKey(body);
  if (downloadCommands.get(key)?.busy) return downloadCommands.get(key);
  const cmd = { body, busy: true, job: null, error: null };
  downloadCommands.set(key, cmd);
  refreshCommandViews();
  try {
    const { id } = await api('/api/downloads/smart', jsonPost({ ...body, screen: screenClass() }));
    for (let i = 0; i < 500; i++) { // a few minutes at most; the job keeps going on the server regardless
      cmd.job = await api(`/api/downloads/smart/${id}`);
      refreshCommandViews();
      if (cmd.job.state !== 'running') break;
      await new Promise((r) => setTimeout(r, i < 8 ? 800 : 1500));
    }
  } catch (err) { cmd.error = err.message; }
  cmd.busy = false;
  if (cmd.job?.outcome === 'have') await loadLibrary();
  await loadDownloads();
  patchUnifiedLibrary();
  refreshCommandViews();
  if (['started', 'partial'].includes(cmd.job?.outcome)) toast(body.upgrade && body.type === 'movie' ? `${cmd.job.title}: ${cmd.job.message}`
    : body.upgrade ? T('{0}: upgrading season {1}', cmd.job.title, cmd.job.season) : cmd.job.type === 'tv' ? `${cmd.job.title}: ${cmd.job.message}` : T('{0} is on its way. It’ll be ready to watch soon.', cmd.job.title));
  return cmd;
}
// A command's result in plain words, or null while there's nothing to say.
function commandResult(cmd) {
  if (!cmd || cmd.busy) return null;
  if (cmd.error) return { text: cmd.error, retry: true };
  const j = cmd.job;
  if (!j) return null;
  if (j.state === 'failed') return { text: j.message || j.error, retry: true };
  if (j.outcome === 'none') return { text: j.message, retry: true, episodes: j.unavailable?.map((u) => u.episode) };
  if (j.outcome === 'partial') return { text: j.message, retry: true, episodes: j.unavailable.map((u) => u.episode), partial: true };
  if (j.outcome === 'have' || j.outcome === 'queued') return { text: j.message };
  return null;
}

// Adds videos someone else already has here to your library (no copy is made) and refreshes the views.
const ADD_BATCH = 400; // /api/library/add takes at most 500 ids a request; a long show can have more episodes
async function addIds(files) {
  for (let i = 0; i < files.length; i += ADD_BATCH) {
    await api('/api/library/add', jsonPost({ ids: files.slice(i, i + ADD_BATCH).map((f) => f.id) }));
  }
}
async function addFromServer(files) {
  try { await addIds(files); } finally {
    await libraryRequest; // a read that started before the add wouldn't show it
    await loadLibrary();
  }
  const eps = episodeCount(files.filter((f) => f.episode != null));
  toast(eps > 1 ? T('Added {0} to your library', plural(eps, 'episode')) : T('Added to your library'));
  patchUnifiedLibrary();
  refreshCommandViews();
}
// Someone else's copies of episodes you don't have yet (one per episode).
function serverOnlyEpisodes(s, season = null) {
  const mine = new Set(s.ready.map((f) => `${f.season}:${f.episode}`));
  const out = new Map();
  for (const f of s.onServer) {
    const k = `${f.season}:${f.episode}`;
    if (f.episode == null || (season != null && f.season !== season) || mine.has(k) || out.has(k)) continue;
    out.set(k, f);
  }
  return [...out.values()];
}

// A title's files and transfers: the person's library (it stays, behind Play) and their downloads.
function titleState(t) {
  const match = sameTitle(t);
  const files = matchesFor(t), onServer = serverMatchesFor(t);
  const transfers = state.downloads.filter((d) => d.mine !== false && match({ ...d, title: d.canonicalTitle || d.title, show: d.showId || d.show }));
  const active = transfers.filter((d) => !d.done || d.converting || transferAttention(d));
  return { files, onServer, ready: files.filter((f) => f.kind === 'lib' || f.ready), transfers, active };
}

// State, percentage and a slim bar for one title's downloads, with Pause/Resume, Retry and Details.
// lead(): Play now is the page's gold button (nothing else to play yet); otherwise it's a quiet chip.
function transferSummary(getTransfers, name, { lead = () => true } = {}) {
  const stateEl = h('span', { class: 'transfer-state' }), pct = h('span', { class: 'transfer-percent' });
  const track = h('div', { class: 'transfer-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': T('{0} download progress', name) }, h('i'));
  const pause = h('button', { type: 'button', class: 'chip transfer-ctl' });
  const retry = h('button', { type: 'button', class: 'chip transfer-ctl' }, T('Retry'));
  const details = h('button', { type: 'button', class: 'link-btn transfer-details' }, T('Details'));
  const list = () => getTransfers().filter((d) => !d.done || d.converting || transferAttention(d));
  const playable = () => { const active = list(); return active.length === 1 && playNowFile(active[0]) ? active[0] : null; };
  const play = h('button', { type: 'button', class: 'play-btn transfer-play', onclick: () => {
    const d = playable();
    if (d) openPlayer(playNowItem(d, playNowFile(d)));
  } }, icon('play'), T('Play now'));
  const el = h('div', { class: 'transfer-summary' }, h('div', { class: 'transfer-line' }, stateEl, pct), track, h('div', { class: 'transfer-controls' }, play, pause, retry, details));
  pause.addEventListener('click', () => {
    const mine = list().filter((d) => d.canManage !== false && !transferAttention(d));
    const resume = mine.length && mine.every((d) => isPaused(d));
    for (const d of mine.filter((x) => resume ? isPaused(x) : !isPaused(x))) runTransferAction(d, resume ? 'resume' : 'pause');
  });
  retry.addEventListener('click', () => { for (const d of list().filter(transferAttention)) runTransferAction(d, 'retry'); });
  details.addEventListener('click', (e) => openTransferDetails({ key: `title:${name}`, name, transfers: getTransfers() }, e.currentTarget));
  el._update = () => {
    const active = list();
    el.hidden = !active.length;
    if (!active.length) return;
    const attention = active.some(transferAttention);
    const known = active.every((d) => Number.isFinite(d.size) && d.size > 0 && Number.isFinite(d.progress));
    const progress = known ? active.reduce((n, d) => n + d.size * Math.max(0, Math.min(1, d.progress)), 0) / active.reduce((n, d) => n + d.size, 0) : null;
    const label = attention ? T('Needs attention') : active.length === 1 ? transferState(active[0])
      : active.every((d) => isPaused(d)) ? T('Paused') : T('Downloading · {0}', plural(active.length, 'download'));
    const soon = active.length === 1 && !attention ? playNowSoon(active[0]) : '';
    stateEl.textContent = soon ? `${label} · ${soon}` : label;
    pct.textContent = progress == null ? '' : `${Math.floor(progress * 100)}%`;
    track.firstChild.style.width = progress == null ? '0%' : `${progress * 100}%`;
    if (progress == null) track.removeAttribute('aria-valuenow'); else track.setAttribute('aria-valuenow', String(Math.floor(progress * 100)));
    track.setAttribute('aria-valuetext', `${label}${progress == null ? '' : `, ${Math.floor(progress * 100)} percent`}`);
    el.classList.toggle('is-error', attention);
    const mine = active.filter((d) => d.canManage !== false && !transferAttention(d));
    const resume = mine.length > 0 && mine.every((d) => isPaused(d));
    pause.hidden = !mine.length;
    pause.textContent = resume ? T('Resume') : T('Pause');
    pause.setAttribute('aria-label', `${resume ? T('Resume') : T('Pause')} ${name}`);
    retry.hidden = !attention;
    play.hidden = !playable();
    const lit = Boolean(lead());
    play.classList.toggle('play-btn', lit); play.classList.toggle('chip', !lit);
  };
  commandViews.add(el);
  el._update();
  return el;
}

// "Advanced options": an exact resolution for this command, and the release list for choosing one.
const advancedOpen = new Map(); // title key -> open
function advancedOptions(key, { exact, onExact, browse }) {
  const exactSel = h('select', { class: 'sub-select', id: `adv-exact-${key}` }, EXACT_OPTIONS.map(([v, text]) => h('option', { value: v }, text)));
  exactSel.value = exact;
  exactSel.addEventListener('change', () => onExact(exactSel.value));
  const browser = h('div', { class: 'adv-browser' });
  const browseBtn = h('button', { type: 'button', class: 'chip stroke-icon' }, icon('search'), T('Choose a release yourself'));
  browseBtn.addEventListener('click', () => {
    browseBtn.hidden = true;
    const b = torrentBrowser(browse());
    browser.replaceChildren(b.el);
    b.start();
  });
  const box = h('details', { class: 'advanced' },
    h('summary', {}, T('Advanced options')),
    h('div', { class: 'adv-body' },
      h('div', { class: 'adv-field' }, h('label', { for: `adv-exact-${key}` }, T('Exact quality')), exactSel,
        h('p', { class: 'adv-hint' }, T('Only this resolution is looked for. If there’s none, nothing else is picked instead.'))),
      browseBtn, browser));
  box.open = Boolean(advancedOpen.get(key));
  box.addEventListener('toggle', () => advancedOpen.set(key, box.open));
  return box;
}

// Anime only: Audio, original or Dubbed. Dubbed looks for dual-audio releases and nothing else.
// Starts on what this person last chose for the title; hidden until the server says it's anime.
const dubChoices = new Map(); // tmdb id -> 'sub' | 'dub', for this session
const isDubbedCopy = (f) => Boolean(f.versionDubbed || f.versions?.some((v) => v.versionDubbed));
function audioChoice(t, id, onChange) {
  const sel = h('select', { class: 'sub-select', id, 'aria-describedby': `${id}-hint` },
    h('option', { value: 'sub' }, T('Original with subtitles')), h('option', { value: 'dub' }, T('Dubbed')));
  // Placed by the caller: in the season panel it runs under the whole row, so it can't stretch the field beside it.
  const hint = h('p', { class: 'adv-hint dl-audio-hint', id: `${id}-hint`, hidden: true }, T('Only dual-audio releases, with English and Japanese. If there’s none, nothing is added.'));
  const field = h('div', { class: 'dl-field dl-audio', hidden: true }, h('label', { for: id }, T('Audio')), sel);
  const choice = { field, hint, anime: false, dubbing: () => choice.anime && sel.value === 'dub', lock: (on) => { sel.disabled = on; },
    choose: (value) => { sel.value = value; dubChoices.set(t.id, value); paint(); }, focus: () => sel.focus(),
    remember: () => (choice.anime ? api(`/api/title/${t.type}/${t.id}/dub`, jsonPost({ dubbed: choice.dubbing() })).catch(() => {}) : null) };
  const paint = () => { hint.hidden = sel.value !== 'dub'; onChange(); };
  sel.addEventListener('change', () => { dubChoices.set(t.id, sel.value); paint(); });
  if (canGet() && t.id) api(`/api/title/${t.type}/${t.id}/dub`).then(({ anime, dubbed }) => {
    if (!anime) return;
    choice.anime = true;
    field.hidden = false;
    sel.value = dubChoices.get(t.id) || (dubbed ? 'dub' : 'sub');
    paint();
  }).catch(() => { /* no choice offered: an ordinary download */ });
  return choice;
}

// Films: Play when it's here (or on the server), else one Download press. Then state and progress.
// The title page puts root.play and root.get in its button bar; one gold button at a time: Play when there's
// something to play (not while it's being prepared), else Add, else Play now in the download card.
// stateOf: where the page reads the film's files and downloads (titleState, or the Library entry for a video
// without a TMDB id).
const filmExact = new Map(); // tmdb id -> exact resolution for this session
function filmActions(t, { stateOf = () => titleState(t) } = {}) {
  const dub = audioChoice({ ...t, type: 'movie' }, `film-audio-${t.id}`, () => root._update?.());
  dub.field.append(dub.hint);
  const body = () => ({ type: 'movie', tmdbId: t.id, ...(filmExact.get(t.id) ? { quality: filmExact.get(t.id) } : {}), ...(dub.anime ? { dub: dub.dubbing() } : {}) });
  const play = h('button', { type: 'button', class: 'play-btn action-btn', 'data-act': 'play' });
  const get = h('button', { type: 'button', class: 'play-btn action-btn stroke-icon', 'data-act': 'download' }, icon('plus'), h('span', {}, T('Add to library')));
  const status = h('p', { class: 'action-status', role: 'status' });
  const retry = h('button', { type: 'button', class: 'chip action-retry' }, T('Try again'));
  // Transfers are the owner's to see (play first): members only ever meet Play.
  const tools = Boolean(state.status.admin);
  const progress = tools ? transferSummary(() => stateOf().transfers, t.title, { lead: () => false }) : null;
  const root = h('div', { class: 'title-film' }, dub.field, progress, h('div', { class: 'action-result' }, status, retry));
  root.play = play; root.get = get; root.buttons = [play]; root.dub = dub;
  const advanced = canGet() && t.id ? advancedOptions(`movie-${t.id}`, {
    exact: filmExact.get(t.id) || '', onExact: (v) => filmExact.set(t.id, v),
    browse: () => ({ query: [t.title, t.year].filter(Boolean).join(' '), type: 'movie', movieId: t.id, canonicalTitle: t.title, strict: true }),
  }) : null;
  if (advanced) root.append(advanced);
  // Advanced options and Dubbed wait behind the page's ⋯ until asked for (or opened before).
  let showAdvanced = false, showDub = false;
  root.revealAdvanced = () => { if (!advanced) return; showAdvanced = true; advanced.open = true; advancedOpen.set(`movie-${t.id}`, true); root._update(); advanced.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  root.chooseDub = () => { showDub = true; dub.choose('dub'); root._update(); dub.focus(); };
  // Not out to stream or buy yet: no Add (only cinema recordings exist); Save is the page's button then.
  // The card's date guesses first; the page's release info (digital/disc dates) settles it.
  const day = String(t.date || t.releaseDate || '').slice(0, 10) || null;
  let soon = titleView.release.get(t.id) ?? cardUnreleased(t) ? { kind: 'cinema', date: day, cinema: day, expect: null, out: false } : null;
  if (t.id && state.status.search) pageInfo('movie', t.id).then((page) => {
    if (!page || !('release' in page)) return;
    soon = page.release && !page.release.out ? page.release : null;
    const was = titleView.release.get(t.id);
    titleView.release.set(t.id, Boolean(soon));
    root._update();
    if (was !== Boolean(soon)) updateOpenTitle(); // the page's gold button may change (Save instead of Add)
  }).catch(() => {});
  // Play, whatever it takes: yours plays, someone else's copy plays at once, anything else gets ready in the player.
  // Dubbed: only a dual-audio copy counts, so a subtitled one here doesn't stop the dub being fetched.
  let playing = false;
  play.addEventListener('click', async (e) => {
    if (play.getAttribute('aria-disabled') === 'true' || playing) return;
    const s = stateOf(), wantDub = dub.dubbing();
    const mine = wantDub ? s.ready.find((f) => isDubbedCopy(f) && !f.converting) : s.ready.find((f) => !f.converting);
    if (mine) return openPlayer(mine);
    playing = true; play.setAttribute('aria-disabled', 'true');
    try {
      if (dub.anime) await dub.remember();
      const theirs = wantDub ? s.onServer.find(isDubbedCopy) : s.onServer[0];
      if (theirs) await addAndPlay(theirs);
      else await playTitle({ t }, e.currentTarget, { body: canGet() && t.id ? body() : null, dub: wantDub });
    } catch (err) { status.textContent = err.message; } finally { playing = false; root._update(); }
  });
  let adding = false;
  const start = () => { if (get.getAttribute('aria-disabled') !== 'true') runDownloadCommand(body()); };
  root.download = () => get.click(); // the owner's ⋯ Download without playing
  get.addEventListener('click', async () => {
    if (get.getAttribute('aria-disabled') === 'true') return;
    const s = stateOf();
    const theirs = dub.dubbing() ? s.onServer.find(isDubbedCopy) : s.onServer[0];
    if ((s.ready.length && !dub.dubbing()) || !theirs) return start();
    // Someone else already has it here: add their copy instead of downloading another.
    adding = true; status.textContent = ''; root._update();
    try { await dub.remember(); await addFromServer([theirs]); } catch (err) { status.textContent = err.message; } finally { adding = false; root._update(); }
  });
  retry.addEventListener('click', start);
  root._update = () => {
    const s = stateOf(), cmd = downloadCommands.get(commandKey(body()));
    const file = s.ready.find((f) => !f.converting) || s.ready[0];
    const converting = Boolean(file && !s.ready.some((f) => !f.converting));
    // Play shows whenever it can do something: play it, play their copy, open the one coming, or fetch it.
    const playable = Boolean(file || s.onServer.length || s.active.length || (canGet() && t.id && !soon));
    play.hidden = !playable;
    if (playable) {
      const saved = file && savedProgress(file);
      play.replaceChildren(icon('play'), h('span', {}, converting ? T('Preparing playback…')
        : file && partlyWatched(saved) ? T('Resume at {0}', fmtTime(saved.time)) : T('Play')));
      play.setAttribute('aria-disabled', String(Boolean(converting || playing)));
    }
    // "Add to library" either way: someone else's copy here is added at once, otherwise Lilin fetches one.
    // Shown only when there's nothing to play and nothing on its way; while it runs it says what it's doing.
    // Dubbed: only a dual-audio copy counts as having it, so a subtitled one doesn't hide the button.
    const wantDub = dub.dubbing() && !s.ready.some(isDubbedCopy);
    const addable = wantDub ? s.onServer.some(isDubbedCopy) : !file && s.onServer.length > 0;
    get.hidden = true; // the owner reaches it from ⋯ (Download without playing); Play does the rest
    get.lastChild.textContent = adding ? T('Adding…') : cmd?.busy ? commandStep(cmd) : wantDub && file ? T('Add dubbed version') : T('Add to library');
    const waiting = Boolean(soon && !addable && !playable && !s.active.length && !cmd?.busy && !adding && t.id);
    // The one gold button: Play (not while it's being prepared).
    const lit = !play.hidden && !converting;
    play.classList.toggle('play-btn', lit); play.classList.toggle('chip', !lit);
    if (advanced) advanced.hidden = waiting || !(showAdvanced || advanced.open);
    dub.field.hidden = !dub.anime || !canGet() || (Boolean(file) && !showDub); // yours already: Dubbed is in ⋯
    showDubbed(dub.anime);
    dub.lock(Boolean(cmd?.busy || adding));
    get.setAttribute('aria-disabled', String(Boolean(cmd?.busy || adding || waiting)));
    root.setAttribute('aria-busy', String(Boolean(cmd?.busy)));
    const result = (!playable || dub.dubbing()) && commandResult(cmd);
    const line = waiting ? comingSoonText(soon) : result?.text || '';
    if (!addable && status.textContent !== line) status.textContent = line;
    status.classList.toggle('is-error', Boolean(result?.retry));
    retry.hidden = !result?.retry || s.active.length > 0;
    progress?._update();
  };
  commandViews.add(root);
  root._update();
  return root;
}

// Shows: when someone else already has episodes here that you don't, one press adds all of them.
// An anime also gets Add dubbed beside it: the panel, set to Dubbed, since those copies may be subtitled.
// Otherwise the button opens the panel; the season and quality chosen stay while it's open.
// Long seasons (Black Clover's 170, One Piece's 197) can download a range of episodes instead.
const showPanels = new Map(); // tmdb id -> { open, season, profile, exact, last: { [season]: command key }, ranges: { [season]: { on, from, to } } }
const RANGE_FROM = 40; // episodes in a season before the panel offers a range
// lead: the toggle is the title page's gold button (it turns quiet while its panel is open: Add Season is then).
function showDownload(t, { season = null, onAdded = null, lead = false } = {}) {
  let ps = showPanels.get(t.id);
  if (!ps) { ps = { open: false, season, exact: '', last: {}, ranges: {} }; showPanels.set(t.id, ps); }
  else if (season != null && !ps.touched) ps.season = season;
  const panelId = `dl-panel-${t.id}`;
  const toggle = h('button', { type: 'button', class: 'play-btn action-btn stroke-icon title-add', 'data-act': 'download', 'aria-expanded': String(ps.open), 'aria-controls': panelId }, icon('plus'), h('span', {}, T('Add to library')));
  const paintToggle = () => { const lit = lead && !ps.open; toggle.classList.toggle('play-btn', lit); toggle.classList.toggle('action-btn', lit); toggle.classList.toggle('chip', !lit); };
  const dub = audioChoice({ ...t, type: 'tv' }, `${panelId}-audio`, () => { addError = ''; panel._update?.(); });
  const seasonSel = h('select', { class: 'sub-select', id: `${panelId}-season`, disabled: true }, h('option', {}, T('Loading seasons…')));
  const avail = h('p', { class: 'dl-avail' });
  const note = h('p', { class: 'dl-note' });
  // Episodes: the whole season, or a range of it ("150 to 200") when the season is long.
  const scopeSel = h('select', { class: 'sub-select', id: `${panelId}-scope` },
    h('option', { value: 'all' }, T('Whole season')), h('option', { value: 'range' }, T('Choose a range')));
  const numInput = (id, label) => h('input', { type: 'number', class: 'dl-num', id, inputmode: 'numeric', step: '1', 'aria-label': label });
  const fromIn = numInput(`${panelId}-from`, T('First episode')), toIn = numInput(`${panelId}-to`, T('Last episode'));
  const rangeRow = h('div', { class: 'dl-field dl-range' }, h('label', { for: fromIn.id }, T('From – to')),
    h('div', { class: 'dl-range-boxes' }, fromIn, h('span', { class: 'dl-range-dash', 'aria-hidden': 'true' }, '–'), toIn));
  const scopeField = h('div', { class: 'dl-field dl-scope' }, h('label', { for: scopeSel.id }, T('Episodes')), scopeSel);
  const submit = h('button', { type: 'button', class: `${lead ? 'play-btn' : 'chip'} dl-submit` }, h('span', {}, T('Add Season')));
  const quiet = h('p', { class: 'dl-quiet' });
  const status = h('p', { class: 'dl-status', role: 'status' });
  const retry = h('button', { type: 'button', class: 'chip dl-retry' });
  const panel = h('div', { class: 'dl-panel', id: panelId, hidden: !ps.open },
    h('div', { class: 'dl-fields' },
      h('div', { class: 'dl-field' }, h('label', { for: seasonSel.id }, T('Season')), seasonSel),
      dub.field, scopeField, rangeRow, dub.hint),
    note, avail, submit, quiet, h('div', { class: 'dl-result' }, status, retry),
    advancedOptions(`tv-${t.id}`, {
      exact: ps.exact, onExact: (v) => { ps.exact = v; },
      browse: () => ({ query: `${t.title} S${pad2(ps.season || 1)}`, type: 'tv', tvId: t.id, canonicalTitle: t.title, strict: true }),
    }));
  let seasons = null;
  const load = () => {
    if (seasons || !t.id) return;
    seasons = [];
    tvSeasons(t.id).then((list) => {
      seasons = list;
      const s = titleState(t), have = (n) => episodeCount([...s.ready, ...s.onServer].filter((f) => f.season === n && f.episode != null));
      seasonSel.replaceChildren(...list.map((se) => h('option', { value: String(se.number), disabled: se.upcoming && !have(se.number) ? true : null },
        `${se.name}${se.upcoming && !have(se.number) ? T(' · Not released') : ''}`)));
      const extra = new Set(serverOnlyEpisodes(s).map((f) => f.season)); // seasons someone else has here
      const pick = list.find((se) => se.number === ps.season) || list.find((se) => extra.has(se.number))
        || list.find((se) => !se.upcoming && !(se.episodes && have(se.number) >= se.episodes)) || list.find((se) => !se.upcoming) || list[0];
      if (pick) { ps.season = pick.number; seasonSel.value = String(pick.number); }
      seasonSel.disabled = false;
      panel._update();
    }).catch((err) => { seasons = null; seasonSel.replaceChildren(h('option', {}, T('Seasons unavailable'))); status.textContent = err.message; });
  };
  let addingAll = false;
  const addEverything = async (files) => {
    addingAll = true; ps.open = false; panel.hidden = true; panel._update();
    try {
      await addFromServer(files);
      if (toggle.isConnected && onAdded) { // the sheet's episode list changed; keep its place and the button's focus
        const top = $('#sheet').scrollTop;
        onAdded();
        $('#sheet').scrollTop = top;
        $(`#sheet-body [aria-controls="${panelId}"]`)?.focus({ preventScroll: true });
      }
    } catch (err) { toast(err.message); } finally { addingAll = false; panel._update(); }
  };
  toggle.addEventListener('click', (e) => {
    if (addingAll) return;
    // Not when they've chosen Dubbed: those may be subtitled copies, and the panel offers the dub.
    const extra = dub.dubbing() ? [] : serverOnlyEpisodes(titleState(t));
    if (extra.length) return addEverything(extra);
    ps.open = !ps.open;
    paintToggle();
    toggle.setAttribute('aria-expanded', String(ps.open));
    panel.hidden = !ps.open;
    if (ps.open) { load(); if (e.detail === 0) seasonSel.focus(); } // keyboard: straight to Season
  });
  const dubBtn = h('button', { type: 'button', class: 'chip action-btn stroke-icon dl-add-dubbed', hidden: true, 'aria-controls': panelId }, icon('plus'), h('span', {}, T('Add dubbed')));
  dubBtn.addEventListener('click', () => {
    dub.choose('dub');
    ps.open = true;
    panel.hidden = false;
    load();
    panel._update();
    dub.focus();
  });
  seasonSel.addEventListener('change', () => { ps.season = Number(seasonSel.value); ps.touched = true; addError = ''; panel._update(); });
  // The season's range state, its TMDB numbering (first..last) and the episodes it asks for.
  const seasonInfo = () => seasons?.find((x) => x.number === ps.season) || null;
  const longSeason = () => (seasonInfo()?.episodes || 0) >= RANGE_FROM;
  const bounds = () => { const se = seasonInfo(), first = se?.first || 1; return { first, last: first + (se?.episodes || 1) - 1 }; };
  const rangeOf = () => {
    const { first, last } = bounds();
    return (ps.ranges[ps.season] ||= { on: false, from: first, to: Math.min(last, first + 49) });
  };
  const rangeList = () => {
    const r = rangeOf(), { first, last } = bounds();
    const from = Math.max(first, Math.min(r.from, r.to)), to = Math.min(last, Math.max(r.from, r.to));
    return Number.isInteger(from) && Number.isInteger(to) && from <= to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  };
  const ranged = () => longSeason() && rangeOf().on;
  scopeSel.addEventListener('change', () => { rangeOf().on = scopeSel.value === 'range'; panel._update(); if (rangeOf().on) fromIn.focus(); });
  for (const [input, k] of [[fromIn, 'from'], [toIn, 'to']]) {
    input.addEventListener('input', () => { const v = Number(input.value); if (Number.isInteger(v)) { rangeOf()[k] = v; panel._update(); } });
    input.addEventListener('change', () => { input.value = String(rangeOf()[k]); }); // an empty box goes back to the last number
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
  }
  const body = (episodes = null, range = false) => ({ type: 'tv', tmdbId: t.id, season: ps.season,
    ...(ps.exact ? { quality: ps.exact } : {}), ...(episodes?.length ? { episodes } : {}), ...(range ? { range: true } : {}), ...(dub.anime ? { dub: dub.dubbing() } : {}) });
  const run = (episodes, range = false) => {
    if (submit.getAttribute('aria-disabled') === 'true' || !ps.season) return;
    const b = body(episodes, range);
    ps.last[ps.season] = commandKey(b);
    runDownloadCommand(b);
  };
  let adding = false, addError = '';
  submit.addEventListener('click', async () => {
    addError = '';
    if (!submit._add) return ranged() ? (rangeList().length ? run(rangeList(), true) : null) : run(null);
    if (submit.getAttribute('aria-disabled') === 'true') return;
    adding = true; panel._update();
    try { await dub.remember(); await addFromServer(submit._add); } catch (err) { addError = err.message; } finally { adding = false; panel._update(); }
  });
  retry.addEventListener('click', () => run(retry._episodes));
  panel._update = () => {
    const n = ps.season, se = seasons?.find((x) => x.number === n);
    const cmd = downloadCommands.get(ps.last[n]);
    // Episode range: offered for long seasons; the boxes keep to the season's numbers.
    const canRange = longSeason() && !submit._add;
    scopeField.hidden = !canRange;
    const useRange = canRange && rangeOf().on;
    rangeRow.hidden = !useRange;
    const picked = useRange ? rangeList() : null;
    if (canRange) {
      const r = rangeOf(), { first, last } = bounds();
      scopeSel.value = r.on ? 'range' : 'all';
      for (const [input, v] of [[fromIn, r.from], [toIn, r.to]]) {
        input.min = String(first); input.max = String(last);
        if (document.activeElement !== input) input.value = String(v);
      }
    }
    // Dubbed: the counts and buttons below go by dual-audio copies only; a subtitled season isn't the dub.
    const dubbing = dub.dubbing();
    const full = titleState(t);
    const s = dubbing ? { ...full, ready: full.ready.filter(isDubbedCopy), onServer: full.onServer.filter(isDubbedCopy), active: full.active.filter((d) => d.dualAudio) } : full;
    const ready = new Set(s.ready.filter((f) => f.season === n && f.episode != null).map((f) => f.episode));
    const server = new Set(s.onServer.filter((f) => f.season === n && f.episode != null && !ready.has(f.episode)).map((f) => f.episode));
    const downloading = new Set(s.active.flatMap((d) => (d.episodes || []).filter((ep) => ep.season === n && !ep.available).map((ep) => ep.episode)).filter((e) => !ready.has(e)));
    const packBusy = s.active.some((d) => d.season === n && !(d.episodes || []).length);
    const total = se?.episodes || null;
    const parts = [ready.size && (total ? T('{0} of {1} episodes ready', ready.size, total) : T('{0} ready', plural(ready.size, 'episode'))),
      downloading.size ? T('{0} on the way', downloading.size) : packBusy && T('Season on its way'),
      server.size && T('{0} ready to add', server.size)].filter(Boolean);
    avail.textContent = parts.join(' · ');
    avail.hidden = !parts.length;
    const complete = total && ready.size >= total;
    // Everything still missing is on the server under someone else (or already downloading): just add it.
    const addOnly = !complete && server.size > 0 && (total ? ready.size + server.size + downloading.size >= total : !canGet());
    const covered = total && ready.size + server.size + downloading.size >= total && !complete && downloading.size > 0 && !addOnly;
    const locked = Boolean(cmd?.busy);
    submit._add = addOnly && !locked ? serverOnlyEpisodes(s, n).filter((f) => server.has(f.episode)) : null;
    submit.hidden = Boolean(complete || covered) && !locked;
    quiet.textContent = complete ? T('This season is ready to watch') : covered ? T('The rest are on their way') : '';
    quiet.hidden = !submit.hidden;
    const rangeText = picked?.length ? (picked.length === 1 ? T('Add Episode {0}', picked[0]) : T('Add Episodes {0}–{1}', picked[0], picked.at(-1))) : T('Choose episodes');
    submit.firstChild.textContent = locked ? commandStep(cmd) : submit._add ? (adding ? T('Adding…') : T('Add Season {0} to library', n))
      : useRange ? rangeText : (n == null ? T('Add season') : T('Add Season {0}', n));
    submit.setAttribute('aria-disabled', String(locked || adding || !n || Boolean(useRange && !picked.length)));
    note.textContent = submit._add ? T('Someone already has this season here. Adding it makes no copy, so it’s ready to watch right away.')
      : useRange ? T('{0} of {1}–{2}. A season batch still serves a range: episodes outside it are skipped.', plural(picked.length, 'episode'), bounds().first, bounds().last)
      : T('Lilin picks a good copy of the season and skips episodes you already have.');
    // The show's button: "Add to library" until some of it is yours, then "More episodes" for the rest.
    const addsAll = !dubbing && serverOnlyEpisodes(full).length > 0;
    dubBtn.hidden = !(addsAll && dub.anime && !addingAll);
    const toggleText = addingAll ? T('Adding…') : full.ready.length && !addsAll ? T('More episodes') : T('Add to library');
    if (toggle._mode !== toggleText) {
      toggle._mode = toggleText;
      toggle.replaceChildren(icon('plus'), h('span', {}, toggleText));
    }
    toggle.setAttribute('aria-disabled', String(addingAll));
    if (addsAll) toggle.removeAttribute('aria-expanded'); // it adds right away, so there's no panel to expand
    else toggle.setAttribute('aria-expanded', String(ps.open));
    paintToggle();
    showDubbed(dub.anime);
    seasonSel.disabled = locked || !seasons?.length;
    scopeSel.disabled = fromIn.disabled = toIn.disabled = locked;
    dub.lock(locked);
    panel.setAttribute('aria-busy', String(locked));
    const result = commandResult(cmd);
    const text = addError || result?.text || '';
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('is-error', Boolean(addError || (result?.retry && !result.partial)));
    retry._episodes = result?.episodes?.length ? result.episodes : null;
    retry.hidden = !result?.retry;
    retry.textContent = retry._episodes ? T('Retry unavailable') : T('Try again');
  };
  commandViews.add(panel);
  panel._update();
  if (ps.open) load();
  return { toggle, dubBtn, panel, dub };
}

// Upgrade quality: the season is here but looks soft. A clearly better pack replaces it episode by episode.
// It sits where someone unhappy with the picture looks: on the season's page and in the player's Quality menu.
// Both run the same command, so each shows what the other started.
function upgradeState(t, season) {
  const { ready, active } = titleState(t);
  const have = ready.filter((f) => f.season === season && f.episode != null);
  const got = new Set(have.map((f) => f.episode));
  const downloading = active.some((d) => (d.season === season && !d.episodes?.length)
    || (d.episodes || []).some((ep) => ep.season === season && !ep.available && !got.has(ep.episode)));
  const body = { type: 'tv', tmdbId: t.id, season, upgrade: true };
  const cmd = downloadCommands.get(commandKey(body));
  const job = cmd && !cmd.busy ? cmd.job : null;
  return {
    // Not on dubbed copies: the search doesn't look for dual audio, so it could swap a dub for a subtitled pack.
    offered: Boolean(t.id && canGet() && have.length && !have.some(isDubbedCopy) && (!downloading || cmd)),
    disabled: Boolean(cmd?.busy || downloading), busy: Boolean(cmd?.busy), used: Boolean(cmd),
    started: ['started', 'queued'].includes(job?.outcome),
    text: cmd?.error || job?.message || '', failed: Boolean(cmd?.error || job?.state === 'failed'),
    run: () => runDownloadCommand(body),
  };
}
const upgradeLabel = (u) => (u.busy ? T('Looking for better quality…') : u.film ? T('Get a sharper copy') : T('Upgrade quality'));

// A film here only below 4K, played on a screen sharper than 1080p (someone on a 1080p screen fetched it): its best
// picture can follow as another version (server.js filmQualityHere, smart-download.js lift). Playback moves to it once
// it's downloaded (upgradeVersion).
function filmUpgrade(session) {
  const body = { type: 'movie', tmdbId: session.tmdbId, upgrade: true };
  const cmd = downloadCommands.get(commandKey(body));
  const job = cmd && !cmd.busy ? cmd.job : null;
  const key = session.versionKey || `film:${session.tmdbId}`;
  const item = state.library.find((x) => x.versionKey === key);
  const rank = (v) => (v.sourceHeight >= 2000 ? 4 : UPGRADE_RANK[v.versionQuality] ?? 2);
  const best = Math.max(rank(session), ...(item?.versions || []).map(rank));
  if (!cmd && (!canGet() || !sharpScreen() || best >= 4 || session.versionDubbed)) return null;
  return {
    film: true, offered: true, disabled: Boolean(cmd?.busy), busy: Boolean(cmd?.busy), used: Boolean(cmd),
    started: ['started', 'queued'].includes(job?.outcome),
    text: cmd?.error || job?.message || '', failed: Boolean(cmd?.error || job?.state === 'failed'),
    run: () => runDownloadCommand(body),
  };
}

// ---------- casting: device picker ----------
const jsonPost = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const notices = createNotices({ h, api, jsonPost, toast: (t) => toast(t), ago: (ms) => ago(ms), rerender: () => { if (settingsOpen()) renderSettingsWhenStill(); } });
const people = createPeople({ h, api, toast, me: () => state.me, openProfile: (p, opener) => profiles.open(p, opener) }); // faces and profile pictures (people.js); a face with an id opens its profile
const social = createSocial({ h, api, jsonPost, toast, icon, people }); // likes, Popular, watch parties, Wrapped (social.js)
// friends: You → Friends (friends.js); requests are also For you cards and light the You tab's dot
const friendsUI = createFriends({ h, api, jsonPost, toast, icon, people, me: () => state.me, openProfile: (p, opener) => profiles.open(p, opener), invite: friendsInvite,
  addFriend: (opener) => invite.open({ kind: 'friend' }, opener),
  rerender: () => { updateYouDot(); if (settingsOpen()) renderSettingsWhenStill(); invite.refresh('friend'); } });
// One Invite sheet (invite.js): Lilin and Friend open in the picker; Room, Pick and Moment draw where they're used.
const invite = createInvite({ h, api, jsonPost, toast, icon, people, me: () => state.me, admin: () => Boolean(state.status?.admin), copyWithToast, friendsUI,
  sheet: { open: (nodes, opener, onClosed) => {
    $('#picker-body').replaceChildren(...nodes);
    pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { onClosed?.(); opener?.isConnected && opener.focus({ preventScroll: true }); }));
  } } });
// friends: unanswered friend requests pop up (friends.js askSheet) when Lilin opens and when one arrives
// while it's open. It waits while a video plays or another sheet is open (What's new goes first), and
// stays away from the You tab, where the requests are already on screen.
const friendAsks = { open: false, retry: null };
function maybeAskFriends() {
  clearTimeout(friendAsks.retry);
  if (friendAsks.open || state.view === 'you' || !friendsUI.waitingAsks().length) return;
  if (overlayStack.length || !$('#player').hidden || document.hidden) { friendAsks.retry = setTimeout(maybeAskFriends, 4000); return; }
  const opener = document.activeElement;
  const sheet = friendsUI.askSheet({ close: () => closeTopOverlay() });
  friendAsks.open = true;
  $('#picker-body').replaceChildren(sheet.node);
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => {
    friendAsks.open = false;
    friendsUI.askLater(sheet.unanswered());
    opener?.focus?.({ preventScroll: true });
  }));
}
// comingsoon: Discover's Coming soon row and page (coming-soon.js), with one-tap Save / Follow from watchlist.js
const comingSoon = createComingSoonView({ h, icon, toast, savedToast: (text) => watchlistToast(text), watchItem, setWatch, autoDownload: () => watch.autoDownload, openDetails, ownershipBadge, peek,
  carousel, segmented, skeletonGrid, cachedApi, notice, rerender: () => renderDiscover(),
  openList: (list) => { leaveDiscoverHome(); disc.list = list; window.scrollTo({ top: 0 }); renderDiscover(); }, back: () => { disc.list = null; renderDiscover(); } });
// reviews: stars + written reviews (reviews.js); its sheets open in the picker
const reviews = createReviews({ h, api, jsonPost, toast, people, me: () => state.me, openProfile: (p, opener) => profiles.open(p, opener), sheet: {
  open: (nodes, opener, onClosed) => {
    $('#picker-body').replaceChildren(...nodes.filter(Boolean));
    if ($('#picker').hidden || !$('#picker').classList.contains('open')) {
      pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { onClosed?.(); opener?.focus({ preventScroll: true }); }));
    }
  },
  draw: (nodes) => $('#picker-body').replaceChildren(...nodes.filter(Boolean)),
  close: () => closeTopOverlay(),
} });
rateHooks.extra = (key, title, hooks) => [reviews.rateButton(key, title, hooks), listsUI.listButton(key, title)]; // reviews + lists
// profiles: everyone's own page (profiles.js). Its editor opens in the picker; over a profile that sits above a
// title page (nested), the picker is lifted above it too (.over-pf).
const profilePicker = {
    open: (nodes, opener, onClosed, over) => {
      $('#picker-body').replaceChildren(...nodes.filter(Boolean));
      for (const el of [$('#picker'), $('#picker-backdrop')]) el.classList.toggle('over-pf', Boolean(over));
      pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => {
        onClosed?.();
        setTimeout(() => { for (const el of [$('#picker'), $('#picker-backdrop')]) el.classList.remove('over-pf'); }, 320);
        opener?.isConnected && opener.focus({ preventScroll: true });
      }));
    },
    close: () => closeTopOverlay(),
};
const profiles = createProfiles({ h, api, jsonPost, toast, icon, people, me: () => state.me, copyText,
  openTitle: openTitleFromProfile,
  overlay: { push: pushOverlay, close: closeTopOverlay },
  picker: profilePicker,
  friendsChanged: () => { friendsUI.invalidate(); if (settingsOpen()) renderSettingsWhenStill(); },
  // your name and picture live on your profile (Settings no longer edits them)
  changePicture: ({ opener, over, done }) => editPicture({ person: state.me, opener, over, done }),
  removePicture: () => removePicture({ person: state.me }),
  saveName: async (name) => { state.me = (await api('/api/me', jsonPost({ name }))).me; renderMeButton(); },
  lists: () => listsUI, toneOf: toneFor, // lists section + ticket stubs
  mineChanged: () => { if (settingsOpen()) renderSettingsWhenStill(); } }); // You's card and lines show the saved profile
// lists (lists.js): the List pill beside the thumbs, list pages (/#list/<id>) and the Lists section on profiles.
const listsUI = createLists({ h, api, jsonPost, toast, icon, people, me: () => state.me, copyText, openTitle: openTitleFromProfile,
  overlay: { push: pushOverlay, close: closeTopOverlay }, picker: profilePicker, openProfile: (p, opener) => profiles.open(p, opener),
  titleSearch: (o) => profiles.titleSearch(o), changed: () => profiles.forgetMine?.() });
// A poster on a profile. Profiles opened over a title page close first, and the title opens in that page (Back
// returns to the title it was on).
async function openTitleFromProfile(card, opener, nested) {
  if (!nested) { openDetails(card, opener); return; }
  try {
    for (let n = document.querySelectorAll('.pf.pf-nested.open').length; n > 0; n--) await dismissTopOverlay();
    if ($('#picker').classList.contains('open')) await dismissTopOverlay();
  } catch { return; }
  openDetails(card, $('#sheet').classList.contains('open') ? $('#sheet-body') : null);
}
// Your face on the You tab, and on wide screens at the far right of the header (both open You). The home network's
// shared account has no face of its own: it keeps the person glyph.
function renderMeButton() {
  const m = state.me;
  const glyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';
  const tabFace = $('.tab[data-view="you"] .tab-face');
  if (m?.email) tabFace.replaceChildren(people.face(m, { size: 24 })); else tabFace.innerHTML = glyph;
  const btn = $('#me-btn');
  const dot = btn.querySelector('.tab-dot');
  if (m?.email) btn.replaceChildren(people.face(m, { size: 32 }), dot); else { btn.innerHTML = glyph; btn.append(dot); }
  btn.title = T('You');
}
// details: crew, music, facts and links, folded away at the bottom of title pages (details.js)
const titleDetails = createTitleDetails({ h, api, me: () => state.me, searchOn: () => Boolean(state.status.search), fmtRuntime });
// theme: a show's theme song, softly, while its page is open (theme-music.js)
const themeMusic = createThemeMusic({ h, icon, page: () => titleView.showId,
  quiet: () => Boolean(party) || state.sessions.length > 0 || ['in-player', 'trailer-live'].some((c) => document.body.classList.contains(c)),
  watch: [[$('#sheet'), { attributes: true, attributeFilter: ['class', 'hidden'] }], [$('#sheet-body'), { childList: true }], [document.body, { attributes: true, attributeFilter: ['class'] }]] });
const documentaries = createDocumentaries({ h, leaveHome: () => leaveDiscoverHome(), api, jsonPost, toast, icon, notice, carousel, titleCard, heroSlide, billboard: (items, o) => docsBillboard(items, o), segmented, pagedGrid, skeletonGrid, cachedApi, pageHero,
  rerender: () => renderDiscover(),
  canAdd: () => Boolean(state.status.library && state.me?.canDownload !== false), // no qBittorrent needed
  sheet: () => $('#sheet'), sheetBody: () => $('#sheet-body'),
  openSheet: (onClosed) => pushOverlay(showSheet($('#sheet'), $('#sheet-backdrop'), onClosed)),
  refreshLibrary: () => Promise.all([loadLibrary(), loadDownloads()]).catch(() => {}),
  fileById: (id) => localFiles().find((f) => f.id === id) || null,
  play: (f) => openPlayer(libraryFile(f)),
  waitAndPlay, // play first: Play on one that isn't here yet waits in the player (Getting it ready)
}); // Discover -> Documentaries and SVT Play titles (documentaries.js)
// vibes: Discover -> Moods (vibes.js)
const vibesUi = createVibes({ h, leaveHome: () => leaveDiscoverHome(), cachedApi, carousel, titleCard, segmented, notice, skeletonGrid, rerender: () => renderDiscover(), owned: (t) => isInstant(t), // what plays at once comes first
  // A genre mood's tile opens that genre's page, sorted the mood's way.
  openGenre: (m) => {
    const genre = genreForMood(m, disc.genres || []);
    if (!genre) return;
    leaveDiscoverHome();
    Object.assign(disc, { genre, sort: m.sort || 'popular', list: null });
    window.scrollTo({ top: 0 });
    renderDiscover();
  } });
// Time-of-day Discover: a warm morning row and look, a dark late-night one (daypart.js).
const daypartUi = createDaypart({ h, cachedApi, carousel, titleCard, owned: (t) => isInstant(t), openVibe: (v, type) => vibesUi.open(v, type) });

// The subtitles the phone player would turn on by itself (see its subtitle setup), so a TV starts with
// them too: the last used language when it's already saved for this video, else the one from Settings.
// A saved empty choice means the viewer switched subtitles off.
async function castSubFor(file) {
  let pref = null;
  try { pref = localStorage.getItem('subs:lang'); } catch { /* blocked */ }
  const want = prefs().subLang;
  if (pref === '') return null;
  let data;
  try { data = await api(`/api/subs/langs?kind=${file.kind}&id=${encodeURIComponent(file.key)}`); } catch { return null; }
  const langs = data.languages || [];
  if (!pref && !want) return (data.anime && langs.find((l) => l.code === 'en' && l.saved)) || null; // anime: its English subtitles
  return langs.find((l) => l.code === pref && l.saved) || (want && langs.find((l) => l.code === want)) || null;
}

function openPicker(file, opener) {
  const restoreManager = pickerManagerSubview(opener);
  const name = [file.title, episodeLabel(file)].filter(Boolean).join(' ');
  const list = h('ul', { class: 'rows device-list' });
  const notes = h('div', { class: 'picker-notes' });
  const again = h('button', { class: 'retry', onclick: () => load(true) }, T('Search again'));
  // The phone's own AirPlay / Chromecast list: works on whatever network the phone is on.
  const nearby = canCastFromBrowser && h('button', {
    class: 'device device-nearby',
    onclick: () => openPlayer(file, { replace: true, castHint: true }),
  },
  h('span', { class: 'device-icon' }, icon('airplay')),
  h('span', { class: 'row-text' },
    h('span', { class: 'row-title' }, hasAirPlay ? T('AirPlay to a TV near you') : T('Cast to a TV near you')),
    h('span', { class: 'row-meta' }, h('span', {}, T('Pick a TV from this phone’s own list. The TV streams straight from the server.')))));
  const nearbyWrap = h('div', { class: 'nearby', hidden: true }, h('p', { class: 'muted nearby-label' }, T('Or from this phone')), nearby);
  $('#picker-body').replaceChildren(
    h('h2', { id: 'picker-title' }, T('Play on TV')),
    h('p', { class: 'muted picker-sub' }, name),
    ...[list, notes, again, nearby && nearbyWrap].filter(Boolean));
  if (restoreManager) $('#picker-body').prepend(h('button', { class: 'chip', onclick: restoreManager }, icon('back'), T('Back to downloads')));
  else pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => opener?.focus({ preventScroll: true })));

  async function load(refresh) {
    again.disabled = true;
    notes.replaceChildren();
    if (refresh) list.replaceChildren(h('li', { class: 'searching', role: 'status' }, T('Looking for TVs on your network…')));
    try {
      const data = await api(`/api/cast/devices${refresh ? '?refresh=1' : ''}`);
      if (data.away) {
        again.hidden = true;
        if (nearby) {
          nearbyWrap.hidden = true;
          list.replaceChildren(h('li', {}, nearby));
          notes.replaceChildren(h('p', { class: 'muted' }, T('You’re away from home, so the TVs there aren’t listed.')));
        } else {
          list.replaceChildren(h('li', {}, notice(T('You’re away from home'),
            T('The TVs at home aren’t available from here, and this browser can’t cast to TVs near you. Open Lilin in Safari (AirPlay) or Chrome (Chromecast) to use one, or press Play to watch here.'))));
        }
        return;
      }
      if (nearby) nearbyWrap.hidden = false;
      if (!refresh && !data.devices.length) return load(true); // empty cache: scan now
      list.replaceChildren(...data.devices.map(deviceRow));
      if (!data.devices.length) {
        list.replaceChildren(h('li', {}, notice(T('No TVs found'),
          T('Check the TV is switched on and on the same network as the server. On Samsung and LG TVs, screen sharing / DLNA may need turning on in the settings.'))));
      }
      notes.replaceChildren(...data.notes.map((n) => h('p', { class: 'muted' }, n)));
    } catch (err) {
      list.replaceChildren(h('li', {}, notice(T('Couldn’t search for TVs'), err.message)));
    } finally {
      again.disabled = false;
    }
  }

  function deviceRow(d) {
    const status = h('span', { class: 'device-status' });
    // A TV that's already playing also gets a button for its remote (yours, or to stop someone else's).
    const remote = d.session && h('button', { type: 'button', class: 'chip device-remote', onclick: () => openRemote(d.session, { replace: true }) },
      d.session.mine ? T('Open remote') : T('Open its remote'));
    const btn = h('button', { class: 'device', onclick: () => start(d, btn, status) },
      h('span', { class: 'device-icon' }, icon('tv')),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-title' }, d.name),
        h('span', { class: 'row-meta' }, h('span', {}, d.kind === 'airplay' ? T('Apple TV') : (d.model || T('Smart TV'))),
          d.session ? h('span', {}, d.session.mine ? T('Playing {0}', d.session.title) : T('Someone else is watching'))
            : d.playing && h('span', {}, T('Playing something now'))),
        status));
    return h('li', {}, btn, remote);
  }

  async function start(d, btn, status) {
    // Someone else's TV: ask for a second tap before taking it over.
    if (d.session && !d.session.mine && !btn.dataset.confirm) {
      btn.dataset.confirm = '1';
      status.className = 'device-status is-error';
      status.textContent = T('Someone is watching {0} on this TV. Tap again to play here instead.', d.session.title);
      return;
    }
    btn.disabled = true;
    status.className = 'device-status';
    status.textContent = T('Starting on the TV…');
    try {
      // Apple TV can't show subtitle files over AirPlay; smart TVs start with the player's default subtitles.
      const sub = d.kind === 'airplay' ? null : await castSubFor(file);
      if (sub) status.textContent = T('Starting on the TV with {0} subtitles…', sub.name);
      const play = (code) => api('/api/cast/play', jsonPost({ deviceId: d.id, kind: file.kind, id: file.key, ...(code ? { sub: code } : {}) }));
      let result;
      // Subtitles that can't be fetched shouldn't stop the video: start without them.
      try { result = await play(sub?.code); } catch (err) { if (!sub) throw err; result = await play(null); }
      const { session } = result;
      state.sessions = [session, ...state.sessions.filter((s) => s.deviceId !== session.deviceId)];
      renderNowbar();
      openRemote(session, { replace: true });
    } catch (err) {
      btn.disabled = false;
      status.className = 'device-status is-error';
      status.textContent = err.message;
    }
  }

  load(false);
}

// ---------- library deletion ----------
async function openDelete(f, opener) {
  const id = f.id || f.key;
  const body = $('#picker-body');
  body.replaceChildren(h('h2', { id: 'picker-title' }, T('Delete')), h('p', { class: 'muted' }, T('Checking…')));
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => opener?.focus({ preventScroll: true })));

  let info;
  try {
    info = await api(`/api/library/delete-info?id=${encodeURIComponent(id)}`);
  } catch (err) {
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Can’t delete this')), h('p', { class: 'muted' }, err.message));
    return;
  }
  const label = [info.title || info.name, episodeLabel(info) || (info.year && `(${info.year})`)].filter(Boolean).join(' ');
  const status = h('p', { class: 'device-status', role: 'status' });
  const t = info.torrent;
  const pack = t && t.videos > 1;

  const run = (scope, btn, everyone = false) => {
    const kept = !everyone && info.others > 0; // someone else has it: it only leaves your library
    closeTopOverlay();
    undoableDelete({
      ids: [id],
      message: kept ? T('Removed from your library') : scope === 'torrent' && pack ? T('Deleted all {0} videos', t.videos) : T('Deleted'),
      commit: (keepalive) => api('/api/library/delete', { ...jsonPost({ id, scope, everyone }), keepalive }),
    });
  };
  const button = (text, cls, scope, everyone) => {
    const b = h('button', { class: cls, 'data-label': text }, text);
    b.addEventListener('click', () => run(scope, b, everyone));
    return b;
  };
  const cancel = h('button', { class: 'del-cancel', onclick: () => closeTopOverlay() }, T('Keep it'));
  // Someone else has it too: it only leaves your library (the owner can still delete the file).
  if (info.others) {
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Remove from your library?')),
      h('p', { class: 'del-name' }, label),
      h('p', { class: 'muted' }, T('{0} this in their library, so the file stays on the server. You can add it back from Discover.', plural(info.others, T('other person has'), T('other people have')))),
      info.sharedWith > 0 && h('p', { class: 'muted' }, T('It also leaves the library you share with {0}.', nameList(libraryMates()))),
      h('div', { class: 'del-actions' },
        button(T('Remove from my library'), 'del-confirm', 'file'),
        info.canDeleteForEveryone && button(T('Delete the file for everyone ({0})', fmtBytes(info.size)), 'del-confirm del-secondary', 'file', true),
        cancel),
      status);
    cancel.focus();
    return;
  }

  const lines = [
    h('p', { class: 'del-name' }, label),
    h('p', { class: 'muted' }, pack
      ? T('This is one of {0} videos in the torrent “{1}”. Deleting all of them also removes the torrent from qBittorrent.', t.videos, t.name)
      : t ? T('This also removes the torrent from qBittorrent, so it stops seeding. {0} will be freed.', fmtBytes(t.size))
        : T('{0} will be freed. This can’t be undone.', fmtBytes(info.size))),
    info.sharedWith > 0 && h('p', { class: 'muted' }, T('You share this library with {0}, so it goes for them too.', nameList(libraryMates()))),
  ];
  const actions = pack
    ? [button(T('Delete this video only'), 'del-confirm', 'file'), button(T('Delete all {0} videos ({1})', t.videos, fmtBytes(t.size)), 'del-confirm del-secondary', 'torrent')]
    : [button(T('Delete'), 'del-confirm', t ? 'torrent' : 'file')];
  // A title with versions: this deletes the one shown; the others stay (or all of them go at once).
  const otherVersions = (f.versions || []).filter((v) => v.id !== id);
  if (otherVersions.length) {
    lines.splice(1, 0, h('p', { class: 'muted' }, T('This is the {0} version. {1}', f.versionLabel || T('chosen'), otherVersions.length === 1
      ? T('The other one ({0}) stays.', otherVersions[0].versionLabel) : T('The other {0} versions stay.', otherVersions.length))));
    actions.push(h('button', { class: 'del-confirm del-secondary', onclick: () => { dismissTopOverlay().catch(() => {}).then(() => openDeleteMany({ files: f.versions, what: T('every version'), label }, opener)); } },
      T('Delete all {0} versions', f.versions.length)));
  }
  body.replaceChildren(h('h2', { id: 'picker-title' }, T('Delete this?')), ...lines.filter(Boolean), h('div', { class: 'del-actions' }, ...actions, cancel), status);
  cancel.focus();
}

// A whole season or show: every version of every episode in it, in one go (see deleteMany on the server).
async function openDeleteMany({ files, transfers = [], what, label, onDone }, opener) {
  const ids = [...new Set(allVersions(files).map((f) => f.id).filter(Boolean))];
  const body = $('#picker-body');
  body.replaceChildren(h('h2', { id: 'picker-title' }, T('Delete {0}', what)), h('p', { class: 'muted' }, T('Checking…')));
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => opener?.focus({ preventScroll: true })));

  let info = { videos: 0, shared: 0, size: 0, downloads: 0, canDeleteForEveryone: false };
  try {
    if (ids.length) info = await api('/api/library/delete-many-info', jsonPost({ ids }));
  } catch (err) {
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Can’t delete {0}', what)), h('p', { class: 'muted' }, err.message));
    return;
  }
  const episodes = files.every((f) => f.season == null) ? plural(ids.length, 'video') : plural(episodeCount(files), 'episode');
  const status = h('p', { class: 'device-status', role: 'status' });
  const allShared = info.shared === info.videos;
  const sole = transfers.filter((d) => !d.others), carryOn = transfers.length - sole.length;
  const soleBytes = sole.reduce((n, d) => n + (Number(d.size) || 0) * (Number(d.progress) || 0), 0);
  const transferLines = [carryOn > 0 && T('Downloads someone else asked for carry on for them, but stop coming to your library.'),
    sole.length > 0 && T('{0} only you asked for will be cancelled, and the {1} downloaded so far deleted.', plural(sole.length, 'download'), fmtBytes(soleBytes))].filter(Boolean).join(' ');

  const run = async (btn, everyone = false) => {
    // Library videos only: wait behind Undo. (Leaving downloads still happens at once, below.)
    if (!transfers.length && ids.length) {
      await dismissTopOverlay().catch(() => {});
      undoableDelete({
        ids,
        message: !everyone && allShared ? T('Removed {0} from your library', label) : T('Deleted {0}', label),
        commit: (keepalive) => api('/api/library/delete-many', { ...jsonPost({ ids, everyone }), keepalive }),
        after: (r) => { if (r?.failed) toast(T('{0} deleted, {1} kept: {2}', r.deleted + r.removed, r.failed, r.error)); },
      });
      onDone?.();
      return;
    }
    body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    btn.textContent = !everyone && allShared ? T('Removing…') : T('Deleting…');
    status.className = 'device-status';
    status.textContent = '';
    try {
      const r = ids.length ? await api('/api/library/delete-many', jsonPost({ ids, everyone })) : { deleted: 0, removed: 0, failed: 0 };
      // A download the delete above already cancelled as a whole is gone by now (404): that's fine.
      for (const d of transfers) await api(`/api/downloads/${encodeURIComponent(d.hash)}/leave`, jsonPost({})).catch((e) => { if (e.status !== 404) throw e; });
      const gone = new Set(ids);
      dropFromLibrary(gone);
      if (transfers.length) { const left = new Set(transfers.map((d) => d.hash)); state.downloads = state.downloads.filter((d) => !left.has(d.hash)); invalidateDownloadsRead(); }
      await dismissTopOverlay().catch(() => {});
      toast(r.failed ? T('{0} deleted, {1} kept: {2}', r.deleted + r.removed, r.failed, r.error)
        : r.deleted ? T('Deleted {0}', label) : T('Removed {0} from your library', label));
      onDone?.();
      // Refresh after the server finishes cleaning up.
      setTimeout(async () => { await Promise.all([loadLibrary(), loadDownloads()]); if (state.view === 'library') renderLibrary(); if (state.view === 'downloads') renderDownloads(); }, 5000);
      if (state.view === 'library') renderLibrary();
    } catch (err) {
      body.querySelectorAll('button').forEach((b) => { b.disabled = false; b.textContent = b.dataset.label; });
      status.className = 'device-status is-error';
      status.textContent = err.message;
    }
  };
  const button = (text, cls, everyone) => {
    const b = h('button', { class: cls, 'data-label': text }, text);
    b.addEventListener('click', () => run(b, everyone));
    return b;
  };
  const cancel = h('button', { class: 'del-cancel', 'data-label': T('Keep it'), onclick: () => closeTopOverlay() }, T('Keep it'));
  const forEveryone = info.canDeleteForEveryone && button(T('Delete the files for everyone ({0})', fmtBytes(info.sizeForEveryone)), 'del-confirm del-secondary', true);

  if (!ids.length) {
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Remove {0} from your library?', what)),
      h('p', { class: 'del-name' }, label), h('p', { class: 'muted' }, transferLines),
      h('div', { class: 'del-actions' }, button(T('Remove {0} from my library', what), 'del-confirm'), cancel), status);
  } else if (allShared) {
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Remove {0} from your library?', what)),
      h('p', { class: 'del-name' }, label), h('p', { class: 'muted' }, T('{0}. Other people have {1} in their library too, so the files stay on the server. You can add them back from Discover.', episodes, info.videos === 1 ? T('it') : T('these'))),
      h('div', { class: 'del-actions' }, button(T('Remove {0} from my library', what), 'del-confirm'), forEveryone, cancel), status);
  } else {
    const lines = [T('{0} · {1} will be freed.', episodes, fmtBytes(info.size)),
      info.downloads && T('This also removes {0} from qBittorrent, so {1} seeding.', info.downloads === 1 ? T('its download') : T('{0} downloads', info.downloads), info.downloads === 1 ? T('it stops') : T('they stop')),
      info.shared && T('{0} that other people also have only {1} your library.', plural(info.shared, 'video'), info.shared === 1 ? T('leaves') : T('leave')),
      transferLines,
      T('This can’t be undone.')].filter(Boolean);
    body.replaceChildren(h('h2', { id: 'picker-title' }, T('Delete {0}?', what)),
      h('p', { class: 'del-name' }, label), h('p', { class: 'muted' }, lines.join(' ')),
      h('div', { class: 'del-actions' }, button(T('Delete {0}', what), 'del-confirm'), forEveryone, cancel), status);
  }
  cancel.focus();
}

// ---------- torrent search ----------
const SOURCE_NAMES = { tpb: 'The Pirate Bay', '1337x': '1337x', nyaa: 'Nyaa' };
const QUALITY_FILTERS = [['all', T('All')], ['2160p', '4K'], ['1440p', '1440p'], ['1080p', '1080p'], ['720p', '720p']];

// navigator.clipboard requires HTTPS; fall back to execCommand on plain HTTP.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const ta = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
  ta.remove();
  return ok;
}

async function magnetOf(t) {
  if (t.magnet) return t.magnet;
  t.magnet = (await api(`/api/torrents/magnet?ref=${encodeURIComponent(t.ref)}`)).magnet;
  return t.magnet;
}

async function sendToQbit(link, extra = {}) {
  await api('/api/downloads/add', jsonPost({ link, ...extra }));
  loadDownloads().then(patchUnifiedLibrary);
}

// The release list: search 1337x, The Pirate Bay and Nyaa and pick one yourself. It sits inside a title's
// Advanced options, and in the Find torrents sheet for anything that isn't a known film or show.
function torrentBrowser({ query = '', type = 'all', movieId = null, tvId = null, canonicalTitle = null, strict = false } = {}) {
  let results = [];
  let filter = 'all';
  let ctrl;
  const added = new Set();

  const input = h('input', { type: 'search', enterkeyhint: 'search', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    'aria-label': T('Torrent search'), placeholder: T('Title, or paste a magnet link') });
  input.value = query;
  const form = h('form', { class: 'search tor-search', role: 'search' },
    h('span', { class: 'search-icon', 'aria-hidden': 'true' }, icon('search')), input,
    h('button', { type: 'submit', class: 'tor-go' }, T('Search')));
  const chips = h('div', { class: 'tor-filters quality-rail', role: 'group', 'aria-label': T('Quality') },
    QUALITY_FILTERS.map(([key, text]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(key === filter),
      onclick: (e) => {
        filter = key;
        chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
        renderList();
      },
    }, text)));
  const info = h('p', { class: 'muted tor-info', role: 'status' });
  const list = h('ul', { class: 'rows tor-list' });
  // Subtitle language fetched automatically when the download completes.
  const subId = `tor-sub-${Math.random().toString(36).slice(2, 8)}`;
  const subSelect = h('select', { class: 'sub-select', id: subId });
  const subRow = h('div', { class: 'tor-subs', hidden: true },
    h('label', { for: subId }, T('Subtitles')), subSelect,
    h('span', { class: 'muted tor-subs-note' }));
  subSelect.addEventListener('change', () => { try { localStorage.setItem('subs:dlLang', subSelect.value); } catch { /* blocked */ } });
  const el = h('div', { class: 'tor-browser' }, form, subRow, chips, info, list);

  async function loadSubLangs(q) {
    if (!state.status.subtitles) return;
    const note = subRow.querySelector('.tor-subs-note');
    subRow.hidden = false;
    subSelect.replaceChildren(h('option', { value: '' }, T('None')));
    subSelect.disabled = true;
    note.textContent = T('Checking OpenSubtitles…');
    try {
      const data = await api(`/api/subs/langs?q=${encodeURIComponent(q)}&type=${type}`);
      subSelect.append(...data.languages.map((l) => h('option', { value: l.code }, l.name)));
      let pref = '';
      try { pref = localStorage.getItem('subs:dlLang') || ''; } catch { /* blocked */ }
      pref ||= prefs().subLang || ''; // Settings → subtitles
      if (data.languages.some((l) => l.code === pref)) subSelect.value = pref;
      note.textContent = data.languages.length ? '' : T('None found for this title');
    } catch (err) {
      note.textContent = err.message;
    } finally {
      subSelect.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); input.blur(); run(); });

  async function run() {
    const q = input.value.trim();
    ctrl?.abort();
    if (/^magnet:\?/i.test(q)) return addPastedMagnet(q);
    if (q.length < 2) { results = []; list.replaceChildren(); info.textContent = T('Type a title to search 1337x, The Pirate Bay and Nyaa (anime).'); return; }
    ctrl = new AbortController();
    const { signal } = ctrl;
    info.textContent = T('Searching 1337x, The Pirate Bay and Nyaa…');
    list.replaceChildren(...Array.from({ length: 5 }, () => h('li', { class: 'row tor skeleton-row', 'aria-hidden': 'true' })));
    try {
      // The title's TMDB id lets the server search anime by its romanised name too (Nyaa).
      const title = tvId ? `&tv=${tvId}` : movieId ? `&movie=${movieId}` : '';
      const data = await api(`/api/torrents/search?q=${encodeURIComponent(q)}&type=${type}${strict && q === query ? '&strict=1' : ''}${title}`, { signal });
      results = data.results;
      renderList(data.problems);
      loadSubLangs(q);
    } catch (err) {
      if (err.name === 'AbortError') return;
      results = [];
      info.textContent = '';
      list.replaceChildren(h('li', {}, notice(T('Search didn’t work'), err.message, run)));
    }
  }

  async function addPastedMagnet(link) {
    list.replaceChildren();
    if (!state.status.downloads) { info.textContent = T('Downloads aren’t connected, so there’s nowhere to send it. Set up qBittorrent in .env.'); return; }
    info.textContent = T('Sending to qBittorrent…');
    try {
      await sendToQbit(link);
      info.textContent = T('Added. It appears in your Library.');
      input.value = '';
    } catch (err) {
      info.textContent = err.message;
    }
  }

  function renderList(problems = []) {
    const shown = results.filter((t) => filter === 'all' || t.quality === filter);
    const bits = [];
    if (results.length) {
      bits.push(shown.length === results.length
        ? (results.length === 1 ? T('{0} result, most seeded first.', results.length) : T('{0} results, most seeded first.', results.length))
        : T('{0} of {1} results.', shown.length, results.length));
    }
    if (problems.length) bits.push(T('Skipped {0}', problems.join(' ')));
    info.textContent = bits.join(' ');
    if (!shown.length) {
      list.replaceChildren(h('li', {}, results.length
        ? notice(T('Nothing in that quality'), T('Try another filter.'))
        : notice(T('No torrents found'), T('Try fewer words, or the original title. For series, add the season, like “S02”.'))));
      return;
    }
    list.replaceChildren(...shown.map(torrentRow));
  }

  // A film you already have: releases in a resolution you have are marked (the server refuses them).
  const ownedQualities = () => new Set(movieId ? allVersions(state.library.filter((f) => Number(f.tmdbId) === Number(movieId)))
    .map((f) => f.versionQuality).filter(Boolean) : []);
  function torrentRow(t) {
    const health = t.seeders >= 50 ? 'good' : t.seeders >= 5 ? 'ok' : 'poor';
    const owned = t.quality && ownedQualities().has(t.quality);
    const status = h('span', { class: 'device-status' });
    const meta = [
      h('span', { class: `seeds seeds-${health}` }, T('{0} seeding', t.seeders.toLocaleString(locale))),
      t.size && fmtBytes(t.size),
      t.quality && t.quality !== 'SD' && (t.quality === '2160p' ? '4K' : t.quality),
      ...t.tags,
      t.cam && h('span', { class: 'tor-warn' }, T('Cinema recording')),
      owned && h('span', { class: 'tor-have' }, T('You have this quality')),
      SOURCE_NAMES[t.source],
      fmtAgo(t.added) || t.addedText,
    ].filter(Boolean).map((m) => (m instanceof Node ? m : h('span', {}, m)));

    const copyBtn = h('button', { class: 'cast-btn', title: T('Copy magnet link'), 'aria-label': T('Copy magnet link for {0}', t.name), onclick: copy }, icon('copy'));
    const getBtn = canDownload() && h('button', { class: 'play-btn', 'aria-label': T('Download {0}', t.name), onclick: get }, icon('download'), T('Get'));
    if (getBtn && added.has(t.id)) markAdded();

    async function copy() {
      copyBtn.disabled = true;
      try {
        const ok = await copyText(await magnetOf(t));
        toast(ok ? T('Magnet link copied') : T('Couldn’t copy on this device'));
      } catch (err) {
        toast(err.message);
      } finally {
        copyBtn.disabled = false;
      }
    }
    async function get() {
      getBtn.disabled = true;
      getBtn.replaceChildren(T('Adding…'));
      status.className = 'device-status';
      status.textContent = '';
      try {
        const sub = subRow.hidden ? '' : subSelect.value;
        // Only carry the title's identity while searching its own name; free searches can be anything.
        const own = input.value.trim() === query.trim();
        await sendToQbit(await magnetOf(t), { name: t.name, ...(sub ? { subs: [sub] } : {}),
          ...(own && type !== 'all' ? { mediaType: type } : {}),
          ...(movieId && own ? { movieId } : {}),
          ...(tvId && own ? { tvId, canonicalTitle } : {}) });
        added.add(t.id);
        markAdded();
        const subName = sub && subSelect.selectedOptions[0]?.textContent;
        toast(subName ? T('Added. {0} subtitles come when it finishes.', subName) : T('Added to Library'));
      } catch (err) {
        getBtn.disabled = false;
        getBtn.replaceChildren(icon('download'), T('Get'));
        status.className = 'device-status is-error';
        status.textContent = err.message;
      }
    }
    function markAdded() {
      getBtn.disabled = true;
      getBtn.classList.add('is-added');
      getBtn.replaceChildren(icon('check'), T('Added'));
    }

    return h('li', { class: 'row tor' },
      h('div', { class: 'row-text' },
        h('div', { class: 'tor-name', title: t.name }, t.name),
        h('div', { class: 'row-meta' }, meta),
        status),
      h('div', { class: 'row-actions' }, copyBtn, getBtn));
  }

  return {
    el,
    abort: () => ctrl?.abort(),
    start: () => { if (query) run(); else { info.textContent = T('Type a title to search 1337x, The Pirate Bay and Nyaa (anime).'); input.focus(); } },
  };
}

// Find torrents (Discover search): the release list on its own, for anything you search by name.
function openTorrents({ query = '', opener } = {}) {
  const browser = torrentBrowser({ query });
  $('#picker-body').replaceChildren(h('h2', { id: 'picker-title' }, T('Find torrents')), browser.el);
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { browser.abort(); opener?.focus({ preventScroll: true }); }));
  browser.start();
}

// ---------- casting: remote control ----------
async function loadSessions() {
  try { state.sessions = (await api('/api/cast/sessions')).sessions.filter((s) => s.mine !== false); } catch { /* keep last known */ }
  renderNowbar();
}

function renderNowbar() {
  const bar = $('#nowbar');
  const s = state.sessions[0];
  bar.hidden = !s || !$('#remote').hidden;
  document.body.classList.toggle('has-nowbar', !bar.hidden);
  if (!s) return;
  const more = state.sessions.length > 1 ? T(' (+{0} more)', state.sessions.length - 1) : '';
  bar.replaceChildren(
    h('span', { class: 'nowbar-icon' }, icon('tv')),
    h('span', { class: 'nowbar-text' }, h('strong', {}, s.title), h('span', {}, T('on {0}{1}', s.deviceName, more))),
    h('span', { class: 'nowbar-open' }, T('Remote')));
  bar.onclick = () => openRemote(s);
}

const STATE_TEXT = { playing: T('Playing'), paused: T('Paused'), loading: T('Loading on the TV…'), stopped: T('Stopped'), unknown: '' };
let activeRemote = null; // the open remote; a replaced one must not hide its successor when it closes

function openRemote(session, { replace = false } = {}) {
  const id = session.deviceId;
  const r = {};
  const token = activeRemote = {};
  let st = { state: 'loading', position: null, duration: null, volume: null };
  let dragging = false;
  let lastAction = 0;
  // Skip intro / Up next on the phone, from the TV's reported position (the TV can't show Lilin's buttons).
  const cue = { intro: null, creditsAt: null, duration: null, lastPosition: null, introDone: false,
    dismissed: false, busy: false, error: '', autoLeft: null, autoTimer: null, announced: null };

  $('#remote-body').replaceChildren(
    h('div', { class: 'remote-top' },
      h('button', { class: 'icon-btn', id: 'remote-close', 'aria-label': T('Close remote'), onclick: closeTopOverlay }, icon('back')),
      h('p', { class: 'remote-where' }, icon('tv'), h('span', {}, session.deviceName))),
    h('div', { class: 'remote-main' },
      h('h2', { id: 'remote-title' }, session.title),
      session.subtitle && h('p', { class: 'remote-sub' }, session.subtitle),
      r.state = h('p', { class: 'remote-state', role: 'status' }, T('Connecting…')),
      h('div', { class: 'scrub' },
        r.seek = h('input', { type: 'range', min: '0', max: '0', step: '1', value: '0', 'aria-label': T('Position'), disabled: true }),
        h('div', { class: 'scrub-times' }, r.pos = h('span', {}, '0:00'), r.dur = h('span', {}, '–:––'))),
      h('div', { class: 'transport' },
        h('button', { class: 'skip-btn', 'aria-label': T('Back 10 seconds'), onclick: () => jump(-10) }, '−10s'),
        r.toggle = h('button', { class: 'toggle-btn', onclick: toggle }),
        h('button', { class: 'skip-btn', 'aria-label': T('Forward 30 seconds'), onclick: () => jump(30) }, '+30s')),
      r.skipIntro = h('button', { class: 'remote-skip-intro', type: 'button', hidden: true, onclick: () => skipIntroOnTv() },
        T('Skip intro'), icon('skip')),
      r.upNext = h('section', { class: 'remote-up-next', hidden: true, 'aria-label': T('Up next') },
        h('div', { class: 'up-next-copy' },
          r.upNextArt = h('div', { class: 'up-next-art', 'aria-hidden': 'true' }),
          h('div', {}, h('p', { class: 'up-next-label' }, T('Up next')), r.upNextTitle = h('h3', {}))),
        h('div', { class: 'up-next-actions' },
          r.upNextPlay = h('button', { class: 'up-next-play', type: 'button', onclick: () => playNextOnTv() }, T('Next episode')),
          r.upNextDismiss = h('button', { class: 'up-next-dismiss', type: 'button', onclick: () => { cue.dismissed = true; renderCues(); } }, T('Keep watching'))),
        r.upNextError = h('p', { class: 'up-next-error', hidden: true })),
      r.cueStatus = h('p', { class: 'sr-only', role: 'status' }),
      r.volWrap = h('label', { class: 'volume', hidden: true }, icon('volume'),
        r.vol = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': T('TV volume') })),
      r.subs = h('div', { class: 'remote-subs', hidden: true }),
      h('button', { class: 'stop-btn', onclick: stop }, T('Stop playing on the TV'))));

  r.sync = h('div', { class: 'remote-sync' });
  r.seek.addEventListener('pointerdown', () => { dragging = true; });
  r.seek.addEventListener('input', () => { dragging = true; r.pos.textContent = fmtTime(Number(r.seek.value)); });
  r.seek.addEventListener('change', () => {
    dragging = false;
    st.position = Number(r.seek.value);
    send('seek', st.position);
  });
  r.vol.addEventListener('change', () => send('volume', Number(r.vol.value)));

  function render() {
    r.state.textContent = STATE_TEXT[st.state] ?? '';
    const playing = st.state === 'playing' || st.state === 'loading';
    r.toggle.replaceChildren(icon(playing ? 'pause' : 'play'));
    r.toggle.setAttribute('aria-label', playing ? T('Pause') : T('Play'));
    if (st.duration) {
      r.seek.disabled = false;
      r.seek.max = String(Math.floor(st.duration));
      r.dur.textContent = fmtTime(st.duration);
    }
    if (!dragging && st.position != null) {
      r.seek.value = String(Math.floor(st.position));
      r.pos.textContent = fmtTime(st.position);
    }
    r.volWrap.hidden = st.volume == null;
    if (st.volume != null && document.activeElement !== r.vol) r.vol.value = String(st.volume);
    renderCues();
  }

  // ---- Skip intro and Up next for the TV ----
  async function loadCues() {
    const ref = session.media;
    if (!ref?.kind || !ref.id) return;
    const base = `/api/media/${ref.kind}/${encodeURIComponent(ref.id)}`;
    api(`${base}/intro`).then((data) => {
      const start = Number(data.intro?.start), end = Number(data.intro?.end);
      cue.intro = Number.isFinite(start) && Number.isFinite(end) && end - start >= 5 ? { start, end } : null;
      if (activeRemote === token) renderCues();
    }).catch(() => { /* no known intro: no button */ });
    // The first lookup of a long episode can take half a minute; Up next waits for the end until then.
    api(`${base}/credits`).then((data) => {
      cue.creditsAt = Number.isFinite(data.creditsAt) && data.creditsAt > 0 ? data.creditsAt : null;
      if (activeRemote === token) renderCues();
    }).catch(() => {});
  }
  const nextUp = () => nextLibraryEpisode({ kind: session.media?.kind, id: session.media?.id }, state.library, state.libraryShows);

  function renderCues() {
    if (activeRemote !== token) return;
    if (Number.isFinite(st.duration) && st.duration > 0) cue.duration = st.duration;
    if (st.state === 'playing' && Number.isFinite(st.position)) cue.lastPosition = st.position;
    const reading = { state: st.state, position: st.position, duration: cue.duration, creditsAt: cue.creditsAt, lastPosition: cue.lastPosition };

    const introOn = !dragging && tvIntroShowing({ ...reading, intro: cue.intro });
    if (introOn && prefs().skipIntro === 'auto' && !cue.introDone && st.state === 'playing') { skipIntroOnTv(true); return; }
    r.skipIntro.hidden = !introOn;

    const next = nextUp();
    const show = Boolean(next && !cue.dismissed && !dragging && tvNextShowing(reading));
    r.upNext.hidden = !show;
    // Counts only when the episode really plays out: at the credits, or after the TV finished it
    // (not after someone stopped it with the TV's own remote halfway through the credits).
    const ended = tvFinished(reading);
    const counting = show && !cue.busy && !cue.error && autoChain < AUTOPLAY_CHAIN && autoplayNextOn() && (st.state === 'playing' || ended);
    if (counting && cue.autoLeft == null && !cue.autoTimer) startTvAutoplay();
    else if (!counting && !(show && st.state === 'paused')) stopTvAutoplay();
    if (!show) return;
    const title = [episodeLabel(next), next.episodeName || next.title].filter(Boolean).join(' · ');
    if (r.upNextTitle.textContent !== title) r.upNextTitle.textContent = title;
    if (r.upNextArt.dataset.for !== next.id) {
      r.upNextArt.dataset.for = next.id;
      r.upNextArt.replaceChildren(episodeArt(next.still, state.libraryShows.find((s) => s.id === next.show)));
    }
    const left = cue.autoLeft == null ? null : Math.max(1, Math.ceil(cue.autoLeft));
    r.upNextPlay.disabled = cue.busy;
    r.upNextPlay.textContent = cue.busy ? T('Starting on the TV…') : left ? T('Next episode in {0}', left) : T('Next episode');
    r.upNextPlay.classList.toggle('counting', left != null);
    r.upNextPlay.style.setProperty('--auto-progress', left == null ? '0' : String(1 - cue.autoLeft / AUTOPLAY_SECONDS));
    r.upNextDismiss.textContent = ended ? T('Dismiss') : T('Keep watching');
    r.upNextError.textContent = cue.error;
    r.upNextError.hidden = !cue.error;
    if (cue.announced !== next.id) {
      cue.announced = next.id;
      r.cueStatus.textContent = T('Up next: {0}.', title);
    }
  }

  function skipIntroOnTv(auto = false) {
    if (!cue.intro || (auto && cue.introDone)) return;
    cue.introDone = true; // once per cast: seeking back to watch it is left alone
    st.position = cue.intro.end;
    send('seek', cue.intro.end);
  }

  // Real seconds while the credits play on the TV (or after it finished); paused on the TV = paused here.
  // A locked phone runs no timers, so the TV only moves on while someone has the remote open.
  function startTvAutoplay() {
    cue.autoLeft = AUTOPLAY_SECONDS;
    let last = Date.now();
    const tick = () => {
      if (activeRemote !== token || cue.autoLeft == null) { cue.autoTimer = null; return; }
      const now = Date.now();
      if (!document.hidden && st.state !== 'paused') cue.autoLeft -= (now - last) / 1000;
      last = now;
      if (cue.autoLeft <= 0) {
        cue.autoLeft = null; cue.autoTimer = null;
        autoChain++;
        playNextOnTv();
        return;
      }
      cue.autoTimer = setTimeout(tick, 250);
      renderCues();
    };
    cue.autoTimer = setTimeout(tick, 250);
  }
  function stopTvAutoplay() {
    if (cue.autoTimer) clearTimeout(cue.autoTimer);
    cue.autoTimer = null; cue.autoLeft = null;
  }

  async function playNextOnTv() {
    const next = nextUp();
    if (!next || cue.busy) return;
    cue.busy = true; cue.error = '';
    stopTvAutoplay();
    renderCues();
    const start = (sub) => api('/api/cast/play', jsonPost({ deviceId: id, kind: 'lib', id: next.id, ...(sub ? { sub } : {}) }));
    try {
      let result;
      // Keep the subtitles on; if the next episode has none in that language, play it without.
      try { result = await start(session.sub); } catch (err) { if (!session.sub) throw err; result = await start(null); }
      const s = result.session;
      state.sessions = [s, ...state.sessions.filter((x) => x.deviceId !== s.deviceId)];
      if (activeRemote === token) openRemote(s, { replace: true });
    } catch (err) {
      cue.busy = false;
      cue.error = T('{0} Try Next episode again.', err.message);
      r.cueStatus.textContent = cue.error;
      renderCues();
    }
  }

  async function poll() {
    if (document.hidden || Date.now() - lastAction < 1200) return; // give the TV time to apply a command
    try {
      const s = await api(`/api/cast/${id}/status`);
      st = { ...st, ...s };
      render();
    } catch (err) {
      r.state.textContent = err.message;
    }
  }

  async function send(action, value) {
    lastAction = Date.now();
    render();
    try {
      await api(`/api/cast/${id}/control`, jsonPost({ action, value }));
    } catch (err) {
      toast(err.message);
    }
  }

  function toggle() {
    const pause = st.state === 'playing' || st.state === 'loading';
    st.state = pause ? 'paused' : 'playing';
    send(pause ? 'pause' : 'play');
  }

  function jump(delta) {
    if (st.position == null) return;
    st.position = Math.max(0, Math.min(st.duration || Infinity, st.position + delta));
    send('seek', st.position);
  }

  async function stop() {
    await send('stop');
    state.sessions = state.sessions.filter((s) => s.deviceId !== id);
    closeTopOverlay();
  }

  // Changing subtitles restarts playback on the TV at the current position.
  async function loadSubs() {
    const ref = session.media;
    if (!ref) return;
    if (session.kind === 'airplay') {
      if (!state.status.subtitles) return;
      r.subs.hidden = false;
      r.subs.replaceChildren(h('h3', {}, T('Subtitles')),
        h('p', { class: 'muted' }, T('Apple TV can’t show separate subtitle files over AirPlay. Play it on the phone for subtitles, or use a smart TV.')));
      return;
    }
    let data;
    try { data = await api(`/api/subs/langs?kind=${ref.kind}&id=${encodeURIComponent(ref.id)}`); } catch { return; }
    if (!data.languages.length && !data.configured) return;
    r.subs.hidden = false;
    const note = h('p', { class: 'muted remote-subs-note', role: 'status' }, data.languages.length ? '' : data.problem || T('No subtitles found for this.'));
    const options = [{ code: null, name: T('Off') }, ...data.languages];
    const chips = h('div', { class: 'tor-filters' }, options.map((l) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String((session.sub || null) === l.code),
      onclick: () => pickSub(l, chips, note, options),
    }, l.name)));
    r.subs.replaceChildren(...[h('h3', {}, T('Subtitles')), data.languages.length ? chips : null, note, r.sync].filter(Boolean));
    subUi = { chips, note, options };
    renderOffset();
  }

  async function pickSub(l, chips, note, options, { reload = false } = {}) {
    if (!reload && (session.sub || null) === l.code) return;
    chips.querySelectorAll('.chip').forEach((c) => { c.disabled = true; });
    note.textContent = reload ? T('Sending the new subtitle timing to the TV…')
      : l.code ? T('Getting {0} subtitles and restarting on the TV…', l.name) : T('Restarting on the TV without subtitles…');
    lastAction = Date.now() + 8000; // pause status polling while the TV reloads
    try {
      const { session: next } = await api(`/api/cast/${id}/subtitles`, jsonPost({ lang: l.code }));
      session.sub = next.sub;
      state.sessions = [next, ...state.sessions.filter((s) => s.deviceId !== next.deviceId)];
      chips.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', String((options[i].code || null) === (session.sub || null))));
      note.textContent = reload ? T('The TV has the new subtitle timing.')
        : l.code ? T('{0} subtitles on. If they don’t appear, this TV may not support subtitle files over the network.', l.name) : '';
    } catch (err) {
      note.textContent = err.message;
    } finally {
      chips.querySelectorAll('.chip').forEach((c) => { c.disabled = false; });
      if (!reload) renderOffset();
    }
  }

  // Subtitle offset. The TV keeps the subtitle file it was given, so after the last tap the new
  // timing is sent over by restarting at the same spot (the same way switching language works).
  let subUi = null;
  let offsetChain = Promise.resolve();
  let applyTimer = null;
  async function renderOffset() {
    const lang = session.sub;
    if (!lang || session.kind === 'airplay') { r.sync.replaceChildren(); return; }
    let s;
    try { s = await api(`/api/subs/sync?kind=${session.media.kind}&id=${encodeURIComponent(session.media.id)}&lang=${lang}`); } catch { r.sync.replaceChildren(); return; }
    if (session.sub !== lang) return;
    drawOffset(s, lang);
  }
  function drawOffset(s, lang, pending = false) {
    r.sync.replaceChildren(...[
      subSyncBusy(s) ? h('p', { class: 'muted remote-subs-note' }, T('Checking the timing…'))
        : nudgeRow(s.manual || 0, (n) => nudgeOnTv(lang, n)),
      pending && h('p', { class: 'muted remote-subs-note' }, T('Updating the TV in a moment…')),
    ].filter(Boolean));
  }
  function nudgeOnTv(lang, seconds) {
    clearTimeout(applyTimer);
    offsetChain = offsetChain.then(async () => {
      try {
        const s = await api('/api/subs/sync', jsonPost({ kind: session.media.kind, id: session.media.id, lang, action: 'shift', seconds }));
        if (session.sub !== lang) return;
        drawOffset(s, lang, true);
        clearTimeout(applyTimer);
        applyTimer = setTimeout(() => {
          const l = subUi?.options.find((o) => o.code === lang);
          if (l && session.sub === lang) pickSub(l, subUi.chips, subUi.note, subUi.options, { reload: true }).then(() => drawOffset(s, lang));
        }, 1500);
      } catch (err) { toast(err.message); }
    });
  }
  render();
  loadSubs();
  loadCues();
  $('#remote').hidden = false;
  document.body.style.overflow = 'hidden';
  renderNowbar();
  $('#remote-close').focus({ preventScroll: true });
  poll();
  const timer = setInterval(poll, 1500);

  const close = () => {
    clearInterval(timer);
    stopTvAutoplay();
    if (activeRemote !== token) return; // replaced by the next episode's remote
    activeRemote = null;
    $('#remote').hidden = true;
    document.body.style.overflow = '';
    renderNowbar();
    loadSessions();
  };
  if (replace) swapTopOverlay(close); else pushOverlay(close);
}

// ---------- player ----------
const video = $('#video');
let current = null;
let lastSave = 0;
let party = null;
let watchPanelOpen = false;
let partyUnread = 0; // chat messages since the Room panel was last open
const watchClient = globalThis.crypto?.randomUUID?.() || `${CLIENT_ID}-${Math.random().toString(36).slice(2, 10)}`;

// Wide or landscape screens dock the room on the right and the picture moves over; phones and upright tablets
// get a sheet under the picture, which moves up (the live chat's model). Either way nothing covers the picture.
const roomDocks = matchMedia('(min-width: 1100px), (orientation: landscape) and (min-width: 560px)');
const roomDocked = () => Boolean(party && watchPanelOpen && roomDocks.matches);
const roomSheet = () => Boolean(party && watchPanelOpen && !roomDocks.matches);
roomDocks.addEventListener?.('change', () => { if (party) renderParty(); });

// One line about the room, with a tone for its colour: live, count, wait or alert.
function roomStatus(room, host) {
  const counting = party.startsIn != null && party.startsIn > 0;
  if (!party.connected || !party.online) return ['alert', T('Reconnecting… playback is paused')];
  if (counting) return ['count', T('Starts {0}', startLabel(room.startsAt))];
  if (party.blocked) return ['alert', T('Press Play to join playback')];
  if (room.waitingForDownload) {
    const eta = room.download?.wait > 0 ? fmtWait(room.download.wait) : null;
    return ['wait', eta ? T('Waiting for the download · starts in about {0}', eta) : T('Waiting for the download')];
  }
  if (room.waitingFor.length) return ['wait', T('Waiting for {0}', namesText(room.waitingFor))];
  // Only people whose player is connected count: someone still "Connecting…" isn't watching yet.
  const watching = room.members.filter((m) => m.connected).length || 1;
  if (room.playing) return ['live', T('Playing for {0}', watching === 1 ? T('you') : T('all {0}', watching))];
  return ['wait', party.isHost ? T('Paused · press Play to start it for everyone') : T('Paused · {0} has the remote', host)];
}
// Where one viewer is: ready, getting ready, needs a tap, or still connecting.
function memberState(m) {
  if (!m.connected) return ['away', T('Connecting…')];
  if (m.blocked) return ['wait', T('Needs to press Play')];
  if (m.buffering) return ['wait', T('Loading…')];
  if (!m.ready) return ['wait', T('Getting ready')];
  return ['ready', T('Ready')];
}
let roomDrawn = '';
function renderRoster(room) {
  const list = $('#watch-members');
  const rows = room.members.map((m) => {
    const [tone, text] = memberState(m);
    return { m, tone, text, me: m.id === watchClient, host: m.id === room.host };
  });
  const key = JSON.stringify(rows.map((r) => [r.m.id, r.m.name, r.m.avatar, r.tone, r.text, r.host]));
  if (key === roomDrawn) return;
  roomDrawn = key;
  list.replaceChildren(...rows.map(({ m, tone, text, me, host }) => h('li', { class: `room-member is-${tone}${host ? ' is-host' : ''}${me ? ' is-me' : ''}` },
    h('span', { class: 'room-member-face' }, people.face(m, { size: 46 }),
      host && h('span', { class: 'room-crown', title: T('Host'), 'aria-hidden': 'true' }, icon('crown'))),
    h('span', { class: 'room-member-name' }, me ? T('You') : personName(m)),
    h('span', { class: 'room-member-state' }, host ? (tone === 'ready' ? T('Host') : T('Host · {0}', text.toLowerCase())) : text))));
  $('#watch-count').textContent = room.members.length > 1 ? `· ${room.members.length}` : '';
}
// The Room button in the control row: faces of who's in, plus unread messages.
let roomButtonDrawn = '';
function renderRoomButton(room) {
  const btn = $('#watch-btn');
  const seen = new Set();
  const faces = (room?.members || []).filter((m) => { const k = `${m.name}|${m.avatar}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const key = JSON.stringify([Boolean(party), faces.map((m) => [m.name, m.avatar])]);
  if (key !== roomButtonDrawn) {
    roomButtonDrawn = key;
    $('#watch-btn-faces').replaceChildren(...(party ? [people.faces(faces, { size: 22, max: 3 })] : [icon('party')]).filter(Boolean));
  }
  $('#watch-btn-label').textContent = party ? T('Room') : T('Watch together');
  const badge = $('#watch-btn-badge');
  badge.hidden = !(party && partyUnread && !watchPanelOpen);
  badge.textContent = partyUnread > 9 ? '9+' : String(partyUnread);
  btn.setAttribute('aria-label', party ? T('Watch Together room{0}', partyUnread && !watchPanelOpen ? T(', {0} new {1}', partyUnread, partyUnread === 1 ? T('message') : T('messages')) : '') : T('Start Watch Together'));
}

function renderParty() {
  const bar = $('#watch-bar');
  bar.hidden = !party || !watchPanelOpen;
  const roomButton = $('#watch-btn');
  roomButton.hidden = !party && !(current?.kind === 'part' || (current?.kind === 'lib' && state.library.some((f) => f.id === mediaId(current))));
  roomButton.setAttribute('aria-expanded', String(Boolean(party && watchPanelOpen)));
  roomButton.classList.toggle('is-on', Boolean(party));
  renderRoomButton(party?.state);
  const onAir = Boolean(party?.state.live);
  if (onAir) { roomButton.hidden = true; bar.hidden = true; }
  playerEl.classList.toggle('is-live', onAir);
  renderLiveStrip();
  playerEl.classList.toggle('in-party', Boolean(party));
  if (playerEl.classList.contains('room-docked') !== roomDocked() || playerEl.classList.contains('room-sheet') !== roomSheet()) {
    playerEl.classList.toggle('room-docked', roomDocked());
    playerEl.classList.toggle('room-sheet', roomSheet());
    requestAnimationFrame(layoutSubs);
  }
  updateUpNext();
  renderAudioControls();
  // A language the host picked before opening the room counts too.
  if (party?.isHost && current?.audio?.userChoice) shareRoomAudio(current.audio);
  followRoomAudio();
  updatePartyCountdown();
  if (!party) { roomDrawn = ''; return; }
  updatePlayState();
  const room = party.state;
  const hostMember = room.members.find((m) => m.id === room.host);
  const host = hostMember ? personName(hostMember) : T('The host');
  const [tone, status] = roomStatus(room, host);
  const statusEl = $('#watch-status');
  if (statusEl.textContent !== status) statusEl.textContent = status;
  statusEl.dataset.tone = tone;
  const title = current ? [current.filmTitle || current.title, episodeLabel(current)].filter(Boolean).join(' · ') : '';
  if ($('#watch-title').textContent !== title) $('#watch-title').textContent = title;
  renderRoster(room);
  $('#watch-hint').textContent = party.isHost ? T('You have the remote: everyone follows your play, pause and seeking.')
    : T('{0} has the remote: play, pause and seeking follow them.', host);
  playerEl.classList.toggle('party-guest', !party.isHost);
  airplayBtn.hidden = true;
  seekEl.setAttribute('aria-disabled', String(!party.isHost));
  seekEl.tabIndex = party.isHost ? 0 : -1;
  for (const b of playBtns) {
    b.disabled = !party.isHost && !party.blocked;
    b.title = party.blocked ? T('Join playback') : party.isHost ? '' : T('The host controls playback');
  }
  for (const b of playerEl.querySelectorAll('.pc-skip')) { b.disabled = !party.isHost; b.title = party.isHost ? '' : T('The host controls seeking'); }
}

function leaveWatchRoom(notify = true) {
  const old = party;
  if (!old) return;
  party = null;
  watchPanelOpen = false;
  partyUnread = 0;
  $('#chat-log').replaceChildren();
  $('#chat-layer').replaceChildren();
  inviteList.replaceChildren(); delete inviteList.dataset.token;
  old.close({ notify });
  for (const t of video.querySelectorAll('track')) offsetCues(t.track, 0);
  video.disableRemotePlayback = false;
  video.preload = 'metadata';
  playerEl.classList.remove('party-guest');
  seekEl.removeAttribute('aria-disabled');
  seekEl.tabIndex = 0;
  for (const b of [...playBtns, ...playerEl.querySelectorAll('.pc-skip')]) { b.disabled = false; b.title = ''; }
  const url = new URL(location.href); url.searchParams.delete('watch'); history.replaceState(null, '', url.pathname + url.search + url.hash);
  renderParty();
  if (current) { watchCastTargets(); renderCcMenu(current, current); }
}

// joined = this viewer already joined playback in this room (the video changed under them): no new tap.
function attachWatchRoom(room, joined = false) {
  if (party) leaveWatchRoom();
  const alreadyPlaying = joined || (!video.paused && video.readyState >= 3);
  video.pause();
  video.preload = 'auto';
  video.disableRemotePlayback = true;
  resetCasting();
  party = new WatchSession({ video, room, clientId: watchClient, request: api, onState: followRoom,
    onEnd: (message) => { leaveWatchRoom(false); video.pause(); toast(message); }, onError: toast,
    onChat: partyChat, onReaction: (r) => { if (r.from !== watchClient) social.burst($('#reaction-layer'), r.emoji, r.name, r.avatar); } });
  partyUnread = 0;
  renderChatLog();
  // The tap on Watch together or Join and watch already counts as permission to play in most browsers, so there's
  // no separate "ready" step: if a browser still refuses when the host presses Play, the Play button asks for a tap.
  if (alreadyPlaying || navigator.userActivation?.hasBeenActive) party.blocked = false;
  watchPanelOpen = false;
  renderParty();
  return party;
}

// Room state arrived. A Play now room whose download finished moves to the full-quality file: everyone's
// player reloads it in place and keeps their seat (the room waits until they're all ready again).
function followRoom(session) {
  if (session === party && session.state.live) { followLive(session); return; }
  const media = session.state.media;
  if (session === party && current?.kind === 'part' && media?.kind === 'lib') {
    const room = session.state, joined = !session.blocked;
    leaveWatchRoom(false);
    loadPlayerMedia({ ...media, key: media.id, done: true }, { watchRoom: room, roomJoined: joined });
    return;
  }
  renderParty();
}

// ---------- Live TV ----------
// Each channel plays in a Watch Together room that nobody hosts (src/live-tv.js): tuning in joins it at the
// live moment, the room's clock keeps everyone on the same frame, and a new programme reaches every player at once.
const liveView = createLiveView({ h, icon, api, jsonPost, toast, people, episodeLabel, me: () => state.me, tune: (id) => tuneIn(id),
  overlay: { push: pushOverlay }, sheet: (onClosed) => showSheet($('#picker'), $('#picker-backdrop'), onClosed), emptyState, together: liveTogether });
liveView.onChanged(() => { if (state.view === 'live') liveView.load(true).then(renderLive); });
// livechat: the chat panel on a channel (live-chat.js)
const liveChat = createLiveChat({ h, api, jsonPost, toast, people, social, reactions: REACTIONS, me: () => state.me, client: watchClient,
  player: $('#player'), floats: $('#chat-layer'), bursts: $('#reaction-layer'), channelName: (ch) => channelName(ch, state.me),
  say: (text) => party.say(text), react: (emoji) => party?.react(emoji), layout: () => requestAnimationFrame(layoutSubs) });
function renderLive() { const body = $('#live-body'); if (body) liveView.render(body); }

const liveMediaOf = (room) => ({ ...room.media, key: room.media.id, done: true, live: room.live,
  filmTitle: room.live?.now?.title || room.media.title, episodeName: room.live?.now?.name || null });
let tuning = null, lastChannel = null, liveDigits = '', liveDigitsTimer = null;
const liveChannelId = () => (current?.live ? party?.state.live?.channel?.id || current.live.channel?.id : null);

// Switching channels: a moment of static with the channel number in the top right corner, then the channel's
// number, name and what's on now slide in like a TV's on-screen info (also when a channel is first tuned in).
const channelUi = { cut: null, static: null, corner: null, info: null, timer: 0, cornerTimer: 0, since: 0 };
function channelEls() {
  if (!channelUi.cut) {
    channelUi.cut = h('div', { class: 'channel-cut', 'aria-hidden': 'true' });
    channelUi.static = createChannelStatic({ h }); // the grain while it switches (channel-static.js)
    channelUi.corner = h('div', { class: 'channel-corner', 'aria-hidden': 'true' });
    channelUi.info = h('div', { class: 'channel-info', 'aria-hidden': 'true' });
    $('#player-stage').append(channelUi.cut, channelUi.static.el, channelUi.corner, channelUi.info);
  }
  return channelUi;
}
function startChannelCut(number) {
  const { cut } = channelEls();
  channelUi.since = Date.now();
  cut.classList.add('is-on');
  channelUi.static.start();
  if (number != null) showChannelCorner(number);
}
// The channel number in the top right corner, big and plain like a TV's own on-screen display.
function showChannelCorner(number) {
  const { corner } = channelEls();
  corner.textContent = String(number);
  corner.classList.add('is-in');
  clearTimeout(channelUi.cornerTimer);
  channelUi.cornerTimer = setTimeout(() => corner.classList.remove('is-in'), 2600);
}
function endChannelCut(waitForPicture) {
  const { cut } = channelEls();
  if (!cut.classList.contains('is-on')) return;
  const off = () => setTimeout(() => { cut.classList.remove('is-on'); channelUi.static.stop(); }, Math.max(0, STATIC_MIN_MS - (Date.now() - channelUi.since)));
  if (!waitForPicture || !video.paused && video.readyState >= 3) { off(); return; }
  let done = false;
  const once = () => { if (done) return; done = true; video.removeEventListener('playing', once); off(); };
  video.addEventListener('playing', once);
  setTimeout(once, 3000);
}
function showChannelInfo(live) {
  const ch = live?.channel;
  if (!ch) return;
  const { info } = channelEls();
  if (ch.number != null) showChannelCorner(ch.number);
  const now = live.now;
  const line = now && programmeLine(now, episodeLabel);
  const done = now ? Math.min(1, Math.max(0, (Date.now() - now.s) / (now.e - now.s))) : 0;
  info.replaceChildren(
    h('span', { class: 'ci-number' }, String(ch.number ?? '')),
    h('div', { class: 'ci-text' },
      h('b', { class: 'ci-name' }, channelName(ch, state.me)),
      h('p', { class: 'ci-now' }, now ? [now.title, line ? h('span', {}, ` · ${line}`) : null] : T('Off air')),
      now && h('div', { class: 'ci-row' },
        h('span', { class: 'ci-bar', style: `--done:${done}` }, h('i', {})),
        h('small', {}, `${liveClock(now.s)}–${liveClock(now.e)}`))));
  info.classList.remove('is-in');
  void info.offsetWidth; // restart the slide
  info.classList.add('is-in');
  clearTimeout(channelUi.timer);
  channelUi.timer = setTimeout(() => info.classList.remove('is-in'), 4500);
}

async function tuneIn(id, again = false) {
  if (!id || tuning) return;
  const was = liveChannelId();
  if (was === id && !playerEl.hidden && !again) { showPlayerUi(); return; }
  tuning = id;
  const switching = !playerEl.hidden && Boolean(current);
  if (switching) startChannelCut(liveView.byId(id)?.number);
  let tuned = false;
  try {
    const room = await api(`/api/live/${encodeURIComponent(id)}/tune`, jsonPost({ clientId: watchClient }));
    if (!room.media) {
      api(`/api/watch/${room.token}/leave`, jsonPost({ clientId: watchClient })).catch(() => {});
      const next = room.live?.next;
      toast(next ? T('Nothing is on right now. {0} starts at {1}.', next.title, liveClock(next.s)) : T('Nothing is on this channel right now.'));
      return;
    }
    if (was && was !== id) lastChannel = was;
    if (!playerEl.hidden && current) await loadPlayerMedia(liveMediaOf(room), { watchRoom: room, roomJoined: !party?.blocked });
    else await openPlayer(liveMediaOf(room), { watchRoom: room });
    tuned = true;
    showChannelInfo(room.live);
  } catch (e) { toast(e.message); }
  finally { tuning = null; if (switching) endChannelCut(tuned); }
}

// A new state for the channel: the next programme loads in place (no new tap), and an empty slot says when it's back.
function followLive(session) {
  const room = session.state;
  if (current && room.live) current.live = room.live;
  if (room.media && current && room.media.id !== current.id) {
    const joined = !session.blocked;
    leaveWatchRoom(false);
    loadPlayerMedia(liveMediaOf(room), { watchRoom: room, roomJoined: joined });
    return;
  }
  const note = $('#player-note');
  if (!room.media) {
    const next = room.live?.next;
    note.textContent = next ? T('Off air. {0} starts at {1}.', next.title, liveClock(next.s)) : T('Off air for a moment.');
    note.hidden = false; note.dataset.live = '1';
  } else if (note.dataset.live) { note.hidden = true; delete note.dataset.live; }
  renderParty();
}

function surf(step) {
  const next = liveView.neighbour(liveChannelId(), step);
  if (next) tuneIn(next.id);
}
// Keys on a channel: PageUp/PageDown (or [ ]) surf, digits pick a channel number, Backspace goes back to the last one,
// G opens the guide. Play, pause and seeking keys do nothing: it's live.
function liveKey(key) {
  if (key === 'PageUp' || key === ']') { surf(-1); return true; }
  if (key === 'PageDown' || key === '[') { surf(1); return true; }
  if (key === 'Backspace') { if (lastChannel) tuneIn(lastChannel); return true; }
  if (key === 'g') { openGuide(); return true; }
  if (/^[0-9]$/.test(key)) {
    liveDigits = (liveDigits + key).slice(-3);
    osd(liveDigits);
    clearTimeout(liveDigitsTimer);
    liveDigitsTimer = setTimeout(() => {
      const c = liveView.byNumber(Number(liveDigits));
      liveDigits = '';
      if (c) tuneIn(c.id); else toast(T('There’s no channel with that number.'));
    }, 1100);
    return true;
  }
  return [' ', 'k', 'j', 'l', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key);
}
async function openGuide() {
  closeTopOverlay();
  await setView('live');
}
// "Watch on demand" and "Watch from start": the same video in the normal player, which saves a resume point.
async function leaveLive(fromStart) {
  if (!current?.live) return;
  const media = { ...current, live: undefined };
  delete media.live;
  const at = fromStart ? 0.01 : video.currentTime;
  if (!state.library.some((f) => f.mediaKey && f.mediaKey === media.mediaKey)) {
    try { await api('/api/library/add', jsonPost({ ids: [media.id] })); loadLibrary().catch(() => {}); } catch { /* still plays */ }
  }
  await loadPlayerMedia({ kind: 'lib', id: media.id, key: media.id, mediaKey: media.mediaKey, title: media.title, filmTitle: media.filmTitle,
    season: media.season, episode: media.episode, episodeName: media.episodeName, done: true }, { startAt: at });
  if (!fromStart) toast(T('It’s in Continue watching now.'));
}

function renderLiveStrip() {
  liveChat.update(party); // livechat: the channel's chat panel follows the strip
  const strip = $('#live-strip');
  const info = party?.state.live;
  if (strip.hidden !== !info) requestAnimationFrame(layoutSubs);
  strip.hidden = !info;
  if (!info) return;
  const ch = info.channel || {};
  // friends: Restrict. Restricted viewers see how many are watching, not who; restricted people's faces stay out.
  const { shown, count } = liveWatchers(party.state, state.me, watchClient);
  const now = info.now, next = info.next;
  const done = now ? Math.min(1, Math.max(0, (Date.now() - now.s) / (now.e - now.s))) : 0;
  const sig = JSON.stringify([ch.id, now?.s, next?.s, count, shown.map((m) => [m.name, m.avatar]), Math.round(done * 200)]);
  if (strip.dataset.sig === sig) return;
  strip.dataset.sig = sig;
  const button = (label, onclick, cls = 'chip') => h('button', { type: 'button', class: cls, onclick: (e) => { e.stopPropagation(); onclick(); } }, label);
  strip.replaceChildren(
    h('div', { class: 'live-strip-top' },
      h('span', { class: 'live-pill' }, h('i', { 'aria-hidden': 'true' }), T('Live')),
      h('b', { class: 'live-strip-channel' }, `${ch.number ?? ''} ${channelName(ch, state.me)}`.trim()),
      count > 1 ? h('span', { class: 'live-strip-faces', title: shown.length ? namesText(shown.map((m) => m.name)) : null }, shown.length ? people.faces(shown, { size: 24, max: 4 }) : null,
        h('small', {}, T('{0} watching', count))) : null,
      h('span', { class: 'live-surf' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('Previous channel'), onclick: (e) => { e.stopPropagation(); surf(-1); } }, '▲'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('Next channel'), onclick: (e) => { e.stopPropagation(); surf(1); } }, '▼'))),
    now ? h('div', { class: 'live-strip-now' },
      h('p', { class: 'live-strip-title' }, now.title, programmeLine(now, episodeLabel) ? h('span', {}, ` · ${programmeLine(now, episodeLabel)}`) : null),
      h('div', { class: 'live-strip-bar', style: `--done:${done}` }, h('i', {})),
      h('p', { class: 'live-strip-times muted' }, `${liveClock(now.s)}–${liveClock(now.e)}`,
        next ? h('span', {}, T('Next: {0} at {1}', [next.title, programmeLine(next, episodeLabel)].filter(Boolean).join(' · '), liveClock(next.s))) : null)) : null,
    h('div', { class: 'live-strip-actions' },
      button(T('Guide'), openGuide),
      liveChat.toggle, // livechat
      current?.id ? button(T('Watch from start'), () => leaveLive(true)) : null,
      current?.id ? h('button', { type: 'button', class: 'chip', title: T('Leaves the channel and keeps your spot'),
        onclick: (e) => { e.stopPropagation(); leaveLive(false); } }, T('Watch on demand')) : null));
}
setInterval(() => { if (party?.state.live && !playerEl.hidden) renderLiveStrip(); }, 15000);

async function hostWatchRoom() {
  if (!current || !['lib', 'part'].includes(current.kind) || party) return;
  if (onTvVersion || video.remote?.state === 'connected') { toast(T('Watch Together uses the browser player. Stop casting first.')); return; }
  const btn = $('#watch-btn'); btn.disabled = true;
  const media = current;
  try {
    const room = await api('/api/watch', jsonPost({ id: mediaId(current), clientId: watchClient, position: video.currentTime || 0 }));
    if (current !== media) { api(`/api/watch/${room.token}/leave`, jsonPost({ clientId: watchClient })).catch(() => {}); return; }
    const session = attachWatchRoom(room);
    await session.start();
    showPlayerUi();
    setWatchPanel(true); // straight to inviting people
  } catch (err) { leaveWatchRoom(); toast(err.message); }
  finally { btn.disabled = false; }
}

async function offerWatchRoom(token) {
  if (party?.state.token === token) { toast(T('You’re already in this room')); return; }
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) { toast(T('Invalid watch-room link')); return; }
  try {
    const preview = await api(`/api/watch/${token}/preview`, { signal: AbortSignal.timeout(10000) });
    let closed = false;
    const status = h('p', { class: 'muted', role: 'status' });
    const join = h('button', { class: 'play-btn room-join', onclick: async () => {
      if (join.disabled) return;
      join.disabled = true;
      join.textContent = T('Joining…');
      join.setAttribute('aria-busy', 'true');
      let joined = false;
      try {
        const room = await api(`/api/watch/${token}/join`, { ...jsonPost({ clientId: watchClient }), signal: AbortSignal.timeout(10000) });
        joined = true;
        if (closed) { api(`/api/watch/${token}/leave`, jsonPost({ clientId: watchClient })).catch(() => {}); return; }
        if (current) {
          await dismissTopOverlay(); // Invite first, then the existing player.
          if (current) await dismissTopOverlay();
          await openPlayer({ ...room.media, key: room.media.id, done: true }, { watchRoom: room });
        } else {
          // Replace the invite in-place: no pending history.back() can close the new player.
          await openPlayer({ ...room.media, key: room.media.id, done: true }, { watchRoom: room, replace: true });
        }
      } catch (err) {
        status.textContent = err.name === 'TimeoutError' ? T('Joining took too long. Please try again.') : err.message;
        if (joined && party?.state.token !== token) api(`/api/watch/${token}/leave`, jsonPost({ clientId: watchClient })).catch(() => {});
      } finally { join.disabled = false; join.textContent = T('Join and watch'); join.removeAttribute('aria-busy'); }
    } }, T('Join and watch'));
    const here = (preview.faces || []).filter((f) => f.name !== preview.host);
    const ticket = h('div', { class: 'room-ticket' },
      h('div', { class: 'room-sign', 'aria-hidden': 'true' }, h('span', { class: 'room-bulbs' }), h('span', { class: 'room-kicker' }, T('You’re invited')), h('span', { class: 'room-bulbs' })),
      h('div', { class: 'room-ticket-host' },
        h('span', { class: 'room-member-face' }, people.face({ name: preview.host, avatar: preview.hostAvatar }, { size: 64 }),
          h('span', { class: 'room-crown', 'aria-hidden': 'true' }, icon('crown'))),
        h('div', {},
          h('p', { class: 'room-ticket-title' }, [preview.media.title, episodeLabel(preview.media)].filter(Boolean).join(' · ')),
          h('p', { class: 'room-ticket-by' }, T('{0} is hosting', preview.host)))),
      preview.startsAt && h('p', { class: 'room-ticket-when' }, T('Starts {0}', startLabel(preview.startsAt)), h('small', {}, countdownText(preview.startsAt - Date.now()))),
      here.length > 0 && h('p', { class: 'room-ticket-here' }, people.faces(here, { size: 26, max: 5 }),
        h('span', {}, T('{0} {1} already here', namesText(here.map((f) => f.name)), here.length === 1 ? T('is') : T('are')))));
    $('#picker-body').replaceChildren(h('h2', { id: 'picker-title', class: 'sr-only' }, T('Watch together')), ticket,
      h('p', { class: 'muted room-ticket-note' }, preview.startsAt
        ? T('Join any time before it starts. There’s a countdown, and playback starts by itself for everyone in the room.')
        : T('Playback stays in step with everyone. Subtitles, volume and your own audio pick are just for you.')), join, status);
    pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => { closed = true; }));
  } catch (err) { toast(err.message); }
}

// Scan to sign in (src/signin-link.js): the QR on a computer's sign-in page or a TV opens Lilin as
// ?signin=<code>&on=web|tv. Nothing happens until you say yes here, after seeing what's asking and roughly where.
async function offerDeviceSignIn(rawCode, on, { rethrow = false } = {}) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (code.length < 6) return;
  let info;
  try { info = await api(`/api/tv/pair/info?code=${encodeURIComponent(code)}&on=${on === 'tv' || on === 'web' ? on : ''}`, { signal: AbortSignal.timeout(10000) }); }
  catch (err) { if (rethrow) throw err; toast(err.message); return; }
  const tv = info.on === 'tv';
  const { browser, os } = info.label || {};
  const what = tv ? T('The Lilin app on a TV') : browser && os ? T('{0} on {1}', browser, os) : browser || os || T('A web browser');
  const where = info.where?.home ? T('On your home network')
    : [info.where?.city, info.where?.country].filter(Boolean).join(', ') || T('Outside your home network');
  const status = h('p', { class: 'muted signin-ask-status', role: 'status' });
  const card = h('div', { class: 'signin-ask-device' },
    h('span', { class: 'signin-ask-icon' }, icon(tv ? 'tv' : 'laptop')),
    h('div', {}, h('p', { class: 'signin-ask-what' }, what), h('p', { class: 'signin-ask-where' }, where)));
  let left = info.expiresIn;
  const timer = h('span', { class: 'signin-ask-timer' });
  const tick = () => {
    timer.textContent = left > 0 ? T('Code expires in {0}', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`) : T('The code expired.');
    if (left <= 0) { clearInterval(clock); yes.disabled = true; }
    left--;
  };
  const yes = h('button', { class: 'play-btn signin-ask-yes', onclick: async () => {
    if (yes.disabled) return;
    yes.disabled = true; yes.setAttribute('aria-busy', 'true'); status.textContent = T('Signing in…');
    try {
      await api('/api/tv/pair/approve', { ...jsonPost({ code, on: info.on }), signal: AbortSignal.timeout(10000) });
      clearInterval(clock);
      sheet.classList.add('is-done'); yes.hidden = true; timer.hidden = true; no.textContent = T('Done');
      status.textContent = tv ? T('The TV is signed in as you.') : T('The computer is signed in as you. It opens Lilin by itself.');
    } catch (err) { status.textContent = err.message; yes.disabled = left <= 0; }
    finally { yes.removeAttribute('aria-busy'); }
  } }, tv ? T('Sign in the TV') : T('Sign in the computer'));
  const no = h('button', { class: 'chip signin-ask-no', onclick: () => dismissTopOverlay() }, T('Cancel'));
  const sheet = h('div', { class: 'signin-ask' },
    h('h2', { id: 'picker-title' }, tv ? T('Sign in a TV as you?') : T('Sign in a computer as you?')),
    card,
    h('p', { class: 'muted signin-ask-note' }, T('Only say yes if it’s in front of you. Whoever shows this code gets into Lilin as you.')),
    timer, h('div', { class: 'signin-ask-actions' }, yes, no), status);
  const clock = setInterval(tick, 1000); tick();
  $('#picker-body').replaceChildren(sheet);
  pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), () => clearInterval(clock)));
}

function setWatchPanel(open) {
  watchPanelOpen = Boolean(open && party);
  if (watchPanelOpen) mountRoomInvite();
  if (watchPanelOpen) { partyUnread = 0; requestAnimationFrame(() => { const log = $('#chat-log'); log.scrollTop = log.scrollHeight; }); }
  renderParty(); showPlayerUi();
}

// ---- Watch Together: chat, reactions and the countdown to a planned start ----
function renderChatLog() {
  const log = $('#chat-log');
  const chat = party?.chat || [];
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.replaceChildren(...chat.map((m, i) => social.chatLine(m, m.from === watchClient, chat[i - 1])));
  log.hidden = !log.childElementCount;
  $('#chat-empty').hidden = Boolean(log.childElementCount);
  if (nearBottom || chat.at(-1)?.from === watchClient) log.scrollTop = log.scrollHeight;
}
function partyChat(message, session) {
  if (session?.state.live) { liveChat.message(message, session); return; } // livechat
  renderChatLog();
  if (!message || message.from === watchClient) return;
  if (!watchPanelOpen) {
    social.floatMessage($('#chat-layer'), message);
    partyUnread++; renderParty();
  }
}
$('#reaction-bar').append(...REACTIONS.map((emoji) => h('button', { type: 'button', class: 'reaction-btn', 'aria-label': T('React {0}', emoji),
  onclick: (e) => {
    if (!party) return;
    const b = e.currentTarget; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    social.burst($('#reaction-layer'), emoji, ''); party.react(emoji);
  } }, emoji)));
$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !party) return;
  input.value = '';
  try { await party.say(text); } catch (err) { input.value = text; toast(err.message); }
});
let countdownTimer = null;
function updatePartyCountdown() {
  const el = $('#party-countdown');
  const left = party?.startsIn;
  playerEl.classList.toggle('party-waiting', left != null && left > 0);
  if (left == null || left <= 0) {
    el.hidden = true; clearInterval(countdownTimer); countdownTimer = null;
    return;
  }
  const text = countdownText(left).replace(/^in /, '');
  const here = party.state.members.filter((m) => m.id !== watchClient);
  const hereKey = here.map((m) => `${m.name}|${m.avatar}`).join(',');
  if (el.dataset.blocked !== String(party.blocked) || el.dataset.here !== hereKey || !el.firstChild) {
    const seen = new Set();
    const faces = here.filter((m) => !seen.has(m.name) && seen.add(m.name));
    el.replaceChildren(
      h('div', { class: 'room-sign', 'aria-hidden': 'true' }, h('span', { class: 'room-bulbs' }), h('span', { class: 'room-kicker' }, T('Watch party starts in')), h('span', { class: 'room-bulbs' })),
      h('strong', { class: 'party-countdown-time' }, text),
      h('span', { class: 'party-countdown-title' }, [current?.filmTitle || current?.title, current && episodeLabel(current)].filter(Boolean).join(' · ')),
      faces.length ? h('span', { class: 'party-countdown-here' }, people.faces(faces, { size: 28, max: 5 }),
        h('span', {}, T('{0} {1} here', namesText(faces.map((m) => personName(m))), faces.length === 1 ? T('is') : T('are'))))
        : h('span', { class: 'party-countdown-here muted' }, T('Nobody else is here yet')),
      party.blocked ? h('button', { type: 'button', class: 'play-btn', onclick: () => party?.unlock() }, icon('play'), T('Join playback'))
        : h('span', { class: 'muted' }, party.isHost ? T('Playback starts by itself. You can start early from the room.') : T('You’re ready. Playback starts by itself.')));
    el.dataset.blocked = String(party.blocked); el.dataset.here = hereKey;
  }
  const time = el.querySelector('.party-countdown-time');
  if (time && time.textContent !== text) time.textContent = text;
  el.hidden = false;
  countdownTimer ||= setInterval(() => { if (!party?.startsIn || party.startsIn <= 0) { party?.pulse(); } updatePartyCountdown(); }, 1000);
}

// ---- Lilin Wrapped: a story of slides over everything; tap or arrow keys to move ----
async function openWrapped(year, opener) {
  let data;
  try { data = await api(`/api/me/wrapped?year=${year}`); } catch (err) { toast(err.message); return; }
  const slides = social.wrappedSlides(data, { name: state.me?.name });
  let at = 0;
  // The last slide's actions sit above the tap areas: share the year as a picture.
  const share = h('button', { type: 'button', class: 'play-btn wr-share', onclick: async () => {
    share.disabled = true;
    try {
      const how = await social.shareWrapped(data, { name: state.me?.name });
      if (how === 'saved') toast(T('Saved your Wrapped picture'));
    } catch (err) { toast(err.message); }
    finally { share.disabled = false; }
  } }, icon('share'), T('Share your year'));
  const actions = !data.empty && h('div', { class: 'wr-actions' }, share);
  const bars = h('div', { class: 'wr-bars', 'aria-hidden': 'true' }, slides.map(() => h('i')));
  const stage = h('div', { class: 'wr-stage', 'aria-live': 'polite' });
  const years = data.years?.filter((y) => y !== year) || [];
  const close = h('button', { type: 'button', class: 'icon-btn wr-close', 'aria-label': T('Close Wrapped'), onclick: closeTopOverlay }, icon('back'));
  const prev = h('button', { type: 'button', class: 'wr-tap wr-prev', 'aria-label': T('Previous') });
  const next = h('button', { type: 'button', class: 'wr-tap wr-next', 'aria-label': T('Next') });
  const el = h('div', { class: 'wrapped', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('Lilin Wrapped {0}', year), tabindex: '-1' },
    bars, close, stage, prev, next, actions,
    years.length > 0 && h('div', { class: 'wr-years' }, years.map((y) => h('button', { type: 'button', class: 'chip', onclick: async () => {
      await dismissTopOverlay(); openWrapped(y, opener);
    } }, String(y)))));
  const show = (i) => {
    at = Math.max(0, Math.min(slides.length - 1, i));
    stage.replaceChildren(slides[at]);
    [...bars.children].forEach((b, n) => b.classList.toggle('done', n <= at));
    el.dataset.slide = slides[at].className.split(' ').find((c) => /^wr-[a-z]$/.test(c)) || '';
    // A backdrop behind slides that have one (show of the year, the binge, Lilin's favourite).
    const img = slides[at].dataset.img;
    if (img) el.style.setProperty('--wr-img', `url("${img}")`);
    el.classList.toggle('has-img', Boolean(img));
    const end = Boolean(slides[at].dataset.end);
    el.classList.toggle('at-end', end);
    if (end && !data.empty) { try { localStorage.setItem('lilin:wrappedSeen', String(year)); } catch { /* private mode */ } }
  };
  prev.onclick = () => show(at - 1);
  next.onclick = () => (at === slides.length - 1 ? closeTopOverlay() : show(at + 1));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next.onclick(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
  });
  let startX = null;
  el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX; startX = null;
    if (Math.abs(dx) > 50) { if (dx < 0) next.onclick(); else show(at - 1); }
  });
  document.body.append(el);
  document.documentElement.classList.add('wrapped-on');
  show(0);
  requestAnimationFrame(() => { el.classList.add('open'); el.focus(); });
  pushOverlay(() => {
    el.classList.remove('open'); document.documentElement.classList.remove('wrapped-on');
    setTimeout(() => el.remove(), 250); opener?.focus({ preventScroll: true });
  });
}

// ---- planned watch parties ----
const partyLink = (token) => `${location.origin}/c/w/${token}`;
const partyTitle = (m) => [m.filmTitle || m.title, episodeLabel(m)].filter(Boolean).join(' · ');
// Live's top block, Watch with someone: Pick together (start one, or get back to one going on) and the parties you
// planned or joined, with a countdown. Parties are planned from a Pick together match (match.js) or started on the
// spot in the player; this block lists them: Join, Copy link, Cancel.
const together = { el: null, timer: 0 };
function liveTogether() { together.el ||= h('section', { class: 'together', 'aria-labelledby': 'together-head' }); return together.el; }
// The Pick together tile: the same three states as Discover's card.
function pickTile(p) {
  let title = T('Can’t agree on what to watch?'), sub = T('Pick together: everyone swipes, the first shared yes wins.'), who = null;
  if (p?.invited) {
    title = p.type === 'tv' ? T('{0} wants to pick a show with you', p.host?.name || '') : T('{0} wants to pick a film with you', p.host?.name || '');
    sub = T('Join and start swiping'); who = people.faces([p.host], { size: 40 });
  } else if (p) {
    title = p.mine ? T('Your pick is still going') : T('{0}’s pick is still going', p.host?.name || '');
    sub = p.matches ? (p.matches === 1 ? T('1 match so far') : T('{0} matches so far', p.matches)) : T('Carry on swiping');
    who = people.faces(p.members, { size: 40, max: 3 });
  }
  return h('button', { type: 'button', class: `party-card together-pick${p ? ' is-going' : ''}`, onclick: () => (p ? pickUi.openPick(p.id) : pickUi.open()) },
    who || h('span', { class: 'together-art', 'aria-hidden': 'true' }, icon('party')),
    h('span', { class: 'party-text' }, h('strong', {}, title), h('span', { class: 'muted' }, sub)),
    h('span', { class: 'together-go', 'aria-hidden': 'true' }, '›'));
}
let partiesRequest = null;
async function loadParties() {
  const el = liveTogether();
  partiesRequest ||= Promise.all([api('/api/watch/parties'), api('/api/match').catch(() => ({ picks: [] }))]).finally(() => { partiesRequest = null; });
  let parties, picks;
  try { const [a, b] = await partiesRequest; parties = a.parties || []; picks = b.picks || []; } catch { if (!el.childElementCount) el.replaceChildren(); return; }
  const cards = social.partyCards(parties, {
    label: partyTitle,
    join: (p) => offerWatchRoom(p.token),
    copy: (p) => copyWithToast(partyLink(p.token), T('Invite copied. Everyone uses their usual Lilin sign-in.')),
    cancel: async (p, btn) => {
      if (!confirm(T('Cancel the watch party for {0}? The invite stops working.', partyTitle(p.media)))) return;
      btn.disabled = true;
      try { await api(`/api/watch/${p.token}/cancel`, jsonPost({})); loadParties(); }
      catch (err) { btn.disabled = false; toast(err.message); }
    },
  });
  el.replaceChildren(h('h3', { class: 'live-sub', id: 'together-head' }, T('Watch with someone')),
    h('ul', { class: 'party-list' }, h('li', {}, pickTile(picks[0])), ...cards.items));
  clearInterval(together.timer);
  if (parties.length) together.timer = setInterval(() => { if (el.isConnected && !el.closest('[hidden]')) cards.tick(); }, 1000);
}
$('#watch-btn').addEventListener('click', () => { if (party) setWatchPanel(!watchPanelOpen); else hostWatchRoom(); });
$('#watch-hide').addEventListener('click', () => { setWatchPanel(false); $('#watch-btn').focus(); });
$('#watch-leave').addEventListener('click', () => { leaveWatchRoom(); video.pause(); });
// Ask people (invite.js, Room): people with Watch Together invites on get a notification that opens the room; the
// link (/c/w/ shows a preview in Discord and other chats, then forwards to /?watch=) works for anyone signed in.
// Drawn once per room, when its panel first opens.
const inviteList = $('#watch-invite-list');
function mountRoomInvite() {
  const token = party?.state.token;
  if (!token || inviteList.dataset.token === token) return;
  inviteList.dataset.token = token;
  invite.mount(inviteList, { kind: 'room', title: false, token, clientId: watchClient, live: Boolean(party.state.live) });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && party) { party.clock().then(() => party?.pulse()).catch(() => {}); } });

function saveProgress(force = false) {
  countPlayed();
  // Live TV counts as watching (Wrapped) but leaves Continue watching alone, until "Keep watching".
  if (current?.live) {
    if (!current.ready || !video.duration || !isFinite(video.duration)) return;
    const now = Date.now();
    if (!force && now - lastPush < 15000) return;
    lastPush = now;
    const watched = Math.round(playedSince * 10) / 10;
    playedSince = 0;
    if (watched > 0) api('/api/me/progress', { ...jsonPost({ ref: progressRef(current), time: video.currentTime, duration: video.duration,
      watched, about: watchAbout(current), room: party?.state.token || undefined, live: true }), keepalive: true }).catch(() => {});
    return;
  }
  if (plainMedia(current) && current.kind !== 'part') return; // clips and note videos have no resume point
  if (!current?.ready || !sourceIsCurrent(current) || !video.duration || !isFinite(video.duration)) return;
  const now = Date.now();
  if (!force && now - lastSave < 5000) return;
  lastSave = now;
  // Treat as finished near the end, or once Next episode was pressed (even with long credits left).
  const done = current.nextPressed || video.duration - video.currentTime < 90;
  try {
    if (done) localStorage.removeItem(resumeKey(current));
    else localStorage.setItem(resumeKey(current), JSON.stringify({ time: video.currentTime, duration: video.duration }));
  } catch { /* storage full or blocked */ }
  // The server copy (other devices) is updated less often, and always on pause and close.
  if (!force && now - lastPush < 15000) return;
  lastPush = now;
  const ref = progressRef(current);
  // Started by the Next episode countdown and nobody has pressed or tapped anything since: maybe asleep, so the
  // server doesn't count it as finished (Up next stays on it).
  const auto = autoChain > 0;
  if (done) delete state.progress[ref];
  if (done && !auto) { noteFinished(current, now); rightNow.played(current); } // Right now: no longer "ready"
  else state.progress[ref] = { time: video.currentTime, duration: video.duration, at: now };
  invalidateLibraryProgress();
  const watched = Math.round(playedSince * 10) / 10;
  playedSince = 0;
  api('/api/me/progress', { ...jsonPost({ ref, time: done ? null : video.currentTime, duration: video.duration,
    watched, about: watchAbout(current), room: party?.state.token || undefined, auto: auto || undefined }), keepalive: true }).catch(() => {});
}
let lastPush = 0;

// Watch time for Wrapped and Popular on Lilin: seconds the video really played (not seeking,
// not paused, not a tab asleep in the background), sent with each progress save.
let playedSince = 0, playTick = null;
function countPlayed() {
  const now = Date.now();
  if (playTick != null && !video.paused && !video.seeking) {
    const dt = (now - playTick) / 1000;
    if (dt > 0 && dt < 3) playedSince += dt;
  }
  playTick = video.paused ? null : now;
}
const watchAbout = (f) => ({ titleKey: titleKeyOf(f.season == null && f.tmdbId ? { tmdbId: f.tmdbId } : f) || undefined,
  title: f.filmTitle || f.canonicalTitle || f.title || f.name || '', season: f.season ?? null, episode: f.episode ?? null });

const mediaId = (f) => (f.kind === 'lib' || f.kind === 'part' ? f.id || f.key : f.hash || f.key);
// Clips and note videos play in the player's plain mode: no subtitles, audio choices, casting,
// Watch Together, Up next or resume points.
// A video still downloading (Play now) plays the same way until the finished file is there, but keeps its resume point.
function plainMedia(f) { return f?.kind === 'clip' || f?.kind === 'note' || f?.kind === 'part' || f?.kind === 'moment'; } // moment: friends
const sourceIsCurrent = (f) => Boolean(f) && (f.hlsPlayer ? true : video.currentSrc === f.sourceUrl);

// ---- subtitles ----
// ---------- AirPlay / Chromecast from the browser ----------
// Safari hands the video URL to the Apple TV, which then streams straight from the server
// (full quality; the phone just acts as a remote). Signed /play/ links make that possible
// through Cloudflare Access. Chrome on Android does the same with Chromecast.
const airplayBtn = $('#airplay-btn');
const hasAirPlay = 'WebKitPlaybackTargetAvailabilityEvent' in window;
const hasRemotePlayback = !hasAirPlay && 'remote' in HTMLMediaElement.prototype;
const canCastFromBrowser = hasAirPlay || hasRemotePlayback;
let remoteWatchId = null;
let onTvVersion = false;   // AirPlay is playing the TV version (original audio)
let castWatch = null;
let castGeneration = 0;

airplayBtn.setAttribute('aria-label', hasAirPlay ? 'AirPlay' : T('Cast to a TV'));
airplayBtn.addEventListener('click', () => {
  airplayBtn.classList.remove('is-hint');
  if (hasAirPlay) video.webkitShowPlaybackTargetPicker();
  else if (hasRemotePlayback) video.remote.prompt().catch(() => { /* dismissed */ });
});
if (hasAirPlay) {
  video.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
    airplayBtn.hidden = Boolean(party) || e.availability !== 'available';
  });
  video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => onWireless(video.webkitCurrentPlaybackTargetIsWireless));
}
if (hasRemotePlayback) {
  video.remote.addEventListener('connect', () => onWireless(true));
  video.remote.addEventListener('disconnect', () => onWireless(false));
}

function watchCastTargets() {
  if (!hasRemotePlayback || !current) return; // Safari reports availability through its own event
  const session = current;
  const token = castWatch = {};
  video.remote.watchAvailability((available) => {
    if (current === session && castWatch === token) airplayBtn.hidden = Boolean(party) || !available;
  }).then((id) => {
    if (current !== session || castWatch !== token) video.remote.cancelWatchAvailability(id).catch(() => {});
    else remoteWatchId = id;
  }).catch(() => { if (current === session && castWatch === token) airplayBtn.hidden = true; });
}

function resetCasting() {
  castGeneration++;
  castWatch = null;
  airplayBtn.hidden = true;
  airplayBtn.classList.remove('is-hint');
  if (hasRemotePlayback && remoteWatchId != null) video.remote.cancelWatchAvailability(remoteWatchId).catch(() => {});
  remoteWatchId = null;
  onTvVersion = false;
}

// Only the current source may restore its position. Replacing a source removes the previous
// metadata continuation, including AirPlay and audio-fix swaps still waiting for metadata.
let sourceMetadataHandler = null;
function setPlayerSource(url, session, onMetadata) {
  if (current !== session) return;
  if (sourceMetadataHandler) video.removeEventListener('loadedmetadata', sourceMetadataHandler);
  session.ready = false;
  const expected = session.sourceUrl = new URL(url, location.href).href;
  const handler = () => {
    if (sourceMetadataHandler !== handler || current !== session || video.currentSrc !== expected || video.readyState < 1) return;
    video.removeEventListener('loadedmetadata', handler);
    sourceMetadataHandler = null;
    session.ready = true;
    onMetadata?.();
    updateUpNext();
  };
  sourceMetadataHandler = handler;
  video.addEventListener('loadedmetadata', handler);
  dropBridge(session);
  video.src = url;
}

// A stream played through hls.js has no plain URL on the video element, so the check above doesn't apply.
function setHlsSource(hls, url, session, onMetadata) {
  if (current !== session) return;
  if (sourceMetadataHandler) video.removeEventListener('loadedmetadata', sourceMetadataHandler);
  session.ready = false;
  session.sourceUrl = null;
  const handler = () => {
    if (sourceMetadataHandler !== handler || current !== session || video.readyState < 1) return;
    video.removeEventListener('loadedmetadata', handler);
    sourceMetadataHandler = null;
    session.ready = true;
    onMetadata?.();
    updateUpNext();
  };
  sourceMetadataHandler = handler;
  video.addEventListener('loadedmetadata', handler);
  hls.loadSource(url);
  hls.attachMedia(video);
}

function capturePlayback(session = current) {
  if (!session?.ready && session?.sourceSnapshot) return { ...session.sourceSnapshot };
  return { url: video.currentSrc || video.src, time: video.currentTime || 0, playing: !video.paused && !video.ended,
    muted: video.muted, volume: video.volume, rate: video.playbackRate || 1 };
}
function restorePlayback(snapshot) {
  if (Number.isFinite(snapshot.time)) video.currentTime = Math.max(0, Math.min(snapshot.time, Number.isFinite(video.duration) ? Math.max(0, video.duration - .05) : snapshot.time));
  video.muted = snapshot.muted;
  if (canSetVolume) video.volume = snapshot.volume;
  video.playbackRate = snapshot.rate;
  applySubModes();
  if (party) { party.endSwap(); party.pulse(); party.sync(); }
  else if (snapshot.playing) video.play().catch(() => {});
  else video.pause();
}
function swapSource(url, onReady) {
  const session = current;
  if (!session) return;
  const snapshot = session.sourceSnapshot = capturePlayback(session);
  party?.beginSwap();
  setPlayerSource(url, session, () => {
    session.sourceSnapshot = null;
    restorePlayback(snapshot);
    onReady?.();
  });
}

// ---- live audio bridge ----
// A language the browser can't switch to by itself needs a one-language copy of the video, which takes minutes
// for a film. Meanwhile the live phone stream (phone-stream.js) plays that language from the same spot, starting
// in a second or two; the player moves to the full-quality copy once it's there. Safari plays HLS itself, other
// browsers through hls.js. session.bridge = { url, hls, track } while it plays.
const appleHls = () => playsHls() && 'webkitShowPlaybackTargetPicker' in video;
function bridgeAvailable() { return appleHls() || 'MediaSource' in window || 'ManagedMediaSource' in window || playsHls(); }
function dropBridge(session) {
  const bridge = session?.bridge;
  if (!bridge) return;
  session.bridge = null;
  if (!bridge.hls) return;
  if (session.hlsPlayer === bridge.hls) session.hlsPlayer = null;
  try { bridge.hls.destroy(); } catch { /* already gone */ }
}
async function attachBridge(session, url, onMetadata) {
  const Hls = appleHls() ? null : await loadHls().catch(() => null);
  if (current !== session) return false;
  if (!session.bridgeCleanup) {
    session.bridgeCleanup = true;
    session.abort.signal.addEventListener('abort', () => dropBridge(session), { once: true });
  }
  if (Hls?.isSupported()) {
    dropBridge(session);
    const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 60 });
    session.bridge = { url, hls, track: null };
    session.hlsPlayer = hls;
    let recoveries = 0;
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal || session.bridge?.hls !== hls) return;
      if (recoveries++ < 3 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (recoveries < 4 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else video.dispatchEvent(new Event('error'));
    });
    setHlsSource(hls, url, session, onMetadata);
    return true;
  }
  if (!playsHls()) return false;
  setPlayerSource(url, session, onMetadata);
  session.bridge = { url, hls: null, track: null };
  return true;
}
// The live stream picked for a slow connection (fitToConnection) on a browser without its own HLS: through hls.js.
// No hls.js: the file as it is, as before.
async function attachStream(session, url, onMetadata, f) {
  const Hls = await loadHls().catch(() => null);
  if (current !== session) return;
  if (!Hls?.isSupported()) {
    try {
      const link = await api(`/api/play-link?kind=${f.kind}&id=${encodeURIComponent(mediaId(f))}&variant=${baseVariant()}&quality=original`, { signal: session.abort.signal });
      session.quality = 'original';
      setPlayerSource(link.url, session, onMetadata);
    } catch (error) { if (current === session && error.name !== 'AbortError') showPlayerError(error.message, { title: T('Couldn’t start this video') }); }
    return;
  }
  const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 60 });
  session.hlsPlayer = hls;
  session.abort.signal.addEventListener('abort', () => { try { hls.destroy(); } catch { /* gone */ } }, { once: true });
  let recoveries = 0;
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (!data.fatal || session.hlsPlayer !== hls) return;
    if (recoveries++ < 3 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (recoveries < 4 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else video.dispatchEvent(new Event('error'));
  });
  setHlsSource(hls, url, session, onMetadata);
}
// Back to what played before a failed audio switch: the plain file, or the bridge it was on.
function restoreAudioSource(session, snapshot, bridge) {
  session.sourceSnapshot = snapshot;
  party?.beginSwap();
  const back = () => { session.sourceSnapshot = null; restorePlayback(snapshot); $('#player-error').hidden = true; };
  if (!bridge) { setPlayerSource(snapshot.url, session, back); return; }
  attachBridge(session, bridge.url, back).then((ok) => { if (ok && session.bridge) session.bridge.track = bridge.track; });
}

async function onWireless(on) {
  const generation = ++castGeneration;
  if (on && party) { leaveWatchRoom(); toast(T('Left Watch Together: casting is not synchronized.')); }
  const session = current;
  if (!session) return;
  if (on) cancelAudioIntent(session);
  renderAudioControls();
  renderQualityMenu();
  const note = $('#player-note');
  if (on) {
    note.textContent = T('Playing on your TV. The controls here work as a remote.');
    note.hidden = false;
  } else if (note.textContent.startsWith(T('Playing on your TV'))) {
    note.hidden = true;
  }
  // With AirPlay, switch to the TV version so the TV gets the original surround audio.
  // (Chromecast keeps the current version: changing the source would end the cast.)
  if (!hasAirPlay || on === onTvVersion) return;
  try {
    const link = await api(`/api/play-link?kind=${session.kind}&id=${encodeURIComponent(mediaId(session))}&variant=${on ? 'tv' : browserVariant()}`);
    if (current !== session || generation !== castGeneration) return;
    const tvCanPlay = ['mp4', 'm4v', 'mov'].includes(link.ext);
    if (on && (!tvCanPlay || link.name === session.browserName)) return; // nothing better to send
    swapSource(link.url, () => refreshAudioMetadata(session, true));
    onTvVersion = on;
    renderAudioControls();
  } catch { /* keep playing the current version */ }
}

const ccBtn = $('#cc-btn');
const ccMenu = $('#cc-menu');
let ccLangs = [];
let ccActive = null;
let ccSecond = null; // a second language shown with the first, smaller and above it
let subtitleGeneration = 0;
let secondGeneration = 0;

// Subtitles are drawn by the page (#player-subs) rather than the browser, so they stay inside the
// picture and move up out of the way while the controls are showing. The track runs in 'hidden'
// mode for that: its cues load and change, but the browser draws nothing. Where the page can't
// draw (iOS's own fullscreen player, picture-in-picture) the browser draws them instead.
const subsEl = $('#player-subs');
let nativeSubs = false;
let subTrack = null;
let secondTrack = null;

// The browser's own drawing (iOS fullscreen, picture-in-picture) shows one language: the first.
function applySubModes() {
  subTrack = secondTrack = null;
  for (const t of video.textTracks) {
    if (t.kind !== 'subtitles') continue;
    const first = Boolean(ccActive) && t.language === ccActive;
    const second = !first && Boolean(ccSecond) && t.language === ccSecond;
    if (party && (first || second)) offsetCues(t, party.offsets[t.language] || 0);
    t.mode = first ? (nativeSubs ? 'showing' : 'hidden') : second && !nativeSubs ? 'hidden' : 'disabled';
    if (first && !nativeSubs) subTrack = t;
    if (second && !nativeSubs) secondTrack = t;
  }
  if (subTrack) subTrack.oncuechange = renderCues;
  if (secondTrack) secondTrack.oncuechange = renderCues;
  renderCues();
}

// Cues placed at the top of the picture ({\an8} in the SRT, `line:0` in the VTT) stay at the top.
const cueAtTop = (c) => typeof c.line === 'number' && (c.snapToLines ? c.line >= 0 : c.line < 50);

// A cue broken into three or more short lines stacks up tall and narrow. Its line breaks become
// spaces (a dialogue line starting with "-" keeps its own line) and the text wraps across the width.
function widenCue(node) {
  const texts = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode);
  const all = texts.map((t) => t.data).join('');
  if (all.trim().split('\n').length < 3) return;
  let at = 0;
  for (const t of texts) {
    const start = at;
    at += t.data.length;
    t.data = t.data.replace(/\n/g, (m, i) => (/^\s*[-\u2010-\u2014]/.test(all.slice(start + i + 1)) ? m : ' '));
  }
}

function renderCues() {
  const [top, bottom] = subsEl.children;
  const active = (t) => (t?.activeCues ? [...t.activeCues] : []);
  const cues = active(subTrack), seconds = active(secondTrack);
  const draw = (list, second = false) => list.map((c) => {
    const text = h('span');
    if (typeof c.getCueAsHTML === 'function') text.append(c.getCueAsHTML()); // <i>, <b> and friends; never parsed as page HTML
    else text.textContent = c.text;
    widenCue(text);
    return h('div', { class: second ? 'sub-cue sub-second' : 'sub-cue' }, text);
  });
  // The second language sits just above the first, so the eye moves between them line by line.
  top.replaceChildren(...draw(cues.filter(cueAtTop)), ...draw(seconds.filter(cueAtTop), true));
  bottom.replaceChildren(...draw(seconds.filter((c) => !cueAtTop(c)), true), ...draw(cues.filter((c) => !cueAtTop(c))));
}

// iOS's own fullscreen player picks captions itself and often lands on "Auto", which hides
// subtitles in your own language. Re-select ours when it opens, and mirror any change the
// viewer makes there back to the CC button when it closes.
video.addEventListener('webkitbeginfullscreen', () => {
  nativeSubs = true;
  applySubModes();
  setTimeout(applySubModes, 500); // again, after the native player has applied its own choice
});
video.addEventListener('webkitendfullscreen', () => {
  const showing = [...video.textTracks].find((t) => t.kind === 'subtitles' && t.mode === 'showing');
  ccActive = showing ? showing.language : null;
  if (ccActive && ccActive === ccSecond) ccSecond = null;
  nativeSubs = inPip(); // iOS's player can hand straight over to picture in picture
  applySubModes();
  ccBtn.classList.toggle('is-on', Boolean(ccActive));
  ccMenu.querySelectorAll('.cc-item[role="menuitemradio"]').forEach((b, i) => {
    b.setAttribute('aria-checked', String(i === 0 ? !ccActive : ccLangs[i - 1]?.code === ccActive));
  });
});
// Picture in picture shows the browser's own captions. iPhones report it as a presentation mode change.
for (const event of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) {
  video.addEventListener(event, () => {
    if (video.webkitDisplayingFullscreen) return; // iOS's fullscreen player, handled above
    nativeSubs = inPip();
    applySubModes();
  });
}

function clearSubTracks() {
  subtitleGeneration++;
  secondGeneration++;
  video.querySelectorAll('track').forEach((t) => t.remove());
  ccActive = ccSecond = null;
  ccSync = null;
  clearTimeout(ccSyncTimer);
  applySubModes();
}
const subTrackEl = (code) => (code ? [...video.querySelectorAll('track')].find((t) => t.getAttribute('srclang') === code) : null);
// Drops the first language only; a second language stays on.
function dropFirstSub() {
  subtitleGeneration++;
  subTrackEl(ccActive)?.remove();
  ccActive = null;
  ccSync = null;
  clearTimeout(ccSyncTimer);
  applySubModes();
}
function dropSecondSub() {
  secondGeneration++;
  subTrackEl(ccSecond)?.remove();
  ccSecond = null;
  applySubModes();
}
function closeCcMenu() { ccMenu.hidden = true; ccBtn.setAttribute('aria-expanded', 'false'); }
ccBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = ccMenu.hidden;
  closePlayerMenus('cc');
  ccMenu.hidden = !open;
  ccBtn.setAttribute('aria-expanded', String(open));
  if (open) (ccMenu.querySelector('[aria-checked="true"]') || ccMenu.querySelector('button'))?.focus();
});
document.addEventListener('click', (e) => { if (!ccMenu.hidden && !ccMenu.contains(e.target)) closeCcMenu(); });

function renderCcMenu(f, session, message) {
  const items = [{ code: null, name: T('Off') }, ...ccLangs];
  // Two halves: the languages scroll on the left, the look and timing of the chosen one sit on the right.
  const langs = h('div', { class: 'cc-langs' },
    h('p', { class: 'cc-col-title' }, T('Language')),
    ...items.map((l) => h('button', {
      role: 'menuitemradio', class: 'cc-item', 'aria-checked': String(ccActive === l.code),
      onclick: () => pickPlayerSub(f, session, l),
    }, l.name)),
    ...(message ? [h('p', { class: 'cc-message' }, message)] : []));
  const settings = h('div', { class: 'cc-settings' },
    h('p', { class: 'cc-col-title' }, T('Subtitle settings')),
    ...(ccActive
      ? [...[secondSubRow(f, session)].filter(Boolean), ...subLookRows(), ...subSyncItems(f, session)]
      : [h('p', { class: 'cc-message' }, T('Pick a language to change the size, style and timing.'))]));
  ccMenu.classList.add('cc-split');
  ccMenu.replaceChildren(h('div', { class: 'cc-cols' }, langs, settings));
  ccBtn.classList.toggle('is-on', Boolean(ccActive));
}

// ---- subtitle timing ----
// The server lines downloaded subtitles up with the film in the background. While that runs the
// menu says so, and when the file changes the track is reloaded in place.
let ccSync = null;
let ccSyncTimer = null;
const SUB_SYNC_TEXT = {
  queued: T('Checking the timing…'),
  syncing: T('Checking the timing…'),
  ok: T('Timing checked: already in sync.'),
  unsure: T('Couldn’t check the timing automatically.'),
  exact: T('Made for this exact file.'),
  undone: T('Using the original timing.'),
  waiting: T('The timing is checked once the download has finished.'),
};
const subSyncBusy = (s) => s?.state === 'queued' || s?.state === 'syncing';
const fmtSubShift = (s) => `${Math.round(Math.abs(s) * 100) / 100} s ${s < 0 ? T('earlier') : T('later')}`;

function subSyncText(s) {
  if (s.state === 'failed') return T('Timing check failed: {0}', s.error || T('unknown error'));
  if (s.state === 'trusted') return s.growing ? T('From the video itself. More lines are added as it downloads.') : null;
  if (s.state !== 'synced') return SUB_SYNC_TEXT[s.state];
  if (s.replaced) return T('The first subtitles didn’t fit this video, so Lilin found ones that do.');
  return s.offset != null
    ? T('Timing fixed: lines moved {0}{1}{2}.', fmtSubShift(s.offset), s.ratio && s.ratio !== 1 ? T(', adjusted for frame rate') : '', s.parts > 1 ? T(', in {0} parts (the subtitles were made for a differently cut version)', s.parts) : '')
    : null;
}

// Manual offset: − shows lines earlier (they come after the speech), + later (they come too soon).
const NUDGES = [-1, -0.25, 0.25, 1];
function nudgeRow(manual, onNudge) {
  return h('div', { class: 'cc-nudge' },
    h('span', { class: 'cc-nudge-label' }, T('Subtitle offset'),
      h('b', {}, manual ? ` ${manual > 0 ? '+' : '−'}${Math.round(Math.abs(manual) * 100) / 100} s` : ' 0 s')),
    h('div', { class: 'cc-nudge-buttons' }, NUDGES.map((n) => h('button', {
      type: 'button', 'aria-label': T('Show subtitles {0} seconds {1}', Math.abs(n), n < 0 ? T('earlier') : T('later')), onclick: () => onNudge(n),
    }, `${n < 0 ? '−' : '+'}${Math.abs(n) === 0.25 ? '¼' : Math.abs(n)} s`))),
    h('span', { class: 'cc-nudge-hint' }, T('− earlier · + later')),
    manual ? h('button', { type: 'button', class: 'cc-nudge-reset', onclick: () => onNudge(-manual) }, T('Reset offset')) : null);
}

function subSyncItems(f, session) {
  if (party && ccActive) return [
    h('div', { class: 'cc-divider', role: 'separator' }),
    h('p', { class: 'cc-message' }, T('Only your subtitles change. Other viewers keep their own settings.')),
    nudgeRow(party.offsets[ccActive] || 0, (seconds) => {
      party.offsets[ccActive] = Math.round(((party.offsets[ccActive] || 0) + seconds) * 1000) / 1000;
      applySubModes(); renderCcMenu(f, session);
    }),
  ];
  const s = ccSync;
  if (!ccActive || !s) return [];
  const text = subSyncText(s);
  const lang = ccLangs.find((l) => l.code === ccActive);
  const action = (label, act) => h('button', { class: 'cc-item cc-action', onclick: () => subSyncAction(f, session, lang, act) }, label);
  return [
    h('div', { class: 'cc-divider', role: 'separator' }),
    text && h('p', { class: 'cc-message' }, text),
    !subSyncBusy(s) && nudgeRow(s.manual || 0, (n) => subSyncNudge(f, session, lang, n)),
    s.canUndo && s.offset != null && action(T('Undo timing fix'), 'undo'),
    s.canSync && action(['synced', 'ok', 'unsure'].includes(s.state) ? T('Check timing again') : T('Fix timing'), 'sync'),
  ].filter(Boolean);
}

// Taps are applied one after another, so quick repeated taps all count.
let nudgeChain = Promise.resolve();
function subSyncNudge(f, session, l, seconds) {
  const generation = subtitleGeneration;
  nudgeChain = nudgeChain.then(async () => {
    if (current !== session || generation !== subtitleGeneration || ccActive !== l.code) return;
    try {
      const result = await api('/api/subs/sync', jsonPost({ kind: f.kind, id: mediaId(f), lang: l.code, action: 'shift', seconds }));
      if (current !== session || generation !== subtitleGeneration || ccActive !== l.code) return;
      ccSync = result;
      reloadSubTrack(l);
      renderCcMenu(f, session);
    } catch (err) { if (current === session && generation === subtitleGeneration && ccActive === l.code) toast(err.message); }
  });
}

async function subSyncAction(f, session, l, act) {
  const generation = subtitleGeneration;
  try {
    const result = await api('/api/subs/sync', jsonPost({ kind: f.kind, id: mediaId(f), lang: l.code, action: act }));
    if (current !== session || generation !== subtitleGeneration || ccActive !== l.code) return;
    ccSync = result;
    if (act === 'undo') { reloadSubTrack(l); }
    renderCcMenu(f, session);
    if (subSyncBusy(ccSync)) watchSubSync(f, session, l, true);
  } catch (err) { if (current === session && generation === subtitleGeneration && ccActive === l.code) toast(err.message); }
}

async function watchSubSync(f, session, l, wasBusy = false, lastStamp = null) {
  const generation = subtitleGeneration;
  clearTimeout(ccSyncTimer);
  let s;
  try { s = await api(`/api/subs/sync?kind=${f.kind}&id=${encodeURIComponent(mediaId(f))}&lang=${l.code}`); } catch { return; }
  if (current !== session || generation !== subtitleGeneration || ccActive !== l.code) return;
  ccSync = s;
  // Read from a video that's still downloading: the server reads it again now and then; the track follows.
  const grew = lastStamp && s.stamp && s.stamp !== lastStamp;
  if (!subSyncBusy(s) && s.growing) ccSyncTimer = setTimeout(() => watchSubSync(f, session, l, false, s.stamp), 90000);
  if (subSyncBusy(s)) {
    ccSyncTimer = setTimeout(() => watchSubSync(f, session, l, true), 3000);
  } else if (grew || (wasBusy && ['synced', 'ok'].includes(s.state))) {
    reloadSubTrack(l);
  } else if (wasBusy && s.state === 'failed') {
    toast(T('Couldn’t check the subtitle timing'));
  }
  renderCcMenu(f, session);
}

// Swaps the track for a fresh copy of the same file.
function reloadSubTrack(l) {
  const old = video.querySelector(`track[srclang="${l.code}"]`);
  if (!old) return;
  const src = `${old.getAttribute('src').split('?')[0]}?v=${Date.now()}`;
  const track = h('track', { kind: 'subtitles', srclang: l.code, label: l.name, src, default: true });
  old.remove();
  video.append(track);
  applySubModes();
  track.addEventListener('load', applySubModes);
}

async function setupPlayerSubs(f, session) {
  clearSubTracks();
  closeCcMenu();
  ccBtn.hidden = true;
  let data;
  try { data = await api(`/api/subs/langs?kind=${f.kind}&id=${encodeURIComponent(mediaId(f))}`); } catch { return; }
  if (current !== session) return;
  ccLangs = data.languages;
  if (!ccLangs.length && !data.configured) return; // nothing local and no API key
  ccBtn.hidden = false;
  renderCcMenu(f, session, ccLangs.length ? null : (data.problem || T('No subtitles found for this.')));
  // Re-enable the last used language if it's already saved locally (no download quota used).
  // Or the language picked in Settings, which is fetched when it isn't saved yet.
  let pref = null;
  try { pref = localStorage.getItem('subs:lang'); } catch { /* blocked */ }
  const want = prefs().subLang;
  // Live TV: the language you turned on stays on when the channel moves to the next programme (fetched if need be).
  const saved = ccLangs.find((l) => l.code === pref && (l.saved || f.live)) || (want && pref !== '' && ccLangs.find((l) => l.code === want))
    // Anime (Japanese audio) for someone who never picked subtitles: the English ones it came with.
    || (data.anime && pref == null && !want && ccLangs.find((l) => l.code === 'en' && l.saved));
  if (!saved) return;
  await pickPlayerSub(f, session, saved, { quiet: true });
  // The second language comes back too, but only when it's already saved here (no download quota).
  let second = null;
  try { second = localStorage.getItem('subs:second'); } catch { /* blocked */ }
  const again = second && current === session && ccActive && secondChoices(ccLangs, ccActive).find((l) => l.code === second && l.saved);
  if (again) pickSecondSub(f, session, again, { quiet: true });
}

async function pickPlayerSub(f, session, l, { quiet = false } = {}) {
  if (current !== session) return;
  if (!quiet) closeCcMenu();
  try { localStorage.setItem('subs:lang', l.code || ''); } catch { /* blocked */ }
  // Picking the language that was second makes it the first; there's no point showing it twice.
  if (l.code && l.code === ccSecond) { dropSecondSub(); try { localStorage.setItem('subs:second', ''); } catch { /* blocked */ } }
  dropFirstSub();
  const generation = subtitleGeneration;
  if (!l.code) { dropSecondSub(); renderCcMenu(f, session); return; } // Off means no text at all
  try {
    const { url } = await api('/api/subs/fetch', jsonPost({ kind: f.kind, id: mediaId(f), lang: l.code }));
    if (current !== session || generation !== subtitleGeneration) return;
    const track = h('track', { kind: 'subtitles', srclang: l.code, label: l.name, src: url, default: true });
    video.append(track);
    ccActive = l.code;
    applySubModes();
    track.addEventListener('load', applySubModes);
    l.saved = true;
    renderCcMenu(f, session);
    watchSubSync(f, session, l);
  } catch (err) {
    if (current !== session || generation !== subtitleGeneration) return;
    renderCcMenu(f, session, err.message);
    if (!quiet) toast(err.message);
  }
}

// ---- second language ----
// Two languages at once, for learning one or watching with someone who reads another. The second
// one is drawn smaller, in a warm tint, just above the first. Its timing follows the first's fixes
// only where the files already agree; it has no timing controls of its own.
async function pickSecondSub(f, session, l, { quiet = false } = {}) {
  if (current !== session) return;
  if (!quiet) { try { localStorage.setItem('subs:second', l.code || ''); } catch { /* blocked */ } }
  dropSecondSub();
  const generation = secondGeneration;
  if (!l.code || l.code === ccActive) { renderCcMenu(f, session); return; }
  try {
    const { url } = await api('/api/subs/fetch', jsonPost({ kind: f.kind, id: mediaId(f), lang: l.code }));
    if (current !== session || generation !== secondGeneration || l.code === ccActive) return;
    const track = h('track', { kind: 'subtitles', srclang: l.code, label: l.name, src: url });
    video.append(track);
    ccSecond = l.code;
    applySubModes();
    track.addEventListener('load', applySubModes);
    l.saved = true;
    renderCcMenu(f, session);
  } catch (err) {
    if (current !== session || generation !== secondGeneration) return;
    renderCcMenu(f, session, err.message);
    if (!quiet) toast(err.message);
  }
}
function secondSubRow(f, session) {
  const choices = secondChoices(ccLangs, ccActive);
  if (!choices.length) return null;
  const pick = h('select', { class: 'cc-select', 'aria-label': T('Second subtitle language'),
    onchange: () => pickSecondSub(f, session, choices.find((l) => l.code === pick.value) || { code: null, name: T('Off') }) },
  h('option', { value: '' }, T('Off')), ...choices.map((l) => h('option', { value: l.code }, l.name)));
  pick.value = ccSecond || '';
  return h('label', { class: 'cc-row' }, h('span', { class: 'cc-nudge-label' }, T('Second')), pick);
}

// ---- audio compatibility ----
const CODEC_NAMES = { ac3: 'Dolby Digital', eac3: 'Dolby Digital Plus', dts: 'DTS', truehd: 'Dolby TrueHD', mlp: 'Dolby TrueHD' };
const CODEC_MIME = { ac3: 'ac-3', eac3: 'ec-3', opus: 'opus', flac: 'flac', vorbis: 'vorbis', alac: 'alac' };
const browserPlays = (codec) => Boolean(CODEC_MIME[codec] && video.canPlayType(`audio/mp4; codecs="${CODEC_MIME[codec]}"`));

// Extra codecs this browser can decode, reported to the server.
const playsHevc = () => Boolean(video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'));
// Browsers that play HEVC get the original HEVC video; the rest get the H.264 browser copy when there is one.
const baseVariant = () => (playsHevc() ? 'browser-hevc' : 'browser');
// While the phone-quality stream plays, follow-up links (audio choice, back from AirPlay) stay on it.
const phoneQuality = (session = current) => (session?.quality === '1080' || session?.quality === '720' ? session.quality : null);
function browserVariant() { const q = phoneQuality(); return q ? `phone${q}` : baseVariant(); }
const extraPlayable = () => [...Object.keys(CODEC_MIME).filter(browserPlays), playsHevc() && 'hevc', phoneQuality() && 'phone'].filter(Boolean).join(',');

// ---- audio selection ----
const audioBtn = $('#sync-btn');
const audioMenu = $('#sync-menu');
const audioStatus = $('#audio-status');
let audioWatch = null;
let audioMenuSignature = '';
let audioRows = new Map();
let audioMessage = null;
let audioRetry = null;
const audioCasting = () => Boolean(onTvVersion || video.webkitCurrentPlaybackTargetIsWireless || video.remote?.state === 'connected');
// Casting only: in Watch Together everyone picks their own language (the host's is the room's default).
const audioSuppressed = () => audioCasting();
function closeAudioMenu() { audioMenu.hidden = true; audioBtn.setAttribute('aria-expanded', 'false'); }
function announceAudio(message) { if (audioStatus.textContent !== message) audioStatus.textContent = message; }
function audioLabel(a, index) { return audioChoices(a.tracks).find(t => t.index === index)?.label || T('Audio'); }
function renderAudioControls() {
  const a = current?.audio;
  audioBtn.hidden = !a || a.tracks.length < 2 || audioSuppressed() || nativeSubs;
  if (audioBtn.hidden) closeAudioMenu();
  audioBtn.setAttribute('aria-label', a?.activeLabel ? T('Audio: {0}', a.activeLabel) : T('Audio'));
  if (!a) return;
  const choices = audioChoices(a.tracks);
  const signature = JSON.stringify([a.source, choices]);
  if (signature !== audioMenuSignature) {
    const focused = audioMenu.contains(document.activeElement) ? document.activeElement?.dataset?.audioIndex : null;
    audioMenuSignature = signature;
    audioRows = new Map();
    const rows = choices.map(track => {
      const status = h('span', { class: 'audio-row-status' });
      const button = h('button', { type: 'button', role: 'menuitemradio', class: 'cc-item', tabindex: '-1',
        'data-audio-index': track.index, onclick: () => { if (current?.audio) current.audio.ownPick = true; selectAudioTrack(track.index); } }, h('span', {}, track.label), status);
      audioRows.set(track.index, { button, status });
      return button;
    });
    audioMessage = h('p', { class: 'cc-message audio-message', hidden: true });
    audioRetry = h('button', { type: 'button', role: 'menuitem', class: 'cc-item audio-retry', tabindex: '-1', hidden: true,
      onclick: () => { if (current?.audio?.failed != null) selectAudioTrack(current.audio.failed); } }, T('Retry'));
    audioMenu.replaceChildren(h('p', { class: 'audio-title' }, T('Audio')), ...rows, audioMessage, audioRetry);
    if (focused != null && !audioMenu.hidden) audioRows.get(Number(focused))?.button.focus({ preventScroll: true });
  }
  for (const [index, row] of audioRows) {
    row.button.setAttribute('aria-checked', String(index === a.actual));
    const text = index === a.pending ? a.swap ? T('Switching…') : T('Preparing…') : index === a.upgrading ? T('Up to 1080p') : '';
    if (row.status.textContent !== text) row.status.textContent = text;
  }
  const message = a.error || (a.pending != null ? a.swap ? T('Switching to {0} audio…', audioLabel(a, a.pending)) : T('Preparing {0} audio. Playback continues.', audioLabel(a, a.pending))
    : a.upgrading != null ? T('{0} audio plays at up to 1080p for now. Full quality comes back by itself in a few minutes.', audioLabel(a, a.upgrading)) : '');
  if (audioMessage.textContent !== message) audioMessage.textContent = message;
  audioMessage.hidden = !message;
  audioRetry.hidden = !a.error || a.failed == null;
}
audioBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = audioMenu.hidden;
  closePlayerMenus('audio');
  renderAudioControls();
  if (audioBtn.hidden) return;
  audioMenu.hidden = !open;
  audioBtn.setAttribute('aria-expanded', String(open));
  if (open) (audioMenu.querySelector('[aria-checked="true"]') || audioMenu.querySelector('button'))?.focus();
});
audioMenu.addEventListener('keydown', e => {
  const items = [...audioMenu.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled);
  const index = items.indexOf(document.activeElement);
  const target = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
  if (target != null && items.length) { e.preventDefault(); items[target].focus(); }
});
audioMenu.addEventListener('focusout', () => setTimeout(() => { if (!audioMenu.contains(document.activeElement)) closeAudioMenu(); }, 0));
document.addEventListener('click', e => { if (!audioMenu.hidden && !audioMenu.contains(e.target)) closeAudioMenu(); });

function cancelAudioIntent(session, restore = true) {
  const a = session?.audio;
  if (!a) return;
  a.generation++;
  a.abort?.abort();
  a.abort = null;
  a.pending = null;
  a.upgrading = null;
  if (a.intentUserChoice != null) a.userChoice = a.intentUserChoice;
  a.intentUserChoice = null;
  const swap = a.swap;
  a.swap = null;
  swap?.cancel(restore);
}
function recoverAudioOwnership(session, a) {
  if (a.intentUserChoice != null) a.userChoice = a.intentUserChoice;
  a.intentUserChoice = null;
  if (current === session && !a.userChoice && !audioSuppressed()) watchAudio(session, session);
}
function resetAudioSelection(session) {
  cancelAudioIntent(session, false);
  audioMenuSignature = '';
  audioRows.clear();
  closeAudioMenu();
  audioBtn.hidden = true;
  announceAudio('');
}
function installAudioMetadata(session, data, reset = false) {
  if (current !== session || !data.audioSource || !Array.isArray(data.tracks)) return;
  const tracks = data.tracks.filter(t => Number.isSafeInteger(t.index) && Number.isSafeInteger(t.audioIndex));
  let a = session.audio;
  if (!a) a = session.audio = { generation: 0, source: data.audioSource, actual: data.defaultAudio,
    tracks, default: data.defaultAudio, pending: null, failed: null, error: '', usingFallback: false, sourceMatches: true, userChoice: false };
  else if (a.source !== data.audioSource || reset) {
    const changedChoice = a.userChoice && !reset;
    cancelAudioIntent(session);
    a.source = data.audioSource;
    a.actual = changedChoice ? null : data.defaultAudio;
    a.usingFallback = changedChoice && a.usingFallback;
    a.sourceMatches = !changedChoice;
    a.error = changedChoice ? T('Audio tracks changed. Choose a track again.') : '';
    a.failed = null;
    if (!changedChoice) { a.userChoice = false; a.activeLabel = null; }
  }
  a.tracks = tracks;
  a.default = data.defaultAudio;
  if (a.actual != null) a.activeLabel = audioLabel(a, a.actual);
  renderAudioControls();
  reflectNativeAudio();
  followRoomAudio();
}
// Watch Together: the host's language becomes the room's (party.state.audioLang). Everyone who hasn't picked
// their own in the menu switches to it, including people who join later; their own pick stays private.
function shareRoomAudio(a) {
  if (!party?.isHost || a.actual == null) return;
  const language = audioLanguage(a.tracks.find(t => t.index === a.actual)?.language);
  if (!language || language === (party.state.audioLang || '') || party.sharingAudio === language) return;
  const room = party;
  room.sharingAudio = language;
  room.setAudio(language).catch(() => {}).finally(() => { if (room.sharingAudio === language) room.sharingAudio = null; });
}
function followRoomAudio() {
  const session = current, a = session?.audio, want = party?.state?.audioLang;
  if (!a || !want || !session.ready || party.isHost || a.ownPick || a.pending != null || a.swap || audioSuppressed()) return;
  const track = a.tracks.find(t => audioLanguage(t.language) === want);
  if (!track || track.index === a.actual || track.index === a.followed) return;
  a.followed = track.index;
  selectAudioTrack(track.index);
}
async function refreshAudioMetadata(session, reset = false) {
  const audio = session.audio;
  const generation = audio?.generation;
  try {
    const data = await api(`/api/media/${session.kind}/${encodeURIComponent(mediaId(session))}/audio?plays=${extraPlayable()}`, { signal: session.abort.signal });
    if (current === session && session.audio === audio && audio?.generation === generation) { installAudioMetadata(session, data, reset); return true; }
  } catch { /* playback remains available */ }
  return false;
}
function reflectNativeAudio() {
  const a = current?.audio;
  if (!a || a.usingFallback || !a.sourceMatches || a.pending != null || audioSuppressed()) return;
  const mapping = nativeAudioMapping(a.tracks, video.audioTracks);
  if (!mapping) return;
  const enabled = [...mapping].filter(([, track]) => track.enabled);
  if (enabled.length === 1) {
    a.actual = enabled[0][0];
    a.activeLabel = audioLabel(a, a.actual);
    a.userChoice = a.actual !== a.default;
    renderAudioControls();
  }
}
video.audioTracks?.addEventListener?.('change', reflectNativeAudio);
video.addEventListener('loadedmetadata', reflectNativeAudio);
for (const event of ['webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) video.addEventListener(event, () => { reflectNativeAudio(); renderAudioControls(); });
if (hasRemotePlayback) for (const event of ['connect', 'disconnect']) video.remote.addEventListener(event, () => {
  if (audioSuppressed()) cancelAudioIntent(current);
  renderAudioControls();
});
function audioPrepareDelay(signal) {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, 1000);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}
function switchAudioSource(session, a, generation, link, valid) {
  return new Promise(resolve => {
    const snapshot = capturePlayback(session);
    const previous = { actual: a.actual, activeLabel: a.activeLabel, usingFallback: a.usingFallback };
    const bridge = session.bridge && { ...session.bridge };
    session.sourceSnapshot = snapshot;
    let timer, metadataReady = false;
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('error', failed); video.removeEventListener('canplay', commit); };
    const restore = () => { Object.assign(a, previous); restoreAudioSource(session, snapshot, bridge); };
    const failed = () => {
      if (!valid() || a.swap !== swap) return;
      cleanup(); a.swap = null; a.upgrading = null;
      a.error = bridge?.track === link.track ? T('The full-quality version couldn’t play here, so this audio stays at up to 1080p.')
        : T('This audio couldn’t play. Restoring your previous audio.');
      a.failed = link.track; a.pending = null;
      $('#player-error').hidden = true;
      restore(); renderAudioControls(); announceAudio(a.error); resolve(false);
      recoverAudioOwnership(session, a);
    };
    const commit = () => {
      if (!metadataReady || !valid() || a.swap !== swap) return;
      cleanup(); a.swap = null; session.sourceSnapshot = null;
      a.actual = link.track; a.pending = null; a.upgrading = null; a.failed = null; a.error = ''; a.usingFallback = !link.original;
      a.intentUserChoice = null;
      a.activeLabel = audioLabel(a, a.actual);
      renderAudioControls(); announceAudio(T('{0} audio selected.', a.activeLabel)); shareRoomAudio(a); resolve(true);
    };
    const swap = { cancel: restoreSource => { cleanup(); if (restoreSource && current === session) restore(); resolve(false); } };
    a.swap = swap;
    video.addEventListener('error', failed);
    video.addEventListener('canplay', commit);
    timer = setTimeout(failed, 15000);
    party?.beginSwap();
    setPlayerSource(link.url, session, () => {
      if (!valid() || a.swap !== swap) return;
      metadataReady = true;
      restorePlayback(snapshot);
      if (video.readyState >= 3) commit();
    });
    renderAudioControls();
  });
}

// Plays the chosen language from the live stream (see attachBridge) while its full-quality copy is made.
// Resolves true once it plays from the same spot; on failure the previous source comes back and the wait goes on.
async function bridgeAudio(session, a, index, valid) {
  let link;
  try { link = await api(`/api/play-link?kind=${session.kind}&id=${encodeURIComponent(mediaId(session))}&variant=${browserVariant()}&audio=${index}&audioSource=${encodeURIComponent(a.source)}&bridge=1`, { signal: a.abort?.signal }); }
  catch { return false; }
  if (!valid() || !link?.url || link.track !== index) return false;
  return new Promise(resolve => {
    const snapshot = capturePlayback(session);
    const previousBridge = session.bridge && { ...session.bridge };
    session.sourceSnapshot = snapshot;
    let timer, metadataReady = false, done = false;
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('error', failed); video.removeEventListener('canplay', commit); };
    const failed = () => {
      if (done) return;
      done = true; cleanup(); if (a.swap === swap) a.swap = null;
      if (valid()) restoreAudioSource(session, snapshot, previousBridge);
      resolve(false);
    };
    const commit = () => {
      if (!metadataReady || done || !valid() || a.swap !== swap || !session.bridge) return;
      done = true; cleanup(); a.swap = null; session.sourceSnapshot = null;
      session.bridge.track = index;
      a.actual = index; a.pending = null; a.upgrading = index; a.usingFallback = true; a.intentUserChoice = null;
      a.activeLabel = audioLabel(a, index);
      renderAudioControls(); announceAudio(T('{0} audio selected.', a.activeLabel)); shareRoomAudio(a);
      resolve(true);
    };
    const swap = { cancel: restoreSource => {
      if (done) return;
      done = true; cleanup();
      if (restoreSource && current === session) restoreAudioSource(session, snapshot, previousBridge);
      resolve(false);
    } };
    a.swap = swap;
    video.addEventListener('error', failed);
    video.addEventListener('canplay', commit);
    timer = setTimeout(failed, 20000);
    party?.beginSwap();
    attachBridge(session, link.url, () => {
      if (!valid() || a.swap !== swap) return;
      metadataReady = true;
      restorePlayback(snapshot);
      if (video.readyState >= 3) commit();
    }).then(ok => { if (!ok) failed(); }, failed);
    renderAudioControls();
  });
}
// The file changed under a bridged choice (its MP4 copy finished, say): the same language in the new file.
async function remapBridgedAudio(session, a, index) {
  const old = a.tracks.find(t => t.index === index);
  let data;
  try { data = await api(`/api/media/${session.kind}/${encodeURIComponent(mediaId(session))}/audio?plays=${extraPlayable()}`, { signal: a.abort?.signal }); } catch { return null; }
  if (!old || !data?.audioSource || data.audioSource === a.source || !Array.isArray(data.tracks)) return null;
  const tracks = data.tracks.filter(t => Number.isSafeInteger(t.index) && Number.isSafeInteger(t.audioIndex));
  const match = sameAudio(old, tracks);
  if (!match) return null;
  Object.assign(a, { source: data.audioSource, tracks, default: data.defaultAudio, actual: match.index, pending: match.index, sourceMatches: true });
  if (a.upgrading != null) a.upgrading = match.index;
  if (session.bridge) session.bridge.track = match.index;
  a.activeLabel = audioLabel(a, match.index);
  renderAudioControls();
  return match.index;
}

async function selectAudioTrack(index) {
  const session = current, a = session?.audio;
  if (!a || audioSuppressed() || !a.tracks.some(t => t.index === index)) return;
  cancelAudioIntent(session);
  a.error = ''; a.failed = null;
  if (index === a.actual && session.bridge?.track !== index) {
    a.userChoice = a.usingFallback || a.actual !== a.default;
    renderAudioControls(); announceAudio(T('Audio preparation cancelled.'));
    if (!a.userChoice) watchAudio(session, session);
    return;
  }
  a.intentUserChoice = a.userChoice;
  a.userChoice = true;
  const mapping = !a.usingFallback && a.sourceMatches ? nativeAudioMapping(a.tracks, video.audioTracks) : null;
  if (mapping?.has(index)) {
    const before = [...mapping].map(([, track]) => [track, track.enabled]);
    try {
      for (const [id, track] of mapping) track.enabled = id === index;
      if (mapping.get(index).enabled && [...mapping].every(([id, track]) => track.enabled === (id === index))) {
        a.actual = index; a.activeLabel = audioLabel(a, index);
        a.intentUserChoice = null;
        renderAudioControls(); announceAudio(T('{0} audio selected.', a.activeLabel)); shareRoomAudio(a); return;
      }
    } catch { /* use the server-prepared rendition */ }
    for (const [track, enabled] of before) try { track.enabled = enabled; } catch { /* read-only implementation */ }
  }
  const generation = a.generation;
  const controller = a.abort = new AbortController();
  const valid = () => current === session && session.audio === a && a.generation === generation && !controller.signal.aborted && !audioSuppressed();
  const onBridge = session.bridge?.track === index;
  // Back to the file's own default track: that's the file itself, nothing to prepare.
  const original = index === a.default && a.sourceMatches && a.usingFallback;
  a.pending = onBridge ? null : index;
  if (onBridge) a.upgrading = index;
  renderAudioControls(); if (!onBridge) announceAudio(T('Preparing {0} audio. Playback continues.', audioLabel(a, index)));
  let retry = true, bridged = onBridge, remaps = 0;
  try {
    while (valid()) {
      let link;
      try {
        link = await api(`/api/play-link?kind=${session.kind}&id=${encodeURIComponent(mediaId(session))}&variant=${browserVariant()}${original ? '' : `&audio=${index}&audioSource=${encodeURIComponent(a.source)}${retry ? '&audioRetry=1' : ''}`}`, { signal: controller.signal });
        if (original && link) Object.assign(link, { ready: true, original: true, track: index, audioSource: a.source });
      } catch (error) {
        if (error.status === 409 && session.bridge?.track === index && remaps++ < 2 && valid()) {
          const moved = await remapBridgedAudio(session, a, index);
          if (!valid()) return;
          if (moved != null) { index = moved; retry = true; if (a.upgrading != null) a.pending = null; continue; }
        }
        throw error;
      }
      if (!valid()) return;
      retry = false;
      if (!link.ready) {
        if (!bridged && bridgeAvailable()) { bridged = true; await bridgeAudio(session, a, index, valid); if (!valid()) return; }
        await audioPrepareDelay(controller.signal); continue;
      }
      if (link.track !== index || link.audioSource !== a.source) throw new Error(T('Audio tracks changed. Choose a track again.'));
      await switchAudioSource(session, a, generation, link, valid);
      return;
    }
  } catch (error) {
    if (!valid()) return;
    if (session.bridge?.track === index) {
      // The chosen language already plays from the live stream; only full quality didn't work out.
      a.upgrading = null; a.pending = null;
      a.error = T('The full-quality version couldn’t be made, so this audio stays at up to 1080p.'); a.failed = index;
      renderAudioControls(); announceAudio(a.error);
      return;
    }
    if (error.status === 409) {
      const refreshed = await refreshAudioMetadata(session);
      if (current !== session || session.audio !== a || (!refreshed && !valid())) return;
      a.error = T('Audio tracks changed. Choose a track again.'); a.failed = null;
    } else { a.error = error.message || T('Couldn’t prepare this audio.'); a.failed = index; }
    a.pending = null;
    renderAudioControls(); announceAudio(a.error);
    recoverAudioOwnership(session, a);
  }
}

// Polls the server while a corrected copy is made, then switches to it at the current position.
// Covers unplayable audio and automatic timing fixes. Explicit audio choices own the source.
// A copy being made: the player note becomes a small card with a title, a line of detail,
// a progress bar and a time-left estimate. percent null = still waiting in line.
function showNoteProgress(note, pace, { title, detail, percent }) {
  let card = note.querySelector('.pn-card');
  if (!card) {
    note.textContent = '';
    card = document.createElement('span');
    card.className = 'pn-card';
    card.innerHTML = '<span class="bulb-loader" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="pn-title"></span><span class="pn-pct"></span><span class="pn-detail"></span>'
      + '<span class="pn-bar" aria-hidden="true"><span class="pn-fill"></span></span><span class="pn-meta"></span>';
    note.append(card);
  }
  const waiting = percent == null;
  card.classList.toggle('waiting', waiting);
  card.querySelector('.pn-title').textContent = title;
  card.querySelector('.pn-detail').textContent = detail;
  card.querySelector('.pn-pct').textContent = waiting ? '' : `${percent}%`;
  card.querySelector('.pn-fill').style.width = waiting ? '' : `${percent}%`;
  card.querySelector('.pn-meta').textContent = waiting ? T('Waiting to start…') : copyTimeLeft(pace, percent);
}

// Time left from the average pace since the first sample; blank until there is enough to go on.
function copyTimeLeft(pace, percent) {
  const now = Date.now();
  if (pace.t0 == null || percent < pace.p0) { pace.t0 = now; pace.p0 = percent; return ''; }
  const elapsed = now - pace.t0, gained = percent - pace.p0;
  if (elapsed < 8000 || gained < 1) return '';
  const mins = Math.round((100 - percent) / gained * elapsed / 60000);
  if (mins < 1) return T('Under a minute left');
  if (mins < 90) return T('About {0} min left', mins);
  return T('About {0} h {1} min left', Math.floor(mins / 60), mins % 60);
}

async function watchAudio(f, session) {
  const token = audioWatch = {};
  const pace = {};
  let videoFixing = false;
  const note = $('#player-note');
  note.hidden = true;
  let changed = Boolean(session.compatibilityPending);
  while (current === session && audioWatch === token && !session.audio?.userChoice) {
    let a;
    try { a = await api(`/api/media/${f.kind}/${encodeURIComponent(mediaId(f))}/audio?plays=${extraPlayable()}`); } catch { return; }
    if (current !== session || audioWatch !== token || session.audio?.userChoice || !a.known) return;
    installAudioMetadata(session, a);
    const videoOk = a.videoSafe !== false;
    if (a.browserSafe && a.aligned && videoOk) {
      if (changed) switchToFixedAudio(session, videoFixing ? T('Ready to play') : T('Audio fixed'));
      else {
        note.hidden = true;
        // Asked for this anime dubbed: its English track, once per play (the Audio menu still changes it).
        const track = a.preferAudio && !session.audioPreferred && session.audio?.tracks.find((x) => audioLanguage(x.language) === a.preferAudio);
        if (a.preferAudio) session.audioPreferred = true;
        if (track && track.index !== session.audio.actual) selectAudioTrack(track.index);
      }
      return;
    }
    const percent = a.job === 'converting' ? Math.floor(a.percent ?? 0) : null;
    if (!videoOk) {
      // Video this browser can't decode (e.g. HEVC labelled hev1 in Safari): a compatible copy is being made.
      videoFixing = true;
      $('#player-error').hidden = true;
      if (a.fixable && session.videoBridge?.playing) {
        // Watching already: no card over the picture, one toast.
        if (!session.videoBridge.told) {
          session.videoBridge.told = true;
        }
        note.hidden = true;
        changed = session.compatibilityPending = true;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (a.fixable) {
        bridgeVideo(session);
        showNoteProgress(note, pace, { title: T('Making a version that plays here'),
          detail: T('{0} doesn’t play in this browser. It starts by itself when ready.', a.videoCodec), percent });
      } else {
        note.textContent = T('This video is {0}, which this browser can’t play. {1}', a.videoCodec, a.error ? T('Lilin couldn’t convert it: {0}', a.error) : T('It should still play on a TV.'));
      }
      note.hidden = false;
      if (!a.fixable) return;
      changed = session.compatibilityPending = true;
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!a.browserSafe && !a.fixable) {
      const name = CODEC_NAMES[a.codec] || String(a.codec).toUpperCase();
      note.textContent = T('No sound? This file’s audio is {0}, which this browser can’t play. ', name)
        + (a.error ? T('Lilin couldn’t fix it: {0}', a.error) : T('It should play with sound on a TV.'));
      note.hidden = false;
      return;
    }
    if (!a.fixable) return; // nothing Lilin can do
    if (!a.browserSafe) {
      showNoteProgress(note, pace, { title: T('Adding normal stereo sound'),
        detail: T('This file’s sound ({0}) doesn’t play in this browser. It switches over by itself.', CODEC_NAMES[a.codec] || a.codec), percent });
    } else {
      showNoteProgress(note, pace, { title: T('Correcting the audio timing'), detail: T('It switches over by itself.'), percent });
    }
    note.hidden = false;
    changed = session.compatibilityPending = true;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// Video this browser can't decode (HEVC in Firefox): a full copy takes a while for a 4K film (~25 min).
// Meanwhile the live 1080p stream (phone-stream.js, starts in a second or two) plays it from the resume
// point; switchToFixedAudio moves to the full-quality copy once it's there. Not in Watch Together (the
// room syncs on the plain file). Falls back to the wait card if the stream doesn't play within 20 s.
async function bridgeVideo(session) {
  if (session.videoBridge || session.videoBridgeTried || party || !bridgeAvailable()) return;
  session.videoBridgeTried = true;
  const original = session.sourceUrl;
  if (!original) return;
  let link;
  try { link = await api(`/api/play-link?kind=${session.kind}&id=${encodeURIComponent(mediaId(session))}&variant=${baseVariant()}&quality=1080`, { signal: session.abort.signal }); }
  catch { return; }
  if (current !== session || party || !link?.url || !/\.m3u8$/.test(link.url.split('?')[0])) return;
  const saved = savedProgress(session);
  const start = video.currentTime > 1 ? video.currentTime : saved?.time > 30 ? saved.time : 0;
  const bridge = session.videoBridge = { original, playing: false };
  const giveUp = setTimeout(() => {
    if (current !== session || session.videoBridge !== bridge || bridge.playing) return;
    session.videoBridge = null;
    setPlayerSource(original, session); // back to the wait card
  }, 20000);
  video.addEventListener('playing', () => { if (session.videoBridge === bridge) { bridge.playing = true; clearTimeout(giveUp); } }, { once: true });
  const ok = await attachBridge(session, link.url, () => {
    if (session.videoBridge !== bridge) return;
    if (start > 0 && start < video.duration - 90) { video.currentTime = start; }
    video.play().catch(() => {});
  });
  if (!ok && session.videoBridge === bridge) { clearTimeout(giveUp); session.videoBridge = null; }
}

function switchToFixedAudio(session, message) {
  if (current !== session || session.audio?.userChoice || audioSuppressed()) return;
  const bridged = session.videoBridge;
  session.videoBridge = null;
  const base = (bridged?.original || video.src).replace(/[?&]v=\d+$/, '');
  swapSource(`${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`, () => {
    if (!session.audio?.userChoice) { session.compatibilityPending = false; refreshAudioMetadata(session, true); }
  });
  $('#player-note').hidden = true;
  $('#player-error').hidden = true;
  toast(message);
}

// Safari tints its toolbars with theme-color; black while the player is open so it blends in.
const themeMeta = document.querySelector('meta[name="theme-color"]');
let pageThemeColor = themeMeta?.content; // the theme's background (applyTheme)
const setTheme = (color) => { if (themeMeta) themeMeta.content = color; };

// Safari's toolbars can't be hidden by a web page; the Home Screen version has none.
// Mention that once, the first time the phone is turned sideways in Safari.
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const landscapeQuery = matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');
landscapeQuery.addEventListener('change', (e) => {
  if (!e.matches || isStandalone || !current || !/iPhone|iPod/.test(navigator.userAgent)) return;
  try {
    if (localStorage.getItem('tip:homescreen')) return;
    localStorage.setItem('tip:homescreen', '1');
  } catch { return; }
  toast(T('Tip: add Lilin to your Home Screen to watch without Safari’s bar. The fullscreen button shows how.'));
});

// ---- night mode and sleep timer ----
// One "Bedtime" menu: night mode evens out the sound (player-comfort.js), and the sleep timer
// pauses after a while or at the end of what's playing, fading the sound out first.
const nightBtn = $('#night-btn');
const nightMenu = $('#night-menu');
const night = createNightAudio(video);
// Night mode is remembered per title: switched on during a show, it comes back for that show's next
// episodes (any season); a film remembers it for itself. Everything else starts with it off.
const NIGHT_TITLES = 'player:night-titles';
const nightKey = (f) => (f ? f.show || (f.season != null && f.title ? `show:${String(f.title).toLowerCase()}` : f.mediaKey ? `film:${f.mediaKey}` : f.tmdbId ? `film:${f.tmdbId}` : null) : null);
function nightTitles() { try { return JSON.parse(localStorage.getItem(NIGHT_TITLES)) || []; } catch { return []; } }
function rememberNight(f, on) {
  const key = nightKey(f);
  if (!key) return;
  const list = nightTitles().filter((k) => k !== key);
  if (on) list.unshift(key);
  try { localStorage.setItem(NIGHT_TITLES, JSON.stringify(list.slice(0, 300))); } catch { /* blocked */ }
}
const nightRemembered = (f) => { const key = nightKey(f); return Boolean(key) && nightTitles().includes(key); };
let nightWanted = false;
let sleep = null; // { kind: 'minutes', minutes, ends } or { kind: 'episode' }
let sleepTick = null;
let sleepVolume = null; // the volume before the fade, put back once paused

// The TV plays the sound itself while casting, so night mode has nothing to work on there.
const nightAvailable = () => night.supported && !audioCasting();
const sleepAvailable = () => !party; // pausing one viewer of a Watch Together room would pause the room
const sleepEndLabel = () => (current?.episode ? T('the end of this episode') : plainMedia(current) ? T('the end of this video') : T('the end of this film'));
const sleepChoiceLabel = (m) => (m < 60 ? T('{0} minutes', m) : m % 60 ? T('{0} h {1} min', Math.floor(m / 60), m % 60) : m === 60 ? T('1 hour') : T('{0} hours', m / 60));
function closeNightMenu() { nightMenu.hidden = true; nightBtn.setAttribute('aria-expanded', 'false'); }

function renderNightMenu() {
  const chosen = !sleep ? 'off' : sleep.kind === 'episode' ? 'episode' : String(sleep.minutes);
  const choices = [['off', T('Off')], ...SLEEP_MINUTES.map((m) => [String(m), sleepChoiceLabel(m)]),
    ['episode', current?.episode ? T('End of episode') : T('When this ends')]];
  const focused = nightMenu.contains(document.activeElement) ? document.activeElement?.dataset?.choice : null;
  nightMenu.replaceChildren(...[
    h('p', { class: 'audio-title' }, T('Bedtime')),
    nightAvailable() && h('button', { type: 'button', role: 'menuitemcheckbox', class: 'cc-item night-item', tabindex: '-1',
      'data-choice': 'night', 'aria-checked': String(night.on), onclick: () => setNight(!night.on) },
    h('span', {}, T('Night mode'), h('small', {}, T('Softer loud scenes, clearer voices')))),
    sleepAvailable() && nightAvailable() && h('div', { class: 'cc-divider', role: 'separator' }),
    sleepAvailable() && h('p', { class: 'cc-nudge-label night-label' }, T('Sleep timer')),
    ...(sleepAvailable() ? choices.map(([v, label]) => h('button', { type: 'button', role: 'menuitemradio', class: 'cc-item', tabindex: '-1',
      'data-choice': v, 'aria-checked': String(chosen === v), onclick: () => setSleep(v) }, label)) : []),
    sleep && h('p', { class: 'cc-message sleep-left', role: 'status' }, sleepLabel(sleep, Date.now(), sleepEndLabel())),
  ].filter(Boolean));
  if (focused && !nightMenu.hidden) nightMenu.querySelector(`[data-choice="${focused}"]`)?.focus({ preventScroll: true });
  nightBtn.hidden = !nightAvailable() && !sleepAvailable();
  if (nightBtn.hidden) closeNightMenu();
  nightBtn.classList.toggle('is-on', night.on || Boolean(sleep));
  nightBtn.setAttribute('aria-label', [night.on && T('Night mode on'), sleep && sleepLabel(sleep, Date.now(), sleepEndLabel())].filter(Boolean).join(', ') || T('Bedtime: night mode and sleep timer (N)'));
}

// Must run from a click or key press the first time (browsers start Web Audio only from one).
function setNight(on, feedback = false) {
  if (on && !nightAvailable()) { if (feedback) osd(T('Night mode isn’t available here')); return; }
  const now = night.set(on);
  if (on && !now) toast(T('Night mode isn’t available in this browser.'));
  nightWanted = now;
  rememberNight(current, now);
  if (feedback) osd(now ? T('Night mode on') : T('Night mode off'));
  renderNightMenu();
}
video.addEventListener('play', () => night.resume()); // iOS suspends the audio when the phone locks

function restoreSleepVolume() {
  if (sleepVolume != null) { video.volume = sleepVolume; sleepVolume = null; }
}
function clearSleep() {
  restoreSleepVolume();
  sleep = null;
  clearInterval(sleepTick);
  sleepTick = null;
}
function setSleep(choice) {
  clearSleep();
  if (choice !== 'off' && sleepAvailable()) sleep = sleepTimer(choice);
  if (sleep?.kind === 'minutes') sleepTick = setInterval(sleepStep, 500);
  osd(sleep ? sleepLabel(sleep, Date.now(), sleepEndLabel()) : T('Sleep timer off'));
  renderNightMenu();
  updateUpNext();
}
function sleepStep() {
  if (!sleep || sleep.kind !== 'minutes') return;
  if (!sleepAvailable()) { clearSleep(); renderNightMenu(); return; }
  const now = Date.now();
  const fade = sleepFade(sleep, now);
  if (fade < 1 && canSetVolume && !video.paused) {
    if (sleepVolume == null) sleepVolume = video.volume;
    video.volume = Math.round(sleepVolume * fade * 100) / 100;
  }
  if (sleepSecondsLeft(sleep, now) <= 0) { sleepPause(); return; }
  const left = nightMenu.querySelector('.sleep-left');
  if (left && !nightMenu.hidden) left.textContent = sleepLabel(sleep, now, sleepEndLabel());
}
function sleepPause() {
  clearSleep();
  video.pause();
  autoChain = AUTOPLAY_CHAIN; // no Next episode countdown while they sleep; a key press or tap brings it back
  osd(T('Paused by the sleep timer'));
  toast(T('Paused by the sleep timer. Press play to keep watching.'));
  renderNightMenu();
}

nightBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = nightMenu.hidden;
  closePlayerMenus('night');
  renderNightMenu();
  if (nightBtn.hidden) return;
  nightMenu.hidden = !open;
  nightBtn.setAttribute('aria-expanded', String(open));
  if (open) (nightMenu.querySelector('[aria-checked="true"]') || nightMenu.querySelector('button'))?.focus();
});
nightMenu.addEventListener('keydown', (e) => {
  const items = [...nightMenu.querySelectorAll('button')];
  const index = items.indexOf(document.activeElement);
  const target = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
  if (target != null && items.length) { e.preventDefault(); items[target].focus(); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNightMenu(); nightBtn.focus(); }
});
document.addEventListener('click', (e) => { if (!nightMenu.hidden && !nightMenu.contains(e.target)) closeNightMenu(); });

// ---- quality (phones) ----
// Big files (4K, very high bitrates) stutter on phones and eat mobile data. The server can stream a
// lighter 1080p or 720p version made live from the file (HLS, phone-stream.js); the file itself stays as
// it is. Auto picks it on phones for files too heavy for one. Needs a browser that plays HLS itself
// (Safari, Chrome on Android); elsewhere the menu isn't shown and the file plays as before.
const qualityBtn = $('#quality-btn');
const qualityMenu = $('#quality-menu');
const QUALITY_PREFS = ['auto', 'original', '1080', '720'];
let qualityPref = 'auto';
try { const saved = localStorage.getItem('player:quality'); if (QUALITY_PREFS.includes(saved)) qualityPref = saved; } catch { /* blocked */ }
const playsHls = () => Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
const touchScreen = () => matchMedia('(pointer: coarse)').matches;
const phoneScreen = () => touchScreen() && Math.min(screen.width, screen.height) <= 600;
// What to ask the server for when playback starts: "auto" only means something on a phone.
function wantedQuality(f = current) {
  // A connection too slow for this file (connection.js): the live stream that fits, on any browser that plays HLS
  // itself or through hls.js. "Original" picked by hand still wins.
  if (f?.speedStream && qualityPref !== 'original' && (playsHls() || 'MediaSource' in window || 'ManagedMediaSource' in window)) return f.speedStream;
  if (!playsHls()) return 'original';
  if (qualityPref === 'auto') return phoneScreen() ? 'auto' : 'original';
  return qualityPref;
}
const qualityAvailable = (session = current) => Boolean(session && !plainMedia(session) && playsHls() && touchScreen() && !audioCasting());
const heightName = (h) => (!h ? '' : h >= 2000 ? '4K' : h >= 1400 ? '1440p' : h >= 1000 ? '1080p' : h >= 700 ? '720p' : 'SD');
function closeQualityMenu() { qualityMenu.hidden = true; qualityBtn.setAttribute('aria-expanded', 'false'); }
// The episode playing looks soft: its season can be upgraded right here. Not in Watch Together, whose file is shared.
function playerUpgrade(session) {
  if (!party && session?.kind === 'lib' && session.season == null && session.tmdbId) return filmUpgrade(session);
  if (party || session?.kind !== 'lib' || session.season == null || session.episode == null || !session.tmdbId) return null;
  const u = upgradeState({ id: session.tmdbId, title: session.title, type: 'tv' }, session.season);
  return u.offered ? u : null;
}

function renderQualityMenu() {
  const session = current;
  // Versions of this film or episode (src/versions.js): shown on every screen, above the phone streams.
  const vers = session && !plainMedia(session) && session.versions?.length > 1 ? session.versions : null;
  const stream = qualityAvailable(session);
  const upgrade = playerUpgrade(session);
  qualityBtn.hidden = !stream && !vers && !upgrade;
  if (qualityBtn.hidden) { closeQualityMenu(); return; }
  const phone = stream ? phoneQuality(session) : null;
  const source = heightName(session.sourceHeight);
  const playing = phone ? T('{0}p, made live from the {1} file', phone, source || T('original')) : T('Original{0}', source ? ` (${source})` : '');
  const choices = [
    ['auto', T('Auto'), phoneScreen() ? T('Lighter stream when a file is too big for a phone') : T('The original file on this screen')],
    ['original', T('Original'), T('Full quality, the file as it is')],
    ['1080', '1080p', T('Smooth on phones and mobile data')],
    ['720', '720p', T('Data saver')],
  ];
  const focused = qualityMenu.contains(document.activeElement) ? document.activeElement?.dataset?.choice : null;
  const versionItems = vers ? [
    h('p', { class: 'audio-title' }, T('Version')),
    ...vers.map((v) => {
      const [main, ...rest] = v.versionLabel.split(' · ');
      const size = /\d (GB|MB)$/.test(rest.at(-1) || '') ? rest.pop() : '';
      return h('button', { type: 'button', role: 'menuitemradio', class: 'cc-item night-item', tabindex: '-1',
        'data-choice': `v:${v.mediaKey}`, 'aria-checked': String(v.mediaKey === session.mediaKey), onclick: () => switchVersion(v) },
      h('span', {}, [main, ...rest].join(' · '), size && h('small', {}, size)));
    }),
  ] : [];
  qualityMenu.replaceChildren(
    !vers && !stream ? h('p', { class: 'audio-title' }, T('Quality')) : '',
    ...versionItems,
    ...(stream ? [
      h('p', { class: 'audio-title' }, vers ? T('Stream') : T('Quality')),
      ...choices.map(([v, label, note]) => h('button', { type: 'button', role: 'menuitemradio', class: 'cc-item night-item', tabindex: '-1',
        'data-choice': v, 'aria-checked': String(qualityPref === v), onclick: () => setQuality(v) },
      h('span', {}, label, h('small', {}, note)))),
    ] : []),
    h('p', { class: 'cc-message', role: 'status' }, session.qualityBusy ? T('Switching…') : vers && !stream ? T('Playing: {0}', session.versionLabel) : T('Playing: {0}', playing)),
    !upgrade ? '' : upgrade.started ? h('p', { class: 'cc-message', role: 'status' }, upgrade.text)
      : h('button', { type: 'button', role: 'menuitem', class: 'cc-item night-item quality-upgrade stroke-icon', tabindex: '-1', 'data-choice': 'upgrade', 'aria-disabled': String(upgrade.disabled),
        onclick: (e) => { e.stopPropagation(); if (!upgrade.disabled) upgrade.run(); } }, // stays open, to show how the search went
      icon('upgrade'), h('span', {}, upgradeLabel(upgrade), h('small', {}, upgrade.text || (upgrade.film ? T('Downloads the 4K version in the background. Playback moves to it once it’s ready.')
        : T('Looks soft? Swaps this season for a clearly better copy.'))))),
  );
  if (focused && !qualityMenu.hidden) qualityMenu.querySelector(`[data-choice="${focused}"]`)?.focus({ preventScroll: true });
  const badge = $('#quality-badge');
  const height = session.sourceHeight || ({ '2160p': 2160, '1440p': 1440, '1080p': 1080, '720p': 720, SD: 480 }[session.versionQuality] || 0);
  badge.textContent = phone || (height >= 2000 ? '4K' : height && height < 700 ? T('SD') : T('HD'));
  badge.style.fontSize = badge.textContent.length > 3 ? '6px' : '';
  qualityBtn.classList.toggle('is-on', Boolean(phone));
  qualityBtn.setAttribute('aria-label', T('Quality: {0}', vers && !stream ? session.versionLabel : playing));
}

// Another version of what's playing: remembered for this title, and playback carries on at the same spot.
async function switchVersion(v) {
  const session = current;
  closeQualityMenu();
  if (!session || v.mediaKey === session.mediaKey) return;
  if (party) { toast(T('Pick the version before starting Watch Together.')); return; }
  if (audioCasting()) { toast(T('Stop casting to switch versions.')); return; }
  if (v.converting) { toast(T('That version is being converted. Try again when it finishes.')); return; }
  const at = video.currentTime || 0;
  setVersionPick(session, v);
  saveProgress(true);
  await loadPlayerMedia(libraryFile({ ...v, versions: session.versions }), { startAt: at });
  osd(v.versionLabel.replace(/ · [\d.]+ [GM]B$/, ''));
}

// A first watch starts on a quick 1080p copy and the bigger picture downloads in the background as another version
// (smart-download.js betterCopy). Once that one is ready, playback moves over to it at the same spot: once per title,
// never after a version was picked by hand, only on a screen sharper than 1080p and only when this browser plays it
// as it is (an HEVC file in a browser without HEVC would mean waiting for a converted copy).
const autoUpgraded = new Set();
let upgradeLooks = 0;
const UPGRADE_RANK = { '2160p': 4, '1440p': 3, '1080p': 2, '720p': 1, SD: 0 };
function upgradeVersion(session = current) {
  if (!session || !['lib', 'part'].includes(session.kind) || session.season != null || party || audioCasting() || video.paused || !session.ready) return null;
  const key = session.versionKey || (session.tmdbId ? `film:${session.tmdbId}` : null);
  const asked = downloadCommands.has(commandKey({ type: 'movie', tmdbId: session.tmdbId, upgrade: true })); // "Get a sharper copy"
  if (!key || (versionPicks[key] && !asked) || autoUpgraded.has(key) || !sharpScreen()) return null;
  const item = state.library.find((x) => x.versionKey === key);
  if (!item && ++upgradeLooks % 3 === 0) loadLibrary().catch(() => {}); // nothing else reloads the library during playback
  const here = UPGRADE_RANK[session.versionQuality] ?? 2;
  const name = (v) => `${v.file || ''} ${v.name || ''} ${v.versionLabel || ''}`;
  return (item?.versions || (item ? [item] : [])).find((v) => v.mediaKey !== session.mediaKey && !v.converting && (UPGRADE_RANK[v.versionQuality] ?? -1) > here
    && (playsHevc() || !/\b(x265|hevc|h\.?265)\b/i.test(name(v)))
    && !(/\b(dv|dovi|dolby ?vision)\b/i.test(name(v)) && !/\bhdr(10)?\b/i.test(name(v)))) || null;
}
setInterval(() => {
  const v = upgradeVersion();
  if (!v) return;
  autoUpgraded.add(current.versionKey || `film:${current.tmdbId}`);
  switchVersion(v).catch(() => {});
}, 20_000);

// Saves the choice for next time and switches the playing video over at the same spot.
async function setQuality(pref) {
  if (!QUALITY_PREFS.includes(pref)) return;
  qualityPref = pref;
  try { localStorage.setItem('player:quality', pref); } catch { /* blocked */ }
  const session = current;
  if (!session || !qualityAvailable(session)) { renderQualityMenu(); return; }
  session.qualityBusy = true;
  renderQualityMenu();
  try {
    const link = await api(party ? `${party.base}/play-link?clientId=${encodeURIComponent(watchClient)}&variant=${baseVariant()}&quality=${wantedQuality()}`
      : `/api/play-link?kind=${session.kind}&id=${encodeURIComponent(mediaId(session))}&variant=${baseVariant()}&quality=${wantedQuality()}`, { signal: session.abort.signal });
    if (current !== session) return;
    session.sourceHeight = link.sourceHeight || session.sourceHeight;
    if ((link.quality || 'original') === (session.quality || 'original')) return;
    // The audio choices belong to the file being streamed: start over with its default track.
    resetAudioSelection(session);
    session.audio = null;
    session.quality = link.quality || 'original';
    session.browserName = link.name;
    swapSource(link.url, () => watchAudio(session, session));
    osd(phoneQuality(session) ? `${session.quality}p` : T('Original quality'));
  } catch (error) {
    if (current === session && error.name !== 'AbortError') toast(error.message || T('Couldn’t change the quality.'));
  } finally {
    if (current === session) { session.qualityBusy = false; renderQualityMenu(); }
  }
}

qualityBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = qualityMenu.hidden;
  closePlayerMenus('quality');
  renderQualityMenu();
  if (qualityBtn.hidden) return;
  qualityMenu.hidden = !open;
  qualityBtn.setAttribute('aria-expanded', String(open));
  if (open) (qualityMenu.querySelector('[aria-checked="true"]') || qualityMenu.querySelector('button'))?.focus();
});
qualityMenu.addEventListener('keydown', (e) => {
  const items = [...qualityMenu.querySelectorAll('button')];
  const index = items.indexOf(document.activeElement);
  const target = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
  if (target != null && items.length) { e.preventDefault(); items[target].focus(); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeQualityMenu(); qualityBtn.focus(); }
});
document.addEventListener('click', (e) => { if (!qualityMenu.hidden && !qualityMenu.contains(e.target)) closeQualityMenu(); });
qualityMenu._update = renderQualityMenu;
commandViews.add(qualityMenu);

// ---- controls ----
// Lilin's own controls instead of the browser's, so they look the same everywhere, work from
// the keyboard, and the subtitles know where they are. They show on mouse movement or a tap and
// fade out 3 s into playback; they stay up while paused, while a menu is open or under the mouse.
const playerEl = $('#player');
// Getting it ready (play first): the first frame ends that screen; an error card replaces it (showPlayerError).
video.addEventListener('playing', () => { if (gettingReady.active() && readyRun?.handed) { readyRun = null; gettingReady.hide(); } });
const stage = $('#player-stage');
const controlsEl = $('#player-controls');
const seekRow = $('.seek-row');
const seekEl = $('#seek');
const seekTip = $('#seek-tip');
// The frame at the hovered time sits in the tip (seek-preview.js); a sheet arriving late re-places it.
let seekTipX = null;
const seekPreview = createSeekPreview(seekTip, () => { if (!seekTip.hidden && seekTipX != null) showSeekTip(seekTipX); });
// pick: Pick together (match.js): everyone swipes the same posters; the first shared yes is a match.
const pickUi = createMatch({ h, api, jsonPost, toast, icon, people, me: () => state.me, copyWithToast, pushOverlay, closeTopOverlay,
  openTitle: (t) => openDetails(t, null), offerRoom: (token) => offerWatchRoom(token), watchClient, canDownload: () => canDownload(), invite,
  enterRoom: async (room) => { await openPlayer({ ...room.media, key: room.media.id, done: true }, { watchRoom: room }); setWatchPanel(true); } });
// friends: Moments (moments.js): player scissors button (next to the cog) → Clip a moment, and Settings → Moments.
const momentsUI = createMoments({ h, api, jsonPost, toast, icon, people, me: () => state.me, friendsUI, invite, copyWithToast, fmtAgo, video, playerEl: $('#player'),
  current: () => current, subCues: () => (subTrack?.cues ? [...subTrack.cues] : []), inRoom: () => Boolean(party),
  describe: (f) => {
    const show = f.show != null ? state.libraryShows.find((s) => s.id === f.show) : null;
    const pad = (n) => String(n).padStart(2, '0');
    return { title: show?.title || f.filmTitle || f.title || '',
      label: f.season != null ? (f.episode != null ? `S${pad(f.season)} E${pad(f.episode)}` : `S${pad(f.season)}`) : f.year ? String(f.year) : '' };
  },
  closeOthers: () => closePlayerMenus('more'),
  openMoment: (m) => openPlayer({ kind: 'moment', id: m.id, url: m.url, title: [m.title, m.label].filter(Boolean).join(' · '), subtitles: m.subtitles }),
  rerender: () => { updateYouDot(); if (settingsOpen()) renderSettingsWhenStill(); } });
// ghost reactions (ghosts.js): the smiley beside the scissors, friends' pop-ups over the picture, marks on the seek bar.
const ghostsUI = createGhosts({ h, api, jsonPost, toast, icon, people, me: () => state.me, video, playerEl: $('#player'), seekEl: $('#seek'),
  current: () => current, about: (f) => watchAbout(f), fmtTime, closeOthers: () => closePlayerMenus('ghosts'), showUi: () => showPlayerUi() });
const playBtns = [$('#pc-play'), $('.pc-big-play')];
const muteBtn = $('#pc-mute');
const volInput = $('#pc-vol');
const fsBtn = $('#pc-fs');
const pipBtn = $('#pc-pip');
const timeEl = $('#pc-time');
const durEl = $('#pc-duration');
const osdEl = $('#player-osd');
const spinner = $('#player-spinner');
const helpEl = $('#player-help');

// One player menu or panel at a time: opening one closes the others (they stop their clicks from bubbling,
// so the "click outside" listeners never see the other buttons). Returns whether anything was open.
// ---- settings cog ----
// One cog holds Subtitles, Audio, Night mode and Quality. Their own buttons stay in the DOM (tucked away
// with .pc-tucked), so availability, labels and menus work as before: a row here presses the hidden
// button, and each of those menus gets a Settings back row on top.
const settingsBtn = $('#settings-btn');
const settingsMenu = $('#settings-menu');
const tuckedMenus = () => [
  { btn: ccBtn, menu: ccMenu, label: T('Subtitles'), value: () => ccLangs.find((l) => l.code === ccActive)?.name || T('Off') },
  { btn: audioBtn, menu: audioMenu, label: T('Audio'), value: () => afterColon(audioBtn) },
  { btn: nightBtn, menu: nightMenu, label: T('Night mode'), value: () => (nightBtn.classList.contains('is-on') ? nightBtn.getAttribute('aria-label') : T('Off')) },
  { btn: qualityBtn, menu: qualityMenu, label: T('Quality'), value: () => afterColon(qualityBtn) },
];
function afterColon(btn) {
  const label = btn.getAttribute('aria-label') || '';
  const at = label.indexOf(': ');
  return at >= 0 ? label.slice(at + 2) : '';
}
// Autoplay next episode: a switch right in the cog (per device). Off = the Up next card still shows, without the countdown.
const AUTOPLAY_KEY = 'lilin:autoplayNext';
function autoplayNextOn() { try { return localStorage.getItem(AUTOPLAY_KEY) !== '0'; } catch { return true; } }
const playingEpisode = () => current?.kind === 'lib' && current.season != null && current.episode != null;
function autoplayRow() {
  const on = autoplayNextOn();
  const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  art.setAttribute('viewBox', '0 0 24 24'); art.setAttribute('aria-hidden', 'true');
  art.innerHTML = '<path d="M5 6v12l7-6zM13 6v12l7-6z"/>';
  return h('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(on), class: 'cc-item settings-item settings-toggle',
    onclick: (e) => {
      e.stopPropagation();
      try { localStorage.setItem(AUTOPLAY_KEY, on ? '0' : '1'); } catch { /* private mode */ }
      updateUpNext();
      renderSettingsMenu();
      settingsMenu.querySelector('.settings-toggle')?.focus();
    } },
  art, h('span', { class: 'settings-label' }, T('Autoplay next episode')), h('span', { class: 'settings-switch', 'aria-hidden': 'true' }));
}
function closeSettingsMenu() { settingsMenu.hidden = true; settingsBtn.setAttribute('aria-expanded', 'false'); }
function renderSettingsMenu() {
  const rows = tuckedMenus().filter((t) => !t.btn.hidden);
  const extra = playingEpisode() ? [autoplayRow()] : [];
  settingsMenu.replaceChildren(h('p', { class: 'audio-title' }, T('Settings')), ...rows.map((t) => {
    const art = t.btn.querySelector('svg')?.cloneNode(true);
    art?.querySelector('[id]')?.removeAttribute('id'); // the quality badge's id stays unique
    return h('button', { type: 'button', role: 'menuitem', class: 'cc-item settings-item', onclick: (e) => { e.stopPropagation(); t.btn.click(); } },
      ...(art ? [art] : []), h('span', { class: 'settings-label' }, t.label), h('span', { class: 'settings-value' }, t.value() || ''),
      h('span', { class: 'settings-chev', 'aria-hidden': 'true' }, '›'));
  }), ...extra);
}
function syncSettingsBtn() {
  settingsBtn.hidden = tuckedMenus().every((t) => t.btn.hidden) && !playingEpisode();
  if (settingsBtn.hidden) closeSettingsMenu();
  else if (!settingsMenu.hidden) renderSettingsMenu();
}
function openSettingsMenu() {
  closePlayerMenus('settings');
  renderSettingsMenu();
  settingsMenu.hidden = false;
  settingsBtn.setAttribute('aria-expanded', 'true');
  settingsMenu.querySelector('button')?.focus();
}
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (settingsMenu.hidden) openSettingsMenu(); else closeSettingsMenu();
});
settingsMenu.addEventListener('keydown', (e) => {
  const items = [...settingsMenu.querySelectorAll('button')];
  const index = items.indexOf(document.activeElement);
  const target = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
  if (target != null && items.length) { e.preventDefault(); items[target].focus(); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettingsMenu(); settingsBtn.focus(); }
});
document.addEventListener('click', (e) => { if (!settingsMenu.hidden && !settingsMenu.contains(e.target)) closeSettingsMenu(); });
{
  const watch = new MutationObserver(syncSettingsBtn);
  for (const t of tuckedMenus()) {
    watch.observe(t.btn, { attributes: true, attributeFilter: ['hidden', 'aria-label', 'class'] });
    // Each sub-menu re-renders itself with replaceChildren, so the back row is put back whenever it goes missing.
    const addBack = () => {
      if (t.menu.firstElementChild?.classList.contains('settings-back')) return;
      t.menu.prepend(h('button', { type: 'button', role: 'menuitem', class: 'cc-item settings-back',
        onclick: (e) => { e.stopPropagation(); openSettingsMenu(); } }, h('span', { 'aria-hidden': 'true' }, '‹'), T('Settings')));
    };
    new MutationObserver(addBack).observe(t.menu, { childList: true });
    addBack();
  }
  syncSettingsBtn();
}

function closePlayerMenus(except) {
  const was = playerMenuOpen();
  if (except !== 'cc') closeCcMenu();
  if (except !== 'audio') closeAudioMenu();
  if (except !== 'night') closeNightMenu();
  if (except !== 'quality') closeQualityMenu();
  if (except !== 'more') momentsUI.closeMenu();
  if (except !== 'ghosts') ghostsUI.closeTray(); // ghost reactions
  if (except !== 'settings') closeSettingsMenu();
  if (except !== 'fs') closeFsGuide();
  if (except !== 'help') helpEl.hidden = true;
  if (except !== 'stats') streamStats.close();
  return was;
}
const playerMenuOpen = () => !settingsMenu.hidden || !ccMenu.hidden || !audioMenu.hidden || !nightMenu.hidden || !qualityMenu.hidden || !fsGuide.hidden
  || !helpEl.hidden || streamStats.isOpen();
const menuOpen = () => fsBtn.getAttribute('aria-expanded') === 'true' || !settingsMenu.hidden || !ccMenu.hidden || !audioMenu.hidden || !nightMenu.hidden || !qualityMenu.hidden || !helpEl.hidden || momentsUI.menuOpen() || ghostsUI.trayOpen(); // friends: Moments, ghost reactions
let lastPointer = 'mouse';
let overControls = false;
let uiTimer = null;

function setUi(on) {
  if (playerEl.classList.contains('ui-visible') === on) return;
  playerEl.classList.toggle('ui-visible', on);
  layoutSubs();
}
function showPlayerUi() {
  setUi(true);
  clearTimeout(uiTimer);
  if (!video.paused) uiTimer = setTimeout(hidePlayerUi, 3000);
}
function hidePlayerUi() {
  if (video.paused) return;
  if (menuOpen() || overControls || seeking != null) { showPlayerUi(); return; }
  setUi(false);
}
playerEl.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
playerEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !(watchPanelOpen && e.target.closest?.('#watch-bar'))) showPlayerUi(); });
controlsEl.addEventListener('pointerenter', (e) => { overControls = e.pointerType === 'mouse'; });
controlsEl.addEventListener('pointerleave', () => { overControls = false; });
video.addEventListener('play', showPlayerUi);
video.addEventListener('pause', showPlayerUi);
// Paused for a few seconds: the picture dims and the title's logo, episode and synopsis show (pause-screen.js).
const pauseScreen = createPauseScreen({ h, playerEl, stage, video,
  canRest: () => Boolean(current?.ready) && !menuOpen() && seeking == null && !gettingReady.active() && !playerEl.classList.contains('has-up-next') && !playerEl.classList.contains('is-credits') && !inPip(),
  info: pauseInfo,
  onRest: (on) => { if (on) { clearTimeout(uiTimer); setUi(false); } else showPlayerUi(); } });
async function pauseInfo(s) {
  const show = s.show != null ? state.libraryShows.find((x) => x.id === s.show) : null;
  const type = show ? 'tv' : 'movie', id = show ? show.tmdbId : s.tmdbId;
  let synopsis = show ? '' : s.overview || '', logo = null;
  if (id && state.status.search) {
    const page = await pageInfo(type, id).catch(() => null);
    if (page?.logo?.url) {
      const big = innerWidth * (devicePixelRatio || 1) > 900;
      const tone = await logoTone(page.logo.url).catch(() => null);
      logo = { url: big ? page.logo.url.replace('/t/p/w500/', '/t/p/original/') : page.logo.url, dark: tone !== null && tone < 0.3 };
    }
    if (show && s.season != null && s.episode != null) {
      const d = await cachedFor(`/api/tv/${id}/season/${s.season}`, 60 * 60 * 1000).catch(() => null);
      synopsis = d?.episodes?.find((e) => e.number === s.episode)?.overview || '';
    } else if (!show && !synopsis) synopsis = state.library.find((f) => f.id === s.id)?.overview || '';
  }
  return { kicker: T('You’re watching'), name: show?.title || s.filmTitle || s.title || '', episode: show ? playerEpisodeText(s) : '',
    synopsis: synopsis || show?.overview || '', logo };
}

// Mouse: click to play or pause, double-click for fullscreen. Touch: a tap shows or hides the
// controls, and a double tap on the left or right third skips 10 s (more taps keep skipping).
let lastTap = { at: 0, side: 0, uiWas: false, skipped: false };
stage.addEventListener('click', (e) => {
  if (menuOpen()) return; // this click only closes the menu
  if (lastPointer === 'mouse') { togglePlay(true); showPlayerUi(); return; }
  const r = stage.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const side = x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0;
  const now = Date.now();
  if (side && side === lastTap.side && now - lastTap.at < 350) {
    if (!lastTap.skipped) setUi(lastTap.uiWas); // undo what the first tap did to the controls
    lastTap = { ...lastTap, at: now, skipped: true };
    skip(10 * side);
    return;
  }
  lastTap = { at: now, side, uiWas: playerEl.classList.contains('ui-visible'), skipped: false };
  if (lastTap.uiWas) { clearTimeout(uiTimer); setUi(false); } else showPlayerUi();
});
stage.addEventListener('dblclick', () => { if (lastPointer === 'mouse') toggleFullscreen(); });

// Feedback in the middle of the picture: "+10 s", "Volume 40%", a play or pause symbol.
let osdTimer = null;
function osd(content) {
  osdEl.replaceChildren(h('span', {}, content));
  osdEl.classList.toggle('is-icon', typeof content !== 'string');
  osdEl.classList.remove('show');
  void osdEl.offsetWidth; // restart the animation
  osdEl.classList.add('show');
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => osdEl.classList.remove('show'), 700);
}

function togglePlay(feedback = false) {
  // A browser that hasn't let this page play with sound yet: this tap unlocks it (and the host's also starts the room).
  if (party?.blocked) { party.unlock(); if (party.isHost && !party.state.intentPlaying) party.control('play'); return; }
  if (party?.state.live) { toast(T('This is live TV, so it keeps playing. Watch from the start to pause it.')); return; }
  if (party) { party.control(party.state.intentPlaying ? 'pause' : 'play'); return; }
  const play = video.paused || video.ended;
  if (play) video.play().catch(() => {}); else video.pause();
  if (feedback) osd(icon(play ? 'play' : 'pause'));
}
function updatePlayState() {
  const playing = party ? !party.blocked && party.state.intentPlaying : !video.paused && !video.ended;
  for (const b of playBtns) {
    b.replaceChildren(icon(playing ? 'pause' : 'play'));
    b.setAttribute('aria-label', party?.blocked ? T('Join playback (Space)') : playing ? T('Pause (Space)') : T('Play (Space)'));
  }
  playerEl.classList.toggle('is-paused', !playing);
}
for (const ev of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(ev, updatePlayState);
for (const b of playBtns) b.addEventListener('click', () => togglePlay());

// Repeated skips in the same direction add up in the feedback: "+30 s".
let skipTotal = 0;
let skipAt = 0;
function skip(seconds) {
  if (!isFinite(video.duration) || !video.duration) return;
  if (party) { party.control('seek', Math.min(Math.max(video.currentTime + seconds, 0), video.duration - 0.5)); return; }
  const now = Date.now();
  skipTotal = now - skipAt < 1000 && Math.sign(skipTotal) === Math.sign(seconds) ? skipTotal + seconds : seconds;
  skipAt = now;
  video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration - 0.5);
  osd(`${skipTotal < 0 ? '−' : '+'}${Math.abs(skipTotal)} s`);
  updateTime();
}
playerEl.querySelectorAll('.pc-skip').forEach((b) => b.replaceChildren(icon(Number(b.dataset.skip) < 0 ? 'back10' : 'fwd10')));
playerEl.querySelectorAll('.pc-skip').forEach((b) => b.addEventListener('click', () => { skip(Number(b.dataset.skip)); showPlayerUi(); }));

// ---- time and seek bar ----
let seeking = null; // where the seek bar is being dragged to, in seconds
let showRemaining = false;
try { showRemaining = localStorage.getItem('player:remaining') === '1'; } catch { /* blocked */ }

function updateTime() {
  const d = isFinite(video.duration) ? video.duration : 0;
  const t = seeking ?? video.currentTime;
  seekEl.style.setProperty('--pos', `${d ? (t / d) * 100 : 0}%`);
  timeEl.textContent = fmtTime(t);
  durEl.textContent = !d ? '–:––' : showRemaining ? `−${fmtTime(d - t)}` : fmtTime(d);
  seekEl.setAttribute('aria-valuemax', String(Math.floor(d)));
  seekEl.setAttribute('aria-valuenow', String(Math.floor(t)));
  seekEl.setAttribute('aria-valuetext', d ? `${fmtTime(t)} of ${fmtTime(d)}` : fmtTime(t));
  updateUpNext();
}
function updateBuffer() {
  const d = video.duration;
  let end = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 1) end = Math.max(end, video.buffered.end(i));
  }
  seekEl.style.setProperty('--buf', d && isFinite(d) ? `${(end / d) * 100}%` : '0%');
}
for (const ev of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied', 'seeking']) video.addEventListener(ev, updateTime);
for (const ev of ['progress', 'timeupdate', 'emptied']) video.addEventListener(ev, updateBuffer);
durEl.addEventListener('click', () => {
  showRemaining = !showRemaining;
  try { localStorage.setItem('player:remaining', showRemaining ? '1' : ''); } catch { /* blocked */ }
  durEl.title = showRemaining ? T('Show duration') : T('Show time remaining');
  updateTime();
});

const seekTimeAt = (x) => {
  const r = seekEl.getBoundingClientRect();
  return Math.min(Math.max((x - r.left) / r.width, 0), 1) * (video.duration || 0);
};
function showSeekTip(x) {
  seekTipX = x;
  const r = seekEl.getBoundingClientRect();
  const t = seekTimeAt(x);
  seekPreview.show(t, fmtTime(t));
  seekTip.hidden = false;
  seekPreview.place(x - r.left, r.width);
}
seekEl.addEventListener('pointerdown', (e) => {
  if (party && !party.isHost) { toast(T('The host controls seeking')); return; }
  if (!isFinite(video.duration) || !video.duration) return;
  seekEl.setPointerCapture(e.pointerId);
  seeking = seekTimeAt(e.clientX);
  seekEl.classList.add('is-dragging');
  showSeekTip(e.clientX);
  updateTime();
});
seekEl.addEventListener('pointermove', (e) => {
  if (seeking != null) { seeking = seekTimeAt(e.clientX); updateTime(); }
  if (seeking != null || e.pointerType === 'mouse') showSeekTip(e.clientX);
});
function endSeek(apply) {
  if (seeking == null) return;
  if (apply) {
    if (party) party.control('seek', seeking);
    else video.currentTime = seeking;
  }
  seeking = null;
  seekEl.classList.remove('is-dragging');
  seekTip.hidden = true;
  updateTime();
  showPlayerUi();
}
seekEl.addEventListener('pointerup', () => endSeek(true));
seekEl.addEventListener('pointercancel', () => endSeek(false));
seekEl.addEventListener('pointerleave', () => { if (seeking == null) seekTip.hidden = true; });

// ---- volume ----
// iOS ignores volume set by a page (the side buttons are the volume), so it only gets mute.
const canSetVolume = (() => { const v = document.createElement('video'); v.volume = 0.5; return v.volume === 0.5; })();
volInput.hidden = !canSetVolume;
try {
  const v = Number(localStorage.getItem('player:volume'));
  if (canSetVolume && localStorage.getItem('player:volume') !== null && v >= 0 && v <= 1) video.volume = v;
  video.muted = localStorage.getItem('player:muted') === '1';
} catch { /* blocked */ }

function updateVolume() {
  const level = video.muted ? 0 : video.volume;
  muteBtn.replaceChildren(icon(level === 0 ? 'muted' : level < 0.5 ? 'volume' : 'volumeHigh'));
  muteBtn.setAttribute('aria-label', video.muted ? T('Unmute (M)') : T('Mute (M)'));
  if (document.activeElement !== volInput) volInput.value = String(level);
  volInput.style.setProperty('--val', `${level * 100}%`);
  try {
    localStorage.setItem('player:volume', String(video.volume));
    localStorage.setItem('player:muted', video.muted ? '1' : '');
  } catch { /* blocked */ }
}
video.addEventListener('volumechange', updateVolume);
updateVolume();
function setVolume(v) {
  video.volume = Math.round(Math.min(Math.max(v, 0), 1) * 100) / 100;
  video.muted = video.volume === 0;
}
function toggleMute() {
  if (video.muted && video.volume === 0) video.volume = 0.5; // unmuting at zero would stay silent
  video.muted = !video.muted;
  osd(video.muted ? T('Muted') : T('Volume {0}%', Math.round(video.volume * 100)));
}
muteBtn.addEventListener('click', toggleMute);
volInput.addEventListener('input', () => setVolume(Number(volInput.value)));

// ---- fullscreen and picture-in-picture ----
// The whole player goes fullscreen, so the controls and subtitles come along. iPhones can only
// make the video itself fullscreen, which swaps Lilin's player for iOS's own (no Skip intro,
// Up next, Watch Together, subtitle styles). So on iPhone there's no fullscreen button: the Home
// Screen app has no Safari bar to hide (turn sideways and the player fills the screen), and in
// Safari the button explains how to add Lilin to the Home Screen instead.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
let fsExitedAt = 0;
const elementFullscreen = Boolean((playerEl.requestFullscreen || playerEl.webkitRequestFullscreen)
  && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true));
// iPad: the Home Screen app keeps the clock and battery bar over the video, and there the page often
// can't go fullscreen itself. iPad's own player is the only thing that hides the bar, so the button
// opens that (people asked for it; Lilin's own controls are back as soon as it closes).
const isIPad = /iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const iPadNativeFullscreen = isIPad && !elementFullscreen && typeof video.webkitEnterFullscreen === 'function';
const videoOnlyFullscreen = !elementFullscreen && !isIPad && typeof video.webkitEnterFullscreen === 'function';
fsBtn.hidden = !elementFullscreen && !iPadNativeFullscreen && (!videoOnlyFullscreen || isStandalone);
const fsGuide = h('div', { class: 'cc-menu fs-guide', id: 'fs-guide', role: 'dialog', 'aria-label': T('Watch fullscreen'), hidden: true });
fsBtn.after(fsGuide);
if (videoOnlyFullscreen) { fsBtn.setAttribute('aria-haspopup', 'dialog'); fsBtn.setAttribute('aria-controls', 'fs-guide'); fsBtn.setAttribute('aria-expanded', 'false'); }
function guideIcon(paths) {
  const el = h('span', { class: 'fs-guide-icon', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24">${paths}</svg>`;
  return el;
}
function iosHomeSteps() {
  return h('ol', { class: 'fs-guide-steps' },
    h('li', {}, guideIcon('<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>'),
      h('span', {}, T('Tap Share in Safari (behind ••• if you don’t see it).'))),
    h('li', {}, guideIcon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
      h('span', {}, T('Choose Add to Home Screen, keep Open as Web App on, then tap Add.'))),
    h('li', {}, guideIcon('<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M18 10v4"/>'),
      h('span', {}, T('Open Lilin from the new icon and turn your phone sideways.'))));
}
function renderFsGuide() {
  fsGuide.replaceChildren(
    h('p', { class: 'audio-title' }, T('Watch fullscreen')),
    h('p', { class: 'fs-guide-lead' }, T('Safari’s bar can’t be hidden, but Lilin from your Home Screen fills the whole screen, with Skip intro, Up next and subtitles still working.')),
    iosHomeSteps(),
    h('p', { class: 'cc-message' }, T('Where you stopped is saved, so this picks up in Continue watching.')),
    h('div', { class: 'cc-divider', role: 'separator' }),
    h('button', { type: 'button', class: 'cc-item fs-guide-native', onclick: () => { closeFsGuide(); try { video.webkitEnterFullscreen(); } catch { /* not ready yet */ } } },
      T('Use iPhone’s player instead')),
  );
}
function closeFsGuide() { if (fsGuide.hidden) return; fsGuide.hidden = true; fsBtn.setAttribute('aria-expanded', 'false'); }
function openFsGuide() {
  closePlayerMenus('fs');
  renderFsGuide();
  fsGuide.hidden = false;
  fsBtn.setAttribute('aria-expanded', 'true');
  fsGuide.querySelector('button')?.focus({ preventScroll: true });
  showPlayerUi();
}
// Capture phase: the other menu buttons stop their clicks from bubbling.
document.addEventListener('click', (e) => { if (!fsGuide.hidden && !fsGuide.contains(e.target) && !fsBtn.contains(e.target)) closeFsGuide(); }, true);
fsGuide.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFsGuide(); fsBtn.focus(); } });
// Phones watching in a browser tab: the first time something plays, suggest the Home Screen app (no
// browser bars, real fullscreen). "Not now" asks again after a week, "Don't show again" never does.
// Android Chrome hands over its own install prompt, so there the popup has a one-tap Add button.
const isPhone = !isIPad && matchMedia('(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)').matches;
const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { if (!isPhone) return; e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; closeHsNudge(true); });
const HS_NUDGE = 'tip:homescreen-nudge';
const hsNudge = h('div', { class: 'hs-nudge', role: 'dialog', 'aria-labelledby': 'hs-nudge-title', hidden: true });
playerEl.append(hsNudge);
let hsNudgeShown = false; // once per page load at most
function hsNudgeDue() {
  if (!isPhone || isStandalone || hsNudgeShown) return false;
  try {
    const v = localStorage.getItem(HS_NUDGE);
    return v !== 'never' && (!v || Date.now() - Number(v) > 7 * 864e5);
  } catch { return false; }
}
function closeHsNudge(never) {
  if (hsNudge.hidden) return;
  hsNudge.hidden = true;
  try { localStorage.setItem(HS_NUDGE, never ? 'never' : String(Date.now())); } catch { /* private mode */ }
}
function androidHomeSteps() {
  return h('ol', { class: 'fs-guide-steps' },
    h('li', {}, guideIcon('<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>'),
      h('span', {}, T('Tap ⋮ in the corner of your browser.'))),
    h('li', {}, guideIcon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
      h('span', {}, T('Choose Add to Home screen (or Install app), then Add.'))),
    h('li', {}, guideIcon('<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M18 10v4"/>'),
      h('span', {}, T('Open Lilin from the new icon and turn your phone sideways.'))));
}
function openHsNudge() {
  const add = installPrompt && h('button', { type: 'button', class: 'hs-nudge-add', onclick: async () => {
    const p = installPrompt; installPrompt = null;
    try { await p.prompt(); const { outcome } = await p.userChoice; closeHsNudge(outcome === 'accepted'); } catch { closeHsNudge(false); }
  } }, T('Add to Home Screen'));
  hsNudge.replaceChildren(
    h('p', { class: 'hs-nudge-title', id: 'hs-nudge-title' }, T('Better from your Home Screen')),
    h('p', { class: 'fs-guide-lead' }, T('Add Lilin to your Home Screen and it opens like an app: no browser bars, the video fills the whole screen, and Skip intro, Up next and subtitles keep working.')),
    add || (isIPhone ? iosHomeSteps() : androidHomeSteps()),
    h('p', { class: 'cc-message' }, T('Where you stopped is saved, so this picks up in Continue watching.')),
    h('div', { class: 'hs-nudge-actions' },
      h('button', { type: 'button', class: 'hs-nudge-never', onclick: () => closeHsNudge(true) }, T('Don’t show again')),
      h('button', { type: 'button', class: 'hs-nudge-ok', onclick: () => closeHsNudge(false) }, T('Not now'))),
  );
  hsNudge.hidden = false;
}
video.addEventListener('playing', () => {
  if (!hsNudgeDue()) return;
  hsNudgeShown = true;
  setTimeout(() => { if (current && !video.paused) openHsNudge(); else hsNudgeShown = false; }, 1500);
});
document.addEventListener('click', (e) => { if (!hsNudge.hidden && !hsNudge.contains(e.target)) closeHsNudge(false); }, true);
hsNudge.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeHsNudge(false); } });
function toggleFullscreen() {
  if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  if (iPadNativeFullscreen) { try { video.webkitEnterFullscreen(); } catch { /* video not ready yet */ } return; }
  if (videoOnlyFullscreen) { if (fsGuide.hidden) openFsGuide(); else closeFsGuide(); return; }
  if (playerEl.requestFullscreen) {
    playerEl.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      // Phones: turn to landscape for widescreen films (works where the browser allows it).
      if (lastPointer !== 'mouse' && video.videoWidth > video.videoHeight) screen.orientation?.lock?.('landscape').catch(() => {});
    }, () => {});
  } else if (playerEl.webkitRequestFullscreen) playerEl.webkitRequestFullscreen();
}
function updateFullscreen() {
  const on = Boolean(fsElement());
  if (!on) fsExitedAt = Date.now();
  fsBtn.replaceChildren(icon(on ? 'fullscreenExit' : 'fullscreen'));
  fsBtn.setAttribute('aria-label', on ? T('Exit fullscreen (F)') : T('Fullscreen (F)'));
  layoutSubs();
}
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('webkitfullscreenchange', updateFullscreen);
updateFullscreen();
fsBtn.addEventListener('click', toggleFullscreen);
// The iPad Home Screen app always shows the clock and battery bar over the video, and web apps can't hide
// it: only fullscreen does. So there the player goes fullscreen as it opens (that tap counts as the click
// the browser asks for); the button or iPad's own swipe still leaves it.
const iPadHomeScreen = isStandalone && isIPad;
function immersiveOnOpen() {
  if (!iPadHomeScreen || !elementFullscreen || fsElement()) return;
  try {
    const req = playerEl.requestFullscreen ? playerEl.requestFullscreen() : playerEl.webkitRequestFullscreen();
    req?.catch?.(() => {}); // no tap behind it (Up next, a link): the button is still there
  } catch { /* not allowed right now */ }
}

// iPhones don't offer the standard picture-in-picture API to web pages, so the button used to be hidden
// there. Safari's own presentation mode does the same job: use it wherever it's offered.
function webkitPip() {
  return typeof video.webkitSetPresentationMode === 'function' && video.webkitSupportsPresentationMode?.('picture-in-picture') === true;
}
function standardPip() { return Boolean(document.pictureInPictureEnabled && !video.disablePictureInPicture); }
function inPip() { return document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture'; }
function exitPip() {
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  else if (video.webkitPresentationMode === 'picture-in-picture') try { video.webkitSetPresentationMode('inline'); } catch { /* already inline */ }
}
// Safari's presentation mode never says no: it just does nothing. Check a moment later.
function webkitEnterPip(path) {
  try { video.webkitSetPresentationMode('picture-in-picture'); } catch (err) { pipFailed(path, err); return; }
  setTimeout(() => { if (!inPip() && !video.webkitDisplayingFullscreen) pipFailed(`${path} ignored`); }, 2000);
}
// Apps added to the Home Screen on iPhone and iPad can't do picture in picture (WebKit bug 280627), though
// they claim to. Safari can: the button saves the spot and reopens the same video there, at the same second.
// If Apple fixes it, webkitPip() turns true and the button pops out as usual.
const iosHomeScreen = () => isStandalone && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
function openInSafari() {
  const session = current;
  saveProgress(true);
  video.pause();
  const url = new URL('/', location.origin);
  if (session?.kind === 'lib' && session.key) {
    url.searchParams.set('play', session.key);
    if (video.currentTime > 1) url.searchParams.set('t', String(Math.floor(video.currentTime)));
  }
  location.assign(`x-safari-${url.href}`);
  // Nothing opened (older iOS): say how to do it by hand.
  setTimeout(() => { if (!document.hidden) toast(T('iPhone only pops videos out in Safari: open Lilin in Safari to use it')); }, 1500);
}
function enterPip() {
  if (!video.currentSrc || inPip()) return;
  if (iosHomeScreen() && !webkitPip()) openInSafari();
  else if (webkitPip()) webkitEnterPip('webkit');
  else if (standardPip()) {
    video.requestPictureInPicture().catch((err) => {
      // Still inside the tap (the refusal comes straight back), so Safari's own mode can have a go.
      if (typeof video.webkitSetPresentationMode === 'function') { reportPip('standard', err); webkitEnterPip('webkit fallback'); }
      else pipFailed('standard', err);
    });
  } else pipFailed('none');
}
function pipFailed(path, err) {
  toast(T(video.readyState < 1 ? 'Picture in picture works once the video has started' : 'Picture in picture isn’t available right now'));
  reportPip(path, err);
}
// The browser's own reason goes to the server log, so failures on phones can be fixed without the phone.
function reportPip(path, err) {
  const v = video;
  const facts = {
    path, error: err ? `${err.name}: ${err.message}` : null,
    standard: Boolean(document.pictureInPictureEnabled), webkit: typeof v.webkitSetPresentationMode === 'function',
    webkitPip: v.webkitSupportsPresentationMode?.('picture-in-picture') ?? null, webkitFullscreen: v.webkitSupportsPresentationMode?.('fullscreen') ?? null,
    mode: v.webkitPresentationMode ?? null, readyState: v.readyState, paused: v.paused, size: `${v.videoWidth}x${v.videoHeight}`,
    src: String(v.currentSrc || '').split(/[?#]/)[0].split('/').slice(-2).join('/'), standalone: isStandalone, night: night.captured,
    tracks: v.textTracks?.length ?? null,
  };
  api('/api/client/report', jsonPost({ kind: 'pip', detail: JSON.stringify(facts) })).catch(() => {});
}
function togglePip() { if (inPip()) exitPip(); else enterPip(); }
const syncPipBtn = () => { pipBtn.hidden = !standardPip() && !webkitPip() && !iosHomeScreen(); };
syncPipBtn();
video.addEventListener('loadedmetadata', syncPipBtn);
pipBtn.replaceChildren(icon('pip'));
pipBtn.addEventListener('click', togglePip);
// Phones: leaving the browser mid-film pops the video out (Chrome asks the page through Media Session).
if (touchScreen()) {
  try { navigator.mediaSession?.setActionHandler('enterpictureinpicture', () => { if (!video.paused && standardPip()) enterPip(); }); } catch { /* older browser */ }
}

// Buffering: a spinner, after a short wait so quick seeks don't flash it.
let spinTimer = null;
function setSpinner(on) {
  clearTimeout(spinTimer);
  if (on) spinTimer = setTimeout(() => { spinner.hidden = false; }, 300);
  else spinner.hidden = true;
}
video.addEventListener('waiting', () => setSpinner(true));
for (const ev of ['playing', 'canplay', 'pause', 'emptied', 'error']) video.addEventListener(ev, () => setSpinner(false));

// ---- subtitle layout ----
// The subtitle layer covers the picture itself, not the black bars around it, and its text is
// sized to the picture. While the controls or the title bar are showing, the lines move just far
// enough to clear them, and slide back when they fade.
// Size, background and position are kept on this device (player-comfort.js): a phone and a TV
// usually want different ones.
let look = subLook();
try { look = subLook({ size: localStorage.getItem('subs:size'), background: localStorage.getItem('subs:look'), position: localStorage.getItem('subs:position') }); } catch { /* blocked */ }
function applySubLook() {
  for (const [v] of SUB_BACKGROUNDS) subsEl.classList.toggle(`look-${v}`, look.background === v);
}
applySubLook();

function layoutSubs() {
  if (playerEl.hidden) return;
  const box = stage.getBoundingClientRect();
  // Live TV hides the seek bar (display: none reads as top 0, which lifted every line off the screen):
  // clear the channel strip instead.
  const liveStrip = $('#live-strip');
  const seekTop = seekRow.getClientRects().length ? seekRow.getBoundingClientRect().top
    : !liveStrip.hidden ? liveStrip.getBoundingClientRect().top : controlsEl.getBoundingClientRect().bottom - 60;
  if (!upNextEl.hidden || !skipIntroEl.hidden) {
    playerEl.style.setProperty('--up-next-bottom', `${Math.max(16, playerEl.getBoundingClientRect().bottom - seekTop + 12)}px`);
  }
  const overlay = !upNextEl.hidden ? upNextEl : !skipIntroEl.hidden ? skipIntroEl : null;
  const subtitleBottom = overlay ? Math.min(seekTop - 10, overlay.getBoundingClientRect().top - 10) : seekTop - 10;
  const vr = video.getBoundingClientRect();
  let { left, top, width, height } = vr;
  if (video.videoWidth && video.videoHeight) {
    const scale = Math.min(vr.width / video.videoWidth, vr.height / video.videoHeight);
    width = video.videoWidth * scale;
    height = video.videoHeight * scale;
    left += (vr.width - width) / 2;
    top += (vr.height - height) / 2;
  }
  // A phone held upright shows a short strip of picture with empty black above and below: when
  // three lines fit between the picture and the controls, the dialogue goes there instead of over
  // the picture. (The controls take up their space even while faded, so this doesn't jump around.)
  const below = subtitleBottom - (top + height);
  const sizeOver = Math.min(Math.max(height * 0.05, 15), 52) * look.size; // ~1/20 of the picture's height
  const sizeUnder = Math.min(Math.max(width * 0.045, 15), 26) * look.size;
  const outside = below >= sizeUnder * 1.45 * 3 + sizeUnder; // three lines and a gap
  subsEl.classList.toggle('subs-below', outside);
  Object.assign(subsEl.style, {
    left: `${left - box.left}px`, top: `${top - box.top}px`, width: `${width}px`, height: `${height}px`,
    fontSize: `${outside ? sizeUnder : sizeOver}px`,
  });
  // Under the picture there's nothing to clear, so the position choice applies over it only.
  const raise = outside ? 0 : height * subRaise(look.position);
  subsEl.style.setProperty('--raise', `${raise}px`);
  let lift = 0;
  let drop = 0;
  if (playerEl.classList.contains('ui-visible') || !upNextEl.hidden) {
    const gap = height * 0.05;
    lift = Math.max(0, top + height - gap - raise - subtitleBottom);
    if (playerEl.classList.contains('ui-visible')) drop = Math.max(0, $('#player-close').getBoundingClientRect().bottom + 10 - (top + gap));
  }
  subsEl.style.setProperty('--lift', `${lift}px`);
  subsEl.style.setProperty('--drop', `${drop}px`);
}
const playerResize = new ResizeObserver(layoutSubs);
playerResize.observe(stage);
playerResize.observe(controlsEl);
video.addEventListener('loadedmetadata', layoutSubs);

const LOOK_KEYS = { size: 'subs:size', background: 'subs:look', position: 'subs:position' };
function setSubLook(key, v) {
  look = subLook({ ...look, [key]: v });
  try { localStorage.setItem(LOOK_KEYS[key], String(v)); } catch { /* blocked */ }
  ccMenu.querySelectorAll(`[data-look="${key}"] button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(look[key]))));
  applySubLook();
  layoutSubs();
}
// One line each: a label, then the choices side by side.
function subLookRows() {
  const row = (key, label, options) => h('div', { class: 'cc-row', role: 'group', 'aria-label': T('Subtitle {0}', label.toLowerCase()), 'data-look': key },
    h('span', { class: 'cc-nudge-label' }, label),
    h('div', { class: 'cc-choices' }, options.map(([text, v, name]) => h('button', {
      type: 'button', 'data-value': String(v), 'aria-label': name || text, 'aria-pressed': String(String(look[key]) === String(v)),
      onclick: () => setSubLook(key, v),
    }, text))));
  return [
    row('size', T('Size'), SUB_SIZES.map(([text, v, name]) => [text, v, T('{0} subtitles', name)])),
    row('background', T('Style'), SUB_BACKGROUNDS.map(([v, text]) => [text, v, T('{0} behind subtitles', text)])),
    row('position', T('Height'), SUB_POSITIONS.map(([v, text]) => [text, v, T('Subtitles {0} on the picture', text.toLowerCase())])),
  ];
}

// C turns subtitles off, or back on in the language used last (with its second language).
let lastSubLang = null;
let lastSecondLang = null;
async function toggleSubs() {
  if (!current || ccBtn.hidden) return;
  if (ccActive) {
    lastSubLang = ccActive;
    lastSecondLang = ccSecond;
    pickPlayerSub(current, current, { code: null, name: T('Off') }, { quiet: true });
    osd(T('Subtitles off'));
    return;
  }
  let pref = lastSubLang;
  try { pref ||= localStorage.getItem('subs:lang'); } catch { /* blocked */ }
  const l = ccLangs.find((x) => x.code === pref) || ccLangs.find((x) => x.saved) || ccLangs[0];
  if (!l) return;
  const session = current;
  await pickPlayerSub(session, session, l);
  const second = lastSecondLang && ccActive && secondChoices(ccLangs, ccActive).find((x) => x.code === lastSecondLang);
  if (second && current === session) pickSecondSub(session, session, second, { quiet: true });
}

// ---- keyboard ----
const SHORTCUTS = [
  [T('Space or K'), T('Play or pause')],
  ['← →', T('Back or forward 5 s')],
  ['J L', T('Back or forward 10 s')],
  ['↑ ↓', T('Volume')],
  ['M', T('Mute')],
  ['F', T('Fullscreen')],
  ['C', T('Subtitles on or off')],
  ['N', T('Night mode')],
  ['S', T('Skip intro (while it shows)')],
  ['P', T('Picture in picture')],
  [T('I or right-click'), T('Stats for nerds')],
  ['0 – 9', T('Jump to 0% – 90%')],
  ['?', T('These shortcuts')],
];
function toggleHelp() {
  if (helpEl.hidden) {
    closePlayerMenus('help');
    helpEl.replaceChildren(
      h('p', { class: 'help-title' }, T('Keyboard shortcuts')),
      h('dl', {}, SHORTCUTS.filter(([keys]) => keys !== 'C' || !plainMedia(current)).map(([keys, what]) => h('div', {}, h('dt', {}, keys), h('dd', {}, what)))));
  }
  helpEl.hidden = !helpEl.hidden;
}
document.addEventListener('click', (e) => { if (!helpEl.hidden && !helpEl.contains(e.target)) helpEl.hidden = true; });

// Stats for nerds (I, or right-click / long-press on the picture): see player-stats.js.
const signed = (n) => `${n > 0 ? '+' : ''}${Number(n.toFixed(3))} s`;
const streamStats = createStreamStats({
  video, host: playerEl, api,
  context: () => {
    const session = current;
    const lang = ccLangs.find((l) => l.code === ccActive);
    const timing = ccSync && [ccSync.state, ccSync.offset ? T('fixed {0}', signed(ccSync.offset)) : '', ccSync.manual ? T('nudged {0}', signed(ccSync.manual)) : '',
      party?.offsets?.[ccActive] ? T('room {0}', signed(party.offsets[ccActive])) : ''].filter(Boolean).join(', ');
    return {
      title: $('#player-title').textContent,
      delivery: session?.kind === 'clip' ? T('Clip · direct play') : session?.kind === 'note' ? T('Note video · direct play')
        : session?.kind === 'part' ? T('Live 1080p stream, made while the video downloads') : '',
      audio: session?.audio?.activeLabel || '',
      subtitles: lang ? `${lang.name || lang.code}${lang.saved ? T(' · saved on the server') : ''}${nativeSubs ? T(' · drawn by the browser') : ''}${timing ? T(' · timing {0}', timing) : ''}` : '',
      party: party ? [party.isHost ? T('host') : T('guest'), party.connected ? T('connected') : T('reconnecting'), T('clock {0} ms off', Math.round(party.clockOffset)),
        T('rtt {0} ms', Math.round(party.rtt)), $('#watch-members').textContent].filter(Boolean).join(' · ') : '',
      casting: onTvVersion ? T('AirPlay · TV version') : video.webkitCurrentPlaybackTargetIsWireless ? 'AirPlay'
        : video.remote?.state === 'connected' ? T('Remote playback') : inPip() ? T('Picture in picture') : '',
    };
  },
});
function toggleStats() {
  if (!streamStats.isOpen()) closePlayerMenus('stats');
  streamStats.toggle();
}
stage.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleStats(); });

const seekToFraction = (f) => {
  if (!isFinite(video.duration)) return;
  if (party) party.control('seek', video.duration * f);
  else { video.currentTime = video.duration * f; updateTime(); }
};
const nudgeVolume = (d) => {
  if (!canSetVolume) return;
  setVolume((video.muted ? 0 : video.volume) + d);
  osd(T('Volume {0}%', Math.round(video.volume * 100)));
};
const PLAYER_KEYS = {
  ' ': () => togglePlay(true), k: () => togglePlay(true),
  ArrowLeft: () => skip(-5), ArrowRight: () => skip(5), j: () => skip(-10), l: () => skip(10),
  ArrowUp: () => nudgeVolume(0.05), ArrowDown: () => nudgeVolume(-0.05),
  m: toggleMute, f: toggleFullscreen, c: toggleSubs, p: togglePip, '?': toggleHelp, i: toggleStats,
  n: () => setNight(!night.on, true), s: () => { if (!skipIntroEl.hidden) skipIntro(); },
  Home: () => seekToFraction(0), End: () => seekToFraction(0.999),
};
// Keys typed into a menu or a text field are left alone.
const playerKeyTarget = (e) => !playerEl.hidden && !e.ctrlKey && !e.metaKey && !e.altKey
  && !e.target.closest?.('.cc-menu, #up-next, #part-popup, #watch-bar, #live-chat') && !e.target.matches?.('input:not([type="range"]), textarea, select');
document.addEventListener('keydown', (e) => {
  if (!playerKeyTarget(e)) return;
  if (e.key === 'Tab') { showPlayerUi(); return; } // hidden controls can't take focus
  const key = e.key === '/' && e.shiftKey ? '?' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (current?.live && liveKey(key)) { e.preventDefault(); showPlayerUi(); return; }
  const run = PLAYER_KEYS[key] ?? (/^[0-9]$/.test(key) ? () => seekToFraction(Number(key) / 10) : null);
  if (!run) return;
  e.preventDefault(); // also keeps Space from pressing whichever button has focus
  run();
  if (key !== '?') showPlayerUi();
});
document.addEventListener('keyup', (e) => { if (e.key === ' ' && playerKeyTarget(e)) e.preventDefault(); });

// Save and pause the old file before installing a new identity. This runs for both ordinary
// closes and Next episode, which keeps the same overlay, fullscreen element and history entry.
function resetPlayerMedia() {
  saveProgress(true);
  momentsUI.stop(); // friends: leave Clip a moment
  ghostsUI.stop(); // ghost reactions
  playedSince = 0; playTick = null;
  seekPreview.load(null);
  const old = current;
  resetAudioSelection(old);
  creditsCard?.leave();
  current = null;
  old?.abort?.abort();
  old?.nextAbort?.abort();
  leaveWatchRoom();
  video.pause();
  if (sourceMetadataHandler) video.removeEventListener('loadedmetadata', sourceMetadataHandler);
  sourceMetadataHandler = null;
  resetCasting();
  clearSubTracks();
  ccLangs = [];
  closeCcMenu();
  ccBtn.hidden = true;
  closeAudioMenu();
  audioBtn.hidden = true;
  closeNightMenu();
  closeQualityMenu();
  closeFsGuide();
  qualityBtn.hidden = true;
  helpEl.hidden = true;
  endSeek(false);
  audioWatch = null;
  lastSave = lastPush = 0;
  lastTap = { at: 0, side: 0, uiWas: false, skipped: false };
  skipTotal = skipAt = 0;
  clearTimeout(osdTimer);
  osdEl.classList.remove('show');
  $('#player-note').hidden = true;
  $('#player-error').hidden = true;
  setSpinner(false);
  video.removeAttribute('src');
  video.load();
  updateUpNext();
}

async function preparePlayerSource(f, watchSession, signal) {
  const ask = `variant=${baseVariant()}&quality=${wantedQuality(f)}`;
  const link = await api(watchSession ? `${watchSession.base}/play-link?clientId=${encodeURIComponent(watchClient)}&${ask}`
    : `/api/play-link?kind=${f.kind}&id=${encodeURIComponent(mediaId(f))}&${ask}`, { signal });
  const response = await fetch(link.url, { headers: { Range: 'bytes=0-0' }, signal });
  if (!response.ok) {
    let message = T('The server responded with {0}.', response.status);
    try { message = (await response.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  response.body?.cancel()?.catch(() => {});
  return link;
}

// Player heading: the TMDB show name, then the episode spelled out with its TMDB title,
// e.g. "House · Season 3, Episode 2: Cane & Able". Films and clips keep their own title.
function playerEpisodeText(f) {
  if (f.season == null) return '';
  if (f.episode == null) return T('Season {0}', f.season);
  const eps = f.episodeEnd != null && f.episodeEnd > f.episode ? T('Episodes {0}–{1}', f.episode, f.episodeEnd) : T('Episode {0}', f.episode);
  return T('Season {0}, {1}{2}', f.season, eps, f.episodeName ? `: ${f.episodeName}` : '');
}
function setPlayerTitle(f) {
  const show = f.show != null ? state.libraryShows.find((s) => s.id === f.show) : null;
  const name = show?.title || f.filmTitle || f.title || '';
  const episode = playerEpisodeText(f);
  $('#player-title').replaceChildren(name, ...(episode ? [h('span', { class: 'player-episode' }, `${name ? ' \u00b7 ' : ''}${episode}`)] : []));
  $('#player-title').title = $('#player-title').textContent;
}

// Before a library video starts: a quick connection test (connection.js) and the bitrates of its versions. The best
// version that fits the connection plays (a version picked by hand stays), and when even the lightest is too heavy,
// the live 1080p/720p stream of it. Waits at most ~3 s; unknown speed or bitrates = as before.
let fitToken = 0;
async function fitToConnection(f) {
  const vers = f.versions?.length > 1 ? f.versions : [f];
  const [mbps, rates] = await Promise.all([
    speedWithin(3000),
    api(`/api/bitrates?ids=${vers.map((v) => encodeURIComponent(v.id)).join(',')}`).then((r) => r.bitrates || {}).catch(() => ({})),
  ]);
  if (!mbps) return f;
  const rated = vers.map((v) => ({ ...v, kbps: rates[v.id]?.kbps || 0, height: rates[v.id]?.height || 0 }));
  const key = f.versionKey;
  const handPicked = key && versionPicks[key];
  const pick = (vers.length > 1 && !handPicked && versionForSpeed(rated, mbps)) || rated.find((v) => v.id === f.id) || rated[0];
  const chosen = pick.id === f.id ? f : libraryFile({ ...vers.find((v) => v.id === pick.id), versions: f.versions });
  const stream = streamFor(pick.kbps, mbps, pick.height);
  if (pick.id !== f.id || stream) console.info(`[connection] ${mbps} Mbps: ${pick.versionLabel || pick.name || pick.id} (${pick.kbps} kbps)${stream ? `, live ${stream}p stream` : ''}`);
  const note = stream ? T('Your connection is slow for this video: playing a lighter {0}p stream.', stream)
    : pick.id !== f.id ? T('Playing the {0} version: it suits your connection.', (pick.versionLabel || '').split(' · ')[0] || T('lighter')) : '';
  return { ...chosen, speedStream: stream, speedNote: note };
}

async function loadPlayerMedia(f, opts = {}) {
  if (f.kind === 'lib' && !opts.fitted && !(opts.startAt > 0) && !opts.watchRoom && !party && !opts.prepared) {
    const token = ++fitToken;
    setSpinner(true);
    const fitted = await fitToConnection(f).catch(() => f);
    if (token !== fitToken) return;
    return loadPlayerMedia(fitted, { ...opts, fitted: true });
  }
  fitToken++;
  resetPlayerMedia();
  const session = current = { ...f, origin: f.origin || f, ready: false, abort: new AbortController(), creditsAt: null, intro: null, introDone: false,
    upNextDismissed: false, upNextBusy: false, upNextError: '', upNextAnnounced: null, autoLeft: null, autoTimer: null };
  syncSettingsBtn();
  setPlayerTitle(f);
  pauseScreen.load(f.live || !['lib', 'part'].includes(f.kind) ? null : session); // the pause screen's title
  momentsUI.sync(); // friends: the Clip a moment button for library videos
  ghostsUI.sync(); // ghost reactions on this film or episode
  playerEl.classList.toggle('is-clip', plainMedia(f));
  updatePlayState();
  updateTime();
  showPlayerUi();
  setSpinner(true);
  renderNightMenu();
  // Clips use the same player without what only library media has: subtitles, audio choices,
  // casting, Watch Together, Up next and resume points. They play straight from the clips folder.
  if (f.kind === 'clip') {
    renderParty();
    const clipBase = `/api/clips/${encodeURIComponent(f.id)}/preview`;
    seekPreview.load({ indexUrl: clipBase, sheetUrl: (n, key) => `${clipBase}/${n}.jpg?k=${key}` });
    setPlayerSource(`/api/clips/${encodeURIComponent(f.id)}/video`, session);
    video.play().catch(() => { /* autoplay blocked: the controls are there */ });
    return;
  }
  // friends: a shared moment (moments.js), from its own small file; its subtitles drawn like any others.
  if (f.kind === 'moment') {
    renderParty();
    seekPreview.load(null);
    setPlayerSource(`${f.url}/video.mp4`, session);
    if (f.subtitles) {
      // No `default`: Safari would show its own copy of the cues under Lilin's. Modes are set again once
      // the file loads, like the other subtitle tracks.
      const track = h('track', { kind: 'subtitles', srclang: 'und', label: T('Subtitles'), src: `${f.url}/subs.vtt` });
      video.append(track);
      ccActive = 'und'; applySubModes();
      track.addEventListener('load', applySubModes);
    }
    video.play().catch(() => { /* autoplay blocked: the controls are there */ });
    return;
  }
  // A video attached to a note: streamed from the notes store (byte ranges), no timeline previews.
  if (f.kind === 'note') {
    renderParty();
    seekPreview.load(null);
    setPlayerSource(`/api/admin/notes/files/${encodeURIComponent(f.id)}?view=1`, session);
    video.play().catch(() => { /* autoplay blocked: the controls are there */ });
    return;
  }
  // Still downloading: a live stream of what's there so far. The finished file takes over when it's ready.
  if (f.kind === 'part') {
    const watchSession = opts.watchRoom ? attachWatchRoom(opts.watchRoom, opts.roomJoined) : null;
    renderParty();
    seekPreview.load(null);
    playPartial(session, {
      video, playerEl, seekEl, api, $,
      isCurrent: (s) => current === s,
      setSource: setPlayerSource,
      setHlsSource,
      room: () => party,
      onMetadata: (s) => {
        // Subtitles once the stream is open (before that the download may not even have its file list). They come
        // from OpenSubtitles and are saved where the finished file goes, so they stay on after switching to it.
        if (!s.subsAsked) { s.subsAsked = true; setupPlayerSubs(f, s); }
        if (party) { party.sync(); return; }
        // Resume, but not further than the download has reached.
        const saved = savedProgress(s);
        const reach = (s.part?.inOrder || 0) * video.duration - 20;
        const at = saved && saved.time < video.duration - 90 ? Math.min(saved.time, reach) : 0;
        if (at > 30) { video.currentTime = at; }
      },
      setSpinner,
      showNote: (text) => { if (gettingReady.active()) return; const note = $('#player-note'); note.textContent = text; note.hidden = false; },
      hideNote: () => { $('#player-note').hidden = true; },
      starting: (status, ready) => {
        if (!gettingReady.active()) return;
        gettingReady.update(ready ? { phase: 'opening' } : { phase: 'starting', startProgress: status?.startProgress, startEta: status?.startEta });
        // A browser that won't start the sound by itself this long after the tap (iPhone): the player's own Play shows.
        if (ready) setTimeout(() => { if (current === session && gettingReady.active() && video.paused) { readyRun = null; gettingReady.hide(); showPlayerUi(); } }, 6000);
      },
      showError: (text) => showPlayerError(text, { title: T('Can’t play this yet') }),
      fullItem: (id) => state.library.find((x) => x.id === id && !x.converting) || null,
      // Asking also moves its sound/video copy to the front of the queue. Nothing Lilin can fix = offer it anyway.
      fullPlays: async (id) => {
        try {
          const a = await api(`/api/media/lib/${encodeURIComponent(id)}/audio?plays=${extraPlayable()}`, { signal: session.abort.signal });
          return !a.known || !a.fixable || Boolean(a.browserSafe && a.aligned && a.videoSafe !== false);
        } catch { return false; }
      },
      switchToFull: (item) => {
        const at = video.currentTime || 0;
        saveProgress(true);
        loadPlayerMedia(libraryFile(item), { startAt: at });
      },
      leave: closeTopOverlay,
      toast,
    });
    // The room connects now, not once the stream opens: the start of the video can take a minute to download,
    // and a viewer who isn't heard from for 20 s leaves the room. Until their video is ready the room waits.
    if (watchSession) {
      watchSession.start().catch((error) => {
        if (current === session && party === watchSession) { leaveWatchRoom(); video.pause(); roomFailed(error); }
      });
    }
    return;
  }
  const watchSession = opts.watchRoom ? attachWatchRoom(opts.watchRoom, opts.roomJoined) : null;
  renderParty();
  // Intro and credits lookups are optional and never delay playback. The intro is needed first, and
  // both share the server's one-at-a-time audio decoding, so the credits are asked for after it.
  loadPlayerIntro(session).finally(() => loadPlayerCredits(session));
  // Asking for the timeline previews early lets the server make them while the video plays.
  const previewBase = `/api/media/${session.kind}/${encodeURIComponent(mediaId(session))}/preview`;
  seekPreview.load({ indexUrl: previewBase, sheetUrl: (n, key) => `${previewBase}/${n}.jpg?k=${key}` });
  let link;
  try { link = opts.prepared || await preparePlayerSource(f, watchSession, session.abort.signal); }
  catch (error) {
    if (current !== session) return;
    if (party === watchSession && watchSession) leaveWatchRoom();
    setSpinner(false);
    if (watchSession) roomFailed(error);
    else showPlayerError(error.message, { title: T('Couldn’t start this video') });
    return;
  }
  if (current !== session) return;
  session.browserName = link.name;
  session.quality = link.quality || 'original';
  session.sourceHeight = link.sourceHeight || null;
  renderQualityMenu();
  const onMeta = () => {
    if (party) { party.sync(); return; }
    if (opts.startAt > 0) { video.currentTime = Math.min(opts.startAt, Math.max(0, video.duration - 1)); return; } // a version switch
    const saved = savedProgress(session);
    if (saved && saved.time > 30 && saved.time < video.duration - 90) {
      video.currentTime = saved.time;
    }
  };
  if (link.ext === 'm3u8' && !playsHls()) attachStream(session, link.url, onMeta, f);
  else setPlayerSource(link.url, session, onMeta);
  if (f.speedNote) osd(f.speedNote);
  if (!party) watchCastTargets();
  if (opts.castHint && canCastFromBrowser) {
    const note = $('#player-note');
    note.textContent = hasAirPlay
      ? T('Tap the AirPlay button in the controls below to pick a TV. No button means there’s no AirPlay TV on this network.')
      : T('Tap the cast button in the controls below to pick a TV. No button means there’s no Chromecast on this network.');
    note.hidden = false;
    airplayBtn.classList.add('is-hint');
  }
  setupPlayerSubs(f, session);
  watchAudio(f, session);
  if (watchSession) {
    try { await watchSession.start(); }
    catch (error) { if (current === session && party === watchSession) { leaveWatchRoom(); video.pause(); roomFailed(error); } }
  } else video.play().catch(() => { /* autoplay blocked: the controls are there */ });
}

async function openPlayer(f, opts = {}) {
  openPlayerShell(opts);
  nightWanted = nightRemembered(f);
  if (nightWanted !== night.on && nightAvailable()) night.set(nightWanted); // opening the player is a click
  return loadPlayerMedia(f, opts);
}
// The player over everything, with nothing loaded yet: openPlayer loads a video into it, Getting it ready waits in it.
function openPlayerShell(opts = {}) {
  const opener = opts.opener || document.activeElement;
  themeMusic.stop(); // theme: pressing play ends the show page's song
  (opts.replace ? swapTopOverlay : pushOverlay)(() => {
    stopReady();
    resetPlayerMedia();
    clearSleep();
    setTheme(pageThemeColor);
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    exitPip();
    playerEl.hidden = true;
    streamStats.close();
    document.body.style.overflow = '';
    document.body.classList.remove('in-player');
    opener?.focus?.({ preventScroll: true });
    if (state.view === 'library') { libraryRenderPending = true; renderUpdatedLibrary(); }
  });
  playerEl.hidden = false;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('in-player');
  setTheme('#000000');
  $('#player-close').focus({ preventScroll: true });
  immersiveOnOpen();
}

// ---- Up next ----
const upNextEl = $('#up-next');
const upNextTitle = $('#up-next-title');
const upNextArt = $('#up-next-art');
const upNextPlay = $('#up-next-play');
const upNextDismiss = $('#up-next-dismiss');
const upNextError = $('#up-next-error');
const upNextStatus = $('#up-next-status');
let upNextLayoutSignature = '';
// The credits card (credits-card.js): at the credits the picture moves into a corner and Up next joins the song.
const creditsCard = createCreditsCard({ h, api, playerEl, stage, video, upNextEl,
  gapBelow: () => (seekRow.getClientRects().length ? Math.max(16, stage.getBoundingClientRect().bottom - seekRow.getBoundingClientRect().top) : 96),
  onChange: () => { requestAnimationFrame(layoutSubs); },
  look: (ref) => creditsLook(ref), episode: (next) => creditsEpisode(next), fmtRuntime: (min) => fmtRuntime(min),
  fmtDay: (date) => date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) });
// The card's backdrop (the server's textless 1440p+ pick, at the size this screen needs) and the title's logo.
async function creditsLook(ref) {
  const page = await pageInfo(ref.type, ref.id).catch(() => null);
  const show = ref.type === 'tv' ? state.libraryShows.find((x) => x.tmdbId === ref.id) : null;
  const film = ref.type === 'movie' ? state.library.find((f) => f.tmdbId === ref.id && f.backdrop) : null;
  const backdrop = bigArt(page?.backdrop || show?.backdrop || film?.backdrop || null, Infinity);
  let logo = null;
  if (page?.logo?.url) {
    const tone = await logoTone(page.logo.url).catch(() => null);
    logo = { url: innerWidth * (devicePixelRatio || 1) > 900 ? page.logo.url.replace('/t/p/w500/', '/t/p/original/') : page.logo.url, dark: tone !== null && tone < 0.3 };
  }
  return { backdrop, logo };
}
// The next episode's synopsis, runtime and air date, from TMDB's season data (kept an hour).
async function creditsEpisode(next) {
  const show = state.libraryShows.find((x) => x.id === next.show);
  if (!show?.tmdbId || next.season == null || next.episode == null || !state.status?.search) return next.overview ? { overview: next.overview } : null;
  const d = await cachedFor(`/api/tv/${show.tmdbId}/season/${next.season}`, 60 * 60 * 1000).catch(() => null);
  const ep = d?.episodes?.find((e) => e.number === next.episode);
  return ep ? { overview: ep.overview, runtime: ep.runtime, airDate: ep.airDate } : null;
}
let autoChain = 0; // episodes started by the countdown since the last key press, click or tap

// ---- skip intro ----
// The opening titles come from the server (credits.js): a chapter, or the theme song shared with the
// season's other episodes. The button shows while they play; Settings → Intros can skip them on its own,
// once per playback, so seeking back to watch the intro is left alone. In Watch Together only the
// host can seek, so only the host gets the button, and nothing skips on its own.
const skipIntroEl = $('#skip-intro');
async function loadPlayerIntro(session) {
  try {
    const data = await api(`/api/media/${session.kind}/${encodeURIComponent(mediaId(session))}/intro`, { signal: session.abort.signal });
    if (current !== session) return;
    const start = Number(data.intro?.start), end = Number(data.intro?.end);
    session.intro = Number.isFinite(start) && Number.isFinite(end) && end - start >= 5 ? { start, end } : null;
    updateSkipIntro();
  } catch { /* No known intro: no button. */ }
}
function introShowing(session = current) {
  const intro = session?.intro;
  if (!intro || !session.ready || (party && !party.isHost) || seeking != null || video.ended) return false;
  const t = video.currentTime;
  return t >= intro.start - 0.25 && t < intro.end - 1;
}
function updateSkipIntro() {
  const session = current;
  const show = introShowing(session);
  if (show && prefs().skipIntro === 'auto' && !party && !session.introDone && !video.paused && !video.seeking) {
    skipIntro();
    return;
  }
  if (skipIntroEl.hidden === !show) return;
  skipIntroEl.hidden = !show;
  playerEl.classList.toggle('has-skip-intro', show);
  layoutSubs();
}
function skipIntro() {
  const session = current;
  if (!introShowing(session)) return;
  session.introDone = true;
  if (party) party.control('seek', session.intro.end);
  else { video.currentTime = session.intro.end; updateTime(); }
  updateSkipIntro();
}
skipIntroEl.addEventListener('click', (e) => { e.stopPropagation(); skipIntro(); });
for (const event of ['timeupdate', 'seeking', 'seeked', 'play', 'ended', 'emptied']) video.addEventListener(event, updateSkipIntro);

async function loadPlayerCredits(session) {
  try {
    const data = await api(`/api/media/${session.kind}/${encodeURIComponent(mediaId(session))}/credits`, { signal: session.abort.signal });
    if (current !== session) return;
    session.creditsAt = Number.isFinite(data.creditsAt) && data.creditsAt > 0 ? data.creditsAt : null;
    updateUpNext();
  } catch { /* Unknown credits start: Up next waits for the end of the file. */ }
}

function updateUpNext() {
  const session = current;
  // "End of episode" on the sleep timer: pause where Up next would start (the credits, or the end).
  if (sleep?.kind === 'episode' && session?.ready && !party && seeking == null && !video.seeking
    && isNextEpisodeTime({ ended: video.ended, time: video.currentTime, duration: video.duration, creditsAt: session.creditsAt })) sleepPause();
  const next = session && nextLibraryEpisode(session, state.library, state.libraryShows);
  const externalPlayer = nativeSubs || video.webkitDisplayingFullscreen || inPip()
    || video.webkitCurrentPlaybackTargetIsWireless || video.remote?.state === 'connected' || onTvVersion;
  const show = Boolean(session?.ready && next && !party && !session.upNextDismissed && !externalPlayer && seeking == null && !video.seeking
    && isNextEpisodeTime({ ended: video.ended, time: video.currentTime, duration: video.duration, creditsAt: session.creditsAt }));
  upNextEl.hidden = !show;
  playerEl.classList.toggle('has-up-next', show);
  creditsCard.sync(session, creditsState(session, show, externalPlayer, next));
  // The countdown starts the moment the card does: at the credits, or at the end of the file.
  const counting = show && !session.upNextBusy && !session.upNextError && autoChain < AUTOPLAY_CHAIN && autoplayNextOn();
  if (counting && session.autoLeft == null) startAutoplay(session);
  else if (!counting && session) stopAutoplay(session);
  if (show) {
    const title = [episodeLabel(next), next.episodeName || next.title].filter(Boolean).join(' · ');
    if (upNextTitle.textContent !== title) upNextTitle.textContent = title;
    if (upNextArt.dataset.for !== next.id) {
      upNextArt.dataset.for = next.id;
      upNextArt.replaceChildren(episodeArt(next.still, state.libraryShows.find((s) => s.id === next.show)));
    }
    upNextPlay.disabled = session.upNextBusy;
    const left = session.autoLeft == null ? null : Math.max(1, Math.ceil(session.autoLeft));
    const label = session.upNextBusy ? T('Starting…') : left ? T('Next episode in {0}', left) : T('Next episode');
    if (upNextPlay.textContent !== label) upNextPlay.textContent = label;
    upNextPlay.classList.toggle('counting', left != null);
    upNextPlay.style.setProperty('--auto-progress', left == null ? '0' : String(1 - session.autoLeft / AUTOPLAY_SECONDS));
    // The still fills in with colour during the countdown, like the logo on Getting it ready.
    upNextArt.style?.setProperty('--auto-progress', left == null ? '1' : String(1 - session.autoLeft / AUTOPLAY_SECONDS));
    upNextArt.classList?.toggle('is-filling', left != null);
    upNextPlay.setAttribute('aria-busy', String(session.upNextBusy));
    upNextDismiss.textContent = video.ended ? T('Dismiss') : T('Keep watching');
    upNextError.textContent = session.upNextError;
    upNextError.hidden = !session.upNextError;
    if (session.upNextAnnounced !== next.id) {
      session.upNextAnnounced = next.id;
      upNextStatus.textContent = session.autoLeft == null ? T('Up next: {0}. Next episode is available.', title)
        : T('Up next: {0}. Plays in {1} seconds unless you choose Keep watching.', title, AUTOPLAY_SECONDS);
    }
  } else if (!session) upNextStatus.textContent = '';
  const signature = show ? `${next.id}|${video.ended}|${session.upNextBusy}|${session.upNextError}` : '';
  if (signature !== upNextLayoutSignature) { upNextLayoutSignature = signature; layoutSubs(); }
}

// What the credits card needs: whether the credits are rolling (their start is known and the picture is past it),
// whether Up next shows, and which title's soundtrack to look in.
function creditsState(session, next, externalPlayer, nextEp = null) {
  if (!session) return { rolling: false };
  const rolling = Boolean(session.ready && !party && !session.live && !externalPlayer && !session.upNextDismissed && seeking == null
    && ['lib', 'part'].includes(session.kind) && nextEpisodePromptAt(video.duration, session.creditsAt) != null && video.currentTime >= session.creditsAt);
  if (!rolling) return { rolling };
  const show = session.show != null ? state.libraryShows.find((x) => x.id === session.show) : null;
  const ref = !state.status?.search ? null : show?.tmdbId ? { type: 'tv', id: show.tmdbId }
    : !show && session.season == null && session.tmdbId ? { type: 'movie', id: session.tmdbId } : null;
  return { rolling, next, nextEp: next ? nextEp : null, ref, title: show?.title || session.filmTitle || session.title || '' };
}

// Counts real seconds while the credits play (or after the end); a pause during the credits pauses it.
function startAutoplay(session) {
  session.autoLeft = AUTOPLAY_SECONDS;
  let last = Date.now();
  const tick = () => {
    if (current !== session || session.autoLeft == null) return;
    const now = Date.now();
    if (!video.paused || video.ended) session.autoLeft -= (now - last) / 1000;
    last = now;
    if (session.autoLeft <= 0) {
      session.autoLeft = null; session.autoTimer = null;
      autoChain++;
      playNextEpisode();
      return;
    }
    session.autoTimer = setTimeout(tick, 250);
    updateUpNext();
  };
  session.autoTimer = setTimeout(tick, 250);
}
function stopAutoplay(session) {
  if (session.autoTimer) clearTimeout(session.autoTimer);
  session.autoTimer = null; session.autoLeft = null;
}

async function playNextEpisode() {
  const session = current;
  if (!session || session.upNextBusy || party || session.upNextDismissed) return;
  const next = nextLibraryEpisode(session, state.library, state.libraryShows);
  if (!next) { updateUpNext(); return; }
  session.upNextBusy = true; // synchronous, including a second click before the first await
  session.upNextError = '';
  updateUpNext();
  session.nextPressed = true; // this one is watched now, not resumed at the credits (sticks through the pause save)
  video.pause();
  saveProgress(true);
  session.nextAbort = new AbortController();
  const timeout = setTimeout(() => session.nextAbort?.abort(), 15000);
  try {
    // Keep the paused current file available if signing or checking the next stream fails.
    const file = libraryFile(next);
    const prepared = await preparePlayerSource(file, null, session.nextAbort.signal);
    if (current !== session || party || session.upNextDismissed) return;
    const stillNext = nextLibraryEpisode(session, state.library, state.libraryShows);
    if (stillNext?.id !== next.id) throw new Error(T('This episode is no longer available. Try again in a moment.'));
    await loadPlayerMedia(file, { prepared });
  } catch (error) {
    if (current !== session || session.upNextDismissed) return;
    session.upNextError = error.name === 'AbortError' ? T('Starting took too long. Try Next episode again.') : T('{0} Try Next episode again.', error.message);
    upNextStatus.textContent = session.upNextError;
  } finally {
    clearTimeout(timeout);
    if (current === session) { session.upNextBusy = false; session.nextAbort = null; updateUpNext(); }
  }
}
upNextPlay.addEventListener('click', playNextEpisode);
upNextDismiss.addEventListener('click', () => {
  if (!current) return;
  current.upNextDismissed = true;
  current.nextAbort?.abort();
  updateUpNext();
});
for (const event of ['timeupdate', 'ended', 'seeking', 'seeked', 'durationchange', 'loadedmetadata',
  'webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged',
  'webkitcurrentplaybacktargetiswirelesschanged']) video.addEventListener(event, updateUpNext);
if (hasRemotePlayback) for (const event of ['connect', 'disconnect']) video.remote.addEventListener(event, updateUpNext);

video.addEventListener('timeupdate', () => saveProgress());
for (const event of ['seeking', 'waiting']) video.addEventListener(event, () => { countPlayed(); playTick = null; });
// Someone is still there: the countdown may chain another AUTOPLAY_CHAIN episodes.
for (const event of ['keydown', 'pointerdown']) document.addEventListener(event, () => { autoChain = 0; }, true);
video.addEventListener('pause', () => saveProgress(true));
// A video that already played and then errors lost its connection (Lilin restarted, Wi-Fi blip); it didn't
// turn unplayable. Fetch a fresh link and carry on where it stopped. At most 3 reconnects per spot.
let reconnect = null;
// The error card over the picture: what went wrong, a way on (Try again) and a way out (Back). While it shows,
// the play button and spinner under it are hidden (style.css), so nothing pokes out around it.
function showPlayerError(text, { title = T('Something went wrong'), retry = retryPlayer, retryLabel = T('Try again'), busy = false } = {}) {
  if (gettingReady.active()) { readyRun = null; gettingReady.hide(true); } // the error card says what happened
  const err = $('#player-error');
  const action = (label, cls, onclick) => h('button', { type: 'button', class: cls, onclick: (e) => { e.stopPropagation(); onclick(); } }, label);
  err.replaceChildren(
    h('p', { class: 'player-error-title' }, title),
    h('p', { class: 'player-error-text' }, text),
    busy ? h('span', { class: 'bulb-loader', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')) : null,
    h('div', { class: 'player-error-actions' },
      !busy && retry ? action(retryLabel, 'play-btn', retry) : null,
      action(T('Back'), 'btn-glass', closeTopOverlay)));
  err.setAttribute('role', 'alert');
  err.hidden = false;
  setSpinner(false);
  if (!busy) err.querySelector('button')?.focus({ preventScroll: true });
}
// Start the same video again from where it stopped (or tune the channel in again).
function retryPlayer() {
  const session = current;
  if (!session) return;
  $('#player-error').hidden = true;
  const channel = session.live?.channel?.id;
  if (channel) { tuneIn(channel, true); return; }
  const at = session.ready ? video.currentTime || 0 : 0;
  loadPlayerMedia(session.origin || { ...session }, at > 0 ? { startAt: at } : {});
}
// Joining or keeping the room failed. On a channel the server's room wording ("ask someone to start a new
// one") makes no sense, so it says the channel dropped out; elsewhere the video can carry on without the room.
function roomFailed(error) {
  if (current?.live) {
    showPlayerError(T('Tune in again to catch up with the channel.'), { title: T('This channel dropped out'), retryLabel: T('Tune in again') });
    return;
  }
  showPlayerError(error.message, { title: T('Couldn’t join the room'), retryLabel: T('Watch on your own'),
    retry: () => { const session = current; if (!session) return; $('#player-error').hidden = true; loadPlayerMedia(session.origin || { ...session }); } });
}
function startReconnect(session) {
  const at = video.currentTime || 0;
  const key = mediaId(session);
  if (reconnect?.key !== key || Math.abs(reconnect.at - at) > 30 || Date.now() - reconnect.since > 180000) reconnect = { key, at, since: Date.now(), tries: 0 };
  if (reconnect.tries++ >= 3) return false;
  showPlayerError(T('Lost the connection to Lilin. Reconnecting…'), { title: T('Reconnecting'), busy: true });
  const f = { ...session };
  (async () => {
    for (const wait of [1500, 3000, 5000, 8000, 12000, 15000, 15000]) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (current !== session || party) return;
      try {
        const prepared = await preparePlayerSource(f, null, session.abort.signal);
        if (current !== session || party) return;
        await loadPlayerMedia(f, { prepared, startAt: at });
        return;
      } catch (error) { if (error.name === 'AbortError') return; /* still restarting: wait and try again */ }
    }
    if (current !== session) return;
    setSpinner(false);
    showPlayerError(T('Lilin can’t be reached right now. Check your connection and try again in a minute.'), { title: T('Can’t reach Lilin') });
  })();
  return true;
}
video.addEventListener('error', () => {
  if (!current?.sourceUrl || video.currentSrc !== current.sourceUrl || current.kind === 'part') return;
  if (!party && !plainMedia(current) && current.ready && (video.error?.code === 2 || video.currentTime > 0) && startReconnect(current)) return;
  const err = $('#player-error');
  showPlayerError(current.kind === 'note'
    ? T('This video can’t play in this browser. Its format isn’t supported here; open the file link under the video to download it, or try another browser.')
    : current.kind === 'clip'
    ? T('This clip can’t play in this browser. Its video format (often AV1) isn’t supported here; try another browser, or share it to get a copy that plays everywhere.')
    : T('This video can’t play in this browser yet. Lilin makes a version that plays here by itself: try again in a few minutes.'),
  { title: T('Can’t play here') });
  // When the note below the video says a version is being made, that note is the explanation.
  err.hidden = !$('#player-note').hidden;
});
$('#player-close').addEventListener('click', closeTopOverlay);
window.addEventListener('pagehide', () => { saveProgress(true); party?.close(); });
window.addEventListener('pageshow', (event) => {
  if (event.persisted && party?.closed) { const token = party.state.token; leaveWatchRoom(false); video.pause(); offerWatchRoom(token); }
});

// ---------- search box + tabs ----------
const input = $('#q');
const notesView = createNotesView({ h, icon, api, jsonPost, toast, copyText, query: () => pageFilters.notes,
  playVideo: (a) => openPlayer({ kind: 'note', id: a.fileId, key: `note:${a.fileId}`, title: a.name }),
  overlay: { push: pushOverlay, close: closeTopOverlay },
  clearQuery: () => clearFilter('notes') });

function renderView() {
  if (state.view === 'discover') renderDiscover();
  if (state.view === 'live') renderLive();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'activity') renderActivity();
  if (state.view === 'house') renderHouse();
  if (state.view === 'clips') renderClips();
  if (state.view === 'you') renderSettings();
  if (state.view === 'notes') { filterField('notes', T('Search notes by keyword'), () => notesView.load()); notesView.render(); }
  renderBackLink();
}

// ---------- settings ----------
// Everyone: name, colours (a preset or their own four), and how Lilin behaves for them. The owner
// also gets the server's rules (auto-delete) and the people who use it. Changes save straight away.
let saveMeTimer = null;
// Profile pictures: yours (person = state.me) or, for the owner, anyone's in People (person.id).
function editPicture({ person, opener, over = false, done = null }) {
  const mine = person.id === state.me?.id;
  people.choosePhoto(async (file) => {
    let body;
    try {
      body = await people.editor({ file, title: mine ? T('Your picture') : T('{0}’s picture', person.name),
        upload: async (blob) => {
          if (mine) state.me = (await people.saveMine(blob)).me;
          else await people.saveFor(person.id, blob);
        },
        done: () => closeTopOverlay(),
      });
    } catch (err) { toast(err.message); return; }
    $('#picker-body').replaceChildren(...body);
    for (const el of [$('#picker'), $('#picker-backdrop')]) el.classList.toggle('over-pf', Boolean(over));
    pushOverlay(showSheet($('#picker'), $('#picker-backdrop'), async () => {
      if (!mine && state.me?.isOwner) await loadPeople();
      if (settingsOpen()) renderSettings();
      done?.();
      if (over) setTimeout(() => { for (const el of [$('#picker'), $('#picker-backdrop')]) el.classList.remove('over-pf'); }, 320);
      opener?.isConnected && opener.focus({ preventScroll: true });
    }));
  });
}
async function removePicture({ person }) {
  const mine = person.id === state.me?.id;
  try {
    if (mine) state.me = (await people.saveMine(null)).me;
    else { await people.saveFor(person.id, null); await loadPeople(); }
    if (mine) renderMeButton();
    if (settingsOpen()) renderSettings();
  } catch (err) { toast(err.message); }
}

async function saveMe(patch, msg = T('Saved')) {
  try {
    state.me = (await api('/api/me', jsonPost(patch))).me;
    if (msg) toast(msg);
  } catch (err) { toast(err.message); }
}
async function saveRules(patch) {
  try {
    state.rules = (await api('/api/admin/settings', jsonPost(patch))).settings;
    toast(T('Saved for everyone'));
    await loadLibrary(); // countdowns follow the new rules
  } catch (err) { toast(err.message); }
  renderSettings();
}
async function loadPeople() {
  const [u, a] = await Promise.allSettled([api('/api/admin/users'), api('/api/access')]);
  if (u.status === 'fulfilled') { state.people = u.value.users; state.peopleError = null; } else state.peopleError = u.reason.message;
  state.access = a.status === 'fulfilled' ? a.value : { configured: true, error: a.reason.message, invites: [] };
}

// ---------- what's new ----------
// After an update, everyone sees its notes once (whats-new.json on the server, via /api/status). The
// popup waits while a video plays or another sheet is open, and closing it marks the update as seen.
// A page left open across an update offers a reload, since it still runs the old app (also not mid-video).
const whatsNewView = { open: false, retry: null, build: null, staleNoted: false, opener: null, kind: 'all' };
const updateDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: new Date().getFullYear() === Number(d.slice(0, 4)) ? undefined : 'numeric' });
// The header's What's new button opens the whole history at any time, and lights up while an update
// hasn't been seen yet.
function renderWhatsNewButton() {
  const btn = $('#whats-new-btn');
  const wn = state.status?.whatsNew;
  btn.hidden = !wn;
  const unseen = wn?.unseen?.length || 0;
  btn.classList.toggle('has-new', unseen > 0);
  btn.querySelector('.news-count').hidden = !unseen;
  btn.querySelector('.news-count').textContent = unseen;
  btn.setAttribute('aria-label', unseen ? T('What’s new: {0} new {1}', unseen, unseen === 1 ? T('update') : T('updates')) : T('What’s new: every update to Lilin'));
}
$('#whats-new-btn').addEventListener('click', () => {
  // unseen updates first, as the popup would show them; otherwise the full history
  const wn = state.status?.whatsNew;
  if (wn?.unseen?.length && !whatsNewView.open) { clearTimeout(whatsNewView.retry); openWhatsNew(wn.unseen, { latest: wn.latest }); }
  else showUpdateHistory();
});
function maybeShowWhatsNew() {
  const wn = state.status?.whatsNew;
  renderWhatsNewButton();
  if (!wn) return;
  whatsNewView.build ??= wn.build;
  const stale = Boolean(wn.build && whatsNewView.build !== wn.build);
  if (!wn.unseen?.length) {
    if (stale && !whatsNewView.staleNoted) {
      // Like the popup, the reload hint waits until nothing is playing (it's annoying mid-film).
      clearTimeout(whatsNewView.retry);
      if (!$('#player').hidden || document.hidden) { whatsNewView.retry = setTimeout(maybeShowWhatsNew, 15000); return; }
      whatsNewView.staleNoted = true;
      toast(T('Lilin was updated. Reload the page to get the new version.'));
    }
    return;
  }
  if (whatsNewView.open) return;
  clearTimeout(whatsNewView.retry);
  if (overlayStack.length || !$('#player').hidden || document.hidden) {
    whatsNewView.retry = setTimeout(maybeShowWhatsNew, 15000);
    return;
  }
  openWhatsNew(wn.unseen, { latest: wn.latest, stale });
}
function markUpdatesSeen(latest) {
  if (!latest || state.me?.settings?.seenUpdate === latest) return;
  if (state.status?.whatsNew) state.status.whatsNew.unseen = [];
  renderWhatsNewButton();
  saveMe({ seenUpdate: latest }, null);
}
// Each note is a new feature, an improvement or a bug fix (its "kind"); the sheet's tabs show one kind at a time.
const UPDATE_KINDS = [['all', 'All'], ['new', 'New'], ['improved', 'Improved'], ['fix', 'Fixes']];
const updateKind = (i) => (i.kind === 'new' || i.kind === 'fix' ? i.kind : 'improved');
function updateEntry(e, heading = true, kind = 'all') {
  const items = kind === 'all' ? e.items : e.items.filter((i) => updateKind(i) === kind);
  if (!items.length) return null;
  return h('section', { class: 'update' },
    heading && h('div', { class: 'update-head' },
      h('h3', {}, e.title || T('Update')),
      h('time', { datetime: e.date }, updateDate(e.date))),
    h('ul', { class: 'update-items' }, items.map((i) => h('li', { class: `is-${updateKind(i)}` },
      h('span', { class: 'update-bulb', title: T(UPDATE_KINDS.find(([k]) => k === updateKind(i))[1]) }),
      h('div', {}, i.title && h('strong', {}, i.title), i.text && h('p', {}, i.text))))));
}
// updates: newest first. latest: the id to mark seen when the sheet closes (none for the history view).
// replace: the sheet is already open (popup → All updates), so swap its content in place.
function openWhatsNew(updates, { latest = null, stale = false, history = false, replace = false } = {}) {
  const opener = replace ? whatsNewView.opener : document.activeElement;
  whatsNewView.opener = opener;
  whatsNewView.open = true;
  const single = updates.length === 1 && !history;
  const done = h('button', { class: 'play-btn whats-new-done', type: 'button' }, stale ? T('Reload to update') : history ? T('Close') : T('Got it'));
  done.addEventListener('click', () => {
    if (stale) { markUpdatesSeen(latest); setTimeout(() => location.reload(), 150); return; }
    closeTopOverlay();
  });
  // From the popup, the full history is one tap away (closing it marks these updates seen first).
  const allBtn = h('button', { class: 'chip whats-new-all', type: 'button' }, T('All updates'));
  allBtn.addEventListener('click', () => { markUpdatesSeen(latest); showUpdateHistory({ replace: true }); });
  // Tabs (All / New / Improved / Fixes) once there's more than one kind to choose from.
  const counts = { all: 0, new: 0, improved: 0, fix: 0 };
  for (const e of updates) for (const i of e.items) { counts.all++; counts[updateKind(i)]++; }
  const kinds = UPDATE_KINDS.filter(([k]) => counts[k]);
  if (!counts[whatsNewView.kind]) whatsNewView.kind = 'all';
  const list = h('div', { class: 'whats-new-list' });
  const tabs = kinds.length > 2 && h('div', { class: 'segmented whats-new-tabs', role: 'group', 'aria-label': T('Show') });
  const draw = () => {
    const kind = whatsNewView.kind;
    tabs?.replaceChildren(...kinds.map(([k, label]) => h('button', {
      type: 'button', class: `is-${k}`, 'aria-pressed': String(k === kind),
      onclick: () => { if (whatsNewView.kind === k) return; whatsNewView.kind = k; draw(); list.closest('.sheet')?.scrollTo({ top: 0 }); },
    }, k !== 'all' && h('span', { class: 'update-bulb', 'aria-hidden': 'true' }), T(label), h('span', { class: 'whats-new-count' }, counts[k]))));
    const shown = updates.map((e) => updateEntry(e, !single, kind)).filter(Boolean);
    list.replaceChildren(...(shown.length ? shown : [h('p', { class: 'muted' }, T('No updates yet.'))]));
  };
  draw();
  $('#picker-body').replaceChildren(h('div', { class: 'whats-new' },
    h('p', { class: 'whats-new-eyebrow' }, history ? T('Updates') : T('New in Lilin')),
    h('h2', { id: 'picker-title' }, history ? T('What’s new') : single ? updates[0].title || T('What’s new') : T('What’s new')),
    single && h('p', { class: 'picker-sub muted' }, updateDate(updates[0].date)),
    tabs && h('div', { class: 'whats-new-tabbar' }, tabs),
    list,
    stale && h('p', { class: 'set-hint whats-new-stale' }, T('This page is from before the update. Reload it to use what’s new.')),
    h('div', { class: 'whats-new-actions' }, !history && allBtn, done)));
  const close = showSheet($('#picker'), $('#picker-backdrop'), () => {
    whatsNewView.open = false;
    markUpdatesSeen(latest);
    opener?.focus?.({ preventScroll: true });
  });
  if (replace && overlayStack.length) overlayStack[overlayStack.length - 1] = close;
  else pushOverlay(close);
  if (!history) done.focus({ preventScroll: true });
}
// A tapped update notification (?update=<id>): the unseen notes if it's among them, else just that update.
async function openUpdateNote(id) {
  try {
    const fresh = await api('/api/status');
    if (fresh?.whatsNew && state.status) state.status.whatsNew = fresh.whatsNew;
  } catch { /* use what the page has */ }
  const wn = state.status?.whatsNew;
  whatsNewView.build ??= wn?.build;
  const stale = Boolean(wn?.build && whatsNewView.build !== wn.build);
  clearTimeout(whatsNewView.retry);
  if (whatsNewView.open) return;
  if (wn?.unseen?.some((e) => e.id === id)) { openWhatsNew(wn.unseen, { latest: wn.latest, stale }); return; }
  try {
    const { updates } = await api('/api/whats-new');
    const entry = updates.find((e) => e.id === id);
    if (whatsNewView.open) return;
    if (entry) openWhatsNew([entry], { stale });
    else openWhatsNew(updates, { history: true, latest: wn?.latest || null });
  } catch (err) { toast(err.message); }
}
async function showUpdateHistory({ replace = false } = {}) {
  try {
    const { updates } = await api('/api/whats-new');
    if (replace && !whatsNewView.open) return; // closed while loading
    openWhatsNew(updates, { history: true, latest: state.status?.whatsNew?.latest || null, replace });
  } catch (err) { toast(err.message); }
}

// Settings → Language: the whole page is drawn in one language, so changing it reloads the page.
async function pickLanguage(code) {
  if (code === lang) return;
  saveLanguage(code);
  try { await api('/api/me', jsonPost({ language: code })); } catch { /* it still applies on this device */ }
  location.reload();
}
// The account's language wins on a new device; an account without one takes this device's.
function syncLanguage() {
  if (state.me?.via === 'home') return; // the shared home account: each device keeps its own language
  const wanted = prefs().language;
  if (!wanted) { api('/api/me', jsonPost({ language: lang })).catch(() => {}); return; }
  if (wanted === lang) return;
  try {
    if (sessionStorage.getItem('lilin:lang-synced') === wanted) return;
    sessionStorage.setItem('lilin:lang-synced', wanted);
  } catch { return; }
  saveLanguage(wanted);
  location.reload();
}

const settingsRow = (label, hint, control) => h('div', { class: 'set-row' },
  h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), hint && h('div', { class: 'set-hint' }, hint)),
  h('div', { class: 'set-control' }, control));
function toggle(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked, input));
  return h('label', { class: 'switch' }, input, h('span', { 'aria-hidden': 'true' }));
}
function select(options, value, onChange, label) {
  const el = h('select', { class: 'sub-select', 'aria-label': label },
    options.map(([v, text]) => h('option', { value: String(v) }, text)));
  el.value = String(value);
  el.addEventListener('change', () => onChange(el.value));
  return el;
}
const days = (n) => (n ? plural(n, 'day') : T('Never'));

function themeSwatch(key, t, selected, onPick) {
  return h('button', {
    type: 'button', class: 'swatch', 'aria-pressed': String(selected), 'aria-label': T('{0} colours', t.name),
    style: `--sw-bg:${t.bg};--sw-surface:${t.surface};--sw-text:${t.text};--sw-accent:${t.accent};--sw-muted:${t.muted}`,
    onclick: () => onPick(key),
  },
  h('span', { class: 'swatch-preview', 'aria-hidden': 'true' },
    h('i', { class: 'sw-title' }), h('i', { class: 'sw-line' }), h('i', { class: 'sw-card' }), h('i', { class: 'sw-dot' })),
  h('span', { class: 'swatch-name' }, t.name));
}

function appearanceSection() {
  const theme = prefs().theme;
  const active = theme?.preset || state.rules?.defaultTheme || 'lilin';
  const pick = (key) => {
    const next = key === 'custom' ? { preset: 'custom', colors: customColors() } : { preset: key };
    applyTheme(next);
    saveMe({ theme: next }, null).then(renderSettings);
  };
  // The custom editor starts from whatever is showing now.
  const customColors = () => {
    if (theme?.preset === 'custom') return { ...theme.colors };
    const c = themeColors(theme);
    return { bg: c.bg.toLowerCase(), surface: c.surface.toLowerCase(), text: c.text.toLowerCase(), accent: c.accent.toLowerCase() };
  };
  const grid = h('div', { class: 'swatches', role: 'group', 'aria-label': T('Colour themes') },
    Object.entries(THEMES).map(([key, t]) => themeSwatch(key, t, active === key, pick)),
    themeSwatch('custom', { ...themeColors(theme?.preset === 'custom' ? theme : { preset: 'custom', colors: customColors() }), name: T('Your own') }, active === 'custom', pick));

  let editor = null;
  if (active === 'custom') {
    const colors = customColors();
    const contrast = h('p', { class: 'set-hint custom-warn', role: 'status' });
    const check = () => {
      const low = contrastRatio(colors.text, colors.bg) < 4.5 || contrastRatio(colors.text, colors.surface) < 4.5;
      contrast.textContent = low ? T('The text may be hard to read on these backgrounds. Try a lighter or darker text colour.') : '';
    };
    const commit = () => {
      clearTimeout(saveMeTimer);
      saveMeTimer = setTimeout(() => saveMe({ theme: { preset: 'custom', colors: { ...colors } } }, T('Colours saved')), 700);
    };
    editor = h('div', { class: 'custom-colors' },
      THEME_FIELDS.map(([k, label]) => {
        const id = `color-${k}`;
        const picker = h('input', { type: 'color', id, value: colors[k] });
        const hex = h('input', { type: 'text', class: 'hex-input', value: colors[k], maxlength: '7', spellcheck: 'false', 'aria-label': T('{0} colour code', label) });
        const set = (v) => {
          colors[k] = v.toLowerCase();
          picker.value = hex.value = colors[k];
          applyTheme({ preset: 'custom', colors });
          check();
          commit();
        };
        picker.addEventListener('input', () => set(picker.value));
        hex.addEventListener('change', () => {
          const v = hex.value.trim().replace(/^#?/, '#');
          if (/^#[0-9a-f]{6}$/i.test(v)) set(v); else { hex.value = colors[k]; toast(T('Use a colour code like #1f1019')); }
        });
        return h('div', { class: 'color-field' }, h('label', { for: id }, label), h('div', { class: 'color-inputs' }, picker, hex));
      }),
      contrast);
    check();
  }
  return [
    h('h3', { class: 'set-head' }, T('Language')),
    settingsRow(T('Show Lilin in'), T('Used on every device you sign in on. TMDB descriptions follow it too; titles stay as they are.'),
      segmented(LANGUAGES.map((l) => [l.code, l.name]), lang, pickLanguage, T('Language'))),
    h('h3', { class: 'set-head' }, T('Appearance')),
    h('p', { class: 'set-hint' }, T('Only changes how Lilin looks for you, on every device you use.')),
    grid,
    editor,
  ];
}

const MAX_SIZE_OPTIONS = [[0, T('No limit')], [1, T('1 GB')], [2, T('2 GB')], [4, T('4 GB')], [8, T('8 GB')], [15, T('15 GB')], [30, T('30 GB')], [60, T('60 GB')]];
const AUDIO_LANGUAGES = [['', T('Original language')], ['en', T('English')], ['sv', T('Swedish')], ['da', T('Danish')], ['no', T('Norwegian')], ['fi', T('Finnish')],
  ['de', T('German')], ['fr', T('French')], ['es', T('Spanish')], ['it', T('Italian')], ['pt', T('Portuguese')], ['nl', T('Dutch')], ['pl', T('Polish')],
  ['ru', T('Russian')], ['tr', T('Turkish')], ['hi', T('Hindi')], ['ja', T('Japanese')], ['ko', T('Korean')], ['zh', T('Chinese')]];
// ---------- you (was Settings) ----------
// The You tab: your own pages. The root list is the phone's index: each row opens one page (#you/<page>) and says on
// a quiet line what's in it, so most questions are answered without opening anything. Wide screens show the list
// beside the open page; there the root's page is Overview (who you are, For you, your numbers, what you watched
// last). Pages are routes in routes.js ('you/…'); YOU_PAGES draws each one. Above the list: #you-id (who you are)
// and #you-foryou (what's waiting for you: friend requests, moments sent to you, answers to your ideas), which
// also lights the tab's dot (updateYouDot). renderSettings() redraws whichever settings page is open: a You page,
// or an owner page in House (People, Ideas, Server rules).
function renderSettings() {
  if (state.view === 'house') { renderHouse(); return; }
  if (!state.me) { $('#you-rows').replaceChildren(notice(T('Couldn’t load your settings'), T('Reload the page to try again.'))); return; }
  renderMeButton();
  ensureYouSearch();
  loadYouData();
  renderYouIdentity();
  renderForYou();
  renderYouRows();
  renderYouPage();
  updateYouDot();
}
function settingsOpen() { return state.view === 'you' || (state.view === 'house' && ['people', 'ideas', 'rules'].includes(state.sub)); }
function editingSettings() { return editingIn(state.view === 'house' ? '#house-body' : '#you-body'); }

const YOU_PAGES = {
  history: () => profiles.privateList('history', redrawYouPage),
  ratings: () => profiles.privateList('ratings', redrawYouPage),
  liked: () => profiles.privateList('liked', redrawYouPage),
  friends: () => friendsUI.page(), // friends
  moments: () => momentsUI.page(), // friends: Moments
  invite: () => invitePage(),
  account: () => accountPage(),
  look: () => appearanceSection(),
  watching: () => watchingPage(),
  devices: () => devicesPage(),
  'download-settings': () => downloadPrefsPage(),
  ideas: () => { markIdeaAnswersSeen(); return [ideaBox()]; },
};
const YOU_GROUPS = () => [['watching', T('Your watching')], ['people', T('People')], ['settings', T('Settings')], ['ideas', null]];
const sharesSocial = (me = state.me) => Boolean(me?.email && !me.restricted); // friends, a public page
// Friends → Invite someone to Lilin, for people who may invite (the You → Invite page's rule): the Invite sheet's
// Lilin part (invite.js). null: no button.
function friendsInvite() {
  return allowedRoute('you/invite', state.me, state.status) ? (opener) => invite.open({ kind: 'lilin' }, opener) : null;
}

// What the list's lines and For you need: your profile's numbers, friends, moments, your ideas. Fetched when You
// opens (again after half a minute); live updates refresh them on their own.
const youView = { asked: 0 };
function loadYouData() {
  if (Date.now() - youView.asked < 30000) return;
  youView.asked = Date.now();
  const jobs = [profiles.mine().catch(() => null)];
  if (sharesSocial() && !friendsUI.summary().loaded) jobs.push(friendsUI.load());
  if (!momentsUI.summary().loaded) jobs.push(momentsUI.load());
  if (!state.me.isOwner && !ideasView.loaded) jobs.push(loadIdeas());
  Promise.allSettled(jobs).then(() => { updateYouDot(); if (state.view === 'you') renderSettingsWhenStill(); });
}
// The tab's dot, from anywhere: Lilin opening, a live update, an answer in the friend popup.
async function loadForYou() {
  if (!state.me) return;
  await Promise.allSettled([sharesSocial() && friendsUI.load(), momentsUI.load(), !state.me.isOwner && loadIdeas()].filter(Boolean));
  updateYouDot();
}

// Answers to your ideas you haven't looked at: answered after you last opened Ideas and bugs on this device (two
// weeks back at most, so a new device doesn't dig up old ones).
const ideaSeenKey = () => `lilin:idea-answers-seen:${state.me?.id}`;
function newIdeaAnswers() {
  if (!state.me || state.me.isOwner) return [];
  let seen = 0;
  try { seen = Number(localStorage.getItem(ideaSeenKey())) || 0; } catch { /* storage blocked: two weeks back */ }
  const since = Math.max(seen, Date.now() - 14 * 86400000);
  return ideasView.mine.filter((i) => i.answered && i.answered > since);
}
function markIdeaAnswersSeen() {
  const last = Math.max(0, ...ideasView.mine.map((i) => i.answered || 0));
  if (!last || !newIdeaAnswers().length) return;
  try { localStorage.setItem(ideaSeenKey(), String(last)); } catch { /* storage blocked */ }
  requestAnimationFrame(() => { updateYouDot(); if (state.view === 'you') { renderForYou(); renderYouRows(); } });
}
const IDEA_ANSWER_TITLE = () => ({ planned: T('Your idea is planned'), added: T('Your idea is in Lilin now') });
const forYouCount = () => (sharesSocial() ? friendsUI.incomingCount() : 0) + momentsUI.unseenCount() + newIdeaAnswers().length;
function updateYouDot() { if (state.me) setYouDot(forYouCount()); }

// Who you are: picture, name, @username and who sees your page; Edit profile and your public page (Overview: your
// numbers too). The home network's shared account has no page: it's everyone at home.
function youIdentity({ numbers = false } = {}) {
  const me = state.me;
  const d = profiles.mineNow();
  const stats = numbers && d?.stats && h('div', { class: 'you-id-actions you-own' }, profiles.numbers(d));
  if (!me.email) {
    return h('div', { class: 'you-id' }, people.face(me, { size: 56 }),
      h('div', { class: 'you-id-text' }, h('strong', { class: 'you-id-name' }, T('Home network')),
        h('span', { class: 'set-hint' }, T('Shared by everyone at home who opens the server’s local address.'))), stats);
  }
  const vis = { public: T('Everyone'), friends: T('Friends'), private: T('Only me') }[d?.visibility];
  return h('div', { class: 'you-id' },
    people.face(me, { size: 56 }),
    h('div', { class: 'you-id-text' },
      h('strong', { class: 'you-id-name' }, me.name),
      h('span', { class: 'you-id-text set-hint' }, d?.person?.handle && h('span', {}, `@${d.person.handle}`),
        sharesSocial() && vis && h('span', { class: 'pf-vis' }, icon(d.visibility === 'public' ? 'globe' : 'lock'), T('Visible to: {0}', vis)),
        me.isOwner && h('span', { class: 'tag' }, T('Owner')), !me.canDownload && h('span', { class: 'tag' }, T('Can’t download')))),
    h('div', { class: 'you-id-text you-id-actions' },
      h('button', { type: 'button', class: 'chip', onclick: (e) => profiles.openMine(e.currentTarget, { edit: true }) }, icon('pencil'), T('Edit profile')),
      h('button', { type: 'button', class: 'chip', onclick: (e) => profiles.openMine(e.currentTarget) }, T('View public page'), icon('chevron'))),
    stats);
}
function renderYouIdentity() { $('#you-id').replaceChildren(h('div', { class: 'set-stack' }, youIdentity())); }

// Waiting for you (For you in the code): 0-3 cards for what's waiting (requests first: they need an answer), each handled right there. Empty: gone.
function forYouCards() {
  const answers = newIdeaAnswers().map((i) => h('li', { class: 'friend' },
    h('button', { type: 'button', class: 'friend-open', onclick: () => setView('you/ideas') },
      h('span', { class: 'idea-bulb', 'aria-hidden': 'true' }, icon('bulb')),
      h('span', { class: 'lrow-text' },
        h('span', { class: 'set-label' }, IDEA_ANSWER_TITLE()[i.status] || T('An answer to your idea')),
        h('span', { class: 'set-hint' }, i.reply || i.text)),
      ideaStatusPill(i.status))));
  const cards = [...friendsUI.forYou(3), ...momentsUI.forYou(3), ...answers].slice(0, 3);
  return cards.length ? h('section', { class: 'set-group' },
    h('h3', { class: 'set-head' }, T('Waiting for you')), h('ul', { class: 'set-stack friend-list foryou-list' }, cards)) : null;
}
function renderForYou() {
  const box = $('#you-foryou');
  const cards = forYouCards();
  box.replaceChildren(...[cards].filter(Boolean));
  box.hidden = !cards;
}
function setYouDot(n) {
  for (const dot of document.querySelectorAll('.tab[data-view="you"] .tab-dot, #me-btn .tab-dot')) { dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n ? String(n) : ''; }
  const label = n ? T('You: {0} new for you', n) : T('You');
  $('.tab[data-view="you"]').setAttribute('aria-label', label); $('#me-btn').setAttribute('aria-label', label);
}

// One row of a list that opens something: a label, a quiet line under it, an optional count, and a chevron.
function navRow({ label, meta, count, current, run, route, lead }) {
  return h('button', { type: 'button', class: 'lrow', 'aria-current': current ? 'page' : null, 'data-route': route, onclick: run },
    lead || null,
    h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, label), meta && h('span', { class: 'set-hint' }, meta)),
    count ? h('b', { class: 'tag' }, String(count)) : null,
    h('i', { class: 'lrow-chev', 'aria-hidden': 'true' }));
}
// The line under each row: what's in the page, or its current setting. null while it's still loading.
function youRowMeta(sub) {
  const me = state.me;
  const p = prefs();
  const d = profiles.mineNow();
  const st = d?.stats;
  const n1 = (n, one, many) => (n === 1 ? one : many);
  switch (sub) {
    case 'history': return st && ([st.films && plural(st.films, 'film'), st.episodes && plural(st.episodes, 'episode')].filter(Boolean).join(' · ') || T('Nothing yet'));
    case 'ratings': {
      if (!st) return null;
      const rated = d.ratings?.total || 0;
      return rated || st.reviews ? `${n1(rated, T('1 rating'), T('{0} ratings', rated))} · ${n1(st.reviews, T('1 review'), T('{0} reviews', st.reviews))}` : T('Nothing yet');
    }
    case 'liked': return st && (st.likes ? n1(st.likes, T('1 title'), T('{0} titles', st.likes)) : T('Nothing yet'));
    case 'friends': {
      const f = friendsUI.summary();
      if (!f.loaded) return null;
      return [n1(f.friends, T('1 friend'), T('{0} friends', f.friends)), f.requests && n1(f.requests, T('1 request'), T('{0} requests', f.requests))].filter(Boolean).join(' · ');
    }
    case 'moments': {
      const m = momentsUI.summary();
      if (!m.loaded) return null;
      if (m.unseen) return n1(m.unseen, T('1 new from a friend'), T('{0} new from friends', m.unseen));
      const all = m.mine + m.shared;
      return all ? n1(all, T('1 moment'), T('{0} moments', all)) : T('Clip one from the player’s ⋯ menu');
    }
    case 'activity': return T('Who watched what, and when');
    case 'invite': return T('A one-time link for someone new');
    case 'account': return me.email || T('Home network');
    case 'look': {
      const key = p.theme?.preset || state.rules?.defaultTheme || 'lilin';
      return [LANGUAGES.find((l) => l.code === lang)?.name, key === 'custom' ? T('Your own') : THEMES[key]?.name].filter(Boolean).join(' · ');
    }
    case 'watching': {
      const subs = (state.status.subLangs || []).find((l) => l.code === p.subLang);
      return [subs ? T('Subtitles: {0}', subs.name) : T('No subtitles'), p.skipIntro === 'auto' ? T('Skip intros automatically') : T('Skip intro button')].join(' · ');
    }
    case 'devices': return pushView.loaded ? (pushView.deviceId ? T('Notifications on here') : T('Notifications off here')) : T('Notifications, TVs, Jellyfin');
    case 'download-settings': return [T('Quality follows your screen'), p.maxSize ? T('Up to {0} GB', p.maxSize) : null].filter(Boolean).join(' · ');
    case 'ideas': {
      const fresh = newIdeaAnswers().length, sent = ideasView.mine.length;
      return fresh ? n1(fresh, T('1 new answer'), T('{0} new answers', fresh)) : sent ? n1(sent, T('1 idea sent'), T('{0} ideas sent', sent)) : T('Tell the owner what you wish Lilin did');
    }
    default: return null;
  }
}
function renderYouRows() {
  const pages = pagesOf('you', state.me, state.status);
  const restricted = state.me.restricted;
  const label = (id) => (id === 'you/ratings' && restricted ? T('Ratings') : T(ROUTES[id].label));
  const season = state.status?.wrapped?.year;
  const year = season || new Date().getFullYear();
  const wrapped = navRow({ label: T('Lilin Wrapped {0}', year), meta: season ? T('Your year on Lilin is here') : T('Your year in watching so far'), run: (e) => openWrapped(year, e.currentTarget) });
  // Wide screens: the list starts with you, which opens Overview (phones have the full card above the list).
  const me = navRow({ label: state.me.email ? state.me.name : T('Home network'), meta: T('Overview'), current: state.route === 'you', run: () => setView('you'),
    lead: people.face(state.me, { size: 36 }) });
  const groups = YOU_GROUPS().map(([key, title]) => {
    const rows = pages.filter((id) => ROUTES[id].group === key).map((id) => {
      const sub = ROUTES[id].sub;
      return navRow({ label: label(id), meta: youRowMeta(sub), route: id, current: state.route === id, run: () => setView(id),
        count: sub === 'friends' && sharesSocial() ? friendsUI.incomingCount() : sub === 'moments' ? momentsUI.unseenCount() : sub === 'ideas' ? newIdeaAnswers().length : 0 });
    });
    if (key === 'watching') rows.push(wrapped);
    return rows.length && h('section', { class: 'set-group' }, title && h('h3', { class: 'set-head' }, title), h('div', { class: 'set-stack' }, rows));
  });
  $('#you-rows').replaceChildren(h('div', { class: 'set-stack you-me' }, me), ...groups.filter(Boolean));
}
// Search in You, like iOS Settings: finds a page ("Watching") or a setting inside one ("Subtitles"), each hit with
// where it lives; opening one shows the page, scrolls to the setting and lights it up. Settings are read from the
// pages themselves (built off-screen once per search), so every settingsRow is searchable with no list to keep.
const youSearch = { index: null, input: null, results: null };
const SEARCHED_PAGES = ['account', 'look', 'watching', 'devices', 'download-settings'];
const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
function youSearchIndex() {
  if (youSearch.index) return youSearch.index;
  const out = [], seen = new Set();
  const add = (hit) => { const k = `${hit.route}|${hit.label}`; if (!seen.has(k)) { seen.add(k); out.push(hit); } };
  const groups = Object.fromEntries(YOU_GROUPS().map(([k, t]) => [k, t]));
  for (const id of pagesOf('you', state.me, state.status)) {
    const r = ROUTES[id];
    const page = id === 'you/ratings' && state.me.restricted ? T('Ratings') : T(r.label);
    add({ route: id, label: page, where: groups[r.group] || T('You'), hint: youRowMeta(r.sub) || '', page: true });
    if (!SEARCHED_PAGES.includes(r.sub) || !YOU_PAGES[r.sub]) continue;
    let nodes;
    try { nodes = YOU_PAGES[r.sub]().filter(Boolean); } catch { continue; }
    let head = '';
    for (const el of h('div', {}, nodes).querySelectorAll('h3.set-head, .set-row')) {
      if (el.matches('h3.set-head')) {
        head = ownText(el);
        if (head && head !== page) add({ route: id, label: head, where: page, hint: '', head: true });
        continue;
      }
      const label = el.querySelector('.set-label')?.textContent.trim();
      if (label) add({ route: id, label, where: head && head !== page ? `${page} › ${head}` : page, hint: el.querySelector('.set-hint')?.textContent.trim() || '' });
    }
  }
  youSearch.index = out;
  return out;
}
// Every word has to be somewhere; a hit in the name beats one in the line under it or the page it's on.
function youSearchScore(hit, words) {
  const name = hit.label.toLowerCase(), hint = hit.hint.toLowerCase(), where = hit.where.toLowerCase();
  const starts = (s, w) => s.startsWith(w) || s.includes(` ${w}`) || s.includes(`(${w}`);
  let score = hit.page ? 5 : 0, own = false; // own: a word hit the setting itself, not only the page it's on
  for (const w of words) {
    if (name.startsWith(w)) score += 40;
    else if (starts(name, w)) score += 30;
    else if (name.includes(w)) score += 20;
    else if (starts(hint, w)) score += 8;
    else if (hint.includes(w)) score += 4;
    else if (where.includes(w)) { score += 1; continue; }
    else return 0;
    own = true;
  }
  return own ? score : 0;
}
// The text with the searched words in the theme's colour.
function marked(text, words) {
  const low = text.toLowerCase();
  if (low.length !== text.length) return [text];
  const on = new Array(text.length).fill(false);
  for (const w of words) for (let i = low.indexOf(w); i >= 0 && w; i = low.indexOf(w, i + 1)) on.fill(true, i, i + w.length);
  const out = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    out.push(on[i] ? h('mark', {}, text.slice(i, j)) : text.slice(i, j));
    i = j;
  }
  return out;
}
function renderYouSearch() {
  const q = youSearch.input.value.trim().toLowerCase();
  const list = $('#you-list');
  list.classList.toggle('is-searching', Boolean(q));
  youSearch.form.querySelector('.search-clear').hidden = !youSearch.input.value;
  if (!q) { youSearch.index = null; youSearch.results.replaceChildren(); return; }
  const words = q.split(/\s+/);
  const hits = youSearchIndex().map((hit) => ({ hit, score: youSearchScore(hit, words) })).filter((x) => x.score)
    .sort((a, b) => b.score - a.score).slice(0, 40).map((x) => x.hit);
  youSearch.first = hits[0] || null;
  if (!hits.length) {
    youSearch.results.replaceChildren(h('p', { class: 'muted you-search-none' }, T('No settings match “{0}”.', youSearch.input.value.trim())));
    return;
  }
  youSearch.results.replaceChildren(h('div', { class: 'set-stack' }, hits.map((hit) =>
    h('button', { type: 'button', class: 'lrow you-hit', onclick: () => openYouHit(hit) },
      h('span', { class: 'lrow-text' },
        h('span', { class: 'you-hit-where' }, hit.page ? hit.where || T('You') : hit.where),
        h('span', { class: 'set-label' }, marked(hit.label, words)),
        hit.hint && h('span', { class: 'set-hint you-hit-hint' }, marked(hit.hint, words))),
      h('i', { class: 'lrow-chev', 'aria-hidden': 'true' })))));
}
// Opens the hit's page; once it's drawn, scrolls the setting to the middle of the screen and lights it up.
async function openYouHit(hit) {
  if (state.route !== hit.route) await setView(hit.route);
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  if (hit.page) return;
  for (let tries = 0; tries < 20; tries++) {
    await new Promise((r) => requestAnimationFrame(r));
    const page = $('#you-page');
    const el = hit.head
      ? [...page.querySelectorAll('h3.set-head')].find((x) => ownText(x) === hit.label)?.closest('.set-group')
      : [...page.querySelectorAll('.set-row')].find((x) => x.querySelector('.set-label')?.textContent.trim() === hit.label);
    if (!el) continue;
    el.scrollIntoView({ block: 'center', behavior: smooth });
    el.classList.remove('set-flash');
    void el.offsetWidth; // restart the glow when the same hit is opened twice
    el.classList.add('set-flash');
    setTimeout(() => el.classList.remove('set-flash'), 2200);
    return;
  }
}
// The box at the top of the list, made once; live updates redraw the rows under it, never the box.
function ensureYouSearch() {
  if (youSearch.form) return;
  youSearch.input = h('input', { type: 'search', enterkeyhint: 'search', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    placeholder: T('Search settings'), 'aria-label': T('Search settings'), 'aria-controls': 'you-search-results' });
  const clear = h('button', { type: 'button', class: 'search-clear', 'aria-label': T('Clear search'), hidden: true,
    onclick: () => { youSearch.input.value = ''; renderYouSearch(); youSearch.input.focus(); } });
  clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const glass = h('span');
  glass.innerHTML = '<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';
  youSearch.form = h('form', { class: 'search you-search', role: 'search',
    onsubmit: (e) => { e.preventDefault(); if (youSearch.first) { youSearch.input.blur(); openYouHit(youSearch.first); } } },
  glass.firstChild, youSearch.input, clear);
  youSearch.input.addEventListener('input', renderYouSearch);
  youSearch.input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && youSearch.input.value) { e.preventDefault(); e.stopPropagation(); clear.click(); youSearch.input.blur(); } });
  youSearch.results = h('div', { id: 'you-search-results', 'aria-live': 'polite' });
  $('#you-list').prepend(youSearch.form, youSearch.results);
}
// The open page: its rows in cards, one per group, as Settings had them. The root's page is Overview (wide screens).
function renderYouPage() {
  const page = $('#you-page');
  const sub = state.view === 'you' ? state.sub : null;
  $('#view-you').classList.toggle('on-page', Boolean(sub));
  if (!sub || !YOU_PAGES[sub]) { page.replaceChildren(...youOverview()); return; }
  const title = sub === 'ratings' && state.me.restricted ? T('Ratings') : T(ROUTES[`you/${sub}`].label);
  const nodes = YOU_PAGES[sub]().filter(Boolean);
  page.replaceChildren(h('button', { type: 'button', class: 'back-link you-back', onclick: goUp }, `‹ ${T('You')}`),
    h('h3', { class: 'you-page-title' }, title),
    ...(nodes.length ? settingsGroups(nodes, title) : [h('p', { class: 'muted' }, T('Nothing here yet.'))]));
  if (ideasView.jump) { ideasView.jump = false; requestAnimationFrame(() => $('#idea-box')?.scrollIntoView({ block: 'start' })); }
}
// Only the open page (its own lists loading more): the list beside it stays as it is.
function redrawYouPage() { if (state.view === 'you' && YOU_PAGES[state.sub] && !editingSettings()) renderYouPage(); }
// Overview: the private view of you (wide screens; on phones its card and For you sit on top of the list).
function youOverview() {
  const d = profiles.mineNow();
  const recent = profiles.recentLines(d, 5);
  return [
    h('h3', { class: 'you-page-title' }, T('Overview')),
    h('div', { class: 'set-stack' }, youIdentity({ numbers: true })),
    forYouCards(),
    recent && h('div', { class: 'set-stack' }, h('div', { class: 'you-own' }, recent), navRow({ label: T('See all'), route: 'you/history', run: () => setView('you/history') })),
  ].filter(Boolean);
}

function accountPage() {
  const me = state.me;
  // The shared home account has no sign-in of its own: the page offers your own instead.
  if (!me.email) return [
    settingsRow(T('Home network'), T('Everyone at home who opens the server’s local address shares this account: one history, one Saved for later.'), null),
    settingsRow(T('Sign in as yourself'), T('Your own history, friends and settings on this device.'),
      h('a', { class: 'chip', href: '/signin?own=1&next=%2Fyou' }, T('Sign in'))),
  ];
  const signedIn = me.via === 'session' || me.hasPassword;
  return [
    settingsRow(T('Email'), me.via === 'session' ? T('You sign in with {0}.', me.email) : T('You sign in with {0} through Cloudflare.', me.email), null),
    ...(signedIn ? [passwordRow()] : []),
    ...(signedIn ? devicesSection() : []),
    h('h3', { class: 'set-head' }, T('This device')),
    signOutRow(),
  ];
}
// Account → Signed in on: your browsers and TVs, loaded when the page opens.
const signInsView = { list: null, loading: null };
function loadSignIns() {
  signInsView.loading ??= api('/api/auth/devices')
    .then((d) => { signInsView.list = d.devices; })
    .catch(() => { signInsView.list ??= []; })
    .finally(() => { signInsView.loading = null; redrawYouPage(); });
  return signInsView.loading;
}
function deviceName(d) {
  if (d.kind === 'tv') return /Mozilla|AppleWebKit/.test(d.agent) ? T('TV') : (d.agent === 'Lilin TV app' ? T('Lilin TV app') : d.agent || T('TV'));
  return pushDevice.deviceLabel(d.agent);
}
function devicesSection() {
  if (!signInsView.list && !signInsView.loading) loadSignIns();
  const list = signInsView.list;
  const others = (list || []).filter((d) => !d.current);
  const rows = (list || []).map((d) => h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, deviceName(d)),
      h('div', { class: 'set-hint' }, d.current ? T('This device') : T('Last used {0}', fmtAgo(d.lastSeen) || T('today')))),
    // TVs sign out one at a time; a browser that came in through Cloudflare would walk straight back in, so
    // browsers go all together (Sign out everywhere else ends Cloudflare's sign-ins too).
    h('div', { class: 'set-control' }, d.kind === 'tv' && !d.current && h('button', { type: 'button', class: 'chip', 'aria-label': T('Sign out {0}', deviceName(d)), onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { signInsView.list = (await api('/api/auth/devices/sign-out', jsonPost({ id: d.id }))).devices; }
      catch (err) { toast(err.message); }
      redrawYouPage();
    } }, T('Sign out')))));
  const everywhere = h('button', { type: 'button', class: 'chip', onclick: async (e) => {
    if (!confirm(T('Sign out every other browser and TV? They’ll need your password to get back in.'))) return;
    e.currentTarget.disabled = true;
    try {
      const r = await api('/api/auth/devices/sign-out', jsonPost({ others: true }));
      // Through Cloudflare this browser's own Access sign-in ended too: a reload signs it straight back in.
      if (r.reload) { location.reload(); return; }
      signInsView.list = r.devices; toast(T('Your other devices are signed out'));
    } catch (err) { toast(err.message); }
    redrawYouPage();
  } }, T('Sign out everywhere else'));
  return [
    h('h3', { class: 'set-head' }, T('Signed in on')),
    ...(list ? rows : [h('p', { class: 'set-hint' }, T('Loading…'))]),
    settingsRow(T('Lost a phone or shared a password?'), T('Every other browser and TV has to sign in again with your password.'), everywhere),
  ];
}
function watchingPage() {
  const p = prefs();
  const out = [];
  out.push(settingsRow(T('Subtitles'), T('Turned on automatically when a video has them in this language.'),
    select([['', T('Off')], ...(state.status.subLangs || []).map((l) => [l.code, l.name])], p.subLang || '', (v) => saveMe({ subLang: v }), T('Default subtitles'))));
  out.push(settingsRow(T('Intros'), p.skipIntro === 'auto' ? T('Opening titles are skipped as they start (not in Watch Together).') : T('A Skip intro button shows during opening titles.'),
    segmented([['button', T('Show a button')], ['auto', T('Skip automatically')]], p.skipIntro || 'button', (v) => saveMe({ skipIntro: v }).then(renderSettings), T('Intros'))));
  out.push(themeMusic.settings(settingsRow, segmented, renderSettings)); // theme
  const start = ['live', 'you'].includes(p.startView) ? p.startView : 'discover'; // a Library start opens Discover now
  out.push(settingsRow(T('Open Lilin on'), null,
    segmented([['discover', T('Discover')], ['live', T('Live')], ['you', T('You')]], start, (v) => saveMe({ startView: v }).then(renderSettings), T('Open Lilin on'))));
  return out;
}
function devicesPage() {
  return [
    ...notificationSettings(),
    h('h3', { class: 'set-head' }, T('TVs and apps')),
    tvSignInRow(),
    // The Android TV app's install steps (/android, android-tv.js on the server): opened on a phone at home.
    settingsRow(T('Android TV'), T('Put Lilin on an Android TV or Google TV. It takes a few minutes.'),
      h('a', { class: 'chip', href: '/android', target: '_blank', rel: 'noopener' }, T('Show the steps'))),
    jellyfinRow(),
  ];
}
// Picture and sound: how Play picks a copy it fetches (set once, used by every Play and every download).
function downloadPrefsPage() {
  if (!canDownload()) return [];
  const p = prefs();
  return [
    settingsRow(T('Quality'), sharpScreen() ? T('Automatic. This screen is sharper than 1080p: films start in 1080p and switch to 4K once it’s downloaded.')
      : phoneSized() ? T('Automatic. On a phone, films come in 1080p: at this size 4K looks no sharper. Someone on a bigger screen can still get 4K.')
        : T('Automatic. This is a 1080p screen, so films come in 1080p. Someone on a sharper screen can still get 4K.'), ''),
    settingsRow(T('Largest copy'), T('Per film or episode. Bigger copies are skipped.'),
      select(MAX_SIZE_OPTIONS, p.maxSize || 0, (v) => saveMe({ maxSize: Number(v) }), T('Largest copy'))),
    settingsRow(T('Audio language'), T('Copies in this language come first. Copies dubbed into another language are skipped when there’s a choice.'),
      select(AUDIO_LANGUAGES, p.audioLang || '', (v) => saveMe({ audioLang: v }), T('Audio language'))),
  ];
}
// Live updates redraw Settings; not in the middle of a scroll (on a phone that stops the scroll dead), but once it settles.
let lastPageScroll = 0, settingsRedraw = null;
window.addEventListener('scroll', () => { lastPageScroll = Date.now(); }, { passive: true });
window.addEventListener('touchmove', () => { lastPageScroll = Date.now(); }, { passive: true });
function renderSettingsWhenStill() {
  clearTimeout(settingsRedraw);
  const wait = 900 - (Date.now() - lastPageScroll);
  if (wait > 0) { settingsRedraw = setTimeout(renderSettingsWhenStill, wait); return; }
  if (settingsOpen() && !editingSettings()) renderSettings();
}

// A page's rows in cards: each heading starts a card of rows. A heading that repeats the page's title is dropped
// (its anchor moves to the page).
function settingsGroups(nodes, title) {
  const groups = [];
  let current = { items: [] };
  for (const node of nodes) {
    if (node.matches?.('h3.set-head')) {
      if (current.items.length || current.head) groups.push(current);
      // the heading's own words only: not a tag inside it ("Server" + "Owner" read "ServerOwner")
      const own = [...node.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      current = { head: own === title && !groups.length && !current.items.length ? null : node, anchor: node.dataset.anchor, items: [] };
    } else current.items.push(node);
  }
  if (current.items.length || current.head) groups.push(current);
  return groups.map((g) => h('section', { class: 'set-group', 'data-anchor': g.head ? null : g.anchor }, g.head, h('div', { class: 'set-stack' }, g.items)));
}

// The Lilin app on a TV (tv/tizen) or a computer's sign-in page shows a code; entering it here signs that device in
// as you (the server works out which). Scanning their QR code does the same through offerDeviceSignIn.
function tvSignInRow() {
  const input = h('input', { type: 'text', class: 'invite-note tv-code', maxlength: '7', placeholder: T('Code'), 'aria-label': T('Code shown on the TV or computer'),
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'done' });
  const go = h('button', { type: 'submit', class: 'chip' }, T('Sign in'));
  const note = h('p', { class: 'set-hint tv-code-note', role: 'status' });
  const form = h('form', { class: 'tv-code-form', onsubmit: async (e) => {
    e.preventDefault();
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) { note.textContent = T('The code has 6 letters and numbers.'); input.focus(); return; }
    go.disabled = true;
    try {
      // Ask first, like a scanned code: the sheet shows what's asking and where.
      note.textContent = '';
      await offerDeviceSignIn(code, '', { rethrow: true });
      input.value = '';
    } catch (err) { note.textContent = err.message; } finally { go.disabled = false; }
  } }, input, go);
  return settingsRow(T('Sign in another device'), T('Scan the QR code a TV or computer shows with your phone’s camera, or enter the code it shows here.'),
    h('div', { class: 'tv-code-wrap' }, form, note));
}

// Your library in your own Jellyfin (the Lilin plugin; jellyfin.js on the server). The plugin's
// settings page shows a code; entering it here connects that Jellyfin server to your library.
const jellyfinView = { links: null, loading: null };
function loadJellyfin() {
  jellyfinView.loading ??= api('/api/jellyfin')
    .then((d) => { jellyfinView.links = d.links; })
    .catch(() => { jellyfinView.links = jellyfinView.links || []; })
    .finally(() => { jellyfinView.loading = null; if (settingsOpen()) renderSettingsWhenStill(); });
  return jellyfinView.loading;
}
function jellyfinRow() {
  if (!jellyfinView.links && !jellyfinView.loading) loadJellyfin();
  const input = h('input', { type: 'text', class: 'invite-note tv-code', maxlength: '7', placeholder: T('Code'), 'aria-label': T('Code shown in Jellyfin'),
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'done' });
  const go = h('button', { type: 'submit', class: 'chip' }, T('Connect'));
  const note = h('p', { class: 'set-hint tv-code-note', role: 'status' });
  const form = h('form', { class: 'tv-code-form', onsubmit: async (e) => {
    e.preventDefault();
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) { note.textContent = T('The code in Jellyfin has 6 letters and numbers.'); input.focus(); return; }
    go.disabled = true; note.textContent = T('Connecting…');
    try {
      const r = await api('/api/jellyfin/approve', jsonPost({ code }));
      jellyfinView.links = r.links;
      toast(T('Jellyfin is connected. Your library shows up there after its first sync.'));
      renderSettings();
    } catch (err) { note.textContent = err.message; go.disabled = false; }
  } }, input, go);
  const list = (jellyfinView.links || []).map((l) => h('li', { class: 'jf-link' },
    h('span', { class: 'jf-link-name' }, l.name),
    h('span', { class: 'set-hint jf-link-seen' }, T('Last synced {0}', fmtAgo(l.lastSeen) || T('just now'))),
    h('button', { type: 'button', class: 'chip', 'aria-label': T('Disconnect {0}', l.name), onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { jellyfinView.links = (await api(`/api/jellyfin/${l.id}/remove`, jsonPost({}))).links; }
      catch (err) { toast(err.message); }
      renderSettings();
    } }, T('Disconnect'))));
  return settingsRow(T('Jellyfin'), T('Watch your library in your own Jellyfin: install the Lilin plugin there, open its settings and enter the code it shows.'),
    h('div', { class: 'tv-code-wrap' }, form, note, list.length > 0 && h('ul', { class: 'jf-links' }, ...list)));
}

// ---------- notifications (notifications.js, sw.js; push.js on the server) ----------
const pushView = { loaded: false, loading: null, publicKey: null, devices: [], deviceId: null, busy: false };
async function loadPush() {
  pushView.loading ??= (async () => {
    try {
      const data = await api('/api/push');
      pushView.publicKey = data.publicKey; pushView.devices = data.devices;
      // A device that already has a subscription re-registers it, so it's in the list (and the
      // server gets it back if its copy was lost). Unchanged ones aren't rewritten.
      const sub = globalThis.Notification?.permission === 'granted' ? await pushDevice.currentSubscription() : null;
      if (sub && pushDevice.sameKey(sub, data.publicKey)) {
        const r = await api('/api/push/subscribe', jsonPost({ subscription: sub.toJSON() }));
        pushView.deviceId = r.id; pushView.devices = r.devices;
      } else pushView.deviceId = null;
    } catch { /* offline: try again next time Settings opens */ }
    pushView.loaded = true; pushView.loading = null;
  })();
  return pushView.loading;
}
// ---- the idea box (/api/ideas, src/ideas.js) ----
// Everyone gets a little box in Settings to send the owner ideas, with their own ideas and the
// owner's answers under it. The owner gets the inbox instead, in the Server part of Settings.
const ideasView = { loaded: false, loading: null, mine: [], all: null, kind: 'feature', draft: '', sending: false, filter: 'new', jump: false, answering: null };
const IDEA_KINDS = () => [['feature', T('Idea')], ['fix', T('Something’s off')], ['other', T('Other')]];
const IDEA_STATUS = () => ({ new: T('Sent'), planned: T('Planned'), added: T('Added'), notnow: T('Not now') });
function loadIdeas() {
  ideasView.loading ||= api('/api/ideas').then((r) => {
    ideasView.mine = r.mine || []; ideasView.all = r.all || null; ideasView.loaded = true;
    ideasView.scout = r.scout || []; // scout
  }).catch(() => { ideasView.loaded = true; }).finally(() => { ideasView.loading = null; });
  return ideasView.loading;
}
function ideasNeeded() {
  if (ideasView.loaded) return false;
  loadIdeas().then(() => { if (settingsOpen()) renderSettingsWhenStill(); });
  return true;
}
// scout: the idea scout's ideas sit at the top of the owner's inbox (public/scout.js)
const scoutView = createScout({ h, api, toast, jsonPost, fmtAgo, rerender: () => renderSettings() });
// A status with a little light: Sent (dim), Planned (ring), Added (lit), Not now (out).
const ideaStatusPill = (status) => h('span', { class: `idea-status idea-${status}` }, h('i', { 'aria-hidden': 'true' }), IDEA_STATUS()[status] || status);
const IDEA_PLACEHOLDER = () => ({ feature: T('I wish Lilin could…'), fix: T('What’s off, and where?'), other: T('Anything you’d like to tell the owner…') });
// The owner's answer under an idea, as a reply in a thread.
const ideaReply = (text) => h('div', { class: 'idea-reply' }, h('span', { class: 'idea-reply-who' }, T('Owner')), h('p', {}, text));

function ideaBox() {
  ideasNeeded();
  const text = h('textarea', { class: 'idea-text', rows: '3', maxlength: '1000', placeholder: IDEA_PLACEHOLDER()[ideasView.kind], 'aria-label': T('Your idea') });
  text.value = ideasView.draft;
  const count = h('span', { class: 'idea-count', 'aria-hidden': 'true' });
  const send = h('button', { class: 'idea-send', type: 'submit', disabled: ideasView.sending || ideasView.draft.trim().length < 3 },
    h('span', {}, T('Send')), icon('send'));
  const showCount = () => { const n = text.value.length; count.textContent = n > 800 ? `${n}/1000` : ''; };
  showCount();
  text.addEventListener('input', () => { ideasView.draft = text.value; send.disabled = ideasView.sending || text.value.trim().length < 3; showCount(); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
  const kinds = h('div', { class: 'idea-kinds', role: 'radiogroup', 'aria-label': T('What kind of idea') },
    IDEA_KINDS().map(([key, label]) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'idea-kind', 'aria-checked': String(ideasView.kind === key) }, label);
      b.addEventListener('click', () => {
        ideasView.kind = key;
        kinds.querySelectorAll('.idea-kind').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        text.placeholder = IDEA_PLACEHOLDER()[key];
        text.focus();
      });
      return b;
    }));
  const form = h('form', { class: 'idea-form' }, kinds, text, h('div', { class: 'idea-actions' }, count, send));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ideasView.sending || text.value.trim().length < 3) return;
    ideasView.sending = true; send.disabled = true;
    try {
      const r = await api('/api/ideas', jsonPost({ text: text.value, kind: ideasView.kind }));
      ideasView.mine = r.mine || ideasView.mine; ideasView.draft = ''; ideasView.kind = 'feature';
      text.blur();
      toast(T('Idea sent. Thanks!'));
    } catch (err) { toast(err.message); }
    finally { ideasView.sending = false; renderSettings(); }
  });
  const mine = ideasView.mine;
  const kindNames = Object.fromEntries(IDEA_KINDS());
  return h('section', { class: 'idea-box', id: 'idea-box', 'aria-labelledby': 'idea-box-title' },
    h('div', { class: 'idea-head' },
      h('span', { class: 'idea-bulb' }, icon('bulb')),
      h('div', {},
        h('h4', { class: 'idea-title', id: 'idea-box-title' }, T('Idea box')),
        h('p', { class: 'idea-sub' }, T('Something you wish Lilin did? It goes straight to the owner.')))),
    form,
    mine.length > 0 && h('details', { class: 'idea-mine', open: mine.some((i) => i.answered && Date.now() - i.answered < 7 * 86400000) || mine.length <= 3 },
      h('summary', {}, h('span', {}, mine.length === 1 ? T('Your idea') : T('Your ideas')), h('span', { class: 'idea-n' }, String(mine.length))),
      h('ul', { class: 'idea-list' }, mine.map((i) => h('li', { class: `idea-item idea-is-${i.status}` },
        h('div', { class: 'idea-meta' }, ideaStatusPill(i.status),
          i.kind !== 'feature' && h('span', {}, kindNames[i.kind] || i.kind), h('span', {}, fmtAgo(i.created)),
          i.status === 'new' && !i.reply && h('button', { type: 'button', class: 'idea-link', onclick: () => takeBackIdea(i) }, T('Take back'))),
        h('p', { class: 'idea-body' }, i.text),
        i.reply && ideaReply(i.reply))))));
}
async function takeBackIdea(idea) {
  try {
    const r = await api(`/api/ideas/${idea.id}/delete`, jsonPost({}));
    ideasView.mine = r.mine || ideasView.mine.filter((i) => i.id !== idea.id);
  } catch (err) { toast(err.message); }
  renderSettings();
}

function ideaInbox() {
  const out = [h('h3', { class: 'set-head', 'data-anchor': 'idea-inbox' }, T('Ideas'))];
  if (!ideasView.loaded) { ideasNeeded(); out.push(h('p', { class: 'muted' }, T('Loading…'))); return out; }
  out.push(...scoutView.section(ideasView.scout, (list) => { ideasView.scout = list; })); // scout
  const all = ideasView.all || [];
  const counts = { new: 0, planned: 0, added: 0, notnow: 0, all: all.length };
  for (const i of all) counts[i.status] = (counts[i.status] || 0) + 1;
  const labels = IDEA_STATUS();
  const filters = [['new', T('New')], ['planned', labels.planned], ['added', labels.added], ['notnow', labels.notnow], ['all', T('All')]];
  out.push(h('div', { class: 'idea-filters', role: 'group', 'aria-label': T('Show ideas') }, filters.map(([key, label]) =>
    h('button', { type: 'button', class: 'idea-filter', 'aria-pressed': String(ideasView.filter === key),
      onclick: () => { ideasView.filter = key; ideasView.answering = null; renderSettings(); } },
    label, h('span', { class: 'idea-n' }, String(counts[key] || 0))))));
  const shown = ideasView.filter === 'all' ? all : all.filter((i) => i.status === ideasView.filter);
  if (!shown.length) {
    out.push(h('p', { class: 'idea-empty' }, all.length ? T('Nothing here.') : T('No ideas yet. They show up here when someone uses the idea box in their Settings.')));
    return out;
  }
  const kinds = Object.fromEntries(IDEA_KINDS());
  out.push(h('ul', { class: 'idea-list idea-inbox' }, shown.map((i) => {
    const who = i.name || T('Someone');
    const answering = ideasView.answering === i.id;
    let answer = null;
    if (answering) {
      const field = h('textarea', { class: 'idea-text', rows: '2', maxlength: '500', placeholder: T('Answer {0}', who), 'aria-label': T('Answer {0}', who) });
      field.value = i.reply || '';
      const save = () => answerIdea(i, { reply: field.value });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
        if (e.key === 'Escape') { ideasView.answering = null; renderSettings(); }
      });
      answer = h('div', { class: 'idea-form idea-answer' }, field,
        h('div', { class: 'idea-actions' },
          h('button', { type: 'button', class: 'idea-link', onclick: () => { ideasView.answering = null; renderSettings(); } }, T('Cancel')),
          h('button', { type: 'button', class: 'idea-send', onclick: save }, h('span', {}, T('Send')), icon('send'))));
      requestAnimationFrame(() => { field.focus(); field.setSelectionRange(field.value.length, field.value.length); });
    }
    return h('li', { class: `idea-item idea-is-${i.status}` },
      h('div', { class: 'idea-from' },
        people.face({ name: who, avatar: i.avatar }, { size: 32 }),
        h('div', { class: 'idea-from-text' },
          h('strong', {}, who),
          h('span', {}, [i.kind !== 'feature' ? kinds[i.kind] || i.kind : null, fmtAgo(i.created)].filter(Boolean).join(' · '))),
        ideaStatusPill(i.status),
        h('button', { type: 'button', class: 'idea-delete', 'aria-label': T('Delete'), title: T('Delete'), onclick: () => deleteIdea(i) }, icon('trash'))),
      h('p', { class: 'idea-body' }, i.text),
      !answering && i.reply && ideaReply(i.reply),
      answer,
      !answering && h('div', { class: 'idea-owner' },
        h('div', { class: 'idea-marks', role: 'group', 'aria-label': T('Mark idea') },
          ['planned', 'added', 'notnow'].map((key) => h('button', { type: 'button', class: `idea-mark idea-mark-${key}`, 'aria-pressed': String(i.status === key),
            onclick: () => answerIdea(i, { status: i.status === key ? 'new' : key }) }, labels[key]))),
        h('button', { type: 'button', class: 'idea-answer-open', onclick: () => { ideasView.answering = i.id; renderSettings(); } },
          i.reply ? T('Edit answer') : T('Answer'))));
  })));
  return out;
}
async function answerIdea(idea, change) {
  try {
    const r = await api(`/api/ideas/${idea.id}`, jsonPost(change));
    ideasView.all = (ideasView.all || []).map((i) => (i.id === idea.id ? { ...r.idea, avatar: i.avatar } : i));
    ideasView.mine = ideasView.mine.map((i) => (i.id === idea.id ? r.idea : i));
    if ('reply' in change) { ideasView.answering = null; toast(r.idea.reply ? T('Answer sent') : T('Answer removed')); }
    return true;
  } catch (err) { toast(err.message); return false; }
  finally { renderSettings(); }
}
async function deleteIdea(idea) {
  if (!confirm(T('Delete this idea?'))) return;
  try {
    await api(`/api/ideas/${idea.id}/delete`, jsonPost({}));
    ideasView.all = (ideasView.all || []).filter((i) => i.id !== idea.id);
  } catch (err) { toast(err.message); }
  renderSettings();
}

function notificationSettings() {
  const support = pushDevice.pushSupport();
  const p = prefs();
  const out = [h('h3', { class: 'set-head' }, T('Notifications'))];
  if (!pushView.loaded) {
    if (support === 'ok') { loadPush().then(() => { if (settingsOpen()) renderSettingsWhenStill(); }); out.push(h('p', { class: 'muted' }, T('Loading…'))); return out; }
    pushView.loaded = true;
  }
  const on = Boolean(pushView.deviceId);
  const why = {
    insecure: T('Notifications need Lilin opened through its https address, not the local one.'),
    'ios-install': T('On iPhone and iPad, notifications work once Lilin is on your Home Screen: tap Share, then Add to Home Screen, and open Lilin from there.'),
    unsupported: T('This browser can’t show notifications from websites.'),
    denied: T('Notifications are blocked for Lilin in this browser. Allow them in the site settings (the icon next to the address), then reload.'),
  }[support];
  if (why) out.push(settingsRow(T('This device'), why, null));
  else {
    const sw = toggle(on, async (want, input) => {
      if (pushView.busy) { input.checked = on; return; }
      pushView.busy = true; input.disabled = true;
      try {
        if (want) {
          const sub = await pushDevice.subscribe(pushView.publicKey);
          const r = await api('/api/push/subscribe', jsonPost({ subscription: sub.toJSON(), label: pushDevice.deviceLabel(navigator.userAgent) }));
          pushView.deviceId = r.id; pushView.devices = r.devices;
        } else {
          const sub = await pushDevice.currentSubscription();
          const r = await api('/api/push/unsubscribe', jsonPost({ endpoint: sub?.endpoint || '', id: pushView.deviceId || '' }));
          await sub?.unsubscribe().catch(() => {});
          pushView.deviceId = null; pushView.devices = r.devices;
        }
      } catch (err) { toast(err.message); }
      pushView.busy = false;
      renderSettings();
    }, T('Notifications on this device'));
    out.push(settingsRow(T('This device'), on ? T('Lilin can tell you about these even when it’s closed.') : T('Get a notification when something’s ready, even with Lilin closed.'), sw));
  }
  if (pushView.devices.length) {
    out.push(settingsRow(T('Downloads ready'), T('When something you downloaded can be watched.'),
      toggle(p.pushDownload !== false, (v) => saveMe({ pushDownload: v }), T('Notify when downloads are ready'))));
    out.push(settingsRow(T('New episodes'), T('When a new episode of a show you watch or follow arrives on Lilin.'),
      toggle(p.pushEpisode !== false, (v) => saveMe({ pushEpisode: v }), T('Notify about new episodes'))));
    out.push(settingsRow(T('Watch Together invites'), T('When someone asks you to join their room. Off: nobody can invite you this way.'),
      toggle(p.pushWatch !== false, (v) => saveMe({ pushWatch: v }), T('Notify about Watch Together invites'))));
    out.push(settingsRow(T('Lilin updates'), T('When Lilin gets something new.'),
      toggle(p.pushUpdate !== false, (v) => saveMe({ pushUpdate: v }), T('Notify about Lilin updates'))));
    if (!state.me?.isOwner) out.push(settingsRow(T('Answers to your ideas'), T('When the owner answers an idea or bug you sent.'),
      toggle(p.pushIdea !== false, (v) => saveMe({ pushIdea: v }), T('Notify about answers to your ideas'))));
    if (!state.me?.restricted) out.push(settingsRow(T('Friends'), T('When someone asks to be your friend, or says yes.'), // friends
      toggle(p.pushFriend !== false, (v) => saveMe({ pushFriend: v }), T('Notify about friend requests'))));
    if (!state.me?.restricted) out.push(settingsRow(T('Moments'), T('When a friend sends you a moment from a film or episode.'), // friends
      toggle(p.pushShare !== false, (v) => saveMe({ pushShare: v }), T('Notify about moments friends send'))));
    if (state.me?.isOwner) out.push(settingsRow(T('New ideas'), T('When someone sends an idea through the idea box.'),
      toggle(p.pushIdea !== false, (v) => saveMe({ pushIdea: v }), T('Notify about new ideas'))));
    if (state.me?.isOwner) out.push(settingsRow(T('Agents'), T('When a script or AI agent on your home machines asks for your attention.'),
      toggle(p.pushAgent !== false, (v) => saveMe({ pushAgent: v }), T('Notify when an agent needs you'))));
    const test = h('button', { class: 'chip', type: 'button' }, T('Send a test'));
    test.addEventListener('click', async () => {
      test.disabled = true;
      try {
        const r = await api('/api/push/test', jsonPost({}));
        pushView.devices = r.devices;
        toast(r.sent ? T('Sent to {0}', plural(r.sent, 'device')) : T('No device accepted it. Turn notifications off and on again on that device.'));
      } catch (err) { toast(err.message); }
      setTimeout(() => { test.disabled = false; }, 10000);
    });
    out.push(h('ul', { class: 'rows push-devices', 'aria-label': T('Devices with notifications') }, pushView.devices.map((d) => {
      const remove = h('button', { class: 'chip', type: 'button', 'aria-label': T('Stop notifications on {0}', d.label) }, T('Remove'));
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          if (d.id === pushView.deviceId) { const sub = await pushDevice.currentSubscription(); await sub?.unsubscribe().catch(() => {}); pushView.deviceId = null; }
          pushView.devices = (await api('/api/push/unsubscribe', jsonPost({ id: d.id }))).devices;
        } catch (err) { toast(err.message); }
        renderSettings();
      });
      return h('li', { class: 'row' },
        h('div', { class: 'row-text' },
          h('div', { class: 'row-title' }, d.label, d.id === pushView.deviceId && h('span', { class: 'tag' }, T('This device'))),
          h('div', { class: 'row-meta' }, h('span', {}, T('Added {0}', fmtAgo(d.createdAt))))),
        remove);
    })), h('div', { class: 'set-row push-test' }, test));
  }
  return out;
}

// Signed in through Cloudflare's email codes but no Lilin password yet: a full-screen step with no
// way past it (the API refuses everything else too) until they pick one. Then the page reloads.
function showPasswordGate() {
  if ($('#password-gate')) return;
  const email = state.me?.email || '';
  const user = h('input', { type: 'email', name: 'username', value: email, autocomplete: 'username', readonly: '', hidden: '' });
  const pass = h('input', { type: 'password', id: 'gate-password', minlength: '10', required: '', autocomplete: 'new-password', 'aria-describedby': 'gate-msg' });
  const again = h('input', { type: 'password', id: 'gate-again', minlength: '10', required: '', autocomplete: 'new-password' });
  const save = h('button', { type: 'submit', class: 'play-btn password-gate-save' }, T('Save password'));
  const msg = h('p', { class: 'password-gate-msg', id: 'gate-msg', role: 'alert' });
  // Typing a new password blind on a phone is how typos happen: one button shows both fields.
  const show = h('button', { type: 'button', class: 'password-gate-show', 'aria-pressed': 'false', 'aria-controls': 'gate-password gate-again' }, T('Show password'));
  show.addEventListener('click', () => {
    const on = show.getAttribute('aria-pressed') !== 'true';
    pass.type = again.type = on ? 'text' : 'password';
    show.setAttribute('aria-pressed', String(on));
    show.textContent = on ? T('Hide password') : T('Show password');
  });
  const form = h('form', { class: 'password-gate-card' },
    h('div', { class: 'password-gate-bulbs', 'aria-hidden': 'true' }),
    h('h2', { id: 'gate-title' }, T('Pick a password for Lilin')),
    h('p', {}, T('Lilin now signs you in with your own password instead of codes sent by email. Pick one to carry on.')),
    email && h('p', { class: 'password-gate-email' }, email),
    user,
    h('div', { class: 'password-gate-field' }, h('label', { for: 'gate-password' }, T('New password (10+ characters)')), pass),
    h('div', { class: 'password-gate-field' }, h('label', { for: 'gate-again' }, T('Same password again')), again),
    h('p', { class: 'safe-note' }, T('Only you know this password. Lilin scrambles it before saving it, so nobody can see it, not even the people who run Lilin.')),
    show, msg, save);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pass.value !== again.value) { msg.textContent = T('The two passwords aren’t the same.'); return; }
    save.disabled = true;
    msg.textContent = '';
    try {
      await api('/api/auth/first-password', jsonPost({ password: pass.value }));
      location.reload();
    } catch (err) { msg.textContent = err.message; save.disabled = false; }
  });
  const gate = h('div', { id: 'password-gate', class: 'password-gate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' },
    h('p', { class: 'password-gate-brand', 'aria-hidden': 'true' }, 'Lilin'), form);
  // Nothing behind it can be reached: no Escape, no clicks, no tabbing out.
  gate.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault(); });
  document.body.append(gate);
  for (const el of document.body.children) if (el !== gate) el.inert = true;
  pass.focus();
}

// Account → Password: change it here (signs every other device out, Cloudflare's sign-ins too).
function passwordRow() {
  const current = h('input', { type: 'password', class: 'invite-note', autocomplete: 'current-password', placeholder: T('Current password'), 'aria-label': T('Current password') });
  const next = h('input', { type: 'password', class: 'invite-note', autocomplete: 'new-password', minlength: '10', placeholder: T('New password (10+ characters)'), 'aria-label': T('New password') });
  const save = h('button', { class: 'chip', type: 'submit' }, T('Change password'));
  const msg = h('div', { class: 'set-hint', role: 'status' });
  const form = h('form', { class: 'set-card account-password' }, current, next, save, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      const r = await api('/api/auth/password', jsonPost({ current: current.value, next: next.value }));
      current.value = next.value = '';
      if (r.reload) { toast(T('Password changed. Other devices were signed out.')); setTimeout(() => location.reload(), 1200); return; }
      msg.textContent = T('Password changed. Other devices were signed out.');
      signInsView.list = null; loadSignIns();
    } catch (err) { msg.textContent = err.message; } finally { save.disabled = false; }
  });
  return h('details', { class: 'set-details' },
    h('summary', {},
      h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, T('Change password')),
        h('span', { class: 'set-hint' }, T('Your other devices are signed out when you change it.'))),
      h('span', { class: 'set-details-chev', 'aria-hidden': 'true' })),
    form);
}
function signOutRow() {
  const out = h('button', { class: 'chip', type: 'button' }, T('Sign out'));
  out.addEventListener('click', async () => {
    out.disabled = true;
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* signed out either way */ }
    // Through Cloudflare Access its own sign-in has to end too, or the next visit walks straight back in.
    location.assign(state.me?.via === 'proxy' ? '/cdn-cgi/access/logout' : '/signin');
  });
  return settingsRow(T('Sign out'), T('Signs this browser out of Lilin.'), out);
}

// House → Server rules: how long downloads stay, and what new people get.
function ownerSettings() {
  const r = state.rules || {};
  const out = [h('h3', { class: 'set-head' }, T('Server rules'))];
  out.push(settingsRow(T('Delete downloads after'), T('Counted from when each download finishes, per person. A video someone else still has stays.'),
    select([0, 1, 3, 7, 14, 30].map((n) => [n, days(n)]), r.retentionDays ?? 7, (v) => saveRules({ retentionDays: Number(v) }), T('Delete downloads after'))));
  out.push(settingsRow(T('“Keep longer” adds'), null,
    select([1, 3, 7, 14, 30].map((n) => [n, plural(n, 'day')]), r.extendDays ?? 7, (v) => saveRules({ extendDays: Number(v) }), T('Keep longer adds'))));
  out.push(settingsRow(T('Times a video can be kept longer'), null,
    select([[0, T('No limit')], [1, T('Once')], [2, T('Twice')], [3, T('3 times')], [5, T('5 times')], [10, T('10 times')]], r.maxExtensions ?? 0, (v) => saveRules({ maxExtensions: Number(v) }), T('Times a video can be kept longer'))));
  out.push(settingsRow(T('New people can download'), T('Otherwise they can only add what’s already on the server, until you allow them below.'),
    toggle(r.membersCanDownload !== false, (on) => saveRules({ membersCanDownload: on }), T('New people can download'))));
  out.push(settingsRow(T('Colours for new people'), T('Until they pick their own.'),
    select(Object.entries(THEMES).map(([k, t]) => [k, t.name]), r.defaultTheme || 'lilin', (v) => saveRules({ defaultTheme: v }), T('Colours for new people'))));
  out.push(h('details', { class: 'set-card set-details set-signin' },
    h('summary', {},
      h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, T('Staying signed in')),
        h('span', { class: 'set-hint' }, T('How long a sign-in lasts before Lilin asks again.'))),
      h('span', { class: 'set-details-chev', 'aria-hidden': 'true' })),
    h('p', {}, T('With Lilin’s own sign-in, people stay signed in for SESSION_DAYS days (30 unless you change it in .env, then restart Lilin).')),
    h('p', {}, T('Behind Cloudflare Access, Access has its own session too, and the shorter one wins. To make that last a month:')),
    h('ol', {},
      h('li', {}, T('Cloudflare dashboard → Zero Trust → Access → Applications → Lilin → Edit.')),
      h('li', {}, T('Set Session Duration to 1 month and save.')),
      h('li', {}, T('If you’ve set a Global session timeout (Settings → Authentication), raise that too: it caps every app.'))),
    h('p', { class: 'set-hint' }, T('If someone’s sign-in runs out while Lilin is open, Lilin tells them and signs them back in with one tap.'))));
  out.push(notices.ownerCard()); // owner popups
  return out;
}
// House → People: everyone who uses Lilin, their picture and what they may do; inviting someone new, and who may
// sign in (password links, removing access, people on the list who haven't signed in yet).
function peopleSettings() {
  const out = [h('h3', { class: 'set-head' }, T('People'))];
  const a = state.access;
  const waiting = (a?.invites || []).filter((i) => i.state === 'open').length;
  out.push(settingsRow(T('Invite someone to Lilin'), waiting ? T('{0} waiting', waiting) : null,
    h('button', { type: 'button', class: 'chip', onclick: (e) => invite.open({ kind: 'lilin', onChange: (data) => { state.access = data; if (settingsOpen()) renderSettingsWhenStill(); } }, e.currentTarget) },
      icon('plus'), T('Invite someone'))));
  out.push(h('p', { class: 'set-hint' }, T('Restrict: no friends, reviews or notification invites. They keep Watch Together and share by links only.'))); // friends
  if (state.peopleError) out.push(h('p', { class: 'muted' }, state.peopleError));
  else if (!state.people) out.push(h('p', { class: 'muted' }, T('Loading…')));
  else {
    out.push(h('ul', { class: 'rows people' }, state.people.map((u) => h('li', { class: 'row person' },
      h('button', { type: 'button', class: 'profile-face small', 'aria-label': T('{0} {1}’s picture', u.avatar ? T('Change') : T('Add'), u.name),
        title: u.avatar ? T('Change picture (right-click to remove)') : T('Add a picture'),
        onclick: (e) => editPicture({ person: u, opener: e.currentTarget }),
        oncontextmenu: (e) => { if (!u.avatar) return; e.preventDefault(); if (confirm(T('Remove {0}’s picture?', u.name))) removePicture({ person: u }); } },
        people.face(u, { size: 40 }), h('span', { class: 'profile-face-edit', 'aria-hidden': 'true' }, icon('camera'))),
      h('div', { class: 'row-text' },
        h('div', { class: 'row-title' }, onAccessList(u.email) ? accessName(u.email, u.name) : u.name, u.isOwner && h('span', { class: 'tag' }, T('Owner'))),
        h('div', { class: 'row-meta' },
          u.email && h('span', {}, u.email),
          h('span', {}, `${plural(u.items, 'video')}, ${fmtBytes(u.size)}`),
          u.lastSeen && h('span', {}, lastSeenText(u.lastSeen)),
          onAccessList(u.email) && a.passwords && !a.passwords.includes(String(u.email).toLowerCase()) && h('span', {}, T('No password yet'))),
        u.email && accessActions(u.email, u.name).length > 0 && h('div', { class: 'person-access' }, accessActions(u.email, u.name))),
      h('div', { class: 'person-controls' },
        h('label', { class: 'person-toggle' }, T('Can download'),
          toggle(u.canDownload, async (on, input) => {
            if (u.isOwner) { input.checked = true; toast(T('The owner can always download')); return; }
            await personUpdate(u, { canDownload: on });
          }, T('{0} can download', u.name))),
        state.access?.configured !== false && h('label', { class: 'person-toggle' }, T('Can invite people'),
          toggle(u.canInvite, async (on, input) => {
            if (u.isOwner) { input.checked = true; toast(T('The owner can always invite people')); return; }
            await personUpdate(u, { canInvite: on });
          }, T('{0} can invite people', u.name))),
        // friends: Restrict = no social features apart from Watch Together; sharing by links only
        !u.isOwner && h('label', { class: 'person-toggle' }, T('Restrict'),
          toggle(u.restricted, (on) => personUpdate(u, { restricted: on }), T('Restrict {0}', u.name))),
        h('label', { class: 'person-toggle' }, T('Can see activity'),
          toggle(u.canSeeActivity, async (on, input) => {
            if (u.isOwner) { input.checked = true; toast(T('The owner can always see activity')); return; }
            await personUpdate(u, { canSeeActivity: on });
          }, T('{0} can see activity', u.name))),
        h('label', { class: 'person-toggle' }, T('Never auto-delete'),
          toggle(u.keep, (on) => personUpdate(u, { keep: on }), T('Never auto-delete {0}’s videos', u.name))),
        h('label', { class: 'person-toggle person-library' }, T('Library'), libraryShareSelect(u)))))));
    // On the access list, but no account yet: they haven't signed in.
    const known = new Set(state.people.map((u) => String(u.email || '').toLowerCase()));
    const pending = (a?.members || []).filter((m) => !known.has(String(m).toLowerCase()));
    if (pending.length) {
      out.push(h('h3', { class: 'set-head' }, T('Hasn’t signed in yet')));
      out.push(h('ul', { class: 'rows people' }, pending.map((email) => {
        const name = a.names?.[email] || personName(email);
        return h('li', { class: 'row person is-new' }, people.face({ name }, { size: 40 }),
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, accessName(email, name)), h('div', { class: 'row-meta' }, h('span', {}, email)),
            h('div', { class: 'person-access' }, accessActions(email, name))));
      })));
    }
  }
  if (a?.error) out.push(h('p', { class: 'muted' }, T('Couldn’t read the access list: {0}', a.error)));
  return out;
}
const onAccessList = (email) => Boolean(email && (state.access?.members || []).some((m) => String(m).toLowerCase() === String(email).toLowerCase()));
// Own library, or one shared with someone else (joining them joins everyone they already share with).
function libraryShareSelect(u) {
  const mates = u.sharedWith || [];
  const options = [['', T('Own library')]];
  if (mates.length) options.push([String(mates[0].id), T('Shared with {0}', nameList(mates.map((m) => m.name)))]);
  for (const p of state.people) {
    if (p.id === u.id || mates.some((m) => m.id === p.id)) continue;
    const theirs = (p.sharedWith || []).filter((m) => m.id !== u.id).map((m) => m.name);
    options.push([String(p.id), theirs.length ? T('Join {0} (with {1})', p.name, nameList(theirs)) : T('Share with {0}', p.name)]);
  }
  return select(options, mates.length ? String(mates[0].id) : '', (v) => personUpdate(u, { libraryWith: v ? Number(v) : null }), T('{0}’s library', u.name));
}
async function personUpdate(u, patch) {
  try {
    await api(`/api/admin/users/${u.id}`, jsonPost(patch));
  } catch (err) { toast(err.message); }
  await loadPeople();
  if (u.id === state.me.id) { state.me = (await api('/api/me')).me; await loadLibrary(); }
  if (settingsOpen()) renderSettings();
}

// ---------- activity (server owner, plus people the owner lets see it) ----------
// Who has been using Lilin and what they did, from the server's activity log.
const ACTIVITY_TEXT = {
  // The log keeps these lines whole, in English.
  watch: (d) => {
    const room = String(d).match(/^started a room for (.*)$/);
    if (room) return T('started a room for {0}', room[1]);
    const party = String(d).match(/^planned a watch party for (.*)$/);
    if (party) return T('planned a watch party for {0}', party[1]);
    const invited = String(d).match(/^invited (.*) to (.*)$/);
    return invited ? T('invited {0} to {1}', invited[1], invited[2]) : d;
  },
  download: (d) => T('started downloading {0}', d),
  delete: (d) => T('deleted {0}', d),
  travel: (d) => T('saved {0}', d),
  pause: (d) => T('paused the download of {0}', d),
  resume: (d) => T('resumed the download of {0}', d),
  play: (d) => T('watched {0}', d),
  cast: (d) => { const [what, tv] = d.split(' → '); return tv ? T('put {0} on {1}', what, tv) : T('put {0} on a TV', d); },
  stop: (d) => T('stopped {0}', d),
  subtitles: (d) => T('got {0}', d),
  share: (d) => T('shared the clip {0}', d),
  trim: (d) => T('trimmed the clip {0}', d),
  invite: (d) => T('made an invite link ({0})', d),
  joined: (d) => T('joined Lilin ({0})', d),
  revoke: (d) => T('removed {0}’s access', d),
  unshare: (d) => T('stopped sharing {0}', d),
  wake: (d) => T('woke {0}', d),
  restart: (d) => T('restarted {0}', d),
  add: (d) => T('added {0} to their library', d),
  remove: (d) => T('removed {0} from their library', d),
  extend: (d) => T('kept {0} longer', d),
  expire: (d) => T('auto-deleted {0}', d),
  upgrade: (d) => T('upgraded the quality of {0}', d),
  blocked: (d) => T('tried to download {0}, which was blocked', d),
  slow: (d) => T('swapped out {0}, which downloaded too slowly to watch while downloading', d),
  settings: (d) => T('changed the server rules ({0})', d),
  permission: (d) => T('changed a permission: {0}', d),
  moment: (d) => T('made a moment of {0}', d), // friends
};
const personName = (person) => typeof person === 'string' ? person.split('@')[0]
  : person.name || String(person.user || T('Viewer')).split('@')[0];
const clock = (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return T('Today');
  if (d.toDateString() === yesterday.toDateString()) return T('Yesterday');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}
function lastSeenText(ms) {
  const min = (Date.now() - ms) / 60000;
  if (min < 3) return T('Active now');
  if (min < 60) return T('Seen {0} min ago', Math.round(min));
  if (min < 24 * 60) return T('Seen {0} h ago', Math.round(min / 60));
  return T('Seen {0}', fmtAgo(ms));
}

async function loadActivity() {
  try { state.activity = await api('/api/activity'); state.activityError = null; } catch (err) { state.activityError = err.message; }
}

// ---------- access: who may sign in (Zero Trust email list) + invite links ----------
// Owners manage who may sign in from House → People. Invite links are the Invite sheet's Lilin part (invite.js):
// People → Invite someone to Lilin, and You → Invite someone to Lilin (owners, and members the owner lets invite).
function invitePage() {
  const box = h('div', { class: 'set-card' });
  invite.mount(box, { kind: 'lilin', title: false });
  return [box];
}
// For someone already on the list who has no Lilin password yet (they used Cloudflare's email codes).
async function makePasswordLink(email, btn) {
  btn.disabled = true;
  try {
    const inv = await api('/api/access/password-link', jsonPost({ email }));
    await copyWithToast(inv.url, T('Password link copied: send it to them'));
  } catch (err) { toast(err.message); }
  await loadPeople();
  if (settingsOpen()) renderSettings();
}
// copyText() (above) has the iOS fallback; this adds the toast, or shows the link if copying failed
async function copyWithToast(text, msg) {
  if (await copyText(text)) toast(msg); else prompt(T('Copy this link'), text);
}
async function accessAction(path, body, msg) {
  try {
    await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    toast(msg);
  } catch (err) { toast(err.message); }
  await loadPeople();
  if (settingsOpen()) renderSettings();
}

function accessName(email, name) {
  return inlineName({
    getName: () => name, label: T('Person'), maxLength: 40,
    errorId: `person-rename-error-${encodeURIComponent(email)}`, className: 'person-name',
    successMessage: T('Name saved'),
    save: async (next, previousName) => {
      const { user } = await api('/api/access/rename', jsonPost({ email, name: next, previousName }));
      name = user.name;
      if (state.access) { state.access.names ||= {}; state.access.names[email] = name; }
      if (state.me?.id === user.id) state.me = user;
      const person = state.people?.find((u) => u.id === user.id); if (person) person.name = name;
      for (const entry of [...(state.activity?.people || []), ...(state.activity?.events || [])]) {
        if (entry.user === email) entry.name = name;
        if (entry.detail === email && entry.subjectName) entry.subjectName = name;
      }
    },
  });
}

// House → People, sign-in: what can be done about someone on the access list. A password link for someone who has
// none yet; Remove access (tap twice) for anyone but an owner.
function accessActions(email, name) {
  const a = state.access || {};
  const key = String(email).toLowerCase();
  const member = (a.members || []).some((m) => String(m).toLowerCase() === key);
  if (!member) return [];
  const owner = (a.owners || []).some((m) => String(m).toLowerCase() === key);
  const noPassword = a.passwords && !a.passwords.includes(key);
  return [
    noPassword && h('button', { type: 'button', class: 'chip', onclick: (e) => makePasswordLink(email, e.currentTarget) }, T('Password link')),
    !owner && h('button', { type: 'button', class: 'chip person-remove', onclick: (e) => {
      const b = e.currentTarget;
      if (b.dataset.sure) { accessAction('/api/access/remove', { email }, T('{0} can’t sign in any more', name)); return; }
      b.dataset.sure = '1'; b.textContent = T('Sure?');
      setTimeout(() => { b.textContent = T('Remove access'); delete b.dataset.sure; }, 4000);
    } }, T('Remove access')),
  ].filter(Boolean);
}

// Activity sections and days fold open/closed; the folded ones are remembered per browser.
const ACTIVITY_FOLD_KEY = 'lilin:activityFolded';
let activityFolded = null;
function activityFoldSet() {
  if (!activityFolded) {
    try { activityFolded = new Set(JSON.parse(localStorage.getItem(ACTIVITY_FOLD_KEY)) || []); } catch { activityFolded = new Set(); }
  }
  return activityFolded;
}

function foldGroup(key, tag, cls, title, count, kids, forceOpen = false, foldedByDefault = false) {
  const folded = !forceOpen && activityFoldSet().has(key) !== foldedByDefault;
  const content = h('div', { class: 'fold-body', hidden: folded }, kids);
  const btn = h('button', {
    type: 'button',
    class: 'fold-btn',
    'aria-expanded': String(!folded),
    title: folded ? T('Show') : T('Hide'),
    onclick: () => {
      const open = content.hidden;
      content.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.title = open ? T('Hide') : T('Show');
      const set = activityFoldSet();
      set.delete(key);
      if (!open !== foldedByDefault) set.add(key);
      while (set.size > 60) set.delete(set.values().next().value);
      try { localStorage.setItem(ACTIVITY_FOLD_KEY, JSON.stringify([...set])); } catch { /* blocked */ }
    },
  }, h('span', { class: 'fold-chev', 'aria-hidden': 'true' }), h('span', {}, title), count != null && h('span', { class: 'fold-count' }, String(count)));
  return [h(tag, { class: `${cls} fold-head` }, btn), content];
}

// What each logged action is about: a filter group and an icon. Unknown actions land in Other.
const ACTIVITY_KIND = {
  play: ['watch', 'play'], cast: ['watch', 'tv'], stop: ['watch', 'pause'], watch: ['watch', 'party'], subtitles: ['watch', 'info'],
  download: ['download', 'download'], pause: ['download', 'pause'], resume: ['download', 'download'], upgrade: ['download', 'upgrade'],
  blocked: ['download', 'close'], slow: ['download', 'convert'], travel: ['download', 'phone'],
  add: ['library', 'plus'], remove: ['library', 'trash'], delete: ['library', 'trash'], extend: ['library', 'clock'], expire: ['library', 'clock'],
};
const ACTIVITY_FILTERS = [['all', 'All'], ['watch', 'Watching'], ['download', 'Downloads'], ['library', 'Library'], ['other', 'Other']];
const kindOf = (action) => ACTIVITY_KIND[action] || ['other', action === 'settings' ? 'rules' : action === 'wake' || action === 'restart' ? 'server' : action === 'share' || action === 'trim' ? 'share' : 'me'];
const SESSION_GAP = 60 * 60000; // events further apart than this start a new card
const SYSTEM_USER = 'Lilin';    // auto-deletes and other things the server does by itself

// "House S04 E08" → { show: 'House', season: 4, ep: 8 }
function episodeOf(title) {
  const m = /^(.*) S(\d+) E(\d+)$/.exec(title);
  return m ? { show: m[1], season: Number(m[2]), ep: Number(m[3]) } : null;
}
// [8, 9, 10, 12] → "E08–E10, E12"
function episodeRanges(eps) {
  const list = [...new Set(eps)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `E${pad2(list[i])}–E${pad2(list[j])}` : `E${pad2(list[i])}`);
    i = j;
  }
  return out.join(', ');
}

// One card's lines: repeats folded, a run of episodes in one line, subtitles as a tag on what was watched.
function sessionLines(events) {
  const lines = new Map();
  const subs = [];
  for (const e of events) {
    let action = e.action, subject = e.subjectName || e.detail, lang = null;
    if (action === 'subtitles') {
      const m = /^(.+?) subtitles for (.+)$/.exec(subject);
      if (m) { lang = m[1]; subject = m[2]; subs.push({ e, lang, subject }); continue; }
    }
    const ep = episodeOf(subject);
    const key = ep ? `${action}|${ep.show}|${ep.season}` : `${action}|${subject}`;
    const line = lines.get(key) || { action, subject, ep: ep && { show: ep.show, season: ep.season, eps: [] }, titles: new Set(), langs: new Set(), at: e.at, from: e.at, n: 0 };
    if (ep) line.ep.eps.push(ep.ep);
    line.titles.add(subject);
    line.from = Math.min(line.from, e.at);
    line.n++;
    lines.set(key, line);
  }
  // Subtitles fetched for something played in the same card ride along with it; the rest get lines of their own.
  for (const s of subs) {
    const owner = [...lines.values()].find((l) => l.action === 'play' && l.titles.has(s.subject));
    if (owner) { owner.langs.add(s.lang); continue; }
    const ep = episodeOf(s.subject);
    const key = `subtitles|${s.lang}|${ep ? `${ep.show}|${ep.season}` : s.subject}`;
    const line = lines.get(key) || { action: 'subtitles', lang: s.lang, subject: s.subject, ep: ep && { show: ep.show, season: ep.season, eps: [] }, titles: new Set(), langs: new Set(), at: s.e.at, from: s.e.at, n: 0 };
    if (ep) line.ep.eps.push(ep.ep);
    line.titles.add(s.subject);
    line.n++;
    lines.set(key, line);
  }
  return [...lines.values()].sort((a, b) => b.at - a.at).map((l) => {
    const label = l.ep ? `${l.ep.show} S${pad2(l.ep.season)} ${episodeRanges(l.ep.eps)}` : l.subject;
    return { ...l, label, detail: l.action === 'subtitles' && l.lang ? `${l.lang} subtitles for ${label}` : label };
  });
}

// One line of a card: icon, the sentence with its title picked out, and a count or subtitle tag.
function activityLine(l) {
  const [kind, ico] = kindOf(l.action);
  const sentence = (ACTIVITY_TEXT[l.action] || ((d) => `${l.action} ${d}`))(l.detail);
  const at = sentence.indexOf(l.label);
  const text = at < 0 ? [sentence] : [sentence.slice(0, at), h('strong', { title: l.label }, l.label), sentence.slice(at + l.label.length)];
  const repeats = l.ep ? 0 : l.n;
  return h('li', { class: `act-line act-${kind}` },
    h('span', { class: 'act-icon', 'aria-hidden': 'true' }, icon(ICONS[ico] ? ico : 'info')),
    h('span', { class: 'act-text' }, ...text,
      repeats > 1 && h('span', { class: 'act-tag' }, `×${repeats}`),
      ...[...l.langs].map((lang) => h('span', { class: 'act-tag', title: T('{0} subtitles', lang) }, T('{0} subs', lang)))),
    h('time', { class: 'act-time', datetime: new Date(l.at).toISOString() }, clock(l.at)));
}

// Feed cards: one per person per sitting (same day, under an hour between things).
function activitySessions(events) {
  const out = [];
  for (const e of events) {
    const last = out.at(-1);
    if (last && last.user === e.user && last.from - e.at < SESSION_GAP && dayLabel(last.from) === dayLabel(e.at)) {
      last.events.push(e); last.from = e.at;
    } else out.push({ user: e.user, first: e, events: [e], at: e.at, from: e.at });
  }
  return out;
}

function activityCard(s) {
  const e = s.first;
  const system = e.user === SYSTEM_USER;
  const lines = sessionLines(s.events);
  const span = clock(s.from) === clock(s.at) ? clock(s.at) : `${clock(s.from)}–${clock(s.at)}`;
  return h('li', { class: `act-card${system ? ' is-system' : ''}` },
    h('div', { class: 'act-card-head' },
      system ? people.face(e, { size: 34 }) : people.faceButton(e, { size: 34 }),
      h('div', { class: 'act-who' },
        !system && e.id
          ? h('button', { type: 'button', class: 'act-name act-name-btn', title: T('Open {0}’s profile', personName(e)),
            onclick: (ev) => profiles.open({ id: e.id, name: personName(e), avatar: e.avatar }, ev.currentTarget) }, personName(e))
          : h('span', { class: 'act-name', title: e.user }, system ? T('Lilin itself') : personName(e)),
        !system && h('span', { class: 'act-where' }, activityDevice(e))),
      h('span', { class: 'act-span' }, span)),
    h('ul', { class: `act-lines${lines.length === 1 ? ' is-single' : ''}` }, lines.map(activityLine)));
}

// The top of the page: a few numbers for today and everyone who's been around (tap a face to see just them).
function activitySummary(events) {
  const today = new Date().toDateString();
  const todays = events.filter((e) => new Date(e.at).toDateString() === today && e.user !== SYSTEM_USER);
  const peopleList = (state.activity.people || []).filter((p) => p.user !== SYSTEM_USER);
  const on = peopleList.filter((p) => Date.now() - p.at < 3 * 60000).length;
  const watched = new Set(todays.filter((e) => e.action === 'play').map((e) => e.detail)).size;
  const downloads = todays.filter((e) => e.action === 'download').length;
  const who = new Set(todays.map((e) => e.user)).size;
  const tile = (n, label, cls = '') => h('div', { class: `act-stat${cls}` }, h('strong', {}, String(n)), h('span', {}, label));
  const pick = state.activityPerson;
  // Inviting people and who may sign in live in House → People now (the owner's); the strip only filters the feed.
  return [
    h('div', { class: 'act-stats' },
      tile(on, T('on right now'), on ? ' is-live' : ''),
      tile(who, who === 1 ? T('person today') : T('people today')),
      tile(watched, watched === 1 ? T('video watched today') : T('videos watched today')),
      tile(downloads, downloads === 1 ? T('download today') : T('downloads today'))),
    peopleList.length > 0 && h('div', { class: 'act-people', role: 'group', 'aria-label': T('Show one person') },
      peopleList.map((p) => h('button', {
        type: 'button', class: 'act-person', 'aria-pressed': String(pick === p.user), title: `${personName(p)} · ${lastSeenText(p.at)} · ${activityDevice(p)}`,
        onclick: () => { state.activityPerson = pick === p.user ? null : p.user; renderActivity(); },
      },
      h('span', { class: 'activity-face' }, people.face(p, { size: 44 }),
        h('span', { class: `activity-dot${Date.now() - p.at < 3 * 60000 ? ' is-on' : ''}`, 'aria-hidden': 'true' })),
      h('span', { class: 'act-person-name' }, personName(p)),
      h('span', { class: 'act-person-seen' }, lastSeenText(p.at))))),
  ];
}

function renderActivity() {
  // Rebuilding mid-typing would throw away the box being typed in (the filter).
  if (editingIn('#activity-body')) return;
  const body = $('#activity-body');
  if (state.activityError) { body.replaceChildren(notice(T('Couldn’t get activity'), state.activityError)); return; }
  if (!state.activity) return;
  filterField('activity', T('Filter by person or title'), renderActivity);
  const q = norm(pageFilters.activity);
  const filter = state.activityFilter || 'all';
  const all = state.activity.events;
  const events = all.filter((e) => (filter === 'all' || kindOf(e.action)[0] === filter)
    && (!state.activityPerson || e.user === state.activityPerson)
    && (!q || norm(`${e.user} ${personName(e)} ${e.subjectName || ''} ${e.detail} ${e.action} ${activityDevice(e)}`).includes(q)));
  const out = [...activitySummary(all)];
  const days = [];
  for (const s of activitySessions(events)) {
    const label = dayLabel(s.at);
    if (days.at(-1)?.label !== label) days.push({ label, key: `day:${new Date(s.at).toDateString()}`, list: h('ul', { class: 'act-cards' }), n: 0 });
    days.at(-1).n += s.events.length;
    days.at(-1).list.append(activityCard(s));
  }
  const picked = state.activityPerson && (state.activity.people || []).find((p) => p.user === state.activityPerson);
  out.push(h('div', { class: 'act-feed-head' },
    h('div', { class: 'act-feed-title' },
      h('h3', { class: 'activity-head' }, picked ? T('What {0} did', personName(picked)) : T('What happened')),
      picked?.id && h('button', { type: 'button', class: 'chip act-profile-btn',
        onclick: (ev) => profiles.open({ id: picked.id, name: personName(picked), avatar: picked.avatar }, ev.currentTarget) }, T('Profile'))),
    segmented(ACTIVITY_FILTERS.map(([k, t]) => [k, T(t)]), filter, (k) => { state.activityFilter = k; renderActivity(); }, T('Show'))));
  if (!events.length) out.push(h('p', { class: 'muted act-empty' }, q || filter !== 'all' || picked ? T('Nothing matches.') : T('Nothing has happened yet.')));
  for (const d of days) out.push(...foldGroup(d.key, 'p', 'activity-day', d.label, d.n, [d.list], Boolean(q)));
  // Keep the people strip where it was: tapping someone far along it used to snap it back to the start.
  const stripX = body.querySelector('.act-people')?.scrollLeft || 0;
  body.replaceChildren(...out);
  const strip = body.querySelector('.act-people');
  if (strip) strip.scrollLeft = stripX;
}

function activityDevice(entry) {
  const loc = entry.location;
  let country = loc?.country || '';
  if (country) { try { country = new Intl.DisplayNames([lang], { type: 'region' }).of(country); } catch { /* use country code */ } }
  return [T(entry.device), [loc?.city, country].filter(Boolean).join(', ') || T('Location unavailable')].filter(Boolean).join(' · ');
}

// ---------- house (server owner only) ----------
// The home server's own health plus the machines that report in (laptop, desktop): house.js.
async function loadHouse() {
  const sub = state.view === 'house' ? state.sub : null;
  if (sub === 'screen-time') { await loadScreenTime(); return; }
  if (sub === 'people') { await loadPeople(); return; }
  if (sub === 'ideas') { await loadIdeas(); return; }
  if (sub === 'rules') return;
  const [r, l] = await Promise.allSettled([api('/api/house'), api(`/api/house/load?hours=${state.houseHours || 1}`)]);
  if (r.status === 'fulfilled') { state.house = r.value; state.houseError = null; } else state.houseError = r.reason.message;
  state.houseLoad = l.status === 'fulfilled' ? l.value : null;
}

// ---------- house → sharing: what streams and encodes cost the server (load.js) ----------
const mbps = (bytesPerSec) => (bytesPerSec * 8) / 1e6;
function fmtMbit(bytesPerSec, unit = true) {
  const v = mbps(bytesPerSec || 0);
  const t = v >= 1000 ? `${(v / 1000).toFixed(1)} G` : v >= 10 ? `${Math.round(v)}` : v >= 0.05 ? v.toFixed(1) : '0';
  return unit ? `${t}${t.endsWith('G') ? 'bit/s' : T(' Mbit/s')}` : t;
}
const fmtFor = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return T('{0} min', Math.floor(s / 60));
  return T('{0} h {1} min', Math.floor(s / 3600), Math.floor((s % 3600) / 60));
};
// A meter row: name · bar · reading. `parts` are [value, class] segments of `max`.
function loadRow(name, parts, max, reading, title) {
  const total = parts.reduce((a, [v]) => a + (v || 0), 0);
  const full = max && total / max >= 0.85;
  return h('div', { class: 'house-disk load-row', title },
    h('span', { class: 'house-disk-name' }, name),
    h('span', { class: `meter${full ? ' is-full' : ''}`, role: 'img', 'aria-label': `${name}: ${reading}` },
      parts.map(([v, cls]) => h('i', { class: cls || null, style: `width:${max ? Math.min(100, (100 * (v || 0)) / max) : 0}%` }))),
    h('span', { class: 'house-disk-free' }, reading));
}
const WHERE = { internet: 'internet', lan: T('home network'), tv: T('TV') };

// A small history chart (one series), with a readout that follows the pointer.
function loadChart(title, points, { value, peak, max, fmt, empty }) {
  const W = 300, H = 64;
  const head = h('div', { class: 'load-chart-head' }, h('span', {}, title), h('span', { class: 'load-chart-read' }));
  const read = head.lastChild;
  const wrap = h('div', { class: 'load-chart' }, head);
  if (points.length < 2) { wrap.append(h('p', { class: 'muted load-chart-empty' }, empty)); return wrap; }
  const top = Math.max(max ?? 0, ...points.map((p) => peak(p) ?? value(p) ?? 0)) || 1;
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => H - 2 - ((v || 0) / top) * (H - 6);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`).join('');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'load-spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', T('{0}: latest {1}, highest {2}', title, fmt(value(points[points.length - 1])), fmt(top)));
  svg.innerHTML = `<path class="load-area" d="${line}L${W},${H}L0,${H}Z"/><path class="load-line" d="${line}"/>`
    + `<line class="load-cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>`;
  const cursor = svg.lastChild;
  const stamp = (p) => `${clock(p.t)} · ${fmt(value(p))}${peak(p) != null && peak(p) > (value(p) || 0) ? T(' (peak {0})', fmt(peak(p))) : ''}`;
  const latest = () => { read.textContent = T('now {0} · top {1}', fmt(value(points[points.length - 1])), fmt(top)); cursor.setAttribute('visibility', 'hidden'); };
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((ev.clientX - r.left) / r.width) * (points.length - 1))));
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
    read.textContent = stamp(points[i]);
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', latest);
  latest();
  wrap.append(svg, h('div', { class: 'load-chart-axis muted' },
    h('span', {}, clock(points[0].t)), h('span', {}, clock(points[points.length - 1].t))));
  return wrap;
}

function sharingSection(L) {
  const out = [h('div', { class: 'load-head' }, h('h3', { class: 'activity-head' }, T('Sharing')),
    segmented([[1, T('Last hour')], [24, T('Last day')]], state.houseHours || 1, async (hours) => {
      state.houseHours = hours; await loadHouse(); if (state.view === 'house') renderHouse();
    }, T('History')))];
  if (!L) { out.push(h('p', { class: 'muted' }, T('Couldn’t read the server’s load.'))); return out; }
  const lim = L.limits || {};

  const rows = [];
  const inet = L.internet || {};
  const upNow = (inet.streams || 0) + (inet.torrents || 0);
  const upMax = lim.uploadMbps ? (lim.uploadMbps * 1e6) / 8 : null;
  rows.push(loadRow(T('Internet upload'), [[inet.streams, null], [inet.torrents, 'is-alt']], upMax,
    T('{0}{1} Mbit/s', fmtMbit(upNow, false), upMax ? T(' of {0}', lim.uploadMbps) : ''),
    T('Lilin streams going out through Cloudflare, plus qBittorrent seeding. Set UPLOAD_MBPS in .env to the connection’s upload speed.')));
  rows.push(h('div', { class: 'load-legend muted' },
    h('span', {}, h('i', { class: 'load-key' }), T('streams {0}', fmtMbit(inet.streams))),
    inet.torrents != null && h('span', {}, h('i', { class: 'load-key is-alt' }), T('torrents {0}{1}', fmtMbit(inet.torrents), inet.torrentLimit ? T(' (capped at {0})', fmtMbit(inet.torrentLimit)) : '')),
    h('span', {}, T('home network {0}', fmtMbit(L.lan?.streams)))));
  if (L.net) {
    const link = lim.linkMbps ? (lim.linkMbps * 1e6) / 8 : null;
    rows.push(loadRow(T('Network card'), [[L.net.up, null]], link,
      T('↑ {0} · ↓ {1}{2} Mbit/s', fmtMbit(L.net.up, false), fmtMbit(L.net.down, false), link ? T(' of {0}', Math.round(lim.linkMbps)) : ''),
      T('Everything the server sends and receives, from every program.')));
  }
  if (L.cpu != null) rows.push(loadRow(T('CPU'), [[L.cpu, null]], 100, T('{0} %{1}', L.cpu, L.lilinCpu != null ? T(' · Lilin {0} %', L.lilinCpu) : '')));
  const g = L.gpu;
  if (g) {
    rows.push(loadRow(T('GPU encoder'), [[g.enc, null]], 100,
      T('{0} % · {1} of {2} encodes{3}', g.enc ?? 0, g.sessions ?? 0, lim.nvencSessions, g.temp != null ? ` · ${g.temp} °C` : ''),
      T('{0}: NVENC is the hardware encoder conversions use. GPU {1} % busy, decoder {2} %.', g.name, g.busy ?? 0, g.dec ?? 0)));
  }
  for (const d of (L.disks || []).filter((x) => x.label).sort((a, b) => (a.label === 'Media' ? -1 : b.label === 'Media' ? 1 : 0))) {
    rows.push(loadRow(T('{0} drive {1}:', T(d.label), d.drive), [[d.busy, null]], 100, T('{0} % busy · reads {1}/s', d.busy, fmtBytes(d.read)),
      T('Writes {0}/s. A drive near 100 % busy makes streams from it stutter.', fmtBytes(d.write))));
  }
  if (!L.sampled) rows.push(h('p', { class: 'muted load-note' }, T('Machine readings are starting (or only work on the Windows server); streams and jobs are still counted.')));

  const hist = L.history || [];
  const span = (state.houseHours || 1) === 24 ? T('last day') : T('last hour');
  out.push(h('div', { class: 'house-card' },
    (L.warnings || []).length > 0 && h('ul', { class: 'load-warnings' }, L.warnings.map((w) => h('li', {}, w))),
    rows,
    h('div', { class: 'load-charts' },
      loadChart(T('Internet upload'), hist, {
        value: (p) => (p.inet || 0) + (p.tor || 0), peak: (p) => (p.inetMax != null ? p.inetMax + (p.tor || 0) : null),
        fmt: (v) => fmtMbit(v), empty: T('History builds up a minute at a time ({0}).', span),
      }),
      loadChart('CPU', hist, { value: (p) => p.cpu, peak: (p) => p.cpuMax, max: 100, fmt: (v) => `${Math.round(v || 0)} %`, empty: T('History builds up a minute at a time ({0}).', span) }))));

  const streams = L.streams || [];
  out.push(h('div', { class: 'house-card' },
    h('div', { class: 'house-card-head' }, h('span', { class: 'row-title' }, streams.length ? T('Streaming now · {0}', streams.length) : T('Streaming now')),
      h('span', { class: 'muted house-seen' }, T('checked {0}', clock(L.at)))),
    !streams.length ? h('p', { class: 'muted' }, T('Nothing is being watched.'))
      : h('ul', { class: 'load-list' }, streams.map((s) => {
        const slow = s.behind;
        return h('li', {},
          h('span', { class: `activity-dot${slow ? ' is-bad' : ' is-on'}`, 'aria-hidden': 'true' }),
          h('div', { class: 'load-item' },
            h('span', { class: 'row-title' }, s.label),
            h('span', { class: 'row-meta' },
              h('span', {}, [s.who, s.device].filter(Boolean).join(' · ')),
              h('span', {}, s.where === 'internet' && s.fromHome ? T('internet (from home, via Cloudflare)') : WHERE[s.where] || s.where),
              h('span', {}, s.waiting ? T('buffered ahead') : T('{0} now', fmtMbit(s.rate))),
              s.speed > 0 && h('span', { title: T('How fast it arrives while being sent: the line’s speed for this viewer') }, T('arrives at {0}', fmtMbit(s.speed))),
              h('span', {}, T('avg {0}', fmtMbit(s.avg))),
              s.needs && h('span', { class: slow ? 'load-bad' : null }, T('file needs {0}', fmtMbit(s.needs))),
              h('span', {}, T('{0} sent · {1}', fmtBytes(s.sent), fmtFor(Date.now() - s.since))))));
      }))));

  const jobs = L.jobs || [];
  out.push(h('div', { class: 'house-card' },
    h('div', { class: 'house-card-head' }, h('span', { class: 'row-title' }, jobs.length ? T('Encoding now · {0}', jobs.length) : T('Encoding now'))),
    !jobs.length ? h('p', { class: 'muted' }, T('No clip copies, conversions or previews are being made.'))
      : h('ul', { class: 'load-list' }, jobs.map((j) => h('li', {},
        h('span', { class: 'activity-dot is-on', 'aria-hidden': 'true' }),
        h('div', { class: 'load-item' },
          h('span', { class: 'row-title' }, `${j.kind} · ${j.label}`),
          h('span', { class: 'row-meta' },
            j.encoder && h('span', {}, j.encoder),
            h('span', {}, j.cpu != null ? T('CPU {0} %', j.cpu) : T('CPU …')),
            j.mem && h('span', {}, T('RAM {0}', fmtBytes(j.mem))),
            j.percent != null && h('span', {}, `${j.percent} %${j.speed ? ` · ${j.speed}` : ''}`),
            h('span', {}, T('running {0}', fmtFor(Date.now() - j.since))))))))));

  const top = L.top || [];
  if (top.length) {
    out.push(h('div', { class: 'house-card' },
      h('div', { class: 'house-card-head' }, h('span', { class: 'row-title' }, T('Busiest programs'))),
      h('ul', { class: 'load-top' }, top.map((p) => h('li', {},
        h('span', { class: 'house-svc-name' }, p.name), h('span', { class: 'muted' }, T('{0} % CPU{1}{2}', p.cpu, p.mem ? ` · ${fmtBytes(p.mem)}` : '', p.job ? T(' · Lilin job') : '')))))));
  }

  const recent = L.recent || [];
  if (recent.length) {
    out.push(h('details', { class: 'house-card load-recent', open: state.houseRecentOpen || null, ontoggle: (e) => { state.houseRecentOpen = e.currentTarget.open; } },
      h('summary', { class: 'row-title' }, T('Recently finished · {0}', recent.length)),
      h('ul', { class: 'load-list' }, recent.map((r) => h('li', {},
        h('span', { class: `activity-dot${r.type === 'job' && r.ok === false ? ' is-bad' : ''}`, 'aria-hidden': 'true' }),
        h('div', { class: 'load-item' },
          h('span', { class: 'row-title' }, r.type === 'job' ? `${r.kind} · ${r.label}` : r.label),
          h('span', { class: 'row-meta' },
            h('span', {}, `${clock(r.start)}–${clock(r.end)} (${fmtFor(r.end - r.start)})`),
            r.type === 'stream' && h('span', {}, `${r.who} · ${WHERE[r.where] || r.where}`),
            r.type === 'stream' && h('span', {}, T('avg {0} · peak {1}{2}', fmtMbit(r.avg), fmtMbit(r.peak), r.needs ? T(' · needs {0}', fmtMbit(r.needs)) : '')),
            r.type === 'stream' && h('span', {}, T('{0} sent', fmtBytes(r.sent))),
            r.type === 'job' && r.encoder && h('span', {}, r.encoder),
            r.type === 'job' && r.cpu != null && h('span', {}, T('CPU avg {0} %{1}', r.cpu, r.peak ? T(', peak {0} %', r.peak) : '')),
            r.type === 'job' && r.ok === false && h('span', { class: 'load-bad' }, T('failed')))))))));
  }
  return out;
}

function meter(used, size) {
  const pct = size ? Math.round((100 * used) / size) : 0;
  return h('span', { class: `meter${pct >= 90 ? ' is-full' : ''}`, title: T('{0} % used', pct) }, h('i', { style: `width:${pct}%` }));
}
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return T('just now');
  if (s < 5400) return T('{0} min ago', Math.round(s / 60));
  if (s < 129600) return T('{0} h ago', Math.round(s / 3600));
  return T('{0} days ago', Math.round(s / 86400));
};
const upFor = (secs) => (secs >= 86400 ? T('up {0} d {1} h', Math.floor(secs / 86400), Math.floor((secs % 86400) / 3600)) : T('up {0} h {1} min', Math.floor(secs / 3600), Math.floor((secs % 3600) / 60)));
function diskRows(disks, label = (d) => (d.label ? T(d.label) : d.mount)) {
  return disks.map((d) => h('div', { class: 'house-disk' },
    h('span', { class: 'house-disk-name' }, label(d)),
    meter(d.used, d.size),
    h('span', { class: 'house-disk-free' }, T('{0} free', fmtBytes(d.size - d.used)))));
}

// ---------- house (owners) ----------
// The House tab: the owner's tools as tiles, each opening its own page (#house/<tool>). Machines is what the House
// tab used to show (server, VPN, sharing, power, machines); Notes and Game clips keep their own views; People, Ideas
// and Server rules came out of Settings. setHouseDot(n) lights the tab.
function houseLive() { return state.view === 'house' && (!state.sub || state.sub === 'machines' || state.sub === 'screen-time'); }
function setHouseDot(n) { const dot = $('.tab[data-view="house"] .tab-dot'); dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n ? String(n) : ''; }
function renderHouse() {
  const body = $('#house-body');
  const sub = state.view === 'house' ? state.sub : null;
  $('#house-heading').textContent = sub ? T(ROUTES[`house/${sub}`].label) : T('House');
  const filter = filterField('house', T('Filter machines'), renderHouse);
  filter.hidden = sub !== 'machines';
  if (!sub) { renderHouseHub(body); return; }
  if (sub === 'screen-time') { body.replaceChildren(...screenTimeView()); return; }
  if (sub === 'people') { body.replaceChildren(...settingsGroups(peopleSettings(), T('People'))); return; }
  if (sub === 'rules') { body.replaceChildren(...settingsGroups(ownerSettings(), T('Server rules'))); return; }
  if (sub === 'ideas') {
    body.replaceChildren(...settingsGroups(ideaInbox(), T('Ideas')));
    if (ideasView.jump) { ideasView.jump = false; requestAnimationFrame(() => $('[data-anchor="idea-inbox"]')?.scrollIntoView({ block: 'start' })); }
    return;
  }
  renderMachines(body);
}
// House → Needs you: what's waiting for the owner, at most three rows (the machines' alerts, new ideas, downloads
// that need a look). The House tab's dot lights while any is there; the rows hide when nothing waits.
function houseNeeds() {
  if (!state.status?.admin) return [];
  const out = [];
  for (const issue of (state.house?.issues || []).slice(0, 2)) out.push({ label: issue, meta: T('Machines'), run: () => $('[data-anchor="house-machines"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
  const ideas = (ideasView.all || []).filter((i) => i.status === 'new').length + scoutWaiting(ideasView.scout);
  if (ideas) out.push({ route: 'house/ideas', label: T('New ideas'), meta: T('Ideas and bugs people sent you'), count: ideas, run: () => setView('house/ideas') });
  const stuck = state.downloads.filter(transferAttention);
  if (stuck.length) out.push({ label: T('Downloads need attention'), meta: stuck.slice(0, 2).map((d) => d.canonicalTitle || d.title || d.name).join(', '),
    count: stuck.length, route: 'house/downloads', run: () => setView('house/downloads') });
  return out.slice(0, 3);
}
function updateHouseDot() { if (state.status?.admin) setHouseDot(houseNeeds().length); }
// The landing: Needs you, a tile per tool with one live line, then the machines themselves (status, server, VPN,
// sharing, power, every machine). A count on a tile means something there wants doing.
function renderHouseHub(body) {
  const needs = houseNeeds();
  setHouseDot(needs.length);
  const stuck = state.downloads.filter(transferAttention).length;
  const active = state.downloads.filter((d) => !d.done).length;
  const newIdeas = ideasView.loaded ? (ideasView.all || []).filter((i) => i.status === 'new').length + scoutWaiting(ideasView.scout) : 0;
  const tools = [
    ...['house/activity', 'house/notes', 'house/clips', 'house/people', 'house/ideas'].filter((id) => allowedRoute(id, state.me, state.status)).map((id) => ({ route: id, run: () => setView(id) })),
    { route: 'house/downloads', line: stuck ? T('Needs attention') : active ? T('Downloading · {0}', plural(active, 'download')) : T('What’s downloading, and what leaves soon'),
      count: stuck, run: () => setView('house/downloads') },
    { label: T('Your channels'), line: T('What plays on Live'), run: (e) => PLACE_ACTIONS.channels(e.currentTarget) },
    ...['house/rules', 'house/screen-time'].filter((id) => allowedRoute(id, state.me, state.status)).map((id) => ({ route: id, run: () => setView(id) })),
  ];
  const lines = {
    'house/activity': T('Who watched what, and when'),
    'house/notes': T('Notes to yourself, with files and reminders'),
    'house/clips': state.clips?.clips ? plural(state.clips.clips.length, 'clip') : T('Clips from your desktop, ready to trim and share'),
    'house/people': T('Who uses Lilin and what they may do'),
    'house/ideas': newIdeas ? T('{0} new', newIdeas) : T('Ideas and bugs people sent you'),
    'house/rules': T('Auto-delete, keeping longer, new people'),
    'house/screen-time': T('Time on your devices'),
  };
  const counts = { 'house/ideas': newIdeas };
  const tile = ({ label, line, run, route, count }) => h('button', { type: 'button', class: 'tool', 'data-route': route, onclick: run },
    h('span', { class: 'set-label' }, label || T(ROUTES[route].label)), h('span', { class: 'set-hint' }, line || lines[route]),
    (count ?? counts[route]) ? h('b', { class: 'tab-badge' }, String(count ?? counts[route])) : null);
  body.replaceChildren(
    needs.length > 0 && h('section', { class: 'house-needs', 'aria-labelledby': 'house-needs-head' }, h('h3', { class: 'set-head', id: 'house-needs-head' }, T('Needs you')),
      h('div', { class: 'set-stack' }, needs.map((n) => navRow(n)))),
    h('div', { class: 'tool-grid' }, tools.map(tile)),
    h('section', { class: 'house-machines', 'data-anchor': 'house-machines' }, machinesContent()));
  // New ideas count here and in the dot: the inbox is read once the hub is open.
  if (!ideasView.loaded && !ideasView.loading) loadIdeas().then(() => { if (state.view === 'house' && !state.sub) renderHouse(); else updateHouseDot(); });
}
// House → Machines: the server, VPN, sharing, power and every machine.
function renderMachines(body) { body.replaceChildren(...machinesContent()); }
function machinesContent() {
  if (state.houseError) return [notice(T('Couldn’t check the house'), state.houseError, () => loadHouse().then(renderHouse))];
  const r = state.house;
  if (!r) return [h('p', { class: 'muted' }, T('Checking…'))];
  const q = state.sub === 'machines' ? norm(pageFilters.house) : '';
  const out = [];
  out.push(r.issues.length
    ? h('div', { class: 'house-status has-issues' },
      h('strong', {}, r.issues.length === 1 ? T('1 thing needs a look') : T('{0} things need a look', r.issues.length)),
      h('ul', {}, r.issues.map((i) => h('li', {}, i))))
    : h('div', { class: 'house-status' }, h('strong', {}, T('Everything’s fine')), h('span', { class: 'muted' }, T(' · checked {0}', clock(r.checkedAt)))));

  const sv = r.server;
  if (!q || norm(`server ${sv.name}`).includes(q)) {
    out.push(h('h3', { class: 'activity-head' }, T('Server')));
    out.push(h('div', { class: 'house-card' },
      h('div', { class: 'house-card-head' },
        h('span', { class: 'row-title' }, sv.name),
        h('span', { class: 'row-meta' }, h('span', {}, upFor(sv.uptime)), sv.cpu != null && h('span', {}, T('CPU {0} %', sv.cpu)),
          h('span', {}, T('RAM {0} / {1}', fmtBytes(sv.mem.total - sv.mem.avail), fmtBytes(sv.mem.total))))),
      diskRows(sv.disks),
      h('ul', { class: 'house-services' }, sv.services.map((x) => h('li', {},
        h('span', { class: `activity-dot${x.ok ? ' is-on' : ' is-bad'}`, 'aria-hidden': 'true' }),
        h('span', { class: 'house-svc-name' }, x.name), h('span', { class: 'muted' }, x.detail))))));
  }

  if (!q || norm(`vpn mullvad tunnel torrent ${r.machines.map((m) => m.host).join(' ')}`).includes(q)) {
    const card = vpnCard(r);
    if (card) out.push(h('h3', { class: 'activity-head' }, T('VPN')), card);
  }

  if (!q || norm('sharing streams streaming encoding upload cpu gpu').includes(q)) out.push(...sharingSection(state.houseLoad));

  const powered = (r.power || []).filter((pw) => !q || norm(`power ${pw.host} ${pw.entries.map((e) => e.label).join(' ')}`).includes(q));
  if (powered.length) {
    out.push(h('h3', { class: 'activity-head' }, T('Power')));
    for (const pw of powered) out.push(powerCard(pw));
  }

  out.push(h('h3', { class: 'activity-head' }, T('Machines')));
  const machines = r.machines.filter((m) => !q || norm(`${m.host} ${m.kind} ${m.os}`).includes(q));
  if (!r.agents) out.push(h('p', { class: 'muted' }, T('Set HOUSE_TOKEN in .env and run agents/lilin-house on each machine to see them here.')));
  else if (!machines.length) out.push(h('p', { class: 'muted' }, q ? T('Nothing matches.') : T('No machine has reported yet.')));
  for (const m of machines) {
    const meta = [m.kind, m.os, m.kernel, m.uptime != null && upFor(m.uptime),
      m.battery && T('battery {0} %{1}', m.battery.pct, m.battery.status && m.battery.status !== 'Unknown' ? ` (${m.battery.status.toLowerCase()})` : ''),
      m.updates ? T('{0} updates', m.updates) : m.updates === 0 && T('up to date'),
      m.secureBoot != null && T('Secure Boot {0}', m.secureBoot ? 'on' : 'OFF'),
      m.lastBackup ? T('backup {0}', ago(m.lastBackup * 1000)) : T('no backups')].filter(Boolean);
    out.push(h('div', { class: `house-card${m.away ? ' is-away' : ''}` },
      h('div', { class: 'house-card-head' },
        h('span', { class: `activity-dot${m.away ? '' : m.issues.length ? ' is-bad' : ' is-on'}`, 'aria-hidden': 'true' }),
        h('span', { class: 'row-title' }, m.host),
        h('span', { class: 'muted house-seen' }, m.away ? T('away · last seen {0}', ago(m.at)) : T('reported {0}', ago(m.at)))),
      h('div', { class: 'row-meta' }, meta.map((t) => h('span', {}, t))),
      diskRows(m.disks, (d) => d.mount),
      m.failed.length > 0 && h('p', { class: 'house-failed' }, T('Failed: {0}', m.failed.join(', ')))));
  }
  return out;
}

// VPN: the server's torrent tunnel (only qBittorrent uses it) and the Mullvad app on each machine.
// One row each: up/down dot, where it exits, then leaks, drops and watchdog problems underneath.
function vpnCard(r) {
  const when = (ms) => (Date.now() - ms < 86400000 ? clock(ms) : new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' }));
  const where = (v) => [v.city, v.relay, v.exitIp].filter(Boolean).join(' · ');
  const rows = [];
  const sv = r.server.vpn;
  if (sv) {
    rows.push({
      name: `${r.server.name} · torrents`, ok: sv.ok, on: sv.tunnel === 'up',
      text: sv.tunnel === 'up' ? T('Tunnel up · {0}', where(sv) || T('checking exit')) : T('Tunnel DOWN · torrents fenced in by the kill switch'),
      notes: [
        sv.torrentIp && T('qBittorrent public address {0}', sv.torrentIp),
        sv.mullvadExit === false && T('exit isn’t a Mullvad address'),
        sv.lastDropAt && T('last drop {0}', when(sv.lastDropAt)),
        sv.lastLeakAt && T('last leak alarm {0}', when(sv.lastLeakAt)),
      ].filter(Boolean),
      problems: sv.problems,
    });
  }
  for (const m of r.machines) {
    const v = m.vpn;
    if (!v) continue;
    const on = v.state === 'connected';
    rows.push({
      name: m.host, ok: v.state !== 'error' && v.mullvadExit !== false, on: on && !m.away, away: m.away,
      text: on ? T('Connected · {0}', where(v)) : v.state === 'error' ? T('Blocked (error state)') : v.state === 'connecting' ? T('Connecting…') : T('Disconnected'),
      notes: [
        v.lockdown != null && T('lockdown {0}', v.lockdown ? 'on' : 'off'),
        v.lastDrop && T('last drop {0}', when(v.lastDrop * 1000)),
        m.away && T('away · last seen {0}', ago(m.at)),
      ].filter(Boolean),
      problems: [v.error, v.mullvadExit === false && on && T('exit isn’t a Mullvad address')].filter(Boolean),
    });
  }
  if (!rows.length) return null;
  return h('div', { class: 'house-card vpn-card' },
    h('ul', { class: 'house-services' }, rows.map((x) => h('li', { class: 'vpn-row' },
      h('span', { class: `activity-dot${x.away ? '' : !x.ok ? ' is-bad' : x.on ? ' is-on' : ''}`, 'aria-hidden': 'true' }),
      h('div', { class: 'vpn-main' },
        h('div', {}, h('span', { class: 'house-svc-name' }, x.name), ' ', h('span', { class: 'muted' }, x.text)),
        x.notes.length > 0 && h('div', { class: 'row-meta' }, x.notes.map((t) => h('span', {}, t))),
        x.problems.map((p) => h('p', { class: 'house-failed' }, p)))))));
}

// Wake a dual-boot machine into the system you pick, or restart it into another one (house.js,
// "power"). Waking into Windows boots Linux first, which hands over to Windows within a few seconds.
function powerCard(pw) {
  const p = pw.pending;
  const status = p
    ? (p.action === 'wake' ? T('Waking up{0}…', p.label ? T(' into {0}', p.label) : '') : T('Restarting{0}…', p.label ? T(' into {0}', p.label) : ''))
    : pw.on ? T('On · {0}', pw.os || 'Linux') : T('Off, or in Windows');
  const sub = !pw.on && !p && (pw.last?.entry && pw.last.at > pw.seen - 120000
    ? T('Last started into {0} from Lilin {1}', pw.last.label, ago(pw.last.at))
    : T('Linux last answered {0}', ago(pw.seen)));
  const linuxFirst = [...pw.entries].sort((a, b) => (a.os === 'linux' ? 0 : 1) - (b.os === 'linux' ? 0 : 1));
  let buttons;
  if (pw.on) {
    // restarting is disruptive (a game might be running): two taps, like deleting a clip
    const sure = (label, entry) => h('button', {
      type: 'button', class: 'retry', disabled: Boolean(p),
      onclick: (e) => {
        const b = e.currentTarget;
        if (b.dataset.sure) { doPower(pw.host, 'restart', entry, b); return; }
        b.dataset.sure = '1';
        b.classList.add('is-sure');
        b.textContent = T('Tap again to restart');
        setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.sure; b.classList.remove('is-sure'); b.textContent = label; } }, 4000);
      },
    }, label);
    buttons = [...linuxFirst.filter((e) => !e.current).map((e) => sure(T('Restart into {0}', e.label), e.title)), sure(T('Restart'), null)];
  } else {
    buttons = linuxFirst.map((e) => h('button', {
      type: 'button', class: `retry${e.os === 'linux' ? ' is-primary' : ''}`, disabled: !pw.canWake || p?.action === 'wake',
      onclick: (ev) => doPower(pw.host, 'wake', e.title, ev.currentTarget),
    }, T('Start {0}', e.label)));
    if (!buttons.length) buttons = [h('button', { type: 'button', class: 'retry is-primary', disabled: !pw.canWake, onclick: (ev) => doPower(pw.host, 'wake', null, ev.currentTarget) }, T('Turn on'))];
  }
  return h('div', { class: 'house-card power-card' },
    h('div', { class: 'house-card-head' },
      h('span', { class: `activity-dot${pw.on ? ' is-on' : ''}`, 'aria-hidden': 'true' }),
      h('span', { class: 'row-title' }, pw.host),
      h('span', { class: 'muted house-seen' }, status)),
    sub && h('p', { class: 'muted power-sub' }, sub),
    h('div', { class: 'power-actions' }, buttons),
    pw.notes.map((n) => h('p', { class: 'house-failed' }, n)));
}

async function doPower(host, action, entry, btn) {
  btn.disabled = true;
  try {
    const r = await api('/api/house/power', jsonPost({ host, action, entry }));
    toast(r.message);
  } catch (err) { toast(err.message); }
  await loadHouse();
  if (state.view === 'house') renderHouse();
}

// ---------- house → screen time (screentime.js) ----------
// iPhone-style Screen Time from the `screentime` daemon on each machine: a day with hourly bars,
// or a week with the daily average, plus most used apps, pickups and the longest session.
const ST_COLORS = ['social', 'games', 'entertainment', 'web', 'development', 'productivity', 'creativity', 'education', 'utilities'];
const stColor = (category) => {
  const key = String(category || '').toLowerCase().split(/[^a-z]/)[0];
  return ST_COLORS.includes(key) ? `st-c-${key}` : 'st-c-other';
};
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const shiftDate = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };
const stDate = (date, opts) => new Date(`${date}T12:00:00`).toLocaleDateString(langTag, opts);
function fmtDur(s) {
  s = Math.round(s || 0);
  if (!s) return '0m';
  if (s < 60) return '<1m';
  const hrs = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60);
  return hrs ? `${hrs}h ${pad2(min)}m` : `${min}m`;
}

const HOUR_AXIS = Array.from({ length: 24 }, (_, i) => (i % 6 ? null : pad2(i)));
// Gridline labels like iOS: 30m, 60m, 1h 30m, 4h
const stAxisLabel = (s) => (s <= 3600 ? `${Math.round(s / 60)}m` : s % 3600 ? fmtDur(s) : `${s / 3600}h`);

async function loadScreenTime() {
  const st = (state.st ||= { view: 'day', list: 'apps' });
  const q = new URLSearchParams({ today: localDate() });
  if (st.device) q.set('device', st.device);
  if (st.date) q.set('date', st.date);
  try { st.data = await api(`/api/house/screentime?${q}`); st.error = null; } catch (err) { st.error = err.message; }
}

async function stPick(changes) {
  Object.assign(state.st, changes);
  await loadScreenTime();
  if (state.view === 'house') renderHouse();
}

// Top three categories get their colour; everything else is "Other", like iOS.
function stLeaders(categories) {
  return (categories || []).filter((c) => c.name !== 'Other').slice(0, 3).map((c) => c.name);
}

// Stacked bars as plain elements (themeable with CSS). cols: [{ label, title, parts: {cat: s}, total, onclick? }]
function stChart(cols, { top, gridLabel, midLabel, avg, axis, label, leaders }) {
  const chart = h('div', { class: `st-chart${cols.length > 7 ? ' is-hourly' : ''}`, role: 'img', 'aria-label': label });
  const plot = h('div', { class: 'st-plot' },
    h('i', { class: 'st-gridline is-top' }, h('span', {}, gridLabel)),
    h('i', { class: 'st-gridline is-mid' }, midLabel && h('span', {}, midLabel)),
    avg != null && avg > 0 && h('i', { class: 'st-avg', style: `bottom:${Math.min(100, (100 * avg) / top)}%` }, h('span', {}, T('avg'))));
  for (const c of cols) {
    const segs = [];
    let other = c.total || 0;
    for (const name of leaders) {
      const v = c.parts[name] || 0;
      if (v > 0) { segs.push(h('i', { class: stColor(name), style: `height:${(100 * v) / (c.total || 1)}%` })); other -= v; }
    }
    if (other > 1) segs.push(h('i', { class: 'st-c-other', style: `height:${(100 * other) / (c.total || 1)}%` }));
    const height = c.total ? Math.max(2, Math.min(100, (100 * c.total) / top)) : 0;
    const bar = h(c.onclick ? 'button' : 'span', {
      class: `st-col${c.current ? ' is-current' : ''}`, title: c.title, type: c.onclick ? 'button' : null, onclick: c.onclick,
      'aria-label': c.onclick ? c.title : null,
    }, h('span', { class: 'st-stack', style: `height:${height}%` }, segs.reverse()));
    plot.append(bar);
  }
  chart.append(plot, h('div', { class: 'st-axis muted' }, axis.map((t) => h('span', {}, t || ''))));
  return chart;
}

function stLegend(categories, leaders) {
  const rows = leaders.map((name) => [name, categories.find((c) => c.name === name)?.seconds || 0]);
  return h('div', { class: 'st-legend' }, rows.map(([name, s]) =>
    h('span', {}, h('i', { class: `st-dot ${stColor(name)}` }), h('b', {}, name), ` ${fmtDur(s)}`)));
}

function stMostUsed(apps, categories) {
  const st = state.st;
  const showApps = st.list !== 'categories';
  const items = showApps ? apps : categories.map((c) => ({ name: c.name, category: c.name, seconds: c.seconds }));
  const best = items[0]?.seconds || 1;
  const shown = st.more ? items : items.slice(0, 8);
  return h('section', { class: 'st-card' },
    h('div', { class: 'st-card-head' }, h('h4', {}, T('Most used')),
      segmented([['apps', T('Apps')], ['categories', T('Categories')]], showApps ? 'apps' : 'categories', (list) => { st.list = list; st.more = false; renderHouse(); }, T('Most used by'))),
    items.length ? h('ol', { class: 'st-apps' }, shown.map((a) => h('li', {},
      h('span', { class: `st-icon ${stColor(a.category)}`, 'aria-hidden': 'true' }, (a.name || '?').trim().charAt(0).toUpperCase()),
      h('span', { class: 'st-app-main' },
        h('span', { class: 'st-app-line' }, h('span', { class: 'st-app-name' }, a.name), h('span', { class: 'st-app-time' }, fmtDur(a.seconds))),
        h('span', { class: 'st-app-bar' }, h('i', { class: stColor(a.category), style: `width:${Math.max(1.5, (100 * a.seconds) / best)}%` })),
        showApps && h('span', { class: 'st-app-cat muted' }, a.category)))))
      : h('p', { class: 'muted' }, T('Nothing used yet.')),
    items.length > 8 && h('button', { type: 'button', class: 'st-more', onclick: () => { st.more = !st.more; renderHouse(); } }, st.more ? T('Show less') : T('Show {0} more', items.length - 8)));
}

function stDayView(D) {
  const s = D.day;
  const out = [];
  if (!s) {
    out.push(h('section', { class: 'st-card st-hero' }, h('p', { class: 'st-eyebrow' }, T('Screen time')), h('p', { class: 'st-big' }, '0m'),
      h('p', { class: 'muted' }, D.date === localDate() ? T('Nothing yet today on this device.') : T('Nothing recorded this day.'))));
    return out;
  }
  const leaders = stLeaders(s.categories);
  const peak = Math.max(0, ...s.hourly.map((x) => x.seconds));
  const top = Math.max(3600, Math.ceil(peak / 1800) * 1800);
  const avg = D.week?.average;
  const diff = avg ? Math.round((100 * (s.total - avg)) / avg) : null;
  out.push(h('section', { class: 'st-card st-hero' },
    h('p', { class: 'st-eyebrow' }, T('Screen time')),
    h('div', { class: 'st-big-row' }, h('p', { class: 'st-big' }, fmtDur(s.total)),
      diff != null && D.week.days.filter((d) => d.total != null).length > 1 && h('span', { class: 'st-pill' },
        T('{0} {1}% {2} this week’s average', diff > 0 ? '↑' : diff < 0 ? '↓' : '=', Math.abs(diff), diff >= 0 ? T('above') : T('below')))),
    stChart(s.hourly.map((x, i) => ({ total: x.seconds, parts: x.categories, title: `${pad2(i)}:00 · ${fmtDur(x.seconds)}` })), {
      top, gridLabel: stAxisLabel(top), midLabel: stAxisLabel(top / 2), axis: HOUR_AXIS, leaders,
      label: T('Screen time by hour: {0} in total, busiest hour {1}', fmtDur(s.total), fmtDur(peak)),
    }),
    stLegend(s.categories, leaders),
    h('p', { class: 'st-updated muted' }, `${s.complete ? T('Complete day') : T('Updated')} · ${clock(s.generated * 1000)}${state.st.device === 'all' ? T(' · {0} devices', D.devices.length) : ''}`)));

  const grid = h('div', { class: 'st-grid' }, stMostUsed(s.apps, s.categories));
  const ptop = Math.max(1, ...s.pickupsHourly);
  grid.append(h('section', { class: 'st-card' },
    h('div', { class: 'st-card-head' }, h('h4', {}, T('Pickups'))),
    h('div', { class: 'st-stat-row' },
      h('div', {}, h('p', { class: 'st-num' }, String(s.pickups)), h('p', { class: 'muted' }, T('wakes and unlocks'))),
      h('div', {}, h('p', { class: 'st-num' }, s.firstPickup || '—'), h('p', { class: 'muted' }, T('first pickup')))),
    h('div', { class: 'st-ticks', role: 'img', 'aria-label': T('Pickups by hour, at most {0} in an hour', ptop) },
      s.pickupsHourly.map((n, i) => h('i', { title: (n === 1 ? T('{0}:00 · {1} pickup', pad2(i), n) : T('{0}:00 · {1} pickups', pad2(i), n)), style: `height:${n ? Math.max(12, (100 * n) / ptop) : 0}%` }))),
    h('div', { class: 'st-axis muted' }, HOUR_AXIS.map((t) => h('span', {}, t || ''))),
    s.afterPickup.length > 0 && h('div', { class: 'st-after' }, h('p', { class: 'st-sub' }, T('First used after pickup')),
      h('ul', {}, s.afterPickup.slice(0, 4).map((a) => h('li', {}, h('span', {}, a.name), h('span', { class: 'muted' }, String(a.count)))))),
    s.longest && h('div', { class: 'st-after' }, h('p', { class: 'st-sub' }, T('Longest session')),
      h('p', { class: 'st-longest' }, h('b', {}, fmtDur(s.longest.seconds)),
        h('span', { class: 'muted' }, ` ${s.longest.start}–${s.longest.end}${s.longest.name ? T(' · mostly {0}', s.longest.name) : ''}`)))));
  out.push(grid);
  return out;
}

function stWeekView(D) {
  const w = D.week;
  const leaders = stLeaders(w.categories);
  const peak = Math.max(0, ...w.days.map((d) => d.total || 0), w.average || 0);
  const top = Math.max(3600, Math.ceil(peak / 3600) * 3600);
  const today = localDate();
  const out = [h('section', { class: 'st-card st-hero' },
    h('p', { class: 'st-eyebrow' }, T('Daily average')),
    h('div', { class: 'st-big-row' }, h('p', { class: 'st-big' }, fmtDur(w.average)),
      w.change != null && h('span', { class: 'st-pill' }, T('{0} {1}% from last week', w.change > 0 ? '↑' : w.change < 0 ? '↓' : '=', Math.abs(w.change)))),
    stChart(w.days.map((d) => ({
      total: d.total || 0, parts: d.categories, current: d.date === today,
      title: `${stDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${d.total == null ? T('no data') : fmtDur(d.total)}`,
      onclick: d.total == null ? null : () => stPick({ view: 'day', date: d.date }),
    })), {
      top, gridLabel: stAxisLabel(top), midLabel: stAxisLabel(top / 2), avg: w.average, leaders,
      axis: w.days.map((d) => stDate(d.date, { weekday: 'short' }).slice(0, 1)),
      label: T('Screen time per day: daily average {0}', fmtDur(w.average)),
    }),
    stLegend(w.categories, leaders),
    h('div', { class: 'st-week-stats' },
      h('span', {}, h('b', {}, fmtDur(w.total)), h('span', { class: 'muted' }, T(' total'))),
      h('span', {}, h('b', {}, String(w.pickups)), h('span', { class: 'muted' }, T(' pickups · {0} a day', w.pickupsAverage))),
      w.longest && h('span', {}, h('b', {}, fmtDur(w.longest.seconds)), h('span', { class: 'muted' }, T(' longest session')))))];
  out.push(h('div', { class: 'st-grid' }, stMostUsed(w.apps, w.categories)));
  return out;
}

function screenTimeView() {
  const st = (state.st ||= { view: 'day', list: 'apps' });
  const D = st.data;
  if (st.error) return [notice(T('Couldn’t load Screen Time'), st.error, () => stPick({}))];
  if (!D) return [h('p', { class: 'muted' }, T('Loading…'))];
  if (!D.devices.length) {
    return [h('section', { class: 'st-card st-setup' },
      h('h4', {}, T('No Screen Time yet')),
      h('p', { class: 'muted' }, D.configured
        ? T('Install screentime on a machine and point its push at this server: set [push] url to /api/screentime here and the token to SCREENTIME_TOKEN.')
        : T('Set SCREENTIME_TOKEN in .env, restart Lilin, then point each machine’s screentime push at /api/screentime with that token.')),
      h('a', { href: 'https://github.com/Tjabooo/screentime', target: '_blank', rel: 'noopener' }, T('github.com/Tjabooo/screentime')))];
  }
  const today = localDate();
  const devices = D.devices.length > 1 ? [['all', T('All devices')], ...D.devices.map((d) => [d.name, d.name])] : D.devices.map((d) => [d.name, d.name]);
  const week = st.view === 'week';
  const date = D.date;
  let title;
  if (week) {
    const thisWeek = D.week.start <= today && today <= D.week.end;
    const lastWeek = shiftDate(D.week.start, 7) <= today && today <= shiftDate(D.week.end, 7);
    title = thisWeek ? T('This week') : lastWeek ? T('Last week')
      : `${stDate(D.week.start, { day: 'numeric', month: 'short' })} – ${stDate(D.week.end, { day: 'numeric', month: 'short' })}`;
  } else {
    title = date === today ? T('Today') : date === shiftDate(today, -1) ? T('Yesterday') : stDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const step = week ? 7 : 1;
  const first = D.dates[0] || date;
  const canBack = week ? D.week.start > first : date > first;
  const canForward = week ? D.week.end < today : date < today;
  const seen = D.devices.find((d) => d.name === D.device);
  const out = [
    h('div', { class: 'st-controls' },
      segmented(devices, D.device, (device) => stPick({ device }), T('Device')),
      segmented([['day', T('Day')], ['week', T('Week')]], week ? 'week' : 'day', (view) => stPick({ view }), T('Period'))),
    h('div', { class: 'st-datebar' },
      h('button', { type: 'button', class: 'st-step', disabled: !canBack, 'aria-label': week ? T('Previous week') : T('Previous day'), onclick: () => stPick({ date: shiftDate(date, -step) }) }, '‹'),
      h('div', { class: 'st-date' }, h('strong', {}, title),
        h('span', { class: 'muted' }, week ? `${stDate(D.week.start, { day: 'numeric', month: 'short' })} – ${stDate(D.week.end, { day: 'numeric', month: 'short' })}`
          : seen?.lastSeen ? T('{0} last reported {1}', seen.name, ago(seen.lastSeen)) : stDate(date, { weekday: 'short', day: 'numeric', month: 'short' }))),
      h('button', { type: 'button', class: 'st-step', disabled: !canForward, 'aria-label': week ? T('Next week') : T('Next day'), onclick: () => stPick({ date: shiftDate(date, step) > today ? today : shiftDate(date, step) }) }, '›')),
  ];
  return out.concat(week ? stWeekView(D) : stDayView(D));
}

// ---------- clips (server owner only) ----------
// Game clips from the desktop (clips.js). Sharing makes a public /c/ link that embeds in Discord.
async function loadClips() {
  try { state.clips = await api('/api/clips'); state.clipsError = null; } catch (err) { state.clipsError = err.message; }
}

async function shareClip(c, btn) {
  btn.disabled = true;
  try {
    const r = await api(`/api/clips/${c.id}/share`, { method: 'POST' });
    c.share = r;
    c.shareUrl = r.url;
    if (r.ready) await copyLink(r.url);
    else toast(T('Preparing a Discord-friendly copy… the link is ready in a minute.'));
  } catch (err) { toast(err.message); }
  await loadClips();
  renderClips();
}
const copyLink = (url) => copyWithToast(url, T('Link copied: paste it in Discord'));
// ---------- clip editor (lossless: never a lossy re-encode) ----------
// The clip is a row of parts on a timeline. Split at the playhead, then remove the parts you don't
// want; trimming the start or end is the same thing at the edges. What's kept is joined into a new
// file. AV1 clips (`exact` from the server) cut on the exact frame: at the start the frames before the
// cut are copied and hidden (an MP4 edit list), at later joins the frames between the cut and the next
// keyframe are rebuilt losslessly; the rest is copied. Other clips can only start a kept stretch
// on a keyframe, so it may begin a little early: the timeline shows that lead-in, and a cut too
// short to clear the next keyframe is flagged before saving.
const fmtT = (t) => { const d = Math.round(t * 10); return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, '0')}`; };
// Game events on a clip's timeline (CS2 kills, deaths, rounds, the bomb: "<clip>.events.json").
const EVENT_ICONS = {
  kill: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>',
  hs: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="2.2" class="fill"/></svg>',
  death: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.2 3 5.3V19h8v-3.7c1.8-1.1 3-2.9 3-5.3a7 7 0 0 0-7-7Z"/><circle cx="9.3" cy="10.5" r="1.5" class="fill"/><circle cx="14.7" cy="10.5" r="1.5" class="fill"/><path d="M10.5 19v2M13.5 19v2"/></svg>',
  round_start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></svg>',
  round_end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h12v8H6M10 4v8M14 4v8M6 8h12"/></svg>',
  bomb_planted: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="14" r="6"/><path d="M14.8 9.7 17.5 7M19 3.5v1.6M21.4 6h-1.6M20.7 4.3l-1.1 1.1"/></svg>',
  bomb_defused: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
  bomb_exploded: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 1.8 5 4.9-2.2-2.2 4.9 5 1.8-5 1.8 2.2 4.9-4.9-2.2-1.8 5-1.8-5-4.9 2.2 2.2-4.9-5-1.8 5-1.8-2.2-4.9 4.9 2.2Z"/></svg>',
  other: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" class="fill"/></svg>',
};
// The recorder writes English labels; the ones Lilin knows are shown in your language.
const eventLabel = (e) => {
  const round = /^Round (\d+)$/.exec(e.label);
  if (round) return T('Round {0}', round[1]);
  return ({ Kill: T('Kill'), Headshot: T('Headshot'), Death: T('Death'), 'Round won': T('Round won'), 'Round lost': T('Round lost'), 'Round over': T('Round over'),
    'Bomb planted': T('Bomb planted'), 'Bomb defused': T('Bomb defused'), 'Bomb exploded': T('Bomb exploded') })[e.label] || e.label;
};
const eventKind = (e) => (e.type === 'kill' ? 'kill' : e.type === 'death' ? 'death' : e.type.startsWith('round_') ? 'round' : e.type.startsWith('bomb_') ? 'bomb' : 'other');
const EVENT_LEAD = 1; // jumping to an event lands this many seconds before it, so you see it happen

const EDIT_ICONS = {
  split: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.5 20 18M8.6 16.5 20 6"/></svg>',
  start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M19 12H9M13 8l-4 4 4 4"/></svg>',
  end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4v16M5 12h10M11 8l4 4-4 4"/></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
};
async function openTrim(c, opener) {
  const video = h('video', { class: 'edit-video', src: `/api/clips/${c.id}/video`, playsinline: true, preload: 'auto' });
  try { video.volume = Math.min(1, Math.max(0, Number(localStorage.getItem('player:volume') ?? 1))); video.muted = localStorage.getItem('player:muted') === '1'; } catch { /* blocked */ }
  let duration = 0;
  let keys = [0];
  let exact = false;      // the server can cut this clip on any frame
  let frameDur = 1 / 30;  // one frame, for , and .
  let pieces = [];        // [{ start, end, keep }] covering the whole clip, in order
  let tracks = [];        // the clip's audio tracks (from the server); the mix isn't offered
  const removed = new Set();
  // Camera overlay (clips recorded with the OBS virtual camera): a box you drag and resize on the
  // picture, burned into the copy when it's on. Place and on/off are remembered for the next clip.
  let cam = null;         // { offset, duration, width, height } from the server
  let events = [];        // [{ t, type, label, hs }] game events in the clip, from the server
  let frameW = 16, frameH = 9;
  const camPlace = (() => { try { const v = JSON.parse(localStorage.getItem('clip:cam:place')); if (v && [v.x, v.y, v.w].every(Number.isFinite)) return v; } catch { /* default */ } return { x: 0.73, y: 0.04, w: 0.24 }; })();
  let camOn = (() => { try { return localStorage.getItem('clip:cam:on') !== '0'; } catch { return true; } })();
  const undo = [];
  let busy = false;
  const MIN_PIECE = 0.2;  // seconds; no slivers from double-clicking Split
  const snap = (t) => (exact ? t : keys.filter((k) => k <= t + 0.001).pop() ?? 0);
  // an exact cut that doesn't land on a keyframe's own frame gets a hidden or losslessly rebuilt lead-in
  const offKey = (t) => t > 0.0005 && !keys.some((k) => t >= k - 0.0005 && t < k + frameDur - 0.0005);
  // Kept stretches: neighbouring kept parts merge; `from` is where the copy really starts.
  const runs = () => {
    const out = [];
    for (const p of pieces) {
      if (!p.keep) continue;
      const last = out.at(-1);
      if (last && Math.abs(last.end - p.start) < 0.001) last.end = p.end;
      else out.push({ start: p.start, end: p.end });
    }
    for (const r of out) r.from = snap(r.start);
    return out;
  };
  const problem = (list) => {
    if (!list.length) return T('Everything is removed. Restore a part to keep it.');
    for (let i = 1; i < list.length; i++) {
      if (list[i].from < list[i - 1].end - 0.001) return T('The cut at {0} is too short to remove without re-encoding: the next part has to start on the keyframe at {1}. Make the cut longer, or restore it.', fmtT(list[i - 1].end), fmtT(list[i].from));
    }
    if (list.some((r) => r.end - r.start < 0.3)) return T('A kept part is shorter than 0.3 s. Remove it or make it longer.');
    if (list.reduce((n, r) => n + r.end - r.from, 0) < 1) return T('The edit has to be at least 1 second long.');
    return '';
  };
  const pieceAt = (t) => pieces.find((p) => t >= p.start && t < p.end) || pieces.at(-1);
  const remember = () => { undo.push(pieces.map((p) => ({ ...p }))); if (undo.length > 100) undo.shift(); };
  const split = (t) => {
    const p = pieceAt(t);
    if (!p || t - p.start < MIN_PIECE || p.end - t < MIN_PIECE) return false;
    pieces.splice(pieces.indexOf(p), 1, { start: p.start, end: t, keep: p.keep }, { start: t, end: p.end, keep: p.keep });
    return true;
  };
  const act = (what) => {
    if (!duration || busy) return;
    const t = video.currentTime;
    remember();
    const before = JSON.stringify(pieces);
    if (what === 'split' && !split(t)) toast(T('Too close to a split already'));
    if (what === 'toggle') { const p = pieceAt(t); p.keep = !p.keep; }
    if (what === 'start') { split(t); for (const p of pieces) if (p.end <= t + 0.001) p.keep = false; }
    if (what === 'end') { split(t); for (const p of pieces) if (p.start >= t - 0.001) p.keep = false; }
    if (JSON.stringify(pieces) === before) undo.pop();
    render();
  };
  const undoLast = () => { if (undo.length && !busy) { pieces = undo.pop(); render(); } };

  // ---- timeline ----
  const track = h('div', { class: 'edit-track' });
  const head = h('div', { class: 'edit-head' });
  const hover = h('div', { class: 'edit-hover', hidden: true });
  const timeline = h('div', { class: 'edit-timeline', role: 'slider', tabindex: 0, 'aria-label': T('Position in the clip'), 'aria-valuemin': 0 }, track, head, hover);
  const pos = (t) => `${duration ? (t / duration) * 100 : 0}%`;
  // game events: a lane of markers above the timeline (click = jump there), ticks on the track
  const marks = h('div', { class: 'edit-events', hidden: true, role: 'group', 'aria-label': T('Game events') });
  const keysHint = h('p', { class: 'edit-keys muted' }, T('Space play · S split · X remove or restore · [ ] start or end here · ← → 1 s · , . one frame · R rename · Ctrl+Z undo'));
  // The clip's name, renamed right here (same rename as on the clip card; R jumps into it)
  const nameWrap = inlineName({
    getName: () => c.title, label: T('Clip'), maxLength: 120,
    errorId: `edit-rename-error-${c.id}`, successMessage: T('Clip renamed'),
    save: async (next, previousTitle) => {
      const renamed = await api(`/api/clips/${c.id}/rename`, jsonPost({ title: next, previousTitle }));
      c.title = renamed.title;
      const current = state.clips?.clips.find((item) => item.id === c.id); if (current) current.title = renamed.title;
      if (state.view === 'clips') renderClips();
    },
  });
  nameWrap.classList.add('edit-name');
  const goToEvent = (e) => { video.currentTime = Math.max(0, e.t - EVENT_LEAD); updateHead(); };
  const jumpEvent = (dir) => {
    const t = video.currentTime;
    const e = dir > 0 ? events.find((x) => x.t - EVENT_LEAD > t + 0.05) : events.findLast((x) => x.t - EVENT_LEAD < t - 0.3);
    if (e) goToEvent(e);
  };
  function renderEvents() {
    if (!duration || !events.length) return;
    // markers closer than ~2 % of the timeline go up a row, so a quick 2K stays clickable
    const gap = duration * 0.022;
    const lastInRow = [-Infinity, -Infinity];
    marks.replaceChildren(...events.map((e) => {
      const row = e.t - lastInRow[0] >= gap ? 0 : e.t - lastInRow[1] >= gap ? 1 : 0;
      lastInRow[row] = e.t;
      const label = `${eventLabel(e)} · ${fmtT(e.t)}`;
      const b = h('button', { type: 'button', class: `edit-event is-${eventKind(e)}${e.hs ? ' is-hs' : ''}${row ? ' is-up' : ''}`, style: `left:${pos(e.t)}`, title: label, 'aria-label': label, onclick: () => goToEvent(e) });
      b.innerHTML = EVENT_ICONS[e.type === 'kill' && e.hs ? 'hs' : e.type] || EVENT_ICONS.other;
      return b;
    }));
    marks.classList.toggle('has-rows', events.some((_, i) => marks.children[i]?.classList.contains('is-up')));
    marks.hidden = false;
  }
  const timeAt = (x) => { const r = timeline.getBoundingClientRect(); return Math.min(Math.max((x - r.left) / r.width, 0), 1) * duration; };
  let scrubbing = false;
  timeline.addEventListener('pointerdown', (e) => {
    if (!duration) return;
    timeline.setPointerCapture(e.pointerId); scrubbing = true;
    video.currentTime = timeAt(e.clientX); updateHead();
  });
  timeline.addEventListener('pointermove', (e) => {
    if (!duration) return;
    if (scrubbing) { video.currentTime = timeAt(e.clientX); updateHead(); }
    if (e.pointerType === 'mouse' || scrubbing) {
      const t = timeAt(e.clientX);
      hover.hidden = false; hover.textContent = fmtT(t); hover.style.left = pos(t);
    }
  });
  const stopScrub = () => { scrubbing = false; };
  timeline.addEventListener('pointerup', stopScrub);
  timeline.addEventListener('pointercancel', stopScrub);
  timeline.addEventListener('pointerleave', () => { if (!scrubbing) hover.hidden = true; });

  // ---- controls ----
  const playBtn = h('button', { type: 'button', class: 'edit-play', 'aria-label': T('Play (Space)') });
  const now = h('span', { class: 'edit-now' }, '0:00.0');
  const total = h('span', { class: 'edit-total' }, '');
  const tool = (key, label, what, hint) => {
    const b = h('button', { type: 'button', class: 'edit-tool', title: hint, onclick: () => act(what) }, h('span', { class: 'edit-tool-label' }, label));
    b.insertAdjacentHTML('afterbegin', EDIT_ICONS[key]);
    return b;
  };
  const startBtn = tool('start', T('Start here'), 'start', T('Remove everything before the playhead ([)'));
  const splitBtn = tool('split', T('Split'), 'split', T('Split the clip at the playhead (S)'));
  const endBtn = tool('end', T('End here'), 'end', T('Remove everything after the playhead (])'));
  const toggleBtn = tool('remove', T('Remove part'), 'toggle', T('Remove or restore the part under the playhead (X)'));
  const undoBtn = h('button', { type: 'button', class: 'edit-tool edit-undo', title: T('Undo (Ctrl+Z)'), 'aria-label': T('Undo'), onclick: undoLast });
  undoBtn.innerHTML = EDIT_ICONS.undo;
  const info = h('p', { class: 'edit-info', role: 'status' }, T('Loading the clip…'));
  const camVideo = h('video', { class: 'edit-cam-video', muted: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true' });
  const camHandle = h('div', { class: 'edit-cam-size', title: T('Drag to resize the camera') });
  const camBox = h('div', { class: 'edit-cam', title: T('Drag to move the camera') }, camVideo, camHandle);
  const camFrame = h('div', { class: 'edit-cam-frame', hidden: true }, camBox);
  const camRow = h('div', { class: 'edit-tracks', hidden: true });
  const camH = () => (cam ? (camPlace.w * frameW * cam.height) / cam.width / frameH : 0); // height as a fraction of the picture
  function clampCam() {
    camPlace.w = Math.min(Math.max(camPlace.w, 0.05), 1);
    if (camH() > 1) camPlace.w = (frameH * cam.width) / cam.height / frameW;
    camPlace.x = Math.min(Math.max(camPlace.x, 0), 1 - camPlace.w);
    camPlace.y = Math.min(Math.max(camPlace.y, 0), 1 - camH());
  }
  // the frame matches the picture inside the letterboxed video element
  function layoutCam() {
    camFrame.hidden = !cam || !camOn;
    if (camFrame.hidden) return;
    const bw = video.clientWidth, bh = video.clientHeight;
    const scale = Math.min(bw / frameW, bh / frameH);
    const w = frameW * scale, hgt = frameH * scale;
    Object.assign(camFrame.style, { left: `${video.offsetLeft + (bw - w) / 2}px`, top: `${video.offsetTop + (bh - hgt) / 2}px`, width: `${w}px`, height: `${hgt}px` });
    clampCam();
    Object.assign(camBox.style, { left: `${camPlace.x * 100}%`, top: `${camPlace.y * 100}%`, width: `${camPlace.w * 100}%`, height: `${camH() * 100}%` });
  }
  new ResizeObserver(layoutCam).observe(video);
  const rememberCam = () => { try { localStorage.setItem('clip:cam:place', JSON.stringify(camPlace)); localStorage.setItem('clip:cam:on', camOn ? '1' : '0'); } catch { /* private mode */ } };
  camBox.addEventListener('pointerdown', (e) => {
    if (busy) return;
    e.preventDefault();
    camBox.setPointerCapture(e.pointerId);
    const r = camFrame.getBoundingClientRect();
    const start = { ...camPlace, px: e.clientX, py: e.clientY };
    const resizing = e.target === camHandle;
    camBox.classList.add('is-dragging');
    const move = (ev) => {
      const dx = (ev.clientX - start.px) / r.width, dy = (ev.clientY - start.py) / r.height;
      if (resizing) camPlace.w = start.w + Math.max(dx, (dy * frameH * cam.width) / cam.height / frameW);
      else { camPlace.x = start.x + dx; camPlace.y = start.y + dy; }
      layoutCam();
    };
    const up = () => { camBox.removeEventListener('pointermove', move); camBox.classList.remove('is-dragging'); rememberCam(); };
    camBox.addEventListener('pointermove', move);
    camBox.addEventListener('pointerup', up, { once: true });
    camBox.addEventListener('pointercancel', up, { once: true });
  });
  // the camera follows the clip: same play/pause, re-aligned when it drifts or you seek
  function syncCam() {
    if (!cam || !camOn || !camVideo.src) return;
    const want = video.currentTime - cam.offset;
    const inside = want >= 0 && want < cam.duration - 0.05;
    camBox.classList.toggle('is-empty', !inside);
    if (!inside) { if (!camVideo.paused) camVideo.pause(); return; }
    if (Math.abs(camVideo.currentTime - want) > (video.paused ? 0.02 : 0.15)) camVideo.currentTime = want;
    if (video.paused && !camVideo.paused) camVideo.pause();
    if (!video.paused && camVideo.paused) camVideo.play().catch(() => {});
  }
  function renderCam() {
    camRow.hidden = !cam;
    if (!cam) return;
    camRow.replaceChildren(h('span', { class: 'edit-tracks-label' }, T('Overlay')),
      h('button', { type: 'button', class: `edit-chip${camOn ? '' : ' is-off'}`, 'aria-pressed': String(camOn),
        title: camOn ? T('Leave the camera out of the copy') : T('Put the camera in the copy'),
        onclick: () => { if (busy) return; camOn = !camOn; rememberCam(); renderCam(); layoutCam(); syncCam(); render(); } }, T('Camera')));
  }
  // Audio: keep or leave out each separate track. Track 1 (the mix every player plays) is rebuilt.
  const trackRow = h('div', { class: 'edit-tracks', hidden: true });
  function renderTracks() {
    const own = tracks.filter((t) => !t.mix);
    trackRow.hidden = own.length < 2 && !tracks.some((t) => t.mix);
    if (trackRow.hidden) return;
    trackRow.replaceChildren(h('span', { class: 'edit-tracks-label' }, T('Audio')), ...own.map((t) => {
      const kept = !removed.has(t.index);
      const label = t.mic ? T('{0} (mic)', t.label) : t.label;
      return h('button', { type: 'button', class: `edit-chip${kept ? '' : ' is-off'}`, 'aria-pressed': String(kept),
        title: kept ? T('Leave {0} out of the copy', label) : T('Keep {0}', label),
        onclick: () => { if (busy) return; if (kept) removed.add(t.index); else removed.delete(t.index); renderTracks(); render(); } }, label);
    }));
  }
  const delOrig = h('input', { type: 'checkbox', id: 'trim-del' });
  const previewBtn = h('button', { type: 'button', class: 'retry', onclick: () => { const r = runs(); if (!r.length) return; video.currentTime = r[0].from; video.play().catch(() => {}); } }, T('Preview'));
  const save = h('button', { type: 'button', class: 'play-btn edit-save', disabled: true }, T('Save edited copy'));

  function updateHead() {
    const t = video.currentTime;
    head.style.left = pos(t);
    now.textContent = fmtT(t);
    timeline.setAttribute('aria-valuemax', String(Math.round(duration * 10) / 10));
    timeline.setAttribute('aria-valuenow', String(Math.round(t * 10) / 10));
    timeline.setAttribute('aria-valuetext', `${fmtT(t)} of ${fmtT(duration)}`);
    const p = duration && pieceAt(t);
    const removing = !p || p.keep;
    toggleBtn.querySelector('svg')?.remove();
    toggleBtn.insertAdjacentHTML('afterbegin', EDIT_ICONS[removing ? 'remove' : 'restore']);
    toggleBtn.querySelector('.edit-tool-label').textContent = removing ? T('Remove part') : T('Restore part');
    toggleBtn.classList.toggle('is-restore', !removing);
  }
  function render() {
    if (!duration) return;
    const list = runs();
    const issue = problem(list);
    const out = [];
    for (const p of pieces) {
      out.push(h('div', { class: `edit-piece ${p.keep ? 'is-kept' : 'is-cut'}`, style: `left:${pos(p.start)};width:${pos(p.end - p.start)}` }));
    }
    list.forEach((r, i) => {
      if (r.from < r.start - 0.01) {
        const clash = i > 0 && r.from < list[i - 1].end - 0.001;
        out.push(h('div', { class: `edit-lead${clash ? ' is-clash' : ''}`, title: T('Starts on the keyframe at {0}', fmtT(r.from)), style: `left:${pos(r.from)};width:${pos(r.start - r.from)}` }));
      }
    });
    for (const p of pieces.slice(1)) out.push(h('div', { class: 'edit-split', style: `left:${pos(p.start)}` }));
    for (const e of events) out.push(h('div', { class: `edit-mark is-${eventKind(e)}`, style: `left:${pos(e.t)}` }));
    track.replaceChildren(...out);
    const length = list.reduce((n, r) => n + r.end - r.from, 0);
    const early = list.some((r) => r.from < r.start - 0.05);
    total.textContent = T('of {0}', fmtT(duration));
    info.classList.toggle('is-error', Boolean(issue));
    const gone = tracks.filter((t) => removed.has(t.index)).map((t) => t.mic ? T('{0} (mic)', t.label) : t.label);
    const remix = gone.length && tracks.some((t) => t.mix) && tracks.filter((t) => !t.mix && !removed.has(t.index)).length > 1;
    const withCam = Boolean(cam && camOn);
    info.textContent = issue || (withCam ? T('{0} · {1} long{2} · camera burned in: the picture is re-encoded in full quality, which takes a few minutes', list.length === 1 ? T('Keeping 1 part') : T('Keeping {0} parts', list.length), fmtT(length), gone.length ? T(' · without {0}', gone.join(' and ')) : '') : '') || T('{0} · {1} long{2}{3} · {4}', list.length === 1 ? T('Keeping 1 part') : T('Keeping {0} parts', list.length), fmtT(length), early ? T(' · striped bits are kept so each part starts on a keyframe') : '', gone.length ? T(' · without {0}', gone.join(' and ')) : '', exact && list.some((r) => offKey(r.start)) ? T('exact cuts, every frame identical to the original{0}', remix ? T(', the mix re-encoded') : '') : remix ? T('video untouched, only the mix is re-encoded') : T('no re-encoding, same quality'));
    save.disabled = busy || Boolean(issue);
    save.textContent = busy ? T('Saving…') : list.length > 1 || gone.length || withCam ? T('Save edited copy') : T('Save trimmed copy');
    previewBtn.disabled = !list.length;
    undoBtn.disabled = !undo.length || busy;
    updateHead();
  }

  // ---- playback: removed parts are skipped when playing runs into them ----
  let lastKept = true;
  const keptAt = (t, list) => list.some((r) => t >= r.from - 0.001 && t < r.end);
  function watchFrame() {
    if (!duration) return;
    const list = runs();
    const t = video.currentTime;
    const inKept = keptAt(t, list);
    if (!video.paused && lastKept && !inKept && !video.seeking) {
      const next = list.find((r) => r.from >= t - 0.05);
      if (next) video.currentTime = next.from;
      else { video.pause(); video.currentTime = list.at(-1)?.end ?? t; }
      lastKept = true;
    } else lastKept = inKept;
    updateHead();
    syncCam();
  }
  const loop = () => {
    if (!video.isConnected || video.paused) return;
    watchFrame();
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
  };
  video.addEventListener('play', () => { lastKept = keptAt(video.currentTime, runs()); loop(); });
  video.addEventListener('seeked', () => { lastKept = keptAt(video.currentTime, runs()); updateHead(); syncCam(); });
  for (const ev of ['pause', 'timeupdate', 'ratechange']) video.addEventListener(ev, () => { camVideo.playbackRate = video.playbackRate; syncCam(); });
  video.addEventListener('timeupdate', updateHead);
  const syncPlay = () => {
    const playing = !video.paused && !video.ended;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? T('Pause (Space)') : T('Play (Space)'));
  };
  for (const ev of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(ev, syncPlay);
  syncPlay();
  const togglePlayback = () => { if (video.paused || video.ended) video.play().catch(() => {}); else video.pause(); };
  playBtn.addEventListener('click', togglePlayback);
  video.addEventListener('click', togglePlayback);

  save.addEventListener('click', async () => {
    const list = runs();
    if (problem(list)) return;
    busy = true; render();
    try {
      const overlay = cam && camOn ? { x: camPlace.x, y: camPlace.y, w: camPlace.w } : undefined;
      const r = await api(`/api/clips/${c.id}/trim`, jsonPost({ segments: list.map(({ start, end }) => ({ start, end })), removeTracks: [...removed], deleteOriginal: delOrig.checked, overlay }));
      if (r.job) { toast(T('Putting the camera in… “{0}” shows up in Trimmed Clips in a few minutes', c.title)); followRender(r.job); }
      else toast(T('Saved “{0}” in Trimmed Clips', r.title));
      closeTopOverlay();
      await loadClips();
      renderClips();
    } catch (err) {
      toast(err.message);
      busy = false; render();
    }
  });

  const content = h('div', { class: 'sheet-content edit' },
    h('div', { class: 'edit-top' }, h('p', { class: 'edit-eyebrow', id: 'sheet-title' }, T('Edit clip')), nameWrap),
    h('div', { class: 'edit-stage' }, video, camFrame),
    h('div', { class: 'edit-transport' }, playBtn, h('span', { class: 'edit-clock' }, now, ' ', total)),
    marks,
    timeline,
    h('div', { class: 'edit-tools' }, startBtn, splitBtn, endBtn, toggleBtn, undoBtn),
    trackRow,
    camRow,
    info,
    c.editing && h('p', { class: 'edit-info edit-busy', role: 'status' }, T('Your last edit of this clip is still being saved ({0}%). Saving again replaces it.', Math.round(c.editing.progress * 100))),
    h('div', { class: 'edit-actions' }, previewBtn, save),
    h('label', { class: 'trim-del', for: 'trim-del' }, delOrig, T(' Move the original to Deleted afterwards (kept 30 days)')),
    keysHint);
  // Keys while the editor is open. Text fields and the checkbox keep their own keys.
  const onKey = (e) => {
    if (!content.isConnected || !sheet.classList.contains('open') || e.target.matches?.('input:not([type="checkbox"]), textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = (d) => { video.pause(); video.currentTime = Math.min(Math.max(video.currentTime + d, 0), duration); updateHead(); };
    const run = { ' ': togglePlayback, k: togglePlayback, s: () => act('split'), x: () => act('toggle'), Delete: () => act('toggle'), Backspace: () => act('toggle'),
      r: () => nameWrap.querySelector('button')?.click(), '[': () => act('start'), ']': () => act('end'), ArrowLeft: () => step(-1), ArrowRight: () => step(1), ',': () => step(-frameDur), '.': () => step(frameDur),
      ...(events.length ? { n: () => jumpEvent(1), p: () => jumpEvent(-1) } : {}) }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!run || (e.key === ' ' && e.target.matches?.('button:not(.edit-play)'))) return;
    e.preventDefault();
    run();
  };
  const sheet = $('#sheet');
  document.addEventListener('keydown', onKey);
  sheet.classList.add('is-editor');
  $('#sheet-body').replaceChildren(content);
  pushOverlay(showSheet(sheet, $('#sheet-backdrop'), () => {
    sheet.classList.remove('is-editor');
    document.removeEventListener('keydown', onKey);
    video.pause(); video.removeAttribute('src'); video.load();
    camVideo.pause(); camVideo.removeAttribute('src'); camVideo.load();
    opener?.focus({ preventScroll: true });
  }));
  const ready = (d) => {
    if (duration || !(d > 0)) return;
    duration = d;
    pieces = [{ start: 0, end: d, keep: true }];
    render();
    renderEvents();
  };
  video.addEventListener('loadedmetadata', () => ready(video.duration), { once: true });
  playBtn.focus({ preventScroll: true });
  try {
    const k = await api(`/api/clips/${c.id}/keyframes`);
    keys = k.keyframes.length ? k.keyframes : [0];
    exact = Boolean(k.exact);
    if (k.frame > 0 && k.frame < 1) frameDur = k.frame;
    tracks = k.tracks || [];
    renderTracks();
    if (k.width > 0 && k.height > 0) { frameW = k.width; frameH = k.height; }
    if (k.cam?.width > 0 && k.cam?.height > 0 && k.cam.duration > 0) {
      cam = k.cam;
      camVideo.src = `/api/clips/${c.id}/cam`;
      camVideo.addEventListener('loadeddata', syncCam, { once: true });
      renderCam(); layoutCam();
    }
    if (Array.isArray(k.events) && k.events.length) {
      events = k.events.filter((e) => Number.isFinite(e?.t) && typeof e.type === 'string' && typeof e.label === 'string');
      keysHint.append(T(' · N P next or previous game event'));
      renderEvents(); render();
    }
    ready(k.duration);
    render();
  } catch (err) { info.textContent = T('Couldn’t read the clip: {0}', err.message); info.classList.add('is-error'); }
}

// A camera edit renders on the server for a few minutes; say when it's there (or why not).
async function followRender(job) {
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    let r;
    try { r = await api(`/api/clips/renders/${job}`); } catch (err) { if (err.status === 404) return; continue; }
    if (r.state === 'working') continue;
    toast(r.state === 'done' ? T('Saved “{0}” in Trimmed Clips', r.title) : T('The camera edit failed: {0}', r.error));
    await loadClips();
    renderClips();
    return;
  }
}

async function deleteClip(c) {
  try {
    await api(`/api/clips/${c.id}/delete`, { method: 'POST' });
  } catch (err) { toast(err.message); }
  await loadClips();
  renderClips();
}
async function unshareClip(c) {
  try { await api(`/api/clips/${c.id}/unshare`, { method: 'POST' }); } catch (err) { toast(err.message); }
  await loadClips();
  renderClips();
}

const UNLINK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 7.8 16.2a3 3 0 0 1-4.2-4.2l2.6-2.6a3 3 0 0 1 4.2 0M14.5 9.5l1.7-1.7a3 3 0 0 1 4.2 4.2l-2.6 2.6a3 3 0 0 1-4.2 0M4 4l16 16"/></svg>';
function inlineName({ getName, save, label, maxLength, errorId, className = '', successMessage }) {
  const wrap = h('div', { class: `clip-title-wrap ${className}` });
  function display(focus = false) {
    const button = h('button', { type: 'button', class: 'clip-title row-title', 'aria-label': T('Rename {0}: {1}', label.toLowerCase(), getName()), title: T('Rename {0}', label.toLowerCase()) },
      h('span', {}, getName()));
    button.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg>');
    button.addEventListener('click', edit);
    wrap.replaceChildren(button); if (focus) button.focus({ preventScroll: true });
  }
  function edit() {
    const previousTitle = getName();
    const height = wrap.getBoundingClientRect().height;
    wrap.style.minHeight = `${height}px`;
    let committing = false, settled = false, outsidePointer = false, afterPointer = null;
    const preserveClick = (e) => {
      if (wrap.contains(e.target) || outsidePointer) return;
      outsidePointer = true;
      const release = () => {
        document.removeEventListener('pointerup', release);
        document.removeEventListener('pointercancel', release);
        setTimeout(() => {
          outsidePointer = false;
          const complete = afterPointer; afterPointer = null; complete?.();
        }, 0);
      };
      document.addEventListener('pointerup', release);
      document.addEventListener('pointercancel', release);
    };
    document.addEventListener('pointerdown', preserveClick, true);
    const finish = (focus) => {
      settled = true;
      document.removeEventListener('pointerdown', preserveClick, true);
      const complete = () => { wrap.style.minHeight = ''; display(focus); };
      if (outsidePointer) afterPointer = complete;
      else complete();
    };
    const input = h('input', { type: 'text', maxlength: maxLength, value: getName(), 'aria-label': T('{0} name', label), autocomplete: 'off' });
    const error = h('p', { id: errorId, class: 'clip-rename-error', role: 'alert', hidden: true });
    const fail = (message) => {
      error.textContent = message; error.hidden = false;
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', error.id);
    };
    const commit = async (fromEnter = false) => {
      if (committing || settled) return;
      const title = input.value.trim();
      if (title === previousTitle) { finish(fromEnter && document.activeElement === input); return; }
      if (!title) { fail(T('Enter a {0} name.', label.toLowerCase())); return; }
      committing = true; input.readOnly = true; form.setAttribute('aria-busy', 'true'); error.hidden = true;
      input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
      try {
        await save(title, previousTitle, wrap);
        finish(fromEnter && document.activeElement === input); toast(successMessage);
      } catch (err) {
        fail(err.message);
        committing = false; input.readOnly = false; form.removeAttribute('aria-busy');
      }
    };
    const form = h('form', { class: 'clip-rename-form', onsubmit: (e) => { e.preventDefault(); commit(true); } }, input, error);
    input.style.minHeight = `${height}px`;
    input.addEventListener('blur', () => commit());
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape' && !committing) { e.preventDefault(); e.stopPropagation(); finish(true); }
    });
    wrap.replaceChildren(form); input.focus(); input.select();
  }
  display(); return wrap;
}
function clipTitle(c) {
  return inlineName({
    getName: () => c.title, label: T('Clip'), maxLength: 120,
    errorId: `clip-rename-error-${c.id}`, successMessage: T('Clip renamed'),
    save: async (next, previousTitle, wrap) => {
      const renamed = await api(`/api/clips/${c.id}/rename`, jsonPost({ title: next, previousTitle }));
      c.title = renamed.title;
      const current = state.clips?.clips.find((item) => item.id === c.id); if (current) current.title = renamed.title;
      const card = wrap.closest('.clip');
      card?.querySelector('.clip-thumb')?.setAttribute('aria-label', T('Play {0}', c.title));
      card?.querySelector('.clip-delete')?.setAttribute('aria-label', T('Delete {0}', c.title));
      card?.querySelector('.clip-trim')?.setAttribute('aria-label', T('Edit {0}', c.title));
    },
  });
}
function clipCard(c) {
  const when = new Date(c.mtime).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const thumb = h('button', { class: 'clip-thumb', 'aria-label': T('Play {0}', c.title) },
    h('img', { src: `/api/clips/${c.id}/thumb.jpg`, alt: '', loading: 'lazy' }));
  thumb.insertAdjacentHTML('beforeend', `<span class="clip-play">${ICONS.play}</span>`);
  thumb.addEventListener('click', () => openPlayer({ kind: 'clip', id: c.id, key: c.id, title: c.title }));
  const s = c.share;
  const link = s && `${location.origin}/c/${s.token}`;
  let actions;
  if (!s) actions = [h('button', { class: 'retry', onclick: (e) => shareClip(c, e.currentTarget) }, T('Share'))];
  else if (s.error) actions = [h('span', { class: 'muted clip-error' }, T('Couldn’t prepare it: {0}', s.error)), h('button', { class: 'retry', onclick: (e) => shareClip(c, e.currentTarget) }, T('Try again'))];
  else if (!s.ready) actions = [h('span', { class: 'muted clip-working' }, T('Preparing for Discord…'))];
  // the label hides on narrow cards (style.css), leaving the copy icon; aria-label keeps the name
  else actions = [h('button', { class: 'retry clip-copy', 'aria-label': T('Copy link'), title: T('Copy link'), onclick: () => copyLink(link) }, icon('copy'), h('span', { class: 'clip-btn-label' }, T('Copy link')))];
  if (s) actions.push(h('button', { class: 'icon-btn clip-unshare', 'aria-label': T('Stop sharing'), title: T('Stop sharing (the link stops working)'), onclick: () => unshareClip(c) }));
  // two taps: the first turns the bin into "Delete?", the second deletes (it waits 30 days in .deleted)
  const del = h('button', {
    class: 'icon-btn clip-delete', 'aria-label': T('Delete {0}', c.title), title: T('Delete clip'),
    onclick: (e) => {
      const b = e.currentTarget;
      if (b.dataset.sure) { b.disabled = true; deleteClip(c); return; }
      b.dataset.sure = '1';
      b.classList.add('is-sure');
      b.textContent = T('Delete?');
      setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.sure; b.classList.remove('is-sure'); b.innerHTML = ICONS.trash; } }, 4000);
    },
  });
  // a camera edit renders for a few minutes: say so on the clip, or it looks like nothing happened
  if (c.editing) actions.unshift(h('span', { class: 'muted clip-working clip-editing', role: 'status' }, T('Adding your camera… {0}%', Math.round(c.editing.progress * 100))));
  actions.push(h('button', { class: 'icon-btn clip-trim', 'aria-label': T('Edit {0}', c.title), title: T('Edit: trim or cut out parts (no quality loss)'), onclick: (e) => openTrim(c, e.currentTarget) }));
  actions.push(del);
  if (s?.ready) thumb.append(h('span', { class: 'clip-badge' }, T('Shared')));
  const card = h('li', { class: 'clip' }, thumb,
    h('div', { class: 'clip-text' },
      clipTitle(c),
      h('div', { class: 'row-meta' }, h('span', {}, c.game), h('span', {}, when), h('span', {}, fmtBytes(c.size)), s?.ready && h('span', { class: 'clip-shared' }, T('shared')))),
    h('div', { class: 'clip-actions' }, actions));
  const un = $('.clip-unshare', card);
  if (un) un.innerHTML = UNLINK_ICON;
  $('.clip-delete', card).innerHTML = ICONS.trash;
  $('.clip-trim', card).innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.5 20 18M8.6 16.5 20 6"/></svg>';
  return card;
}

function renderClips() {
  filterField('clips', T('Filter by game or name'), renderClips);
  const body = $('#clips-body');
  if (state.clipsError) { body.replaceChildren(notice(T('Couldn’t load clips'), state.clipsError, () => loadClips().then(renderClips))); return; }
  if (!state.clips) return;
  if (!state.clips.configured) { body.replaceChildren(notice(T('No clips folder'), T('Set CLIPS_DIR in .env to the folder your desktop syncs clips to.'))); return; }
  const q = norm(pageFilters.clips);
  const all = state.clips.clips;
  const list = all.filter((c) => !q || norm(`${c.title} ${c.game}`).includes(q));
  if (!list.length) {
    body.replaceChildren(q ? notice(T('Nothing matches.'), T('Try a game or part of a clip’s name.'))
      : emptyState(T('No clips yet.'), T('Clips your desktop saves to the clips folder show up here, ready to trim and share.')));
    return;
  }
  // A line of what's here, then the newest clips across games, then one gallery per game (newest first).
  const shared = all.filter((c) => c.share?.ready).length;
  const out = [h('p', { class: 'clips-summary muted' }, [plural(all.length, 'clip'), fmtBytes(all.reduce((n, c) => n + (c.size || 0), 0)),
    shared ? T('{0} shared', shared) : null].filter(Boolean).join(' · '))];
  const newest = !q && all.length > 6 ? [...all].sort((a, b) => b.mtime - a.mtime).slice(0, 8) : [];
  if (newest.length) out.push(h('section', { class: 'clips-section' }, h('h3', { class: 'clips-head' }, T('Latest')), h('ul', { class: 'clip-grid clip-latest' }, newest.map(clipCard))));
  const games = new Map();
  for (const c of [...list].sort((a, b) => a.game.localeCompare(b.game) || b.mtime - a.mtime)) {
    if (!games.has(c.game)) games.set(c.game, []);
    games.get(c.game).push(c);
  }
  for (const [game, clips] of games) out.push(h('section', { class: 'clips-section' },
    h('h3', { class: 'clips-head' }, game, h('span', { class: 'clips-count' }, String(clips.length))),
    h('ul', { class: 'clip-grid' }, clips.map(clipCard))));
  body.replaceChildren(...out);
}

// ---------- page filters ----------
// Library, Activity, Machines, Game clips and Notes narrow their own lists with a small field beside the page's
// heading (pageFilters), separate from search. The field is made once and kept, so redraws never steal its focus.
function filterField(view, label, onChange) {
  const head = $(`#view-${view} .view-head`);
  let field = head.querySelector('.filter-field');
  if (field) return field;
  const box = h('input', { type: 'search', placeholder: label, 'aria-label': label, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  let timer = 0;
  box.addEventListener('input', () => { pageFilters[view] = box.value; clearTimeout(timer); timer = setTimeout(onChange, 200); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.value) { e.stopPropagation(); clearFilter(view); onChange(); } });
  field = h('label', { class: 'filter-field' }, icon('filter'), box);
  head.append(field);
  return field;
}
function clearFilter(view, value = '') {
  pageFilters[view] = value;
  const box = $(`#view-${view} .filter-field input`);
  if (box) box.value = value;
}

// ---------- search (search.js) ----------
// The header's box (an icon on phones) finds titles and places; results show in a layer over the page.
const searchToggle = $('#search-toggle');
const wideHeader = matchMedia('(min-width: 900px)');
// What's on the server plays at once: those matches come first, as rows with the lightning mark.
const searchInstantRow = ({ t }) => h('button', { type: 'button', class: 'sr-row', onclick: (ev) => { searchUi.remember(); openDetails(t, ev.currentTarget); } },
  t.poster ? h('img', { class: 'sr-thumb', src: t.poster, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'sr-thumb' }),
  h('span', { class: 'lrow-text' }, h('span', { class: 'set-label' }, t.title),
    h('span', { class: 'set-hint' }, h('span', { class: 'instant-mark' }, icon('bolt')), [t.year, t.type === 'tv' ? T('Series') : T('Film')].filter(Boolean).join(' · '))));
function instantMatches(q) {
  const n = norm(q).trim();
  if (!n) return [];
  const hits = instantTitles().filter((x) => norm(x.t.title).includes(n));
  return [...hits.filter((x) => norm(x.t.title).startsWith(n)), ...hits.filter((x) => !norm(x.t.title).startsWith(n))].slice(0, 4);
}
const searchUi = createSearch({ h, T, lang, api, input, layer: $('#search-layer'), me: () => state.me, status: () => state.status,
  onLilin: (q) => instantMatches(q).map(searchInstantRow),
  openPlace: (p) => openPlace(p), titleGrid, titleCard, carousel, skeletonGrid, emptyState, notice,
  footer: (q) => [
    state.status.admin && state.status.torrents && canDownload() && h('button', { type: 'button', class: 'chip', onclick: (e) => { searchUi.remember(); findTorrents(q, e.currentTarget); } },
      icon('search'), T('Search torrents for “{0}”', q)),
    state.status.notes && h('button', { type: 'button', class: 'chip', onclick: async () => { endSearch(); await setView('house/notes'); clearFilter('notes', q); await notesView.load(); } },
      icon('search'), T('Search notes for “{0}”', q)),
  ].filter(Boolean),
  // People: anyone on Lilin by name (friends search; nobody for restricted people or the shared home account).
  findPeople: async (q, signal) => {
    if (!state.me?.email || state.me.restricted) return [];
    const { people: found = [] } = await api(`/api/friends/search?q=${encodeURIComponent(q)}`, { signal });
    const hint = { friend: T('Friends'), sent: T('Asked'), received: T('Asked to be your friend') };
    return found.slice(0, 4).map((p) => ({ name: p.name, hint: hint[p.state] || '', face: people.face(p, { size: 32 }), open: (opener) => profiles.open(p, opener) }));
  },
  // Live: a channel by its name or what's on it now (the guide is fetched when search opens).
  findChannels: (q) => {
    const n = norm(q);
    return liveView.channels().map((c) => ({ c, now: liveView.onNow(c)?.title || '' }))
      .filter(({ c, now }) => norm(`${channelName(c, state.me)} ${now}`).includes(n)).slice(0, 4)
      .map(({ c, now }) => ({ number: c.number, name: channelName(c, state.me), now, tune: () => tuneIn(c.id) }));
  } });
function setSearching(on) {
  document.body.classList.toggle('searching', on);
  searchToggle.setAttribute('aria-expanded', String(on));
  if (on) { searchUi.open(); if (document.activeElement !== input) input.focus(); liveView.load(); } else searchUi.close(); // the channels, for search's Live group
}
function endSearch() { input.value = ''; $('#q-clear').hidden = true; setSearching(false); }
// Go to: a place opens its page, or runs its action (places.js ACTIONS).
const PLACE_ACTIONS = {
  'whats-new': () => showUpdateHistory(),
  'wrapped': (opener) => openWrapped(state.status?.wrapped?.year || new Date().getFullYear(), opener),
  'pick': () => pickUi.open(),
  'profile': (opener) => profiles.openMine(opener),
  'manage-downloads': (opener) => openTransferDetails(null, opener),
  'channels': (opener) => liveView.openEditor(opener),
  'torrents': (opener) => findTorrents('', opener),
  'phone-copies': (opener) => openTravelList(opener),
};
async function openPlace(p) {
  endSearch();
  if (!p.route) { PLACE_ACTIONS[p.action]?.(null); return; }
  await setView(p.route);
  if (p.id === 'saved') $('#discover-body .saved-shelf')?.scrollIntoView({ block: 'center' }); // Saved for later lives on Discover
}
searchToggle.addEventListener('click', () => setSearching(true));
input.addEventListener('focus', () => { if (!searchUi.isOpen()) setSearching(true); });
input.addEventListener('input', () => {
  $('#q-clear').hidden = !input.value;
  if (searchUi.isOpen()) searchUi.render(); else setSearching(true);
});
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  searchUi.remember();
  input.blur(); // hides the phone keyboard; the results stay
});
$('#q-clear').addEventListener('click', () => {
  input.value = ''; $('#q-clear').hidden = true;
  searchUi.render(); input.focus();
});
$('#search-cancel').addEventListener('click', () => { endSearch(); if (!wideHeader.matches) searchToggle.focus(); });
input.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  endSearch(); input.blur();
  if (!wideHeader.matches) searchToggle.focus();
});
// An empty box closes when you leave it (not while a press inside the results is still going on).
let searchPress = false;
$('#search-layer').addEventListener('pointerdown', () => { searchPress = true; });
window.addEventListener('pointerup', () => setTimeout(() => { searchPress = false; }, 300), true);
input.addEventListener('blur', () => setTimeout(() => {
  if (!input.value && !searchPress && document.activeElement !== input && !$('#search-layer').contains(document.activeElement) && !overlayStack.length) setSearching(false);
}, 200));
// "/" or Ctrl K (⌘K) jumps to the box.
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (!slash && !(e.key.toLowerCase?.() === 'k' && (e.ctrlKey || e.metaKey))) return;
  if (!$('#player').hidden || overlayStack.length) return;
  e.preventDefault();
  setSearching(true);
});

// The header turns to glass once the page scrolls (style.css: html.scrolled).
let scrollFrame = 0;
function markScrolled() {
  scrollFrame = 0;
  document.documentElement.classList.toggle('scrolled', window.scrollY > 24);
}
window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(markScrolled); }, { passive: true });
markScrolled();

// Tab changes cross-fade with the View Transitions API where there is one; elsewhere .view fades in (style.css).
const smoothViews = () => 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('startViewTransition' in document) document.documentElement.classList.add('has-vt');

// ---------- the shell: tabs, addresses and Back (routes.js) ----------
// Every screen has an address (#library, #you/watching, #house/people) and lights its tab. A tab opens the page it
// was last on (sessionStorage 'lilin:stack'); tapping the open tab goes up to its root, then to the top. A page
// opened from its tab's root gets its own history entry, so Back returns to the list; anything else replaces it.
const tabStack = (() => { try { return JSON.parse(sessionStorage.getItem('lilin:stack')) || {}; } catch { return {}; } })();
// Which tabs this person has (House: owners only).
function renderTabs() {
  const tabs = tabsFor(state.me, state.status);
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = !tabs.includes(t.dataset.view); });
}
function openTab(tab) {
  const r = ROUTES[state.route];
  if (document.body.classList.contains('searching')) { endSearch(); if (r?.tab === tab) return; } // a tab closes search
  if (r?.tab === tab) { if (state.route !== tab) goUp(); else window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const last = tabStack[tab];
  setView(last && ROUTES[last]?.tab === tab && allowedRoute(last, state.me, state.status) ? last : tab);
}
// Up from a page to its tab's root: Back when the page was opened from there, else straight to the root.
function goUp() {
  const r = ROUTES[state.route];
  if (!r || r.tab === state.route) return;
  if (history.state?.page === state.route && !overlayStack.length) history.back();
  else setView(r.tab);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.view)));
$('#me-btn').addEventListener('click', () => openTab('you'));
// "‹ House" / "‹ You" over a page that has a view of its own (Activity, Notes, Game clips) or a House page.
function renderBackLink() {
  const r = ROUTES[state.route];
  const back = $(`#view-${state.view} > .view-back`);
  if (!back) return;
  back.hidden = !r?.sub;
  if (r?.sub) { back.textContent = `‹ ${T(ROUTES[r.tab].label)}`; back.onclick = goUp; }
}
// The address: #route. A replaced entry keeps its overlay mark, and its page mark if it had one.
function rememberView(id, push = false) {
  if (!id || location.hash === `#${id}`) return;
  const url = `${location.pathname}${location.search}#${id}`;
  if (push && !overlayStack.length) history.pushState({ page: id }, '', url);
  else history.replaceState(history.state?.overlay ? history.state : { page: history.state?.page ? id : null }, '', url);
}
// Back and Forward: closing a sheet restores the address it opened on (the profile still open on top, #@ebicat, so
// a reload comes back to it); with no sheet open they move between pages.
window.addEventListener('popstate', () => {
  const handle = [...document.querySelectorAll('.pf.open')].pop()?.dataset.handle;
  if (handle) {
    if (location.hash !== `#@${handle}`) history.replaceState(history.state, '', `${location.pathname}${location.search}#@${handle}`);
    return;
  }
  if (!popHadOverlay) {
    const id = resolve(location.hash, state.me, state.status);
    if (id && id !== state.route) { setView(id, { address: false }); return; }
  }
  rememberView(state.route);
});
// Opens a route (or an old address: 'settings', 'downloads'). Unknown or not allowed: nothing happens.
async function setView(target, { address = true } = {}) {
  const id = resolve(target, state.me, state.status);
  if (!id) return;
  const r = ROUTES[id];
  if (document.body.classList.contains('searching')) endSearch();
  if (r.view === 'library') invalidateLibraryProgress();
  if (id === state.route) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const fromRoot = state.route === r.tab;
  if (address) rememberView(id, Boolean(r.sub) && fromRoot);
  const viewChanged = r.view !== state.view;
  state.route = id; state.sub = r.sub || null; state.view = r.view;
  tabStack[r.tab] = id;
  try { sessionStorage.setItem('lilin:stack', JSON.stringify(tabStack)); } catch { /* private mode: no stacks */ }
  document.querySelectorAll('.tab').forEach((t) => { if (t.dataset.view === r.tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  if (r.tab === 'you') $('#me-btn').setAttribute('aria-current', 'page'); else $('#me-btn').removeAttribute('aria-current');
  const show = () => {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${r.view}`; });
    document.body.classList.toggle('has-billboard', r.view === 'discover' && Boolean($('#discover-body .billboard')));
    window.scrollTo(0, 0);
  };
  if (viewChanged && smoothViews()) document.startViewTransition(show); else show();

  renderView(); // render cached data, then refresh
  const view = r.view;
  if (view === 'library') { await loadDownloads(); await Promise.all([loadLibrary(), loadConvert()]); }
  if (view === 'activity') await loadActivity();
  if (view === 'house') await loadHouse();
  if (view === 'clips') await loadClips();
  if (view === 'live') await Promise.all([liveView.load(true), loadParties()]);
  if (view === 'notes') await notesView.load();
  if (view === 'you') await loadLibrary();
  if (state.route === id) { if (view === 'you') renderSettingsWhenStill(); else renderView(); }
  schedulePoll();
}
$('#home-link').addEventListener('click', async (e) => {
  e.preventDefault();
  disc.list = null; disc.genre = null; discSpot = null; // the logo goes to the top
  vibesUi.reset(); // vibes
  if (document.body.classList.contains('searching')) endSearch();
  if (state.route === 'discover') { await renderDiscover(); window.scrollTo({ top: 0 }); }
  else await setView('discover');
});
// Find torrents: House › Downloads, search's footer and Go to all open the same sheet (the owner's).
function findTorrents(query, opener) { return openTorrents({ query, opener }); }

// A link into Lilin (a tapped notification, or how this page was opened): ?friends=1 → You › Friends, ?ideas=1 →
// You › Ideas or House › Ideas, ?moment= plays it, ?travel=1 opens the phone list, ?note= focuses it. Returns true
// when it opened something.
async function openLink(url) {
  const params = url.searchParams;
  const id = linkRoute(params, state.me, state.status);
  if (params.get('moment')) momentsUI.jumpTo(params.get('moment')); // friends: Moments
  if (params.has('friends')) friendsUI.jumpNext(); // friends
  if (params.has('ideas')) { ideasView.jump = true; ideasView.loaded = false; await loadIdeas(); }
  if (!id) return false;
  if (id === state.route) renderView(); else await setView(id);
  if (params.has('travel')) openTravelList();
  const note = params.get('note');
  if (note && /^\d+$/.test(note)) await notesView.focus(Number(note));
  return true;
}

// ---------- start ----------
// A tapped notification while Lilin is open (sw.js): open what it points at without a reload.
navigator.serviceWorker?.addEventListener('message', async (event) => {
  if (event.data?.type !== 'lilin:open') return;
  let url;
  try { url = new URL(event.data.url, location.origin); } catch { return; }
  if (url.origin !== location.origin) return;
  const token = url.searchParams.get('watch');
  if (token) { await offerWatchRoom(token); return; }
  if (url.searchParams.get('pick')) { pickUi.openPick(url.searchParams.get('pick')); return; } // pick: an invite or a match
  if (url.searchParams.get('update')) { await openUpdateNote(url.searchParams.get('update')); return; }
  if (url.searchParams.get('signin')) { await offerDeviceSignIn(url.searchParams.get('signin'), url.searchParams.get('on')); return; }
  if (await openLink(url)) return;
  const id = resolve(url.hash, state.me, state.status);
  if (id && id !== state.route) await setView(id);
});

(async function init() {
  const linkHash = location.hash; // a profile link (/#@ebicat) opens once Lilin has started
  try {
    state.status = await api('/api/status');
  } catch {
    const heading = $('#discover-heading');
    heading.textContent = T('Lilin isn’t answering'); heading.classList.add('sr-only');
    $('#discover-body').replaceChildren(emptyState(T('Lilin isn’t answering'),
      T('It’s probably restarting or updating. Give it a minute, then try again.'),
      { label: T('Try again'), run: () => location.reload() }));
    return;
  }
  state.me = state.status.me;
  renderTabs();
  renderMeButton();
  // The preview of a redesign (PREVIEW_DIR on the server): a small way back to the live app.
  if (state.status.preview) document.body.append(h('a', { class: 'preview-pill', href: '/preview/off', title: T('Leave the preview and go back to the live app') },
    h('span', { class: 'preview-pill-bulb', 'aria-hidden': 'true' }), h('strong', {}, T('Preview mode')), h('span', { class: 'preview-pill-sep', 'aria-hidden': 'true' }, '·'), T('Back to live')));
  syncLanguage();
  if (state.me?.needsPassword) { showPasswordGate(); return; }
  state.rules = state.status.rules;
  applyTheme(prefs().theme);
  if (state.status.admin) loadIdeas().then(updateHouseDot); // House → Needs you lights the tab
  await Promise.all([loadLibrary(), loadDownloads(), loadSessions(), loadProgress(), loadWatchlist(), loadTravel()]);
  // A reload stays on the page it was on (#library, #you/watching; old addresses like #settings land on their new
  // homes); a fresh visit opens the chosen start view.
  const start = resolve(linkHash, state.me, state.status) || startRoute(prefs().startView, state.me, state.status);
  state.route = null;
  if (start !== 'discover') await setView(start);
  else { state.route = 'discover'; rememberView('discover'); $('.tab[data-view="discover"]').setAttribute('aria-current', 'page'); renderDiscover(); }
  profiles.fromHash(linkHash);
  listsUI.fromHash(linkHash); // lists
  const watchToken = new URL(location.href).searchParams.get('watch');
  if (watchToken) await offerWatchRoom(watchToken);
  // pick: a Pick together invite (or its link) opens Lilin as ?pick=<id>
  if (new URL(location.href).searchParams.get('pick')) {
    const url = new URL(location.href); const id = url.searchParams.get('pick'); url.searchParams.delete('pick'); history.replaceState(null, '', url.pathname + url.search + url.hash);
    pickUi.openPick(id);
  }
  // Notification links (?friends=1, ?ideas=1, ?moment=<id>, ?travel=1) and shared note links (/c/n/<token> lands as
  // ?note=<id>): open where they point, then tidy the address.
  {
    const url = new URL(location.href);
    if (['friends', 'ideas', 'moment', 'travel', 'note'].some((k) => url.searchParams.has(k))) {
      const clean = new URL(location.href);
      for (const k of ['friends', 'ideas', 'moment', 'travel', 'note']) clean.searchParams.delete(k);
      history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
      await openLink(url);
    }
  }
  // The iPhone Home Screen app hands a video to Safari for picture in picture as ?play=<library id>&t=<seconds>.
  const playId = new URL(location.href).searchParams.get('play');
  if (playId) {
    const startAt = Number(new URL(location.href).searchParams.get('t')) || 0;
    const url = new URL(location.href); url.searchParams.delete('play'); url.searchParams.delete('t'); history.replaceState(null, '', url.pathname + url.search + url.hash);
    const f = state.library.find((x) => x.id === playId);
    if (f) { await openPlayer(libraryFile(f), { startAt }); toast(T('Press play, then the pop-out button')); }
    else toast(T('That video isn’t here any more'));
  }
  // The Wrapped notification opens Lilin as ?wrapped=<year>: straight into the story.
  const wrappedYear = Number(new URL(location.href).searchParams.get('wrapped'));
  if (wrappedYear) {
    const url = new URL(location.href); url.searchParams.delete('wrapped'); history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (wrappedYear > 2000 && wrappedYear < 3000) openWrapped(wrappedYear);
  }
  // A scanned sign-in QR (a computer's sign-in page, a TV) opens Lilin as ?signin=<code>&on=web|tv: ask first.
  const signinCode = new URL(location.href).searchParams.get('signin');
  if (signinCode) {
    const url = new URL(location.href); const on = url.searchParams.get('on');
    url.searchParams.delete('signin'); url.searchParams.delete('on'); history.replaceState(null, '', url.pathname + url.search + url.hash);
    await offerDeviceSignIn(signinCode, on);
  }
  // An update notification opens Lilin as ?update=<id>: show those notes.
  const updateId = new URL(location.href).searchParams.get('update');
  if (updateId) {
    const url = new URL(location.href); url.searchParams.delete('update'); history.replaceState(null, '', url.pathname + url.search + url.hash);
    await openUpdateNote(updateId);
  }
  schedulePoll();
  connectLive();
  pushDevice.registerWorker();
  notices.showPending(); // owner popups: over everything, OK to carry on
  setTimeout(maybeShowWhatsNew, 1200); // let the first screen settle before showing update notes
  // For you (the You tab's dot) and friend requests waiting for an answer (their popup)
  setTimeout(() => loadForYou().then(() => { if (sharesSocial()) maybeAskFriends(); }), 1600);
})();
