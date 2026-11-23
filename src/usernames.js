// Usernames: people sign in with their @username (their profile handle, profiles.js) instead of an email.
//
// New people pick a username when they join (invites.js) and never give an email. Inside Lilin they are
// known by an account id made from their account's UUID (account-ids.js), so the username can change
// freely: sessions, the Cloudflare Access list and the sign-in token Lilin hands Cloudflare all carry the
// id, never the username.
//
// People who joined with an email keep signing in with it (or with their username) until they choose
// Account → Switch to a username. That moves everything of theirs from the email to their account id and
// then deletes the email everywhere Lilin kept it: the database, the activity log, invites, *_EMAILS
// lines in .env, the Cloudflare Access list (and its sign-ins) and the server logs.
import fs from 'node:fs';
import path from 'node:path';
import { database, accountFor, userById, uuidForUser, replaceOwnerIdentity } from './accounts.js';
import { cleanHandle, profileOf, idForHandle } from './profiles.js';
import { accountIdFor, isAccountId, newUuid } from './account-ids.js';
import { replaceAllCi } from './activity.js';

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });

let deps = {
  auth: null,        // auth.js: passwords and sessions
  activity: null,    // activity.js: renameIdentity
  invites: null,     // invites.js: addMember, removeMember, revokeAccess, renameIdentity, invitesConfigured
  envFile: null,     // .env, whose *_EMAILS lines follow an owner who switches
  logDirs: [],       // folders of *.log files the email is scrubbed from
};
export function initUsernames(options) { deps = { ...deps, ...options }; }

// The account a username signs in as ("ebi", "@Ebi" → its identity), or null.
export function identityForLogin(typed) {
  const handle = String(typed ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!handle || handle.includes('@')) return null;
  const id = idForHandle(handle);
  return id == null ? null : db().prepare('SELECT email FROM users WHERE id = ?').get(id)?.email || null;
}

// How someone signs in, for showing: "@ebi" for username accounts, the email for everyone else.
export function signInName(identity) {
  if (!isAccountId(identity)) return identity;
  const row = db().prepare('SELECT id FROM users WHERE email = ?').get(String(identity).toLowerCase());
  const user = row && userById(row.id);
  return user ? `@${profileOf(user).handle}` : '';
}

// A username someone wants (as typed), cleaned, or an error saying why it can't be theirs.
export function check(raw, userId = null) {
  const handle = cleanHandle(raw);
  const owner = idForHandle(handle);
  if (owner != null && owner !== userId) throw fail(409, 'That username is taken.');
  return handle;
}

// A new username account (an open invite): its id, the account and its username, all at once.
export function create(rawHandle) {
  const handle = check(rawHandle);
  const identity = accountIdFor(newUuid());
  db().exec('BEGIN IMMEDIATE');
  try {
    const user = accountFor(identity);
    if (idForHandle(handle) != null) throw fail(409, 'That username is taken.');
    db().prepare('INSERT INTO profiles (user_id, handle) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET handle = excluded.handle').run(user.id, handle);
    db().exec('COMMIT');
    return { identity, userId: user.id, handle };
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
}
// Takes a just-made account back out (Cloudflare or the password failed before anyone used it).
export function undo(made) {
  try { deps.auth?.store.remove(made.identity); } catch { /* no password yet */ }
  db().prepare('DELETE FROM users WHERE id = ? AND email = ?').run(made.userId, made.identity);
}

// Every table and text column holding identities, found rather than listed, so a table added later that
// keeps an email can't be missed. Full-text index tables are skipped (they follow their own triggers).
function identityColumns() {
  const tables = db().prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  const virtual = tables.filter((t) => /^CREATE VIRTUAL/i.test(t.sql || '')).map((t) => t.name);
  const out = [];
  for (const { name } of tables) {
    if (virtual.some((v) => name === v || name.startsWith(`${v}_`))) continue;
    for (const c of db().prepare(`PRAGMA table_info("${name}")`).all()) {
      if (/INT|REAL|BLOB|NUM/i.test(c.type || '')) continue;
      out.push([name, c.name]);
    }
  }
  return out;
}

function moveRows(previous, next) {
  let moved = 0;
  db().exec('BEGIN IMMEDIATE');
  try {
    db().exec('PRAGMA defer_foreign_keys = ON'); // logins' children (sessions) move in the same transaction
    for (const [table, column] of identityColumns()) {
      moved += db().prepare(`UPDATE "${table}" SET "${column}" = ? WHERE "${column}" = ? COLLATE NOCASE`).run(next, previous).changes;
    }
    db().exec('COMMIT');
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
  return moved;
}

// *_EMAILS lines in .env (ADMIN_EMAILS, NOTES_EMAILS, ...): the old email becomes the account id, in the
// file and in this running server.
function moveEnv(previous, next) {
  for (const key of Object.keys(process.env)) {
    if (!/_EMAILS$/.test(key)) continue;
    const list = String(process.env[key]).split(',').map((s) => s.trim());
    if (list.some((e) => e.toLowerCase() === previous)) process.env[key] = list.map((e) => (e.toLowerCase() === previous ? next : e)).join(',');
  }
  if (!deps.envFile || !fs.existsSync(deps.envFile)) return;
  const text = fs.readFileSync(deps.envFile, 'utf8');
  const out = text.split(/(\r?\n)/).map((line) => {
    const m = line.match(/^(\s*[A-Z0-9_]*_EMAILS\s*=\s*)(.*)$/);
    if (!m) return line;
    const bare = (e) => e.trim().replace(/^["']|["']$/g, '').toLowerCase();
    return m[1] + m[2].split(',').map((e) => (bare(e) === previous ? e.replace(/[^"'\s,]+@[^"'\s,]+/, next) : e)).join(',');
  }).join('');
  if (out !== text) fs.writeFileSync(deps.envFile, out);
}

// Logs keep growing while Lilin runs (another process may hold them open), so the email is overwritten in
// place with as many "x"s: same length, no gap where the writer carries on.
function scrubLogs(previous) {
  const mask = 'x'.repeat(previous.length);
  for (const dir of deps.logDirs || []) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => path.join(dir, f)); } catch { continue; }
    for (const file of files) {
      try {
        const text = fs.readFileSync(file, 'latin1');
        if (!text.toLowerCase().includes(previous)) continue;
        const fd = fs.openSync(file, 'r+');
        try { fs.writeSync(fd, Buffer.from(replaceAllCi(text, previous, mask), 'latin1'), 0, Buffer.byteLength(text, 'latin1'), 0); } finally { fs.closeSync(fd); }
      } catch (e) { console.warn('[usernames] couldn’t clean', path.basename(file), e.code || e.message); }
    }
  }
}

// Account → Switch to a username. Returns the new identity and username.
export async function switchToUsername(user, rawHandle) {
  const previous = String(user?.email || '').toLowerCase();
  if (!previous || !previous.includes('@')) throw fail(400, 'Only someone signed in with an email can switch.');
  if (isAccountId(previous)) throw fail(400, 'You already sign in with your username.');
  if (!deps.auth?.hasPassword(previous)) throw fail(400, 'Pick a Lilin password first: you’ll sign in with it and your username.');
  const handle = check(rawHandle, user.id);
  const uuid = uuidForUser(user.id);
  if (!uuid) throw fail(500, 'This account has no id yet. Reload and try again.');
  const next = accountIdFor(uuid);
  const inv = deps.invites;
  const cloudflare = Boolean(inv?.invitesConfigured());
  // The new id goes on the Access list first: if Cloudflare says no, nothing has changed yet.
  if (cloudflare) await inv.addMember(next);
  profileOf(user); // make sure there's a profile row to hold the username
  db().prepare('UPDATE profiles SET handle = ?, updated_at = ? WHERE user_id = ?').run(handle, Date.now(), user.id);
  const moved = moveRows(previous, next);
  deps.activity?.renameIdentity(previous, next);
  inv?.renameIdentity(previous, next);
  replaceOwnerIdentity(previous, next);
  moveEnv(previous, next);
  if (cloudflare) {
    // Off the list. Cloudflare's own sign-ins for the email are NOT revoked: that sent browsers round Cloudflare's
    // login in a loop (2026-11-23). They run out on their own; until then auth.js treats the email as unknown and
    // the browser's Lilin session (or Lilin's sign-in page) says who it is.
    await inv.removeMember(previous).catch((e) => console.warn('[usernames] access list:', e.message));
  }
  scrubLogs(previous);
  console.log(`[usernames] user ${user.id} now signs in as @${handle} (${moved} rows moved)`);
  return { identity: next, handle };
}
