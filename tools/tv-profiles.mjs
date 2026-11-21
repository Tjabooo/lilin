// Adds people as profiles on a TV from the Lilin host, without anyone pairing on the TV (src/tv-profiles.js).
//   node tools/tv-profiles.mjs list                          TVs that checked in, and profiles still waiting
//   node tools/tv-profiles.mjs add home-tv EMAIL [EMAIL...]   for the TV at home on the shared Home network account
//   node tools/tv-profiles.mjs add DEVICE EMAIL [EMAIL...]    for one TV (the start of its id from `list`)
// Each person gets a TV session of their own; the TV picks it up the next time it starts.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DATA_DIR } from '../src/paths.js';
import { SCHEMA, HOME_TV } from '../src/tv-profiles.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const db = new DatabaseSync(path.join(DATA_DIR, '.lilin.db'));
db.exec('PRAGMA busy_timeout = 5000');
db.exec(SCHEMA);
const [cmd, target, ...emails] = process.argv.slice(2);
const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '-');

if (cmd === 'list') {
  const devices = db.prepare('SELECT * FROM tv_devices ORDER BY last_seen DESC').all();
  if (!devices.length) console.log('No TV has checked in yet.');
  for (const d of devices) console.log(`${d.id.slice(0, 10)}  last seen ${when(d.last_seen)}  ${d.address || ''}  as ${d.who || '?'}`);
  for (const r of db.prepare('SELECT d.device, d.created_at, u.email FROM tv_profile_drops d LEFT JOIN users u ON u.id = d.user_id').all()) {
    console.log(`waiting: ${r.email} for ${r.device === HOME_TV ? HOME_TV : r.device.slice(0, 10)} (since ${when(r.created_at)})`);
  }
} else if (cmd === 'add' && target && emails.length) {
  let device = HOME_TV;
  if (target !== HOME_TV) {
    const found = db.prepare('SELECT id FROM tv_devices WHERE id LIKE ?').all(`${target.toLowerCase()}%`);
    if (found.length !== 1) throw new Error(found.length ? 'That id matches several TVs: give more of it.' : 'No TV with that id (see `list`).');
    device = found[0].id;
  }
  const t = Date.now();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
    if (!user) throw new Error(`No Lilin person with the email ${email}.`);
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO tv_sessions (id, email, created_at, expires_at, last_seen, address, agent) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(hash, email, t, t + 365 * 86400_000, t, null, 'Lilin TV app (profile)');
    db.prepare('INSERT INTO tv_profile_drops (device, token, user_id, created_at) VALUES (?, ?, ?, ?)').run(device, token, user.id, t);
    console.log(`Added ${user.name || email} for ${device === HOME_TV ? 'the home TV' : device.slice(0, 10)}.`);
  }
} else {
  console.log('Usage: node tools/tv-profiles.mjs list | add home-tv|DEVICE EMAIL [EMAIL...]');
  process.exitCode = 1;
}
