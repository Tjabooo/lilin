// Profile banners people upload themselves (Edit profile → Look → Banner → Upload). The picture is checked by its
// first bytes (JPEG, PNG or WebP only), its size read from the header before anything decodes it (so a tiny file that
// claims to be 30000 x 30000 never reaches ffmpeg), then re-encoded by ffmpeg to one WebP at most 1920 px wide
// (JPEG if this ffmpeg has no WebP encoder). Re-encoding drops everything but the pixels: EXIF, GPS, colour profiles,
// comments, anything hidden after the image data. Kept as .lilin-banners/<user id>.<ext>; the profile's look holds the
// upload time as `upload`, which versions the URL so browsers can cache it forever.
//
// Uploads are rate-limited per person (UPLOADS_PER_HOUR). Who may see a banner is the profile's business
// (profiles.access): the route in server.js checks it before serving the file.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { imageKind } from './accounts.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const BANNER_MAX = 8 * 1024 * 1024;
export const MAX_SIDE = 12000;
export const MAX_PIXELS = 48e6;
export const OUT_WIDTH = 1920;
export const UPLOADS_PER_HOUR = 12;
const TYPES = { webp: 'image/webp', jpg: 'image/jpeg' };

let dir = null;
export function initBanners({ dataDir }) { dir = path.join(dataDir, '.lilin-banners'); }

const fail = (status, message) => Object.assign(new Error(message), { status });

// Width and height from the file's header: { width, height, animated } or null when it can't be read.
export function imageSize(buf) {
  const kind = imageKind(buf);
  try {
    if (kind === 'png') {
      if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
      const anim = buf.indexOf('acTL', 8, 'ascii'); // APNG: its animation chunk comes before the first image data
      const data = buf.indexOf('IDAT', 8, 'ascii');
      return { kind, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), animated: anim > 0 && (data < 0 || anim < data) };
    }
    if (kind === 'jpg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        if (marker === 0xff) { i++; continue; } // fill byte
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        // start of frame (any kind but DHT C4, JPG C8 and DAC CC) holds the size
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { kind, height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), animated: false };
        if (marker === 0xd9 || marker === 0xda) return null; // image data before any frame header
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    if (kind === 'webp') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return { kind, width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, animated: false };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { kind, width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1, animated: false }; }
      if (chunk === 'VP8X') return { kind, width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), animated: Boolean(buf[20] & 0x02) };
    }
  } catch { /* cut short */ }
  return null;
}

// Throws a clear message for anything that isn't a picture we take; returns the header's facts.
export function checkImage(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail(400, 'Pick a picture first.');
  if (buf.length > BANNER_MAX) throw fail(413, 'That picture is too large. Keep it under 8 MB.');
  if (!imageKind(buf)) throw fail(415, 'Use a JPEG, PNG or WebP picture.');
  const size = imageSize(buf);
  if (!size || !size.width || !size.height) throw fail(415, 'That picture couldn’t be read. Try another one.');
  if (size.animated) throw fail(415, 'Moving pictures can’t be banners. Use a still one.');
  if (size.width > MAX_SIDE || size.height > MAX_SIDE || size.width * size.height > MAX_PIXELS) throw fail(413, 'That picture has too many pixels. Use a smaller one.');
  if (size.width < 320 || size.height < 120) throw fail(400, 'That picture is too small for a banner.');
  return size;
}

// Per person: when their last uploads were. allow() says whether one more is fine now (and counts it).
const recent = new Map();
export function allowUpload(userId, now = Date.now()) {
  const list = (recent.get(userId) || []).filter((t) => now - t < 3600_000);
  if (list.length >= UPLOADS_PER_HOUR) { recent.set(userId, list); return false; }
  list.push(now);
  recent.set(userId, list);
  return true;
}
export const resetLimits = () => recent.clear(); // tests

function run(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(FFMPEG, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { return reject(e); }
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (c) => { if (err.length < 4000) err += c; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited with ${code}`)); });
  });
}

// The ffmpeg arguments (pure, for tests): a still image only (image2, no patterns), first frame, shrunk to OUT_WIDTH,
// no metadata, 8-bit 4:2:0.
export function encodeArgs(input, output, format) {
  const scale = `scale='min(${OUT_WIDTH},iw)':-2:flags=lanczos`;
  const codec = format === 'webp' ? ['-vf', `${scale},format=yuv420p`, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '4', '-f', 'webp']
    : ['-vf', `${scale},format=yuvj420p`, '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2'];
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'image2', '-pattern_type', 'none', '-i', input,
    '-frames:v', '1', '-map', '0:v:0', '-map_metadata', '-1', '-map_chapters', '-1', ...codec, output];
}

// Stores a new banner for userId (a Buffer, already within BANNER_MAX). Returns the version for the URL.
export async function saveBanner(userId, buf, now = Date.now()) {
  if (!dir) throw fail(500, 'Banners aren’t set up.');
  const { kind } = checkImage(buf);
  fs.mkdirSync(dir, { recursive: true });
  const id = Number(userId);
  const input = path.join(dir, `${id}.upload.${kind}`);
  fs.writeFileSync(input, buf);
  let made = null;
  try {
    for (const format of ['webp', 'jpg']) {
      const out = path.join(dir, `${id}.new.${format}`);
      try { await run(encodeArgs(input, out, format)); } catch (e) { fs.rmSync(out, { force: true }); console.log(`[banner] ${format} for ${id}: ${e.message}`); continue; }
      if (fs.existsSync(out) && fs.statSync(out).size > 0) { made = { out, format }; break; }
    }
  } finally { fs.rmSync(input, { force: true }); }
  if (!made) throw fail(415, 'That picture couldn’t be read. Try another one.');
  for (const ext of Object.keys(TYPES)) if (ext !== made.format) fs.rmSync(path.join(dir, `${id}.${ext}`), { force: true });
  fs.renameSync(made.out, path.join(dir, `${id}.${made.format}`));
  return Math.max(1, Math.floor(now));
}

export function removeBanner(userId) {
  if (!dir) return;
  for (const ext of Object.keys(TYPES)) fs.rmSync(path.join(dir, `${Number(userId)}.${ext}`), { force: true });
}

export function bannerFile(userId) {
  if (!dir || !Number.isSafeInteger(Number(userId))) return null;
  for (const [ext, type] of Object.entries(TYPES)) {
    const file = path.join(dir, `${Number(userId)}.${ext}`);
    if (fs.existsSync(file)) return { file, type };
  }
  return null;
}

export const bannerUrl = (userId, version) => (Number.isSafeInteger(version) && version > 0 ? `/api/profiles/${Number(userId)}/banner?v=${version.toString(36)}` : null);
