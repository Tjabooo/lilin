// Playback order comes from the signed-in person's completed library, never torrent progress.
// An episode whose browser copy is still being made counts too: the player streams it live meanwhile
// (bridgeVideo), so Up next doesn't vanish just because the next episode is still converting.
const positiveInteger = (n) => Number.isSafeInteger(n) && n > 0;
const usableEpisode = (f) => Boolean(f?.id && f.show && positiveInteger(f.season) && positiveInteger(f.episode)
  && f.done !== false);

// server: episodes on the server that aren't in this person's library yet (someone else downloaded them).
// Your own copy wins; a server one is marked fromServer so the player adds it to your library first.
export function nextLibraryEpisode(playing, library, shows, server = []) {
  if (playing?.kind !== 'lib') return null;
  // Group IDs can change when a delayed TMDB lookup resolves. Resolve the current file afresh.
  const current = library.find((f) => f.id === (playing.id || playing.key));
  if (!usableEpisode(current)) return null;
  const sameShow = (list) => (list || []).filter((f) => usableEpisode(f) && f.show === current.show);
  const episodes = sameShow(library);
  const others = sameShow(server);
  const pick = (list, season, episode) => list.filter((f) => f.season === season && f.episode === episode)
    .sort((a, b) => Number(Boolean(a.converting)) - Number(Boolean(b.converting))
      || String(a.file || '').localeCompare(String(b.file || '')) || String(a.id).localeCompare(String(b.id)))[0] || null;
  const choose = (season, episode) => {
    const own = pick(episodes, season, episode);
    if (own) return own;
    const other = pick(others, season, episode);
    return other ? { ...other, fromServer: true } : null;
  };
  const next = choose(current.season, current.episode + 1);
  if (next) return next;
  const total = shows.find((s) => s.id === current.show)?.seasons?.find((s) => s.number === current.season)?.total;
  // The last downloaded episode is not evidence of a season finale. Never skip a missing episode.
  return positiveInteger(total) && current.episode === total ? choose(current.season + 1, 1) : null;
}

// The prompt (and its countdown) starts exactly where the closing credits start: an ending chapter, or
// the closing-credits music found by comparing episodes (server credits.js). No guessed end window:
// when the credits start is unknown, the prompt waits for the real end of the file.
export const AUTOPLAY_SECONDS = 10;
export const AUTOPLAY_CHAIN = 3; // auto-played episodes in a row before it waits for a person again

export function nextEpisodePromptAt(duration, creditsAt) {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Number.isFinite(creditsAt) && creditsAt > duration / 2 && creditsAt < duration ? creditsAt : null;
}

export function isNextEpisodeTime({ ended, time, duration, creditsAt }) {
  if (ended) return true;
  const promptAt = nextEpisodePromptAt(duration, creditsAt);
  return promptAt !== null && Number.isFinite(time) && time >= promptAt;
}

// Up next also shows at a guessed credits start (where the dialogue ends, see credits.js) when the real one
// is unknown, but only the real start or the end of the file starts the autoplay countdown.
export function upNextShowing({ ended, time, duration, creditsAt, creditsGuess }) {
  if (isNextEpisodeTime({ ended, time, duration, creditsAt })) return true;
  if (nextEpisodePromptAt(duration, creditsAt) != null) return false;
  const guess = nextEpisodePromptAt(duration, creditsGuess);
  return guess != null && Number.isFinite(time) && time >= guess;
}

// ---- Play on TV ----
// The TV can't show Lilin's buttons, so the phone's remote shows them instead. All it knows is what the
// TV reports every poll (state, position, duration), so the cues come from that position: Skip intro
// while the opening titles play, Up next from the credits start, or once the TV finished the episode.
export const TV_END_SLACK = 10; // seconds: a TV that stops this close to the end has played the episode to its end

export function tvIntroShowing({ state, position, intro }) {
  if (!intro || !Number.isFinite(position) || !['playing', 'paused', 'loading'].includes(state)) return false;
  return position >= intro.start - 0.5 && position < intro.end - 1.5; // polled position: stop offering it just before the end
}

// lastPosition is the last position the TV reported while it was still playing.
export function tvFinished({ state, lastPosition, duration }) {
  return state === 'stopped' && Number.isFinite(duration) && duration > 0
    && Number.isFinite(lastPosition) && lastPosition >= duration - TV_END_SLACK;
}

export function tvNextShowing({ state, position, duration, creditsAt, lastPosition }) {
  if (tvFinished({ state, lastPosition, duration })) return true;
  if (!['playing', 'paused'].includes(state)) return false;
  return isNextEpisodeTime({ ended: false, time: position, duration, creditsAt });
}
