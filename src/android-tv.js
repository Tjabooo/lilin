// Lilin's Android TV app (tv/android): the install steps (/android), the app itself (/android.apk) and its
// version (/android.json, which installed apps check to offer their own update). The app is built with
// tv/android/build.sh into tv/android/dist (or ANDROID_APP_DIR). Its build holds the server's address: a home
// one (the file is only handed out at home), or a public https one through the TV gateway (/c/tv,
// tv-gateway.js), and then the steps, file and updates are open to anyone at /c/tv/android.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr, currentLanguage } from './i18n.js';

const DEFAULT_DIR = fileURLToPath(new URL('../tv/android/dist/', import.meta.url));
const PATHS = new Set(['/android', '/android/', '/android.apk', '/android.json']);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const isAndroidPath = (p) => PATHS.has(p);

const privateV4 = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// The address a TV at home types: the one this request came in on when that's a home one,
// else the server's own home-network address (the page was opened through a proxy or tunnel).
export function homeAddress(req, port, interfaces = os.networkInterfaces()) {
  const local = String(req.socket?.localAddress || '').replace(/^::ffff:/, '');
  if (privateV4(local)) return `${local}:${req.socket.localPort || port}`;
  const found = Object.values(interfaces).flat().filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal && privateV4(a.address))
    .map((a) => a.address)
    .sort((a, b) => rank(a) - rank(b));
  return found.length ? `${found[0]}:${port}` : null;
}
const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);

// port: the server's port, or a function giving it (it's known once the server listens).
export function createAndroidTv({ dir = process.env.ANDROID_APP_DIR || DEFAULT_DIR, port = 8080 } = {}) {
  const portNow = () => (typeof port === 'function' ? port() : port);
  function app() {
    const file = path.join(dir, 'Lilin.apk');
    let stat;
    try { stat = fs.statSync(file); } catch { return null; }
    if (!stat.isFile()) return null;
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'Lilin.json'), 'utf8')); } catch { /* built without it: version 1 */ }
    const server = typeof meta.server === 'string' ? meta.server.replace(/\/+$/, '') : '';
    // Built for an https address: it works from anywhere, so it may be handed out anywhere.
    const anywhere = /^https:\/\/[^/]+/i.test(server) && !privateV4(server.replace(/^https:\/\//i, ''));
    return { file, size: stat.size, versionCode: Number(meta.versionCode) || 1, versionName: String(meta.versionName || '1.0.0'), sha256: meta.sha256 || null, server, anywhere };
  }

  // Returns true when it answered. `home` is false for requests from outside the home network; `gateway`
  // is true under /c/tv, where the page's own links need that prefix too.
  function handle(req, res, url, { home, gateway = false }) {
    const p = url.pathname;
    if (!PATHS.has(p)) return false;
    const head = req.method === 'HEAD';
    const found = app();
    home = home || Boolean(found?.anywhere); // a public build is handed out anywhere
    if (p === '/android.json') {
      const body = home && found ? JSON.stringify({ versionCode: found.versionCode, versionName: found.versionName, size: found.size, sha256: found.sha256, apk: '/android.apk' }) : '{}';
      res.writeHead(home && found ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(head ? undefined : body);
      return true;
    }
    if (p === '/android.apk') {
      if (!home || !found) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(head ? undefined : tr(home ? 'The Android TV app isn’t on this server yet.' : 'Open this page at home.'));
        return true;
      }
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': found.size,
        'Content-Disposition': 'attachment; filename="Lilin.apk"',
        'Cache-Control': 'no-cache',
      });
      if (head) { res.end(); return true; }
      fs.createReadStream(found.file).on('error', () => res.destroy()).pipe(res);
      return true;
    }
    const address = found?.anywhere ? found.server : homeAddress(req, portNow());
    const html = page({ home, found, address, prefix: gateway ? '/c/tv' : '' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.end(head ? undefined : html);
    return true;
  }

  return { handle, app };
}

function page({ home, found, address, prefix = '' }) {
  const typed = address ? `${address}/android.apk` : '';
  const steps = [
    [tr('Get Downloader'), `<p>${esc(tr('On the TV, open Google Play, search for Downloader and install it. It’s free, made by AFTVnews, with an orange icon.'))}</p>`],
    [tr('Type this address'), `<p>${esc(tr('Open Downloader, select the address box and type:'))}</p>
      <div class="address" aria-label="${esc(typed)}">${esc(typed).replace(/\/(?!\/)/g, '/<wbr>')}</div><p>${esc(tr('Then press Go.'))}</p>`],
    [tr('Install Lilin'), `<p>${esc(tr('When the download is done, press Install. The first time, the TV asks to let Downloader install apps: choose Settings, turn Downloader on, press Back, then Install.'))}</p>`],
    [tr('Sign in'), `<p>${esc(tr('Press Open. The TV shows a code: on your phone, open Lilin, go to Settings → Sign in on a TV and enter it.'))}</p>`],
  ];
  let body;
  if (!home) {
    body = `<section class="panel note"><h2>${esc(tr('Open this page at home.'))}</h2><p>${esc(tr('The Android TV app installs and runs on the home network, where Lilin is.'))}</p></section>`;
  } else if (!found) {
    body = `<section class="panel note"><h2>${esc(tr('The Android TV app isn’t on this server yet.'))}</h2><p>${esc(tr('Whoever runs Lilin can build it with tv/android/build.sh (see docs/android-tv.md).'))}</p></section>`;
  } else {
    const size = `${(found.size / 1048576).toFixed(1)} MB`;
    const two = (n) => String(n).padStart(2, '0');
    body = `<ol class="steps">${steps.map(([title, text], i) => `<li class="panel step"><span class="n" aria-hidden="true">${two(i + 1)}</span><span class="of" aria-hidden="true">${two(i + 1)} / ${two(steps.length)}</span><div><h2>${esc(title)}</h2>${text}</div></li>`).join('')}</ol>
      <div class="after"><p>${esc(tr('Lilin is now among the TV’s apps. It keeps itself up to date: when there’s a new version, the TV offers it as the app starts. Downloader may offer to delete the file it fetched; the app stays.'))}</p>
      ${found.anywhere ? '' : `<p>${esc(tr('The TV has to be on the same network as Lilin.'))}</p>`}</div>
      <a class="download" href="${prefix}/android.apk" download="Lilin.apk">${esc(tr('Download the app ({0} · version {1})', size, found.versionName))}</a>`;
  }
  return `<!doctype html>
<html lang="${currentLanguage()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#15112B">
<meta name="robots" content="noindex">
<title>${esc(tr('Lilin on Android TV'))}</title>
<link rel="icon" href="/c/favicon.svg" type="image/svg+xml">
<style>
  @font-face { font-family: "Bricolage Grotesque"; font-weight: 200 800; font-display: swap; src: url("/c/fonts/bricolage-grotesque-latin.woff2") format("woff2"); }
  /* The app's default look (phase skin, preset "Lilin"): purple-black, acid green, lilac; hairline chamfered panels. */
  :root { --bg: #15112B; --surface: #1E1939; --line: #3D3666; --text: #F1EEFA; --muted: #B6AFCF;
    --accent: #A0DE59; --support: #B89BE2; --alert: #FF9B85; --on-accent: #15112B;
    --display: "Bricolage Grotesque", system-ui, sans-serif; --sx: .78; color-scheme: dark; }
  * { box-sizing: border-box; }
  html { min-height: 100%; background-color: var(--bg); background-image:
    radial-gradient(rgba(241, 238, 250, .07) 1px, transparent 1.4px),
    radial-gradient(ellipse 110% 55% at 50% -12%, #2A2257 0%, rgba(42, 34, 87, 0) 100%);
    background-size: 22px 22px, 100% 100%; background-attachment: fixed; }
  body { margin: 0; color: var(--text); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust: 100%; }
  main { max-width: 680px; margin: 0 auto; padding: max(36px, env(safe-area-inset-top)) 20px max(40px, env(safe-area-inset-bottom)); overflow-x: hidden; }
  .cond { display: inline-block; transform: scaleX(var(--sx)); transform-origin: 0 50%; }
  .label { font: 700 11px/1 var(--display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); font-variant-numeric: tabular-nums; }

  /* header: wordmark, a micro-label, a ticked hairline rule with the accent notch */
  .top { display: flex; align-items: center; gap: 12px; }
  .mark { font: 800 28px/1 var(--display); letter-spacing: -.02em; color: var(--accent); }
  .top .label { margin-left: auto; color: var(--support); }
  .rule { height: 9px; margin-top: 14px; background:
    linear-gradient(var(--accent), var(--accent)) 0 100% / 28px 2px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 34px 100% / 4px 2px no-repeat,
    linear-gradient(var(--line), var(--line)) 0 100% / 100% 1px no-repeat,
    repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px 12px) 0 0 / 100% 5px no-repeat; }
  h1 { margin: 26px 0 0; font: 800 clamp(38px, 10.5vw, 64px)/.95 var(--display); letter-spacing: -.02em; text-transform: uppercase; }
  h1 .cond { width: calc(100% / var(--sx)); }
  h1 em { font-style: normal; color: var(--accent); white-space: nowrap; }
  .lead { margin: 16px 0 30px; padding-left: 14px; color: var(--muted); border-left: 2px solid var(--support); }

  /* panels: top-left + bottom-right cut, hairline frame drawn in ::after, accent tick on top */
  .steps { list-style: none; margin: 0; padding: 0; }
  .panel { --c: 16px; --bl: var(--line); position: relative; margin-bottom: 14px; padding: 22px 22px 20px; background: rgba(30, 25, 57, .9);
    clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c)); }
  .panel::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 1px var(--bl); background:
    linear-gradient(to bottom right, transparent calc(50% - 1px), var(--bl) calc(50% - .5px), var(--bl) calc(50% + .5px), transparent calc(50% + 1px)) left top / var(--c) var(--c) no-repeat,
    linear-gradient(to bottom right, transparent calc(50% - 1px), var(--bl) calc(50% - .5px), var(--bl) calc(50% + .5px), transparent calc(50% + 1px)) right bottom / var(--c) var(--c) no-repeat,
    linear-gradient(var(--tick, var(--accent)), var(--tick, var(--accent))) left calc(var(--c) + 6px) top 0 / 22px 2px no-repeat; }
  .step { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 0 18px; }
  .n { align-self: start; display: grid; place-items: center; width: 52px; height: 52px; margin-top: 2px;
    font: 800 23px/1 var(--display); color: var(--accent); font-variant-numeric: tabular-nums;
    background: linear-gradient(to bottom right, transparent calc(50% - 1px), var(--accent) calc(50% - .5px), var(--accent) calc(50% + .5px), transparent calc(50% + 1px)) left top / 10px 10px no-repeat;
    box-shadow: inset 0 0 0 1px rgba(160, 222, 89, .55);
    clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px); }
  .of { position: absolute; right: 18px; top: 13px; font: 700 11px/1 var(--display); letter-spacing: .16em; color: var(--muted); opacity: .65; font-variant-numeric: tabular-nums; }
  h2 { margin: 6px 0 6px; font: 700 22px/1.2 var(--display); letter-spacing: -.01em; }
  .step h2 { padding-right: 56px; }
  .panel p { margin: 0 0 8px; color: var(--muted); }
  .panel p:last-child { margin-bottom: 0; }
  .note { --bl: rgba(255, 155, 133, .55); --tick: var(--alert); }
  .note h2 { margin-top: 2px; color: var(--alert); }

  /* the address: a readout cell with a blinking cursor */
  .address { --c: 10px; margin: 12px 0; padding: 14px 18px; background: rgba(21, 17, 43, .85); box-shadow: inset 0 0 0 1px rgba(160, 222, 89, .45);
    clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c));
    font: 800 clamp(18px, 4.8vw, 27px)/1.25 var(--display); letter-spacing: .01em; color: var(--accent); overflow-wrap: break-word; user-select: all; }
  .address::after { content: ""; display: inline-block; width: .5em; height: .12em; margin-left: .14em; background: var(--accent); animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .address::after { animation: none; } }

  .after { margin: 22px 0 0; padding: 2px 4px 2px 16px; border-left: 1px solid var(--line); color: var(--muted); font-size: 15px; }
  .after p { margin: 0 0 8px; }
  .after p:last-child { margin-bottom: 0; }

  /* the download: accent fill with chamfered ends, like the app's primary buttons */
  .download { --c: 12px; display: block; margin-top: 28px; padding: 17px 22px; text-align: center; text-decoration: none;
    background: var(--accent); color: var(--on-accent); font: 800 17px/1.2 var(--display); letter-spacing: .01em;
    clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c)); }
  .download:hover { background: #B2E875; }
  .download:focus-visible { outline: none; background: var(--text); }
  .foot { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 10px; border-top: 1px solid var(--line); }
  .foot .label { opacity: .6; }
</style>
</head>
<body><main>
<div class="top"><span class="mark"><span class="cond">LiLiN</span></span><span class="label">Android TV</span></div>
<div class="rule" aria-hidden="true"></div>
<h1><span class="cond">${esc(tr('Lilin on Android TV')).replace('Android TV', '<em>Android TV</em>')}</span></h1>
<p class="lead">${esc(tr('For TVs with Android TV or Google TV, Chromecast with Google TV, Nvidia Shield and other Android TV boxes.'))}</p>
${body}
<div class="foot" aria-hidden="true"><span class="label">LiLiN · TV</span><span class="label">${home && found ? `v${esc(found.versionName)}` : '—'}</span></div>
</main></body>
</html>`;
}
