// Owner popups (House → Server rules → Popup message): the owner writes a message (title optional, English
// and/or Swedish) and everyone gets it the next time they open Lilin, in a popup they have to press OK on.
// Restricted people and the owner never get one. Who has pressed OK is kept per person, so it shows once per
// person, not once per device. One JSON file, newest first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_TITLE = 120;
const MAX_TEXT = 2000;
const MAX_KEPT = 30;

let file = null;
let notices = []; // { id, title: { en, sv }, text: { en, sv }, created, active, seenBy: [userId] }

export function initNotices({ dataDir }) {
  file = path.join(dataDir, '.lilin-notices.json');
  try { notices = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { notices = []; }
  if (!Array.isArray(notices)) notices = [];
}
function save() {
  if (!file) return;
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(notices, null, 1));
    fs.renameSync(tmp, file);
  } catch (e) { console.warn('[notices] save:', e.message); }
}
const httpError = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const pair = (v, max) => ({ en: clean(v?.en, max), sv: clean(v?.sv, max) });
const view = (n) => ({ id: n.id, title: n.title, text: n.text, created: n.created });

// The popups waiting for this person, oldest first (so they read in the order they were sent).
export function pendingFor(user, { restricted = false } = {}) {
  if (!user || user.isOwner || restricted) return [];
  return notices.filter((n) => n.active && !n.seenBy.includes(user.id)).reverse().map(view);
}
export function seen(user, id) {
  const n = notices.find((x) => x.id === id);
  if (!n || !user) return false;
  if (!n.seenBy.includes(user.id)) { n.seenBy.push(user.id); save(); }
  return true;
}
// The owner's list: every popup with how many people have pressed OK.
export const all = () => notices.map((n) => ({ ...view(n), active: n.active, seen: n.seenBy.length }));

export function add(body) {
  const title = pair(body?.title, MAX_TITLE), text = pair(body?.text, MAX_TEXT);
  if (!text.en && !text.sv) throw httpError(400, 'Write the message first (English, Swedish or both).');
  const n = { id: crypto.randomBytes(4).toString('hex'), title, text, created: Date.now(), active: true, seenBy: [] };
  notices.unshift(n);
  notices = notices.slice(0, MAX_KEPT);
  save();
  return n;
}
// Take a popup down: people who haven't opened Lilin since won't get it.
export function stop(id) {
  const n = notices.find((x) => x.id === id);
  if (!n) throw httpError(404, 'That popup is gone.');
  n.active = false;
  save();
}
export function remove(id) {
  const before = notices.length;
  notices = notices.filter((x) => x.id !== id);
  if (notices.length === before) throw httpError(404, 'That popup is gone.');
  save();
}
