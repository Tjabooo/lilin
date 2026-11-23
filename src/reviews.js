// Reviews: stars (½ to 5, in half stars) and a short personal review on a film or a show, readable by everyone on the
// server. One review per person per title; editing replaces it. Reviews are per title, not per
// season or episode: thumbs, Popular and the title pages all work per title, and a small household
// would spread its few reviews over too many episode pages to be worth reading.
//
// Stars live next to the thumbs (social.js `ratings`), which stay the one quick rating. The two always
// agree, so Popular, "Liked by", Discover's hidden dislikes, Live TV picks and Wrapped keep working:
//   - giving stars sets the thumb: 5 stars = thumbs up, ½-2 stars = thumbs down; 2½-4½ stars give no thumb
//     of their own but keep a like you gave (and drop a thumbs down). Only a full 5 likes by itself, so likes
//     stay meaningful; until 2026-11-22 3½ and up did;
//   - tapping a thumb the stars disagree with (a like on ½-2, a thumbs down on 2½ and up, no thumb on 5)
//     clears the stars, never the text.
// Privacy: stars without text are only counted in the title's average (shown once two or more people
// gave stars); a written review shows its writer's name, picture and stars to everyone. A thumbs down
// on its own stays private, as before.
//
// Restricted people (see accounts.js isRestricted) can't write reviews, don't see anyone's, and the
// reviews and stars they wrote before are left out for everyone else. The server passes that in as
// `hidden(userId)`; this module doesn't look at accounts itself.
import { database } from './accounts.js';
import * as social from './social.js';

export const MAX_TEXT = 2000;
export const MIN_FOR_AVERAGE = 2;     // an average of one person's stars would just be their stars
const WRITES_PER_WINDOW = 20;         // saves and deletes per person in 10 minutes
const WINDOW = 10 * 60000;
const NEW_PER_DAY = 40;               // newly written reviews per person per day
const DAY = 86400000;
const EDIT_GRACE = 5 * 60000;         // fixing a typo right after posting doesn't count as "edited"

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const writes = new Map();             // userId -> [ms] of recent writes

export function initReviews() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      stars REAL CHECK (stars IS NULL OR (stars BETWEEN 0.5 AND 5 AND stars * 2 = CAST(stars * 2 AS INTEGER))),
      text TEXT NOT NULL DEFAULT '',
      spoiler INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      text_at INTEGER,
      PRIMARY KEY (user_id, title_key)
    );
    CREATE INDEX IF NOT EXISTS reviews_title ON reviews(title_key);
  `);
  halfStars();
  onlyFiveLikes();
}

// Once: likes that 3½-4½ stars gave before only 5 stars counted are taken back (the stars stay). Likes that
// came over from Letterboxd (letterboxd.js letterboxd_wrote / a Letterboxd heart) are kept.
function onlyFiveLikes() {
  const done = db().prepare("SELECT value FROM meta WHERE key = 'reviews_only_five_likes'").get();
  if (done) return;
  const lb = (t) => db().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const keep = [lb('letterboxd_wrote') && 'NOT EXISTS (SELECT 1 FROM letterboxd_wrote w WHERE w.user_id = r.user_id AND w.title_key = r.title_key AND w.thumb = 1)',
    lb('letterboxd_log') && 'NOT EXISTS (SELECT 1 FROM letterboxd_log l WHERE l.user_id = r.user_id AND l.title_key = r.title_key AND l.liked != 0)'].filter(Boolean);
  db().exec('BEGIN');
  try {
    db().prepare(`DELETE FROM ratings AS r WHERE r.value = 1 AND EXISTS (SELECT 1 FROM reviews v WHERE v.user_id = r.user_id
      AND v.title_key = r.title_key AND v.stars IS NOT NULL AND v.stars < 5)${keep.map((k) => ` AND ${k}`).join('')}`).run();
    db().prepare("INSERT INTO meta (key, value) VALUES ('reviews_only_five_likes', '1')").run();
    db().exec('COMMIT');
  } catch (err) { db().exec('ROLLBACK'); throw err; }
}

// Reviews made before half stars allowed whole stars only (CHECK 1-5): SQLite can't change a CHECK, so the
// table is rebuilt once with the new one. Every old value is still valid.
function halfStars() {
  const sql = db().prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reviews'").get()?.sql || '';
  if (!/BETWEEN 1 AND 5/.test(sql)) return;
  db().exec('BEGIN');
  try {
    db().exec(`
      CREATE TABLE reviews_half (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title_key TEXT NOT NULL,
        stars REAL CHECK (stars IS NULL OR (stars BETWEEN 0.5 AND 5 AND stars * 2 = CAST(stars * 2 AS INTEGER))),
        text TEXT NOT NULL DEFAULT '',
        spoiler INTEGER NOT NULL DEFAULT 0,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        text_at INTEGER,
        PRIMARY KEY (user_id, title_key)
      );
      INSERT INTO reviews_half (user_id, title_key, stars, text, spoiler, title, created_at, updated_at, text_at)
        SELECT user_id, title_key, stars, text, spoiler, title, created_at, updated_at, text_at FROM reviews;
      DROP TABLE reviews;
      ALTER TABLE reviews_half RENAME TO reviews;
      CREATE INDEX IF NOT EXISTS reviews_title ON reviews(title_key);
    `);
    db().exec('COMMIT');
  } catch (e) { db().exec('ROLLBACK'); throw e; }
}

// Plain text only: control characters out, line breaks kept (at most one empty line in a row).
// The app shows it as text, never as HTML or markdown.
export const cleanText = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// The thumb a number of stars stands for: 1 up, -1 down, 0 none.
export const thumbFor = (stars) => (stars >= 5 ? 1 : stars <= 2 ? -1 : 0);
// Whether a thumb fits with these stars, and the thumb that's left after picking them.
export const agrees = (stars, thumb) => (stars >= 5 ? thumb === 1 : stars <= 2 ? thumb === -1 : thumb !== -1);
export const thumbAfter = (stars, thumb) => (agrees(stars, thumb) ? thumb : thumbFor(stars));

const starsOf = (v) => {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  const n = Number(v);
  if (!Number.isInteger(n * 2) || n < 0.5 || n > 5) throw fail(400, 'Pick ½ to 5 stars.');
  return n;
};

function limit(userId, now) {
  const recent = (writes.get(userId) || []).filter((at) => now - at < WINDOW);
  if (recent.length >= WRITES_PER_WINDOW) throw Object.assign(fail(429, 'That’s a lot of reviewing at once. Try again in a few minutes.'), { retryAfter: 120 });
  recent.push(now);
  writes.set(userId, recent);
  if (writes.size > 2000) writes.delete(writes.keys().next().value);
}
export const resetLimits = () => writes.clear(); // tests

export const reviewOf = (userId, key) => db().prepare('SELECT * FROM reviews WHERE user_id = ? AND title_key = ?').get(userId, key) || null;

// Saves this person's stars, text and spoiler mark for a title (the whole review: missing fields
// mean none). `thumb` (1, -1, 0) is the thumb picked in the same sheet; with stars it only counts when it
// agrees with them (see agrees). Nothing left (no stars, no text) removes the review. Returns the thumb
// that was set, or null when the thumbs were left alone.
export function save(userId, key, body = {}, now = Date.now()) {
  if (!social.validTitleKey(key)) throw fail(400, 'Which film or show?');
  const stars = starsOf(body.stars);
  const raw = cleanText(body.text);
  if (raw.length > MAX_TEXT) throw fail(400, `Keep a review under ${MAX_TEXT} characters.`);
  const text = raw;
  const spoiler = Boolean(body.spoiler) && Boolean(text);
  const title = String(body.title ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 200) || null;
  const before = reviewOf(userId, key);
  limit(userId, now);
  if (text && !before?.text) {
    const today = db().prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND text != '' AND created_at > ?").get(userId, now - DAY).n;
    if (today >= NEW_PER_DAY) throw fail(429, 'That’s enough reviews for one day. Write the rest tomorrow.');
  }
  const picked = [1, -1, 0].includes(Number(body.thumb)) && body.thumb !== null && body.thumb !== '' ? Number(body.thumb) : null;
  const current = db().prepare('SELECT value FROM ratings WHERE user_id = ? AND title_key = ?').get(userId, key)?.value ?? 0;
  const thumb = stars == null ? picked : picked != null && agrees(stars, picked) ? picked : thumbAfter(stars, current);
  db().exec('BEGIN');
  try {
    if (stars == null && !text) db().prepare('DELETE FROM reviews WHERE user_id = ? AND title_key = ?').run(userId, key);
    else {
      const textAt = text !== (before?.text || '') ? now : before?.text_at ?? null;
      db().prepare(`INSERT INTO reviews (user_id, title_key, stars, text, spoiler, title, created_at, updated_at, text_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, title_key) DO UPDATE SET stars = excluded.stars, text = excluded.text, spoiler = excluded.spoiler,
          title = COALESCE(excluded.title, title), updated_at = excluded.updated_at, text_at = excluded.text_at`)
        .run(userId, key, stars, text, spoiler ? 1 : 0, title, before?.created_at ?? now, now, textAt);
    }
    if (thumb != null) social.rate(userId, key, thumb, title || before?.title || '');
    db().exec('COMMIT');
  } catch (err) { db().exec('ROLLBACK'); throw err; }
  return thumb;
}

// A thumb was tapped (or cleared) on its own: stars that no longer agree with it are cleared, the
// text stays. Returns true when something changed.
export function onThumb(userId, key, value) {
  const r = social.validTitleKey(key) && reviewOf(userId, key);
  if (!r || r.stars == null || agrees(r.stars, Number(value))) return false;
  if (r.text) db().prepare('UPDATE reviews SET stars = NULL, updated_at = ? WHERE user_id = ? AND title_key = ?').run(Date.now(), userId, key);
  else db().prepare('DELETE FROM reviews WHERE user_id = ? AND title_key = ?').run(userId, key);
  return true;
}

// Deletes one person's review (stars and text; the thumb stays). Anyone their own, the owner anyone's.
export function remove(actor, key, authorId = actor.id, now = Date.now()) {
  if (!social.validTitleKey(key)) throw fail(400, 'Which film or show?');
  authorId = Number(authorId);
  if (authorId !== actor.id && !actor.isOwner) throw fail(403, 'Only the server’s owner can remove someone else’s review.');
  if (authorId === actor.id) limit(actor.id, now);
  return db().prepare('DELETE FROM reviews WHERE user_id = ? AND title_key = ?').run(authorId, key).changes > 0;
}

// Everything one person sees about a title's reviews.
//   viewer: { id, isOwner, restricted }; hidden(userId): true for people whose reviews nobody sees;
//   friends: Set of the viewer's friends' ids (their reviews come first); all: the whole list, not the preview.
// Order: your own, then friends', then the newest. The preview is the first two with text.
export function forTitle(viewer, key, { hidden = () => false, friends = new Set(), nameOf = () => 'Someone', avatarOf = () => null, all = false, preview = 2 } = {}) {
  if (!social.validTitleKey(key)) throw fail(400, 'Which film or show?');
  if (viewer.restricted) return { key, restricted: true, canWrite: false, thumb: 0, average: null, ratings: 0, count: 0, mine: null, reviews: [] };
  const rows = db().prepare('SELECT * FROM reviews WHERE title_key = ? ORDER BY created_at DESC').all(key)
    .filter((r) => r.user_id === viewer.id || !hidden(r.user_id));
  const starred = rows.filter((r) => r.stars != null);
  const ratings = starred.length;
  const average = ratings >= MIN_FOR_AVERAGE ? Math.round((starred.reduce((s, r) => s + r.stars, 0) / ratings) * 10) / 10 : null;
  const rank = (r) => (r.user_id === viewer.id ? 0 : friends.has(r.user_id) ? 1 : 2);
  const written = rows.filter((r) => r.text).sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);
  const view = (r) => ({
    userId: r.user_id, name: nameOf(r.user_id), avatar: avatarOf(r.user_id), stars: r.stars, text: r.text, spoiler: Boolean(r.spoiler),
    created: r.created_at, edited: r.text_at != null && r.text_at - r.created_at > EDIT_GRACE ? r.text_at : null,
    mine: r.user_id === viewer.id, friend: friends.has(r.user_id), canRemove: r.user_id === viewer.id || Boolean(viewer.isOwner),
  });
  const own = rows.find((r) => r.user_id === viewer.id);
  const thumb = db().prepare('SELECT value FROM ratings WHERE user_id = ? AND title_key = ?').get(viewer.id, key)?.value || 0;
  return {
    key, canWrite: true, average, ratings, count: written.length, thumb,
    mine: own ? { stars: own.stars, text: own.text, spoiler: Boolean(own.spoiler), created: own.created_at, updated: own.updated_at } : null,
    reviews: (all ? written.slice(0, 300) : written.slice(0, preview)).map(view),
  };
}
