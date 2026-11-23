// Comments on a profile (the Comments section, a guestbook): people who can see someone's whole profile can leave
// them a note there, newest first. The profile's owner can turn the section off in Edit profile (then nobody can
// post or read them) and delete any comment on their page; everyone can delete their own. Lilin's owners can
// delete any comment too, but an owner peeking at a page that isn't shared with them can't post on it.
// Plain text only (shown as text, never HTML), at most MAX_COMMENT characters, a few a minute per person.
import { database, userById } from './accounts.js';
import { cleanBio } from './profiles.js';

export const MAX_COMMENT = 500;
export const PAGE = 20;
const BURST = 5; // comments per person per BURST_MS, over all profiles
const BURST_MS = 60_000;

const ready = new WeakSet(); // databases that already have the table (tests open fresh ones)
function db() {
  const d = database();
  if (!ready.has(d)) {
    d.exec(`CREATE TABLE IF NOT EXISTS profile_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profile_comments_by_profile ON profile_comments (profile_id, created_at DESC);`);
    ready.add(d);
  }
  return d;
}
const fail = (status, message) => Object.assign(new Error(message), { status });

const recent = new Map(); // author id -> times of their last few comments
function allowed(authorId, now) {
  const times = (recent.get(authorId) || []).filter((t) => now - t < BURST_MS);
  recent.set(authorId, times);
  return times.length < BURST;
}

// What a comment looks like to the viewer: who wrote it, the text, when, and whether the viewer may delete it.
function shape(r, viewer, profileId) {
  const a = userById(r.author_id);
  if (!a) return null;
  return {
    id: r.id, text: r.body, created: r.created_at,
    author: { id: a.id, name: a.name, avatar: a.avatar, handle: r.handle || null },
    canDelete: viewer.id === r.author_id || viewer.id === profileId || Boolean(viewer.isOwner),
  };
}

// The newest comments on a profile, PAGE at a time: { comments, more, total }.
export function list(viewer, profileId, { offset = 0, limit = PAGE } = {}) {
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const rows = db().prepare(`SELECT c.*, p.handle FROM profile_comments c LEFT JOIN profiles p ON p.user_id = c.author_id
    WHERE c.profile_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`).all(profileId, limit + 1, off);
  const total = db().prepare('SELECT COUNT(*) AS n FROM profile_comments WHERE profile_id = ?').get(profileId).n;
  return { comments: rows.slice(0, limit).map((r) => shape(r, viewer, profileId)).filter(Boolean), more: rows.length > limit, total };
}

// A new comment by author on profileId's page (the caller checks the author may see the whole page). Returns it.
export function add(author, profileId, text, now = Date.now()) {
  const body = cleanBio(text);
  if (!body) throw fail(400, 'Write something first.');
  if (body.length > MAX_COMMENT) throw fail(400, `Keep it under ${MAX_COMMENT} characters.`);
  if (!allowed(author.id, now)) throw Object.assign(fail(429, 'That’s a lot of comments. Wait a minute.'), { retryAfter: 60 });
  recent.get(author.id).push(now);
  const id = db().prepare('INSERT INTO profile_comments (profile_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(profileId, author.id, body, now).lastInsertRowid;
  const r = db().prepare('SELECT c.*, p.handle FROM profile_comments c LEFT JOIN profiles p ON p.user_id = c.author_id WHERE c.id = ?').get(id);
  return shape(r, author, profileId);
}

// Deletes a comment: its author, the profile's owner or a Lilin owner. Returns the profile it was on.
export function remove(viewer, id) {
  const r = db().prepare('SELECT * FROM profile_comments WHERE id = ?').get(Number(id));
  if (!r) throw fail(404, 'That comment is gone.');
  if (viewer.id !== r.author_id && viewer.id !== r.profile_id && !viewer.isOwner) throw fail(403, 'You can’t delete that comment.');
  db().prepare('DELETE FROM profile_comments WHERE id = ?').run(r.id);
  return r.profile_id;
}
