import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('There is one TV app: the Tizen shell loads /tv under the Lilin package', () => {
  const config = read('tv/tizen/config.xml.in');
  const shell = read('tv/tizen/shell.js');
  assert.match(config, /LilTvApp01\.Lilin/);
  assert.match(config, /<name>Lilin<\/name>/);
  assert.match(shell, /\/tv-rs\/host\.js/);
  assert.doesNotMatch(shell + config, /tv-preview|LilTvPrv01/);
  assert.equal(fs.existsSync(new URL('../public/tv-preview', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../tv/tizen-preview', import.meta.url)), false);
});

test('Tizen shell parses as old-browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(read('tv/tizen/shell.js')));
});

test('Rust TV app: every line has Swedish, and the shells start it with no JavaScript app to fall back on', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('public/tv/sv.js'), sandbox);
  const strings = sandbox.window.LilinTvStrings;
  const dir = new URL('../tv/rust/src/', import.meta.url);
  const src = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.rs')).map((f) => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const lines = [...src.matchAll(/(?<![A-Za-z_])t!\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  assert.ok(lines.length > 100);
  for (const line of lines) assert.ok(line in strings, line);
  const shell = read('tv/tizen/shell.js');
  assert.match(shell, /\/tv-rs\/host\.js/);
  assert.match(shell, /onFail: retry/);
  const android = read('tv/android/app/src/main/assets/shell.html');
  for (const s of [shell, android]) assert.doesNotMatch(s, /\/tv\/(tv|logic)\.js|tv\.css|tv-engine/);
  for (const gone of ['tv.js', 'tv.css', 'logic.js']) assert.equal(fs.existsSync(new URL('../public/tv/' + gone, import.meta.url)), false, gone);
});

test('Rust TV host is old-browser JavaScript and the built app is in public/', () => {
  const host = read('public/tv-rs/host.js');
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotMatch(host, /\?\./, 'Chrome 69 must not see optional chaining');
  assert.doesNotMatch(host, /\?\?/, 'Chrome 69 must not see nullish coalescing');
  const wasm = fs.readFileSync(new URL('../public/tv-rs/lilin_tv.wasm', import.meta.url));
  assert.deepEqual([...wasm.subarray(0, 4)], [0, 0x61, 0x73, 0x6d]);
  // Every function Rust imports is one host.js provides.
  const mod = new WebAssembly.Module(wasm);
  for (const imp of WebAssembly.Module.imports(mod)) assert.match(host, new RegExp('\\b' + imp.name + ': '), imp.name);
});
