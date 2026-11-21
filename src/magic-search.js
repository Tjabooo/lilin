// MAGIc search: find a film or show from what someone half-remembers ("teacher makes meth with his
// student" → Breaking Bad), without a language model. Wikipedia has a plot write-up for nearly every
// film and series, new ones within days, so it does the finding:
//   1. Wikipedia's own search over film/TV articles (all words, any word, an idea like "time loop"
//      spotted in the wording), the lists merged;
//   2. each article's opening section is scored against the description: how many of the words
//      (stemmed, a few synonyms) it has, rare words counting more than ones every candidate has;
//   3. the best go to TMDB through their Wikidata ID (/find), which also drops what isn't a film or
//      series; TMDB's description and keywords join the text, popularity breaks ties.
// No answer is "sure" the way a model's is; the matched words are shown as the reason.
// Answers are cached per wording and language for a day; one search runs at a time (Wikipedia's
// API asks clients to go easy on it).

const WIKI_LIMIT = 20;
const TO_TMDB = 12;
const SHOWN = 8;
const CACHE_MS = 24 * 3600 * 1000;

// Film and TV articles: the infobox they carry. `|` is "any of" in CirrusSearch's hastemplate.
const WIKIS = {
  en: 'hastemplate:"Infobox film|Infobox television|Infobox animanga/Header"',
  sv: 'hastemplate:"Infobox film|Infobox TV-program"',
};

const STOP = new Set(`a an the and or but of to in on at by for with from into onto about over under after before
  is are was were be been being am do does did has have had it its it's this that these those there their they them he him his
  she her hers we our you your i me my who whom whose which what when where why how than then so as if just also very really
  some any all one ones thing things stuff something someone somebody kinda kind sort like remember remembered think thought
  called named name title know knew where's there's whats what's theres wheres its im dont can could would should might gets get got
  up down out off goes go went make makes try tries tried keep keeps kept himself herself themselves itself whole becomes become find finds found
  movie movies film films show shows series season seasons episode episodes watch watched saw seen see
  en ett och eller men av till i på vid för med från om över under efter innan är var vara blir blev har hade den det de
  dem han honom hans hon henne hennes vi vår ni er jag mig min mitt mina som vilken vilket vilka vad när var varför hur än så
  bara också väldigt nån någon något några sak saker typ minns kommer ihåg heter hette film filmer serie serier tv-serie
  säsong avsnitt där handlar handlade om`.split(/\s+/).filter(Boolean));

// A few ways people say what plots spell out (both sides are stemmed before matching).
const SYNONYMS = {
  meth: ['methamphetamine', 'crystal'], guy: ['man'], dude: ['man'], kid: ['child', 'boy', 'girl', 'son', 'daughter'],
  kids: ['children', 'boys', 'girls'], cop: ['police', 'detective', 'officer'], cops: ['police'], tv: ['television'],
  spaceship: ['spacecraft', 'starship', 'space'], robot: ['android', 'robotic'], alien: ['extraterrestrial'],
  doctor: ['physician', 'surgeon'], mom: ['mother'], mum: ['mother'], dad: ['father'], wife: ['widow', 'widower', 'married'],
  kill: ['murder', 'death', 'die', 'suicide'], kills: ['murder', 'death'], killer: ['murderer', 'serial'], dies: ['death', 'dead'],
  fake: ['simulated', 'staged', 'artificial', 'constructed', 'reality'], dream: ['dreams', 'subconscious'], school: ['student', 'teacher'],
  zombie: ['undead'], vampire: ['vampires'], heist: ['robbery', 'theft'], ai: ['artificial', 'intelligence'],
  lärare: ['lärarinna'], polis: ['kriminalare'], mördare: ['mord'],
};

const PHRASES = [
  [/ (same day|over and over|again and again|relive|relives|reliving|repeat|repeating) /, 'time loop', ['loop', 'reliving', 'repeat', 'repeatedly']],
  [/ (kill|kills|killed|killing) (himself|herself|themselves) /, 'suicide', ['suicide']],
];

// Rough English stemming: enough to make "kills"/"killed"/"killing" one word.
export function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (/(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}
// British/American spellings and a final e ("lives"/"living", "neighbours"/"neighbors") meet in one form.
const fold = (w) => { const s = stem(w).replace(/([a-z]{3,})our$/, '$1or'); return s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s; };
const words = (text) => String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
const stems = (text) => new Set(words(text).map((w) => fold(w.replace(/['’].*$/, ''))));

export const normalizeQuery = (q) => String(q || '').replace(/\s+/g, ' ').trim().slice(0, 300);

// "show where a guy wakes up in the 90s" → { terms: ['wake', 'guy', ...], type: 'tv', decade: 1990 }
export function readQuery(q) {
  const all = words(q);
  const lower = ` ${all.join(' ')} `;
  const tv = / (show|shows|series|tv|season|seasons|episode|episodes|sitcom|serie|serier|säsong|avsnitt|tv-serie) /.test(lower);
  const film = / (movie|movies|film|films|filmen) /.test(lower);
  const decade = Number(/(?:^|\s)(?:19)?([2-9]0)s(?:\s|$)/.exec(lower)?.[1]) || null;
  const year = Number(/\b(19[2-9]\d|20[0-4]\d)\b/.exec(lower)?.[1]) || null;
  const seen = new Set();
  const terms = [];
  for (const w of all) {
    const bare = w.replace(/['’].*$/, '');
    if (STOP.has(bare) || bare.length < 2 || /^\d+s?$/.test(bare)) continue;
    const s = fold(bare);
    if (seen.has(s)) continue;
    seen.add(s);
    terms.push({ word: bare, alts: [s, ...(SYNONYMS[bare] || []).map(fold)] });
  }
  // Ideas plots name differently: "the same day over and over" is a time loop.
  for (const [re, word, alts] of PHRASES) if (re.test(lower)) terms.unshift({ word, alts: alts.map(fold), extra: true });
  return {
    terms: terms.slice(0, 12),
    type: tv && !film ? 'tv' : film && !tv ? 'movie' : null,
    decade: decade ? 1900 + decade : null,
    year,
  };
}

// How well a text covers the description, 0-1, and which words it had. weight(term) favours words
// few candidates share: "meth" decides more than "student".
export function coverage(terms, textStems, weight = () => 1) {
  let total = 0, got = 0;
  const matched = [];
  for (const t of terms) {
    const w = weight(t);
    total += w;
    const hit = t.alts.some((a) => textStems.has(a) || (a.length >= 5 && [...textStems].some((s) => s.length > a.length && s.startsWith(a))));
    if (hit) { got += w; matched.push(t.word); }
  }
  return { score: total ? got / total : 0, matched };
}

function idfWeights(terms, docs) {
  const n = docs.length || 1;
  const df = new Map(terms.map((t) => [t, docs.filter((d) => t.alts.some((a) => d.has(a))).length]));
  return (t) => Math.log(1 + n / (1 + df.get(t))) + 0.25;
}

// wiki(lang, params) → the API's JSON; findTmdb(wikidataId) → a Lilin title or null;
// extra(title) → { text } (TMDB description + keywords) or null.
export function createMagicSearch({ wiki, findTmdb, extra = async () => null, log = () => {} }) {
  const cache = new Map();
  let line = Promise.resolve();

  async function searchWiki(lang, query) {
    const data = await wiki(lang, {
      action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${query} ${WIKIS[lang]}`,
      gsrlimit: String(WIKI_LIMIT), gsrnamespace: '0', prop: 'pageprops|extracts', ppprop: 'wikibase_item',
      exintro: '1', explaintext: '1', exlimit: 'max',
    });
    return (data?.query?.pages || []).filter((p) => p.pageprops?.wikibase_item)
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ qid: p.pageprops.wikibase_item, title: p.title, text: p.extract || '' }));
  }

  async function run(query, lang) {
    const started = Date.now();
    const q = readQuery(query);
    if (!q.terms.length) return { results: [], sure: false };
    const plain = q.terms.filter((t) => !t.extra).map((t) => t.word).join(' ');
    const any = [...new Set(q.terms.flatMap((t) => [...t.word.split(' '), ...(SYNONYMS[t.word] || [])]))].slice(0, 30).join(' OR ');
    const langs = lang === 'sv' ? ['sv', 'en'] : ['en'];
    // All words (precise, often nothing for a long description) and any word (wide), per wiki.
    // An idea spotted in the wording ("time loop") gets a search of its own: plots use those words.
    const ideas = q.terms.filter((t) => t.extra).map((t) => `"${t.word}"`);
    const queries = [plain, any, ...(ideas.length ? [ideas.join(' ')] : [])];
    const lists = await Promise.all(langs.flatMap((l) => queries.map((s) => searchWiki(l, s).catch((e) => { log(`wikipedia ${l}: ${e.message}`); return null; }))));
    if (lists.every((l) => l === null)) throw Object.assign(new Error('wikipedia'), { code: 'offline' });
    // Merge by Wikidata item: rank fusion for where Wikipedia put it, the longest text kept.
    const pool = new Map();
    lists.forEach((list) => (list || []).forEach((p, i) => {
      const had = pool.get(p.qid) || { qid: p.qid, title: p.title, text: '', fused: 0 };
      had.fused += 1 / (8 + i);
      if (p.text.length > had.text.length) had.text = p.text;
      pool.set(p.qid, had);
    }));
    let cands = [...pool.values()].map((c) => ({ ...c, stems: stems(`${c.title} ${c.text}`) }));
    const maxFused = Math.max(...cands.map((c) => c.fused), 1e-9);
    let weight = idfWeights(q.terms, cands.map((c) => c.stems));
    for (const c of cands) c.first = 0.75 * coverage(q.terms, c.stems, weight).score + 0.25 * (c.fused / maxFused);
    cands = cands.sort((a, b) => b.first - a.first).slice(0, TO_TMDB);

    // To TMDB: what isn't a film or series there drops out here.
    const found = await Promise.all(cands.map(async (c) => {
      const t = await findTmdb(c.qid).catch(() => null);
      if (!t) return null;
      const more = await extra(t).catch(() => null);
      return { c, t, stems: new Set([...c.stems, ...stems(`${t.title} ${t.overview || ''} ${more?.text || ''}`)]) };
    }));
    const seen = new Set();
    const hits = found.filter((f) => f && !seen.has(`${f.t.type}:${f.t.id}`) && seen.add(`${f.t.type}:${f.t.id}`));
    weight = idfWeights(q.terms, hits.map((f) => f.stems));
    const scored = hits.map((f) => {
      const cov = coverage(q.terms, f.stems, weight);
      const votes = Math.min(1, Math.log10((f.t.votes || 0) + 1) / 4);
      let score = 0.62 * cov.score + 0.18 * (f.c.fused / maxFused) + 0.2 * votes;
      if (q.type && f.t.type !== q.type) score -= 0.12;
      if (q.decade && f.t.year && (f.t.year < q.decade || f.t.year > q.decade + 9)) score -= 0.1;
      if (q.year && f.t.year && Math.abs(f.t.year - q.year) > 1) score -= 0.1;
      return { ...f.t, matched: cov.matched, score: Math.round(score * 1000) / 1000 };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score || 0;
    const results = scored.filter((t, i) => i === 0 || t.score >= best * 0.55).slice(0, SHOWN);
    // "Sure": clearly ahead and most of the words are there.
    const sure = Boolean(results[0]) && results[0].matched.length >= Math.ceil(q.terms.length * 0.6)
      && best - (results[1]?.score || 0) >= 0.08;
    log(`"${query.slice(0, 60)}": ${pool.size} articles, ${hits.length} on TMDB, top ${results[0] ? `${results[0].title} (${best})` : 'none'} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return { results, sure };
  }

  function search(raw, { lang = 'en' } = {}) {
    const query = normalizeQuery(raw);
    const key = `${lang}|${query.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = line.then(() => run(query, lang));
    line = promise.catch(() => {});
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return promise;
  }

  return { search };
}
