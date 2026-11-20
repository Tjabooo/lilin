// Connection-based choice (public/connection.js): which version and stream fit a viewer's measured speed.
import assert from 'node:assert/strict';
const c = await import('../public/connection.js');
const v = [{ id: '4k', kbps: 24000 }, { id: 'hd', kbps: 8700 }];
assert.equal(c.versionForSpeed(v, 100).id, '4k');
assert.equal(c.versionForSpeed(v, 20).id, 'hd');
assert.equal(c.versionForSpeed(v, 5).id, 'hd');
assert.equal(c.streamFor(8700, 20, 1080), null);
assert.equal(c.streamFor(8700, 5, 1080), '720');
assert.equal(c.streamFor(24000, 12, 2160), '1080');
assert.equal(c.streamFor(24000, 6, 2160), '720');
assert.equal(c.slowForUhd(20), true); assert.equal(c.slowForUhd(80), false);

