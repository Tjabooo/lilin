// GETs that start work on the server, and what the harness does with them instead (shoot.mjs, scrollperf.mjs).
// "Read-only" can't stop at refusing POSTs: opening the player asks GET /api/media/<kind>/<id>/audio, and for a
// file headless Chromium can't play (no H.264/HEVC) that answer queues a browser copy at the front of the encode
// queue and gets the next episodes ready too. An audio track or a phone quality (1080p/720p, or "auto" on a phone
// screen, which picks 1080p for HEVC) starts a remux or a live encode the same way, through /api/play-link.
//
// - /audio is asked as a phone would (`plays=phone`): the server only probes the file and queues nothing. The
//   answer is turned back into a plain browser one (patchAudio), so the player and its Audio menu still have the
//   real tracks.
// - play-link is asked for the original file instead of a phone quality; one with an audio track is refused,
//   like a write.
// --allow-writes turns all of this off (a throwaway local server).
export const AUDIO = /^\/api\/media\/(lib|dl)\/[^/]+\/audio$/;
const ORIGINAL = 'shotsPlays';

// -> { url, audio } to ask instead (audio: the answer needs patchAudio), { block: message } to refuse, or null.
export function guardRequest(u, { allowWrites = false } = {}) {
  if (allowWrites) return null;
  if (AUDIO.test(u.pathname) && !u.searchParams.has(ORIGINAL)) {
    const next = new URL(u);
    next.searchParams.set(ORIGINAL, u.searchParams.get('plays') || '');
    next.searchParams.set('plays', 'phone');
    return { url: next.href, audio: true };
  }
  if (/^\/api\/(play-link|watch\/[\w-]+\/play-link)$/.test(u.pathname)) {
    if (u.searchParams.get('audio') !== null) return { block: 'Blocked by the screenshot harness: this would start an encode on the server.' };
    const phone = /^phone/.test(u.searchParams.get('variant') || ''), quality = ['auto', '1080', '720'].includes(u.searchParams.get('quality'));
    if (phone || quality) {
      const next = new URL(u);
      if (phone) next.searchParams.set('variant', 'browser');
      if (quality) next.searchParams.set('quality', 'original');
      return { url: next.href };
    }
  }
  return null;
}

// The phone-style /audio answer, as the browser that asked would have had it, minus any queued work.
export function patchAudio(json, u) {
  if (!json || !u.searchParams.has(ORIGINAL)) return json;
  if (u.searchParams.get(ORIGINAL).split(',').includes('phone')) return json; // it really was a phone
  delete json.phone;
  return { ...json, fixable: false, job: null, percent: null, error: null };
}

// The Appearance presets (THEMES in public/app.js), with the names people actually type.
const ALIASES = { synthwave: 'synth', default: 'lilin' };
export function themeKey(name, appJs) {
  const wanted = String(name).trim().toLowerCase();
  const key = ALIASES[wanted] || wanted;
  const block = /const THEMES = \{([\s\S]*?)\n\};/.exec(appJs || '')?.[1] || '';
  const known = [...block.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
  if (known.length && !known.includes(key)) throw new Error(`Unknown theme "${name}". Themes: ${known.join(', ')} (or ${Object.keys(ALIASES).join(', ')}).`);
  return key;
}
