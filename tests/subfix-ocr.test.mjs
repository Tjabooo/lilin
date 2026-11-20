import test from 'node:test';
import assert from 'node:assert/strict';
import { looksOcr, setLexiconForTest } from '../src/subfix.js';

const srt = (lines) => lines.map((l, i) => `${i + 1}\n00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String(i % 60).padStart(2, '0')},900\n${l}`).join('\n\n');
const LINES = [
  "I don't know what you want from me.", 'It is what it is, if you like it.', "I'm going to the house with my brother.",
  'Of course you are. Are you coming with us?', 'Take a deep breath and do your homework.', "We'll see if it's true, I think.",
  'Get inside and help your sister.', 'Is that a little thing? I like it in the house.',
];
const clean = Array.from({ length: 64 }, (_, i) => LINES[i % LINES.length]);
setLexiconForTest(Array.from({ length: 12 }, () => srt(clean)));

test('a clean subtitle is not taken for OCR', () => {
  assert.equal(looksOcr(srt(clean)), false);
});

test('l/I mix-ups mark a subtitle as OCR', () => {
  assert.equal(looksOcr(srt(clean.map((l) => l.replace(/\bI\b/g, 'l').replace(/\bIt\b/g, 'lt')))), true);
});

test('glued words mark a subtitle as OCR', () => {
  const glued = clean.map((l) => l.replace('Of course', 'Ofcourse').replace('Are you', 'Areyou').replace('do your', 'doyour').replace('help your', 'helpyour'));
  assert.equal(looksOcr(srt(glued)), true);
});

test('a few odd words in a long clean subtitle are not enough', () => {
  const few = clean.slice();
  few[3] = 'Ofcourse you are.';
  few[9] = 'l see.';
  assert.equal(looksOcr(srt(few)), false);
});

test('sign drawings and non-English text are not OCR', () => {
  assert.equal(looksOcr(srt([...clean, 'm 0 0 l 120 0 l 120 40 l 0 40'])), false);
  assert.equal(looksOcr(srt(Array.from({ length: 80 }, () => "Tu n'es jamais là. l'homme est là."))), false);
});
