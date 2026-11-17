// Chat on Live TV channels. A channel plays in a Watch Together room (watch.js openLive) that closes a minute
// after the last viewer leaves, but its chat belongs to the channel: the last messages are kept here, in memory
// and in DATA_DIR/.lilin-live-chat.json, so whoever tunes in later still sees what was said. The room's own chat
// plumbing (rate limits, the event stream) carries the messages; this module decides who may post and read.
// Restricted people (Restrict in People) get none of it: they can't post, and the stream never sends them a
// message, the history or a reaction. Normal Watch Together rooms aren't affected.
import fs from 'node:fs';

export const KEEP = 50;                        // messages kept per channel (the player shows the same 50)
export const MAX_AGE = 14 * 24 * 3600000;      // older ones are dropped, so a quiet channel doesn't greet people with last month
const BURST = 8, BURST_MS = 15000;             // per person, across all their devices (watch.js limits each device too)
const REPEAT_MS = 30000;                       // the same message twice within this is refused

const fail = (status, message) => Object.assign(new Error(message), { status });
// server.js passes accounts.isRestricted; without it (tests) the user object's own flag decides.
const defaultRestricted = (user) => Boolean(user?.restricted);

export class LiveChat {
  // file: where the history is kept (null = memory only). userById: account id -> user (who reads the stream is
  // checked on every message, so Restrict takes effect at once). rooms + tokenOf: the WatchRooms and liveToken, so a
  // deleted message also leaves the screens of everyone tuned in.
  constructor({ file = null, now = Date.now, userById = () => null, isRestricted = defaultRestricted, rooms = null, tokenOf = null } = {}) {
    Object.assign(this, { file, now, userById, isRestricted, rooms, tokenOf });
    this.channels = new Map(); // id -> { seq, messages }
    this.recent = new Map();   // user id -> [{ at, text }]
    this.timer = null;
    if (file) this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [id, c] of Object.entries(saved.channels || {})) {
        if (!/^[\w-]{1,40}$/.test(id) || !Array.isArray(c.messages)) continue;
        const messages = c.messages.filter((m) => m && Number.isFinite(m.id) && typeof m.text === 'string').slice(-KEEP);
        this.channels.set(id, { seq: Math.max(Number(c.seq) || 0, ...messages.map((m) => m.id)), messages });
      }
    } catch { /* no history yet */ }
  }

  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 1500);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.file) return;
    const channels = {};
    for (const [id, c] of this.channels) if (c.messages.length || c.seq) channels[id] = c;
    try {
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ v: 1, channels }));
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch (e) { console.warn(`[live-chat] ${e.message}`); }
  }

  entry(id) {
    let c = this.channels.get(id);
    if (!c) { c = { seq: 0, messages: [] }; this.channels.set(id, c); }
    return c;
  }

  // The channel's messages, oldest first (the same array each time, so watch.js can hand it straight to the stream).
  log(id) {
    const c = this.entry(id);
    const cut = this.now() - MAX_AGE;
    if (c.messages.length && c.messages[0].at < cut) {
      const keep = c.messages.findIndex((m) => m.at >= cut);
      c.messages.splice(0, keep === -1 ? c.messages.length : keep);
      this.save();
    }
    return c.messages;
  }

  closedTo(user) { return !user || Boolean(this.isRestricted(user)); }
  reads(userId) { return !this.closedTo(this.userById(userId)); }

  // May this person say this now? Throws the reason if not.
  admit(user, text) {
    if (this.closedTo(user)) throw fail(403, 'Chat isn’t available to you on this channel.');
    const t = this.now();
    const mine = (this.recent.get(user.id) || []).filter((r) => t - r.at < Math.max(BURST_MS, REPEAT_MS));
    if (mine.filter((r) => t - r.at < BURST_MS).length >= BURST) throw fail(429, 'Slow down a little: too many messages.');
    const same = String(text).toLowerCase();
    if (mine.some((r) => t - r.at < REPEAT_MS && r.text === same)) throw fail(429, 'You just said that.');
    mine.push({ at: t, text: same });
    this.recent.set(user.id, mine);
    if (this.recent.size > 500) for (const [id, list] of this.recent) if (!list.some((r) => t - r.at < REPEAT_MS)) this.recent.delete(id);
  }

  add(id, message) {
    const c = this.entry(id);
    c.messages.push(message);
    if (c.messages.length > KEEP) c.messages.splice(0, c.messages.length - KEEP);
    this.save();
    return message;
  }

  // What watch.js gets in room.live.chat for one channel.
  forChannel(id) {
    return {
      log: () => this.log(id),
      nextId: () => ++this.entry(id).seq,
      add: (message) => this.add(id, message),
      admit: (user, text) => this.admit(user, text),
      admitReaction: (user) => { if (this.closedTo(user)) throw fail(403, 'Chat isn’t available to you on this channel.'); },
      reads: (userId) => this.reads(userId),
    };
  }

  // The owner takes a message down: gone from the history and from every screen tuned in.
  remove(id, messageId) {
    const c = this.channels.get(id);
    const at = c ? c.messages.findIndex((m) => m.id === messageId) : -1;
    if (at < 0) throw fail(404, 'That message is already gone.');
    c.messages.splice(at, 1);
    this.save();
    const room = this.rooms && this.tokenOf ? this.rooms.rooms.get(this.tokenOf(id)) : null;
    if (room?.live) this.rooms.broadcast(room, { chatLog: c.messages });
    return true;
  }

  // A channel the owner removed takes its chat with it.
  forget(id) { if (this.channels.delete(id)) this.save(); }
}
