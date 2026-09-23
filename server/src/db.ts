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
  // 2: shopper devices, private images, credits, render batches, closet imports.
  `
  create table devices (
    id uuid primary key default gen_random_uuid(),
    token_hash text not null unique,
    credits integer not null check (credits >= 0),
    created_at timestamptz not null default now()
  );
  create table blobs (
    id text primary key,
    device_id uuid references devices (id) on delete cascade,
    kind text not null,
    content_type text not null,
    bytes bytea not null,
    width integer,
    height integer,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  );
  create index blobs_expires_at on blobs (expires_at);
  create table render_batches (
    id text primary key,
    device_id uuid not null references devices (id) on delete cascade,
    quality text not null,
    credits_reserved integer not null,
    credits_refunded integer not null default 0,
    status text not null default 'running',
    input jsonb not null,
    created_at timestamptz not null default now(),
    finished_at timestamptz
  );
  create index render_batches_device on render_batches (device_id, created_at);
  create table renders (
    id text primary key,
    batch_id text not null references render_batches (id) on delete cascade,
    position integer not null,
    status text not null default 'queued',
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    prompt text not null,
    result_blob_id text references blobs (id) on delete set null,
    error_code text,
    error_message text,
    cost_usd numeric,
    simulated boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index renders_queue on renders (status, next_attempt_at);
  create table imports (
    id text primary key,
    device_id uuid not null references devices (id) on delete cascade,
    status text not null default 'queued',
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    input jsonb not null,
    drafts jsonb not null default '[]',
    failed_photo_count integer not null default 0,
    simulated boolean not null default false,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index imports_queue on imports (status, next_attempt_at);
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
