// Same-name films. "The Odyssey (2026)" is Nolan's 173-minute film, but two other films called The
// Odyssey also came out in 2026 (92 and 86 minutes) and their uploads carry the same name and year.
// Before Nolan's was out digitally, every WEB-DL called "The Odyssey 2026" was one of those. The
// name can't tell them apart; the video's length can.
//
// Deliberately narrow, so a real upload is never thrown away. A download is only judged to be another
// film when ALL of these hold:
//   - it was added for a known TMDB film with a runtime of at least 40 minutes;
//   - it has one main video (no second video at least half its size: parts, cuts, bonus films);
//   - the container stores its length up front (MKV, MP4, ...), and ffprobe reads one;
//   - that length is far from the film's runtime (shorter than 75 % of it and 20+ minutes off, or more
//     than 60 % longer), so a different cut of the same film stays;
//   - another film with the same title on TMDB has a runtime within 3 minutes of the video's.
// Anything unknown or in between is left alone.

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|mpg|mpeg)$/i;
// Containers that store the duration in their header (or index): a half-downloaded file reports the
// real length. Others (AVI, TS, ...) get an estimate from whatever bytes are there, so never judged.
const HEADER_LENGTH = /\.(mkv|webm|mp4|m4v|mov)$/i;
export const MIN_RUNTIME = 40;
export const TWIN_MATCH_MINUTES = 3;

const base = (name) => String(name || '').replace(/\\/g, '/').split('/').pop();
const isSample = (name) => /(^|[^a-z])(sample|trailer|featurette)([^a-z]|$)/i.test(String(name || ''));

// The film's video in a torrent's file list, or null when there isn't exactly one clear one.
export function mainVideo(files) {
  if (!Array.isArray(files)) return null;
  const videos = files.filter((f) => VIDEO.test(base(f.name)) && !isSample(f.name) && Number(f.size) > 0)
    .sort((a, b) => Number(b.size) - Number(a.size));
  if (!videos.length) return null;
  if (videos[1] && Number(videos[1].size) >= Number(videos[0].size) / 2) return null;
  return HEADER_LENGTH.test(base(videos[0].name)) ? videos[0] : null;
}

// Far enough from the film's own runtime that no cut of it explains the video.
export function farFromRuntime(minutes, runtime) {
  if (!(minutes > 0) || !(runtime >= MIN_RUNTIME)) return false;
  const shorter = minutes < runtime * 0.75 && runtime - minutes >= 20;
  const longer = minutes > runtime * 1.6;
  return shorter || longer;
}

const yearOf = (f) => String(f?.release_date || '').slice(0, 4) || null;

// minutes: the video's length. film: TMDB details of the film it was added for. others: TMDB details
// of films with the same title (any year; the film itself is skipped). Returns null (keep it) or
// { other, why } (it's that other film).
export function otherFilm(minutes, film, others, sameTitle) {
  const runtime = Number(film?.runtime);
  if (!farFromRuntime(minutes, runtime)) return null;
  const close = (others || [])
    .filter((o) => o && o.id !== film.id && sameTitle(o, film))
    .filter((o) => Number(o.runtime) >= MIN_RUNTIME && farFromRuntime(Number(o.runtime), runtime))
    .filter((o) => Math.abs(Number(o.runtime) - minutes) <= TWIN_MATCH_MINUTES)
    .sort((a, b) => Math.abs(a.runtime - minutes) - Math.abs(b.runtime - minutes));
  const other = close[0];
  if (!other) return null;
  const label = (f) => `${f.title}${yearOf(f) ? ` (${yearOf(f)})` : ''}`;
  return {
    other,
    why: `is ${Math.round(minutes)} minutes long: that's ${label(other)} (${other.runtime} min), not ${label(film)} (${runtime} min)`,
  };
}
