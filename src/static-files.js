// The web app's own files (public/), sent with a strong ETag and, for text, brotli or gzip.
// Cache-Control stays `no-cache`: the browser asks every time, but a file that hasn't changed costs a 304 and no body,
// and a new deploy is picked up on the very next load (the ETag is the file's content hash). Compressed copies are kept
// in memory per file, keyed by its size and mtime, so each one is made once per deploy. Brotli at its best setting is
// slow for app.js (~0.5 s), so it's made in the background: until it's ready, those requests get gzip.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|wasm|xml)|image\/svg\+xml)/;
const MIN_SIZE = 1024;          // smaller files gain nothing worth a Vary
const MAX_FILE = 8 << 20;       // bigger files are sent as they are, uncached and uncompressed
const MAX_TOTAL = 96 << 20;     // all cached copies together

// The encodings this request accepts, best first ('br', 'gzip'); q=0 turns one off.
export function acceptedEncodings(header) {
  const q = new Map();
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const value = qp ? Number(qp.slice(2)) : 1;
    q.set(name.trim(), Number.isFinite(value) ? value : 0);
  }
  const ok = (name) => (q.has(name) ? q.get(name) > 0 : (q.get('*') || 0) > 0);
  return ['br', 'gzip'].filter(ok);
}

// If-None-Match against this file: weak comparison (RFC 9110), and any encoding of the same content counts.
export function matches(header, hash) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((tag) => {
    const t = tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    return t === hash || t === `${hash}-br` || t === `${hash}-gz`;
  });
}

export function createStaticFiles({ maxTotal = MAX_TOTAL, maxFile = MAX_FILE, brotliQuality = 11 } = {}) {
  const cache = new Map(); // full path -> { key, hash, raw, gz, br, brPending, bytes }
  let total = 0;

  const drop = (full) => { const e = cache.get(full); if (e) { total -= e.bytes; cache.delete(full); } };
  const grow = (entry, buf) => {
    entry.bytes += buf.length; total += buf.length;
    // Oldest first (Map keeps insertion order); the entry being served stays.
    for (const [k] of cache) { if (total <= maxTotal) break; if (cache.get(k) !== entry) drop(k); }
  };

  async function load(full, stat) {
    const key = `${stat.size}:${stat.mtimeMs}`;
    const hit = cache.get(full);
    if (hit && hit.key === key) { cache.delete(full); cache.set(full, hit); return hit; } // most recently used last
    drop(full);
    const raw = await fs.promises.readFile(full);
    const entry = { key, hash: crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 27), raw, gz: null, br: null, brPending: null, bytes: 0 };
    cache.set(full, entry);
    grow(entry, raw);
    return entry;
  }

  async function encoded(entry, want) {
    if (want === 'br') {
      if (entry.br) return entry.br;
      entry.brPending ||= brotli(entry.raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.raw.length } })
        .then((buf) => { if (cache.get(entry.full) === entry) { entry.br = buf; grow(entry, buf); } return buf; })
        .catch(() => null);
      return null; // ready next time; this one gets gzip
    }
    if (!entry.gz) {
      const buf = await gzip(entry.raw, { level: 9 });
      if (!entry.gz) { entry.gz = buf; grow(entry, buf); }
    }
    return entry.gz;
  }

  // Sends `full` (an existing path, already checked to be inside a public folder). Returns false if it isn't a file.
  // headers: the response headers besides the content ones (Cache-Control and friends).
  async function send(req, res, full, contentType, headers = {}) {
    let stat;
    try { stat = await fs.promises.stat(full); } catch { return false; }
    if (!stat.isFile()) return false;
    let entry;
    if (stat.size > maxFile) {
      const raw = await fs.promises.readFile(full);
      entry = { hash: crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 27), raw, gz: null, br: null, loose: true, bytes: 0 };
    } else {
      entry = await load(full, stat);
      entry.full = full;
    }
    const compressible = !entry.loose && COMPRESSIBLE.test(contentType) && entry.raw.length >= MIN_SIZE;
    const base = { 'Content-Type': contentType, ...headers };
    if (compressible) base.Vary = base.Vary ? `${base.Vary}, Accept-Encoding` : 'Accept-Encoding';
    if (matches(req.headers['if-none-match'], entry.hash)) {
      res.writeHead(304, { ...base, ETag: `"${entry.hash}"` });
      res.end();
      return true;
    }
    let body = entry.raw, encoding = null;
    if (compressible) {
      for (const want of acceptedEncodings(req.headers['accept-encoding'])) {
        const buf = await encoded(entry, want);
        if (buf && buf.length < entry.raw.length) { body = buf; encoding = want; break; }
      }
    }
    const tag = encoding ? `"${entry.hash}-${encoding === 'br' ? 'br' : 'gz'}"` : `"${entry.hash}"`;
    res.writeHead(200, { ...base, ETag: tag, 'Content-Length': body.length, ...(encoding ? { 'Content-Encoding': encoding } : {}) });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  // Waits for background brotli work (tests).
  const settle = () => Promise.all([...cache.values()].map((e) => e.brPending).filter(Boolean));
  return { send, settle, size: () => total, entries: () => cache.size };
}
