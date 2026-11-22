import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as accounts from '../src/accounts.js';
import * as reviews from '../src/reviews.js';
import * as profiles from '../src/profiles.js';
import * as friends from '../src/friends.js';
import * as lb from '../src/letterboxd.js';
import * as lists from '../src/lists.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-letterboxd-'));
  accounts.initAccounts({ dataDir: dir, adminEmails: [], mediaDir: null });
  reviews.initReviews();
  friends.initFriends();
  profiles.initProfiles();
  lb.initLetterboxd();
  lists.initLists();
  const make = (email, name) => accounts.updateMe(accounts.userFor({ headers: { 'cf-access-authenticated-user-email': email } }), { name });
  return { anna: make('anna@example.test', 'Anna') };
}

const item = ({ kind = 'watch', n, title, year, tmdb, day, rating, rewatch = 'No', like = 'No', body = `<p>Watched on Monday October 5, 2026.</p>` }) => `
  <item><title>${title}, ${year}</title><link>https://letterboxd.com/someone/film/x/</link>
  <guid isPermaLink="false">letterboxd-${kind}-${n}</guid><pubDate>Tue, 06 Oct 2026 10:00:00 +1300</pubDate>
  <letterboxd:watchedDate>${day}</letterboxd:watchedDate><letterboxd:rewatch>${rewatch}</letterboxd:rewatch>
  <letterboxd:filmTitle>${title}</letterboxd:filmTitle><letterboxd:filmYear>${year}</letterboxd:filmYear>
  ${rating != null ? `<letterboxd:memberRating>${rating}</letterboxd:memberRating>` : ''}<letterboxd:memberLike>${like}</letterboxd:memberLike>
  <tmdb:movieId>${tmdb}</tmdb:movieId>
  <description><![CDATA[ <p><img src="https://a.ltrbxd.com/x.jpg"/></p> ${body} ]]></description></item>`;
const feed = (...items) => `<?xml version='1.0' encoding='utf-8'?><rss version="2.0"><channel><title>Letterboxd - someone</title>${items.join('')}</channel></rss>`;

test('letterboxd: usernames and the feed are read', () => {
  assert.equal(lb.cleanUsername('https://letterboxd.com/some_one/films/'), 'some_one');
  assert.equal(lb.cleanUsername('@someone'), 'someone');
  assert.equal(lb.cleanUsername('no spaces'), null);
  const entries = lb.parseFeed(feed(
    item({ n: 1, title: 'Heat', year: 1995, tmdb: 949, day: '2026-10-05', rating: '4.5', rewatch: 'Yes' }),
    item({ kind: 'review', n: 2, title: 'Tom &amp; Jerry', year: 2021, tmdb: 587807, day: '2026-10-04', rating: '2.0',
      body: '<p><em>This review may contain spoilers.</em></p><p>Not great.<br/>Cat &amp; mouse.</p>' })));
  assert.equal(entries.length, 2);
  assert.deepEqual([entries[0].key, entries[0].rating, entries[0].rewatch, entries[0].review], ['movie:949', 4.5, true, '']);
  assert.equal(entries[1].title, 'Tom & Jerry');
  assert.equal(entries[1].review, 'Not great.\nCat & mouse.');
  assert.equal(entries[1].spoiler, true);
});

test('letterboxd: a feed fills the diary, stars and thumbs, never over Lilin’s own', async () => {
  const { anna } = setup();
  lb.setLink(anna.id, 'someone');
  reviews.save(anna.id, 'movie:603', { stars: 1, text: 'Mine.' }); // written in Lilin first
  const xml = feed(
    item({ n: 1, title: 'Heat', year: 1995, tmdb: 949, day: '2026-10-05', rating: '3.5', rewatch: 'Yes' }),
    item({ n: 2, title: 'The Matrix', year: 1999, tmdb: 603, day: '2026-10-03', rating: '5.0' }),
    item({ n: 3, title: 'Alien', year: 1979, tmdb: 348, day: '2026-10-01', like: 'Yes' }));
  await lb.sync(anna.id, { fetchFeed: async () => xml });
  assert.equal(reviews.reviewOf(anna.id, 'movie:949').stars, 3.5, 'half stars kept');
  assert.equal(reviews.reviewOf(anna.id, 'movie:603').text, 'Mine.', 'own review kept');
  assert.equal(reviews.reviewOf(anna.id, 'movie:603').stars, 1);
  const thumbs = Object.fromEntries(accounts.database().prepare('SELECT title_key, value FROM ratings WHERE user_id = ?').all(anna.id).map((r) => [r.title_key, r.value]));
  assert.equal(thumbs['movie:949'], undefined, '3½ stars alone is no like (only 5 is)');
  assert.equal(thumbs['movie:348'], 1, 'a heart without stars is a thumbs up');
  assert.equal(thumbs['movie:603'], -1, 'own 1-star thumb kept');
  const d = profiles.diary(anna.id);
  assert.deepEqual(d.entries.map((e) => e.key), ['movie:949', 'movie:603', 'movie:348']);
  assert.ok(d.entries[0].letterboxd && d.entries[0].rewatch);
  assert.equal(profiles.stats(anna.id).films, 3);
  assert.equal(profiles.view(anna, anna).letterboxd.username, 'someone');

  // A later feed changes the stars the import wrote; a review edited in Lilin since stays.
  reviews.save(anna.id, 'movie:949', { stars: 2, text: 'Changed my mind.' });
  await lb.sync(anna.id, { fetchFeed: async () => feed(item({ n: 1, title: 'Heat', year: 1995, tmdb: 949, day: '2026-10-05', rating: '5.0' }), item({ n: 4, title: 'Up', year: 2009, tmdb: 14160, day: '2026-10-07', rating: '4.0' })) });
  assert.equal(reviews.reviewOf(anna.id, 'movie:949').stars, 2);
  assert.equal(reviews.reviewOf(anna.id, 'movie:14160').stars, 4);

  // A like the import wrote for 5 stars goes when Letterboxd drops to 4½ (no heart); a heart's like stays.
  const like = (key) => accounts.database().prepare('SELECT value FROM ratings WHERE user_id = ? AND title_key = ?').get(anna.id, key)?.value;
  await lb.sync(anna.id, { fetchFeed: async () => feed(item({ n: 5, title: 'Jaws', year: 1975, tmdb: 578, day: '2026-10-08', rating: '5.0' })) });
  assert.equal(like('movie:578'), 1);
  await lb.sync(anna.id, { fetchFeed: async () => feed(item({ n: 6, title: 'Jaws', year: 1975, tmdb: 578, day: '2026-10-09', rating: '4.5' })) });
  assert.equal(like('movie:578'), undefined, '4½ stars from Letterboxd is no like');
  assert.equal(like('movie:348'), 1, 'the heart stays');

  // Unlinking takes the diary out and what the import wrote, not what Anna wrote herself.
  lb.unlink(anna.id);
  assert.equal(profiles.diary(anna.id).entries.length, 0);
  assert.equal(reviews.reviewOf(anna.id, 'movie:14160'), null);
  assert.equal(reviews.reviewOf(anna.id, 'movie:949').text, 'Changed my mind.');
  assert.equal(profiles.view(anna, anna).letterboxd.linked, false);
});

// A minimal zip (deflated entries) like Letterboxd's export.
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), packed = zlib.deflateRawSync(data), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, packed); centrals.push(central, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('letterboxd: the export brings the whole history and the top four', async () => {
  const { anna } = setup();
  const buf = zip({
    'profile.csv': 'Date Joined,Username,Favorite Films\n2020-01-01,someone,"https://boxd.it/a, https://boxd.it/b"\n',
    'watched.csv': 'Date,Name,Year,Letterboxd URI\n2020-02-01,Heat,1995,https://boxd.it/a\n2020-02-01,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/b\n2020-02-01,Old Thing,1950,https://boxd.it/c\n',
    'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2020-02-01,Old Thing,1950,https://boxd.it/c,1.5\n',
    'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2021-03-04,Heat,1995,https://boxd.it/d1,5,,,2021-03-03\n',
    'reviews.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2021-03-04,Heat,1995,https://boxd.it/r1,5,,"So good, ""really"".",,2021-03-03\n',
    'deleted/diary.csv': 'Date,Name,Year\n2020-01-01,Gone,2000\n',
  });
  const ex = lb.parseExport(buf);
  assert.equal(ex.username, 'someone');
  assert.deepEqual(ex.favorites.map((f) => f.title), ['Heat', 'Crouching Tiger, Hidden Dragon']);
  const ids = { Heat: 949, 'Crouching Tiger, Hidden Dragon': 146, 'Old Thing': null };
  const out = await lb.importExport(anna.id, buf, { findFilm: async (f) => (ids[f.title] ? `movie:${ids[f.title]}` : null) });
  assert.deepEqual([out.films, out.missed, out.favorites], [2, 1, ['movie:949', 'movie:146']]);
  assert.equal(reviews.reviewOf(anna.id, 'movie:949').text, 'So good, "really".');
  assert.equal(reviews.reviewOf(anna.id, 'movie:949').stars, 5);
  assert.deepEqual(profiles.diary(anna.id).entries.map((e) => [e.key, e.day]), [['movie:949', '2021-03-03']], 'only dated films in the diary');
  assert.equal(profiles.stats(anna.id).films, 2, 'watched-only films still count');
  assert.throws(() => lb.parseExport(Buffer.from('nope')), /export/);
});

test('letterboxd: the feed’s TMDB id beats a same-named export match, one watch per day', async () => {
  const { anna } = setup();
  lb.setLink(anna.id, 'someone');
  const buf = zip({
    'profile.csv': 'Date Joined,Username,Favorite Films\n2020-01-01,someone,\n',
    'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-11-19,Obsession,2025,https://boxd.it/x1,3.5,,,2026-11-19\n',
  });
  // Export first, matched by name to the short film; then the feed brings the real id.
  await lb.importExport(anna.id, buf, { findFilm: async () => 'movie:2' });
  assert.equal(reviews.reviewOf(anna.id, 'movie:2').stars, 3.5);
  await lb.sync(anna.id, { fetchFeed: async () => feed(item({ n: 9, title: 'Obsession', year: 2025, tmdb: 1, day: '2026-11-19', rating: '3.5' })) });
  assert.equal(reviews.reviewOf(anna.id, 'movie:2'), null, 'the wrong match is taken back');
  assert.equal(reviews.reviewOf(anna.id, 'movie:1').stars, 3.5);
  assert.deepEqual(profiles.diary(anna.id).entries.map((e) => [e.key, e.day]), [['movie:1', '2026-11-19']]);
  // A later export uses the feed's id straight away.
  let asked = 0;
  await lb.importExport(anna.id, buf, { findFilm: async () => { asked++; return 'movie:2'; } });
  assert.equal(asked, 0);
  assert.equal(reviews.reviewOf(anna.id, 'movie:2'), null);
});
