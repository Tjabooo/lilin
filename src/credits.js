// When an episode's closing credits start. Two sources, both conservative: an explicit ending chapter
// label, or the closing-credits music an episode shares with another episode of the same season.
// Anything uncertain gives null, and the player then waits for the real end of the file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { setImmediate as yieldNow } from 'node:timers/promises';
import { trackChild } from './load.js';
import { background } from './priority.js';

const FFPROBE = process.env.FFPROBE || 'ffprobe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

export function creditsStart(info) {
  const duration = Number(info?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(info?.chapters)) return null;
  const matches = info.chapters.filter((chapter) => {
    const title = String(chapter.tags?.title || '').trim().replace(/[_–—-]+/g, ' ').replace(/\s+/g, ' ');
    // Anchored labels avoid opening credits, post-credits scenes and titles mentioning credits.
    return /^(?:(?:end|ending|closing)\s+credits?|credits?(?:\s+(?:end|ending|closing))?|outro|ending|ed)(?:\s*\(\d+\))?$/i.test(title);
  }).map((chapter) => Number(chapter.start_time))
    // A label in the first half is likely an opening or malformed metadata.
    .filter((at) => Number.isFinite(at) && at > duration / 2 && at < duration);
  return matches.length ? Math.min(...matches) : null;
}

// A third source, used only when the two above find nothing: the subtitles. Shows whose end-credits music
// changes every episode (Rings of Power) never match, and Up next then only showed at the very end of the
// file. When the subtitles end in a sung credits song (italic or ♪ lines), the credits start with the song;
// otherwise they start a moment after the last spoken line. The player treats it like a real credits start.
const NOT_DIALOGUE = /subtit|opensubtitles|addic7ed|synced|sync and correct|corrected by|ripped by|www\.|\.(?:com|org|net)\b/i;
const SECS = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, '0')) / 1000;
export function lastDialogueEnd(srt) {
  let last = null;
  for (const block of String(srt || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const m = i < 0 ? null : /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(lines[i]);
    if (!m) continue;
    const text = lines.slice(i + 1).join(' ').replace(/<[^>]*>|\{[^}]*\}/g, '').trim();
    // Music notes, [sound cues] and credit lines for the subtitle makers are not dialogue.
    const words = text.replace(/\[[^\]]*\]|\([^)]*\)|[♪♫#*]/g, '').trim();
    if (!/\p{L}/u.test(words) || NOT_DIALOGUE.test(text)) continue;
    const end = SECS(m[5], m[6], m[7], m[8]);
    if (last == null || end > last) last = end;
  }
  return last;
}

export const GUESS_SLACK = 15; // seconds after the last line: the closing shot usually lingers a moment
const GUESS_MIN_TAIL = 90; // a shorter tail after the dialogue is a closing scene, not the credits
const GUESS_MAX_TAIL = 900;
export function creditsGuess(lastLine, duration) {
  if (!Number.isFinite(lastLine) || !Number.isFinite(duration) || duration < 300 || lastLine <= duration / 2) return null;
  const tail = duration - lastLine;
  if (tail < GUESS_MIN_TAIL || tail > GUESS_MAX_TAIL) return null;
  return Math.ceil(lastLine + GUESS_SLACK);
}

// A credits song in the subtitles: the last cues are all sung (wholly in italics, or with ♪), close together,
// for at least SONG_MIN seconds up to the last cue. Its first line is where the credits start.
const SONG_MIN = 40;
const SONG_GAP = 12; // seconds of silence a verse may leave between sung lines
const SONG_LINES = 4;
export function creditsSongStart(srt) {
  const cues = [];
  for (const block of String(srt || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const m = i < 0 ? null : /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(lines[i]);
    if (!m) continue;
    const raw = lines.slice(i + 1).join(' ').replace(/\{[^}]*\}/g, '').trim();
    const text = raw.replace(/<[^>]*>/g, '').trim();
    if (!/\p{L}/u.test(text) || NOT_DIALOGUE.test(text)) continue;
    const sung = /[♪♫]/.test(raw) || /^<i>(?:(?!<\/i>)[\s\S])*<\/i>$/i.test(raw);
    cues.push({ start: SECS(m[1], m[2], m[3], m[4]), end: SECS(m[5], m[6], m[7], m[8]), sung });
  }
  cues.sort((a, b) => a.start - b.start);
  let k = cues.length - 1;
  if (k < 0 || !cues[k].sung) return null;
  while (k > 0 && cues[k - 1].sung && cues[k].start - cues[k - 1].end <= SONG_GAP) k--;
  const run = cues.length - k;
  return run >= SONG_LINES && cues[cues.length - 1].end - cues[k].start >= SONG_MIN ? cues[k].start : null;
}

export function creditsGuessFromSrt(srt, duration) {
  const song = creditsSongStart(srt);
  if (song != null && Number.isFinite(duration) && duration >= 300 && song > duration / 2) {
    const tail = duration - song;
    if (tail >= GUESS_MIN_TAIL && tail <= GUESS_MAX_TAIL) return Math.floor(song);
  }
  return creditsGuess(lastDialogueEnd(srt), duration);
}

// The opening titles (Skip intro) are found the same two ways: an opening chapter, or the theme song
// an episode shares with its season neighbours in the first minutes. Uncertain gives null: no button.
export const INTRO_MIN = 10; // seconds: shorter openings are a title card, not worth a button
export const INTRO_MAX = 180;
const chapterTitle = (chapter) => String(chapter.tags?.title || '').trim().replace(/[_–—-]+/g, ' ').replace(/\s+/g, ' ');

// { start, end } of an opening-titles chapter in the first third, or null.
export function introChapter(info) {
  const duration = Number(info?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(info?.chapters)) return null;
  const found = info.chapters.filter((chapter) =>
    /^(?:intro|opening(?:\s+(?:credits?|titles?|theme|song|sequence))?|op|title\s+sequence|main\s+titles?|theme\s+song)(?:\s*\(?\d+\)?)?$/i.test(chapterTitle(chapter)))
    .map((chapter) => ({ start: Number(chapter.start_time), end: Number(chapter.end_time) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < duration / 3
      && end - start >= INTRO_MIN && end - start <= INTRO_MAX && end < duration);
  return found.length ? found.sort((a, b) => a.start - b.start)[0] : null;
}

// The "Previously on…" recap (Skip recap) is found in three ways: a recap chapter, or the opening minutes
// matching scenes from the episode or two before it (recapFor), with a "Previously on" subtitle line to back
// a short one up. Like the intro, anything uncertain gives null: no button rather than skipping new scenes.
export const RECAP_MIN = 15; // seconds: shorter is a sting or a single flashback, not a recap
export const RECAP_MAX = 300;
export function recapChapter(info) {
  const duration = Number(info?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(info?.chapters)) return null;
  const found = info.chapters.filter((chapter) =>
    /^(?:recap|previously(?:\s+on\b.*)?|last\s+time(?:\s+on\b.*)?|the\s+story\s+so\s+far|story\s+so\s+far)$/i.test(chapterTitle(chapter)))
    .map((chapter) => ({ start: Number(chapter.start_time), end: Number(chapter.end_time) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < 120
      && end - start >= RECAP_MIN && end - start <= RECAP_MAX && end < duration / 2);
  return found.length ? found.sort((a, b) => a.start - b.start)[0] : null;
}

// A "Previously on" line in the first minutes of the subtitles: the episode opens with a recap.
export function saysPreviously(srt) {
  for (const block of String(srt || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const m = i < 0 ? null : /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->/.exec(lines[i]);
    if (!m) continue;
    if (SECS(m[1], m[2], m[3], m[4]) > 120) return false;
    if (/\b(?:previously\s+on|last\s+time\s+on|previously\s*(?:\.\.\.|…|:))/i.test(lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, ''))) return true;
  }
  return false;
}

function probe(file) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-show_chapters', '-show_entries',
      'format=duration:chapter=start_time,end_time:chapter_tags=title', '-of', 'json', file],
    { timeout: 6000, maxBuffer: 512 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const info = JSON.parse(stdout);
        const duration = Number(info?.format?.duration);
        resolve({ duration: Number.isFinite(duration) && duration > 0 ? duration : null, chapter: creditsStart(info), intro: introChapter(info), recap: recapChapter(info) });
      } catch { resolve(null); }
    });
  });
}

// ---- audio fingerprints ----
// Philips-style (Haitsma & Kalker): 33 log-spaced bands between 300 and 2000 Hz, one 32-bit code per
// 46 ms frame from the sign of the energy difference between neighbouring bands and frames. The same
// music gives (nearly) the same codes in every episode, even from a different encode.
export const RATE = 5512;
const N = 2048; // 0.37 s analysis frame
export const HOP = 256; // 46 ms between codes
const SECONDS = (frames) => (frames * HOP) / RATE;
const FRAMES = (seconds) => Math.round((seconds * RATE) / HOP);
const QUIET_RMS = 100; // about -50 dBFS: silence carries no evidence either way

const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
const bitrev = new Uint32Array(N);
for (let i = 0, bits = Math.log2(N); i < N; i++) {
  let r = 0;
  for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
  bitrev[i] = r;
}
const cosT = Float64Array.from({ length: N / 2 }, (_, i) => Math.cos((-2 * Math.PI * i) / N));
const sinT = Float64Array.from({ length: N / 2 }, (_, i) => Math.sin((-2 * Math.PI * i) / N));
const bandEdges = Array.from({ length: 34 }, (_, i) => Math.round((300 * (2000 / 300) ** (i / 33) * N) / RATE));

function fft(re, im) {
  for (let i = 0; i < N; i++) {
    const j = bitrev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const a = start + k, b = a + half, c = cosT[k * step], s = sinT[k * step];
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

// samples: Int16Array of mono audio at RATE. Yields to the event loop now and then so a long ending
// never stalls the streams the server is sending meanwhile.
export async function fingerprint(samples) {
  const count = samples.length >= N ? Math.floor((samples.length - N) / HOP) + 1 : 0;
  const codes = new Uint32Array(count), quiet = new Uint8Array(count);
  const re = new Float64Array(N), im = new Float64Array(N);
  let prev = null;
  for (let f = 0; f < count; f++) {
    if (f % 512 === 511) await yieldNow();
    let power = 0;
    for (let i = 0, o = f * HOP; i < N; i++) { const v = samples[o + i]; power += v * v; re[i] = v * hann[i]; im[i] = 0; }
    quiet[f] = Math.sqrt(power / N) < QUIET_RMS ? 1 : 0;
    fft(re, im);
    const next = new Float64Array(33);
    for (let m = 0; m < 33; m++) {
      let e = 0;
      for (let k = bandEdges[m]; k < bandEdges[m + 1]; k++) e += re[k] * re[k] + im[k] * im[k];
      next[m] = e;
    }
    if (prev) {
      let code = 0;
      for (let m = 0; m < 32; m++) if (next[m] - next[m + 1] - (prev[m] - prev[m + 1]) > 0) code |= 1 << m;
      codes[f] = code >>> 0;
    } else quiet[f] = 1; // the first frame has no predecessor: no code
    prev = next;
  }
  return { codes, quiet };
}

const popcount = (x) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

// Shortest shared stretch that counts, and how much of it must be actual sound rather than shared silence.
const ENDING = { minMatch: FRAMES(20), minSound: FRAMES(15) }; // shorter ones are logos and stings, not credits
const OPENING = { minMatch: FRAMES(INTRO_MIN), minSound: FRAMES(8) };
const SMOOTH = FRAMES(1); // judge one second at a time
const GAP = FRAMES(2); // a brief dropout doesn't split the credits in two
const MATCH_BITS = 10; // average differing bits per code below this = same audio (unrelated ≈ 16)

// The longest stretch of the same audio in a and b, as frame indexes { a, b, frames }, or null.
export function matchEndings(a, b) { return matchAudio(a, b, ENDING); }
export function matchOpenings(a, b) { return matchAudio(a, b, OPENING); }

function matchAudio(a, b, limits) {
  const index = new Map();
  for (let j = 0; j < b.codes.length; j++) {
    if (b.quiet[j]) continue;
    const list = index.get(b.codes[j]);
    if (!list) index.set(b.codes[j], [j]); else if (list.length <= 8) list.push(j);
  }
  const votes = new Map();
  for (let i = 0; i < a.codes.length; i++) {
    if (a.quiet[i]) continue;
    const list = index.get(a.codes[i]);
    if (!list || list.length > 8) continue; // a code this common says nothing about alignment
    for (const j of list) votes.set(j - i, (votes.get(j - i) || 0) + 1);
  }
  const near = (d) => (votes.get(d - 1) || 0) + (votes.get(d) || 0) + (votes.get(d + 1) || 0);
  const offsets = [];
  for (const d of [...votes.keys()].sort((x, y) => near(y) - near(x))) {
    if (offsets.length >= 4 || near(d) < 6) break;
    if (!offsets.some((o) => Math.abs(o - d) <= 2)) offsets.push(d);
  }
  let best = null;
  for (const centre of offsets) {
    for (const d of [centre - 1, centre, centre + 1]) {
      const run = longestRun(a, b, d, limits);
      if (run && (!best || run.sound > best.sound)) best = run;
    }
  }
  return best && { a: best.start, b: best.start + best.d, frames: best.frames };
}

function longestRun(a, b, d, { minMatch, minSound }) {
  const from = Math.max(0, -d), to = Math.min(a.codes.length, b.codes.length - d);
  if (to - from < minMatch) return null;
  const len = to - from;
  // Per frame: differing bits, or -1 when both are silent (no evidence). One-sided silence is a mismatch.
  const bits = new Int8Array(len);
  for (let k = 0; k < len; k++) {
    const i = from + k, j = i + d;
    bits[k] = a.quiet[i] && b.quiet[j] ? -1 : a.quiet[i] || b.quiet[j] ? 16 : popcount(a.codes[i] ^ b.codes[j]);
  }
  // state: 1 matched, 0 different, -1 neutral (mostly silence)
  const state = new Int8Array(len), half = SMOOTH >> 1;
  let sum = 0, n = 0;
  const add = (k, sign) => { if (k >= 0 && k < len && bits[k] >= 0) { sum += sign * bits[k]; n += sign; } };
  for (let k = -half; k < half; k++) add(k, 1);
  for (let k = 0; k < len; k++) {
    add(k + half, 1); add(k - half - 1, -1);
    state[k] = n < SMOOTH / 4 ? -1 : sum / n < MATCH_BITS ? 1 : 0;
  }
  let best = null, start = -1, sound = 0, lastMatch = -1;
  const close = () => {
    if (start < 0) return;
    const frames = lastMatch - start + 1;
    if (frames >= minMatch && sound >= minSound && (!best || sound > best.sound)) best = { start: from + start, frames, sound, d };
    start = -1; sound = 0;
  };
  for (let k = 0; k < len; k++) {
    if (state[k] === 1) {
      if (start < 0) start = k;
      sound++; lastMatch = k;
    } else if (state[k] === 0 && start >= 0 && k - lastMatch > GAP) close();
  }
  close();
  return best;
}

// A recap is a montage of short clips taken from anywhere in earlier episodes, so unlike the theme song
// there's no single alignment to find. Each second of the opening (a) is looked for everywhere in the
// earlier episode (b): the best spot by average differing bits, giving up on a spot after a few frames
// that are clearly different. allowed(j) leaves out parts of b that would match for another reason
// (its logos, theme song and credits). Gives the clips as { s, e, j } frame indexes: a's stretch s..e
// heard at b's frame j, consecutive seconds joined when b runs on with them.
const CLIP_BLOCK = FRAMES(1);
export async function matchClips(a, b, allowed = () => true) {
  const B = CLIP_BLOCK, len = b.codes.length;
  const ok = new Uint8Array(len);
  for (let j = 0; j < len; j++) ok[j] = !b.quiet[j] && allowed(j) ? 1 : 0;
  const blocks = [];
  for (let s = 0; s + B <= a.codes.length; s += B) {
    await yieldNow();
    const frames = [];
    for (let k = s; k < s + B; k++) if (!a.quiet[k]) frames.push(k);
    if (frames.length < B / 2) continue; // mostly silence: no evidence either way
    let best = MATCH_BITS, bestJ = -1;
    for (let j0 = 0; j0 + B <= len; j0++) {
      let sum = 0, n = 0, bad = false;
      for (let f = 0; f < frames.length; f++) {
        const k = frames[f], j = j0 + (k - s);
        if (!ok[j]) { sum += 16; n++; } else { sum += popcount(a.codes[k] ^ b.codes[j]); n++; }
        if (n >= 4 && sum > 13 * n) { bad = true; break; } // unrelated audio averages 16
      }
      if (!bad && sum / n < best) { best = sum / n; bestJ = j0; }
    }
    if (bestJ >= 0) blocks.push({ s, j: bestJ });
  }
  const clips = [];
  for (const block of blocks) {
    const last = clips[clips.length - 1];
    if (last && block.s === last.e && Math.abs(block.j - (last.j + (block.s - last.s))) <= 2) last.e = block.s + B;
    else clips.push({ s: block.s, e: block.s + B, j: block.j });
  }
  return clips;
}

// The recap among an episode's opening clips (seconds, { s, e } from every earlier episode compared), or null.
// It starts in the first RECAP_LEAD seconds, ends before the opening titles, is several separate clips with
// short gaps between them (cuts, a narrator's "Previously on…"), and is mostly matched audio. A long unbroken
// match is a scene played again, not a montage, and ends the search. said: the subtitles say "Previously on",
// which lets a recap of two clips count.
const RECAP_LEAD = 75;
const RECAP_GAP = 10;
const RECAP_CLIP_MAX = 30;
export function recapSpan(clips, { intro = null, said = false } = {}) {
  const limit = intro ? intro.start : Infinity;
  const list = clips.filter((c) => c.s < limit).map((c) => ({ s: c.s, e: Math.min(c.e, limit) })).sort((x, y) => x.s - y.s);
  const run = [];
  let end = -Infinity;
  for (const c of list) {
    if (c.e - c.s > RECAP_CLIP_MAX) break;
    if (run.length ? c.s - end > RECAP_GAP : c.s > RECAP_LEAD) break;
    run.push(c);
    end = Math.max(end, c.e);
  }
  if (!run.length) return null;
  // Overlapping clips (the same moment found in two episodes) count once.
  let matched = 0, pieces = 0, reach = -Infinity;
  for (const c of run) {
    if (c.s >= reach) { pieces++; matched += c.e - c.s; } else if (c.e > reach) matched += c.e - reach;
    reach = Math.max(reach, c.e);
  }
  const start = run[0].s;
  if (end - start < RECAP_MIN || end - start > RECAP_MAX || matched < 10 || matched < (end - start) * 0.25 || pieces < (said ? 2 : 3)) return null;
  // Shown from the very start when only a logo or "Previously on" comes before it; skips to the end of the last
  // clip, or straight to the opening titles when they follow within seconds (the tail of the last clip).
  const to = intro && intro.start - end <= 5 ? intro.start : end - 0.5; // a second judged as matched may run a moment past the clip
  return { start: start <= 15 ? 0 : Math.ceil(start * 10) / 10, end: Math.floor(to * 10) / 10 };
}

// ---- decoding ----
const WINDOW = 360; // seconds of each ending to compare
const INTRO_WINDOW = 480; // seconds from the start where the opening titles are looked for, past long cold opens
const INTRO_FAR_WINDOW = 900; // searched only when that finds nothing, with stricter rules (see introFor)
let busy = Promise.resolve(); // one decode at a time: it reads hundreds of MB from the media drive

function decodeAudio(file, start, seconds, limit = 120000) {
  const task = busy.then(() => new Promise((resolve) => {
    const args = ['-v', 'error', '-nostdin', '-ss', start.toFixed(3), '-i', file, '-t', seconds.toFixed(3),
      '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1'];
    let child;
    try { child = spawn(FFMPEG, args, { windowsHide: true }); } catch { resolve(null); return; }
    trackChild(child, FFMPEG, args, 'credits');
    background(child);
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => child.kill(), limit);
    child.stdout.on('data', (d) => { chunks.push(d); size += d.length; });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || size < N * 2) { resolve(null); return; }
      const buf = Buffer.concat(chunks, size - (size % 2));
      const samples = new Int16Array(buf.length / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(i * 2);
      resolve(samples);
    });
  }));
  busy = task.catch(() => {});
  return task;
}

// ---- per-file facts, cached on disk ----
// files[path] = { key, duration, chapter, intro, recap, vs: { siblingKey: creditsStart | null },
//   ivs: { siblingKey: { start, end } | null }, ifar: the same, from the longer search,
//   rvs: { siblingKey: [{ s, e }] clips of the opening heard in that earlier episode (seconds) } }  (v: what the probe recorded; older entries are probed again)
// siblingKey = the sibling's tok and its path without the extension. tok is the file's identity: its key
// when first seen, and kept by the MP4 copy that takes over from its original (see twinOf), so neither the
// episode nor its neighbours have to compare their audio again when originals are removed.
let stateFile = null;
let state = { files: {} };
let saveTimer = null;
const LIMIT = 3000;

export function initCredits({ dataDir } = {}) {
  stateFile = dataDir ? path.join(dataDir, '.lilin-credits.json') : null;
  state = { files: {} };
  if (!stateFile) return;
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (saved && typeof saved.files === 'object') state = { files: saved.files };
  } catch { /* first run */ }
  for (const entry of Object.values(state.files)) { addIdentity(entry); entry.ifar ||= {}; entry.rvs ||= {}; }
}

const stem = (file) => file.slice(0, file.length - path.extname(file).length);
const siblingKey = (file, entry) => `${entry.tok}|${stem(file)}`;

// Entries saved before tok existed stored comparisons under "key|full path".
function addIdentity(entry) {
  if (entry.tok) return;
  entry.tok = entry.key;
  for (const part of ['vs', 'ivs']) {
    const moved = {};
    for (const [id, value] of Object.entries(entry[part] || {})) {
      const at = id.lastIndexOf('|');
      moved[`${id.slice(0, at)}|${stem(id.slice(at + 1))}`] = value;
    }
    entry[part] = moved;
  }
}

// What's known about the same episode under another extension: normally the original of an MP4 copy,
// which is the file looked at until it's removed. A copy can end a few seconds earlier than its original
// (seen: up to 3 s), so the length only has to be close. Its chapters are worth keeping too, since a
// browser copy can lose them.
const TWIN_SLACK = 5;
function twinOf(file, duration) {
  const own = stem(file);
  for (const [other, entry] of Object.entries(state.files)) {
    if (other !== file && stem(other) === own && entry.probed && Math.abs(entry.duration - duration) <= TWIN_SLACK) return { file: other, entry };
  }
  return null;
}

function save() {
  if (!stateFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const names = Object.keys(state.files);
    if (names.length > LIMIT) {
      names.sort((x, y) => (state.files[x].at || 0) - (state.files[y].at || 0));
      for (const name of names.slice(0, names.length - LIMIT)) delete state.files[name];
    }
    const tmp = `${stateFile}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, stateFile); } catch { /* next save */ }
  }, 1000);
  saveTimer.unref?.();
}

const FACTS = 3; // 2: opening chapters, 3: recap chapters
const probing = new Map();
async function facts(file) {
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat?.isFile()) return null;
  const key = `${stat.size}|${Math.round(stat.mtimeMs)}`;
  const hit = state.files[file];
  if (hit?.key === key && hit.probed && hit.v === FACTS) { hit.at = Date.now(); return hit; }
  if (probing.has(file)) return probing.get(file);
  const task = probe(file).then((info) => {
    if (!info) return { key, tok: key, duration: null, chapter: null, intro: null, recap: null, vs: {}, ivs: {}, ifar: {}, rvs: {} }; // not cached: retried next time
    const same = hit?.key === key; // only the probe got older: keep the comparisons already made
    const twin = !same && info.duration ? twinOf(file, info.duration) : null;
    const entry = { key, tok: same && hit.tok || twin?.entry.tok || key, duration: info.duration,
      chapter: info.chapter ?? twin?.entry.chapter ?? null, intro: info.intro ?? twin?.entry.intro ?? null, recap: info.recap ?? twin?.entry.recap ?? null,
      vs: same && hit.vs || { ...twin?.entry.vs }, ivs: same && hit.ivs || { ...twin?.entry.ivs }, ifar: same && hit.ifar || { ...twin?.entry.ifar },
      rvs: same && hit.rvs || { ...twin?.entry.rvs }, probed: true, v: FACTS, at: Date.now() };
    state.files[file] = entry;
    if (twin && !fs.existsSync(twin.file)) delete state.files[twin.file];
    save();
    return entry;
  }).finally(() => probing.delete(file));
  probing.set(file, task);
  return task;
}

// Fingerprints of recently compared endings, so neighbouring episodes reuse each other's.
const prints = new Map();
async function audioPrint(file, entry, part) {
  const id = `${file}|${entry.key}|${part}`;
  if (prints.has(id)) { const p = prints.get(id); prints.delete(id); prints.set(id, p); return p; }
  const start = part === 'ending' ? Math.max(entry.duration / 2, entry.duration - WINDOW) : 0;
  const end = part === 'ending' ? entry.duration : Math.min(part === 'far' ? INTRO_FAR_WINDOW : INTRO_WINDOW, entry.duration / 3);
  const task = decodeAudio(file, start, end - start)
    .then(async (samples) => (samples ? { start, ...(await fingerprint(samples)) } : null));
  prints.set(id, task);
  while (prints.size > 6) prints.delete(prints.keys().next().value);
  const value = await task;
  if (!value) prints.delete(id);
  return value;
}

const comparing = new Map();
async function compare(fileA, a, fileB, b) {
  const pair = [fileA, fileB].sort().join('\n') + '\nending';
  if (comparing.has(pair)) return comparing.get(pair);
  const task = (async () => {
    const pa = await audioPrint(fileA, a, 'ending');
    const pb = pa && await audioPrint(fileB, b, 'ending');
    if (!pa || !pb) return false; // couldn't decode: try again another time
    const m = matchEndings(pa, pb);
    // Rounded up: the countdown may start a moment late, never early.
    const at = (p, frame, entry) => {
      const t = Math.ceil((p.start + SECONDS(frame) + 0.5) * 10) / 10;
      return t > entry.duration / 2 && t < entry.duration - 1 ? t : null;
    };
    a.vs[siblingKey(fileB, b)] = m ? at(pa, m.a, a) : null;
    b.vs[siblingKey(fileA, a)] = m ? at(pb, m.b, b) : null;
    save();
    return true;
  })().finally(() => comparing.delete(pair));
  comparing.set(pair, task);
  return task;
}

// file: the episode. siblings: other episodes of the same season, nearest first (at most two are used).
export async function creditsFor(file, siblings = []) {
  const entry = await facts(file);
  if (!entry) return null;
  if (entry.chapter != null || !entry.duration || entry.duration < 300) return entry.chapter ?? null;
  const found = [];
  for (const other of siblings.slice(0, 2)) {
    if (path.resolve(other) === path.resolve(file)) continue;
    const peer = await facts(other);
    if (!peer?.duration || peer.duration < 300) continue;
    const id = siblingKey(other, peer);
    if (!(id in entry.vs)) await compare(file, entry, other, peer);
    if (entry.vs[id] != null) found.push(entry.vs[id]);
  }
  // Two siblings that disagree: the later start is the safe one.
  return found.length ? Math.max(...found) : null;
}

// The guess above for one episode, from its English subtitles beside it (or any other language there).
export async function creditsGuessFor(file, sidecar) {
  const entry = await facts(file);
  if (!entry?.duration || !sidecar) return null;
  try { return creditsGuessFromSrt(await fsp.readFile(sidecar, 'utf8'), entry.duration); } catch { return null; }
}

// What's already known about a video for Live TV: its length, the opening titles and where the credits start.
// Only the file is read (once, cached); nothing is decoded or compared here, so a channel costs nothing to plan.
export async function knownTimes(file, siblings = []) {
  const entry = await facts(file);
  if (!entry?.duration) return null;
  const stored = (part) => siblings.map((other) => {
    const peer = state.files[other];
    return peer?.tok ? entry[part]?.[siblingKey(other, peer)] : undefined;
  }).filter((v) => v != null);
  const ends = stored('vs');
  const creditsAt = entry.chapter ?? (ends.length ? Math.max(...ends) : null);
  const far = stored('ifar');
  const intro = entry.intro || agreeIntro(stored('ivs')) || (far.length === 2 ? agreeIntro(far) : null);
  return { duration: entry.duration, intro, creditsAt };
}

// The opening titles already known for a file, from the cache alone (nothing is read or decoded): theme music on
// show pages (theme-music.js). Every neighbour it was compared with counts, and they must agree, as in introFor.
export function storedIntro(file) {
  const entry = state.files[file];
  if (!entry) return null;
  if (entry.intro) return entry.intro;
  const near = Object.values(entry.ivs || {}).filter(Boolean);
  if (near.length) return agreeIntro(near);
  const far = Object.values(entry.ifar || {}).filter(Boolean);
  return far.length >= 2 ? agreeIntro(far) : null;
}

// The theme song both episodes open with, in each one's own time. Rounded inwards: the button may
// appear a moment late and skip a moment short, never past the start of the episode itself.
async function compareOpenings(fileA, a, fileB, b, far = false) {
  const part = far ? 'far' : 'opening', store = far ? 'ifar' : 'ivs';
  const pair = [fileA, fileB].sort().join('\n') + `\n${part}`;
  if (comparing.has(pair)) return comparing.get(pair);
  const task = (async () => {
    const pa = await audioPrint(fileA, a, part);
    const pb = pa && await audioPrint(fileB, b, part);
    if (!pa || !pb) return false;
    const m = matchOpenings(pa, pb);
    const span = (frame, entry) => {
      if (!m) return null;
      const start = Math.ceil(SECONDS(frame) * 10) / 10, end = Math.floor((SECONDS(frame + m.frames) - 0.5) * 10) / 10;
      return end - start >= INTRO_MIN && end - start <= INTRO_MAX && end < entry.duration / 2 ? { start, end } : null;
    };
    a[store][siblingKey(fileB, b)] = span(m?.a, a);
    b[store][siblingKey(fileA, a)] = span(m?.b, b);
    save();
    return true;
  })().finally(() => comparing.delete(pair));
  comparing.set(pair, task);
  return task;
}

// Where two siblings put the opening differently, only the part they agree on is skipped;
// if they don't overlap at all one of them matched something else, so nothing is offered.
export function agreeIntro(found) {
  if (!found.length) return null;
  const start = Math.max(...found.map((f) => f.start)), end = Math.min(...found.map((f) => f.end));
  return end - start >= INTRO_MIN ? { start, end } : null;
}

// { start, end } in seconds of the episode's opening titles, or null. Same siblings as creditsFor.
// Some cold opens run past INTRO_WINDOW. Further in, shared audio is more likely to be something else (a scene
// repeated from the last episode), so the longer search only runs when the normal one finds nothing, which
// keeps it from replacing real titles, and both siblings must then agree.
export async function introFor(file, siblings = []) {
  const entry = await facts(file);
  if (!entry) return null;
  if (entry.intro) return entry.intro;
  if (!entry.duration || entry.duration < 300) return null;
  const found = [], peers = [];
  for (const other of siblings.slice(0, 2)) {
    if (path.resolve(other) === path.resolve(file)) continue;
    const peer = await facts(other);
    if (!peer?.duration || peer.duration < 300) continue;
    peers.push([other, peer]);
    const id = siblingKey(other, peer);
    if (!(id in entry.ivs)) await compareOpenings(file, entry, other, peer);
    if (entry.ivs[id]) found.push(entry.ivs[id]);
  }
  if (found.length || peers.length < 2 || entry.duration / 3 <= INTRO_WINDOW) return agreeIntro(found);
  const far = [];
  for (const [other, peer] of peers) {
    const id = siblingKey(other, peer);
    if (!(id in entry.ifar)) await compareOpenings(file, entry, other, peer, true);
    if (entry.ifar[id]) far.push(entry.ifar[id]);
  }
  return far.length === 2 ? agreeIntro(far) : null;
}

// ---- recaps ----
const RECAP_WINDOW = 300; // seconds from the start where a recap is looked for
const EPISODE_MAX = 2 * 3600; // a longer "episode" is a film or a special: not decoded whole
const wholePrints = new Map(); // whole earlier episodes, kept while the next one or two are compared with them
async function wholePrint(file, entry) {
  const id = `${file}|${entry.key}`;
  if (wholePrints.has(id)) { const p = wholePrints.get(id); wholePrints.delete(id); wholePrints.set(id, p); return p; }
  const task = decodeAudio(file, 0, entry.duration, 15 * 60e3)
    .then(async (samples) => (samples ? fingerprint(samples) : null));
  wholePrints.set(id, task);
  while (wholePrints.size > 3) wholePrints.delete(wholePrints.keys().next().value);
  const value = await task;
  if (!value) wholePrints.delete(id);
  return value;
}

// The parts of an earlier episode its opening may share for reasons other than a recap: logos at the very
// start, its own recap and theme song, and the closing credits.
function recapSources(entry, file) {
  const intro = entry.intro || storedIntro(file);
  const skip = [[0, 20]];
  if (intro) skip.push([intro.start - 2, intro.end + 2]);
  if (entry.recapAt) skip.push([0, entry.recapAt.end + 2]);
  const credits = entry.chapter ?? (Object.values(entry.vs || {}).filter((v) => v != null).sort((x, y) => x - y)[0] ?? null);
  skip.push([credits ?? Math.max(entry.duration / 2, entry.duration - 120), Infinity]);
  return (frame) => { const t = SECONDS(frame); return !skip.some(([a, b]) => t >= a && t < b); };
}

const recapping = new Map();
async function compareRecap(file, entry, other, peer) {
  const pair = `${file}\n${other}\nrecap`;
  if (recapping.has(pair)) return recapping.get(pair);
  const task = (async () => {
    const opening = await audioPrint(file, entry, 'opening'); // the intro's print covers the recap's minutes too
    const pb = opening && await wholePrint(other, peer);
    if (!opening || !pb) return false;
    const n = Math.min(opening.codes.length, FRAMES(RECAP_WINDOW));
    const pa = { codes: opening.codes.subarray(0, n), quiet: opening.quiet.subarray(0, n) };
    const clips = await matchClips(pa, pb, recapSources(peer, other));
    entry.rvs[siblingKey(other, peer)] = clips.map((c) => ({ s: Math.round(SECONDS(c.s) * 10) / 10, e: Math.round(SECONDS(c.e) * 10) / 10 }));
    save();
    return true;
  })().finally(() => recapping.delete(pair));
  recapping.set(pair, task);
  return task;
}

// { start, end } in seconds of the episode's "Previously on…" recap, or null. earlier: the one or two episodes
// before it, nearest first (the last of the previous season for a premiere). sidecar: its subtitles, if any.
// The opening titles are found first: the recap ends where they start.
export async function recapFor(file, earlier = [], siblings = [], sidecar = null) {
  const entry = await facts(file);
  if (!entry) return null;
  if (entry.recap) return entry.recap;
  if (!entry.duration || entry.duration < 300) return null;
  const intro = await introFor(file, siblings);
  const clips = [];
  let compared = 0;
  for (const other of earlier.slice(0, 2)) {
    if (path.resolve(other) === path.resolve(file)) continue;
    const peer = await facts(other);
    if (!peer?.duration || peer.duration < 300 || peer.duration > EPISODE_MAX) continue;
    const id = siblingKey(other, peer);
    if (!(id in entry.rvs)) await compareRecap(file, entry, other, peer);
    if (entry.rvs[id]) { compared++; clips.push(...entry.rvs[id]); }
  }
  if (!compared) return null;
  let said = false;
  if (sidecar) { try { said = saysPreviously(await fsp.readFile(sidecar, 'utf8')); } catch { /* no hint */ } }
  const found = recapSpan(clips, { intro, said });
  entry.recapAt = found;
  return found;
}

// The recap already worked out for a file, from the cache alone (nothing is read or decoded).
export function storedRecap(file) {
  const entry = state.files[file];
  return entry ? entry.recap || entry.recapAt || null : null;
}
