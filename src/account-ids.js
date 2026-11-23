// Account ids: every account has a UUID, and people who sign in with a username (rather than an email)
// are known everywhere inside Lilin by "<uuid>@<ACCOUNT_ID_DOMAIN>". It is shaped like an email so the
// parts that have always carried an email (sessions, Cloudflare Access's email list, the OIDC token
// Lilin hands Cloudflare) keep working unchanged, but it is never shown and never changes: a username
// can change freely without touching Cloudflare.
//
// ACCOUNT_ID_DOMAIN in .env; otherwise "accounts.<PUBLIC_URL's host>", or "accounts.lilin.invalid".
import crypto from 'node:crypto';

function defaultDomain() {
  try { if (process.env.PUBLIC_URL) return `accounts.${new URL(process.env.PUBLIC_URL).hostname.toLowerCase()}`; } catch { /* config-check reports it */ }
  return 'accounts.lilin.invalid';
}
export const accountIdDomain = () => String(process.env.ACCOUNT_ID_DOMAIN || '').trim().toLowerCase().replace(/^@+/, '') || defaultDomain();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const newUuid = () => crypto.randomUUID();
export const accountIdFor = (uuid) => `${uuid}@${accountIdDomain()}`;
// Is this identity an account id (a username account) rather than someone's email?
export function isAccountId(identity) {
  const s = String(identity || '').toLowerCase();
  const at = s.indexOf('@');
  return at > 0 && UUID.test(s.slice(0, at)) && s.slice(at + 1) === accountIdDomain();
}
export const uuidOf = (identity) => (isAccountId(identity) ? String(identity).toLowerCase().split('@')[0] : null);
