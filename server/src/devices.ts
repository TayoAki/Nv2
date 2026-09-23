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

export async function createDevice() {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await pool.query<Device>(
    'insert into devices (token_hash, credits) values ($1, $2) returning id, credits',
    [hash(token), env.freeCredits],
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
