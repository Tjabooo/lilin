// Taste match on a friend's profile (src/taste-match.js): how close your taste is to theirs, as a word from Low to
// Super over five little steps, worked out from what you've both rated. Under it, short rows of posters: what you
// both loved, where you split (each side's stars under the poster, by your face and theirs) and what they loved
// that you haven't seen. Only friends get it; the server sends `match` on the profile, or null.
//
// profiles.js shows it as the profile's 'match' section and passes in its own helpers, so posters, stars and the
// section heading look like the rest of the page (accent colour, poster shape).
import { T } from './i18n.js';

const LEVELS = ['low', 'medium', 'high', 'veryHigh', 'super'];
const WORDS = { low: T('Low'), medium: T('Medium'), high: T('High'), veryHigh: T('Very high'), super: T('Super') };
const THUMB = '<path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7"/>';

export function createTasteMatch({ h, icon, people, me, posterButton, sectionBox, stars }) {
  // Your own thumbs down (the other person's is never sent).
  function thumbDown() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'tm-down');
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', T('Not for me'));
    s.innerHTML = THUMB;
    return s;
  }
  // Stars, a heart (not next to 5 stars, which is a like anyway: the columns are narrow) or your thumbs down.
  const opinion = (o = {}) => [o.stars ? stars(o.stars) : null,
    o.liked && !(o.stars >= 5) && h('span', { class: 'pf-heart', role: 'img', 'aria-label': T('Liked') }, '♥'), o.disliked && thumbDown()];

  function score(m, friend) {
    const self = me();
    const at = LEVELS.indexOf(m.level);
    return h('div', { class: `tm-score${at < 0 ? ' tm-wait' : ''}`, 'data-level': m.level || 'none' },
      h('div', { class: 'tm-faces', 'aria-hidden': 'true' }, self && people.face(self, { size: 46 }), people.face(friend, { size: 46 })),
      h('div', { class: 'tm-read' },
        at >= 0
          ? h('p', { class: 'tm-level' }, WORDS[m.level], m.level === 'super' && icon('sparkle'))
          : h('p', { class: 'tm-level' }, T('Not enough in common yet')),
        at >= 0 && h('div', { class: 'tm-meter', 'aria-hidden': 'true' }, LEVELS.map((_, i) => h('span', { class: i <= at ? 'on' : null }))),
        h('p', { class: 'tm-from' }, at >= 0 ? T('From {0} films and shows you’ve both rated', m.common)
          : T('{0} of {1} rated by both of you so far', m.common, m.need))));
  }

  function row(ctx, cls, title, list, under = null) {
    if (!list?.length) return null;
    return h('div', { class: `tm-group ${cls}` }, h('h4', { class: 'tm-sub' }, title),
      h('ul', { class: 'pf-strip tm-strip' }, list.map((x) => h('li', {}, posterButton(ctx, x.card, x, { size: 'w185' }), under?.(x)))));
  }

  function section(ctx, d) {
    const m = d.match;
    if (!m || d.me) return null;
    const friend = d.person;
    const self = me();
    const side = (who, name, o) => h('div', { class: 'tm-side' }, who && people.face(who, { size: 18 }), h('span', { class: 'sr-only' }, `${name}:`), opinion(o));
    return sectionBox('match', T('Taste match'), null,
      score(m, friend),
      row(ctx, 'tm-both', T('You both loved'), m.both),
      row(ctx, 'tm-split', T('Where you split'), m.split, (x) => h('div', { class: 'tm-sides' },
        side(self, T('You'), x.mine), side(friend, friend.name, x.theirs))),
      row(ctx, 'tm-theirs', T('{0} loved, you haven’t seen', friend.name), m.theirs, (x) => h('div', { class: 'pf-under' }, opinion(x))));
  }

  return { section };
}
