import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as accounts from '../src/accounts.js';
import * as activity from '../src/activity.js';
import * as profiles from '../src/profiles.js';
import * as usernames from '../src/usernames.js';
import { createAuth } from '../src/auth.js';
import { isAccountId, accountIdFor } from '../src/account-ids.js';

const fakeReq = ({ ip = '8.8.8.8', headers = {} } = {}) => ({ headers: { ...headers }, socket: { remoteAddress: ip } });

test('switching to a username moves the account off its email and deletes the email everywhere', async () => {
  process.env.PUBLIC_URL = 'https://lilin.example.test';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-usernames-'));
  const email = 'Ana.Old+x@example.test';
  const lower = email.toLowerCase();
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, `PUBLIC_URL=https://lilin.example.test\nADMIN_EMAILS=${lower},boss@example.test\nNOTES_EMAILS="${lower}"\n`);
  const logs = path.join(dir, 'logs');
  fs.mkdirSync(logs);
  const logLine = `[oidc] signed in ${lower} from 1.2.3.4\nother line\n`;
  fs.writeFileSync(path.join(logs, 'lilin.log'), logLine);

  accounts.initAccounts({ dataDir: dir, adminEmails: [lower], mediaDir: null });
  activity.initActivity({ dataDir: dir, nameForUser: accounts.displayNameFor });
  profiles.initProfiles();
  const auth = createAuth({ dataDir: dir, resolveLogin: (t) => usernames.identityForLogin(t) });
  const list = new Set([lower]);
  const invites = {
    invitesConfigured: () => true,
    addMember: async (e) => { list.add(e); },
    removeMember: async (e) => { list.delete(e); return [...list]; },
    revokeAccess: async () => {},
    renameIdentity: () => {},
  };
  usernames.initUsernames({ auth, activity, invites, envFile, logDirs: [logs] });

  await auth.store.setPassword(lower, 'a long password here');
  const ana = accounts.userFor({ headers: { 'cf-access-authenticated-user-email': lower } });
  activity.record(fakeReq({ headers: { 'cf-access-authenticated-user-email': lower } }), 'signin', 'Signed in to Lilin', { user: lower });
  const { setCookie } = await auth.signIn(fakeReq(), lower, 'a long password here');
  const cookie = setCookie.split(';')[0];

  // a username signs in to the same account before the switch, and every account already has a uuid
  const handle = profiles.profileOf(ana).handle;
  assert.equal(usernames.identityForLogin(handle), lower);
  assert.ok(accounts.uuidForUser(ana.id));
  await auth.signIn(fakeReq(), `@${handle.toUpperCase()}`, 'a long password here');

  // someone else's username can't be taken
  const bo = accounts.accountFor('bo@example.test');
  profiles.profileOf(bo);
  await assert.rejects(usernames.switchToUsername(ana, profiles.profileOf(bo).handle), { status: 409 });

  const done = await usernames.switchToUsername(ana, '@Ana.New');
  assert.equal(done.handle, 'ana.new');
  assert.ok(isAccountId(done.identity));
  assert.equal(done.identity, accountIdFor(accounts.uuidForUser(ana.id)));

  // same account (id, data), new identity; the email is nowhere in the database, log or .env
  assert.equal(accounts.userById(ana.id).email, done.identity);
  const db = accounts.database();
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%'").all()) {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all();
    assert.ok(!JSON.stringify(rows).toLowerCase().includes(lower), `${name} still has the email`);
  }
  assert.ok(!fs.readFileSync(path.join(dir, '.lilin-activity.jsonl'), 'utf8').toLowerCase().includes(lower));
  const env = fs.readFileSync(envFile, 'utf8');
  assert.ok(!env.toLowerCase().includes(lower));
  assert.match(env, new RegExp(`ADMIN_EMAILS=${done.identity},boss@example.test`));
  assert.match(env, new RegExp(`NOTES_EMAILS="${done.identity}"`));
  const log = fs.readFileSync(path.join(logs, 'lilin.log'), 'latin1');
  assert.equal(log.length, logLine.length);
  assert.ok(!log.includes(lower));
  assert.equal(accounts.publicUser(accounts.userById(ana.id)).isOwner, true); // owner rights follow
  assert.deepEqual([...list], [done.identity]);

  // the browser stays signed in as the new identity, even while Cloudflare still sends the old email
  const req = fakeReq({ headers: { cookie, 'cf-access-authenticated-user-email': lower } });
  assert.equal(auth.identify(req).email, done.identity);
  assert.equal(req.headers['cf-access-authenticated-user-email'], done.identity);
  assert.equal(auth.identify(fakeReq({ headers: { 'cf-access-authenticated-user-email': lower } })).via, null);

  // signing in: the username works, the email doesn't
  await assert.rejects(auth.signIn(fakeReq({ ip: '9.9.9.9' }), lower, 'a long password here'), { status: 401 });
  const again = await auth.signIn(fakeReq({ ip: '9.9.9.9' }), 'ana.new', 'a long password here');
  assert.equal(again.email, done.identity);
  assert.equal(usernames.signInName(done.identity), '@ana.new');
  assert.equal(accounts.displayNameFor(done.identity), 'ana.new'); // no name set: the username, never the id

  // and the username can change later without touching the identity
  db.prepare('UPDATE profiles SET handle = ? WHERE user_id = ?').run('ana.newer', ana.id);
  assert.equal((await auth.signIn(fakeReq({ ip: '9.9.9.9' }), 'ana.newer', 'a long password here')).email, done.identity);
  await assert.rejects(usernames.switchToUsername(accounts.userById(ana.id), 'whatever'), { status: 400 });
  auth.store.close();
});

test('new people get a username account with an id, not an email', () => {
  const made = usernames.create('New_Person');
  assert.equal(made.handle, 'new_person');
  assert.ok(isAccountId(made.identity));
  assert.equal(usernames.identityForLogin('new_person'), made.identity);
  assert.throws(() => usernames.create('new_person'), { status: 409 });
  assert.throws(() => usernames.create('x'), { status: 400 });
  usernames.undo(made);
  assert.equal(usernames.identityForLogin('new_person'), null);
});

test('invite page: with Lilin signing people in, a new person picks a username, never an email', async (t) => {
  const { Readable } = await import('node:stream');
  const http = await import('node:http');
  const list = new Set();
  const cf = http.createServer(async (rq, rs) => {
    let body = ''; for await (const c of rq) body += c;
    if (rq.method === 'PATCH') { const b = JSON.parse(body); for (const i of b.append || []) list.add(i.value); }
    rs.writeHead(200, { 'Content-Type': 'application/json' });
    rs.end(JSON.stringify({ success: true, result: rq.method === 'GET' ? [...list].map((value) => ({ value })) : {} }));
  });
  await new Promise((r) => cf.listen(0, '127.0.0.1', r));
  t.after(() => cf.close());
  Object.assign(process.env, { CF_API_BASE: `http://127.0.0.1:${cf.address().port}`, CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ACCESS_LIST_ID: 'l' });
  const invites = await import(`../src/invites.js?${Date.now()}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-username-invite-'));
  const auth = createAuth({ dataDir: dir, resolveLogin: (x) => usernames.identityForLogin(x) });
  invites.initInvites({ dataDir: dir });
  usernames.initUsernames({ auth });
  const req = (url, body = '') => Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method: body ? 'POST' : 'GET', url,
    headers: { host: 'lilin.example.com', 'cf-ray': 'x', 'content-type': 'application/x-www-form-urlencoded' }, socket: { remoteAddress: '127.0.0.1' } });
  const res = () => { const out = { status: 0, headers: {}, body: '' }; return Object.assign(out, { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, writeHead(s, h = {}) { out.status = s; Object.assign(out.headers, h); }, end(b) { out.body = b ? String(b) : ''; } }); };
  const call = async (token, fields) => {
    const r = req(`/c/i/${token}`, fields && new URLSearchParams(fields).toString());
    const out = res();
    await invites.handlePublic(r, out, new URL(r.url, 'http://x'), { auth, usernames });
    return out;
  };
  const token = invites.createInvite(req('/'), 'Pal').url.split('/').pop();
  let r = await call(token);
  assert.match(r.body, /Pick a username/);
  assert.doesNotMatch(r.body, /type="email"/);
  r = await call(token, { username: 'ana.newer', password: 'twelve chars!', again: 'twelve chars!' }); // from the first test
  assert.match(r.body, /That username is taken/);
  r = await call(token, { username: 'pal', password: 'twelve chars!', again: 'twelve chars!' });
  assert.equal(r.status, 303);
  const identity = usernames.identityForLogin('pal');
  assert.ok(isAccountId(identity));
  assert.ok(list.has(identity));
  assert.equal(auth.hasPassword(identity), true);
  assert.equal((await auth.signIn(req('/'), 'Pal', 'twelve chars!')).email, identity);
  auth.store.close();
});
