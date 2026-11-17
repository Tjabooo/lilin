// Screens for shoot.mjs. Each scene: path, a selector that means "ready", steps run in the page
// (async JS with the __click/__clickText/__waitFor helpers), optional API mocks/patches, sizes, full page.
// Steps go by selectors and English|Swedish text so one list covers both languages.

const shelfCard = (re, nth = 0) => `
  const shelf = [...document.querySelectorAll('#discover-body .shelf, #library-body .shelf')].find((s) => /${re}/i.test(s.querySelector('h3')?.textContent || ''));
  if (!shelf) throw new Error('no shelf ${re}');
  const card = shelf.querySelectorAll('.title-card')[${nth}];
  card.scrollIntoView({ block: 'center' }); card.click();`;
const sheetOpen = "await __waitFor('#sheet.open #sheet-title'); await __sleep(700);";
// The one title page has one gold button: report how many are lit (visible .play-btn in the sheet).
const lit = "return 'lit ' + [...document.querySelectorAll('#sheet-body .play-btn')].filter((b) => b.offsetParent && !b.closest('[hidden]')).length;";
const libraryCard = (type) => `
  await __waitFor('.unified-library .lib-group .title-card');
  const groups = [...document.querySelectorAll('.unified-library .lib-group')].filter((g) => !g.hidden);
  const group = groups.find((g) => /${type === 'tv' ? 'shows|serier' : 'films|filmer'}/i.test(g.querySelector('h3')?.textContent || '')) || groups[0];
  const card = group.querySelector('.title-card'); card.scrollIntoView({ block: 'center' }); card.click();`;
const typeSearch = (q) => `const i = document.querySelector('#q'); i.focus(); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); await __sleep(400);`;
const filmPage = [libraryCard('movie'), sheetOpen];
// Live's guide with people watching (faces that open profiles), and an access list with invites (the owner's People).
const GUIDE_FACES = { '^/api/live$': (j) => { if (j.channels?.[0]) { j.channels[0].faces = [{ id: 2, name: 'Maja', avatar: null }, { id: 4, name: 'Ebba', avatar: null }]; j.channels[0].watching = 2; } return j; } };
const ACCESS = { '^/api/access$': { configured: true, members: ['owner@example.test', 'member@example.test', 'restricted@example.test', 'mormor@example.test'],
  names: { 'mormor@example.test': 'Mormor' }, owners: ['owner@example.test'], passwords: ['owner@example.test', 'member@example.test'], error: null,
  invites: [{ id: 'abcd1234', token: 'aaaaaaaaaaaaaaaa', note: 'Morfar', expires: Date.now() + 5 * 864e5, state: 'open', byName: 'Maja' },
    { id: 'abcd1235', token: 'bbbbbbbbbbbbbbbb', note: '', expires: Date.now() + 6 * 864e5, state: 'open', byName: 'Oliver' }] } };
// The friend request popup (it waits for nothing on a page that's just open): Later, so the page underneath shows.
const laterAsks = "await __sleep(1500); if (document.querySelector('#picker.open .friend-asks')) { document.querySelector('#picker .whats-new-done').click(); await __sleep(600); }";
const openPlayer = ["await __click('#sheet .title-bar [data-act=play]'); await __waitFor('#player:not([hidden])'); await __sleep(5000); const v = document.querySelector('#video'); v.pause(); await __sleep(500);"];
const menu = (sel) => `const b = document.querySelector('${sel}'); if (b && !b.hidden) { b.click(); await __sleep(700); } else return 'no ${sel}';`;

const MOCK_SESSION = { id: 'mock-session', deviceId: 'living-room', title: 'Arrival', deviceName: 'Living room TV', state: 'playing', position: 1260, duration: 6960, mine: true, kind: 'dlna' };
const dl = (o) => ({ mediaType: 'movie', tmdbId: null, showKey: null, showId: null, poster: null, backdrop: null, added: Date.now() - 3600e3,
  ready: false, hasVideo: true, episodes: [], canPlayNow: false, packFiles: 1, skippedFiles: 0, dualAudio: false, others: false,
  libraryIds: [], mine: true, canManage: true, speed: 0, eta: null, seeds: 0, swarmSeeds: 0, size: 4.2e9, transferComplete: false,
  done: false, converting: false, convertPercent: null, subs: [], ...o,
  files: [{ name: `${o.name}.mkv`, size: 4.2e9, progress: o.progress, available: false, index: 0, mediaKey: null, libraryId: null }] });
const DOWNLOADS_ON = { '^/api/status$': (j) => { j.downloads = true; return j; } };
const MOCK_DOWNLOADS = [
  dl({ hash: 'a'.repeat(40), name: 'Dune.Part.Two.2024.2160p.WEB-DL', title: 'Dune: Part Two', canonicalTitle: 'Dune: Part Two', year: 2024, progress: 0.42, speed: 6.4e6, eta: 380, seeds: 41, swarmSeeds: 380, state: 'downloading', canPlayNow: true }),
  dl({ hash: 'b'.repeat(40), name: 'Oppenheimer.2023.1080p.BluRay', title: 'Oppenheimer', canonicalTitle: 'Oppenheimer', year: 2023, progress: 0.07, state: 'stalledDL', seeds: 0, swarmSeeds: 0 }),
  dl({ hash: 'c'.repeat(40), name: 'Past.Lives.2023.1080p', title: 'Past Lives', canonicalTitle: 'Past Lives', year: 2023, progress: 0.63, state: 'error' }),
  dl({ hash: 'd'.repeat(40), name: 'Severance.S02.1080p.ATVP.WEB-DL', title: 'Severance', canonicalTitle: 'Severance', mediaType: 'tv', showKey: 'severance', showId: 'name-severance', season: 2, progress: 0.18, speed: 2.1e6, eta: 2400, seeds: 12, state: 'queuedDL' }),
];


// pick: Pick together (public/match.js), with /api/match mocked
const PICK_ID = 'Pk3x9QmZ2aBcDeFgHiJkLm';
const pickCard = (id, title, year, poster, rating, genreNames, extra = {}) => ({ key: `movie:${id}`, type: 'movie', id, title, year,
  poster: `https://image.tmdb.org/t/p/w500/${poster}.jpg`, backdrop: null, rating, genres: [], genreNames, runtime: 100 + (id % 50), seasons: null,
  overview: 'Odysseus, the legendary King of Ithaca, embarks on a long and perilous journey home following the Trojan War, confronting monsters, gods and his own pride on the way.', onServer: false, why: null, ...extra });
const PICK_CARDS = [
  pickCard(1368337, 'The Odyssey', 2026, '5rhTDKUhPYvpdQIijFIs5VoWsON', 8, ['Adventure', 'Action', 'Fantasy'], { why: { title: 'Dune: Part Two', liked: true }, onServer: true }),
  pickCard(1567605, 'Ebenezer', 2026, '6H2N59jJW1hZEzn2ZdrMvJw5vNI', 7.7, ['Fantasy', 'Comedy']),
  pickCard(1300968, 'The Hunger Games: Sunrise on the Reaping', 2026, 'j1MNyNNgNQL6f27cb3m3uKaPKd6', 9.3, ['Science Fiction', 'Action']),
  pickCard(1423191, 'Resident Evil', 2026, 'gAgWJhUSQWCgtKR8170nMkYlBda', 7.5, ['Horror', 'Science Fiction']),
];
const PICK_PEOPLE = [{ id: 2, name: 'Ebba', avatar: null }, { id: 3, name: 'Max', avatar: null }, { id: 4, name: 'Pappa', avatar: null }];
const pickState = (o = {}) => ({ id: PICK_ID, joined: true, type: 'movie', filters: { genre: '', maxMinutes: 0, unseen: true, serverOnly: false },
  host: { id: 1, name: 'Oliver', avatar: null }, created: Date.now() - 600e3,
  members: [{ id: 1, name: 'Oliver', avatar: null, host: true, me: true, swiped: 3, done: false }, { id: 2, name: 'Ebba', avatar: null, host: false, me: false, swiped: 6, done: false }],
  invited: [{ id: 3, name: 'Max', avatar: null }], total: PICK_CARDS.length, from: 0, more: false, cards: PICK_CARDS, mine: {}, matches: [], room: null, canInvite: true, ...o });
const PICK_MOCKS = (o = {}, vote = { ok: true, match: null, left: 3 }) => ({
  '^/api/match$': { picks: [], people: PICK_PEOPLE, canInvite: true },
  '^/api/match/[A-Za-z0-9_-]{22}/invitees': { people: PICK_PEOPLE.slice(1) },
  '^/api/match/[A-Za-z0-9_-]{22}/vote': vote,
  '^/api/match/[A-Za-z0-9_-]{22}/more': { dealt: 0 },
  '^/api/match/[A-Za-z0-9_-]{22}(\\?|$)': pickState(o),
});

// Revamp 2, Discover + Library on a throwaway local server (no TMDB, no qBittorrent): everything Discover and the
// Library show is mocked, with drawn posters, so the layout can be judged for every role.
const art = (i, w = 200, h = 300) => {
  const hue = (i * 47) % 360;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,38%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},45%,14%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)}`;
};
const R2_NAMES = ['The Odyssey', 'Dune: Part Two', 'Past Lives', 'Severance', 'Arrival', 'Oppenheimer', 'The Bear', 'Shogun', 'Anora', 'Conclave', 'Andor', 'Nosferatu', 'Flow', 'Slow Horses', 'The Brutalist', 'Silo'];
const r2Title = (i, type = i % 3 ? 'movie' : 'tv') => ({ type, id: 9000 + i, title: R2_NAMES[i % R2_NAMES.length], year: 2020 + (i % 6), rating: 6.5 + (i % 30) / 10,
  poster: art(i), backdrop: art(i, 780, 439), overview: 'A story told across one long night, with more twists than anyone at the table expected.', genres: [18] });
const r2List = (from, n = 14, type) => Array.from({ length: n }, (_, i) => r2Title(from + i, type));
const R2_ROWS = { all: [['trending-all', 'Trending this week'], ['popular-movie', 'Popular films', 'movie'], ['popular-tv', 'Popular shows', 'tv'], ['cinemas', 'In cinemas now', 'movie'], ['on-air', 'New episodes this week', 'tv'], ['top-movie', 'Top rated films', 'movie'], ['top-tv', 'Top rated shows', 'tv']],
  movie: [['trending-movie', 'Trending films', 'movie'], ['popular-movie', 'Popular', 'movie'], ['cinemas', 'In cinemas now', 'movie'], ['top-movie', 'Top rated', 'movie']],
  tv: [['trending-tv', 'Trending shows', 'tv'], ['popular-tv', 'Popular', 'tv'], ['on-air', 'New episodes this week', 'tv'], ['top-tv', 'Top rated', 'tv']] };
const HOUR = 3600e3;
const r2File = (i, o = {}) => ({ id: `lib-${i}`, mediaKey: `mk-${i}`, file: `File.${i}.mp4`, title: R2_NAMES[i % R2_NAMES.length], filmTitle: R2_NAMES[i % R2_NAMES.length],
  tmdbId: 9000 + i, year: 2024, poster: art(i), backdrop: art(i, 780, 439), size: 2.1e9 + i * 1e8, addedAt: Date.now() - (i + 1) * 30 * HOUR, added: Date.now() - (i + 1) * 30 * HOUR, expiresAt: Date.now() + (i + 1) * 40 * HOUR, ...o });
const R2_LIBRARY = [r2File(1, { addedAt: Date.now() - 2 * HOUR, added: Date.now() - 2 * HOUR }), r2File(2, { expiresAt: Date.now() + 20 * HOUR }), ...Array.from({ length: 10 }, (_, i) => r2File(i + 3))];
const R2_STATUS = (o = {}) => ({ '^/api/status$': (j) => { j.search = true; j.downloads = true; j.wrapped = { year: 2026 }; if (o.start) j.me.settings.startView = o.start; return j; } });
const R2_MOCKS = ({ empty = false } = {}) => ({
  '^/api/discover/genres': { genres: [['Action', 28, 10759], ['Comedy', 35, 35], ['Crime', 80, 80], ['Drama', 18, 18], ['Horror', 27, null], ['Romance', 10749, null], ['Science Fiction', 878, 10765], ['Thriller', 53, null]].map(([name, movie, tv]) => ({ name, movie, tv })) },
  '^/api/discover/home': (u) => { const rows = R2_ROWS[u.searchParams.get('type')] || R2_ROWS.all; return { featured: r2List(40, 5), rows: rows.map(([key, title, type], i) => ({ key, title, items: r2List(i * 14, 14, type) })) }; },
  '^/api/discover/list': (u) => ({ page: 1, totalPages: 1, results: r2List(3, 20, u.searchParams.get('key').endsWith('tv') ? 'tv' : 'movie') }),
  '^/api/vibes$': { vibes: [['rainy', 'Slow-burn rainy day thriller', 'rain', ['#14263d', '#6aa7e8']], ['90s', '90s indie nostalgia', 'cassette', ['#3d2414', '#e8a06a']], ['cosy', 'Cosy Sunday', 'mug', ['#2b1a12', '#f0c27a']], ['neon', 'Neon nights', 'neon', ['#24103d', '#c07af0']]].map(([id, name, glyph, colors]) => ({ id, name, glyph, colors, types: ['movie', 'tv'] })) },
  '^/api/social/popular': empty ? { items: [] } : { items: r2List(60, 10).map((t, i) => ({ ...t, likes: i % 3, viewers: 2, likedBy: i % 3 ? ['Ebba'] : [], people: [{ id: 2, name: 'Ebba' }] })) },
  '^/api/match$': { picks: [], people: [], canInvite: true },
  '^/api/watch/parties$': empty ? { parties: [] } : { parties: [{ token: 't'.repeat(24), startsAt: Date.now() + 3 * HOUR, started: false, mine: true, host: 'Owner', faces: [], media: { kind: 'lib', id: 'lib-3', title: 'Past Lives' } }] },
  '^/api/me/wrapped': { empty: true },
  '^/api/title/': { page: { similar: r2List(80, 12) } },
  '^/api/library$': empty ? { items: [], server: [], shows: [] } : { items: R2_LIBRARY, server: [], shows: [] },
  '^/api/me/progress$': empty ? { progress: {}, finished: {} } : { progress: { 'm:mk-4': { time: 1200, duration: 6000, at: Date.now() - 5 * HOUR }, 'm:mk-6': { time: 300, duration: 2400, at: Date.now() - 30 * HOUR } }, finished: {} },
  '^/api/downloads': empty ? { items: [] } : { items: MOCK_DOWNLOADS.slice(0, 3) },
  '^/api/watchlist$': empty ? { items: [], autoDownload: true } : { autoDownload: true, items: [
    { type: 'tv', id: 9104, title: 'Severance', poster: art(4), follow: true, auto: true, nextEpisode: { season: 2, episode: 7, name: 'Chikhai Bardo', airDate: new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10) } },
    { type: 'movie', id: 9105, title: 'The Odyssey', poster: art(5), saved: true, release: new Date(Date.now() + 9 * 86400e3).toISOString().slice(0, 10), releaseKind: 'digital' },
    { type: 'movie', id: 9106, title: 'Nosferatu', poster: art(6), saved: true },
    { type: 'movie', id: 9107, title: 'Conclave', poster: art(7), saved: true },
    { type: 'tv', id: 9108, title: 'Slow Horses', poster: art(8), follow: true, auto: false }] },
  '^/api/convert': { enabled: true, active: [], queued: 0, recentFailures: [] },
});

export const SCENES = [
  // ---- revamp 2: Discover + Library (mocked; see R2_MOCKS) ----
  { name: 'r2-discover', path: '/', ready: '#discover-body .billboard', mocks: R2_MOCKS(), patch: R2_STATUS(), after: 1500 },
  { name: 'r2-discover-full', path: '/', ready: '#discover-body .billboard', mocks: R2_MOCKS(), patch: R2_STATUS(), full: true, steps: ["await __waitFor('.vibes-shelf', 15000); await __sleep(1500);"] },
  { name: 'r2-discover-top', path: '/', ready: '#discover-body .billboard', mocks: R2_MOCKS(), patch: R2_STATUS(), steps: ["await __waitFor('.right-now:not([hidden])', 15000); document.querySelector('.right-now').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); await __sleep(600);"] },
  { name: 'r2-discover-genres', path: '/', ready: '#discover-body .billboard', mocks: R2_MOCKS(), patch: R2_STATUS(), steps: ["await __click('.genres-toggle'); document.querySelector('.discover-controls').scrollIntoView({ block: 'center' }); await __sleep(500);"] },
  { name: 'r2-discover-new', path: '/', ready: '#discover-body .billboard', mocks: R2_MOCKS({ empty: true }), patch: R2_STATUS(), full: true, steps: ["await __waitFor('.vibes-shelf', 15000); await __sleep(1500);"] },
  { name: 'r2-library', path: '/#library', ready: '#library-body .unified-card', mocks: R2_MOCKS(), patch: R2_STATUS(), full: true, after: 1000 },
  { name: 'r2-library-start', path: '/#library', ready: '#library-body .unified-card', mocks: R2_MOCKS(), patch: R2_STATUS({ start: 'library' }), after: 1500 },
  { name: 'r2-watchlist', path: '/#library/watchlist', ready: '#library-body .rn-row', mocks: R2_MOCKS(), patch: R2_STATUS(), full: true, after: 800 },
  { name: 'r2-downloads', path: '/#library/downloads', ready: '#library-body .rn-row', mocks: R2_MOCKS(), patch: R2_STATUS(), full: true, after: 800 },
  { name: 'r2-library-empty', path: '/#library', ready: '#library-body .empty-state', mocks: R2_MOCKS({ empty: true }), patch: R2_STATUS(), after: 500 },
  { name: 'r2-watchlist-empty', path: '/#library/watchlist', ready: '#library-body .empty-state', mocks: R2_MOCKS({ empty: true }), patch: R2_STATUS(), after: 500 },
  { name: 'r2-downloads-empty', path: '/#library/downloads', ready: '#library-body .empty-state', mocks: R2_MOCKS({ empty: true }), patch: R2_STATUS(), after: 500 },
  // ---- Discover ----
  { name: 'discover', path: '/', ready: '#discover-body .shelf' },
  { name: 'discover-rows', path: '/', ready: '#discover-body .shelf', steps: ['window.scrollTo(0, innerHeight * 1.5); await __sleep(500);'] },
  { name: 'discover-films', path: '/', ready: '#discover-body .shelf', steps: ["await __click('.discover-controls .segmented button:nth-child(2)'); await __waitFor('#discover-body .shelf');"] },
  // pick: Pick together: Discover's line, starting one, the stack, a drag, a match, joining from a link
  { name: 'pick-entry', path: '/', ready: '#discover-body .shelf', mocks: PICK_MOCKS(), steps: ["const s = await __waitFor('.pick-tile', 20000); s.scrollIntoView({ block: 'center' }); await __sleep(600);"] },
  { name: 'pick-setup', path: '/', ready: '#discover-body .shelf', mocks: PICK_MOCKS(), steps: ["await __click('.pick-tile', 20000); await __waitFor('.pick-setup'); await __sleep(700);"] },
  { name: 'pick-swipe', path: `/?pick=${PICK_ID}`, ready: '.pick-card.is-top', mocks: PICK_MOCKS(), after: 1500 },
  { name: 'pick-drag', path: `/?pick=${PICK_ID}`, ready: '.pick-card.is-top', mocks: PICK_MOCKS(), steps: ["const c = document.querySelector('.pick-card.is-top'); c.classList.add('is-dragging'); c.style.transform = 'translate(70px, 6px) rotate(4deg)'; c.style.setProperty('--yes', '0.9'); await __sleep(1500);"] },
  { name: 'pick-about', path: `/?pick=${PICK_ID}`, ready: '.pick-card.is-top', mocks: PICK_MOCKS(), steps: ["document.querySelector('.pick-card.is-top').classList.add('is-about'); await __sleep(1500);"] },
  { name: 'pick-match', path: `/?pick=${PICK_ID}`, ready: '.pick-card.is-top', mocks: PICK_MOCKS({ matches: [] }, { ok: true, match: 'movie:1368337', left: 3 }), steps: ["await __sleep(800); await __click('.pick-yes'); await __waitFor('.pick-pop.open'); await __sleep(1200);"] },
  { name: 'pick-invite', path: `/?pick=${PICK_ID}`, ready: '.pick-card.is-top', mocks: PICK_MOCKS(), steps: ["await __sleep(600); await __click('.pick-invite'); await __waitFor('.pick-pop.open .room-invitee'); await __sleep(900);"] },
  { name: 'pick-join', path: `/?pick=${PICK_ID}`, ready: '.pick-join', mocks: PICK_MOCKS({ joined: false, host: { id: 2, name: 'Ebba', avatar: null }, members: [{ id: 2, name: 'Ebba', avatar: null, host: true, me: false }, { id: 3, name: 'Max', avatar: null, host: false, me: false }] }), after: 1200 },
  { name: 'pick-empty', path: `/?pick=${PICK_ID}`, ready: '.pick-empty', mocks: PICK_MOCKS({ mine: Object.fromEntries(PICK_CARDS.map((c) => [c.key, -1])), members: [{ id: 1, name: 'Oliver', avatar: null, host: true, me: true, swiped: 4, done: true }, { id: 2, name: 'Ebba', avatar: null, host: false, me: false, swiped: 2, done: false }] }), after: 1200 },
  // vibes: the Moods row and a mood's page
  { name: 'vibes-row', path: '/', ready: '#discover-body .shelf', steps: ["const s = await __waitFor('.vibes-shelf', 20000); s.scrollIntoView({ block: 'center' }); await __sleep(800);"] },
  { name: 'vibes-page', path: '/', ready: '#discover-body .shelf', full: true, steps: ["await __click('.vibe-tile', 20000); await __waitFor('.vibe-grid .title-card', 30000); await __sleep(2500);"] },
  { name: 'discover-genres-open', path: '/', ready: '#discover-body .shelf', steps: ["await __click('.genres-toggle'); await __sleep(500);"] },
  { name: 'discover-genre', path: '/', ready: '#discover-body .shelf', steps: ["const t = document.querySelector('.genres-toggle'); if (t) { t.click(); await __sleep(300); } await __click('.genre-chips .chip:nth-child(4)'); await __waitFor('#discover-body .grid .title-card');"] },
  { name: 'discover-see-all', path: '/', ready: '#discover-body .shelf', steps: ["await __click('.see-all'); await __waitFor('#discover-body .grid .title-card');"] },
  { name: 'discover-docs', path: '/', ready: '#discover-body .shelf', steps: ["await __click('.discover-controls .segmented button:nth-child(4)'); await __sleep(3500);"] },
  { name: 'search', path: '/', ready: '#discover-body .shelf', steps: [typeSearch('house'), "await __waitFor('#search-layer .grid .title-card');"] },
  { name: 'search-empty', path: '/', ready: '#discover-body .shelf', steps: [typeSearch('zzqxjvwq'), "await __waitFor('#search-layer .notice, #search-layer .empty');"] },
  { name: 'title-film', path: '/', ready: '#discover-body .shelf', steps: [shelfCard('popular films|populära filmer'), sheetOpen], probe: lit },
  { name: 'title-film-more', path: '/', ready: '#discover-body .shelf', steps: [shelfCard('popular films|populära filmer'), sheetOpen, "const s = document.querySelector('#sheet'); s.scrollTo(0, s.scrollHeight); await __sleep(400);"] },
  { name: 'title-soon', path: '/', ready: '#discover-body .shelf', steps: ["const s = await __waitFor('.cs-card .title-card', 20000); s.scrollIntoView({ block: 'center' }); s.click();", sheetOpen, 'await __sleep(1500);'], probe: lit },
  { name: 'title-show', path: '/', ready: '#discover-body .shelf', steps: [shelfCard('popular shows|populära serier'), sheetOpen], probe: lit },
  { name: 'title-show-add', path: '/', ready: '#discover-body .shelf', steps: [shelfCard('popular shows|populära serier', 3), sheetOpen,
    "const b = document.querySelector('#sheet .title-bar .title-add'); if (b) { b.click(); await __sleep(1500); }"], probe: lit },

  { name: 'peek-hover', path: '/', ready: '#discover-body .shelf .title-card', sizes: ['desktop', 'tv'], steps: [
    "const c = [...document.querySelectorAll('#discover-body .shelf-items .title-card')].filter((b) => b._title)[2]; c.scrollIntoView({ block: 'center' }); await __sleep(400);",
    { mouse: 'peek card', fallback: "[...document.querySelectorAll('#discover-body .shelf-items .title-card')].filter((b) => b._title)[2]" }, "await __sleep(1400);"],
    probe: "return JSON.stringify({ hover: matchMedia('(hover: hover)').matches, fine: matchMedia('(pointer: fine)').matches, hovered: !!document.querySelector('.title-card:hover'), peek: document.querySelector('.peek')?.className });" },
  { name: 'peek-press', path: '/', ready: '#discover-body .shelf .title-card', sizes: ['phone', 'tablet'], steps: [
    "const c = [...document.querySelectorAll('#discover-body .shelf-items .title-card')].filter((b) => b._title)[1]; c.scrollIntoView({ block: 'center' }); await __sleep(300); const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: r.x + 20, clientY: r.y + 20 })); await __sleep(900);"],
    probe: "const p = document.querySelector('.peek'); return JSON.stringify({ hidden: p?.hidden, cls: p?.className, title: !!document.querySelector('#discover-body .shelf-items .title-card')?._title, n: document.querySelectorAll('.peek').length });" },

  { name: 'motion-check', path: '/', ready: '#discover-body .billboard', sizes: ['desktop'], steps: ["await __sleep(10500);"],
    probe: "const img = document.querySelector('.bb-slide.is-active .bb-img'); const active = [...document.querySelectorAll('.bb-bulb')].findIndex((b) => b.getAttribute('aria-current') === 'true'); return JSON.stringify({ slide: active, drift: getComputedStyle(img).animationName, trailer: !!document.querySelector('.bb-trailer'), viewAnim: getComputedStyle(document.querySelector('.view:not([hidden])')).animationName });" },

  // ---- Library ----
  { name: 'library', path: '/#library', ready: '.unified-library' , after: 1500 },
  { name: 'library-grid', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: ["document.querySelector('.unified-library .lib-group:not([hidden])').scrollIntoView(); window.scrollBy(0, -80); await __sleep(400);"] },
  { name: 'library-film', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: filmPage, probe: lit },
  { name: 'library-film-more', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, "await __click('#sheet .title-bar .row-more > summary'); await __sleep(500);"], probe: lit },
  { name: 'library-show', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [libraryCard('tv'), sheetOpen], probe: lit },
  { name: 'library-season', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [libraryCard('tv'), sheetOpen,
    "const se = document.querySelector('#sheet .season-chips .chip:last-child'); if (se) { se.click(); await __sleep(900); } const r = document.querySelector('#sheet .episode-list .ep'); r?.scrollIntoView({ block: 'center' }); await __sleep(500);"], probe: lit },
  { name: 'picker', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, "await __clickText('^(Play on TV|Spela på TV)$'); await __waitFor('#picker.open'); await __sleep(1500);"] },
  { name: 'delete', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, "await __clickText('^(Delete|Radera)$'); await __waitFor('#picker.open'); await __sleep(1200);"] },
  { name: 'travel', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, "await __clickText('^(To phone|Till telefonen)$'); await __waitFor('#picker.open'); await __sleep(1500);"] },

  // ---- Player (paused, so the controls stay up) ----
  { name: 'player', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, ...openPlayer] },
  { name: 'player-subs', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, ...openPlayer, menu('#cc-btn')] },
  { name: 'player-quality', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, ...openPlayer, menu('#quality-btn')] },
  { name: 'player-bedtime', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, ...openPlayer, menu('#night-btn')] },
  { name: 'player-audio', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [...filmPage, ...openPlayer, menu('#sync-btn')] },
  { name: 'player-help', path: '/#library', ready: '.unified-library .lib-group .title-card', sizes: ['desktop', 'tv'], steps: [...filmPage, ...openPlayer,
    "document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })); await __sleep(500);"] },

  // ---- Settings ----
  { name: 'ideas', path: '/#you/ideas', ready: '#idea-box', steps: ["document.querySelector('#idea-box').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); await __sleep(700);"] },
  // The shell (revamp 2): You's list (old #settings lands there), a You page, search's Go to, House and its pages
  { name: 'settings', path: '/#settings', ready: '#you-rows .lrow', full: true, after: 1200 },
  { name: 'you-watching', path: '/#you/watching', ready: '#you-page .set-row', full: true, after: 1200 },
  { name: 'you-devices', path: '/#you/devices', ready: '#you-page .set-group', full: true, after: 1500 },
  // You: the list with For you on top (wide screens: Overview beside it), your own lists, friends, moments
  { name: 'you-root', path: '/#you', ready: '#you-rows .set-group .set-hint', full: true, after: 1800 },
  { name: 'you-history', path: '/#you/history', ready: '#you-page .you-own', full: true, after: 1500 },
  { name: 'you-ratings', path: '/#you/ratings', ready: '#you-page .you-own', full: true, after: 1500 },
  { name: 'you-liked', path: '/#you/liked', ready: '#you-page .you-own', after: 1500 },
  { name: 'you-friends', path: '/#you/friends', ready: '#you-page .friends', full: true, after: 1500 },
  { name: 'you-moments', path: '/#you/moments', ready: '#you-page .set-group', full: true, after: 1500 },
  { name: 'you-account', path: '/#you/account', ready: '#you-page .set-group', after: 1200 },
  { name: 'you-friend-popup', path: '/#library', ready: '#picker .friend-asks', after: 1000, probe: "return 'You dot ' + document.querySelector('.tab[data-view=you] .tab-dot, #me-btn .tab-dot').textContent;" },
  { name: 'you-edit-profile', path: '/#you', ready: '#you-rows .set-group .set-hint', steps: ["await __clickText('Edit profile', '#view-you button'); await __waitFor('.pf-editor'); await __sleep(900);"] },
  // Navigation checks (the note in report.json): tab stacks, Back from a page, old addresses
  { name: 'nav-stack', path: '/#you/watching', ready: '#you-page .set-row', steps: ["document.querySelector('.tab[data-view=discover]').click(); await __sleep(500); document.querySelector(innerWidth < 900 ? '.tab[data-view=you]' : '#me-btn').click(); await __sleep(600); window.__a = location.hash; document.querySelector(innerWidth < 900 ? '.tab[data-view=you]' : '#me-btn').click(); await __sleep(600);"],
    probe: "return 'tab back to ' + __a + ', again ' + location.hash + ' (want #you/watching, #you)';" },
  { name: 'nav-back', path: '/#you', ready: '#you-rows .lrow', steps: ["await __click('#you-rows [data-route=\"you/devices\"]'); await __sleep(600); window.__a = location.hash; history.back(); await __sleep(700);"],
    probe: "return 'page ' + __a + ', after Back ' + location.hash + ', list shown ' + Boolean(document.querySelector('#you-list').offsetParent);" },
  { name: 'nav-legacy-ideas', path: '/?ideas=1#settings', ready: '#view-you:not([hidden]), #view-house:not([hidden])', after: 1500, probe: "return 'ideas link → ' + location.hash + ', idea box ' + Boolean(document.querySelector('#idea-box, [data-anchor=\"idea-inbox\"]'));" },
  { name: 'nav-legacy', path: '/?friends=1#settings', ready: '#view-you:not([hidden])', after: 1200, probe: "return 'friends link → ' + location.hash + location.search;" },
  { name: 'search-goto', path: '/#library', ready: '#view-library:not([hidden])', steps: [typeSearch('subtitles'), "await __waitFor('#search-layer .sr-row');"] },
  { name: 'search-open', path: '/#library', ready: '#view-library:not([hidden])', steps: ["const t = document.querySelector('#search-toggle'); if (t && t.offsetParent) t.click(); else document.querySelector('#q').focus(); await __sleep(500);"] },
  { name: 'whats-new', path: '/', ready: '#discover-body .shelf', whatsNew: true, after: 2500 },

  // ---- States ----
  { name: 'offline', path: '/', ready: '#discover-body .notice', mocks: { '^/api/status$': { __status: 503 } } },

  // ---- Owner screens and edge cases: a throwaway local server (--as owner@…, see README) ----
  { name: 'owner-library', path: '/#library', ready: '.unified-library .lib-group .title-card', after: 1500 },
  { name: 'owner-season-46', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [
    "const c = [...document.querySelectorAll('.unified-library .title-card')].find((b) => /One Piece/.test(b.textContent)); c.click();", sheetOpen,
    "const r = document.querySelectorAll('#sheet .episode-list .ep'); r[Math.min(30, r.length - 1)]?.scrollIntoView({ block: 'center' }); await __sleep(600);"] },
  { name: 'owner-long-title', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [
    "const c = [...document.querySelectorAll('.unified-library .title-card')].find((b) => /Jesse James/.test(b.textContent)); c.scrollIntoView({ block: 'center' }); await __sleep(400); c.click();", sheetOpen] },
  { name: 'owner-long-title-card', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [
    "const c = [...document.querySelectorAll('.unified-library .title-card')].find((b) => /Jesse James/.test(b.textContent)); c.scrollIntoView({ block: 'center' }); await __sleep(600);"] },
  { name: 'owner-downloads', path: '/#library', ready: '.unified-library', mocks: { '^/api/downloads': () => ({ items: MOCK_DOWNLOADS }) }, patch: DOWNLOADS_ON, after: 1500 },
  { name: 'owner-downloads-home', path: '/', ready: '#discover-body .shelf', mocks: { '^/api/downloads': () => ({ items: MOCK_DOWNLOADS }) }, patch: DOWNLOADS_ON, steps: ["document.querySelector('.home-shelf, .continue-shelf')?.scrollIntoView({ block: 'center' }); await __sleep(500);"] },
  { name: 'owner-download-title', path: '/#library', ready: '.unified-library .unified-card', mocks: { '^/api/downloads': () => ({ items: MOCK_DOWNLOADS }) }, patch: DOWNLOADS_ON,
    steps: ["const c = [...document.querySelectorAll('.unified-library .unified-card .title-card')].find((b) => /Dune/.test(b.textContent)); c.scrollIntoView({ block: 'center' }); c.click();", sheetOpen], probe: lit },
  { name: 'owner-downloads-only', path: '/#library', ready: '.unified-library', mocks: { '^/api/downloads': () => ({ items: MOCK_DOWNLOADS }) }, patch: DOWNLOADS_ON,
    steps: ["const s = document.querySelector('.library-availability select'); s.value = 'downloading'; s.dispatchEvent(new Event('change')); await __sleep(800);"] },
  { name: 'owner-library-empty', path: '/#library', ready: '.unified-library', mocks: { '^/api/library': { items: [], server: [], shows: [] }, '^/api/downloads': { items: [] } }, after: 1200 },
  { name: 'owner-ideas', path: '/#house/ideas', ready: '[data-anchor="idea-inbox"]', steps: ["document.querySelector('[data-anchor=\"idea-inbox\"]').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); await __sleep(700);"] },
  { name: 'owner-ideas-inbox', path: '/#house/ideas', ready: '.idea-filters', steps: ["document.querySelector('.idea-filters').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); await __sleep(700);"] },
  { name: 'owner-ideas-answer', path: '/#house/ideas', ready: '.idea-answer-open', steps: ["document.querySelector('.idea-answer-open').click(); await __sleep(400); document.querySelector('.idea-answer').scrollIntoView({ block: 'center' }); await __sleep(500);"] },
  { name: 'owner-settings', path: '/#settings', ready: '#you-rows .lrow', full: true, after: 1500 },
  { name: 'owner-people', path: '/#house/people', ready: '#house-body .person', full: true, after: 1500 },
  { name: 'owner-rules', path: '/#house/rules', ready: '#house-body .set-row', full: true, after: 1200 },
  { name: 'owner-machines', path: '/#house/machines', ready: '#house-body', full: true, after: 2000 },
  { name: 'owner-activity', path: '/#activity', ready: '#activity-body', full: true, after: 1500 },
  { name: 'owner-house', path: '/#house', ready: '#house-body', full: true, after: 2000 },
  { name: 'owner-house-needs', path: '/#house', ready: '#house-body .tool-grid', mocks: { '^/api/downloads': () => ({ items: MOCK_DOWNLOADS }) }, patch: DOWNLOADS_ON, full: true, after: 2000,
    probe: "return 'needs ' + document.querySelectorAll('#house-body .house-needs .lrow').length + ', dot ' + !document.querySelector('.tab[data-view=house] .tab-dot').hidden;" },
  { name: 'owner-clips', path: '/#clips', ready: '#clips-body', after: 1500 },
  { name: 'owner-notes', path: '/#notes', ready: '#notes-body', after: 1500 },
  { name: 'owner-notes-click', path: '/#notes', ready: '#notes-body .note-message', steps: ["document.querySelector('.note-draft')?.focus(); await __sleep(1200); document.querySelector('.note-draft')?.blur(); await __sleep(800);"],
    probe: "const app = document.querySelector('.notes-app'); return 'notes height ' + Math.round(app.getBoundingClientRect().height) + ' of ' + innerHeight;" },
  { name: 'owner-wrapped', path: '/#you', ready: '#you-rows .lrow', steps: ["await __clickText('(Wrapped)', '#you-rows button'); await __sleep(1800);"] },
  { name: 'owner-nowbar', path: '/', ready: '#discover-body .shelf', mocks: { '^/api/cast/sessions': { sessions: [MOCK_SESSION] } }, after: 1000 },
  { name: 'owner-remote', path: '/', ready: '#nowbar:not([hidden])', mocks: { '^/api/cast/sessions': { sessions: [MOCK_SESSION] }, '^/api/cast/living-room/status': { state: 'playing', position: 1260, duration: 6960, volume: 0.6 } }, steps: ["document.querySelector('#nowbar').click(); await __sleep(1500);"] },
  // Live + the Invite sheet (revamp 2, r2-C): Watch with someone, the guide's faces, each Invite context, People and
  // Live in search. Local server: a film called Arrival in everyone's library, a planned party, friends.
  { name: 'live', path: '/#live', ready: '#live-body .together .party-card', full: true, steps: [laterAsks] },
  { name: 'live-guide', path: '/#live', ready: '#live-body .guide-row', patch: GUIDE_FACES, steps: [laterAsks, "document.querySelector('.guide-scroll').scrollIntoView({ block: 'center' }); await __sleep(600);"] },
  { name: 'people-access', path: '/#house/people', ready: '#house-body .person', mocks: ACCESS, full: true, steps: [laterAsks] },
  { name: 'invite-lilin', path: '/#house/people', ready: '#house-body .person', mocks: ACCESS, steps: ["await __clickText('^(Invite someone|Bjud in någon)$', '#house-body button'); await __waitFor('#picker .invite-sheet .invite-make'); await __sleep(700);"] },
  { name: 'you-invite', path: '/#you/invite', ready: '#you-page .invite', after: 1500 },
  { name: 'friend-add', path: '/#you/friends', ready: '.friends-add', steps: ["await __click('.friends-add'); await __waitFor('#picker .invite-sheet .friends-find'); const i = document.querySelector('#picker .friends-search'); i.value = 'ma'; i.dispatchEvent(new Event('input')); await __sleep(900);"] },
  { name: 'room-ask', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [
    "const c = [...document.querySelectorAll('.unified-library .title-card')].find((b) => /^Arrival/.test(b.querySelector('.name')?.textContent || '')); c.click();", sheetOpen,
    "await __click('#sheet .title-bar [data-act=play]'); await __waitFor('#player:not([hidden])'); await __sleep(2500); document.querySelector('#video').pause();",
    "document.querySelector('#player').dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); await __sleep(300);",
    { mouse: '#watch-btn', click: true }, "await __sleep(2500);"] },
  { name: 'search-people', path: '/#library', ready: '#view-library:not([hidden])', steps: [typeSearch('ma'), "await __waitFor('#search-layer .sr-people .sr-row', 5000).catch(() => {}); await __sleep(500);"] },
  { name: 'search-live', path: '/#library', ready: '#view-library:not([hidden])', steps: ["document.querySelector('#search-toggle')?.offsetParent && document.querySelector('#search-toggle').click(); await __sleep(800);", typeSearch('fresh'), "await __sleep(800);"] },
  { name: 'owner-watch-room', path: '/#library', ready: '.unified-library .lib-group .title-card', steps: [
    "const c = [...document.querySelectorAll('.unified-library .title-card')].find((b) => /^Arrival/.test(b.querySelector('.name')?.textContent || '')); c.click();", sheetOpen,
    "await __click('#sheet .title-bar [data-act=play]'); await __waitFor('#player:not([hidden])'); await __sleep(2500); document.querySelector('#video').pause();",
    "document.querySelector('#player').dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); await __sleep(300);",
    { mouse: '#watch-btn', click: true }, "await __sleep(2500);"],
    probe: "return 'status: ' + document.querySelector('#watch-status')?.textContent;" },
  { name: 'password-gate', path: '/', ready: '#password-gate', probe: "return 'inert behind: ' + [...document.body.children].filter((e) => e.id !== 'password-gate').every((e) => e.inert);" },
  { name: 'oidc-signin', path: '/c/oidc/authorize?client_id=cloudflare&redirect_uri=https%3A%2F%2Fexample.test%2Fcdn-cgi%2Faccess%2Fcallback&response_type=code&scope=openid%20email%20profile&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256', ready: 'form', signedOut: true },
  { name: 'signin', path: '/signin', ready: 'form', signedOut: true },
  { name: 'signin-error', path: '/signin?error=wrong', ready: 'form', signedOut: true },
  { name: 'share-invite', path: `/c/i/${process.env.LIL_INVITE || 'x'}`, ready: 'body', signedOut: true },
  { name: 'share-clip', path: `/c/${process.env.LIL_CLIP || 'x'}`, ready: 'body', signedOut: true, after: 2500 },
  { name: 'share-watch', path: `/c/w/${process.env.LIL_ROOM || 'x'}`, ready: 'body', signedOut: true },

  // ---- End to end through the preview switch: /preview → Discover → a title → play → Watch Together → Settings → back to live.
  // Run without --preview (it goes through /preview itself) and with --allow-writes-to '^/api/watch' (the room is real, briefly).
  { name: 'e2e-preview', path: '/preview', ready: '#discover-body .billboard', sizes: ['phone', 'desktop'], steps: [
    "if (!document.querySelector('.preview-pill')) throw new Error('no preview pill after /preview');",
    "await __click('.bb-slide.is-active .btn-glass, .bb-slide .btn-glass'); await __waitFor('#sheet.open #sheet-title'); await __sleep(1200);",
    "history.back(); await __sleep(600);",
    "await __click('.tab[data-view=\"library\"]'); await __waitFor('.unified-library .lib-group .title-card');",
    libraryCard('movie'), sheetOpen,
    "await __click('#sheet .title-bar [data-act=play]'); await __waitFor('#player:not([hidden])'); await __sleep(4000); document.querySelector('#video').pause();",
    "await __click('#watch-btn'); await __waitFor('#watch-bar:not([hidden])'); await __sleep(1500);",
    "await __click('#watch-leave'); await __sleep(1200);",
    "await __click('#player-close'); await __sleep(800);",
    "await __click('.tab[data-view=\"settings\"]'); await __waitFor('#settings-body .set-group'); await __sleep(800);",
    "setTimeout(() => document.querySelector('.preview-pill').click(), 50); return 'leaving';",
    { wait: 5000 },
    "await __waitFor('#discover-body', 20000); await __sleep(2000); if (document.querySelector('.preview-pill') || document.querySelector('script[src=\"/billboard.js\"]') || document.querySelector('.billboard')) throw new Error('still in the preview'); if (document.cookie.includes('lilin_preview')) throw new Error('cookie still readable');",
  ], probe: "return 'back on live: ' + (document.querySelector('link[rel=icon]')?.getAttribute('href') || '').slice(0, 24);" },

  // ---- The Samsung TV app (public/tv) in a copy of its shell: --overlay a folder with tv-shell.html (see README) ----
  { name: 'tvapp-home', path: '/tv-shell.html', ready: '.row .card', sizes: ['tvapp'], storage: { 'lilin:tv-session': 'home' }, after: 2500 },
  { name: 'tvapp-home-down', path: '/tv-shell.html', ready: '.row .card', sizes: ['tvapp'], storage: { 'lilin:tv-session': 'home' }, steps: [{ keys: [40, 39, 39] }], after: 1500 },
  { name: 'tvapp-discover', path: '/tv-shell.html', ready: '.row .card', sizes: ['tvapp'], storage: { 'lilin:tv-session': 'home' }, steps: [{ keys: [38, 13], gap: 600 }, { wait: 4000 }, { keys: [40, 39], gap: 500 }], after: 2500 },
  { name: 'tvapp-title', path: '/tv-shell.html', ready: '.row .card', sizes: ['tvapp'], storage: { 'lilin:tv-session': 'home' }, steps: [{ keys: [38, 13], gap: 600 }, { wait: 4000 }, { keys: [40, 13], gap: 600 }, { wait: 3000 }], after: 2000 },
  { name: 'tvapp-show', path: '/tv-shell.html', ready: '.row .card', sizes: ['tvapp'], storage: { 'lilin:tv-session': 'home' }, steps: [{ keys: [40, 13], gap: 600 }, { wait: 3000 }], after: 2000 },
  { name: 'tvapp-pair', path: '/tv-shell.html', ready: '.pair', sizes: ['tvapp'], storage: { 'lilin:tv-session': '' }, after: 1500 },
];
