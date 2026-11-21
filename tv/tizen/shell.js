// Loads Lilin's TV app from the server into this page, so a Lilin update reaches the TV without reinstalling
// anything. The app is the Rust one (public/tv-rs: WebAssembly drawing with WebGL, much lighter on the TV's CPU).
// If it stops, or the server can't be reached, it says so and keeps trying.
(function () {
  'use strict';
  var server = String(window.LILIN_SERVER || '').replace(/\/+$/, '');
  var added = [];
  var waiting = false;

  function note(text) { var n = document.getElementById('shell-note'); if (n) n.textContent = text; }
  function add(el) { added.push(el); document.head.appendChild(el); }
  function script(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { done(null); };
    s.onerror = function () { done(new Error('failed')); };
    add(s);
  }
  function retry() {
    added.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    added = [];
    waiting = true;
    note('Kan inte nå Lilin på ' + server + '. Är servern på? Försöker igen…');
    setTimeout(function () { waiting = false; load(); }, 5000);
  }
  // The Rust app: /tv-rs/host.js starts /tv-rs/lilin_tv.wasm.
  function load() {
    script(server + '/tv-rs/host.js?v=' + Date.now(), function (err) {
      if (err || !window.LilinTvHost) return retry();
      window.LilinTvHost.start({ server: server, onFail: retry });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (waiting && (e.keyCode === 10009 || e.keyCode === 8)) {
      try { tizen.application.getCurrentApplication().exit(); } catch (x) { /* not on a TV */ }
    }
  });
  if (!server) { note('Den här appen byggdes utan Lilin-adress. Bygg om den med LILIN_URL.'); return; }
  // Lilin's own lettering for the splash (the same font the TV app uses), from the server.
  var face = document.createElement('style');
  face.textContent = '@font-face{font-family:"Bricolage Grotesque";font-weight:200 800;src:url("' + server + '/fonts/bricolage-grotesque-latin.woff2") format("woff2")}';
  document.head.appendChild(face);
  load();
})();
