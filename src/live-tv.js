// Live TV for the server (channels.js has the schedules): which channels each person sees, the guide, tuning
// in, and the owner's own channels. A channel plays in a Watch Together room (watch.js openLive), so the
// clock, the sync, the faces, chat and reactions are the same as in any room.
import { Channels, AUTO, poolFor, liveToken, FREEZE } from './channels.js';

const MIN = 60000, HOUR = 60 * MIN;
const AUTO_MIN = 2;   // titles an automatic channel needs before it's shown
const PICKS_MIN = 5;  // and a person's picks
const SERIES = new Set(['fresh', 'drama', 'scifi', 'action']); // a show's episodes in order between other titles

// deps: { file, watchRooms, accounts, social, library() -> items (see channels.js poolFor), timesOf(item),
//   mediaFor(key) -> room media | null, genres() -> [{ name, movie, tv }], name() -> display name, now,
//   picks() -> the TV picks for the owner's editor (tv-picks.js summary) | null }
export function createLiveTv(deps) {
  const now = deps.now || Date.now;
  const channels = deps.channels || new Channels({ file: deps.file, now });
  const { watchRooms, accounts, social } = deps;
  let cache = { at: 0, items: null, pending: null };

  async function items() {
    if (cache.items && now() - cache.at < MIN) return cache.items;
    cache.pending ||= Promise.resolve(deps.library()).then((list) => { cache = { at: now(), items: list || [], pending: null }; return cache.items; })
      .catch((e) => { cache.pending = null; throw e; });
    return cache.pending;
  }
  // A library change shows up in the guide at once (only the future changes, see channels.js).
  const libraryChanged = () => { cache.at = 0; };

  const picksOf = (userId) => {
    const keys = new Set(accounts.libraryOf(userId).keys());
    const disliked = social.dislikedKeys(userId);
    const liked = new Set([...social.likedKeys(userId)].filter((k) => !disliked.has(k)));
    return { keys, liked };
  };

  // Every channel there is, before anyone's access: the automatic ones, the owner's, then each person's picks.
  function definitions() {
    const out = AUTO.map((id, i) => ({ id, number: i + 1, kind: 'auto', order: id === 'anime' ? 'order' : SERIES.has(id) ? 'series' : 'shuffle' }));
    for (const c of channels.custom()) out.push({ ...c, kind: 'custom' });
    const people = accounts.listUsers().sort((a, b) => a.id - b.id);
    people.forEach((u, i) => out.push({ id: `picks-${u.id}`, number: 20 + i, kind: 'picks', picks: u.id, person: u.name, order: 'shuffle' }));
    return out;
  }

  // Who sees a channel. Someone's picks come from their library, which is theirs (and their shared library's)
  // to see; the owner's channels go to everyone unless the owner named who.
  function allows(def, user) {
    if (!user) return false;
    if (def.kind === 'picks') return accounts.sameLibrary(def.picks, user.id);
    if (def.kind === 'custom') return !def.audience?.length || def.audience.includes(user.id) || Boolean(user.isOwner);
    return true;
  }

  async function visible(user) {
    const list = await items();
    const out = [];
    for (const def of definitions()) {
      if (!allows(def, user)) continue;
      const pool = poolFor(def, list, { picksOf });
      const least = def.kind === 'picks' ? PICKS_MIN : def.kind === 'auto' ? AUTO_MIN : 1;
      if (pool.length < least && !(def.kind === 'custom' && user.isOwner)) continue;
      out.push({ def, pool });
    }
    return out;
  }

  async function ensure(def, pool, until) {
    if (!pool.length) return;
    await channels.extend(def, pool, until, deps.timesOf);
  }

  const programme = (e) => (e ? { s: e.s, e: e.e, ...e.m } : null);
  const describe = (def) => ({ id: def.id, number: def.number, kind: def.kind, name: def.name || null, person: def.person || null,
    token: liveToken(def.id) });

  // The room's timeline: the programme on now, where in its video, and when the next cut is.
  function timeline(first) {
    return (at) => {
      const def = definitions().find((d) => d.id === first.id) || first; // the owner may have changed it since
      const on = channels.at(def.id, at);
      // Running low on schedule while people watch: work out more (doesn't hold up this answer).
      if (channels.horizon(def.id) - at < 2 * HOUR) {
        items().then((list) => ensure(def, poolFor(def, list, { picksOf }), at + 4 * HOUR)).catch(() => {});
      }
      if (!on) {
        const upcoming = channels.between(def.id, at, at + HOUR)[0];
        return { media: null, position: 0, endsAt: upcoming ? upcoming.s : at + 30000, info: { channel: describe(def), now: null, next: programme(upcoming) } };
      }
      const { entry, place } = on;
      const media = deps.mediaFor(entry.k);
      return { media: media ? { ...media, live: true } : null, position: place.position, endsAt: entry.s + place.pieceEnds * 1000,
        info: { channel: describe(def), now: programme(entry), next: programme(channels.next(def.id, entry)), missing: !media } };
    };
  }

  // The guide: every channel this person sees, with its programmes between `from` and `to`.
  async function guide(user, { from, to } = {}) {
    const t = now();
    from = Math.max(t - 2 * HOUR, Number.isFinite(from) ? from : t - 30 * MIN);
    to = Math.min(t + 5 * HOUR, Math.max(from + HOUR, Number.isFinite(to) ? to : t + 3 * HOUR));
    const shown = await visible(user);
    await Promise.all(shown.map(({ def, pool }) => ensure(def, pool, to).catch((e) => console.warn(`[live] ${def.id}: ${e.message}`))));
    return {
      name: deps.name(), now: t, from, to, owner: Boolean(user.isOwner),
      channels: shown.map(({ def, pool }) => ({
        ...describe(def), size: pool.length,
        faces: watchRooms.liveFaces(liveToken(def.id)),
        programmes: channels.between(def.id, from, to).map(programme),
      })).sort((a, b) => a.number - b.number),
    };
  }

  // Tune in: the channel's room (opened if nobody's watching), joined by this viewer.
  async function tune(user, id, clientId) {
    const shown = await visible(user);
    const found = shown.find((c) => c.def.id === id);
    if (!found) throw Object.assign(new Error('This channel isn’t available to you.'), { status: 404 });
    if (!found.pool.length) throw Object.assign(new Error('This channel has nothing to show yet.'), { status: 409 });
    await ensure(found.def, found.pool, now() + 3 * HOUR);
    const token = liveToken(id);
    const def = found.def;
    watchRooms.openLive(token, { channel: id, allows: (u) => allows(def, u), timeline: timeline(def) });
    return watchRooms.join(token, user, clientId);
  }

  // ---------- the owner's channels ----------
  async function editor() {
    const list = await items();
    const shows = new Map();
    for (const i of list) if (i.kind === 'episode' && i.show && !shows.has(i.show)) shows.set(i.show, { id: i.show, title: i.showTitle || i.title });
    const present = new Set(list.flatMap((i) => i.genres || []));
    const genres = (await Promise.resolve(deps.genres()).catch(() => [])).filter((g) => present.has(g.movie) || present.has(g.tv));
    return {
      name: deps.name(), nameSetting: accounts.serverSettings().liveName || '',
      picks: deps.picks ? deps.picks() : null,
      channels: channels.custom(),
      shows: [...shows.values()].sort((a, b) => a.title.localeCompare(b.title)),
      genres: genres.map((g) => ({ name: g.name, ids: [g.movie, g.tv].filter(Boolean) })),
      people: accounts.listUsers().map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null })),
    };
  }
  function saveChannel(input) {
    const saved = channels.saveCustom(input);
    // A channel someone's watching takes the new rules after what's on now.
    const room = watchRooms.rooms.get(liveToken(saved.id));
    if (room?.live) room.live.allows = (u) => allows({ ...saved, kind: 'custom' }, u);
    return saved;
  }
  function removeChannel(id) {
    channels.removeCustom(id);
    const room = watchRooms.rooms.get(liveToken(id));
    if (room) watchRooms.end(room);
  }

  // Titles (a show counts once) on each automatic channel: where Live TV picks are needed most.
  async function sizes() {
    const list = await items();
    const out = {};
    for (const def of definitions().filter((d) => d.kind === 'auto')) {
      out[def.id] = new Set(poolFor(def, list, { picksOf }).map((i) => (i.kind === 'episode' && i.show) || i.key)).size;
    }
    return out;
  }

  return { sizes, channels, guide, tune, editor, saveChannel, removeChannel, libraryChanged, definitions, allows, items, FREEZE };
}
