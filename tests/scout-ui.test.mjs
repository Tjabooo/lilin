import test from 'node:test';
import assert from 'node:assert/strict';
import { createScout, scoutWaiting } from '../public/scout.js';

// A tiny stand-in for app.js's h(): plain objects we can search, no DOM needed.
const h = (tag, props = {}, ...kids) => ({ tag, props: props || {}, kids: kids.flat().filter((k) => k != null && k !== false), addEventListener() {} });
const text = (n) => (n == null ? '' : typeof n !== 'object' ? String(n) : n.kids.map(text).join(''));
const all = (n, pred, out = []) => { if (n && typeof n === 'object') { if (pred(n)) out.push(n); n.kids.forEach((k) => all(k, pred, out)); } return out; };
const buttons = (n) => all(n, (x) => x.tag === 'button').map(text);

const base = { title: 'Shuffle play', pitch: 'A random episode.', fit: 'Show pages.', size: 'small', thread: [], build: null, created: Date.now(), decided: null,
  evidence: [{ text: 'Wanted for years', url: 'https://www.reddit.com/r/PleX/x', where: 'r/PleX', year: 2016 }, { text: 'No link', url: '', where: 'Forum', year: null }] };
const ideas = ['new', 'discuss', 'approved', 'building', 'added', 'failed', 'notnow'].map((status, n) => ({ ...base, id: `0000000${n}`, status, title: `${base.title} ${status}` }));

test('scout cards: the right actions for each state, safe links, the rest folded away', () => {
  const scout = createScout({ h, api: async () => ({}), toast() {}, jsonPost: (b) => b, fmtAgo: () => 'today', rerender() {} });
  assert.deepEqual(scout.section([], () => {}), []);
  const [section] = scout.section(ideas, () => {});
  const cards = all(section, (x) => x.tag === 'li' && /scout-card/.test(x.props.class));
  const byStatus = Object.fromEntries(cards.map((c) => [c.props.class.split('scout-').pop(), c]));
  assert.deepEqual(buttons(byStatus.new), ['Accept', 'Comment', 'Not now', 'Delete']);
  assert.deepEqual(buttons(byStatus.failed), ['Try again', 'Comment', 'Not now', 'Delete']);
  assert.deepEqual(buttons(byStatus.notnow), ['Accept', 'Comment', 'Delete']);
  assert.deepEqual(buttons(byStatus.building), ['Comment'], 'no deciding or deleting mid-build');
  assert.deepEqual(buttons(byStatus.added), []);
  const links = all(byStatus.new, (x) => x.tag === 'a');
  assert.equal(links.length, 1, 'evidence without a URL has no link');
  assert.equal(links[0].props.rel, 'noopener noreferrer');
  assert.match(text(byStatus.new), /Why people want it \(2\)/);
  // Open ideas first; added and not-now ones under "Earlier".
  const earlier = all(section, (x) => x.tag === 'details' && x.props.class === 'scout-earlier')[0];
  assert.equal(all(earlier, (x) => x.tag === 'li' && /scout-card/.test(x.props.class)).length, 2);
  assert.equal(scoutWaiting(ideas), 1);
  assert.match(text(section), /1 waiting/);
});
