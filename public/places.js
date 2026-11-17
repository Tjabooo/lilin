// Go to: places and settings findable by name in search ("subtitles", "logga ut", "tv code"). Pure (no DOM).
// Each place points at a route (routes.js) or an action app.js runs (PLACE_ACTIONS there). Who sees a place is
// the route's own rule unless the place narrows it with who(me, status). Labels are English and go through T();
// syn holds extra words people type, per language. tests/routes-places.test.mjs checks every route has a place,
// every label has Swedish and every action is handled.
import { ROUTES, allowedRoute } from './routes.js';

// Things a place can do instead of opening a route (handled by PLACE_ACTIONS in app.js).
export const ACTIONS = ['whats-new', 'wrapped', 'pick', 'profile', 'manage-downloads', 'channels', 'torrents', 'phone-copies'];

const syn = (en, sv) => ({ en, sv });

export const PLACES = [
  { id: 'discover', route: 'discover', syn: syn(['home', 'browse', 'trending', 'films', 'shows', 'genres'], ['hem', 'bläddra', 'trendar', 'filmer', 'serier', 'genrer']) },
  { id: 'live', route: 'live', syn: syn(['tv', 'seele tv', 'channels', 'guide', 'live tv'], ['tv', 'kanaler', 'tablå']) },
  { id: 'instant', route: 'discover/instant', syn: syn(['instant', 'on lilin', 'on the server', 'ready to watch', 'library', 'my titles', 'collection'], ['direkt', 'på lilin', 'på servern', 'redo att se', 'bibliotek', 'mina titlar', 'samling']) },
  { id: 'saved', route: 'discover', label: 'Saved for later', syn: syn(['saved', 'watchlist', 'following', 'new episodes', 'continue watching'], ['sparat', 'sparad till senare', 'följer', 'nya avsnitt', 'fortsätt titta']) },
  { id: 'you', route: 'you', syn: syn(['settings', 'preferences', 'me', 'my account'], ['inställningar', 'jag', 'mitt konto']) },
  { id: 'history', route: 'you/history', syn: syn(['diary', 'watched', 'what i watched', 'recently watched', 'watch history'], ['historik', 'dagbok', 'sett', 'vad jag sett', 'tittarhistorik']) },
  { id: 'ratings', route: 'you/ratings', syn: syn(['reviews', 'my reviews', 'stars', 'my ratings'], ['betyg', 'recensioner', 'mina recensioner', 'stjärnor']) },
  { id: 'liked', route: 'you/liked', syn: syn(['likes', 'thumbs up', 'favourites', 'favorites'], ['gillat', 'gillade', 'tummen upp', 'favoriter']) },
  { id: 'activity', route: 'you/activity', syn: syn(['what happened', 'log', 'history of everyone'], ['aktivitet', 'logg', 'vad som hänt']) },
  { id: 'house-activity', route: 'house/activity', syn: syn(['what happened', 'log', 'history of everyone'], ['aktivitet', 'logg', 'vad som hänt']) },
  { id: 'friends', route: 'you/friends', syn: syn(['friend requests', 'add a friend', 'find someone'], ['vänner', 'vänförfrågningar', 'lägg till en vän']) },
  { id: 'moments', route: 'you/moments', syn: syn(['clips from films', 'shared with you'], ['ögonblick', 'delat med dig']) },
  { id: 'invite', route: 'you/invite', syn: syn(['invite link', 'invite someone'], ['bjud in', 'inbjudningslänk']) },
  { id: 'account', route: 'you/account', syn: syn(['sign out', 'log out', 'password', 'change password'], ['logga ut', 'lösenord', 'byt lösenord', 'konto']) },
  { id: 'look', route: 'you/look', syn: syn(['language', 'theme', 'colours', 'colors', 'appearance', 'swedish', 'english'], ['språk', 'tema', 'färger', 'utseende', 'svenska', 'engelska']) },
  { id: 'watching', route: 'you/watching', syn: syn(['subtitles', 'intros', 'skip intro', 'theme music', 'start page', 'open lilin on'], ['undertexter', 'intron', 'hoppa över intro', 'ledmotiv', 'startsida', 'öppna lilin på']) },
  { id: 'devices', route: 'you/devices', syn: syn(['notifications', 'push', 'tv code', 'sign in on a tv', 'sign in a computer', 'qr code', 'scan', 'android tv', 'jellyfin'], ['aviseringar', 'notiser', 'tv-kod', 'logga in på en tv', 'logga in en dator', 'qr-kod', 'skanna']) },
  { id: 'download-settings', route: 'you/download-settings', syn: syn(['quality', 'download settings', 'download quality', 'largest download', 'audio language', '4k'], ['kvalitet', 'nedladdningar', 'största nedladdning', 'ljudspråk']) },
  { id: 'ideas', route: 'you/ideas', syn: syn(['idea box', 'bug', 'feedback', 'suggestion', 'something is off'], ['idélåda', 'bugg', 'förslag', 'något är fel']) },
  { id: 'house', route: 'house', syn: syn(['owner', 'admin', 'server', 'tools'], ['ägare', 'server', 'verktyg']) },
  { id: 'downloads', route: 'house/downloads', syn: syn(['transfers', 'downloading', 'leaving soon', 'keep longer', 'copies for phones'], ['nedladdningar', 'laddar ner', 'försvinner snart', 'behåll längre', 'kopior till telefonen']) },
  { id: 'machines', route: 'house/machines', syn: syn(['vpn', 'power', 'disks', 'status', 'sharing', 'overview', 'uptime'], ['maskiner', 'ström', 'diskar', 'översikt', 'delning']) },
  { id: 'notes', route: 'house/notes', syn: syn(['note', 'notebook'], ['anteckningar', 'anteckning']) },
  { id: 'clips', route: 'house/clips', syn: syn(['clips', 'game clips', 'trim', 'share a clip'], ['klipp', 'spelklipp', 'trimma']) },
  { id: 'people', route: 'house/people', syn: syn(['who may sign in', 'users', 'members', 'permissions', 'restrict', 'can download', 'access'], ['personer', 'användare', 'behörigheter', 'begränsa', 'åtkomst']) },
  { id: 'idea-inbox', route: 'house/ideas', syn: syn(['idea inbox', 'scout', 'suggestions', 'bugs'], ['idéer', 'förslag', 'buggar', 'inkorg']) },
  { id: 'rules', route: 'house/rules', syn: syn(['auto-delete', 'delete downloads after', 'keep longer', 'staying signed in', 'colours for new people'], ['serverregler', 'radera automatiskt', 'behåll längre', 'förbli inloggad']) },
  { id: 'screen-time', route: 'house/screen-time', syn: syn(['screentime', 'usage', 'apps'], ['skärmtid', 'appar', 'användning']) },
  // actions: open something over the page
  { id: 'whats-new', action: 'whats-new', label: 'What’s new', who: (me, s) => Boolean(s?.whatsNew), syn: syn(['updates', 'release notes', 'changelog'], ['nyheter', 'uppdateringar']) },
  { id: 'wrapped', action: 'wrapped', label: 'Lilin Wrapped', who: (me) => Boolean(me), syn: syn(['wrapped', 'your year', 'year in review'], ['ditt år', 'året som gått']) },
  { id: 'pick', action: 'pick', label: 'Pick together', who: (me) => Boolean(me), syn: syn(['match', 'swipe', 'choose a film together'], ['välj tillsammans', 'matcha', 'swipa']) },
  { id: 'profile', action: 'profile', label: 'Your profile', who: (me) => Boolean(me?.email), syn: syn(['public page', 'my page', 'username', 'bio'], ['profil', 'din sida', 'användarnamn']) },
  { id: 'manage-downloads', action: 'manage-downloads', label: 'Manage downloads', who: (me, s) => Boolean(s?.admin), syn: syn(['server downloads', 'qbittorrent', 'transfers'], ['hantera nedladdningar', 'serverns nedladdningar']) },
  { id: 'channels', action: 'channels', label: 'Your channels', who: (me, s) => Boolean(s?.admin), syn: syn(['edit channels', 'seele tv channels'], ['dina kanaler', 'ändra kanaler']) },
  { id: 'torrents', action: 'torrents', label: 'Find torrents', who: (me, s) => Boolean(s?.admin && s.torrents && s.downloads), syn: syn(['torrent', 'search torrents'], ['sök torrents']) },
  { id: 'phone-copies', action: 'phone-copies', label: 'Copies on this phone', who: (me) => Boolean(me), syn: syn(['offline', 'to phone', 'download to phone', 'watch offline'], ['offline', 'till telefonen', 'titta offline']) },
];

export const placeLabel = (p) => p.label || ROUTES[p.route]?.label || p.id;

// May this person see the place? Its route's rule, narrowed by who().
export const placeShown = (p, me, status) => (p.route ? allowedRoute(p.route, me, status) : true) && (!p.who || p.who(me, status));

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Places matching what was typed, best first: the name (in the chosen language and English), then the extra words.
export function matchPlaces(query, { me, status, T = (s) => s, lang = 'en', limit = 4 } = {}) {
  const q = fold(query);
  if (!q) return [];
  const score = (p) => {
    const names = [fold(T(placeLabel(p))), fold(placeLabel(p))];
    if (names.some((n) => n.startsWith(q))) return 4;
    if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(q)))) return 3;
    const words = [...(p.syn?.[lang] || []), ...(lang === 'en' ? [] : p.syn?.en || [])].map(fold);
    if (words.some((w) => w.startsWith(q))) return 2;
    if (q.length >= 3 && [...names, ...words].some((w) => w.includes(q))) return 1;
    return 0;
  };
  return PLACES.filter((p) => placeShown(p, me, status))
    .map((p) => [p, score(p)]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([p]) => p);
}

// Shortcuts shown under the empty search field: a few useful places for this person.
const DEFAULTS = ['instant', 'watching', 'devices', 'friends', 'pick', 'downloads', 'look', 'machines', 'people', 'account'];
export const defaultPlaces = (me, status, limit = 6) => DEFAULTS.map((id) => PLACES.find((p) => p.id === id))
  .filter((p) => p && placeShown(p, me, status)).slice(0, limit);
