// Scan to sign in: the sign-in page on a computer (and the TV apps) shows a QR code; a phone that's already
// signed in to Lilin scans it, says yes, and the computer is signed in as that person. No password typed.
//
// The handshake is tv.js's pairing (a short code + a secret poll id), in its own pool with a short life.
// The QR holds a link to the app (`/?signin=CODE&on=web|tv`); the phone shows which device and roughly where it
// is before anything happens, so a code someone else shows you can't quietly sign them in as you.
import { svg as qrSvg, rows as qrRows } from './qr.js';
import { tr } from './i18n.js';

export const WEB_TTL_MS = 2 * 60_000;

// The link inside the QR code.
export const scanLink = (base, code, on) => `${String(base).replace(/\/+$/, '')}/?signin=${encodeURIComponent(code)}&on=${on}`;

// "Firefox on Windows": what the phone shows about the computer asking.
export function deviceOf(userAgent) {
  const ua = String(userAgent || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Vivaldi/.test(ua) ? 'Vivaldi'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  return { browser, os };
}

// Roughly where: the home network, or the city/country Cloudflare saw (when it's in front).
export function placeOf(req) {
  if (!req.auth?.remote) return { home: true };
  const city = String(req.headers['cf-ipcity'] || '').slice(0, 60) || null;
  const country = /^[A-Z]{2}$/.test(String(req.headers['cf-ipcountry'] || '')) ? req.headers['cf-ipcountry'] : null;
  return { home: false, city, country: country === 'XX' || country === 'T1' ? null : country };
}

export function startWeb(pairing, req, base) {
  const r = pairing.start({ label: { kind: 'web', ...deviceOf(req.headers['user-agent']) }, where: placeOf(req) });
  const link = scanLink(base, r.code, 'web');
  return { ...r, link, svg: qrSvg(link, { label: tr('QR code to sign in') }) };
}

// What the TV apps get on top of their code: the link and the QR as rows of 0/1 (they draw it themselves).
export function tvExtras(code, base) {
  const link = scanLink(base, code, 'tv');
  return { link, qr: qrRows(link) };
}

// The left half of the sign-in page on a computer: the QR, what to do, and the countdown. Filled in by the script.
export function signInQrPanel() {
  const words = {
    expires: tr('Code expires in {0}', '{0}'), // the script fills in the time
    expired: tr('The code expired.'),
    again: tr('Show a new code'),
    done: tr('Signed in. Opening Lilin…'),
    failed: tr('Couldn’t get a code. Use your password instead.'),
  };
  return `<section class="qr-side" id="qr-side" hidden data-words="${esc(JSON.stringify(words))}">
<div class="qr-frame"><div class="qr-code" id="qr-code" aria-live="polite"></div><img class="qr-mark" src="/c/favicon.svg" width="24" height="24" alt=""></div>
<h2>${tr('Scan with your phone')}</h2>
<p class="qr-how">${tr('Open the camera on a phone that’s signed in to Lilin and point it at the code.')}</p>
<p class="qr-typed" id="qr-typed" hidden>${tr('No camera? In Lilin, open You → Devices and notifications and enter')} <b id="qr-letters"></b></p>
<p class="qr-left" id="qr-left" role="status"></p>
<button type="button" class="qr-again" id="qr-again" hidden>${tr('Show a new code')}</button>
</section><div class="qr-or" id="qr-or" hidden aria-hidden="true"><span>${tr('or')}</span></div>`;
}

// Runs on the sign-in page. Plain ES2017, no modules: the page has no other script.
export const SIGN_IN_QR_SCRIPT = `<script>(function () {
  var side = document.getElementById('qr-side');
  if (!side || !window.fetch) return;
  var W = JSON.parse(side.getAttribute('data-words'));
  var box = document.getElementById('qr-code'), left = document.getElementById('qr-left'), again = document.getElementById('qr-again');
  var typed = document.getElementById('qr-typed'), letters = document.getElementById('qr-letters');
  var nextField = document.querySelector('input[name=next]');
  var wide = window.matchMedia('(min-width: 760px)');
  var poll = null, ends = 0, tick = null, wait = null, fresh = 0, started = false, busy = false;
  function stop() { clearInterval(tick); clearTimeout(wait); tick = wait = null; }
  function clock() {
    var s = Math.max(0, Math.round((ends - Date.now()) / 1000));
    left.textContent = W.expires.replace('{0}', Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2));
    if (s <= 0) expired();
  }
  function expired() {
    stop(); poll = null; side.classList.add('is-stale');
    // a few fresh codes on their own, then wait for a click (an open tab shouldn't ask forever)
    if (fresh < 8 && !document.hidden) { start(); return; }
    left.textContent = W.expired; again.hidden = false;
  }
  function start() {
    if (busy) return;
    busy = true; again.hidden = true; fresh++;
    fetch('/c/qr/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function (r) {
        box.innerHTML = r.svg; poll = r.poll; ends = Date.now() + r.expiresIn * 1000;
        letters.textContent = r.code.slice(0, 3) + ' ' + r.code.slice(3); typed.hidden = false;
        side.classList.remove('is-stale'); clock(); tick = setInterval(clock, 1000); check();
      })
      .catch(function () { left.textContent = W.failed; again.hidden = false; side.classList.add('is-stale'); })
      .then(function () { busy = false; });
  }
  function check() {
    clearTimeout(wait);
    wait = setTimeout(function () {
      if (!poll || document.hidden) return;
      var id = poll;
      fetch('/c/qr/poll?id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (id !== poll) return;
          if (r.state === 'approved') {
            stop(); poll = null; side.classList.add('is-done'); left.textContent = W.done;
            location.replace(nextField ? nextField.value : '/');
          } else if (r.state === 'expired') expired();
          else check();
        }, function () { check(); });
    }, 1800);
  }
  function show() {
    if (!wide.matches || started) return;
    started = true; side.hidden = false; document.getElementById('qr-or').hidden = false;
    document.body.classList.add('qr-on'); start();
  }
  again.addEventListener('click', function () { fresh = 0; start(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !started) return;
    if (poll && Date.now() < ends) check(); else if (!busy) { fresh = 0; start(); }
  });
  if (wide.addEventListener) wide.addEventListener('change', show);
  show();
})();</script>`;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
