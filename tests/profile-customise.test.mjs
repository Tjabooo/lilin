import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanLook, cleanExtras, liveStatus, LOOK_DEFAULTS, STATS_DEFAULT } from '../src/profiles.js';
import { imageSize, checkImage, encodeArgs, allowUpload, resetLimits, UPLOADS_PER_HOUR, bannerUrl } from '../src/profile-banner.js';
import { profilePaint, readable, contrast, parseColor, partnerOf } from '../public/profile-colors.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const hasFfmpeg = spawnSync(FFMPEG, ['-hide_banner', '-version'], { windowsHide: true }).status === 0;

// ---------- pure parts ----------
test('look: colours are hex or nothing, the focal point is clamped, uploads only come from the server', () => {
  const look = cleanLook({ background: 'color', pageColor: '#FF8C1A', pageColor2: 'red', pageGradient: false, bannerY: 140, upload: 123, banner: 'upload' });
  assert.equal(look.pageColor, '#ff8c1a');
  assert.equal(look.pageColor2, null, 'a colour name is not a colour here');
  assert.equal(look.pageGradient, false);
  assert.equal(look.bannerY, 100);
  assert.equal(look.upload, null, 'the editor cannot set an upload');
  assert.equal(look.banner, 'auto', 'no upload yet = no uploaded banner');
  for (const bad of ['#fff', '#ff8c1a;background:url(x)', 'url(javascript:1)', '#ff8c1g', 'rgb(1,2,3)', '<b>', { toString: () => '#ffffff' }]) {
    assert.equal(cleanLook({ pageColor: bad }).pageColor, bad?.toString?.() === '#ffffff' ? '#ffffff' : null, String(bad));
  }
  assert.equal(cleanLook({ background: 'color' }).background, LOOK_DEFAULTS.background, 'colour background needs a colour');
  assert.equal(cleanLook({ bannerY: 'x' }).bannerY, LOOK_DEFAULTS.bannerY);
  assert.equal(cleanLook({ bannerY: -5 }).bannerY, 0);
  assert.equal(cleanLook({ banner: 'upload' }, { ...LOOK_DEFAULTS, upload: 99 }).banner, 'upload', 'with an upload it sticks');
  assert.equal(cleanLook({ background: 'neon' }).background, 'glow');
});

test('extras: status, numbers and pin are checked', () => {
  const now = 1_000_000;
  const e = cleanExtras({ status: { text: '  Rewatching\u0000 Twin   Peaks ', clear: 'day' }, stats: ['hours', 'films', 'nope', 'hours'], pinned: 'movie:603' }, {}, now);
  assert.deepEqual(e.status, { text: 'Rewatching Twin Peaks', clear: 'day', until: now + 86400_000 });
  assert.deepEqual(e.stats, ['films', 'hours'], 'known ones, in a fixed order');
  assert.equal(e.pinned, 'movie:603');
  assert.throws(() => cleanExtras({ status: 'x'.repeat(81) }), /80/);
  assert.throws(() => cleanExtras({ stats: ['films', 'shows', 'episodes', 'hours', 'likes'] }), /four/);
  assert.throws(() => cleanExtras({ pinned: 'javascript:1' }), /review/);
  assert.equal(cleanExtras({ status: { text: 'hi', clear: 'forever' } }).status.clear, 'never');
  assert.equal(cleanExtras({ status: '' }).status, null);
  assert.equal(cleanExtras({ stats: [] }).stats, null, 'none picked = the usual four');
  assert.equal(liveStatus({ text: 'hi', until: now - 1 }, now), null, 'a cleared status is gone');
  assert.ok(liveStatus({ text: 'hi', until: null }, now));
  assert.equal(STATS_DEFAULT.length, 4);
});

const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webpX = (w, h, animated = false) => { const b = Buffer.alloc(30); b.write('RIFF', 0, 'ascii'); b.write('WEBPVP8X', 8, 'ascii'); b[20] = animated ? 0x02 : 0; b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };

test('banner files: type by magic bytes, size from the header, no pixel bombs', () => {
  assert.deepEqual(imageSize(png(1600, 900)), { kind: 'png', width: 1600, height: 900, animated: false });
  assert.deepEqual(imageSize(jpeg(2000, 1000)), { kind: 'jpg', width: 2000, height: 1000, animated: false });
  assert.deepEqual(imageSize(webpX(1920, 1080)), { kind: 'webp', width: 1920, height: 1080, animated: false });
  assert.equal(checkImage(png(1600, 900)).width, 1600);
  assert.throws(() => checkImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), (e) => e.status === 415);
  assert.throws(() => checkImage(Buffer.from('GIF89a........')), (e) => e.status === 415);
  assert.throws(() => checkImage(png(30000, 30000)), (e) => e.status === 413);
  assert.throws(() => checkImage(png(9000, 9000)), (e) => e.status === 413, 'too many pixels in all');
  assert.throws(() => checkImage(webpX(800, 400, true)), /Moving/);
  assert.throws(() => checkImage(png(100, 50)), /small/);
  assert.throws(() => checkImage(Buffer.alloc(0)), (e) => e.status === 400);
  const args = encodeArgs('in.png', 'out.webp', 'webp');
  for (const want of [['-f', 'image2'], ['-pattern_type', 'none'], ['-map_metadata', '-1'], ['-frames:v', '1']]) {
    const i = args.indexOf(want[0]);
    assert.ok(i >= 0 && args[i + 1] === want[1], want.join(' '));
  }
  assert.equal(bannerUrl(7, 36), '/api/profiles/7/banner?v=10');
  assert.equal(bannerUrl(7, null), null);
});

test('banner uploads are limited per person', () => {
  resetLimits();
  const t = 5_000_000;
  for (let i = 0; i < UPLOADS_PER_HOUR; i++) assert.ok(allowUpload(1, t + i));
  assert.equal(allowUpload(1, t + 100), false);
  assert.ok(allowUpload(2, t + 100), 'someone else is not affected');
  assert.ok(allowUpload(1, t + 3600_001), 'an hour later it is fine again');
  resetLimits();
});

test('page colours are used as picked; the text follows them and stays readable', () => {
  for (const c of ['#ff8c1a', '#ffff00', '#ffffff', '#a3e635', '#22d3ee', '#000000', '#8b5cf6', '#f9c9d6', '#777777', '#1b2a4a']) {
    const solid = profilePaint({ background: 'color', pageColor: c, pageGradient: false }, '#f5a524');
    // mid-tones where neither light nor dark text quite reaches 4.5:1 move a hair; everything else stays exact
    if (c === '#8b5cf6' || c === '#777777') assert.ok(parseColor(solid.page).every((v, i) => Math.abs(v - parseColor(c)[i]) <= 10), `${c} → ${solid.page} barely moves`);
    else assert.equal(solid.page, c, `${c} stays ${c}`);
    const p = profilePaint({ background: 'color', pageColor: c, pageColor2: partnerOf(c), pageGradient: true }, '#f5a524');
    for (const bg of [p.page, p.page2]) {
      assert.ok(contrast(parseColor(bg), parseColor(p.text)) >= 4.5, `${c} → ${bg} body text ${p.text}`);
      assert.ok(contrast(parseColor(bg), parseColor(p.text2)) >= 4.5, `${c} → ${bg} secondary text ${p.text2}`);
      assert.ok(contrast(parseColor(bg), parseColor(p.accent)) >= 3 - 1e-9, `${c} → accent ${p.accent} on ${bg}`);
    }
    assert.ok(contrast(parseColor(p.accent), parseColor(p.onAccent)) >= 3, `${c}: text on the accent`);
  }
  assert.equal(profilePaint({ background: 'color', pageColor: '#ffffff', pageGradient: false }, '#fff').light, false, 'white page = dark text');
  assert.equal(profilePaint({ background: 'color', pageColor: '#000000', pageGradient: false }, '#fff').light, true, 'black page = light text');
  // a gradient too wide for one text colour: only its weaker end moves, and the hue survives
  const wide = profilePaint({ background: 'color', pageColor: '#000000', pageColor2: '#ff8c1a', pageGradient: true }, '#fff');
  assert.equal(wide.page, '#000000');
  const deep = parseColor(wide.page2);
  assert.ok(deep[0] > deep[1] && deep[1] > deep[2], `still orange: ${deep}`);
  assert.equal(readable('#101010', [[parseColor('#efe8e1'), 7]], { darken: true }), '#101010', 'already readable = unchanged');
  const solid = profilePaint({ background: 'color', pageColor: '#ff8c1a', pageColor2: '#00ff00', pageGradient: false }, '#ffffff');
  assert.equal(solid.page2, null, 'gradient off = one colour');
  assert.equal(profilePaint({ background: 'glow', pageColor: '#ff8c1a' }, '#fff'), null);
  assert.equal(profilePaint({ background: 'color', pageColor: 'red;}' }, '#fff'), null);
});

test('look: style and pattern are known choices or the default', () => {
  assert.equal(LOOK_DEFAULTS.frame, 'panel');
  assert.equal(LOOK_DEFAULTS.pattern, 'none');
  const look = cleanLook({ frame: 'soft', pattern: 'hearts' });
  assert.equal(look.frame, 'soft');
  assert.equal(look.pattern, 'hearts');
  assert.equal(cleanLook({ frame: 'url(x)', pattern: '<b>' }).frame, 'panel');
  assert.equal(cleanLook({ pattern: 'confetti' }).pattern, 'none');
  assert.equal(cleanLook({ font: 'serif' }, { ...LOOK_DEFAULTS, frame: 'open', pattern: 'grid' }).frame, 'open', 'untouched = kept');
  assert.equal(cleanLook({}, { ...LOOK_DEFAULTS, pattern: 'grid' }).pattern, 'grid');
});

// ---------- over HTTP: upload, re-encode, who sees it ----------
test('profile customisation over HTTP: banner upload, visibility, status, numbers, pin', { timeout: 40000 }, async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-pf-custom-'));
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  await fs.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, FFMPEG,
    PORT: '0', ADMIN_EMAILS: 'owner@c.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off', SERVER_IP: '127.0.0.1' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 8000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const send = async (route, { body, email, status = 200, raw = false, headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'cf-access-authenticated-user-email': email, 'content-type': raw ? 'application/octet-stream' : 'application/json', ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, status, `${route}: ${type.includes('json') ? JSON.stringify(data) : type}`);
    return { data, type, response };
  };
  const json = async (route, body, email, status = 200) => (await send(route, { body, email, status })).data;
  try {
    await json('/api/me', undefined, 'owner@c.test');
    const ebi = (await json('/api/me', { name: 'Ebi' }, 'ebi@c.test')).me;
    const bo = (await json('/api/me', { name: 'Bo' }, 'bo@c.test')).me;
    await json('/api/me', { name: 'Cy' }, 'cy@c.test');

    // colours, status, numbers: only hex values and known words get through
    await json('/api/reviews', { key: 'movie:603', title: 'The Matrix', stars: 4.5, text: 'Still holds up.' }, 'ebi@c.test');
    let mine = await json('/api/profiles/me', { visibility: 'friends', look: { background: 'color', pageColor: '#FF6F91', pageColor2: 'url(x)', pageGradient: true, bannerY: 40 },
      status: { text: 'Rewatching <b>The Matrix</b>', clear: 'week' }, stats: ['hours', 'reviews'], pinned: 'movie:603' }, 'ebi@c.test');
    assert.equal(mine.look.pageColor, '#ff6f91');
    assert.equal(mine.look.pageColor2, null);
    assert.equal(mine.look.bannerY, 40);
    assert.equal(mine.person.status.text, 'Rewatching <b>The Matrix</b>', 'kept as text (the page writes it with textContent)');
    assert.deepEqual(mine.statKeys, ['hours', 'reviews']);
    assert.equal(mine.pinned.key, 'movie:603');
    await json('/api/profiles/me', { pinned: 'movie:604' }, 'ebi@c.test', 400); // not one of hers
    await json('/api/profiles/me', { status: 'y'.repeat(81) }, 'ebi@c.test', 400);

    // uploads: not an image, then (with ffmpeg) a real one with a secret tucked after its end
    await send('/api/profiles/me/banner', { body: Buffer.from('<svg onload=alert(1)>'), raw: true, email: 'ebi@c.test', status: 415 });
    // a write from another site is refused (CSRF)
    await send('/api/profiles/me/banner', { body: Buffer.alloc(0), raw: true, email: 'ebi@c.test', status: 403, headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
    if (!hasFfmpeg) { t.diagnostic('no ffmpeg: upload part skipped'); return; }
    const src = path.join(app, 'src.png');
    assert.equal(spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x336699:s=1280x480', '-frames:v', '1', src], { windowsHide: true }).status, 0);
    const upload = Buffer.concat([await fs.readFile(src), Buffer.from('GPS 59.33N 18.06E SECRET-TRAILER')]);
    mine = (await send('/api/profiles/me/banner', { body: upload, raw: true, email: 'ebi@c.test' })).data;
    assert.ok(mine.look.upload > 0);
    assert.match(mine.uploadUrl, new RegExp(`^/api/profiles/${ebi.id}/banner\\?v=`));
    assert.equal(mine.banner, null, 'uploaded, but not the banner until Save says so');
    mine = await json('/api/profiles/me', { look: { banner: 'upload' } }, 'ebi@c.test');
    assert.equal(mine.banner, mine.uploadUrl);
    const own = await send(mine.banner, { email: 'ebi@c.test' });
    assert.ok(/image\/(webp|jpeg)/.test(own.type), own.type);
    assert.equal(own.response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!own.data.includes(Buffer.from('SECRET')), 'nothing but pixels survives the re-encode');

    // friends-only: Bo isn't a friend yet, so no banner, no status, no pin; the file itself is refused too
    let seen = await json(`/api/profiles/${ebi.id}`, undefined, 'bo@c.test');
    assert.equal(seen.locked, true);
    assert.equal(seen.look.upload, null);
    assert.notEqual(seen.look.banner, 'upload');
    assert.equal(seen.banner, undefined);
    assert.equal(seen.person.status, undefined);
    assert.equal(seen.pinned, undefined);
    await send(mine.banner, { email: 'bo@c.test', status: 404 });
    await json('/api/friends/request', { id: ebi.id }, 'bo@c.test');
    await json('/api/friends/accept', { id: bo.id }, 'ebi@c.test');
    seen = await json(`/api/profiles/${ebi.id}`, undefined, 'bo@c.test');
    assert.equal(seen.banner, mine.banner);
    assert.equal(seen.uploadUrl, undefined, 'only the owner gets the editor’s copy');
    assert.equal(seen.extras, undefined);
    assert.equal(seen.person.status.text, 'Rewatching <b>The Matrix</b>');
    assert.deepEqual(seen.statKeys, ['hours', 'reviews']);
    assert.equal(seen.pinned.key, 'movie:603');
    assert.equal(seen.look.pageColor, '#ff6f91');
    await send(mine.banner, { email: 'bo@c.test' });
    await send(mine.banner, { email: 'cy@c.test', status: 404 }); // not a friend
    // switched to another banner: the upload stays private
    await json('/api/profiles/me', { look: { banner: 'gradient' } }, 'ebi@c.test');
    await send(mine.banner, { email: 'bo@c.test', status: 404 });
    // removing it takes the file away and falls back
    await json('/api/profiles/me', { look: { banner: 'upload' } }, 'ebi@c.test');
    mine = (await send('/api/profiles/me/banner', { body: Buffer.alloc(0), raw: true, email: 'ebi@c.test' })).data;
    assert.equal(mine.look.upload, null);
    assert.equal(mine.look.banner, 'auto');
    await send(`/api/profiles/${ebi.id}/banner`, { email: 'ebi@c.test', status: 404 });
  } finally {
    child.kill();
    await exited;
    await fs.rm(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
});
