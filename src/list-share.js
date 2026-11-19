// Shared list links (/c/l/<id>), let past Cloudflare Access like clips so Discord can embed them: the embed's
// title is the list's name and its picture a row of the first posters. Only link-preview bots get that page;
// everyone else is sent to the list inside the app (/#list/<id>), which is still behind Cloudflare Access.
// Private lists get no card (a plain Lilin one), so the link says nothing about them.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { translateHtml } from './i18n.js';
import { page, baseUrl, esc } from './clips.js';
import { PREVIEW_BOT } from './note-share.js';
import * as lists from './lists.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const W = 1200, H = 630, PW = 210, PH = 315, GAP = 22;
const jobs = new Map();

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const sized = (u, size) => u.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${size}/`);

async function download(u, dest) {
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  await fs.promises.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${code}`))));
  });
}

// The card: the first backdrop blurred and darkened (or Lilin's plum), with up to five posters in a row.
async function makeCard(list, dest) {
  const tmp = `${dest}.parts`;
  await fs.promises.mkdir(tmp, { recursive: true });
  try {
    const posters = (await Promise.allSettled(list.posters.map((u, i) => download(sized(u, 'w342'), path.join(tmp, `p${i}.jpg`)))))
      .filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!posters.length) return null;
    const bg = list.backdrop && await download(sized(list.backdrop, 'w780'), path.join(tmp, 'bg.jpg')).catch(() => null);
    const args = ['-v', 'error', '-y'];
    if (bg) args.push('-i', bg); else args.push('-f', 'lavfi', '-i', `color=c=0x1F1019:s=${W}x${H}`);
    for (const p of posters) args.push('-i', p);
    const filters = [bg
      ? `[0]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.32:saturation=0.75,setsar=1[b0]`
      : '[0]setsar=1[b0]'];
    const x0 = Math.round((W - (posters.length * PW + (posters.length - 1) * GAP)) / 2), y = Math.round((H - PH) / 2);
    posters.forEach((_, i) => {
      filters.push(`[${i + 1}]scale=${PW}:${PH}:force_original_aspect_ratio=increase,crop=${PW}:${PH},setsar=1,pad=${PW + 4}:${PH + 4}:2:2:color=0x00000080[p${i}]`);
      filters.push(`[b${i}][p${i}]overlay=${x0 + i * (PW + GAP) - 2}:${y - 2}[b${i + 1}]`);
    });
    args.push('-filter_complex', filters.join(';'), '-map', `[b${posters.length}]`, '-frames:v', '1', '-q:v', '3', dest);
    await ffmpeg(args);
    return dest;
  } finally {
    fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// The card for a list as it is now (a new file whenever its posters change), made once and kept.
export function card(list, cacheDir) {
  const hash = createHash('sha1').update(JSON.stringify([list.posters, list.backdrop])).digest('hex').slice(0, 12);
  const dest = path.join(cacheDir, `${list.id}-${hash}.jpg`);
  if (fs.existsSync(dest)) return Promise.resolve(dest);
  if (!jobs.has(dest)) {
    jobs.set(dest, fs.promises.mkdir(cacheDir, { recursive: true }).then(() => makeCard(list, dest))
      .catch((e) => { console.warn(`list card ${list.id}: ${e.message}`); return null; })
      .finally(() => setTimeout(() => jobs.delete(dest), 60_000)));
  }
  return jobs.get(dest);
}

export async function handlePublic(req, res, url, { cacheDir, nameOf }) {
  const m = url.pathname.match(/^\/c\/l\/([a-z0-9]{10})(\/card\.jpg)?\/?$/);
  if (!m) return false;
  const send = (status, type, data, extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', Vary: 'User-Agent', ...extra });
    res.end(req.method === 'HEAD' ? undefined : (String(type).startsWith('text/html') ? translateHtml(data) : data));
    return true;
  };
  const list = lists.shared(m[1]);
  if (m[2]) {
    const file = list && await card(list, cacheDir);
    if (!file) return send(404, 'text/plain; charset=utf-8', 'Not found.');
    return send(200, 'image/jpeg', await fs.promises.readFile(file), { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  }
  if (!PREVIEW_BOT.test(req.headers['user-agent'] || '')) return send(302, 'text/plain; charset=utf-8', 'Opening Lilin…', { Location: `/#list/${m[1]}` });
  const base = baseUrl(req);
  const link = `${base}/c/l/${m[1]}`;
  if (!list) {
    return send(200, 'text/html; charset=utf-8', page({ title: 'A list on Lilin', desc: 'Open it in Lilin.', url: link, image: `${base}/c/lilin.jpg`,
      body: '<div class="card"><h1>A list on Lilin</h1><p><a class="brand" href="/">Open Lilin</a></p></div>' }));
  }
  const ready = list.posters.length ? await Promise.race([card(list, cacheDir), new Promise((r) => setTimeout(() => r(null), 6000))]) : null;
  const image = ready ? `${link}/card.jpg?v=${path.basename(ready, '.jpg').split('-')[1]}` : `${base}/c/lilin.jpg`;
  const maker = nameOf(list.userId);
  const what = `${list.count} ${list.count === 1 ? 'title' : 'titles'}${maker ? ` · a list by ${maker}` : ''}`;
  const desc = list.about ? `${what}\n${clip(list.about, 300)}` : what;
  return send(200, 'text/html; charset=utf-8', page({ title: list.name, desc, url: link, image,
    body: `<div class="card"><h1>${esc(list.name)}</h1><p>${esc(what)}</p><p><a class="brand" href="/#list/${m[1]}">Open in Lilin</a></p></div>` }));
}
