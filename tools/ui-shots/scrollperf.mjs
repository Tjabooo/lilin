#!/usr/bin/env node
// Scroll smoothness benchmark: headless Chromium scrolls a page with real wheel input and reports
// frame times and how much paint work the scroll caused. Read-only (non-GET requests are refused).
//
//   node tools/ui-shots/scrollperf.mjs --base http://SERVER:8080 [--overlay public] [--path /]
//     [--ready '#discover-body .shelf'] [--size desktop|phone] [--cpu 4] [--runs 3] [--gpu] [--shot out.png --shot-y 400]
//
// --overlay serves static files from a local folder (compare a branch with what's live), --cpu slows
// the CPU down N times (a phone-ish machine), --gpu leaves GPU rasterisation on.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const BASE = String(args.base || 'http://localhost:8080').replace(/\/$/, '');
const overlay = args.overlay ? path.resolve(String(args.overlay)) : null;
const size = args.size === 'phone' ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 900, mobile: false };
const runs = Number(args.runs || 3);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lil-scroll-'));
const chrome = spawn(String(args.chrome || 'chromium'), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--mute-audio', '--hide-scrollbars', // an overlaid page has no address space of its own, so Chromium's private-network checks would block its API calls
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks',
  ...(args.gpu ? [] : ['--disable-gpu']), 'about:blank']);
const wsUrl = await new Promise((ok, fail) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  setTimeout(() => fail(new Error('Chromium did not start')), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let nextId = 1;
const pending = new Map();
const handlers = new Set();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.fail(new Error(msg.error.message)) : p.ok(msg.result); }
  else handlers.forEach((h) => h(msg));
});
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const id = nextId++; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function measure() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  handlers.add(async (msg) => {
    if (msg.sessionId !== sessionId || msg.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = msg.params;
    const u = new URL(request.url);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return s('Fetch.fulfillRequest', { requestId, responseCode: 403, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ error: 'Blocked by the scroll benchmark.' })).toString('base64') }).catch(() => {});
    }
    if (overlay && u.origin === BASE && !/^\/(api|play|c)\//.test(u.pathname)) {
      const file = path.join(overlay, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      if (file.startsWith(overlay) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return s('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: MIME[path.extname(file)] || 'application/octet-stream' }, { name: 'Cache-Control', value: 'no-store' }],
          body: fs.readFileSync(file).toString('base64') }).catch(() => {});
      }
    }
    s('Fetch.continueRequest', { requestId }).catch(() => {});
  });
  if (args.debug) handlers.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') console.error('exception:', msg.params.exceptionDetails.exception?.description?.split('\n')[0]);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) console.error('console:', msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await s('Page.enable'); await s('Runtime.enable'); await s('Performance.enable');
  await s('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await s('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
  await s('Page.navigate', { url: BASE + (args.path || '/') });
  const ev = async (expr) => (await s('Runtime.evaluate', { expression: `(async () => { ${expr}\n })()`, awaitPromise: true, returnByValue: true })).result.value;
  const ready = String(args.ready || '#discover-body .shelf');
  for (let i = 0; i < 100 && !(await ev(`return !!document.querySelector(${JSON.stringify(ready)})`)); i++) await new Promise((r) => setTimeout(r, 200));
  if (!(await ev(`return !!document.querySelector(${JSON.stringify(ready)})`))) {
    const probe = await ev(`try { const r = await fetch('/api/status'); return r.status + ' ' + (await r.text()).slice(0, 120); } catch (e) { return 'fetch failed: ' + e; }`);
    throw new Error(`page never showed ${ready} (/api/status: ${probe})`);
  }
  // Let every row, picture and billboard settle, then scroll the whole page down once so pictures are loaded, back to the top.
  await new Promise((r) => setTimeout(r, 4000));
  // A fresh profile gets the What's new sheet; close it (its POST is refused) or the wheel scrolls the sheet, not the page.
  await ev(`document.querySelector('.whats-new-done')?.click(); await new Promise(r => setTimeout(r, 800));`);
  await ev(`for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 1500));`);
  if (args.cpu) await s('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) });
  if (args.shot) { // a picture of the page scrolled to --shot-y, for eyeballing scroll effects
    await ev(`scrollTo(0, ${Number(args['shot-y'] || 400)}); await new Promise(r => setTimeout(r, 800));`);
    fs.writeFileSync(String(args.shot), Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await ev(`scrollTo(0, 0); await new Promise(r => setTimeout(r, 500));`);
  }
  const metrics = async () => Object.fromEntries((await s('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await ev(`window.__ft = []; let last = performance.now(); const tick = (t) => { window.__ft.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);`);
  const before = await metrics();
  // Real wheel scrolling: 30 notches down, then 30 back up, ~60 ms apart (a quick flick of the mouse wheel).
  for (const dir of [1, -1]) for (let i = 0; i < 30; i++) {
    await s('Input.dispatchMouseEvent', { type: 'mouseWheel', x: size.width / 2, y: size.height / 2, deltaX: 0, deltaY: 120 * dir });
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 600));
  const after = await metrics();
  const ft = await ev(`window.__stop = true; return window.__ft.slice(2);`);
  await s('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Target.closeTarget', { targetId });
  const sorted = [...ft].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const d = (k) => (after[k] || 0) - (before[k] || 0);
  return { frames: ft.length, p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1), janky: ft.filter((x) => x > 25).length,
    layoutMs: d('LayoutDuration') * 1000, styleMs: d('RecalcStyleDuration') * 1000, scriptMs: d('ScriptDuration') * 1000, taskMs: d('TaskDuration') * 1000 };
}

const results = [];
for (let i = 0; i < runs; i++) results.push(await measure());
const avg = (k) => results.reduce((a, r) => a + r[k], 0) / results.length;
const keys = ['frames', 'p50', 'p95', 'max', 'janky', 'taskMs', 'styleMs', 'layoutMs', 'scriptMs'];
console.log(JSON.stringify({ base: BASE, overlay: !!overlay, size: args.size || 'desktop', cpu: Number(args.cpu || 1), runs,
  avg: Object.fromEntries(keys.map((k) => [k, Math.round(avg(k) * 10) / 10])) }));
ws.close(); chrome.kill();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
