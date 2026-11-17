// Billboard banner pick (src/backdrop.js): textless, at least 1920 wide, average weighted by vote count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBackdrop } from '../src/backdrop.js';

const b = (file_path, width, iso_639_1, vote_count, vote_average) => ({ file_path, width, iso_639_1, vote_count, vote_average });

test('The Odyssey (2026): the well-liked still beats the 3-vote fan upload TMDB made default', () => {
  const list = [
    b('/titled.jpg', 3840, 'en', 7, 8.362), // logo baked in
    b('/fewvotes.jpg', 3840, null, 5, 8.034),
    b('/liked.jpg', 3840, null, 68, 5.53),
    b('/second.jpg', 3840, null, 55, 5.336),
    b('/default.jpg', 3840, null, 3, 3.334),
  ];
  assert.equal(pickBackdrop(list), '/liked.jpg');
});

test('below 1080p width never wins, however liked', () => {
  assert.equal(pickBackdrop([b('/small.jpg', 1280, null, 200, 9), b('/big.jpg', 1920, null, 2, 4)]), '/big.jpg');
  assert.equal(pickBackdrop([b('/small.jpg', 1280, null, 200, 9)]), null);
});

test('nothing usable keeps the default', () => {
  assert.equal(pickBackdrop([]), null);
  assert.equal(pickBackdrop(undefined), null);
  assert.equal(pickBackdrop([b('/titled.jpg', 3840, 'en', 50, 9)]), null);
});
