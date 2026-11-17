// Getting it ready (play first): the words and the progress line while a title that isn't here gets ready to play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readyWords, aboutTime } from '../public/getting-ready.js';

test('each phase says what is happening in plain words, and the line only moves forward through the phases', () => {
  const finding = readyWords({ phase: 'finding', elapsed: 5 });
  assert.equal(finding.line, 'Finding the best copy…');
  assert.equal(finding.hint, 'Usually ready in under a minute.');
  const connecting = readyWords({ phase: 'connecting', elapsed: 20, phaseElapsed: 1 });
  const starting = readyWords({ phase: 'starting', elapsed: 30, startProgress: 0.4, startEta: 22 });
  const opening = readyWords({ phase: 'opening', elapsed: 40 });
  assert.ok(finding.progress < connecting.progress && connecting.progress < starting.progress && starting.progress < opening.progress);
  assert.equal(starting.line, 'Starting in about 25 s');
  assert.equal(readyWords({ phase: 'starting', startEta: 3 }).line, 'Almost there…');
  assert.equal(readyWords({ phase: 'starting', startEta: null }).line, 'Fetching the start of the video…');
  assert.equal(opening.line, 'Starting…');
});

test('a slow start says so, a failure says what went wrong, SVT Play waits for the whole video', () => {
  assert.match(readyWords({ phase: 'finding', elapsed: 200 }).hint, /longer than usual/);
  const failed = readyWords({ phase: 'failed', message: 'Couldn’t find a good copy.' });
  assert.equal(failed.line, 'Couldn’t find a good copy.'); assert.equal(failed.progress, 0);
  assert.equal(readyWords({ phase: 'failed' }).line, 'Lilin couldn’t find a copy that plays well.');
  assert.equal(readyWords({ phase: 'whole', startProgress: 0.5 }).line, 'Fetching it from SVT Play…');
});

test('times are rounded so they don’t flicker', () => {
  assert.equal(aboutTime(2), '5 s');
  assert.equal(aboutTime(22), '25 s');
  assert.equal(aboutTime(54), '55 s');
  assert.equal(aboutTime(100), '2 min');
});
