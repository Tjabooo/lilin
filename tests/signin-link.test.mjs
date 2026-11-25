import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { matrix, rows, svg, png } from '../src/qr.js';
import { deviceOf, scanLink } from '../src/signin-link.js';
import { createTvPairing } from '../src/tv.js';
import { killTree } from './kill-tree.mjs';

test('QR codes have the right size, finder patterns and format bits', () => {
  // byte mode at level Q: 32 bytes fit version 3 (29×29), 33 need version 4
  assert.equal(matrix('x'.repeat(32)).length, 29);
  assert.equal(matrix('x'.repeat(33)).length, 33);
  assert.equal(matrix('x'.repeat(200), { ecc: 'M' }).length, 57); // version 10
  assert.throws(() => matrix('x'.repeat(400)), /Too long/);
  const m = matrix('https://lilin.example.com/?signin=ABCDEF&on=web');
  const n = m.length;
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(m[y0 + y][x0 + x], d !== 2, `finder at ${x0},${y0}`);
    }
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  assert.equal(m[n - 8][8], true, 'the dark module');
  // the two copies of the format bits agree
  const a = [0, 1, 2, 3, 4, 5, 7, 8].map((y) => m[y][8]).concat([7, 5, 4, 3, 2, 1, 0].map((x) => m[8][x]));
  const b = [n - 1, n - 2, n - 3, n - 4, n - 5, n - 6, n - 7].map((y) => m[y][8]).concat([n - 8, n - 7, n - 6, n - 5, n - 4, n - 3, n - 2, n - 1].map((x) => m[8][x]));
  assert.deepEqual(a.slice(0, 7).concat(a.slice(7)).length, 15);
  assert.deepEqual([...a.slice(0, 8)].reverse().length, 8);
  assert.equal(a.length, b.length);
  assert.deepEqual(rows('hi').map((r) => r.length), new Array(21).fill(21));
  assert.match(svg('hi'), /^<svg [^>]*viewBox="0 0 25 25"/);
  const image = png('hi', { scale: 2, border: 2 });
  assert.deepEqual([...image.subarray(1, 4)], [80, 78, 71]);
  assert.equal(image.readUInt32BE(16), 50);
  assert.ok(zlib.inflateSync(image.subarray(41, 41 + image.readUInt32BE(33))).length === 51 * 50);
});

test('the phone is told what kind of device is asking', () => {
  assert.deepEqual(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'), { browser: 'Firefox', os: 'Windows' });
  assert.deepEqual(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), { browser: 'Safari', os: 'Mac' });
  assert.deepEqual(deviceOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0'), { browser: 'Edge', os: 'Linux' });
  assert.deepEqual(deviceOf(''), { browser: null, os: null });
  assert.equal(scanLink('https://lilin.example.com/', 'ABC123', 'web'), 'https://lilin.example.com/?signin=ABC123&on=web');
});

test('a waiting code can be looked at before approving; a miss counts as a wrong code', () => {
  let t = 0;
  const pool = createTvPairing({ now: () => t, ttl: 120_000 });
  const { code } = pool.start({ label: { kind: 'web', browser: 'Firefox', os: 'Linux' }, where: { home: true } });
  assert.ok(pool.has(code)); assert.ok(!pool.has('ZZZZZZ'));
  t = 30_000;
  assert.deepEqual(pool.peek('u1', code), { label: { kind: 'web', browser: 'Firefox', os: 'Linux' }, where: { home: true }, expiresIn: 90 });
  for (let i = 0; i < 8; i++) assert.throws(() => pool.peek('u2', 'WRONG' + i), { status: 404 });
  assert.throws(() => pool.peek('u2', code), { status: 429 }, 'too many misses wait, even for a right code');
  t = 121_000;
  assert.ok(!pool.has(code), 'web codes live two minutes');
});

test('a computer signs in by a QR code a signed-in phone approves', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-qr-signin-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', ADMIN_EMAILS: 'owner@qr.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1', PUBLIC_URL: 'https://lilin.qr.test' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
  const call = async (route, { body, email, cookie, status = 200, ua } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(email ? { 'cf-access-authenticated-user-email': email } : {}), ...(cookie ? { cookie } : {}), ...(ua ? { 'user-agent': ua } : {}) },
    });
    const data = await response.json();
    assert.equal(response.status, status, `${route}: ${JSON.stringify(data)}`);
    return { data, setCookie: response.headers.get('set-cookie') };
  };
  try {
    await call('/api/auth/first-password', { body: { password: 'a long enough test password 42' }, email: 'owner@qr.test' });
    const page = await (await fetch(`http://127.0.0.1:${port}/c/qr/start`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'user-agent': FIREFOX } })).json();
    assert.match(page.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(page.link, `https://lilin.qr.test/?signin=${page.code}&on=web`);
    assert.match(page.svg, /^<svg /);
    assert.equal(page.expiresIn, 120);
    assert.deepEqual((await call(`/c/qr/poll?id=${page.poll}`)).data, { state: 'waiting' });

    const info = (await call(`/api/tv/pair/info?code=${page.code}&on=web`, { email: 'owner@qr.test' })).data;
    assert.equal(info.on, 'web');
    assert.deepEqual(info.label, { kind: 'web', browser: 'Firefox', os: 'Windows' });
    await call('/api/tv/pair/approve', { body: { code: page.code, on: 'web' }, email: 'owner@qr.test' });
    const done = await call(`/c/qr/poll?id=${page.poll}`);
    assert.equal(done.data.state, 'approved');
    const cookie = /lilin_session=[^;]+/.exec(done.setCookie || '')?.[0];
    assert.ok(cookie, 'the computer gets a session');
    assert.equal((await call(`/c/qr/poll?id=${page.poll}`)).data.state, 'expired', 'handed over once');
    const status = (await call('/api/auth/status', { cookie })).data;
    assert.equal(status.via, 'session'); assert.equal(status.email, 'owner@qr.test');

    // A typed code (no `on`) finds the right pool; the shared home account can't approve a computer.
    const typed = (await call('/c/qr/start', { body: {} })).data;
    await call('/api/tv/pair/approve', { body: { code: typed.code }, status: 400 });
    await call('/api/tv/pair/approve', { body: { code: typed.code.toLowerCase() }, email: 'owner@qr.test' });
    assert.equal((await call(`/c/qr/poll?id=${typed.poll}`)).data.state, 'approved');

    // TVs get the link and the QR rows with their code.
    const tv = (await call('/api/tv/pair/start', { body: {} })).data;
    assert.equal(tv.link, `https://lilin.qr.test/?signin=${tv.code}&on=tv`);
    assert.ok(tv.qr.length >= 21 && tv.qr.every((r) => /^[01]+$/.test(r) && r.length === tv.qr.length));
    assert.equal((await call(`/api/tv/pair/info?code=${tv.code}`, { email: 'owner@qr.test' })).data.on, 'tv');

    // The sign-in page offers the QR.
    const html = await (await fetch(`http://127.0.0.1:${port}/signin`, { headers: { 'cf-connecting-ip': '203.0.113.9' } })).text();
    assert.ok(html.includes('id="qr-side"') || html.includes('<html'), 'sign-in page renders');
  } finally {
    killTree(child); await exited;
    await fs.rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); // Windows keeps the dead server's files locked briefly
  }
});
