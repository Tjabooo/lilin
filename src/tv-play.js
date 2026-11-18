// The TV apps' Play (play first): one call says what to do about a film or an episode.
//
// The web app works this out from its own copies of the library and the downloads (public/app.js playTitle,
// readyTick); a 2020 TV shouldn't, so tv.js and the Rust app ask here instead, about once a second while the
// Getting it ready screen is up:
//   * it's in your library                      → { play: { kind: 'lib', file } }
//   * someone else's copy is on the server      → it joins your library → { play: { kind: 'lib', file } }
//   * a transfer of yours brings it (Play now)  → { play: { kind: 'part', id, url, ... } } once the start is there,
//                                                 { phase: 'starting', startProgress, startEta } until then
//   * nothing yet (start: true)                 → a smart download starts (a cold start) → { phase: 'finding', job }
//   * the search gave up                        → { phase: 'failed', message }
// deps: libraryView(user), addToLibrary(user, item) → bool, listDownloads(user), startSmart(user, body) → { id },
// smartJob(id, user), partLink(user, id) → { ready, url, status }.

import { versionInfo, rankVersions } from './versions.js';

// Several copies of one title: the best the TV can show. uhd=0 (a TV without 4K HEVC) prefers copies up to
// 1080p, since a 4K one would only reach it as a live 1080p re-encode; otherwise (and by default) the best.
// Copies still converting come last.
export function bestCopy(list, { uhd = true } = {}) {
  if (!list.length) return null;
  const ranked = rankVersions(list.map((f) => ({ ...versionInfo(f), size: f.size, id: f.id, f })));
  const fits = (r) => uhd || r.versionQuality !== '2160p';
  const pick = ranked.find((r) => fits(r) && !r.f.converting) || ranked.find((r) => !r.f.converting) || ranked[0];
  return pick.f;
}

const num = (v) => (v == null || v === '' ? null : Number(v));

// What the TV asked for: a film, or one episode of a show.
export function playTarget(q) {
  const type = q.type === 'tv' ? 'tv' : q.type === 'movie' ? 'movie' : null;
  const tmdbId = num(q.tmdbId);
  if (!type || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
  if (type === 'movie') return { type, tmdbId };
  const season = num(q.season), episode = num(q.episode);
  if (!Number.isInteger(season) || season < 0 || season > 99 || !Number.isInteger(episode) || episode < 1 || episode > 5000) return null;
  return { type, tmdbId, season, episode };
}

// A library or server item that is the target. shows: the show list of that view (show id -> TMDB id).
export function itemMatches(x, shows) {
  const showIds = new Set([`tv-${x.tmdbId}`]);
  for (const s of shows || []) if (Number(s.tmdbId) === x.tmdbId) showIds.add(s.id);
  return (f) => {
    if (x.type === 'movie') return f.season == null && !f.show && f.tmdbId != null && Number(f.tmdbId) === x.tmdbId;
    if (f.season !== x.season || f.episode !== x.episode) return false;
    return (f.show != null && showIds.has(f.show)) || (f.mediaType === 'tv' && Number(f.tmdbId) === x.tmdbId);
  };
}

// This person's transfers that bring the target (a film's, or the ones carrying that episode).
export function transfersFor(x, downloads) {
  return (downloads || []).filter((d) => {
    if (d.mine === false || d.tmdbId == null || Number(d.tmdbId) !== x.tmdbId) return false;
    if (x.type === 'movie') return d.mediaType !== 'tv';
    if (d.mediaType !== 'tv') return false;
    return (d.episodes || []).some((e) => e.season === x.season && e.episode === x.episode)
      || (d.season === x.season && (d.episode == null || d.episode === x.episode));
  });
}

// The video in a transfer that plays while it downloads (public/app.js playNowCandidate): the one big file.
export function playNowFile(d) {
  if (!d || !d.canPlayNow || d.ready || d.done || !d.files || !d.files.length) return null;
  const [main, next] = d.files.toSorted((a, b) => b.size - a.size);
  return main.available || (next && main.size < next.size * 3) ? null : main;
}

// The Play now stream id (hash-fileIndex) for the target in one of its transfers, with what the player needs.
export function partFor(x, transfers) {
  for (const d of transfers) {
    if (!d.canPlayNow) continue;
    if (x.type === 'tv') {
      const ep = (d.episodes || []).find((e) => e.season === x.season && e.episode === x.episode && !e.available && e.fileIndex != null);
      if (ep) return { id: `${d.hash}-${ep.fileIndex}`, mediaKey: ep.mediaKey || null, title: d.canonicalTitle || d.title || d.name, show: d.showId || null, season: ep.season, episode: ep.episode };
    }
    const main = playNowFile(d);
    if (main && (x.type === 'movie' || d.episode === x.episode)) {
      return { id: `${d.hash}-${main.index}`, mediaKey: main.mediaKey || null, title: d.canonicalTitle || d.title || d.name, show: d.showId || null,
        season: x.season ?? null, episode: x.episode ?? null };
    }
  }
  return null;
}

// The smart download's end in words, or null while it runs or when it found something (public/app.js commandResult).
export function jobFailure(job) {
  if (!job || job.state === 'running') return null;
  if (job.state === 'failed') return job.message || job.error || 'Lilin couldn’t find a copy that plays well.';
  if (job.outcome === 'none' || job.outcome === 'partial') return job.message || 'Lilin couldn’t find a copy that plays well.';
  return null;
}

export async function tvPlay(deps, user, q, { start = false } = {}) {
  const x = playTarget(q);
  if (!x) return { phase: 'failed', message: 'Which film or episode?' };
  const view = await deps.libraryView(user);
  const match = itemMatches(x, view.shows);
  const mine = (view.items || []).filter(match);
  const uhd = !(q.uhd === 0 || q.uhd === '0' || q.uhd === false);
  const ready = bestCopy(mine, { uhd });
  if (ready) return { play: { kind: 'lib', file: ready } };
  const copy = bestCopy((view.server || []).filter(match), { uhd });
  if (copy && await deps.addToLibrary(user, copy)) return { play: { kind: 'lib', file: copy, added: true } };

  const transfers = transfersFor(x, await deps.listDownloads(user));
  const part = partFor(x, transfers);
  if (part) {
    let link = null;
    try { link = await deps.partLink(user, part.id); } catch { return { phase: 'connecting' }; } // not streamable this second
    if (link && link.ready) return { play: { kind: 'part', ...part, url: link.url, duration: link.status?.duration || null } };
    return { phase: 'starting', startProgress: link?.status?.startProgress ?? null, startEta: link?.status?.startEta ?? null };
  }
  if (transfers.length) return { phase: 'connecting' };

  let job = q.job ? deps.smartJob(String(q.job), user) : null;
  if (!job && start) {
    if (user.canDownload === false) return { phase: 'failed', message: 'This isn’t on Lilin yet.' };
    const body = x.type === 'movie' ? { type: 'movie', tmdbId: x.tmdbId } : { type: 'tv', tmdbId: x.tmdbId, season: x.season, episodes: [x.episode] };
    // They were told only cinema recordings exist (copy-check.js) and pressed Play anyway.
    if (x.type === 'movie' && (q.allowCam === true || q.allowCam === 'true')) body.allowCam = true;
    let started;
    try { started = await deps.startSmart(user, body); } catch (e) { return { phase: 'failed', message: e.message }; }
    return { phase: 'finding', job: started.id };
  }
  const failed = jobFailure(job);
  if (failed) return { phase: 'failed', message: failed, job: job.id || q.job };
  // The search ended well but nothing has arrived yet; the TV gives up after a minute of this (idle).
  return { phase: 'finding', job: q.job || null, idle: Boolean(job && job.state !== 'running') };
}
