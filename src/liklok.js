// LikLok: a vertical feed of short clips from the shows on the server (swipe, like Shorts/TikTok), each with a
// way into the show: Keep watching (the episode, from the second the clip is at), From episode 1, My list.
// A preview for the people in LIKLOK_EMAILS only (blank = off, and nothing is built).
//
// How clips are found, per episode (the first LIKLOK_EPISODES of a show's first season, so nothing late in a show
// is spoiled), one episode at a time in the background:
//   1. one ffmpeg pass (below normal priority, only non-B frames decoded at 160 px) gives the scene cuts and the
//      loudness of every second;
//   2. the episode's own subtitles (sidecar .srt) give who talks when, what they say, and the [laughs] of SDH subs;
//   3. pickClips (pure) scores every stretch of 22-70 s that starts and ends on a cut or a pause in the talk, and
//      never mid-line: lively talk, back-and-forth, ! and ?, laughs, louder than the episode usually is, a hook in
//      the first seconds and a payoff (laugh, reaction) at the end. The recap, the opening titles and the last 15 %
//      (finale beats, credits) are left out. The best three that don't overlap are cut.
// Clips are encoded like Moments (moments.js): H.264 + stereo AAC, at most 1080p, HDR tone-mapped, NVENC when the
// server has it; subtitles go beside as WebVTT. They live in CACHE_DIR/liklok, at most LIKLOK_MAX_GB.
//
// The feed is ranked per person: the clip's own score, how it did with everyone (watched to the end, Keep
// watching, swiped away within 3 s), shows you haven't started first, never a show you said Not for me to, never
// the same show twice within a few swipes, and clips you saw in the last three weeks only once nothing else is left.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { database } from './accounts.js';
import { probeSource, pickAudio, cuesToVtt } from './moments.js';
import { videoFilter } from './phone-stream.js';
import { isHdr } from './travel.js';
import { trackChild } from './load.js';
import { background } from './priority.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const DAY = 86400000;
const SEEN_DAYS = 21;
const KINDS = new Set(['view', 'skip', 'done', 'watch', 'save', 'nope']);

const emails = () => String(process.env.LIKLOK_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const episodesPerShow = () => Math.max(1, Math.min(10, Number(process.env.LIKLOK_EPISODES) || 3));
const capBytes = () => Math.max(1, Number(process.env.LIKLOK_MAX_GB) || 25) * 1024 ** 3;

export const enabled = () => emails().length > 0;
// May this person see LikLok?
export const allowed = (user) => Boolean(user?.email && emails().includes(String(user.email).toLowerCase()));

let dir = null;
let deps = { encoder: () => 'x264', library: async () => [], subtitleFor: () => null, timesFor: () => ({}) };
const db = () => database();
const fileOf = (id, ext) => path.join(dir, `${id}.${ext}`);
const status = { running: false, current: null, lastError: null };

export function initLikLok({ cacheDir, encoder, library, subtitleFor, timesFor } = {}) {
  dir = process.env.LIKLOK_DIR ? path.resolve(process.env.LIKLOK_DIR) : path.join(cacheDir, 'liklok');
  deps = { ...deps, ...(encoder && { encoder }), ...(library && { library }), ...(subtitleFor && { subtitleFor }), ...(timesFor && { timesFor }) };
  db().exec(`
    CREATE TABLE IF NOT EXISTS liklok_clips (
      id TEXT PRIMARY KEY,
      media_key TEXT NOT NULL,
      show_key TEXT NOT NULL,
      title_key TEXT,
      show_title TEXT,
      season INTEGER,
      episode INTEGER,
      episode_name TEXT,
      start REAL NOT NULL,
      end REAL NOT NULL,
      score REAL NOT NULL,
      why TEXT,
      subs INTEGER NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS liklok_clips_key ON liklok_clips(media_key);
    CREATE TABLE IF NOT EXISTS liklok_scanned (media_key TEXT PRIMARY KEY, result TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS liklok_events (user_id INTEGER NOT NULL, clip_id TEXT NOT NULL, kind TEXT NOT NULL, ms INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS liklok_events_user ON liklok_events(user_id, at);
    CREATE INDEX IF NOT EXISTS liklok_events_clip ON liklok_events(clip_id);
    CREATE TABLE IF NOT EXISTS liklok_nope (user_id INTEGER NOT NULL, show_key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, show_key));
    CREATE TABLE IF NOT EXISTS liklok_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  if (!enabled()) return;
  fs.mkdirSync(dir, { recursive: true });
  // Version 2 reads subtitles inside the video too: episodes cut without any are looked at again.
  if (Number(db().prepare("SELECT v FROM liklok_meta WHERE k = 'version'").get()?.v || 1) < 2) {
    for (const r of db().prepare('SELECT id, media_key FROM liklok_clips WHERE subs = 0').all()) {
      for (const ext of ['mp4', 'jpg', 'vtt']) fs.rmSync(fileOf(r.id, ext), { force: true });
      db().prepare('DELETE FROM liklok_clips WHERE id = ?').run(r.id);
      db().prepare('DELETE FROM liklok_scanned WHERE media_key = ?').run(r.media_key);
    }
    db().prepare("DELETE FROM liklok_scanned WHERE result = 'ok:0'").run();
    db().prepare("INSERT OR REPLACE INTO liklok_meta (k, v) VALUES ('version', '2')").run();
  }
  setTimeout(() => { builder().catch((e) => console.warn(`[liklok] builder stopped: ${e.message}`)); }, Number(process.env.LIKLOK_DELAY_MS) || 90_000).unref?.();
}

// ---------- subtitles (pure) ----------
const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const secs = (m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
// SRT → [{ start, end, text }], tags removed, sorted.
export function parseSrt(text) {
  const out = [];
  for (const block of String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const ma = TIME.exec(a), mb = TIME.exec(b || '');
    if (!ma || !mb) continue;
    const start = secs(ma), end = secs(mb);
    const body = lines.slice(at + 1).join('\n').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (end > start && end - start < 30 && body) out.push({ start, end, text: body });
  }
  return out.sort((x, y) => x.start - y.start);
}

// ---------- picking the clips (pure) ----------
const SFX = /^[\s\-–]*(?:[[(][^\])]*[\])]|♪[^♪]*♪?|♪)[\s.]*$/; // a cue that is only [door slams] or ♪ music ♪
const LAUGH = /[[(][^\])]*\b(?:laugh|chuckl|giggl|cheer|applau|guffaw)/i;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const bell = (x, mid, width) => clamp(1 - Math.abs(x - mid) / width, -1, 1);
// First index in a sorted array of numbers (or objects by `by`) with value >= t.
function lowerBound(arr, t, by = (v) => v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (by(arr[mid]) < t) lo = mid + 1; else hi = mid; }
  return lo;
}

// duration: seconds; cuts: scene-cut times; rms: dB per second (index = second, -120 = silence); cues: parseSrt;
// avoid: [[from, to]] not to touch (recap, opening titles); from: nothing before this (the end of the recap).
// Returns up to `count` clips { start, end, score, why }, best first.
export function pickClips({ duration, cuts = [], rms = [], cues = [], avoid = [], from = 0, count = 3, min = 22, max = 70 } = {}) {
  if (!(duration > 180)) return [];
  const blocked = avoid.filter((r) => Array.isArray(r) && r[1] > r[0]);
  const lo = Math.max(10, Number(from) || 0);
  const hi = duration * 0.85;
  const audible = rms.filter((v) => Number.isFinite(v) && v > -80).sort((a, b) => a - b);
  const median = audible.length ? audible[audible.length >> 1] : -30;
  const loud = []; // prefix sums of dB over the median (silence counts as -20)
  const peaks = [];
  loud[0] = 0; peaks[0] = 0;
  for (let i = 0; i < Math.ceil(duration) + 1; i++) {
    const v = Number.isFinite(rms[i]) ? rms[i] : median;
    loud[i + 1] = loud[i] + Math.max(-20, v - median);
    peaks[i + 1] = peaks[i] + (v > median + 7 ? 1 : 0);
  }
  const loudAt = (a, b) => { const i = clamp(Math.floor(a), 0, loud.length - 1), j = clamp(Math.ceil(b), i + 1, loud.length - 1); return (loud[j] - loud[i]) / (j - i); };
  const peaksIn = (a, b) => { const i = clamp(Math.floor(a), 0, peaks.length - 1), j = clamp(Math.ceil(b), 0, peaks.length - 1); return peaks[j] - peaks[i]; };

  const talk = cues.filter((c) => !SFX.test(c.text));
  const laughs = cues.filter((c) => LAUGH.test(c.text)).map((c) => c.start);
  const hasSubs = talk.length >= 20;
  const sortedCuts = [...new Set(cuts.filter((t) => t > 0 && t < duration).map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const inTalk = (t) => { const i = lowerBound(talk, t, (c) => c.start); return (i > 0 && talk[i - 1].end > t + 0.1) || (i < talk.length && talk[i].start < t - 0.1); };
  // Where a clip may start or end: on a cut, or in the middle of a pause in the talk (long takes have few cuts).
  const points = sortedCuts.map((t) => ({ t, cut: true }));
  if (hasSubs) for (let i = 1; i < talk.length; i++) {
    const gap = talk[i].start - talk[i - 1].end;
    if (gap >= 1.2) points.push({ t: talk[i - 1].end + Math.min(0.7, gap / 2), cut: false });
  }
  points.sort((a, b) => a.t - b.t);
  const usable = points.filter((p) => p.t >= lo && p.t <= hi && !blocked.some(([a, b]) => p.t > a - 1 && p.t < b + 1) && !(hasSubs && inTalk(p.t)));

  const windows = [];
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i].t;
    for (let j = i + 1; j < usable.length; j++) {
      const e = usable[j].t;
      const L = e - s;
      if (L < min) continue;
      if (L > max) break;
      if (blocked.some(([a, b]) => s < b && e > a)) continue;
      windows.push(scoreWindow(s, e, usable[i].cut, usable[j].cut));
    }
  }

  function scoreWindow(s, e, startCut, endCut) {
    const L = e - s;
    const a = lowerBound(talk, s - 0.01, (c) => c.start), b = lowerBound(talk, e, (c) => c.start);
    const lines = talk.slice(a, b);
    let spoken = 0, marks = 0, turns = 0;
    for (const c of lines) {
      spoken += Math.min(c.end, e) - Math.max(c.start, s);
      marks += (c.text.match(/[!?]/g) || []).length;
      turns += /(^|\n)\s*[-–]/.test(c.text) ? 2 : 1;
    }
    const share = spoken / L, perMin = (turns / L) * 60;
    const d = loudAt(s, e);
    const pk = peaksIn(s, e);
    const cutsIn = lowerBound(sortedCuts, e) - lowerBound(sortedCuts, s + 0.5);
    const cutRate = (cutsIn / L) * 60;
    const laughsIn = laughs.filter((t) => t >= s && t <= e);
    const lastLine = lines[lines.length - 1], firstLine = lines[0];
    // The end lands: a laugh, or a beat without talk that's louder than usual (a reaction, music hitting).
    const tailQuiet = lastLine ? e - lastLine.end : L;
    const payoff = laughsIn.some((t) => t > e - 10) ? 1 : tailQuiet >= 1.2 && loudAt(e - Math.min(4, tailQuiet), e) > 1 ? 0.7 : 0;
    const hook = (firstLine && firstLine.start - s < 3.5 ? 0.6 : 0) + (loudAt(s, s + 3) > 4 ? 0.4 : 0);
    const dangling = lastLine && !/[.!?…"”'♪)\]]\s*$/.test(lastLine.text) ? 1 : 0;
    const midSentence = firstLine && /^[\s\-–]*(?:\.\.\.|…|[a-zåäö])/.test(firstLine.text) ? 1 : 0;
    const lengthCost = L < 30 ? (30 - L) * 0.03 : L > 55 ? (L - 55) * 0.025 : 0;
    const quiet = d < -6 ? (-6 - d) * 0.15 : 0;
    const action = cutRate > 16 && d > 2 ? 1 : 0;
    // Tight around the good part: a first or last third much quieter or talk-free than the rest costs.
    const third = L / 3;
    const sag = (a, b) => {
      const loudDrop = d - loudAt(a, b);
      const talkThere = hasSubs ? lines.reduce((n, c) => n + Math.max(0, Math.min(c.end, b) - Math.max(c.start, a)), 0) / third : share;
      return clamp((loudDrop - 2) / 5) + (hasSubs && share > 0.3 ? clamp((share - talkThere - 0.25) * 2) : 0);
    };
    const flab = 0.35 * (sag(s, s + third) + sag(e - third, e));
    let score, why;
    if (hasSubs) {
      score = 1.1 * bell(share, 0.6, 0.4) + 0.6 * clamp(perMin / 18) + 0.5 * clamp((marks / Math.max(1, lines.length)) * 1.5)
        + 0.4 * clamp(d / 5, -1, 1) + 0.25 * clamp(pk / 4) + 0.45 * clamp(laughsIn.length / 2) + 0.5 * payoff + 0.35 * hook
        + 0.3 * action + (startCut ? 0.2 : 0) + (endCut ? 0.1 : 0) - 0.45 * dangling - 0.35 * midSentence - lengthCost - quiet - flab;
      why = [`talk ${Math.round(share * 100)}%`, `${turns} lines`, marks && `${marks} !?`, laughsIn.length && `${laughsIn.length} laughs`,
        payoff && 'payoff', action && 'action', `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`].filter(Boolean).join(' · ');
    } else {
      score = 0.8 * clamp(d / 5, -1, 1) + 0.5 * clamp(pk / 4) + 0.4 * clamp(cutRate / 20) + 0.3 * (loudAt(s, s + 3) > 4 ? 1 : 0)
        + 0.3 * (loudAt(e - 4, e) > 2 ? 1 : 0) + (startCut ? 0.2 : 0) - lengthCost - quiet - flab;
      why = [`no subs`, `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`, `${Math.round(cutRate)} cuts/min`, action && 'action'].filter(Boolean).join(' · ');
    }
    return { start: s, end: e, score: Math.round(score * 1000) / 1000, why };
  }

  windows.sort((x, y) => y.score - x.score);
  const picked = [];
  for (const w of windows) {
    if (picked.length >= count) break;
    if (picked.some((p) => w.start < p.end + 45 && w.end > p.start - 45)) continue;
    picked.push(w);
  }
  return picked.map((p) => ({ ...p, start: Math.round(p.start * 100) / 100, end: Math.round(p.end * 100) / 100 }));
}

// ---------- which episodes (pure) ----------
// liveLibrary items → the episodes to look at, breadth first (every show's first episode, then every second...).
export function episodeQueue(items, perShow = 3) {
  const byShow = new Map();
  for (const i of items) {
    if (i.kind !== 'episode' || i.season == null || i.episode == null || !i.season) continue;
    const k = showKeyOf(i);
    if (!byShow.has(k)) byShow.set(k, []);
    byShow.get(k).push(i);
  }
  const lists = [];
  for (const eps of byShow.values()) {
    const first = Math.min(...eps.map((e) => e.season));
    lists.push(eps.filter((e) => e.season === first).sort((a, b) => a.episode - b.episode).slice(0, perShow));
  }
  const out = [];
  for (let round = 0; round < perShow; round++) for (const l of lists) if (l[round]) out.push(l[round]);
  return out;
}
export const showKeyOf = (i) => i.titleKey || `show:${i.show || i.showTitle || i.title}`;

// ---------- the builder ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());
async function builder() {
  status.running = true;
  for (;;) {
    let items = [];
    try { items = await deps.library(); } catch (e) { status.lastError = e.message; }
    const done = new Set(db().prepare('SELECT media_key FROM liklok_scanned').all().map((r) => r.media_key));
    const queue = episodeQueue(items, episodesPerShow()).filter((i) => !done.has(i.key));
    status.queued = queue.length;
    if (!queue.length) { status.current = null; await sleep(30 * 60 * 1000); continue; }
    for (const item of queue.slice(0, 20)) { // then look at the library again (new shows go to the front of the line)
      if (usedBytes() > capBytes()) { status.current = null; status.lastError = 'LikLok is full (LIKLOK_MAX_GB)'; await sleep(60 * 60 * 1000); break; }
      status.current = `${item.showTitle || item.title} S${item.season}E${item.episode}`;
      let result;
      try { result = `ok:${await buildEpisode(item)}`; }
      catch (e) { result = `failed:${String(e.message).slice(0, 200)}`; console.warn(`[liklok] ${status.current}: ${e.message}`); }
      db().prepare('INSERT OR REPLACE INTO liklok_scanned (media_key, result, at) VALUES (?, ?, ?)').run(item.key, result, Date.now());
      status.queued = Math.max(0, (status.queued || 1) - 1);
      await sleep(3000);
    }
  }
}

const usedBytes = () => db().prepare('SELECT COALESCE(SUM(size), 0) AS n FROM liklok_clips').get().n;

function range(x) {
  if (!x) return null;
  if (Array.isArray(x)) return x.length >= 2 ? [Number(x[0]), Number(x[1])] : null;
  if (typeof x === 'object' && x.start != null) return [Number(x.start), Number(x.end)];
  if (typeof x === 'number') return [0, x];
  return null;
}

async function buildEpisode(item) {
  const info = await probeSource(item.file);
  const audio = pickAudio(info.audios, '');
  const { cuts, rms } = await analyse(item.file, info, audio);
  let cues = [];
  const sidecar = deps.subtitleFor(item.file);
  if (sidecar) { try { cues = parseSrt(await fs.promises.readFile(sidecar, 'utf8')); } catch { /* no subs then */ } }
  if (cues.length < 20) cues = await embeddedCues(item.file).catch(() => []);
  const times = deps.timesFor(item.file) || {};
  const recap = range(times.recap), intro = range(times.intro);
  const clips = pickClips({ duration: info.duration, cuts, rms, cues, avoid: [recap, intro].filter(Boolean), from: recap ? recap[1] + 1 : 0 });
  let made = 0;
  for (const c of clips) {
    const id = crypto.randomBytes(6).toString('hex');
    // Cut a hair inside the cuts: never a frame of the shot before or after.
    const start = c.start + 0.04, end = c.end - 0.2;
    await cut(item.file, info, audio, start, end, id);
    const vtt = cues.length ? cuesToVtt(cues, start, end) : null;
    if (vtt) await fs.promises.writeFile(fileOf(id, 'vtt'), vtt);
    const size = fs.statSync(fileOf(id, 'mp4')).size;
    db().prepare(`INSERT INTO liklok_clips (id, media_key, show_key, title_key, show_title, season, episode, episode_name, start, end, score, why, subs, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, item.key, showKeyOf(item), item.titleKey || null, item.showTitle || item.title,
      item.season, item.episode, item.episodeName || null, start, end, c.score, c.why, vtt ? 1 : 0, size, Date.now());
    made++;
  }
  console.log(`[liklok] ${status.current}: ${made} clips${cues.length ? '' : ' (no subtitles)'}`);
  return made;
}

// The episode's own text subtitle track (or the .mkv original's, beside a converted .mp4), English first and the
// SDH one first among those (its [laughs] help), never a forced track.
const TEXT_SUBS = new Set(['subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);
export function pickSubtitleTrack(streams) {
  const ok = streams.filter((s) => TEXT_SUBS.has(s.codec_name) && !s.disposition?.forced && !/forced/i.test(s.tags?.title || ''));
  const en = ok.filter((s) => /^(en|eng)$/i.test(s.tags?.language || ''));
  const pool = en.length ? en : ok.filter((s) => !s.tags?.language || /^(und|sv|swe)$/i.test(s.tags.language));
  return pool.find((s) => s.disposition?.hearing_impaired || /sdh|\bhi\b|hearing/i.test(s.tags?.title || '')) || pool[0] || null;
}
async function embeddedCues(file) {
  const base = file.replace(/\.[^.\\/]+$/, '');
  for (const f of [...new Set([file, `${base}.mkv`])]) {
    if (!fs.existsSync(f)) continue;
    const streams = await new Promise((resolve) => execFile(FFPROBE, ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=index,codec_name:stream_tags=language,title:stream_disposition=forced,hearing_impaired',
      '-of', 'json', f], { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (e, out) => { try { resolve(e ? [] : JSON.parse(out).streams || []); } catch { resolve([]); } }));
    const track = pickSubtitleTrack(streams);
    if (!track) continue;
    const text = await new Promise((resolve) => {
      const child = execFile(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', f, '-map', `0:${track.index}`, '-f', 'srt', 'pipe:1'],
        { timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (e, out) => resolve(e ? '' : String(out)));
      trackChild(child, FFMPEG, [], 'liklok');
      background(child);
    });
    const cues = parseSrt(text);
    if (cues.length >= 20) return cues;
  }
  return [];
}

// One pass over the episode: scene cuts (non-B frames only, at 160 px) and the loudness of every second.
function analyse(file, info, audio) {
  const graph = [`[0:${info.video.index}]scale=160:-2,select='gt(scene\\,0.3)',metadata=print:key=lavfi.scene_score[v]`];
  if (audio) graph.push(`[0:${audio.index}]aresample=8000,asetnsamples=n=8000,astats=metadata=1:reset=1:measure_overall=RMS_level:measure_perchannel=none,ametadata=print:key=lavfi.astats.Overall.RMS_level[a]`);
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'info', '-skip_frame:v', 'bidir', '-threads', '3', '-i', file,
    '-filter_complex', graph.join(';'), '-map', '[v]', ...(audio ? ['-map', '[a]'] : []), '-f', 'null', '-'];
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(FFMPEG, args, { windowsHide: true }); } catch (e) { return reject(e); }
    trackChild(child, FFMPEG, args, 'liklok');
    background(child);
    const cuts = [], rms = [];
    let buf = '', vAt = null, aAt = null, tail = '';
    const line = (l) => {
      const at = /pts_time:([\d.]+)/.exec(l);
      if (l.includes('Parsed_ametadata')) { if (at) aAt = Number(at[1]); const m = /RMS_level=(-?[\d.]+|-inf)/.exec(l); if (m && aAt != null) rms[Math.round(aAt)] = m[1] === '-inf' ? -120 : Number(m[1]); }
      else if (l.includes('Parsed_metadata')) { if (at) vAt = Number(at[1]); if (l.includes('scene_score=') && vAt != null) cuts.push(vAt); }
    };
    child.stderr.on('data', (d) => {
      buf += d;
      const parts = buf.split(/\r?\n|\r/);
      buf = parts.pop();
      for (const l of parts) line(l);
      tail = (tail + d).slice(-600);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (buf) line(buf);
      if (code !== 0) return reject(new Error(tail.trim().split('\n').pop() || `ffmpeg exited with ${code}`));
      resolve({ cuts, rms });
    });
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(FFMPEG, args, { windowsHide: true }); } catch (e) { return reject(e); }
    trackChild(child, FFMPEG, args, 'liklok');
    background(child);
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited with ${code}`))));
  });
}

// The ffmpeg arguments for one clip (pure): always encoded, so it starts on the exact frame.
export function planClip({ input, output, video, audio, start, end, encoder }) {
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-i', input, '-t', (end - start).toFixed(3),
    '-map', `0:${video.index}`, ...(audio ? ['-map', `0:${audio.index}`] : []), '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
    '-vf', videoFilter(video, 1080),
    ...(encoder === 'nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '23', '-b:v', '0'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']),
    '-profile:v', 'high', '-maxrate', '5M', '-bufsize', '10M', '-g', '48'];
  if (isHdr(video)) args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
  if (audio) args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-ar', '48000');
  args.push('-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', output);
  return args;
}

async function cut(file, info, audio, start, end, id) {
  const tmp = fileOf(id, 'tmp.mp4');
  const plan = (encoder) => planClip({ input: file, output: tmp, video: info.video, audio, start, end, encoder });
  try {
    const enc = deps.encoder();
    try { await run(plan(enc)); } catch (e) { if (enc !== 'nvenc') throw e; await run(plan('x264')); }
    await fs.promises.rename(tmp, fileOf(id, 'mp4'));
  } catch (e) { await fs.promises.rm(tmp, { force: true }).catch(() => {}); throw e; }
  await run(['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-ss', '1', '-i', fileOf(id, 'mp4'), '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', fileOf(id, 'jpg')]).catch(() => {});
}

// ---------- the feed ----------
// The next `n` clips for this person. items: liveLibrary (only clips of what's still on the server, with its
// library ids); progress: accounts.progressOf; skip: clip ids the page already has.
export function feed(user, { items, progress = {}, skip = [], n = 8, random = Math.random } = {}) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const firstOf = new Map();
  for (const i of items) {
    if (i.kind !== 'episode' || !i.season) continue;
    const k = showKeyOf(i), f = firstOf.get(k);
    if (!f || i.season < f.season || (i.season === f.season && i.episode < f.episode)) firstOf.set(k, i);
  }
  // Shows this person already watches: episodes with more than a minute watched.
  const watched = new Map();
  for (const [ref, p] of Object.entries(progress)) {
    if (!ref.startsWith('m:') || !(p.time > 60)) continue;
    const i = byKey.get(ref.slice(2));
    if (i?.kind === 'episode') watched.set(showKeyOf(i), (watched.get(showKeyOf(i)) || 0) + 1);
  }
  const nope = new Set(db().prepare('SELECT show_key FROM liklok_nope WHERE user_id = ?').all(user.id).map((r) => r.show_key));
  const since = Date.now() - SEEN_DAYS * DAY;
  const seenAt = new Map(db().prepare("SELECT clip_id, MAX(at) AS at FROM liklok_events WHERE user_id = ? AND at > ? GROUP BY clip_id").all(user.id, since).map((r) => [r.clip_id, r.at]));
  const mySkips = new Map(); // show → swiped away fast, minus watched through
  for (const r of db().prepare(`SELECT c.show_key AS k, e.kind AS kind FROM liklok_events e JOIN liklok_clips c ON c.id = e.clip_id
    WHERE e.user_id = ? AND e.at > ? AND e.kind IN ('skip', 'done', 'watch')`).all(user.id, since)) {
    mySkips.set(r.k, (mySkips.get(r.k) || 0) + (r.kind === 'skip' ? 1 : -1));
  }
  const stats = new Map();
  for (const r of db().prepare("SELECT clip_id, kind, COUNT(*) AS n FROM liklok_events WHERE kind IN ('view', 'skip', 'done', 'watch') GROUP BY clip_id, kind").all()) {
    if (!stats.has(r.clip_id)) stats.set(r.clip_id, { view: 0, skip: 0, done: 0, watch: 0 });
    stats.get(r.clip_id)[r.kind] = r.n;
  }
  const skipSet = new Set(skip);
  const pool = [];
  for (const c of db().prepare('SELECT * FROM liklok_clips').all()) {
    const item = byKey.get(c.media_key);
    if (!item || skipSet.has(c.id) || nope.has(c.show_key)) continue;
    const st = stats.get(c.id) || { view: 0, skip: 0, done: 0, watch: 0 };
    const fb = (st.done + 2 * st.watch - st.skip) / (st.view + 3);
    const w = watched.get(c.show_key) || 0;
    const showWeight = (w === 0 ? 1 : w < 3 ? 0.6 : 0.25) * ((mySkips.get(c.show_key) || 0) >= 2 ? 0.35 : 1);
    const rank = (c.score + 1.5 * fb + 0.5) * showWeight * (0.7 + 0.6 * random());
    pool.push({ c, item, rank, seen: seenAt.get(c.id) || 0 });
  }
  const fresh = pool.filter((p) => !p.seen).sort((a, b) => b.rank - a.rank);
  const old = pool.filter((p) => p.seen).sort((a, b) => a.seen - b.seen); // longest ago first
  const out = [];
  const recent = [];
  for (const list of [fresh, old]) {
    const left = [...list];
    while (out.length < n && left.length) {
      let at = left.findIndex((p) => !recent.slice(-5).includes(p.c.show_key));
      if (at < 0) at = 0;
      const [p] = left.splice(at, 1);
      if (out.some((o) => o.c.id === p.c.id)) continue;
      out.push(p); recent.push(p.c.show_key);
    }
  }
  return out.map(({ c, item }) => {
    const first = firstOf.get(c.show_key);
    return { id: c.id, video: `/api/liklok/v/${c.id}.mp4`, poster: `/api/liklok/v/${c.id}.jpg`, vtt: c.subs ? `/api/liklok/v/${c.id}.vtt` : null,
      showTitle: c.show_title, titleKey: c.title_key, season: c.season, episode: c.episode, episodeName: c.episode_name,
      start: c.start, end: c.end, why: c.why, score: c.score,
      play: { libId: item.id, mediaKey: item.key, title: item.title, season: item.season, episode: item.episode, episodeName: item.episodeName || null },
      first: first && first.key !== item.key ? { libId: first.id, mediaKey: first.key, title: first.title, season: first.season, episode: first.episode, episodeName: first.episodeName || null } : null,
      genres: item.genres || [] };
  });
}

export function record(user, body) {
  const kind = String(body?.kind || ''), id = String(body?.id || '');
  if (!KINDS.has(kind) || !/^[a-f0-9]{12}$/.test(id)) throw Object.assign(new Error('Unknown event.'), { status: 400 });
  const clip = db().prepare('SELECT show_key FROM liklok_clips WHERE id = ?').get(id);
  if (!clip) throw Object.assign(new Error('That clip is gone.'), { status: 404 });
  const ms = Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(body.ms) || 0)));
  db().prepare('INSERT INTO liklok_events (user_id, clip_id, kind, ms, at) VALUES (?, ?, ?, ?, ?)').run(user.id, id, kind, ms, Date.now());
  if (kind === 'nope') db().prepare('INSERT OR REPLACE INTO liklok_nope (user_id, show_key, at) VALUES (?, ?, ?)').run(user.id, clip.show_key, Date.now());
  return { ok: true };
}

export function undoNope(user, id) {
  const clip = db().prepare('SELECT show_key FROM liklok_clips WHERE id = ?').get(String(id));
  if (clip) db().prepare('DELETE FROM liklok_nope WHERE user_id = ? AND show_key = ?').run(user.id, clip.show_key);
  return { ok: true };
}

export function summary() {
  const clips = db().prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT show_key) AS shows, COALESCE(SUM(size), 0) AS bytes FROM liklok_clips').get();
  const scanned = db().prepare('SELECT COUNT(*) AS n FROM liklok_scanned').get().n;
  return { building: status.running, current: status.current, queued: status.queued ?? null, scanned, clips: clips.n, shows: clips.shows,
    gb: Math.round((clips.bytes / 1024 ** 3) * 10) / 10, lastError: status.lastError };
}

// /api/liklok/v/<id>.mp4|jpg|vtt → the file (or null).
export function fileFor(name) {
  const m = /^([a-f0-9]{12})\.(mp4|jpg|vtt)$/.exec(String(name));
  if (!m || !dir) return null;
  const f = fileOf(m[1], m[2]);
  return fs.existsSync(f) ? f : null;
}
