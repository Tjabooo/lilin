// lines: quote search. Type a line you half remember ("I drink your milkshake", "pivot") and find the films and
// episodes on the server where it's said, with the lines around it; a tap plays from just before it.
//
// The index is every subtitle line saved beside the videos (the same .srt files the player shows, so their timing
// is the corrected one), in a SQLite FTS5 table of its own: CACHE_DIR/lines.db, rebuildable, never backed up.
// Languages: English, Swedish, and each person's default subtitle and app language (a remux can carry twenty
// subtitle tracks; nobody quotes the Hungarian one). A background round every 15 minutes reads only what changed
// (path, size or modification time of the .srt), one file at a time with a pause in between, and forgets videos
// that left the server. Lines that are only a sound ([door slams], ♪) aren't kept.
//
// A search reads matching lines from FTS5 (the phrase first, the last word as a prefix so it finds while you type,
// then all the words in any order), scores them in JS (the exact phrase beats a prefix beats loose words, a line
// that is mostly the quote beats one where it's buried, the viewer's subtitle language first), keeps one language
// per video and returns the best line per video with the lines just before and after, and when else it's said.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const VERSION = 1; // bump when parsing or the schema changes: the index is rebuilt from the files
const FIRST_ROUND_MS = 90_000;
const ROUND_MS = 15 * 60_000;
const PAUSE_MS = 100; // between two subtitle files, so playback and pages stay quick while the index fills
const MAX_ROWS = 800; // matching lines read per query
const CONTEXT_MS = 8000; // a neighbouring line counts as "around it" within this much
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- subtitles (pure) ----------
// Bytes → text: UTF-16 by its BOM, else UTF-8, falling back to Windows-1252 (like subtitles.js).
export function decodeSubtitle(buf) {
  let s;
  if (buf[0] === 0xff && buf[1] === 0xfe) s = buf.toString('utf16le');
  else if (buf[0] === 0xfe && buf[1] === 0xff) s = new TextDecoder('utf-16be').decode(buf);
  else {
    s = buf.toString('utf8');
    if (s.includes('�')) s = new TextDecoder('windows-1252').decode(buf);
  }
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const ms = (m) => ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0'));
// What a line says on screen: tags, ASS overrides and translator {comments} gone, one space between words, the
// dialogue dashes kept. Empty for a line that is only a sound or music.
const SOUND_ONLY = /^(?:[\s\-–—]*(?:\[[^\]]*\]|\([^)]*\)|♪+|#+))+[\s.!?♪#]*$/;
export function lineText(raw) {
  const text = String(raw || '')
    .replace(/\{\\[^}]*\}/g, '').replace(/\{[^}]*\}/g, '').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/\\N/g, '\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  if (!text || SOUND_ONLY.test(text.replace(/\n/g, ' '))) return '';
  return text.replace(/[ \t]+/g, ' ');
}
// SRT → [{ start, end (ms), text }], sorted, without empty and sound-only lines.
export function parseSrt(text) {
  const out = [];
  for (const block of String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const rows = block.split('\n');
    const at = rows.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = rows[at].split('-->');
    const ma = TIME.exec(a), mb = TIME.exec(b || '');
    if (!ma || !mb) continue;
    const start = ms(ma), end = ms(mb);
    const said = lineText(rows.slice(at + 1).join('\n'));
    if (!said || end < start) continue;
    // One two-line subtitle split into two cues with the same timing is one line (as srtToVtt shows it).
    const prev = out[out.length - 1];
    if (prev && prev.start === start && prev.end === end) prev.text += `\n${said}`;
    else out.push({ start, end, text: said });
  }
  return out.sort((x, y) => x.start - y.start);
}

// ---------- finding the files (pure) ----------
// Which saved subtitle to read per language for one video: "<stem>.<lang>.srt" (the one the player shows) first,
// then a full one ("<stem>.en.sdh.srt"), then a forced or AI-made one only when that's all there is.
export function pickSidecars(entries, stem, langs) {
  const base = String(stem).toLowerCase();
  const picks = new Map();
  for (const lang of langs) {
    const prefix = `${base}.${lang}.`;
    const hits = entries.filter((e) => { const l = e.toLowerCase(); return l.startsWith(prefix) && l.endsWith('.srt'); });
    if (!hits.length) continue;
    const rank = (e) => {
      const l = e.toLowerCase();
      if (l === `${prefix}srt`) return 0;
      if (/\.ai\.srt$/.test(l)) return 3;
      return /\.forced\./.test(l) ? 2 : 1;
    };
    picks.set(lang, hits.sort((x, y) => rank(x) - rank(y) || x.length - y.length)[0]);
  }
  return picks;
}

// ---------- matching (pure) ----------
// Words the way FTS5's unicode61 tokenizer (remove_diacritics 2) sees them: lower case, accents gone, split on
// anything that isn't a letter or a digit ("I'm" is "i" "m", in the query and in the lines alike).
export const words = (s) => (String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);

// The FTS5 queries for what someone typed: the phrase (last word as a prefix, so "i drink your milk" already
// finds it) and all the words in any order. null when there's too little to look for.
export function ftsQueries(q) {
  const w = words(q).slice(0, 12);
  if (!w.length || w.join('').length < 3 || (w.length === 1 && w[0].length < 3)) return null;
  const last = w[w.length - 1];
  const prefix = last.length >= 2 ? '*' : '';
  return {
    words: w, prefix: Boolean(prefix),
    phrase: `"${w.join(' ')}"${prefix}`,
    all: w.length > 1 ? w.map((x, i) => `"${x}"${i === w.length - 1 ? prefix : ''}`).join(' ') : null,
  };
}

// How well one line matches: 3 = the exact phrase, 2.6 = the phrase with the last word still being typed,
// 1.5 = every word somewhere; plus up to 0.6 for how much of the line the quote is; 0 = not a match.
export function scoreLine(text, qWords, prefix = true) {
  const tw = words(text);
  if (!tw.length || !qWords.length) return 0;
  const n = qWords.length;
  const same = (a, b, last) => a === b || (last && prefix && a.startsWith(b));
  let best = 0;
  for (let i = 0; i + n <= tw.length; i++) {
    let ok = true, exact = true;
    for (let j = 0; j < n && ok; j++) {
      const last = j === n - 1;
      if (!same(tw[i + j], qWords[j], last)) ok = false;
      else if (tw[i + j] !== qWords[j]) exact = false;
    }
    if (ok) { best = Math.max(best, exact ? 3 : 2.6); if (exact) break; }
  }
  if (!best) {
    const all = qWords.every((w, j) => tw.some((t) => same(t, w, j === n - 1)));
    if (!all) return 0;
    best = 1.5;
  }
  return best + 0.6 * Math.min(1, n / tw.length);
}

// rows: [{ id, key, lang, start, end, text }] → videos, best first: [{ key, lang, score, count, best: row,
// times: [ms] }]. langs: the viewer's languages, most wanted first. One language per video.
export function rankVideos(rows, qWords, { prefix = true, langs = [], limit = 20 } = {}) {
  const bonus = (lang) => { const i = langs.indexOf(lang); return i < 0 ? 0 : Math.max(0, 0.4 - i * 0.2); };
  const byKey = new Map();
  for (const r of rows) {
    const s = scoreLine(r.text, qWords, prefix);
    if (!s) continue;
    const score = s + bonus(r.lang);
    const perLang = byKey.get(r.key) || new Map();
    const g = perLang.get(r.lang) || { key: r.key, lang: r.lang, score: 0, best: null, rows: [] };
    g.rows.push(r);
    if (score > g.score || (score === g.score && r.start < g.best.start)) { g.score = score; g.best = r; }
    perLang.set(r.lang, g);
    byKey.set(r.key, perLang);
  }
  const videos = [];
  for (const perLang of byKey.values()) {
    const g = [...perLang.values()].sort((a, b) => b.score - a.score || bonus(b.lang) - bonus(a.lang))[0];
    // Same-timed duplicates (a line split in two cues) count once.
    const times = [...new Set(g.rows.map((r) => r.start))].sort((a, b) => a - b);
    videos.push({ key: g.key, lang: g.lang, count: times.length, best: g.best, times,
      score: g.score + 0.15 * Math.log2(times.length) });
  }
  return videos.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit);
}

// ---------- the index ----------
export function createQuoteSearch({ cacheDir, library, languages = () => ['en'], clean = null, log = () => {} } = {}) {
  let db = null;
  let timer = null, running = null;
  const progress = { total: 0, done: 0, at: 0 };

  function open() {
    if (db) return db;
    fs.mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, 'lines.db');
    db = new DatabaseSync(file);
    if (db.prepare('PRAGMA user_version').get().user_version !== VERSION) {
      db.close();
      for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
      db = new DatabaseSync(file);
    }
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY, media_key TEXT NOT NULL, lang TEXT NOT NULL, srt TEXT NOT NULL,
        size INTEGER NOT NULL, mtime INTEGER NOT NULL, lines INTEGER NOT NULL DEFAULT 0, first_id INTEGER, last_id INTEGER,
        indexed_at INTEGER NOT NULL, UNIQUE (media_key, lang));
      CREATE TABLE IF NOT EXISTS cues (id INTEGER PRIMARY KEY, source INTEGER NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS cues_fts USING fts5(text, content='cues', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS cues_ai AFTER INSERT ON cues BEGIN INSERT INTO cues_fts(rowid, text) VALUES (new.id, new.text); END;
      CREATE TRIGGER IF NOT EXISTS cues_ad AFTER DELETE ON cues BEGIN INSERT INTO cues_fts(cues_fts, rowid, text) VALUES ('delete', old.id, old.text); END;
      PRAGMA user_version = ${VERSION};`);
    return db;
  }

  // A source's lines go (a source's ids are one unbroken range: it is written in one transaction).
  function dropLines(src) {
    if (src.first_id != null) db.prepare('DELETE FROM cues WHERE id BETWEEN ? AND ? AND source = ?').run(src.first_id, src.last_id, src.id);
  }
  function forget(src) {
    db.exec('BEGIN');
    try { dropLines(src); db.prepare('DELETE FROM sources WHERE id = ?').run(src.id); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  async function indexFile({ key, lang, srt }, st, old) {
    let text = decodeSubtitle(await fs.promises.readFile(srt));
    if (clean) { try { text = clean(text, srt, lang) ?? text; } catch (e) { log(`couldn’t tidy ${path.basename(srt)}: ${e.message}`); } }
    const cues = parseSrt(text);
    open();
    db.exec('BEGIN');
    try {
      if (old) { dropLines(old); db.prepare('DELETE FROM sources WHERE id = ?').run(old.id); }
      const { lastInsertRowid } = db.prepare('INSERT INTO sources (media_key, lang, srt, size, mtime, indexed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(key, lang, srt, st.size, Math.round(st.mtimeMs), Date.now());
      const sourceId = Number(lastInsertRowid);
      const add = db.prepare('INSERT INTO cues (source, start, end, text) VALUES (?, ?, ?, ?)');
      let first = null, last = null;
      for (const c of cues) {
        const id = Number(add.run(sourceId, c.start, c.end, c.text).lastInsertRowid);
        if (first == null) first = id;
        last = id;
      }
      db.prepare('UPDATE sources SET lines = ?, first_id = ?, last_id = ? WHERE id = ?').run(cues.length, first, last, sourceId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return cues.length;
  }

  // One pass over the library: new and changed subtitle files are read, ones that are gone are forgotten.
  async function roundNow() {
    const items = (await library()) || [];
    if (!items.length) return { indexed: 0, removed: 0 }; // the media drive is away (or nothing's there yet): keep what we have
    open();
    const langs = [...new Set([...(languages() || [])].map((l) => String(l || '').toLowerCase()).filter((l) => /^[a-z]{2,3}(-[a-z]{2})?$/.test(l)))];
    const byDir = new Map();
    for (const i of items) {
      if (!i?.key || !i.file) continue;
      const dir = path.dirname(i.file);
      byDir.set(dir, [...(byDir.get(dir) || []), i]);
    }
    const todo = [], unreadable = new Set();
    for (const [dir, list] of byDir) {
      let entries;
      try { entries = await fs.promises.readdir(dir); } catch { for (const i of list) unreadable.add(i.key); continue; }
      for (const i of list) {
        for (const [lang, name] of pickSidecars(entries, path.basename(i.file, path.extname(i.file)), langs)) todo.push({ key: i.key, lang, srt: path.join(dir, name) });
      }
    }
    const existing = new Map(db.prepare('SELECT * FROM sources').all().map((s) => [`${s.media_key}|${s.lang}`, s]));
    const keep = new Set();
    Object.assign(progress, { total: todo.length, done: 0 });
    let indexed = 0;
    for (const t of todo) {
      const old = existing.get(`${t.key}|${t.lang}`);
      const st = await fs.promises.stat(t.srt).catch(() => null);
      if (!st) { if (old) keep.add(old.id); progress.done++; continue; }
      if (old) keep.add(old.id);
      if (old && old.srt === t.srt && old.size === st.size && old.mtime === Math.round(st.mtimeMs)) { progress.done++; continue; }
      try { await indexFile(t, st, old); indexed++; } catch (e) { log(`couldn’t read ${path.basename(t.srt)}: ${e.message}`); }
      progress.done++;
      await sleep(PAUSE_MS);
    }
    // Gone: subtitles (or videos) no longer there. A library that suddenly shrank by half is more likely a hiccup
    // (a drive or qBittorrent away) than a clear-out, so nothing is forgotten that round.
    const keys = new Set(items.map((i) => i.key));
    const indexedKeys = new Set([...existing.values()].map((s) => s.media_key));
    let removed = 0;
    if (keys.size * 2 >= indexedKeys.size) {
      for (const s of existing.values()) {
        if (keep.has(s.id) || unreadable.has(s.media_key)) continue;
        forget(s);
        removed++;
      }
    }
    progress.at = Date.now();
    if (indexed || removed) log(`${indexed} subtitle file${indexed === 1 ? '' : 's'} read, ${removed} forgotten; ${count()} in the index`);
    return { indexed, removed };
  }
  function round() {
    if (!running) running = roundNow().catch((e) => { log(`index round failed: ${e.message}`); return { indexed: 0, removed: 0 }; }).finally(() => { running = null; });
    return running;
  }

  const count = () => (db ? db.prepare('SELECT count(*) AS n FROM sources WHERE lines > 0').get().n : 0);

  // q: what was typed; items: the videos this person may find (key, id, title…, from the server's library);
  // langs: their languages, most wanted first.
  function search(q, { items = [], langs = [], limit = 20 } = {}) {
    const fts = ftsQueries(q);
    if (!fts || !db) return [];
    const allowed = new Map(items.filter((i) => i?.key).map((i) => [i.key, i]));
    if (!allowed.size) return [];
    const read = db.prepare(`SELECT c.id, c.source, c.start, c.end, c.text, s.media_key AS key, s.lang
      FROM cues_fts JOIN cues c ON c.id = cues_fts.rowid JOIN sources s ON s.id = c.source WHERE cues_fts MATCH ? LIMIT ${MAX_ROWS}`);
    const seen = new Set(), rows = [];
    for (const query of [fts.phrase, fts.all].filter(Boolean)) {
      let found = [];
      try { found = read.all(query); } catch (e) { log(`search “${query}” failed: ${e.message}`); }
      for (const r of found) if (!seen.has(r.id) && allowed.has(r.key)) { seen.add(r.id); rows.push(r); }
      if (new Set(rows.map((r) => r.key)).size >= limit) break; // enough films and episodes with the phrase itself
    }
    const around = db.prepare('SELECT id, start, end, text FROM cues WHERE id BETWEEN ? AND ? AND source = ? ORDER BY id');
    return rankVideos(rows, fts.words, { prefix: fts.prefix, langs, limit }).map((v) => {
      const b = v.best;
      const near = around.all(b.id - 3, b.id + 3, b.source);
      const before = near.filter((c) => c.id < b.id && c.text !== b.text && c.end >= b.start - CONTEXT_MS).at(-1);
      const after = near.find((c) => c.id > b.id && c.text !== b.text && c.start <= b.end + CONTEXT_MS);
      return { ...allowed.get(v.key), key: v.key, lang: v.lang, count: v.count,
        line: { at: b.start / 1000, end: b.end / 1000, text: b.text, before: before?.text || null, after: after?.text || null },
        times: v.times.slice(0, 8).map((t) => t / 1000) };
    });
  }

  return {
    start() {
      if (timer) return;
      try { open(); } catch (e) { log(`the index couldn’t open: ${e.message}`); return; }
      timer = setTimeout(function tick() { round().finally(() => { timer = setTimeout(tick, ROUND_MS); timer.unref?.(); }); }, FIRST_ROUND_MS);
      timer.unref?.();
    },
    stop() { clearTimeout(timer); timer = null; },
    close() { clearTimeout(timer); timer = null; db?.close(); db = null; },
    round,
    search,
    ready: () => count() > 0,
    status: () => ({ files: count(), indexing: Boolean(running), total: progress.total, done: progress.done, at: progress.at || null }),
  };
}
