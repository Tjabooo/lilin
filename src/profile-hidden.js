// Titles someone keeps off their profile (the "Hide from my profile" switch in a title page's ⋯ menu).
// Other people never see a hidden film or show on that person's profile: not in Recently watched, the
// diary, Liked, Reviews or Taste match, and not as a "liked by" face on the title's page. The person
// themselves still sees everything, and their history, My list and recommendations stay as they were.
import { database } from './accounts.js';
import { validTitleKey } from './social.js';

const ready = new WeakSet(); // databases that already have the table (tests open fresh ones)
function db() {
  const d = database();
  if (!ready.has(d)) {
    d.exec(`CREATE TABLE IF NOT EXISTS profile_hidden (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, title_key)
    )`);
    ready.add(d);
  }
  return d;
}
const fail = (status, message) => Object.assign(new Error(message), { status });

// Every title key this person hides, as a Set.
export const hiddenKeys = (userId) => new Set(db().prepare('SELECT title_key FROM profile_hidden WHERE user_id = ?').all(userId).map((r) => r.title_key));
export const isHidden = (userId, key) => Boolean(db().prepare('SELECT 1 FROM profile_hidden WHERE user_id = ? AND title_key = ?').get(userId, key));
// The people who hide this title (title page faces leave them out).
export const hiddenBy = (key) => new Set(db().prepare('SELECT user_id FROM profile_hidden WHERE title_key = ?').all(key).map((r) => r.user_id));

export function setHidden(userId, key, hidden, now = Date.now()) {
  if (!validTitleKey(key)) throw fail(400, 'Which film or show?');
  if (hidden) db().prepare('INSERT OR IGNORE INTO profile_hidden (user_id, title_key, created_at) VALUES (?, ?, ?)').run(userId, key, now);
  else db().prepare('DELETE FROM profile_hidden WHERE user_id = ? AND title_key = ?').run(userId, key);
  return isHidden(userId, key);
}

// SQL to keep a person's hidden titles out of a query on their own rows (bind the user id once more).
export const NOT_HIDDEN = 'title_key NOT IN (SELECT title_key FROM profile_hidden WHERE user_id = ?)';
export const ensureTable = () => { db(); };
