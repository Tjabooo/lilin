// Run ON the Lilin server (read-only): does anyone but the test account have these titles in their library or
// watch history? playbench only removes what nobody else holds.
//   node server-holders.mjs DB_PATH TITLES.json TEST_EMAIL
// Prints one line per title: library holders and watch-log entries by other people (counts and user ids).
import fs from 'node:fs';
import { createRequire } from 'node:module';

const [dbPath, titlesFile, testEmail] = process.argv.slice(2);
if (!dbPath || !titlesFile) { console.error('usage: node server-holders.mjs DB_PATH TITLES.json TEST_EMAIL'); process.exit(2); }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
const test = db.prepare('SELECT id FROM users WHERE email = ?').get(String(testEmail || '').toLowerCase())?.id ?? -1;
// "The Dark Knight" -> words that must all appear in a media key / title, in order.
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !['the', 'a', 'of', 'and'].includes(w));
const pattern = (s) => `%${words(s).join('%')}%`;
const sample = db.prepare('SELECT title_key FROM watch_log WHERE title_key IS NOT NULL LIMIT 3').all().map((r) => r.title_key);
console.log(`test account id ${test}; watch_log title_key looks like ${JSON.stringify(sample)}`);
const seen = new Set();
for (const t of JSON.parse(fs.readFileSync(titlesFile, 'utf8'))) {
  const k = `${t.type}:${t.tmdbId}:${t.season ?? ''}:${t.episode ?? ''}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const name = String(t.title || t.query).replace(/\b(19|20)\d\d\b/, '').replace(/\bBron\b/, '').trim();
  const lib = db.prepare('SELECT user_id, media_key FROM library WHERE media_key LIKE ? AND user_id != ?').all(pattern(name), test);
  const keyed = db.prepare('SELECT user_id, title, season, episode FROM watch_log WHERE (title_key = ? OR title_key = ? OR title LIKE ?) AND user_id != ?')
    .all(`${t.type}:${t.tmdbId}`, `${t.type === 'tv' ? 'tv' : 'movie'}-${t.tmdbId}`, pattern(name), test);
  const ep = t.type === 'tv' ? keyed.filter((r) => r.season === t.season && r.episode === t.episode) : keyed;
  const libEp = t.type === 'tv' ? lib.filter((r) => new RegExp(`s0*${t.season}e0*${t.episode}(?!\\d)`, 'i').test(r.media_key)) : lib;
  console.log(`${t.label.padEnd(13)} library: ${libEp.length} (users ${[...new Set(libEp.map((r) => r.user_id))].join(',') || '-'}; title anywhere ${lib.length})  history: ${ep.length} (users ${[...new Set(ep.map((r) => r.user_id))].join(',') || '-'}; title anywhere ${keyed.length})`);
}
