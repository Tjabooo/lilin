// Signing in a TV app (tv/tizen): the TV can't type a password comfortably, so it shows a short code
// and someone approves it from their phone (Settings → Sign in on a TV). The TV then gets its own Lilin
// session for that person, which it sends in the X-Lilin-Session header (auth.js).
//
// start()   → { code, poll, expiresIn }: the code is shown on the TV, `poll` stays secret on the TV.
// poll(id)  → { state: 'waiting' | 'approved' | 'expired', grant? }: the grant is handed over once.
// approve(code, grant) by the signed-in person; a few wrong codes in a row wait a while.
// The same handshake signs in a browser by scanning a QR code (signin-link.js): its own instance with a shorter life.
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: read off a TV across the room
export const CODE_LENGTH = 6;
export const PAIR_TTL_MS = 10 * 60_000;
const MAX_PENDING = 50;
const MAX_FAILS = 8;          // wrong codes per person before approving waits
const FAIL_WINDOW_MS = 10 * 60_000;

export const normalCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function createTvPairing({ now = () => Date.now(), ttl = PAIR_TTL_MS, maxPending = MAX_PENDING } = {}) {
  const pending = new Map(); // code -> { code, poll, created, grant, taken }
  const fails = new Map();   // who -> { count, first }

  function sweep() {
    const t = now();
    for (const [code, p] of pending) if (t - p.created > ttl || p.taken) pending.delete(code);
    for (const [who, f] of fails) if (t - f.first > FAIL_WINDOW_MS) fails.delete(who);
  }

  // label: what the device is ("Firefox on Windows"), where: roughly where it is; both shown before approving.
  function start({ label = null, where = null } = {}) {
    sweep();
    while (pending.size >= maxPending) pending.delete(pending.keys().next().value);
    let code;
    do code = randomCode(); while (pending.has(code));
    const entry = { code, label, where, poll: crypto.randomBytes(24).toString('base64url'), created: now(), grant: null, taken: false };
    pending.set(code, entry);
    return { code, poll: entry.poll, expiresIn: Math.round(ttl / 1000) };
  }

  function poll(id) {
    const entry = [...pending.values()].find((p) => p.poll === String(id || ''));
    if (!entry || now() - entry.created > ttl) { sweep(); return { state: 'expired' }; }
    if (!entry.grant) return { state: 'waiting' };
    entry.taken = true; // the session token is handed over once
    sweep();
    return { state: 'approved', grant: entry.grant };
  }

  // The waiting entry for a code, or null. A miss counts as a wrong code (codes can't be guessed by looking).
  function find(who, code) {
    sweep();
    const f = fails.get(who);
    if (f && f.count >= MAX_FAILS) {
      throw Object.assign(new Error('Too many wrong codes. Wait a few minutes and try again.'), { status: 429 });
    }
    const entry = pending.get(normalCode(code));
    if (!entry || entry.grant) {
      fails.set(who, { count: (f?.count || 0) + 1, first: f?.first || now() });
      return null;
    }
    fails.delete(who);
    return entry;
  }
  const missing = (text) => Object.assign(new Error(text || 'That code isn’t showing on any TV. Check the code on the TV and try again.'), { status: 404 });

  // What the phone shows before you approve: which device, roughly where, and how long the code has left.
  function peek(who, code, { notFound } = {}) {
    const entry = find(who, code);
    if (!entry) throw missing(notFound);
    return { label: entry.label, where: entry.where, expiresIn: Math.max(0, Math.round((entry.created + ttl - now()) / 1000)) };
  }

  // Whether a code is waiting here, without counting a miss (to pick which pool a typed code belongs to).
  const has = (code) => { sweep(); const e = pending.get(normalCode(code)); return Boolean(e && !e.grant); };

  // grant: (entry) => { token, name } made only once the code is known to be right.
  function approve(who, code, makeGrant, { notFound } = {}) {
    const entry = find(who, code);
    if (!entry) throw missing(notFound);
    entry.grant = makeGrant(entry);
    return { ok: true };
  }

  return { start, poll, peek, has, approve, pendingCount: () => (sweep(), pending.size) };
}
