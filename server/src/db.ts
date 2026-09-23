import pg from 'pg';

import { env } from './env';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

/** Ordered, append-only migrations. Never edit one that has shipped; add a new one. */
const MIGRATIONS: string[] = [
  `
  create table staff (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  );
  create table staff_sessions (
    token_hash text primary key,
    staff_id uuid not null references staff (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  );
  create index staff_sessions_expires_at on staff_sessions (expires_at);
  create table inventory (
    product_id text primary key,
    price_minor integer not null check (price_minor > 0),
    currency text not null default 'USD',
    sizes jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references staff (id) on delete set null
  );
  create table inventory_audit (
    id bigserial primary key,
    product_id text not null,
    staff_id uuid references staff (id) on delete set null,
    action text not null,
    before jsonb,
    after jsonb,
    at timestamptz not null default now()
  );
  `,
];

export async function migrate() {
  const client = await pool.connect();
  try {
    // One migrator at a time, even with several server instances starting together.
    await client.query('select pg_advisory_lock(7241)');
    await client.query(
      'create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())',
    );
    const { rows } = await client.query<{ version: number }>('select version from schema_migrations');
    const applied = new Set(rows.map((row) => row.version));
    for (const [index, sql] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [version]);
        await client.query('commit');
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(7241)').catch(() => undefined);
    client.release();
  }
}
