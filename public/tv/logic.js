// Lilin on a TV (tv/tizen): the parts of the TV app that are plain logic, kept apart so tests can run them.
// Written for the TV's browser engine (Samsung 2020 = Chrome 69): no ?. or ??, no newer built-ins.
(function (root) {
  'use strict';

  // Translates an English line with public/tv/sv.js (loaded first by the shell); {0}, {1}… are filled in.
  function T(text) {
    var strings = root.LilinTvStrings || {};
    var args = arguments;
    return String(strings[text] || text).replace(/\{(\d+)\}/g, function (m, i) { return args[+i + 1]; });
  }

  var AUTOPLAY_SECONDS = 10;
  var AUTOPLAY_CHAIN = 3; // episodes in a row the countdown may start before it waits for a person
  var DONE_SECONDS = 90;  // this close to the end counts as watched (same as the phone player)

  function posInt(n) { return typeof n === 'number' && isFinite(n) && n > 0 && Math.floor(n) === n; }
  function usableEpisode(f) {
    return Boolean(f && f.id && f.show && posInt(f.season) && posInt(f.episode) && !f.converting && f.done !== false);
  }

  // Same rule as the phone (public/player-next.js): the next episode of this person's own library,
  // the first of the next season only when TMDB says this was the season's last. Never skips one.
  function nextEpisode(currentId, library, shows) {
    var current = null, i;
    for (i = 0; i < library.length; i++) if (library[i].id === currentId) { current = library[i]; break; }
    if (!usableEpisode(current)) return null;
    var episodes = library.filter(function (f) { return usableEpisode(f) && f.show === current.show; });
    function choose(season, episode) {
      return episodes.filter(function (f) { return f.season === season && f.episode === episode; })
        .sort(function (a, b) { return String(a.file || '').localeCompare(String(b.file || '')) || String(a.id).localeCompare(String(b.id)); })[0] || null;
    }
    var next = choose(current.season, current.episode + 1);
    if (next) return next;
    var show = null;
    for (i = 0; i < shows.length; i++) if (shows[i].id === current.show) show = shows[i];
    var season = show && (show.seasons || []).filter(function (s) { return s.number === current.season; })[0];
    var total = season && season.total;
    return posInt(total) && current.episode === total ? choose(current.season + 1, 1) : null;
  }

  // Up next starts with the credits (an ending chapter or the credits music, from the server), never
  // at a guessed time: with no credits start known it waits for the end of the file.
  // The episode after season/episode by TMDB's seasons ({ number, episodes, first, upcoming }), or null at the end.
  function nextAfter(seasons, season, episode) {
    var list = (seasons || []).filter(function (x) { return x.number > 0; }).sort(function (a, b) { return a.number - b.number; });
    var cur = list.filter(function (x) { return x.number === season; })[0];
    if (cur && (!cur.episodes || episode + 1 <= (cur.first || 1) + cur.episodes - 1)) return { season: season, episode: episode + 1 };
    var next = list.filter(function (x) { return x.number > season; })[0];
    if (!next || next.upcoming) return null;
    return { season: next.number, episode: next.first || 1 };
  }
  function nextPromptAt(duration, creditsAt) {
    if (!(duration > 0)) return null;
    return typeof creditsAt === 'number' && creditsAt > duration / 2 && creditsAt < duration ? creditsAt : null;
  }
  function isNextTime(time, duration, creditsAt, ended) {
    if (ended) return true;
    var at = nextPromptAt(duration, creditsAt);
    return at !== null && time >= at;
  }
  function introShowing(time, intro) {
    return Boolean(intro) && time >= intro.start - 0.25 && time < intro.end - 1;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }
  function episodeLabel(f) {
    return f && f.season != null && f.episode != null ? T('S{0} E{1}', pad2(f.season), pad2(f.episode)) : '';
  }
  function minutesLeft(p) { return T('{0} min left', Math.max(1, Math.ceil((p.duration - p.time) / 60))); }

  // Resume points are synced by media key, which stays the same when the MP4 copy replaces the original.
  function progressRef(f) { return f.mediaKey ? 'm:' + f.mediaKey : 'l:' + f.id; }
  function resumable(p) { return Boolean(p && p.time > 30 && p.duration > 0 && p.duration - p.time > DONE_SECONDS); }

  // "movie:603" / "tv:1399", for Wrapped and Popular on Lilin (same as public/social.js titleKeyOf).
  function titleKey(f) {
    var show = /^tv-(\d+)$/.exec(String(f.show || ''));
    if (show) return 'tv:' + show[1];
    if (f.tmdbId && f.season == null) return 'movie:' + f.tmdbId;
    return undefined;
  }

  // The home screen: what you were watching (newest first), then shows, then films.
  // What a transfer is doing, in the same words as the website's Library (public/library-downloads.js).
  function transferWord(d) {
    if (d.converting) return T('Preparing playback');
    var st = String(d.state || '');
    if (st === 'missingFiles') return T('Files missing');
    if (st === 'error') return T('Needs attention');
    if (/^(paused|stopped)/.test(st)) return T('Paused');
    if (/^checking/.test(st)) return T('Checking files');
    if (st === 'stalledDL') return T('Waiting for a source');
    if (st === 'metaDL' || st === 'forcedMetaDL') return T('Starting');
    if (st === 'queuedDL') return T('In line');
    if (st === 'moving' || d.progress >= 1) return T('Almost ready');
    return T('On its way');
  }
  function pendingWord(items, finished) {
    if (items.some(function (d) { return d.state === 'error' || d.state === 'missingFiles'; })) return T('Needs attention');
    if (items.length === 1 && !finished) return transferWord(items[0]);
    if (finished) return T('{0} of {1} ready', finished, finished + items.length);
    if (items.every(function (d) { return /^(paused|stopped)/.test(String(d.state || '')); })) return T('Paused');
    return items.every(function (d) { return d.episode != null; }) ? T('{0} episodes on their way', items.length) : T('{0} downloads', items.length);
  }
  // Downloads that aren't ready yet, one entry per film or show (a season pack and single episodes join up),
  // newest first. The same rule as the website's libraryUnion: yours, and still on its way or needing attention.
  function pendingTitles(downloads, library) {
    var order = [], byKey = {};
    (downloads || []).forEach(function (d) {
      if (d.mine === false) return;
      var trouble = d.state === 'error' || d.state === 'missingFiles';
      var linked = d.libraryIds && d.libraryIds.length;
      if (!(!d.done || d.converting || trouble || (d.hasVideo !== false && !d.ready && !linked))) return;
      var isShow = d.mediaType === 'tv' || d.showId;
      var key = isShow ? 'tv:' + (d.showId || d.tmdbId || d.hash) : d.tmdbId != null ? 'movie:' + d.tmdbId : 'hash:' + d.hash;
      var e = byKey[key];
      if (!e) {
        e = byKey[key] = { key: key, type: isShow ? 'tv' : 'movie', tmdbId: d.tmdbId == null ? null : d.tmdbId, showId: d.showId || null,
          title: d.canonicalTitle || d.title || d.name || '', poster: d.poster || null, backdrop: d.backdrop || null, year: d.year || null,
          items: [], added: 0 };
        order.push(e);
      }
      e.items.push(d);
      e.added = Math.max(e.added, d.added || 0);
    });
    return order.map(function (e) {
      var count = e.items.length;
      var known = e.items.every(function (d) { return d.size > 0 && typeof d.progress === 'number'; });
      var total = known ? e.items.reduce(function (n, d) { return n + d.size; }, 0) : 0;
      var part = known && total ? e.items.reduce(function (n, d) { return n + d.size * Math.max(0, Math.min(1, d.progress)); }, 0) / total : null;
      // Everything downloaded and now being prepared: the bar follows that instead of sitting full.
      var preparing = e.items.filter(function (d) { return d.converting && typeof d.convertPercent === 'number'; });
      if (preparing.length === count) part = preparing.reduce(function (n, d) { return n + d.convertPercent; }, 0) / count / 100;
      // SVT Play copies leave the list as they finish: what's done still counts, so the bar never falls back.
      var finished = 0;
      e.items.forEach(function (d) { finished = Math.max(finished, d.batchDone || 0); });
      e.finished = finished;
      e.total = finished + count;
      e.progress = part == null ? null : (finished + part * count) / (finished + count);
      e.word = pendingWord(e.items, finished);
      return e;
    }).sort(function (a, b) { return b.added - a.added; });
  }

  // hidden: titles taken out of Continue watching on the website (title key -> when); watching again brings them back.
  function homeRows(library, shows, progress, hidden) {
    hidden = hidden || {};
    function shown(f) {
      var key = titleKey(f) || (f.show ? 'show:' + f.show : progressRef(f));
      return !(hidden[key] != null && hidden[key] >= (progress[progressRef(f)].at || 0));
    }
    // One card per show: its latest episode, or, once that one is finished, the next one here (upNext).
    var list = [], latest = {}, upNext = {};
    library.forEach(function (f) {
      var p = progress[progressRef(f)];
      if (!p || f.converting) return;
      if (f.show && f.season != null) {
        var b = latest[f.show];
        if (!b || (p.at || 0) > (progress[progressRef(b)].at || 0)) latest[f.show] = f;
      } else if (resumable(p) && shown(f)) list.push({ f: f, at: p.at || 0 });
    });
    Object.keys(latest).forEach(function (id) {
      var f = latest[id], p = progress[progressRef(f)];
      if (!shown(f)) return;
      if (resumable(p)) { list.push({ f: f, at: p.at || 0 }); return; }
      var finished = p.time == null || (p.duration > 0 && p.duration - p.time <= DONE_SECONDS);
      var next = finished ? nextEpisode(f.id, library, shows) : null;
      if (!next || next.converting) return;
      var np = progress[progressRef(next)];
      if (np && (np.time == null || np.duration - np.time <= DONE_SECONDS)) return; // already seen
      upNext[next.id] = true;
      list.push({ f: next, at: p.at || 0 });
    });
    var cont = list.sort(function (a, b) { return b.at - a.at; }).slice(0, 20).map(function (x) { return x.f; });
    var showIds = {};
    library.forEach(function (f) { if (f.show && f.season != null) showIds[f.show] = true; });
    var showList = shows.filter(function (s) { return showIds[s.id]; })
      .sort(function (a, b) { return latestAdded(library, b.id) - latestAdded(library, a.id); });
    var films = library.filter(function (f) { return f.season == null; })
      .sort(function (a, b) { return (b.addedAt || b.added || 0) - (a.addedAt || a.added || 0); });
    return { cont: cont, upNext: upNext, shows: showList, films: films };
  }
  function latestAdded(library, showId) {
    var t = 0;
    library.forEach(function (f) { if (f.show === showId) t = Math.max(t, f.addedAt || f.added || 0); });
    return t;
  }

  // The library by genre: one row per genre that has something in it, the biggest first, newest titles
  // first inside. Films match by their TMDB film genre, shows by the show genre (TMDB merges a few for
  // shows, e.g. "Action & Adventure", so one show can sit in both Action and Adventure).
  function genreRows(library, shows, genres) {
    var showIds = {}, showAdded = {}, films = [], seenFilm = {};
    library.forEach(function (f) {
      if (f.show && f.season != null) { showIds[f.show] = true; showAdded[f.show] = Math.max(showAdded[f.show] || 0, f.addedAt || f.added || 0); }
      if (f.season != null || !f.genres || !f.genres.length) return;
      var k = f.tmdbId ? 'm' + f.tmdbId : f.id;
      if (!seenFilm[k]) { seenFilm[k] = true; films.push(f); }
    });
    function has(list, id) { return Boolean(id && list && list.indexOf(id) >= 0); }
    var rows = [];
    (genres || []).forEach(function (g) {
      var titles = [];
      shows.forEach(function (s) { if (showIds[s.id] && has(s.genres, g.tv)) titles.push({ show: s, added: showAdded[s.id] }); });
      films.forEach(function (f) { if (has(f.genres, g.movie)) titles.push({ film: f, added: f.addedAt || f.added || 0 }); });
      if (titles.length) rows.push({ name: g.name, titles: titles.sort(function (a, b) { return b.added - a.added; }) });
    });
    return rows.sort(function (a, b) { return b.titles.length - a.titles.length || (a.name < b.name ? -1 : 1); });
  }

  // Search matching: case, accents, spaces and punctuation don't count ("spider man" finds "Spider-Man").
  function searchKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  }

  // One show's downloaded episodes by season, and the episode to start on: the one in progress, else
  // the one after the last you finished, else the first.
  function showSeasons(library, showId) {
    var bySeason = {};
    library.forEach(function (f) {
      if (f.show !== showId || f.season == null) return;
      (bySeason[f.season] = bySeason[f.season] || []).push(f);
    });
    return Object.keys(bySeason).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      return { number: n, episodes: bySeason[n].sort(function (a, b) { return (a.episode || 0) - (b.episode || 0) || String(a.file || '').localeCompare(String(b.file || '')); }) };
    });
  }
  function startEpisode(seasons, progress, watched) {
    var all = [];
    seasons.forEach(function (s) { all = all.concat(s.episodes); });
    // The newest thing done wins: a half-watched episode, or the one after the newest finished. An older resume
    // point (stopped at the credits before that counted) doesn't pull the show back to that episode.
    var i, best = -1, bestAt = -Infinity, bestDone = false;
    for (i = 0; i < all.length; i++) {
      var ref = progressRef(all[i]), p = progress && progress[ref], w = watched && watched[ref];
      if (resumable(p) && (+p.at || 0) >= bestAt) { best = i; bestAt = +p.at || 0; bestDone = false; }
      if (w && (typeof w === 'number' ? w : 0) >= bestAt) { best = i; bestAt = typeof w === 'number' ? w : 0; bestDone = true; }
    }
    if (best < 0) return all[0] || null;
    return bestDone ? all[Math.min(best + 1, all.length - 1)] : all[best];
  }

  // WebVTT from /api/subs/file/…vtt: cues with start/end in seconds and plain text (tags dropped).
  function parseVtt(text) {
    var cues = [];
    var blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
    var time = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
    blocks.forEach(function (block) {
      var lines = block.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var m = time.exec(lines[i]);
        if (!m) continue;
        var start = (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
        var end = (+m[5] || 0) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
        var body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
        if (body && end > start) cues.push({ start: start, end: end, text: body });
        break;
      }
    });
    return cues.sort(function (a, b) { return a.start - b.start; });
  }
  // Text showing at `t` (overlapping cues are joined), by binary search on start times.
  function cueText(cues, t) {
    var lo = 0, hi = cues.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cues[mid].start <= t) lo = mid + 1; else hi = mid; }
    var out = [];
    for (var i = lo - 1; i >= 0 && i >= lo - 8; i--) if (cues[i].end > t) out.unshift(cues[i].text);
    return out.join('\n');
  }

  // ---------- Live TV ----------
  // Where a channel is now, in its video's seconds: the room's position plus the time since `at` (server clock).
  // Same sum as the web player's playbackPlan (public/watch-sync.js), which this TV can't load.
  function liveTarget(room, serverNow) {
    if (!room || !room.playing) return room ? room.position : 0;
    return room.position + Math.max(0, serverNow - room.at) / 1000;
  }
  // The server clock from round trips: the offset of the quickest one (like WatchSession.sample).
  function clockOffset(samples) {
    var best = null;
    samples.forEach(function (x) { if (!best || x.rtt < best.rtt) best = x; });
    return best ? best.offset : 0;
  }
  function channelName(c, meId) {
    if (!c) return '';
    if (c.kind === 'auto') return ({ anime: T('Anime'), sitcoms: T('Sitcoms'), films: T('Films'), docs: T('Documentaries'), fresh: T('Fresh'), drama: T('Drama'), scifi: T('Sci-Fi & Fantasy'), action: T('Action & Adventure') })[c.id] || c.id;
    if (c.kind === 'picks') return c.id === 'picks-' + meId ? T('Your picks') : T('{0}’s picks', c.person || '');
    return c.name || '';
  }
  function programmeLine(p) {
    if (!p || p.kind !== 'episode') return '';
    return [episodeLabel(p), p.name].filter(Boolean).join(' · ');
  }
  function clock(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  // The channel `step` away from `id` in the guide's order (round at the ends).
  function neighbour(channels, id, step) {
    if (!channels.length) return null;
    var at = 0;
    for (var i = 0; i < channels.length; i++) if (channels[i].id === id) at = i;
    return channels[(at + step + channels.length * 4) % channels.length];
  }

  // ---------- colour themes: the same presets as the web app (public/app.js THEMES) ----------
  // A person's theme is saved on the server ({ preset } or { preset: 'custom', colors }), so the TV
  // paints itself the way they picked on their phone or computer.
  var THEMES = {
    lilin: { bg: '#140A14', surface: '#1D121C', raised: '#2A1C28', line: '#3A2A36', text: '#EFE8E1', muted: '#B8AAB2', accent: '#FB2C16', alert: '#FF9B85' },
    dusk: { bg: '#17111F', surface: '#211A2C', raised: '#2D2440', line: '#3C3152', text: '#EFE8E1', muted: '#B3A8C4', accent: '#A58BC9', alert: '#FF9B85' },
    bone: { bg: '#EFE8E1', surface: '#F8F4EF', raised: '#E4DBD2', line: '#D3C7BC', text: '#140A14', muted: '#6B5A66', accent: '#D42A14', alert: '#B42318' },
    midnight: { bg: '#0E1320', surface: '#161D2E', raised: '#1F2840', line: '#2A3552', text: '#E8EEF8', muted: '#96A3BD', accent: '#5CC8FF', alert: '#FF8A8A' },
    forest: { bg: '#0F1A14', surface: '#16241C', raised: '#1E3127', line: '#2A4134', text: '#E9F2EA', muted: '#9DB5A4', accent: '#9BE07A', alert: '#FF9B85' },
    ember: { bg: '#161312', surface: '#221D1B', raised: '#2E2724', line: '#3D3430', text: '#F5EDE8', muted: '#B3A49C', accent: '#FF7A3D', alert: '#FF8A8A' },
    lagoon: { bg: '#0B1A1C', surface: '#112629', raised: '#183337', line: '#22444A', text: '#E3F4F4', muted: '#93B8BA', accent: '#3DDBC4', alert: '#FF9B85' },
    synth: { bg: '#140F24', surface: '#1D1633', raised: '#281E45', line: '#352858', text: '#F0EAFF', muted: '#A99BC9', accent: '#FF5FA2', alert: '#FFB36B' },
    noir: { bg: '#111111', surface: '#1B1B1B', raised: '#262626', line: '#333333', text: '#F2F2F2', muted: '#A0A0A0', accent: '#E8E8E8', alert: '#FF8A8A' },
    paper: { bg: '#F7F2EA', surface: '#FFFDF9', raised: '#EFE7DB', line: '#DDD2C2', text: '#241A14', muted: '#6E6157', accent: '#C2410C', alert: '#B42318' },
    daylight: { bg: '#F2F5FA', surface: '#FFFFFF', raised: '#E5EBF4', line: '#D2DAE7', text: '#141B2B', muted: '#5A6478', accent: '#2563EB', alert: '#C0262D' },
  };
  var HEX = /^#[0-9a-f]{6}$/i;
  function hexRgb(hex) { return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }); }
  function rgbHex(rgb) {
    return '#' + rgb.map(function (v) { var n = Math.round(Math.max(0, Math.min(255, v))).toString(16); return n.length < 2 ? '0' + n : n; }).join('');
  }
  function mix(a, b, t) { var y = hexRgb(b); return rgbHex(hexRgb(a).map(function (v, i) { return v + (y[i] - v) * t; })); }
  function luminance(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function themeColors(theme, defaultKey) {
    var preset = THEMES[theme && theme.preset] || THEMES[defaultKey] || THEMES.lilin;
    var c = theme && theme.preset === 'custom' && theme.colors;
    if (!c || !HEX.test(c.bg) || !HEX.test(c.surface) || !HEX.test(c.text) || !HEX.test(c.accent)) return preset;
    return { bg: c.bg, surface: c.surface, text: c.text, accent: c.accent,
      raised: mix(c.surface, c.text, 0.08), line: mix(c.surface, c.text, 0.16), muted: mix(c.text, c.bg, 0.38),
      alert: luminance(c.bg) > 0.5 ? '#B42318' : '#FF9B85' };
  }
  // The CSS custom properties tv.css is built on (plus r,g,b triplets for its see-through shades).
  function themeVars(theme, defaultKey) {
    var c = themeColors(theme, defaultKey);
    var light = luminance(c.bg) > 0.5;
    var darkInk = luminance(c.bg) < 0.15 ? c.bg : '#141414';
    var lightInk = luminance(c.bg) > 0.8 ? c.bg : '#FFFFFF';
    var deep = light ? mix(c.bg, '#FFFFFF', 0.4) : mix(c.bg, '#000000', 0.3);
    var trip = function (hex) { return hexRgb(hex).join(', '); };
    return { scheme: light ? 'light' : 'dark', vars: {
      '--velvet': c.bg, '--curtain': c.surface, '--seat': c.raised, '--line': c.line,
      '--paper': c.text, '--dust': c.muted, '--bulb': c.accent, '--alert': c.alert, '--deep': deep,
      '--on-bulb': contrast(darkInk, c.accent) >= contrast(lightInk, c.accent) ? darkInk : lightInk,
      '--velvet-rgb': trip(c.bg), '--curtain-rgb': trip(c.surface), '--seat-rgb': trip(c.raised),
      '--paper-rgb': trip(c.text), '--bulb-rgb': trip(c.accent), '--deep-rgb': trip(deep),
    } };
  }

  var api = {
    themeVars: themeVars, liveTarget: liveTarget, clockOffset: clockOffset, channelName: channelName, programmeLine: programmeLine, clock: clock, neighbour: neighbour,
    AUTOPLAY_SECONDS: AUTOPLAY_SECONDS, AUTOPLAY_CHAIN: AUTOPLAY_CHAIN, DONE_SECONDS: DONE_SECONDS,
    nextEpisode: nextEpisode, nextAfter: nextAfter, nextPromptAt: nextPromptAt, isNextTime: isNextTime, introShowing: introShowing,
    T: T, fmtTime: fmtTime, episodeLabel: episodeLabel, minutesLeft: minutesLeft, progressRef: progressRef, resumable: resumable,
    titleKey: titleKey, transferWord: transferWord, pendingTitles: pendingTitles, homeRows: homeRows, genreRows: genreRows, searchKey: searchKey, showSeasons: showSeasons, startEpisode: startEpisode, parseVtt: parseVtt, cueText: cueText,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LilinTvLogic = api;
})(this);
