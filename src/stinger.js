// Stay for the credits: whether a film has a scene during or after its closing credits. TMDB tags those films
// with two keywords, duringcreditsstinger (179431) and aftercreditsstinger (179430); the title page answer
// (/api/title/movie/<id>/page) asks for the film's keywords and says `stinger: 'during' | 'after' | 'both' | null`.
// Without either keyword the answer is null, which only means nobody tagged it: the apps then say nothing,
// never "no scene".
export const DURING_CREDITS = 179431;
export const AFTER_CREDITS = 179430;

const tagged = (k, id, name) => Number(k?.id) === id || String(k?.name || '').replace(/[\s_-]+/g, '').toLowerCase() === name;

// keywords: TMDB's list (a film's `keywords.keywords`, or a show's `keywords.results`).
export function stingerOf(keywords) {
  const list = Array.isArray(keywords) ? keywords : [];
  const during = list.some((k) => tagged(k, DURING_CREDITS, 'duringcreditsstinger'));
  const after = list.some((k) => tagged(k, AFTER_CREDITS, 'aftercreditsstinger'));
  return during && after ? 'both' : during ? 'during' : after ? 'after' : null;
}

// A film's details answer (with append_to_response=keywords) → the page's `stinger`. Shows: always null (TMDB tags
// the whole show, not the episode that has one).
export const titleStinger = (type, d) => (type === 'movie' ? stingerOf(d?.keywords?.keywords) : null);
