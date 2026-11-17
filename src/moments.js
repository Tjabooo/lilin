// Moments: a short piece of a film or episode someone cut in the player (⋯ → Clip a moment) to send to
// friends or to share as a link. Not the owner's game Clips (clips.js), which are a different thing.
//
// The server cuts the piece with ffmpeg into its own small MP4 (H.264 + stereo AAC, plays everywhere):
// when the source is already browser-safe H.264 and a keyframe sits right at the start, the video is
// copied as it is (instant, no quality loss); otherwise the piece is encoded (NVENC when the server has
// it, else x264 veryfast), at most 1080p, HDR tone-mapped to SDR. Subtitles the person had on are kept
// as a small WebVTT file beside it, never burned in.
//
// Each moment has an unguessable link, /c/m/<token>: a public page (like shared game clips, /c/ is let
// through Cloudflare Access) with Lilin's player and only that piece. The sharer can delete it any time,
// which kills the link; every moment goes after MOMENTS_DAYS, and the oldest go first past MOMENTS_MAX_GB.
//
// Sending to friends (friends.js areFriends) adds it to their "Shared with you" and notifies them once
// it's ready (push kind "share"). Restricted people (accounts.isRestricted) can make links but can't send
// or be sent moments directly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { database, userById, isRestricted } from './accounts.js';
import { areFriends } from './friends.js';
import { videoFilter } from './phone-stream.js';
import { isHdr } from './travel.js';
import { trackChild } from './load.js';
import { background } from './priority.js';
import { page, baseUrl, esc, playerPage } from './clips.js';
import { translateHtml } from './i18n.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const MAX_SECONDS = 180;   // the longest moment
export const MIN_SECONDS = 2;
const PER_DAY = 30;               // moments one person can make in 24 hours
const MAX_TO = 20;                // friends one moment can be sent to at once
const MAX_NOTE = 200;
const MAX_CUES = 400;
const DAY = 86400000;
const KEYFRAME_SLACK = 0.25;      // a keyframe this close to the start lets the video be copied
const days = () => Math.max(1, Number(process.env.MOMENTS_DAYS) || 30);
const capBytes = () => Math.max(0.5, Number(process.env.MOMENTS_MAX_GB) || 20) * 1024 ** 3;

let dir = null;
let getEncoder = () => 'x264';
let onReady = () => {};
let resolveFile = () => null; // media key -> file, for moments cut again after a restart
const db = () => database();
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fileOf = (id, ext) => path.join(dir, `${id}.${ext}`);

export function initMoments({ dataDir, cacheDir = path.join(dataDir, 'cache'), encoder, ready, resolve } = {}) {
  if (resolve) resolveFile = resolve;
  dir = process.env.MOMENTS_DIR ? path.resolve(process.env.MOMENTS_DIR) : path.join(cacheDir, 'moments');
  fs.mkdirSync(dir, { recursive: true });
  if (encoder) getEncoder = encoder;
  if (ready) onReady = ready;
  db().exec(`
    CREATE TABLE IF NOT EXISTS moments (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      media_key TEXT,
      title TEXT NOT NULL,
      label TEXT,
      title_key TEXT,
      start REAL NOT NULL,
      end REAL NOT NULL,
      note TEXT,
      subs INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'making',
      error TEXT,
      mode TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moments_user ON moments(user_id);
    CREATE TABLE IF NOT EXISTS moment_shares (
      moment_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      sent_at INTEGER NOT NULL,
      notified INTEGER NOT NULL DEFAULT 0,
      seen_at INTEGER,
      PRIMARY KEY (moment_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS moment_shares_user ON moment_shares(user_id);
  `);
  // Moments cut when the server stopped are cut again (their source may be gone: then they fail).
  for (const r of db().prepare("SELECT * FROM moments WHERE state = 'making'").all()) queueCut(r, null);
  setTimeout(prune, 30000).unref?.();
  setInterval(prune, 3600 * 1000).unref?.();
}

// ---------- time checks (pure) ----------
// start/end in seconds of the source; duration: the source's length (0 = unknown).
export function checkRange(start, end, duration = 0) {
  start = Number(start); end = Number(end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw fail(400, 'Pick where the moment starts and ends.');
  start = Math.max(0, Math.round(start * 100) / 100);
  end = Math.round(end * 100) / 100;
  if (duration > 0) end = Math.min(end, duration);
  if (duration > 0 && start >= duration - MIN_SECONDS / 2) throw fail(400, 'That’s past the end of the video.');
  if (end - start < MIN_SECONDS) throw fail(400, 'A moment needs to be at least 2 seconds long.');
  if (end - start > MAX_SECONDS + 0.05) throw fail(400, 'A moment can be at most 3 minutes long.');
  return { start, end, length: Math.round((end - start) * 100) / 100 };
}

// Subtitle cues the player showed, shifted to the moment's own timeline, as WebVTT (or null).
export function cuesToVtt(cues, start, end) {
  if (!Array.isArray(cues)) return null;
  const stamp = (t) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const lines = [];
  for (const c of cues.slice(0, MAX_CUES * 4)) {
    const a = Number(c?.start), b = Number(c?.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= start || a >= end || b <= a) continue;
    // plain text only: tags and anything that could break the cue format are dropped
    const text = String(c.text ?? '').replace(/<[^>]*>/g, '').replace(/-->/g, '→').replace(/\r/g, '')
      .split('\n').map((l) => l.replace(/[\u0000-\u001f\u007f]/g, '').trim()).filter(Boolean).join('\n').slice(0, 300);
    if (!text) continue;
    lines.push(`${stamp(Math.max(a, start) - start)} --> ${stamp(Math.min(b, end) - start)}\n${text}`);
    if (lines.length >= MAX_CUES) break;
  }
  return lines.length ? `WEBVTT\n\n${lines.join('\n\n')}\n` : null;
}

// ---------- cutting ----------
function probe(file) {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
        if (error) return reject(fail(422, 'Couldn’t read this video.'));
        try {
          const info = JSON.parse(stdout);
          const streams = info.streams || [];
          const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
          const audios = streams.filter((s) => s.codec_type === 'audio');
          const duration = Number(info.format?.duration) || Number(video?.duration) || 0;
          if (!video) return reject(fail(422, 'Couldn’t read this video.'));
          resolve({ duration, video, audios });
        } catch { reject(fail(422, 'Couldn’t read this video.')); }
      });
  });
}
export const probeSource = probe;

// Keyframe times near `at` (a few seconds either side).
function keyframesNear(file, at) {
  const from = Math.max(0, at - 6);
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=best_effort_timestamp_time,pts_time',
      '-read_intervals', `${from}%+8`, '-of', 'csv=p=0', file], { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) return resolve([]);
      resolve(String(stdout).split(/\r?\n/).map((l) => Number(l.split(',').find((x) => x && x !== 'N/A'))).filter(Number.isFinite));
    });
  });
}

// Which audio track: the person's language, else the default track, else the first.
const ISO3 = { eng: 'en', swe: 'sv', dan: 'da', nor: 'no', nob: 'no', fin: 'fi', ger: 'de', deu: 'de', dut: 'nl', nld: 'nl', fre: 'fr', fra: 'fr',
  spa: 'es', ita: 'it', pol: 'pl', por: 'pt', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', tur: 'tr', ara: 'ar', hin: 'hi' };
const langOf = (code) => { const c = String(code || '').toLowerCase(); return ISO3[c] || c; };
export function pickAudio(audios, lang = '') {
  if (!audios?.length) return null;
  return (lang && audios.find((a) => langOf(a.tags?.language) === langOf(lang)))
    || audios.find((a) => a.disposition?.default) || audios[0];
}

// The ffmpeg arguments for one moment (pure, so it can be tested): copy when it can, else encode.
export function planCut({ input, output, video, audio, start, end, keyframes = [], encoder = 'x264' }) {
  const length = end - start;
  const safe = video.codec_name === 'h264' && !/10|12/.test(video.pix_fmt || '') && (Number(video.height) || 0) <= 1100 && !isHdr(video);
  const key = safe ? keyframes.filter((k) => Math.abs(k - start) <= KEYFRAME_SLACK).sort((a, b) => Math.abs(a - start) - Math.abs(b - start))[0] : undefined;
  const copy = key !== undefined;
  const at = copy ? key : start;
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', input, '-t', length.toFixed(3),
    '-map', `0:${video.index}`];
  if (audio) args.push('-map', `0:${audio.index}`);
  args.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1');
  if (copy) args.push('-c:v', 'copy');
  else {
    args.push('-vf', videoFilter(video, 1080));
    args.push(...(encoder === 'nvenc'
      ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21']), '-profile:v', 'high',
    '-maxrate', '6M', '-bufsize', '12M'); // sent over phones' data: about 45 MB a minute at most
    if (isHdr(video)) args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
  }
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000');
  args.push('-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', output);
  return { args, mode: copy ? 'copy' : encoder === 'nvenc' ? 'nvenc' : 'x264' };
}

function run(args) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(FFMPEG, args, { windowsHide: true }); } catch (e) { return reject(e); }
    trackChild(child, FFMPEG, args, 'moments');
    background(child);
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited with ${code}`))));
  });
}

// One cut at a time, in the background.
let chain = Promise.resolve();
const sources = new Map(); // moment id -> { file, audioLang } until it's cut (lost on restart: then re-read from media_key)
function queueCut(row, source) {
  if (source) sources.set(row.id, source);
  chain = chain.then(() => cut(row.id)).catch(() => {});
  return chain;
}
export const idle = () => chain;

async function cut(id) {
  const row = db().prepare('SELECT * FROM moments WHERE id = ?').get(id);
  if (!row || row.state !== 'making') return;
  const source = sources.get(id) || { file: await resolveFile(row.media_key), audioLang: '' };
  sources.delete(id);
  const out = fileOf(id, 'mp4');
  const tmp = fileOf(id, 'tmp.mp4');
  try {
    if (!source.file || !fs.existsSync(source.file)) throw new Error('The video isn’t on the server any more.');
    const info = await probe(source.file);
    const audio = pickAudio(info.audios, source.audioLang);
    const keyframes = await keyframesNear(source.file, row.start);
    let plan = planCut({ input: source.file, output: tmp, video: info.video, audio, start: row.start, end: row.end, keyframes, encoder: getEncoder() });
    try { await run(plan.args); }
    catch (e) {
      if (plan.mode !== 'nvenc') throw e;
      plan = planCut({ input: source.file, output: tmp, video: info.video, audio, start: row.start, end: row.end, keyframes: [], encoder: 'x264' });
      await run(plan.args);
    }
    await fs.promises.rename(tmp, out);
    await run(['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-ss', String(Math.min(1, (row.end - row.start) / 3)), '-i', out,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', fileOf(id, 'jpg')]).catch(() => {});
    const size = fs.statSync(out).size;
    db().prepare("UPDATE moments SET state = 'ready', mode = ?, size = ?, error = NULL WHERE id = ?").run(plan.mode, size, id);
    enforceCap();
    deliver(id);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    console.warn(`[moments] ${id}: ${e.message}`);
    db().prepare("UPDATE moments SET state = 'failed', error = ? WHERE id = ?").run(String(e.message || 'failed').slice(0, 300), id);
  }
}

// Tell the people it was sent to, once it can be watched.
function deliver(id) {
  const row = db().prepare("SELECT * FROM moments WHERE id = ? AND state = 'ready'").get(id);
  if (!row) return;
  const ids = db().prepare('SELECT user_id FROM moment_shares WHERE moment_id = ? AND notified = 0').all(id).map((r) => r.user_id);
  if (!ids.length) return;
  db().prepare('UPDATE moment_shares SET notified = 1 WHERE moment_id = ?').run(id);
  try { onReady(view(row), ids); } catch (e) { console.warn('[moments] notify:', e.message); }
}

// ---------- the API (callers check sign-in) ----------
// source: { file, mediaKey, title, label, titleKey, duration?, audioLang }
export async function create(user, source, body) {
  if (!source?.file) throw fail(404, 'That video isn’t on the server any more.');
  const recent = db().prepare('SELECT COUNT(*) AS n FROM moments WHERE user_id = ? AND created_at > ?').get(user.id, Date.now() - DAY).n;
  if (recent >= PER_DAY) throw fail(429, 'That’s a lot of moments for one day. Make more tomorrow.');
  const duration = Number(source.duration) || (await probe(source.file)).duration;
  const { start, end } = checkRange(body?.start, body?.end, duration);
  const id = crypto.randomBytes(6).toString('hex');
  const token = crypto.randomBytes(16).toString('base64url');
  const vtt = body?.subtitles ? cuesToVtt(body.subtitles, start, end) : null;
  if (vtt) fs.writeFileSync(fileOf(id, 'vtt'), vtt);
  const now = Date.now();
  db().prepare(`INSERT INTO moments (id, token, user_id, media_key, title, label, title_key, start, end, note, subs, state, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'making', ?, ?)`).run(id, token, user.id, source.mediaKey || null, clean(source.title, 200) || 'Video',
    clean(source.label, 120) || null, /^(movie|tv):\d{1,9}$/.test(String(source.titleKey || '')) ? source.titleKey : null,
    start, end, clean(body?.note, MAX_NOTE) || null, vtt ? 1 : 0, now, now + days() * DAY);
  queueCut({ id }, { file: source.file, audioLang: source.audioLang || '' });
  return byId(id, user);
}

// Send a moment to friends. Returns the ids it went to (only friends, never restricted people).
export function send(user, id, userIds) {
  const row = own(user, id);
  if (isRestricted(user)) throw fail(403, 'Copy the link and send it instead.');
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number))].filter((to) => to !== user.id && areFriends(user.id, to)).slice(0, MAX_TO);
  if (!ids.length) throw fail(400, 'Choose a friend to send it to.');
  const add = db().prepare('INSERT OR IGNORE INTO moment_shares (moment_id, user_id, sent_at) VALUES (?, ?, ?)');
  const sent = ids.filter((to) => add.run(row.id, to, Date.now()).changes > 0);
  if (row.state === 'ready') deliver(row.id);
  return { sent: sent.length, moment: byId(row.id, user) };
}

export function remove(user, id) {
  const row = db().prepare('SELECT * FROM moments WHERE id = ?').get(String(id));
  if (!row) throw fail(404, 'That moment is gone.');
  // The person who made it deletes it for everyone; someone it was sent to only takes it off their list.
  if (row.user_id !== user.id) {
    const n = db().prepare('DELETE FROM moment_shares WHERE moment_id = ? AND user_id = ?').run(row.id, user.id).changes;
    if (!n && !user.isOwner) throw fail(404, 'That moment is gone.');
    if (n) return { ok: true };
  }
  drop(row.id);
  return { ok: true };
}

export const ownerOf = (id) => db().prepare('SELECT user_id FROM moments WHERE id = ?').get(String(id))?.user_id ?? null;

export function markSeen(user, id) {
  db().prepare('UPDATE moment_shares SET seen_at = COALESCE(seen_at, ?) WHERE moment_id = ? AND user_id = ?').run(Date.now(), String(id), user.id);
}

function drop(id) {
  db().prepare('DELETE FROM moment_shares WHERE moment_id = ?').run(id);
  db().prepare('DELETE FROM moments WHERE id = ?').run(id);
  sources.delete(id);
  for (const ext of ['mp4', 'tmp.mp4', 'jpg', 'vtt']) fs.rm(fileOf(id, ext), { force: true }, () => {});
}

function own(user, id) {
  const row = db().prepare('SELECT * FROM moments WHERE id = ?').get(String(id));
  if (!row || row.user_id !== user.id) throw fail(404, 'That moment is gone.');
  return row;
}

const person = (id) => { const u = userById(id); return u ? { id: u.id, name: u.name, avatar: u.avatar || null } : null; };
function view(row) {
  return { id: row.id, token: row.token, url: `/c/m/${row.token}`, title: row.title, label: row.label || '', titleKey: row.title_key || null,
    start: row.start, end: row.end, length: Math.round((row.end - row.start) * 10) / 10, note: row.note || '', subtitles: Boolean(row.subs),
    state: row.state, error: row.error || null, mode: row.mode || null, createdAt: row.created_at, expiresAt: row.expires_at,
    thumb: row.state === 'ready' ? `/c/m/${row.token}/thumb.jpg` : null };
}
function byId(id, user) {
  const row = db().prepare('SELECT * FROM moments WHERE id = ?').get(id);
  if (!row) return null;
  const to = db().prepare('SELECT user_id FROM moment_shares WHERE moment_id = ?').all(id).map((r) => person(r.user_id)).filter(Boolean);
  return { ...view(row), mine: row.user_id === user?.id, to };
}

// { mine: moments you made, shared: moments friends sent you (newest first) }
export function list(user) {
  const mine = db().prepare('SELECT id FROM moments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(user.id).map((r) => byId(r.id, user));
  const shared = isRestricted(user) ? [] : db().prepare(`SELECT m.*, s.seen_at, s.sent_at FROM moment_shares s JOIN moments m ON m.id = s.moment_id
    WHERE s.user_id = ? AND m.state = 'ready' ORDER BY s.sent_at DESC LIMIT 100`).all(user.id)
    .map((r) => ({ ...view(r), from: person(r.user_id), sentAt: r.sent_at, seen: Boolean(r.seen_at) })).filter((m) => m.from);
  return { mine, shared, unseen: shared.filter((m) => !m.seen).length, max: MAX_SECONDS };
}

// ---------- housekeeping ----------
function prune() {
  if (!dir) return;
  for (const r of db().prepare('SELECT id FROM moments WHERE expires_at < ?').all(Date.now())) drop(r.id);
  // stuck "making" rows from a crash long ago
  for (const r of db().prepare("SELECT id FROM moments WHERE state = 'making' AND created_at < ?").all(Date.now() - DAY)) {
    if (!sources.has(r.id)) db().prepare("UPDATE moments SET state = 'failed', error = 'Interrupted' WHERE id = ?").run(r.id);
  }
  enforceCap();
  // files left behind by moments that no longer exist
  const known = new Set(db().prepare('SELECT id FROM moments').all().map((r) => r.id));
  fs.readdir(dir, (err, names) => {
    if (err) return;
    for (const n of names) if (!known.has(n.split('.')[0])) fs.rm(path.join(dir, n), { force: true }, () => {});
  });
}
function enforceCap() {
  let total = db().prepare('SELECT COALESCE(SUM(size), 0) AS n FROM moments').get().n;
  if (total <= capBytes()) return;
  for (const r of db().prepare("SELECT id, size FROM moments WHERE state != 'making' ORDER BY created_at").all()) {
    if (total <= capBytes()) break;
    drop(r.id);
    total -= r.size;
  }
}

// ---------- the public page (/c/m/<token>) ----------
// Returns true when it handled the request.
export async function handlePublic(req, res, url, { sendVideo }) {
  const m = url.pathname.match(/^\/c\/m\/([A-Za-z0-9_-]{22})(?:\/(video\.mp4|thumb\.jpg|subs\.vtt|preview\.json|preview\/\d{1,4}\.jpg))?\/?$/);
  if (!m) return false;
  const send = (status, type, data, extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', Vary: 'Cookie, Accept-Language', ...extra });
    res.end(req.method === 'HEAD' ? undefined : (String(type).startsWith('text/html') ? translateHtml(data) : data));
    return true;
  };
  const row = db().prepare('SELECT * FROM moments WHERE token = ?').get(m[1]);
  if (!row || row.expires_at < Date.now()) {
    if (m[2]) return send(404, 'text/plain', 'Not found.');
    return send(404, 'text/html; charset=utf-8', page({ title: 'Moment not found', desc: 'This link doesn’t work any more.', url: '',
      body: '<h1>This moment isn’t shared any more</h1><p>Ask whoever sent it for a new link.</p>' }));
  }
  const ready = row.state === 'ready' && fs.existsSync(fileOf(row.id, 'mp4'));
  if (m[2] === 'video.mp4') {
    if (!ready) return send(503, 'text/plain', 'Still being prepared.', { 'Retry-After': '10' });
    await sendVideo(req, res, fileOf(row.id, 'mp4'));
    return true;
  }
  if (m[2] === 'thumb.jpg') {
    try { return send(200, 'image/jpeg', await fs.promises.readFile(fileOf(row.id, 'jpg')), { 'Cache-Control': 'public, max-age=3600' }); }
    catch { return send(404, 'text/plain', 'Not found.'); }
  }
  if (m[2] === 'subs.vtt') {
    try { return send(200, 'text/vtt; charset=utf-8', await fs.promises.readFile(fileOf(row.id, 'vtt'))); }
    catch { return send(404, 'text/plain', 'Not found.'); }
  }
  if (m[2]) return send(404, 'text/plain', 'Not found.'); // no timeline previews: moments are short
  const link = `${baseUrl(req)}/c/m/${row.token}`;
  const from = person(row.user_id)?.name || '';
  const sub = [row.label, from && `from ${from}`].filter(Boolean).join(' · ');
  if (row.state === 'failed') {
    return send(200, 'text/html; charset=utf-8', page({ title: row.title, desc: 'This moment couldn’t be made.', url: link,
      body: `<h1>${esc(row.title)}</h1><div class="wait"><p>This moment couldn’t be made. Ask whoever sent it to try again.</p></div>` }));
  }
  if (!ready) {
    return send(200, 'text/html; charset=utf-8', page({ title: row.title, desc: sub || 'A moment from Lilin', url: link,
      body: `<h1>${esc(row.title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}<div class="wait"><p>This moment is still being prepared. It plays here in a moment.</p></div><script>setTimeout(()=>location.reload(),5000)</script>` }));
  }
  return send(200, 'text/html; charset=utf-8', playerPage({ title: row.title, game: sub || 'Lilin', link, note: row.note || '',
    track: row.subs ? `${new URL(link).pathname}/subs.vtt` : null, desc: row.note || `${sub || 'Lilin'} · watch the moment` }));
}
