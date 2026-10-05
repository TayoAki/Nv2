import { createHash, randomBytes } from 'node:crypto';

import { pool } from './db';
import { env } from './env';
import { HttpError } from './errors';
import { hashPassword, verifyPassword } from './passwords';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Per email, and a looser limit per client so staff sharing one office connection aren't blocked together. */
const MAX_FAILURES = { email: 5, client: 20 };
const LOCK_MS = 30_000;

export type StaffSession = { staffId: string; email: string; expiresAt: string };

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Creates or updates the bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD, so changing the
 * variable in Railway rotates the password on the next deploy.
 */
export async function ensureBootstrapAdmin() {
  if (!env.adminEmail || !env.adminPassword) {
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD is not set; no staff account was created.');
    return;
  }
  if (env.adminPassword.length < 12) {
    console.warn('ADMIN_PASSWORD must be at least 12 characters; the staff account was not updated.');
    return;
  }
  const existing = await pool.query<{ id: string; password_hash: string }>(
    'select id, password_hash from staff where email = $1',
    [env.adminEmail],
  );
  const row = existing.rows[0];
  if (row && (await verifyPassword(env.adminPassword, row.password_hash))) return;
  const hash = await hashPassword(env.adminPassword);
  if (row) {
    await pool.query('update staff set password_hash = $1 where id = $2', [hash, row.id]);
    await pool.query('delete from staff_sessions where staff_id = $1', [row.id]);
    console.log('Updated the bootstrap staff password and signed out its sessions.');
  } else {
    await pool.query('insert into staff (email, password_hash) values ($1, $2)', [env.adminEmail, hash]);
    console.log('Created the bootstrap staff account.');
  }
}

/** Failed sign-ins per email and per client, kept in memory; a restart clears it. */
const failures = new Map<string, { count: number; lockedUntil: number }>();

function checkLock(key: string) {
  const entry = failures.get(key);
  const wait = entry ? entry.lockedUntil - Date.now() : 0;
  if (wait > 0) throw new HttpError('unauthorized', `Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`, 429);
}

function recordFailure(key: string) {
  const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= (key.startsWith('client:') ? MAX_FAILURES.client : MAX_FAILURES.email)) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + LOCK_MS;
  }
  failures.set(key, entry);
}

export async function signIn(email: string, password: string, client: string) {
  const normalized = email.trim().toLowerCase();
  const keys = [`email:${normalized}`, `client:${client}`];
  keys.forEach(checkLock);

  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    'select id, password_hash from staff where email = $1',
    [normalized],
  );
  const staff = rows[0];
  // Verify against a dummy hash when the email is unknown, so timing doesn't reveal accounts.
  const valid = await verifyPassword(password, staff?.password_hash ?? DUMMY_HASH);
  if (!staff || !valid) {
    keys.forEach(recordFailure);
    throw new HttpError('unauthorized', "That email and password don't match a staff account.");
  }
  keys.forEach((key) => failures.delete(key));

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('insert into staff_sessions (token_hash, staff_id, expires_at) values ($1, $2, $3)', [
    tokenHash(token),
    staff.id,
    expiresAt,
  ]);
  await pool.query('delete from staff_sessions where expires_at < now()');
  return { token, session: { email: normalized, expiresAt: expiresAt.toISOString() } };
}

export async function sessionFor(token: string | null): Promise<StaffSession | null> {
  if (!token) return null;
  const { rows } = await pool.query<{ staff_id: string; email: string; expires_at: Date }>(
    `select s.staff_id, st.email, s.expires_at
       from staff_sessions s join staff st on st.id = s.staff_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  );
  const row = rows[0];
  return row ? { staffId: row.staff_id, email: row.email, expiresAt: row.expires_at.toISOString() } : null;
}

export async function signOut(token: string) {
  await pool.query('delete from staff_sessions where token_hash = $1', [tokenHash(token)]);
}

let DUMMY_HASH = '';
export async function prepareAuth() {
  DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
}
