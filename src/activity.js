// Activity log: who did what, and who's been around lately.
// People are identified by the email Cloudflare Access adds to each request
// (Cf-Access-Authenticated-User-Email). Requests that skip Cloudflare, like opening the server's
// local address at home, show up as "Home network".
import fs from 'node:fs';
import path from 'node:path';

let ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
// Everything from the last year stays readable: the page used to get only the newest 300 entries (two busy days),
// so what quieter people did a few days ago looked like it had vanished.
const KEEP_MS = 365 * 24 * 3600 * 1000;
const KEEP_MAX = 200000;             // hard cap on entries kept in memory and in the file
const MAX_FILE = 64 * 1024 * 1024;   // the file is rewritten with only the kept entries past this size
const PAGE = 300;                    // entries per page of the feed
const PAGE_MAX = 5000;               // the most one request may ask for
const kept = (list) => { const cut = Date.now() - KEEP_MS; let i = 0; while (i < list.length && list[i].at < cut) i++; return list.slice(Math.max(i, list.length - KEEP_MAX)); };

let file = null;
let events = [];
const lastSeen = new Map();          // user -> { at, device }
const recentKeys = new Map();        // dedup key -> time
let resolveName = null;
let resolveAvatar = null;
let resolveId = null;

export function initActivity({ dataDir, nameForUser = null, avatarForUser = null, idForUser = null }) {
  resolveName = nameForUser;
  resolveAvatar = avatarForUser;
  resolveId = idForUser;
  file = path.join(dataDir, '.lilin-activity.jsonl');
  try {
    events = kept(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter((e) => e && Number.isFinite(e.at)));
  } catch { events = []; }
  for (const e of events) lastSeen.set(e.user, { at: e.at, device: e.device, location: e.location || null });
}

export const adminsConfigured = () => ADMINS.length > 0;

function userOf(req) {
  const email = String(req.headers['cf-access-authenticated-user-email'] || '').trim().toLowerCase();
  return email || 'Home network';
}

export const isAdmin = (req) => ADMINS.includes(userOf(req));
export const adminEmails = () => [...ADMINS];

// Someone switched from their email to a username account (usernames.js): every entry of theirs moves to
// the new identity and the email is gone from the log, in memory and in the file.
export function renameIdentity(previous, next) {
  const from = String(previous || '').toLowerCase();
  if (!from || !next) return;
  events = events.map((e) => (JSON.stringify(e).toLowerCase().includes(from) ? JSON.parse(replaceAllCi(JSON.stringify(e), from, next)) : e));
  for (const [user, seen] of [...lastSeen]) if (String(user).toLowerCase() === from) { lastSeen.delete(user); lastSeen.set(next, seen); }
  ADMINS = ADMINS.map((e) => (e === from ? next : e));
  if (file) fs.writeFileSync(file, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
}
// Every match of `find`, any case, replaced (no regex, so dots and pluses in an email mean themselves).
export function replaceAllCi(text, find, replacement) {
  const lower = text.toLowerCase();
  const f = find.toLowerCase();
  if (!f) return text;
  let out = '';
  let from = 0;
  for (let i = lower.indexOf(f); i !== -1; i = lower.indexOf(f, from)) { out += text.slice(from, i) + replacement; from = i + f.length; }
  return out + text.slice(from);
}

// "iPhone · Safari", "Windows · Firefox", ...
function deviceOf(req) {
  const ua = String(req.headers['user-agent'] || '');
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : null;
  return browser ? `${os} · ${browser}` : os;
}

// Approximate IP location supplied by Cloudflare. Never send visitor IPs to a lookup service.
export function locationOf(req) {
  if (!req.headers['cf-connecting-ip'] || !req.headers['cf-ray']) return null;
  const raw = String(req.headers['cf-ipcity'] || '');
  let city = Buffer.from(raw, 'latin1').toString('utf8');
  if (city.includes('\uFFFD')) city = raw;
  try { city = decodeURIComponent(city); } catch { /* already decoded */ }
  city = city.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  const country = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  const validCountry = /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
  return city || validCountry ? { city: city || null, country: validCountry } : null;
}

// Called for every API request.
export function seen(req) {
  lastSeen.set(userOf(req), { at: Date.now(), device: deviceOf(req), location: locationOf(req) });
}

// action: download | delete | play | cast | stop | subtitles. Repeats of the same thing by the same
// person within `quietMs` are logged once (a film played twice in a row, a page reloaded).
// `user` overrides who it's logged as (an invite is accepted before its new user has signed in).
export function record(req, action, detail, { quietMs = 0, user: who = null } = {}) {
  const user = who || userOf(req);
  const key = `${user}|${action}|${detail}`;
  if (quietMs && Date.now() - (recentKeys.get(key) || 0) < quietMs) return;
  recentKeys.set(key, Date.now());
  if (recentKeys.size > 500) recentKeys.delete(recentKeys.keys().next().value);
  const entry = { at: Date.now(), user, device: deviceOf(req), location: locationOf(req), action, detail: String(detail || '').slice(0, 300) };
  events.push(entry);
  if (events.length > KEEP_MAX * 1.1) events = kept(events);
  console.log(`[activity] ${user} (${entry.device}): ${action} ${entry.detail}`);
  if (!file) return;
  try {
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
    if (fs.statSync(file).size > MAX_FILE) fs.writeFileSync(file, (events = kept(events)).map((e) => JSON.stringify(e)).join('\n') + '\n');
  } catch { /* best effort */ }
}

// Same folding as the page's filter box: no accents, no case, letters and digits only.
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// The feed, newest first. `user` keeps one person's entries, `q` the ones whose person, title or device match;
// `limit` is how many to send (Show earlier asks for more); `since` makes sure everything after it is included
// (the page passes local midnight so today's numbers are whole). `more` says older matches exist.
export function report(opts = {}) {
  const { limit: want = PAGE, user: only = null, q = '', since = 0 } = typeof opts === 'number' ? { limit: opts } : opts;
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(want)) || PAGE));
  // Resolve at read time so a renamed profile also updates historical events, without rewriting
  // the stable email identity stored in the log or grouping different people with the same name.
  const names = new Map();
  const nameOf = (user) => {
    if (!names.has(user)) names.set(user, resolveName?.(user) || String(user).split('@')[0]);
    return names.get(user);
  };
  const avatars = new Map();
  const avatarOf = (user) => {
    if (!avatars.has(user)) avatars.set(user, resolveAvatar?.(user) || null);
    return avatars.get(user);
  };
  const ids = new Map();
  const idOf = (user) => {
    if (!ids.has(user)) ids.set(user, resolveId?.(user) ?? null);
    return ids.get(user);
  };
  return {
    people: [...lastSeen.entries()].map(([user, s]) => ({ user, id: idOf(user), name: nameOf(user), avatar: avatarOf(user), ...s })).sort((a, b) => b.at - a.at),
    ...feed(only, fold(q), limit, Number(since) || 0, nameOf),
  };
  function feed(person, needle, n, from, nameFor) {
    const out = [];
    let more = false;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (person && e.user !== person) continue;
      if (needle && !fold(`${e.user} ${nameFor(e.user)} ${e.action === 'revoke' ? nameFor(e.detail) : ''} ${e.detail} ${e.action} ${e.device || ''} ${e.location?.city || ''} ${e.location?.country || ''}`).includes(needle)) continue;
      if (out.length >= n && !(from && e.at >= from && out.length < PAGE_MAX)) { more = true; break; }
      out.push(e);
    }
    return { more, events: out.map((e) => ({ ...e, id: idOf(e.user), name: nameOf(e.user), avatar: avatarOf(e.user),
      ...(e.action === 'revoke' ? { subjectName: nameOf(e.detail) } : {}) })) };
  }
}
