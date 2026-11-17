import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let ffmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = false; }

// Moments end to end: cut a real (tiny) video, send it to a friend, open the public link, delete it.
test('moments are cut, sent to friends only and shared by link', { timeout: 60000, skip: !ffmpeg && 'needs ffmpeg' }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-moments-'));
  const media = path.join(app, 'media');
  await fs.mkdir(path.join(media, 'Films'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '12', '-c:v', 'libx264', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(media, 'Films', 'Test.Film.2020.mp4')]);
  for (const name of await fs.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fs.copyFile(path.join(root, name), path.join(app, name));
  for (const dir of ['src', 'public']) await fs.cp(path.join(root, dir), path.join(app, dir), { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', MEDIA_DIR: media, ADMIN_EMAILS: 'owner@m.test', CONVERT: 'off', SUBSYNC: 'off', TORRENTS: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off',
    SERVER_IP: '127.0.0.1', PREPARE_NEXT_EPISODES: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = ''; child.stderr.on('data', (c) => { logs += c; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(logs)), 10000);
    child.stdout.on('data', (c) => { logs += c; const m = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const request = async (route, body, email = 'owner@m.test', status = 200) => {
    const r = await fetch(base + route, { headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data;
  };
  const ready = async (id, email = 'owner@m.test') => {
    for (let i = 0; i < 100; i++) {
      const m = (await request('/api/moments', undefined, email)).mine.find((x) => x.id === id);
      if (m.state !== 'making') return m;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('never cut');
  };
  try {
    await request('/api/me');
    const pal = (await request('/api/me', { name: 'Pal' }, 'pal@m.test')).me;
    const mum = (await request('/api/me', { name: 'Mum' }, 'mum@m.test')).me;
    const stranger = (await request('/api/me', { name: 'Stranger' }, 'x@m.test')).me;
    const owner = (await request('/api/me')).me;
    await request('/api/friends/request', { id: pal.id });
    await request('/api/friends/accept', { id: owner.id }, 'pal@m.test');
    const lib = await request('/api/library');
    const film = [...(lib.items || []), ...(lib.server || [])].find((i) => /Test\.Film/i.test(i.name || i.file || i.title || '') || i.title === 'Test Film') || lib.items?.[0] || lib.server?.[0];
    assert.ok(film, JSON.stringify(lib).slice(0, 400));

    // Bad times and strangers' library are refused.
    await request('/api/moments', { kind: 'lib', id: film.id, start: 3, end: 3.5 }, undefined, 400);
    await request('/api/moments', { kind: 'lib', id: film.id, start: 20, end: 30 }, undefined, 400); // past the end
    await request('/api/moments', { kind: 'lib', id: film.id, start: 1, end: 4 }, 'x@m.test', 403);

    // Keyframe at 1 s: copied. Sent to a friend (and a stranger, who is dropped).
    const made = await request('/api/moments', { kind: 'lib', id: film.id, start: 1, end: 4, note: 'look at this', title: 'Test Film', label: '2020',
      subtitles: [{ start: 1.5, end: 3, text: 'Hello' }], to: [pal.id, stranger.id] });
    assert.equal(made.sent, 1);
    assert.match(made.link, /\/c\/m\/[A-Za-z0-9_-]{22}$/);
    const m = await ready(made.moment.id);
    assert.equal(m.state, 'ready', m.error);
    assert.equal(m.mode, 'copy');
    assert.deepEqual(m.to.map((p) => p.name), ['Pal']);
    const shared = await request('/api/moments', undefined, 'pal@m.test');
    assert.equal(shared.shared.length, 1); assert.equal(shared.shared[0].note, 'look at this'); assert.equal(shared.unseen, 1);
    assert.equal((await request('/api/moments', undefined, 'x@m.test')).shared.length, 0);
    await request(`/api/moments/${m.id}/seen`, {}, 'pal@m.test');
    assert.equal((await request('/api/moments', undefined, 'pal@m.test')).unseen, 0);

    // The public page works without a sign-in: page, video, thumbnail, subtitles.
    const pagePath = new URL(made.link).pathname;
    const pageRes = await fetch(base + pagePath);
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();
    assert.match(html, /look at this/); assert.match(html, /subs\.vtt/);
    const video = await fetch(`${base}${pagePath}/video.mp4`);
    assert.equal(video.status, 200);
    const file = path.join(app, 'cut.mp4'); await fs.writeFile(file, Buffer.from(await video.arrayBuffer()));
    const length = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
    assert.ok(Math.abs(length - 3) < 0.3, `length ${length}`);
    assert.equal((await fetch(`${base}${pagePath}/thumb.jpg`)).status, 200);
    assert.match(await (await fetch(`${base}${pagePath}/subs.vtt`)).text(), /^WEBVTT\n\n00:00:00\.500 --> 00:00:02\.000\nHello/);

    // Off a keyframe: encoded.
    const enc = await request('/api/moments', { kind: 'lib', id: film.id, start: 2.5, end: 5 });
    assert.equal((await ready(enc.moment.id)).mode, 'x264');

    // Restricted people make links but can't send, and can't be sent to.
    await request(`/api/admin/users/${mum.id}`, { restricted: true });
    await request('/api/library/add', { ids: [film.id] }, 'mum@m.test');
    const hers = await request('/api/moments', { kind: 'lib', id: film.id, start: 1, end: 3, to: [owner.id] }, 'mum@m.test');
    assert.equal(hers.sent, 0);
    await request(`/api/moments/${hers.moment.id}/send`, { userIds: [owner.id] }, 'mum@m.test', 403);
    await request(`/api/moments/${enc.moment.id}/send`, { userIds: [mum.id] }, undefined, 400);

    // Deleting kills the link; someone it was sent to only takes it off their own list.
    await request(`/api/moments/${m.id}/delete`, {}, 'pal@m.test');
    assert.equal((await request('/api/moments', undefined, 'pal@m.test')).shared.length, 0);
    assert.equal((await fetch(`${base}${pagePath}/video.mp4`)).status, 200);
    await request(`/api/moments/${m.id}/delete`, {});
    assert.equal((await fetch(base + pagePath)).status, 404);
    assert.equal((await fetch(`${base}${pagePath}/video.mp4`)).status, 404);
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    await fs.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
