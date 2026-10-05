import { createHash, randomBytes } from 'node:crypto';

import type { Context, Next } from 'hono';

import { pool } from './db';
import { env } from './env';
import { HttpError } from './errors';

/**
 * Anonymous shopper devices. Each app install gets a random token (stored only as a hash) and
 * a credit balance. Accounts will attach devices to people later.
 */
export type Device = { id: string; credits: number };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Each new device gets free credits, so registrations are limited per client address. */
export async function createDevice(clientKey: string) {
  const clientHash = hash(`client:${clientKey}`);
  const recent = await pool.query<{ count: string }>(
    "select count(*) from devices where client_hash = $1 and created_at > now() - interval '1 hour'",
    [clientHash],
  );
  if (Number(recent.rows[0].count) >= env.devicesPerHour) {
    throw new HttpError('quota', 'Too many new sessions from this network. Try again in an hour.');
  }
  const token = randomBytes(32).toString('base64url');
  const { rows } = await pool.query<Device>(
    'insert into devices (token_hash, credits, client_hash) values ($1, $2, $3) returning id, credits',
    [hash(token), env.freeCredits, clientHash],
  );
  return { token, credits: rows[0].credits };
}

export async function deviceFor(token: string | null): Promise<Device | null> {
  if (!token) return null;
  const { rows } = await pool.query<Device>('select id, credits from devices where token_hash = $1', [hash(token)]);
  return rows[0] ?? null;
}

/** Requires `Authorization: Device <token>`. */
export async function requireDevice(c: Context, next: Next) {
  const token = c.req.header('authorization')?.match(/^Device (.+)$/)?.[1] ?? null;
  const device = await deviceFor(token);
  if (!device) throw new HttpError('unauthorized', 'This device isn’t registered. Restart the app and try again.');
  c.set('device', device);
  await next();
}
