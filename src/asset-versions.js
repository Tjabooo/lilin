// Versioned asset URLs for the web app, so a browser never runs new JavaScript against an old stylesheet
// (or the other way round) after a deploy. index.html goes out with every local stylesheet and script as
// /name.css?v=<hash> and an import map that sends every module import (./profiles.js, import('./x.js')) to its
// versioned URL. The hash is the start of the same content hash static-files.js uses for the ETag, so a
// ?v that matches the file on disk can be cached for good (versionMatches); an old ?v just gets the current
// file with the usual no-cache. Browsers without import maps ignore it and load the plain URLs as before.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION_LENGTH = 10;
export const contentVersion = (buf) => crypto.createHash('sha1').update(buf).digest('base64url').slice(0, VERSION_LENGTH);

// True when ?v names the current content of this file (its ETag hash from static-files.js starts with it).
export const versionMatches = (v, etagHash) => typeof v === 'string' && v.length === VERSION_LENGTH && typeof etagHash === 'string' && etagHash.startsWith(v);

// index.html with versioned URLs. files: { 'style.css': 'AbC…', 'app.js': '…' } (top-level files only).
export function rewriteIndex(html, files) {
  const v = (name) => files[name];
  let out = html.replace(/(<link\b[^>]*\bhref=|<script\b[^>]*\bsrc=)"\/([A-Za-z0-9_.-]+\.(?:css|js))"/g,
    (all, before, name) => (v(name) ? `${before}"/${name}?v=${v(name)}"` : all));
  const imports = Object.fromEntries(Object.keys(files).filter((n) => n.endsWith('.js')).sort().map((n) => [`/${n}`, `/${n}?v=${files[n]}`]));
  if (!Object.keys(imports).length) return out;
  // `<` can't appear in the JSON (file names are plain), so it can't close the script early.
  const map = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  // Before the first module script (an import map has to come first), else at the end of <head>.
  const at = out.search(/<script\b[^>]*type="module"/);
  if (at >= 0) out = out.slice(0, at) + map + '\n  ' + out.slice(at);
  else out = out.replace('</head>', `${map}\n</head>`);
  return out;
}

// Keeps the rewritten index.html for a public/ folder, rebuilt only when a file in it changes (one stat per
// top-level file per request; the hashing happens once per deploy).
export function createAssetVersions(dir) {
  let cached = { key: null, body: null };
  const assets = new Map(); // name -> { key, version }
  return function indexHtml() {
    let names;
    try { names = fs.readdirSync(dir).filter((n) => /\.(css|js)$/.test(n) || n === 'index.html'); } catch { return null; }
    const stats = names.map((n) => { try { const s = fs.statSync(path.join(dir, n)); return s.isFile() ? [n, `${s.size}:${s.mtimeMs}`] : null; } catch { return null; } }).filter(Boolean);
    if (!stats.some(([n]) => n === 'index.html')) return null;
    const key = stats.map(([n, k]) => `${n}=${k}`).sort().join('|');
    if (cached.key === key) return cached.body;
    const files = {};
    for (const [n, k] of stats) {
      if (n === 'index.html') continue;
      let a = assets.get(n);
      if (!a || a.key !== k) { a = { key: k, version: contentVersion(fs.readFileSync(path.join(dir, n))) }; assets.set(n, a); }
      files[n] = a.version;
    }
    const body = Buffer.from(rewriteIndex(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), files));
    cached = { key, body };
    return body;
  };
}

// /c/pages.css with its content version, for the pages the server draws itself (sign-in, invites, share pages).
// Cloudflare hands browsers a 4-hour cache for .css whatever the server says, so without ?v a phone pairs new
// page markup with an old stylesheet for hours after a deploy. Re-hashed only when the file's mtime changes.
const pagesCssFile = new URL('../public/pages.css', import.meta.url);
let pagesCssCache = { mtime: 0, href: '/c/pages.css' };
export function pagesCssHref() {
  try {
    const { mtimeMs } = fs.statSync(pagesCssFile);
    if (mtimeMs !== pagesCssCache.mtime) pagesCssCache = { mtime: mtimeMs, href: `/c/pages.css?v=${contentVersion(fs.readFileSync(pagesCssFile))}` };
  } catch { /* missing file: the plain URL */ }
  return pagesCssCache.href;
}
