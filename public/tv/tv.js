// Lilin's TV app, loaded by the shell in tv/tizen (Samsung) or tv/android (Android TV, which gives it the same
// AVPlay, tizen.* and key codes). Library, Discover, Search and smart downloads.
// Remote-control navigation, the TV's own player (AVPlay: MKV, HEVC, surround),
// and Skip intro / Up next on the screen itself.
// Written for the TV's browser engine (Samsung 2020 = Chrome 69): no optional chaining, nullish coalescing, or newer built-ins.
(function () {
  'use strict';
  var L = window.LilinTvLogic;
  var T = L.T; // Swedish when the shell loaded public/tv/sv.js (Samsung always; Android on a Swedish TV), else English
  var SERVER = String(window.LILIN_SERVER || '').replace(/\/+$/, '');
  var TOKEN_KEY = 'lilin:tv-session';    // a session token, or "home" for the shared Home network account
  var WATCHED_KEY = 'lilin:tv-watched';  // episodes finished on this TV, to pick where a show continues
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, BACKSPACE: 8, ESC: 27,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, CH_UP: 427, CH_DOWN: 428, PRE_CH: 10190 };
  var app = document.getElementById('app');
  var state = { me: null, library: [], shows: [], progress: {}, genres: [], pending: [], focusPending: false };

  // ---------- colours: the person's theme from Settings → Appearance (saved on the server) ----------
  var THEME_KEY = 'lilin:tv-theme'; // the last theme, so the boot screen already has the right colours
  function paintTheme(t) {
    if (!t || !t.vars) return;
    var root = document.documentElement;
    for (var k in t.vars) if (Object.prototype.hasOwnProperty.call(t.vars, k)) root.style.setProperty(k, t.vars[k]);
    root.setAttribute('data-scheme', t.scheme === 'light' ? 'light' : 'dark');
  }
  function applyTheme(me, rules) {
    var t = L.themeVars(me && me.settings && me.settings.theme, rules && rules.defaultTheme);
    paintTheme(t);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) { /* full or blocked */ }
  }
  try { paintTheme(JSON.parse(localStorage.getItem(THEME_KEY) || 'null')); } catch (e) { /* none saved */ }
  var screen = null;
  var history = [];
  var autoChain = 0;

  // ---------- small helpers ----------
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  function img(src, cls) {
    var i = h('img', { class: cls || '', alt: '', decoding: 'async' });
    if (src) i.src = src; else i.className += ' is-empty';
    i.onerror = function () { i.removeAttribute('src'); i.className += ' is-empty'; };
    return i;
  }
  function bigger(src) { return src ? String(src).replace('/t/p/w300/', '/t/p/w780/') : src; }
  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('toast') || document.body.appendChild(h('div', { id: 'toast', role: 'status' }));
    t.textContent = text; t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 3500);
  }
  function load(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }

  // "Medverkande: …" under a description; stays empty when TMDB has no cast or the title isn't on TMDB.
  // The title as TMDB's logo art when there is one (like the web app's title pages); the text stays until it has loaded.
  function titleLogo(heading, type, id, name) {
    if (!id || (type !== 'movie' && type !== 'tv')) return heading;
    api('/api/title/' + type + '/' + id + '/page').then(function (d) {
      var logo = d.page && d.page.logo;
      if (!logo || !logo.url) return;
      var pic = new Image();
      pic.className = 'title-logo';
      pic.alt = name || '';
      pic.onload = function () { heading.textContent = ''; heading.appendChild(pic); };
      pic.src = logo.url;
    }).catch(function () {});
    return heading;
  }

  function castLine(type, id, cls) {
    var line = h('p', { class: cls });
    if (id) api('/api/title/' + type + '/' + id + '/cast').then(function (d) {
      if (d.cast && d.cast.length) line.textContent = T('Cast:') + ' ' + d.cast.join(', ');
    }).catch(function () {});
    return line;
  }

  function api(path, body) {
    var headers = { 'X-Lilin-TV': '1', 'X-Lilin-Lang': window.LilinTvStrings ? 'sv' : 'en' };
    var t = token();
    if (t && t !== 'home') headers['X-Lilin-Session'] = t;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(SERVER + path, { method: body !== undefined ? 'POST' : 'GET', headers: headers, credentials: 'omit',
      body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.ok) return d;
          var e = new Error(d.error || T('Lilin answered {0}.', r.status));
          e.status = r.status;
          throw e;
        });
      });
  }

  // ---------- screens ----------
  // A screen is { el, key(code) → handled?, focus(), leave() }. Back pops to the previous screen.
  function show(next, remember) {
    if (screen && remember) history.push(screen);
    else if (screen && screen.leave) screen.leave();
    screen = next;
    app.innerHTML = '';
    app.appendChild(next.el);
    if (next.focus) next.focus();
  }
  function back() {
    var prev = history.pop();
    if (!prev) { exitApp(); return; }
    if (screen && screen.leave) screen.leave();
    screen = prev;
    app.innerHTML = '';
    app.appendChild(prev.el);
    if (prev.refresh) prev.refresh();
    if (prev.focus) prev.focus();
  }
  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* in a desktop browser */ }
  }

  document.addEventListener('keydown', function (e) {
    autoChain = 0; // someone is there: Up next may chain again
    var code = e.keyCode;
    if (code === KEY.BACKSPACE || code === KEY.ESC) code = KEY.BACK;
    if (screen && screen.key && screen.key(code, e)) { e.preventDefault(); return; }
    if (code === KEY.BACK) { e.preventDefault(); back(); }
  });

  // ---------- signing in ----------
  function start() {
    try {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown', 'PreviousChannel',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* not on this model */ }
      });
    } catch (e) { /* not on a TV */ }
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'boot' }, h('div', { class: 'wordmark', text: 'Lilin' })));
    api('/api/status').then(function (status) {
      var me = status.me;
      var t = token();
      if (!t) return pairScreen(me && me.id != null);
      if (t !== 'home' && (!me || me.via !== 'session')) {
        // The TV's session ended (signed out elsewhere, password changed, or a year passed).
        localStorage.removeItem(TOKEN_KEY);
        return pairScreen(me && me.id != null, T('This TV was signed out. Sign it in again.'));
      }
      state.me = me;
      applyTheme(me, status.rules);
      state.liveName = status.liveName || 'Lilin TV';
      // Play first: no library screen; the app opens on Discover with Continue watching on top.
      return Promise.all([loadLibrary(), loadGenres()]).then(function () { discoverScreen(true); });
    }).catch(function (err) {
      if (err.status === 401) { localStorage.removeItem(TOKEN_KEY); return pairScreen(false); }
      app.innerHTML = '';
      app.appendChild(h('div', { class: 'boot' }, h('div', { class: 'wordmark', text: 'Lilin' }),
        h('p', { class: 'boot-note', text: T('Can’t reach Lilin right now ({0}). Trying again…', err.message) })));
      setTimeout(start, 5000);
    });
  }

  // Rows of '0'/'1' from /api/tv/pair/start, black on white, whole pixels per module.
  function drawQr(canvas, rows) {
    var g = canvas.getContext && canvas.getContext('2d');
    if (!g) return;
    g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    if (!rows || !rows.length) return;
    var n = rows.length, m = Math.floor(canvas.width / n), o = Math.floor((canvas.width - m * n) / 2);
    g.fillStyle = '#000';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (rows[y].charAt(x) === '1') g.fillRect(o + x * m, o + y * m, m, m);
  }

  function pairScreen(homeAvailable, note) {
    var codeEl = h('div', { class: 'pair-code', 'aria-live': 'polite' });
    // The QR opens Lilin on a phone that's signed in, which asks before signing this TV in.
    var qrCanvas = h('canvas', { class: 'pair-qr-code', width: '384', height: '384' });
    var qrEl = h('div', { class: 'pair-qr' }, h('div', { class: 'pair-qr-card' }, qrCanvas), h('p', { class: 'pair-qr-cap', text: T('Scan with your phone') }));
    var noteEl = h('p', { class: 'pair-note', text: note || '' });
    var homeBtn = homeAvailable ? h('div', { class: 'pair-alt' }, h('span', { class: 'pair-alt-hint', text: T('No account? Press Down for') }),
      h('button', { class: 'pair-home', text: T('Use the shared Home network account') })) : null;
    var el = h('div', { class: 'screen pair' },
      h('div', { class: 'wordmark', text: 'Lilin' }),
      h('h1', { text: T('Sign in this TV') }),
      h('ol', { class: 'pair-steps' },
        h('li', {}, T('Scan the QR code with your phone’s camera,')),
        h('li', {}, T('or enter this code in Lilin under '), h('b', { text: T('You › Devices') }), ':')),
      codeEl, noteEl, homeBtn, qrEl);
    var poll = null, timer = null, alive = true;
    function newCode() {
      if (!alive) return;
      api('/api/tv/pair/start', {}).then(function (r) {
        poll = r.poll;
        codeEl.innerHTML = '';
        r.code.split('').forEach(function (c, i) { codeEl.appendChild(h('span', { class: i === 3 ? 'gap' : '', text: c })); });
        drawQr(qrCanvas, r.qr);
        noteEl.textContent = note || T('The code changes every {0} minutes.', Math.round(r.expiresIn / 60));
        check();
      }).catch(function (err) { noteEl.textContent = err.message + ' ' + T('Trying again…'); timer = setTimeout(newCode, 5000); });
    }
    function check() {
      if (!alive) return;
      timer = setTimeout(function () {
        api('/api/tv/pair/poll?id=' + encodeURIComponent(poll)).then(function (r) {
          if (r.state === 'approved') { signedIn(r.grant); return; }
          if (r.state === 'expired') { newCode(); return; }
          check();
        }).catch(function () { check(); });
      }, 2000);
    }
    function signedIn(grant) {
      alive = false;
      localStorage.setItem(TOKEN_KEY, grant.token || 'home');
      toast(T('Signed in as {0}', grant.name || T('you')));
      history = [];
      screen = null;
      start();
    }
    // Nothing is focused at first, so a stray OK can't sign the TV in as the shared account.
    var homeFocused = false;
    show({ el: el,
      key: function (code) {
        if (!homeBtn) return false;
        if (code === KEY.DOWN || code === KEY.UP) { homeFocused = code === KEY.DOWN; homeBtn.lastChild.classList.toggle('focus', homeFocused); return true; }
        if (code === KEY.ENTER && homeFocused) { signedIn({ token: null, name: 'Home network' }); return true; }
        return false;
      },
      leave: function () { alive = false; clearTimeout(timer); } });
    newCode();
  }

  function loadLibrary() {
    return Promise.all([api('/api/library'), api('/api/me/progress').catch(function () { return { progress: {} }; }), loadPending()]).then(function (r) {
      state.library = r[0].items || [];
      state.shows = r[0].shows || [];
      state.progress = r[1].progress || {};
      state.hidden = r[1].hidden || {};
    });
  }
  // Downloads on their way show in the library straight away. Never fails: the library works without them.
  function loadPending() {
    return api('/api/downloads').then(function (d) { state.pending = L.pendingTitles(d.items); })
      .catch(function () { state.pending = []; });
  }
  function pendingFor(t) {
    var key = t.type === 'tv' ? 'tv:tv-' + t.id : 'movie:' + t.id;
    return state.pending.filter(function (p) { return p.key === key; })[0] || null;
  }
  // ---------- genres ----------
  // One merged list from the server: { name, movie: TMDB film genre ID, tv: TMDB show genre ID }.
  function loadGenres() {
    return api('/api/discover/genres').then(function (d) { state.genres = d.genres || []; })
      .catch(function () { state.genres = []; });
  }
  function genreNames(type, ids) {
    var out = [];
    (ids || []).forEach(function (id) {
      state.genres.forEach(function (g) { if ((type === 'tv' ? g.tv : g.movie) === id && out.indexOf(g.name) < 0) out.push(g.name); });
    });
    return out;
  }
  function genreUrl(g, type, sort, page) {
    return '/api/discover/genre?type=' + type + (g.movie && type !== 'tv' ? '&movie=' + g.movie : '') +
      (g.tv && type !== 'movie' ? '&tv=' + g.tv : '') + '&sort=' + sort + '&page=' + page;
  }

  // ---------- cards ----------
  // Posters load only when their card comes near the screen, so long rows and grids stay cheap on the TV.
  function lazy(src) {
    var i = h('img', { alt: '', decoding: 'async' });
    var woke = false;
    return { el: i, wake: function () {
      if (woke) return;
      woke = true;
      if (!src) { i.className = 'is-empty'; return; }
      i.onerror = function () { i.removeAttribute('src'); i.className = 'is-empty'; };
      i.src = src;
    } };
  }
  function badge() { return h('span', { class: 'tv-badge', text: T('In library') }); }
  function titleSub(t) { return t.soon && t.soon.date ? soonSub(t.soon) : [t.year, t.type === 'tv' ? T('Series') : T('Film')].filter(Boolean).join(' · '); }
  // comingsoon: Coming soon cards say what comes out when ("In cinemas · 21 Nov"), from the server's soon field.
  function soonSub(s) {
    var when = s.date;
    try { when = new Date(s.date + 'T12:00:00Z').toLocaleDateString(window.LilinTvStrings ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch (e) { /* old browser: the ISO date */ }
    var kind = s.kind === 'cinema' ? T('In cinemas') : s.kind === 'digital' ? T('Streaming') : s.kind === 'disc' ? T('On disc')
      : s.kind === 'premiere' ? T('New series') : s.kind === 'season' ? T('Season {0}', s.season) : '';
    return [kind, when].filter(Boolean).join(' · ');
  }

  function onWayBar(p) { return p ? barFor(p.progress).el : null; }
  // A film or show from TMDB (Discover, search). OK opens its page.
  function titleCard(t) {
    var pic = lazy(t.poster);
    return { key: t.type + ':' + t.id, t: t, wake: pic.wake,
      el: h('div', { class: 'card tile' }, h('div', { class: 'art' }, pic.el, libraryEntry(t) ? badge() : null, onWayBar(pendingFor(t))),
        h('div', { class: 'name', text: t.title }), h('div', { class: 'sub', text: titleSub(t) })),
      open: function () { discoverTitle(t); } };
  }
  // Library cards: 'poster' on the home screen, 'tile' (with the In library badge) in search.
  function showCard(s, cls) {
    var pic = lazy(s.poster);
    return { key: s.tmdbId ? 'tv:' + s.tmdbId : s.id, wake: pic.wake,
      el: h('div', { class: 'card ' + (cls || 'poster') }, h('div', { class: 'art' }, pic.el, cls === 'tile' ? badge() : null),
        h('div', { class: 'name', text: s.title }), cls === 'tile' ? h('div', { class: 'sub', text: titleSub({ year: s.year, type: 'tv' }) }) : null),
      open: function () { showPage(s); } };
  }
  function filmCard(f, cls) {
    var pic = lazy(f.poster || f.backdrop);
    return { key: f.tmdbId ? 'movie:' + f.tmdbId : f.id, wake: pic.wake,
      el: h('div', { class: 'card ' + (cls || 'poster') }, h('div', { class: 'art' }, pic.el, cls === 'tile' ? badge() : null),
        h('div', { class: 'name', text: f.filmTitle || f.title }), h('div', { class: 'sub', text: f.year ? String(f.year) : '' })),
      open: function () { playAsked(f); } };
  }
  // A title that's still on its way: the progress updates in place, without redrawing the row.
  function pendingPercent(p) { return p.progress != null && p.progress < 1 ? Math.floor(p.progress * 100) + ' %' : ''; }
  function pendingText(p) { return [pendingPercent(p), p.word].filter(Boolean).join(' · '); }
  // The bar's fill: how far along, or a moving stripe while nobody knows yet (a torrent without its file list).
  function setBar(bar, fill, progress) {
    var unknown = progress == null;
    bar.classList.toggle('is-unknown', unknown);
    fill.style.width = unknown ? '' : (progress * 100).toFixed(1) + '%';
  }
  function barFor(progress) {
    var fill = h('i'), bar = h('div', { class: 'bar' }, fill);
    setBar(bar, fill, progress);
    return { el: bar, set: function (next) { setBar(bar, fill, next); } };
  }
  // A long bar with its words above, for a title's page. set(null) hides it.
  function progressStrip() {
    var text = h('div', { class: 'strip-text' }), fill = h('i'), bar = h('div', { class: 'strip-bar' }, fill);
    var el = h('div', { class: 'progress-strip', style: 'display:none' }, text, bar);
    return { el: el, set: function (p) {
      el.style.display = p ? '' : 'none';
      if (!p) return;
      text.textContent = pendingText(p);
      setBar(bar, fill, p.progress);
    } };
  }
  // Keeps asking how downloads are doing while a screen is open. each() runs after every answer.
  function followPending(isOpen, each) {
    function tick() {
      if (!isOpen()) return;
      loadPending().then(function () { if (isOpen()) { each(); setTimeout(tick, 5000); } });
    }
    setTimeout(tick, 5000);
  }
  function pendingForPath(path) {
    return state.pending.filter(function (p) { return p.items.some(function (d) { return d.svtPath === path; }); })[0] || null;
  }
  function pendingNamed(name) {
    var key = L.searchKey(name);
    return state.pending.filter(function (p) { return L.searchKey(p.title) === key; })[0] || null;
  }
  function pendingCard(p) {
    var pic = lazy(p.poster || p.backdrop);
    var bar = barFor(p.progress);
    var sub = h('div', { class: 'sub', text: p.word });
    var pct = h('span', { class: 'pct', text: pendingPercent(p) });
    return { key: p.key, wake: pic.wake, update: function (next) {
        bar.set(next.progress);
        sub.textContent = next.word;
        pct.textContent = pendingPercent(next);
        p = next;
      },
      el: h('div', { class: 'card poster' }, h('div', { class: 'art' }, pic.el, pct, bar.el),
        h('div', { class: 'name', text: p.title }), sub),
      open: function () {
        var show = p.type === 'tv' && state.shows.filter(function (s) { return s.id === p.showId; })[0];
        if (show) return showPage(show);
        var path = p.items[0] && p.items[0].svtPath;
        if (path) return svtScreen({ type: 'svt', path: path, title: p.title, backdrop: p.backdrop, kind: p.type === 'tv' ? 'series' : 'film' });
        if (p.tmdbId != null) return discoverTitle({ type: p.type, id: p.tmdbId, title: p.title, poster: p.poster, backdrop: p.backdrop, year: p.year });
        toast(p.word);
      } };
  }
  // upNext: the episode after one you finished (it starts from the beginning).
  // Like the website: a sharp frame where you stopped, grabbed by the server (cached, times rounded to 10 s), fading in
  // over the still once it's here. Fetched with the TV's session (an <img> can't send it); the still stays if it fails.
  function sharpFrame(art, id, time) {
    if (art.getAttribute('data-frame') || typeof URL === 'undefined' || !URL.createObjectURL) return;
    art.setAttribute('data-frame', '1');
    var headers = { 'X-Lilin-TV': '1' }, t = token();
    if (t && t !== 'home') headers['X-Lilin-Session'] = t;
    fetch(SERVER + '/api/media/lib/' + encodeURIComponent(id) + '/still?t=' + Math.floor(time / 10) * 10, { headers: headers, credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) {
        var frame = h('img', { class: 'frame', alt: '', decoding: 'async' });
        frame.onload = function () { frame.className = 'frame in'; };
        frame.src = URL.createObjectURL(blob);
        art.insertBefore(frame, art.querySelector('.bar'));
      }).catch(function () { /* no frame there: the still stays */ });
  }
  function continueCard(f, upNext) {
    var p = upNext ? { time: 0, duration: 1 } : state.progress[L.progressRef(f)];
    var showInfo = showOf(f);
    var pct = Math.min(100, p.time / p.duration * 100);
    var pic = lazy(f.season != null ? bigger(f.still) || (showInfo && showInfo.backdrop) : f.backdrop || f.poster);
    var art = h('div', { class: 'art' }, pic.el, h('div', { class: 'bar' }, h('i', { style: 'width:' + pct.toFixed(1) + '%' })));
    var wake = upNext || !(p.time > 30) ? pic.wake : function () { pic.wake(); sharpFrame(art, f.id, p.time); };
    return { key: f.id, wake: wake,
      el: h('div', { class: 'card wide' },
        art,
        h('div', { class: 'name', text: showInfo ? showInfo.title : f.filmTitle || f.title }),
        h('div', { class: 'sub', text: [L.episodeLabel(f), f.episodeName, upNext ? T('Up next') : L.minutesLeft(p)].filter(Boolean).join(' · ') })),
      open: function () { play(f, p.time); } };
  }

  // ---------- rows of cards (home and Discover) ----------
  // A row can grow while you move along it (fetch(page) -> { cards, last }) up to ROW_MAX cards, end in a
  // "See all" card, or load its first page only when it comes near the screen (lazy). A key press touches
  // only the focused card and the focused row.
  var ROW_MAX = 60, CARD_GAP = 32, ROW_WIDTH = 1920 - 2 * 96;
  function makeRow(o) {
    var row = { kind: o.kind || 'poster', items: [], index: 0, first: 0, page: 1, busy: false, seen: {},
      fetch: o.fetch || null, done: !o.fetch, pending: Boolean(o.lazy), skip: false, seeAll: o.seeAll || null, end: null };
    row.track = h('div', { class: 'track' });
    row.note = row.pending ? h('div', { class: 'row-note', text: T('Loading…') }) : null;
    row.el = h('section', { class: 'row row-' + row.kind + (row.pending ? ' is-pending' : '') }, h('h2', { text: o.title }),
      h('div', { class: 'viewport' }, row.note, row.track));
    if (!row.pending) addEnd(row);
    if (o.items) addCards(row, o.items);
    return row;
  }
  function addEnd(row) {
    if (!row.seeAll || row.end) return;
    row.end = { el: h('div', { class: 'card see-all ' + (row.kind === 'tile' || row.kind === 'svt' ? row.kind : 'poster') }, h('div', { class: 'art' }, h('span', { text: T('See all') }))),
      open: row.seeAll };
    row.track.appendChild(row.end.el);
    row.items.push(row.end);
  }
  function addCards(row, cards) {
    var count = row.items.length - (row.end ? 1 : 0);
    cards.forEach(function (c) {
      if (count >= ROW_MAX || (c.key && row.seen[c.key])) return;
      if (c.key) row.seen[c.key] = true;
      if (row.end) { row.track.insertBefore(c.el, row.end.el); row.items.splice(row.items.length - 1, 0, c); }
      else { row.track.appendChild(c.el); row.items.push(c); }
      count++;
    });
    if (count >= ROW_MAX) row.done = true;
  }
  function pageOf(d, page) {
    return { cards: (d.results || []).map(titleCard), last: (d.page || page) >= (d.totalPages || 1) };
  }

  // Up/Down between rows, Left/Right along one. `top`: where the focused row sits in the rows box.
  function rowsNav(rowsEl, top, onFocus) {
    var nav = { rows: [], r: 0, lit: null, on: true };
    nav.find = function (from, dir) {
      for (var i = from; i >= 0 && i < nav.rows.length; i += dir) if (!nav.rows[i].skip) return i;
      return -1;
    };
    nav.set = function (rows) {
      nav.rows = rows; nav.lit = null;
      rowsEl.innerHTML = '';
      rows.forEach(function (row) { rowsEl.appendChild(row.el); });
      nav.r = Math.max(0, nav.find(0, 1));
    };
    nav.current = function () { var row = nav.rows[nav.r]; return row && !row.skip && row.items[row.index] || null; };
    nav.move = function (dir) {
      var i = nav.find(nav.r + dir, dir);
      if (i < 0) return false;
      nav.r = i; nav.paint(true);
      return true;
    };
    nav.side = function (dir) {
      var row = nav.rows[nav.r];
      if (!row || !row.items.length) return;
      row.index = Math.max(0, Math.min(row.items.length - 1, row.index + dir));
      nav.paint(true);
    };
    function slide(row) {
      if (!row.items.length) return;
      if (!row.step) { var w = row.items[0].el.offsetWidth; if (!w) return; row.step = w + CARD_GAP; }
      var visible = Math.max(1, Math.floor(ROW_WIDTH / row.step));
      var first = Math.max(0, Math.min(row.index - 1, row.items.length - visible));
      if (first !== row.first || !row.slid) {
        row.first = first; row.slid = true;
        row.track.style.transform = 'translateX(' + (-first * row.step) + 'px)';
      }
    }
    function wakeRow(row) {
      var n = Math.ceil(ROW_WIDTH / (row.step || 200)) + 2;
      for (var j = row.first; j < Math.min(row.items.length, row.first + n); j++) if (row.items[j].wake) row.items[j].wake();
    }
    function settle() {
      if (nav.rows[nav.r] && nav.rows[nav.r].skip) {
        var i = nav.find(nav.r, 1);
        if (i < 0) i = nav.find(nav.r, -1);
        if (i >= 0) nav.r = i;
      }
      nav.paint(nav.on);
    }
    function loadRow(row) {
      row.pending = false; row.busy = true;
      row.fetch(1).then(function (res) {
        row.busy = false;
        if (row.note && row.note.parentNode) row.note.parentNode.removeChild(row.note);
        row.el.classList.remove('is-pending');
        addEnd(row);
        addCards(row, res.cards);
        if (res.last) row.done = true;
        if (row.items.length <= (row.end ? 1 : 0)) { row.skip = true; row.el.style.display = 'none'; }
        settle();
      }).catch(function () { row.busy = false; row.skip = true; row.el.style.display = 'none'; settle(); });
    }
    function more(row) {
      var count = row.items.length - (row.end ? 1 : 0);
      if (row.done || row.busy || !row.fetch || row.index < count - 8) return;
      row.busy = true;
      row.fetch(row.page + 1).then(function (res) {
        row.busy = false; row.page++;
        var before = row.items.length;
        addCards(row, res.cards);
        if (res.last || row.items.length === before) row.done = true;
        if (row === nav.rows[nav.r]) nav.paint(nav.on); else wakeRow(row);
      }).catch(function () { row.busy = false; row.done = true; });
    }
    nav.paint = function (on) {
      nav.on = on !== false;
      var row = nav.rows[nav.r];
      var card = nav.on && row && !row.skip ? row.items[row.index] : null;
      var el = card ? card.el : null;
      if (nav.lit !== el) {
        if (nav.lit) nav.lit.classList.remove('focus');
        nav.lit = el;
        if (el) el.classList.add('focus');
      }
      if (row) slide(row);
      rowsEl.style.transform = 'translateY(' + (row && nav.on ? -Math.max(0, row.el.offsetTop - top) : 0) + 'px)';
      for (var i = Math.max(0, nav.r - 1); i < Math.min(nav.rows.length, nav.r + 3); i++) {
        var near = nav.rows[i];
        if (near.pending) loadRow(near);
        if (!near.skip) wakeRow(near);
      }
      if (row && !row.skip) more(row);
      if (card && onFocus) onFocus(card);
    };
    return nav;
  }

  // ---------- grids (See all, genres, search results) ----------
  var GRID_STEP = 196 + 20, GRID_MAX = 300;
  function gridView(cols, onNeedMore, step) {
    var g = { cols: cols, cards: [], i: 0, lit: null, seen: {}, el: h('div', { class: 'grid', style: 'width:' + cols * (step || GRID_STEP) + 'px' }) };
    g.clear = function () { g.cards = []; g.seen = {}; g.i = 0; g.lit = null; g.el.innerHTML = ''; g.el.style.transform = ''; };
    g.add = function (cards) {
      cards.forEach(function (c) {
        if (c.key && g.seen[c.key]) return;
        if (c.key) g.seen[c.key] = true;
        g.cards.push(c); g.el.appendChild(c.el);
      });
    };
    g.current = function () { return g.cards[g.i] || null; };
    // false at an edge, so the screen can move focus elsewhere
    g.move = function (code) {
      var n = g.cards.length, i = g.i, col = i % cols;
      if (code === KEY.LEFT) { if (col === 0) return false; i--; }
      else if (code === KEY.RIGHT) { if (col === cols - 1 || i + 1 >= n) return false; i++; }
      else if (code === KEY.UP) { if (i < cols) return false; i -= cols; }
      else if (code === KEY.DOWN) { if (Math.floor(i / cols) >= Math.floor((n - 1) / cols)) return false; i = Math.min(n - 1, i + cols); }
      else return false;
      g.i = i;
      return true;
    };
    g.paint = function (on) {
      var c = on !== false ? g.cards[g.i] : null, el = c ? c.el : null;
      if (g.lit !== el) {
        if (g.lit) g.lit.classList.remove('focus');
        g.lit = el;
        if (el) el.classList.add('focus');
      }
      var row = Math.floor(g.i / cols), lastRow = Math.floor((g.cards.length - 1) / cols);
      var anchor = g.cards[Math.max(0, row - 1) * cols];
      var y = anchor && row > 0 ? anchor.el.offsetTop - g.cards[0].el.offsetTop : 0;
      g.el.style.transform = 'translateY(' + (-y) + 'px)';
      for (var k = Math.max(0, (row - 1) * cols); k < Math.min(g.cards.length, (row + 4) * cols); k++) if (g.cards[k].wake) g.cards[k].wake();
      if (onNeedMore && g.cards.length && row >= lastRow - 2) onNeedMore();
    };
    return g;
  }

  var SVT_STEP = 400 + 20;
  var TYPES = [['all', T('All')], ['movie', T('Films')], ['tv', T('Shows')]];
  var SORTS = [['popular', T('Popular')], ['rating', T('Top rated')], ['newest', T('Newest')]];
  // o: { title, fetch(page, type, sort) -> Promise<{ cards, last }>, type, types: bool, sorts: bool }
  function gridScreen(o) {
    var type = o.type || 'all', sort = 'popular', seq = 0, page = 0, last = false, busy = false;
    var chips = [];
    if (o.types) TYPES.forEach(function (t) { chips.push({ kind: 'type', value: t[0], el: h('button', { class: 'tab', text: t[1] }) }); });
    if (o.sorts) SORTS.forEach(function (s, i) { chips.push({ kind: 'sort', value: s[0], el: h('button', { class: 'tab' + (i === 0 && chips.length ? ' gap' : ''), text: s[1] }) }); });
    var note = h('div', { class: 'grid-note' });
    var grid = o.wide ? gridView(4, more, SVT_STEP) : gridView(8, more);
    var el = h('div', { class: 'screen grid-screen' },
      h('header', { class: 'grid-head' }, h('h1', { text: o.title }),
        chips.length ? h('div', { class: 'chips' }, chips.map(function (c) { return c.el; })) : null),
      h('div', { class: 'grid-viewport' + (chips.length ? '' : ' no-chips') }, note, grid.el));
    var atTop = false, ci = 0;
    function paint() {
      chips.forEach(function (c, i) {
        c.el.classList.toggle('active', c.kind === 'type' ? c.value === type : c.value === sort);
        c.el.classList.toggle('focus', atTop && i === ci);
      });
      grid.paint(!atTop);
    }
    function reload() { seq++; page = 0; last = false; busy = false; grid.clear(); note.textContent = T('Loading…'); more(); }
    function more() {
      if (busy || last) return;
      busy = true;
      var my = seq;
      o.fetch(page + 1, type, sort).then(function (res) {
        if (my !== seq) return;
        busy = false; page++;
        var before = grid.cards.length;
        grid.add(res.cards);
        if (res.last || grid.cards.length === before || grid.cards.length >= GRID_MAX) last = true;
        note.textContent = grid.cards.length ? '' : T('Nothing here yet.');
        if (!grid.cards.length && chips.length) atTop = true;
        paint();
      }).catch(function (err) { if (my !== seq) return; busy = false; last = true; note.textContent = err.message; });
    }
    show({ el: el, focus: paint, key: function (code) {
      if (atTop) {
        if (code === KEY.LEFT) { ci = Math.max(0, ci - 1); paint(); return true; }
        if (code === KEY.RIGHT) { ci = Math.min(chips.length - 1, ci + 1); paint(); return true; }
        if (code === KEY.DOWN) { if (grid.cards.length) atTop = false; paint(); return true; }
        if (code === KEY.ENTER) {
          var c = chips[ci];
          if (c.kind === 'type') type = c.value; else sort = c.value;
          reload(); paint();
          return true;
        }
        return code === KEY.UP;
      }
      if (code === KEY.ENTER) { var card = grid.current(); if (card) card.open(); return true; }
      if (code === KEY.UP || code === KEY.DOWN || code === KEY.LEFT || code === KEY.RIGHT) {
        if (!grid.move(code) && code === KEY.UP && chips.length) atTop = true;
        paint();
        return true;
      }
      return false;
    } }, true);
    reload();
  }
  function genreGrid(g, type) {
    var both = Boolean(g.movie && g.tv);
    gridScreen({ title: g.name, type: both ? type : g.movie ? 'movie' : 'tv', types: both, sorts: true,
      fetch: function (page, t, sort) { return api(genreUrl(g, t, sort, page)).then(function (d) { return pageOf(d, page); }); } });
  }
  function vibeGrid(v, type) {
    var both = !v.types || v.types.length > 1;
    var got = null;
    gridScreen({ title: v.name, type: both ? (type || 'all') : v.types[0], types: both,
      fetch: function (page, t) {
        if (page > 1) return Promise.resolve({ cards: [], last: true });
        return (got || (got = api('/api/vibes/' + encodeURIComponent(v.id)))).then(function (d) {
          var list = (d.results || []).filter(function (x) { return t === 'all' || x.type === t; });
          return { cards: list.map(titleCard), last: true };
        });
      } });
  }
  function listFetch(key) {
    return function (page) {
      return api('/api/discover/list?key=' + encodeURIComponent(key) + '&page=' + page).then(function (d) { return pageOf(d, page); });
    };
  }

  // ---------- home: Continue watching, Shows, Films, then the library by genre ----------
  // A library the owner shares between people (Settings -> People) shows everyone's titles here.
  function sharedNote() {
    var mates = (state.me && state.me.sharedWith || []).map(function (m) { return m.name; });
    if (!mates.length) return null;
    var names = mates.length < 2 ? mates[0] : T('{0} and {1}', mates.slice(0, -1).join(', '), mates[mates.length - 1]);
    return h('span', { class: 'shared', text: T('Shared with {0}', names) });
  }

  function homeScreen() {
    var el = h('div', { class: 'screen home' });
    var rowsEl = h('div', { class: 'rows' });
    var tops = [h('button', { class: 'top-link', text: T('Search') }), h('button', { class: 'top-link live-link', text: state.liveName || 'Lilin TV' }),
      h('button', { class: 'top-link', text: T('Discover') }),
      h('button', { class: 'top-link', text: T('Documentaries') }), h('button', { class: 'switch', text: T('Switch account') })];
    var top = h('header', { class: 'topbar' }, h('div', { class: 'brandline' },
        h('div', { class: 'wordmark', text: 'Lilin' })),
      h('div', { class: 'top-actions' }, tops[0], tops[1], tops[2], tops[3],
        h('div', { class: 'who' }, h('span', { text: state.me && state.me.name || '' }), sharedNote(), tops[4])));
    el.appendChild(top);
    el.appendChild(rowsEl);
    var nav = rowsNav(rowsEl, 40);
    var atTop = false, ti = 1, empty = false, pendingRow = null, watchTimer = null, me = null, gone = false;

    // Keeps the row of what's on its way current while the library is on screen. Progress changes touch
    // only the cards in that row; a title arriving or finishing redraws the rows.
    function watchPending() {
      clearTimeout(watchTimer);
      if (gone) return;
      watchTimer = setTimeout(function () {
        if (screen !== me) return watchPending();
        var before = state.pending.map(function (p) { return p.key; }).join();
        loadPending().then(function () {
          if (screen !== me) return;
          if (state.pending.map(function (p) { return p.key; }).join() !== before) return me.refresh();
          if (pendingRow) state.pending.forEach(function (p, i) { if (pendingRow.items[i] && pendingRow.items[i].update) pendingRow.items[i].update(p); });
        }).then(watchPending, watchPending);
      }, state.pending.length ? 5000 : 30000);
    }

    function build() {
      // Coming back from the player rebuilds the rows: keep the row and the card you were on.
      var was = {}, wasRow = nav.rows[nav.r] && nav.rows[nav.r].title;
      nav.rows.forEach(function (row) { was[row.title] = row.index; });
      var data = L.homeRows(state.library, state.shows, state.progress, state.hidden);
      var rows = [];
      function add(title, kind, items) { var row = makeRow({ title: title, kind: kind, items: items }); row.title = title; rows.push(row); }
      if (data.cont.length) add(T('Continue watching'), 'wide', data.cont.map(function (f) { return continueCard(f, data.upNext[f.id]); }));
      var onWay = T('On its way');
      if (state.pending.length) add(onWay, 'poster', state.pending.map(pendingCard));
      if (data.shows.length) add(T('Shows'), 'poster', data.shows.map(function (s) { return showCard(s); }));
      if (data.films.length) add(T('Films'), 'poster', data.films.map(function (f) { return filmCard(f); }));
      L.genreRows(state.library, state.shows, state.genres).forEach(function (g) {
        add(g.name, 'poster', g.titles.map(function (x) { return x.show ? showCard(x.show) : filmCard(x.film); }));
      });
      nav.set(rows);
      rows.forEach(function (row, i) {
        if (was[row.title] != null) row.index = Math.min(was[row.title], row.items.length - 1);
        if (row.title === wasRow) nav.r = i;
      });
      if (state.focusPending) {
        state.focusPending = false;
        rows.forEach(function (row, i) { if (row.title === onWay) { nav.r = i; row.index = 0; atTop = false; } });
      }
      pendingRow = rows.filter(function (row) { return row.title === onWay; })[0] || null;
      empty = !rows.length;
      if (empty) {
        rowsEl.appendChild(h('div', { class: 'empty' }, h('h2', { text: T('Your library is empty') }),
          h('p', { text: T('Open Discover or Search above to find something to download.') })));
        atTop = true;
      }
    }
    function paint() {
      tops.forEach(function (b, i) { b.classList.toggle('focus', atTop && i === ti); });
      nav.paint(!atTop);
    }
    build();
    me = { el: el,
      focus: paint,
      leave: function () { gone = true; clearTimeout(watchTimer); },
      refresh: function () {
        return Promise.all([loadLibrary(), state.genres.length ? null : loadGenres()]).then(function () { build(); paint(); }).catch(function () {});
      },
      key: function (code) {
        if (atTop) {
          if (code === KEY.LEFT) { ti = Math.max(0, ti - 1); paint(); return true; }
          if (code === KEY.RIGHT) { ti = Math.min(tops.length - 1, ti + 1); paint(); return true; }
          if (code === KEY.DOWN) { if (!empty) atTop = false; paint(); return true; }
          if (code === KEY.ENTER) {
            if (ti === 0) searchScreen();
            else if (ti === 1) liveScreen();
            else if (ti === 2) discoverScreen();
            else if (ti === 3) docsScreen();
            else { localStorage.removeItem(TOKEN_KEY); history = []; screen = null; pairScreen(true); }
            return true;
          }
          return code === KEY.UP;
        }
        if (code === KEY.UP) { if (!nav.move(-1)) { atTop = true; paint(); } return true; }
        if (code === KEY.DOWN) { nav.move(1); return true; }
        if (code === KEY.LEFT || code === KEY.RIGHT) { nav.side(code === KEY.LEFT ? -1 : 1); return true; }
        if (code === KEY.ENTER) { var c = nav.current(); if (c) c.open(); return true; }
        return false;
      } };
    show(me);
    watchPending();
  }

  // ---------- Discover ----------
  // Curated rows that keep loading as you move along them, a row of genres, then one row per genre
  // (each loads when it comes near the screen). TMDB, torrent search, release choice and qBittorrent all
  // stay on the server; the 2020 TV only draws cards near the screen.
  // What this person owns, by TMDB ID (rebuilt when the library reloads): badges, Play/Open, search.
  var ownedCache = null, ownedFor = null;
  function owned() {
    if (ownedCache && ownedFor === state.library) return ownedCache;
    var films = {}, shows = {}, showIds = {};
    state.library.forEach(function (f) {
      if (f.season == null) { if (f.tmdbId && !films[f.tmdbId]) films[f.tmdbId] = f; }
      else if (f.show) showIds[f.show] = true;
    });
    state.shows.forEach(function (s) {
      if (!showIds[s.id]) return;
      if (s.tmdbId) shows[s.tmdbId] = s;
      var m = /^tv-(\d+)$/.exec(String(s.id));
      if (m) shows[m[1]] = s;
    });
    ownedFor = state.library;
    ownedCache = { films: films, shows: shows, showIds: showIds };
    return ownedCache;
  }
  function libraryEntry(t) {
    var o = owned();
    if (t.type === 'movie') return o.films[t.id] ? { film: o.films[t.id] } : null;
    return o.shows[t.id] ? { show: o.shows[t.id] } : null;
  }

  // root: the app's first screen (Continue watching on top, Live TV and Switch account in the bar).
  function discoverScreen(root) {
    var type = 'all', seq = 0, atTop = false, ti = root ? 2 : 1;
    var heroArt = h('img', { alt: '', decoding: 'async', class: 'is-empty' });
    heroArt.onerror = function () { heroArt.removeAttribute('src'); heroArt.className = 'is-empty'; };
    var heroTitle = h('h1'), heroMeta = h('div', { class: 'hero-meta' }), heroText = h('p', { class: 'hero-overview' });
    var tabs = [h('button', { class: 'top-link search-tab', text: T('Search') })], kinds = ['search'];
    if (root) { tabs.push(h('button', { class: 'top-link live-link', text: state.liveName || 'Lilin TV' })); kinds.push('live'); }
    TYPES.forEach(function (t) { tabs.push(h('button', { class: 'tab', text: t[1] })); kinds.push('type:' + t[0]); });
    tabs.push(h('button', { class: 'tab', text: T('Documentaries') })); kinds.push('docs');
    if (root) { tabs.push(h('button', { class: 'tab', text: T('Switch account') })); kinds.push('switch'); }
    function typeTab() { return kinds.indexOf('type:' + type); }
    var CONT = T('Continue watching');
    function contRow() {
      if (!root) return null;
      var data = L.homeRows(state.library, state.shows, state.progress, state.hidden);
      if (!data.cont.length) return null;
      var row = makeRow({ title: CONT, kind: 'wide', items: data.cont.map(function (f) { return continueCard(f, data.upNext[f.id]); }) });
      row.title = CONT;
      return row;
    }
    var rowsEl = h('div', { class: 'rows' });
    var el = h('div', { class: 'screen discover-screen' },
      h('div', { class: 'hero' }, h('div', { class: 'hero-art' }, heroArt), h('div', { class: 'hero-copy' }, heroTitle, heroMeta, heroText)),
      h('header', { class: 'topbar' },
        h('div', { class: 'brandline' }, h('div', { class: 'wordmark', text: T('Discover') })),
        h('div', { class: 'top-actions tabs' }, tabs)),
      h('div', { class: 'rows-viewport' }, rowsEl));
    // The big picture and text follow the focused card, a moment after it settles (images are slow here).
    var heroTimer = null, heroKey = null;
    function setHero(t, key) {
      heroKey = key;
      heroTitle.textContent = t.title;
      heroMeta.textContent = [t.year, t.type === 'tv' ? T('Series') : T('Film'), t.rating ? '★ ' + t.rating : null]
        .concat(genreNames(t.type, t.genres).slice(0, 3)).filter(Boolean).join('  ·  ');
      heroText.textContent = t.overview || '';
      if (t.backdrop) { heroArt.className = ''; if (heroArt.getAttribute('src') !== t.backdrop) heroArt.src = t.backdrop; }
      else { heroArt.removeAttribute('src'); heroArt.className = 'is-empty'; }
    }
    var nav = rowsNav(rowsEl, 0, function (card) {
      if (!card.t || card.key === heroKey) return;
      clearTimeout(heroTimer);
      heroTimer = setTimeout(function () { setHero(card.t, card.key); }, 220);
    });

    function genreCard(g, i) {
      return { key: 'genre:' + g.name, el: h('div', { class: 'card genre g' + (i % 6) }, h('div', { class: 'art' }, h('span', { text: g.name }))),
        open: function () { genreGrid(g, type); } };
    }
    // vibes: a mood ("Slow-burn rainy day thriller") as a coloured tile; its titles open as a grid.
    function vibeCard(v) {
      var art = h('div', { class: 'art' }, h('span', { text: v.name }));
      if (v.colors && v.colors.length > 1) art.style.background = 'linear-gradient(135deg, ' + v.colors[0] + ' 0%, ' + v.colors[1] + ' 100%)';
      return { key: 'vibe:' + v.id, el: h('div', { class: 'card genre vibe' }, art), open: function () { vibeGrid(v, type); } };
    }
    function load() {
      var my = ++seq;
      nav.set([]);
      rowsEl.appendChild(h('div', { class: 'empty discover-loading' }, h('h2', { text: T('Loading Discover…') })));
      Promise.all([
        api('/api/discover/home?type=' + type).catch(function (err) { return { rows: [], error: err }; }),
        state.genres.length ? null : loadGenres(),
        api('/api/vibes').catch(function () { return { vibes: [] }; }),
      ]).then(function (r) {
        if (my !== seq) return;
        var data = r[0];
        var rows = (data.rows || []).map(function (row) {
          return makeRow({ title: row.title, kind: 'tile', items: (row.items || []).map(titleCard), fetch: listFetch(row.key),
            seeAll: function () { gridScreen({ title: row.title, fetch: listFetch(row.key) }); } });
        });
        var moods = (r[2].vibes || []).filter(function (v) { return type === 'all' || !v.types || v.types.indexOf(type) >= 0; });
        if (moods.length >= 3) rows.splice(Math.min(1, rows.length), 0, makeRow({ title: T('Moods'), kind: 'genre', items: moods.map(vibeCard) }));
        var cont = contRow();
        if (cont) rows.unshift(cont);
        var gs = state.genres.filter(function (g) { return type === 'all' || (type === 'movie' ? g.movie : g.tv); });
        if (gs.length) {
          rows.push(makeRow({ title: T('Browse by genre'), kind: 'genre', items: gs.map(genreCard) }));
          gs.forEach(function (g) {
            rows.push(makeRow({ title: g.name, kind: 'tile', lazy: true,
              fetch: function (page) { return api(genreUrl(g, type, 'popular', page)).then(function (d) { return pageOf(d, page); }); },
              seeAll: function () { genreGrid(g, type); } }));
          });
        }
        if (!data.rows || !data.rows.length) {
          rowsEl.innerHTML = '';
          rowsEl.appendChild(h('div', { class: 'empty' }, h('h2', { text: data.error ? T('Discover is unavailable') : T('Nothing to discover right now') }),
            h('p', { text: data.error ? data.error.message : T('Check that TMDB is configured on the Lilin server.') })));
          atTop = true; paint();
          return;
        }
        nav.set(rows);
        var first = rows[cont ? Math.min(1, rows.length - 1) : 0].items[0];
        if (first && first.t) setHero(first.t, first.key);
        paint();
      });
    }
    // Back from the player: Continue watching catches up (a rebuild of the whole screen would lose your place).
    function refreshCont() {
      if (!root) return;
      loadLibrary().then(function () {
        if (screen !== me || !nav.rows.length) return;
        var at = -1;
        nav.rows.forEach(function (r, i) { if (r.title === CONT) at = i; });
        var row = contRow();
        if (at < 0 && !row) return;
        var rows = nav.rows.slice(), r = nav.r, keep = at >= 0 ? nav.rows[at].index : 0;
        if (at >= 0 && row) rows[at] = row; else if (row) { rows.unshift(row); r++; } else { rows.splice(at, 1); if (r > at) r--; }
        var idx = rows.map(function (x) { return x.index; });
        nav.set(rows);
        rows.forEach(function (x, i) { x.index = Math.min(idx[i] || 0, x.items.length - 1); });
        if (row && at >= 0) row.index = Math.min(keep, row.items.length - 1);
        nav.r = Math.max(0, Math.min(r, rows.length - 1));
        paint();
      }).catch(function () {});
    }
    function paint() {
      tabs.forEach(function (b, i) {
        b.classList.toggle('focus', atTop && i === ti);
        if (kinds[i].indexOf('type:') === 0) b.classList.toggle('active', kinds[i] === 'type:' + type);
      });
      nav.paint(!atTop);
    }
    var me = { el: el, focus: paint, refresh: function () { paint(); refreshCont(); },
      leave: function () { clearTimeout(heroTimer); seq++; },
      key: function (code) {
        if (atTop) {
          if (code === KEY.LEFT) { ti = Math.max(0, ti - 1); paint(); return true; }
          if (code === KEY.RIGHT) { ti = Math.min(tabs.length - 1, ti + 1); paint(); return true; }
          if (code === KEY.DOWN) { if (nav.current()) atTop = false; paint(); return true; }
          if (code === KEY.ENTER) {
            var k = kinds[ti];
            if (k === 'search') searchScreen();
            else if (k === 'live') liveScreen();
            else if (k === 'docs') docsScreen();
            else if (k === 'switch') { localStorage.removeItem(TOKEN_KEY); history = []; screen = null; pairScreen(true); }
            else if (k !== 'type:' + type) { type = k.slice(5); load(); }
            return true;
          }
          return code === KEY.UP;
        }
        if (code === KEY.UP) { if (!nav.move(-1)) { atTop = true; ti = typeTab(); paint(); } return true; }
        if (code === KEY.DOWN) { nav.move(1); return true; }
        if (code === KEY.LEFT || code === KEY.RIGHT) { nav.side(code === KEY.LEFT ? -1 : 1); return true; }
        if (code === KEY.ENTER) { var c = nav.current(); if (c) c.open(); return true; }
        return false;
      } };
    show(me, !root);
    load();
  }

  // ---------- Documentaries ----------
  // The first row, every category as a tile, then one row per category, each loading as it comes near.
  // SVT Play's titles have wide art and open svtScreen; the others are ordinary Discover titles.
  function svtCard(t, cls) {
    var pic = lazy(cls === 'tile' ? t.poster || t.wide : t.wide || t.poster);
    return { key: 'svt:' + t.path, t: t, wake: pic.wake,
      el: h('div', { class: 'card ' + (cls || 'svt') }, h('div', { class: 'art' }, pic.el, h('span', { class: 'svt-mark', text: 'SVT Play' }), svtOwned(t) ? badge() : null, onWayBar(pendingForPath(t.path) || pendingNamed(t.title))),
        h('div', { class: 'name', text: t.title }), h('div', { class: 'sub', text: titleSub({ year: t.year, type: t.kind === 'series' ? 'tv' : 'movie' }) })),
      open: function () { svtScreen(t); } };
  }
  function svtOwned(t) {
    var key = L.searchKey(t.title);
    return state.shows.some(function (s) { return owned().showIds[s.id] && L.searchKey(s.title) === key; })
      || state.library.some(function (f) { return f.season == null && L.searchKey(f.filmTitle || f.title) === key; });
  }
  function docsPage(d, page, wide) {
    return { cards: (d.results || []).map(function (t) { return t.type === 'svt' ? svtCard(t, wide ? null : 'tile') : titleCard(t); }),
      last: (d.page || page) >= (d.totalPages || 1) };
  }
  function docsUrl(id, type, sort, page) {
    return '/api/docs/category?id=' + encodeURIComponent(id) + '&type=' + type + '&sort=' + sort + '&page=' + page;
  }
  function docsGrid(c, title) {
    var svt = c.source === 'svt';
    gridScreen({ title: title || c.name || c.title, types: true, sorts: !svt, wide: svt,
      fetch: function (page, type, sort) { return api(docsUrl(c.id, type, sort, page)).then(function (d) { return docsPage(d, page, svt); }); } });
  }
  function docsScreen() {
    var seq = 0, atTop = false;
    var heroArt = h('img', { alt: '', decoding: 'async', class: 'is-empty' });
    heroArt.onerror = function () { heroArt.removeAttribute('src'); heroArt.className = 'is-empty'; };
    var heroTitle = h('h1'), heroMeta = h('div', { class: 'hero-meta' }), heroText = h('p', { class: 'hero-overview' });
    var searchTab = h('button', { class: 'top-link', text: T('Search') });
    var rowsEl = h('div', { class: 'rows' });
    var el = h('div', { class: 'screen discover-screen docs-screen' },
      h('div', { class: 'hero' }, h('div', { class: 'hero-art' }, heroArt), h('div', { class: 'hero-copy' }, heroTitle, heroMeta, heroText)),
      h('header', { class: 'topbar' },
        h('div', { class: 'brandline' }, h('div', { class: 'wordmark', text: T('Documentaries') })),
        h('div', { class: 'top-actions tabs' }, searchTab)),
      h('div', { class: 'rows-viewport' }, rowsEl));
    var heroTimer = null, heroKey = null;
    function setHero(t, key) {
      heroKey = key;
      heroTitle.textContent = t.title;
      var series = t.type === 'tv' || t.kind === 'series';
      heroMeta.textContent = [t.year, series ? T('Series') : T('Film'), t.type === 'svt' ? T('Free on SVT Play') : null, t.rating ? '★ ' + t.rating : null]
        .filter(Boolean).join('  ·  ');
      heroText.textContent = t.overview || '';
      if (t.backdrop) { heroArt.className = ''; if (heroArt.getAttribute('src') !== t.backdrop) heroArt.src = t.backdrop; }
      else { heroArt.removeAttribute('src'); heroArt.className = 'is-empty'; }
    }
    var nav = rowsNav(rowsEl, 0, function (card) {
      if (!card.t || card.key === heroKey) return;
      clearTimeout(heroTimer);
      heroTimer = setTimeout(function () { setHero(card.t, card.key); }, 220);
    });
    function paint() {
      searchTab.classList.toggle('focus', atTop);
      nav.paint(!atTop);
    }
    function categoryCard(c, i) {
      return { key: 'doc:' + c.id, el: h('div', { class: 'card genre g' + (i % 6) }, h('div', { class: 'art' }, h('span', { text: c.name }))),
        open: function () { docsGrid(c); } };
    }
    function rowFor(c, title, items) {
      var svt = c.source === 'svt';
      return makeRow({ title: title, kind: svt ? 'svt' : 'tile', lazy: !items, items: items && docsPage({ results: items, page: 1, totalPages: 1 }, 1, true).cards,
        fetch: function (page) { return api(docsUrl(c.id, 'all', 'popular', page)).then(function (d) { return docsPage(d, page, true); }); },
        seeAll: function () { docsGrid(c, title); } });
    }
    function load() {
      var my = ++seq;
      nav.set([]);
      rowsEl.appendChild(h('div', { class: 'empty discover-loading' }, h('h2', { text: T('Loading documentaries…') })));
      api('/api/docs/home').then(function (data) {
        if (my !== seq) return;
        var rows = (data.rows || []).map(function (r) { return rowFor(r, r.title, r.items || []); });
        var tiles = (data.categories || []).map(categoryCard);
        if (tiles.length) rows.splice(Math.min(1, rows.length), 0, makeRow({ title: T('Browse documentaries'), kind: 'genre', items: tiles }));
        (data.more || []).forEach(function (c) { rows.push(rowFor(c, c.title, null)); });
        if (!rows.length) {
          rowsEl.innerHTML = '';
          rowsEl.appendChild(h('div', { class: 'empty' }, h('h2', { text: T('Nothing here yet.') })));
          atTop = true; paint();
          return;
        }
        nav.set(rows);
        var first = rows[0].items[0];
        if (first && first.t) setHero(first.t, first.key);
        paint();
      }).catch(function (err) {
        if (my !== seq) return;
        rowsEl.innerHTML = '';
        rowsEl.appendChild(h('div', { class: 'empty' }, h('h2', { text: T('Couldn’t load documentaries') }), h('p', { text: err.message })));
        atTop = true; paint();
      });
    }
    show({ el: el, focus: paint, refresh: paint,
      leave: function () { clearTimeout(heroTimer); seq++; },
      key: function (code) {
        if (atTop) {
          if (code === KEY.DOWN) { if (nav.current()) atTop = false; paint(); return true; }
          if (code === KEY.ENTER) { searchScreen(); return true; }
          return code === KEY.UP || code === KEY.LEFT || code === KEY.RIGHT;
        }
        if (code === KEY.UP) { if (!nav.move(-1)) { atTop = true; paint(); } return true; }
        if (code === KEY.DOWN) { nav.move(1); return true; }
        if (code === KEY.LEFT || code === KEY.RIGHT) { nav.side(code === KEY.LEFT ? -1 : 1); return true; }
        if (code === KEY.ENTER) { var c = nav.current(); if (c) c.open(); return true; }
        return false;
      } }, true);
    load();
  }

  // An SVT Play title: Add the film or a whole season, or pick one episode from the list. OK on an episode
  // plays it when it's here and adds it when it isn't. Saved copies join the library like any download.
  function svtScreen(t) {
    var alive = true, data = null, si = 0, ei = 0, zone = 'actions', timer = null, busy = false;
    var backdrop = h('div', { class: 'discover-backdrop' }, img(t.backdrop));
    var titleEl = h('h1', { text: t.title });
    var meta = h('div', { class: 'discover-meta', text: T('Free on SVT Play') });
    var overview = h('p', { class: 'discover-overview', text: t.overview || '' });
    var chips = h('div', { class: 'svt-seasons' });
    var action = h('button', { class: 'title-action primary', text: T('Loading…') });
    var status = h('div', { class: 'download-status' });
    var strip = progressStrip();
    var list = h('div', { class: 'episodes' });
    var rows = []; // per episode on screen: { label, bar, pct }
    var listBox = h('div', { class: 'svt-list' }, list);
    var el = h('div', { class: 'screen discover-title svt-title' }, backdrop,
      h('div', { class: 'discover-panel' }, h('div', { class: 'discover-copy' }, titleEl, meta, overview, chips,
        h('div', { class: 'title-actions' }, action), strip.el, status), listBox));

    function season() { return data && data.seasons && data.seasons[si] || null; }
    function episodes() { var s = season(); return s ? s.episodes : []; }
    function open(items) { return items.filter(function (e) { return e.status !== 'library' && e.status !== 'queued'; }); }
    function statusWord(s) {
      return s === 'library' ? T('In your library') : s === 'server' ? T('On server') : s === 'queued' ? T('On its way') : s === 'failed' ? T('Couldn’t save this') : '';
    }
    function actionText() {
      if (!data) return T('Loading…');
      if (data.kind === 'film') {
        if (data.status === 'library') return T('Play');
        if (data.status === 'queued') return T('On its way');
        return T('Save');
      }
      var rest = open(episodes()).length;
      if (!rest) return episodes().some(function (e) { return e.status === 'queued'; }) ? T('On its way') : T('Open');
      return rest === 1 ? T('Add 1 episode') : T('Add {0} episodes', rest);
    }
    function buildChips() {
      chips.innerHTML = '';
      if (!data || !data.seasons || data.seasons.length < 2) return;
      chips.appendChild(h('div', { class: 'season-label', text: T('Season') }));
      var track = h('div', { class: 'svt-season-track' });
      data.seasons.forEach(function (s) { track.appendChild(h('div', { class: 'svt-chip', text: s.dated && s.name ? s.name : String(s.number) })); });
      chips.appendChild(track);
    }
    function labelFor(e) {
      var word = e.status === 'queued' ? L.transferWord({ state: e.state, progress: e.progress }) : statusWord(e.status);
      var pct = e.status === 'queued' && e.state === 'downloading' ? Math.floor((e.progress || 0) * 100) + ' %' : null;
      return [T('Episode {0}', e.number), e.minutes ? T('{0} min', e.minutes) : null, word, pct].filter(Boolean).join(' · ');
    }
    function buildList() {
      list.innerHTML = '';
      rows = episodes().map(function (e) {
        var label = h('div', { class: 'label', text: labelFor(e) }), bar = barFor(e.progress || 0);
        bar.el.style.display = e.status === 'queued' ? '' : 'none';
        list.appendChild(h('div', { class: 'episode' },
          h('div', { class: 'art' }, img(e.still), bar.el),
          h('div', { class: 'text' }, label, h('div', { class: 'name', text: e.name }))));
        return { label: label, bar: bar };
      });
    }
    // The rows stay and only their words and bars change, so the list doesn't flicker and images don't reload.
    function updateRows() {
      episodes().forEach(function (e, i) {
        var row = rows[i];
        if (!row) return;
        row.label.textContent = labelFor(e);
        row.bar.el.style.display = e.status === 'queued' ? '' : 'none';
        row.bar.set(e.progress || 0);
      });
    }
    function overall() {
      var p = pendingForPath(t.path);
      strip.set(p);
      var failed = data && (data.status === 'failed' ? data : (data.seasons || []).reduce(function (found, s) {
        return found || s.episodes.filter(function (e) { return e.status === 'failed'; })[0]; }, null));
      if (failed && failed.error) { status.textContent = failed.error; status.classList.add('error'); }
    }
    function paint() {
      action.textContent = actionText();
      action.classList.toggle('focus', zone === 'actions');
      [].forEach.call(chips.querySelectorAll('.svt-chip'), function (c, i) {
        c.classList.toggle('active', i === si); c.classList.toggle('focus', zone === 'seasons' && i === si);
      });
      var track = chips.querySelector('.svt-season-track');
      if (track && track.children[si]) track.style.transform = 'translateX(' + (-Math.max(0, track.children[si].offsetLeft - 480)) + 'px)';
      var items = list.children;
      [].forEach.call(items, function (it, i) { it.classList.toggle('focus', zone === 'episodes' && i === ei); });
      var item = items[ei];
      list.style.transform = 'translateY(' + (zone === 'episodes' && item ? -Math.max(0, item.offsetTop - 10) : 0) + 'px)';
    }
    function waitingOn(d) {
      return d && (d.status === 'queued' || (d.seasons || []).some(function (s) { return s.episodes.some(function (e) { return e.status === 'queued'; }); }));
    }
    function hereCount(d) {
      return d.status === 'library' ? 1 : (d.seasons || []).reduce(function (n, s) { return n + s.episodes.filter(function (e) { return e.status === 'library'; }).length; }, 0);
    }
    function schedule() {
      clearTimeout(timer);
      if (waitingOn(data)) timer = setTimeout(tick, 4000);
    }
    // While something's on its way: fresh numbers, in place. An episode that just finished can be played.
    function tick() {
      Promise.all([api('/api/svt/title?path=' + encodeURIComponent(t.path)), loadPending()]).then(function (r) {
        if (!alive) return;
        var arrived = hereCount(r[0]) !== hereCount(data);
        data = r[0];
        updateRows(); overall(); paint();
        schedule();
        if (arrived) loadLibrary().catch(function () {});
      }).catch(function () { if (alive) schedule(); });
    }
    function load() {
      Promise.all([api('/api/svt/title?path=' + encodeURIComponent(t.path)), loadPending()]).then(function (r) {
        var d = r[0];
        if (!alive) return;
        var first = !data;
        data = d;
        titleEl.textContent = d.title;
        var series = d.kind === 'series';
        meta.textContent = [d.year, series ? T('Series') : T('Film'), d.minutes ? T('{0} min', d.minutes) : null, T('Free on SVT Play')].filter(Boolean).join(' · ');
        overview.textContent = d.overview || t.overview || T('No description available.');
        si = Math.min(si, Math.max(0, (d.seasons || []).length - 1));
        buildChips(); buildList();
        schedule();
        overall();
        return loadLibrary().catch(function () {}).then(function () {
          if (!alive) return;
          paint();
          if (first && !status.classList.contains('error')) status.textContent = T('Saved in full quality, with Swedish subtitles.');
        });
      }).catch(function (err) {
        if (!alive) return;
        action.textContent = T('Back'); status.textContent = err.message; status.classList.add('error');
      });
    }
    function add(payload) {
      if (busy) return;
      if (state.me && state.me.canDownload === false) { toast(T('Downloads disabled')); return; }
      busy = true; status.classList.remove('error'); status.textContent = T('Starting…');
      payload.path = t.path;
      api('/api/svt/add', payload).then(function (r) {
        busy = false;
        if (!alive) return;
        status.textContent = r.message || T('On its way from SVT Play.');
        load();
      }).catch(function (err) {
        busy = false;
        if (!alive) return;
        status.textContent = err.message; status.classList.add('error');
      });
    }
    function fileFor(id) {
      var found = null;
      state.library.forEach(function (f) { if (f.id === id) found = f; });
      return found;
    }
    function playId(id) {
      var f = fileFor(id);
      if (f) playAsked(f); else toast(T('This one is still being prepared. Try again in a little while.'));
    }
    function pressAction() {
      if (!data) return;
      if (data.kind === 'film') {
        if (data.status === 'library') playId(data.libraryId);
        else if (data.status === 'queued') toast(T('On its way from SVT Play.'));
        else add({});
        return;
      }
      if (open(episodes()).length) { add({ seasons: [season().number] }); return; }
      if (episodes().some(function (e) { return e.status === 'queued'; })) { toast(T('On its way from SVT Play.')); return; }
      var here = episodes().filter(function (e) { return e.status === 'library'; })[0];
      if (here) { zone = 'episodes'; ei = episodes().indexOf(here); paint(); }
    }
    function pressEpisode() {
      var e = episodes()[ei];
      if (!e) return;
      if (e.status === 'library') playId(e.libraryId);
      else if (e.status !== 'queued') add({ seasons: [season().number], episodes: [e.number] });
    }
    show({ el: el, focus: paint, refresh: function () { if (data) load(); },
      leave: function () { alive = false; clearTimeout(timer); },
      key: function (code) {
        var many = data && data.seasons && data.seasons.length > 1;
        if (zone === 'seasons') {
          if (code === KEY.LEFT && si > 0) { si--; ei = 0; buildList(); paint(); return true; }
          if (code === KEY.RIGHT && si < data.seasons.length - 1) { si++; ei = 0; buildList(); paint(); return true; }
          if (code === KEY.DOWN || code === KEY.ENTER) { zone = 'actions'; paint(); return true; }
          return code === KEY.UP || code === KEY.LEFT || code === KEY.RIGHT;
        }
        if (zone === 'actions') {
          if (code === KEY.UP) { if (many) { zone = 'seasons'; paint(); } return true; }
          if (code === KEY.DOWN) { if (episodes().length) { zone = 'episodes'; paint(); } return true; }
          if (code === KEY.ENTER) { pressAction(); return true; }
          return code === KEY.LEFT || code === KEY.RIGHT;
        }
        if (code === KEY.UP) { if (ei > 0) ei--; else zone = 'actions'; paint(); return true; }
        if (code === KEY.DOWN) { ei = Math.min(episodes().length - 1, ei + 1); paint(); return true; }
        if (code === KEY.ENTER) { pressEpisode(); return true; }
        return code === KEY.LEFT || code === KEY.RIGHT;
      } }, true);
    paint();
    load();
  }

  // ---------- Search ----------
  // An on-screen keyboard for the remote (a USB/Bluetooth keyboard and the remote's number keys type too).
  // Your library answers at once; TMDB (via the server) once you stop typing.
  var KEY_ROWS = 7;
  // A Swedish TV (sv.js loaded) gets å ä ö; every other TV a plain English keyboard. Both are 7 rows of 6.
  var KEYBOARD = (window.LilinTvStrings ? 'abcdefghijklmnopqrstuvwxyzåäö1234567890-:.'
    : 'abcdefghijklmnopqrstuvwxyz1234567890\'&-:.!').split('');
  function libraryMatches(query) {
    var q = L.searchKey(query);
    if (!q) return [];
    var out = [], seen = {};
    state.shows.forEach(function (s) {
      if (owned().showIds[s.id] && L.searchKey(s.title).indexOf(q) >= 0) out.push(showCard(s, 'tile'));
    });
    state.library.forEach(function (f) {
      if (f.season != null) return;
      var k = f.tmdbId || f.id;
      if (seen[k] || L.searchKey(f.filmTitle || f.title).indexOf(q) < 0) return;
      seen[k] = true;
      out.push(filmCard(f, 'tile'));
    });
    return out.slice(0, 20);
  }

  function searchScreen() {
    var q = '', zone = 'keys', kx = 0, ky = 0, seq = 0, timer = null, lit = null;
    var keyEls = KEYBOARD.map(function (c) { return h('div', { class: 'key', text: c }); });
    var bottom = [h('div', { class: 'key wide', text: T('Space') }), h('div', { class: 'key wide', text: '⌫' }), h('div', { class: 'key wide', text: T('Clear') })];
    var field = h('div', { class: 'search-field is-empty' });
    var label = h('div', { class: 'search-label' });
    var note = h('div', { class: 'grid-note' });
    var grid = gridView(5, null);
    var el = h('div', { class: 'screen search' },
      h('header', { class: 'topbar' },
        h('div', { class: 'brandline' }, h('div', { class: 'wordmark', text: T('Search') })),
        h('div', { class: 'discover-hint', text: T('OK: type · Right: results · Back: close') })),
      h('div', { class: 'search-left' }, field, h('div', { class: 'keys' }, keyEls, bottom)),
      h('div', { class: 'search-right' }, label, h('div', { class: 'grid-viewport' }, note, grid.el)));

    function keyAt() { return ky < KEY_ROWS ? keyEls[ky * 6 + kx] : bottom[Math.floor(kx / 2)]; }
    function paint() {
      var want = zone === 'keys' ? keyAt() : null;
      if (lit !== want) { if (lit) lit.classList.remove('focus'); lit = want; if (want) want.classList.add('focus'); }
      grid.paint(zone === 'results');
    }
    function setQuery(v) {
      q = v;
      field.textContent = q;
      field.classList.toggle('is-empty', !q);
      clearTimeout(timer);
      timer = setTimeout(run, 450);
    }
    function type(c) { if (q.length < 60 && !(c === ' ' && (!q || q.charAt(q.length - 1) === ' '))) setQuery(q + c); }
    function press() {
      if (ky < KEY_ROWS) type(KEYBOARD[ky * 6 + kx]);
      else if (kx < 2) type(' ');
      else if (kx < 4) setQuery(q.slice(0, -1));
      else setQuery('');
    }
    function results(cards, text) {
      grid.clear(); grid.add(cards);
      label.textContent = text;
      note.textContent = '';
      if (zone === 'results' && !grid.cards.length) zone = 'keys';
      paint();
    }
    function run() {
      var my = ++seq, query = q.replace(/^\s+|\s+$/g, '');
      if (!query) {
        label.textContent = T('Trending this week');
        api('/api/discover/list?key=trending-all&page=1')
          .then(function (d) { if (my === seq) results((d.results || []).map(titleCard), T('Trending this week')); })
          .catch(function () { if (my === seq) results([], T('Type to search films and shows')); });
        return;
      }
      var local = libraryMatches(query);
      if (query.length < 2) { results(local, local.length ? T('In your library') : T('Keep typing…')); return; }
      results(local, T('Searching for “{0}”…', query));
      api('/api/search?q=' + encodeURIComponent(query)).then(function (d) {
        if (my !== seq) return;
        var all = local.concat((d.svt || []).map(function (t) { return svtCard(t, 'tile'); }), (d.results || []).map(titleCard));
        results(all, all.length ? T('Results for “{0}”', query) : T('Nothing found for “{0}”', query));
      }).catch(function (err) {
        if (my !== seq) return;
        results(local, err.message);
      });
    }
    show({ el: el, focus: paint, refresh: paint,
      leave: function () { clearTimeout(timer); seq++; },
      key: function (code, e) {
        // A real keyboard: letters and digits type, Backspace erases (Back still closes when there's nothing to erase).
        if (e && e.keyCode === 8 && q) { setQuery(q.slice(0, -1)); return true; }
        if (e && e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { type(e.key.toLowerCase()); return true; }
        if (zone === 'keys') {
          if (code === KEY.LEFT) kx = ky === KEY_ROWS ? Math.max(0, (Math.floor(kx / 2) - 1) * 2) : Math.max(0, kx - 1);
          else if (code === KEY.RIGHT) {
            if (ky === KEY_ROWS ? kx >= 4 : kx === 5) { if (grid.cards.length) { zone = 'results'; grid.i = Math.min(grid.i, grid.cards.length - 1); } }
            else kx = ky === KEY_ROWS ? (Math.floor(kx / 2) + 1) * 2 : kx + 1;
          }
          else if (code === KEY.UP) { if (ky > 0) ky--; }
          else if (code === KEY.DOWN) { if (ky < KEY_ROWS) ky++; }
          else if (code === KEY.ENTER) press();
          else return false;
          paint();
          return true;
        }
        if (code === KEY.ENTER) { var c = grid.current(); if (c) c.open(); return true; }
        if (code === KEY.LEFT && grid.i % grid.cols === 0) { zone = 'keys'; paint(); return true; }
        if (code === KEY.UP || code === KEY.DOWN || code === KEY.LEFT || code === KEY.RIGHT) { grid.move(code); paint(); return true; }
        return false;
      } }, true);
    run();
  }

  // ---------- a title's page: play it if it's yours, or get it ready ----------
  function discoverTitle(t) {
    var seasons = [], si = 0, zone = t.type === 'tv' ? 'seasons' : 'actions', ai = 0;
    var alive = true;
    // A show: hover a season and its episodes show in a row underneath; Down into the row, Enter plays one.
    var eps = {}, ei = 0, epTimer = null, epSeason = null;
    var lib = libraryEntry(t);
    var backdrop = h('div', { class: 'discover-backdrop' }, img(t.backdrop || t.poster));
    var title = titleLogo(h('h1', { text: t.title }), t.type, t.id, t.title);
    var meta = h('div', { class: 'discover-meta', text: [t.year, t.type === 'tv' ? T('Series') : T('Film'), t.rating ? '★ ' + t.rating : null]
      .concat(genreNames(t.type, t.genres)).filter(Boolean).join(' · ') });
    var overview = h('p', { class: 'discover-overview', text: t.overview || T('No description available.') });
    var cast = castLine(t.type, t.id, 'discover-cast');
    var seasonBox = h('div', { class: 'discover-seasons' });
    var onWay = pendingFor(t);
    var status = h('div', { class: 'download-status' });
    var strip = progressStrip();
    strip.set(onWay);
    var actions = [];
    // Play first: Play is the one gold button. Yours plays; anything else gets ready (getReady). A show plays the
    // first episode of the season picked above. Downloads are started on the website, not here.
    var soon = Boolean(t.soon && t.soon.date && t.type === 'movie');
    if (lib && lib.film) actions.push({ el: h('button', { class: 'title-action gold', text: T('Play') }), act: function () { playAsked(lib.film); } });
    else if (!soon && t.type !== 'tv') actions.push({ el: h('button', { class: 'title-action gold', text: T('Play') }), act: playIt, play: true });
    var owner = Boolean(state.me && state.me.isOwner);
    if (soon && !actions.length) actions.push({ el: h('button', { class: 'title-action', text: soonSub(t.soon) }), act: function () { toast(T('This film isn’t out yet.')); } });
    // A recent film: is there a proper copy, or only cinema recordings? Said under Play, asked on Play.
    var copies = null, copyNote = h('div', { class: 'copy-note' });
    if (t.type === 'movie' && !lib && !soon) api('/api/title/movie/' + t.id + '/copies').then(function (c) {
      if (!alive) return;
      copies = c;
      if (c.verdict === 'cam') copyNote.textContent = T('Only cinema recordings so far: filmed in a cinema, poor picture and sound.');
      else if (c.verdict === 'soon') copyNote.textContent = T('Not out to stream or buy yet.');
    }).catch(function () {});
    function playIt() {
      if (copies && copies.verdict === 'soon') { toast(T('Not out to stream or buy yet.')); return; }
      if (t.type === 'movie' && copies && copies.verdict === 'cam') {
        camAsk({ type: 'movie', tmdbId: t.id, title: t.title, art: bigger(t.backdrop || t.poster) });
        return;
      }
      playFirst({ type: 'movie', tmdbId: t.id, title: t.title, art: bigger(t.backdrop || t.poster) });
    }
    // Episodes you have here play straight away (with Resume); the rest go through Getting it ready.
    var libEps = {}, start = null;
    if (lib && lib.show) {
      var libSeasons = L.showSeasons(state.library, lib.show.id);
      libSeasons.forEach(function (se) { se.episodes.forEach(function (f) { if (f.episode != null && !libEps[se.number + ':' + f.episode]) libEps[se.number + ':' + f.episode] = f; }); });
      start = L.startEpisode(libSeasons, state.progress, load(WATCHED_KEY, {}));
    }
    var today = new Date().toISOString().slice(0, 10);
    function notOut(e) { return !e.airDate || e.airDate > today; }
    var actionsEl = h('div', { class: 'title-actions' }, actions.map(function (a) { return a.el; }));
    if (!actions.length) actionsEl.style.display = 'none';
    var epBox = h('div', { class: 'episode-row' });
    var panel = h('div', { class: 'discover-panel' }, h('div', { class: 'discover-copy' }, title, meta, overview, cast, seasonBox,
      actionsEl, copyNote, strip.el, status), epBox);
    var el = h('div', { class: 'screen discover-title' }, backdrop, panel);
    followPending(function () { return alive; }, function () {
      var was = onWay;
      onWay = pendingFor(t);
      strip.set(onWay);
      if (onWay && !was) status.textContent = '';
    });

    function buildSeasons() {
      seasonBox.innerHTML = '';
      if (t.type !== 'tv') { seasonBox.style.display = 'none'; return; }
      if (!seasons.length) {
        seasonBox.appendChild(h('div', { class: 'season-note', text: T('Loading seasons…') })); return;
      }
      seasonBox.appendChild(h('div', { class: 'season-label', text: T('Season') }));
      var track = h('div', { class: 'season-track' });
      seasons.forEach(function (s) {
        track.appendChild(h('div', { class: 'season-chip' + (s.upcoming ? ' upcoming' : ''), text: String(s.number) }));
      });
      seasonBox.appendChild(h('div', { class: 'season-viewport' }, track));
    }
    function seasonEps() { return seasons[si] ? eps[seasons[si].number] : null; }
    function buildEpisodes() {
      epBox.innerHTML = '';
      if (t.type !== 'tv' || !seasons.length) return;
      var n = seasons[si].number, list = eps[n];
      if (!list) { epBox.appendChild(h('div', { class: 'season-note', text: T('Loading episodes…') })); return; }
      if (!list.length) { epBox.appendChild(h('div', { class: 'season-note', text: T('No episodes listed yet.') })); return; }
      if (epSeason !== n) {
        epSeason = n; ei = 0;
        if (start && start.season === n) list.forEach(function (e, i) { if (e.number === start.episode) ei = i; });
      }
      var track = h('div', { class: 'episode-track' });
      list.forEach(function (e) {
        var f = libEps[n + ':' + e.number], p = f && state.progress[L.progressRef(f)];
        var art = h('div', { class: 'art' }, img(e.still || bigger(t.backdrop || t.poster)));
        if (L.resumable(p)) art.appendChild(h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(100 * p.time / p.duration) + '%' })));
        var sub = notOut(e) ? (e.airDate ? soonSub({ date: e.airDate }) : T('Coming soon')) : e.runtime ? T('{0} min', e.runtime) : '';
        track.appendChild(h('div', { class: 'card ep' + (notOut(e) ? ' upcoming' : '') }, art,
          h('div', { class: 'name', text: e.number + '. ' + (e.name || T('Episode {0}', e.number)) }), h('div', { class: 'sub', text: sub })));
      });
      epBox.appendChild(h('div', { class: 'episode-viewport' }, track));
    }
    // Fetch a season's episodes once the remote rests on it (scrolling past seasons fetches nothing).
    function loadEpisodes(now) {
      clearTimeout(epTimer);
      if (t.type !== 'tv' || !seasons.length) return;
      var n = seasons[si].number;
      buildEpisodes();
      if (eps[n]) return;
      epTimer = setTimeout(function () {
        api('/api/tv/' + encodeURIComponent(t.id) + '/season/' + n).then(function (d) {
          eps[n] = d.episodes || [];
          if (alive && seasons[si] && seasons[si].number === n) { buildEpisodes(); paint(); }
        }).catch(function () {
          if (!alive || !seasons[si] || seasons[si].number !== n) return;
          epBox.innerHTML = '';
          epBox.appendChild(h('div', { class: 'season-note error', text: T('Couldn’t load the episodes.') }));
        });
      }, now ? 0 : 250);
    }
    function playEpisode(e) {
      var n = seasons[si].number;
      if (notOut(e)) { toast(T('This episode isn’t out yet.')); return; }
      var f = libEps[n + ':' + e.number];
      if (f && !f.converting) { playAsked(f); return; }
      playFirst({ type: 'tv', tmdbId: t.id, season: n, episode: e.number, title: t.title,
        sub: T('Season {0}', n) + ' · ' + T('Episode {0}', e.number), art: bigger(e.still || t.backdrop || t.poster) });
    }
    function paint() {
      actions.forEach(function (a, i) { a.el.classList.toggle('focus', zone === 'actions' && ai === i); });
      var list = seasonEps() || [];
      [].forEach.call(epBox.querySelectorAll('.card.ep'), function (c, i) { c.classList.toggle('focus', zone === 'episodes' && i === ei); });
      var epTrack = epBox.querySelector('.episode-track');
      if (epTrack) epTrack.style.transform = 'translateX(' + (-Math.max(0, Math.min(ei - 1, list.length - 4)) * 412) + 'px)';
      // On the episodes the description is the focused episode's, and the page slides up if the row sits low.
      var e = zone === 'episodes' ? list[ei] : null;
      overview.textContent = e && e.overview ? e.overview : t.overview || T('No description available.');
      var lift = zone === 'episodes' ? Math.max(0, epBox.offsetTop + epBox.offsetHeight + 48 - panel.clientHeight) : 0;
      panel.style.transform = lift ? 'translateY(' + (-lift) + 'px)' : '';
      if (t.type === 'tv' && seasons.length) {
        var chips = seasonBox.querySelectorAll('.season-chip');
        [].forEach.call(chips, function (chip, i) { chip.classList.toggle('focus', zone === 'seasons' && i === si); chip.classList.toggle('active', i === si); });
        var track = seasonBox.querySelector('.season-track');
        if (track) track.style.transform = 'translateX(' + (-Math.max(0, si - 5) * 82) + 'px)';
      }
    }
    buildSeasons(); paint();
    show({ el: el, focus: paint, leave: function () { alive = false; },
      key: function (code) {
        if (zone === 'seasons') {
          if (code === KEY.LEFT && si > 0) { si--; loadEpisodes(); paint(); return true; }
          if (code === KEY.RIGHT && si < seasons.length - 1) { si++; loadEpisodes(); paint(); return true; }
          if (code === KEY.DOWN || code === KEY.ENTER) {
            if ((seasonEps() || []).length) zone = 'episodes';
            else if (actions.length) { zone = 'actions'; ai = 0; }
            paint(); return true;
          }
          return code === KEY.UP || code === KEY.LEFT || code === KEY.RIGHT;
        }
        if (zone === 'episodes') {
          var list = seasonEps() || [];
          if (code === KEY.LEFT) { ei = Math.max(0, ei - 1); paint(); return true; }
          if (code === KEY.RIGHT) { ei = Math.min(list.length - 1, ei + 1); paint(); return true; }
          if (code === KEY.UP) { zone = 'seasons'; paint(); return true; }
          if (code === KEY.ENTER) { if (list[ei]) playEpisode(list[ei]); return true; }
          return code === KEY.DOWN;
        }
        if (!actions.length) return false;
        if (code === KEY.UP && t.type === 'tv' && seasons.length) { zone = 'seasons'; paint(); return true; }
        if (code === KEY.LEFT) { ai = Math.max(0, ai - 1); paint(); return true; }
        if (code === KEY.RIGHT) { ai = Math.min(actions.length - 1, ai + 1); paint(); return true; }
        if (code === KEY.ENTER) { actions[ai].act(); return true; }
        return false;
      } }, true);

    if (t.type === 'tv') {
      api('/api/tv/' + encodeURIComponent(t.id) + '/seasons').then(function (d) {
        if (!alive) return;
        seasons = (d.seasons || []).filter(function (s) { return !s.upcoming; });
        if (!seasons.length) seasons = d.seasons || [];
        // Start on the season you're watching (your copy), else the first.
        si = 0;
        if (start) seasons.forEach(function (s, i) { if (s.number === start.season) si = i; });
        buildSeasons(); loadEpisodes(true); paint();
      }).catch(function (err) {
        if (!alive) return;
        seasonBox.innerHTML = '';
        seasonBox.appendChild(h('div', { class: 'season-note error', text: T('Couldn’t load seasons: {0}', err.message) }));
      });
    }
  }

  function showOf(f) {
    for (var i = 0; i < state.shows.length; i++) if (state.shows[i].id === f.show) return state.shows[i];
    return null;
  }

  // ---------- a show: seasons and episodes ----------
  function showPage(s) {
    var seasons = L.showSeasons(state.library, s.id);
    var startAt = L.startEpisode(seasons, state.progress, load(WATCHED_KEY, {}));
    var si = 0, ei = 0, zone = 'episodes';
    seasons.forEach(function (season, i) { season.episodes.forEach(function (f, j) { if (f === startAt) { si = i; ei = j; } }); });
    var tabs = h('div', { class: 'seasons' });
    var list = h('div', { class: 'episodes' });
    var strip = progressStrip(), open = true;
    function onWayHere() { return state.pending.filter(function (p) { return p.showId === s.id; })[0] || null; }
    strip.set(onWayHere());
    var el = h('div', { class: 'screen show' },
      h('div', { class: 'backdrop' }, img(s.backdrop)),
      h('div', { class: 'show-head' }, titleLogo(h('h1', { text: s.title }), 'tv', s.tmdbId, s.title), s.overview ? h('p', { class: 'overview', text: s.overview }) : null, castLine('tv', s.tmdbId, 'show-cast'), strip.el),
      tabs, h('div', { class: 'list-viewport' }, list));
    var waited = onWayHere() ? onWayHere().items.length : 0;
    followPending(function () { return open; }, function () {
      var p = onWayHere(), now = p ? p.items.length : 0;
      strip.set(p);
      // An episode finished while you were here: it joins the list.
      if (now !== waited) {
        waited = now;
        loadLibrary().then(function () {
          if (!open) return;
          seasons = L.showSeasons(state.library, s.id);
          si = Math.min(si, Math.max(0, seasons.length - 1));
          if (seasons.length) { buildTabs(); buildList(); paint(); }
        }).catch(function () {});
      }
    });
    function buildTabs() {
      tabs.innerHTML = '';
      seasons.forEach(function (season) { tabs.appendChild(h('div', { class: 'tab', text: T('Season {0}', season.number) })); });
    }
    function buildList() {
      list.innerHTML = '';
      seasons[si].episodes.forEach(function (f) {
        var p = state.progress[L.progressRef(f)];
        var ok = L.resumable(p);
        list.appendChild(h('div', { class: 'episode' + (f.converting ? ' is-busy' : '') },
          h('div', { class: 'art' }, img(f.still || s.backdrop), ok ? h('div', { class: 'bar' }, h('i', { style: 'width:' + (p.time / p.duration * 100).toFixed(1) + '%' })) : null),
          h('div', { class: 'text' },
            h('div', { class: 'label', text: T('Episode {0}', f.episode) + (ok ? ' · ' + L.minutesLeft(p) : '')
              + (f.converting ? ' · ' + T('getting ready') + (typeof f.convertPercent === 'number' ? ' ' + Math.floor(f.convertPercent) + ' %' : '') : '') }),
            h('div', { class: 'name', text: f.episodeName || L.episodeLabel(f) }))));
      });
    }
    function paint() {
      [].forEach.call(tabs.children, function (t, i) { t.classList.toggle('active', i === si); t.classList.toggle('focus', zone === 'seasons' && i === si); });
      var items = list.children;
      [].forEach.call(items, function (it, i) { it.classList.toggle('focus', zone === 'episodes' && i === ei); });
      var item = items[ei];
      list.style.transform = 'translateY(' + (item ? -Math.max(0, item.offsetTop - 170) : 0) + 'px)';
    }
    buildTabs(); buildList();
    show({ el: el, focus: paint,
      leave: function () { open = false; },
      refresh: function () { loadLibrary().then(function () { seasons = L.showSeasons(state.library, s.id); si = Math.min(si, seasons.length - 1); if (si < 0) { back(); return; } buildList(); paint(); }).catch(function () {}); },
      key: function (code) {
        if (zone === 'seasons') {
          if (code === KEY.LEFT && si > 0) { si--; ei = 0; buildList(); }
          else if (code === KEY.RIGHT && si < seasons.length - 1) { si++; ei = 0; buildList(); }
          else if (code === KEY.DOWN || code === KEY.ENTER) zone = 'episodes';
          else return code === KEY.LEFT || code === KEY.RIGHT || code === KEY.UP;
          paint(); return true;
        }
        if (code === KEY.UP) { if (ei > 0) ei--; else if (seasons.length > 1) zone = 'seasons'; paint(); return true; }
        if (code === KEY.DOWN) { ei = Math.min(seasons[si].episodes.length - 1, ei + 1); paint(); return true; }
        if (code === KEY.LEFT || code === KEY.RIGHT) return true;
        if (code === KEY.ENTER) { var f = seasons[si].episodes[ei]; if (f) playAsked(f); return true; }
        return false;
      } }, true);
  }

  // ---------- resume or start over ----------
  function playAsked(f) {
    if (f.converting) { toast(T('This one is still being prepared. Try again in a little while.')); return; }
    var p = state.progress[L.progressRef(f)];
    if (!L.resumable(p)) { play(f, 0); return; }
    var choice = 0;
    var buttons = [h('button', { class: 'choice', text: T('Resume from {0}', L.fmtTime(p.time)) }), h('button', { class: 'choice', text: T('Start over') })];
    var el = h('div', { class: 'screen dialog' }, h('div', { class: 'dialog-box' },
      h('h2', { text: f.season != null ? [L.episodeLabel(f), f.episodeName].filter(Boolean).join(' · ') : f.filmTitle || f.title }), buttons));
    function paint() { buttons.forEach(function (b, i) { b.classList.toggle('focus', i === choice); }); }
    show({ el: el, focus: paint, key: function (code) {
      if (code === KEY.UP || code === KEY.LEFT) { choice = 0; paint(); return true; }
      if (code === KEY.DOWN || code === KEY.RIGHT) { choice = 1; paint(); return true; }
      if (code === KEY.ENTER) { var at = choice === 0 ? p.time : 0; screen = history.pop(); play(f, at); return true; }
      return false;
    } }, true);
  }

  // ---------- Live TV ----------
  // The guide (channels down the screen, time across) and a channel's player. A channel plays in a Watch
  // Together room on the server; this TV joins it, follows the room's clock with its heartbeats (an
  // EventSource can't carry the TV's session header) and seeks back into step when it drifts.
  var live = { channels: [], last: null, guideAt: 0 };
  function tvClient() {
    var id = load('lilin:tv-client', null);
    if (!id || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
      id = 'tv-';
      for (var i = 0; i < 20; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36));
      try { localStorage.setItem('lilin:tv-client', JSON.stringify(id)); } catch (e) { /* private mode */ }
    }
    return id;
  }
  function loadGuide() {
    var t = Date.now();
    return api('/api/live?from=' + (t - 15 * 60000) + '&to=' + (t + 150 * 60000)).then(function (g) {
      live.channels = g.channels || []; live.guideAt = Date.now(); state.liveName = g.name || state.liveName;
      return g;
    });
  }
  function onNow(c, t) { for (var i = 0; i < c.programmes.length; i++) if (c.programmes[i].s <= t && t < c.programmes[i].e) return c.programmes[i]; return null; }
  function nextOn(c, t) { for (var i = 0; i < c.programmes.length; i++) if (c.programmes[i].s > t) return c.programmes[i]; return null; }
  function meId() { return state.me && state.me.id; }

  function liveScreen(focusId) {
    var el = h('div', { class: 'screen live-guide' });
    var head = h('header', { class: 'topbar' }, h('div', { class: 'brandline' }, h('span', { class: 'live-dot' }), h('div', { class: 'wordmark', text: state.liveName || 'Lilin TV' })),
      h('div', { class: 'live-clock' }));
    var list = h('div', { class: 'guide' });
    var note = h('p', { class: 'guide-note', text: T('Loading…') });
    el.appendChild(head); el.appendChild(list); el.appendChild(note);
    var focus = 0, from = 0, to = 0, timer = null, me = null;
    var W = 1180; // px of time across (1920 wide screen, minus the channel column)
    function x(ms) { return Math.round((ms - from) / (to - from) * W); }
    function build(g) {
      from = g.from; to = Math.min(g.to, g.from + 165 * 60000);
      list.innerHTML = '';
      if (!live.channels.length) { note.textContent = T('No channels yet. They fill themselves from the library.'); return; }
      note.textContent = T('Up / Down: channel · OK: watch · numbers: go to a channel');
      var ruler = h('div', { class: 'guide-row guide-ruler' }, h('div', { class: 'guide-chan' }));
      var lane = h('div', { class: 'guide-lane' });
      for (var t = Math.ceil(from / 1800000) * 1800000; t < to; t += 1800000) {
        var tick = h('span', { class: 'guide-tick', text: L.clock(t) }); tick.style.left = x(t) + 'px'; lane.appendChild(tick);
      }
      ruler.appendChild(lane); list.appendChild(ruler);
      live.channels.forEach(function (c, i) {
        var row = h('div', { class: 'guide-row' + (i === focus ? ' focus' : '') });
        var others = (c.faces || []).filter(function (f) { return !state.me || f.name !== state.me.name; }).length;
        row.appendChild(h('div', { class: 'guide-chan' }, h('b', { class: 'guide-num', text: String(c.number) }),
          h('span', { class: 'guide-name', text: L.channelName(c, meId()) }), others ? h('small', { class: 'guide-watch', text: T('{0} watching', others) }) : null));
        var lane2 = h('div', { class: 'guide-lane' });
        c.programmes.forEach(function (p) {
          var left = Math.max(0, x(p.s)), right = Math.min(W, x(p.e));
          if (right - left < 4) return;
          var cell = h('div', { class: 'guide-show' + (p.s <= Date.now() && Date.now() < p.e ? ' now' : '') }, h('b', { text: p.title }), h('small', { text: L.programmeLine(p) || L.clock(p.s) + '–' + L.clock(p.e) }));
          cell.style.left = left + 'px'; cell.style.width = (right - left - 6) + 'px';
          lane2.appendChild(cell);
        });
        row.appendChild(lane2);
        list.appendChild(row);
      });
      var line = h('div', { class: 'guide-now' }); line.style.left = (300 + x(Date.now())) + 'px'; list.appendChild(line);
      line.style.height = list.scrollHeight + 'px';
      paint();
    }
    function paint() {
      var rows = list.querySelectorAll('.guide-row:not(.guide-ruler)');
      for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('focus', i === focus);
      if (rows[focus] && rows[focus].scrollIntoView) rows[focus].scrollIntoView({ block: 'nearest' });
      head.querySelector('.live-clock').textContent = L.clock(Date.now());
    }
    function refresh() {
      return loadGuide().then(function (g) {
        if (focusId) { live.channels.forEach(function (c, i) { if (c.id === focusId) focus = i; }); focusId = null; }
        focus = Math.min(focus, Math.max(0, live.channels.length - 1));
        if (screen === me) build(g);
      }).catch(function (e) { note.textContent = e.message; });
    }
    var digits = '', digitTimer = null;
    me = { el: el, focus: paint,
      refresh: function () { refresh(); },
      leave: function () { clearInterval(timer); },
      key: function (code) {
        var n = code >= 48 && code <= 57 ? code - 48 : code >= 96 && code <= 105 ? code - 96 : -1;
        if (n >= 0) {
          digits = (digits + n).slice(-3); note.textContent = T('Channel {0}…', digits);
          clearTimeout(digitTimer);
          digitTimer = setTimeout(function () {
            var want = Number(digits); digits = '';
            var c = live.channels.filter(function (x) { return x.number === want; })[0];
            if (c) livePlay(c.id); else toast(T('There’s no channel with that number.'));
          }, 1100);
          return true;
        }
        if (code === KEY.UP || code === KEY.CH_UP) { focus = Math.max(0, focus - 1); paint(); return true; }
        if (code === KEY.DOWN || code === KEY.CH_DOWN) { focus = Math.min(live.channels.length - 1, focus + 1); paint(); return true; }
        if (code === KEY.ENTER) { var c = live.channels[focus]; if (c) livePlay(c.id); return true; }
        return code === KEY.LEFT || code === KEY.RIGHT;
      } };
    show(me, true);
    refresh();
    timer = setInterval(function () { if (screen === me) refresh(); }, 60000);
  }

  // A channel on the TV's own player. Up/Down and CH+/CH− surf, numbers pick a channel, PRE-CH (or Left)
  // goes back to the last one, OK shows what's on, Back returns to the guide.
  function livePlay(id, replace) {
    var av = window.webapis && webapis.avplay;
    if (!av) { toast(T('This TV can’t play videos from here.')); return; }
    var client = tvClient();
    var s = { id: id, room: null, mediaId: null, closed: false, offset: 0, samples: [], opening: false, seekedAt: 0, beat: null, url: null, lastPos: -1, movedAt: 0, lead: 0.25, cues: null, subTick: null };
    var obj = h('object', { id: 'av', type: 'application/avplayer' });
    var banner = h('div', { class: 'live-banner' });
    var spinner = h('div', { class: 'loading show', text: T('Tuning in…') });
    var subsEl = h('div', { class: 'subs' });
    var menu = h('div', { class: 'menu' });
    // livechat: the channel's chat, read-only on the TV: new messages float in at the right and fade after a while.
    // They ride on the heartbeat (src/watch.js chatAfter); Down → Chat turns them off on this TV.
    var chatEl = h('div', { class: 'live-chat' });
    var el = h('div', { class: 'screen player live-player' }, banner, subsEl, chatEl, spinner, menu);
    var bannerTimer = null, digits = '', digitTimer = null, menuItems = [], menuIndex = 0;
    var chatAfter = 0, chatOn = load('lilin:tv-chat', true);
    function addChat(list) {
      if (!list || !list.length) return;
      list.forEach(function (c) {
        chatAfter = Math.max(chatAfter, c.id);
        if (!chatOn || Date.now() + s.offset - (c.at || 0) > 120000) return; // old news when tuning in
        var line = h('div', { class: 'chat-line' }, h('b', { text: c.name + ' ' }), h('span', { text: c.text }));
        chatEl.appendChild(line);
        setTimeout(function () { line.classList.add('gone'); setTimeout(function () { if (line.parentNode) line.parentNode.removeChild(line); }, 600); }, 15000);
      });
      while (chatEl.childNodes.length > 4) chatEl.removeChild(chatEl.firstChild);
    }
    // The subtitle language stays on across programmes and channels (live.subLang), starting from Settings.
    if (live.subLang == null) live.subLang = (state.me && state.me.settings && state.me.settings.subLang) || '';
    function serverNow() { return Date.now() + s.offset; }
    function channel() { return live.channels.filter(function (c) { return c.id === s.id; })[0] || (s.room && s.room.live && s.room.live.channel) || { id: s.id }; }
    function showBanner(stay) {
      var info = s.room && s.room.live || {};
      var c = info.channel || channel();
      var now = info.now, next = info.next;
      var others = s.room ? (s.room.members || []).filter(function (m) { return m.id !== client; }).length : 0;
      banner.innerHTML = '';
      banner.appendChild(h('div', { class: 'live-banner-top' }, h('span', { class: 'live-pill', text: T('Live') }),
        h('b', { class: 'live-banner-chan', text: (c.number != null ? c.number + '  ' : '') + L.channelName(c, meId()) }),
        others ? h('span', { class: 'live-banner-watch', text: T('{0} watching', others + 1) }) : null,
        h('span', { class: 'live-banner-clock', text: L.clock(Date.now()) })));
      if (now) {
        var bar = h('div', { class: 'live-bar' }, h('i', {}));
        bar.firstChild.style.width = Math.max(0, Math.min(100, (Date.now() - now.s) / (now.e - now.s) * 100)).toFixed(1) + '%';
        banner.appendChild(h('div', { class: 'live-banner-now' }, h('b', { text: now.title }), h('span', { text: L.programmeLine(now) ? ' · ' + L.programmeLine(now) : '' })));
        banner.appendChild(bar);
        banner.appendChild(h('div', { class: 'live-banner-times', text: L.clock(now.s) + '–' + L.clock(now.e) + (next ? '   ' + T('Next: {0} at {1}', next.title, L.clock(next.s)) : '') }));
        banner.appendChild(h('div', { class: 'live-banner-hint', text: T('Right: subtitles') }));
      } else banner.appendChild(h('div', { class: 'live-banner-now' }, h('b', { text: next ? T('Off air. {0} starts at {1}.', next.title, L.clock(next.s)) : T('Off air for a moment.') })));
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      if (!stay) bannerTimer = setTimeout(function () { banner.classList.remove('show'); }, 5000);
    }
    function post(action, body) {
      var b = body || {}; b.clientId = client;
      return api('/api/watch/' + s.room.token + '/' + action, b);
    }
    function sample() {
      var start = Date.now();
      return api('/api/watch/clock').then(function (c) {
        var end = Date.now();
        s.samples.push({ rtt: end - start, offset: c.serverNow - (start + end) / 2 });
        s.samples = s.samples.slice(-10);
        s.offset = L.clockOffset(s.samples);
      });
    }
    function target() { return L.liveTarget(s.room, serverNow()); }
    function stopAv() { try { av.stop(); } catch (e) { /* already */ } try { av.close(); } catch (e) { /* already */ } }
    // ---- subtitles (→) ----
    function setSubs(lang, quiet) {
      live.subLang = lang || '';
      s.cues = null; subsEl.textContent = '';
      var want = s.mediaId;
      if (!lang || !want) return Promise.resolve();
      return api('/api/subs/langs?kind=lib&id=' + encodeURIComponent(want)).then(function (d) {
        // This programme doesn't have that language: stay quiet, the next one may.
        if (!(d.languages || []).some(function (l) { return l.code === lang; })) { if (!quiet) toast(T('No {0} subtitles for this programme.', lang.toUpperCase())); return null; }
        return api('/api/subs/fetch', { kind: 'lib', id: want, lang: lang });
      }).then(function (r) { return r && fetch(SERVER + r.url, { credentials: 'omit' }).then(function (x) { return x.text(); }); })
        .then(function (text) { if (text && live.subLang === lang && s.mediaId === want && !s.closed) s.cues = L.parseVtt(text); })
        .catch(function (err) { if (!quiet) toast(T('Couldn’t get those subtitles: {0}', err.message)); });
    }
    function drawSubs() {
      if (!s.cues || s.opening) { if (subsEl.textContent) subsEl.textContent = ''; return; }
      var t;
      try { t = av.getCurrentTime() / 1000; } catch (e) { return; }
      var text = L.cueText(s.cues, t);
      if (subsEl.textContent !== text) subsEl.textContent = text;
    }
    function openMenu() {
      if (!s.mediaId) { showBanner(); return; }
      api('/api/subs/langs?kind=lib&id=' + encodeURIComponent(s.mediaId)).then(function (d) { return d.languages || []; }).catch(function () { return []; }).then(function (langs) {
        if (s.closed) return;
        menuItems = [{ head: T('Subtitles') }, { label: T('Off'), on: !live.subLang, act: function () { setSubs(''); } }];
        langs.forEach(function (l) { menuItems.push({ label: l.name, on: live.subLang === l.code, act: function () { toast(T('Getting {0} subtitles…', l.name)); setSubs(l.code); } }); });
        menuIndex = menuItems.findIndex(function (m) { return m.on; });
        if (menuIndex < 0) menuIndex = 1;
        menuItems.push({ head: T('Chat') });
        [[true, T('Show messages')], [false, T('Off')]].forEach(function (o) {
          menuItems.push({ label: o[1], on: chatOn === o[0], act: function () {
            chatOn = o[0]; try { localStorage.setItem('lilin:tv-chat', JSON.stringify(chatOn)); } catch (e) { /* full */ }
            if (!chatOn) chatEl.innerHTML = '';
          } });
        });
        banner.classList.remove('show');
        menu.classList.add('show');
        paintMenu();
      });
    }
    function paintMenu() {
      menu.innerHTML = '';
      menuItems.forEach(function (m, i) {
        menu.appendChild(m.head ? h('div', { class: 'menu-head', text: m.head })
          : h('div', { class: 'menu-item' + (m.on ? ' on' : '') + (i === menuIndex ? ' focus' : ''), text: m.label }));
      });
    }
    function menuMove(d) {
      var i = menuIndex;
      do { i += d; } while (menuItems[i] && menuItems[i].head);
      if (menuItems[i]) { menuIndex = i; paintMenu(); }
    }
    // A new programme (or the first one): open its video at the live moment.
    function openMedia() {
      var media = s.room.media;
      s.mediaId = media ? media.id : null;
      stopAv();
      if (live.subLang) setSubs(live.subLang, true); else { s.cues = null; subsEl.textContent = ''; }
      if (!media) { spinner.classList.remove('show'); showBanner(true); return; }
      spinner.textContent = T('Tuning in…'); spinner.classList.add('show');
      var want = media.id;
      s.opening = true;
      api('/api/play-link?kind=lib&id=' + encodeURIComponent(media.id) + '&variant=' + (window.LILIN_TV_PLAY || 'browser-hevc')).then(function (link) {
        if (s.closed || s.mediaId !== want) return;
        s.url = SERVER + link.url;
        av.open(s.url);
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* older firmware */ }
        av.setListener({
          onbufferingstart: function () { spinner.textContent = T('Loading…'); spinner.classList.add('show'); },
          onbufferingcomplete: function () { spinner.classList.remove('show'); },
          oncurrentplaytime: function (ms) { if (ms !== s.lastPos) { s.lastPos = ms; s.movedAt = Date.now(); } },
          onstreamcompleted: function () { /* the room moves on to the next programme */ },
          onerror: function (e) { spinner.textContent = T('This video can’t play on the TV.') + ' ' + String(e); spinner.classList.add('show'); },
          onevent: function () {},
        });
        av.prepareAsync(function () {
          if (s.closed || s.mediaId !== want) return;
          // The video took a moment to open: seek to where the channel is now, ahead by what the last seek took.
          var t0 = Date.now();
          av.seekTo(Math.floor((target() + s.lead) * 1000), function () {
            if (s.closed || s.mediaId !== want) return;
            s.lead = Math.min(3, (Date.now() - t0) / 1000);
            try { av.play(); } catch (e) { /* the next beat tries again */ }
            s.opening = false; s.seekedAt = Date.now();
            spinner.classList.remove('show');
          }, function () { try { av.play(); } catch (e) { /* again next beat */ } s.opening = false; });
        }, function (e) { s.opening = false; spinner.textContent = T('This video can’t play on the TV.') + ' ' + String(e && e.name || e); });
      }).catch(function (e) { s.opening = false; spinner.textContent = e.message; spinner.classList.add('show'); });
    }
    // Back into step when the picture is too far off (the TV can't play a little faster, so it seeks), ahead by
    // what seeks take on this TV.
    function correct() {
      if (s.opening || !s.room || !s.room.media || Date.now() - s.seekedAt < 5000) return;
      var pos;
      try { pos = av.getCurrentTime() / 1000; } catch (e) { return; }
      if (Math.abs(target() - pos) > 0.6) {
        var t0 = s.seekedAt = Date.now();
        try { av.seekTo(Math.floor((target() + s.lead) * 1000), function () { s.lead = Math.min(3, (Date.now() - t0) / 1000); }, function () {}); } catch (e) { /* not ready */ }
      }
    }
    function receive(room) {
      if (s.closed) return;
      var was = s.room;
      if (was && room.revision < was.revision) return;
      s.room = room;
      if (!was || (room.media ? room.media.id : null) !== s.mediaId) { openMedia(); showBanner(); }
      else if (was.live && room.live && (was.live.now && was.live.now.s) !== (room.live.now && room.live.now.s)) showBanner();
    }
    function heartbeat() {
      if (s.closed || !s.room) return;
      var start = Date.now();
      post('heartbeat', { ready: !s.opening, buffering: false, blocked: false, rtt: s.samples.length ? s.samples[0].rtt : 0, chatAfter: chatAfter }).then(function (room) {
        var end = Date.now();
        addChat(room.chat);
        if (room.serverNow) { s.samples.push({ rtt: end - start, offset: room.serverNow - (start + end) / 2 }); s.samples = s.samples.slice(-10); s.offset = L.clockOffset(s.samples); }
        receive(room); correct();
      }).catch(function (e) {
        if (e.status === 403 || e.status === 410) tune();
      });
    }
    function tune() {
      return api('/api/live/' + encodeURIComponent(s.id) + '/tune', { clientId: client }).then(function (room) {
        s.room = null; receive(room);
      }).catch(function (e) { spinner.textContent = e.message; spinner.classList.add('show'); });
    }
    function close() {
      if (s.closed) return;
      s.closed = true;
      clearInterval(s.beat); clearInterval(s.subTick); clearTimeout(bannerTimer); clearTimeout(digitTimer);
      stopAv();
      if (s.room) post('leave').catch(function () {});
      if (obj.parentNode) obj.parentNode.removeChild(obj);
      document.body.classList.remove('playing');
      document.removeEventListener('visibilitychange', onHidden);
    }
    function onHidden() { if (document.hidden) { close(); back(); } }
    function surfTo(nextId) {
      if (!nextId || nextId === s.id) return;
      live.last = s.id;
      close();
      livePlay(nextId, true);
    }
    var me = { el: el, leave: close, key: function (code) {
      if (menu.classList.contains('show')) {
        if (code === KEY.UP) menuMove(-1);
        else if (code === KEY.DOWN) menuMove(1);
        else if (code === KEY.ENTER) { var item = menuItems[menuIndex]; menu.classList.remove('show'); if (item && item.act) item.act(); }
        else if (code === KEY.BACK || code === KEY.LEFT || code === KEY.RIGHT || code === KEY.ESC || code === KEY.BACKSPACE) menu.classList.remove('show');
        return true;
      }
      var n = code >= 48 && code <= 57 ? code - 48 : code >= 96 && code <= 105 ? code - 96 : -1;
      if (n >= 0) {
        digits = (digits + n).slice(-3);
        banner.innerHTML = ''; banner.appendChild(h('div', { class: 'live-digits', text: digits })); banner.classList.add('show');
        clearTimeout(digitTimer);
        digitTimer = setTimeout(function () {
          var want = Number(digits); digits = '';
          var c = live.channels.filter(function (x) { return x.number === want; })[0];
          if (c) surfTo(c.id); else { toast(T('There’s no channel with that number.')); showBanner(); }
        }, 1100);
        return true;
      }
      if (code === KEY.UP || code === KEY.CH_UP) { var up = L.neighbour(live.channels, s.id, -1); if (up) surfTo(up.id); return true; }
      if (code === KEY.DOWN || code === KEY.CH_DOWN) { var down = L.neighbour(live.channels, s.id, 1); if (down) surfTo(down.id); return true; }
      if (code === KEY.PRE_CH || code === KEY.LEFT) { if (live.last) surfTo(live.last); return true; }
      if (code === KEY.RIGHT) { openMenu(); return true; }
      if (code === KEY.ENTER) { showBanner(); return true; }
      if (code === KEY.PLAYPAUSE || code === KEY.PAUSE || code === KEY.PLAY || code === KEY.FF || code === KEY.RW) { toast(T('This is live TV, so it keeps playing.')); return true; }
      if (code === KEY.BACK || code === KEY.STOP) { close(); back(); return true; }
      return true;
    } };
    if (replace) { screen = null; show(me); } else show(me, true);
    document.body.insertBefore(obj, document.body.firstChild);
    document.body.classList.add('playing');
    document.addEventListener('visibilitychange', onHidden);
    (live.channels.length ? Promise.resolve() : loadGuide().catch(function () {}))
      .then(function () { return sample().then(sample).then(sample).catch(function () {}); })
      .then(tune)
      .then(function () { if (!s.closed) { s.beat = setInterval(heartbeat, 1000); s.subTick = setInterval(drawSubs, 200); } });
  }

  // ---------- the player ----------
  // ---------- Getting it ready (play first) ----------
  // Play on something that isn't here yet. The server (src/tv-play.js) adds someone else's copy to your library, or
  // finds a copy and fetches the start of the video (a cold start); this screen says how it's going in one line
  // and the player takes over by itself. Back leaves it getting ready; Cancel too (others may want it).
  // x: { type, tmdbId, season, episode, title, sub, art }
  function aboutTime(sec) { return sec < 55 ? T('{0} s', Math.max(5, Math.ceil(sec / 5) * 5)) : T('{0} min', Math.max(1, Math.round(sec / 60))); }
  function readyWords(r, elapsed, phaseElapsed) {
    function ease(from, to, secs) { return from + (to - from) * (1 - Math.exp(-Math.max(0, phaseElapsed) / secs)); }
    var slow = elapsed > 150;
    var hint = slow ? T('This one is taking longer than usual. Lilin keeps trying.') : T('Usually ready in under a minute.');
    if (r.phase === 'failed') return { line: r.message || T('Lilin couldn’t find a copy that plays well.'), hint: T('Try again in a little while, or pick something else.'), progress: 0 };
    if (r.phase === 'finding') return { line: T('Finding the best copy…'), hint: hint, progress: ease(0.04, 0.3, 12) };
    if (r.phase === 'connecting') return { line: T('Connecting to it…'), hint: hint, progress: ease(0.3, 0.5, 15) };
    if (r.phase === 'starting') {
      var p = typeof r.startProgress === 'number' ? Math.max(0, Math.min(1, r.startProgress)) : 0;
      var eta = r.startEta;
      var line = typeof eta !== 'number' ? T('Fetching the start of the video…') : eta <= 5 ? T('Almost there…') : T('Starting in about {0}', aboutTime(eta));
      return { line: line, hint: slow ? hint : '', progress: Math.max(0.5 + 0.45 * p, ease(0.5, 0.7, 40)) };
    }
    return { line: T('Starting…'), hint: '', progress: 0.97 };
  }
  // Whether this TV plays 4K HEVC itself (tv/android Codecs.playVariant): the server picks the copy by it.
  var UPGRADE_RANK = { '2160p': 4, '1440p': 3, '1080p': 2, '720p': 1, SD: 0 };
  var upgradedFilms = {}; // versionKey -> true once moved to (or tried) a sharper version this session
  // Up next's countdown, per TV like the website's switch in the player cog (Off: the card waits for a press).
  var AUTOPLAY_KEY = 'lilin:tv-autoplay';
  function autoplayOn() { return load(AUTOPLAY_KEY, true) !== false; }
  // The Android TV shell (ExoPlayer behind an AVPlay-shaped object) says which video it wants; Samsung doesn't.
  function onAndroid() { return Boolean(window.LILIN_TV_PLAY); }
  function tvUhd() { return String(window.LILIN_TV_PLAY || 'browser-hevc').split('&')[0] === 'browser-hevc'; }
  function targetQuery(x) {
    return 'type=' + x.type + '&tmdbId=' + x.tmdbId + (x.type === 'tv' ? '&season=' + x.season + '&episode=' + x.episode : '') + (tvUhd() ? '' : '&uhd=0');
  }
  // Only cinema recordings of this film so far (src/copy-check.js): say so before anything downloads.
  function camAsk(x) {
    var choice = 0;
    var buttons = [h('button', { class: 'choice', text: T('Play the cinema recording') }), h('button', { class: 'choice', text: T('Back') })];
    var el = h('div', { class: 'screen dialog' }, h('div', { class: 'dialog-box' },
      h('h2', { text: T('Only a cinema recording so far') }),
      h('p', { class: 'dialog-text', text: T('Someone filmed this in a cinema, so the picture and sound are poor. A proper copy usually turns up once it’s out to stream or buy.') }),
      buttons));
    function paint() { buttons.forEach(function (b, i) { b.classList.toggle('focus', i === choice); }); }
    show({ el: el, focus: paint, key: function (code) {
      if (code === KEY.UP || code === KEY.LEFT) { choice = 0; paint(); return true; }
      if (code === KEY.DOWN || code === KEY.RIGHT) { choice = 1; paint(); return true; }
      if (code === KEY.ENTER) {
        if (choice === 1) { back(); return true; }
        screen = history.pop(); // the ask is replaced by Getting it ready
        x.allowCam = true;
        getReady(x);
        return true;
      }
      return false;
    } }, true);
  }
  function playFirst(x) {
    // Yours already: straight to the player (the server would say the same, a round trip later).
    var mine = x.type === 'movie' ? owned().films[x.tmdbId] : null;
    if (mine && !mine.converting) { playAsked(mine); return; }
    getReady(x);
  }
  // The title's logo filling in as the progress (the web's getting-ready.js logoArt): a faint grey ghost, the real
  // colours revealed left to right up to the progress, and a light band on that edge. It takes the written title's
  // place once it has loaded, and the progress bar goes (the logo is the bar). Chrome 69 on the TV: clip-path, no masks.
  function readyLogo(x) {
    var heading = h('h1', { text: x.title });
    var wrap = null, fill = null, edge = null, p = 0, failed = false;
    function clip() {
      if (!wrap) return;
      var right = (100 - p * 100).toFixed(1) + '%';
      fill.style.webkitClipPath = fill.style.clipPath = 'inset(0 ' + right + ' 0 0)';
      edge.style.webkitClipPath = edge.style.clipPath = 'inset(0 ' + right + ' 0 ' + Math.max(0, p * 100 - 6).toFixed(1) + '%)';
      wrap.classList.toggle('is-failed', failed);
      wrap.classList.toggle('is-full', p >= 0.999);
    }
    function layer(cls, src) { var i = new Image(); i.className = cls; i.alt = ''; i.src = src; return i; }
    // Mostly dark lettering (a black logo) vanishes on the dark picture: draw it light instead, as the web does.
    function tone(url) {
      var small = String(url).replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w185/');
      if (!/\.png($|\?)/.test(small)) return;
      var probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = 48; c.height = 24;
          var g = c.getContext('2d');
          g.drawImage(probe, 0, 0, 48, 24);
          var d = g.getImageData(0, 0, 48, 24).data, sum = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
          if (n && sum / n < 0.3 && wrap) wrap.classList.add('is-dark');
        } catch (e) { /* no CORS on this picture: leave it as it is */ }
      };
      probe.src = small;
    }
    if (x.tmdbId && (x.type === 'movie' || x.type === 'tv')) {
      api('/api/title/' + x.type + '/' + x.tmdbId + '/page').then(function (d) {
        var url = d.page && d.page.logo && d.page.logo.url;
        if (!url) return;
        var ghost = layer('ready-logo-ghost', url);
        ghost.onload = function () {
          fill = layer('ready-logo-fill', url);
          edge = layer('ready-logo-edge', url);
          fill.alt = x.title || '';
          wrap = h('span', { class: 'ready-logo' }, ghost, fill, edge);
          clip();
          heading.textContent = '';
          heading.appendChild(wrap);
          tone(url);
        };
      }).catch(function () {});
    }
    return {
      el: heading,
      set: function (to, bad) { if (to !== p || bad !== failed) { p = to; failed = bad; clip(); } },
      shown: function () { return !!wrap; }
    };
  }
  function getReady(x) {
    var alive = true, timer = null, paintTimer = null, job = null, since = Date.now(), phaseSince = since, idleSince = 0;
    var last = { phase: 'finding' };
    var bar = h('i', {}), line = h('p', { class: 'ready-line' }), hint = h('p', { class: 'ready-hint' });
    var btn = h('button', { class: 'title-action focus', text: T('Back') });
    var logo = readyLogo(x);
    var el = h('div', { class: 'screen getting-ready' },
      h('div', { class: 'ready-art' }, img(x.art)),
      h('div', { class: 'ready-copy' }, logo.el,
        x.sub ? h('div', { class: 'ready-sub', text: x.sub }) : null,
        h('div', { class: 'ready-bar' }, bar), line, hint, h('div', { class: 'title-actions' }, btn)));
    function paint() {
      var t = Date.now();
      var w = readyWords(last, (t - since) / 1000, (t - phaseSince) / 1000);
      if (line.textContent !== w.line) line.textContent = w.line;
      if (hint.textContent !== w.hint) hint.textContent = w.hint;
      bar.style.width = (w.progress * 100).toFixed(1) + '%';
      line.classList.toggle('error', last.phase === 'failed');
      logo.set(w.progress, last.phase === 'failed');
      el.classList.toggle('has-logo', logo.shown());
    }
    function stop() { alive = false; clearTimeout(timer); clearInterval(paintTimer); }
    function hand(f, resumeKey) {
      stop();
      screen = null; // the player takes this screen's place: Back goes to where Play was pressed
      var p = state.progress[resumeKey || L.progressRef(f)];
      play(f, L.resumable(p) ? p.time : 0);
    }
    function answer(r) {
      if (!alive) return;
      if (r.job) job = r.job;
      if (r.play && r.play.kind === 'lib') {
        var f = r.play.file;
        if (r.play.added) { loadLibrary().catch(function () {}); }
        return hand(f);
      }
      if (r.play && r.play.kind === 'part') {
        var pf = { id: r.play.id, part: true, url: r.play.url, adaptiveUrl: r.play.adaptiveUrl || null, mediaKey: r.play.mediaKey, title: r.play.title || x.title, filmTitle: x.title,
          show: r.play.show, season: r.play.season, episode: r.play.episode, showTmdb: x.type === 'tv' ? x.tmdbId : null, still: x.art,
          tmdbId: x.type === 'movie' ? x.tmdbId : null };
        return hand(pf);
      }
      if (r.idle) { idleSince = idleSince || Date.now(); if (Date.now() - idleSince > 60000) r = { phase: 'failed' }; } else idleSince = 0;
      if (r.phase !== last.phase) phaseSince = Date.now();
      last = r;
      paint();
      if (r.phase !== 'failed') timer = setTimeout(follow, 1500);
    }
    function follow() {
      if (!alive) return;
      api('/api/tv/play?' + targetQuery(x) + (job ? '&job=' + job : ''))
        .then(answer, function () { if (alive) timer = setTimeout(follow, 3000); });
    }
    paint();
    paintTimer = setInterval(paint, 500);
    show({ el: el, leave: stop, key: function (code) {
      if (code === KEY.ENTER || code === KEY.BACK) {
        if (last.phase !== 'failed' && alive) toast(T('It keeps getting ready. Press Play again any time.'));
        back();
        return true;
      }
      return true;
    } }, true);
    var body = { type: x.type, tmdbId: x.tmdbId, title: x.title };
    if (x.type === 'tv') { body.season = x.season; body.episode = x.episode; }
    if (x.allowCam) body.allowCam = true; // they said yes to a cinema recording (camAsk)
    if (!tvUhd()) body.uhd = 0;
    api('/api/tv/play', body).then(answer, function (err) { answer({ phase: 'failed', message: err.message }); });
  }

  function play(f, startAt) {
    var av = window.webapis && webapis.avplay;
    if (!av) { toast(T('This TV can’t play videos from here.')); return; }
    var ref = { kind: 'lib', id: f.id };
    var s = { f: f, time: startAt || 0, duration: 0, playing: false, ended: false, intro: null, introDone: false, creditsAt: null,
      dismissed: false, autoLeft: null, cues: null, subLang: '', lastSave: 0, played: 0, playTick: null, closed: false, busy: false };
    var obj = h('object', { id: 'av', type: 'application/avplayer' });
    var subsEl = h('div', { class: 'subs' });
    var osd = h('div', { class: 'osd' },
      h('div', { class: 'osd-title' }, h('b', { text: showOf(f) ? showOf(f).title : f.filmTitle || f.title }),
        h('span', { text: f.season != null ? ' ' + [L.episodeLabel(f), f.episodeName].filter(Boolean).join(' · ') : '' })),
      h('div', { class: 'osd-bar' }, h('i', {})),
      h('div', { class: 'osd-times' }, h('span', { class: 'pos', text: '0:00' }), h('span', { class: 'state', text: '' }), h('span', { class: 'dur', text: '' })),
      h('div', { class: 'osd-hint' }, h('span', { text: T('Left / Right: 10 s') }), h('span', { text: T('OK: pause') }), h('span', { text: T('Down: subtitles and audio') })));
    var skipBtn = h('div', { class: 'skip-intro' }, T('Skip intro'));
    skipBtn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7zM14 5l8 7-8 7z"/></svg>');
    var upNext = h('div', { class: 'up-next' },
      h('div', { class: 'up-next-art' }), h('div', { class: 'up-next-text' }, h('div', { class: 'up-next-label', text: T('Up next') }), h('div', { class: 'up-next-title' })),
      h('div', { class: 'up-next-actions' }, h('div', { class: 'btn play-next' }), h('div', { class: 'btn keep', text: T('Keep watching') })));
    var menu = h('div', { class: 'menu' });
    var spinner = h('div', { class: 'loading', text: T('Loading…') });
    // The pause screen: paused for 3 s, the picture dims and the title, the episode and what's left fade in at the
    // bottom left (public/pause-screen.js on the web). Any key clears it; it comes back while still paused.
    var pauseCard = null, restTimer = null;
    function pauseInfo() {
      var sh = showOf(f);
      var type = f.season != null ? 'tv' : 'movie', id = f.season != null ? (sh && sh.tmdbId) || f.showTmdb : f.tmdbId;
      var name = sh ? sh.title : f.filmTitle || f.title;
      pauseCard = h('div', { class: 'pause-card' }, h('p', { class: 'pause-kicker', text: T('Paused') }),
        titleLogo(h('h1', { class: 'pause-name', text: name }), type, id, name),
        f.season != null ? h('p', { class: 'pause-ep', text: [L.episodeLabel(f), f.episodeName].filter(Boolean).join(' · ') }) : null,
        f.overview ? h('p', { class: 'pause-text', text: String(f.overview).length > 240 ? String(f.overview).slice(0, 237) + '…' : f.overview }) : null,
        h('p', { class: 'pause-left' }));
      el.insertBefore(pauseCard, osd);
    }
    function rest(on) {
      clearTimeout(restTimer);
      if (!on) { if (pauseCard) pauseCard.classList.remove('show'); el.classList.remove('resting'); return; }
      restTimer = setTimeout(function () {
        if (s.playing || s.closed || s.ended || menu.classList.contains('show')) return;
        if (!pauseCard) pauseInfo();
        var left = s.duration ? L.minutesLeft({ time: s.time, duration: s.duration }) : '';
        pauseCard.querySelector('.pause-left').textContent = left;
        osd.classList.remove('show');
        pauseCard.classList.add('show'); el.classList.add('resting');
      }, 3000);
    }
    // The credits card (like the website's): when the closing credits start, the picture moves to the right and the
    // song from the soundtrack (the server's best guess, /api/title/:type/:id/song) and Up next take the left. Up (or
    // Keep watching / Back) puts the picture back.
    var credits = h('div', { class: 'credits-card' }, h('p', { class: 'crd-kicker', text: T('End credits') }),
      h('p', { class: 'crd-name', text: showOf(f) ? showOf(f).title : f.filmTitle || f.title }),
      h('div', { class: 'crd-song' }, h('p', { class: 'crd-why' }), h('p', { class: 'crd-track' }), h('p', { class: 'crd-by' })),
      h('p', { class: 'crd-hint', text: T('Up: the picture full size') }));
    var el = h('div', { class: 'screen player' }, credits, osd, subsEl, skipBtn, upNext, menu, spinner);
    var cardFocus = 0, menuItems = [], menuIndex = 0, osdTimer = null, seekTarget = null, seekTimer = null, tick = null, autoTimer = null;

    function now() { try { return av.getCurrentTime() / 1000; } catch (e) { return s.time; } }
    function showOsd(stay) {
      var was = osd.classList.contains('show');
      osd.classList.add('show');
      if (!was) paint();
      clearTimeout(osdTimer);
      if (!stay) osdTimer = setTimeout(function () { if (s.playing) osd.classList.remove('show'); }, 4000);
    }
    // The web page sits on top of the video, and this TV's CPU is slow: touch the page only when something
    // on it changes (the hidden OSD isn't updated, unchanged text isn't rewritten).
    var osdBar = osd.querySelector('.osd-bar i'), osdPos = osd.querySelector('.pos'), osdDur = osd.querySelector('.dur'), osdState = osd.querySelector('.state');
    function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
    function paint() {
      var t = seekTarget != null ? seekTarget : s.time;
      if (osd.classList.contains('show')) {
        if (s.duration) {
          var w = (t / s.duration * 100).toFixed(1) + '%';
          if (osdBar.style.width !== w) osdBar.style.width = w;
          setText(osdDur, L.fmtTime(s.duration));
        }
        setText(osdPos, L.fmtTime(t));
        setText(osdState, s.playing || s.ended ? '' : T('Paused'));
      }
      if (s.cues) { var text = L.cueText(s.cues, s.time); if (subsEl.textContent !== text) subsEl.textContent = text; }
      var intro = !s.ended && L.introShowing(s.time, s.intro);
      if (intro && !s.introDone && s.playing && state.me && state.me.settings && state.me.settings.skipIntro === 'auto') { skipIntro(); return; }
      if (skipBtn.classList.contains('show') !== intro) skipBtn.classList.toggle('show', intro);
      var skipFocus = intro && !menu.classList.contains('show');
      if (skipBtn.classList.contains('focus') !== skipFocus) skipBtn.classList.toggle('focus', skipFocus);
      paintUpNext();
      syncCredits();
    }
    var creditsOn = false, songAsked = false;
    var CREDITS_RECT = [1000, 210, 824, 464]; // the picture on the right while the card shows (16:9, 1920×1080 page)
    function creditsRolling() {
      return !s.closed && !s.ended && !s.dismissed && !s.creditsDismissed && s.creditsAt > 0 && s.time >= s.creditsAt
        && L.nextPromptAt(s.duration, s.creditsAt) !== null && seekTarget == null && !menu.classList.contains('show');
    }
    function syncCredits() {
      var on = creditsRolling();
      if (on === creditsOn) return;
      creditsOn = on;
      el.classList.toggle('credits', on);
      try { if (on) av.setDisplayRect(CREDITS_RECT[0], CREDITS_RECT[1], CREDITS_RECT[2], CREDITS_RECT[3]); else av.setDisplayRect(0, 0, 1920, 1080); } catch (e) { /* not now */ }
      if (on) { osd.classList.remove('show'); askSong(3); }
    }
    function askSong(tries) {
      var id = f.season != null ? showTmdb() : f.tmdbId;
      if (songAsked && tries === 3) return;
      songAsked = true;
      if (!id) return;
      api('/api/title/' + (f.season != null ? 'tv' : 'movie') + '/' + id + '/song').then(function (d) {
        if (s.closed) return;
        if (!d.song) { if (d.pending && tries > 0) setTimeout(function () { askSong(tries - 1); }, 4000); return; }
        credits.querySelector('.crd-why').textContent = d.song.why === 'credits' ? T('Over the credits') : d.song.why === 'theme' ? T('The show’s theme') : T('From the soundtrack');
        credits.querySelector('.crd-track').textContent = d.song.title;
        credits.querySelector('.crd-by').textContent = d.song.by || '';
        credits.classList.add('has-song');
      }).catch(function () {});
    }
    function dismissCredits() { s.creditsDismissed = true; syncCredits(); }

    // ---- the sharper version (like the website): a first watch starts on a quick 1080p copy and the 4K one downloads
    // as another version. Once it's ready, playback moves to it at the same spot: once per film, only on 4K TVs, never
    // on the adaptive or lighter stream, never to Dolby Vision without HDR. The link is asked for first (a Samsung may
    // have to wait for a relabelled copy), so the picture only stops once the new one is ready to open.
    var upgradeTicks = 0, upgradeLooks = 0, upgrading = false;
    function upgradeKey() { return f.versionKey || (f.season == null && f.tmdbId ? 'film:' + f.tmdbId : null); }
    function upgradeTarget() {
      var key = upgradeKey();
      if (!key || f.season != null || !tvUhd() || !s.playing || s.ended || adaptive || lowered || upgrading || upgradedFilms[key]) return null;
      var item = state.library.filter(function (x) { return x.versionKey === key; })[0];
      if (!item) { if (++upgradeLooks % 3 === 0) loadLibrary().catch(function () {}); return null; }
      var here = UPGRADE_RANK[f.versionQuality]; if (here == null) here = 2;
      var name = function (v) { return (v.file || '') + ' ' + (v.name || '') + ' ' + (v.versionLabel || ''); };
      return (item.versions || [item]).filter(function (v) {
        var rank = UPGRADE_RANK[v.versionQuality];
        return v.mediaKey !== f.mediaKey && v.id !== f.id && !v.converting && rank != null && rank > here
          && !(/\b(dv|dovi|dolby ?vision)\b/i.test(name(v)) && !/\bhdr(10)?\b/i.test(name(v)));
      })[0] || null;
    }
    function tryUpgrade() {
      var v = upgradeTarget();
      if (!v) return;
      var key = upgradeKey();
      upgrading = true; upgradedFilms[key] = true;
      api('/api/play-link?kind=lib&id=' + encodeURIComponent(v.id) + '&variant=' + (window.LILIN_TV_PLAY || 'browser-hevc')).then(function () {
        if (s.closed || s.ended) return;
        var at = playingAt();
        s.time = at;
        close();
        screen = history.pop(); // the player is replaced, not stacked
        play(v, at);
        toast(T('Switched to the {0} version: it finished downloading.', String(v.versionLabel || '4K').replace(/ · [\d.]+ [GM]B$/, '')));
      }).catch(function () { upgrading = false; });
    }
    // The next episode: the library's, else the one after it on TMDB (play first fetches it: the cold start has
    // usually started it already, src/cold-start.js follow-ups).
    var seasonsInfo = null;
    function showTmdb() {
      if (f.showTmdb) return f.showTmdb;
      var sh = showOf(f);
      if (sh && sh.tmdbId) return Number(sh.tmdbId);
      var m = /^tv-(\d+)$/.exec(String(f.show || ''));
      return m ? Number(m[1]) : null;
    }
    function knowSeasons() {
      var id = showTmdb();
      if (f.season == null || f.episode == null || !id || L.nextEpisode(f.id, state.library, state.shows)) return;
      api('/api/tv/' + id + '/seasons').then(function (d) { seasonsInfo = d.seasons || []; }).catch(function () {});
    }
    var fetchedNext = null;
    function nextUp() {
      var lib = L.nextEpisode(f.id, state.library, state.shows);
      if (lib || !seasonsInfo) return lib;
      if (fetchedNext) return fetchedNext;
      var x = L.nextAfter(seasonsInfo, f.season, f.episode);
      if (!x) return null;
      var sh = showOf(f);
      fetchedNext = { id: 'next:' + x.season + ':' + x.episode, fetch: true, season: x.season, episode: x.episode, show: f.show,
        still: sh && sh.backdrop || f.still, title: sh ? sh.title : f.filmTitle || f.title };
      return fetchedNext;
    }
    function paintUpNext() {
      var next = nextUp();
      var on = Boolean(next && !s.dismissed && L.isNextTime(s.time, s.duration, s.creditsAt, s.ended));
      if (upNext.classList.contains('show') !== on) upNext.classList.toggle('show', on);
      var counting = on && !s.busy && autoChain < L.AUTOPLAY_CHAIN && autoplayOn();
      if (counting && s.autoLeft == null) startCountdown();
      else if (!on) stopCountdown();
      if (!on) return;
      var title = [L.episodeLabel(next), next.episodeName].filter(Boolean).join(' · ');
      var t = upNext.querySelector('.up-next-title');
      if (t.textContent !== title) {
        t.textContent = title;
        var art = upNext.querySelector('.up-next-art');
        art.innerHTML = '';
        art.appendChild(img(next.still || (showOf(next) && showOf(next).backdrop)));
      }
      var left = s.autoLeft == null ? null : Math.max(1, Math.ceil(s.autoLeft));
      var label = s.busy ? T('Starting…') : left ? T('Next episode in {0}', left) : T('Next episode');
      var btn = upNext.querySelector('.play-next');
      if (btn.textContent !== label) btn.textContent = label;
      btn.style.setProperty('--progress', left == null ? '0' : String(1 - s.autoLeft / L.AUTOPLAY_SECONDS));
      btn.classList.toggle('counting', left != null);
      btn.classList.toggle('focus', cardFocus === 0);
      upNext.querySelector('.keep').classList.toggle('focus', cardFocus === 1);
      upNext.querySelector('.keep').textContent = s.ended ? T('Back') : T('Keep watching');
    }
    // Real seconds while the credits play or after the end; paused on the TV pauses it too.
    function startCountdown() {
      s.autoLeft = L.AUTOPLAY_SECONDS;
      var last = Date.now();
      autoTimer = setInterval(function () {
        var t = Date.now();
        if (s.playing || s.ended) s.autoLeft -= (t - last) / 1000;
        last = t;
        if (s.autoLeft <= 0) { stopCountdown(); autoChain++; playNext(); return; }
        paintUpNext();
      }, 250);
    }
    function stopCountdown() { clearInterval(autoTimer); autoTimer = null; s.autoLeft = null; }

    function skipIntro() {
      if (!s.intro) return;
      s.introDone = true;
      seekTo(s.intro.end);
    }
    function seekTo(sec) {
      sec = Math.max(0, Math.min(s.duration ? s.duration - 2 : sec, sec));
      s.time = sec;
      try { av.seekTo(Math.floor(sec * 1000), function () {}, function () {}); } catch (e) { /* not ready */ }
      paint();
    }
    // ◀ ▶ add up while pressed in a row, then one seek: AVPlay doesn't like a seek per key press.
    function nudge(delta) {
      if (!s.duration) return;
      seekTarget = Math.max(0, Math.min(s.duration - 2, (seekTarget != null ? seekTarget : s.time) + delta));
      showOsd(true); paint();
      clearTimeout(seekTimer);
      seekTimer = setTimeout(function () { var t = seekTarget; seekTarget = null; seekTo(t); showOsd(); }, 700);
    }
    function togglePause(want) {
      var pause = want != null ? want : s.playing;
      try { if (pause) av.pause(); else av.play(); } catch (e) { return; }
      s.playing = !pause; movedAt = Date.now();
      countPlayed();
      if (pause) save(true);
      showOsd(pause); paint();
      rest(pause);
    }

    // ---- resume points and watch time ----
    function countPlayed() {
      var t = Date.now();
      if (s.playTick) s.played += (t - s.playTick) / 1000;
      s.playTick = s.playing ? t : null;
    }
    function save(force) {
      if (!s.duration) return;
      var t = Date.now();
      if (!force && t - s.lastSave < 15000) return;
      s.lastSave = t;
      countPlayed();
      var done = s.ended || s.duration - s.time < L.DONE_SECONDS;
      var key = L.progressRef(f);
      if (done) {
        delete state.progress[key];
        var watched = load(WATCHED_KEY, {}); watched[key] = t;
        try { localStorage.setItem(WATCHED_KEY, JSON.stringify(watched)); } catch (e) { /* full */ }
      } else state.progress[key] = { time: s.time, duration: s.duration, at: t };
      var watchedSecs = Math.round(s.played * 10) / 10;
      s.played = 0;
      // auto: Up next started it and nobody has pressed a key since (asleep?): not marked finished on the server.
      api('/api/me/progress', { ref: key, time: done ? null : s.time, duration: s.duration, watched: watchedSecs, auto: autoChain > 0,
        about: { titleKey: L.titleKey(f), title: f.filmTitle || f.canonicalTitle || f.title || '', season: f.season != null ? f.season : null, episode: f.episode != null ? f.episode : null } })
        .catch(function () {});
    }

    // ---- subtitles and audio (▼) ----
    var subKind = f.part ? 'part' : 'lib'; // Play now videos get subtitles too (kept where the finished file lands)
    function subLangs() {
      return api('/api/subs/langs?kind=' + subKind + '&id=' + encodeURIComponent(f.id)).then(function (d) { return d.languages || []; }).catch(function () { return []; });
    }
    function setSubs(lang) {
      s.subLang = lang || '';
      s.cues = null; subsEl.textContent = '';
      if (!lang) return Promise.resolve();
      return api('/api/subs/fetch', { kind: subKind, id: f.id, lang: lang })
        .then(function (r) { return fetch(SERVER + r.url, { credentials: 'omit' }); })
        .then(function (r) { return r.text(); })
        .then(function (text) { if (s.subLang === lang) s.cues = L.parseVtt(text); })
        .catch(function (err) { toast(T('Couldn’t get those subtitles: {0}', err.message)); });
    }
    function audioTracks() {
      try {
        return av.getTotalTrackInfo().filter(function (t) { return t.type === 'AUDIO'; }).map(function (t) {
          var info = {}; try { info = JSON.parse(t.extra_info); } catch (e) { /* none */ }
          return { index: t.index, name: [info.language ? String(info.language).toUpperCase() : T('Track {0}', t.index + 1), info.channels ? info.channels + ' ch' : '', info.fourCC || ''].filter(Boolean).join(' · ') };
        });
      } catch (e) { return []; }
    }
    function openMenu() {
      showOsd(true);
      subLangs().then(function (langs) {
        menuItems = [{ head: T('Subtitles') }, { label: T('Off'), on: !s.subLang, act: function () { setSubs(''); } }];
        langs.forEach(function (l) { menuItems.push({ label: l.name, on: s.subLang === l.code, act: function () { toast(T('Getting {0} subtitles…', l.name)); setSubs(l.code); } }); });
        var tracks = audioTracks();
        if (tracks.length > 1) {
          var current = -1;
          try { var cur = av.getCurrentStreamInfo().filter(function (t) { return t.type === 'AUDIO'; })[0]; current = cur ? cur.index : -1; } catch (e) { /* unknown */ }
          menuItems.push({ head: T('Audio') });
          tracks.forEach(function (t) { menuItems.push({ label: t.name, on: t.index === current, act: function () { try { av.setSelectTrack('AUDIO', t.index); } catch (e) { toast(T('This audio track can’t be picked here.')); } } }); });
        }
        if (f.season != null) {
          menuItems.push({ head: T('Autoplay next episode') });
          [[true, T('On')], [false, T('Off')]].forEach(function (o) {
            menuItems.push({ label: o[1], on: autoplayOn() === o[0], act: function () {
              try { localStorage.setItem(AUTOPLAY_KEY, JSON.stringify(o[0])); } catch (e) { /* full */ }
              if (!o[0]) stopCountdown();
              paintUpNext();
            } });
          });
        }
        menuIndex = menuItems.findIndex(function (m) { return m.on; });
        if (menuIndex < 0) menuIndex = 1;
        menu.classList.add('show');
        paintMenu();
      });
    }
    function paintMenu() {
      menu.innerHTML = '';
      menuItems.forEach(function (m, i) {
        menu.appendChild(m.head ? h('div', { class: 'menu-head', text: m.head })
          : h('div', { class: 'menu-item' + (m.on ? ' on' : '') + (i === menuIndex ? ' focus' : ''), text: m.label }));
      });
    }
    function menuMove(d) {
      var i = menuIndex;
      do { i += d; } while (menuItems[i] && menuItems[i].head);
      if (menuItems[i]) { menuIndex = i; paintMenu(); }
    }

    // ---- starting, ending, next episode ----
    function close() {
      if (s.closed) return;
      s.closed = true;
      save(true);
      clearInterval(tick); stopCountdown(); clearTimeout(osdTimer); clearTimeout(seekTimer); clearTimeout(restTimer);
      try { av.stop(); } catch (e) { /* already */ }
      try { av.close(); } catch (e) { /* already */ }
      if (obj.parentNode) obj.parentNode.removeChild(obj);
      document.body.classList.remove('playing');
      document.removeEventListener('visibilitychange', onHidden);
    }
    function leavePlayer() { close(); back(); }
    function playNext() {
      var next = nextUp();
      if (!next || s.busy) return;
      s.busy = true; paintUpNext();
      s.ended = true; // counts as watched
      close();
      screen = history.pop(); // the player is replaced, not stacked
      if (next.fetch) {
        getReady({ type: 'tv', tmdbId: showTmdb(), season: next.season, episode: next.episode, title: next.title,
          sub: L.episodeLabel(next), art: next.still });
        return;
      }
      var p = state.progress[L.progressRef(next)];
      play(next, L.resumable(p) ? p.time : 0);
    }
    function onHidden() { if (document.hidden) leavePlayer(); } // TV home button or another app: stop, keep the resume point

    function fail(message) {
      spinner.textContent = T('This video can’t play on the TV.') + ' ' + (message || '');
      spinner.classList.add('error');
    }
    // AVPlay on older Tizen can sit in "Loading…" forever after a dropped connection. If buffering or the
    // play position stalls for 12 s, the stream is reopened where it stopped (up to 5 times in a row).
    // A slow connection (slower than the video's bitrate) stalls again and again: the first stall during playback switches to
    // the 720p live stream (about 2.5 Mbit/s) instead of reopening the same file. The first load gets a minute,
    // since a big film's index alone can take longer than 12 s on such a connection.
    // Android (ExoPlayer) is different: it rebuffers and retries by itself, so reopening only threw its buffer away
    // and showed "Reconnecting…" over and over on a slow line. There the original file plays (the website's quality)
    // until the connection proves too slow for it (a slow first load, a long or repeated stall, or the player's own
    // bandwidth estimate below the video's bitrate); then it moves once to the adaptive stream (1080p/720p, which
    // ExoPlayer switches between on its own). Only 90 s with nothing moving reopens it.
    var streamUrl = null, bufferingSince = 0, movedAt = 0, lastPlayMs = -1, retries = 0, reopening = false;
    var framed = false, stalls = 0, lowered = false;
    var exo = onAndroid(), adaptive = false, openedAt = 0, stallTimes = [], net = null;
    if (exo && window.__mq) window.__mq.handlers.net = function (e) { net = e; net.at = Date.now(); };
    function openStream(at) {
      av.open(streamUrl);
      movedAt = openedAt = Date.now(); bufferingSince = 0; framed = false;
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* older firmware */ }
        av.setListener({
          onbufferingstart: function () {
            spinner.textContent = T('Loading…'); spinner.classList.add('show'); bufferingSince = Date.now();
            if (framed && seekTarget == null) stallTimes = stallTimes.filter(function (t) { return bufferingSince - t < 180000; }).concat([bufferingSince]);
          },
          onbufferingcomplete: function () { spinner.classList.remove('show'); bufferingSince = 0; },
          oncurrentplaytime: function (ms) {
            if (seekTarget == null) s.time = ms / 1000;
            if (ms !== lastPlayMs) { lastPlayMs = ms; movedAt = Date.now(); if (ms > 1000) retries = 0; if (bufferingSince === 0) framed = true; }
          },
          onstreamcompleted: function () {
            s.ended = true; s.playing = false; countPlayed(); save(true);
            if (nextUp() && !s.dismissed) { cardFocus = 0; paint(); } else leavePlayer();
          },
          onerror: function (e) { if (!reopen()) fail(String(e)); },
          onevent: function () {},
        });
        av.prepareAsync(function () {
          if (s.closed) return;
          s.duration = av.getDuration() / 1000;
          var go = function () { try { av.play(); s.playing = true; s.playTick = Date.now(); spinner.classList.remove('show'); showOsd(); paint(); } catch (e) { fail(e.message); } };
          if (at > 5) {
            s.time = at;
            av.seekTo(Math.floor(at * 1000), go, function (e) {
              if (!reopen()) fail(T('Couldn’t restore your playback position.') + ' ' + String(e && e.name || e || ''));
            });
          } else go();
        }, function (e) { if (!reopen()) fail(String(e && e.name || e)); });
    }
    function playingAt() {
      var at = s.time;
      try {
        var live = av.getCurrentTime() / 1000;
        if (live > 5 || at <= 5) at = live;
      } catch (e) { /* keep the last reported position */ }
      return at;
    }
    // Android: once, from the file to the adaptive stream at the same spot.
    function goAdaptive() {
      if (adaptive || lowered || reopening || s.closed || (f.part && !f.adaptiveUrl)) return false;
      adaptive = true; reopening = true;
      var at = s.time = playingAt();
      save(true);
      spinner.textContent = T('Slow connection: switching to a stream that adapts to it…'); spinner.classList.add('show');
      try { av.stop(); } catch (e) { /* already */ }
      try { av.close(); } catch (e) { /* already */ }
      var go = function (url) {
        reopening = false;
        if (s.closed) return;
        streamUrl = url; retries = 0; stallTimes = []; net = null;
        try { openStream(at); } catch (e) { fail(e.message); }
      };
      if (f.part) { go(SERVER + f.adaptiveUrl); return true; }
      var base = String(window.LILIN_TV_PLAY || 'browser').split('&')[0];
      api('/api/play-link?kind=lib&id=' + encodeURIComponent(f.id) + '&variant=' + base + '&quality=abr')
        .then(function (link) { go(SERVER + link.url); }, function () { go(streamUrl); });
      return true;
    }
    function reopen(slow) {
      if (s.closed || reopening || !streamUrl || retries >= 5) return false;
      if (exo && !adaptive && retries >= 1 && goAdaptive()) return true; // the file failed twice: the adaptive stream instead
      retries++; reopening = true;
      if (slow) stalls++;
      var lower = !exo && slow && stalls >= 1 && !lowered && !f.part;
      var at = playingAt();
      s.time = at;
      save(true);
      spinner.textContent = T('Reconnecting…'); spinner.classList.add('show');
      try { av.stop(); } catch (e) { /* already */ }
      try { av.close(); } catch (e) { /* already */ }
      if (lower) {
        lowered = true;
        spinner.textContent = T('Slow connection: switching to a lighter stream…');
        var base = String(window.LILIN_TV_PLAY || 'browser-hevc').split('&')[0];
        api('/api/play-link?kind=lib&id=' + encodeURIComponent(f.id) + '&variant=' + base + '&quality=720').then(function (link) {
          reopening = false;
          if (s.closed) return;
          streamUrl = SERVER + link.url; retries = 0;
          try { openStream(at); } catch (e) { fail(e.message); }
        }).catch(function () { reopening = false; if (!s.closed) { try { openStream(at); } catch (e) { fail(e.message); } } });
        return true;
      }
      setTimeout(function () { reopening = false; if (!s.closed) { try { openStream(at); } catch (e) { fail(e.message); } } }, 1000);
      return true;
    }
    function watchStall() {
      if (reopening || s.ended || seekTarget != null) return;
      var t = Date.now();
      if (exo) {
        if (!adaptive) {
          var slowStart = !framed && t - openedAt > 25000;
          var longStall = framed && bufferingSince && t - bufferingSince > 6000;
          var slowNet = framed && net && t - net.at < 5000 && net.bw > 0 && net.br > 0 && net.bw < net.br * 1.2 && net.buf < 15000;
          if ((slowStart || longStall || stallTimes.length >= 2 || slowNet) && goAdaptive()) return;
        }
        if ((bufferingSince && t - bufferingSince > 90000) || (s.playing && t - movedAt > 90000)) reopen();
        return;
      }
      var limit = framed ? 15000 : 60000;
      if ((bufferingSince && t - bufferingSince > limit) || (s.playing && t - movedAt > limit)) reopen(Boolean(bufferingSince) || framed);
    }
    function begin() {
      document.body.insertBefore(obj, document.body.firstChild);
      document.body.classList.add('playing');
      document.addEventListener('visibilitychange', onHidden);
      // The MP4 copy when there is one (always TV-safe audio: the TV can't decode DTS), else the original.
      // The Android app asks for H.264 instead on TVs that can't decode HEVC (tv/android, Codecs.java).
      // Play now (getReady): a stream of a video that's still downloading, already signed by the server.
      if (f.part) { streamUrl = SERVER + f.url; openStream(startAt); }
      else api('/api/play-link?kind=lib&id=' + encodeURIComponent(f.id) + '&variant=' + (window.LILIN_TV_PLAY || 'browser-hevc')).then(function (link) {
        if (s.closed) return;
        streamUrl = SERVER + link.url;
        openStream(startAt);
      }).catch(function (err) { fail(err.message); });
      tick = setInterval(function () {
        if (s.closed) return;
        if (s.playing && seekTarget == null) s.time = now();
        paint();
        if (s.playing) save(false);
        watchStall();
        if (++upgradeTicks % 40 === 0) tryUpgrade(); // every 20 s
      }, 500);
      knowSeasons();
      var pref = state.me && state.me.settings && state.me.settings.subLang;
      if (pref) subLangs().then(function (langs) { if (langs.some(function (l) { return l.code === pref; })) setSubs(pref); });
      if (f.part) return; // no intro marks until it's whole
      var base = '/api/media/lib/' + encodeURIComponent(f.id);
      api(base + '/intro').then(function (d) { if (d.intro && d.intro.end - d.intro.start >= 5) s.intro = d.intro; }).catch(function () {});
      api(base + '/credits').then(function (d) { if (d.creditsAt > 0) s.creditsAt = d.creditsAt; }).catch(function () {});
    }

    show({ el: el, leave: close, key: function (code) {
      if (el.classList.contains('resting')) { rest(false); if (!s.playing) rest(true); if (code !== KEY.ENTER && code !== KEY.PLAYPAUSE && code !== KEY.PLAY && code !== KEY.BACK && code !== KEY.STOP) { showOsd(true); return true; } }
      if (menu.classList.contains('show')) {
        if (code === KEY.UP) menuMove(-1);
        else if (code === KEY.DOWN) menuMove(1);
        else if (code === KEY.ENTER) { var m = menuItems[menuIndex]; if (m && m.act) m.act(); menu.classList.remove('show'); showOsd(); }
        else if (code === KEY.BACK || code === KEY.LEFT) { menu.classList.remove('show'); showOsd(); }
        return true;
      }
      if (creditsOn && (code === KEY.UP || (code === KEY.BACK && !upNext.classList.contains('show')))) { dismissCredits(); showOsd(); return true; }
      var cardOn = upNext.classList.contains('show');
      if (cardOn) {
        if (code === KEY.LEFT || code === KEY.RIGHT) { cardFocus = cardFocus ? 0 : 1; stopCountdown(); paint(); return true; }
        if (code === KEY.ENTER) { if (cardFocus === 0) playNext(); else { s.dismissed = true; if (s.ended) leavePlayer(); else paint(); } return true; }
        if (code === KEY.BACK) { s.dismissed = true; if (s.ended) leavePlayer(); else paint(); return true; }
      }
      if (code === KEY.ENTER && skipBtn.classList.contains('show')) { skipIntro(); return true; }
      if (code === KEY.ENTER || code === KEY.PLAYPAUSE) { togglePause(); return true; }
      if (code === KEY.PLAY) { togglePause(false); return true; }
      if (code === KEY.PAUSE) { togglePause(true); return true; }
      if (code === KEY.LEFT || code === KEY.RW) { nudge(-10); return true; }
      if (code === KEY.RIGHT || code === KEY.FF) { nudge(code === KEY.FF ? 30 : 10); return true; }
      if (code === KEY.DOWN) { openMenu(); return true; }
      if (code === KEY.UP) { showOsd(); return true; }
      if (code === KEY.BACK || code === KEY.STOP) { leavePlayer(); return true; }
      return true;
    } }, true);
    spinner.classList.add('show');
    begin();
  }

  start();
})();
