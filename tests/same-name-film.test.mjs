// Same-name films: an upload named like the film but as long as another film of that name is that
// other film. Only blocked when the evidence is unambiguous; anything else is kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mainVideo, farFromRuntime, otherFilm } from '../src/same-name-film.js';
import { showKey } from '../src/shows.js';
import { fakeFound, isWrongFilm, loadFakes } from '../src/smart-download.js';

const GB = 1024 ** 3, MB = 1024 ** 2;
const same = (a, b) => showKey(a.title) === showKey(b.title);
const nolan = { id: 1368337, title: 'The Odyssey', release_date: '2026-07-15', runtime: 173 };
const others = [
  { id: 1756234, title: 'The Odyssey', release_date: '2026-07-14', runtime: 92 },
  { id: 1698863, title: 'The Odyssey', release_date: '2026-07-03', runtime: 86 },
  { id: 5, title: 'The Odyssey: The Making of an Epic', release_date: '2026-07-14', runtime: 45 },
];

test('the 92-minute Odyssey uploaded as "The Odyssey 2026" is caught', () => {
  const v = otherFilm(92.4, nolan, others, same);
  assert.equal(v.other.id, 1756234);
  assert.match(v.why, /92 minutes long.*The Odyssey \(2026\) \(92 min\), not The Odyssey \(2026\) \(173 min\)/);
  assert.equal(otherFilm(87, nolan, others, same).other.id, 1698863);
});

test('a real copy is never judged a different film', () => {
  assert.equal(otherFilm(173, nolan, others, same), null, 'the film itself');
  assert.equal(otherFilm(168, nolan, others, same), null, 'credits trimmed');
  assert.equal(otherFilm(200, nolan, others, same), null, 'an extended cut');
  assert.equal(otherFilm(140, nolan, others, same), null, 'a shorter cut: nothing that long by that name');
  assert.equal(otherFilm(110, nolan, others, same), null, 'far off, but no other film is that long');
  assert.equal(otherFilm(92, { ...nolan, runtime: 0 }, others, same), null, 'no TMDB runtime');
  assert.equal(otherFilm(92, { ...nolan, runtime: 100 }, others, same), null, 'runtimes too close to tell apart');
  assert.equal(otherFilm(92, nolan, [], same), null, 'no same-name film');
  assert.equal(otherFilm(92, nolan, [{ ...others[0], title: 'The Iliad' }], same), null, 'a different title');
  assert.equal(otherFilm(92, nolan, [{ ...nolan }], same), null, 'the film itself in the list');
  assert.equal(otherFilm(45, nolan, others, same), null, 'twins under 40 minutes are not trusted');
});

test('the far-from-runtime rule leaves room for cuts', () => {
  assert.equal(farFromRuntime(92, 173), true);
  assert.equal(farFromRuntime(135, 173), false, '78 %');
  assert.equal(farFromRuntime(60, 75), false, '15 minutes off is not enough');
  assert.equal(farFromRuntime(280, 173), true, 'over 160 %');
  assert.equal(farFromRuntime(270, 173), false, 'long director’s cut');
});

test('only one clear main video in a header-length container is read', () => {
  assert.equal(mainVideo([{ name: 'Film/Film.mkv', size: 8 * GB }, { name: 'Film/Sample/sample.mkv', size: 80 * MB }]).name, 'Film/Film.mkv');
  assert.equal(mainVideo([{ name: 'Film.mp4', size: 2 * GB }, { name: 'Film.Trailer.mp4', size: 1.5 * GB }]).name, 'Film.mp4');
  assert.equal(mainVideo([{ name: 'Film/CD1.mkv', size: 4 * GB }, { name: 'Film/CD2.mkv', size: 3 * GB }]), null, 'two parts');
  assert.equal(mainVideo([{ name: 'Film.avi', size: 2 * GB }]), null, 'AVI: length only estimated');
  assert.equal(mainVideo([{ name: 'Film.ts', size: 2 * GB }]), null);
  assert.equal(mainVideo([]), null);
  assert.equal(mainVideo(null), null);
});

test('a wrong-film upload is blocked for that film only, also after a restart', () => {
  const r = { magnet: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=The.Odyssey.2026' };
  fakeFound('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', { notFilm: 1368337 });
  assert.equal(isWrongFilm(r, 1368337), true);
  assert.equal(isWrongFilm(r, 1756234), false, 'still fine for the film it really is');
  assert.equal(isWrongFilm(r, null), false);
  loadFakes([{ hash: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', notFilm: 7 }]);
  assert.equal(isWrongFilm({ magnet: 'magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }, 7), true);
  assert.equal(isWrongFilm({ magnet: 'magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }, 8), false);
});
