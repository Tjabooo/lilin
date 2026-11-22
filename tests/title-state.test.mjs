// The one title page: buttons by state, one gold button, and nothing the three old pages offered got lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { titleModel, pageState, TITLE_STATES } from '../public/title-model.js';

// Who opens a title: someone who may download, someone who may not, the owner, a restricted member.
const ROLES = {
  dl: { canGet: true, search: true, owner: false, admin: false },
  noDl: { canGet: false, search: true, owner: false, admin: false },
  owner: { canGet: true, search: true, owner: true, admin: true },
  restricted: { canGet: false, search: true, owner: false, admin: false },
};
const base = { mine: 0, preparing: false, play: null, onServer: 0, transfers: 0, playNow: false, tmdb: true, unreleased: false,
  ambiguous: false, anime: false, versions: 0 };
// One fixture per state, for films and shows.
const FIXTURES = {
  notOnLilin: {},
  onServer: { onServer: 3 },
  onItsWay: { transfers: 1, playNow: true },
  onItsWayNoStream: { transfers: 1 },
  preparing: { mine: 1, preparing: true },
  ready: { mine: 2, play: 'resume', versions: 2, anime: true, ambiguous: true },
  readyStart: { mine: 1, play: 'start' },
  caughtUp: { mine: 4, play: null },
  caughtUpMore: { mine: 4, play: null, onServer: 2 },
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

test('states follow the title: yours, preparing, on its way, on the server, coming soon, not here', () => {
  assert.equal(pageState({ ...base, mine: 1 }), 'ready');
  assert.equal(pageState({ ...base, mine: 1, preparing: true }), 'preparing');
  assert.equal(pageState({ ...base, transfers: 1, onServer: 2 }), 'onItsWay');
  assert.equal(pageState({ ...base, onServer: 2, unreleased: true }), 'onServer');
  assert.equal(pageState({ ...base, unreleased: true }), 'unreleased');
  assert.equal(pageState(base), 'notOnLilin');
});

test('Play is the gold button wherever something plays now or can start playing', () => {
  const m = (type, f, r = ROLES.dl) => titleModel({ ...base, ...r, ...f, type });
  assert.equal(m('movie', FIXTURES.ready).primary, 'resume');
  assert.equal(m('movie', FIXTURES.preparing).primary, null, 'Preparing playback… is not lit');
  assert.equal(m('movie', FIXTURES.onItsWay).primary, 'play', 'getting ready: Play opens it');
  assert.equal(m('movie', FIXTURES.onItsWayNoStream).primary, 'play');
  assert.equal(m('movie', FIXTURES.onServer).primary, 'play', 'someone else’s copy plays at once');
  assert.equal(m('movie', FIXTURES.onServer, ROLES.noDl).primary, 'play', 'playing a copy that is here needs no download rights');
  assert.equal(m('movie', FIXTURES.notOnLilin).primary, 'play', 'not here: Play gets it ready');
  assert.equal(m('movie', FIXTURES.notOnLilin, ROLES.noDl).primary, 'save');
  assert.equal(m('movie', FIXTURES.unreleased).primary, 'save', 'no grey Coming soon button: Save is the thing to do');
  assert.equal(m('tv', FIXTURES.unreleased).primary, 'save'); // My list (follow merged into it 2026-11-21)
  assert.equal(m('tv', FIXTURES.ready).primary, 'resume');
  assert.equal(m('tv', FIXTURES.readyStart).primary, 'play');
  assert.equal(m('tv', FIXTURES.caughtUp).primary, 'play', 'caught up: the next episode is fetched');
  assert.equal(m('tv', FIXTURES.caughtUp, ROLES.noDl).primary, null);
  assert.equal(m('tv', FIXTURES.caughtUpMore, ROLES.noDl).primary, 'play');
  assert.equal(m('tv', FIXTURES.onServer, ROLES.noDl).primary, 'play');
  assert.equal(m('tv', FIXTURES.notOnLilin).primary, 'play');
  assert.equal(m('movie', FIXTURES.notOnLilin, { ...ROLES.noDl, search: false }).primary, null, 'nothing to offer without TMDB or downloads');
});

test('nothing lost: every action is reachable in some state, the download tools for the owner', () => {
  const reach = (list) => new Set(list.flatMap(({ model }) => [model.primary, ...model.secondary, ...model.more, ...model.inline]).filter(Boolean));
  const everyone = reach(all), owner = reach(all.filter((x) => x.role === 'owner'));
  for (const id of ['play', 'resume', 'save', 'trailer', 'rate', 'review', 'playOnTv', 'toPhone', 'versions', 'episodes', 'identityNote']) {
    assert.ok(everyone.has(id), `${id} is reachable`);
  }
  for (const id of ['download', 'addSeason', 'delete', 'identify', 'advanced', 'getVersion', 'details']) assert.ok(owner.has(id), `owner: ${id}`);
});

test('members never meet a download tool: no Add, Download, Delete or transfer details', () => {
  const tools = ['download', 'add', 'addAll', 'addPlay', 'playNow', 'moreEpisodes', 'addSeason', 'advanced', 'getVersion', 'details', 'delete', 'identify'];
  for (const { role, type, name, model } of all) {
    if (role === 'owner') continue;
    for (const id of [model.primary, ...model.secondary, ...model.more, ...model.inline]) assert.ok(!tools.includes(id), `${role} ${type} ${name}: ${id}`);
  }
});

test('only the owner identifies films; restricted and no-download people never get download actions', () => {
  for (const { role, model } of all) {
    const acts = [model.primary, ...model.secondary, ...model.more];
    if (role !== 'owner') assert.ok(!acts.includes('identify'), role);
    if (role === 'noDl' || role === 'restricted') for (const id of ['download', 'moreEpisodes', 'advanced', 'getVersion']) assert.ok(!acts.includes(id), `${role}: ${id}`);
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
