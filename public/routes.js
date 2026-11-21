// Every screen Lilin can show: its address (#you/watching), the view that draws it, the tab it lights and who may
// open it. Pure (no DOM): app.js uses it for the tab bar, links, Back and the start view; search's Go to (places.js)
// points at these ids, and tests/routes-places.test.mjs fails when a route has no place.
//
// A route id is its address. "tab/sub" ids are pages inside a tab: app.js shows `view` and hands it `sub`.
// `allowed(me, status)` decides who may open it (a sub page also needs its tab); missing = everyone.
// `group` sorts a tab's pages into the blocks of its root list (You's list, House's tiles).
// Labels are English; app.js shows them through T() (Swedish in i18n-sv.js).

const owner = (me, s) => Boolean(s?.admin);
const social = (me) => Boolean(me?.email && !me.restricted);

// Tab order in the bar. House only shows for owners (and members with owner rights). There is no Library: Play is
// the only action (think of something, find it, press Play), so what's here is a filter on Discover (Instant).
export const TABS = ['discover', 'live', 'liklok', 'house', 'you'];

export const ROUTES = {
  discover: { view: 'discover', tab: 'discover', label: 'Discover' },
  // Discover's Instant filter: everything on the server, which plays at once (the old Library's titles for everyone).
  'discover/instant': { view: 'discover', tab: 'discover', sub: 'instant', label: 'Plays instantly' },
  live: { view: 'live', tab: 'live', label: 'Live' },
  // liklok: the clip feed, a preview only the people in LIKLOK_EMAILS get (the server says so in /api/status).
  liklok: { view: 'liklok', tab: 'liklok', label: 'LikLok', allowed: (me, s) => Boolean(s?.liklok) },

  // You: the person's own hub (replaces Settings). The root list is the phone's index; each row opens a page.
  // Your watching is private (always your own view, also for the home network's shared account).
  you: { view: 'you', tab: 'you', label: 'You' },
  'you/history': { view: 'you', tab: 'you', sub: 'history', group: 'watching', label: 'History', allowed: (me) => Boolean(me) },
  'you/ratings': { view: 'you', tab: 'you', sub: 'ratings', group: 'watching', label: 'Ratings and reviews', allowed: (me) => Boolean(me && !me.restricted) }, // restricted people can't give stars
  'you/liked': { view: 'you', tab: 'you', sub: 'liked', group: 'watching', label: 'Liked', allowed: (me) => Boolean(me) },
  'you/friends': { view: 'you', tab: 'you', sub: 'friends', group: 'people', label: 'Friends', allowed: social },
  'you/moments': { view: 'you', tab: 'you', sub: 'moments', group: 'people', label: 'Moments', allowed: (me) => Boolean(me) },
  // Owners read Activity in House; a member with "Can see activity" keeps it here (House is owners only).
  'you/activity': { view: 'activity', tab: 'you', sub: 'activity', group: 'people', label: 'Activity', allowed: (me, s) => Boolean(!s?.admin && me?.canSeeActivity) },
  'you/invite': { view: 'you', tab: 'you', sub: 'invite', group: 'people', label: 'Invite someone to Lilin', allowed: (me, s) => Boolean(s?.admin || (me?.canInvite && me.email && !me.restricted)) },
  'you/account': { view: 'you', tab: 'you', sub: 'account', group: 'settings', label: 'Account' },
  'you/look': { view: 'you', tab: 'you', sub: 'look', group: 'settings', label: 'Language and look' },
  'you/watching': { view: 'you', tab: 'you', sub: 'watching', group: 'settings', label: 'Watching' },
  'you/devices': { view: 'you', tab: 'you', sub: 'devices', group: 'settings', label: 'Devices and notifications' },
  // How Play picks a copy it fetches (quality, size, audio language); the address keeps its old name.
  'you/download-settings': { view: 'you', tab: 'you', sub: 'download-settings', group: 'settings', label: 'Picture and sound', allowed: (me, s) => Boolean(s?.downloads && me?.canDownload !== false) },
  'you/ideas': { view: 'you', tab: 'you', sub: 'ideas', group: 'ideas', label: 'Ideas and bugs', allowed: (me) => Boolean(me && !me.isOwner) },

  // House: the owner's tools, one tile each (the machines page used to be called House).
  house: { view: 'house', tab: 'house', label: 'House', allowed: owner },
  'house/machines': { view: 'house', tab: 'house', sub: 'machines', group: 'tools', label: 'Machines' },
  // Transfers are the owner's business: what's downloading, what needs a look, what leaves soon, copies for phones.
  // It draws in the old Library view (#view-library), so its polling and live updates carry on as they were.
  'house/downloads': { view: 'library', tab: 'house', sub: 'downloads', group: 'tools', label: 'Downloads' },
  'house/activity': { view: 'activity', tab: 'house', sub: 'activity', group: 'tools', label: 'Activity' },
  'house/notes': { view: 'notes', tab: 'house', sub: 'notes', group: 'tools', label: 'Notes', allowed: (me, s) => Boolean(s?.notes) },
  'house/clips': { view: 'clips', tab: 'house', sub: 'clips', group: 'tools', label: 'Game clips', allowed: (me, s) => Boolean(s?.clips) },
  'house/people': { view: 'house', tab: 'house', sub: 'people', group: 'tools', label: 'People' },
  'house/ideas': { view: 'house', tab: 'house', sub: 'ideas', group: 'tools', label: 'Ideas' },
  'house/rules': { view: 'house', tab: 'house', sub: 'rules', group: 'tools', label: 'Server rules' },
  'house/screen-time': { view: 'house', tab: 'house', sub: 'screen-time', group: 'tools', label: 'Screen Time' },
};

// Old addresses (bookmarks, reloads, notification links) and the route they open now.
// The Library tab's addresses: its titles are Discover's Instant filter, its watchlist the personal rows on Discover,
// its downloads House › Downloads (members, who don't see downloads, land on Discover).
export const LEGACY = {
  settings: 'you',
  library: 'discover/instant',
  'library/titles': 'discover/instant',
  'library/watchlist': 'discover',
  watchlist: 'discover',
  'library/downloads': 'house/downloads',
  downloads: 'house/downloads',
  activity: 'you/activity', // owners: MOVED sends it on to House
  notes: 'house/notes',
  clips: 'house/clips',
};

// Pages that moved for some people: an old address they can't open falls through to the new one.
export const MOVED = {
  'you/activity': 'house/activity',
  'house/downloads': 'discover',
};

// Notification links carry a query (?friends=1#settings): the route each one lands on. Anything else in the
// query (?watch=, ?pick=, ?update=, ?wrapped=, ?play=) opens over whatever is showing, as before.
export const LINK_PARAMS = {
  friends: () => 'you/friends',
  moment: () => 'you/moments',
  ideas: (me) => (me?.isOwner ? 'house/ideas' : 'you/ideas'), // the inbox is the owner's; everyone else sends ideas
  travel: (me, s) => (s?.admin ? 'house/downloads' : 'discover'), // app.js opens the phone copies over it
  note: () => 'house/notes',
};

// May this person open the route? A page inside a tab also needs the tab.
export function allowedRoute(id, me, status) {
  const r = ROUTES[id];
  if (!r) return false;
  if (r.allowed && !r.allowed(me, status)) return false;
  return id === r.tab || allowedRoute(r.tab, me, status);
}

export const tabsFor = (me, status) => TABS.filter((t) => allowedRoute(t, me, status));

// The pages of a tab (its root list), in order, that this person may open.
export const pagesOf = (tab, me, status) => Object.keys(ROUTES).filter((id) => id !== tab && ROUTES[id].tab === tab && allowedRoute(id, me, status));

// "#you/watching", "settings", "#downloads" → the route id this person may open, or null (show the start view).
export function resolve(hash, me, status) {
  let id = String(hash ?? '').replace(/^#/, '');
  try { id = decodeURIComponent(id); } catch { return null; }
  id = id.trim().replace(/\/+$/, '');
  if (!id || id.startsWith('@')) return null; // #@handle: a profile, opened over the start view
  id = LEGACY[id] || (id.startsWith('library/') ? 'discover' : id);
  if (!allowedRoute(id, me, status) && MOVED[id]) id = MOVED[id];
  return allowedRoute(id, me, status) ? id : null;
}

// The route a notification link points at (?friends=1 → you/friends), or null when it has none.
export function linkRoute(params, me, status) {
  for (const [key, to] of Object.entries(LINK_PARAMS)) {
    if (!params.has(key)) continue;
    const id = to(me, status);
    return allowedRoute(id, me, status) ? id : null;
  }
  return null;
}

// The saved start view ("Open Lilin on"), checked like any link. A Library start opens Discover (Continue watching
// is at its top), not the Instant filter an old #library link lands on.
export const startRoute = (startView, me, status) => resolve(startView === 'library' ? 'discover' : startView || 'discover', me, status) || 'discover';
