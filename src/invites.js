// Invites: the owner makes a one-time link, sends it to someone, they open it and enter the email
// they'll sign in with. Lilin adds that email to a Zero Trust email list (Reusable components →
// Lists) that Lilin's Access policy allows ("Emails in list"), then sends them to Lilin, where
// Cloudflare's login page lets them pick any login method you've enabled (one-time email code,
// Google, ...). From then on they just sign in.
//
// Needs, in .env: CF_API_TOKEN (permission "Zero Trust: Edit"), CF_ACCOUNT_ID and CF_ACCESS_LIST_ID.
// Invite pages live under /c/i/, so the same Cloudflare Access bypass as shared clips covers them.
// Links are single use and expire.
//
// When Lilin is Cloudflare's sign-in provider (oidc.js, handlePublic gets `auth`), the invite page
// also asks for a password, creates the Lilin account and signs the browser in, so the person lands
// in Lilin without seeing a login page. A "password link" is an invite tied to one existing member's
// email: the only way to claim an email that's already on the list.
//
// With Lilin signing people in, a new person picks a username instead of giving an email: they get an
// account id (account-ids.js) on the Access list and never type an email at all.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { esc, page, baseUrl, brandCard } from './clips.js';
import { passwordProblem, passwordPeek, brandMark } from './auth.js';
import { translateHtml, translate, tr } from './i18n.js';

const CF_API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');
const CF_TOKEN = process.env.CF_API_TOKEN || '';
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || '';
const CF_LIST = process.env.CF_ACCESS_LIST_ID || '';
const INVITE_DAYS = Math.max(1, Number(process.env.INVITE_DAYS) || 7);
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

let file = null;
let invites = {};        // token -> { id, note, created, expires, usedAt, email, forEmail, by, byName }
let record = () => {};   // activity logger, from server.js
let hasPassword = () => false;   // does this email have a Lilin password? (auth.js, when Lilin signs people in)
const attempts = [];     // timestamps of invite form posts, for a simple global rate limit

export function initInvites({ dataDir, onEvent, passwordFor = null }) {
  file = path.join(dataDir, '.lilin-invites.json');
  try { invites = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { invites = {}; }
  record = onEvent || record;
  if (passwordFor) hasPassword = passwordFor;
}
export const invitesConfigured = () => Boolean(CF_TOKEN && CF_ACCOUNT && CF_LIST);
const save = () => { try { fs.writeFileSync(file, JSON.stringify(invites, null, 1)); } catch { /* memory only */ } };
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------- Cloudflare Zero Trust email list ----------
async function cf(method, suffix = '', body) {
  const r = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/gateway/lists/${CF_LIST}${suffix}`, {
    method,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  let data = {};
  try { data = await r.json(); } catch { /* not JSON */ }
  if (!r.ok || data.success === false) {
    const why = data.errors?.map((e) => e.message).join('; ') || `HTTP ${r.status}`;
    throw httpError(502, `Cloudflare refused: ${why}`);
  }
  return data.result;
}

export async function members() {
  const items = (await cf('GET', '/items?per_page=1000')) || [];
  return items.map((i) => String(i.value || '').toLowerCase()).filter(Boolean);
}
// Single-item append / remove: nothing else in the list is touched.
export async function addMember(email) {
  if ((await members()).includes(email)) return;
  await cf('PATCH', '', { append: [{ value: email, description: 'Lilin invite' }] });
}
// Ends every Cloudflare Access sign-in this person has (they must sign in again, which they can't once removed).
export async function revokeAccess(email) {
  if (!invitesConfigured() || !EMAIL.test(String(email || ''))) return;
  const r = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/access/organizations/revoke_user`, {
    method: 'POST', headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email).toLowerCase() }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Cloudflare refused: HTTP ${r.status}`);
}

export async function removeMember(email, admins = []) {
  email = String(email || '').toLowerCase();
  if (admins.includes(email)) throw httpError(400, 'Owners (ADMIN_EMAILS) can’t be removed here.');
  const actual = ((await cf('GET', '/items?per_page=1000')) || []).map((i) => i.value).find((v) => String(v).toLowerCase() === email);
  if (actual) await cf('PATCH', '', { remove: [actual] });
  return members();
}

// Someone switched from their email to a username (usernames.js): their links and used invites follow.
export function renameIdentity(previous, next) {
  let changed = false;
  for (const inv of Object.values(invites)) {
    for (const k of ['email', 'forEmail']) if (inv[k] && inv[k] === previous) { inv[k] = next; changed = true; }
  }
  if (changed) save();
}

// ---------- invites (owner side) ----------
// A password link is done once its person has a password, however they set it (another link, the
// password popup, setup.js): it leaves the owner's list and stops working.
const state = (inv) => (inv.usedAt ? 'used' : inv.forEmail && hasPassword(inv.forEmail) ? 'done'
  : inv.expires < Date.now() ? 'expired' : 'open');
export function listInvites() {
  return Object.entries(invites)
    .map(([token, inv]) => ({ ...inv, token, state: state(inv) }))
    .sort((a, b) => b.created - a.created)
    .slice(0, 50);
}
// Members the owner lets invite people may have this many open links at a time.
export const MEMBER_OPEN_INVITES = 3;
// `by`: the member who made it ({ id, name }), when it isn't the owner.
export function createInvite(req, note = '', forEmail = null, by = null) {
  const token = crypto.randomBytes(12).toString('base64url');
  const inv = { id: crypto.randomBytes(4).toString('hex'), note: String(note).slice(0, 60), created: Date.now(), expires: Date.now() + INVITE_DAYS * 86400000, usedAt: null, email: null, forEmail: forEmail ? String(forEmail).toLowerCase() : null,
    by: by?.id ?? null, byName: by?.name ?? null };
  // A new password link replaces any earlier open one for the same person (no stray spare links).
  if (inv.forEmail) for (const [t, i] of Object.entries(invites)) if (i.forEmail === inv.forEmail && state(i) === 'open') delete invites[t];
  invites[token] = inv;
  // forget used/expired invites after 30 days
  for (const [t, i] of Object.entries(invites)) if (Date.now() - i.created > 30 * 86400000 && state(i) !== 'open') delete invites[t];
  save();
  return { ...inv, token, state: 'open', url: `${baseUrl(req)}/c/i/${token}` };
}
// A member's own links that are still open.
export const openInvitesBy = (userId) => listInvites().filter((i) => i.by === userId && i.state === 'open');
// `byUserId`: a member cancelling, who may only cancel their own.
export function revokeInvite(id, byUserId = null) {
  const t = Object.keys(invites).find((k) => invites[k].id === id && (byUserId == null || invites[k].by === byUserId));
  if (!t) throw httpError(404, 'No such invite.');
  delete invites[t];
  save();
}

// ---------- the public invite page (/c/i/<token>) ----------
async function readForm(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 4000) throw httpError(413, 'Too much data.'); }
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

// Returns true when it handled the request.
// `auth`: Lilin's sign-in (auth.js), passed when Lilin is Cloudflare's sign-in provider.
// `usernames`: with `auth`, new people pick a username (usernames.js) instead of entering an email.
export async function handlePublic(req, res, url, { auth = null, usernames = null } = {}) {
  const m = url.pathname.match(/^\/c\/i\/([A-Za-z0-9_-]{16})\/?$/);
  if (!m) return false;
  const send = (status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', ...extra }); // same-origin, not no-referrer: no-referrer turns the form's Origin into `null`
    res.end(req.method === 'HEAD' ? undefined : translateHtml(body)); // Swedish for Swedish browsers (src/i18n-sv.json)
    return true;
  };
  const base = baseUrl(req);
  const view = (title, inner, extra) => send(200, page({
    title, desc: 'You’ve been invited to Lilin, your own cinema: films and shows on your phone, your TV, anywhere.',
    url: `${base}${url.pathname}`, image: brandCard(base), body: `<div class="card">${inner}</div>`,
  }), extra);

  const inv = Object.hasOwn(invites, m[1]) ? invites[m[1]] : null;
  if (!inv || state(inv) !== 'open') {
    return view('Invite not valid', `<h1>This invite doesn’t work any more</h1><p>${inv?.usedAt ? 'It has already been used. Ask for a new link.' : inv ? 'It has expired. Ask for a new link.' : 'It may have been cancelled. Ask for a new link.'}</p><p><a class="brand" href="/">Already have access? Open Lilin</a></p>`);
  }
  if (!invitesConfigured()) return view('Invites aren’t set up', '<h1>Invites aren’t set up yet</h1><p>The server owner still needs to connect Lilin to Cloudflare.</p>');

  const bound = inv.forEmail;
  const title = bound ? 'Pick your Lilin password' : 'You’re invited to Lilin';
  // Lilin signs people in: new people pick a username; a password link shows whoever it was made for.
  const byName = Boolean(auth && usernames);
  const boundShown = bound && usernames ? usernames.signInName(bound) : bound;
  const boundIsName = Boolean(bound && boundShown !== bound);
  const who = (typed) => (bound ? `
      <div class="field ${boundIsName ? 'field-user' : 'field-email'}"><label for="email">${boundIsName ? 'Your username' : 'Your email'}</label>
      <input id="email" name="${boundIsName ? 'username' : 'email'}" type="${boundIsName ? 'text' : 'email'}" required autocomplete="username" readonly value="${esc(boundShown)}"></div>` : byName ? `
      <div class="field field-user"><label for="username">Pick a username</label>
      <input id="username" name="username" type="text" required minlength="3" maxlength="21" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus value="${esc(typed)}" aria-describedby="username-note">
      <p class="field-note" id="username-note">3 to 20 letters, numbers, dots or underscores. You sign in with it, and friends find you by it.</p></div>` : `
      <div class="field field-email"><label for="email">Your email</label>
      <input id="email" name="email" type="email" required autocomplete="username" autofocus value="${esc(typed)}" placeholder="you@example.com"></div>`);
  const form = (email = '', error = '') => (auth ? `
    <div class="card-brand">${brandMark()}</div>
    <h1>${bound ? 'Pick a password' : 'You’re invited to Lilin'}</h1>
    <p>${bound ? (boundIsName ? 'From now on you sign in to Lilin with your username and this password.' : 'From now on you sign in to Lilin with your email and this password.') : 'Your own cinema: films and shows on your phone, your TV, anywhere.'}</p>
    <form method="post">${who(email)}
      <div class="field field-password"><label for="password">Choose a password (10+ characters)</label>
      <div class="pw-wrap"><input id="password" name="password" type="password" required minlength="10" autocomplete="new-password" ${bound ? 'autofocus' : ''}></div></div>
      <div class="field field-password"><label for="again">Same password again</label>
      <div class="pw-wrap"><input id="again" name="again" type="password" required minlength="10" autocomplete="new-password"></div></div>
      <p class="safe-note">Only you know this password. Lilin scrambles it before saving it, so nobody can see it, not even the people who run Lilin.</p>
      ${error ? `<p class="err">${esc(translate(error))}</p>` : ''}
      <button type="submit" class="go">${bound ? 'Save password' : 'Join Lilin'}</button>
    </form>
    <p class="foot">${byName && (!bound || boundIsName) ? 'On a new phone or computer, open Lilin and sign in with this username and password.' : 'On a new phone or computer, open Lilin and sign in with this email and password.'}</p>${passwordPeek()}` : `
    <h1>You’re invited to Lilin</h1>
    <p>Your own cinema: films and shows on your phone, your TV, anywhere.</p>
    <form method="post">
      <div class="field field-email"><label for="email">The email you’ll sign in with</label>
      <input id="email" name="email" type="email" required autocomplete="email" autofocus value="${esc(email)}" placeholder="you@example.com"></div>
      ${error ? `<p class="err">${esc(translate(error))}</p>` : ''}
      <button type="submit">Get access</button>
    </form>
    <p class="foot">Next you choose how to sign in: a one-time code sent to this email, or an account like Google if it uses the same address.</p>`);

  if (bound && !auth) return view('Invite not valid', '<h1>This link doesn’t work right now</h1><p>Ask whoever sent it for a new one.</p>');
  if (req.method !== 'POST') return view(title, form());

  // ---- accept ----
  const now = Date.now();
  while (attempts.length && now - attempts[0] > 60000) attempts.shift();
  if (attempts.length >= 20) return send(429, page({ title: 'Slow down', desc: '', url: '', body: '<div class="card"><h1>Too many tries</h1><p>Wait a minute and try again.</p></div>' }));
  attempts.push(now);

  const body = await readForm(req);
  if (byName && !bound) return joinWithUsername(req, res, body, inv, { auth, usernames, view: (error) => view(title, form(String(body.username || '').trim().slice(0, 40), error)) });
  const email = bound || String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return view(title, form(email, 'That doesn’t look like an email address.'));
  if (auth) {
    // An open invite may only create a new account: an email that's already on the list or already has
    // a password belongs to someone, and only a password link made for that email may set it.
    const password = String(body.password || '');
    if (password !== String(body.again || '')) return view(title, form(email, 'The two passwords aren’t the same.'));
    const problem = passwordProblem(password, boundIsName ? boundShown.replace(/^@/, '') : email);
    if (problem) return view(title, form(email, problem));
    if (!bound && auth.hasPassword(email)) return view(title, form(email, 'That email already has a Lilin account. Open Lilin and sign in.'));
    if (!bound) {
      let taken = false;
      try { taken = (await members()).includes(email); } catch (e) { console.error('[invites]', e.message); return view(title, form(email, 'Couldn’t add you right now. Try again in a minute, or tell whoever sent the link.')); }
      if (taken) return view(title, form(email, 'That email already has access. Ask whoever sent the link for a password link instead.'));
    }
    try {
      if (!bound) await addMember(email);
      await auth.store.setPassword(email, password);
    } catch (e) {
      console.error('[invites]', e.message);
      return view(title, form(email, e.status === 400 ? e.message : 'Couldn’t add you right now. Try again in a minute, or tell whoever sent the link.'));
    }
    inv.usedAt = now;
    inv.email = email;
    save();
    record(req, bound ? 'signin' : 'joined', bound ? 'Set a Lilin password' : (inv.note || 'with an invite'), { user: email });
    const { setCookie } = auth.startSession(req, email);
    // Straight in: Cloudflare sends them to Lilin's sign-in, which sees this session and lets them through.
    res.writeHead(303, { Location: '/', 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  try {
    await addMember(email);
  } catch (e) {
    console.error('[invites]', e.message);
    return view('You’re invited to Lilin', form(email, 'Couldn’t add you right now. Try again in a minute, or tell whoever sent the link.'));
  }
  inv.usedAt = now;
  inv.email = email;
  save();
  record(req, 'joined', inv.note || 'with an invite', { user: email });
  return view('Welcome to Lilin', `
    <h1>You’re in</h1>
    <p class="ok">${esc(tr('{0} can now sign in to Lilin.', email))}</p>
    <p>Taking you there… pick how you want to sign in (with a code sent to this email, or an account that uses it). Next time just open Lilin and sign in the same way.</p>
    <form method="get" action="/"><button type="submit">Open Lilin</button></form>
    <script>setTimeout(() => location.replace('/'), 2500)</script>`);
}

// A new person through an open invite, when Lilin signs people in: they pick a username and a password.
// The account (with its id and username) is made first, so two people can't race for one username; if
// Cloudflare or the password then fails, it's taken back out.
async function joinWithUsername(req, res, body, inv, { auth, usernames, view }) {
  let handle;
  try { handle = usernames.check(body.username); } catch (e) { return view(e.message); }
  const password = String(body.password || '');
  if (password !== String(body.again || '')) return view('The two passwords aren’t the same.');
  const problem = passwordProblem(password, handle);
  if (problem) return view(problem);
  let made;
  try { made = usernames.create(handle); } catch (e) { return view(e.status === 400 || e.status === 409 ? e.message : 'Couldn’t add you right now. Try again in a minute, or tell whoever sent the link.'); }
  try {
    await addMember(made.identity);
    await auth.store.setPassword(made.identity, password);
  } catch (e) {
    console.error('[invites]', e.message);
    usernames.undo(made);
    return view(e.status === 400 ? e.message : 'Couldn’t add you right now. Try again in a minute, or tell whoever sent the link.');
  }
  inv.usedAt = Date.now();
  inv.email = made.identity;
  save();
  record(req, 'joined', inv.note || 'with an invite', { user: made.identity });
  const { setCookie } = auth.startSession(req, made.identity);
  res.writeHead(303, { Location: '/', 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' });
  res.end();
  return true;
}
