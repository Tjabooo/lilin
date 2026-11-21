// MAGIc search: find a film or show from what someone half-remembers ("teacher makes meth with his
// student" → Breaking Bad). Three steps:
//   1. a language model names candidates (title, year, film or series) from the description;
//   2. TMDB looks each one up, so only real titles with posters come back (made-up ones drop out);
//   3. the model reads the real TMDB descriptions next to what was asked and scores each one, which
//      fixes step 1's ordering (a small model's first guess is often a near miss with the right
//      answer third).
// The model is any OpenAI-compatible server (the subtitle proofreader's by default, subllm.js).
// Answers are cached per wording and language for a day; one search runs at a time (one GPU).

const CANDIDATES = 10;
const SHOWN = 8;
const CACHE_MS = 24 * 3600 * 1000;

const LANGUAGE_NAMES = { sv: 'Swedish', en: 'English' };

export const normalizeQuery = (q) => String(q || '').replace(/\s+/g, ' ').trim().slice(0, 300);

export function candidatePrompt() {
  return [
    'You identify films and TV shows from what someone half-remembers: bits of plot, a scene, an actor, the era, the country, the mood.',
    'Think about which real titles fit ALL the details they give, then answer with JSON only:',
    '{"results":[{"title":"...","year":2008,"type":"movie" or "tv"}]}',
    `Up to ${CANDIDATES} titles, the most likely first. Only real, released titles; their English release title (original title if there is none).`,
    'Include near misses too (similar plots, remakes, the same story as film and series): a later step checks them.',
  ].join('\n');
}

export function judgePrompt(lang = 'en') {
  const language = LANGUAGE_NAMES[lang] || 'English';
  return [
    'Someone describes a film or TV show they are trying to find. Below are candidates with their real descriptions.',
    'Score each candidate 0-100 for how likely it is THE title they mean: 90+ when the details clearly match, 50 when it fits only partly, under 20 when it does not fit.',
    'Usually only one title is the answer; score the others low even if they share a theme.',
    `For each, give "why": one short line in ${language} (max 14 words) linking their words to the title, no spoilers beyond what they said.`,
    'Answer with JSON only: {"1":{"match":95,"why":"..."},"2":{"match":10,"why":"..."}}',
  ].join('\n');
}

// The model's answer → [{ title, year, type }], cleaned and without duplicates.
export function parseCandidates(answer) {
  const list = Array.isArray(answer?.results) ? answer.results : Array.isArray(answer) ? answer : [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const title = String(c?.title || c?.name || '').trim().slice(0, 120);
    if (!title) continue;
    const year = Number(c.year) >= 1880 && Number(c.year) <= 2100 ? Number(c.year) : null;
    const type = /^(tv|series|show)/i.test(String(c.type || '')) ? 'tv' : /^(movie|film)/i.test(String(c.type || '')) ? 'movie' : null;
    const key = `${title.toLowerCase()}|${year || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, year, type });
    if (out.length >= CANDIDATES) break;
  }
  return out;
}

// Scores from the judge → the titles, best first. Without scores (the judge failed) the first
// step's order stays. Titles the judge calls a clear miss are dropped (a sure answer can stand alone).
export function rank(titles, scores) {
  const scored = titles.map((t, i) => {
    const s = scores?.[String(i + 1)];
    const match = Number.isFinite(Number(s?.match)) ? Math.max(0, Math.min(100, Math.round(Number(s.match)))) : null;
    return { ...t, match, why: typeof s?.why === 'string' ? s.why.trim().slice(0, 160) : '', order: i };
  });
  if (!scored.some((t) => t.match != null)) return scored.slice(0, SHOWN).map(({ order, ...t }) => t);
  scored.sort((a, b) => (b.match ?? -1) - (a.match ?? -1) || a.order - b.order);
  const best = scored[0].match ?? 0;
  const kept = scored.filter((t, i) => i === 0 || (t.match ?? 0) >= Math.min(25, best / 2));
  return kept.slice(0, SHOWN).map(({ order, ...t }) => t);
}

// chat(system, user, { maxTokens }) → parsed JSON object (throws when the model can't be reached).
// find({ title, year, type }) → a Lilin title ({ id, type, title, year, overview, poster, ... }) or null.
// busy() → true while the model's machine shouldn't be used (a game running).
export function createMagicSearch({ chat, find, busy = async () => false, log = () => {} }) {
  const cache = new Map(); // `${lang}|${query}` → { at, promise }
  let line = Promise.resolve();

  async function run(query, lang) {
    if (await busy()) throw Object.assign(new Error('busy'), { code: 'busy' });
    const started = Date.now();
    const first = parseCandidates(await chat(candidatePrompt(), query, { maxTokens: 900 }));
    // Look each candidate up (in parallel); the same TMDB title named twice counts once.
    const found = await Promise.all(first.map((c) => find(c).catch(() => null)));
    const seen = new Set();
    const titles = [];
    for (const t of found) {
      if (!t || seen.has(`${t.type}:${t.id}`)) continue;
      seen.add(`${t.type}:${t.id}`);
      titles.push(t);
    }
    let scores = null;
    if (titles.length) {
      const list = titles.map((t, i) => `${i + 1}. ${t.title}${t.year ? ` (${t.year})` : ''}, ${t.type === 'tv' ? 'TV series' : 'film'}: ${String(t.overview || 'no description').replace(/\s+/g, ' ').slice(0, 420)}`).join('\n');
      try {
        scores = await chat(judgePrompt(lang), `What they remember: ${query}\n\nCandidates:\n${list}`, { maxTokens: 1200 });
      } catch (e) { log(`judge failed: ${e.message}`); }
    }
    const results = rank(titles, scores);
    log(`"${query.slice(0, 60)}": ${first.length} named, ${titles.length} real, top ${results[0] ? `${results[0].title} (${results[0].match ?? '?'})` : 'none'} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return { results, sure: (results[0]?.match ?? 0) >= 70 };
  }

  function search(raw, { lang = 'en' } = {}) {
    const query = normalizeQuery(raw);
    const key = `${lang}|${query.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    // One at a time: the model answers one request at once anyway, and a queue keeps them in order.
    const promise = line.then(() => run(query, lang));
    line = promise.catch(() => {});
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return promise;
  }

  return { search };
}
