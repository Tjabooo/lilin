import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as reviews from '../src/reviews.js';
import * as profiles from '../src/profiles.js';
import * as friends from '../src/friends.js';
import * as lb from '../src/letterboxd.js';
import * as lists from '../src/lists.js';
import * as anime from '../src/anime-lists.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-anime-lists-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  reviews.initReviews();
  friends.initFriends();
  profiles.initProfiles();
  lb.initLetterboxd();
  lists.initLists();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  return { ebi: make('ebi@example.test', 'ebi'), anna: make('anna@example.test', 'Anna') };
}

const noProfile = async () => null; // no MAL profile page in tests (favourites)
const malRow = (o) => ({ status: 2, score: 0, is_rewatching: 0, num_watched_episodes: 12, anime_num_episodes: 12, updated_at: 1, anime_title: 'X',
  anime_url: '/anime/1/X', anime_image_path: 'https://cdn.myanimelist.net/r/192x272/images/anime/1/1.jpg', ...o });

test('usernames: plain names and pasted profile links, nothing else', () => {
  assert.equal(anime.cleanUsername(' @ebi_chan '), 'ebi_chan');
  assert.equal(anime.cleanUsername('https://myanimelist.net/profile/Xinil'), 'Xinil');
  assert.equal(anime.cleanUsername('https://anilist.co/user/Taluun/animelist'), 'Taluun');
  for (const bad of ['', 'a', 'x'.repeat(21), 'evil name', '../etc', '<b>']) assert.equal(anime.cleanUsername(bad), null, bad);
});

test('MyAnimeList: numbers, watching and finished, newest first, plan-to-watch left out', async () => {
  const rows = [
    malRow({ status: 1, anime_title: 'Frieren', num_watched_episodes: 5, anime_num_episodes: 28, score: 9, updated_at: 30 }),
    malRow({ status: 2, anime_title: 'Old', score: 7, updated_at: 10 }),
    malRow({ status: 2, anime_title: 'New', score: 8, updated_at: 20 }),
    malRow({ status: 6, anime_title: 'Plan', num_watched_episodes: 0, score: 0 }),
    malRow({ status: 2, anime_title: 'Evil', anime_image_path: 'https://evil.test/x.jpg', anime_url: '/anime/9/E' }),
  ];
  const pages = [];
  const got = await anime.readMal('ebi', { profile: noProfile, page: async (u, offset) => { pages.push(offset); return offset ? [] : rows; } });
  assert.deepEqual(pages, [0], 'a short page is the last one');
  assert.deepEqual(got.stats, { completed: 3, episodes: 41, days: null, mean: 8 });
  assert.equal(got.watching[0].title, 'Frieren');
  assert.equal(got.watching[0].progress, 5);
  assert.equal(got.watching[0].url, 'https://myanimelist.net/anime/1/X');
  assert.deepEqual(got.finished.map((e) => e.title), ['New', 'Old', 'Evil']);
  assert.equal(got.finished[2].cover, null, 'covers only from the site’s CDN');
});

test('link, show, sync and unlink; visitors only see lists that were read', async () => {
  const { ebi, anna } = setup();
  const good = { mal: async (u) => ({ username: u, stats: { completed: 2, episodes: 30, days: null, mean: 8 }, watching: [{ title: 'Frieren', cover: null, url: null, progress: 5, episodes: 28, score: null }], finished: [] }) };
  await assert.rejects(anime.link(ebi.id, 'mal', 'no spaces please', { readers: good }), /look like/);
  await assert.rejects(anime.link(ebi.id, 'kitsu', 'ebi', { readers: good }), /AniList or MyAnimeList/);
  const missing = { mal: async () => { throw Object.assign(new Error('There’s no MyAnimeList user by that name, or their list is private.'), { status: 400 }); } };
  await assert.rejects(anime.link(ebi.id, 'mal', 'typo', { readers: missing }), /no MyAnimeList user/);
  assert.equal(anime.linksOf(ebi.id).length, 0, 'a name that fails isn’t kept');

  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers: good, now: 1000 });
  const mine = profiles.view(ebi, ebi).anime;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].url, 'https://myanimelist.net/animelist/ebi_chan');
  assert.equal(mine[0].watching[0].title, 'Frieren');
  assert.equal(mine[0].syncedAt, 1000);

  // a failed check keeps the last good copy for others, and tells the owner
  await assert.rejects(anime.sync(ebi.id, 'mal', { readers: missing, now: 2000 }));
  assert.match(profiles.view(ebi, ebi).anime[0].error, /no MyAnimeList user/);
  assert.equal(profiles.view(ebi, ebi).anime[0].stats.completed, 2);

  // Anna sees it once the page is public; the Anime section switched off keeps the link but not the list
  profiles.save(ebi, { visibility: 'public' });
  const seen = profiles.view(anna, ebi).anime[0];
  assert.equal(seen.error, undefined, 'why it failed is the owner’s business');
  assert.equal(seen.watching.length, 1);
  profiles.save(ebi, { sections: profiles.view(ebi, ebi).sections.map((s) => ({ ...s, on: s.id !== 'anime' })) });
  const off = profiles.view(anna, ebi).anime[0];
  assert.equal(off.url, 'https://myanimelist.net/animelist/ebi_chan');
  assert.deepEqual([off.stats, off.watching], [null, []]);

  // syncRound skips fresh ones
  let reads = 0;
  const counting = { mal: async (u) => { reads++; return good.mal(u); } };
  await anime.syncRound({ readers: counting, now: 2000 + anime.SYNC_EVERY - 1 });
  assert.equal(reads, 0);
  await anime.syncRound({ readers: counting, now: 2000 + anime.SYNC_EVERY });
  assert.equal(reads, 1);

  anime.unlink(ebi.id, 'mal');
  assert.deepEqual(profiles.view(ebi, ebi).anime, []);
});

test('the Anime section slots in after Taste match on profiles saved before it', () => {
  const s = profiles.cleanSections(['favorites', 'recent', 'stats', 'ratings', 'match', 'reviews', 'lists', 'liked', 'friends']);
  assert.deepEqual(s.map((x) => x.id).slice(4, 7), ['match', 'anime', 'reviews']);
  assert.equal(s.find((x) => x.id === 'anime').on, true);
});

test('Show my full list: MyAnimeList statuses, kept only while it is on', async () => {
  const rows = [malRow({ anime_title: 'Frieren', status: 1, updated_at: 30 }), malRow({ anime_title: 'Mononoke', status: 2, score: 9, updated_at: 20 }),
    malRow({ anime_title: 'Monster', status: 3 }), malRow({ anime_title: 'Bleach', status: 4 }), malRow({ anime_title: 'Lain', status: 6 }),
    malRow({ anime_title: 'Eva', status: 2, is_rewatching: 1, updated_at: 40 })];
  const got = await anime.readMal('ebi', { profile: noProfile, page: async () => rows, full: true });
  assert.deepEqual(got.full.map((e) => [e.t, e.st]), [['Eva', 'watching'], ['Frieren', 'watching'], ['Mononoke', 'completed'], ['Monster', 'paused'], ['Bleach', 'dropped'], ['Lain', 'planning']]);
  assert.equal(got.full[2].s, 9);
  assert.equal((await anime.readMal('ebi', { profile: noProfile, page: async () => rows })).full, null, 'not asked = not read');

  const { ebi } = setup();
  let asked = null;
  const readers = { mal: async (u, o = {}) => { asked = o.full; return anime.readMal(u, { profile: noProfile, page: async () => rows, full: o.full }); } };
  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers });
  assert.equal(anime.fullListOf(ebi.id, 'mal'), null, 'off by default');
  assert.equal(profiles.view(ebi, ebi).anime[0].fullCount, 0);
  await anime.setShowFull(ebi.id, 'mal', true, { readers });
  assert.equal(asked, true);
  assert.equal(anime.fullListOf(ebi.id, 'mal').entries.length, 6);
  assert.equal(profiles.view(ebi, ebi).anime[0].fullCount, 6);
  assert.equal(profiles.view(ebi, ebi).anime[0].showFull, true);
  await anime.setShowFull(ebi.id, 'mal', false, { readers });
  assert.equal(anime.fullListOf(ebi.id, 'mal'), null, 'off forgets it');
  await assert.rejects(anime.setShowFull(ebi.id, 'anilist', true, { readers }), /No AniList/);
});

test('anime map: MyAnimeList and AniList entries carry the Lilin title they are, when the map knows it', async () => {
  const map = await import('../src/anime-map.js');
  map.use(map.compact([
    { mal_id: 19, anilist_id: 19, themoviedb_id: { tv: 30981 } }, // Monster
    { mal_id: 25777, anilist_id: 20958, themoviedb_id: { tv: 1429 } }, // a sequel season maps to the show
    { mal_id: 199, anilist_id: 199, themoviedb_id: { movie: 129 } },
    { mal_id: 5, anilist_id: 5 }, // no TMDB id: not kept
  ]));
  assert.equal(map.keyOf('https://myanimelist.net/anime/19/Monster'), 'tv:30981');
  assert.equal(map.keyOf('https://anilist.co/anime/20958/'), 'tv:1429');
  assert.equal(map.keyOf('https://anilist.co/anime/199'), 'movie:129');
  assert.equal(map.keyOf('https://myanimelist.net/anime/5/Bebop'), null);
  assert.equal(map.keyOf('https://myanimelist.net/manga/19/Monster'), null);
  assert.equal(map.keyOf('https://evil.test/anime/19/'), null);

  const { ebi } = setup();
  const read = { mal: async (u, { full } = {}) => ({ username: u, stats: { completed: 1, episodes: 74, days: null, mean: 9 },
    watching: [], finished: [{ title: 'Monster', cover: null, url: 'https://myanimelist.net/anime/19/Monster', progress: 74, episodes: 74, score: 9 }, { title: 'Bebop', cover: null, url: 'https://myanimelist.net/anime/5/Bebop', progress: 26, episodes: 26, score: 8 }],
    full: full ? [{ t: 'Monster', c: null, u: 'https://myanimelist.net/anime/19/Monster', p: 74, e: 74, s: 9, st: 'completed', at: 1 }] : null }) };
  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers: read });
  const [a] = profiles.view(ebi, ebi).anime;
  assert.deepEqual(a.finished.map((e) => e.key || null), ['tv:30981', null]);
  await anime.setShowFull(ebi.id, 'mal', true, { readers: read });
  assert.equal(anime.fullListOf(ebi.id, 'mal').entries[0].key, 'tv:30981');
});

test('favourites: read from AniList and the MAL profile page, kept when the page fails, mapped to Lilin titles', async () => {
  const html = `<div id="anime_favorites"><ul class="fav-slide">
    <li class="btn-fav" title="Monster"><a href="https://myanimelist.net/anime/19/Monster" class="link"><span class="users">TV&middot;2004</span>
      <img src="https://cdn.myanimelist.net/images/spacer.gif" data-src="https://cdn.myanimelist.net/r/140x220/images/anime/10/18793.jpg?s=abc" class="image lazyload"></a></li>
    <li class="btn-fav" title="Tom &amp; Jerry&#039;s"><a href="https://myanimelist.net/anime/5/X"><img data-src="https://evil.test/x.jpg"></a></li>
  </ul></div><ul id="manga_favorites"><li title="Berserk"><a href="https://myanimelist.net/manga/2/Berserk"></a></li></ul>`;
  const favs = anime.malFavoritesOf(html);
  assert.deepEqual(favs.map((e) => [e.title, e.url, e.cover]), [
    ['Monster', 'https://myanimelist.net/anime/19/Monster', 'https://cdn.myanimelist.net/images/anime/10/18793.jpg'],
    ["Tom & Jerry's", 'https://myanimelist.net/anime/5/X', null],
  ]);
  assert.deepEqual(anime.malFavoritesOf('<html>no favourites</html>'), []);
  const mal = await anime.readMal('ebi', { page: async () => [malRow({})], profile: async () => html });
  assert.equal(mal.favorites.length, 2);
  assert.equal((await anime.readMal('ebi', { page: async () => [malRow({})], profile: noProfile })).favorites, null, 'page not read: null');

  const al = await anime.readAnilist('ebi', { query: async () => ({ User: { name: 'ebi', statistics: { anime: {} },
    favourites: { anime: { nodes: [{ siteUrl: 'https://anilist.co/anime/19', episodes: 74, title: { userPreferred: 'Monster' }, coverImage: { large: 'https://s4.anilist.co/x.png' } }] } } } }) });
  assert.deepEqual(al.favorites.map((e) => e.title), ['Monster']);

  const map = await import('../src/anime-map.js');
  map.use(map.compact([{ mal_id: 19, anilist_id: 19, themoviedb_id: { tv: 30981 } }]));
  const { ebi } = setup();
  let page = html;
  const readers = { mal: (u) => anime.readMal(u, { page: async () => [malRow({})], profile: async () => page }) };
  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers });
  assert.deepEqual(profiles.view(ebi, ebi).anime[0].favorites.map((e) => e.key || null), ['tv:30981', null]);
  page = null; // the profile page didn't answer: the favourites stay
  await anime.sync(ebi.id, 'mal', { readers });
  assert.equal(profiles.view(ebi, ebi).anime[0].favorites.length, 2);
  page = '<p>no favourites now</p>';
  await anime.sync(ebi.id, 'mal', { readers });
  assert.equal(profiles.view(ebi, ebi).anime[0].favorites.length, 0, 'emptied on the site: empty here');
});

test('parts switched off: visitors get none of them, the owner still gets everything', async () => {
  const { ebi, anna } = setup();
  const fav = { title: 'Monster', cover: null, url: 'https://myanimelist.net/anime/19/Monster', progress: null, episodes: null, score: null };
  const readers = { mal: async (u) => ({ username: u, stats: { completed: 3, episodes: 74, days: null, mean: 9 }, favorites: [fav],
    watching: [{ ...fav, title: 'Frieren' }], finished: [{ ...fav, title: 'Bebop' }] }) };
  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers });
  assert.deepEqual(anime.hiddenOf(ebi.id), []);
  assert.deepEqual(anime.setHidden(ebi.id, ['favorites', 'stats', 'nonsense']), ['favorites', 'stats']);
  const seen = anime.viewOf(ebi.id)[0];
  assert.deepEqual([seen.favorites, seen.stats, seen.watching.length, seen.finished.length], [[], {}, 1, 1]);
  assert.deepEqual(seen.hidden, ['favorites', 'stats']);
  const mine = anime.viewOf(ebi.id, { self: true })[0];
  assert.equal(mine.favorites.length, 1, 'the owner keeps them for the favourites picker');
  assert.equal(mine.stats.completed, 3);
  anime.setHidden(ebi.id, []);
  assert.equal(anime.viewOf(ebi.id)[0].favorites.length, 1);
});

test('favourites give a thumbs up once, never over a rating they gave on Lilin', async () => {
  const social = await import('../src/social.js');
  const map = await import('../src/anime-map.js');
  map.use(map.compact([{ mal_id: 19, themoviedb_id: { tv: 30981 } }, { mal_id: 1, themoviedb_id: { tv: 30991 } }, { mal_id: 6, themoviedb_id: { tv: 1000 } }]));
  const { ebi } = setup();
  social.rate(ebi.id, 'tv:30991', -1);
  const favs = [['Monster', 19], ['Cowboy Bebop', 1], ['Unknown', 999]].map(([title, id]) => ({ title, url: `https://myanimelist.net/anime/${id}/x` }));
  let list = favs;
  const readers = { mal: async (u) => ({ username: u, stats: { completed: 1, episodes: 1, days: null, mean: 0 }, watching: [], finished: [], favorites: list }) };
  await anime.link(ebi.id, 'mal', 'ebi_chan', { readers });
  assert.deepEqual([...social.likedKeys(ebi.id)], ['tv:30981'], 'Monster liked, Bebop keeps its thumbs down, unknown skipped');
  assert.ok(social.dislikedKeys(ebi.id).has('tv:30991'));
  social.rate(ebi.id, 'tv:30981', 0); // took the thumb off on Lilin
  list = [...favs, { title: 'Trigun', url: 'https://myanimelist.net/anime/6/Trigun' }];
  await anime.sync(ebi.id, 'mal', { readers });
  assert.deepEqual([...social.likedKeys(ebi.id)].sort(), ['tv:1000'], 'the removed thumb stays off; a new favourite is liked');
});
