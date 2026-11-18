// Before Play on a recent film: is there a proper copy, or only cinema recordings?
//
// A film that just left cinemas often only exists as recordings filmed in a cinema (torrents.js
// isCinemaRecording). Lilin never picks those by itself, so Play would end in "Couldn't find a good copy";
// the title pages ask here first and say so under Play, and Play asks before it goes on (the person may still
// want the recording: allowCam on the smart download). Older films are skipped: they always have proper copies.
// deps: { details(id) → TMDB film details (with release_dates), filmOut(details), search(query) → results
// (torrents.js shape, with `cam`), matches(query, name) → bool, now() }.

const FRESH_DAYS = 400; // a film this long after its cinema release has proper copies
const KEEP_MS = 6 * 3600 * 1000;
const KEEP_FAILED_MS = 10 * 60 * 1000;

// ok: a proper copy with a swarm; cam: only cinema recordings; none: nothing found (the search may have failed).
export function copyVerdict(results) {
  const list = results || [];
  if (list.some((r) => !r.cam && (r.seeders || 0) >= 2)) return 'ok';
  if (list.some((r) => r.cam && (r.seeders || 0) >= 1)) return 'cam';
  return 'none';
}

export function createCopyCheck(deps) {
  const cache = new Map(); // tmdb id -> { at, keep, value | promise }
  async function run(id) {
    const d = await deps.details(id);
    const title = String(d?.title || '').trim();
    const date = String(d?.release_date || '').slice(0, 10);
    if (!title) return { verdict: 'skip' };
    const out = deps.filmOut(d);
    if (!out.out) return { verdict: 'soon', expect: out.expect || null };
    const released = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
    if (Number.isFinite(released) && deps.now() - released > FRESH_DAYS * 86400000) return { verdict: 'skip' };
    const query = [title, date.slice(0, 4)].filter(Boolean).join(' ');
    const found = (await deps.search(query)) || [];
    const fits = found.filter((r) => deps.matches(query, r.name));
    const verdict = copyVerdict(fits);
    return { verdict, proper: fits.filter((r) => !r.cam).length, cams: fits.filter((r) => r.cam).length };
  }
  return {
    async check(id) {
      const key = Number(id);
      const hit = cache.get(key);
      if (hit && deps.now() - hit.at < hit.keep) return hit.value ?? hit.promise;
      const promise = run(key).then((value) => {
        cache.set(key, { at: deps.now(), keep: value.verdict === 'none' ? KEEP_FAILED_MS : KEEP_MS, value });
        return value;
      }, (e) => { cache.delete(key); throw e; });
      cache.set(key, { at: deps.now(), keep: KEEP_MS, promise });
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      return promise;
    },
  };
}
