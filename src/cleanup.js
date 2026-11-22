// Clean-up: the one rule for what Lilin deletes by itself. A download goes once it's been on the server for
// over a month (CLEANUP_MIN_AGE_DAYS) and nobody has watched it in the last 30 days (CLEANUP_IDLE_DAYS).
// Shows count as one: an episode stays while anyone has watched any episode of that show in the window, so
// nobody loses the rest of a season they're in the middle of. Videos that were on the server before Lilin
// tracked downloads (source 'existing', copied in by hand) are never touched.
//
// "Watched" is the latest of: a saved position (progress.updated_at) and a day of watch time (watch_log.day),
// by anyone. The server runs this every hour (server.js cleanupLibrary) and deletes the files; from a shell:
//   node src/cleanup.js          lists what would go now, and why
//   node src/cleanup.js --run    takes them out of every library now; the running server deletes the files
//                                within ten minutes (it retries a file that's playing)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseName, folderShowTitle } from './release-name.js';
import { showKey } from './shows.js';

const DAY = 86400000;
const days = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
export const rules = () => ({ minAgeDays: days(process.env.CLEANUP_MIN_AGE_DAYS, 30), idleDays: days(process.env.CLEANUP_IDLE_DAYS, 30) });

// A media key's group: 'show:<name>' for an episode (by the file's name, else its folders'), else the key itself.
export function groupOf(key) {
  const parts = String(key).split('/');
  const parsed = parseName(parts[parts.length - 1], { allowEmpty: true });
  if (parsed.season == null) return key;
  let title = parsed.title;
  for (let i = parts.length - 2; !title && i >= 0 && i >= parts.length - 4; i--) {
    const t = folderShowTitle(parseName(parts[i], { file: false }).title);
    if (t && !/^(season|series|s)\s*\d+$/i.test(t)) title = t;
  }
  const k = showKey(title);
  return k ? `show:${k}` : key;
}

// videos: [{ key, addedAt, existing }]; watched: Map(key -> last watched ms), any key (deleted episodes count too).
// Returns the videos to delete, oldest first, each with when its group was last watched (0 = never).
export function findStale(videos, watched, { now = Date.now(), minAgeDays = 30, idleDays = 30, group = groupOf } = {}) {
  const groupMemo = new Map();
  const g = (key) => { if (!groupMemo.has(key)) groupMemo.set(key, group(key)); return groupMemo.get(key); };
  const lastByGroup = new Map();
  for (const [key, at] of watched) {
    const id = g(key);
    if (at > (lastByGroup.get(id) || 0)) lastByGroup.set(id, at);
  }
  const out = [];
  for (const v of videos) {
    if (v.existing || !(now - v.addedAt > minAgeDays * DAY)) continue;
    const last = Math.max(lastByGroup.get(g(v.key)) || 0, watched.get(v.key) || 0);
    if (now - last > idleDays * DAY) out.push({ key: v.key, addedAt: v.addedAt, lastWatched: last });
  }
  return out.sort((a, b) => a.addedAt - b.addedAt);
}

// The rule run against Lilin's database (accounts.js). run: take the stale videos out of every library and
// mark them for deletion. Returns what it found.
export function sweep(accounts, { now = Date.now(), run = false } = {}) {
  const { videos, watched } = accounts.cleanupFacts();
  const stale = findStale(videos, watched, { now, ...rules() });
  if (run) for (const v of stale) { accounts.removeAll(v.key); accounts.markDeleting(v.key); }
  return stale;
}

// ---------- command line ----------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await import('./env.js'); // loads .env
  const { DATA_DIR } = await import('./paths.js');
  const accounts = await import('./accounts.js');
  accounts.initAccounts({ dataDir: DATA_DIR, adminEmails: [] });
  const run = process.argv.includes('--run');
  const stale = sweep(accounts, { run });
  const { minAgeDays, idleDays } = rules();
  const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : 'never');
  for (const v of stale) console.log(`${when(v.addedAt)}  watched ${when(v.lastWatched).padEnd(10)}  ${v.key}`);
  console.log(`${stale.length} video${stale.length === 1 ? '' : 's'} older than ${minAgeDays} days, unwatched for ${idleDays} days`
    + (run ? ': taken out of every library; Lilin deletes the files within ten minutes.' : '. Add --run to delete them.'));
}
