import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { innerPath, gatewayAllows, createPairLimit } from '../src/tv-gateway.js';

test('/c/tv/<path> is <path>; only the TV app’s paths pass', () => {
  assert.equal(innerPath('/c/tv/api/library'), '/api/library');
  assert.equal(innerPath('/c/tvx/api/library'), null);
  assert.equal(innerPath('/api/library'), null);
  assert.equal(innerPath('/c/tv/../api/admin/settings'), null);
  for (const ok of ['/tv/sv.js', '/fonts/bricolage-grotesque-latin.woff2', '/api/health', '/api/status',
    '/api/tv/pair/start', '/api/tv/pair/poll', '/android', '/android.apk', '/android.json', '/play/lib/x/browser/1/sig/a.mp4',
    '/api/title/tv/1399/page', '/api/tv/1399/seasons', '/api/media/lib/abc%2Fdef/intro', '/api/subs/file/lib/x/en.vtt', '/api/client/report']) {
    assert.ok(gatewayAllows(ok), ok);
  }
  for (const no of ['/', '/index.html', '/app.js', '/api/admin/settings', '/api/auth/login', '/api/me', '/api/tv/pair/approve',
    '/api/access/invite', '/api/library/delete', '/api/cast/play', '/api/notes', '/tv/../app.js', '/android/x', '/tv/tv.js', '/tv/tv.css']) {
    assert.ok(!gatewayAllows(no), no);
  }
});

test('every API call in the Rust TV app (Samsung and Android TV) passes the gateway', () => {
  const dir = new URL('../tv/rust/src/', import.meta.url);
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.rs'));
  const calls = new Set();
  for (const f of files) {
    const src = fs.readFileSync(new URL(String(f), dir), 'utf8');
    for (const m of src.matchAll(/"(\/api\/[^"?]*)/g)) calls.add(m[1]);
  }
  assert.ok(calls.size > 25);
  // {} placeholders get a stand-in like the app's (a 24-letter room id for Watch Together).
  const fill = (c) => c.replace(/^\/api\/watch\/\{\}/, '/api/watch/LGs0lD489GIYoymFyM2cv5zD').replace(/^\/api\/title\/\{\}/, '/api/title/tv')
    .replace(/^\/api\/vibes\/\{\}/, '/api/vibes/rainy-day').replace(/\{\}/g, '1');
  for (const c of calls) {
    const p = fill(c);
    // A base the app adds to ('/api/media/lib/{}' + '/intro'): its endings must pass.
    const paths = p === '/api/media/lib/1' ? ['intro', 'credits', 'still'].map((e) => `${p}/${e}`) : [p];
    for (const x of paths) assert.ok(gatewayAllows(x), `${c} → ${x}`);
  }
  for (const f of ['/tv-rs/host.js', '/tv-rs/lilin_tv.wasm', '/tv-rs/wordmark.png']) assert.ok(gatewayAllows(f), f);
  assert.ok(!gatewayAllows('/tv-rs/../app.js'));
});

test('sign-in codes from outside are limited per address', () => {
  let t = 0;
  const allow = createPairLimit({ max: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('a'), allow('b')], [true, true, true, false, true]);
  t = 2000;
  assert.equal(allow('a'), true);
});
