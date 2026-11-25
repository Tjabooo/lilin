import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createQuoteSearch } from '../src/quote-search.js';
import { killTree } from './kill-tree.mjs';

// Over HTTP: /api/status says there's something to find, and /api/lines answers with the film, the line and the
// lines around it, without the file's path. The index is built beforehand (the server's first round waits 90 s).
test('lines API: a quote finds its film', { timeout: 30000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = await fsp.mkdtemp(path.join(os.tmpdir(), 'lilin-lines-api-'));
  for (const name of await fsp.readdir(root)) if (name.endsWith('.js') || name === 'package.json') await fsp.copyFile(path.join(root, name), path.join(app, name));
  await fsp.cp(path.join(root, 'public'), path.join(app, 'public'), { recursive: true });
  await fsp.cp(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  const data = path.join(app, 'data'), media = path.join(app, 'media');
  fs.mkdirSync(path.join(media, 'Movies', 'Blood'), { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const film = path.join(media, 'Movies', 'Blood', 'There.Will.Be.Blood.2007.mp4');
  fs.writeFileSync(film, '');
  fs.writeFileSync(film.replace(/\.mp4$/, '.en.srt'), '1\n02:31:00,000 --> 02:31:02,000\nDrainage!\n\n2\n02:31:04,000 --> 02:31:06,000\nI drink your milkshake!\n\n3\n02:31:06,500 --> 02:31:08,000\nI drink it up!\n');
  const built = createQuoteSearch({ cacheDir: path.join(data, 'cache'), languages: () => ['en'],
    library: async () => [{ key: 'movies/blood/there.will.be.blood.2007', file: film }] });
  assert.equal((await built.round()).indexed, 1);
  built.close();

  let port = 0;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PORT: '0', DATA_DIR: data, MEDIA_DIR: media, ADMIN_EMAILS: 'owner@t.test', CONVERT: 'off', SUBSYNC: 'off', CAST_APPLETV: 'off', NOTES_OCR: 'off',
    SERVER_IP: '127.0.0.1', SUBTITLE_LLM: 'off' };
  const child = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((r) => child.once('exit', r));
  await new Promise((resolve, reject) => {
    let logs = ''; const timer = setTimeout(() => reject(Error('Startup timeout: ' + logs)), 60000);
    child.stdout.on('data', (c) => { logs += c; const ready = /Lilin is running: http:\/\/localhost:(\d+)/.exec(logs); if (ready) { port = Number(ready[1]); clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (c) => { logs += c; });
    child.once('exit', () => { clearTimeout(timer); reject(Error(logs)); });
  });
  const get = async (route, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'cf-access-authenticated-user-email': 'ebi@t.test' } });
    const body = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(body)}`); return body;
  };
  try {
    assert.equal((await get('/api/status')).lines, true);
    const { results } = await get(`/api/lines?q=${encodeURIComponent('i drink your milk')}`);
    assert.equal(results.length, 1);
    const [hit] = results;
    assert.equal(hit.kind, 'film');
    assert.equal(hit.mediaKey, 'movies/blood/there.will.be.blood.2007');
    assert.equal(hit.id, Buffer.from(path.join('Movies', 'Blood', 'There.Will.Be.Blood.2007.mp4')).toString('base64url'));
    assert.deepEqual(hit.line, { at: 9064, end: 9066, text: 'I drink your milkshake!', before: 'Drainage!', after: 'I drink it up!' });
    assert.equal('file' in hit, false, 'no server paths');
    assert.deepEqual((await get('/api/lines?q=i')).results, []);
    assert.deepEqual((await get('/api/lines?q=nothing%20like%20this')).results, []);
  } finally {
    // killTree(child) on Windows ends only node: helpers it started would keep the temp folder open (EBUSY).
    killTree(child);
    await exited;
    await fsp.rm(app, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
