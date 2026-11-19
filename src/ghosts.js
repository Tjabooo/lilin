// Ghost reactions: Watch Together for people who are never online at the same time. While you watch, you drop an
// emoji at a moment (the player's smiley button); when a friend watches the same film or episode later, it pops up
// over the picture at that second ("ebi 💀 at 41:12"). The seek bar gets a small mark where friends reacted.
//
// A reaction belongs to what was watched, not to a file: a film is its title key (movie:603), an episode its show's
// key plus season and episode. So a friend who plays another copy of the film (another quality, a version) still
// sees them. Copies can be cut a little differently; a few seconds off doesn't spoil a 💀.
//
// Who sees whose: your own and your friends' (friends.js), nobody else's. Restricted people (accounts.isRestricted)
// can't react and don't see any; reactions they left before are hidden. The server passes friends and hidden in.
import { database } from './accounts.js';
import { validTitleKey } from './social.js';

// The tray in the player. Kept short on purpose: picking has to be quick while the film keeps going.
export const EMOJI = ['💀', '😂', '😭', '😱', '😍', '🔥', '👀', '🤯', '😬', '👏', '💔', '🫠'];
const PER_MINUTE = 30;        // reactions per person per minute (a frantic scene is fine, a held-down key isn't)
const PER_VIDEO = 400;        // per person per film or episode
const SAME_WINDOW = 2;        // seconds: the same emoji again this close to the last one is the same reaction
const MAX_SECONDS = 12 * 3600;

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const recent = new Map();     // userId -> [ms] of reactions in the last minute

export function initGhosts() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS ghost_reactions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_key TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      at REAL NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ghost_reactions_video ON ghost_reactions(title_key, season, episode, at);
  `);
}

const int = (v) => (v === null || v === undefined || v === '' ? null : Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);

// What was watched: { key, season, episode }, checked. Films have no season or episode; episodes need both.
export function videoOf(raw = {}) {
  const key = String(raw.key || '');
  if (!validTitleKey(key)) throw fail(400, 'Which film or episode?');
  const season = int(raw.season), episode = int(raw.episode);
  if (Number.isNaN(season) || Number.isNaN(episode)) throw fail(400, 'Which episode?');
  if (key.startsWith('movie:')) return { key, season: null, episode: null };
  if (season == null || episode == null) throw fail(400, 'Which episode?');
  return { key, season, episode };
}

const sameVideo = 'title_key = ? AND season IS ? AND episode IS ?';

// Saves a reaction at `at` seconds. Returns { id, at, emoji, created }.
export function add(userId, body = {}, now = Date.now()) {
  const v = videoOf(body);
  const emoji = String(body.emoji || '');
  if (!EMOJI.includes(emoji)) throw fail(400, 'Pick one of the reactions.');
  const at = Math.round(Number(body.at) * 10) / 10;
  if (!Number.isFinite(at) || at < 0 || at > MAX_SECONDS) throw fail(400, 'When in the video?');
  const times = (recent.get(userId) || []).filter((t) => now - t < 60000);
  if (times.length >= PER_MINUTE) throw fail(429, 'Easy there. Try again in a moment.');
  const dup = db().prepare(`SELECT id, at, emoji, created_at FROM ghost_reactions WHERE user_id = ? AND ${sameVideo} AND emoji = ? AND ABS(at - ?) < ?`)
    .get(userId, v.key, v.season, v.episode, emoji, at, SAME_WINDOW);
  if (dup) return { id: dup.id, at: dup.at, emoji: dup.emoji, created: dup.created_at };
  const n = db().prepare(`SELECT COUNT(*) AS n FROM ghost_reactions WHERE user_id = ? AND ${sameVideo}`).get(userId, v.key, v.season, v.episode).n;
  if (n >= PER_VIDEO) throw fail(429, 'That’s a lot of reactions for one video. Remove a few first.');
  times.push(now);
  recent.set(userId, times);
  const r = db().prepare('INSERT INTO ghost_reactions (user_id, title_key, season, episode, at, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, v.key, v.season, v.episode, at, emoji, now);
  return { id: Number(r.lastInsertRowid), at, emoji, created: now };
}

// Takes back one of your own reactions.
export function remove(userId, id) {
  const r = db().prepare('DELETE FROM ghost_reactions WHERE id = ? AND user_id = ?').run(Number(id) || 0, userId);
  if (!r.changes) throw fail(404, 'That reaction is gone already.');
}

// Reactions on a video the viewer may see: their own and their friends', in order of when in the video.
// friends: Set of friend ids; hidden(id): left out (restricted people). nameOf/avatarOf fill in who.
export function forVideo(viewerId, raw, { friends = new Set(), hidden = () => false, nameOf = () => 'Someone', avatarOf = () => null } = {}) {
  const v = videoOf(raw);
  const rows = db().prepare(`SELECT id, user_id, at, emoji, created_at FROM ghost_reactions WHERE ${sameVideo} ORDER BY at, id`).all(v.key, v.season, v.episode);
  const out = [];
  for (const r of rows) {
    const mine = r.user_id === viewerId;
    if (!mine && (!friends.has(r.user_id) || hidden(r.user_id))) continue;
    out.push({ id: r.id, userId: r.user_id, name: mine ? null : nameOf(r.user_id), avatar: avatarOf(r.user_id), at: r.at, emoji: r.emoji, created: r.created_at, mine });
  }
  return { reactions: out, emoji: EMOJI };
}

// For tests.
export const _reset = () => recent.clear();
