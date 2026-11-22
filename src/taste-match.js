// Taste match: on a friend's profile, how close your taste is to theirs ("Taste match: High"), Last.fm style,
// worked out from the stars and thumbs you've both given the same films and shows (Letterboxd imports included:
// letterboxd.js writes them into the same tables). Under it, three short lists: what you both loved, where you
// split, and what they loved that you haven't seen.
//
// The level is a word (low, medium, high, veryHigh, super), never a number. Every opinion becomes stars
// (a like without stars = 4½, a thumbs down without stars = 1½; a like next to stars lifts them to at least 4),
// the gap between the two of you is averaged over the titles you've both rated, and with few titles that
// average leans toward an ordinary gap (PRIOR), so ten lucky likes don't make "Super" on their own.
// Under MIN_COMMON titles in common there's no level, only how many you have so far.
//
// Who sees it: friends only (friends.js), on the friend's profile when they can see it in full, never for
// restricted people or the Home network account, and the friend can switch the section off (profiles.js
// SECTIONS 'match'). A thumbs down on its own is private in Lilin ("only you see this"), so the split list never
// shows the other person's bare thumbs down: a split is listed only when their side is stars or a like.
// The level itself counts those thumbs too: it's a word over ten or more titles, like the title averages.
import { database, isRestricted } from './accounts.js';
import { areFriends } from './friends.js';
import { validTitleKey } from './social.js';
import * as letterboxd from './letterboxd.js';

export const MIN_COMMON = 10;
export const LEVELS = ['low', 'medium', 'high', 'veryHigh', 'super'];
const LIKE = 4.5;          // a thumbs up without stars, in stars
const DISLIKE = 1.5;       // a thumbs down without stars
const LOVED = 4;           // stars (or more) that count as loving it
const SPLIT = 2;           // stars apart that count as a split
const PRIOR = 1.25;        // the gap a few titles lean toward (two random people sit around 1)
const PRIOR_WEIGHT = 4;    // how many titles' worth that lean is
const BOUNDS = [0.45, 0.7, 0.95, 1.3]; // average gap in stars: up to 0.45 = super … over 1.3 = low
const MAX = { both: 10, split: 6, theirs: 8 };

const db = () => database();

// One person's opinion in stars (½-5), or null when there's none.
export function valueOf({ stars = null, thumb = 0 } = {}) {
  if (stars != null) return thumb === 1 ? Math.max(stars, LOVED) : thumb === -1 ? Math.min(stars, 2) : stars;
  return thumb === 1 ? LIKE : thumb === -1 ? DISLIKE : null;
}

// Everything a person rated: title key → { key, title, stars, thumb, value, at }.
export function opinionsOf(userId) {
  const out = new Map();
  const get = (key) => {
    let o = out.get(key);
    if (!o) { o = { key, title: '', stars: null, thumb: 0, value: null, at: 0 }; out.set(key, o); }
    return o;
  };
  for (const r of db().prepare('SELECT title_key, value, title, updated_at FROM ratings WHERE user_id = ?').all(userId)) {
    if (!validTitleKey(r.title_key)) continue;
    const o = get(r.title_key);
    o.thumb = r.value; o.title = r.title || o.title; o.at = Math.max(o.at, r.updated_at || 0);
  }
  for (const r of db().prepare('SELECT title_key, stars, title, updated_at FROM reviews WHERE user_id = ? AND stars IS NOT NULL').all(userId)) {
    if (!validTitleKey(r.title_key)) continue;
    const o = get(r.title_key);
    o.stars = r.stars; o.title = o.title || r.title || ''; o.at = Math.max(o.at, r.updated_at || 0);
  }
  for (const [key, o] of out) { o.value = valueOf(o); if (o.value == null) out.delete(key); }
  return out;
}

// The level for a list of gaps (stars apart, one per title in common), or null with too few.
export function levelFor(gaps) {
  if (gaps.length < MIN_COMMON) return null;
  const gap = (gaps.reduce((a, b) => a + b, 0) + PRIOR * PRIOR_WEIGHT) / (gaps.length + PRIOR_WEIGHT);
  const i = BOUNDS.findIndex((b) => gap <= b);
  return i < 0 ? LEVELS[0] : LEVELS[LEVELS.length - 1 - i];
}

// What the other person's side may show: their stars, or that they liked it; never a bare thumbs down.
const shown = (o) => (o.stars != null ? { stars: o.stars, liked: o.thumb === 1 } : o.thumb === 1 ? { stars: null, liked: true } : null);
const own = (o) => ({ stars: o.stars, liked: o.thumb === 1, disliked: o.stars == null && o.thumb === -1 });

// Films and shows someone has started or logged (here or on Letterboxd), for "you haven't seen".
function seenBy(userId) {
  const seen = new Set(db().prepare('SELECT DISTINCT title_key FROM watch_log WHERE user_id = ? AND title_key IS NOT NULL').all(userId).map((r) => r.title_key));
  for (const w of letterboxd.watchesOf(userId)) seen.add(w.key);
  return seen;
}

// viewer and friend compared: { level, common, need, both, split, theirs }, each list [{ key, title, … }] (no cards).
export function compare(viewerId, friendId) {
  const mine = opinionsOf(viewerId);
  const theirs = opinionsOf(friendId);
  const gaps = [];
  const both = [];
  const split = [];
  for (const [key, a] of mine) {
    const b = theirs.get(key);
    if (!b) continue;
    const gap = Math.abs(a.value - b.value);
    gaps.push(gap);
    const title = a.title || b.title;
    const at = Math.max(a.at, b.at);
    if (a.value >= LOVED && b.value >= LOVED) both.push({ key, title, at, low: Math.min(a.value, b.value), sum: a.value + b.value });
    else if (gap >= SPLIT) {
      const them = shown(b);
      if (them) split.push({ key, title, at, gap, mine: own(a), theirs: them });
    }
  }
  both.sort((x, y) => y.low - x.low || y.sum - x.sum || y.at - x.at);
  split.sort((x, y) => y.gap - x.gap || y.at - x.at);
  const seen = seenBy(viewerId);
  const unseen = [...theirs.values()].filter((o) => o.value >= LOVED && !mine.has(o.key) && !seen.has(o.key))
    .sort((x, y) => y.value - x.value || y.at - x.at);
  const clean = ({ key, title }) => ({ key, title });
  return {
    level: levelFor(gaps), common: gaps.length, need: MIN_COMMON,
    both: both.slice(0, MAX.both).map(clean),
    split: split.slice(0, MAX.split).map((s) => ({ ...clean(s), mine: s.mine, theirs: s.theirs })),
    theirs: unseen.slice(0, MAX.theirs).map((o) => ({ ...clean(o), ...shown(o) })),
  };
}

// Whether viewer gets a taste match on target's profile (view = profiles.view(viewer, target)).
export function visible(viewer, target, view) {
  if (!viewer || !target || viewer.id === target.id || !view || view.locked || view.me) return false;
  if (isRestricted(viewer) || isRestricted(target) || !areFriends(viewer.id, target.id)) return false;
  return (view.sections || []).some((s) => s.id === 'match' && s.on);
}

// The profile's taste match with title cards (withCards adds { card } from TMDB), or null when there's nothing
// to show: not a friend, the section is off, or neither of you has rated anything the other could use.
export async function forProfile(viewer, target, view, { withCards }) {
  if (!visible(viewer, target, view)) return null;
  const m = compare(viewer.id, target.id);
  if (!m.common && !m.theirs.length) return null;
  const [both, split, theirs] = await Promise.all([withCards(m.both), withCards(m.split), withCards(m.theirs)]);
  return { ...m, both, split, theirs };
}
