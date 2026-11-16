// The idea box (Settings → Ideas): anyone can suggest something they'd like in Lilin, the owner sees
// every idea in their own Settings, marks it (planned, added, not now) and can answer. People see
// their own ideas with the owner's answer. One JSON file, newest first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const KINDS = ['feature', 'fix', 'other'];
export const STATUSES = ['new', 'planned', 'added', 'notnow'];
const MAX_TEXT = 1000;
const MAX_REPLY = 500;
const PER_DAY = 8;       // ideas one person can send in 24 hours
const MAX_KEPT = 500;    // the oldest closed ideas go first past this

let file = null;
let ideas = [];          // { id, userId, name, kind, text, status, reply, created, updated, answered }

export function initIdeas({ dataDir }) {
  file = path.join(dataDir, '.lilin-ideas.json');
  try { ideas = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { ideas = []; }
  if (!Array.isArray(ideas)) ideas = [];
}
function save() {
  if (!file) return;
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ideas, null, 1));
    fs.renameSync(tmp, file);
  } catch (e) { console.warn('[ideas] save:', e.message); }
}
const httpError = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const view = (i) => ({ id: i.id, userId: i.userId, name: i.name, kind: i.kind, text: i.text, status: i.status,
  reply: i.reply || '', created: i.created, updated: i.updated, answered: i.answered || null });

export const mine = (userId) => ideas.filter((i) => i.userId === userId).map(view);
export const all = () => ideas.map(view);
export const openCount = () => ideas.filter((i) => i.status === 'new').length;
export const byId = (id) => ideas.find((i) => i.id === id) || null;

export function add(user, body) {
  const text = clean(body?.text, MAX_TEXT);
  if (text.length < 3) throw httpError(400, 'Write a few words about your idea first.');
  const kind = KINDS.includes(body?.kind) ? body.kind : 'feature';
  const now = Date.now();
  if (ideas.filter((i) => i.userId === user.id && now - i.created < 86400000).length >= PER_DAY) {
    throw httpError(429, 'That’s a lot of ideas for one day. Send the rest tomorrow.');
  }
  if (ideas.some((i) => i.userId === user.id && i.text === text)) throw httpError(400, 'You’ve already sent that one.');
  const idea = { id: crypto.randomBytes(4).toString('hex'), userId: user.id, name: String(user.name || '').slice(0, 40),
    kind, text, status: 'new', reply: '', created: now, updated: now, answered: null };
  ideas.unshift(idea);
  if (ideas.length > MAX_KEPT) {
    const closed = ideas.map((i, n) => [i, n]).filter(([i]) => i.status !== 'new').map(([, n]) => n);
    const drop = new Set(closed.slice(-(ideas.length - MAX_KEPT)));
    ideas = ideas.filter((_, n) => !drop.has(n)).slice(0, MAX_KEPT);
  }
  save();
  return view(idea);
}

// The owner's answer: a new status and/or a reply. Returns { idea, changed } so the caller can
// tell the person who sent it.
export function answer(id, body) {
  const idea = byId(id);
  if (!idea) throw httpError(404, 'That idea is gone.');
  let changed = false;
  if (body?.status != null) {
    if (!STATUSES.includes(body.status)) throw httpError(400, 'Unknown status.');
    if (idea.status !== body.status) { idea.status = body.status; changed = true; }
  }
  if (body?.reply != null) {
    const reply = clean(body.reply, MAX_REPLY);
    if (reply !== (idea.reply || '')) { idea.reply = reply; changed = true; }
  }
  if (changed) { idea.updated = Date.now(); idea.answered = idea.updated; save(); }
  return { idea: view(idea), changed };
}

// The sender can take back an idea nobody has answered yet; the owner can remove any.
export function remove(id, user) {
  const idea = byId(id);
  if (!idea) return false;
  if (!user.isOwner && (idea.userId !== user.id || idea.status !== 'new' || idea.reply)) {
    throw httpError(403, 'Only ideas nobody has answered yet can be taken back.');
  }
  ideas = ideas.filter((i) => i !== idea);
  save();
  return true;
}
