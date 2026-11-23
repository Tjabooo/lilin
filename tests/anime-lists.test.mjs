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
  const got = await anime.readMal('ebi', { page: async (u, offset) => { pages.push(offset); return offset ? [] : rows; } });
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
