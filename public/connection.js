// How fast this viewer's connection to the server is, and what that means for what plays.
// A quick download test (/api/speedtest, random bytes, a few seconds at most) measures Mbps; a file whose
// bitrate needs more than about 70 % of that would stall, so playback picks a lighter version of the title,
// or the live 1080p/720p stream of the file when every version is too heavy. Someone far away (another
// continent, through Cloudflare) gets something that plays; someone at home still gets the 4K.
// The result is kept for this tab for 15 minutes; a failed test means "unknown" and nothing changes.

const KEY = 'lilin:speed';
const FRESH_MS = 15 * 60_000;
const TEST_KB = 8192;        // at most 8 MB: done in under a second on a fast line
const TEST_MS = 2500;        // ...and never longer than this on a slow one
export const HEADROOM = 0.7; // share of the measured speed a video may use
// The live streams (phone-stream.js QUALITIES): average video + audio, kbps.
export const STREAM_KBPS = { 1080: 6200, 720: 2700 };
// Above this a connection counts as fast enough for any 4K file.
const FAST_MBPS = 60;

let pending = null;

function cached({ stale = false } = {}) {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s && (stale || Date.now() - s.at < FRESH_MS) && s.mbps > 0) return s;
  } catch { /* blocked or empty */ }
  return null;
}

// The last measurement (Mbps), or null when there isn't a fresh one.
export const knownMbps = () => cached()?.mbps ?? null;

// Measures (once per 15 minutes; callers share a test that's running). Resolves Mbps or null.
export function measureSpeed({ force = false } = {}) {
  const have = !force && cached();
  if (have) return Promise.resolve(have.mbps);
  if (pending) return pending;
  pending = runTest().then((mbps) => {
    if (mbps > 0) { try { sessionStorage.setItem(KEY, JSON.stringify({ mbps, at: Date.now() })); } catch { /* blocked */ } }
    return mbps > 0 ? mbps : null;
  }).catch(() => null).finally(() => { pending = null; });
  return pending;
}

// The speed when it's known within `wait` ms, else null (playback never waits longer for it).
export function speedWithin(wait = 3000) {
  const have = knownMbps();
  if (have) return Promise.resolve(have);
  return Promise.race([measureSpeed(), new Promise((r) => setTimeout(() => r(null), wait))]);
}

async function runTest() {
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), TEST_MS + 4000);
  try {
    const r = await fetch(`/api/speedtest?kb=${TEST_KB}&r=${Math.random().toString(36).slice(2)}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    // Timed from the first bytes, so the round trip to the server doesn't count as slowness.
    let start = 0, bytes = 0, first = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const t = performance.now();
      if (!start) { start = t; first = value.length; continue; }
      bytes += value.length;
      if (t - start > TEST_MS) { reader.cancel().catch(() => {}); break; }
    }
    const secs = (performance.now() - start) / 1000;
    // Everything came in one piece: faster than this test can tell.
    if (!bytes) return first ? FAST_MBPS * 2 : null;
    if (secs < 0.05) return FAST_MBPS * 2;
    return Math.round((bytes * 8) / secs / 1e4) / 100;
  } finally { clearTimeout(stop); }
}

// True when this connection can't carry a 4K file (so 4K isn't fetched or switched to for this viewer).
// The last result counts even when old: a slow line doesn't become fast by waiting.
export const slowForUhd = (mbps = cached({ stale: true })?.mbps ?? null) => mbps != null && mbps * HEADROOM * 1000 < 25_000;

// Fits this connection: a bitrate (kbps) that leaves headroom. Unknown bitrate or speed: fits.
export const fits = (kbps, mbps) => !(kbps > 0) || !(mbps > 0) || kbps <= mbps * 1000 * HEADROOM;

// versions: best first, each with kbps (or not). The best that fits; when none does, the lightest one
// (it then plays through a live stream if that is lighter still: streamFor).
export function versionForSpeed(versions, mbps) {
  if (!(mbps > 0) || !versions?.length) return null;
  const known = versions.filter((v) => v.kbps > 0);
  if (!known.length) return null;
  const fitting = versions.find((v) => fits(v.kbps, mbps));
  if (fitting) return fitting;
  return [...known].sort((a, b) => a.kbps - b.kbps)[0];
}

// For a file of `kbps` that doesn't fit: the live stream that does ('1080' or '720'), or null when the file fits
// (or nothing is known). height: the file's picture height (a 1080p file isn't "lightened" to 1080p but to 720p
// unless the 1080p stream is clearly lighter than the file).
export function streamFor(kbps, mbps, height = 0) {
  if (!(kbps > 0) || !(mbps > 0) || fits(kbps, mbps)) return null;
  const lighter1080 = height > 1100 || kbps > STREAM_KBPS[1080] * 1.4;
  if (lighter1080 && fits(STREAM_KBPS[1080], mbps)) return '1080';
  return '720';
}
