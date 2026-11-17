// The idea scout (agents/lilin-scout): an agent that reads what people have said about streaming
// services and media servers over the years and brings the owner ideas for Lilin, with the evidence.
// Its ideas sit in the owner's idea inbox (Settings → Ideas) beside the members' ideas. The owner
// accepts (optionally with a comment), comments (the scout answers on its next run) or says not now;
// an accepted idea is picked up by the runner, which starts a build agent and reports back here.
//
// Lifecycle: new → (comment) discuss → (scout answers) new → (accept) approved → building → added | failed
//            any open state → (not now) notnow; notnow/failed → (accept) approved again.
// The runner talks to /api/scout/* with SCOUT_TOKEN ("Authorization: Bearer …"); the owner uses /api/ideas/<id>.
// One JSON file (.lilin-scout.json in DATA_DIR), newest first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STATUSES = ['new', 'discuss', 'approved', 'building', 'added', 'failed', 'notnow'];
export const SIZES = ['small', 'medium', 'large'];
export const ACTIONS = ['accept', 'comment', 'notnow'];
const LIMITS = { title: 90, pitch: 1200, fit: 800, evidenceText: 300, where: 60, url: 400, evidence: 8, comment: 1500, note: 600, thread: 60 };
const PER_DAY = 12;      // new scout ideas a day; a runaway agent can't flood the inbox
const MAX_KEPT = 300;    // the oldest closed scout ideas go first past this

let file = null;
let ideas = [];
let TOKEN = '';

export function initScout({ dataDir, token = process.env.SCOUT_TOKEN || '' }) {
  TOKEN = String(token || '').trim();
  file = path.join(dataDir, '.lilin-scout.json');
  try { ideas = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { ideas = []; }
  if (!Array.isArray(ideas)) ideas = [];
}
function save() {
  if (!file) return;
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ideas, null, 1));
    fs.renameSync(tmp, file);
  } catch (e) { console.warn('[scout] save:', e.message); }
}

export const scoutConfigured = () => Boolean(TOKEN);
export function tokenAllowed(req) {
  if (!TOKEN) return false;
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  const given = Buffer.from(m ? m[1].trim() : '');
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const httpError = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const line = (s, max) => clean(s, max).replace(/\s+/g, ' ');
const key = (title) => line(title, LIMITS.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function safeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return /^https?:$/.test(url.protocol) ? url.href.slice(0, LIMITS.url) : '';
  } catch { return ''; }
}
function evidenceOf(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, LIMITS.evidence).map((e) => ({
    text: clean(e?.text, LIMITS.evidenceText),
    url: safeUrl(e?.url),
    where: line(e?.where, LIMITS.where),
    year: Number.isInteger(Number(e?.year)) && Number(e.year) > 1990 && Number(e.year) < 2100 ? Number(e.year) : null,
  })).filter((e) => e.text);
}
const view = (i) => ({ id: i.id, source: 'scout', title: i.title, pitch: i.pitch, evidence: i.evidence, fit: i.fit, size: i.size,
  status: i.status, thread: i.thread, build: i.build || null, created: i.created, updated: i.updated, decided: i.decided || null });

export const all = () => ideas.map(view);
export const byId = (id) => ideas.find((i) => i.id === id) || null;
export const waitingCount = () => ideas.filter((i) => i.status === 'new').length;

function newId(taken) {
  for (;;) { const id = crypto.randomBytes(4).toString('hex'); if (!taken(id)) return id; }
}

// A new idea from the runner. `taken` tells whether an id is already used by a member idea.
export function add(body, { taken = () => false } = {}) {
  const title = line(body?.title, LIMITS.title);
  const pitch = clean(body?.pitch, LIMITS.pitch);
  if (title.length < 3 || pitch.length < 10) throw httpError(400, 'An idea needs a title and a pitch.');
  const evidence = evidenceOf(body?.evidence);
  if (!evidence.length) throw httpError(400, 'An idea needs at least one piece of evidence.');
  if (ideas.some((i) => key(i.title) === key(title))) throw httpError(409, 'The scout already brought that idea.');
  const now = Date.now();
  if (ideas.filter((i) => now - i.created < 86400000).length >= PER_DAY) throw httpError(429, 'Enough scout ideas for today.');
  const idea = { id: newId((id) => taken(id) || Boolean(byId(id))), title, pitch, evidence,
    fit: clean(body?.fit, LIMITS.fit), size: SIZES.includes(body?.size) ? body.size : 'medium',
    status: 'new', thread: [], build: null, created: now, updated: now, decided: null };
  ideas.unshift(idea);
  if (ideas.length > MAX_KEPT) {
    const closed = ideas.map((i, n) => [i, n]).filter(([i]) => ['added', 'notnow', 'failed'].includes(i.status)).map(([, n]) => n);
    const drop = new Set(closed.slice(-(ideas.length - MAX_KEPT)));
    ideas = ideas.filter((_, n) => !drop.has(n));
  }
  save();
  return view(idea);
}

function say(idea, from, text) {
  idea.thread.push({ from, text, at: Date.now() });
  if (idea.thread.length > LIMITS.thread) idea.thread = idea.thread.slice(-LIMITS.thread);
}

// The owner's answer from the inbox: accept (comment optional), comment (needs text) or not now.
export function act(id, body) {
  const idea = byId(id);
  if (!idea) throw httpError(404, 'That idea is gone.');
  const action = body?.action;
  if (!ACTIONS.includes(action)) throw httpError(400, 'Accept, comment or not now.');
  const comment = clean(body?.comment, LIMITS.comment);
  if (action === 'comment' && comment.length < 2) throw httpError(400, 'Write a comment first.');
  if (idea.status === 'building' && action !== 'comment') throw httpError(409, 'That idea is being built right now.');
  if (action === 'accept' && ['approved', 'added'].includes(idea.status)) throw httpError(409, 'That idea is accepted already.');
  if (comment) say(idea, 'owner', comment);
  if (action === 'accept') { idea.status = 'approved'; idea.decided = Date.now(); idea.build = null; }
  else if (action === 'notnow') { idea.status = 'notnow'; idea.decided = Date.now(); }
  else if (['new', 'discuss', 'notnow', 'failed'].includes(idea.status)) idea.status = 'discuss';
  // A comment on an accepted, building or added idea is kept for the build agent without changing anything.
  idea.updated = Date.now();
  save();
  return view(idea);
}

// What the runner may change: answer a discussion (status back to new), revise the pitch, and move
// an accepted idea through its build. Anything else is refused so a confused agent can't skip the owner.
const RUNNER_MOVES = { new: ['discuss'], building: ['approved'], added: ['building'], failed: ['building'], approved: ['building'] };
export function update(id, body) {
  const idea = byId(id);
  if (!idea) throw httpError(404, 'That idea is gone.');
  const to = body?.status;
  if (to != null && to !== idea.status) {
    if (!(RUNNER_MOVES[to] || []).includes(idea.status)) throw httpError(409, `Can't go from ${idea.status} to ${to}.`);
  }
  const comment = clean(body?.comment, LIMITS.comment);
  if (comment) say(idea, 'scout', comment);
  if (body?.title != null && line(body.title, LIMITS.title).length >= 3) idea.title = line(body.title, LIMITS.title);
  if (body?.pitch != null && clean(body.pitch, LIMITS.pitch).length >= 10) idea.pitch = clean(body.pitch, LIMITS.pitch);
  if (body?.fit != null) idea.fit = clean(body.fit, LIMITS.fit);
  if (SIZES.includes(body?.size)) idea.size = body.size;
  if (Array.isArray(body?.evidence) && evidenceOf(body.evidence).length) idea.evidence = evidenceOf(body.evidence);
  if (to != null && to !== idea.status) {
    idea.status = to;
    if (to === 'building') idea.build = { started: Date.now(), finished: null, branch: '', commit: '', note: '' };
  }
  if (body?.build && typeof body.build === 'object') {
    idea.build ||= { started: null, finished: null, branch: '', commit: '', note: '' };
    if (body.build.branch != null) idea.build.branch = line(body.build.branch, 80);
    if (body.build.commit != null) idea.build.commit = (String(body.build.commit).match(/^[0-9a-f]{7,40}$/i) || [''])[0];
    if (body.build.note != null) idea.build.note = clean(body.build.note, LIMITS.note);
  }
  if (['added', 'failed'].includes(to) && idea.build) idea.build.finished = Date.now();
  idea.updated = Date.now();
  save();
  return view(idea);
}

export function remove(id) {
  const idea = byId(id);
  if (!idea) return false;
  if (idea.status === 'building') throw httpError(409, 'That idea is being built right now.');
  ideas = ideas.filter((i) => i !== idea);
  save();
  return true;
}
