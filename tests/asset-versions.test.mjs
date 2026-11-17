import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { rewriteIndex, createAssetVersions, contentVersion, versionMatches, VERSION_LENGTH } from '../src/asset-versions.js';
import { createStaticFiles } from '../src/static-files.js';

const INDEX = `<!doctype html><html><head>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/profiles.css"><!-- profiles -->
  <link rel="icon" href="/c/icons/icon-192.png">
  <link rel="stylesheet" href="https://example.com/x.css">
</head><body>
  <script>document.documentElement.classList.add('x');</script>
  <script type="module" src="/app.js"></script>
</body></html>`;

test('rewriteIndex versions local stylesheets and scripts and adds an import map before the module script', () => {
  const out = rewriteIndex(INDEX, { 'style.css': 'aaaaaaaaaa', 'profiles.css': 'bbbbbbbbbb', 'app.js': 'cccccccccc', 'profiles.js': 'dddddddddd' });
  assert.match(out, /href="\/style\.css\?v=aaaaaaaaaa"/);
  assert.match(out, /href="\/profiles\.css\?v=bbbbbbbbbb"/);
  assert.match(out, /src="\/app\.js\?v=cccccccccc"/);
  assert.match(out, /href="\/c\/icons\/icon-192\.png"/, 'other paths untouched');
  assert.match(out, /href="https:\/\/example\.com\/x\.css"/, 'external untouched');
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(out)[1]);
  assert.deepEqual(map.imports, { '/app.js': '/app.js?v=cccccccccc', '/profiles.js': '/profiles.js?v=dddddddddd' });
  assert.ok(out.indexOf('type="importmap"') < out.indexOf('type="module"'), 'import map comes first');
});

test('rewriteIndex leaves files it does not know alone', () => {
  const out = rewriteIndex(INDEX, { 'style.css': 'aaaaaaaaaa' });
  assert.match(out, /href="\/profiles\.css"/);
  assert.match(out, /src="\/app\.js"/);
  assert.doesNotMatch(out, /importmap/);
});

test('createAssetVersions hashes the real files and notices a change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-assets-'));
  fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
  fs.writeFileSync(path.join(dir, 'style.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'profiles.css'), '.pf{}');
  fs.writeFileSync(path.join(dir, 'app.js'), 'import "./profiles.js";');
  fs.writeFileSync(path.join(dir, 'profiles.js'), 'export {};');
  const index = createAssetVersions(dir);
  const first = index();
  assert.ok(Buffer.isBuffer(first));
  assert.equal(index(), first, 'same Buffer while nothing changed');
  assert.match(first.toString(), new RegExp(`profiles\\.css\\?v=${contentVersion(Buffer.from('.pf{}'))}`));
  fs.writeFileSync(path.join(dir, 'profiles.css'), '.pf{color:red}');
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(dir, 'profiles.css'), t, t);
  const second = index();
  assert.notEqual(second, first);
  assert.match(second.toString(), new RegExp(`profiles\\.css\\?v=${contentVersion(Buffer.from('.pf{color:red}'))}`));
});

test('a matching ?v is cached for good, an old one is not; versions line up with the ETag hash', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-assets-'));
  const css = Buffer.from('.pf-face-mine{border:0}'.repeat(80));
  const full = path.join(dir, 'profiles.css');
  fs.writeFileSync(full, css);
  const etag = crypto.createHash('sha1').update(css).digest('base64url').slice(0, 27);
  const v = contentVersion(css);
  assert.equal(v.length, VERSION_LENGTH);
  assert.ok(versionMatches(v, etag));
  const files = createStaticFiles();
  const fake = () => { const res = { headers: null, writeHead(s, h) { this.status = s; this.headers = h; }, end() {} }; return res; };
  const req = { headers: {}, method: 'GET' };
  const a = fake(); await files.send(req, a, full, 'text/css', { 'Cache-Control': 'no-cache' }, { immutableIf: v });
  assert.match(a.headers['Cache-Control'], /immutable/);
  const b = fake(); await files.send(req, b, full, 'text/css', { 'Cache-Control': 'no-cache' }, { immutableIf: 'zzzzzzzzzz' });
  assert.equal(b.headers['Cache-Control'], 'no-cache');
  const c = fake(); await files.send(req, c, path.join(dir, 'index.html'), 'text/html', { 'Cache-Control': 'no-cache' }, { body: Buffer.from('<p>hi</p>') });
  assert.equal(c.status, 200);
  assert.match(c.headers.ETag, /^"/);
});
