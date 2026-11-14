import test from 'node:test';
import assert from 'node:assert/strict';
import { isAligned } from '../src/convert.js';

test('a one-frame video start (B-frame delay) counts as in sync', () => {
  // ffprobe of a real MP4 copy: video starts at 0.041708 s, audio at 0 (House S06E01).
  assert.equal(isAligned([{ offset: -0.042 }]), true);
  assert.equal(isAligned([{ offset: 0.042 }]), true);
  assert.equal(isAligned([]), true);
});

test('real drift still needs a fix', () => {
  assert.equal(isAligned([{ offset: -0.084 }]), false);
  assert.equal(isAligned([{ offset: 0.5 }]), false);
});
