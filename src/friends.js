// Friends: people add each other by name, the other person accepts, and then they can share Moments
// (moments.js) straight to each other. Settings → Friends shows requests, friends and the search.
//
// One table in the accounts database: friend_links (from_id → to_id), pending until the other person
// accepts. A request to someone who already asked you counts as accepting theirs.
//
// Restricted people (People → Restrict, accounts.isRestricted) have no friends: they can't be found or
// asked, can't ask anyone, and their existing friendships are hidden (not deleted) while restricted.
import { database, userById, isRestricted, restrictedIds } from './accounts.js';
import { isAccountId } from './account-ids.js';

const MAX_PENDING = 30;       // open requests one person can have sent at a time
const MAX_FRIENDS = 300;
const HOME = 'home';          // the shared Home network account (accounts.js) never has friends
const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });

export function initFriends() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS friend_links (
      from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      accepted_at INTEGER,
      PRIMARY KEY (from_id, to_id)
    );
    CREATE INDEX IF NOT EXISTS friend_links_to ON friend_links(to_id);
  `);
}

const homeAccount = (id) => db().prepare('SELECT email FROM users WHERE id = ?').get(id)?.email === HOME;
// Can this person take part in friends at all?
const social = (user) => Boolean(user) && !isRestricted(user) && user.email !== HOME && user.email !== null;
const link = (a, b) => db().prepare('SELECT * FROM friend_links WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').get(a, b, b, a);

// Friends right now: accepted, and neither of them restricted.
export function areFriends(a, b) {
  a = Number(a); b = Number(b);
  if (!a || !b || a === b) return false;
  const hidden = restrictedIds();
  if (hidden.has(a) || hidden.has(b)) return false;
  return link(a, b)?.status === 'accepted';
}

export function friendIds(userId) {
  userId = Number(userId);
  const hidden = restrictedIds();
  if (!userId || hidden.has(userId)) return [];
  return db().prepare(`SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS id FROM friend_links
    WHERE status = 'accepted' AND (from_id = ? OR to_id = ?)`).all(userId, userId, userId).map((r) => r.id).filter((id) => !hidden.has(id));
}

const person = (id, extra = {}) => {
  const u = userById(id);
  return u ? { id: u.id, name: u.name, avatar: u.avatar || null, ...extra } : null;
};

// Settings → Friends: { friends, incoming, outgoing }, each a list of { id, name, avatar, at }.
export function view(user) {
  if (!social(user)) return { friends: [], incoming: [], outgoing: [], restricted: isRestricted(user) };
  const hidden = restrictedIds();
  const rows = db().prepare('SELECT * FROM friend_links WHERE from_id = ? OR to_id = ?').all(user.id, user.id);
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = r.from_id === user.id ? r.to_id : r.from_id;
    if (hidden.has(other)) continue;
    const p = person(other, { at: r.accepted_at || r.created_at });
    if (!p) continue;
    if (r.status === 'accepted') out.friends.push(p);
    else (r.from_id === user.id ? out.outgoing : out.incoming).push(p);
  }
  out.friends.sort((a, b) => a.name.localeCompare(b.name));
  out.incoming.sort((a, b) => b.at - a.at);
  out.outgoing.sort((a, b) => b.at - a.at);
  return out;
}

// People to add, by name: never restricted people, the Home network account or yourself.
export function search(user, query) {
  if (!social(user)) return [];
  const q = String(query ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.length < 2) return [];
  const hidden = restrictedIds();
  const rows = db().prepare("SELECT id, email, name FROM users WHERE id != ? AND email != ?").all(user.id, HOME);
  const name = (r) => (r.name || (isAccountId(r.email) ? '' : String(r.email).split('@')[0])).toLowerCase();
  const hits = rows.filter((r) => !hidden.has(r.id) && name(r).includes(q))
    .sort((a, b) => Number(!name(a).startsWith(q)) - Number(!name(b).startsWith(q)) || name(a).localeCompare(name(b)))
    .slice(0, 12);
  return hits.map((r) => {
    const l = link(user.id, r.id);
    const state = !l ? null : l.status === 'accepted' ? 'friend' : l.from_id === user.id ? 'sent' : 'received';
    return person(r.id, { state });
  }).filter(Boolean);
}

// Ask someone to be friends. Returns { state: 'sent' | 'friend', person, notify }: notify is true when the
// other person should hear about a new request (not for repeats or for an accepted one).
export function request(user, otherId) {
  otherId = Number(otherId);
  if (!social(user)) throw fail(403, 'Friends aren’t available on this account.');
  const other = userById(otherId);
  if (!other || other.id === user.id || !social(other) || homeAccount(other.id)) throw fail(404, 'That person can’t be added.');
  const existing = link(user.id, other.id);
  if (existing?.status === 'accepted') return { state: 'friend', person: person(other.id), notify: false };
  if (existing && existing.from_id === other.id) return { ...accept(user, other.id), accepted: true };
  if (existing) return { state: 'sent', person: person(other.id), notify: false };
  const pending = db().prepare("SELECT COUNT(*) AS n FROM friend_links WHERE from_id = ? AND status = 'pending'").get(user.id).n;
  if (pending >= MAX_PENDING) throw fail(429, 'You have a lot of open friend requests. Wait for some answers first.');
  if (friendIds(user.id).length >= MAX_FRIENDS) throw fail(400, 'That’s as many friends as Lilin keeps.');
  db().prepare("INSERT INTO friend_links (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(user.id, other.id, Date.now());
  return { state: 'sent', person: person(other.id), notify: true };
}

// Accept a request someone sent you.
export function accept(user, fromId) {
  fromId = Number(fromId);
  if (!social(user)) throw fail(403, 'Friends aren’t available on this account.');
  const r = db().prepare("SELECT * FROM friend_links WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(fromId, user.id);
  if (!r || restrictedIds().has(fromId)) throw fail(404, 'That friend request is gone.');
  db().prepare("UPDATE friend_links SET status = 'accepted', accepted_at = ? WHERE from_id = ? AND to_id = ?").run(Date.now(), fromId, user.id);
  return { state: 'friend', person: person(fromId), notify: true };
}

// Decline a request, take back your own, or stop being friends: all remove the link (quietly, no notification).
export function remove(user, otherId) {
  otherId = Number(otherId);
  const n = db().prepare('DELETE FROM friend_links WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(user.id, otherId, otherId, user.id).changes;
  if (!n) throw fail(404, 'Nothing to remove.');
  return { ok: true };
}

// profiles: where two people stand: 'friend', 'sent' (a asked b), 'received' (b asked a) or null.
export function stateBetween(a, b) {
  const l = link(Number(a), Number(b));
  if (!l) return null;
  if (l.status === 'accepted') return areFriends(a, b) ? 'friend' : null;
  return l.from_id === Number(a) ? 'sent' : 'received';
}

export const incomingCount = (user) => (social(user) ? view(user).incoming.length : 0);
