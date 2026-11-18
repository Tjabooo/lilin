// First-time watches, round 2 (2026-11-17): one episode from a season pack when there's no lively release of the
// episode alone, never a giant remux to start a film with (the best copy follows), and quick searches that wait for
// the slower sites while what they have is poor. Release names, seeders and sizes are real search results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTpb, settleQuickly, plainQuery } from '../src/torrents.js';
import { startSmartJob, smartJob, packFirst } from '../src/smart-download.js';
import { pickBest, coldStreamable } from '../src/recommend.js';
import { seasonSet } from '../src/season.js';
import { alignEntries } from '../src/anime.js';
import { showKey } from '../src/shows.js';
import { ColdStarts, RATE_SETTLE, COLD_MAX } from '../src/cold-start.js';
import { parseName } from '../src/release-name.js';

const GB = 1024 ** 3;
let n = 0x7000;
const results = (rows) => parseTpb(rows.map(([name, seeders, size = 2 * GB]) => ({
  info_hash: (++n).toString(16).padStart(40, '0'), name, seeders, leechers: 0, size, category: '208', status: 'member', username: `u${n}`,
})), 'all');
const wait = async (id) => {
  for (let i = 0; i < 600 && smartJob(id).state === 'running'; i++) await new Promise((r) => setTimeout(r, 5));
  return smartJob(id);
};
const owned = (list = []) => { const s = new Set(list); s.queued = new Set(); return s; };
const hashOf = (link) => /btih:(\w+)/.exec(link)[1];

// ---------- one episode from a pack ----------
const friendsPacks = results([
  ['Friends (1994) Season 05 S05 (1080p BluRay x265 HEVC 10bit AAC 5.1 Silence)', 350, 5.6 * GB],
  ['Friends S05 720p.BRrip.mrlss.sujaidr (pimprg)', 64, 3.3 * GB],
]);
const notFriends = results([
  ['Rick and Morty S05E08 Rickternal Friendshine of the Spotless Mort 1080p WEB', 19, 0.2 * GB],
  ['Fosters Home For Imaginary Friends S05E08 1080p HMAX WEB-DL DDP2 0 H 264-PH', 3, 1.3 * GB],
]);
const friendsDeps = (over = {}) => {
  const log = { added: [], trims: [], starts: [], queries: [] };
  const deps = {
    parseName, seasonEpisodes: async () => ({ episodes: Array.from({ length: 24 }, (_, i) => ({ episode: i + 1, aired: true })) }),
    haveEpisodes: async () => owned(),
    searchTorrents: async (q, type, opts) => { log.queries.push([q, opts]); return { results: /E08|5x08/.test(q) ? notFriends : /S05|Season 5/.test(q) ? friendsPacks : [] }; },
    addDownload: async ({ link, name }) => { log.added.push(name); return { existing: false, hash: hashOf(link) }; },
    trimPack: async (link, season, others, ctx, opts) => { log.trims.push({ season, others: others.size, only: opts?.only }); return { covered: new Set([8]) }; },
    coldStart: (x) => log.starts.push(x),
    ...over,
  };
  return { deps, log };
};

test('one episode with no release of its own: the season pack, with only that episode, played as a first watch', async () => {
  const { deps, log } = friendsDeps();
  const job = await wait(startSmartJob({ type: 'tv', title: 'Friends', season: 5, episodes: [8], requester: 1, want: { profile: 'balanced' } }, deps));
  assert.equal(job.outcome, 'started');
  assert.equal(job.message, '1 episode on the way');
  assert.deepEqual(log.added, ['Friends (1994) Season 05 S05 (1080p BluRay x265 HEVC 10bit AAC 5.1 Silence)']);
  assert.deepEqual(job.added.map((a) => [a.episode, a.episodes, a.pack]), [[8, [8], true]]);
  assert.equal(log.starts.length, 1);
  const s = log.starts[0];
  assert.deepEqual([s.kind, s.season, s.episode, s.pack], ['episode', 5, 8, true], 'cold-start.js switches the rest of the pack off');
  assert.deepEqual(s.alternatives.map((r) => [r.name, r.pack]), [['Friends S05 720p.BRrip.mrlss.sujaidr (pimprg)', true]], 'the next pack stands by');
  assert.equal(log.trims.length, 0, 'nothing waits for the file list here');
});

test('the same in the background (nobody watching yet): the pack is trimmed to that episode right away', async () => {
  const { deps, log } = friendsDeps({ coldStart: null });
  const job = await wait(startSmartJob({ type: 'tv', title: 'Friends', season: 5, episodes: [8], requester: 1, background: true, want: {} }, deps));
  assert.equal(job.outcome, 'started');
  assert.deepEqual(log.trims, [{ season: 5, others: 23, only: 8 }]);
});

test('a thin release of the episode gives way to a far livelier pack; a lively one is used, the pack standing by', async () => {
  const pack = results([['Show.S01.1080p.WEB.H264-PACK', 300, 8 * GB]]);
  const run = async (single) => {
    const { deps, log } = friendsDeps({ seasonEpisodes: async () => ({ episodes: [1, 2, 3, 4].map((e) => ({ episode: e, aired: true })) }),
      searchTorrents: async (q) => ({ results: /E04|1x04/.test(q) ? results([[`Show.S01E04.1080p.WEB.H264-ONE`, single, 2 * GB]]) : /S01|Season 1/.test(q) ? pack : [] }) });
    await wait(startSmartJob({ type: 'tv', title: 'Show', season: 1, episodes: [4], requester: 1, want: { profile: 'balanced' } }, deps));
    return log;
  };
  const thin = await run(6);
  assert.deepEqual(thin.added, ['Show.S01.1080p.WEB.H264-PACK']);
  assert.deepEqual(thin.starts[0].alternatives.map((r) => [r.name, Boolean(r.pack)]), [['Show.S01E04.1080p.WEB.H264-ONE', false]], 'the single stands by');
  const lively = await run(200);
  assert.deepEqual(lively.added, ['Show.S01E04.1080p.WEB.H264-ONE']);
  assert.equal(lively.starts[0].pack, undefined);
  assert.deepEqual((await lively.starts[0].more()).map((r) => [r.name, r.pack]), [['Show.S01.1080p.WEB.H264-PACK', true]]);
  assert.equal(packFirst({ seeders: 10 }, { seeders: 35 }), false, 'a pack only a little livelier: the episode alone');
  assert.equal(packFirst(null, { seeders: 3 }), true, 'no release of the episode at all: any pack');
});

test('no season pack either: a set of every season, sized per episode across all of them', async () => {
  const set = results([['Friends (1994) Season 1-10 S01-S10 (1080p BluRay x265 HEVC 10bit AAC 5.1 Silence)', 350, 169.5 * GB]]);
  const { deps, log } = friendsDeps({ searchTorrents: async (q) => ({ results: /E08|5x08/.test(q) ? notFriends : /complete/i.test(q) ? set : [] }) });
  const job = await wait(startSmartJob({ type: 'tv', title: 'Friends', season: 5, episodes: [8], requester: 1, want: { profile: 'balanced', maxBytes: 2 * GB } }, deps));
  assert.equal(job.outcome, 'started', '0.7 GB per episode is within the 2 GB limit');
  assert.deepEqual(log.added, ['Friends (1994) Season 1-10 S01-S10 (1080p BluRay x265 HEVC 10bit AAC 5.1 Silence)']);
  assert.equal(log.starts[0].pack, true);
  assert.deepEqual(seasonSet('Lost.S01-S06.1080p.BluRay.x264', 'Lost', 3, parseName), { from: 1, to: 6 });
  assert.equal(seasonSet('Lost.S01-S06.1080p.BluRay.x264', 'Lost', 7, parseName), null);
  assert.equal(seasonSet('Friends (1994) Season 05 S05 (1080p)', 'Friends', 5, parseName), null, 'one season is a season pack');
  assert.equal(seasonSet('Rick and Morty S01-S07', 'Friends', 2, parseName), null);
  assert.equal(seasonSet('[Erai-raws] Show S2 - 05 [1080p]', 'Show', 3, parseName), null, 'season 2 episode 5, not seasons 2 to 5');
  assert.deepEqual(seasonSet('Show S01-10 1080p', 'Show', 3, parseName), { from: 1, to: 10 });
});

test('anime: a thin single episode gives way to the season batch (Jujutsu Kaisen E8, 10 seeders next to 359)', async () => {
  const ctx = (() => {
    const seasons = [{ n: 1, count: 59, start: 1, first: 1, year: null }];
    const entries = alignEntries(seasons, [[['Jujutsu Kaisen'], 24], [['Jujutsu Kaisen 2nd Season'], 23], [['Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen'], 12]]
      .map(([titles, episodes]) => ({ titles, keys: titles.map(showKey), episodes })));
    entries.forEach((x, i) => { if (i > 0) x.keys = x.keys.filter((k) => k !== showKey('Jujutsu Kaisen')); });
    return { v: 3, type: 'tv', id: 95479, title: 'JUJUTSU KAISEN', year: 2020, keys: [showKey('Jujutsu Kaisen')], queryTitles: ['Jujutsu Kaisen'], seasons, entries };
  })();
  const rows = results([
    ['[SubsPlease] Jujutsu Kaisen - 08 (1080p) [7CEEF59C].mkv', 10, 1.4 * GB],
    ['[Judas] Jujutsu Kaisen (Season 1) [1080p][HEVC x265 10bit][Multi-Subs] (Batch)', 359, 9.9 * GB],
  ]);
  const { deps, log } = friendsDeps({ seasonEpisodes: async () => ({ episodes: Array.from({ length: 59 }, (_, i) => ({ episode: i + 1, aired: true })) }),
    searchTorrents: async () => ({ results: rows }) });
  const job = await wait(startSmartJob({ type: 'tv', title: 'JUJUTSU KAISEN', season: 1, episodes: [8], requester: 1, anime: ctx, want: { profile: 'balanced' } }, deps));
  assert.equal(job.outcome, 'started');
  assert.deepEqual(log.added, ['[Judas] Jujutsu Kaisen (Season 1) [1080p][HEVC x265 10bit][Multi-Subs] (Batch)']);
  assert.deepEqual([log.starts[0].pack, log.starts[0].episode], [true, 8]);
});

// ---------- never a giant remux to start with ----------
const br2049 = [
  ['Blade.Runner.2049.2017.PROPER.2160p.US.BluRay.REMUX.HEVC.DTS-HD.MA.TrueHD.7.1.Atmos-FraMeSToR', 222, 78 * GB],
  ['Blade.Runner.2049.2017.1080p.BluRay.REMUX.AVC.DTS-HD.MA.TrueHD.7.1.Atmos-FGT', 113, 40.9 * GB],
  ['Blade.Runner.2049.2017.UHD.BluRay.2160p.DDP.7.1.DV.HDR.x265-hall', 189, 19.2 * GB],
  ['Blade.Runner.2049.2017.2160p.MAX.WEB-DL.DDPA.5.1.DV.HDR.H.265-PiRaTeS', 79, 18.8 * GB],
  ['Blade.Runner.2049.2017.1080p.BluRay.H264.AAC-RARBG', 586, 3.1 * GB],
];
const brWant = { type: 'movie', title: 'Blade Runner 2049', year: 2017, runtime: 164, profile: 'best' };

test('a first watch on Best Quality starts from a copy that can stream; the remux is for later', () => {
  const rows = results(br2049);
  assert.match(pickBest(rows, brWant, parseName).pick.name, /2160p\.US\.BluRay\.REMUX/, 'Best Quality on its own: the remux');
  // A first watch starts on 1080p (H.264 first); the 4K follows as another version (Oliver 2026-11-18).
  assert.equal(pickBest(rows, { ...brWant, cold: true }, parseName).pick.name, 'Blade.Runner.2049.2017.1080p.BluRay.H264.AAC-RARBG');
  assert.equal(pickBest(rows, { ...brWant, cold: true, quality: '2160p' }, parseName).pick.quality, '2160p', 'an exact resolution stays that resolution');
  assert.equal(coldStreamable(rows[0], brWant), false);
  assert.equal(coldStreamable(rows[2], brWant), true);
  // Balanced never drops below 1080p for it: a thin 1080p stays ahead of a quick 720p.
  const thin = results([['Old.Film.1999.1080p.BluRay.x264-GRP', 6, 12 * GB], ['Old.Film.1999.720p.WEB.x264-GRP', 300, 1.2 * GB]]);
  assert.equal(pickBest(thin, { type: 'movie', title: 'Old Film', year: 1999, runtime: 120, profile: 'balanced', cold: true }, parseName).pick.quality, '1080p');
});

test('Download on a film to watch now: the quick copy, and Best Quality’s pick follows once it plays', async () => {
  const rows = results(br2049);
  const starts = [], added = [];
  const deps = (over = {}) => ({ parseName, searchTorrents: async () => ({ results: rows }),
    addDownload: async ({ link, name }) => { added.push(name); return { existing: false, hash: hashOf(link) }; }, coldStart: (x) => starts.push(x), ...over });
  await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 1, want: { profile: 'best', runtime: 164 } }, deps()));
  assert.deepEqual(added, ['Blade.Runner.2049.2017.1080p.BluRay.H264.AAC-RARBG']);
  assert.match(starts[0].better.name, /2160p\.US\.BluRay\.REMUX/);
  // Nobody watching (Save for later): the profile's own pick, as before.
  added.length = 0;
  await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 2, background: true, want: { profile: 'best', runtime: 164 } }, deps({ filmHave: async () => null })));
  assert.match(added[0], /2160p\.US\.BluRay\.REMUX/);
  // A 1080p screen (server.js downloadWant: screen "hd", balanced): 1080p, and nothing sharper follows.
  starts.length = 0;
  await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 3, want: { profile: 'balanced', screen: 'hd', runtime: 164 } }, deps()));
  assert.equal(starts[0].better, undefined);
  // Even when only 4K would be "better" than a quick pick: an hd screen never gets more than 1080p following.
  starts.length = 0;
  await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 4, want: { profile: 'best', screen: 'hd', runtime: 164 } }, deps()));
  assert.equal(starts[0].better, undefined);
});

test('Get a sharper copy: a film here in 1080p gets its best picture as another version, in the background', async () => {
  const rows = results(br2049);
  const starts = [], added = [];
  const deps = (over = {}) => ({ parseName, searchTorrents: async () => ({ results: rows }), filmHave: async () => 'library',
    addDownload: async ({ link, name }) => { added.push(name); return { existing: false, hash: hashOf(link) }; }, coldStart: (x) => starts.push(x), ...over });
  const job = await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 1, lift: '1080p', want: { profile: 'balanced', runtime: 164 } }, deps()));
  assert.equal(job.outcome, 'started');
  assert.match(added[0], /2160p\.US\.BluRay\.REMUX/);
  assert.equal(starts.length, 0, 'nobody waits on it: no cold start');
  assert.match(job.message, /4K version is on its way/);
  // Nothing sharper around: says so, adds nothing.
  added.length = 0;
  const only1080 = results(br2049.filter(([n]) => /1080p/.test(n)));
  const none = await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 2, lift: '1080p', want: { profile: 'balanced', runtime: 164 } },
    deps({ searchTorrents: async () => ({ results: only1080 }) })));
  assert.equal(none.outcome, 'none');
  assert.deepEqual(added, []);
  // A copy still downloading: no second one.
  const busy = await wait(startSmartJob({ type: 'movie', title: 'Blade Runner 2049', year: 2017, requester: 3, lift: '1080p', want: { profile: 'balanced', runtime: 164 } },
    deps({ filmHave: async () => 'downloading' })));
  assert.equal(busy.outcome, 'queued');
});

// ---------- quick searches that wait while the results are poor ----------
const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
test('a quick search waits for the slower sites while nothing good has turned up, up to its patience', async () => {
  const good = (r) => r.seeders >= 20;
  let t0 = Date.now();
  let got = await settleQuickly([later(5, [{ seeders: 30 }]), later(5000, [{ seeders: 900 }])], { grace: 20, wait: 3000, good });
  assert.ok(Date.now() - t0 < 1000, 'something good: the short grace');
  assert.equal(got[1].reason.message, 'still searching');
  t0 = Date.now();
  got = await settleQuickly([later(5, [{ seeders: 2 }]), later(150, [{ seeders: 900 }]), later(5000, [])], { grace: 20, wait: 3000, good });
  assert.deepEqual(got[1].value, [{ seeders: 900 }], 'poor so far: the slower site gets its turn');
  assert.ok(Date.now() - t0 < 1000, '...and once it found something good, no more waiting');
  t0 = Date.now();
  got = await settleQuickly([later(5, [{ seeders: 2 }]), later(5000, [{ seeders: 900 }])], { grace: 20, wait: 200, good });
  assert.ok(Date.now() - t0 >= 190 && Date.now() - t0 < 1500, 'patience runs out');
  t0 = Date.now();
  got = await settleQuickly([later(5, [{ seeders: 2 }]), later(5000, [])], { grace: 20, wait: 3000, good, hurry: later(60) });
  assert.ok(Date.now() - t0 < 1000, 'hurried: what was needed turned up elsewhere');
  // Nothing at all from the quick sites: not for ever either (1337x may be queued behind other searches).
  t0 = Date.now();
  got = await settleQuickly([later(5, []), later(5000, [{ seeders: 900 }])], { grace: 20, wait: 100, empty: 150, good });
  assert.ok(Date.now() - t0 >= 140 && Date.now() - t0 < 1500, 'an empty search ends at its patience');
  assert.equal(got[1].reason.message, 'still searching');
  t0 = Date.now();
  await settleQuickly([later(5, []), later(5000, [])], { grace: 20, wait: 3000, good, hurry: later(40) });
  assert.ok(Date.now() - t0 < 1000, 'an empty search that is hurried ends soon after');
  const plain = await settleQuickly([later(5, []), later(80, [{ seeders: 1 }])], 10);
  assert.deepEqual(plain[1].value, [{ seeders: 1 }], 'without good(): nothing found yet means waiting for the others, as before');
});

test('the Download says what settles each search; names lose their apostrophes for the sites', async () => {
  assert.equal(plainQuery('Grey\'s Anatomy S23E05'), 'Greys Anatomy S23E05');
  assert.equal(plainQuery('Grey’s Anatomy'), 'Greys Anatomy');
  const { deps, log } = friendsDeps();
  const pack = deps.searchTorrents;
  deps.searchTorrents = async (q, type, opts) => { if (/E08|5x08/.test(q)) await later(20); return pack(q, type, opts); }; // (sites take a moment)
  await wait(startSmartJob({ type: 'tv', title: 'Friends', season: 5, episodes: [8], requester: 1, want: {} }, deps));
  const [, epOpts] = log.queries.find(([q]) => /S05E08/.test(q));
  assert.equal(typeof epOpts.good, 'function');
  assert.ok(epOpts.wait > 0 && epOpts.wait <= 20_000);
  assert.ok(epOpts.hurry, 'the episode search hurries once a lively pack is found');
  const [single] = results([['Friends.S05E08.1080p.BluRay.x264-GRP', 40, 1 * GB]]);
  assert.equal(epOpts.good(single), true);
  assert.equal(epOpts.good(notFriends[0]), false, 'another show is no good');
  assert.ok(!log.queries.some(([q]) => /5x08/.test(q)), 'with a lively pack found, other spellings of the number aren’t searched');
  const [, packOpts] = log.queries.find(([q]) => q === 'Friends S05');
  assert.equal(packOpts.good(friendsPacks[0]), true);
  assert.equal(packOpts.good(single), false, 'an episode isn’t a pack');
});

// ---------- cold-start.js: a pack as the pick, and a film's better copy ----------
function world(files) {
  const torrents = new Map(), log = [];
  const add = (hash, meta = true) => torrents.set(hash, { hash, name: `${hash} release`, state: 'downloading', dlspeed: 0, meta });
  add('p');
  const deps = {
    info: async (hashes) => new Map(hashes.filter((h) => torrents.has(h)).map((h) => [h, torrents.get(h)])),
    files: async (t) => (t.meta ? files(t.hash) : []),
    pickFile: (c, t, list) => { const i = list.findIndex((f) => f.name.includes(`E0${c.episode}`)); return i < 0 ? null : i; },
    fake: () => null,
    partial: {
      prewarm: async (id) => { log.push(['prewarm', id]); return { id, size: 2e9, info: null, torrent: { dlspeed: 5e6 } }; },
      drop: async () => {}, readable: () => 2e9, status: () => ({ done: false }),
    },
    addSpare: async (c, r) => { add(r.hash); return { hash: r.hash, name: r.name }; },
    startSpare: async () => {}, stopSpare: async (h) => log.push(['stop', h]),
    prepareSpare: async (hash, list, index) => log.push(['prepare', hash, index]),
    swap: async (c, s, why) => { log.push(['swap', c.hash, s.hash, why]); torrents.delete(c.hash); return true; },
    removeSpare: async (h) => { torrents.delete(h); }, fakeFound: async () => {},
    followUp: async (c) => log.push(['follow', c.kind, c.better?.name ?? null]),
    dropPick: async (c) => log.push(['drop', c.hash]),
    background: async () => [], setLimit: async () => {}, log: { info: () => {}, warn: () => {} },
  };
  return { torrents, log, deps, cold: new ColdStarts(deps), add };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const episodes = (list) => list.map((e) => ({ index: e - 1, name: `Show.S01E0${e}.mkv`, size: 2e9, priority: 1 }));

test('a pack picked for one episode: the rest is switched off before it starts downloading for watching', async () => {
  const w = world(() => episodes([1, 2, 3]));
  w.cold.register({ userId: 1, hash: 'p', name: 'pack', kind: 'episode', season: 1, episode: 2, pack: true });
  await settle();
  await w.cold.round();
  assert.deepEqual(w.log.slice(0, 2), [['prepare', 'p', 1], ['prewarm', 'p-1']]);
  await w.cold.round();
  assert.equal(w.log.filter(([a]) => a === 'prepare').length, 1, 'once');
});

test('a pack without the episode is stopped, then replaced by a spare, or removed so the Download runs again', async () => {
  const w = world((h) => (h === 'p' ? episodes([1, 3]) : [{ index: 0, name: 'Show.S01E02.mkv', size: 2e9, priority: 1 }]));
  w.cold.register({ userId: 1, hash: 'p', name: 'pack', kind: 'episode', season: 1, episode: 2, pack: true, alternatives: [{ hash: 's1', name: 'single' }] });
  await settle();
  await w.cold.round();
  assert.deepEqual(w.log.find(([a]) => a === 'stop'), ['stop', 'p']);
  assert.deepEqual(w.log.find(([a]) => a === 'swap'), ['swap', 'p', 's1', 'the episode isn’t in it']);
  const alone = world(() => episodes([1, 3]));
  alone.cold.register({ userId: 1, hash: 'p', name: 'pack', kind: 'episode', season: 1, episode: 2, pack: true });
  await settle();
  await alone.cold.round();
  assert.deepEqual(alone.log.find(([a]) => a === 'drop'), ['drop', 'p']);
  assert.equal(alone.cold.list().length, 0);
  assert.equal(alone.log.some(([a]) => a === 'follow'), false);
});

test('a film’s better copy is asked for once the quick one plays well; a film without one brings nothing', async () => {
  for (const better of [{ name: 'the remux' }, null]) {
    const w = world(() => [{ index: 0, name: 'Film.2017.mkv', size: 2e9, priority: 1 }]);
    w.deps.pickFile = () => 0;
    w.cold.register({ userId: 1, hash: 'p', name: 'quick copy', kind: 'movie', runtime: 120, better });
    await settle();
    await w.cold.round();
    const c = w.cold.list()[0];
    c.metaAt = Date.now() - RATE_SETTLE - 1;
    c.addedAt -= COLD_MAX;
    await w.cold.round();
    assert.deepEqual(w.log.filter(([a]) => a === 'follow'), better ? [['follow', 'movie', 'the remux']] : []);
  }
});
