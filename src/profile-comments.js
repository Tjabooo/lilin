// Comments on a profile (the Comments section, a guestbook): people who can see someone's whole profile can leave
// them a note there, newest first. A comment can have replies (one level: a reply to a reply joins the same
// thread, oldest first) and likes (a heart and a count). The profile's owner can turn the section off in Edit
// profile (then nobody can post or read them) and delete any comment on their page; everyone can delete their own.
// Deleting a comment takes its replies with it. Lilin's owners can delete any comment too, but an owner peeking at a
// page that isn't shared with them can't post on it. Reports go to the owner's idea box (server.js).
// Plain text only (shown as text, never HTML), at most MAX_COMMENT characters, a few a minute per person.
import { database, userById } from './accounts.js';
import { cleanBio } from './profiles.js';

export const MAX_COMMENT = 500;
export const PAGE = 20;
const BURST = 5; // comments per person per BURST_MS, over all profiles
const BURST_MS = 60_000;

const ready = new WeakSet(); // databases that already have the tables (tests open fresh ones)
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
    CREATE INDEX IF NOT EXISTS profile_comments_by_profile ON profile_comments (profile_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS profile_comment_likes (
      comment_id INTEGER NOT NULL REFERENCES profile_comments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (comment_id, user_id)
    );`);
    if (!d.prepare('PRAGMA table_info(profile_comments)').all().some((c) => c.name === 'parent_id')) {
      d.exec('ALTER TABLE profile_comments ADD COLUMN parent_id INTEGER REFERENCES profile_comments(id) ON DELETE CASCADE');
      d.exec('CREATE INDEX IF NOT EXISTS profile_comments_by_parent ON profile_comments (parent_id)');
    }
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

const SELECT = `SELECT c.*, p.handle,
  (SELECT COUNT(*) FROM profile_comment_likes l WHERE l.comment_id = c.id) AS likes,
  EXISTS (SELECT 1 FROM profile_comment_likes l WHERE l.comment_id = c.id AND l.user_id = @viewer) AS liked
  FROM profile_comments c LEFT JOIN profiles p ON p.user_id = c.author_id`;

// What a comment looks like to the viewer: who wrote it, the text, when, likes, and whether the viewer may delete it.
function shape(r, viewer) {
  const a = userById(r.author_id);
  if (!a) return null;
  return {
    id: r.id, parent: r.parent_id || null, text: r.body, created: r.created_at,
    author: { id: a.id, name: a.name, avatar: a.avatar, handle: r.handle || null },
    likes: r.likes, liked: Boolean(r.liked), mine: viewer.id === r.author_id,
    canDelete: viewer.id === r.author_id || viewer.id === r.profile_id || Boolean(viewer.isOwner),
  };
}

// The newest comments on a profile, PAGE at a time, each with its replies: { comments, more, total }.
// total counts replies too; paging (offset, more) goes by top-level comments.
export function list(viewer, profileId, { offset = 0, limit = PAGE } = {}) {
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const rows = db().prepare(`${SELECT} WHERE c.profile_id = @profile AND c.parent_id IS NULL ORDER BY c.created_at DESC, c.id DESC LIMIT @limit OFFSET @offset`)
    .all({ viewer: viewer.id, profile: profileId, limit: limit + 1, offset: off });
  const top = rows.slice(0, limit);
  const replies = new Map(top.map((r) => [r.id, []]));
  if (top.length) {
    const ids = top.map((r) => r.id);
    for (const r of db().prepare(`${SELECT} WHERE c.parent_id IN (${ids.map(() => '?').join(',')}) ORDER BY c.created_at, c.id`).all({ viewer: viewer.id }, ...ids.map(Number))) {
      const s = shape(r, viewer);
      if (s) replies.get(r.parent_id).push(s);
    }
  }
  const total = db().prepare('SELECT COUNT(*) AS n FROM profile_comments WHERE profile_id = ?').get(profileId).n;
  return { comments: top.map((r) => { const s = shape(r, viewer); return s && { ...s, replies: replies.get(r.id) }; }).filter(Boolean), more: rows.length > limit, total };
}

const rowOf = (id) => db().prepare('SELECT * FROM profile_comments WHERE id = ?').get(Number(id)) || null;
// One comment as the viewer sees it, or null.
export function get(viewer, id) {
  const r = db().prepare(`${SELECT} WHERE c.id = @id`).get({ viewer: viewer.id, id: Number(id) });
  return r ? shape(r, viewer) : null;
}

// A new comment by author on profileId's page (the caller checks the author may see the whole page). replyTo: a
// comment on the same page; a reply to a reply goes in that reply's thread. Returns it with replyingTo (the comment
// answered, for the notification).
export function add(author, profileId, text, now = Date.now(), replyTo = null) {
  const body = cleanBio(text);
  if (!body) throw fail(400, 'Write something first.');
  if (body.length > MAX_COMMENT) throw fail(400, `Keep it under ${MAX_COMMENT} characters.`);
  let parent = null;
  if (replyTo != null) {
    parent = rowOf(replyTo);
    if (!parent || parent.profile_id !== profileId) throw fail(404, 'That comment is gone.');
  }
  if (!allowed(author.id, now)) throw Object.assign(fail(429, 'That’s a lot of comments. Wait a minute.'), { retryAfter: 60 });
  recent.get(author.id).push(now);
  const threadId = parent ? parent.parent_id || parent.id : null;
  const id = db().prepare('INSERT INTO profile_comments (profile_id, author_id, body, created_at, parent_id) VALUES (?, ?, ?, ?, ?)')
    .run(profileId, author.id, body, now, threadId).lastInsertRowid;
  return { ...get(author, id), replyingTo: parent ? { id: parent.id, authorId: parent.author_id } : null };
}

// Deletes a comment (and its replies): its author, the profile's owner or a Lilin owner. Returns the profile it was on.
export function remove(viewer, id) {
  const r = rowOf(id);
  if (!r) throw fail(404, 'That comment is gone.');
  if (viewer.id !== r.author_id && viewer.id !== r.profile_id && !viewer.isOwner) throw fail(403, 'You can’t delete that comment.');
  const ids = [r.id, ...db().prepare('SELECT id FROM profile_comments WHERE parent_id = ?').all(r.id).map((x) => x.id)];
  const marks = ids.map(() => '?').join(',');
  db().exec('BEGIN'); // node:sqlite has no transaction helper
  try {
    db().prepare(`DELETE FROM profile_comment_likes WHERE comment_id IN (${marks})`).run(...ids);
    db().prepare(`DELETE FROM profile_comments WHERE id IN (${marks})`).run(...ids);
    db().exec('COMMIT');
  } catch (e) { db().exec('ROLLBACK'); throw e; }
  return r.profile_id;
}

// Likes or unlikes a comment on profileId's page. Returns { likes, liked }.
export function like(viewer, profileId, id, on, now = Date.now()) {
  const r = rowOf(id);
  if (!r || r.profile_id !== profileId) throw fail(404, 'That comment is gone.');
  if (on) db().prepare('INSERT OR IGNORE INTO profile_comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)').run(r.id, viewer.id, now);
  else db().prepare('DELETE FROM profile_comment_likes WHERE comment_id = ? AND user_id = ?').run(r.id, viewer.id);
  const c = get(viewer, r.id);
  return { likes: c.likes, liked: c.liked };
}

// The comment someone reports, checked to be on profileId's page and not theirs.
export function reportable(viewer, profileId, id) {
  const r = rowOf(id);
  if (!r || r.profile_id !== profileId) throw fail(404, 'That comment is gone.');
  if (r.author_id === viewer.id) throw fail(400, 'That’s your own comment. You can delete it instead.');
  return { id: r.id, text: r.body, author: userById(r.author_id)?.name || 'Someone' };
}
