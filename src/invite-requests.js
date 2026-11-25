// Ask to invite a friend: members who can't make invite links themselves ask the owners for one. An owner says
// yes (an invite link is made in the member's name, so it shows up as theirs) or no. The member then sends the
// link on from the same Invite sheet. Kept in .lilin-invite-requests.json next to the invites.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let file = null;
let requests = []; // { id, userId, userName, name, why, created, state: 'pending'|'accepted'|'declined', answeredAt, answeredBy, inviteId, token }

export const MAX_PENDING = 3; // per member
const KEEP_MS = 30 * 86400000; // answered requests are forgotten after 30 days
const httpError = (status, message) => Object.assign(new Error(message), { status });

export function initInviteRequests({ dataDir }) {
  file = path.join(dataDir, '.lilin-invite-requests.json');
  try { requests = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { requests = []; }
  if (!Array.isArray(requests)) requests = [];
}
const save = () => { if (file) try { fs.writeFileSync(file, JSON.stringify(requests, null, 1)); } catch { /* memory only */ } };
const tidy = () => { requests = requests.filter((r) => r.state === 'pending' || Date.now() - (r.answeredAt || r.created) < KEEP_MS); };
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const pending = () => requests.filter((r) => r.state === 'pending').sort((a, b) => a.created - b.created);
export const mine = (userId) => requests.filter((r) => r.userId === userId).sort((a, b) => b.created - a.created).slice(0, 20);

export function ask(user, body = {}) {
  const name = clean(body.name, 60);
  if (!name) throw httpError(400, 'Who’s it for? Enter their name.');
  if (requests.filter((r) => r.userId === user.id && r.state === 'pending').length >= MAX_PENDING) {
    throw httpError(400, `You have ${MAX_PENDING} requests waiting. Wait until an owner answers them.`);
  }
  if (requests.some((r) => r.userId === user.id && r.state === 'pending' && r.name.toLowerCase() === name.toLowerCase())) {
    throw httpError(400, 'You already asked for them. An owner will answer soon.');
  }
  const r = { id: crypto.randomBytes(4).toString('hex'), userId: user.id, userName: user.name || null, name, why: clean(body.why, 140),
    created: Date.now(), state: 'pending', answeredAt: null, answeredBy: null, inviteId: null, token: null };
  tidy();
  requests.push(r);
  save();
  return r;
}

const find = (id) => {
  const r = requests.find((x) => x.id === id);
  if (!r) throw httpError(404, 'No such request.');
  return r;
};

// The member takes back a request nobody has answered yet.
export function cancel(id, userId) {
  const r = find(id);
  if (r.userId !== userId) throw httpError(404, 'No such request.');
  if (r.state !== 'pending') throw httpError(400, 'An owner already answered it.');
  requests = requests.filter((x) => x !== r);
  save();
}

// An owner answers. makeInvite(r) makes the link (invites.js createInvite) when it's a yes.
export function answer(id, yes, owner, makeInvite) {
  const r = find(id);
  if (r.state !== 'pending') throw httpError(400, 'Someone already answered it.');
  if (yes) {
    const inv = makeInvite(r);
    r.inviteId = inv.id;
    r.token = inv.token;
  }
  r.state = yes ? 'accepted' : 'declined';
  r.answeredAt = Date.now();
  r.answeredBy = owner?.name || null;
  save();
  return r;
}

// A member left Lilin: their requests go with them.
export function forgetUser(userId) {
  const before = requests.length;
  requests = requests.filter((r) => r.userId !== userId);
  if (requests.length !== before) save();
}
