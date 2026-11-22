// Lilin's LG (webOS) TV shell. Like tv/tizen/shell.js it loads the TV app from the server every time it starts
// (public/tv-rs: the Rust app, drawn with WebGL), so a Lilin update reaches the TV without reinstalling.
// The TV app was written for Samsung's AVPlay player, so this page gives it an object with the same methods
// (webapis.avplay) backed by an HTML5 <video> under the app's canvas, and turns LG's Back key into Samsung's.
(function () {
  'use strict';
  var server = String(window.LILIN_SERVER || '').replace(/\/+$/, '');
  var lang = /^sv/i.test(navigator.language || '') ? 'sv' : 'en';
  var BACK_LG = 461, BACK_SAMSUNG = 10009;

  // ---------- leaving the app ----------
  window.tizen = {
    application: { getCurrentApplication: function () { return { exit: function () { window.close(); } }; } },
    tvinputdevice: { registerKey: function () {}, unregisterKey: function () {} },
  };

  // ---------- the remote: Back arrives as 461 on LG, the app expects Samsung's 10009 ----------
  window.addEventListener('keydown', function (e) {
    if (e.keyCode !== BACK_LG) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var k = document.createEvent('Event');
    k.initEvent('keydown', true, true);
    Object.defineProperty(k, 'keyCode', { value: BACK_SAMSUNG });
    Object.defineProperty(k, 'which', { value: BACK_SAMSUNG });
    (document.activeElement || document.body).dispatchEvent(k);
  }, true);

  // ---------- webapis.avplay on an HTML5 <video> ----------
  var v = null, url = '', listener = {}, state = 'NONE', buffering = false, tick = null, rect = [0, 0, 1920, 1080];
  function call(name, arg) {
    var f = listener[name];
    if (typeof f === 'function') { try { f(arg); } catch (err) { setTimeout(function () { throw err; }); } }
  }
  function place() {
    if (v) v.style.cssText = 'position:absolute;left:' + rect[0] + 'px;top:' + rect[1] + 'px;width:' + rect[2] + 'px;height:' + rect[3] +
      'px;z-index:0;background:#000;object-fit:contain;';
  }
  function setBuffering(on) {
    if (on === buffering) return;
    buffering = on;
    call(on ? 'onbufferingstart' : 'onbufferingcomplete');
  }
  function drop() {
    clearInterval(tick); tick = null;
    if (!v) return;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* already gone */ }
    if (v.parentNode) v.parentNode.removeChild(v);
    v = null;
  }
  function ms() { return v ? Math.round((v.currentTime || 0) * 1000) : 0; }
  function errText(el) { return el && el.error ? 'PLAYER_ERROR_' + (el.error.code || 0) + ' ' + (el.error.message || '') : 'PLAYER_ERROR'; }
  function once(el, ok, bad, okEvent) {
    function done(f, arg) { el.removeEventListener(okEvent, onOk); el.removeEventListener('error', onBad); if (f) f(arg); }
    function onOk() { done(ok); }
    function onBad() { done(bad, errText(el)); }
    el.addEventListener(okEvent, onOk);
    el.addEventListener('error', onBad);
  }
  var avplay = {
    open: function (u) {
      drop();
      url = String(u); listener = {}; state = 'IDLE'; buffering = false; rect = [0, 0, 1920, 1080];
      v = document.createElement('video');
      v.preload = 'auto';
      v.autoplay = false;
      place();
      document.body.insertBefore(v, document.body.firstChild);
      v.addEventListener('waiting', function () { setBuffering(true); });
      v.addEventListener('playing', function () { setBuffering(false); });
      v.addEventListener('canplay', function () { setBuffering(false); });
      v.addEventListener('ended', function () { state = 'IDLE'; call('onstreamcompleted'); });
      v.addEventListener('error', function () {
        if (state === 'IDLE') return; // prepareAsync reports it
        call('onerror', errText(v));
      });
    },
    close: function () { drop(); state = 'NONE'; },
    stop: function () { if (v) v.pause(); state = 'IDLE'; },
    setListener: function (l) { listener = l || {}; },
    setDisplayRect: function (x, y, w, h) { rect = [+x || 0, +y || 0, +w || 1920, +h || 1080]; place(); },
    setDisplayMethod: function () {},
    prepare: function () { if (v) { v.src = url; v.load(); state = 'READY'; } },
    prepareAsync: function (ok, fail) {
      if (!v) { if (fail) fail('PLAYER_ERROR_INVALID_STATE'); return; }
      once(v, function () { state = 'READY'; if (ok) ok(); }, fail, 'loadedmetadata');
      v.src = url;
      v.load();
    },
    play: function () {
      if (!v) return;
      state = 'PLAYING';
      var p = v.play();
      if (p && p.catch) p.catch(function (e) { call('onerror', String(e && e.message || e)); });
      if (!tick) tick = setInterval(function () { if (v && !v.paused) call('oncurrentplaytime', ms()); }, 500);
    },
    pause: function () { if (v) v.pause(); state = 'PAUSED'; },
    seekTo: function (to, ok, fail) {
      if (!v) { if (fail) fail('PLAYER_ERROR_INVALID_STATE'); return; }
      once(v, ok, fail, 'seeked');
      v.currentTime = Math.max(0, to) / 1000;
    },
    getCurrentTime: function () { return ms(); },
    getDuration: function () { return v && isFinite(v.duration) ? Math.round(v.duration * 1000) : 0; },
    getState: function () { return state; },
    getTotalTrackInfo: function () {
      var out = [], t = v && v.audioTracks;
      for (var i = 0; t && i < t.length; i++) {
        out.push({ index: i, type: 'AUDIO', extra_info: JSON.stringify({ language: t[i].language || t[i].label || '', channels: '', fourCC: '' }) });
      }
      return out;
    },
    getCurrentStreamInfo: function () {
      var t = v && v.audioTracks;
      for (var i = 0; t && i < t.length; i++) if (t[i].enabled) return [{ index: i, type: 'AUDIO' }];
      return [];
    },
    setSelectTrack: function (type, index) {
      var t = v && v.audioTracks;
      if (type !== 'AUDIO' || !t) return;
      for (var i = 0; i < t.length; i++) t[i].enabled = i === index;
    },
    setSilentSubtitle: function () {},
  };
  window.webapis = { avplay: avplay };

  // Which copy to ask Lilin for: the HEVC one when this TV plays HEVC Main 10 in a <video>, else H.264.
  var probe = document.createElement('video');
  var hevc = probe.canPlayType && (probe.canPlayType('video/mp4; codecs="hvc1.2.4.L153.B0"') || probe.canPlayType('video/mp4; codecs="hev1.2.4.L153.B0"'));
  var play = hevc ? 'browser-hevc' : 'browser&quality=auto';

  // ---------- loading the TV app from the server ----------
  var added = [], waiting = false;
  function note(text) { var n = document.getElementById('shell-note'); if (n) n.textContent = text; }
  function add(el) { added.push(el); document.head.appendChild(el); }
  function script(src, done) {
    var s = document.createElement('script');
    s.async = false;
    s.src = src;
    s.onload = function () { done(null); };
    s.onerror = function () { done(new Error('failed')); };
    add(s);
  }
  function retry() {
    if (waiting) return;
    added.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    added = [];
    waiting = true;
    note(lang === 'sv' ? 'Kan inte nå Lilin på ' + server + '. Är servern på? Försöker igen…'
      : 'Can’t reach Lilin at ' + server + '. Is the server on? Trying again…');
    setTimeout(function () { waiting = false; load(); }, 5000);
  }
  function load() {
    var t = Date.now();
    if (lang === 'sv') script(server + '/tv/sv.js?v=' + t, function () { /* English if it fails */ });
    script(server + '/tv-rs/host.js?v=' + t, function (err) {
      if (err || !window.LilinTvHost) return retry();
      window.LilinTvHost.start({ server: server, lang: lang, play: play, onFail: retry });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (waiting && (e.keyCode === BACK_SAMSUNG || e.keyCode === 8)) window.close();
  });
  if (!server) { note('This app was built without a Lilin address. Rebuild it with LILIN_URL.'); return; }
  var face = document.createElement('style');
  face.textContent = '@font-face{font-family:"Bricolage Grotesque";font-weight:200 800;src:url("' + server + '/fonts/bricolage-grotesque-latin.woff2") format("woff2")}';
  document.head.appendChild(face);
  load();
})();
