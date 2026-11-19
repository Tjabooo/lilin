// Lists: Letterboxd-style shelves people put together and share ("films that ruined my sleep"). A list has a name,
// an optional note about it, and films or shows in the order its maker put them, optionally numbered (ranked).
// Lists show on their maker's profile (profiles.js, section "lists") and have their own link (/#list/<id>).
//
// Who sees a list: the same people who can see its maker's profile (profiles.access = 'self' or 'full'), unless
// the list is kept private (only its maker). Restricted people have no profile, so they have no lists either and
// can't open anyone's. Each item is a snapshot of the title (name, year, poster) taken when it was added, so a
// list of 200 films opens without 200 TMDB lookups.
import { randomBytes } from 'node:crypto';
import { database } from './accounts.js';
import { validTitleKey } from './social.js';

export const MAX_LISTS = 100;     // per person
export const MAX_ITEMS = 500;     // per list
export const MAX_NAME = 80;
export const MAX_ABOUT = 600;
const PREVIEW = 5;                // posters on a list's card

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const TMDB_IMAGE = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const ID = /^[a-z0-9]{10}$/;

export function initLists() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      about TEXT NOT NULL DEFAULT '',
      ranked INTEGER NOT NULL DEFAULT 0,
      private INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lists_user ON lists(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS list_items (
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      poster TEXT,
      backdrop TEXT,
      position REAL NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (list_id, title_key)
    );
    CREATE INDEX IF NOT EXISTS list_items_key ON list_items(title_key);
  `);
}

const line = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const img = (u) => (TMDB_IMAGE.test(String(u || '')) ? u : null);
const newId = () => {
  for (;;) {
    const id = [...randomBytes(10)].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
    if (!db().prepare('SELECT 1 FROM lists WHERE id = ?').get(id)) return id;
  }
};

function cleanName(raw) {
  const name = line(raw, MAX_NAME + 1);
  if (!name) throw fail(400, 'Give the list a name.');
  if (name.length > MAX_NAME) throw fail(400, `Keep the name under ${MAX_NAME} characters.`);
  return name;
}
function cleanAbout(raw) {
  const about = text(raw);
  if (about.length > MAX_ABOUT) throw fail(400, `Keep the description under ${MAX_ABOUT} characters.`);
  return about;
}

const row = (id) => (ID.test(String(id || '')) ? db().prepare('SELECT * FROM lists WHERE id = ?').get(id) : null) || null;
const items = (id) => db().prepare('SELECT title_key, title, year, poster, backdrop, added_at FROM list_items WHERE list_id = ? ORDER BY position, added_at').all(id)
  .map((r) => ({ key: r.title_key, type: r.title_key.split(':')[0], id: Number(r.title_key.split(':')[1]), title: r.title, year: r.year, poster: r.poster, backdrop: r.backdrop, added: r.added_at }));
const count = (id) => db().prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').get(id).n;
const touch = (id, now) => db().prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(now, id);

// The list as its maker owns it, or a 404 / 403.
export function ownList(userId, id) {
  const r = row(id);
  if (!r) throw fail(404, 'That list is gone.');
  if (r.user_id !== userId) throw fail(403, 'Only its maker can change a list.');
  return r;
}

// Who made a list (for the server's access check), or null.
export const ownerOf = (id) => row(id)?.user_id ?? null;

const summary = (r) => ({ id: r.id, name: r.name, about: r.about, ranked: Boolean(r.ranked), private: Boolean(r.private), userId: r.user_id,
  created: r.created_at, updated: r.updated_at, count: count(r.id),
  preview: db().prepare('SELECT title_key, title, poster FROM list_items WHERE list_id = ? ORDER BY position, added_at LIMIT ?').all(r.id, PREVIEW)
    .map((i) => ({ key: i.title_key, title: i.title, poster: i.poster })) });

// Someone's lists, newest change first. self: include the private ones. key: mark the lists that hold that title.
export function listsOf(userId, { self = false, key = null } = {}) {
  const rows = db().prepare(`SELECT * FROM lists WHERE user_id = ? ${self ? '' : 'AND private = 0'} ORDER BY updated_at DESC`).all(userId);
  const holds = key && validTitleKey(key) ? new Set(db().prepare('SELECT list_id FROM list_items WHERE title_key = ?').all(key).map((r) => r.list_id)) : null;
  return rows.map((r) => ({ ...summary(r), ...(holds ? { has: holds.has(r.id) } : {}) }));
}

// One whole list. canSee(ownerId, list) decides (the server checks the maker's profile); throws 404 when not.
export function get(id, viewerId, canSee) {
  const r = row(id);
  if (!r || (r.user_id !== viewerId && (r.private || !canSee(r.user_id)))) throw fail(404, 'This list is private or gone.');
  return { ...summary(r), mine: r.user_id === viewerId, items: items(r.id) };
}

// A new list, optionally with a first title in it. resolve(key) → { title, year, poster, backdrop } (TMDB).
export async function create(userId, body = {}, { resolve, now = Date.now() } = {}) {
  const n = db().prepare('SELECT COUNT(*) AS n FROM lists WHERE user_id = ?').get(userId).n;
  if (n >= MAX_LISTS) throw fail(400, `That’s ${MAX_LISTS} lists already. Delete one first.`);
  const id = newId();
  db().prepare('INSERT INTO lists (id, user_id, name, about, ranked, private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, cleanName(body.name), cleanAbout(body.about), body.ranked ? 1 : 0, body.private ? 1 : 0, now, now);
  for (const key of (Array.isArray(body.keys) ? body.keys : body.key ? [body.key] : []).slice(0, MAX_ITEMS)) await add(userId, id, key, { resolve, now });
  return get(id, userId, () => true);
}

// Name, description, numbered or not, private or not, and the order (keys, all of them or a part: the rest keep theirs after).
export function update(userId, id, body = {}, now = Date.now()) {
  const r = ownList(userId, id);
  const name = 'name' in body ? cleanName(body.name) : r.name;
  const about = 'about' in body ? cleanAbout(body.about) : r.about;
  const ranked = 'ranked' in body ? (body.ranked ? 1 : 0) : r.ranked;
  const priv = 'private' in body ? (body.private ? 1 : 0) : r.private;
  db().prepare('UPDATE lists SET name = ?, about = ?, ranked = ?, private = ?, updated_at = ? WHERE id = ?').run(name, about, ranked, priv, now, id);
  if (Array.isArray(body.order)) {
    const have = items(id).map((i) => i.key);
    const want = [...new Set(body.order.map(String))].filter((k) => have.includes(k));
    const order = [...want, ...have.filter((k) => !want.includes(k))];
    const set = db().prepare('UPDATE list_items SET position = ? WHERE list_id = ? AND title_key = ?');
    db().exec('BEGIN');
    try { order.forEach((k, i) => set.run(i, id, k)); db().exec('COMMIT'); } catch (e) { db().exec('ROLLBACK'); throw e; }
  }
  return get(id, userId, () => true);
}

// Puts a title at the end of a list (already there: stays where it is). Returns the list's summary.
export async function add(userId, id, key, { resolve, now = Date.now() } = {}) {
  ownList(userId, id);
  key = String(key || '');
  if (!validTitleKey(key)) throw fail(400, 'Which film or show?');
  if (db().prepare('SELECT 1 FROM list_items WHERE list_id = ? AND title_key = ?').get(id, key)) return summary(row(id));
  if (count(id) >= MAX_ITEMS) throw fail(400, `A list holds up to ${MAX_ITEMS} titles.`);
  const card = await resolve?.(key);
  if (!card) throw fail(502, 'Couldn’t look that title up. Try again in a moment.');
  const last = db().prepare('SELECT MAX(position) AS p FROM list_items WHERE list_id = ?').get(id).p;
  db().prepare('INSERT INTO list_items (list_id, title_key, title, year, poster, backdrop, position, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, key, line(card.title, 200) || 'Untitled', Number.isInteger(card.year) ? card.year : null, img(card.poster), img(card.backdrop), (last ?? -1) + 1, now);
  touch(id, now);
  return summary(row(id));
}

export function removeItem(userId, id, key, now = Date.now()) {
  ownList(userId, id);
  db().prepare('DELETE FROM list_items WHERE list_id = ? AND title_key = ?').run(id, String(key || ''));
  touch(id, now);
  return summary(row(id));
}

export function remove(userId, id) {
  ownList(userId, id);
  db().prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
  db().prepare('DELETE FROM lists WHERE id = ?').run(id);
}
