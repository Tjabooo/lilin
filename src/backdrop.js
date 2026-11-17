// Banner art for the Discover billboard. TMDB's default backdrop (backdrop_path) is whatever its editors
// last made primary, which can be a fan upload with three votes (The Odyssey 2026, 2026-11-17). Pick our
// own from the title's backdrops instead: no text baked in, at least 1080p wide, and liked by many voters
// (average x log of the vote count, so a 5-vote 8.0 doesn't beat a 68-vote 5.5).
export const MIN_BANNER_WIDTH = 1920;

const score = (b) => (Number(b.vote_average) || 0) * Math.log1p(Number(b.vote_count) || 0);

// backdrops: TMDB's images.backdrops. Returns a file_path, or null when nothing qualifies (keep the default).
export function pickBackdrop(backdrops) {
  const pool = (backdrops || []).filter((b) => b?.file_path && b.iso_639_1 == null && (Number(b.width) || 0) >= MIN_BANNER_WIDTH);
  if (!pool.length) return null;
  return pool.reduce((best, b) => (score(b) > score(best) ? b : best)).file_path;
}
