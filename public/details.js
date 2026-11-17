// "More details" at the very bottom of a title page: one closed disclosure with who made it, the music,
// facts, keywords and links (src/details.js, GET /api/title/:type/:id/details). Nothing is fetched until
// someone opens it. People who open it on three titles get it open from then on (on this device);
// closing one that opened by itself puts it back to closed.
// Also the quiet "Credits" fold under an episode in the episode list (director, writers, guest stars).
import { T, locale } from './i18n.js';

const OPEN_AFTER = 3;          // opens before it starts open by itself
const RETRY_MS = 4000;         // soundtrack still being looked up: ask again after this
const RETRIES = 5;
const KEEP_MS = 6 * 3600 * 1000;

// Crew groups: the ones people look for first, then the rest of the crew.
const MAIN = ['creators', 'showrunners', 'directors', 'writers', 'source', 'music', 'camera'];
const LABELS = {
  creators: 'Created by', showrunners: 'Showrunners', directors: 'Directed by', writers: 'Written by', source: 'Based on work by',
  music: 'Music', musicSupervisors: 'Music supervisor', camera: 'Cinematography', editing: 'Editing', producers: 'Producers',
  executives: 'Executive producers', design: 'Production design', costumes: 'Costumes', casting: 'Casting', effects: 'Visual effects',
};
// TMDB job names shown next to a person, in the page's words.
const JOBS = {
  Story: 'story', Screenstory: 'story', Teleplay: 'teleplay', Novel: 'novel', Book: 'book', 'Comic Book': 'comic', Characters: 'characters',
  'Original Story': 'original story', 'Original Concept': 'idea', Idea: 'idea', 'Graphic Novel': 'graphic novel', 'Short Story': 'short story',
  Play: 'play', 'Main Title Theme Composer': 'theme', 'Theme Song Performance': 'theme song', 'Series Director': 'series director',
  'Head Writer': 'head writer', 'Story Editor': 'story editor',
};
const STATUS = { 'Returning Series': 'Still running', Ended: 'Ended', Canceled: 'Cancelled', 'In Production': 'In production', Planned: 'Planned', Pilot: 'Pilot' };
const DATES = { premiere: 'World premiere', cinema: 'In cinemas', digital: 'Streaming and digital', disc: 'On disc', release: 'Released' };
const KINDS = { songs: 'Songs', album: 'Soundtrack', score: 'Score' };
const LINKS = { imdb: 'IMDb', tmdb: 'TMDB', letterboxd: 'Letterboxd', wikipedia: 'Wikipedia', homepage: 'Official site' };

// Where a song opens: a plain search link, no account or player of ours involved.
export const SERVICES = {
  spotify: { name: 'Spotify', url: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  ytmusic: { name: 'YouTube Music', url: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
};
export const songQuery = (track, album) => [track.title, track.artist || (/^various artists$/i.test(album?.artist || '') ? '' : album?.artist)].filter(Boolean).join(' ');
export const fmtLength = (s) => (s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const OUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const svg = (h, markup, cls) => { const s = h('span', { class: cls, 'aria-hidden': 'true' }); s.innerHTML = markup; return s; };

function displayName(type, code) {
  try { return new Intl.DisplayNames(locale || 'en', { type }).of(type === 'language' && code === 'cn' ? 'yue' : code) || code; } catch { return code; }
}
const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMoney = (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
const episodesText = (n) => (n === 1 ? T('1 episode') : T('{0} episodes', n));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function createTitleDetails({ h, api, me, searchOn, fmtRuntime }) {
  const answers = new Map();     // 'movie/603' -> { at, details, pending }
  const openNow = new Set();     // titles open on this visit, so re-drawn pages keep them open
  const closedNow = new Set();   // titles closed on this visit, so they don't spring open again
  const openAlbums = new Set();  // album ids folded open
  const opensKey = () => `lilin:details-opens:${me()?.id ?? ''}`;
  const serviceKey = 'lilin:song-service';
  const service = () => (SERVICES[store.get(serviceKey)] ? store.get(serviceKey) : 'spotify');

  function load(key) {
    const hit = answers.get(key);
    if (hit && (hit.pending ? hit.promise : Date.now() - hit.at < KEEP_MS)) return hit.promise;
    const promise = api(`/api/title/${key}/details`).then((d) => d.details);
    const entry = { at: Date.now(), promise, pending: true };
    answers.set(key, entry);
    promise.then(() => { entry.pending = false; }, () => answers.delete(key));
    return promise;
  }

  const personLink = (p) => (p.id
    ? h('a', { href: `https://www.themoviedb.org/person/${encodeURIComponent(p.id)}`, target: '_blank', rel: 'noopener noreferrer' }, p.name)
    : h('span', {}, p.name));
  const personNote = (p) => [p.jobs?.length ? p.jobs.map((j) => T(JOBS[j] || j)).join(', ') : '', p.episodes ? episodesText(p.episodes) : ''].filter(Boolean).join(' · ');

  const row = (label, ...value) => [h('dt', {}, label), h('dd', {}, ...value)];
  function peopleList(groups) {
    if (!groups.length) return null;
    // One person a line: easy to scan, and the episode counts line up after the names.
    return h('dl', { class: 'md-list' }, groups.flatMap((g) => row(T(LABELS[g.key] || g.key),
      ...g.people.map((p) => h('span', { class: 'md-person' }, personLink(p), personNote(p) && h('span', { class: 'md-note' }, ` · ${personNote(p)}`))))));
  }

  function factsList(f) {
    const rows = [];
    const add = (label, ...value) => { if (value.some((v) => v != null && v !== '')) rows.push(...row(label, ...value)); };
    const place = (code) => (code ? h('span', { class: 'md-note' }, ` · ${displayName('region', code)}`) : '');
    const lines = (list) => list.map((x) => h('span', { class: 'md-person' }, x));
    if (f.studios) add(f.studios.length > 1 ? T('Studios') : T('Studio'), ...lines(f.studios));
    if (f.networks) add(T('Shown on'), ...lines(f.networks));
    if (f.countries) add(f.countries.length > 1 ? T('Countries') : T('Country'), f.countries.map((c) => displayName('region', c)).join(', '));
    if (f.language) add(T('Original language'), displayName('language', f.language));
    if (f.spoken) add(T('Also spoken'), f.spoken.map((c) => displayName('language', c)).join(', '));
    if (f.originalTitle) add(T('Original title'), f.originalTitle);
    if (f.collection) add(T('Part of'), f.collection);
    for (const d of f.dates || []) add(T(DATES[d.kind] || 'Released'), fmtDate(d.date), place(d.country));
    if (f.firstAired) add(T('First aired'), fmtDate(f.firstAired));
    if (f.lastAired) add(T('Last aired'), fmtDate(f.lastAired));
    if (f.nextAired) add(T('Next episode'), fmtDate(f.nextAired));
    if (f.status && STATUS[f.status]) add(T('Status'), T(STATUS[f.status]));
    if (f.seasons || f.episodes) add(T('Seasons and episodes'), [f.seasons && (f.seasons === 1 ? T('1 season') : T('{0} seasons', f.seasons)), f.episodes && episodesText(f.episodes)].filter(Boolean).join(' · '));
    if (f.episodeRuntime) add(T('Episode length'), fmtRuntime(f.episodeRuntime));
    if (f.budget) add(T('Budget'), fmtMoney(f.budget));
    if (f.revenue) add(T('Box office'), fmtMoney(f.revenue));
    return rows.length ? h('dl', { class: 'md-list' }, rows) : null;
  }

  function serviceSwitch(redraw) {
    return h('div', { class: 'md-service', role: 'group', 'aria-label': T('Open songs in') },
      h('span', { class: 'md-service-label' }, T('Open songs in')),
      Object.entries(SERVICES).map(([id, s]) => h('button', { type: 'button', class: 'md-service-btn', 'aria-pressed': String(service() === id),
        onclick: () => { store.set(serviceKey, id); redraw(); } }, s.name)));
  }

  function albumCard(a) {
    const open = openAlbums.has(a.id);
    const cover = h('span', { class: 'md-cover' }, svg(h, NOTE, 'md-cover-note'));
    if (a.cover) {
      const img = h('img', { src: a.cover, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('load', () => cover.classList.add('has-art'));
      img.addEventListener('error', () => img.remove());
      cover.append(img);
    }
    const s = SERVICES[service()];
    const albumQuery = [a.title, /^various artists$/i.test(a.artist || '') ? '' : a.artist].filter(Boolean).join(' ');
    const meta = [T(KINDS[a.kind] || 'Soundtrack'), a.artist, a.year, a.tracks.length === 1 ? T('1 track') : T('{0} tracks', a.tracks.length)].filter(Boolean)
      .flatMap((x, i) => [i ? ' · ' : '', h('span', {}, String(x))]);
    const multiDisc = a.tracks.some((t) => t.disc > 1);
    const perDisc = new Map();
    const numbers = a.tracks.map((t) => { const n = (perDisc.get(t.disc || 1) || 0) + 1; perDisc.set(t.disc || 1, n); return multiDisc ? `${t.disc || 1}.${n}` : String(n); });
    const fold = h('details', { class: 'md-album', open: open || undefined, ontoggle: (e) => { if (e.currentTarget.open) openAlbums.add(a.id); else openAlbums.delete(a.id); } },
      h('summary', {}, cover, h('span', { class: 'md-album-text' }, h('span', { class: 'md-album-title' }, a.title), h('span', { class: 'md-album-meta' }, ...meta)),
        h('span', { class: 'md-chev', 'aria-hidden': 'true' })),
      h('ol', { class: 'md-tracks' }, a.tracks.map((t, i) => h('li', {},
        h('a', { href: s.url(songQuery(t, a)), target: '_blank', rel: 'noopener noreferrer', title: T('Find “{0}” on {1}', t.title, s.name) },
          h('span', { class: 'md-track-n' }, numbers[i]),
          h('span', { class: 'md-track-text' }, h('span', { class: 'md-track-title' }, t.title), t.artist && h('span', { class: 'md-track-artist' }, t.artist)),
          t.length && h('span', { class: 'md-track-len' }, fmtLength(t.length)))))),
      h('p', { class: 'md-album-links' },
        h('a', { href: s.url(albumQuery), target: '_blank', rel: 'noopener noreferrer' }, T('Album on {0}', s.name)), ' · ',
        h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, 'MusicBrainz')));
    return fold;
  }

  function musicBlock(d, redraw) {
    const albums = d.music?.albums || [];
    if (!albums.length) return d.musicPending ? h('p', { class: 'md-pending', role: 'status' }, T('Looking for the soundtrack…')) : null;
    return h('div', { class: 'md-block md-music' }, h('h4', {}, T('Music')), serviceSwitch(redraw), h('div', { class: 'md-albums' }, albums.map(albumCard)));
  }

  function body(d, redraw) {
    const main = d.people.filter((g) => MAIN.includes(g.key)), crew = d.people.filter((g) => !MAIN.includes(g.key));
    const facts = factsList(d.facts || {});
    const blocks = [
      main.length && h('div', { class: 'md-block' }, h('h4', {}, T('Made by')), peopleList(main)),
      musicBlock(d, redraw),
      crew.length && h('div', { class: 'md-block' }, h('h4', {}, T('Crew')), peopleList(crew)),
      facts && h('div', { class: 'md-block' }, h('h4', {}, T('Facts')), facts),
      d.keywords?.length && h('div', { class: 'md-block' }, h('h4', {}, T('Keywords')), h('ul', { class: 'md-tags' }, d.keywords.map((k) => h('li', {}, k)))),
      d.links?.length && h('div', { class: 'md-block' }, h('h4', {}, T('Elsewhere')), h('ul', { class: 'md-links' }, d.links.map((l) => h('li', {},
        h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, T(LINKS[l.kind] || l.kind), svg(h, OUT, 'md-out')))))),
    ].filter(Boolean);
    return blocks.length ? blocks : [h('p', { class: 'muted' }, T('No more details for this one yet.'))];
  }

  // The disclosure for a film or show with a TMDB id; null without one (or without TMDB).
  function section(type, id) {
    if (!id || !['movie', 'tv'].includes(type) || !searchOn()) return null;
    const key = `${type}/${id}`;
    const auto = !closedNow.has(key) && Number(store.get(opensKey())) >= OPEN_AFTER;
    const inner = h('div', { class: 'md-body', 'aria-live': 'polite' });
    let byUser = false, tries = 0, filled = false, loading = false;
    const fold = h('details', { class: 'more-details' },
      h('summary', { onclick: () => { byUser = true; } },
        h('span', { class: 'md-summary-text' }, h('span', { class: 'md-summary-title' }, T('More details')),
          h('span', { class: 'md-summary-sub' }, T('Crew, music, facts and links'))),
        h('span', { class: 'md-chev', 'aria-hidden': 'true' })),
      inner);
    const draw = (d) => { if (fold.isConnected || !filled) inner.replaceChildren(...body(d, () => draw(d))); filled = true; };
    const fill = () => {
      if (!filled) inner.replaceChildren(h('div', { class: 'md-loading', 'aria-hidden': 'true' }, h('div', { class: 'bar' }), h('div', { class: 'bar' }), h('div', { class: 'bar' })));
      loading = true;
      load(key).finally(() => { loading = false; }).then((d) => {
        if (!d) { inner.replaceChildren(h('p', { class: 'muted' }, T('No more details for this one yet.'))); return; }
        draw(d);
        // The soundtrack is still being looked up on the server: ask again in a moment.
        if (d.musicPending && tries < RETRIES) {
          tries++;
          setTimeout(() => {
            if (!fold.isConnected || !fold.open) return;
            answers.delete(key);
            fill();
          }, RETRY_MS);
        }
      }).catch(() => { if (!filled) inner.replaceChildren(h('p', { class: 'muted' }, T('Couldn’t load the details. Try again in a moment.'))); });
    };
    fold.addEventListener('toggle', () => {
      if (fold.open) {
        openNow.add(key); closedNow.delete(key);
        if (byUser) store.set(opensKey(), String(Math.min(99, (Number(store.get(opensKey())) || 0) + 1)));
        if (!filled && !loading) fill();
      } else {
        openNow.delete(key); closedNow.add(key);
        if (byUser && auto) store.set(opensKey(), '0'); // it opened by itself and they closed it: back to closed
      }
      byUser = false;
    });
    if (openNow.has(key) || auto) { fold.open = true; fill(); }
    return h('section', { class: 'page-section more-details-section' }, fold);
  }

  // Under an episode in the episode list: "Credits" folds out the episode's director, writers and guests.
  function episodeCredits(ep) {
    const c = ep?.credits;
    if (!c) return null;
    const names = (list) => list.map((p) => h('span', { class: 'md-person' }, personLink(p), p.character && h('span', { class: 'md-note' }, ` · ${p.character}`)));
    const rows = [
      c.directors?.length && row(T('Directed by'), ...names(c.directors)),
      c.writers?.length && row(T('Written by'), ...names(c.writers)),
      c.guests?.length && row(T('Guest stars'), ...names(c.guests)),
    ].filter(Boolean).flat();
    if (!rows.length) return null;
    return h('details', { class: 'ep-credits' }, h('summary', {}, T('Credits')), h('dl', { class: 'md-list' }, rows));
  }

  return { section, episodeCredits };
}
