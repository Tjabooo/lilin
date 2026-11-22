import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stingerOf, titleStinger, DURING_CREDITS, AFTER_CREDITS } from '../src/stinger.js';
import { sceneNote, stayLine, bannerShowing, cardPutAway, kindOf, createStay, STAY_CARD_SECONDS, BANNER_SECONDS } from '../public/stinger.js';
import sv from '../public/i18n-sv.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kw = (id, name) => ({ id, name });

test('stinger: TMDB keywords by id or by name', () => {
  assert.equal(DURING_CREDITS, 179431);
  assert.equal(AFTER_CREDITS, 179430);
  assert.equal(stingerOf([kw(9715, 'superhero'), kw(179430, 'aftercreditsstinger')]), 'after');
  assert.equal(stingerOf([kw(179431, 'duringcreditsstinger')]), 'during');
  assert.equal(stingerOf([kw(179431, 'duringcreditsstinger'), kw(179430, 'aftercreditsstinger')]), 'both');
  // A renumbered keyword still counts by its name (any case, spaces or dashes)
  assert.equal(stingerOf([kw(1, 'After Credits Stinger')]), 'after');
  assert.equal(stingerOf([kw('179431', 'x')]), 'during');
  // No keyword: null, never "no scene"
  assert.equal(stingerOf([kw(9715, 'superhero'), kw(2, 'post-apocalyptic future')]), null);
  assert.equal(stingerOf([]), null);
  assert.equal(stingerOf(null), null);
  assert.equal(stingerOf([null, {}]), null);
});

test('stinger: films only, from the details answer', () => {
  assert.equal(titleStinger('movie', { keywords: { keywords: [kw(179430, 'aftercreditsstinger')] } }), 'after');
  assert.equal(titleStinger('movie', {}), null);
  assert.equal(titleStinger('movie', null), null);
  // A show's keywords are about the whole show, not one episode
  assert.equal(titleStinger('tv', { keywords: { results: [kw(179430, 'aftercreditsstinger')] } }), null);
});

test('stinger: the title page asks for a film\'s keywords and says stinger', () => {
  const server = read('src/server.js');
  assert.match(server, /import \{ titleStinger \} from '\.\/stinger\.js'/);
  assert.match(server, /'images,credits,recommendations,release_dates,keywords'/);
  assert.match(server, /stinger: titleStinger\(type, d\)/);
  // Shows' call is unchanged (their keywords aren't used)
  assert.match(server, /'images,aggregate_credits,recommendations,content_ratings' :/);
});

test('stinger: the lines, in English and Swedish', () => {
  assert.equal(sceneNote('after'), 'Scene after the credits');
  assert.equal(sceneNote('during'), 'Scene during the credits');
  assert.equal(sceneNote('both'), 'Scenes during and after the credits');
  assert.equal(sceneNote(null), '');
  assert.equal(sceneNote('nope'), '');
  assert.equal(stayLine('after'), 'Stay: there’s a scene after the credits');
  assert.equal(stayLine('during'), 'Stay: there’s a scene during the credits');
  assert.equal(stayLine('both'), 'Stay: there are scenes during and after the credits');
  assert.equal(stayLine(undefined), '');
  for (const kind of ['after', 'during', 'both']) {
    assert.ok(sv[sceneNote(kind)], `Swedish for ${sceneNote(kind)}`);
    assert.ok(sv[stayLine(kind)], `Swedish for ${stayLine(kind)}`);
  }
  assert.equal(sv['Stay: there’s a scene after the credits'], 'Stanna kvar: det kommer en scen efter eftertexterna');
  assert.equal(kindOf('both'), 'both');
  assert.equal(kindOf('none'), null);
});

test('stinger: the TV app has the same lines, with Swedish', () => {
  const rs = read('tv/rust/src/stinger.rs');
  const tvSv = read('public/tv/sv.js');
  for (const kind of ['after', 'during', 'both']) {
    for (const line of [sceneNote(kind), stayLine(kind)]) {
      assert.ok(rs.includes(`t!("${line}")`), `TV says ${line}`);
      assert.ok(tvSv.includes(`'${line}': '${sv[line]}'`), `TV Swedish for ${line}`);
    }
  }
  assert.match(read('tv/rust/src/lib.rs'), /^pub mod stinger;$/m);
  const player = read('tv/rust/src/screens/player.rs');
  assert.match(player, /crate::stinger::put_away\(self\.stinger, self\.next\.is_some\(\), at, self\.time\)/);
  assert.match(player, /crate::stinger::stay_line\(self\.stinger\)/);
  assert.match(player, /crate::stinger::scene_note\(self\.stinger\)/);
  assert.match(read('tv/rust/src/screens/title.rs'), /crate::stinger::scene_note\(self\.stinger\)/);
  assert.match(rs, new RegExp(`STAY_CARD_S: f64 = ${STAY_CARD_SECONDS}\\.0;`));
});

test('stinger: Watch Together\'s banner shows for the first seconds of the credits', () => {
  const at = { kind: 'after', creditsAt: 6000, duration: 6600 };
  assert.equal(bannerShowing({ ...at, time: 5999 }), false);
  assert.equal(bannerShowing({ ...at, time: 6000 }), true);
  assert.equal(bannerShowing({ ...at, time: 6000 + BANNER_SECONDS - 0.1 }), true);
  assert.equal(bannerShowing({ ...at, time: 6000 + BANNER_SECONDS }), false);
  assert.equal(bannerShowing({ ...at, kind: null, time: 6001 }), false);
  // No credits start, or one Up next wouldn't trust (first half, past the end): nothing
  assert.equal(bannerShowing({ ...at, creditsAt: null, time: 6001 }), false);
  assert.equal(bannerShowing({ ...at, creditsAt: 1000, time: 1001 }), false);
  assert.equal(bannerShowing({ ...at, creditsAt: 6700, time: 6701 }), false);
  assert.equal(bannerShowing({ ...at, duration: NaN, time: 6001 }), false);
});

test('stinger: the credits card gives the picture back by itself, films with a scene only', () => {
  const base = { kind: 'after', next: false, creditsAt: 6000 };
  assert.equal(cardPutAway({ ...base, time: 6000 }), false);
  assert.equal(cardPutAway({ ...base, time: 6000 + STAY_CARD_SECONDS - 1 }), false);
  assert.equal(cardPutAway({ ...base, time: 6000 + STAY_CARD_SECONDS }), true);
  // Up next showing (an episode), or no scene: the card stays as before
  assert.equal(cardPutAway({ ...base, next: true, time: 7000 }), false);
  assert.equal(cardPutAway({ ...base, kind: null, time: 7000 }), false);
  assert.equal(cardPutAway({ ...base, creditsAt: null, time: 7000 }), false);
});

test('stinger: the credits card shows the line, and shows for a film with a scene even without a song', () => {
  const card = read('public/credits-card.js');
  assert.match(card, /import \{ stayLine, stayIcon, cardPutAway \} from '\.\/stinger\.js'/);
  assert.match(card, /const worth = next \|\| Boolean\(s\.creditsSong\) \|\| Boolean\(stinger\);/);
  assert.match(card, /logo, name, stay, song, slot, back\);/);
  // The song's late re-sync keeps the stinger
  assert.match(card, /stinger: s\.creditsStinger \}\);/);
  const app = read('public/app.js');
  assert.match(app, /stinger: session\.stinger \|\| null \};/);
  assert.match(app, /!tv && stayCredits\.pageNote\(t\.id\)/);
  assert.match(app, /stayCredits\.load\(session, \(\) => updateUpNext\(\)\)/);
  assert.match(app, /stayCredits\.room\(\);/);
  assert.match(app, /stay: stayNote \};/);
  assert.match(read('public/pause-screen.js'), /d\.stay \|\| null\);/);
  assert.match(read('public/index.html'), /<link rel="stylesheet" href="\/stinger\.css">/);
});

// A tiny DOM, enough for createStay.
function el(tag) {
  const node = { tag, props: {}, children: [], hidden: false, listeners: {}, _text: '',
    append(...kids) { for (const k of kids) { this.children.push(k); k.parent = this; } },
    get lastChild() { return this.children[this.children.length - 1]; },
    set innerHTML(v) { this._html = v; },
    get textContent() { return this._text + this.children.map((c) => c.textContent || '').join(''); },
    set textContent(v) { this._text = v; this.children = []; },
    addEventListener(e, fn) { (this.listeners[e] ||= []).push(fn); },
    fire(e) { for (const fn of this.listeners[e] || []) fn(); } };
  return node;
}
function h(tag, props = {}, ...kids) {
  const n = el(tag);
  for (const [k, v] of Object.entries(props || {})) { if (k === 'class') n.className = v; else if (k === 'hidden') n.hidden = Boolean(v); else n.props[k] = v; }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(typeof k === 'object' ? k : Object.assign(el('#text'), { _text: String(k) }));
  return n;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('stinger: the film page note, the room line and the banner (web module)', async () => {
  const pages = { 10: { stinger: 'after' }, 11: { stinger: null }, 12: {} };
  const asked = [];
  const pageInfo = async (type, id) => { asked.push(`${type}/${id}`); return pages[id]; };
  const video = el('video'); video.currentTime = 0; video.duration = 6600;
  const stage = el('div'); const roomHead = el('header');
  let current = null, party = false;
  const stay = createStay({ h, video, stage, pageInfo, current: () => current, inParty: () => party, roomHead: () => roomHead });
  const banner = stage.children[0];
  assert.equal(banner.className, 'stay-banner');
  assert.equal(banner.hidden, true);

  // The film page: shown only with a keyword
  const yes = stay.pageNote(10), no = stay.pageNote(11), unknown = stay.pageNote(12);
  await flush();
  assert.equal(yes.hidden, false);
  assert.equal(yes.textContent, 'Scene after the credits');
  assert.equal(no.hidden, true);
  assert.equal(unknown.hidden, true);
  // Without TMDB nothing is asked
  const off = createStay({ h, video, stage: el('div'), pageInfo, current: () => null, searchOn: () => false });
  const n = asked.length;
  assert.equal(off.pageNote(10).hidden, true);
  assert.equal(asked.length, n);

  // The pause screen's line
  assert.equal(stay.pauseLine(null), null);
  assert.equal(stay.pauseLine('during').textContent, 'Scene during the credits');

  // A film in the player: the kind lands on the session; episodes and clips aren't asked
  let known = 0;
  const episode = { kind: 'lib', show: 's1', season: 1, tmdbId: 10 };
  current = episode; stay.load(episode, () => known++);
  const clip = { kind: 'clip', tmdbId: 10 };
  current = clip; stay.load(clip, () => known++);
  await flush();
  assert.equal(episode.stinger, undefined);
  assert.equal(clip.stinger, undefined);
  const film = { kind: 'lib', tmdbId: 10, creditsAt: 6000 };
  current = film; stay.load(film, () => known++);
  await flush();
  assert.equal(film.stinger, 'after');
  assert.equal(known, 1);
  // A film that's no longer playing when the answer comes keeps nothing
  const gone = { kind: 'lib', tmdbId: 10 };
  current = gone; stay.load(gone); current = film;
  await flush();
  assert.equal(gone.stinger, undefined);

  // Not in a room: no line, no banner
  stay.room();
  assert.equal(roomHead.children.length, 0);
  video.currentTime = 6001; video.fire('timeupdate');
  assert.equal(banner.hidden, true);
  // In a room: the line under the status, and the banner at the credits
  party = true;
  stay.room();
  const line = roomHead.children[0];
  assert.equal(line.className, 'room-stay');
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, 'Stay: there’s a scene after the credits');
  video.fire('timeupdate');
  assert.equal(banner.hidden, false);
  assert.equal(banner.textContent, 'Stay: there’s a scene after the credits');
  video.currentTime = 6000 + BANNER_SECONDS + 1; video.fire('timeupdate');
  assert.equal(banner.hidden, true);
  // Leaving the room hides the line again
  party = false; stay.room();
  assert.equal(line.hidden, true);
});
