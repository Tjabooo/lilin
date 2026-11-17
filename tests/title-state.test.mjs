// The one title page: buttons by state, one gold button, and nothing the three old pages offered got lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { titleModel, pageState, TITLE_STATES } from '../public/title-model.js';

// Who opens a title: someone who may download, someone who may not, the owner, a restricted member.
const ROLES = {
  dl: { canGet: true, search: true, owner: false },
  noDl: { canGet: false, search: true, owner: false },
  owner: { canGet: true, search: true, owner: true },
  restricted: { canGet: false, search: true, owner: false },
};
const base = { mine: 0, preparing: false, play: null, onServer: 0, transfers: 0, playNow: false, tmdb: true, unreleased: false,
  leaving: false, keep: false, expires: false, ambiguous: false, anime: false, versions: 0 };
// One fixture per state, for films and shows.
const FIXTURES = {
  notOnLilin: {},
  onServer: { onServer: 3 },
  onItsWay: { transfers: 1, playNow: true },
  onItsWayNoStream: { transfers: 1 },
  preparing: { mine: 1, preparing: true, expires: true, keep: true },
  ready: { mine: 2, play: 'resume', expires: true, keep: true, versions: 2, anime: true, ambiguous: true },
  readyStart: { mine: 1, play: 'start' },
  caughtUp: { mine: 4, play: null },
  caughtUpMore: { mine: 4, play: null, onServer: 2 },
  leavingSoon: { mine: 1, play: 'play', leaving: true, expires: true, keep: true },
  unreleased: { unreleased: true },
  anime: { anime: true },
};
const all = [];
for (const type of ['movie', 'tv']) for (const [role, r] of Object.entries(ROLES)) for (const [name, f] of Object.entries(FIXTURES)) {
  all.push({ type, role, name, model: titleModel({ ...base, ...r, ...f, type }) });
}

test('every state has at most one primary (gold) button, and it is never repeated as a chip or in the menu', () => {
  for (const { type, role, name, model } of all) {
    const where = `${type} ${role} ${name}`;
    assert.ok(TITLE_STATES.includes(model.state), where);
    assert.ok(model.primary === null || typeof model.primary === 'string', where);
    assert.ok(!model.secondary.includes(model.primary) && !model.more.includes(model.primary), `${where}: ${model.primary} twice`);
    assert.ok(model.secondary.length <= 4, `${where}: ${model.secondary.length} chips`);
    assert.equal(new Set([...model.secondary, ...model.more]).size, model.secondary.length + model.more.length, `${where}: an action twice`);
  }
});

test('states follow the title: yours, preparing, leaving soon, on its way, on the server, coming soon, not here', () => {
  assert.equal(pageState({ ...base, mine: 1 }), 'ready');
  assert.equal(pageState({ ...base, mine: 1, preparing: true }), 'preparing');
  assert.equal(pageState({ ...base, mine: 1, leaving: true }), 'leavingSoon');
  assert.equal(pageState({ ...base, transfers: 1, onServer: 2 }), 'onItsWay');
  assert.equal(pageState({ ...base, onServer: 2, unreleased: true }), 'onServer');
  assert.equal(pageState({ ...base, unreleased: true }), 'unreleased');
  assert.equal(pageState(base), 'notOnLilin');
});

test('the gold button is the one thing to do in each state', () => {
  const m = (type, f, r = ROLES.dl) => titleModel({ ...base, ...r, ...f, type });
  assert.equal(m('movie', FIXTURES.ready).primary, 'resume');
  assert.equal(m('movie', FIXTURES.leavingSoon).primary, 'play');
  assert.equal(m('movie', FIXTURES.preparing).primary, null, 'Preparing playback… is not lit');
  assert.equal(m('movie', FIXTURES.onItsWay).primary, 'playNow');
  assert.equal(m('movie', FIXTURES.onItsWayNoStream).primary, null);
  assert.equal(m('movie', FIXTURES.onServer).primary, 'addPlay');
  assert.equal(m('movie', FIXTURES.onServer, ROLES.noDl).primary, 'addPlay', 'adding needs no download rights');
  assert.equal(m('movie', FIXTURES.notOnLilin).primary, 'download');
  assert.equal(m('movie', FIXTURES.notOnLilin, ROLES.noDl).primary, 'save');
  assert.equal(m('movie', FIXTURES.unreleased).primary, 'save', 'no grey Coming soon button: Save is the thing to do');
  assert.equal(m('tv', FIXTURES.unreleased).primary, 'follow');
  assert.equal(m('tv', FIXTURES.ready).primary, 'resume');
  assert.equal(m('tv', FIXTURES.readyStart).primary, 'play');
  assert.equal(m('tv', FIXTURES.caughtUp).primary, 'moreEpisodes');
  assert.equal(m('tv', FIXTURES.caughtUp, ROLES.noDl).primary, null);
  assert.equal(m('tv', FIXTURES.caughtUpMore, ROLES.noDl).primary, 'addAll');
  assert.equal(m('tv', FIXTURES.onServer, ROLES.noDl).primary, 'addAll');
  assert.equal(m('tv', FIXTURES.notOnLilin).primary, 'download');
  assert.equal(m('movie', FIXTURES.notOnLilin, { ...ROLES.noDl, search: false }).primary, null, 'nothing to offer without TMDB or downloads');
});

test('nothing lost: every action of the three old title pages is reachable in some state', () => {
  const reach = new Set(all.flatMap(({ model }) => [model.primary, ...model.secondary, ...model.more, ...model.inline]).filter(Boolean));
  // Play, Resume, Play now, Download (Add to library), Add, Add & play, Add season, Save, Follow, Trailer, Rate/Review,
  // Play on TV, To phone, Delete, Keep longer, Identify, Advanced options, Dubbed, versions, Download details, More episodes
  for (const id of ['play', 'resume', 'playNow', 'download', 'add', 'addPlay', 'addSeason', 'addAll', 'save', 'follow', 'trailer', 'rate', 'review',
    'playOnTv', 'toPhone', 'delete', 'keep', 'identify', 'advanced', 'getVersion', 'dubbed', 'versions', 'details', 'moreEpisodes', 'episodes', 'audio', 'identityNote']) {
    assert.ok(reach.has(id), `${id} is reachable`);
  }
});

test('only the owner identifies films; restricted and no-download people never get download actions', () => {
  for (const { role, model } of all) {
    const acts = [model.primary, ...model.secondary, ...model.more];
    if (role !== 'owner') assert.ok(!acts.includes('identify'), role);
    if (role === 'noDl' || role === 'restricted') for (const id of ['download', 'moreEpisodes', 'advanced', 'getVersion', 'dubbed']) assert.ok(!acts.includes(id), `${role}: ${id}`);
  }
});

test('app.js draws every action the model can name, with one .play-btn on the page', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('// ---------- the title page'), end = app.indexOf('// ---------- end of the title page');
  assert.ok(start > 0 && end > start, 'the title page block');
  const block = app.slice(start, end);
  const named = new Set(all.flatMap(({ model }) => [model.primary, ...model.secondary, ...model.more]).filter(Boolean));
  for (const id of named) assert.match(block, new RegExp(`\\b${id}: `), `TITLE_ACTIONS.${id}`);
  for (const gone of ['function renderDetails(', 'function renderFilm(', 'function renderShow(', 'function episodeBrowser(', 'function episodeItem(', 'function keepBar(']) {
    assert.ok(!app.includes(gone), `${gone} is merged into renderTitle`);
  }
  for (const wrapper of ['function openDetails(', 'function openFilm(', 'function openShow(']) assert.ok(app.includes(wrapper), `${wrapper} stays for its callers`);
});
