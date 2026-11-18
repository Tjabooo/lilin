import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Every POST route handleApi answers must also be on the request guard's allowlist in server.js,
// or the browser gets 405 and the action quietly fails (Remove from Continue watching did).
test('every exact POST route is on the POST allowlist', () => {
  const src = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const start = src.indexOf('const allowed = ');
  const end = src.indexOf('if (!allowed)', start);
  assert.ok(start > 0 && end > start, 'allowlist not found');
  const expr = src.slice(start + 'const allowed = '.length, end).trim().replace(/;$/, '');
  const allowed = new Function('req', 'url', `return (${expr});`);
  const routes = [...new Set([...src.matchAll(/p === '(\/api\/[^']+)' && req\.method === 'POST'/g)].map((m) => m[1]))];
  assert.ok(routes.length > 5);
  const missing = routes.filter((p) => allowed({ method: 'POST', headers: {} }, { pathname: p, searchParams: new URLSearchParams() }) !== true);
  assert.deepEqual(missing, []);
});
