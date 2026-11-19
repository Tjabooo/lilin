// Which song plays over the end credits, for the website's credits card (credits-card.js) and the TV apps (the server
// picks it for them: /api/title/:type/:id/song). No imports: the server loads this file too.
//
// There are no per-scene timestamps anywhere free, so it's a best guess and the card says how sure it is.
// A track named for the end credits ("End Credits", "Ending Theme", "Outro") → "Over the credits"; a show's theme
// (it usually plays out the episode) → "Theme"; otherwise the last track of the soundtrack → "From the soundtrack".
const CREDITS_RE = /\b(?:end(?:ing)?|closing|final)\s*(?:credits?|titles?|theme|song)\b|\bend\s*credit|\boutro\b|^ed\b|\bED\s*\d*$/i;
const THEME_RE = /\b(?:main\s*(?:title|theme)s?|opening\s*(?:theme|titles?|credits)|theme\s*(?:song|from)|title\s*(?:theme|song))\b|\btheme$|^theme\b/i;

// { track, album, why: 'credits' | 'theme' | 'soundtrack' } or null. albums as /api/title/.../details sends them.
export function creditsSong(albums, { type = 'movie' } = {}) {
  const list = (albums || []).filter((a) => a?.tracks?.length);
  if (!list.length) return null;
  const find = (re) => {
    for (const album of list) {
      // the last match: "End Credits" beats an earlier "End Titles (Reprise)"… unless it's a reprise
      const hits = album.tracks.filter((t) => re.test(t.title || ''));
      const track = hits.find((t) => !/reprise|instrumental|karaoke/i.test(t.title)) || hits[0];
      if (track) return { track, album };
    }
    return null;
  };
  const credits = find(CREDITS_RE);
  if (credits) return { ...credits, why: 'credits' };
  if (type === 'tv') {
    const theme = find(THEME_RE);
    if (theme) return { ...theme, why: 'theme' };
  }
  const album = list[0];
  return { track: album.tracks[album.tracks.length - 1], album, why: 'soundtrack' };
}
