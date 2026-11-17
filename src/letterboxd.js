// Letterboxd: link a Letterboxd account to a Lilin profile. What someone logs there shows up here:
// diary lines on their profile (with Letterboxd's exact half stars), their stars, likes and reviews on
// the title pages, and the films count as watched.
//
// Two ways in, both optional:
//   - the public RSS feed (letterboxd.com/USER/rss/): the latest ~50 diary entries and reviews, with TMDB
//     ids. Linking reads it right away and then every few hours, so new logs arrive by themselves.
//   - Letterboxd's own data export (Settings → Data → Export your data): a zip of CSV files with the whole
//     history and the four favourites, but no TMDB ids, so every film is looked up by name and year.
// Letterboxd's profile pages refuse servers, and Lilin doesn't try to get past that: the feed and the
// export are the two things Letterboxd hands out on purpose.
//
// Lilin's own stars, thumbs and reviews always win. The import only writes a review or a thumb where the
// person has none for that title, or where the one there is still exactly what the import wrote last time
// (letterboxd_wrote remembers it), so a review edited in Lilin is never overwritten. Unlinking takes the
// imported diary out again, and the reviews and thumbs nobody changed since.
import zlib from 'node:zlib';
import { database } from './accounts.js';

export const USERNAME = /^[A-Za-z0-9_]{2,15}$/;
export const SYNC_EVERY = 3 * 3600 * 1000;
const MAX_TEXT = 2000;                   // reviews.js MAX_TEXT
const MAX_ZIP = 25 * 1024 * 1024;
const MAX_UNZIPPED = 60 * 1024 * 1024;

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
// node:sqlite has no transaction helper: run fn between BEGIN and COMMIT (nested calls join the outer one).
let depth = 0;
function tx(fn) {
  if (depth) return fn();
  depth++;
  db().exec('BEGIN');
  try { const out = fn(); db().exec('COMMIT'); return out; } catch (e) { db().exec('ROLLBACK'); throw e; } finally { depth--; }
}

export function initLetterboxd() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS letterboxd_links (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      linked_at INTEGER NOT NULL,
      synced_at INTEGER,
      error TEXT,
      imported_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS letterboxd_log (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title_key TEXT,
      title TEXT NOT NULL,
      year INTEGER,
      day TEXT,
      at INTEGER NOT NULL,
      rating REAL,
      rewatch INTEGER NOT NULL DEFAULT 0,
      liked INTEGER NOT NULL DEFAULT 0,
      review TEXT NOT NULL DEFAULT '',
      spoiler INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS letterboxd_log_key ON letterboxd_log(user_id, title_key);
    CREATE TABLE IF NOT EXISTS letterboxd_wrote (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      stars INTEGER,
      text TEXT NOT NULL DEFAULT '',
      thumb INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, title_key)
    );
  `);
}

// "ebicat", "@ebicat" or a pasted profile link → "ebicat"; null when it can't be a Letterboxd username.
export function cleanUsername(raw) {
  let s = String(raw ?? '').trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, '');
  return USERNAME.test(s) ? s : null;
}

// ---------- reading the feed ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENTITIES[e.toLowerCase()] ?? all;
});
const tag = (item, name) => {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return null;
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};
const yes = (v) => /^yes$/i.test(String(v || '').trim());
const rating = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.5 && n <= 5 ? Math.round(n * 2) / 2 : null;
};

// The review text in a feed item's description: paragraphs as text, without the poster, the "Watched on"
// line or the spoiler warning.
export function reviewText(html) {
  const paras = [...String(html || '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const text = paras
    .map((p) => decode(p.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p && !/^Watched on \w+ \w+ \d{1,2}, \d{4}\.?$/.test(p) && !/^This review may contain spoilers\.?$/i.test(p));
  return text.join('\n\n').slice(0, MAX_TEXT).trim();
}

// Feed items → { id, key, title, year, day, at, rating, rewatch, liked, review, spoiler }. Lists and
// anything without a film are left out.
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const guid = tag(item, 'guid') || '';
    const kind = (guid.match(/^letterboxd-(watch|review)-\d+$/) || [])[1];
    if (!kind) continue;
    const movie = tag(item, 'tmdb:movieId');
    const tv = tag(item, 'tmdb:tvId');
    const id = movie || tv;
    const title = decode(tag(item, 'letterboxd:filmTitle') || '').trim();
    if (!title) continue;
    const day = tag(item, 'letterboxd:watchedDate');
    const pub = Date.parse(tag(item, 'pubDate') || '');
    const description = tag(item, 'description') || '';
    out.push({
      id: guid,
      key: /^\d{1,9}$/.test(id || '') ? `${movie ? 'movie' : 'tv'}:${Number(id)}` : null,
      title: title.slice(0, 200),
      year: Number(tag(item, 'letterboxd:filmYear')) || null,
      day: /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : null,
      at: Number.isFinite(pub) ? pub : Date.now(),
      rating: rating(tag(item, 'letterboxd:memberRating')),
      rewatch: yes(tag(item, 'letterboxd:rewatch')),
      liked: yes(tag(item, 'letterboxd:memberLike')),
      review: kind === 'review' ? reviewText(description) : '',
      spoiler: kind === 'review' && (/\(contains spoilers\)/i.test(tag(item, 'title') || '') || /This review may contain spoilers/i.test(description)),
    });
  }
  return out;
}

// ---------- reading the export ----------
// The CSV files of a zip (stored or deflated), by name. Anything else in it is skipped.
export function unzipCsv(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.length > MAX_ZIP) throw fail(400, 'That isn’t a Letterboxd export (.zip).');
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw fail(400, 'That isn’t a Letterboxd export (.zip).');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = new Map();
  let total = 0;
  for (let n = 0; n < count && at + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8').toLowerCase();
    at += 46 + nameLen + extraLen + commentLen;
    // Only the export's own files: deleted/ and orphaned/ hold things the person threw away.
    if (!/^(diary|ratings|reviews|watched|profile)\.csv$|^likes\/films\.csv$/.test(name)) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    total += size;
    if (total > MAX_UNZIPPED) throw fail(400, 'That export is too big.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const compressed = buf.subarray(start, start + packed);
    let data;
    try { data = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: MAX_UNZIPPED }) : null; } catch { data = null; }
    if (data) files.set(name, data.toString('utf8'));
  }
  return files;
}

// RFC 4180 CSV → objects keyed by the header row.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}

const dayOf = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null);
const filmOf = (r) => ({ title: String(r.Name || '').slice(0, 200), year: Number(r.Year) || null });
const filmId = (f) => `${f.title.toLowerCase()}|${f.year || ''}`;

// The export's files → { username, favorites: [film], entries: [...] } where a film is { title, year } and
// entries look like the feed's but carry { film } instead of a key (the server finds the TMDB id).
export function parseExport(buf) {
  const files = unzipCsv(buf);
  if (!files.has('diary.csv') && !files.has('watched.csv') && !files.has('ratings.csv')) throw fail(400, 'That zip has no Letterboxd files in it. Use the export from Letterboxd → Settings → Data.');
  const csv = (name) => (files.has(name) ? parseCsv(files.get(name)) : []);
  const profile = csv('profile.csv')[0] || {};
  const byUri = new Map(); // film page links → the film (diary.csv's links are to diary entries, not films)
  const ratings = new Map(), likes = new Set();
  for (const r of csv('watched.csv')) if (r.Name) byUri.set(r['Letterboxd URI'], filmOf(r));
  for (const r of csv('ratings.csv')) if (r.Name) { const f = filmOf(r); byUri.set(r['Letterboxd URI'], f); const v = rating(r.Rating); if (v) ratings.set(filmId(f), v); }
  for (const r of csv('likes/films.csv')) if (r.Name) { const f = filmOf(r); byUri.set(r['Letterboxd URI'], f); likes.add(filmId(f)); }
  const entries = [];
  const logged = new Set();
  const reviews = new Map(); // film|day → review row
  for (const r of csv('reviews.csv')) if (r.Name) reviews.set(`${filmId(filmOf(r))}|${dayOf(r['Watched Date']) || dayOf(r.Date) || ''}`, r);
  for (const r of csv('diary.csv')) {
    if (!r.Name) continue;
    const film = filmOf(r);
    const day = dayOf(r['Watched Date']) || dayOf(r.Date);
    const review = reviews.get(`${filmId(film)}|${day || ''}`);
    if (review) reviews.delete(`${filmId(film)}|${day || ''}`);
    logged.add(filmId(film));
    entries.push({ id: `diary:${r['Letterboxd URI'] || `${filmId(film)}|${day}`}`, film, title: film.title, year: film.year, day, at: day ? Date.parse(`${day}T20:00:00Z`) : Date.now(),
      rating: rating(r.Rating), rewatch: yes(r.Rewatch), liked: likes.has(filmId(film)),
      review: review ? String(review.Review || '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT).trim() : '', spoiler: false });
  }
  // Reviews without a diary entry, then films only marked watched or rated: no day, so they count as
  // watched and carry stars, but stay out of the diary.
  for (const r of reviews.values()) {
    const film = filmOf(r);
    logged.add(filmId(film));
    const day = dayOf(r['Watched Date']);
    entries.push({ id: `review:${r['Letterboxd URI'] || filmId(film)}`, film, title: film.title, year: film.year, day, at: Date.parse(`${dayOf(r.Date) || day || '2000-01-01'}T20:00:00Z`),
      rating: rating(r.Rating), rewatch: yes(r.Rewatch), liked: likes.has(filmId(film)), review: String(r.Review || '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT).trim(), spoiler: false });
  }
  const seen = new Set();
  for (const f of [...byUri.values()]) {
    const id = filmId(f);
    if (logged.has(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id: `watched:${id}`, film: f, title: f.title, year: f.year, day: null, at: 0, rating: ratings.get(id) ?? null, rewatch: false, liked: likes.has(id), review: '', spoiler: false });
  }
  const favorites = String(profile['Favorite Films'] || '').split(/[,\s]+/).filter(Boolean).map((u) => byUri.get(u)).filter(Boolean).slice(0, 4);
  return { username: cleanUsername(profile.Username), favorites, entries };
}

// ---------- links ----------
export function linkOf(userId) {
  const r = db().prepare('SELECT * FROM letterboxd_links WHERE user_id = ?').get(userId);
  return r ? { username: r.username, linkedAt: r.linked_at, syncedAt: r.synced_at, error: r.error, importedAt: r.imported_at } : null;
}
export const linkedUsers = () => db().prepare('SELECT user_id AS userId, username, synced_at AS syncedAt FROM letterboxd_links').all();

export function status(userId) {
  const link = linkOf(userId);
  const n = db().prepare('SELECT COUNT(DISTINCT COALESCE(title_key, title)) AS films, SUM(review != \'\') AS reviews FROM letterboxd_log WHERE user_id = ?').get(userId);
  return { linked: Boolean(link), ...link, url: link ? `https://letterboxd.com/${link.username}/` : null, films: n.films || 0, reviews: n.reviews || 0 };
}

export function setLink(userId, username, now = Date.now()) {
  const u = cleanUsername(username);
  if (!u) throw fail(400, 'That doesn’t look like a Letterboxd username.');
  const old = linkOf(userId);
  if (old && old.username.toLowerCase() !== u.toLowerCase()) removeImported(userId); // another account: start over
  db().prepare(`INSERT INTO letterboxd_links (user_id, username, linked_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET username = excluded.username`).run(userId, u, now);
  return linkOf(userId);
}

export function unlink(userId) {
  removeImported(userId);
  db().prepare('DELETE FROM letterboxd_links WHERE user_id = ?').run(userId);
}

// Takes the imported diary out, and the stars, reviews and thumbs the import wrote that nobody changed since.
function removeImported(userId) {
  tx(() => {
    for (const w of db().prepare('SELECT * FROM letterboxd_wrote WHERE user_id = ?').all(userId)) {
      db().prepare('DELETE FROM reviews WHERE user_id = ? AND title_key = ? AND stars IS ? AND text = ?').run(userId, w.title_key, w.stars, w.text);
      if (w.thumb) db().prepare('DELETE FROM ratings WHERE user_id = ? AND title_key = ? AND value = ?').run(userId, w.title_key, w.thumb);
    }
    db().prepare('DELETE FROM letterboxd_wrote WHERE user_id = ?').run(userId);
    db().prepare('DELETE FROM letterboxd_log WHERE user_id = ?').run(userId);
  });
}

// ---------- storing ----------
// Keeps entries ({ id, key, title, year, day, at, rating, rewatch, liked, review, spoiler }) and brings the
// person's stars, reviews and thumbs up to date with them. Returns how many entries were new.
export function store(userId, entries, now = Date.now()) {
  const put = db().prepare(`INSERT INTO letterboxd_log (user_id, id, title_key, title, year, day, at, rating, rewatch, liked, review, spoiler)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET title_key = COALESCE(excluded.title_key, title_key), title = excluded.title, year = excluded.year, day = excluded.day,
      at = excluded.at, rating = excluded.rating, rewatch = excluded.rewatch, liked = excluded.liked, review = excluded.review, spoiler = excluded.spoiler`);
  const had = db().prepare('SELECT 1 FROM letterboxd_log WHERE user_id = ? AND id = ?');
  let added = 0;
  tx(() => {
    for (const e of entries) {
      if (!e?.id || !e.title) continue;
      if (!had.get(userId, e.id)) added++;
      put.run(userId, String(e.id).slice(0, 300), e.key || null, e.title, e.year || null, e.day || null, e.at || 0, e.rating ?? null,
        e.rewatch ? 1 : 0, e.liked ? 1 : 0, e.review || '', e.spoiler ? 1 : 0);
    }
  });
  applyReviews(userId, now);
  return added;
}

// Letterboxd's stars as they are (Lilin has half stars too), just kept in range.
export const starsFor = (r) => (r == null ? null : Math.min(5, Math.max(0.5, Math.round(r * 2) / 2)));
const thumbFor = (stars) => (stars >= 3.5 ? 1 : stars <= 2 ? -1 : 0); // reviews.js thumbFor

// Per title, the newest rating, like and review from Letterboxd go into Lilin's own reviews and thumbs,
// where the person hasn't put their own (see the top of this file).
function applyReviews(userId, now) {
  const rows = db().prepare('SELECT * FROM letterboxd_log WHERE user_id = ? AND title_key IS NOT NULL ORDER BY at').all(userId);
  const per = new Map();
  for (const r of rows) {
    const p = per.get(r.title_key) || { title: r.title, rating: null, liked: false, review: '', spoiler: false, at: r.at, reviewAt: null };
    if (r.rating != null) p.rating = r.rating;
    if (r.liked) p.liked = true;
    if (r.review) { p.review = r.review; p.spoiler = Boolean(r.spoiler); p.reviewAt = r.at; }
    p.at = r.at || p.at;
    per.set(r.title_key, p);
  }
  const wrote = new Map(db().prepare('SELECT * FROM letterboxd_wrote WHERE user_id = ?').all(userId).map((w) => [w.title_key, w]));
  tx(() => {
    for (const [key, p] of per) {
      const stars = starsFor(p.rating);
      const text = p.review;
      const thumb = stars ? thumbFor(stars) : p.liked ? 1 : 0;
      const before = wrote.get(key);
      const review = db().prepare('SELECT stars, text FROM reviews WHERE user_id = ? AND title_key = ?').get(userId, key);
      const ours = !review || (before && review.stars === before.stars && review.text === before.text);
      let wroteStars = before?.stars ?? null, wroteText = before?.text ?? '';
      if (ours && (stars || text)) {
        const at = p.reviewAt || p.at || now;
        db().prepare(`INSERT INTO reviews (user_id, title_key, stars, text, spoiler, title, created_at, updated_at, text_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, title_key) DO UPDATE SET stars = excluded.stars, text = excluded.text, spoiler = excluded.spoiler, title = excluded.title, updated_at = excluded.updated_at, text_at = excluded.text_at`)
          .run(userId, key, stars, text, p.spoiler ? 1 : 0, p.title, at, at, text ? at : null);
        wroteStars = stars; wroteText = text;
      }
      const rating = db().prepare('SELECT value FROM ratings WHERE user_id = ? AND title_key = ?').get(userId, key);
      let wroteThumb = before?.thumb ?? 0;
      if (thumb && (!rating || (before && rating.value === before.thumb))) {
        db().prepare(`INSERT INTO ratings (user_id, title_key, value, title, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, title_key) DO UPDATE SET value = excluded.value, title = excluded.title, updated_at = excluded.updated_at`).run(userId, key, thumb, p.title, p.at || now);
        wroteThumb = thumb;
      }
      if (wroteStars != null || wroteText || wroteThumb) {
        db().prepare(`INSERT INTO letterboxd_wrote (user_id, title_key, stars, text, thumb) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, title_key) DO UPDATE SET stars = excluded.stars, text = excluded.text, thumb = excluded.thumb`).run(userId, key, wroteStars, wroteText, wroteThumb);
      }
    }
  });
}

// ---------- syncing ----------
// The feed's XML, or an error that says what went wrong in plain words.
export async function getFeed(username) {
  let res;
  try {
    res = await fetch(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`, {
      headers: { 'User-Agent': 'Lilin (self-hosted media server)', Accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(15000) });
  } catch { throw fail(502, 'Couldn’t reach Letterboxd. Try again in a bit.'); }
  if (res.status === 404) throw fail(404, `There’s no Letterboxd account called ${username}.`);
  if (!res.ok) throw fail(502, `Letterboxd didn’t answer (${res.status}). Try again in a bit.`);
  const xml = await res.text();
  if (!/<rss[\s>]/.test(xml.slice(0, 2000))) throw fail(502, 'Letterboxd sent something that isn’t a feed. Try again in a bit.');
  return xml;
}

// fetchFeed(username) → the feed's XML (throws with a status when it can't).
export async function sync(userId, { fetchFeed = getFeed, now = Date.now() } = {}) {
  const link = linkOf(userId);
  if (!link) throw fail(404, 'No Letterboxd account is linked.');
  try {
    const added = store(userId, parseFeed(await fetchFeed(link.username)), now);
    db().prepare('UPDATE letterboxd_links SET synced_at = ?, error = NULL WHERE user_id = ?').run(now, userId);
    return { added };
  } catch (e) {
    db().prepare('UPDATE letterboxd_links SET error = ? WHERE user_id = ?').run(String(e.message || e).slice(0, 200), userId);
    throw e;
  }
}

// Brings every linked account up to date that hasn't been for SYNC_EVERY, one at a time.
export async function syncRound({ fetchFeed = getFeed, now = Date.now() } = {}) {
  for (const l of linkedUsers()) {
    if (l.syncedAt && now - l.syncedAt < SYNC_EVERY) continue;
    try { await sync(l.userId, { fetchFeed, now }); } catch { /* kept in the link's error; tried again next round */ }
  }
}

// The export: finds every film's TMDB id (findFilm({ title, year }) → 'movie:123' | null, a few at a time),
// stores what it found and returns { films, missed, favorites: [key] }. progress(done, total) as it goes.
export async function importExport(userId, buf, { findFilm, progress = () => {}, now = Date.now() } = {}) {
  const ex = parseExport(buf);
  const films = new Map();
  for (const f of [...ex.entries.map((e) => e.film), ...ex.favorites]) films.set(filmId(f), f);
  const keys = new Map();
  const list = [...films.entries()];
  let done = 0, next = 0;
  const worker = async () => {
    while (next < list.length) {
      const [id, f] = list[next++];
      try { keys.set(id, await findFilm(f)); } catch { keys.set(id, null); }
      progress(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const entries = ex.entries.map((e) => ({ ...e, key: keys.get(filmId(e.film)) || null }));
  store(userId, entries, now);
  db().prepare('UPDATE letterboxd_links SET imported_at = ? WHERE user_id = ?').run(now, userId);
  const missed = [...keys.values()].filter((k) => !k).length;
  return { username: ex.username, films: list.length - missed, missed, favorites: ex.favorites.map((f) => keys.get(filmId(f))).filter(Boolean) };
}

// ---------- for profiles.js ----------
// Diary-worthy watches from Letterboxd: { key, type, title, day, at, rewatch, lbStars }. Films without a day
// (only marked watched) come back with day null.
export function watchesOf(userId) {
  return db().prepare('SELECT title_key, title, day, at, rating, rewatch FROM letterboxd_log WHERE user_id = ? AND title_key IS NOT NULL').all(userId)
    .map((r) => ({ key: r.title_key, type: r.title_key.split(':')[0], title: r.title, day: r.day, at: r.at || (r.day ? Date.parse(`${r.day}T20:00:00Z`) : 0), rewatch: Boolean(r.rewatch), lbStars: r.rating }));
}

// Which of a person's reviews came from Letterboxd unchanged (title keys).
export function importedReviews(userId) {
  return new Set(db().prepare(`SELECT w.title_key FROM letterboxd_wrote w JOIN reviews r ON r.user_id = w.user_id AND r.title_key = w.title_key
    AND r.stars IS w.stars AND r.text = w.text WHERE w.user_id = ?`).all(userId).map((r) => r.title_key));
}
