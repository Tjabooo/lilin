// Theme music on show pages (public/theme-music.js plays it): up to 30 seconds of the opening theme a show's
// episodes share, which Skip intro has already found (credits.js), cut once into a small AAC file in
// CACHE_DIR/theme-music. Opening a page never decodes anything to find the theme: a show whose intro isn't
// known yet stays silent, and one of its episodes is looked at in the background so a later visit has it.
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { trackChild } from './load.js';
import { background } from './priority.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const THEME_SECONDS = 30;
export const THEME_MIN = 10; // like Skip intro: anything shorter is a title card, not a song
const SEARCH_AGAIN = 6 * 3600e3; // a show whose intro isn't known is looked at again after this
const RETRY_CUT = 3600e3; // a file ffmpeg couldn't cut (no audio track, unreadable) is tried again after this
const KEEP = 300; // theme files kept, about 0.4 MB each; the ones played longest ago go first
const CUT_TIMEOUT = 60e3;

// The part of an opening to play: from where the theme starts, THEME_SECONDS at most.
export function themeSpan(intro) {
  const start = Number(intro?.start), end = Number(intro?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return null;
  const length = Math.round(Math.min(THEME_SECONDS, end - start) * 10) / 10;
  return length >= THEME_MIN ? { start, length } : null;
}

// Stereo AAC at an even loudness from show to show (the page decides how quiet it plays). loudnorm works at
// 192 kHz, hence the -ar after it.
export function themeArgs(file, span, out) {
  return ['-v', 'error', '-nostdin', '-ss', span.start.toFixed(3), '-i', file, '-t', span.length.toFixed(3),
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '2', '-af', 'loudnorm=I=-18:TP=-2:LRA=11', '-ar', '48000',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-f', 'mp4', '-y', out];
}

// The episodes to take the theme from, best first: the earliest season (its theme is the one people know),
// in episode order. The intro looked for in the background is the second episode's: a pilot often has none.
export function themeOrder(episodes) {
  const list = [...episodes].filter((e) => e?.file).sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
  const first = list[0];
  const searchFirst = list.find((e) => e.season === first?.season && e.episode > (first?.episode ?? 0)) || first || null;
  return { list, searchFirst };
}

// storedIntro(file): the opening titles already known for a file (nothing read); search(file): finds them,
// slowly (decodes audio); idle(): whether background work is welcome now (nobody watching).
export function createThemeMusic({ dir, storedIntro, search = async () => null, idle = () => true, ffmpeg = FFMPEG, now = Date.now }) {
  const making = new Map(); // theme file -> its cut in progress
  const failed = new Map(); // theme file -> when ffmpeg last failed on it
  const searched = new Map(); // show -> when its intro was last looked for
  let queue = Promise.resolve(); // one cut at a time: each reads a little of a big file on the media drive
  let cuts = 0;

  // show: any stable key for the show. episodes: [{ file, season, episode }] (original files).
  // Resolves to the path of the theme's audio file, or null.
  async function themeFor(show, episodes) {
    const { list, searchFirst } = themeOrder(episodes);
    for (const { file } of list) {
      const span = themeSpan(storedIntro(file));
      if (span) return cut(file, span);
    }
    if (searchFirst && idle() && !(now() - (searched.get(show) ?? -Infinity) < SEARCH_AGAIN)) {
      searched.set(show, now());
      if (searched.size > 2000) searched.delete(searched.keys().next().value);
      Promise.resolve().then(() => search(searchFirst.file)).catch(() => {});
    }
    return null;
  }

  async function cut(file, span) {
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile()) return null;
    const id = crypto.createHash('sha1').update(`${file}|${stat.size}|${Math.round(stat.mtimeMs)}|${span.start}|${span.length}`).digest('hex').slice(0, 24);
    const out = path.join(dir, `${id}.m4a`);
    const have = await fsp.stat(out).catch(() => null);
    if (have?.size > 0) {
      const t = new Date(now());
      fsp.utimes(out, t, t).catch(() => {}); // played now: pruned last
      return out;
    }
    if (making.has(out)) return making.get(out);
    if (now() - (failed.get(out) ?? -Infinity) < RETRY_CUT) return null;
    const task = queue.then(() => run(file, span, out)).then((ok) => {
      if (!ok) { failed.set(out, now()); return null; }
      failed.delete(out);
      if (++cuts % 10 === 1) prune().catch(() => {});
      return out;
    }).finally(() => making.delete(out));
    queue = task.catch(() => {});
    making.set(out, task);
    return task;
  }

  async function run(file, span, out) {
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    const args = themeArgs(file, span, tmp);
    const ok = await new Promise((resolve) => {
      let child;
      try { child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); } catch { resolve(false); return; }
      trackChild(child, ffmpeg, args, 'theme-music');
      background(child);
      const timer = setTimeout(() => child.kill(), CUT_TIMEOUT);
      child.stderr.resume();
      child.on('error', () => { clearTimeout(timer); resolve(false); });
      child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    });
    const size = ok ? (await fsp.stat(tmp).catch(() => null))?.size : 0;
    if (!size) { await fsp.rm(tmp, { force: true }).catch(() => {}); return false; }
    await fsp.rename(tmp, out);
    return true;
  }

  async function prune() {
    const names = (await fsp.readdir(dir).catch(() => [])).filter((n) => n.endsWith('.m4a'));
    if (names.length <= KEEP) return;
    const dated = await Promise.all(names.map(async (n) => ({ n, t: (await fsp.stat(path.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })));
    dated.sort((a, b) => a.t - b.t);
    for (const { n } of dated.slice(0, dated.length - KEEP)) await fsp.rm(path.join(dir, n), { force: true }).catch(() => {});
  }

  return { themeFor, prune };
}
