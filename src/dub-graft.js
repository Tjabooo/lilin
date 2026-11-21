// Dub grafting: an anime episode keeps its own video and gains the English dub as one more audio track.
//
// When an anime is downloaded, a dual-audio release of it is fetched beside it (server.js). Once both copies of
// an episode are on the server, this takes the English track out of the dual-audio copy, finds how far apart the
// two copies are by lining up their Japanese audio, and writes the episode again with the dub added (shifted to
// match). The dual-audio copy is then deleted. Copies that don't line up (a different cut, other episode
// lengths) are left as they are: the dual-audio copy stays as a version of its own.
//
// Pure-ish: ffmpeg/ffprobe and a small JSON state file; server.js decides which pairs to try.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const RATE = 8000;            // Hz: plenty for lining up speech and music
const FRAME = 80;             // samples per envelope frame (10 ms)
const FPS = RATE / FRAME;
const WINDOW = 150;           // seconds of the episode compared at each point
const REACH = 30;             // seconds either way the dual-audio copy may be shifted
const AGREE = 0.08;           // seconds: both points must give the same shift (else the cuts differ)
const MIN_SCORE = 0.45;       // correlation a match needs to count
const TMP_TAG = '.lilin-tmp'; // convert.js isTempFile: scans skip it

let stateFile = null;
let state = { v: 2, grafted: {}, failed: {}, tries: {} };

export function init({ dataDir }) {
  stateFile = path.join(dataDir, 'dub-graft.json');
  try { state = { grafted: {}, failed: {}, tries: {}, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch { /* first run */ }
  // v2 (2026-11-21): fetches queued before then lost their episode list and asked for whole seasons. Start over.
  if (!state.v) { state.tries = {}; state.v = 2; save(); }
}
function save() {
  if (!stateFile) return;
  try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (e) { console.warn(`[dub] couldn't save state: ${e.message}`); }
}
const fileKey = (file) => path.resolve(file).toLowerCase();

// This file got a dub grafted into it (so it counts as a dubbed copy).
export const hasGraft = (file) => Boolean(state.grafted[fileKey(file)]);
// Dub fetches per title/season: { at, count }. server.js retries weekly for a while (dubs come out later).
export const tryOf = (key) => state.tries[key] || null;
export function noteTry(key, info) { state.tries[key] = { ...(state.tries[key] || {}), ...info }; save(); }
export const allTries = () => Object.entries(state.tries);

const pairKey = (target, source) => {
  let size = 0;
  try { size = fs.statSync(source).size; } catch { /* gone */ }
  return `${fileKey(target)}|${fileKey(source)}|${size}`;
};
export const pairFailed = (target, source) => Boolean(state.failed[pairKey(target, source)]);

// ---- languages ----
const ENGLISH = /^(en|eng|english)$/i;
const JAPANESE = /^(ja|jp|jpn|japanese)$/i;
const langOf = (s) => {
  const tag = String(s.tags?.language || '').trim();
  if (ENGLISH.test(tag)) return 'en';
  if (JAPANESE.test(tag)) return 'ja';
  const title = String(s.tags?.title || s.tags?.handler_name || '');
  if (/\benglish\b|\beng\b|\bdub\b/i.test(title)) return 'en';
  if (/\bjapanese\b|\bjpn?\b|\boriginal\b/i.test(title)) return 'ja';
  return tag && !/^und$/i.test(tag) ? tag.toLowerCase() : null;
};

function run(cmd, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const out = []; let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(binary ? Buffer.concat(out) : Buffer.concat(out).toString('utf8'))
      : reject(new Error(err.trim().split('\n').pop() || `${path.basename(cmd)} exited with ${code}`))));
  });
}

async function probe(file) {
  const json = JSON.parse(await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const streams = json.streams || [];
  const audio = streams.filter((s) => s.codec_type === 'audio');
  return { duration: Number(json.format?.duration) || 0, streams, audio };
}

// What a file has to offer: its English track and the track to line up by (Japanese, else its first).
export async function audioPlan(file) {
  const info = await probe(file);
  const english = info.audio.find((s) => langOf(s) === 'en') || null;
  const japanese = info.audio.find((s) => langOf(s) === 'ja') || info.audio.find((s) => s !== english) || null;
  return { ...info, english, japanese };
}

// Loudness every 10 ms from `start` for `length` seconds, normalised (mean 0, deviation 1).
async function envelope(file, streamIndex, start, length) {
  const raw = await run(FFMPEG, ['-v', 'error', '-ss', String(Math.max(0, start)), '-t', String(length), '-i', file,
    '-map', `0:${streamIndex}`, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { binary: true });
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const n = Math.floor(samples.length / FRAME);
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * FRAME; j < (i + 1) * FRAME; j++) sum += samples[j] * samples[j];
    env[i] = Math.log1p(Math.sqrt(sum / FRAME));
  }
  // Changes in loudness, not loudness itself: two masters at different volumes still line up.
  const diff = new Float64Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) diff[i - 1] = env[i] - env[i - 1];
  let mean = 0; for (const v of diff) mean += v; mean /= diff.length || 1;
  let dev = 0; for (const v of diff) dev += (v - mean) ** 2; dev = Math.sqrt(dev / (diff.length || 1)) || 1;
  for (let i = 0; i < diff.length; i++) diff[i] = (diff[i] - mean) / dev;
  return diff;
}

// Shift (seconds) such that the source at time t + shift is the target at time t, and how sure (0..1).
async function shiftAt(target, tTrack, source, sTrack, at) {
  const reach = Math.min(REACH, at);
  const [a, b] = await Promise.all([envelope(target, tTrack, at, WINDOW), envelope(source, sTrack, at - reach, WINDOW + reach + REACH)]);
  if (a.length < FPS * 30) return null;
  let best = -Infinity, bestLag = 0;
  const maxLag = b.length - a.length;
  const scores = new Float64Array(Math.max(0, maxLag + 1));
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i + lag];
    scores[lag] = s / a.length;
    if (scores[lag] > best) { best = scores[lag]; bestLag = lag; }
  }
  // Parabolic interpolation between frames for a finer shift.
  let frac = 0;
  if (bestLag > 0 && bestLag < maxLag) {
    const l = scores[bestLag - 1], r = scores[bestLag + 1], d = l - 2 * best + r;
    if (d < 0) frac = 0.5 * (l - r) / d;
  }
  return { shift: (bestLag + frac) / FPS - reach, score: best };
}

// How far the source copy is from the target, or { error } when they don't line up.
export async function findShift(target, source, tPlan, sPlan) {
  const length = Math.min(tPlan.duration, sPlan.duration);
  if (length < 120) return { error: 'too short to line up' };
  const points = [Math.min(120, length * 0.15), Math.max(length * 0.65, Math.min(120, length * 0.15) + WINDOW)]
    .filter((p) => p + WINDOW <= tPlan.duration + 1);
  if (!points.length) return { error: 'too short to line up' };
  const found = [];
  for (const at of points) {
    const r = await shiftAt(target, tPlan.japanese.index, source, sPlan.japanese.index, at);
    if (!r || r.score < MIN_SCORE) return { error: `the audio didn't match at ${Math.round(at)} s (score ${r ? r.score.toFixed(2) : 'none'})` };
    found.push(r);
  }
  if (found.length > 1 && Math.abs(found[0].shift - found[1].shift) > AGREE) {
    return { error: `the copies drift apart (${found.map((f) => f.shift.toFixed(2)).join(' s vs ')} s): a different cut` };
  }
  const shift = found.reduce((n, f) => n + f.shift, 0) / found.length;
  return { shift: Math.round(shift * 1000) / 1000, score: Math.min(...found.map((f) => f.score)) };
}

// Writes target again with source's English track added after its own audio, shifted to line up.
// Returns the temp file; the caller swaps it in (the target may be playing).
async function writeGrafted(target, source, tPlan, sPlan, shift) {
  const ext = path.extname(target);
  const tmp = path.join(path.dirname(target), `${path.basename(target, ext)}${TMP_TAG}-dub${ext}`);
  fs.rmSync(tmp, { force: true });
  const n = tPlan.audio.length;
  // shift > 0: the dub starts later in the source, so skip that much of it; < 0: delay it.
  const seek = shift > 0 ? ['-ss', String(shift)] : [];
  const delay = shift < 0 ? ['-itsoffset', String(-shift)] : [];
  // Only as much of the dub as the episode is long (a longer source would make the episode longer).
  const length = ['-t', String(Math.max(1, tPlan.duration - Math.max(0, -shift)).toFixed(3))];
  const mp4 = /\.(mp4|m4v|mov)$/i.test(ext);
  const args = ['-v', 'error', '-y', '-i', target, ...seek, ...delay, ...length, '-i', source,
    '-map', '0:v?', '-map', '0:a', '-map', '0:s?', ...(mp4 ? [] : ['-map', '0:t?']), '-map', `1:${sPlan.english.index}`, '-map_metadata', '0', '-map_chapters', '0',
    '-c', 'copy', `-c:a:${n}`, 'aac', `-b:a:${n}`, '192k', `-ac:a:${n}`, '2',
    `-metadata:s:a:${n}`, 'language=eng', `-metadata:s:a:${n}`, 'title=English', `-disposition:a:${n}`, '0',
    ...(mp4 ? ['-movflags', '+faststart', '-f', 'mp4'] : ['-f', 'matroska']), tmp];
  try { await run(FFMPEG, args); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  const out = await probe(tmp).catch(() => null);
  if (!out || out.audio.length !== n + 1 || Math.abs(out.duration - tPlan.duration) > 2) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`the new copy came out wrong (${out ? `${out.audio.length} audio tracks, ${Math.round(out.duration)} s` : 'unreadable'})`);
  }
  return tmp;
}

// Grafts source's English dub into target. { ok } | { error } (remembered: that pair isn't tried again)
// | { busy } (try again later). beforeSwap(): drop cached copies of the old target.
export async function graft(target, source, { beforeSwap = () => {} } = {}) {
  const fail = (error) => {
    state.failed[pairKey(target, source)] = { error, at: Date.now() };
    save();
    console.warn(`[dub] ${path.basename(source)} → ${path.basename(target)}: ${error}`);
    return { error };
  };
  let tPlan, sPlan;
  try { [tPlan, sPlan] = await Promise.all([audioPlan(target), audioPlan(source)]); } catch (e) { return { busy: true, error: e.message }; }
  if (tPlan.english) return fail('it already has English audio');
  if (!sPlan.english) return fail('the dual-audio copy has no English track');
  if (!tPlan.japanese || !sPlan.japanese) return fail('no Japanese track to line them up by');
  const lined = await findShift(target, source, tPlan, sPlan).catch((e) => ({ error: e.message }));
  if (lined.error) return fail(lined.error);
  let tmp;
  console.log(`[dub] ${path.basename(source)} lines up with ${path.basename(target)} at ${lined.shift} s (match ${lined.score.toFixed(2)})`);
  try { tmp = await writeGrafted(target, source, tPlan, sPlan, lined.shift); } catch (e) { return fail(e.message); }
  const { mtime, atime } = fs.statSync(target);
  try {
    beforeSwap();
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (/EBUSY|EPERM|EACCES/.test(e.code || '')) return { busy: true, error: 'in use' };
    return fail(e.message);
  }
  try { fs.utimesSync(target, atime, mtime); } catch { /* keeps its place in Recently added either way */ }
  state.grafted[fileKey(target)] = { from: path.basename(source), shift: lined.shift, at: Date.now() };
  save();
  console.log(`[dub] added the English dub of ${path.basename(source)} to ${path.basename(target)} (shift ${lined.shift} s, match ${lined.score.toFixed(2)})`);
  return { ok: true, shift: lined.shift };
}

export const _test = { langOf, findShift };
