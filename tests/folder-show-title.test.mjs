import test from 'node:test';
import assert from 'node:assert/strict';
import { parseName, folderShowTitle } from '../src/release-name.js';

const folder = (name) => folderShowTitle(parseName(name, { file: false }).title);

test('pack folders lose every season tag', () => {
  assert.equal(folder('The Mindy Project Season 1 S01 [1080p WEB-DL x265 5.1]-CPT'), 'The Mindy Project');
  assert.equal(folder('NANA S01 1080p BluRay -EMBER'), 'NANA');
  assert.equal(folder('The Wire Season 1-5 1080p'), 'The Wire');
  assert.equal(folder('Severance S01-S02 2160p'), 'Severance');
});

test('titles without season tags stay as they are', () => {
  assert.equal(folder('The Bear'), 'The Bear');
  assert.equal(folder('Season 2'), 'Season 2'); // parseFile skips a bare season folder itself
  assert.equal(folderShowTitle('Seasons'), 'Seasons');
});
