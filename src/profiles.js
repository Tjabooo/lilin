// Profiles: everyone gets a page of their own, a bit like Letterboxd. A username (@handle), their picture and name
// (accounts.js), pronouns, a short bio, four favourite films or shows, and what they've watched lately, with their
// stars, likes, reviews and friends. The look is theirs to pick: accent colour, banner (a title, their own upload, a gradient), page colours, name font, poster shape,
// background, which sections show in which order, and extras: a status line, which four numbers show, one pinned review.
//
// Most people will never open the editor, so an untouched profile still has to look like something: a handle is
// made from the name on first view, the banner comes from a favourite or the last thing they watched, and the
// accent from their face tint (people.js) unless they pick one. Their lists (lists.js) are a section too.
//
// Who can see a profile (visibility): 'public' = everyone on this Lilin, 'friends' = friends only (the default,
// since nobody chose to show their watching before profiles existed), 'private' = only the person themselves.
// Everyone else gets the locked page: name, picture and handle only (those already show all over Lilin).
// Restricted people (accounts.isRestricted) have no social features: their profile is locked for everyone else
// and they can't open other people's. The shared Home network account has no profile at all.
//
// Activity comes from the watch log (social.js logWatch): a film counts once it was played for 40 minutes that day
// (or finished after 15 minutes of play in all), an episode once played for 15 (or finished after 5). One diary line per title per day; a line is a
// rewatch when the film (or one of the episodes) was already watched on an earlier day.
// A linked Letterboxd account (letterboxd.js) adds its diary: films watched elsewhere, with Letterboxd's own rewatch
// mark. They count in the diary and the film numbers, not in hours (Letterboxd doesn't know how long). Films its
// export only marks as watched (no day) count as watched but stay out of the diary.
import { database, userById, isRestricted } from './accounts.js';
import { areFriends, friendIds, stateBetween } from './friends.js';
import { validTitleKey, localDay } from './social.js';
import * as letterboxd from './letterboxd.js';
import * as animeLists from './anime-lists.js'; // linked MyAnimeList / AniList accounts: the Anime section
import { listsOf } from './lists.js';
import { hiddenKeys, hiddenList, NOT_HIDDEN, ensureTable as ensureHidden } from './profile-hidden.js'; // hide from profile

const HOME = 'home';
export const VISIBILITY = ['public', 'friends', 'private'];
export const SECTIONS = ['favorites', 'recent', 'stats', 'ratings', 'match', 'anime', 'reviews', 'lists', 'liked', 'friends'];
// sections that came later, and the one they follow (match: taste-match.js, only shown to friends)
const NEW_AFTER = { lists: 'reviews', match: 'ratings', anime: 'match' };
const SECTIONS_OFF = new Set(); // every section starts on; empty ones hide themselves for visitors
export const FONTS = ['display', 'condensed', 'light', 'serif', 'mono', 'rounded'];
export const POSTERS = ['soft', 'square', 'round', 'polaroid'];
export const BANNERS = ['auto', 'title', 'upload', 'gradient', 'none'];
export const GRADIENTS = ['ember', 'dusk', 'ocean', 'forest', 'rose', 'aurora', 'sunset', 'mono'];
export const BACKGROUNDS = ['glow', 'image', 'plain', 'color'];
export const ALIGNS = ['center', 'left'];
// frame: how the page's boxes look (Lilin's own panels, soft rounded cards, or open with no boxes at all);
// pattern: a faint texture over the background.
export const FRAMES = ['panel', 'soft', 'open'];
export const PATTERNS = ['none', 'dots', 'grid', 'stripes', 'grain', 'stars', 'hearts'];
// bannerY: the banner picture's focal point (0 = its top, 100 = its bottom). upload: when they last uploaded a banner
// of their own (profile-banner.js; set by the upload route, never by the editor). background 'color': the page is
// pageColor, or a gradient from pageColor to pageColor2 when pageGradient is on (the browser picks text that reads on it).
export const LOOK_DEFAULTS = { accent: null, banner: 'auto', gradient: 'ember', bannerKey: null, bannerImage: null, font: 'display', posters: 'soft', background: 'glow', align: 'center',
  bannerY: 28, upload: null, pageColor: null, pageColor2: null, pageGradient: true, frame: 'panel', pattern: 'none' };
// Extras: a short status line (cleared after a day or a week if they like), which four numbers show, one pinned review.
export const STATS = ['films', 'filmsThisYear', 'shows', 'episodes', 'hours', 'reviews', 'likes'];
export const STATS_DEFAULT = ['films', 'filmsThisYear', 'episodes', 'hours'];
export const MAX_STATS = 4;
export const MAX_STATUS = 80;
export const STATUS_CLEAR = { never: null, day: 86400_000, week: 7 * 86400_000 };
export const MAX_BIO = 300;
export const MAX_PRONOUNS = 24;
export const MAX_FAVORITES = 4;
const RESERVED = new Set(['admin', 'owner', 'lilin', 'home', 'me', 'settings', 'profile', 'profiles', 'api', 'help', 'support', 'everyone', 'friends', 'null', 'undefined']);
const HANDLE = /^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$/;
const HEX = /^#[0-9a-f]{6}$/;
const TMDB_IMAGE = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const FILM_SECONDS = 40 * 60;
const EPISODE_SECONDS = 15 * 60;
// finished (played to the end) counts with less, as long as this much of it was really played
const FINISHED_FILM_SECONDS = 15 * 60;
const FINISHED_EPISODE_SECONDS = 5 * 60;
const DIARY_PAGE = 30;

const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const parse = (s, fallback) => { try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; } };

export function initProfiles() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      handle TEXT UNIQUE COLLATE NOCASE,
      pronouns TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'friends',
      favorites TEXT NOT NULL DEFAULT '[]',
      look TEXT NOT NULL DEFAULT '{}',
      sections TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER
    );
  `);
  if (!db().prepare('PRAGMA table_info(profiles)').all().some((c) => c.name === 'extras')) db().exec(`ALTER TABLE profiles ADD COLUMN extras TEXT NOT NULL DEFAULT '{}'`);
  ensureHidden();
}

// ---------- cleaning what people type ----------
// One line, no control characters.
const line = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Plain text with line breaks (at most one empty line in a row). Shown as text, never as HTML.
export const cleanBio = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// A handle as typed ("@Ebi.Cat " → "ebi.cat"), or an error saying what's wrong with it.
export function cleanHandle(raw) {
  const h = String(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (h.length < 3 || h.length > 20) throw fail(400, 'A username is 3 to 20 characters.');
  if (!HANDLE.test(h) || /[._]{2}/.test(h)) throw fail(400, 'Use letters, numbers, dots and underscores (not at the start or end).');
  if (RESERVED.has(h)) throw fail(400, 'That username is taken.');
  return h;
}

// A username made from someone's name: "Åsa Lind" → "asalind"; "ebi" → "ebi"; too short → "user12".
export function handleFromName(name, id) {
  const base = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  return base.length >= 3 && !RESERVED.has(base) ? base : `user${id}`;
}

// The look: only known choices; anything else falls back to the default.
export function cleanLook(raw = {}, old = LOOK_DEFAULTS) {
  const pick = (k, list) => (k in raw ? (list.includes(raw[k]) ? raw[k] : LOOK_DEFAULTS[k]) : old[k] ?? LOOK_DEFAULTS[k]);
  const look = {
    accent: 'accent' in raw ? (HEX.test(String(raw.accent || '').toLowerCase()) ? String(raw.accent).toLowerCase() : null) : old.accent ?? null,
    banner: pick('banner', BANNERS), gradient: pick('gradient', GRADIENTS), font: pick('font', FONTS), posters: pick('posters', POSTERS),
    background: pick('background', BACKGROUNDS), align: pick('align', ALIGNS), frame: pick('frame', FRAMES), pattern: pick('pattern', PATTERNS),
    bannerKey: 'bannerKey' in raw ? (validTitleKey(raw.bannerKey) ? raw.bannerKey : null) : old.bannerKey ?? null,
    bannerImage: old.bannerImage ?? null,
    bannerY: 'bannerY' in raw ? (Number.isFinite(Number(raw.bannerY)) && raw.bannerY !== null && raw.bannerY !== '' ? Math.min(100, Math.max(0, Math.round(Number(raw.bannerY)))) : LOOK_DEFAULTS.bannerY) : old.bannerY ?? LOOK_DEFAULTS.bannerY,
    upload: Number.isSafeInteger(old.upload) && old.upload > 0 ? old.upload : null,
    pageColor: hexOr(raw, 'pageColor', old), pageColor2: hexOr(raw, 'pageColor2', old),
    pageGradient: 'pageGradient' in raw ? raw.pageGradient !== false : old.pageGradient !== false,
  };
  if (look.banner === 'title' && !look.bannerKey) look.banner = 'auto';
  if (look.banner === 'upload' && !look.upload) look.banner = 'auto';
  if (look.background === 'color' && !look.pageColor) look.background = LOOK_DEFAULTS.background;
  return look;
}
// A colour is "#rrggbb" in lower case or nothing: no names, no rgb(), nothing that could carry CSS.
const hexOr = (raw, k, old) => (k in raw ? (HEX.test(String(raw[k] || '').toLowerCase()) ? String(raw[k]).toLowerCase() : null) : old[k] ?? null);

// The extras, cleaned. raw.status: { text, clear: 'never'|'day'|'week' } (or a plain string); raw.stats: up to four of
// STATS; raw.pinned: a title key (save() checks it's one of their reviews). now dates a status that clears itself.
export function cleanExtras(raw = {}, old = {}, now = Date.now()) {
  const out = { status: old.status ?? null, stats: Array.isArray(old.stats) ? old.stats : null, pinned: old.pinned ?? null };
  if ('status' in raw) {
    const st = raw.status && typeof raw.status === 'object' ? raw.status : { text: raw.status };
    const text = line(st.text, MAX_STATUS + 1);
    if (text.length > MAX_STATUS) throw fail(400, `Keep the status under ${MAX_STATUS} characters.`);
    const clear = Object.hasOwn(STATUS_CLEAR, st.clear) ? st.clear : 'never';
    out.status = text ? { text, clear, until: STATUS_CLEAR[clear] ? now + STATUS_CLEAR[clear] : null } : null;
  }
  if ('stats' in raw) {
    const picked = [...new Set((Array.isArray(raw.stats) ? raw.stats : []).filter((k) => STATS.includes(k)))];
    if (picked.length > MAX_STATS) throw fail(400, 'Pick up to four numbers.');
    out.stats = picked.length ? STATS.filter((k) => picked.includes(k)) : null; // shown in a fixed order; none = the usual four
  }
  if ('pinned' in raw) out.pinned = raw.pinned ? (validTitleKey(raw.pinned) ? raw.pinned : undefined) : null;
  if (out.pinned === undefined) throw fail(400, 'Pin one of your own reviews.');
  return out;
}
// A status that hasn't cleared itself yet, or null.
export const liveStatus = (status, now = Date.now()) => (status?.text && (!status.until || status.until > now) ? status : null);

// Sections in the order given, each on or off; unknown ones dropped, missing ones added at the end.
export function cleanSections(raw) {
  const out = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    const id = typeof s === 'string' ? s : s?.id;
    if (SECTIONS.includes(id) && !out.some((o) => o.id === id)) out.push({ id, on: typeof s === 'string' ? true : s.on !== false });
  }
  // Sections added since a profile was saved (lists) go in after their neighbour; anything else missing at the end.
  for (const id of SECTIONS) {
    if (out.some((o) => o.id === id)) continue;
    const after = NEW_AFTER[id] ? out.findIndex((o) => o.id === NEW_AFTER[id]) : -1;
    out.splice(after < 0 ? out.length : after + 1, 0, { id, on: !SECTIONS_OFF.has(id) });
  }
  return out;
}

// ---------- the stored profile ----------
function row(userId) {
  return db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || null;
}
const handleTaken = (handle, userId) => Boolean(db().prepare('SELECT 1 FROM profiles WHERE handle = ? AND user_id != ?').get(handle, userId));

// The profile row for a person, made on first use (with a handle from their name).
export function profileOf(user) {
  let r = row(user.id);
  if (!r || !r.handle) {
    const base = handleFromName(user.name, user.id);
    let handle = base;
    for (let n = 2; handleTaken(handle, user.id); n++) handle = `${base.slice(0, 17)}${n}`;
    db().prepare('INSERT INTO profiles (user_id, handle) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET handle = excluded.handle').run(user.id, handle);
    r = row(user.id);
  }
  return {
    userId: r.user_id, handle: r.handle, pronouns: r.pronouns, bio: r.bio,
    visibility: VISIBILITY.includes(r.visibility) ? r.visibility : 'friends',
    favorites: parse(r.favorites, []).filter((f) => validTitleKey(f?.key)).slice(0, MAX_FAVORITES),
    look: lookOf(r),
    sections: cleanSections(parse(r.sections, [])),
    extras: extrasOf(r),
    updatedAt: r.updated_at,
  };
}
// The stored look, cleaned again on the way out (so an old or hand-edited row can't carry anything odd).
function lookOf(r) {
  const stored = parse(r.look, {});
  const kept = { ...LOOK_DEFAULTS, bannerImage: TMDB_IMAGE.test(String(stored.bannerImage || '')) ? stored.bannerImage : null, upload: stored.upload };
  return { ...LOOK_DEFAULTS, ...cleanLook(stored && typeof stored === 'object' ? stored : {}, kept) };
}
function extrasOf(r) {
  const stored = parse(r.extras, {});
  const e = stored && typeof stored === 'object' ? stored : {};
  const status = e.status?.text ? { text: line(e.status.text, MAX_STATUS), clear: Object.hasOwn(STATUS_CLEAR, e.status.clear) ? e.status.clear : 'never', until: Number.isSafeInteger(e.status.until) ? e.status.until : null } : null;
  const stats = Array.isArray(e.stats) ? STATS.filter((k) => e.stats.includes(k)).slice(0, MAX_STATS) : [];
  return { status, stats: stats.length ? stats : null, pinned: validTitleKey(e.pinned) ? e.pinned : null };
}

// A new uploaded banner (version = its upload time) or none (null). Removing it moves an uploaded banner back to auto.
export function setUpload(user, version, now = Date.now()) {
  const old = profileOf(user);
  const look = { ...old.look, upload: version || null };
  if (!look.upload && look.banner === 'upload') look.banner = 'auto';
  db().prepare('UPDATE profiles SET look = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(look), now, user.id);
  return profileOf(user);
}

export function idForHandle(handle) {
  const h = String(handle ?? '').trim().replace(/^@+/, '').toLowerCase();
  return db().prepare('SELECT user_id FROM profiles WHERE handle = ?').get(h)?.user_id ?? null;
}

const social = (user) => Boolean(user) && user.email !== HOME && user.email !== null;
// Who can have a page (and link a Letterboxd account to it): a signed-in account that isn't restricted.
export const canHaveProfile = (user) => social(user) && !isRestricted(user);

// What the viewer may see of target's profile: 'self', 'full' or 'locked'. Throws 404 for nobody, and for the Home
// network's shared account to anyone but itself (it sees its own history in You; it can't publish a page).
export function access(viewer, target) {
  if (target && viewer?.id === target.id) return 'self';
  if (!target || !social(target)) throw fail(404, 'No such profile.');
  if (isRestricted(viewer) || isRestricted(target)) return 'locked';
  const vis = profileOf(target).visibility;
  if (vis === 'public') return 'full';
  if (viewer?.isOwner) return 'full'; // the server's owners see every page, private or friends-only
  if (vis === 'friends' && areFriends(viewer.id, target.id)) return 'full';
  return 'locked';
}

// Saves what the person changed. resolve(key) → { id, type, title, year, poster, backdrop } from TMDB (the
// server's cache), used for favourites and a banner picked from a title. Returns the stored profile.
export async function save(user, body = {}, { resolve, now = Date.now() } = {}) {
  if (!social(user)) throw fail(403, 'Profiles need a signed-in account.');
  const old = profileOf(user);
  const next = { handle: old.handle, pronouns: old.pronouns, bio: old.bio, visibility: old.visibility, favorites: old.favorites, look: old.look, sections: old.sections };
  if ('handle' in body && String(body.handle ?? '').replace(/^@+/, '').trim().toLowerCase() !== old.handle) {
    const h = cleanHandle(body.handle);
    if (handleTaken(h, user.id)) throw fail(409, 'That username is taken.');
    next.handle = h;
  }
  if ('pronouns' in body) next.pronouns = line(body.pronouns, MAX_PRONOUNS);
  if ('bio' in body) {
    const bio = cleanBio(body.bio);
    if (bio.length > MAX_BIO) throw fail(400, `Keep the bio under ${MAX_BIO} characters.`);
    next.bio = bio;
  }
  if ('visibility' in body) {
    if (!VISIBILITY.includes(body.visibility)) throw fail(400, 'Choose who can see your profile.');
    next.visibility = body.visibility;
  }
  if ('favorites' in body) {
    const keys = [...new Set((Array.isArray(body.favorites) ? body.favorites : []).map((f) => (typeof f === 'string' ? f : f?.key)))];
    if (keys.length > MAX_FAVORITES) throw fail(400, 'Pick up to four favourites.');
    if (keys.some((k) => !validTitleKey(k))) throw fail(400, 'Which film or show?');
    const known = new Map(old.favorites.map((f) => [f.key, f]));
    next.favorites = [];
    for (const key of keys) {
      const card = known.get(key) || await resolve(key);
      if (!card) throw fail(502, 'Couldn’t look that title up. Try again in a moment.');
      next.favorites.push(snapshot(key, card));
    }
  }
  if ('look' in body && body.look && typeof body.look === 'object') {
    const look = cleanLook(body.look, old.look);
    if (look.banner === 'title' && (look.bannerKey !== old.look.bannerKey || !old.look.bannerImage)) {
      const card = await resolve(look.bannerKey);
      const image = card?.backdrop ? card.backdrop.replace(/\/t\/p\/w\d+\//, '/t/p/w1280/') : null;
      if (!image) throw fail(400, 'That title has no picture to use. Pick another one.');
      look.bannerImage = TMDB_IMAGE.test(image) ? image : null;
    }
    if (look.banner !== 'title') { look.bannerKey = null; look.bannerImage = null; }
    next.look = look;
  }
  if ('sections' in body) next.sections = cleanSections(body.sections);
  next.extras = cleanExtras(body, old.extras, now);
  if (next.extras.pinned && next.extras.pinned !== old.extras.pinned
    && !db().prepare("SELECT 1 FROM reviews WHERE user_id = ? AND title_key = ? AND text != ''").get(user.id, next.extras.pinned)) throw fail(400, 'Pin one of your own reviews.');
  db().prepare(`UPDATE profiles SET handle = ?, pronouns = ?, bio = ?, visibility = ?, favorites = ?, look = ?, sections = ?, extras = ?, updated_at = ? WHERE user_id = ?`)
    .run(next.handle, next.pronouns, next.bio, next.visibility, JSON.stringify(next.favorites), JSON.stringify(next.look), JSON.stringify(next.sections), JSON.stringify(next.extras), now, user.id);
  return profileOf(user);
}
const img = (u) => (TMDB_IMAGE.test(String(u || '')) ? u : null);
const snapshot = (key, c) => ({ key, id: Number(key.split(':')[1]), type: key.split(':')[0], title: line(c.title, 200) || 'Untitled', year: Number.isInteger(c.year) ? c.year : null, poster: img(c.poster), backdrop: img(c.backdrop) });

// ---------- what they watched ----------
// What a watch_log row is a watch of: the film, the episode, or (an episode without a number) the file itself.
const watchWhat = (r) => (r.title_key.startsWith('movie:') ? r.title_key
  : r.season != null && r.episode != null ? `${r.title_key}|${r.season}|${r.episode}` : `${r.title_key}|${r.ref}`);

// Every qualifying watch, oldest first: { key, type, title, day, at, season, episode, rewatch, letterboxd }.
function watches(userId) {
  // Finishing only counts after a real part of it was played (that day or before): opening an episode near its end
  // to look around marks it finished with seconds of play, and that isn't watching it.
  const rows = db().prepare(`SELECT title_key, title, day, ref, season, episode, finished, seconds, COALESCE(finished_at, last_at) AS at
    FROM watch_log w WHERE user_id = ? AND title_key IS NOT NULL
      AND (seconds >= CASE WHEN title_key LIKE 'movie:%' THEN ? ELSE ? END
        OR (finished = 1 AND (SELECT SUM(e.seconds) FROM watch_log e WHERE e.user_id = w.user_id AND e.ref = w.ref AND e.day <= w.day)
          >= CASE WHEN title_key LIKE 'movie:%' THEN ? ELSE ? END)
        OR (finished = 1 AND ref LIKE 'x:%'))
    ORDER BY at`).all(userId, FILM_SECONDS, EPISODE_SECONDS, FINISHED_FILM_SECONDS, FINISHED_EPISODE_SECONDS);
  for (const l of letterboxd.watchesOf(userId)) {
    if (!l.day) continue;
    // Letterboxd only has the day: noon that day keeps it in order next to what was watched here.
    rows.push({ title_key: l.key, title: l.title, day: l.day, ref: `lb:${l.key}`, season: null, episode: null, at: new Date(`${l.day}T12:00:00`).getTime(), lbRewatch: l.rewatch, letterboxd: true });
  }
  rows.sort((a, b) => a.at - b.at);
  // One viewing is one watch: half an episode one day and the rest the next counts once, on the day it was finished
  // (or the last day so far, while it isn't). Only watching it again after finishing it is a rewatch.
  const open = new Map(); // what → the index in out of its unfinished viewing
  const done = new Set(); // what has been finished at least once
  const out = [];
  for (const r of rows) {
    if (!validTitleKey(r.title_key)) continue;
    const type = r.title_key.slice(0, r.title_key.indexOf(':'));
    const what = watchWhat(r);
    const w = { key: r.title_key, type, title: r.title, day: r.day, at: r.at, season: r.season, episode: r.episode,
      rewatch: Boolean(r.lbRewatch) || (!r.letterboxd && done.has(what)), lbRewatch: Boolean(r.lbRewatch), letterboxd: Boolean(r.letterboxd) };
    if (r.letterboxd) { out.push(w); continue; }
    const cur = open.get(what);
    const secs = (cur?.secs || 0) + (Number(r.seconds) || 0);
    // Finished again with hardly anything played (opened near the end to look around): not a rewatch.
    if (r.finished && done.has(what) && !cur && secs < (type === 'movie' ? FINISHED_FILM_SECONDS : FINISHED_EPISODE_SECONDS) && !String(r.ref).startsWith('x:')) continue;
    if (cur) { w.rewatch = out[cur.i].rewatch; out[cur.i] = null; }
    out.push(w);
    if (r.finished) { done.add(what); open.delete(what); } else open.set(what, { i: out.length - 1, secs });
  }
  return out.filter(Boolean);
}

// Change when something was watched (the diary's Edit dates): every Lilin watch of `key` on `day` moves to `to`,
// keeping its time of day, or at `time` ("HH:MM") when given. episodes: [[season, episode]] moves only those.
// A watch already on the new day for the same video merges into it. Letterboxd logs stay as Letterboxd has them.
// Returns how many watches moved.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function moveWatch(userId, { key, day, to, time = null, episodes = null, now = Date.now() }) {
  if (!validTitleKey(key)) throw fail(400, 'Which film or show?');
  if (!DAY.test(String(day)) || !DAY.test(String(to)) || Number.isNaN(Date.parse(`${to}T12:00:00`))) throw fail(400, 'Pick a date.');
  if (to > localDay(now + 864e5) || to < '1900-01-01') throw fail(400, 'That date hasn’t happened yet.');
  const clock = time == null || time === '' ? null : /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time));
  if (time && !clock) throw fail(400, 'Pick a time.');
  let rows = db().prepare('SELECT * FROM watch_log WHERE user_id = ? AND title_key = ? AND day = ?').all(userId, key, day);
  if (Array.isArray(episodes)) {
    const want = new Set(episodes.map((e) => `${Number(e?.[0])}:${Number(e?.[1])}`));
    rows = rows.filter((r) => want.has(`${r.season}:${r.episode}`));
  }
  if (!rows.length) throw fail(404, 'Nothing watched here that day. Letterboxd logs change on Letterboxd.');
  // A viewing spread over days (half one evening, the rest the next) moves as one: the unfinished days before it
  // since it was last finished come along.
  const before = db().prepare('SELECT * FROM watch_log WHERE user_id = ? AND title_key = ? AND day < ? ORDER BY day DESC').all(userId, key, day);
  const taken = new Set(rows.map((r) => `${r.day}|${r.ref}`));
  for (const what of new Set(rows.map(watchWhat))) {
    for (const r of before.filter((x) => watchWhat(x) === what)) {
      if (r.finished) break;
      if (!taken.has(`${r.day}|${r.ref}`)) { taken.add(`${r.day}|${r.ref}`); rows.push(r); }
    }
  }
  if (to === day && !clock) return 0;
  const shift = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 864e5);
  const move = (at) => {
    if (at == null) return null;
    const d = new Date(at);
    d.setDate(d.getDate() + shift); // calendar days, so a summer-time change doesn't slide the clock
    if (clock) d.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return d.getTime();
  };
  const put = db().prepare(`INSERT INTO watch_log (user_id, day, ref, title_key, title, season, episode, seconds, together, finished, first_at, last_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, day, ref) DO UPDATE SET seconds = seconds + excluded.seconds, together = together + excluded.together,
      finished = MAX(finished, excluded.finished), first_at = MIN(first_at, excluded.first_at), last_at = MAX(last_at, excluded.last_at),
      finished_at = COALESCE(excluded.finished_at, finished_at)`);
  const drop = db().prepare('DELETE FROM watch_log WHERE user_id = ? AND day = ? AND ref = ?');
  db().exec('BEGIN'); // node:sqlite has no transaction helper
  try {
    for (const r of rows) {
      drop.run(userId, r.day, r.ref);
      put.run(userId, to, r.ref, r.title_key, r.title, r.season, r.episode, r.seconds, r.together || 0, r.finished, move(r.first_at), move(r.last_at), move(r.finished_at));
    }
    db().exec('COMMIT');
  } catch (err) { db().exec('ROLLBACK'); throw err; }
  return rows.length;
}

// Diary lines, newest first: one per title per day. { key, type, title, day, at, episodes: [[s, e]], rewatch,
// stars, liked, lilin, letterboxd }. lilin: watched here that day (at is the real time); letterboxd: logged on
// Letterboxd too (or only there, when lilin is false: then at is just noon that day).
// offset/limit page through them; more says whether there are older ones.
// type: 'movie' or 'tv' keeps only films or only shows (film stub numbers still count every film).
// hide: title keys left out (what they keep off their profile, for everyone but themselves).
const dayShift = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export function diary(userId, { offset = 0, limit = DIARY_PAGE, type = null, hide = null } = {}) {
  const lines = new Map();
  const line = (id, w) => {
    let l = lines.get(id);
    if (!l) { l = { key: w.key, type: w.type, title: w.title, day: w.day, at: 0, episodes: [], rewatch: false, lilin: false, letterboxd: false }; lines.set(id, l); }
    l.title = w.title || l.title;
    return l;
  };
  const ws = watches(userId);
  // What was watched here first: a film's line takes the real time it was watched.
  for (const w of ws) {
    if (w.letterboxd) continue;
    const l = line(`${w.key}|${w.day}`, w);
    l.lilin = true;
    l.at = Math.max(l.at, w.at);
    if (w.type === 'tv' && w.rewatch) l.rewatch = true; // films: worked out from the lines below
    if (w.type === 'tv' && w.season != null && w.episode != null && !l.episodes.some(([s, e]) => s === w.season && e === w.episode)) l.episodes.push([w.season, w.episode]);
  }
  // Then Letterboxd: a log joins the film's Lilin line that day, or the day either side (logged after midnight or
  // the morning after) if that line has no log yet; otherwise it's its own line, at noon (Letterboxd has no time).
  for (const w of ws) {
    if (!w.letterboxd) continue;
    const near = [0, -1, 1].map((n) => lines.get(`${w.key}|${dayShift(w.day, n)}`)).filter(Boolean);
    let l = near.find((x, i) => x.lilin && (i === 0 || !x.letterboxd)) || null;
    if (!l) { l = line(`${w.key}|${w.day}`, w); if (!l.lilin) l.at = Math.max(l.at, w.at); }
    l.letterboxd = true;
    if (w.lbRewatch) l.rewatch = true;
  }
  // A film is rewatched on every line after its first.
  const seenFilm = new Set();
  for (const l of [...lines.values()].filter((x) => x.type === 'movie').sort((x, y) => x.at - y.at)) {
    if (seenFilm.has(l.key)) l.rewatch = true;
    seenFilm.add(l.key);
  }
  const all = [...lines.values()].filter((l) => !hide?.has(l.key)).sort((a, b) => b.at - a.at);
  // Ticket stubs: every film line gets its number, counting from the first film ever watched (No. 1).
  let films = all.filter((l) => l.type === 'movie').length;
  for (const l of all) if (l.type === 'movie') l.stub = films--;
  const kept = type === 'movie' || type === 'tv' ? all.filter((l) => l.type === type) : all;
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(60, Math.max(1, Number(limit) || DIARY_PAGE));
  const page = kept.slice(offset, offset + limit);
  const stars = starsFor(userId, page.map((l) => l.key));
  const liked = likedSet(userId);
  for (const l of page) {
    l.episodes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    l.stars = stars.get(l.key) ?? null;
    l.liked = liked.has(l.key);
  }
  return { entries: page, more: kept.length > offset + limit, total: kept.length };
}

function starsFor(userId, keys) {
  const out = new Map();
  if (!keys.length) return out;
  const rows = db().prepare('SELECT title_key, stars FROM reviews WHERE user_id = ? AND stars IS NOT NULL').all(userId);
  const want = new Set(keys);
  for (const r of rows) if (want.has(r.title_key)) out.set(r.title_key, r.stars);
  return out;
}
const likedSet = (userId) => new Set(db().prepare('SELECT title_key FROM ratings WHERE user_id = ? AND value = 1').all(userId).map((r) => r.title_key));

// Recently watched titles for the profile's row: the newest line of each title, newest first.
export function recent(userId, limit = 8, hide = null) {
  const seen = new Set();
  const out = [];
  let offset = 0;
  for (;;) {
    const { entries, more } = diary(userId, { offset, limit: 60, hide });
    for (const e of entries) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      out.push(e);
      if (out.length >= limit) return out;
    }
    if (!more) return out;
    offset += 60;
  }
}

// The numbers at the top: films and shows watched, episodes, hours, reviews and likes.
export function stats(userId, now = Date.now()) {
  const w = watches(userId);
  const year = String(new Date(now).getFullYear());
  const films = new Set(w.filter((x) => x.type === 'movie').map((x) => x.key));
  for (const l of letterboxd.watchesOf(userId)) if (l.type === 'movie') films.add(l.key); // also the ones without a day
  const filmsThisYear = new Set(w.filter((x) => x.type === 'movie' && x.day.startsWith(year)).map((x) => x.key));
  const shows = new Set(w.filter((x) => x.type === 'tv').map((x) => x.key));
  const episodes = new Set(w.filter((x) => x.type === 'tv' && x.season != null).map((x) => `${x.key}|${x.season}|${x.episode}`));
  const seconds = db().prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM watch_log WHERE user_id = ?').get(userId).s;
  const reviews = db().prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND text != ''").get(userId).n;
  const likes = db().prepare('SELECT COUNT(*) AS n FROM ratings WHERE user_id = ? AND value = 1').get(userId).n;
  return { films: films.size, filmsThisYear: filmsThisYear.size, shows: shows.size, episodes: episodes.size, hours: Math.round(seconds / 3600), reviews, likes };
}

// How they give stars: counts for ½ to 5 in half stars (index 0 = ½, index 9 = 5), with the average.
export function ratings(userId) {
  const counts = Array(10).fill(0);
  for (const r of db().prepare('SELECT stars, COUNT(*) AS n FROM reviews WHERE user_id = ? AND stars IS NOT NULL GROUP BY stars').all(userId)) {
    const i = Math.round(r.stars * 2) - 1;
    if (i >= 0 && i < 10) counts[i] += r.n;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const average = total ? Math.round((counts.reduce((s, n, i) => s + n * (i + 1) / 2, 0) / total) * 10) / 10 : null;
  return { counts, total, average };
}

// Their written reviews, newest first.
// others: someone else is looking, so titles they hide from their profile stay out.
export function reviewsBy(userId, { offset = 0, limit = 3, others = false } = {}) {
  const rows = db().prepare(`SELECT title_key, stars, text, spoiler, title, created_at FROM reviews WHERE user_id = ? AND text != ''${others ? ` AND ${NOT_HIDDEN}` : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...(others ? [userId, userId] : [userId]), Math.min(40, limit) + 1, Math.max(0, offset));
  const more = rows.length > limit;
  return { reviews: rows.slice(0, limit).map((r) => ({ key: r.title_key, stars: r.stars, text: r.text, spoiler: Boolean(r.spoiler), title: r.title, created: r.created_at })), more };
}

// The review they pinned to the top of their profile, while it still exists and has words. Pinned is an explicit pick
// (like favourites), so hide from profile doesn't remove it.
export function pinnedReview(userId, key) {
  if (!key) return null;
  const r = db().prepare("SELECT title_key, stars, text, spoiler, title, created_at FROM reviews WHERE user_id = ? AND title_key = ? AND text != ''").get(userId, key);
  return r ? { key: r.title_key, stars: r.stars, text: r.text, spoiler: Boolean(r.spoiler), title: r.title, created: r.created_at } : null;
}

// Titles they gave a thumbs up, newest first (offset: the next page, for You → Liked).
export function likedBy(userId, limit = 12, offset = 0, others = false) {
  return db().prepare(`SELECT title_key AS key, title FROM ratings WHERE user_id = ? AND value = 1${others ? ` AND ${NOT_HIDDEN}` : ''} ORDER BY updated_at DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...(others ? [userId, userId] : [userId]), limit, Math.max(0, Number(offset) || 0));
}

// Their friends (faces on the profile), never restricted people.
export function friendsOf(userId) {
  return friendIds(userId).map((id) => userById(id)).filter(Boolean).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// What the viewer sees on target's profile, apart from title cards (the server adds those from TMDB).
export function view(viewer, target) {
  const sight = access(viewer, target);
  const p = profileOf(target);
  const self = sight === 'self';
  const person = { id: target.id, name: target.name, avatar: target.avatar, handle: p.handle };
  const friend = self ? null : isRestricted(viewer) || isRestricted(target) ? 'unavailable' : stateBetween(viewer.id, target.id);
  // Locked: colours and fonts only. No uploaded banner (the picture is theirs to share), no status.
  if (sight === 'locked') return { person, me: false, locked: true, visibility: p.visibility, friend, look: { ...p.look, upload: null, banner: p.look.banner === 'upload' ? 'gradient' : p.look.banner }, sections: [] };
  const on = (id) => self || p.sections.some((s) => s.id === id && s.on);
  const lb = letterboxd.status(target.id);
  const hide = self ? null : hiddenKeys(target.id); // what they keep off their profile
  return {
    person: { ...person, pronouns: p.pronouns, bio: p.bio, since: target.createdAt, status: liveStatus(p.extras.status) },
    statKeys: p.extras.stats || STATS_DEFAULT,
    pinned: pinnedReview(target.id, p.extras.pinned),
    // the editor needs the saved status as typed (and when it clears); others only see a live one
    extras: self ? p.extras : undefined,
    me: self, locked: false, visibility: p.visibility, friend,
    // an owner looking at a page that isn't shared with them (private, or friends-only and not friends)
    ownerPeek: !self && Boolean(viewer?.isOwner) && p.visibility !== 'public' && !(p.visibility === 'friends' && areFriends(viewer.id, target.id)), look: p.look, sections: p.sections,
    favorites: on('favorites') ? p.favorites : [],
    recent: on('recent') ? recent(target.id, 8, hide) : [],
    stats: on('stats') ? stats(target.id) : null,
    ratings: on('ratings') ? ratings(target.id) : null,
    reviews: on('reviews') ? reviewsBy(target.id, { others: !self }) : { reviews: [], more: false },
    liked: on('liked') ? likedBy(target.id, 12, 0, !self) : [],
    friends: on('friends') ? friendsOf(target.id) : [],
    lists: on('lists') ? listsOf(target.id, { self }) : [],
    // Only on their own view: what they keep off the profile (marked on their posters, and its own shelf).
    hidden: self ? hiddenList(target.id) : [],
    // Their Letterboxd link for everyone who can see the page; how syncing goes only for themselves.
    letterboxd: !lb.linked ? (self ? { linked: false } : null) : self ? lb : { linked: true, username: lb.username, url: lb.url },
    // Linked anime lists (anime-lists.js): the header links always, what's on the lists only while Anime is on.
    anime: animeLists.viewOf(target.id, { self }).map((a) => (on('anime') ? a : { service: a.service, name: a.name, username: a.username, url: a.url, stats: null, watching: [], finished: [], fullCount: 0 })),
  };
}
