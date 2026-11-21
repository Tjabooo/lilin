// Profiles on a TV (Netflix-style "Who's watching?"): one TV keeps several people signed in, each with their own
// TV session (tv_sessions in auth.js), and the TV app picks one at start. The sessions live on the TV; the server
// only hands over profiles someone added for that TV from outside it (the owner's tools/tv-profiles.mjs).
//
// Each TV gets a device key the first time it asks (/api/tv/profiles/inbox); the key stays secret on the TV and
// only its hash is stored. A drop is a session made for one person and meant for one TV: it's handed over once and
// deleted. A drop for "home-tv" goes to the first TV that asks from the home network without its own session (the
// living-room TV on the shared Home network account), and from then on that TV's own key.
import crypto from 'node:crypto';

export const DEVICE_HEADER = 'x-lilin-tv-device';
export const HOME_TV = 'home-tv';
const DROP_TTL_MS = 14 * 86400_000;

export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
export const validKey = (key) => /^[A-Za-z0-9_-]{32,64}$/.test(String(key || ''));

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tv_devices (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    address TEXT,
    who TEXT
  );
  CREATE TABLE IF NOT EXISTS tv_profile_drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT NOT NULL,
    token TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

export function createTvProfiles(db, { now = () => Date.now() } = {}) {
  db.exec(SCHEMA);
  return {
    // The TV checks in: { device } when it got a new key, and the profiles waiting for it.
    // home: it asks from the home network without a session of its own (may take the "home-tv" drops).
    inbox(key, { address = null, who = '', home = false } = {}) {
      const t = now();
      let issued = null;
      let id = validKey(key) ? hashKey(key) : null;
      if (!id || !db.prepare('SELECT 1 FROM tv_devices WHERE id = ?').get(id)) {
        issued = crypto.randomBytes(32).toString('base64url');
        id = hashKey(issued);
        db.prepare('INSERT INTO tv_devices (id, created_at, last_seen, address, who) VALUES (?, ?, ?, ?, ?)').run(id, t, t, address, String(who).slice(0, 120));
      } else {
        db.prepare('UPDATE tv_devices SET last_seen = ?, address = ?, who = ? WHERE id = ?').run(t, address, String(who).slice(0, 120), id);
      }
      db.prepare('DELETE FROM tv_profile_drops WHERE created_at <= ?').run(t - DROP_TTL_MS);
      const targets = home ? [id, HOME_TV] : [id];
      const rows = db.prepare(`SELECT * FROM tv_profile_drops WHERE device IN (${targets.map(() => '?').join(',')}) ORDER BY id`).all(...targets);
      if (rows.length) db.prepare(`DELETE FROM tv_profile_drops WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id));
      return { device: issued, drops: rows.map((r) => ({ token: r.token, userId: r.user_id })) };
    },
  };
}
