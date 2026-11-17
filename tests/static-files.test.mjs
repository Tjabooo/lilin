import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createStaticFiles, acceptedEncodings, matches } from '../src/static-files.js';

// A tiny server around createStaticFiles, like serveStatic: one folder, no-cache, CDN no-store.
async function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-static-'));
  const files = createStaticFiles();
  const types = { '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.html': 'text/html; charset=utf-8' };
  const server = http.createServer(async (req, res) => {
    const full = path.join(dir, req.url === '/' ? 'index.html' : req.url.slice(1));
    if (!(await files.send(req, res, full, types[path.extname(full)] || 'application/octet-stream',
      { 'Cache-Control': 'no-cache', 'CDN-Cache-Control': 'no-store' }))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const get = (p, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: p, method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
  return { dir, files, get, close: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

const big = (n) => `// app\n${Array.from({ length: n }, (_, i) => `export const x${i} = 'value ${i}';`).join('\n')}\n`;

test('Accept-Encoding: br before gzip, q=0 turns one off, * counts', () => {
  assert.deepEqual(acceptedEncodings('gzip, deflate, br, zstd'), ['br', 'gzip']);
  assert.deepEqual(acceptedEncodings('gzip'), ['gzip']);
  assert.deepEqual(acceptedEncodings('br;q=0, gzip;q=0.5'), ['gzip']);
  assert.deepEqual(acceptedEncodings('*'), ['br', 'gzip']);
  assert.deepEqual(acceptedEncodings('identity'), []);
  assert.deepEqual(acceptedEncodings(''), []);
  assert.ok(matches('W/"abc-br"', 'abc'), 'a weakened or compressed tag still means the same content');
  assert.ok(matches('"x", "abc"', 'abc'));
  assert.equal(matches('"abcd"', 'abc'), false);
});

test('a file gets a strong ETag, and asking again with it costs a 304 and no body', async () => {
  const r = await rig();
  try {
    fs.writeFileSync(path.join(r.dir, 'app.js'), big(200));
    const first = await r.get('/app.js');
    assert.equal(first.status, 200);
    assert.match(first.headers.etag, /^"[\w-]{20,}"$/, 'strong, quoted');
    assert.equal(first.headers['cache-control'], 'no-cache', 'still revalidated every load, so deploys show at once');
    assert.equal(first.headers['cdn-cache-control'], 'no-store');
    assert.equal(first.headers['content-encoding'], undefined, 'no Accept-Encoding, no compression');
    assert.equal(first.body.toString(), big(200));

    const again = await r.get('/app.js', { 'If-None-Match': first.headers.etag });
    assert.equal(again.status, 304);
    assert.equal(again.body.length, 0);
    assert.equal(again.headers.etag, first.headers.etag);

    // A deploy changes the file: the old tag no longer matches, the new content comes back with a new tag.
    fs.writeFileSync(path.join(r.dir, 'app.js'), big(201));
    const fresh = await r.get('/app.js', { 'If-None-Match': first.headers.etag });
    assert.equal(fresh.status, 200);
    assert.notEqual(fresh.headers.etag, first.headers.etag);
    assert.equal(fresh.body.toString(), big(201));

    const head = await r.get('/app.js', {}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(big(201)));

    assert.equal((await r.get('/missing.js')).status, 404);
    fs.mkdirSync(path.join(r.dir, 'folder'));
    assert.equal((await r.get('/folder')).status, 404, 'a folder is not a file');
  } finally { r.close(); }
});

test('text goes out as gzip at once and as brotli once it is made; images and small files are left alone', async () => {
  const r = await rig();
  try {
    const text = big(400);
    fs.writeFileSync(path.join(r.dir, 'app.js'), text);
    const gz = await r.get('/app.js', { 'Accept-Encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(gz.headers.vary, 'Accept-Encoding');
    assert.equal(zlib.gunzipSync(gz.body).toString(), text);
    assert.ok(gz.body.length < text.length / 3);
    assert.equal(Number(gz.headers['content-length']), gz.body.length);

    const early = await r.get('/app.js', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(early.headers['content-encoding'], 'gzip', 'brotli is still being made');
    await r.files.settle();
    const br = await r.get('/app.js', { 'Accept-Encoding': 'gzip, deflate, br' });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.equal(zlib.brotliDecompressSync(br.body).toString(), text);
    assert.notEqual(br.headers.etag, gz.headers.etag, 'each encoding has its own strong tag');
    assert.equal((await r.get('/app.js', { 'Accept-Encoding': 'br', 'If-None-Match': gz.headers.etag })).status, 304, 'same content, any encoding');

    const png = Buffer.alloc(4096, 7);
    fs.writeFileSync(path.join(r.dir, 'icon.png'), png);
    const img = await r.get('/icon.png', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(img.headers['content-encoding'], undefined);
    assert.equal(img.headers.vary, undefined);
    assert.deepEqual(img.body, png);

    fs.writeFileSync(path.join(r.dir, 'index.html'), '<!doctype html><p>hi</p>');
    const small = await r.get('/', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(small.headers['content-encoding'], undefined, 'too small to bother');
    assert.equal(small.body.toString(), '<!doctype html><p>hi</p>');
  } finally { r.close(); }
});
