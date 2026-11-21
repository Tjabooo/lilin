// The simplified Download experience: one command, no release lists or quality rails by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
const between = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const page = between('// ---------- the title page', '// ---------- end of the title page');
const ui = between('// ---------- Download: you choose what', '// ---------- casting: device picker');

test('title sheets offer Play / Download, never a release list, quality rail or second search', () => {
  assert.match(page, /filmActions\(t, \{ stateOf: c\.stateOf \}\)/);
  assert.match(page, /showDownload\(t, \{ season: [\s\S]*?, onAdded: \(\) => updateOpenTitle\(\)/);
  assert.doesNotMatch(app, /seasonStrip|bestDownload|getSeason\(|Get only missing episodes|Find another release|api\/torrents\/recommend|api\/downloads\/season/);
  assert.equal((app.match(/openTorrents\(/g) || []).length, 2, 'only the Find torrents sheet itself and its button');
});

test('a film downloads with one press; a show uses the minimal season panel', () => {
  assert.match(ui, /get\.addEventListener\('click', async \(\) => \{[\s\S]*?return start\(\);/);
  assert.match(ui, /runDownloadCommand\(body\(\)\)/);
  assert.match(ui, /api\('\/api\/downloads\/smart', jsonPost\(\{ \.\.\.body, screen: screenClass\(\) \}\)\)/, 'every download says what screen it is for');
  for (const text of ['\'Season\'', 'Lilin picks a good copy of the season and skips episodes you already have.',
    'Add Season', 'Advanced options', 'This season is ready to watch', 'The rest are on their way', 'Retry unavailable']) assert.ok(ui.includes(text), text);
  assert.doesNotMatch(ui, /Balanced · 1080p|savedProfile|downloadProfile/, 'no Quality setting: the screen decides');
  assert.match(ui, /'aria-expanded': String\(ps\.open\), 'aria-controls': panelId/);
  assert.match(ui, /if \(e\.detail === 0\) seasonSel\.focus\(\)/, 'keyboard opens straight onto Season');
});

test('a show someone else already has joins your library in one press, every season, in batches the API accepts', () => {
  assert.match(ui, /const extra = serverOnlyEpisodes\(titleState\(t\)\);\s+if \(extra\.length\) return addEverything\(extra\);\s+ps\.open = !ps\.open;/, 'adds before any panel opens');
  assert.match(ui, /function serverOnlyEpisodes\(s, season = null\)/);
  assert.match(ui, /const ADD_BATCH = 400;/);
  assert.match(ui, /files\.slice\(i, i \+ ADD_BATCH\)/);
  assert.match(page, /tools && serverOnly\.length > 0 && \[icon\('plus'\), T\('Add season'\), async \(\) => \{ try \{ await addFromServer\(serverOnly\); \}/, 'the owner’s season ⋯ adds what’s here in the same batches');
  assert.match(app, /try \{ await addIds\(files\); \}/);
  assert.match(ui, /addingAll \? T\('Adding…'\)/);
});

test('manual releases and an exact resolution only appear inside Advanced options', () => {
  const adv = between('function advancedOptions(', '// Films: Play when');
  assert.match(adv, /h\('details', \{ class: 'advanced' \}/);
  assert.match(adv, /torrentBrowser\(browse\(\)\)/);
  assert.match(adv, /Exact quality/);
});

test('play first: members only ever meet Play; transfers and their numbers are the owner’s', () => {
  assert.doesNotMatch(css, /\.transfer-stats/);
  assert.doesNotMatch(app, /function episodeDownload\(|function makeUnifiedCard\(/, 'no Add on episodes, no Library grid');
  assert.match(page, /onclick: \(e\) => playTitle\(x, e\.currentTarget\)/, 'pressing an episode plays it, here or fetched');
  assert.match(ui, /const progress = tools \? transferSummary\(/, 'a film’s download card is the owner’s');
  assert.match(page, /tv && state\.status\.admin && transferSummary\(/, 'a show’s too');
  assert.match(ui, /get\.hidden = true;/, 'no Add to library button: Play does it');
});

test('Settings has one Downloads group: automatic quality, size limit, audio language', () => {
  const settings = between('function renderSettings() {', 'function ownerSettings()');
  assert.doesNotMatch(settings, /downloadProfile/);
  assert.match(settings, /settingsRow\(T\('Quality'\), sharpScreen\(\)/);
  assert.match(settings, /saveMe\(\{ maxSize: Number\(v\) \}\)/);
  assert.match(settings, /saveMe\(\{ audioLang: v \}\)/);
  assert.doesNotMatch(settings, /Preferred quality/);
});

test('no Dubbed choice anywhere: the dub is fetched and added to the episode by itself (dub-graft.js)', () => {
  assert.doesNotMatch(app, /function audioChoice\(|dubBtn|chooseDub|showDubbed|T\('Dubbed'\)|T\('Add dubbed'\)/);
  assert.doesNotMatch(app, /dub: dub\.dubbing\(\)/, 'requests never ask for dual audio themselves');
  assert.doesNotMatch(css, /dl-audio-hint/);
});

test('Upgrade quality sits with the season and in the player, not in the add panel', () => {
  assert.doesNotMatch(between('function showDownload(', '// Upgrade quality: the season is here'), /Upgrade quality|upgrade: true/);
  assert.match(page, /upgradeState\(tvT, n\)\.run\(\)/, 'Upgrade quality is in the season’s ⋯');
  const menu = between('function renderQualityMenu() {', '// Another version of what');
  assert.match(menu, /qualityBtn\.hidden = !stream && !vers && !upgrade/, 'the menu opens for the upgrade alone');
  assert.match(menu, /quality-upgrade/);
});
